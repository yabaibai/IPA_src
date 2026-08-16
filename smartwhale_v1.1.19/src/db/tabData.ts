// ── 公共 Tab 数据加载引擎（FRD 3.1~3.4 / 4 异常兜底）──────────────────────────
// 把 6 个 Tab 各自重复的「缓存优先 + 节流 + 去重 + 离 Tab 取消 + 整批写缓存 + 序列号守卫」
// 收敛为统一 hook，并补齐 FRD 缺失能力：
//   - 全局并发队列 maxConcurrentReq=2（requestQueue）
//   - 单 Tab 节流 500ms（THROTTLE_MS）
//   - isLoggingOut 全局标记守卫（requestGuard.canWriteState）
//   - getSession 会话校验兜底（ensureSessionValid）
//   - 双层缓存：内存 30s + 持久长 TTL（cacheGetLayered）
//
// 约束（FRD 3.2/3.3/4.2/6）：
//   1) 命中内存缓存（30s TTL）→ 直接渲染，不展示 loading、不发起请求；
//   2) 禁止单接口逐次写缓存，必须整套完成才批量写；
//   3) 部分失败 / 被 cancel → 不写缓存，沿用旧缓存；
//   4) 离开 Tab（useFocusEffect cleanup）置 cancelRef，pending 回调跳过 setState；
//      排队中未执行的任务直接丢弃（requestQueue 出队时检测 cancelRef）。

import { useCallback, useRef } from "react";
import { cacheGetLayered, cacheSet, cacheGet, CACHE_TTL } from "@/db/cache";
import { dedupe } from "@/db/dedupe";
import { enqueue, makeCancelError, isCancelError, cancelQueuedExcept } from "@/lib/requestQueue";
import { RefreshTooFrequentError } from "@/lib/requestDedup";
import { canWriteState, ensureSessionValid } from "@/lib/requestGuard";
import { isLoggingOut } from "@/lib/logoutFlag";

export const THROTTLE_MS = 500; // 单 Tab 最小请求触发间隔

// 模块级 per-key 节流时间戳（同一 cacheKey = 同一 Tab）
const lastFireMap = new Map<string, number>();

interface UseTabDataOpts<T> {
  /** 缓存 key，形如 "home:" + userId。同一 Tab 恒定。 */
  cacheKey: string;
  /** 整套并发请求：接受可选 force 参数（下拉刷新时穿透缓存重拉）。 */
  fetch: (force?: boolean) => Promise<T>;
  /** 把整套数据映射到组件 state（仅在允许写入时调用）。 */
  apply: (data: T) => void;
  /** 整批失败时回调（如 setLoadError(true)）。 */
  onError?: () => void;
  /** loading 态变更（带登出守卫）。 */
  onLoading?: (loading: boolean) => void;
  /** 是否已有内存数据（节流时判断：有则安全放弃，无则放行避免空白）。 */
  hasData?: () => boolean;
  /** 是否写入缓存（FRD 4.2：部分接口返回 null 时不污染缓存，返回 false 沿用旧缓存）。默认整批成功即写。 */
  shouldCache?: (data: T) => boolean;
  /** 下拉刷新頻密（已有同 key 在飛請求）時的輕提示回調。 */
  onFrequent?: () => void;
}

/**
 * 纯函数编排核心（FRD 3.2/3.3/3.4/4 全链路）。脱离 React，便于单测。
 * 输入：配置 + 三个可变 ref（cancelRef/loadSeq/isUnmounted），输出：行为副作用通过 apply/onError/onLoading 体现。
 */
export interface ExecuteParams<T> extends Omit<UseTabDataOpts<T>, "fetch"> {
  fetch: (force?: boolean) => Promise<T>;
  cancelRef: { current: boolean };
  loadSeq: { current: number };
  isUnmounted: { current: boolean };
  /** 跳过节流（下拉刷新用）。 */
  force?: boolean;
}

export async function executeLoadData<T>(p: ExecuteParams<T>): Promise<void> {
  const {
    cacheKey, fetch, apply, onError, onLoading, hasData, shouldCache,
    cancelRef, loadSeq, isUnmounted, force = false,
  } = p;

  if (!cacheKey) return;
  console.log('[TAB_DBG] enter', cacheKey, 'force=', force, 'isLoggingOut=', isLoggingOut());

  // ① 缓存优先（双层）：命中即同步渲染旧数据
  const layered = await cacheGetLayered(cacheKey);
  if (layered) {
    // 仅当「缓存数据是有效的（通过 shouldCache 校验）」时才秒渲染 + 短路返回；
    // 若命中缓存但数据无效（如 shouldCache 为 false 的 null 占位），不当作命中，
    // 继续走请求流程刷新，避免「写入 null 占位后下次命中秒显 null → 永不自愈」死循环。
    const effective = !shouldCache || shouldCache(layered.v);
    if (effective) {
      if (!isLoggingOut() && !isUnmounted.current) apply(layered.v);
      if (layered.from === "mem" && !force) return;
    }
    // 无效缓存：不秒显、不短路，落到下方 fetch 流程刷新（带 loading）
  }

  // ② 单 Tab 节流 500ms（per-key）：仅「组件已有内存数据」时拦截；否则放行
  const now = Date.now();
  const last = lastFireMap.get(cacheKey) ?? 0;
  if (!force && now - last < THROTTLE_MS) {
    if (hasData?.()) return;
  }
  lastFireMap.set(cacheKey, now);

  // ③ 离 Tab 取消标记重置 + 序列号递增
  cancelRef.current = false;
  const seq = ++loadSeq.current;

  const setLoading = (b: boolean) => {
    // loading 复位不受 cancelRef/isUnmounted 限制：即使本轮请求被「离 Tab 取消」(cancelRef=true)
    // 或组件已卸载，也必须在 finally 复位 loading，否则疯狂切换/重连时旧请求的 setLoading(false) 被吞 →
    // loading 永远 true → 页面一直转（用户实测 profile 卡「用戶信息校驗中」）。
    // 仅排除「登出中」真正需跳过的情况（避免退出登录时误写 loading）。业务数据写入(apply/onError)仍保留完整守卫。
    if (isLoggingOut()) return;
    try { console.log('[TAB_DBG] setLoading b=', b, 'cacheKey=', cacheKey); onLoading?.(b); } catch { /* 组件已卸载时 setState 抛错忽略 */ }
  };
  setLoading(true);
  try {
    // ④ 会话校验兜底：失效则触发登出，不发起业务请求（FRD 3.2 第3步 / 4.4）
    const ok = await ensureSessionValid();
    console.log('[TAB_DBG] ensureSessionValid', cacheKey, 'ok=', ok);
    if (!ok) return;

    // ⑤ 全局并发队列 + dedupe 去重（tag=cacheKey 用于「点击某 Tab 优先、取消其余排隊」）
    const data = await enqueue(() => dedupe(cacheKey, () => fetch(force)), cancelRef, cacheKey);
    console.log('[TAB_DBG] enqueue done', cacheKey, 'hasData=', !!data);

    // ⑥ 整批写缓存（不受 cancel 影响：有效数据先写，下次切回即显示）
    //    但登出中（isLoggingOut）必须跳过，防止异步回调污染缓存（FRD 3.5 / 4.1）
    //    shouldCache 返回 false（如部分接口 null）的处理（FRD 4.2 防污染 + 空缓存自愈）：
    //      - 若「缓存已有有效数据」且「本次返回 null」→ 不覆盖（保留旧真数据，防污染）；
    //      - 若「缓存本为空」且「本次返回 null」→ 仍写入（打破空缓存死循环，下次成功即覆盖自愈）。
    const prev = cacheGet(cacheKey);
    const prevValid = prev != null && (!shouldCache || shouldCache(prev));
    const allowWrite = shouldCache ? (shouldCache(data) || !prevValid) : true;
    if (!isLoggingOut() && allowWrite) cacheSet(cacheKey, data);

    // ⑦ 离 Tab 取消 / 过期序列 / 登出中：跳过 setState（但缓存已写）
    const canWrite = canWriteState({ isUnmounted: isUnmounted.current, cancelRef, seq, loadSeq });
    console.log('[TAB_DBG] apply?', cacheKey, 'canWrite=', canWrite, 'cancelRef=', cancelRef.current, 'seq=', seq, 'loadSeq=', loadSeq.current);
    if (!canWrite) return;
    apply(data);
    console.log('[TAB_DBG] applied', cacheKey);
  } catch (e) {
    if (isCancelError(e)) { console.log('[TAB_DBG] CANCELLED', cacheKey); return; }
    // 刷新過於頻密（inflight 中重複強制刷新）：不顯示失敗態，交由 onFrequent 輕提示
    if (e instanceof RefreshTooFrequentError) {
      console.warn('[useTabData] 刷新過於頻密', cacheKey);
      if (canWriteState({ isUnmounted: isUnmounted.current, cancelRef, seq, loadSeq })) onFrequent?.();
      return;
    }
    console.warn(`[useTabData:${cacheKey}] 載入失敗:`, e);
    if (canWriteState({ isUnmounted: isUnmounted.current, cancelRef, seq, loadSeq })) onError?.();
  } finally {
    setLoading(false); // 复位 loading（不受 cancelRef 限制：防疯狂切换时卡住一直转）
  }
}

export function useTabData<T>(opts: UseTabDataOpts<T>) {
  const { cacheKey } = opts;

  const cancelRef = useRef(false);   // 离开 Tab 取消：pending 回调不写状态/缓存
  const loadSeq = useRef(0);         // 请求序列号：过期结果丢弃（防覆盖新数据）
  const isUnmounted = useRef(false); // 组件卸载标记（防 RN 警告）

  // 组件卸载时标记，finally/回调据此跳过 setState
  const markUnmount = useCallback(() => { isUnmounted.current = true; }, []);
  const resetUnmount = useCallback(() => { isUnmounted.current = false; }, []);

  // 离 Tab 取消 / 进入：仅操作 ref，无外部依赖，必须用 useCallback 稳定引用，
  // 否则每次 render 新建函数 → 使用方 useFocusEffect 依赖其引用会反复 cleanup+run → 死循环加载刷新。
  const onLeave = useCallback(() => { cancelRef.current = true; }, [cancelRef]);
  const onEnter = useCallback(() => {
    cancelRef.current = false;
    // 进入本 Tab：取消排隊中其它 Tab 的請求，使本 Tab 請求優先（避免登入後多 Tab 同時入隊導致本頁排隊不顯示，並降低瞬間 QPS）
    cancelQueuedExcept(cacheKey);
  }, [cancelRef, cacheKey]);

  // 用 ref 持有最新 opts，使 loadData/refresh 不随调用方传入的「内联回调」
  // （onError/onLoading/hasData/shouldCache 等每次 render 新建引用）而重建。
  // 否则 loadData 引用不稳定 → 使用方 useFocusEffect 依赖它而反复 run → 无限加载刷新。
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const loadData = useCallback(async (force = false) => {
    await executeLoadData({
      ...optsRef.current,
      cancelRef, loadSeq, isUnmounted, force,
    });
  }, [cacheKey, cancelRef, loadSeq, isUnmounted]);

  // 下拉刷新：强制跳过 TTL + 节流
  const refresh = useCallback(async () => {
    lastFireMap.set(cacheKey, 0); // 清节流
    await loadData(true);
  }, [cacheKey, loadData]);

  return {
    loadData,
    refresh,
    cancelRef,
    isUnmounted,
    markUnmount,
    resetUnmount,
    /** useFocusEffect cleanup 调用：标记离 Tab 取消（pending 回调丢弃） */
    onLeave,
    /** useFocusEffect 进入调用：复位取消标记 */
    onEnter,
  };
}

// 兼容导出：避免其它文件误用旧的 cacheGet/cacheSet 语义时仍能编译
export { cacheGetLayered, cacheSet, CACHE_TTL };

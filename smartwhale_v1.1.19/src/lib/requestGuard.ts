// ── 请求/状态守卫（FRD 3.5 / 4.1 / 4.4）────────────────────────────────────
// 1) isLoggingOut 全局标记：登出流程开始后，所有网络回调、cacheSet、setState 检测到该标记
//    直接跳过，防止异步回调污染状态（RN 警告 + 错误页面）。
// 2) getSession 会话校验兜底：Tab loadData 发起业务请求前统一校验会话有效性；
//    会话失效 → 触发完整登出，不发起业务请求。
//
// 注意：本文件只管理「标记位」与「会话校验入口」，实际登出动作由 ctx 的 forceLocalSignOut 执行，
//       避免形成循环依赖（ctx 会 import 本文件）。

import { supabase } from "@/client/supabase";
import { forceLocalSignOut } from "@/ctx";
import { isLoggingOut, setLoggingOut } from "@/lib/logoutFlag";

export { isLoggingOut, setLoggingOut };

/**
 * 状态写入守卫：组件在 finally/回调里 setState 前调用。
 * 返回 true 表示「允许写入」，false 表示「跳过」（组件已卸载 / 正在登出 / 请求已取消）。
 */
export function canWriteState(opts?: {
  isUnmounted?: boolean;
  cancelRef?: { current: boolean };
  seq?: number;
  loadSeq?: { current: number };
}): boolean {
  if (isLoggingOut()) return false;            // 登出中，禁止任何状态污染
  if (opts?.isUnmounted) return false;     // 组件已卸载
  if (opts?.cancelRef?.current) return false; // Tab 已切走，pending 回调丢弃
  if (opts?.seq != null && opts?.loadSeq && opts.seq !== opts.loadSeq.current) return false; // 过期序列
  return true;
}

// ── 会话校验兜底（FRD 3.2 第 3 步 / 4.4）──────────────────────────────────
/**
 * 校验当前会话有效性。返回 true 表示会话正常、可继续业务请求；
 * 返回 false 表示会话失效，已触发登出流程（调用方应中止，不再发业务请求）。
 * 排除「登录中 / 登出中」状态，避免误踢（FRD 4.4）。
 */
export async function ensureSessionValid(): Promise<boolean> {
  if (isLoggingOut()) return false; // 登出中不再校验

  try {
    const { data } = await supabase.auth.getSession();
    if (data.session) return true; // 有 session 即视为有效（刷新交给 autoRefreshToken）

    // 无 session：尝试刷新一次（弱网偶发）
    try {
      const { data: refreshed } = await supabase.auth.refreshSession();
      if (refreshed.session) return true;
    } catch {
      /* ignore */
    }

    // 刷新后仍无 session → 会话失效，触发完整登出
    forceLocalSignOut();
    return false;
  } catch {
    // 校验本身异常：保守放行（避免把正常用户踢出），交由后续接口 401 拦截兜底
    return true;
  }
}

/**
 * 会话过期全局兜底（FRD 4.4）：由 HTTP 拦截器在捕获 401 时调用。
 * 排除登录中、登出中状态；命中 401 自动调用完整登出流程。
 */
export function handleSessionExpired(): void {
  if (isLoggingOut()) return;
  // 登录中状态由调用方通过「当前路径为登录页」判断，这里仅做登出中排除。
  // 触发完整登出（forceLocalSignOut：清本地会话 + 清缓存 + sessionSetter(null) → 路由回登录页）。
  forceLocalSignOut();
}

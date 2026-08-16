// ── 全局請求去重層（共用緩存 + TTL + 強制穿透 + 頻密保護 + 延遲補拉）──────────────
// 數據分兩類：
//   shared（共享池）：profile/wallet/pool/referrer/merchantCfg/price/unread 等多 Tab 共用。
//     寫入時機：① 首次登錄預加載成功 ② 用戶手動下拉刷新成功。不隨 TTL 自動回源（避免持續打 WAF）。
//   unique（獨有數據）：各 Tab 特有接口（banner/notice/systemConfig/harvestRecords/txs 等）。
//     寫入時機：① 登錄預加載 ② TTL 過期自動重拉（寫回）③ 手動刷新。
// 設計目標：登錄後日常幾乎不發自動請求 → 大幅降低 WAF CC 限速觸發概率。
import { withTimeout } from "@/lib/asyncTool";
import { supabase } from "@/client/supabase";

const UNIQUE_TTL_MS = 600_000; // 獨有數據 10 分鐘自動回源
// 共享池無 TTL 自動回源：只有在 force=true（手動刷新/登錄預加載）時才重拉

interface Entry { v: any; ts: number; shared: boolean; }

const cache: Record<string, Entry> = {};
const inflight: Record<string, Promise<any>> = {};
// null 失敗退避計數：連續失敗次數越多，重試間隔越長，避免 WAF 持續攔時狂打請求
const failCount: Record<string, number> = {};

// 計算某 label 的 null 佔位 TTL（退避：10s→20s→40s→60s 封頂）
function nullTtl(label: string): number {
  const n = failCount[label] || 0;
  return Math.min(5_000 * Math.pow(2, n), 15_000); // 退避縮短：基礎5s→10s→15s封頂(原10s→20s→60s)，加速WAF空窗恢復
}

export class RefreshTooFrequentError extends Error {
  constructor() { super("刷新過於頻密，請稍後再試"); this.name = "RefreshTooFrequentError"; }
}

// 單次請求：失敗退避重試最多 tries 次（每次重試前確保 token 就緒，消除登入後 token 競態）
async function once(label: string, fn: () => Promise<any>, tries = 3): Promise<any> {
  const _o0 = Date.now();
  let _attempts = 0;
  for (let i = 0; i < tries; i++) {
    _attempts++;
    try { await supabase.auth.getSession(); } catch { /* ignore */ }
    const _a = Date.now();
    const r = await withTimeout(fn(), 8000, label).catch(() => null);
    const _b = Date.now();
    console.log("[PROFILE_PERF][once]", label, "attempt=", _attempts, "ms=", _b - _a, "got=", r != null);
    if (r != null) { console.log("[PROFILE_PERF][once]", label, "TOTAL_NET ms=", Date.now() - _o0); return r; }
    if (i < tries - 1) await new Promise((res) => setTimeout(res, 2000 * (i + 1))); // 2s/4s
  }
  console.log("[PROFILE_PERF][once]", label, "FAILED TOTAL_NET ms=", Date.now() - _o0);
  return null;
}

interface GetOpts { force?: boolean; shared?: boolean; }

/**
 * 去重包裝。
 * @param force true：跳過緩存強制重發（下拉刷新）。若已有同 key 在飛請求 → 拋 RefreshTooFrequentError（頻密保護）。
 * @param shared true：標記為共享池數據，不隨 TTL 自動回源（僅 force 時重拉）。
 */
export async function sharedGet(label: string, fn: () => Promise<any>, opts: GetOpts = {}): Promise<any> {
  const { force = false, shared = false, isEmpty } = opts;
  // 默認 isEmpty：空陣列([])與空字串("")視為「無效/未取到」，不寫有效緩存（避免 WAF 攔截返回的空結果被當成功永久緩存）；
  // null 不算（null 是顯式失敗佔位，由 once 層處理）。調用方可傳 isEmpty 覆蓋。
  const isEmptyDefault = (r: any): boolean =>
    Array.isArray(r) ? r.length === 0 : (typeof r === "string" ? r.length === 0 : false);
  const emptyFn = isEmpty ?? isEmptyDefault;
  const now = Date.now();
  const hit = cache[label];
  // 成功值 TTL：shared=∞（僅 force 更新），unique=3分鐘；失敗(null)值用退避 TTL（10s→20s→40s→60s 封頂）
  const ttl = hit && hit.v == null ? nullTtl(label) : (shared ? Infinity : UNIQUE_TTL_MS);

  // 命中有效緩存（未過期）→ 直接返回（共享池永不因 TTL 過期）
  if (!force && hit && now - hit.ts < ttl) {
    console.log("[DEDUP] hit", label, "age=", now - hit.ts, "shared=", shared, "hasVal=", hit.v != null);
    return hit.v;
  }

  // 頻密保護：強制刷新（下拉/手動）時，若「同一 label 已有在飛請求」→ 直接復用在飛請求結果（不重複發，避免疊加觸發 WAF），不拋錯拒絕。
  // 目的：下拉刷新永遠有效（拿到在飛請求的結果），同時不疊加請求打 WAF；不同 label 互不影響。
  // 不含普通切 Tab（force=false 永不至此）。
  if (force && inflight[label]) {
    console.log("[DEDUP] force reuse inflight (same label busy)", label);
    return inflight[label];
  }

  // 已在飛（非強制路徑）→ 掛載复用
  if (inflight[label]) return inflight[label];

  const p = (async () => {
    const r = await once(label, fn);
    // 成功寫入條件：非 null 且（未提供 isEmpty 或 isEmpty 判定非「空」）
    const emptyHit = emptyFn ? emptyFn(r) : false;
    if (r != null && !emptyHit) {
      cache[label] = { v: r, ts: Date.now(), shared };
      failCount[label] = 0; // 成功清零退避計數
      console.log("[DEDUP] set", label, "shared=", shared, "hasVal=true");
    } else if (!hit) {
      // 首拉即失敗/空結果：記 null 佔位（退避 TTL），但不覆蓋已有有效值；
      // 空結果（如 WAF 攔截返回空陣列）也走此路，讓其退避後重試拿到真實數據
      failCount[label] = (failCount[label] || 0) + 1;
      cache[label] = { v: null, ts: Date.now(), shared };
      console.log("[DEDUP] set", label, "shared=", shared, "hasVal=false(empty) retryIn=", nullTtl(label));
    }
    delete inflight[label];
    return r;
  })();
  inflight[label] = p;
  return p;
}

// 登錄後延遲補拉：預加載失敗的共享池項在 App 空閒冷卻後自動補一次（WAF 冷卻完通常能成）
// 僅補 shared 類且當前為 null/缺失的項；限頻（只跑一次），不持續打 WAF。
const pendingBackfill: Array<[string, () => Promise<any>]> = [];
let backfillTimer: ReturnType<typeof setTimeout> | null = null;

export function scheduleBackfill(label: string, fn: () => Promise<any>) {
  pendingBackfill.push([label, fn]);
  if (backfillTimer) return;
  // 登錄後 3 分鐘冷卻再補拉（避開 WAF 限速窗口）
  backfillTimer = setTimeout(async () => {
    backfillTimer = null;
    const items = pendingBackfill.splice(0);
    for (const [k, f] of items) {
      const e = cache[k];
      if (e && e.v != null) continue; // 已有有效值跳過
      // 直接發請求（不經 sharedGet 的 inflight 頻密邏輯），避免後台補拉誤擋用戶刷新
      const r = await once(k, f);
      if (r != null) cache[k] = { v: r, ts: Date.now(), shared: true };
      await new Promise((res) => setTimeout(res, 800)); // 間隔，避免並發觸發 WAF
    }
  }, 180_000);
}

// 清除共用緩存（注銷時調用，避免下次登入命中舊用戶數據）
export function clearDedupCache() {
  for (const k of Object.keys(cache)) delete cache[k];
  for (const k of Object.keys(inflight)) delete inflight[k];
  pendingBackfill.length = 0;
  if (backfillTimer) { clearTimeout(backfillTimer); backfillTimer = null; }
}

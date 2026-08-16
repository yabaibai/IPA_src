// ── 登錄後系統數據預加載（真實串行 + 去重預熱 + 進度條 + 不卡死放行）────────
// 職責：登入後按真實順序拉取各 Tab 核心接口，寫入「全局去重緩存」(requestDedup.sharedGet)，
// 這樣切到任意 Tab 時該 Tab 的 fetch 直接命中緩存（不再發網絡請求）→ 數據秒顯且完整，
// 同時避免登入後瞬時並發觸發 WAF CC 限速（實測 ~14 請求/窗口即 418）。
// - 每個 Tab 內部子請求串行+重試，失敗標記跳過不卡死。
// - 全部 Tab 跑完（成功或失敗）即 resolve 放行；失敗項記入 failed，進 App 後由各 Tab 自行補全。
// - 全局保底超時 45s。
import {
  getProfile, getWalletBalance, getWhalePool, getMyReferrer, getMerchantLevelConfigs,
  getLatestAntPrice, getUnreadAnnouncements, getReferralLevelConfigs, getLevelConfig,
  getDirectReferrals, getIndirectReferrals, getReferralStats, getReferralEarnings,
  getHarvestRecords, getHarvestAmountByDate,
} from "@/db/api";
import { sharedGet, scheduleBackfill } from "@/lib/requestDedup";
import { supabase } from "@/client/supabase";

export interface PreloadResult {
  done: number;
  total: number;
  label: string;
  failed: string[];
}

export async function preloadCoreData(
  userId: string,
  onProgress?: (r: PreloadResult) => void,
  globalTimeoutMs = 45000,
): Promise<PreloadResult> {
  // 各 Tab 預熱的核心接口（label 與各 Tab fetch 用的 sharedGet label 完全一致，確保命中）
  const tabs: Array<{ label: string; calls: Array<[string, () => Promise<any>]> }> = [
    {
      label: "個人資料",
      calls: [
        ["profile", () => getProfile(userId)],
        ["wallet", () => getWalletBalance(userId)],
        ["pool", () => getWhalePool(userId)],
        ["referrer", () => getMyReferrer(userId)],
        ["merchantCfg", () => getMerchantLevelConfigs()],
      ],
    },
    {
      label: "首頁",
      calls: [
        ["wallet", () => getWalletBalance(userId)],
        ["price", () => getLatestAntPrice()],
        ["unread", () => getUnreadAnnouncements(userId)],
        ["profile", () => getProfile(userId)],
      ],
    },
    {
      label: "算力池",
      calls: [
        ["pool", () => getWhalePool(userId)],
        ["profile", () => getProfile(userId)],
        ["wallet", () => getWalletBalance(userId)],
        ["unread", () => getUnreadAnnouncements(userId)],
        ["price", () => getLatestAntPrice()],
        ["recs", () => getHarvestRecords(userId, 5)],
        ["today", () => getHarvestAmountByDate(userId, new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10))],
        ["yesterday", () => getHarvestAmountByDate(userId, new Date(Date.now() + 8 * 3600_000 - 86400_000).toISOString().slice(0, 10))],
      ],
    },
    {
      label: "推廣中心",
      calls: [
        ["profile", () => getProfile(userId)],
        ["dr", () => getDirectReferrals(userId)],
        ["ir", () => getIndirectReferrals(userId)],
        ["stats", () => getReferralStats(userId)],
        ["earn", () => getReferralEarnings(userId)],
        ["rlc", () => getReferralLevelConfigs()],
      ],
    },
    {
      label: "錢包",
      calls: [
        ["wallet", () => getWalletBalance(userId)],
        ["unread", () => getUnreadAnnouncements(userId)],
        ["price", () => getLatestAntPrice()],
        ["recs", () => getHarvestRecords(userId, 5)],
      ],
    },
  ];

  const total = tabs.length;
  const failed: string[] = [];
  let done = 0;
  const tStart = Date.now();
  try { await supabase.auth.getSession(); } catch { /* ignore */ }
  onProgress?.({ done, total, label: tabs[0]?.label ?? "", failed });

  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; console.log('[PRELOAD_DBG] GLOBAL TIMEOUT 45s hit'); }, globalTimeoutMs);

  for (const tab of tabs) {
    if (timedOut) { failed.push(tab.label); continue; }
    onProgress?.({ done, total, label: tab.label, failed });
    for (const [k, fn] of tab.calls) {
      if (timedOut) break;
      const isShared = !["recs", "today", "yesterday", "levelCur", "levelNext"].includes(k);
      const r = await sharedGet(k, fn, { shared: isShared });
      if (r == null) scheduleBackfill(k, fn); // 失敗項：登錄後冷卻期過了自動補拉一次
    }
    // 算力池 levelCur/levelNext 依賴 pool 結果
    if (tab.label === "算力池") {
      const p = await sharedGet("pool", () => getWhalePool(userId), { shared: true });
      if (p) {
        const cur = await sharedGet("levelCur", () => getLevelConfig(p.level), { shared: false });
        if (cur == null) scheduleBackfill("levelCur", () => getLevelConfig(p.level));
        if (p.level < 56) {
          const nxt = await sharedGet("levelNext", () => getLevelConfig(p.level + 1), { shared: false });
          if (nxt == null) scheduleBackfill("levelNext", () => getLevelConfig(p.level + 1));
        }
      }
    }
    done++;
    onProgress?.({ done, total, label: tab.label, failed });
    console.log('[PRELOAD_DBG] tab done:', tab.label, 'elapsed=', Date.now() - tStart, 'ms', 'failed=', failed.join(','));
  }
  clearTimeout(timer);
  console.log('[PRELOAD_DBG] FINISHED totalElapsed=', Date.now() - tStart, 'ms timedOut=', timedOut, 'failed=', failed.join(','));

  const result: PreloadResult = { done: total - failed.length, total, label: "完成", failed };
  onProgress?.(result);
  return result;
}

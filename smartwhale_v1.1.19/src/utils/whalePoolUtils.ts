/**
 * 算力池純邏輯工具函式
 *
 * 從 api.ts / types.ts 中提取可獨立測試的純函式，
 * 供單元測試及業務層複用。
 */

import {
  getTierColor,
  getTierInfo,
  getTierNumber,
  getReferralLevel,
  TIER_COLORS,
  REFERRAL_LEVELS,
  type WhalePool,
} from "@/types/types";

export { getTierColor, getTierInfo, getTierNumber, getReferralLevel, TIER_COLORS, REFERRAL_LEVELS };

// ── UTC+8 日期字串（從 api.ts 提取）────────────────────────────
export function getUTC8DateStr(date: Date = new Date()): string {
  const utc8 = new Date(date.getTime() + 8 * 3600 * 1000);
  return utc8.toISOString().slice(0, 10);
}

// ── 今日是否已領取（前置冪等攔截）───────────────────────────────
export function hasClaimedToday(pool: WhalePool, now: Date = new Date()): boolean {
  const todayStr = getUTC8DateStr(now);
  const lastDateStr =
    pool.last_harvest_date ??
    (pool.last_claimed_at ? getUTC8DateStr(new Date(pool.last_claimed_at)) : null);
  return lastDateStr === todayStr;
}

// ── 算力池可領取校驗（返回 error 字串，null 表示可以領取）──────
export function validateClaimAnt(
  pool: WhalePool,
  now: Date = new Date(),
): string | null {
  if (!pool.is_active) return "算力池尚未啟用";
  if (hasClaimedToday(pool, now)) return "今日已領取，請明日零點後再來";
  return null;
}

// ── 推廣收益分類統計（從 getReferralEarnings 提取）──────────────
export interface TxRecord {
  amount: number | string;
  description: string | null;
  status: string | null;
  currency: string | null;
  type: string | null;
}

export interface ReferralEarningsSummary {
  directEarnings: number;
  indirectEarnings: number;
  burnLoss: number;
  pointsEarned: number;
  promoEarnings: number;
}

export function calcReferralEarnings(records: TxRecord[]): ReferralEarningsSummary {
  let direct = 0, indirect = 0, burn = 0, points = 0, promo = 0;
  for (const t of records) {
    const desc: string = t.description ?? "";
    const amt: number = Number(t.amount) || 0;
    const status: string = t.status ?? "";
    const currency: string = t.currency ?? "SMT";
    const type: string = t.type ?? "";
    if (type === "promo_reward") {
      promo += amt;
    } else if (currency === "POINTS") {
      points += amt;
    } else if (status === "burned") {
      burn += Math.abs(amt);
    } else if (desc.includes("間推")) {
      indirect += amt;
    } else {
      direct += amt;
    }
  }
  return { directEarnings: direct, indirectEarnings: indirect, burnLoss: burn, pointsEarned: points, promoEarnings: promo };
}

// ── 升級後鎖定領取（純函式模擬 upgradeWhale 寫 last_harvest_date 的效果）──
// upgradeWhale 成功後執行：
//   supabase.from("whale_pools").update({ last_harvest_date: getUTC8DateStr() })
// 此函式返回升級後 pool 的快照，供測試驗證"升級當日不可領取"邏輯
export function applyUpgradeLock(pool: WhalePool, now: Date = new Date()): WhalePool {
  return { ...pool, last_harvest_date: getUTC8DateStr(now) };
}

// ── 升級前置校驗（純函式，對應 pool.tsx canUpgrade 邏輯）──────────
// 返回 error 字串，null 表示可以升級
export function validateUpgrade(
  pool: WhalePool | null,
  antBalance: number,
  upgradeCost: number,
  maxLevel = 56,
): string | null {
  if (!pool) return "算力池資料未載入";
  if (!pool.is_active) return "算力池尚未啟用";
  if (pool.level >= maxLevel) return "已達滿級，無法繼續升級";
  if (antBalance < upgradeCost) return "SMT餘額不足";
  return null;
}

// ── simpleHash（從 api.ts 提取）──────────────────────────────────
export function simpleHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return String(h >>> 0);
}

// ── 推廣獎勵比例查詢（從 referral.tsx 提取）──────────────────────
// 根據直推/間推人數獲取當前推廣等級對應的獎勵比例
export interface RewardRates {
  level: string;
  directRewardPct: number;   // 直推獎勵百分比整數，如 30 = 30%
  indirectRewardPct: number; // 間推獎勵百分比整數
}

export function getRewardRates(directCount: number, indirectCount: number): RewardRates {
  const level = getReferralLevel(directCount, indirectCount);
  const config = REFERRAL_LEVELS.find((r) => r.level === level)!;
  return {
    level,
    directRewardPct: config.directReward,
    indirectRewardPct: config.indirectReward,
  };
}

// ── 獎勵金額計算（百分比整數 → 實際SMT）────────────────────────
// harvestAmt: 被推薦人當日領取SMT；rewardPct: 百分比整數（如 30）
export function calcRewardAmount(harvestAmt: number, rewardPct: number): number {
  return parseFloat(((harvestAmt * rewardPct) / 100).toFixed(4));
}

// ── formatAnt（從 api.ts 提取）───────────────────────────────────
export function formatAnt(val: number): string {
  if (val >= 10000) return (val / 10000).toFixed(2) + "萬";
  return val.toFixed(4).replace(/\.?0+$/, "");
}

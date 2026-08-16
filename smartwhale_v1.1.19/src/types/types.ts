// SMT爬牆 - 型別定義

export interface Profile {
  id: string;
  email: string | null;
  phone: string | null;
  username: string | null;
  referral_code: string;
  referred_by: string | null;
  is_verified: boolean;
  is_activated: boolean;
  is_banned: boolean;
  is_valid: boolean;
  activation_code: string | null;
  avatar_url: string | null;
  wechat_id: string | null;
  nationality: string | null;
  show_wechat_to_downline: boolean;
  show_phone_to_downline: boolean;
  show_phone_to_upline: boolean;
  // 商戶欄位
  is_merchant: boolean;
  merchant_level: "S0" | "S1" | "S2" | "S3" | "S4";
  merchant_apply_at: string | null;
  merchant_status: "none" | "pending" | "active" | "frozen" | "revoked";
  created_at: string;
  updated_at: string;
}

export type MerchantLevel = "S0" | "S1" | "S2" | "S3" | "S4";

export interface MerchantStats {
  user_id: string;
  total_trade_count: number;
  total_trade_amount: number;
  total_reward_ac: number;
  total_reward_points: number;
  last_level_up_at: string | null;
  updated_at: string;
}

export interface MerchantRankItem {
  rank: number;
  user_id: string;
  merchant_level: MerchantLevel;
  display_name: string;
  total_trade_amount: number;
  total_trade_count: number;
  total_reward_ac: number;
}

// 商戶等級配置
export const MERCHANT_LEVEL_CONFIG: Record<MerchantLevel, {
  name: string; rewardRate: number;
  minCount: number; minAmount: number;
  color: string; bgColor: string;
}> = {
  S0: { name: "普通商戶", rewardRate: 0,    minCount: 0,    minAmount: 0,       color: "#94A3B8", bgColor: "#94A3B820" },
  S1: { name: "初級商戶", rewardRate: 0,    minCount: 0,    minAmount: 0,       color: "#22C55E", bgColor: "#22C55E20" },
  S2: { name: "中級商戶", rewardRate: 0,    minCount: 0,    minAmount: 0,       color: "#3B82F6", bgColor: "#3B82F620" },
  S3: { name: "高階商戶", rewardRate: 0,    minCount: 0,    minAmount: 0,       color: "#A855F7", bgColor: "#A855F720" },
  S4: { name: "至尊商戶", rewardRate: 0,    minCount: 0,    minAmount: 0,       color: "#F59E0B", bgColor: "#F59E0B20" },
};

export interface LevelConfig {
  level: number;
  tier: number;
  tier_name: string;
  level_name: string;  // 等級專屬名稱，如"微鯨1星"
  upgrade_cost: number;
  daily_yield: number;
  bonus_energy: number; // 升級贈送能量（獨立配置，不再依賴 cost × 0.5）
  total_investment: number;
}

export interface ReferralLevelConfig {
  level_code: string;         // V1 ~ V7
  level_name: string;         // 顯示名稱
  direct_count: number;       // 達成所需直推人數
  indirect_count: number;     // 達成所需間推人數
  direct_reward_pct: number;   // 直推獎勵%
  indirect_reward_pct: number; // 間推獎勵%
  promo_reward_pct: number;        // 團隊獎勵（能量 POINTS）%
  promo_smt_reward_pct: number;    // 團隊獎勵（SMT）%
  sort_order: number;
}

export interface WhalePool {
  id: string;
  user_id: string;
  level: number;
  is_active: boolean;
  last_harvest_date: string | null;
  // 分鐘級生產
  last_claimed_at: string | null;
  production_active: boolean;
  rebirth_count: number;
  created_at: string;
  updated_at: string;
  // 封頂機制（v1433）
  total_produced: number;   // 累計已產出量
  capped_at: string | null; // 封頂時間戳，null=未封頂
}

export interface WalletBalance {
  id: string;
  user_id: string;
  ant_balance: number;
  usdt_balance: number;

  points: number;
  created_at: string;
  updated_at: string;
}

export interface HarvestRecord {
  id: string;
  user_id: string;
  amount: number;
  level_at_harvest: number;
  harvest_date: string;
  created_at: string;
}

export interface UpgradeRecord {
  id: string;
  user_id: string;
  from_level: number;
  to_level: number;
  cost: number;
  points_earned: number;
  created_at: string;
}

export interface ReferralRelationship {
  id?: string;           // 原表主鍵，遷移後不再使用，保留相容
  referrer_id: string;
  referred_id: string;
  relationship_type: "direct" | "indirect";
  generation?: number;   // 原表欄位，遷移後不再使用，保留相容
  is_valid: boolean;
  created_at: string;
  referred_user?: {
    username: string | null;
    referral_code: string;
    phone?: string | null;
    email?: string | null;
    /** 下級設定：是否允許上級查看完整手機/郵箱 */
    show_phone_to_upline?: boolean | null;
  };
  /** 算力池狀態，用於區分無效原因 */
  pool_info?: {
    is_active: boolean;
    last_claimed_at: string | null;
    level: number;
  } | null;
}

export interface Transaction {
  id: string;
  user_id: string;
  type:
    | "p2p_buy" | "p2p_sell" | "deposit" | "withdraw" | "admin_recharge"
    | "upgrade" | "harvest" | "referral_reward" | "promo_reward"
    | "exchange" | "transfer_in" | "transfer_out"
    | "transfer_locked" | "transfer_cancel" | "merchant_reward"
    | "transfer_arbitration" | "arbitration_refunded" | "rebirth";
  /** 子型別：'fast' = SMT快轉，null = 普通轉賬 */
  sub_type?: "fast" | null;
  amount: number;
  currency: string;
  status: "pending" | "completed" | "cancelled" | "failed" | "burned";
  description: string | null;
  created_at: string;
  updated_at: string;
}

// 鏈上充值記錄
export interface UsdtDepositRecord {
  id: string;
  user_id: string;
  tx_hash: string;
  amount: number;
  currency: "USDT";

  to_address: string | null;
  status: "pending" | "confirmed";
  notes: string | null;
  created_at: string;
}

// NOWPayments 充值訂單
export type RechargeOrderStatus =
  | "waiting" | "confirming" | "confirmed"
  | "finished" | "partially_paid" | "failed" | "expired";

export interface RechargeOrder {
  id: string;
  user_id: string;
  payment_id: string;
  order_id: string;
  pay_address: string;
  price_amount: number;
  pay_amount: number | null;
  actually_paid: number;
  pay_currency: string;
  status: RechargeOrderStatus;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

// nowpayments-create-payment 返回值
export interface CreateRechargeResult {
  payment_id: string;
  pay_address: string;
  pay_amount: number;
  price_amount: number;
  pay_currency: string;
  expires_at: string;
  is_existing?: boolean;
  is_sandbox?: boolean;
}

// 提現訂單
export type WithdrawStatus = "pending" | "approved" | "rejected";
export interface WithdrawOrder {
  id: string;
  order_no: string;
  user_id: string;
  amount: number;
  fee: number;
  actual_amount: number;
  currency: "USDT";
  to_address: string;
  status: WithdrawStatus;
  reject_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  is_active: boolean;
  priority: number;
  created_at: string;
  updated_at: string;
}

export interface HelpArticle {
  id: string;
  category: string;
  title: string;
  content: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type PaymentMethodType = "alipay" | "wechat" | "bank_card" | "usdt";

export interface PaymentMethod {
  id: string;
  user_id: string;
  type: PaymentMethodType;
  account_name: string;
  account_no: string;
  bank_name: string | null;
  qr_code_url: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

// 首頁 Banner（來自資料庫 banners 表）
export interface HomeBanner {
  id: string;
  title: string;
  subtitle: string | null;
  emoji: string | null;
  tag: string | null;
  tag_color: string | null;
  accent_color: string | null;
  banner_image_url: string | null;
  display_mode: string | null;   // 'card' | 'festival'
  sort_order: number;
  is_active: boolean;
  content_detail: string | null; // 彈窗詳情內容
  date_range: string | null;     // 日期範圍文字
  cta_text: string | null;       // 按鈕文案
}

// SMT價格K線
export interface AntPrice {
  id: string;
  trade_date: string;       // YYYY-MM-DD
  open_price: number;
  close_price: number;
  high_price: number;
  low_price: number;
  volume: number;
  created_at: string;
}

export type OtcOrderType = "buy" | "sell";
export type OtcOrderStatus = "open" | "locked" | "completed" | "cancelled" | "arbitration";
export type OtcTradeStatus = "pending_payment" | "pending_confirm" | "completed" | "cancelled" | "arbitration";

export interface OtcOrder {
  id: string;
  creator_id: string;
  order_type: OtcOrderType;
  amount: number;
  price: number;
  total_usdt: number;
  target_user_id: string | null;
  status: OtcOrderStatus;
  payment_method_id: string | null;
  remark: string | null;
  created_at: string;
  updated_at: string;
  creator?: { username: string | null; referral_code: string };
  payment_method?: PaymentMethod | null;
}

export interface OtcTrade {
  id: string;
  order_id: string;
  buyer_id: string;
  seller_id: string;
  amount: number;
  price: number;
  total_usdt: number;
  payment_proof_url: string | null;
  status: OtcTradeStatus;
  arbitration_reason: string | null;
  created_at: string;
  updated_at: string;
}

// 鯨魚階段顏色配置
export const TIER_COLORS: Record<number, { color: string; label: string; glow: string }> = {
  1: { color: "#3B82F6", label: "微鯨",   glow: "#3B82F620" },
  2: { color: "#22C55E", label: "2階・銀流鯨", glow: "#22C55E20" },
  3: { color: "#A855F7", label: "3階・赤熾鯨", glow: "#A855F720" },
  4: { color: "#F97316", label: "4階・核芯鯨", glow: "#F9731620" },
  5: { color: "#EF4444", label: "5階・金曜鯨", glow: "#EF444420" },
  6: { color: "#EAB308", label: "6階・星脈鯨", glow: "#EAB30820" },
  7: { color: "#06B6D4", label: "7階・鴻蒙鯨", glow: "#06B6D420" },
};

// 推廣等級配置
export const REFERRAL_LEVELS = [
  { level: "V1", direct: 0, indirect: 0, directReward: 30, indirectReward: 25 },
  { level: "V2", direct: 5, indirect: 10, directReward: 35, indirectReward: 25 },
  { level: "V3", direct: 10, indirect: 50, directReward: 40, indirectReward: 25 },
  { level: "V4", direct: 30, indirect: 100, directReward: 45, indirectReward: 25 },
  { level: "V5", direct: 70, indirect: 200, directReward: 50, indirectReward: 26 },
  { level: "V6", direct: 100, indirect: 500, directReward: 60, indirectReward: 28 },
  { level: "V7", direct: 150, indirect: 1000, directReward: 70, indirectReward: 30 },
];

// 根據等級獲取階段顏色
export function getTierColor(level: number): string {
  const tier = Math.ceil(level / 8);
  return TIER_COLORS[Math.min(tier, 7)]?.color ?? "#3B82F6";
}

export function getTierInfo(level: number): { color: string; label: string; glow: string } {
  if (level <= 8) return TIER_COLORS[1];
  if (level <= 16) return TIER_COLORS[2];
  if (level <= 24) return TIER_COLORS[3];
  if (level <= 32) return TIER_COLORS[4];
  if (level <= 40) return TIER_COLORS[5];
  if (level <= 48) return TIER_COLORS[6];
  return TIER_COLORS[7];
}

export function getTierNumber(level: number): number {
  if (level <= 8) return 1;
  if (level <= 16) return 2;
  if (level <= 24) return 3;
  if (level <= 32) return 4;
  if (level <= 40) return 5;
  if (level <= 48) return 6;
  return 7;
}

// 獲取當前推廣等級
export function getReferralLevel(directCount: number, indirectCount: number): string {
  for (let i = REFERRAL_LEVELS.length - 1; i >= 0; i--) {
    const rl = REFERRAL_LEVELS[i];
    if (directCount >= rl.direct && indirectCount >= rl.indirect) {
      return rl.level;
    }
  }
  return "V1";
}

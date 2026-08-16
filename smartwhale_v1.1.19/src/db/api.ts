import { supabase } from "@/client/supabase";
import { callAuthRpc } from "@/lib/rpc";
import { snapshotLogoutEpoch, isStaleEpoch } from "@/lib/logoutEpoch";
import type { Profile, WhalePool, WalletBalance, HarvestRecord, UpgradeRecord, ReferralRelationship, LevelConfig, ReferralLevelConfig, Transaction, UsdtDepositRecord, WithdrawOrder, RechargeOrder, CreateRechargeResult } from "@/types/types";

// ── 切換 tab 時請求偶發以 anon 發出→RLS 過濾返回 null/空 的根治 ──
// 機制：僅在「成功返回 null/空(無 error)」時，重新取最新 session 後重試一次，消除偶發 anon。
// 注意：不在每次查詢前置 getSession（避免大量並發 getSession 觸發 supabase 狀態機競態）。
export async function ensureSessionReady(): Promise<void> {
  try { const { data } = await supabase.auth.getSession(); if (!data.session) { try { await supabase.auth.refreshSession(); } catch { /* ignore */ } } } catch { /* ignore */ }
}

async function safeSingle<T>(builder: () => Promise<{ data: T | null; error: any }>): Promise<T | null> {
  const snap = snapshotLogoutEpoch();
  const r1 = await builder();
  if (r1.data != null) { if (isStaleEpoch(snap)) return null; return r1.data; }
  // 成功但空 或 報錯（含偶發 anon 導致 RLS 拒絕）：重新取最新 session 後重試一次，消除登入後首次進頁面 token 未就緒導致的數據缺失
  await ensureSessionReady();
  const r2 = await builder();
  if (isStaleEpoch(snap)) return null;
  if (r2.error) return null;
  return r2.data;
}

async function safeList<T>(builder: () => Promise<{ data: T[] | null; error: any }>): Promise<T[]> {
  const snap = snapshotLogoutEpoch();
  const r1 = await builder();
  if (Array.isArray(r1.data) && r1.data.length > 0) { if (isStaleEpoch(snap)) return []; return r1.data; }
  if (r1.error) return [];
  await ensureSessionReady();
  const r2 = await builder();
  if (isStaleEpoch(snap)) return [];
  if (r2.error || !Array.isArray(r2.data)) return [];
  return r2.data;
}

// ── 使用者檔案 ──────────────────────────────────────────────────
export async function getProfile(userId: string): Promise<Profile | null> {
  return safeSingle<Profile>(() =>
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle()
  );
}

export async function updateProfile(userId: string, updates: Partial<Pick<Profile, "username" | "avatar_url" | "wechat_id" | "nationality" | "show_wechat_to_downline" | "show_phone_to_downline" | "show_phone_to_upline">>) {
  // 源頭修復：防止閉包空 userId 導致 profiles.where id="" 更新 0 行卻不報錯（靜默失敗）
  if (!userId) return { error: "會話已失效，請重新登錄" } as any;
  const { error } = await supabase
    .from("profiles")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", userId);
  return error;
}

// ── 算力池 ──────────────────────────────────────────────────────
export async function getWhalePool(userId: string): Promise<WhalePool | null> {
  return safeSingle<WhalePool>(() =>
    supabase.from("whale_pools").select("*").eq("user_id", userId).maybeSingle()
  );
}

// ── 等級配置 ──────────────────────────────────────────────────
export async function getAllLevelConfigs(): Promise<LevelConfig[]> {
  const { data } = await supabase
    .from("level_config")
    .select("*")
    .order("level", { ascending: true });
  return Array.isArray(data) ? data : [];
}

export async function getLevelConfig(level: number): Promise<LevelConfig | null> {
  const { data } = await supabase
    .from("level_config")
    .select("*")
    .eq("level", level)
    .maybeSingle();
  return data;
}

// ── 推廣等級配置（動態名稱/達成條件/獎勵）────────────────────────
export async function getReferralLevelConfigs(): Promise<ReferralLevelConfig[]> {
  const { data } = await supabase
    .from("referral_level_config")
    .select("level_code, level_name, direct_count, indirect_count, direct_reward_pct, indirect_reward_pct, promo_reward_pct, promo_smt_reward_pct, sort_order")
    .order("sort_order", { ascending: true });
  return Array.isArray(data) ? (data as ReferralLevelConfig[]) : [];
}

// ── 錢包 ──────────────────────────────────────────────────────
export async function getWalletBalance(userId: string): Promise<WalletBalance | null> {
  return safeSingle<WalletBalance>(() =>
    supabase.from("wallet_balances").select("*").eq("user_id", userId).maybeSingle()
  );
}

// ── 領取記錄 ──────────────────────────────────────────────────
export async function getHarvestRecords(userId: string, limit = 20): Promise<HarvestRecord[]> {
  return safeList<HarvestRecord>(() =>
    supabase.from("harvest_records").select("*").eq("user_id", userId)
      .order("created_at", { ascending: false }).limit(limit)
  );
}

// 查詢指定 UTC+8 日期實際領取金額（無記錄返回 0）
export async function getHarvestAmountByDate(userId: string, dateStr: string): Promise<number> {
  const data = await safeSingle<{ amount: any }>(() =>
    supabase.from("harvest_records").select("amount")
      .eq("user_id", userId).eq("harvest_date", dateStr).maybeSingle()
  );
  return data ? Number(data.amount) : 0;
}

// ── 升級記錄 ──────────────────────────────────────────────────
export async function getUpgradeRecords(userId: string, limit = 20): Promise<UpgradeRecord[]> {
  return safeList<UpgradeRecord>(() =>
    supabase.from("upgrade_records").select("*").eq("user_id", userId)
      .order("created_at", { ascending: false }).limit(limit)
  );
}

// ── 升級操作 ──────────────────────────────────────────────────
// 注意：升级费由服务端从 level_config 取，cost 仅前端展示用，不传给 RPC
export async function upgradeWhale(
  userId: string,
  currentLevel: number,
  nextLevel: number,
  _cost?: number
): Promise<{ success: boolean; error?: string; points_earned?: number; need_claim_first?: boolean }> {
  const { data, error } = await callAuthRpc("perform_upgrade_whale", {
    p_from_level: currentLevel,
    p_to_level:   nextLevel,
  }, userId);
  if (error) return { success: false, error: error.message };
  const result = data as { success: boolean; error?: string; points_earned?: number; need_claim_first?: boolean };
  // last_harvest_date 已由 perform_upgrade_whale RPC 内部更新，前端无需直接写 whale_pools
  return result;
}

// ── 領取操作 ──────────────────────────────────────────────────
// ── 僅憑啟用碼啟用算力池（P1 修復：改用 SECURITY DEFINER RPC）────
// ── 首次啟用算力池（啟用碼 + 交易密碼，唯一啟用場景）────────────
export async function activateWhalePool(
  userId: string,
  activationCode: string,
  tradingPasswordHash: string
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await callAuthRpc("perform_activate_whale", {
    p_activation_code:      activationCode,
    p_trading_password_hash: tradingPasswordHash,
  }, userId);
  if (error) return { success: false, error: error.message };
  return data as { success: boolean; error?: string };
}

// ── 工具：獲取 UTC+8 日期字串（YYYY-MM-DD） ─────────────────
function getUTC8DateStr(date: Date = new Date()): string {
  const utc8 = new Date(date.getTime() + 8 * 3600 * 1000);
  return utc8.toISOString().slice(0, 10);
}

// ── 每日領取 SMT（每日零點 UTC+8 重新整理，當天領取一次；不領取不累計）──
export async function claimAnt(
  userId: string,
  pool: WhalePool,
  levelConfig: LevelConfig
): Promise<{ success: boolean; amount?: number; capped?: boolean; error?: string }> {
  // 注意：不在前端攔截 is_active，讓 RPC 回傳語義準確的錯誤
  // 修復前 perform_harvest 對封頂用戶回「尚未激活」，現已修復為「算力池已封顶」

  const now = new Date();
  const todayStr = getUTC8DateStr(now);

  // 今日已領取（DB 層也有冪等保護，此處前置攔截提升體驗）
  const lastDateStr = pool.last_harvest_date
    ?? (pool.last_claimed_at ? getUTC8DateStr(new Date(pool.last_claimed_at)) : null);
  if (lastDateStr === todayStr) {
    return { success: false, error: "今日已領取，請明日零點後再來" };
  }

  // 收益由服务端按 level_config.daily_yield 计算，前端不再传金额
  // 使用 SECURITY DEFINER RPC 保證餘額原子更新（p_today 傳 UTC+8 日期）
  const { data, error: rpcError } = await callAuthRpc("perform_harvest", {
    p_level:   pool.level,
    p_today:   todayStr,
  }, userId);
  if (rpcError) return { success: false, error: rpcError.message };

  const result = data as { success: boolean; amount?: number; capped?: boolean; error?: string };
  if (!result.success) {
    // 透傳封頂標誌，讓前端彈窗決策
    return { success: false, capped: result.capped ?? false, error: result.error ?? "領取失敗" };
  }

  // RPC 回傳實際入賬金額（截斷後可能 < daily_yield）
  const actualAmount = result.amount ?? amount;
  // 本次截斷觸發封頂：capped=true，但仍算成功
  return { success: true, amount: actualAmount, capped: result.capped ?? false };
}

// ── 重生（Lv.56 滿級後直接重置為 Lv.1，累計重生次數）─────────
export async function performRebirth(
  userId: string
): Promise<{ success: boolean; rebirth_count?: number; error?: string }> {
  const { data, error } = await callAuthRpc("perform_rebirth", {}, userId);
  if (error) return { success: false, error: error.message };
  return data as { success: boolean; rebirth_count?: number; error?: string };
}

// ── 推廣關係（基於 profiles.referred_by 鏈，不再依賴 referral_relationships 表）──
export async function getDirectReferrals(userId: string, limit = 500, offset = 0): Promise<ReferralRelationship[]> {
  // 使用 SECURITY DEFINER RPC 繞過 profiles 表 RLS（RLS 只允許查自己，無法直接查下線資料）
  const { data } = await callAuthRpc("get_direct_referrals_paged", {
    p_limit: limit,
    p_offset: offset,
  }, userId);
  const rows = Array.isArray(data) ? data : [];
  return rows.map((r: any) => ({
    referrer_id: userId,
    referred_id: r.referred_id,
    relationship_type: "direct" as const,
    is_valid: r.is_valid ?? false,
    created_at: r.created_at,
    referred_user: { username: r.username, referral_code: r.referral_code, phone: r.phone, email: r.email, show_phone_to_upline: r.show_phone_to_upline ?? true },
    pool_info: r.pool_is_active != null ? {
      is_active: r.pool_is_active,
      last_claimed_at: r.pool_last_claimed ?? null,
      level: r.pool_level ?? 0,
    } : null,
  }));
}

export async function getIndirectReferrals(userId: string, limit = 20, offset = 0): Promise<ReferralRelationship[]> {
  // 使用服務端分頁 RPC，徹底消除雙重 limit 截斷問題
  const { data } = await callAuthRpc("get_indirect_referrals_paged", {
    p_limit: limit,
    p_offset: offset,
  }, userId);
  const rows = Array.isArray(data) ? data : [];
  return rows.map((r: any) => ({
    referrer_id: userId,
    referred_id: r.referred_id,
    relationship_type: "indirect" as const,
    is_valid: r.is_valid ?? false,
    created_at: r.created_at,
    referred_user: { username: r.username, referral_code: r.referral_code, show_phone_to_upline: r.show_phone_to_upline ?? true },
    pool_info: r.pool_is_active != null ? {
      is_active: r.pool_is_active,
      last_claimed_at: r.pool_last_claimed ?? null,
      level: r.pool_level ?? 0,
    } : null,
  }));
}

export async function getReferralStats(userId: string): Promise<{ direct: number; indirect: number; validDirect: number; validIndirect: number }> {
  // 全部透過 SECURITY DEFINER RPC，繞過 profiles/whale_pools 的 RLS 限制
  // （直接 .select().eq("referred_by") 會被 RLS 攔截，因為查的是別人的行）
  const [profileRes, directCountRes, indirectCountRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("valid_direct_count, valid_indirect_count")
      .eq("id", userId)
      .maybeSingle(),
    // 直推總數：SECURITY DEFINER RPC，繞過 RLS
    callAuthRpc("count_direct_referrals", {}, userId),
    // 間推總數：SECURITY DEFINER RPC，繞過 RLS + 避免 .in() limit 截斷
    callAuthRpc("count_indirect_referrals", {}, userId),
  ]);

  const validDirect   = (profileRes.data as any)?.valid_direct_count   ?? 0;
  const validIndirect = (profileRes.data as any)?.valid_indirect_count ?? 0;
  const directTotal   = (typeof directCountRes.data === "number" && !directCountRes.error) ? directCountRes.data : null;
  const indirectTotal = (typeof indirectCountRes.data === "number" && !indirectCountRes.error) ? indirectCountRes.data : null;
  // WAF/網路異常時 RPC 返回 error 或 null：整体返回 null，讓上層 sharedGet 判定為空、不快取、退避重試（避免團隊總數永久顯示 0）
  if (directTotal === null || indirectTotal === null || profileRes.error) return null as any;
  return {
    direct:   directTotal,
    indirect: indirectTotal,
    validDirect,
    validIndirect,
  };
}

// ── 公告 ──────────────────────────────────────────────────────
export async function getActiveAnnouncements(): Promise<import("@/types/types").Announcement[]> {
  const { data } = await supabase
    .from("announcements")
    .select("*")
    .eq("is_active", true)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: false });
  return Array.isArray(data) ? data : [];
}

export async function getUnreadAnnouncements(_userId: string): Promise<import("@/types/types").Announcement[]> {
  const { data } = await supabase
    .from("announcements")
    .select("*, reads:announcement_reads!left(id)")
    .eq("is_active", true)
    .order("priority", { ascending: false });
  if (!Array.isArray(data)) return [];
  return (data as any[]).filter((a) => !a.reads || a.reads.length === 0);
}

export async function markAnnouncementRead(userId: string, announcementId: string): Promise<void> {
  await supabase
    .from("announcement_reads")
    .upsert({ user_id: userId, announcement_id: announcementId }, { onConflict: "user_id,announcement_id" });
}

export async function markAllAnnouncementsRead(userId: string, ids: string[]): Promise<void> {
  if (!ids.length) return;
  await supabase.from("announcement_reads").upsert(
    ids.map((id) => ({ user_id: userId, announcement_id: id })),
    { onConflict: "user_id,announcement_id" }
  );
}

// ── 收款方式 ──────────────────────────────────────────────────
export async function getPaymentMethods(userId: string): Promise<import("@/types/types").PaymentMethod[]> {
  const { data } = await supabase
    .from("payment_methods")
    .select("*")
    .eq("user_id", userId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });
  return Array.isArray(data) ? data : [];
}

export async function addPaymentMethod(
  userId: string,
  method: Omit<import("@/types/types").PaymentMethod, "id" | "user_id" | "created_at" | "updated_at">
): Promise<{ error?: string }> {
  const { error } = await supabase.from("payment_methods").insert({ ...method, user_id: userId });
  if (!error) return {};
  // 資料庫 trigger 攔截：友好提示
  if (error.message?.includes("每種收款型別最多新增5條記錄")) {
    return { error: "該收款型別已達上限（最多5條），請刪除舊記錄後再新增" };
  }
  return { error: error.message };
}

export async function updatePaymentMethod(
  id: string,
  updates: Partial<Pick<import("@/types/types").PaymentMethod, "account_name" | "account_no" | "bank_name">>
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from("payment_methods")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id);
  return error ? { error: error.message } : {};
}

// 原子性設定預設收款方式（單事務內清除舊預設 + 設新預設，避免競態）
export async function setDefaultPaymentMethod(
  userId: string,
  id: string
): Promise<{ error?: string }> {
  const { error } = await callAuthRpc("set_default_payment_method", {
    p_id: id,
  }, userId);
  return error ? { error: error.message } : {};
}

export async function deletePaymentMethod(id: string): Promise<{ error?: string }> {
  const { error } = await supabase.from("payment_methods").delete().eq("id", id);
  return error ? { error: error.message } : {};
}

// ── OTC訂單 ───────────────────────────────────────────────────
export async function getOtcOrders(
  userId: string,
  orderType?: "buy" | "sell"
): Promise<import("@/types/types").OtcOrder[]> {
  let q = supabase
    .from("otc_orders")
    .select("*, creator:public_profiles!otc_orders_creator_id_fkey(username, referral_code), payment_method:payment_methods(*)")
    .or(`target_user_id.is.null,target_user_id.eq.${userId},creator_id.eq.${userId}`)
    .order("created_at", { ascending: false });
  if (orderType) q = q.eq("order_type", orderType);
  const { data } = await q;
  return Array.isArray(data) ? (data as any[]) : [];
}

export async function createOtcOrder(
  order: Pick<import("@/types/types").OtcOrder, "creator_id" | "order_type" | "amount" | "price" | "total_usdt" | "target_user_id" | "payment_method_id" | "remark">
): Promise<{ data?: import("@/types/types").OtcOrder; error?: string }> {
  const { data, error } = await supabase.from("otc_orders").insert(order).select().maybeSingle();
  return error ? { error: error.message } : { data: data as any };
}

export async function updateOtcOrderStatus(
  id: string,
  status: import("@/types/types").OtcOrderStatus
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from("otc_orders")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  return error ? { error: error.message } : {};
}

export async function getOtcOrderDetail(id: string): Promise<import("@/types/types").OtcOrder | null> {
  const { data } = await supabase
    .from("otc_orders")
    .select("*, creator:public_profiles!otc_orders_creator_id_fkey(username, referral_code), payment_method:payment_methods(*)")
    .eq("id", id)
    .maybeSingle();
  return data as any;
}

export async function createOtcTrade(
  trade: Pick<import("@/types/types").OtcTrade, "order_id" | "buyer_id" | "seller_id" | "amount" | "price" | "total_usdt">
): Promise<{ data?: import("@/types/types").OtcTrade; error?: string }> {
  const { data, error } = await supabase.from("otc_trades").insert(trade).select().maybeSingle();
  return error ? { error: error.message } : { data: data as any };
}

export async function getOtcTrades(userId: string): Promise<import("@/types/types").OtcTrade[]> {
  const { data } = await supabase
    .from("otc_trades")
    .select("*")
    .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
    .order("created_at", { ascending: false });
  return Array.isArray(data) ? data : [];
}

export async function updateOtcTrade(
  id: string,
  updates: Partial<Pick<import("@/types/types").OtcTrade, "status" | "payment_proof_url" | "arbitration_reason">>
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from("otc_trades")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id);
  return error ? { error: error.message } : {};
}

// ── 首頁 Banner ──────────────────────────────────────────────
// 实现移至 src/db/banners.ts（独立文件，避免与下方预存类型问题耦合），此处 re-export 保持兼容。
export { getBanners } from "./banners";

// ── 系統配置單項讀取 ────────────────────────────────────────
export async function getSystemConfigValue(key: string): Promise<string | null> {
  const { data } = await supabase
    .from("system_config")
    .select("config_val")
    .eq("config_key", key)
    .maybeSingle();
  return data?.config_val ?? null;
}

// ── SMT價格 ───────────────────────────────────────────────────
export async function getAntPrices(limit = 30): Promise<import("@/types/types").AntPrice[]> {
  // 先取最新 limit 條（DESC），再反轉為時間正序供 K 線圖使用
  const { data } = await supabase
    .from("ant_prices")
    .select("*")
    .order("trade_date", { ascending: false })
    .limit(limit);
  return Array.isArray(data) ? [...data].reverse() : [];
}

export async function getLatestAntPrice(): Promise<import("@/types/types").AntPrice | null> {
  const { data } = await supabase
    .from("ant_prices")
    .select("*")
    .order("trade_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

// ── SMT代幣轉賬（呼叫SECURITY DEFINER函式）──────────────────────
export async function transferAnt(
  fromUserId: string,
  toUserId: string,
  amount: number,
  remark?: string
): Promise<{ success: boolean; error?: string; points_spent?: number }> {
  const { data, error } = await supabase.rpc("perform_ant_transfer", {
    p_sender_id: fromUserId,
    p_receiver_id: toUserId,
    p_amount: amount,
  });
  if (error) return { success: false, error: error.message };
  const result = data as { success: boolean; error?: string; points_spent?: number };
  return result;
}

// ── USDT兌換SMT（呼叫SECURITY DEFINER函式）──────────────────────
// 注意：兑换汇率由服务端从 ant_prices 强制取值，客户端传入的 price/目标币数量不再信任。
// price 参数仅保留用于前端展示与余额预校验，不会传给 RPC。
export async function exchangeUsdtToAnt(
  userId: string,
  usdtAmount: number,
  _antAmount?: number,
  _price?: number
): Promise<{ success: boolean; error?: string; points_earned?: number }> {
  const { data, error } = await callAuthRpc("perform_usdt_to_ant_exchange", {
    p_usdt_amount: usdtAmount,
  }, userId);
  if (error) return { success: false, error: error.message };
  const result = data as { success: boolean; error?: string; points_earned?: number };
  return result;
}

export async function exchangeAntToUsdt(
  userId: string,
  antAmount: number,
  _usdtAmount?: number,
  _price?: number
): Promise<{ success: boolean; error?: string; points_spent?: number }> {
  const { data, error } = await callAuthRpc("perform_ant_to_usdt_exchange", {
    p_ant_amount: antAmount,
  }, userId);
  if (error) return { success: false, error: error.message };
  const result = data as { success: boolean; error?: string; points_spent?: number };
  return result;
}

// 推廣收益統計（從交易記錄）
export async function getReferralEarnings(userId: string): Promise<{
  directEarnings: number;
  indirectEarnings: number;
  burnLoss: number;
  promoEarnings: number;
  promoSmtEarnings: number;
  promoEnergyEarnings: number;
  teamPoolSmtConsumption: number;
}> {
  // 用服務端聚合 RPC，全量 SUM 不受行數限制
  const { data } = await callAuthRpc("get_referral_earnings_summary", {}, userId);
  const row = Array.isArray(data) ? data[0] : data;
  return {
    directEarnings:          Number((row as any)?.direct_earnings           ?? 0),
    indirectEarnings:      Number((row as any)?.indirect_earnings         ?? 0),
    burnLoss:              Number((row as any)?.burn_loss                 ?? 0),
    promoEarnings:         Number((row as any)?.promo_earnings            ?? 0),
    promoSmtEarnings:      Number((row as any)?.promo_smt_earnings        ?? 0),
    promoEnergyEarnings:   Number((row as any)?.promo_energy_earnings     ?? 0),
    teamPoolSmtConsumption: Number((row as any)?.team_pool_smt_consumption ?? 0),
  };
}

export async function getTeamPoolSmtConsumption(userId: string): Promise<number> {
  const { data } = await callAuthRpc("get_team_pool_smt_consumption", {}, userId);
  return Number(data ?? 0);
}

// 推廣獎勵記錄服務端分頁（tab 過濾下推至資料庫，消除前端 limit 截斷）
export async function getReferralRewardRecords(
  userId: string,
  limit = 20,
  offset = 0,
  tab = "all"
): Promise<Transaction[]> {
  const { data } = await callAuthRpc("get_referral_rewards_paged", {
    p_tab:     tab,
    p_limit:   limit,
    p_offset:  offset,
  }, userId);
  return Array.isArray(data) ? (data as Transaction[]) : [];
}

// 推廣獎勵各 Tab 計數（服務端聚合，返回 { tab: string; cnt: number }[]）
export async function getReferralRewardTabCounts(
  userId: string
): Promise<Record<string, number>> {
  const { data } = await callAuthRpc("get_referral_rewards_tab_counts", {}, userId);
  const result: Record<string, number> = {};
  if (Array.isArray(data)) {
    (data as { tab: string; cnt: number }[]).forEach((r) => {
      result[r.tab] = Number(r.cnt);
    });
  }
  return result;
}

// ── 啟用後建立1階鯨魚（改用服務端 RPC，P2 修復）────────────────
export async function createInitialWhaleIfNeeded(userId: string): Promise<void> {
  // 改為呼叫 SECURITY DEFINER RPC，避免客戶端直接寫 whale_pools/wallet_balances
  await callAuthRpc("init_whale_wallet", {}, userId);
}

// ── 定向轉賬訂單 ─────────────────────────────────────────────
export interface TransferOrder {
  id: string;
  sender_id: string;
  receiver_id: string;
  amount: number;
  fee: number;          // 3% 手續費
  points_cost: number;  // 建立時扣除的能量
  price: number;
  total_usdt: number;
  payment_method_id: string | null;
  remark: string | null;
  payment_proof: string | null;
  proof_image_urls: string[];  // 付款憑證圖片（最多5張）
  status: "pending_payment" | "pending_confirm" | "completed" | "cancelled" | "arbitration" | "arbitration_reviewing";
  expires_at: string;
  confirm_expires_at: string | null;
  created_at: string;
  updated_at: string;
  // 仲裁證據欄位
  arbitration_started_at: string | null;
  sender_evidence_submitted: boolean;
  receiver_evidence_submitted: boolean;
  sender_evidence_text: string | null;
  receiver_evidence_text: string | null;
  sender_evidence_images: string[];
  receiver_evidence_images: string[];
  sender?: { username: string; referral_code: string };
  receiver?: { username: string; referral_code: string };
  payment_method?: import("@/types/types").PaymentMethod | null;
}

export async function submitArbitrationEvidence(
  orderId: string,
  userId: string,
  text: string,
  images: string[]
): Promise<{ error?: string }> {
  const { data, error } = await callAuthRpc("submit_arbitration_evidence", {
    p_order_id: orderId,
    p_text:     text || null,
    p_images:   images,
  }, userId);
  if (error) return { error: error.message };
  const res = data as { success?: boolean; error?: string } | null;
  if (res && !res.success) return { error: res.error ?? "提交失敗" };
  return {};
}

export interface TransferFreezeStatus {
  frozen: boolean;
  freeze_until: string | null;  // 'YYYY-MM-DD HH:MM' 格式（Asia/Shanghai）
  reason: string | null;
  today_cancel_count: number;
}

export async function getTransferFreezeStatus(userId: string): Promise<TransferFreezeStatus> {
  const { data } = await callAuthRpc("get_transfer_freeze_status", {}, userId);
  return (data as TransferFreezeStatus) ?? { frozen: false, freeze_until: null, reason: null, today_cancel_count: 0 };
}

export async function getTransferOrders(userId: string): Promise<TransferOrder[]> {
  const { data } = await supabase
    .from("transfer_orders")
    .select("*, confirm_expires_at, sender:public_profiles!transfer_orders_sender_id_fkey(username, referral_code), receiver:public_profiles!transfer_orders_receiver_id_fkey(username, referral_code), payment_method:payment_methods(*)")
    .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
    .order("created_at", { ascending: false })
    .limit(50);
  return Array.isArray(data) ? (data as TransferOrder[]) : [];
}

export async function getTransferOrderDetail(id: string, userId: string): Promise<TransferOrder | null> {
  const { data, error } = await callAuthRpc("get_transfer_order_detail", { p_order_id: id }, userId);
  if (error) return null;
  const res = data as { success?: boolean; order?: TransferOrder } | null;
  if (!res || !res.success || !res.order) return null;
  return res.order;
}

export async function createTransferOrder(
  senderId: string,
  receiverInput: string,   // referral_code / username / email / uuid — 或已解析的 UUID
  amount: number,
  price: number,
  paymentMethodId: string | null,
  remark: string,
  resolvedReceiverId?: string  // 前端已透過 lookupUserById 解析好時直接傳入，跳過二次查詢
): Promise<{ data?: { orderId: string; receiverId: string }; error?: string }> {
  let receiverId = resolvedReceiverId;

  if (!receiverId) {
    // 兜底：透過多方式查詢接收人 UUID
    const prof = await lookupUserById(receiverInput);
    if (!prof) return { error: "未找到該使用者，請確認使用者名稱、推薦碼或郵箱是否正確" };
    receiverId = prof.id;
  }

  if (receiverId === senderId) return { error: "不能轉賬給自己" };

  const totalUsdt = parseFloat((amount * price).toFixed(4));
  const { data, error } = await supabase.rpc("create_transfer_order", {
    p_sender_id: senderId,
    p_receiver_id: receiverId,
    p_amount: amount,
    p_price: price,
    p_total_usdt: totalUsdt,
    p_payment_method_id: paymentMethodId,
    p_remark: remark || null,
  });
  if (error) return { error: error.message };
  return { data: { orderId: data as string, receiverId } };
}

export async function submitTransferProof(
  orderId: string,
  receiverId: string,
  proof: string,
  proofImageUrls: string[] = []
): Promise<{ error?: string }> {
  const { error } = await supabase.rpc("submit_transfer_proof", {
    p_order_id: orderId,
    p_receiver_id: receiverId,
    p_proof: proof,
    p_proof_image_urls: proofImageUrls,
  });
  return error ? { error: error.message } : {};
}

export async function confirmTransferReceived(
  orderId: string,
  senderId: string
): Promise<{ error?: string }> {
  const { error } = await supabase.rpc("confirm_transfer_received", {
    p_order_id: orderId,
    p_sender_id: senderId,
  });
  return error ? { error: error.message } : {};
}

export async function disputeTransferOrder(
  orderId: string,
  senderId: string
): Promise<{ error?: string }> {
  const { error } = await callAuthRpc("dispute_transfer_order", {
    p_order_id: orderId,
  }, senderId);
  return error ? { error: error.message } : {};
}

export async function cancelTransferOrder(
  orderId: string,
  userId: string
): Promise<{ error?: string }> {
  const { error } = await callAuthRpc("cancel_transfer_order", {
    p_order_id: orderId,
  }, userId);
  return error ? { error: error.message } : {};
}

export async function cancelExpiredTransferOrders(): Promise<void> {
  await supabase.rpc("cancel_expired_transfer_orders");
}

// ── 公告列表（含已讀） ─────────────────────────────────────────
export async function getAllAnnouncements(): Promise<import("@/types/types").Announcement[]> {
  const { data } = await supabase
    .from("announcements")
    .select("*")
    .eq("is_active", true)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: false });
  return Array.isArray(data) ? data : [];
}

// ── 幫助中心 ──────────────────────────────────────────────────
export async function getHelpArticles(): Promise<import("@/types/types").HelpArticle[]> {
  const { data } = await supabase
    .from("help_articles")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  return Array.isArray(data) ? data as import("@/types/types").HelpArticle[] : [];
}

export async function getHelpArticleById(id: string): Promise<import("@/types/types").HelpArticle | null> {
  const { data } = await supabase
    .from("help_articles")
    .select("*")
    .eq("id", id)
    .single();
  return data as import("@/types/types").HelpArticle | null;
}

// ── 交易記錄（能量/餘額變化）─────────────────────────────────────
export async function getTransactions(
  userId: string,
  currency?: string,
  limit = 10,
  offset = 0
): Promise<{ data: Transaction[]; total: number }> {
  const run = () => {
    let q = supabase
      .from("transactions")
      .select("id, type, sub_type, amount, currency, description, created_at, user_id, status, updated_at", { count: "exact" })
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (currency) q = q.eq("currency", currency);
    return q;
  };
  await ensureSessionReady();
  let { data, count } = await run();
  if (!Array.isArray(data) || data.length === 0) {
    await ensureSessionReady();
    const r2 = await run();
    data = r2.data; count = r2.count;
  }
  return {
    data: Array.isArray(data) ? (data as Transaction[]) : [],
    total: count ?? 0,
  };
}

// ── 查詢我的推薦人 ─────────────────────────────────────────────
export async function getMyReferrer(userId: string): Promise<{
  id: string; username: string; referral_code: string;
  phone?: string | null; email?: string | null; wechat_id?: string | null;
  show_phone_to_downline?: boolean | null; show_wechat_to_downline?: boolean | null;
} | null> {
  // 透過安全 RPC 查詢（SECURITY DEFINER，按 show_* 開關過濾聯絡方式）
  const { data, error } = await callAuthRpc("get_upline_contact", {}, userId);
  if (error || !data || data.error === "forbidden" || data.found === false) return null;
  return data as Awaited<ReturnType<typeof getMyReferrer>>;
}

// ── 根據邀請碼預覽上級資訊 ─────────────────────────────────────
export async function lookupByReferralCode(
  code: string
): Promise<{ id: string; username: string | null; phone: string | null } | null> {
  const { data, error } = await supabase.rpc("lookup_by_referral_code", { p_code: code.trim() });
  if (error || !data || data.found === false) return null;
  return data as { id: string; username: string | null; phone: string | null };
}

// 多方式查詢使用者（推薦碼 / 手機號 / 郵箱）
export async function lookupUserById(
  input: string
): Promise<{ id: string; username: string | null; referral_code: string | null; matchType?: string } | null> {
  const trimmed = input.trim();
  if (!trimmed || trimmed.length < 2) return null;

  // 透過安全 RPC 查詢（SECURITY DEFINER，僅返回 id/username/referral_code，不返回聯絡方式）
  const { data, error } = await supabase.rpc("lookup_user_safe", { p_input: trimmed });
  if (error || !data || data.found === false) return null;
  return data as { id: string; username: string | null; referral_code: string | null; matchType?: string };
}

// ── 繫結上級 ──────────────────────────────────────────────────
export async function bindReferrer(
  userId: string,
  referralCode: string,
  tradingPasswordHash: string
): Promise<{ success: boolean; error?: string }> {
  // 源頭修復：防止空 userId 靜默失敗
  if (!userId) return { success: false, error: "會話已失效，請重新登錄" };
  const { data, error } = await callAuthRpc("bind_referrer", {
    p_referral_code: referralCode,
    p_trading_password_hash: tradingPasswordHash,
  }, userId);
  if (error) return { success: false, error: error.message };
  const result = data as { success: boolean; error?: string };
  return result;
}

// ── 修改交易密碼（服务端校验旧密码，防止客户端绕过）──────────────
export async function setTradingPassword(
  _userId: string,
  newPasswordHash: string,
  oldPasswordHash?: string
): Promise<{ error?: string }> {
  const { data, error } = await supabase.rpc("change_trading_password", {
    p_old_hash: oldPasswordHash ?? null,
    p_new_hash: newPasswordHash,
  });
  if (error) return { error: error.message };
  const result = data as { success: boolean; error?: string };
  return result.success ? {} : { error: result.error };
}

// ── 交易密碼校驗（改用 SECURITY DEFINER RPC，不再直接讀 hash，P0 修復）──
export async function verifyTradingPassword(
  userId: string,
  hash: string
): Promise<boolean> {
  const { data } = await callAuthRpc("verify_trading_password", {
    p_hash: hash,
  }, userId);
  return data === true;
}

// ── 工具函式 ──────────────────────────────────────────────────
// 生成8位啟用碼（大寫字母+數字）
export function generateActivationCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export function simpleHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return String(h >>> 0);
}
export function formatAnt(val: number): string {
  if (val >= 10000) return (val / 10000).toFixed(2) + "萬";
  return val.toFixed(4).replace(/\.?0+$/, "");
}

export function formatNumber(val: number): string {
  return val.toLocaleString("zh-CN", { maximumFractionDigits: 4 });
}

// ── 提交提現申請（改用 SECURITY DEFINER RPC，原子操作，P0 修復）──
// 修復：TOCTOU 競態條件 + 非原子回滾 + 交易密碼客戶端校驗
export async function submitWithdrawOrder(
  userId: string,
  amount: number,
  toAddress: string,
  tradingPasswordHash: string
): Promise<{ success: boolean; error?: string; orderId?: string }> {
  const { data, error } = await callAuthRpc("perform_withdraw", {
    p_amount:               amount,
    p_trading_password_hash: tradingPasswordHash,
    p_to_address:           toAddress,
  }, userId);
  if (error) return { success: false, error: error.message };
  const result = data as { success: boolean; error?: string; order_no?: string };
  return { success: result.success, error: result.error, orderId: result.order_no };
}

// ── 查詢提現訂單列表 ──────────────────────────────────────────
export async function getWithdrawOrders(
  userId: string,
  limit = 20,
  offset = 0
): Promise<{ data: WithdrawOrder[]; total: number }> {
  const [{ data, error }, { count }] = await Promise.all([
    supabase
      .from("withdraw_orders")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1),
    supabase
      .from("withdraw_orders")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId),
  ]);
  if (error || !data) return { data: [], total: 0 };
  return { data: data as WithdrawOrder[], total: count ?? 0 };
}

// ── 查詢 USDT 充值記錄列表 ────────────────────────────────────
export async function getUsdtDepositRecords(
  userId: string,
  limit = 20,
  offset = 0
): Promise<{ data: UsdtDepositRecord[]; total: number }> {
  const [{ data, error }, { count }] = await Promise.all([
    supabase
      .from("usdt_deposit_records")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1),
    supabase
      .from("usdt_deposit_records")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId),
  ]);
  if (error || !data) return { data: [], total: 0 };
  return { data: data as UsdtDepositRecord[], total: count ?? 0 };
}

// ── NOWPayments 充值：建立支付訂單 ────────────────────────────
export async function createRechargeOrder(
  priceAmount: number
): Promise<{ data: CreateRechargeResult | null; error?: string }> {
  // 使用 functions.invoke：自動帶上有效 JWT 並在必要時刷新 token，
  // 避免 getSession() 取到過期 access_token 導致後端「身份驗證失敗」
  const { data, error } = await supabase.functions.invoke("nowpayments-create-payment", {
    body: { price_amount: priceAmount },
  });

  if (error) {
    let msg = "建立充值訂單失敗";
    try {
      const parsed = await error.context?.json?.();
      if (parsed?.error) msg = parsed.error;
    } catch { /* ignore */ }
    return { data: null, error: msg };
  }
  if (!data) return { data: null, error: "建立充值訂單失敗" };
  return { data: data as CreateRechargeResult };
}

// ── NOWPayments 充值：查詢訂單狀態（輪詢用）─────────────────
export async function getRechargeOrderStatus(
  paymentId: string
): Promise<RechargeOrder | null> {
  const { data, error } = await supabase
    .from("recharge_orders")
    .select("*")
    .eq("payment_id", paymentId)
    .maybeSingle();
  if (error || !data) return null;
  return data as RechargeOrder;
}

// ── 商戶系統 API ──────────────────────────────────────────────

export async function applyMerchant(userId: string): Promise<{ success: boolean; error?: string; merchant_level?: string }> {
  // 源頭修復：防止空 userId 靜默失敗
  if (!userId) return { success: false, error: "會話已失效，請重新登錄" };
  const { data, error } = await callAuthRpc("apply_merchant", {}, userId);
  if (error) return { success: false, error: error.message };
  return data as { success: boolean; error?: string; merchant_level?: string };
}

export async function getMerchantStats(userId: string): Promise<import("@/types/types").MerchantStats | null> {
  const { data } = await supabase
    .from("merchant_stats")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  return data as import("@/types/types").MerchantStats | null;
}

export async function getMerchantRank(
  type: "amount" | "count" = "amount",
  limit = 50
): Promise<import("@/types/types").MerchantRankItem[]> {
  const { data, error } = await supabase.rpc("get_merchant_rank", { p_type: type, p_limit: limit });
  if (error || !data) return [];
  return data as import("@/types/types").MerchantRankItem[];
}

export async function getMerchantRewardTransactions(
  userId: string,
  limit = 30,
  offset = 0
): Promise<import("@/types/types").Transaction[]> {
  const { data } = await supabase
    .from("transactions")
    .select("*")
    .eq("user_id", userId)
    .eq("type", "merchant_reward")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  return (data ?? []) as import("@/types/types").Transaction[];
}

// 查詢使用者是否為商戶（轉賬頁用）
export async function getUserMerchantInfo(userId: string): Promise<{ is_merchant: boolean; merchant_level: string; merchant_status: string } | null> {
  const { data } = await supabase
    .from("profiles")
    .select("is_merchant, merchant_level, merchant_status")
    .eq("id", userId)
    .maybeSingle();
  return data as { is_merchant: boolean; merchant_level: string; merchant_status: string } | null;
}

// 後臺：獲取商戶列表
export async function getAdminMerchantList(
  adminId: string,
  status?: string,
  level?: string,
  limit = 50,
  offset = 0
): Promise<any[]> {
  const { data, error } = await supabase.rpc("get_merchant_admin_list", {
    p_admin_id: adminId,
    p_status: status ?? null,
    p_level: level ?? null,
    p_limit: limit,
    p_offset: offset,
  });
  if (error || !data) return [];
  return data as any[];
}

// 後臺：封禁商戶
export async function adminFreezeMerchant(adminId: string, targetId: string, reason: string): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc("admin_freeze_merchant", {
    p_admin_id: adminId,
    p_target_id: targetId,
    p_reason: reason,
  });
  if (error) return { success: false, error: error.message };
  return data as { success: boolean; error?: string };
}

// 後臺：更新商戶等級（手動調整，同步更新 merchant_stats.last_level_up_at）
export async function adminUpdateMerchantLevel(adminId: string, targetId: string, newLevel: string): Promise<{ error?: string }> {
  const { data, error } = await supabase.rpc("admin_update_merchant_level", {
    p_admin_id: adminId,
    p_target_id: targetId,
    p_new_level: newLevel,
  });
  if (error) return { error: error.message };
  const result = data as { success: boolean; error?: string };
  if (!result?.success) return { error: result?.error ?? "操作失敗" };
  return {};
}

// 商戶資金池配置讀寫
export async function getMerchantPoolBalance(): Promise<number> {
  const { data } = await supabase
    .from("system_config")
    .select("config_val")
    .eq("config_key", "merchant_reward_pool_balance")
    .maybeSingle();
  return parseFloat(data?.config_val ?? "0");
}

export async function updateMerchantPoolBalance(newBalance: number): Promise<{ error?: string }> {
  const { error } = await supabase
    .from("system_config")
    .update({ config_val: String(newBalance) })
    .eq("config_key", "merchant_reward_pool_balance");
  return { error: error?.message };
}

// ── 商戶等級配置讀寫 ───────────────────────────────────────────

export type MerchantLevelConfigItem = {
  level: string;          // S1 ~ S4
  minCount: number;       // 晉升最低筆數
  minAmount: number;      // 晉升最低金額 SMT
  rewardRate: number;     // 收款獎勵比例（小數，如 0.04）
  withdrawFee: number;    // 提現手續費率（小數，如 0.01）
};

// S0 單獨讀取提現手續費（S0 無晉升條件和獎勵）
export type MerchantS0Config = { withdrawFee: number };

const LEVEL_KEYS = ['s1', 's2', 's3', 's4'] as const;

export async function getMerchantLevelConfigs(): Promise<{
  levels: MerchantLevelConfigItem[];
  s0WithdrawFee: number;
  dailyLimit: number;
}> {
  const keys = [
    'merchant_withdraw_fee_s0',
    'merchant_daily_reward_limit',
    ...LEVEL_KEYS.flatMap(lv => [
      `merchant_level_${lv}_min_count`,
      `merchant_level_${lv}_min_amount`,
      `merchant_level_${lv}_reward_rate`,
      `merchant_withdraw_fee_${lv}`,
    ]),
  ];
  const { data } = await supabase
    .from("system_config")
    .select("config_key, config_val")
    .in("config_key", keys);
  const map: Record<string, string> = {};
  (data ?? []).forEach((r: { config_key: string; config_val: string }) => { map[r.config_key] = r.config_val; });

  const get = (k: string, fallback: number) => parseFloat(map[k] ?? String(fallback)) || fallback;
  const DEFAULTS: Record<string, [number, number, number, number]> = {
    s1: [100, 20000, 0.01, 0.025],
    s2: [500, 50000, 0.02, 0.02],
    s3: [1000, 100000, 0.03, 0.015],
    s4: [3000, 300000, 0.04, 0.01],
  };

  const levels: MerchantLevelConfigItem[] = LEVEL_KEYS.map(lv => {
    const [dc, da, dr, dw] = DEFAULTS[lv];
    return {
      level: lv.toUpperCase(),
      minCount: get(`merchant_level_${lv}_min_count`, dc),
      minAmount: get(`merchant_level_${lv}_min_amount`, da),
      rewardRate: get(`merchant_level_${lv}_reward_rate`, dr),
      withdrawFee: get(`merchant_withdraw_fee_${lv}`, dw),
    };
  });

  return {
    levels,
    s0WithdrawFee: get('merchant_withdraw_fee_s0', 0.03),
    dailyLimit: get('merchant_daily_reward_limit', 500),
  };
}

export async function updateMerchantLevelConfig(updates: Record<string, string>): Promise<{ error?: string }> {
  for (const [key, val] of Object.entries(updates)) {
    const { error } = await supabase
      .from("system_config")
      .update({ config_val: val })
      .eq("config_key", key);
    if (error) return { error: error.message };
  }
  return {};
}

// ── 活動奖励配置讀寫 ──────────────────────────────────────────────
export async function getActivityRewardConfig(): Promise<{ enabled: boolean; amount: number }> {
  const { data } = await supabase
    .from("system_config")
    .select("config_key, config_val")
    .in("config_key", ["activity_reward_enabled", "activity_reward_amount"]);
  const map: Record<string, string> = {};
  (data ?? []).forEach((r: { config_key: string; config_val: string }) => {
    map[r.config_key] = r.config_val;
  });
  return {
    enabled: map["activity_reward_enabled"] === "true",
    amount:  parseFloat(map["activity_reward_amount"] ?? "0"),
  };
}

export async function updateActivityRewardConfig(
  enabled: boolean,
  amount: number
): Promise<{ error?: string }> {
  const updates: [string, string][] = [
    ["activity_reward_enabled", enabled ? "true" : "false"],
    ["activity_reward_amount",  String(amount)],
  ];
  for (const [key, val] of updates) {
    const { error } = await supabase
      .from("system_config")
      .update({ config_val: val })
      .eq("config_key", key);
    if (error) return { error: error.message };
  }
  return {};
}

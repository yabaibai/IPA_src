/* eslint-disable no-undef */
import { useState, useCallback, useEffect, useRef } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator, Modal, TextInput, useWindowDimensions, RefreshControl } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ArrowDownCircle, ArrowUpCircle, RefreshCw, Send, ArrowLeftRight, Zap, AlertCircle, ChevronLeft, ChevronRight, Gift, XCircle, TrendingUp, Receipt } from "lucide-react-native";
import * as Clipboard from "expo-clipboard";
import QRCode from "react-native-qrcode-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSession } from "@/ctx";
import {
  getWalletBalance, getTransactions, formatNumber, getLatestAntPrice,
  getUserMerchantInfo,
} from "@/db/api";
import { withTimeout } from "@/lib/asyncTool";
import { sharedGet } from "@/lib/requestDedup";
import { showToast } from "@/lib/toast";
import { supabase } from "@/client/supabase";
import { useTabData } from "@/db/tabData";
import type { WalletBalance, Transaction } from "@/types/types";
import { usePendingTransfers } from "@/hooks/usePendingTransfers";

// ─── 品牌風格 ──────────────────────────────────────────────────────────────────
const BODY_BG = require("../../../../assets/page-img/page_bg.webp");
const IMG_PAGE_BG = require("../../../../assets/page-img/page_bg.webp");
const IMG_BACK = require("../../../../assets/page-img/icon9.png");
// ─── 錢包卡片背景圖 ────────────────────────────────────────────────────────────
const IMG_BALANCE_BG  = require("../../../../assets/page-img/wallet_balance_bg.png");   // 余額卡片 987×536
const IMG_ACTION_BG   = require("../../../../assets/page-img/wallet_action_bg.png");    // 功能入口卡片 987×240
const IMG_TX_TAB_BG     = require("../../../../assets/page-img/wallet_tx_tab_bg.png");    // 交易記錄Tab外框 986×108
const IMG_TAB_ACTIVE    = require("../../../../assets/page-img/wallet_tab_active.png");   // Tab選中 230×82
const IMG_TAB_IDLE      = require("../../../../assets/page-img/wallet_tab_idle.png");     // Tab待機 230×82
const IMG_TX_LIST_TOP   = require("../../../../assets/page-img/wallet_list_top.png");    // 交易記錄列表外框-頂部 987×80
const IMG_TX_LIST_MID   = require("../../../../assets/page-img/wallet_list_mid.png");    // 交易記錄列表外框-中部拉伸 987×492
const IMG_TX_LIST_BOT   = require("../../../../assets/page-img/wallet_list_bot.png");    // 交易記錄列表外框-底部 987×80
const IMG_TX_ITEM_BG    = require("../../../../assets/page-img/wallet_daily_item_bg.png"); // 單條交易背景 951×191
// 交易詳情 style005 圖標
const IMG_TX_DETAIL_ICON = require("../../../../assets/page-img/icon28.png");
const IMG_TX_COPY_ICON   = require("../../../../assets/page-img/wosh_icon1.png");
const IMG_BTN_CONFIRM    = require("../../../../assets/page-img/mine_btn_confirm.png");
const IMG_BTN_CANCEL     = require("../../../../assets/page-img/mine_btn_cancel.png");

// 首頁 AreaSelector 服務節點彈窗風格資源（已遷移至獨立頁面）

// USDT 充值彈窗用戶上傳背景圖（直接使用提供的 URL）
const IMG_BTN_GENERATE = require("../../../../assets/page-img/generate_active.png");
const IMG_BTN_RECORD   = require("../../../../assets/page-img/view_records_active.png");
const IMG_CARD_FRAME   = require("../../../../assets/page-img/deposit_desc_frame.png");
const ICON_SERVER_UI   = require("../../../../assets/page-img/server_ui.png");
const ICON_STEP1_DEFAULT = require("../../../../assets/page-img/num1_idle.png");
const ICON_STEP1_ACTIVE  = require("../../../../assets/page-img/num1_active.png");
const ICON_STEP2_DEFAULT = require("../../../../assets/page-img/num2_idle.png");
const ICON_STEP2_ACTIVE  = require("../../../../assets/page-img/num2_active.png");
// 功能入口圖標
const ICON_RECHARGE = require("../../../../assets/page-img/wallet_icon_recharge.png");   // 充值 111×110
const ICON_WITHDRAW = require("../../../../assets/page-img/wallet_icon_withdraw.png");   // 提現 110×110
const ICON_TRANSFER = require("../../../../assets/page-img/wallet_icon_transfer.png");   // 轉賬 110×110
const ICON_QUICK    = require("../../../../assets/page-img/wallet_icon_quick.png");      // 快轉 111×110
const ICON_EXCHANGE = require("../../../../assets/page-img/wallet_icon_exchange.png");   // 兌換 111×110
const OG = "#FF5E1A";
const OG_MID = "rgba(237,124,69,0)";

function Bg1Card({ children, style, radius = 16 }: { children: React.ReactNode; style?: object; radius?: number }) {
  return (
    <LinearGradient
      colors={[OG, OG_MID, OG]}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={[{ borderRadius: radius, padding: 1, overflow: "hidden" }, style]}
    >
      <View style={{ backgroundColor: "#000", borderRadius: radius - 1, overflow: "hidden" }}>
        {children}
      </View>
    </LinearGradient>
  );
}

// style002 確認升級彈窗按鈕樣式（已遷移至獨立頁面）

// ─── 提現彈窗聚焦輸入框（對應 account-settings PasswordField 樣式）────
const PAGE_SIZE = 10;
const normalizeCurrency = (c: string) => c === "POINTS" ? "能量" : c;
// 篩選項：全部 / 按資產型別
const CURRENCY_FILTERS: { label: string; value: string | undefined }[] = [
  { label: "全部", value: undefined },
  { label: "SMT", value: "SMT" },
  { label: "USDT", value: "USDT" },
  { label: "能量", value: "POINTS" },
];

type ActionType = "deposit" | "withdraw" | null;

export default function WalletScreen() {
  const { session } = useSession();
  const userId = session?.user.id ?? "";
  const { width: windowWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const vw = Math.min(windowWidth, 375) / 100;
  // 彈窗內容區最大高度：螢幕高度 88%，最小留頂部安全點選區域
  const sheetMaxHeight = screenHeight * 0.88;
  const { pendingCount } = usePendingTransfers(userId);

  const [wallet, setWallet] = useState<WalletBalance | null>(null);
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [txTotal, setTxTotal] = useState(0);
  const [txPage, setTxPage] = useState(0);
  const [txCurrency, setTxCurrency] = useState<string | undefined>(undefined);
  const [txLoading, setTxLoading] = useState(false);
  const [txLoadError, setTxLoadError] = useState(false); // 區分「真無記錄」與「WAF/網絡截斷空返回」
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [actionType, setActionType] = useState<ActionType>(null);

  // 交易記錄詳情彈窗
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [txDetailCopied, setTxDetailCopied] = useState(false);

  // 快轉：當前SMT市價
  const [_antPrice, setAntPrice] = useState(0);
  // 當前使用者是否為活躍商戶（充值禁用提示）
  const [isActiveMerchant, setIsActiveMerchant] = useState(false);
  const [merchantDepositTip, setMerchantDepositTip] = useState(false);

  const loadSeqTxs = useRef(0);  // 交易記錄序號守衛（獨立）
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 載入交易記錄（分頁+篩選）
  const loadTxs = useCallback(async (page: number, currency: string | undefined, force = false, opts: { autoRetry?: boolean } = {}) => {
    if (!userId) return;
    const seq = ++loadSeqTxs.current;
    setTxLoading(true);
    setTxLoadError(false);
    console.log("[TXS_STATE] enter page=", page, "currency=", currency, "force=", force, "oldTxsLen=", txs.length);
    try {
      // 走共用去重層（unique，3 分鐘 TTL + 失敗退避重試），避免每次進 Tab 狂打 WAF；
      // force=true（用戶手動刷新）穿透緩存重拉；同 currency+page 複用，翻頁也緩存
      const _ta = Date.now();
      const { data, total } = await sharedGet(
        "txsList:" + (currency ?? "ALL") + ":" + page,
        () => getTransactions(userId, currency, PAGE_SIZE, page * PAGE_SIZE),
        { force, isEmpty: (r: any) => !r || !Array.isArray(r.data) || r.data.length === 0 }
      ).catch(() => ({ data: [] as any[], total: 0 }));
      const _tb = Date.now();
      const _hit = (_tb - _ta) < 80; // 命中缓存通常 <80ms 返回；冷拉则数百ms+
      const _empty = !data || data.length === 0;
      console.log("[TXS_STATE] back page=", page, "currency=", currency, "ms=", _tb - _ta, "cacheHit=", _hit, "dataLen=", data?.length, "isEmpty=", _empty, "willSet=", !_empty);
      console.log('[TXS_DBG] page', page, 'currency', currency, 'seq', seq, 'curSeq', loadSeqTxs.current, 'dataLen', data?.length, 'total', total);
      // 不再用 seq 守衛跳過 setTxs：避免並發觸發時緩存有值卻 state 永遠為空（用戶看到「一直為空」）
      // 重複 set 同一頁數據無害；切 Tab 卸載後 state 自然失效
      if (!data || data.length === 0) {
        // [A] 識別「疑似 WAF/網絡截斷空返回」：非緩存命中 + 無舊數據 + 耗時異常短(<150ms 像被截斷)
        //   → 不當作「真無記錄」，標記 txLoadError 引導用戶重試，且不污染緩存為 null 占位(sharedGet 仍會寫，但 UI 不顯示「暫無」)
        // [A] 識別「疑似 WAF/網絡截斷空返回」：冷拉(非緩存命中) + 無舊數據 + 返回空
        //   不依賴耗時判斷(WAF 可能慢速返回空數組)，只要冷拉首拉空即視為可疑失敗
        //   → 標記 txLoadError 引導用戶重試，且 [C] 自動補拉一次(繞過 WAF 窗口)
        const _suspectWaf = (!_hit && txs.length === 0);
        if (_suspectWaf) {
          console.log("[TXS_STATE] SUSPECT_WAF_EMPTY -> 標記加載失敗(冷拉空,非真無數據)");
          setTxLoadError(true);
          if (!force && opts.autoRetry !== false) {
            setTimeout(() => { if (loadSeqTxs.current === seq) loadTxs(0, currency, true, { autoRetry: false }); }, 1500);
          }
        } else {
          console.log("[TXS_STATE] EMPTY -> 顯示暫無記錄 (緩存命中空 或 確無數據)");
        }
        setTxLoading(false);
        return;
      }
      setTxs(data);
      setTxTotal(total);
      console.log("[TXS_STATE] SET txs ->", data.length, "條 (currency=", currency, ")");
    } catch (e: any) {
      console.warn("[Wallet] 交易記錄載入失敗:", e);
      setTxLoadError(true);
    } finally {
      setTxLoading(false);
    }
  }, [userId]);

  // ── 數據加載（統一引擎）──
  const fetchWallet = useCallback(async (force = false) => {
    try { await supabase.auth.getSession(); } catch { /* ignore */ }
    // 共用去重層：wallet/merchant 為共享池，僅登錄/手動刷新更新；force=true 穿透重拉
    let [w, merchantInfo] = await Promise.all([
      sharedGet("wallet", () => getWalletBalance(userId), { force, shared: true }),
      sharedGet("merchant", () => getUserMerchantInfo(userId), { force, shared: true }),
    ]);
    // 偶發 anon/競態返回 null：保留舊數據，延遲重試一次（根治切頁空列表）
    if (!w) {
      try { await supabase.auth.getSession(); } catch { /* ignore */ }
      [w, merchantInfo] = await Promise.all([
        sharedGet("wallet", () => getWalletBalance(userId), { force, shared: true }),
        sharedGet("merchant", () => getUserMerchantInfo(userId), { force, shared: true }),
      ]);
    }
    return { w, m: merchantInfo?.is_merchant === true && merchantInfo?.merchant_status === "active" };
  }, [userId]);

  const applyWallet = useCallback((d: any) => {
    const { w, m } = d;
    // null 不覆蓋有效緩存/state（FRD 4.2）；僅有效數據才 setState
    if (w) setWallet(w);
    setIsActiveMerchant(m);
  }, []);

  const { loadData, refresh, onEnter, onLeave } = useTabData({
    cacheKey: "wallet:" + userId,
    fetch: fetchWallet,
    apply: applyWallet,
    onError: () => setLoadError(true),
    onLoading: (b) => setLoading(b),
    onFrequent: () => showToast("刷新過於頻密，請稍後再試"),
    hasData: () => wallet != null,
    // w 為 null（異常競態）不寫緩存，沿用舊緩存（FRD 4.2）
    shouldCache: (d) => !!d.w,
  });

  useFocusEffect(useCallback(() => {
    if (userId) {
      onEnter();
      loadData();
      loadTxs(0, txCurrency, false, { autoRetry: true });
      setTxPage(0);
    }
    return () => { onLeave(); if (timerRef.current) clearInterval(timerRef.current); };
  }, [loadData, loadTxs, txCurrency, onEnter, onLeave, userId])); // eslint-disable-line react-hooks/exhaustive-deps
  // 說明：loadData/loadTxs 各用獨立 loadSeq ref，避免互相搶序號導致對方 set 被 skip（顯示0 的根因）

  // 登录后 session 异步建立：进入本页时若 userId 尚为空，首次 loadData 用空 userId 发请求 → 数据全空。
  // 监听 userId 由空变非空，session 就绪后自动重载，修复「登录后首次进本页 ID/数据为空」时序竞态。
  useEffect(() => {
    if (userId) {
      onEnter();
      loadData();
    }
  }, [userId]);

  // 切換篩選重置到第1頁
  const handleCurrencyFilter = (currency: string | undefined) => {
    setTxCurrency(currency);
    setTxPage(0);
    loadTxs(0, currency);
  };

  // 翻頁
  const handlePageChange = (newPage: number) => {
    setTxPage(newPage);
    loadTxs(newPage, txCurrency);
  };

  // 載入最新 SMT 市價（僅一次即可）
  useEffect(() => {
    (async () => {
      const p = await getLatestAntPrice();
      if (p) setAntPrice(p.close_price ?? 0);
    })();
  }, []);

  // 型別標籤：區分 SMT 和 POINTS 語義，以及快轉 vs 普通轉賬
  const getTxTypeLabel = (tx: Transaction): string => {
    const isFast = tx.sub_type === "fast";
    // POINTS 能量記錄
    if (tx.type === "transfer_out"    && tx.currency === "POINTS") return isFast ? "快轉耗能" : "轉賬耗能";
    if (tx.type === "transfer_cancel" && tx.currency === "POINTS") return "能量退回";
    if (tx.type === "transfer_in"     && tx.currency === "POINTS") return isFast ? "快轉獲贈" : "轉賬獲贈";
    if (isFast) {
      const fastLabels: Partial<Record<Transaction["type"], string>> = {
        transfer_out: "SMT快轉",
        transfer_in:  "SMT快轉收款",
      };
      return fastLabels[tx.type] ?? tx.type;
    }
    return ({
      p2p_buy: "P2P買入",
      p2p_sell: "P2P賣出",
      deposit: "充值",
      admin_recharge: "後臺充值",
      withdraw: "提現",
      upgrade: "算力池升級",
      rebirth: "重生",
      harvest: "每日領取",
      referral_reward: "推廣獎勵",
      promo_reward: "團隊獎勵",
      merchant_reward: "商戶獎勵",
      exchange: "兌換",
      transfer_in: "轉入",
      transfer_out: "轉出",
      transfer_cancel: "轉賬退回",
      transfer_locked: "轉出",
      transfer_arbitration: "轉出",
      arbitration_refunded: "轉賬退回",
    } as Record<string, string>)[tx.type] ?? tx.type;
  };

  const txColor: Record<string, string> = {
    harvest: "#22C55E",
    referral_reward: "#22C55E",
    promo_reward: "#A855F7",
    merchant_reward: "#A855F7",
    p2p_buy: "#22C55E",
    transfer_in: "#22C55E",
    deposit: "#E8520A",
    admin_recharge: "#E8520A",
    p2p_sell: "#F43F5E",
    withdraw: "#F43F5E",
    transfer_out: "#F43F5E",
    transfer_locked: "#F43F5E",
    transfer_arbitration: "#F43F5E",
    arbitration_refunded: "#22C55E",
    upgrade: "#F97316",
    exchange: "#EAB308",
    transfer_cancel: "#22C55E",
  };

  // 正負號判斷
  const txSign = (tx: Transaction): "+" | "-" | "" => {
    const pos: Transaction["type"][] = ["harvest", "p2p_buy", "deposit", "admin_recharge", "referral_reward", "promo_reward", "merchant_reward", "transfer_in", "transfer_cancel", "arbitration_refunded"];
    const neg: Transaction["type"][] = ["p2p_sell", "withdraw", "transfer_out", "transfer_locked", "transfer_arbitration"];
    if (pos.includes(tx.type)) return "+";
    if (neg.includes(tx.type)) return "-";
    return Number(tx.amount) >= 0 ? "+" : "-";
  };

  // 金額顏色：增加綠色，扣減紅色
  const txAmountColor = (tx: Transaction): string => {
    const sign = txSign(tx);
    if (sign === "+") return "#22C55E";
    if (sign === "-") return "#F43F5E";
    return Number(tx.amount) >= 0 ? "#22C55E" : "#F43F5E";
  };

  // session 尚未就緒（userId 為空）：顯示「用戶信息校驗中…」而非空白/全空數據
  if (!userId) {
    return (
      <View style={{ flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color="#E8520A" />
        <Text allowFontScaling={false} style={{ color: "#999", fontSize: 13, marginTop: 12 }}>用戶信息校驗中…</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center" }}>
        <Image source={IMG_PAGE_BG} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="cover" priority="high" cachePolicy="memory-disk" />
        <ActivityIndicator size="large" color="#E8520A" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <StatusBar style="light" />
      {/* 全屏背景圖 */}
      <Image
        source={IMG_PAGE_BG}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        contentFit="cover"
        contentPosition={{ top: 0, left: "50%" }}
        priority="high"
        cachePolicy="memory-disk"
      />
      <ScrollView contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => { setRefreshing(true); try { await Promise.all([loadData(true), loadTxs(0, txCurrency, true)]); } finally { setRefreshing(false); } }}
            colors={["#E8520A"]} tintColor={"#E8520A"}
          />
        }>
        {loadError && (
          <Pressable onPress={() => { loadData(true); loadTxs(0, txCurrency, true); }} style={{ backgroundColor: "#3A1A0A", paddingVertical: 10, marginHorizontal: 16, marginBottom: 8 }}>
            <Text style={{ color: "#FF8C42", fontSize: 13, textAlign: "center" }}>數據加載失敗，點擊重試</Text>
          </Pressable>
        )}
        {/* NavBar：對齊推廣明細頁 */}
        <View style={{ paddingHorizontal: 16, paddingTop: insets.top + 12, paddingBottom: 12, flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Pressable onPress={() => router.back()} className="active:opacity-70">
            <Image source={IMG_BACK} style={{ width: vw * 6, height: vw * 6 }} contentFit="contain" />
          </Pressable>
          <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 20, fontWeight: "800" }}>錢包</Text>
        </View>

        {/* 資產卡片 */}
        <View style={{ marginHorizontal: 16, borderRadius: 16, overflow: "hidden" }}>
          <Image source={IMG_BALANCE_BG} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="fill" />
          <View style={{ padding: 20 }}>
            <Text allowFontScaling={false} style={{ color: "#FFFFFF80", fontSize: 12, marginBottom: 4 }}>SMT餘額</Text>
            <Text allowFontScaling={false} style={{ color: "#FFFFFF", fontSize: 36, fontWeight: "700", fontFamily: "monospace" }}>
              {formatNumber(wallet?.ant_balance ?? 0)}
            </Text>
            <LinearGradient
              colors={["rgba(255,94,26,0)", "rgba(255,94,26,0.4)", "rgba(255,94,26,0)"]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={{ height: 1, marginVertical: 16 }}
            />
            <View style={{ flexDirection: "row", gap: 16 }}>
              {[
                { label: "能量", value: wallet?.points ?? 0 },
                { label: "USDT", value: wallet?.usdt_balance ?? 0 },
              ].map(({ label, value }) => (
                <View key={label} style={{ flex: 1, alignItems: "center" }}>
                  <Text allowFontScaling={false} style={{ color: "#FFFFFF80", fontSize: 12, marginBottom: 2 }}>{label}</Text>
                  <Text allowFontScaling={false} style={{ fontWeight: "700", color: "#FFFFFF", fontFamily: "monospace", fontSize: 14 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                    {formatNumber(value)}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* 功能入口 */}
        <View style={{ marginHorizontal: 16, marginTop: 12, borderRadius: 16, overflow: "hidden" }}>
          <Image source={IMG_ACTION_BG} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="fill" />
          <View style={{ flexDirection: "row", paddingHorizontal: 8, paddingVertical: 12 }}>
          {/* 充值 — 商戶展示禁用提示 */}
          <Pressable style={{ flex: 1, alignItems: "center", gap: 6 }} className="active:opacity-70"
            onPress={() => {
              if (isActiveMerchant) {
                setMerchantDepositTip(true);
                return;
              }
              router.push("/(app)/deposit-records" as any);
            }}>
            <View style={{ position: "relative", width: 44, height: 44 }}>
              <Image source={ICON_RECHARGE} style={{ width: 44, height: 44 }} contentFit="contain" />
            </View>
            <Text allowFontScaling={false} style={{ color: isActiveMerchant ? "#FFFFFF40" : "#FFFFFF", fontSize: 12, fontWeight: "600" }}>充值</Text>
          </Pressable>

          {/* 提現 */}
          <Pressable style={{ flex: 1, alignItems: "center", gap: 6 }} className="active:opacity-70"
            onPress={() => router.push("/(app)/withdraw-records" as any)}>
            <View style={{ position: "relative", width: 44, height: 44 }}>
              <Image source={ICON_WITHDRAW} style={{ width: 44, height: 44 }} contentFit="contain" />
            </View>
            <Text allowFontScaling={false} style={{ color: "#FFFFFF", fontSize: 12, fontWeight: "600" }}>提現</Text>
          </Pressable>

          {/* SMT轉賬 */}
          <Pressable style={{ flex: 1, alignItems: "center", gap: 6 }} className="active:opacity-70"
            onPress={() => router.push("/(app)/transfer" as any)}>
            <View style={{ position: "relative", width: 44, height: 44 }}>
              <Image source={ICON_TRANSFER} style={{ width: 44, height: 44 }} contentFit="contain" />
              {pendingCount > 0 && (
                <View style={{
                  position: "absolute", top: 0, right: 0,
                  minWidth: 15, height: 15, borderRadius: 8,
                  backgroundColor: "#F43F5E", paddingHorizontal: 3,
                  alignItems: "center", justifyContent: "center",
                }}>
                  <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 8, fontWeight: "800", lineHeight: 13 }}>
                    {pendingCount > 9 ? "9+" : pendingCount}
                  </Text>
                </View>
              )}
            </View>
            <Text allowFontScaling={false} style={{ color: "#FFFFFF", fontSize: 12, fontWeight: "600" }}>SMT轉賬</Text>
          </Pressable>

          {/* SMT快轉 */}
          <Pressable style={{ flex: 1, alignItems: "center", gap: 6 }} className="active:opacity-70"
            onPress={() => router.push("/(app)/smt-transfer" as any)}>
            <View style={{ position: "relative", width: 44, height: 44 }}>
              <Image source={ICON_QUICK} style={{ width: 44, height: 44 }} contentFit="contain" />
            </View>
            <Text allowFontScaling={false} style={{ color: "#FFFFFF", fontSize: 12, fontWeight: "600" }}>SMT快轉</Text>
          </Pressable>

          {/* 兌換 */}
          <Pressable style={{ flex: 1, alignItems: "center", gap: 6 }} className="active:opacity-70"
            onPress={() => router.push("/(app)/exchange" as any)}>
            <View style={{ position: "relative", width: 44, height: 44 }}>
              <Image source={ICON_EXCHANGE} style={{ width: 44, height: 44 }} contentFit="contain" />
            </View>
            <Text allowFontScaling={false} style={{ color: "#FFFFFF", fontSize: 12, fontWeight: "600" }}>兌換</Text>
          </Pressable>
          </View>
        </View>


        {/* 交易記錄 */}
        <View style={{ marginHorizontal: 16, marginTop: 16, marginBottom: 24 }}>
          {/* 標題行 */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12, paddingHorizontal: 4 }}>
            <Text allowFontScaling={false} style={{ color: "#FFFFFF", fontSize: 15, fontWeight: "600" }}>交易記錄</Text>
            <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 12 }} numberOfLines={1}>共 {txTotal} 條</Text>
          </View>

          {/* 資產篩選欄 */}
          <View style={{ marginBottom: 16, height: 48, overflow: "hidden", borderRadius: 12 }}>
            {/* 外框：深色底 + 橙色细描边 */}
            <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "#1a0e06", borderRadius: 12, borderWidth: 1, borderColor: "rgba(222,121,45,0.45)" }} />
            <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, paddingHorizontal: 6, paddingVertical: 6, flexDirection: "row", gap: 6 }}>
              {CURRENCY_FILTERS.map(({ label, value }) => {
                const active = txCurrency === value;
                return (
                  <Pressable
                    key={label}
                    onPress={() => handleCurrencyFilter(value)}
                    className="active:opacity-80"
                    style={{ flex: 1, position: "relative", borderRadius: 999, overflow: "hidden" }}
                  >
                    {/* 選中：橙色漸變；待機：透明無背景 */}
                    {active && (
                      <LinearGradient
                        colors={["#EB9426", "#C8571A", "#B84010"]}
                        start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
                        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 999 }}
                      />
                    )}
                    {/* 文字 */}
                    <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
                      <Text allowFontScaling={false} style={{ color: active ? "#fff" : "#FFFFFF60", fontSize: 13, fontWeight: active ? "700" : "400" }}>
                        {label}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* 記錄列表（外框切三塊拼接，頂底按比例自適應，中部拉伸） */}
          {txLoading ? (
            <View style={{ position: "relative" }}>
              <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 16, overflow: "hidden" }}>
                <Image source={IMG_TX_LIST_TOP} style={{ width: "100%", aspectRatio: 987 / 80 }} contentFit="cover" />
                <Image source={IMG_TX_LIST_MID} style={{ flex: 1, width: "100%" }} contentFit="fill" />
                <Image source={IMG_TX_LIST_BOT} style={{ width: "100%", aspectRatio: 987 / 80 }} contentFit="cover" />
              </View>
              <View style={{ paddingVertical: 48, alignItems: "center" }}>
                <ActivityIndicator size="small" color="#E8520A" />
              </View>
            </View>
          ) : txs.length === 0 ? (
            <View style={{ position: "relative" }}>
              <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 16, overflow: "hidden" }}>
                <Image source={IMG_TX_LIST_TOP} style={{ width: "100%", aspectRatio: 987 / 80 }} contentFit="cover" />
                <Image source={IMG_TX_LIST_MID} style={{ flex: 1, width: "100%" }} contentFit="fill" />
                <Image source={IMG_TX_LIST_BOT} style={{ width: "100%", aspectRatio: 987 / 80 }} contentFit="cover" />
              </View>
              <View style={{ paddingVertical: 48, alignItems: "center" }}>
                {txLoadError ? (
                  <Pressable onPress={() => loadTxs(0, txCurrency, true, { autoRetry: false })}>
                    <Text allowFontScaling={false} style={{ color: "#E8520A", fontSize: 14 }}>加載失敗，點擊重試</Text>
                  </Pressable>
                ) : (
                  <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 14 }}>暫無交易記錄</Text>
                )}
              </View>
            </View>
          ) : (
            <View style={{ position: "relative" }}>
              <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 16, overflow: "hidden" }}>
                <Image source={IMG_TX_LIST_TOP} style={{ width: "100%", aspectRatio: 987 / 80 }} contentFit="cover" />
                <Image source={IMG_TX_LIST_MID} style={{ flex: 1, width: "100%" }} contentFit="fill" />
                <Image source={IMG_TX_LIST_BOT} style={{ width: "100%", aspectRatio: 987 / 80 }} contentFit="cover" />
              </View>
              <View style={{ padding: 12 }}>
                {txs.filter(tx => tx.status !== "cancelled").map((tx, idx) => (
                  <View key={tx.id} style={{ position: "relative", marginBottom: 8 }}>
                    <Image source={IMG_TX_ITEM_BG} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="fill" />
                    <Pressable
                      style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14 }}
                      className="active:opacity-70"
                      onPress={() => { setTxDetailCopied(false); setSelectedTx(tx); }}>
                      {/* 左：型別標籤 + 描述 + 時間 */}
                      <View style={{ flex: 1, marginRight: 12 }}>
                        <Text allowFontScaling={false} style={{ color: "#FFFFFF", fontSize: 14, fontWeight: "500" }}>{getTxTypeLabel(tx)}</Text>
                        {tx.description ? (
                          <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                            {tx.description}
                          </Text>
                        ) : null}
                        <Text allowFontScaling={false} style={{ color: "#FFFFFF40", fontSize: 12, marginTop: 2 }}>
                          {new Date(tx.created_at).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" })}
                          {" "}
                          {new Date(tx.created_at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                          {" · "}
                          {tx.status === "completed" ? "已完成" : tx.status === "cancelled" ? "已取消" : "處理中"}
                        </Text>
                      </View>
                      {/* 右：金額 + 箭頭 */}
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 0, maxWidth: "45%" }}>
                        <Text allowFontScaling={false} style={{
                          color: txAmountColor(tx),
                          fontFamily: "monospace",
                          fontWeight: "700",
                          fontSize: 14,
                          flexShrink: 1,
                        }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                          {txSign(tx)}{txSign(tx) !== ""
                            ? Math.abs(Number(tx.amount)).toFixed(tx.currency === "USDT" ? 2 : 4)
                            : Number(tx.amount).toFixed(tx.currency === "USDT" ? 2 : 4)} {normalizeCurrency(tx.currency)}
                        </Text>
                        <ChevronRight size={14} color="#FFFFFF40" />
                      </View>
                    </Pressable>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* 翻頁控制元件 */}
          {txTotal > PAGE_SIZE && (
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12, paddingHorizontal: 4 }}>
              <Pressable
                onPress={() => handlePageChange(txPage - 1)}
                disabled={txPage === 0}
                className="active:opacity-70"
                style={{
                  flexDirection: "row", alignItems: "center", gap: 4,
                  paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
                  backgroundColor: "#FFFFFF10", borderWidth: 1,
                  borderColor: txPage === 0 ? "#FFFFFF10" : "#FFFFFF20",
                  opacity: txPage === 0 ? 0.4 : 1,
                }}
              >
                <ChevronLeft size={14} color="#FFFFFF80" />
                <Text allowFontScaling={false} style={{ color: "#FFFFFF80", fontSize: 13 }}>上一頁</Text>
              </Pressable>

              <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 12 }}>
                第 {txPage + 1} / {Math.ceil(txTotal / PAGE_SIZE)} 页
              </Text>

              <Pressable
                onPress={() => handlePageChange(txPage + 1)}
                disabled={(txPage + 1) * PAGE_SIZE >= txTotal}
                className="active:opacity-70"
                style={{
                  flexDirection: "row", alignItems: "center", gap: 4,
                  paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
                  backgroundColor: "#FFFFFF10", borderWidth: 1,
                  borderColor: (txPage + 1) * PAGE_SIZE >= txTotal ? "#FFFFFF10" : "#FFFFFF20",
                  opacity: (txPage + 1) * PAGE_SIZE >= txTotal ? 0.4 : 1,
                }}
              >
                <Text allowFontScaling={false} style={{ color: "#FFFFFF80", fontSize: 13 }}>下一頁</Text>
                <ChevronRight size={14} color="#FFFFFF80" />
              </Pressable>
            </View>
          )}
          {/* 底部佔位：為浮島選單留出空間 */}
          <View style={{ height: insets.bottom + 90 }} />
        </View>
      </ScrollView>

      {/* ══ 交易記錄詳情彈窗 ══ */}
      {selectedTx && (() => {
        const tx = selectedTx;
        // 型別圖示對映
        const TxIcon: Record<string, React.ReactElement> = {
          harvest:        <Zap size={28} color="#22C55E" />,
          p2p_buy:        <ArrowDownCircle size={28} color="#22C55E" />,
          deposit:        <ArrowDownCircle size={28} color="#E8520A" />,
          admin_recharge: <ArrowDownCircle size={28} color="#E8520A" />,
          referral_reward:<Gift size={28} color="#22C55E" />,
          promo_reward:   <Gift size={28} color="#A855F7" />,
          merchant_reward:<Gift size={28} color="#A855F7" />,
          transfer_in:    <ArrowDownCircle size={28} color="#22C55E" />,
          p2p_sell:       <ArrowUpCircle size={28} color="#F43F5E" />,
          withdraw:       <ArrowUpCircle size={28} color="#F43F5E" />,
          transfer_out:   <ArrowUpCircle size={28} color="#F43F5E" />,
          upgrade:        <TrendingUp size={28} color="#F97316" />,
          exchange:       <ArrowLeftRight size={28} color="#EAB308" />,
          transfer_cancel:<XCircle size={28} color="#22C55E" />,
        };
        // 狀態配置
        const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
          completed: { label: "已完成", color: "#22C55E", bg: "#22C55E15" },
          cancelled: { label: "已取消", color: "#6B7280", bg: "#6B728015" },
          pending:   { label: "處理中", color: "#EAB308", bg: "#EAB30815" },
          failed:    { label: "已失敗", color: "#F43F5E", bg: "#F43F5E15" },
          burned:    { label: "已銷燬", color: "#F97316", bg: "#F9731615" },
        };
        const statusCfg = statusConfig[tx.status] ?? { label: tx.status, color: "#94A3B8", bg: "#94A3B815" };
        const sign = txSign(tx);
        const amountColor = txAmountColor(tx);
        const fullDate = new Date(tx.created_at).toLocaleString("zh-CN", {
          year: "numeric", month: "2-digit", day: "2-digit",
          hour: "2-digit", minute: "2-digit", second: "2-digit",
        });

        const handleCopyId = async () => {
          await Clipboard.setStringAsync(tx.id);
          setTxDetailCopied(true);
          setTimeout(() => setTxDetailCopied(false), 2000);
        };

        const rows: { label: string; value: string; mono?: boolean; copyable?: boolean }[] = [
          { label: "交易時間", value: fullDate },

          ...(tx.description ? [{ label: "備註", value: tx.description }] : []),
          { label: "交易ID", value: tx.id, mono: true, copyable: true },
        ];

        return (
          <Modal visible={!!selectedTx} transparent animationType="slide">
            <View className="flex-1 justify-end" style={{ backgroundColor: "#000000BB" }}>
              <View className="rounded-t-3xl overflow-hidden"
                style={{ maxHeight: screenHeight * 0.7 }}>

                <ScrollView bounces={false} showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>

                  {/* 底層背景：wallet_list_top + wallet_list_mid（同交易記錄列表風格） */}
                  <View style={{ marginHorizontal: 16, position: "relative" }}>
                    {/* 頂部背景 */}
                    <Image source={IMG_TX_LIST_TOP} style={{ width: "100%", aspectRatio: 987 / 80 }} contentFit="cover" />
                    {/* 中部拉伸背景：內容置於此 */}
                    <View style={{ position: "relative" }}>
                      <Image source={IMG_TX_LIST_MID} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, width: undefined, height: undefined }} contentFit="fill" />
                      <View style={{ paddingHorizontal: 20, paddingVertical: 16 }}>

                        {/* 頂部圖示 + 金額 + 狀態（style005 UI） */}
                        <View style={{ alignItems: "center", paddingTop: 4, paddingBottom: 24 }}>
                          <Image source={IMG_TX_DETAIL_ICON} style={{ width: vw * 13.33, height: vw * 13.33 }} contentFit="contain" />
                          <Text allowFontScaling={false} style={{ color: "#fff", marginTop: 8, fontSize: 16 }}>
                            {getTxTypeLabel(tx)}
                          </Text>
                          <Text allowFontScaling={false}
                            style={{ color: amountColor, fontSize: 24, fontWeight: "700", marginTop: 4, marginBottom: 12, fontFamily: "monospace" }}
                            adjustsFontSizeToFit numberOfLines={1}>
                            {sign}{sign !== ""
                              ? `${Math.abs(Number(tx.amount)).toFixed(tx.currency === "USDT" ? 2 : 4)} ${normalizeCurrency(tx.currency)}`
                              : `${Number(tx.amount).toFixed(tx.currency === "USDT" ? 2 : 4)} ${normalizeCurrency(tx.currency)}`}
                          </Text>
                          <View style={{
                            flexDirection: "row", alignItems: "center", justifyContent: "center",
                            borderRadius: 999, borderWidth: 1, borderColor: statusCfg.color,
                            paddingHorizontal: 12, paddingVertical: 4, gap: 4,
                          }}>
                            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: statusCfg.color }} />
                            <Text allowFontScaling={false} style={{ color: statusCfg.color, fontSize: 12 }}>{statusCfg.label}</Text>
                          </View>
                        </View>

                        {/* style005 欄位列表 */}
                        <View style={{ gap: 0 }}>
                          {rows.map(({ label, value, mono, copyable }) => (
                            <View key={label} style={{ marginBottom: 16 }}>
                              <Text allowFontScaling={false} style={{ color: "rgba(255,255,255,0.4)", fontSize: 14, marginBottom: 8 }}>
                                {label}
                              </Text>
                              <View style={{
                                flexDirection: "row", alignItems: "center",
                                minHeight: 48, borderRadius: 8,
                                backgroundColor: "#000", borderWidth: 1, borderColor: "#E68331",
                                paddingHorizontal: 20, paddingVertical: 12, justifyContent: "space-between",
                              }}>
                                <Text allowFontScaling={false}
                                  style={{
                                    color: "#fff", fontSize: 16, flex: 1, lineHeight: 22,
                                    fontFamily: mono ? "monospace" : undefined,
                                  }}
                                  numberOfLines={copyable ? 1 : undefined}
                                  selectable={copyable}>
                                  {value}
                                </Text>
                                {copyable && (
                                  <Pressable onPress={handleCopyId} className="active:opacity-70" style={{ marginLeft: 8 }}>
                                    <Image source={IMG_TX_COPY_ICON} style={{ width: 14, height: 14 }} contentFit="contain" />
                                  </Pressable>
                                )}
                              </View>
                            </View>
                          ))}
                        </View>

                        {/* 關閉按鈕：style002 ReceiveDialog 按鈕樣式，寬 52% 居中 */}
                        <View style={{ flexDirection: "row", width: "52%", alignSelf: "center" }}>
                          <Pressable
                            onPress={() => setSelectedTx(null)}
                            className="active:opacity-80"
                            style={{ flex: 1, height: (windowWidth * 0.46) * (121 / 390), position: "relative" }}
                          >
                            <Image source={IMG_BTN_CONFIRM} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="fill" />
                            <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
                              <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>關閉</Text>
                            </View>
                          </Pressable>
                        </View>

                      </View>
                    </View>
                    {/* 底部背景 */}
                    <Image source={IMG_TX_LIST_BOT} style={{ width: "100%", aspectRatio: 987 / 80 }} contentFit="cover" />
                  </View>

                </ScrollView>
              </View>
            </View>
          </Modal>
        );
      })()}

      {/* ══ 商戶不可充值提示 ══ */}
      <Modal visible={merchantDepositTip} transparent animationType="fade">
        <Pressable
          style={{ flex: 1, backgroundColor: "#000000AA", alignItems: "center", justifyContent: "center" }}
          onPress={() => setMerchantDepositTip(false)}>
          <Pressable
            onPress={e => e.stopPropagation()}
            style={{
              backgroundColor: "#111", borderRadius: 20, borderWidth: 1, borderColor: "#E8520A40",
              padding: 28, marginHorizontal: 32, alignItems: "center", gap: 12,
            }}>
            <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: "#E8520A15", alignItems: "center", justifyContent: "center" }}>
              <ArrowDownCircle size={26} color="#E8520A80" />
            </View>
            <Text allowFontScaling={false} style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "700", textAlign: "center" }}>商戶賬號不支援充值</Text>
            <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 13, textAlign: "center", lineHeight: 20 }}>
              商户账号不支持充值操作
            </Text>
            <Pressable
              onPress={() => setMerchantDepositTip(false)}
              className="active:opacity-70"
              style={{ marginTop: 4, backgroundColor: "#E8520A", borderRadius: 12, paddingHorizontal: 32, paddingVertical: 10 }}>
              <Text allowFontScaling={false} style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>我知道了</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

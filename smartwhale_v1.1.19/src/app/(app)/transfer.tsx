/* eslint-disable no-undef */
import { useState, useCallback, useRef } from "react";
import {
  View, Text, ScrollView, Pressable, ActivityIndicator, TextInput, Modal, FlatList,
  KeyboardAvoidingView, StyleSheet,
} from "react-native";
import { useFocusEffect, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import {
  Send, ChevronLeft, ChevronRight, Clock, CheckCircle2, AlertCircle,
  ArrowDownUp, RefreshCw, User, Coins, BadgePercent, Lock, BellRing, ShieldCheck, Eye, EyeOff,
} from "lucide-react-native";
import { useSession } from "@/ctx";
import { supabase } from "@/client/supabase";
import {
  getWalletBalance, getPaymentMethods, createTransferOrder,
  cancelExpiredTransferOrders, getTransferOrders,
  getTransferFreezeStatus, getUserMerchantInfo, getProfile,
  verifyTradingPassword, simpleHash,
  type TransferOrder, type TransferFreezeStatus,
} from "@/db/api";
import type { WalletBalance, PaymentMethod } from "@/types/types";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { sharedGet } from "@/lib/requestDedup";

// ── 本地圖片資源（對齊推薦獎勵/提現頁面風格）
const BODY_BG        = require("../../../assets/page-img/page_bg.webp");
const IMG_ICON9      = require("../../../assets/page-img/icon9.png");
// 收款方式彈窗（對齊提現彈窗）
const IMG_MODAL_BG     = require("../../../assets/page-img/bg20.png");        // 彈窗全圖背景 340×480
const ICON_MODAL_CLOSE = require("../../../assets/page-img/icon12.png");      // 關閉圖示
const IMG_CARD_FRAME   = require("../../../assets/page-img/deposit_desc_frame.png");
// Tab 外框（對齊錢包交易記錄 Tab）
const IMG_TX_TAB_BG  = require("../../../assets/page-img/wallet_tx_tab_bg.png");   // Tab外框 986×108
// Tab 選項背景（用戶提供圖片）
const IMG_TAB_ACTIVE = require("../../../assets/page-img/dual_frame_active.png");  // 雙框選中
const IMG_TAB_IDLE   = require("../../../assets/page-img/dual_frame_idle.png");  // 雙框待機
// 卡片 & 列表（對齊錢包頁面）
const IMG_TX_ITEM_BG = require("../../../assets/page-img/wallet_daily_item_bg.png"); // 單條卡片背景 951×191
const IMG_LIST_TOP   = require("../../../assets/page-img/wallet_list_top.png");      // 列表外框頂 987×80
const IMG_LIST_MID   = require("../../../assets/page-img/wallet_list_mid.png");      // 列表外框中拉伸 987×492
const IMG_LIST_BOT   = require("../../../assets/page-img/wallet_list_bot.png");      // 列表外框底 987×80
// 發起轉賬按鈕
const IMG_BTN_CONFIRM = require("../../../assets/page-img/mine_btn_confirm.png");    // 確認按鈕 390×121
// 成功彈窗（對齊提現成功彈窗）
const IMG_DIALOG_BG   = require("../../../assets/page-img/mine_dialog_bg.png");      // 彈窗背景
const IMG_ICON30      = require("../../../assets/page-img/mine_icon30.png");         // 成功圖標
const MUTED_COLOR = "#999999";

// ── 聚焦輸入框（對齊提現彈窗 WdFocusInput 樣式）
const TR_FIELD_BG    = "rgba(0,0,0,0.5)";
const TR_BORDER      = "rgba(123,123,123,0.5)";
const TR_FOCUS_CLR   = "#DE792D";
const TR_MUTED       = "#999999";
function TrFocusInput({
  value, onChangeText, placeholder, secureTextEntry, keyboardType, autoCapitalize, suffix, inputStyle, maxLength,
}: {
  value: string; onChangeText: (v: string) => void; placeholder: string;
  secureTextEntry?: boolean; keyboardType?: "default" | "numeric" | "email-address" | "decimal-pad";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  suffix?: React.ReactNode; inputStyle?: object; maxLength?: number;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: TR_FIELD_BG,
      borderWidth: 1, borderColor: focused ? TR_FOCUS_CLR : TR_BORDER,
      borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12 }}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={TR_MUTED}
        underlineColorAndroid="transparent"
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize ?? "sentences"}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        maxLength={maxLength}
        style={[{ flex: 1, color: "#fff", fontSize: 14, padding: 0, margin: 0 },
          process.env.EXPO_OS === "web" ? { outlineWidth: 0, outlineStyle: "none" } as any : undefined,
          inputStyle]}
        allowFontScaling={false}
        autoCorrect={false}
        cursorColor="#fff"
      />
      {suffix ?? null}
    </View>
  );
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  pending_payment: { label: "等待付款", color: "#EAB308" },
  pending_confirm: { label: "等待確認", color: "#E8520A" },
  completed:       { label: "已完成",   color: "#22C55E" },
  cancelled:       { label: "已取消",   color: "#F43F5E" },
  arbitration:     { label: "仲裁中",   color: "#F43F5E" },
};

const ORDER_PAGE_SIZE = 10;

function OrderCard({ order, userId }: { order: TransferOrder; userId: string }) {
  const st = STATUS_LABEL[order.status] ?? { label: order.status, color: "#FFFFFF60" };
  const isSender = order.sender_id === userId;
  const counterpart = isSender ? order.receiver : order.sender;

  // 判斷是否為「需要我處理」的待處理訂單
  const isMyPending =
    (order.status === "pending_payment") ||
    (order.status === "pending_confirm") ||
    (order.status === "arbitration");

  // 行動提示文案（雙方均有提示，文案按角色區分）
  const actionHint =
    order.status === "pending_payment" && !isSender ? "需上傳付款憑證 · 點選處理" :
    order.status === "pending_payment" && isSender  ? "等待對方上傳付款憑證" :
    order.status === "pending_confirm" && isSender  ? "需確認已收款 · 點選處理" :
    order.status === "pending_confirm" && !isSender ? "等待對方確認收款" :
    order.status === "arbitration"                  ? "仲裁處理中 · 點選檢視" : null;

  return (
    <Pressable
      className="mb-3 rounded-xl px-4 py-3.5 active:opacity-80"
      style={{
        position: "relative",
        overflow: "hidden",
        borderRadius: 12,
        borderWidth: isMyPending ? 1.5 : 1,
        borderColor: isMyPending ? st.color : "#FFFFFF15",
      }}
      onPress={() => router.push(`/(app)/transfer-order-detail?id=${order.id}` as any)}
    >
      {/* 卡片背景圖（對齊錢包記錄卡片） */}
      <ExpoImage
        source={IMG_CARD_FRAME}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 12 }}
        contentFit="fill"
      />
      <View className="flex-row items-center justify-between mb-2">
        <View className="flex-row items-center gap-2">
          <Text allowFontScaling={false} style={{ color: isSender ? "#F43F5E" : "#22C55E", fontWeight: "700", fontSize: 13 }}>
            {isSender ? "轉出" : "收入"}
          </Text>
          <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 12 }}>
            {counterpart?.username ?? "未知"} ({counterpart?.referral_code ?? "—"})
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {isMyPending && (
            <BellRing size={13} color={st.color} />
          )}
          <View className="px-2 py-0.5 rounded-full" style={{ backgroundColor: st.color + "20" }}>
            <Text allowFontScaling={false} style={{ color: st.color, fontSize: 11, fontWeight: "600" }} numberOfLines={1}>{st.label}</Text>
          </View>
        </View>
      </View>
      <View className="flex-row items-center justify-between">
        <Text allowFontScaling={false} style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 18, fontFamily: "monospace" }}>
          {order.amount.toFixed(4)} SMT
        </Text>
        <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 12 }}>
          {new Date(order.created_at).toLocaleDateString("zh-CN")}
        </Text>
      </View>
      <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 12, marginTop: 4 }}>
        約定價 {order.price.toFixed(4)} ¥/SMT · 合計 {order.total_usdt.toFixed(2)} ¥
      </Text>
      {/* 待處理行動提示條 */}
      {actionHint && (
        <View style={{
          marginTop: 8, paddingHorizontal: 10, paddingVertical: 6,
          borderRadius: 8, backgroundColor: st.color + "15",
          flexDirection: "row", alignItems: "center", gap: 6,
        }}>
          <BellRing size={12} color={st.color} />
          <Text allowFontScaling={false} style={{ color: st.color, fontSize: 12, fontWeight: "700", flex: 1 }}>
            {actionHint}
          </Text>
          <ChevronRight size={12} color={st.color} />
        </View>
      )}
    </Pressable>
  );
}

export default function TransferScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  // 源頭修復：進入頁面先校驗 userId 是否就緒
  const userId = session?.user.id ?? "";

  const [tab, setTab] = useState<"create" | "orders">("create");
  const [wallet, setWallet] = useState<WalletBalance | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [orders, setOrders] = useState<TransferOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [freezeStatus, setFreezeStatus] = useState<TransferFreezeStatus | null>(null);
  // 訂單分頁
  const [orderPage, setOrderPage] = useState(1);

  // 表單
  const [receiverUserId, setReceiverUserId] = useState("");
  const [amount, setAmount] = useState("");
  const [price, setPrice] = useState("");
  const [selectedPmId, setSelectedPmId] = useState<string | null>(null);
  const [remark, setRemark] = useState("");
  const [pmPickerVisible, setPmPickerVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [successOrderId, setSuccessOrderId] = useState<string | null>(null);
  // 同步鎖：防止 setState 非同步延遲期間重複點選穿透
  const submittingRef = useRef(false);

  // 交易密碼
  const [tradePwd, setTradePwd] = useState("");
  const [showTradePwd, setShowTradePwd] = useState(false);
  const [tradeVerifying, setTradeVerifying] = useState(false);

  // 當前使用者是否為商戶（決定手續費）
  const [isSenderMerchant, setIsSenderMerchant] = useState(false);
  const [minTransferAmount, setMinTransferAmount] = useState(5);
  // 當前使用者是否有效（有效賬戶才能發起轉賬）
  const [senderValid, setSenderValid] = useState(false);

  // 接收人暱稱自動查詢
  const [receiverInfo, setReceiverInfo] = useState<{ id: string; username: string | null; referral_code: string | null; matchType?: string } | null>(null);
  const [receiverIsMerchant, setReceiverIsMerchant] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);

  const loadData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    await cancelExpiredTransferOrders();
    // wallet/profile 走共用 sharedGet 缓存（与其他页共享，秒显）；merchant 与钱包页共用；其余为转账私有数据
    const [w, pms, ords, freeze, selfMerchant, profile] = await Promise.all([
      sharedGet("wallet", () => getWalletBalance(userId), { shared: true }).catch(() => null),
      getPaymentMethods(userId),
      getTransferOrders(userId),
      getTransferFreezeStatus(userId),
      sharedGet("merchant", () => getUserMerchantInfo(userId), { shared: true }).catch(() => null),
      sharedGet("profile", () => getProfile(userId), { shared: true }).catch(() => null),
    ]);
    setWallet(w);
    setPaymentMethods(pms);
    setOrders(ords);
    setFreezeStatus(freeze);
    setIsSenderMerchant(selfMerchant?.is_merchant === true && selfMerchant?.merchant_status === "active");
    setSenderValid(profile?.is_valid === true);
    // 讀取最低轉賬金額
    const { data: minCfg } = await supabase
      .from("system_config").select("config_val").eq("config_key", "transfer_min_amount").maybeSingle();
    const minVal = parseFloat(minCfg?.config_val ?? "5");
    if (!isNaN(minVal) && minVal > 0) setMinTransferAmount(minVal);
    // PM 初始化獨立處理，不寫入 loadData 依賴項
    setSelectedPmId((prev) => {
      if (prev) return prev;
      if (pms.length > 0) {
        const def = pms.find((p) => p.is_default) ?? pms[0];
        return def.id;
      }
      return prev;
    });
    setLoading(false);
  }, [userId]); // 去掉 selectedPmId，避免 loadData 引用無限變更

  useFocusEffect(useCallback(() => {
    loadData();
    setError("");
  }, [loadData, userId]));

  const antBalance = wallet?.ant_balance ?? 0;
  const currentPoints = wallet?.points ?? 0;
  const amtNum = parseFloat(amount);
  const priceNum = parseFloat(price);
  const validCalc = !isNaN(amtNum) && !isNaN(priceNum) && amtNum > 0 && priceNum >= 0;
  const totalUsdt = validCalc ? amtNum * priceNum : 0;
  // 商戶傳送方0手續費，普通使用者3%
  const feeRate = isSenderMerchant ? 0 : 0.03;
  const feeAc = validCalc ? parseFloat((amtNum * feeRate).toFixed(4)) : 0;
  // 能量 = 轉賬金額 + 手續費（同等數量）
  const feeAcPoints = parseFloat(feeAc.toFixed(4));  // 手續費能量 = round(fee,4)
  const pointsCost = validCalc ? parseFloat((amtNum + feeAc).toFixed(4)) : 0;  // 能量支持4位小数
  const totalPoints = pointsCost;
  const selectedPm = paymentMethods.find((p) => p.id === selectedPmId);

  // 是否有未完成訂單（作為轉出人，用於禁止重複發起）
  const hasPendingOrder = orders.some(
    (o) => o.sender_id === userId && (o.status === "pending_payment" || o.status === "pending_confirm")
  );

  // 我需要處理的訂單數（Tab 紅點計數）：雙方均計入所有活躍訂單
  const myPendingCount = orders.filter((o) =>
    (o.status === "pending_payment" && (o.sender_id === userId || o.receiver_id === userId)) ||
    (o.status === "pending_confirm" && (o.sender_id === userId || o.receiver_id === userId)) ||
    (o.status === "arbitration"     && (o.sender_id === userId || o.receiver_id === userId))
  ).length;

  // 訂單分頁計算
  const orderTotalPages = Math.max(1, Math.ceil(orders.length / ORDER_PAGE_SIZE));
  const pagedOrders = orders.slice((orderPage - 1) * ORDER_PAGE_SIZE, orderPage * ORDER_PAGE_SIZE);
  const isFrozen = freezeStatus?.frozen ?? false;
  const todayCancelCount = freezeStatus?.today_cancel_count ?? 0;

  // ── 接收人驗證（僅支援手機號 / 郵箱；用戶點擊「驗證」按鈕才發起，間隔 10s）
  const [receiverStatus, setReceiverStatus] = useState<"idle" | "not_found" | "error">("idle"); // 僅點擊驗證後有意義
  const [verifyCooldown, setVerifyCooldown] = useState(0); // 剩餘冷卻秒數（>0 時按鈕禁用）
  const isCompletePhone = (v: string) => /^1\d{10}$/.test(v);
  const isEmail = (v: string) => /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(v);
  const startVerifyCooldown = () => {
    setVerifyCooldown(10);
    let n = 10;
    const t = setInterval(() => {
      n -= 1;
      if (n <= 0) { clearInterval(t); setVerifyCooldown(0); } else setVerifyCooldown(n);
    }, 1000);
  };
  const handleVerifyReceiver = async () => {
    const val = receiverUserId.trim();
    if (!isCompletePhone(val) && !isEmail(val)) {
      setReceiverInfo(null); setReceiverIsMerchant(false);
      setReceiverStatus("not_found");
      setError("請輸入完整 11 位手機號或合法郵箱");
      return;
    }
    if (verifyCooldown > 0) return;
    setLookingUp(true);
    setReceiverInfo(null); setReceiverIsMerchant(false);
    setReceiverStatus("idle");
    startVerifyCooldown(); // 不論成功失敗都進入 10s 冷卻，避免連點打 WAF
    // 直接調 RPC 區分三種結果：① 異常(WAF/網路錯) ② 查無此人(found=false) ③ 成功(found=true)
    let data: any = null;
    let isError = false;
    const doRpc = async () => {
      const r = await supabase.rpc("lookup_user_safe", { p_input: val });
      if (r.error || !r.data) { isError = !!r.error; return null; }
      if (r.data.found === false) return "NOT_FOUND";
      return r.data;
    };
    const res = await doRpc();
    if (res === null && isError) {
      for (let i = 0; i < 2 && res === null && isError; i++) {
        await new Promise((rr) => setTimeout(rr, 2000 * (i + 1)));
        const r2 = await supabase.rpc("lookup_user_safe", { p_input: val });
        isError = !!r2.error;
        if (r2.error || !r2.data) continue;
        data = r2.data.found === false ? "NOT_FOUND" : r2.data;
        break;
      }
    } else {
      data = res;
    }
    setLookingUp(false);
    if (data === "NOT_FOUND") {
      setReceiverInfo(null); setReceiverIsMerchant(false);
      setReceiverStatus("not_found");
      setError("未找到對應使用者，請檢查輸入");
    } else if (data && data.found === true) {
      const info = data as { id: string; username: string | null; referral_code: string | null; matchType?: string };
      setReceiverInfo(info);
      setReceiverStatus("idle");
      setError("");
      // 查詢接收人是否為商戶（保持原邏輯：商戶互轉攔截）
      try {
        const mInfo = await getUserMerchantInfo(info.id);
        setReceiverIsMerchant(mInfo?.is_merchant === true && mInfo?.merchant_status === "active");
      } catch { setReceiverIsMerchant(false); }
    } else {
      setReceiverInfo(null); setReceiverIsMerchant(false);
      setReceiverStatus("error");
      setError("系統繁忙，請 10 秒後重試");
    }
  };

  const handleSubmit = async () => {
    setError("");
    if (!receiverUserId.trim()) { setError("請輸入接收人手機號或郵箱"); return; }
    if (!receiverInfo) { setError("未找到該使用者，請確認輸入是否正確"); return; }
    // 商戶互轉攔截
    if (isSenderMerchant && receiverIsMerchant) { setError("商戶賬號之間不可相互轉賬"); return; }
    // 發起方必須為有效賬戶
    if (!senderValid) { setError("您的賬戶當前無效，無法發起轉賬（需算力池激活、等級≥2級且3天內有領取）"); return; }
    if (!amount || isNaN(amtNum) || amtNum <= 0) { setError("請輸入有效的轉出數量"); return; }
    if (amtNum < minTransferAmount) { setError(`每筆轉賬最低 ${minTransferAmount} SMT`); return; }
    if (amtNum > antBalance) { setError(`SMT餘額不足，當前 ${antBalance.toFixed(4)} SMT`); return; }
    if (!price || isNaN(priceNum) || priceNum < 0) { setError("請輸入有效的單價"); return; }
    if (validCalc && totalPoints > currentPoints) { setError("能量不足，請先前往獲取能量"); return; }
    // ── 交易密碼校驗 ──
    if (!tradePwd.trim()) { setError("請輸入交易密碼以確認操作"); return; }
    setTradeVerifying(true);
    const pwdOk = await verifyTradingPassword(userId, simpleHash(tradePwd.trim()));
    setTradeVerifying(false);
    if (!pwdOk) { setError("交易密碼錯誤，請重新輸入"); setTradePwd(""); return; }

    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    const res = await createTransferOrder(
      userId, receiverUserId.trim(), amtNum, priceNum, selectedPmId, remark.trim(),
      receiverInfo.id  // 已透過 lookupUserById 解析好的 UUID，跳過函式內二次查詢
    );
    submittingRef.current = false;
    setSubmitting(false);

    if (res.error) { setError(res.error); return; }

    // 顯示成功卡片，2 秒後自動切換至訂單記錄 Tab（與提現成功彈窗樣式一致）
    setSuccessOrderId(res.data!.orderId);
    setReceiverUserId(""); setAmount(""); setPrice(""); setRemark(""); setReceiverInfo(null);
    setTradePwd(""); setShowTradePwd(false);
    setOrderPage(1);
    loadData(); // 不 await，後臺靜默重新整理
    // 2 秒後自動關閉彈窗並切換至訂單記錄 Tab
    setTimeout(() => { setSuccessOrderId(null); setTab("orders"); }, 2000);
  };

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
        <ExpoImage source={BODY_BG} style={StyleSheet.absoluteFillObject} contentFit="cover" priority="high" cachePolicy="memory-disk" />
        <ActivityIndicator size="large" color="#E8520A" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <StatusBar style="light" />
      <ExpoImage source={BODY_BG} style={StyleSheet.absoluteFillObject} contentFit="cover" priority="high" cachePolicy="memory-disk" />

      {/* ── 發起成功提示卡片（與提現成功彈窗樣式一致，停留 2 秒後自動切換訂單記錄 Tab） */}
      {successOrderId && (
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", paddingHorizontal: 32, zIndex: 50 }}>
          <View style={{ width: "100%", position: "relative", backgroundColor: "#000" }}>
            <ExpoImage source={IMG_DIALOG_BG} style={StyleSheet.absoluteFillObject} contentFit="fill" />
            <View style={{ paddingHorizontal: 20, paddingTop: 28, paddingBottom: 24, alignItems: "center" }}>
              <ExpoImage source={IMG_ICON30} style={{ width: 52, height: 52 }} contentFit="contain" />
              <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 20, fontWeight: "800", marginTop: 8 }}>
                轉賬訂單已建立
              </Text>
              <Text allowFontScaling={false} style={{ color: MUTED_COLOR, fontSize: 12, marginVertical: 8, textAlign: "center", lineHeight: 18 }}>
                等待對方付款後確認收款，SMT 將自動到賬
              </Text>
              <View style={{ flexDirection: "row", width: "52%" }}>
                <Pressable
                  className="active:opacity-80"
                  onPress={() => { setSuccessOrderId(null); setTab("orders"); }}
                  style={{ flex: 1, aspectRatio: 390 / 121, position: "relative" }}
                >
                  <ExpoImage source={IMG_BTN_CONFIRM} style={StyleSheet.absoluteFillObject} contentFit="fill" />
                  <View style={[StyleSheet.absoluteFillObject, { alignItems: "center", justifyContent: "center" }]}>
                    <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>好的</Text>
                  </View>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* 頂部導航（對齊提現記錄頁面） */}
      <View style={{ paddingTop: insets.top + 16, paddingBottom: 16, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Pressable onPress={() => router.back()} className="active:opacity-70">
          <ExpoImage source={IMG_ICON9} style={{ width: 24, height: 24 }} contentFit="contain" />
        </Pressable>
        <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 20, fontWeight: "800", flex: 1 }}>SMT轉賬</Text>
        <Pressable onPress={loadData} className="active:opacity-70">
          <RefreshCw size={18} color="#FFFFFF40" />
        </Pressable>
      </View>

      {/* Tab切換 */}
      <View style={{ marginHorizontal: 16, marginBottom: 12, position: "relative", height: 48, overflow: "hidden", borderRadius: 12 }}>
        {/* 外框：深色底 + 橙色细描边 */}
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "#1a0e06", borderRadius: 12, borderWidth: 1, borderColor: "rgba(222,121,45,0.45)" }} />
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, paddingHorizontal: 6, paddingVertical: 6, flexDirection: "row", gap: 6 }}>
          {(["create", "orders"] as const).map((t) => {
            const active = tab === t;
            return (
              <Pressable
                key={t}
                onPress={() => { setTab(t); if (t === "orders") loadData(); setOrderPage(1); }}
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
                <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 }}>
                  <Text allowFontScaling={false} style={{ color: active ? "#fff" : "#FFFFFF60", fontWeight: active ? "700" : "400", fontSize: 13 }}>
                    {t === "create" ? "發起轉賬" : "我的訂單"}
                  </Text>
                  {t === "orders" && myPendingCount > 0 && (
                    <View style={{ minWidth: 16, height: 16, borderRadius: 8, backgroundColor: "#F43F5E", paddingHorizontal: 3, alignItems: "center", justifyContent: "center" }}>
                      <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 9, fontWeight: "800", lineHeight: 12 }}>
                        {myPendingCount > 9 ? "9+" : myPendingCount}
                      </Text>
                    </View>
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>

      {tab === "create" ? (
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        >
          {/* 可用餘額（對齊錢包單條卡片背景） */}
          <View style={{ marginHorizontal: 16, marginBottom: 12, position: "relative" }}>
            <ExpoImage source={IMG_TX_ITEM_BG} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 12 }} contentFit="fill" />
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14 }}>
              <Text allowFontScaling={false} style={{ color: "#FFFFFF", fontSize: 14 }}>可用 SMT 餘額</Text>
              <Text allowFontScaling={false} style={{ color: "#E8520A", fontWeight: "700", fontSize: 18, fontFamily: "monospace" }}>
                {antBalance.toFixed(4)} SMT
              </Text>
            </View>
          </View>

          {/* 賬戶凍結橫幅 */}
          {isFrozen && (
            <View className="mx-4 mb-4 rounded-xl px-4 py-3 gap-1.5"
              style={{ backgroundColor: "#F43F5E15", borderWidth: 1, borderColor: "#F43F5E40" }}>
              <View className="flex-row items-center gap-2">
                <Lock size={15} color="#F43F5E" />
                <Text allowFontScaling={false} style={{ color: "#F43F5E", fontWeight: "700", fontSize: 14 }}>轉賬功能已凍結</Text>
              </View>
              <Text allowFontScaling={false} style={{ color: "#F43F5E", fontSize: 12, opacity: 0.8 }}>
                解凍時間：{freezeStatus?.freeze_until}
              </Text>
              <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 11 }}>
                {freezeStatus?.reason ?? "當日取消次數達上限，系統自動凍結 24 小時"}
              </Text>
            </View>
          )}

          {/* 未完成訂單攔截提示 */}
          {!isFrozen && hasPendingOrder && (
            <View className="mx-4 mb-4 rounded-xl px-4 py-3 gap-1.5"
              style={{ backgroundColor: "#EAB30815", borderWidth: 1, borderColor: "#EAB30840" }}>
              <View className="flex-row items-center gap-2">
                <AlertCircle size={15} color="#EAB308" />
                <Text allowFontScaling={false} style={{ color: "#EAB308", fontWeight: "700", fontSize: 14 }}>存在未完成訂單</Text>
              </View>
              <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 12 }}>
                請先處理進行中的轉賬訂單，完成或取消後才能發起新訂單。
              </Text>
              <Pressable
                className="mt-1 self-start px-3 py-1 rounded-lg active:opacity-70"
                style={{ backgroundColor: "#EAB30820", borderWidth: 1, borderColor: "#EAB30850" }}
                onPress={() => setTab("orders")}
              >
                <Text allowFontScaling={false} style={{ color: "#EAB308", fontSize: 12, fontWeight: "600" }}>檢視訂單</Text>
              </Pressable>
            </View>
          )}

          {/* 今日取消次數警告（未凍結但已有 ≥3 次） */}
          {!isFrozen && todayCancelCount >= 3 && (
            <View className="mx-4 mb-4 rounded-xl px-4 py-2.5 flex-row items-center gap-2"
              style={{ backgroundColor: "#F9731615", borderWidth: 1, borderColor: "#F9731640" }}>
              <AlertCircle size={13} color="#F97316" />
              <Text allowFontScaling={false} style={{ color: "#F97316", fontSize: 12, flex: 1 }}>
                今日已取消 {todayCancelCount}/5 次，超過 5 次將凍結轉賬功能 24 小時
              </Text>
            </View>
          )}


          {/* 表單（凍結或有未完成訂單時禁用） — 全部欄位併入三圖拼接外框 */}
          <View style={{ marginHorizontal: 16, opacity: isFrozen || hasPendingOrder ? 0.5 : 1 }}
            pointerEvents={isFrozen || hasPendingOrder ? "none" : "auto"}
          >
            {/* 三圖拼接外框：包含所有表單欄位 */}
            <View style={{ position: "relative" }}>
              <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 16, overflow: "hidden" }}>
                <ExpoImage source={IMG_LIST_TOP} style={{ width: "100%", aspectRatio: 987 / 80 }} contentFit="cover" />
                <ExpoImage source={IMG_LIST_MID} style={{ flex: 1, width: "100%" }} contentFit="fill" />
                <ExpoImage source={IMG_LIST_BOT} style={{ width: "100%", aspectRatio: 987 / 80 }} contentFit="cover" />
              </View>
              <View style={{ padding: 16, gap: 16 }}>

                {/* ── 接收人 ── */}
                <View>
                  <Text allowFontScaling={false} style={{ color: "#FFFFFF", fontSize: 14, marginBottom: 8 }}>接收人</Text>
                  <TrFocusInput
                    value={receiverUserId}
                    onChangeText={(v) => { setReceiverUserId(v); setError(""); setSuccessOrderId(null); setReceiverInfo(null); setReceiverIsMerchant(false); setReceiverStatus("idle"); }}
                    placeholder="手機號或郵箱"
                    autoCapitalize="none"
                  />
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 6 }}>
                    <View style={{ flexDirection: "row", gap: 12, paddingHorizontal: 4 }}>
                      {(["手機號", "郵箱"] as const).map((tag) => (
                        <View key={tag} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                          <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: "#FFFFFF25" }} />
                          <Text allowFontScaling={false} style={{ color: "#FFFFFF35", fontSize: 11 }}>{tag}</Text>
                        </View>
                      ))}
                    </View>
                    <Pressable
                      disabled={verifyCooldown > 0 || lookingUp}
                      onPress={handleVerifyReceiver}
                      style={{ backgroundColor: verifyCooldown > 0 || lookingUp ? "#FFFFFF15" : "#E8520A", borderRadius: 8, paddingVertical: 8, paddingHorizontal: 16, opacity: verifyCooldown > 0 || lookingUp ? 0.5 : 1 }}
                    >
                      <Text allowFontScaling={false} style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "600" }}>
                        {verifyCooldown > 0 ? `驗證(${verifyCooldown}s)` : "驗證"}
                      </Text>
                    </Pressable>
                  </View>
                  {lookingUp && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8, paddingHorizontal: 4 }}>
                      <ActivityIndicator size="small" color="#FFFFFF40" />
                      <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 12 }}>識別中...</Text>
                    </View>
                  )}
                  {!lookingUp && receiverUserId.trim().length >= 2 && receiverInfo && (
                    <View style={{ marginTop: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: "#22C55E10", borderWidth: 1, borderColor: "#22C55E30", gap: 4 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <User size={13} color="#22C55E" />
                        <Text allowFontScaling={false} style={{ color: "#22C55E", fontSize: 13, fontWeight: "700" }}>
                          {receiverInfo.username ?? "未命名使用者"}
                        </Text>
                        {receiverInfo.referral_code ? (
                          <Text allowFontScaling={false} style={{ color: "#FFFFFF50", fontSize: 12 }}>#{receiverInfo.referral_code}</Text>
                        ) : null}
                        {receiverIsMerchant && (
                          <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, backgroundColor: "#22C55E20", borderWidth: 1, borderColor: "#22C55E40" }}>
                            <Text allowFontScaling={false} style={{ color: "#22C55E", fontSize: 10, fontWeight: "700" }}>🏪 商戶</Text>
                          </View>
                        )}
                      </View>
                      <Text allowFontScaling={false} style={{ color: "#FFFFFF35", fontSize: 11 }}>
                        透過{receiverInfo.matchType === "phone" ? "手機號" : "郵箱"}識別
                      </Text>
                      {isSenderMerchant && receiverIsMerchant && (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
                          <AlertCircle size={13} color="#F43F5E" />
                          <Text allowFontScaling={false} style={{ color: "#F43F5E", fontSize: 12 }}>商戶賬號之間不可相互轉賬</Text>
                        </View>
                      )}
                    </View>
                  )}
                  {!lookingUp && receiverStatus === "not_found" && (
                    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: 8, paddingHorizontal: 4, flexWrap: "wrap" }}>
                      <AlertCircle size={13} color="#F43F5E" style={{ marginTop: 1 }} />
                      <Text allowFontScaling={false} style={{ color: "#F43F5E", fontSize: 12, flex: 1, flexWrap: "wrap" }}>未找到對應使用者，請檢查輸入</Text>
                    </View>
                  )}
                </View>

                {/* 分隔線 */}
                <View style={{ height: 1, backgroundColor: "#FFFFFF12", marginHorizontal: -4 }} />

                {/* ── 轉出數量 ── */}
                <View>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <Text allowFontScaling={false} style={{ color: "#FFFFFF", fontSize: 14 }}>轉出數量（SMT）</Text>
                    <Pressable onPress={() => setAmount(antBalance.toFixed(4))} className="active:opacity-70">
                      <Text allowFontScaling={false} style={{ color: "#E8520A", fontSize: 12 }}>全部</Text>
                    </Pressable>
                  </View>
                  <TrFocusInput
                    value={amount}
                    onChangeText={(v) => { setAmount(v); setError(""); setSuccessOrderId(null); }}
                    placeholder="0.0000"
                    keyboardType="decimal-pad"
                  />
                </View>

                {/* ── 雙方約定價格 ── */}
                <View>
                  <Text allowFontScaling={false} style={{ color: "#FFFFFF", fontSize: 14, marginBottom: 8 }}>雙方約定價格（¥ / SMT）</Text>
                  <TrFocusInput
                    value={price}
                    onChangeText={(v) => { setPrice(v); setError(""); setSuccessOrderId(null); }}
                    placeholder="0.0000"
                    keyboardType="decimal-pad"
                  />
                </View>

                {/* ── 彙總資訊（總價/能量/手續費） ── */}
                {validCalc && (
                  <View style={{ borderRadius: 10, overflow: "hidden", borderWidth: 1, borderColor: "#E8520A30" }}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 11, backgroundColor: "#E8520A10" }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <ArrowDownUp size={13} color="#E8520A" />
                        <Text allowFontScaling={false} style={{ color: "#FFFFFF", fontSize: 13 }}>預計總價</Text>
                      </View>
                      <Text allowFontScaling={false} style={{ color: "#E8520A", fontWeight: "700", fontSize: 15, fontFamily: "monospace" }}>¥ {totalUsdt.toFixed(2)}</Text>
                    </View>
                    <View style={{ height: 1, backgroundColor: "#E8520A20" }} />
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 11, backgroundColor: "#EAB30808" }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Coins size={13} color="#EAB308" />
                        <Text allowFontScaling={false} style={{ color: "#FFFFFF", fontSize: 13 }}>當前能量</Text>
                      </View>
                      <Text allowFontScaling={false} style={{ color: "#EAB308", fontWeight: "700", fontFamily: "monospace" }}>{currentPoints.toLocaleString()}</Text>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 11, backgroundColor: "#EAB30808" }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Coins size={13} color="#F97316" />
                        <Text allowFontScaling={false} style={{ color: "#FFFFFF", fontSize: 13 }}>扣除能量</Text>
                      </View>
                      <Text allowFontScaling={false} style={{ color: "#F97316", fontWeight: "700", fontFamily: "monospace" }}>-{totalPoints.toLocaleString()}</Text>
                    </View>
                    {totalPoints > currentPoints && (
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 9, backgroundColor: "#F43F5E15", borderTopWidth: 1, borderColor: "#F43F5E30" }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
                          <AlertCircle size={13} color="#F43F5E" />
                          <Text allowFontScaling={false} style={{ color: "#F43F5E", fontSize: 12, flex: 1 }}>
                            能量不足，還需 {(totalPoints - currentPoints).toLocaleString()} 能量
                          </Text>
                        </View>
                        <Pressable
                          style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: "#F43F5E20", borderWidth: 1, borderColor: "#F43F5E50" }}
                          className="active:opacity-70"
                          onPress={() => router.push("/(app)/(tabs)/pool" as any)}
                        >
                          <Text allowFontScaling={false} style={{ color: "#F43F5E", fontSize: 11, fontWeight: "600" }}>去獲取</Text>
                        </Pressable>
                      </View>
                    )}
                    <View style={{ height: 1, backgroundColor: "#E8520A20" }} />
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 11, backgroundColor: "#F43F5E08" }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <BadgePercent size={13} color={isSenderMerchant ? "#22C55E" : "#F43F5E"} />
                        <Text allowFontScaling={false} style={{ color: "#FFFFFF", fontSize: 13 }}>手續費</Text>
                        <Text allowFontScaling={false} style={{ color: "#FFFFFF40", fontSize: 10 }}>{isSenderMerchant ? "（商戶免手續費）" : "（3%）"}</Text>
                      </View>
                      {isSenderMerchant
                        ? <Text allowFontScaling={false} style={{ color: "#22C55E", fontWeight: "700", fontFamily: "monospace" }}>免費</Text>
                        : (
                          <View style={{ alignItems: "flex-end" }}>
                            <Text allowFontScaling={false} style={{ color: "#F43F5E", fontWeight: "700", fontFamily: "monospace" }}>-{feeAc.toFixed(4)} SMT</Text>
                            <Text allowFontScaling={false} style={{ color: "#F43F5E", fontWeight: "700", fontFamily: "monospace" }}>-{feeAcPoints.toFixed(4)} 能量</Text>
                          </View>
                        )}
                    </View>
                    <View style={{ paddingHorizontal: 14, paddingVertical: 8, backgroundColor: "rgba(0,0,0,0.3)" }}>
                      <Text allowFontScaling={false} style={{ color: "#FFFFFF40", fontSize: 11, textAlign: "right" }}>
                        {isSenderMerchant
                          ? `實際扣除 ${amtNum.toFixed(4)} SMT（商戶0手續費）`
                          : `實際扣除 ${(amtNum + feeAc).toFixed(4)} SMT（含手續費）`}
                      </Text>
                    </View>
                  </View>
                )}

                {/* ── 收款方式 ── */}
                <View>
                  <Text allowFontScaling={false} style={{ color: "#FFFFFF", fontSize: 14, marginBottom: 8 }}>收款方式</Text>
                  {paymentMethods.length === 0 ? (
                    <Pressable
                      style={{ paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10, backgroundColor: "rgba(0,0,0,0.4)", borderWidth: 1, borderColor: "#EAB30840", flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
                      className="active:opacity-70"
                      onPress={() => router.push("/(app)/payment-methods" as any)}
                    >
                      <Text allowFontScaling={false} style={{ color: "#EAB308", fontSize: 13 }}>未設定收款方式，點選新增</Text>
                      <ChevronRight size={16} color="#EAB308" />
                    </Pressable>
                  ) : (
                    <Pressable
                      style={{ paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10, backgroundColor: "rgba(0,0,0,0.4)", borderWidth: 1, borderColor: "#FFFFFF20", flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
                      className="active:opacity-70"
                      onPress={() => setPmPickerVisible(true)}
                    >
                      {selectedPm ? (
                        <View>
                          <Text allowFontScaling={false} style={{ color: "#FFFFFF", fontWeight: "600", fontSize: 14 }} numberOfLines={1}>{selectedPm.type}</Text>
                          <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 12, marginTop: 2 }}>{selectedPm.account_name} · {selectedPm.account_no}</Text>
                        </View>
                      ) : (
                        <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 14 }}>選擇收款方式</Text>
                      )}
                      <ChevronRight size={16} color="#FFFFFF40" />
                    </Pressable>
                  )}
                </View>

                {/* ── 備註 ── */}
                <View>
                  <Text allowFontScaling={false} style={{ color: "#FFFFFF", fontSize: 14, marginBottom: 8 }}>備註（選填）</Text>
                  <TrFocusInput
                    value={remark}
                    onChangeText={(v) => setRemark(v.replace(/[<>'";\\\u200B-\u200D\uFEFF]/g, ""))}
                    placeholder="新增備註資訊..."
                    maxLength={200}
                  />
                </View>

                {/* 分隔線 */}
                <View style={{ height: 1, backgroundColor: "#FFFFFF12", marginHorizontal: -4 }} />

                {/* ── 交易密碼 ── */}
                <View>
                  <Text allowFontScaling={false} style={{ color: "#FFFFFF", fontSize: 14, marginBottom: 8 }}>交易密碼</Text>
                  <TrFocusInput
                    value={tradePwd}
                    onChangeText={(v) => { setTradePwd(v); setError(""); }}
                    placeholder="請輸入交易密碼"
                    secureTextEntry={!showTradePwd}
                    maxLength={18}
                    suffix={
                      <Pressable onPress={() => setShowTradePwd(!showTradePwd)} className="active:opacity-70 pl-2 py-1">
                        {showTradePwd ? <EyeOff size={18} color="#FFFFFF40" /> : <Eye size={18} color="#FFFFFF40" />}
                      </Pressable>
                    }
                  />
                  <Text allowFontScaling={false} style={{ color: "#FFFFFF40", fontSize: 11, marginTop: 6 }}>
                    發起轉賬需驗證交易密碼，以確保賬戶安全
                  </Text>
                </View>

                {error ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <AlertCircle size={14} color="#F43F5E" />
                    <Text allowFontScaling={false} style={{ color: "#F43F5E", fontSize: 14, flex: 1 }}>{error}</Text>
                  </View>
                ) : null}

              </View>
            </View>
          </View>

          {/* 訂單有效期說明（對齊單條卡片背景） */}
          <View style={{ marginHorizontal: 16, marginTop: 10, position: "relative" }}>
            <ExpoImage source={IMG_TX_ITEM_BG} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 12 }} contentFit="fill" />
            <View style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <Clock size={13} color="#EAB308" />
                <Text allowFontScaling={false} style={{ color: "#EAB308", fontSize: 12, fontWeight: "600" }}>訂單有效期 30 分鐘</Text>
              </View>
              <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 12, lineHeight: 20 }}>
                · SMT將立即鎖定，訂單超時未付款自動解鎖退回{"\n"}
                · 接收人付款後上傳憑證，您確認後SMT到賬{"\n"}
                · 如有爭議可申請仲裁，由管理員處理
              </Text>
            </View>
          </View>

          {/* 發起轉賬按鈕（mine_btn_confirm 圖片背景） */}
          <View style={{ marginHorizontal: 16, marginTop: 12, marginBottom: 24 }}>
            <Pressable
              className="active:opacity-70"
              style={{
                position: "relative", borderRadius: 12, overflow: "hidden",
                opacity: submitting || tradeVerifying || isFrozen || hasPendingOrder ? 0.5 : 1,
              }}
              onPress={handleSubmit}
              disabled={submitting || tradeVerifying || isFrozen || hasPendingOrder}
            >
              <ExpoImage source={IMG_BTN_CONFIRM} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 12 }} contentFit="fill" />
              <View style={{ paddingVertical: 16, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 }}>
                {submitting ? <ActivityIndicator color="#fff" /> : (
                  <>
                    <Send size={18} color="#fff" />
                    <Text allowFontScaling={false} style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>
                      {isFrozen ? "轉賬已凍結" : hasPendingOrder ? "有未完成訂單" : "發起轉賬"}
                    </Text>
                  </>
                )}
              </View>
            </Pressable>
          </View>
        </ScrollView>
      ) : (
        <View style={{ flex: 1, marginHorizontal: 16, marginBottom: insets.bottom + 16 }}>
          <View style={{ flex: 1, position: "relative" }}>
            <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 16, overflow: "hidden" }}>
              <ExpoImage source={IMG_LIST_TOP} style={{ width: "100%", aspectRatio: 987 / 80 }} contentFit="cover" />
              <ExpoImage source={IMG_LIST_MID} style={{ flex: 1, width: "100%" }} contentFit="fill" />
              <ExpoImage source={IMG_LIST_BOT} style={{ width: "100%", aspectRatio: 987 / 80 }} contentFit="cover" />
            </View>
            <FlatList
              data={pagedOrders}
              keyExtractor={(o) => o.id}
              contentInsetAdjustmentBehavior="automatic"
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 16, paddingBottom: 16 }}
              ListEmptyComponent={
                <View className="items-center py-16 gap-3">
                  <Text allowFontScaling={false} style={{ fontSize: 40 }}>📋</Text>
                  <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 14 }}>暫無轉賬訂單</Text>
                </View>
              }
              renderItem={({ item }) => <OrderCard order={item} userId={userId} />}
              ListFooterComponent={
                orderTotalPages > 1 ? (
                  /* 翻頁控制元件（對齊錢包頁面分頁樣式） */
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12, paddingHorizontal: 4 }}>
                    <Pressable
                      onPress={() => setOrderPage((p) => Math.max(1, p - 1))}
                      disabled={orderPage <= 1}
                      className="active:opacity-70"
                      style={{
                        flexDirection: "row", alignItems: "center", gap: 4,
                        paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
                        backgroundColor: "#FFFFFF10", borderWidth: 1,
                        borderColor: orderPage <= 1 ? "#FFFFFF10" : "#FFFFFF20",
                        opacity: orderPage <= 1 ? 0.4 : 1,
                      }}
                    >
                      <ChevronLeft size={14} color="#FFFFFF80" />
                      <Text allowFontScaling={false} style={{ color: "#FFFFFF80", fontSize: 13 }}>上一頁</Text>
                    </Pressable>

                    <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 12 }}>
                      第 {orderPage} / {orderTotalPages} 頁
                    </Text>

                    <Pressable
                      onPress={() => setOrderPage((p) => Math.min(orderTotalPages, p + 1))}
                      disabled={orderPage >= orderTotalPages}
                      className="active:opacity-70"
                      style={{
                        flexDirection: "row", alignItems: "center", gap: 4,
                        paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
                        backgroundColor: "#FFFFFF10", borderWidth: 1,
                        borderColor: orderPage >= orderTotalPages ? "#FFFFFF10" : "#FFFFFF20",
                        opacity: orderPage >= orderTotalPages ? 0.4 : 1,
                      }}
                    >
                      <Text allowFontScaling={false} style={{ color: "#FFFFFF80", fontSize: 13 }}>下一頁</Text>
                      <ChevronRight size={14} color="#FFFFFF80" />
                    </Pressable>
                  </View>
                ) : (
                  orders.length > 0 ? (
                    <Text allowFontScaling={false} style={{ color: "#FFFFFF30", fontSize: 11, textAlign: "center", paddingVertical: 12 }}>共 {orders.length} 條記錄</Text>
                  ) : null
                )
              }
            />
          </View>
        </View>
      )}

      {/* 收款方式選擇彈窗（對齊提現彈窗風格：IMG_MODAL_BG + 96%寬居中，遮罩 0.6） */}
      <Modal visible={pmPickerVisible} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: "#00000099", alignItems: "center", justifyContent: "center" }}>
          <View style={{ width: "96%", position: "relative", backgroundColor: "#000", borderRadius: 16, overflow: "hidden" }}>
            {/* 彈窗全圖背景 */}
            <ExpoImage source={IMG_MODAL_BG} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 16 }} contentFit="fill" />
            {/* 內容區 */}
            <View style={{ padding: 20, paddingTop: 18 }}>
              {/* 標題列 */}
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                <Text allowFontScaling={false} style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 17, flex: 1, textAlign: "center" }}>選擇收款方式</Text>
                <Pressable onPress={() => setPmPickerVisible(false)} className="active:opacity-70"
                  style={{ position: "absolute", right: 0 }}>
                  <ExpoImage source={ICON_MODAL_CLOSE} style={{ width: 28, height: 28 }} contentFit="contain" />
                </Pressable>
              </View>
              {/* 收款方式列表 */}
              {paymentMethods.map((pm) => (
                <Pressable key={pm.id}
                  className="active:opacity-75"
                  style={{ position: "relative", marginBottom: 10, borderRadius: 12, overflow: "hidden" }}
                  onPress={() => { setSelectedPmId(pm.id); setPmPickerVisible(false); }}
                >
                  {/* 卡片背景 */}
                  <ExpoImage source={IMG_CARD_FRAME} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 12 }} contentFit="fill" />
                  {selectedPmId === pm.id && (
                    <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 12, borderWidth: 1.5, borderColor: "#E8520A80", backgroundColor: "#E8520A10" }} />
                  )}
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 13 }}>
                    <View style={{ flex: 1 }}>
                      <Text allowFontScaling={false} style={{ color: "#FFFFFF", fontWeight: "600", fontSize: 14 }}>{pm.type}</Text>
                      <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 12, marginTop: 2 }}>
                        {pm.account_name} · {pm.account_no}
                      </Text>
                    </View>
                    {selectedPmId === pm.id
                      ? <CheckCircle2 size={18} color="#E8520A" />
                      : <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: "#FFFFFF30" }} />
                    }
                  </View>
                </Pressable>
              ))}
              {paymentMethods.length === 0 && (
                <View style={{ alignItems: "center", paddingVertical: 24, gap: 8 }}>
                  <Text allowFontScaling={false} style={{ color: "#FFFFFF40", fontSize: 14 }}>尚未設定收款方式</Text>
                  <Pressable
                    style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: "#E8520A20", borderWidth: 1, borderColor: "#E8520A50" }}
                    className="active:opacity-70"
                    onPress={() => { setPmPickerVisible(false); router.push("/(app)/payment-methods" as any); }}
                  >
                    <Text allowFontScaling={false} style={{ color: "#E8520A", fontSize: 13, fontWeight: "600" }}>前往新增</Text>
                  </Pressable>
                </View>
              )}
              {/* 底部間距 */}
              <View style={{ height: insets.bottom > 0 ? insets.bottom : 4 }} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

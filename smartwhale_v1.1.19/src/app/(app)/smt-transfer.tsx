/* eslint-disable no-undef */
import { useState, useCallback, useRef } from "react";
import {
  View, Text, ScrollView, Pressable, ActivityIndicator,
  StyleSheet, TextInput, KeyboardAvoidingView,
} from "react-native";
import { useFocusEffect, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Image as ExpoImage } from "expo-image";
import { User2, AlertCircle, Coins } from "lucide-react-native";
import { useSession } from "@/ctx";
import {
  getWalletBalance, transferAnt,
  verifyTradingPassword, simpleHash,
  getUserMerchantInfo, getProfile,
} from "@/db/api";
import { supabase } from "@/client/supabase";
import type { WalletBalance } from "@/types/types";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { sharedGet } from "@/lib/requestDedup";

// ── 本地圖片資源
const BODY_BG        = require("../../../assets/page-img/page_bg.webp");
const IMG_ICON9      = require("../../../assets/page-img/icon9.png");
const IMG_MODAL_BG    = require("../../../assets/page-img/bg20.png");
const IMG_DIALOG_BG   = require("../../../assets/page-img/mine_dialog_bg.png");
const IMG_ICON30      = require("../../../assets/page-img/mine_icon30.png");
const IMG_BTN_CONFIRM = require("../../../assets/page-img/mine_btn_confirm.png");
const IMG_CARD_FRAME  = require("../../../assets/page-img/deposit_desc_frame.png");
const IMG_BTN_GENERATE = require("../../../assets/page-img/generate_active.png");

const MUTED_COLOR = "#999999";

const WD_FIELD_BG  = "rgba(0,0,0,0.5)";
const WD_BORDER    = "rgba(123,123,123,0.5)";
const WD_FOCUS_CLR = "#DE792D";
const WD_MUTED     = "#999999";

function WdInput({
  value, onChangeText, placeholder, secureTextEntry, keyboardType, autoCapitalize, suffix, inputStyle,
}: {
  value: string; onChangeText: (v: string) => void; placeholder: string;
  secureTextEntry?: boolean; keyboardType?: "default" | "numeric" | "email-address";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  suffix?: React.ReactNode; inputStyle?: object;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: WD_FIELD_BG,
      borderWidth: 1, borderColor: focused ? WD_FOCUS_CLR : WD_BORDER,
      borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12 }}>
      <TextInput
        value={value} onChangeText={onChangeText} placeholder={placeholder}
        placeholderTextColor={WD_MUTED} underlineColorAndroid="transparent"
        secureTextEntry={secureTextEntry} keyboardType={keyboardType}
        autoCapitalize={autoCapitalize ?? "sentences"}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        style={[{ flex: 1, color: "#fff", fontSize: 12, padding: 0, margin: 0 },
          process.env.EXPO_OS === "web" ? { outlineWidth: 0, outlineStyle: "none" } as any : undefined,
          inputStyle]}
        allowFontScaling={false} autoCorrect={false} selectionColor="transparent" cursorColor="#fff"
      />
      {suffix ?? null}
    </View>
  );
}

export default function SmtTransferScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  // 源頭修復：進入頁面先校驗 userId 是否就緒
  const userId = session?.user.id ?? "";

  // ── 錢包與配置
  const [wallet, setWallet] = useState<WalletBalance | null>(null);
  const [fastTransferFeeRate, setFastTransferFeeRate] = useState(0);
  const [isActiveMerchant, setIsActiveMerchant] = useState(false);
  const [minTransferAmount, setMinTransferAmount] = useState(5);
  const [senderValid, setSenderValid] = useState(false);
  const [loading, setLoading] = useState(true);

  // ── 快轉表單狀態
  const [qtReceiverId, setQtReceiverId] = useState("");
  const [qtAmount, setQtAmount] = useState("");
  const [qtPassword, setQtPassword] = useState("");
  const [qtMsg, setQtMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [qtSuccess, setQtSuccess] = useState(false);
  const [qtSuccessInfo, setQtSuccessInfo] = useState<{ amount: number; spent: number } | null>(null);
  const [qtLoading, setQtLoading] = useState(false);
  const [qtReceiverInfo, setQtReceiverInfo] = useState<{ id: string; username: string | null; referral_code: string | null; matchType?: string } | null>(null);
  const [qtReceiverStatus, setQtReceiverStatus] = useState<"idle" | "not_found" | "error">("idle"); // 僅在點擊驗證後才有意義：idle=未提交/查詢中，not_found=查無此人，error=異常
  const [qtLookingUp, setQtLookingUp] = useState(false);
  const qtLoadingRef = useRef(false);

  const loadData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    // wallet/profile 走共用 sharedGet 缓存（与其他页共享，秒显）；merchant 与钱包页共用
    const [w, merchantInfo, profile] = await Promise.all([
      sharedGet("wallet", () => getWalletBalance(userId), { shared: true }).catch(() => null),
      sharedGet("merchant", () => getUserMerchantInfo(userId), { shared: true }).catch(() => null),
      sharedGet("profile", () => getProfile(userId), { shared: true }).catch(() => null),
    ]);
    setWallet(w);
    setIsActiveMerchant(
      merchantInfo?.is_merchant === true && merchantInfo?.merchant_status === "active"
    );
    setSenderValid(profile?.is_valid === true);
    const { data: feeConfigs } = await supabase
      .from("system_config")
      .select("config_key, config_val")
      .in("config_key", ["fast_transfer_fee_rate", "transfer_min_amount"]);
    if (feeConfigs) {
      for (const cfg of feeConfigs) {
        const v = parseFloat(cfg.config_val);
        if (!isNaN(v)) {
          if (cfg.config_key === "fast_transfer_fee_rate")  setFastTransferFeeRate(v);
          if (cfg.config_key === "transfer_min_amount" && v > 0) setMinTransferAmount(v);
        }
      }
    }
    setLoading(false);
  }, [userId]);

  useFocusEffect(useCallback(() => {
    loadData();
  }, [loadData, userId]));

  // ── 接收人驗證（僅支援手機號 / 郵箱；用戶點擊「驗證」按鈕才發起，間隔 10s）
  const [qtVerifyCooldown, setQtVerifyCooldown] = useState(0); // 剩餘冷卻秒數（>0 時按鈕禁用）
  const isCompletePhone = (v: string) => /^1\d{10}$/.test(v);
  const isEmail = (v: string) => /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(v);
  const startVerifyCooldown = () => {
    setQtVerifyCooldown(10);
    let n = 10;
    const t = setInterval(() => {
      n -= 1;
      if (n <= 0) { clearInterval(t); setQtVerifyCooldown(0); } else setQtVerifyCooldown(n);
    }, 1000);
  };
  const handleVerifyReceiver = async () => {
    const val = qtReceiverId.trim();
    // 格式校驗：僅手機號（11位）或合法郵箱
    if (!isCompletePhone(val) && !isEmail(val)) {
      setQtReceiverInfo(null);
      setQtMsg({ text: "請輸入完整 11 位手機號或合法郵箱", ok: false });
      return;
    }
    if (qtVerifyCooldown > 0) return; // 10s 冷卻中，禁止重複發起
    setQtLookingUp(true);
    setQtReceiverInfo(null);
    setQtReceiverStatus("idle");
    startVerifyCooldown(); // 不論成功失敗都進入 10s 冷卻，避免連點打 WAF
    // 直接調 RPC 並區分三種結果：① 異常(WAF/網路錯) ② 查無此人(found=false) ③ 成功(found=true)
    // 不進緩存；異常時原地重試 2 次（間隔 2s/4s），WAF 冷卻後通常成功
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
    setQtLookingUp(false);
    if (data === "NOT_FOUND") {
      // ② 查無此人：明確提示
      setQtReceiverInfo(null);
      setQtReceiverStatus("not_found");
      setQtMsg({ text: "未找到對應使用者，請檢查輸入", ok: false });
    } else if (data && data.found === true) {
      // ③ 成功
      setQtReceiverInfo(data);
      setQtReceiverStatus("idle");
      setQtMsg(null);
    } else {
      // ① 異常（WAF 攔截 / 網路錯）：提示系統繁忙
      setQtReceiverInfo(null);
      setQtReceiverStatus("error");
      setQtMsg({ text: "系統繁忙，請 10 秒後重試", ok: false });
    }
  };

  // ── 能量消耗與手續費預估
  const qtAmt = parseFloat(qtAmount);
  const qtEffectiveFeeRate = isActiveMerchant ? 0 : fastTransferFeeRate;
  // 能量支持4位小数（与後端 round(amount,4) / round(fee,4) 保持一致，避免 Math.floor 截断）
  const qtPointsCost = !isNaN(qtAmt) && qtAmt > 0 ? parseFloat(qtAmt.toFixed(4)) : 0;
  const qtFee = !isNaN(qtAmt) && qtAmt > 0 ? parseFloat((qtAmt * qtEffectiveFeeRate).toFixed(6)) : 0;
  const qtFeePoints = parseFloat(qtFee.toFixed(4));  // 手续费能量 = round(fee,4)
  const qtTotalPoints = !isNaN(qtAmt) && qtAmt > 0 ? parseFloat((qtAmt + qtFee).toFixed(4)) : 0;  // 与後端 round(amount+fee,4) 一致
  const qtActualDeduct = !isNaN(qtAmt) && qtAmt > 0 ? parseFloat((qtAmt + qtFee).toFixed(6)) : 0;
  const qtPointsInsufficient = qtTotalPoints > 0 && (wallet?.points ?? 0) < qtTotalPoints;
  const qtBalanceInsufficient = qtActualDeduct > 0 && (wallet?.ant_balance ?? 0) < qtActualDeduct;

  const handleQuickTransfer = async () => {
    if (qtLoadingRef.current) return;
    if (!senderValid) { setQtMsg({ text: "您的賬戶當前無效，無法發起轉賬（需算力池激活、等級≥2級且3天內有領取）", ok: false }); return; }
    if (!qtReceiverId.trim()) { setQtMsg({ text: "請輸入接收人ID", ok: false }); return; }
    if (!qtReceiverInfo) { setQtMsg({ text: "未找到該使用者，請確認ID是否正確", ok: false }); return; }
    const amt = parseFloat(qtAmount);
    if (!qtAmount || isNaN(amt) || amt <= 0) { setQtMsg({ text: "請輸入有效轉出數量", ok: false }); return; }
    if (amt < minTransferAmount) { setQtMsg({ text: `每筆快轉最低 ${minTransferAmount} SMT`, ok: false }); return; }
    if (!qtPassword.trim()) { setQtMsg({ text: "請輸入交易密碼", ok: false }); return; }
    const feeAmt = parseFloat((amt * qtEffectiveFeeRate).toFixed(6));
    const totalDeduct = parseFloat((amt + feeAmt).toFixed(6));
    if ((wallet?.ant_balance ?? 0) < totalDeduct) {
      setQtMsg({ text: `SMT餘額不足（含手續費共需 ${totalDeduct.toFixed(6)} SMT）`, ok: false });
      return;
    }
    const pointsCost = parseFloat((amt + feeAmt).toFixed(4));  // 能量 = 轉賬金額 + 手續費（同等數量）
    const totalPoints = pointsCost;
    if (totalPoints > 0 && (wallet?.points ?? 0) < totalPoints) {
      setQtMsg({ text: `能量不足，需要 ${totalPoints} 能量，當前 ${(wallet?.points ?? 0).toFixed(4)} 能量`, ok: false });
      return;
    }

    qtLoadingRef.current = true;
    setQtLoading(true);
    setQtMsg(null);

    const pwdOk = await verifyTradingPassword(userId, simpleHash(qtPassword.trim()));
    if (!pwdOk) {
      setQtMsg({ text: "交易密碼錯誤", ok: false });
      qtLoadingRef.current = false;
      setQtLoading(false);
      return;
    }

    const receiverId = qtReceiverInfo.id;
    if (receiverId === userId) {
      setQtMsg({ text: "不能轉給自己", ok: false });
      qtLoadingRef.current = false;
      setQtLoading(false);
      return;
    }

    const result = await transferAnt(userId, receiverId, amt);
    qtLoadingRef.current = false;
    setQtLoading(false);
    if (result.success) {
      const spent = result.points_spent ?? parseFloat(amt.toFixed(4));
      setQtSuccessInfo({ amount: amt, spent });
      setQtSuccess(true);
      // 顯示成功提示卡片 2 秒後自動跳轉至錢包頁面
      setTimeout(() => {
        router.replace("/(app)/(tabs)/wallet" as any);
      }, 2000);
    } else {
      setQtMsg({ text: result.error ?? "轉賬失敗，請重試", ok: false });
    }
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

      {/* ── 轉賬成功提示卡片（與算力池領取成功樣式一致，停留 2 秒後跳轉錢包） */}
      {qtSuccess && qtSuccessInfo && (
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", paddingHorizontal: 32, zIndex: 50 }}>
          <View style={{ width: "100%", position: "relative", backgroundColor: "#000" }}>
            <ExpoImage source={IMG_DIALOG_BG} style={StyleSheet.absoluteFillObject} contentFit="fill" />
            <View style={{ paddingHorizontal: 20, paddingTop: 28, paddingBottom: 24, alignItems: "center" }}>
              <ExpoImage source={IMG_ICON30} style={{ width: 52, height: 52 }} contentFit="contain" />
              <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 20, fontWeight: "800", marginTop: 8 }}>
                轉賬成功
              </Text>
              <Text allowFontScaling={false} style={{ color: "#DE792D", fontSize: 24, fontWeight: "800", marginVertical: 4 }}>
                -{qtSuccessInfo.amount} SMT
              </Text>
              <Text allowFontScaling={false} style={{ color: MUTED_COLOR, fontSize: 12, marginBottom: 16 }}>
                已轉出至對方錢包
              </Text>
              <View style={{ flexDirection: "row", width: "52%" }}>
                <Pressable
                  className="active:opacity-80"
                  onPress={() => router.replace("/(app)/(tabs)/wallet" as any)}
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

      {/* ── 頂部標題 */}
      <View style={{ paddingTop: insets.top + 16, paddingBottom: 12, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Pressable onPress={() => router.back()} className="active:opacity-70">
          <ExpoImage source={IMG_ICON9} style={{ width: 24, height: 24 }} contentFit="contain" />
        </Pressable>
        <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 20, fontWeight: "800", flex: 1 }}>SMT 快轉</Text>
      </View>

      {/* ── 表單（弹窗卡片背景，與充值頁一致，高度随内容自适应） */}
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
      >
      <View style={{ position: "relative", overflow: "hidden", backgroundColor: "#000", borderRadius: 20, marginHorizontal: 16, paddingTop: 12 }}>
        <ExpoImage source={IMG_MODAL_BG} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="fill" />
        <KeyboardAvoidingView behavior={process.env.EXPO_OS === "ios" ? "padding" : undefined}>
          <View style={{ gap: 12, paddingHorizontal: 16, paddingBottom: 24 }}>
            {/* 餘額卡片 */}
            <View style={{ position: "relative" }}>
              <ExpoImage source={IMG_CARD_FRAME} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 12 }} contentFit="fill" />
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12 }}>
                <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 14 }}>可用 SMT 餘額</Text>
                  <Text allowFontScaling={false} style={{ color: "#E8520A", fontWeight: "700", fontFamily: "monospace" }}>
                    {(wallet?.ant_balance ?? 0).toFixed(4)} SMT
                  </Text>
                </View>
              </View>

              {/* 接收人 */}
              <View style={{ position: "relative" }}>
                <ExpoImage source={IMG_CARD_FRAME} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 12 }} contentFit="fill" />
                <View style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8 }}>
                  <Text allowFontScaling={false} style={{ color: "#FFFFFF", fontSize: 14, fontWeight: "600" }}>接收人</Text>
                  <TextInput
                    style={{ backgroundColor: "rgba(0,0,0,0.4)", borderWidth: 1, borderColor: "#FFFFFF20", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: "#FFFFFF" }}
                    placeholder="手機號或郵箱"
                    placeholderTextColor="#FFFFFF30"
                    underlineColorAndroid="transparent"
                    value={qtReceiverId}
                    onChangeText={(v) => { setQtReceiverId(v); setQtMsg(null); setQtReceiverInfo(null); setQtReceiverStatus("idle"); }}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <View style={{ flexDirection: "row", gap: 12, paddingHorizontal: 4 }}>
                      {(["手機號", "郵箱"] as const).map((tag) => (
                        <View key={tag} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                          <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: "#FFFFFF25" }} />
                          <Text allowFontScaling={false} style={{ color: "#FFFFFF35", fontSize: 11 }}>{tag}</Text>
                        </View>
                      ))}
                    </View>
                    <Pressable
                      disabled={qtVerifyCooldown > 0 || qtLookingUp}
                      onPress={handleVerifyReceiver}
                      style={{ backgroundColor: qtVerifyCooldown > 0 || qtLookingUp ? "#FFFFFF15" : "#E8520A", borderRadius: 8, paddingVertical: 8, paddingHorizontal: 16, opacity: qtVerifyCooldown > 0 || qtLookingUp ? 0.5 : 1 }}
                    >
                      <Text allowFontScaling={false} style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "600" }}>
                        {qtVerifyCooldown > 0 ? `驗證(${qtVerifyCooldown}s)` : "驗證"}
                      </Text>
                    </Pressable>
                  </View>
                  {qtLookingUp && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 4 }}>
                      <ActivityIndicator size="small" color="#FFFFFF40" />
                      <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 12 }}>識別中...</Text>
                    </View>
                  )}
                  {!qtLookingUp && qtReceiverInfo && (
                    <View style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: "#22C55E10", borderWidth: 1, borderColor: "#22C55E30", gap: 2 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <User2 size={12} color="#22C55E" />
                        <Text allowFontScaling={false} style={{ color: "#22C55E", fontSize: 13, fontWeight: "600" }}>
                          {qtReceiverInfo.username ?? "未命名使用者"}
                        </Text>
                        {qtReceiverInfo.referral_code && (
                          <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 12, flexShrink: 1 }} numberOfLines={1}>#{qtReceiverInfo.referral_code}</Text>
                        )}
                      </View>
                      <Text allowFontScaling={false} style={{ color: "#FFFFFF35", fontSize: 11 }}>
                        通過{qtReceiverInfo.matchType === "phone" ? "手機號" : "郵箱"}識別
                      </Text>
                    </View>
                  )}
                  {!qtLookingUp && qtReceiverStatus === "not_found" && (
                    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 6, paddingHorizontal: 4, flexWrap: "wrap" }}>
                      <AlertCircle size={12} color="#F43F5E" style={{ marginTop: 1 }} />
                      <Text allowFontScaling={false} style={{ color: "#F43F5E", fontSize: 12, flex: 1, flexWrap: "wrap" }}>未找到對應使用者，請檢查輸入</Text>
                    </View>
                  )}
                  {!qtLookingUp && qtReceiverStatus === "error" && (
                    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 6, paddingHorizontal: 4, flexWrap: "wrap" }}>
                      <AlertCircle size={12} color="#F43F5E" style={{ marginTop: 1 }} />
                      <Text allowFontScaling={false} style={{ color: "#F43F5E", fontSize: 12, flex: 1, flexWrap: "wrap" }}>系統繁忙，請 10 秒後重試</Text>
                    </View>
                  )}
                </View>
              </View>

              {/* 轉出數量 */}
              <View style={{ position: "relative" }}>
                <ExpoImage source={IMG_CARD_FRAME} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 12 }} contentFit="fill" />
                <View style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <Text allowFontScaling={false} style={{ color: "#FFFFFF", fontSize: 14, fontWeight: "600" }}>轉出 SMT 數量</Text>
                    <Pressable onPress={() => { setQtAmount((wallet?.ant_balance ?? 0).toFixed(4)); setQtMsg(null); }} className="active:opacity-70">
                      <Text allowFontScaling={false} style={{ color: "#E8520A", fontSize: 12 }}>全部</Text>
                    </Pressable>
                  </View>
                  <WdInput
                    value={qtAmount}
                    onChangeText={(v) => { setQtAmount(v); setQtMsg(null); }}
                    placeholder="0.0000"
                    keyboardType="numeric"
                    inputStyle={{ fontFamily: "monospace", fontSize: 16 }}
                    suffix={<Text allowFontScaling={false} style={{ color: "#E8520A", fontWeight: "700", fontSize: 14 }}>SMT</Text>}
                  />
                </View>
              </View>

              {/* 能量 & 手續費預估 */}
              {qtPointsCost > 0 && (
                <View style={{ position: "relative" }}>
                  <ExpoImage source={IMG_CARD_FRAME} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 12 }} contentFit="fill" />
                  <View style={{ paddingHorizontal: 16, paddingVertical: 8, gap: 0 }}>
                    {[
                      { label: "當前能量", value: (wallet?.points ?? 0).toFixed(4), color: "#EAB308", icon: <Coins size={13} color="#EAB308" /> },
                      { label: "扣除能量", value: `-${qtTotalPoints.toFixed(4)}`, color: "#F97316", icon: <Coins size={13} color="#F97316" /> },
                      {
                        label: `手續費 ${isActiveMerchant ? "(商戶特權)" : `(${(fastTransferFeeRate * 100).toFixed(0)}%)`}`,
                        value: qtEffectiveFeeRate > 0 ? (
                          <View style={{ alignItems: "flex-end" }}>
                            <Text allowFontScaling={false} style={{ color: "#F43F5E", fontWeight: "700", fontFamily: "monospace", fontSize: 13 }}>-{qtFee.toFixed(4)} SMT</Text>
                            <Text allowFontScaling={false} style={{ color: "#F43F5E", fontWeight: "700", fontFamily: "monospace", fontSize: 13 }}>-{qtFeePoints.toFixed(4)} 能量</Text>
                          </View>
                        ) : "免手續費",
                        color: qtEffectiveFeeRate > 0 ? "#F43F5E" : "#22C55E",
                        icon: <Coins size={13} color="#F43F5E" />,
                      },
                      { label: "實際扣除", value: `${qtActualDeduct.toFixed(6)} SMT`, color: "#FFFFFF", icon: null },
                    ].map(({ label, value, color, icon }, i) => (
                      <View key={i} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8, borderTopWidth: i > 0 ? 1 : 0, borderColor: "#FFFFFF10" }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          {icon}
                          <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 12 }}>{label}</Text>
                        </View>
                        {typeof value === "string" ? (
                          <Text allowFontScaling={false} style={{ color, fontWeight: "700", fontFamily: "monospace", fontSize: 13 }}>{value}</Text>
                        ) : (
                          value
                        )}
                      </View>
                    ))}
                    {qtPointsInsufficient && (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8, borderTopWidth: 1, borderColor: "#F43F5E30" }}>
                        <AlertCircle size={12} color="#F43F5E" />
                        <Text allowFontScaling={false} style={{ color: "#F43F5E", fontSize: 12, flex: 1 }}>
                          能量不足，還需 {(qtTotalPoints - (wallet?.points ?? 0)).toFixed(4)} 能量
                        </Text>
                      </View>
                    )}
                    {qtBalanceInsufficient && !qtPointsInsufficient && (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8, borderTopWidth: 1, borderColor: "#F43F5E30" }}>
                        <AlertCircle size={12} color="#F43F5E" />
                        <Text allowFontScaling={false} style={{ color: "#F43F5E", fontSize: 12, flex: 1 }}>
                          SMT 餘額不足（含手續費共需 {qtActualDeduct.toFixed(6)} SMT）
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              )}

              {/* 交易密碼 */}
              <View style={{ position: "relative" }}>
                <ExpoImage source={IMG_CARD_FRAME} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 12 }} contentFit="fill" />
                <View style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8 }}>
                  <Text allowFontScaling={false} style={{ color: "#FFFFFF", fontSize: 14, fontWeight: "600" }}>交易密碼</Text>
                  <WdInput
                    value={qtPassword}
                    onChangeText={(v) => { setQtPassword(v); setQtMsg(null); }}
                    placeholder="請輸入交易密碼"
                    secureTextEntry
                  />
                </View>
              </View>

              {/* 狀態訊息 */}
              {qtMsg && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: qtMsg.ok ? "#22C55E10" : "#F43F5E10", borderWidth: 1, borderColor: qtMsg.ok ? "#22C55E30" : "#F43F5E30" }}>
                  <AlertCircle size={14} color={qtMsg.ok ? "#22C55E" : "#F43F5E"} />
                  <Text allowFontScaling={false} style={{ color: qtMsg.ok ? "#22C55E" : "#F43F5E", fontSize: 13, flex: 1, flexWrap: "wrap" }}>{qtMsg.text}</Text>
                </View>
              )}

              {/* 確認轉出按鈕（與生成專屬充值地址樣式一致） */}
              <Pressable
                onPress={handleQuickTransfer}
                disabled={qtLoading}
                className="active:opacity-80"
                style={{ position: "relative", height: 52, justifyContent: "center", alignItems: "center" }}>
                <ExpoImage source={IMG_BTN_GENERATE} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 12 }} contentFit="fill" />
                {qtLoading
                  ? <View className="flex-row items-center gap-2">
                      <ActivityIndicator size="small" color="#fff" />
                      <Text allowFontScaling={false} style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>轉出中…</Text>
                    </View>
                  : <Text allowFontScaling={false} style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>
                      {qtPointsInsufficient ? "能量不足" : qtBalanceInsufficient ? "餘額不足" : "確認轉出"}
                    </Text>
                }
              </Pressable>
            </View>
        </KeyboardAvoidingView>
      </View>
      </ScrollView>
    </View>
  );
}
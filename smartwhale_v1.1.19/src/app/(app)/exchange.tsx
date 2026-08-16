/* eslint-disable no-undef */
import { useState, useCallback, useEffect, useRef } from "react";
import {
  View, Text, ScrollView, Pressable, ActivityIndicator, TextInput,
  KeyboardAvoidingView, StyleSheet,
} from "react-native";
import { useFocusEffect, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowDownUp, RefreshCw, CheckCircle2, Info } from "lucide-react-native";
import { useSession } from "@/ctx";
import { getWalletBalance, getLatestAntPrice, exchangeUsdtToAnt, exchangeAntToUsdt, getUserMerchantInfo } from "@/db/api";
import { supabase } from "@/client/supabase";
import type { WalletBalance, AntPrice } from "@/types/types";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { enqueue, cancelQueuedExcept } from "@/lib/requestQueue";

// ── 本地圖片資源（對齊 SMT轉賬頁面）
const BODY_BG         = require("../../../assets/page-img/page_bg.webp");
const IMG_ICON9       = require("../../../assets/page-img/icon9.png");
const IMG_TX_TAB_BG   = require("../../../assets/page-img/wallet_tx_tab_bg.png");  // 方向切換 Tab 外框
const IMG_TAB_ACTIVE  = require("../../../assets/page-img/dual_frame_active.png");
const IMG_TAB_IDLE    = require("../../../assets/page-img/dual_frame_idle.png");
const IMG_CARD_FRAME  = require("../../../assets/page-img/deposit_desc_frame.png");
const IMG_BTN_CONFIRM = require("../../../assets/page-img/mine_btn_confirm.png");
const IMG_LIST_TOP    = require("../../../assets/page-img/wallet_list_top.png");
const IMG_LIST_MID    = require("../../../assets/page-img/wallet_list_mid.png");
const IMG_LIST_BOT    = require("../../../assets/page-img/wallet_list_bot.png");

// ── 聚焦輸入框（對齊 SMT轉賬頁 TrFocusInput 樣式）
const EX_FIELD_BG  = "rgba(0,0,0,0.5)";
const EX_BORDER    = "rgba(123,123,123,0.5)";
const EX_FOCUS_CLR = "#DE792D";
const EX_MUTED     = "#999999";
function ExFocusInput({
  value, onChangeText, placeholder, keyboardType, suffix,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  keyboardType?: "default" | "decimal-pad";
  suffix?: React.ReactNode;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{
      flexDirection: "row", alignItems: "center",
      backgroundColor: EX_FIELD_BG,
      borderWidth: 1, borderColor: focused ? EX_FOCUS_CLR : EX_BORDER,
      borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12,
    }}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={EX_MUTED}
        underlineColorAndroid="transparent"
        keyboardType={keyboardType ?? "default"}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          { flex: 1, color: "#fff", fontSize: 18, fontFamily: "monospace", padding: 0, margin: 0 },
          process.env.EXPO_OS === "web" ? { outlineWidth: 0, outlineStyle: "none" } as any : undefined,
        ]}
        allowFontScaling={false}
        autoCorrect={false}
        cursorColor="#fff"
      />
      {suffix ?? null}
    </View>
  );
}

type Direction = "usdt_to_ant" | "ant_to_usdt";

export default function ExchangeScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  // 源頭修復：進入頁面先校驗 userId 是否就緒
  const userId = session?.user.id ?? "";

  const [wallet, setWallet] = useState<WalletBalance | null>(null);
  const [latestPrice, setLatestPrice] = useState<AntPrice | null>(null);

  // 同步鎖：防止 setState 非同步延遲導致重複點選穿透
  const exchangingRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [isMerchant, setIsMerchant] = useState(false);  // 商戶只允許 SMT→USDT
  const [direction, setDirection] = useState<Direction>("usdt_to_ant");
  const [inputVal, setInputVal] = useState("");
  const [exchanging, setExchanging] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  // 兌換手續費率（分方向：USDT→SMT 和 SMT→USDT 獨立配置）
  const [usdtToAntFeeRate, setUsdtToAntFeeRate] = useState(0);
  const [antToUsdtFeeRate, setAntToUsdtFeeRate] = useState(0);


  const loadData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    // 本页读取整体入队（tag=exchange:userId），进入页面时已 cancelQueuedExcept 取消其他排隊 → 本页优先读取
    const [w, p, merchantInfo] = await enqueue(() => Promise.all([getWalletBalance(userId), getLatestAntPrice(), getUserMerchantInfo(userId)]), { current: false }, "exchange:" + userId);
    const isActiveMerchant = merchantInfo?.is_merchant === true && merchantInfo?.merchant_status === "active";
    setIsMerchant(isActiveMerchant);
    // 商戶進入頁面時預設鎖定 SMT→USDT 方向
    if (isActiveMerchant) setDirection("ant_to_usdt");
    setWallet(w);
    setLatestPrice(p);
    // 讀取兩個方向的手續費率
    const { data: cfgs } = await supabase
      .from("system_config")
      .select("config_key, config_val")
      .in("config_key", ["exchange_fee_rate", "exchange_usdt_to_ant_fee_rate"]);
    if (Array.isArray(cfgs)) {
      for (const cfg of cfgs) {
        const v = parseFloat(cfg.config_val);
        if (!isNaN(v)) {
          if (cfg.config_key === "exchange_usdt_to_ant_fee_rate") setUsdtToAntFeeRate(v);
          if (cfg.config_key === "exchange_fee_rate") setAntToUsdtFeeRate(v);
        }
      }
    }
    setLoading(false);
  }, [userId]);

  useFocusEffect(useCallback(() => {
    if (userId) cancelQueuedExcept("exchange:" + userId);
    loadData();
    setSuccessMsg("");
    setError("");
    setInputVal("");
  }, [loadData, userId]));

  const currentPrice = latestPrice?.close_price ?? 0;
  const usdtBalance = wallet?.usdt_balance ?? 0;
  const antBalance = wallet?.ant_balance ?? 0;
  const points = wallet?.points ?? 0;

  const isUsdtToAnt = direction === "usdt_to_ant";
  // 當前方向的手續費率
  const exchangeFeeRate = isUsdtToAnt ? usdtToAntFeeRate : antToUsdtFeeRate;
  const inputAmt = parseFloat(inputVal);
  const validInput = !isNaN(inputAmt) && inputAmt > 0;

  // SMT→USDT：手續費額外收取（不從兌換額中扣），總扣 = inputAmt + feeSMT，USDT到賬 = inputAmt * price
  const exchangeFeeAC = validInput && !isUsdtToAnt
    ? parseFloat((inputAmt * exchangeFeeRate).toFixed(4))
    : 0;
  const antTotalCost = validInput && !isUsdtToAnt
    ? inputAmt + exchangeFeeAC                               // 實際扣除AC總量
    : 0;

  // 預算
  const previewOutGross = validInput && currentPrice > 0
    ? isUsdtToAnt
      ? inputAmt / currentPrice                              // USDT → SMT（毛額）
      : inputAmt * currentPrice                              // SMT → USDT（全額兌換，手續費額外）
    : 0;

  // USDT→SMT 方向的手續費（從SMT毛額中扣，fee_rate=0時為0）
  const exchangeFeeUsdtToAnt = !isUsdtToAnt ? 0
    : previewOutGross > 0
      ? parseFloat((previewOutGross * exchangeFeeRate).toFixed(6))
      : 0;

  // 實際到賬
  const previewOut = previewOutGross > 0
    ? isUsdtToAnt
      ? parseFloat((previewOutGross - exchangeFeeUsdtToAnt).toFixed(4))
      : parseFloat(previewOutGross.toFixed(2))
    : 0;

  // 展示用手續費
  const displayFee = isUsdtToAnt ? exchangeFeeUsdtToAnt : exchangeFeeAC;

  // SMT→USDT 需要的能量（按投入的 SMT 數量計算）
  const pointsNeeded = !isUsdtToAnt && validInput ? inputAmt : 0;
  // USDT→SMT 額外獲得的能量（按實際到賬 SMT 數量計算）
  const pointsEarned = isUsdtToAnt && previewOut > 0 ? previewOut : 0;

  const fromLabel  = isUsdtToAnt ? "USDT" : "SMT";
  const toLabel    = isUsdtToAnt ? "SMT"   : "USDT";
  const fromBal    = isUsdtToAnt ? usdtBalance : antBalance;
  const fromColor  = isUsdtToAnt ? "#22C55E" : "#E8520A";
  const toColor    = isUsdtToAnt ? "#E8520A" : "#22C55E";

  const handleSwap = () => {
    // 商戶鎖定 SMT→USDT，禁止切換
    if (isMerchant) return;
    setDirection((d) => d === "usdt_to_ant" ? "ant_to_usdt" : "usdt_to_ant");
    setInputVal("");
    setError("");
    setSuccessMsg("");
  };

  const handleExchange = async () => {
    // 同步鎖：防止 React setState 非同步延遲期間重複點選穿透
    if (exchangingRef.current) return;
    setError("");
    setSuccessMsg("");
    if (!currentPrice) { setError("暫無價格資料，無法兌換"); return; }
    if (!validInput) { setError(`請輸入有效的${fromLabel}數量`); return; }
    // SMT→USDT 檢查總扣除量（兌換額+手續費）是否充足
    const acNeeded = !isUsdtToAnt ? antTotalCost : inputAmt;
    if (acNeeded > fromBal) {
      const hint = !isUsdtToAnt
        ? `SMT餘額不足，需 ${antTotalCost.toFixed(4)} SMT（含手續費 ${exchangeFeeAC.toFixed(4)} SMT），當前 ${fromBal.toFixed(4)} SMT`
        : `${fromLabel}餘額不足，當前 ${fromBal.toFixed(2)} ${fromLabel}`;
      setError(hint); return;
    }
    if (previewOut <= 0) { setError("兌換數量過小"); return; }
    if (!isUsdtToAnt && pointsNeeded > points) {
      setError(`能量不足，需 ${pointsNeeded.toFixed(2)} 能量，當前 ${points.toFixed(2)}`);
      return;
    }

    exchangingRef.current = true;
    setExchanging(true);
    if (isUsdtToAnt) {
      // 傳給後端的 antAmount 是毛額，後端函式自己讀取 exchange_usdt_to_ant_fee_rate 並扣費
      // 後端按系统强制价计算 SMT 数量，仅传 USDT 花费量即可（antAmt/currentPrice 仅前端预览用）
      const res = await exchangeUsdtToAnt(userId, inputAmt);
      exchangingRef.current = false;
      setExchanging(false);
      if (!res.success) { setError(res.error ?? "兌換失敗"); return; }
      setSuccessMsg(`✅ 兌換成功！獲得 ${previewOut.toFixed(4)} SMT（免手續費），額外獲得 ${previewOut.toFixed(2)} 能量`);
    } else {
      // 傳給後端兌換額（手續費由後端按fee_rate額外扣除）
      // 後端按系统强制价计算 USDT 数量，仅传 SMT 花费量即可（usdtAmt/currentPrice 仅前端预览用）
      const res = await exchangeAntToUsdt(userId, inputAmt);
      exchangingRef.current = false;
      setExchanging(false);
      if (!res.success) { setError(res.error ?? "兌換失敗"); return; }
      setSuccessMsg(`✅ 兌換成功！獲得 ${previewOut.toFixed(2)} USDT，扣除 ${antTotalCost.toFixed(4)} SMT（含手續費 ${exchangeFeeAC.toFixed(4)} SMT），消耗 ${inputAmt.toFixed(2)} 能量`);
    }
    setInputVal("");
    await loadData();
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

      {/* 頂部導航 */}
      <View style={{ paddingTop: insets.top + 16, paddingBottom: 16, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Pressable onPress={() => router.back()} className="active:opacity-70">
          <ExpoImage source={IMG_ICON9} style={{ width: 24, height: 24 }} contentFit="contain" />
        </Pressable>
        <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 20, fontWeight: "800", flex: 1 }}>兌換</Text>
        <Pressable onPress={loadData} className="active:opacity-70">
          <RefreshCw size={18} color="#FFFFFF40" />
        </Pressable>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={process.env.EXPO_OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        >

          {/* 成功提示 */}
          {successMsg ? (
            <View style={{ marginHorizontal: 16, marginBottom: 12, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#22C55E15", borderWidth: 1, borderColor: "#22C55E40" }}>
              <CheckCircle2 size={18} color="#22C55E" />
              <Text allowFontScaling={false} style={{ color: "#22C55E", fontWeight: "600", flex: 1 }}>{successMsg}</Text>
            </View>
          ) : null}

          {/* 方向切換（商戶鎖定則隱藏） */}
          {!isMerchant && (
            <View style={{ marginHorizontal: 16, marginBottom: 12, height: 48, overflow: "hidden", borderRadius: 12 }}>
              {/* 外框：深色底 + 橙色细描边 */}
              <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "#1a0e06", borderRadius: 12, borderWidth: 1, borderColor: "rgba(222,121,45,0.45)" }} />
              <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, paddingHorizontal: 6, paddingVertical: 6, flexDirection: "row", gap: 6 }}>
                {(["usdt_to_ant", "ant_to_usdt"] as Direction[]).map((d) => {
                  const active = direction === d;
                  return (
                    <Pressable
                      key={d}
                      onPress={() => { setDirection(d); setInputVal(""); setError(""); setSuccessMsg(""); }}
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
                        <Text allowFontScaling={false} style={{ color: active ? "#fff" : "#FFFFFF60", fontWeight: active ? "700" : "400", fontSize: 13 }}>
                          {d === "usdt_to_ant" ? "USDT → SMT" : "SMT → USDT"}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {/* 兌換表單（三圖拼接外框） */}
          <View style={{ marginHorizontal: 16, position: "relative" }}>
            <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 16, overflow: "hidden" }}>
              <ExpoImage source={IMG_LIST_TOP} style={{ width: "100%", aspectRatio: 987 / 80 }} contentFit="cover" />
              <ExpoImage source={IMG_LIST_MID} style={{ flex: 1, width: "100%" }} contentFit="fill" />
              <ExpoImage source={IMG_LIST_BOT} style={{ width: "100%", aspectRatio: 987 / 80 }} contentFit="cover" />
            </View>
            <View style={{ padding: 16, gap: 16 }}>

              {/* 支出欄 — ExFocusInput */}
              <View>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
                  <Text allowFontScaling={false} style={{ color: "#FFFFFF", fontSize: 14 }}>支出 {fromLabel}</Text>
                  <Pressable onPress={() => { setInputVal(fromBal.toFixed(isUsdtToAnt ? 2 : 4)); setError(""); setSuccessMsg(""); }} className="active:opacity-70">
                    <Text allowFontScaling={false} style={{ color: fromColor, fontSize: 12 }}>
                      餘額 {fromBal.toFixed(isUsdtToAnt ? 2 : 4)} {fromLabel}
                    </Text>
                  </Pressable>
                </View>
                <ExFocusInput
                  value={inputVal}
                  onChangeText={(v) => { setInputVal(v); setError(""); setSuccessMsg(""); }}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                  suffix={
                    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: fromColor + "20" }}>
                      <Text allowFontScaling={false} style={{ color: fromColor, fontWeight: "700", fontSize: 12 }}>{fromLabel}</Text>
                    </View>
                  }
                />
              </View>

              {/* 切換箭頭 */}
              {!isMerchant && (
                <View style={{ alignItems: "center" }}>
                  <Pressable
                    style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF10", borderWidth: 1, borderColor: "#FFFFFF20" }}
                    className="active:opacity-70"
                    onPress={handleSwap}
                  >
                    <ArrowDownUp size={16} color="#E8520A" />
                  </Pressable>
                </View>
              )}

              {/* 獲得欄（唯讀顯示，ExFocusInput 樣式的靜態容器） */}
              <View>
                <Text allowFontScaling={false} style={{ color: "#FFFFFF", fontSize: 14, marginBottom: 8 }}>獲得 {toLabel}（預估）</Text>
                <View style={{
                  flexDirection: "row", alignItems: "center",
                  backgroundColor: EX_FIELD_BG,
                  borderWidth: 1, borderColor: EX_BORDER,
                  borderRadius: 8, paddingHorizontal: 12, paddingVertical: 14,
                }}>
                  <Text allowFontScaling={false} style={{ flex: 1, fontSize: 18, fontWeight: "700", fontFamily: "monospace",
                    color: previewOut > 0 ? toColor : EX_MUTED }}>
                    {previewOut > 0 ? previewOut.toFixed(isUsdtToAnt ? 4 : 2) : "0.00"}
                  </Text>
                  <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: toColor + "20" }}>
                    <Text allowFontScaling={false} style={{ color: toColor, fontWeight: "700", fontSize: 12 }}>{toLabel}</Text>
                  </View>
                </View>
              </View>

              {/* 明細 */}
              {previewOut > 0 && (
                <View style={{ borderRadius: 10, overflow: "hidden", borderWidth: 1, borderColor: "#E8520A30" }}>
                  {[
                    { label: "兌換匯率", value: `1 SMT = ${currentPrice.toFixed(4)} USDT`, color: "#FFFFFF80" },
                    {
                      label: `支出${fromLabel}`,
                      value: isUsdtToAnt ? `${inputAmt.toFixed(2)} USDT` : `${antTotalCost.toFixed(4)} SMT（含手續費）`,
                      color: "#FFFFFF80",
                    },
                  ].map((row, i) => (
                    <View key={i}>
                      {i > 0 && <View style={{ height: 1, backgroundColor: "#FFFFFF08" }} />}
                      <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 10, backgroundColor: "#000000" }}>
                        <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 12 }}>{row.label}</Text>
                        <Text allowFontScaling={false} style={{ color: row.color, fontSize: 12, fontFamily: "monospace" }}>{row.value}</Text>
                      </View>
                    </View>
                  ))}
                  <View style={{ height: 1, backgroundColor: "#FFFFFF08" }} />
                  <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 10, backgroundColor: "#000000" }}>
                    <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 12 }}>
                      手續費 ({(exchangeFeeRate * 100).toFixed(0)}%{!isUsdtToAnt ? " 額外" : ""})
                    </Text>
                    {exchangeFeeRate > 0 ? (
                      <Text allowFontScaling={false} style={{ color: "#F43F5E", fontSize: 12, fontFamily: "monospace" }}>
                        {isUsdtToAnt ? `-${displayFee.toFixed(6)} ${toLabel}` : `+${displayFee.toFixed(4)} SMT（額外扣除）`}
                      </Text>
                    ) : (
                      <Text allowFontScaling={false} style={{ color: "#22C55E", fontSize: 12, fontWeight: "700" }}>免手續費</Text>
                    )}
                  </View>
                  <View style={{ height: 1, backgroundColor: "#FFFFFF08" }} />
                  <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 10, backgroundColor: "#000000" }}>
                    <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 12 }}>獲得{toLabel}</Text>
                    <Text allowFontScaling={false} style={{ color: toColor, fontSize: 12, fontFamily: "monospace", fontWeight: "700" }}>
                      +{previewOut.toFixed(isUsdtToAnt ? 4 : 2)} {toLabel}
                    </Text>
                  </View>
                  <View style={{ height: 1, backgroundColor: "#FFFFFF08" }} />
                  {isUsdtToAnt ? (
                    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 10, backgroundColor: "#000000" }}>
                      <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 12 }}>額外獲得能量</Text>
                      <Text allowFontScaling={false} style={{ color: "#EAB308", fontSize: 12, fontFamily: "monospace", fontWeight: "700" }}>+{pointsEarned.toFixed(2)} 能量</Text>
                    </View>
                  ) : (
                    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 10, backgroundColor: "#000000" }}>
                      <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 12 }}>消耗能量</Text>
                      <Text allowFontScaling={false} style={{ color: "#F43F5E", fontSize: 12, fontFamily: "monospace", fontWeight: "700" }}>
                        -{pointsNeeded.toFixed(2)} 能量（當前 {points.toFixed(2)}）
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {/* SMT→USDT 規則提示 */}
              {!isUsdtToAnt && (
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: "#EAB30810", borderWidth: 1, borderColor: "#EAB30830" }}>
                  <Info size={14} color="#EAB308" style={{ marginTop: 1 }} />
                  <Text allowFontScaling={false} style={{ color: "#EAB308", fontSize: 11, flex: 1, lineHeight: 18 }}>
                    SMT兌換USDT需消耗等值SMT數量的能量，手續費額外收取{"\n"}
                    例：兌換100SMT → 消耗100能量 + 額外扣1SMT手續費
                  </Text>
                </View>
              )}

              {error ? <Text allowFontScaling={false} style={{ color: "#F43F5E", fontSize: 14 }}>{error}</Text> : null}
            </View>
          </View>

          {/* 說明（IMG_CARD_FRAME 背景） */}
          <View style={{ marginHorizontal: 16, marginTop: 10, position: "relative" }}>
            <ExpoImage source={IMG_CARD_FRAME} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 12 }} contentFit="fill" />
            <View style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
              <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 12, lineHeight: 20 }}>
                · 按當前SMT市價即時成交，不可撤銷{"\n"}
                · USDT→SMT：按到賬的SMT數量獎勵等量能量，免手續費{"\n"}
                · SMT→USDT：按投入的SMT數量消耗等量能量{"\n"}
                · SMT→USDT手續費1%額外扣除，例：兌換100SMT額外扣1SMT
              </Text>
            </View>
          </View>

          {/* 確認按鈕（mine_btn_confirm 圖片背景） */}
          <View style={{ marginHorizontal: 16, marginTop: 12, marginBottom: 8 }}>
            <Pressable
              className="active:opacity-70"
              style={{ position: "relative", borderRadius: 12, overflow: "hidden", opacity: exchanging || previewOut <= 0 ? 0.5 : 1 }}
              onPress={handleExchange}
              disabled={exchanging || previewOut <= 0}
            >
              <ExpoImage source={IMG_BTN_CONFIRM} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 12 }} contentFit="fill" />
              <View style={{ paddingVertical: 16, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 }}>
                {exchanging ? <ActivityIndicator color="#fff" /> : (
                  <>
                    <ArrowDownUp size={18} color="#fff" />
                    <Text allowFontScaling={false} style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>確認兌換</Text>
                  </>
                )}
              </View>
            </Pressable>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

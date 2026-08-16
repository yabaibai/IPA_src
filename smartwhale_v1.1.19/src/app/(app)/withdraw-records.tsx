/* eslint-disable no-undef */
import { useState, useCallback, useRef } from "react";
import {
  View, Text, ScrollView, Pressable, ActivityIndicator,
  StyleSheet, TextInput, KeyboardAvoidingView,
} from "react-native";
import { useFocusEffect, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { ChevronLeft, ChevronRight, AlertCircle } from "lucide-react-native";
import { useSession } from "@/ctx";
import { getWithdrawOrders, getWalletBalance, submitWithdrawOrder, simpleHash } from "@/db/api";
import { supabase } from "@/client/supabase";
import type { WithdrawOrder, WithdrawStatus, WalletBalance } from "@/types/types";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// ── 本地圖片資源
const BODY_BG       = require("../../../assets/page-img/page_bg.webp");
const IMG_ICON9     = require("../../../assets/page-img/icon9.png");
const IMG_LIST_TOP  = require("../../../assets/page-img/wallet_list_top.png");
const IMG_LIST_MID  = require("../../../assets/page-img/wallet_list_mid.png");
const IMG_LIST_BOT  = require("../../../assets/page-img/wallet_list_bot.png");
const IMG_BTN_CONFIRM   = require("../../../assets/page-img/mine_btn_confirm.png");
const IMG_DIALOG_BG     = require("../../../assets/page-img/mine_dialog_bg.png");
const IMG_ICON30        = require("../../../assets/page-img/mine_icon30.png");
const IMG_BTN_GENERATE  = require("../../../assets/page-img/generate_active.png");
const IMG_MODAL_BG    = require("../../../assets/page-img/bg20.png");
const IMG_CARD_FRAME  = require("../../../assets/page-img/deposit_desc_frame.png");

const MUTED_COLOR = "#999999";

const PAGE_SIZE = 15;
const CARD_GAP = 12;
const CARD_PAD_H = 16;
const CARD_PAD_V = 16;
const SUB_GAP = 8;

// ── 狀態徽章
const STATUS_CONFIG: Record<WithdrawStatus, { label: string; bg: string; border: string; color: string }> = {
  pending:  { label: "稽核中", bg: "#EAB30818", border: "#EAB30840", color: "#EAB308" },
  approved: { label: "已提現", bg: "#22C55E18", border: "#22C55E40", color: "#22C55E" },
  rejected: { label: "已拒絕", bg: "#F43F5E18", border: "#F43F5E40", color: "#F43F5E" },
};
function StatusBadge({ status }: { status: WithdrawStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <View className="px-2 py-0.5 rounded-full" style={{ backgroundColor: cfg.bg, borderWidth: 1, borderColor: cfg.border }}>
      <Text allowFontScaling={false} style={{ color: cfg.color, fontSize: 11, fontWeight: "700" }}>{cfg.label}</Text>
    </View>
  );
}
function shortAddr(addr: string): string {
  if (addr.length <= 16) return addr;
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}

// ── 提現輸入框（對齊錢包彈窗樣式）
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

type ActiveTab = "withdraw" | "records";

export default function WithdrawRecordsScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const userId = session?.user.id ?? "";

  // ── Tab 狀態
  const [activeTab, setActiveTab] = useState<ActiveTab>("withdraw");

  // ── 提現記錄狀態
  const [orders, setOrders] = useState<WithdrawOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [recordsLoading, setRecordsLoading] = useState(false);

  // ── 我要提現狀態
  const [wallet, setWallet] = useState<WalletBalance | null>(null);
  const [wdFeeRate, setWdFeeRate] = useState(0.03);
  const [wdAmount, setWdAmount] = useState("");
  const [wdAddress, setWdAddress] = useState("");
  const [wdPassword, setWdPassword] = useState("");
  const [wdError, setWdError] = useState("");
  const [wdSubmitting, setWdSubmitting] = useState(false);
  const [wdSuccess, setWdSuccess] = useState(false);
  const wdSubmittingRef = useRef(false);

  const wdAmountNum = parseFloat(wdAmount) || 0;
  const wdBalance   = wallet?.usdt_balance ?? 0;
  const wdFee       = parseFloat((wdAmountNum * wdFeeRate).toFixed(6));
  const wdActual    = parseFloat((wdAmountNum * (1 - wdFeeRate)).toFixed(6));

  // ── 載入記錄
  const loadPage = useCallback(async (p: number) => {
    if (!userId) return;
    setRecordsLoading(true);
    const res = await getWithdrawOrders(userId, PAGE_SIZE, p * PAGE_SIZE);
    setOrders(res.data);
    setTotal(res.total);
    setRecordsLoading(false);
  }, [userId]);

  // ── 載入提現所需資料（餘額+手續費率）
  const loadWithdrawData = useCallback(async () => {
    if (!userId) return;
    const [w] = await Promise.all([getWalletBalance(userId)]);
    setWallet(w);
    const { data: cfgs } = await supabase
      .from("system_config").select("config_key, config_val")
      .eq("config_key", "withdraw_usdt_fee_rate");
    if (cfgs?.length) {
      const v = parseFloat(cfgs[0].config_val);
      if (!isNaN(v)) setWdFeeRate(v);
    }
  }, [userId]);

  useFocusEffect(useCallback(() => {
    (async () => {
      setPage(0);
      await Promise.all([loadPage(0), loadWithdrawData()]);
    })();
  }, [loadPage, loadWithdrawData]));

  const handlePage = (next: number) => { setPage(next); loadPage(next); };
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasPrev = page > 0;
  const hasNext = (page + 1) * PAGE_SIZE < total;

  const handleWithdraw = async () => {
    if (wdSubmittingRef.current) return;
    if (!wdAmount || wdAmountNum < 1) { setWdError("最低提現金額為 1 USDT"); return; }
    if (wdAmountNum > wdBalance) { setWdError("USDT 餘額不足"); return; }
    if (!wdAddress.trim()) { setWdError("請輸入提現地址"); return; }
    if (!wdPassword.trim()) { setWdError("請輸入交易密碼"); return; }
    wdSubmittingRef.current = true;
    setWdSubmitting(true); setWdError("");
    const res = await submitWithdrawOrder(userId, wdAmountNum, wdAddress, simpleHash(wdPassword));
    wdSubmittingRef.current = false;
    setWdSubmitting(false);
    if (res.success) {
      setWdSuccess(true);
      await Promise.all([loadWithdrawData(), loadPage(0)]);
      setPage(0);
      // 提現成功後顯示成功卡片 2 秒，再自動切換至提現記錄 Tab
      setTimeout(() => setActiveTab("records"), 2000);
    } else {
      setWdError(res.error ?? "提現失敗，請重試");
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <StatusBar style="light" />
      <ExpoImage source={BODY_BG} style={StyleSheet.absoluteFillObject} contentFit="cover" priority="high" cachePolicy="memory-disk" />

      {/* ── 提現成功提示卡片（與算力池領取成功樣式一致，停留 2 秒後切換記錄 Tab） */}
      {wdSuccess && (
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", paddingHorizontal: 32, zIndex: 50 }}>
          <View style={{ width: "100%", position: "relative", backgroundColor: "#000" }}>
            <ExpoImage source={IMG_DIALOG_BG} style={StyleSheet.absoluteFillObject} contentFit="fill" />
            <View style={{ paddingHorizontal: 20, paddingTop: 28, paddingBottom: 24, alignItems: "center" }}>
              <ExpoImage source={IMG_ICON30} style={{ width: 52, height: 52 }} contentFit="contain" />
              <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 20, fontWeight: "800", marginTop: 8 }}>
                提現申請已提交
              </Text>
              <Text allowFontScaling={false} style={{ color: MUTED_COLOR, fontSize: 12, marginVertical: 8, textAlign: "center", lineHeight: 18 }}>
                智能風控通過後自動到賬
              </Text>
              <View style={{ flexDirection: "row", width: "52%" }}>
                <Pressable
                  className="active:opacity-80"
                  onPress={() => setActiveTab("records")}
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
        <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 20, fontWeight: "800", flex: 1 }}>提現</Text>
        {activeTab === "records" && (
          <Text allowFontScaling={false} style={{ color: "#E8520A", fontSize: 13 }} numberOfLines={1}>共 {total} 條</Text>
        )}
      </View>

      {/* ── Tab 切換（對齊兌換頁樣式） */}
      <View style={{ marginHorizontal: 16, marginBottom: 12, height: 48, borderRadius: 12, overflow: "hidden" }}>
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "#1a0e06", borderRadius: 12, borderWidth: 1, borderColor: "rgba(222,121,45,0.45)" }} />
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, paddingHorizontal: 6, paddingVertical: 6, flexDirection: "row", gap: 6 }}>
          {(["withdraw", "records"] as ActiveTab[]).map((tab) => {
            const active = activeTab === tab;
            return (
              <Pressable
                key={tab}
                onPress={() => setActiveTab(tab)}
                className="active:opacity-80"
                style={{ flex: 1, position: "relative", borderRadius: 999, overflow: "hidden" }}
              >
                {active && (
                  <LinearGradient
                    colors={["#EB9426", "#C8571A", "#B84010"]}
                    start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
                    style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 999 }}
                  />
                )}
                <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
                  <Text allowFontScaling={false} style={{ color: active ? "#fff" : "#FFFFFF60", fontWeight: active ? "700" : "400", fontSize: 13 }}>
                    {tab === "withdraw" ? "我要提現" : "提現記錄"}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* ── 我要提現 Tab（弹窗卡片背景，高度随内容自适应） */}
      {activeTab === "withdraw" && (
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
              <>
                {/* USDT 餘額 */}
                <View style={{ position: "relative" }}>
                  <ExpoImage source={IMG_CARD_FRAME} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 12 }} contentFit="fill" />
                  <View className="flex-row items-center justify-between px-4 py-3">
                    <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 14 }}>可用 USDT 餘額</Text>
                      <Text allowFontScaling={false} style={{ color: "#22C55E", fontWeight: "700", fontFamily: "monospace" }}>
                        {wdBalance.toFixed(2)} USDT
                      </Text>
                    </View>
                  </View>

                  {/* 提現數量 */}
                  <View style={{ position: "relative" }}>
                    <ExpoImage source={IMG_CARD_FRAME} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 12 }} contentFit="fill" />
                    <View className="px-4 py-3 gap-2">
                      <View className="flex-row items-center justify-between">
                        <Text allowFontScaling={false} style={{ color: "#FFFFFF", fontSize: 14, fontWeight: "600" }}>提現數量</Text>
                        <Pressable className="active:opacity-70" onPress={() => { setWdAmount(wdBalance.toFixed(2)); setWdError(""); }}>
                          <Text allowFontScaling={false} style={{ color: "#E8520A", fontSize: 12 }}>全部</Text>
                        </Pressable>
                      </View>
                      <WdInput
                        value={wdAmount}
                        onChangeText={(v) => { setWdAmount(v); setWdError(""); }}
                        placeholder="最低 1 USDT"
                        keyboardType="numeric"
                        suffix={<Text allowFontScaling={false} style={{ color: "#E8520A", fontWeight: "700", fontSize: 14 }}>USDT</Text>}
                      />
                    </View>
                  </View>

                  {/* 手續費預覽 */}
                  {wdAmountNum >= 1 && (
                    <View style={{ position: "relative" }}>
                      <ExpoImage source={IMG_CARD_FRAME} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 12 }} contentFit="fill" />
                      <View className="px-4 py-2 gap-1">
                        {[
                          { label: "申請金額", value: `${wdAmountNum.toFixed(2)} USDT`, color: "#FFFFFF" },
                          { label: `手續費 (${(wdFeeRate * 100).toFixed(0)}%)`, value: `-${wdFee.toFixed(2)} USDT`, color: "#F97316" },
                          { label: "實際到賬", value: `${wdActual.toFixed(2)} USDT`, color: "#22C55E" },
                        ].map(({ label, value, color }, i) => (
                          <View key={i} className="flex-row items-center justify-between py-1.5"
                            style={{ borderTopWidth: i > 0 ? 1 : 0, borderColor: "#FFFFFF10" }}>
                            <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 12 }}>{label}</Text>
                            <Text allowFontScaling={false} style={{ color, fontWeight: "700", fontFamily: "monospace", fontSize: 14 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{value}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}

                  {/* 到賬地址 */}
                  <View style={{ position: "relative" }}>
                    <ExpoImage source={IMG_CARD_FRAME} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 12 }} contentFit="fill" />
                    <View className="px-4 py-3 gap-2">
                      <Text allowFontScaling={false} style={{ color: "#FFFFFF", fontSize: 14, fontWeight: "600" }}>到賬地址（BSC鏈）</Text>
                      <WdInput
                        value={wdAddress}
                        onChangeText={(v) => { setWdAddress(v); setWdError(""); }}
                        placeholder="請輸入 BSC 錢包地址（0x...）"
                        autoCapitalize="none"
                        inputStyle={{ fontFamily: "monospace", fontSize: 12 }}
                      />
                    </View>
                  </View>

                  {/* 交易密碼 */}
                  <View style={{ position: "relative" }}>
                    <ExpoImage source={IMG_CARD_FRAME} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 12 }} contentFit="fill" />
                    <View className="px-4 py-3 gap-2">
                      <Text allowFontScaling={false} style={{ color: "#FFFFFF", fontSize: 14, fontWeight: "600" }}>交易密碼</Text>
                      <WdInput
                        value={wdPassword}
                        onChangeText={(v) => { setWdPassword(v); setWdError(""); }}
                        placeholder="請輸入交易密碼"
                        secureTextEntry
                      />
                    </View>
                  </View>

                  {/* 錯誤提示 */}
                  {wdError ? (
                    <View className="flex-row items-center gap-2 px-3 py-2 rounded-lg"
                      style={{ backgroundColor: "#F43F5E10", borderWidth: 1, borderColor: "#F43F5E30" }}>
                      <AlertCircle size={14} color="#F43F5E" />
                      <Text allowFontScaling={false} style={{ color: "#F43F5E", fontSize: 13, flex: 1 }}>{wdError}</Text>
                    </View>
                  ) : null}

                  {/* 確認提現按鈕（與生成專屬充值地址樣式一致） */}
                  <Pressable
                    onPress={handleWithdraw}
                    disabled={wdSubmitting}
                    className="active:opacity-80"
                    style={{ position: "relative", height: 52, justifyContent: "center", alignItems: "center" }}>
                    <ExpoImage source={IMG_BTN_GENERATE} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 12 }} contentFit="fill" />
                    {wdSubmitting
                      ? <View className="flex-row items-center gap-2">
                          <ActivityIndicator size="small" color="#fff" />
                          <Text allowFontScaling={false} style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>提交中…</Text>
                        </View>
                      : <Text allowFontScaling={false} style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>確認提現</Text>
                    }
                  </Pressable>
                </>
            </View>
        </KeyboardAvoidingView>
        </View>
        </ScrollView>
      )}

      {/* ── 提現記錄 Tab */}
      {activeTab === "records" && (
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 32 }}
        >
          <View style={{ marginTop: CARD_GAP, position: "relative" }}>
            <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 16, overflow: "hidden" }}>
              <ExpoImage source={IMG_LIST_TOP} style={{ width: "100%", aspectRatio: 987 / 80 }} contentFit="cover" />
              <ExpoImage source={IMG_LIST_MID} style={{ flex: 1, width: "100%" }} contentFit="fill" />
              <ExpoImage source={IMG_LIST_BOT} style={{ width: "100%", aspectRatio: 987 / 80 }} contentFit="cover" />
            </View>
            <View style={{ paddingHorizontal: CARD_PAD_H, paddingVertical: CARD_PAD_V, gap: SUB_GAP }}>
              {recordsLoading ? (
                <View style={{ paddingVertical: 48, alignItems: "center" }}>
                  <ActivityIndicator size="large" color="#E8520A" />
                </View>
              ) : orders.length === 0 ? (
                <View style={{ paddingVertical: 48, alignItems: "center", gap: SUB_GAP }}>
                  <ExpoImage source={require("../../../assets/page-img/records_ui.png")} style={{ width: 80, height: 80 }} contentFit="contain" />
                  <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 14 }}>暫無提現記錄</Text>
                  <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 12 }}>提現申請後記錄將顯示在此處</Text>
                </View>
              ) : (
                <View style={{ gap: SUB_GAP }}>
                  {orders.map((order, idx) => {
                    const dt = new Date(order.created_at);
                    const dateStr = dt.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
                    const timeStr = dt.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
                    return (
                      <View key={order.id} style={{ gap: SUB_GAP }}>
                        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                          <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 11, fontFamily: "monospace" }}>{order.order_no}</Text>
                          <StatusBadge status={order.status} />
                        </View>
                        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 16 }}>
                          <View style={{ flex: 1 }}>
                            <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 12, marginBottom: 2 }}>申請金額</Text>
                            <Text allowFontScaling={false} style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 16, fontFamily: "monospace" }}>
                              {Number(order.amount).toFixed(2)} {order.currency}
                            </Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 12, marginBottom: 2 }}>手續費(3%)</Text>
                            <Text allowFontScaling={false} style={{ color: "#F97316", fontWeight: "600", fontSize: 14, fontFamily: "monospace" }}>
                              -{Number(order.fee).toFixed(2)} {order.currency}
                            </Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 12, marginBottom: 2 }}>實際到賬</Text>
                            <Text allowFontScaling={false} style={{ color: "#22C55E", fontWeight: "700", fontSize: 14, fontFamily: "monospace" }}>
                              {Number(order.actual_amount).toFixed(2)} {order.currency}
                            </Text>
                          </View>
                        </View>
                        <View>
                          <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 12, marginBottom: 2 }}>到賬地址</Text>
                          <Text allowFontScaling={false} style={{ color: "#E8520A", fontSize: 11, fontFamily: "monospace" }}>{shortAddr(order.to_address)}</Text>
                        </View>
                        {order.status === "rejected" && order.reject_reason && (
                          <View style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: "#F43F5E10", borderWidth: 1, borderColor: "#F43F5E30" }}>
                            <Text allowFontScaling={false} style={{ color: "#F43F5E", fontSize: 12 }}>拒绝原因：{order.reject_reason}</Text>
                          </View>
                        )}
                        {order.status === "rejected" && (
                          <View style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: "#22C55E10", borderWidth: 1, borderColor: "#22C55E30" }}>
                            <Text allowFontScaling={false} style={{ color: "#22C55E", fontSize: 11 }}>✓ 代币及手续费已退还至您的賬戶</Text>
                          </View>
                        )}
                        <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 12 }}>申请时间：{dateStr}  {timeStr}</Text>
                        {idx < orders.length - 1 && (
                          <View style={{ height: 1, backgroundColor: "#FFFFFF10", marginTop: SUB_GAP }} />
                        )}
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          </View>

          {/* 翻頁 */}
          {totalPages > 1 && (
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: CARD_GAP }}>
              <Pressable onPress={() => hasPrev && handlePage(page - 1)} disabled={!hasPrev}
                className="flex-row items-center gap-1 px-3 py-2 rounded-lg active:opacity-70"
                style={{ backgroundColor: "#0A0A0A", borderWidth: 1, borderColor: hasPrev ? "#FFFFFF15" : "#FFFFFF10", opacity: hasPrev ? 1 : 0.4 }}>
                <ChevronLeft size={14} color="#FFFFFF60" />
                <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 13 }}>上一頁</Text>
              </Pressable>
              <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 12 }} numberOfLines={1}>第 {page + 1} / {totalPages} 頁</Text>
              <Pressable onPress={() => hasNext && handlePage(page + 1)} disabled={!hasNext}
                className="flex-row items-center gap-1 px-3 py-2 rounded-lg active:opacity-70"
                style={{ backgroundColor: "#0A0A0A", borderWidth: 1, borderColor: hasNext ? "#FFFFFF15" : "#FFFFFF10", opacity: hasNext ? 1 : 0.4 }}>
                <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 13 }}>下一頁</Text>
                <ChevronRight size={14} color="#FFFFFF60" />
              </Pressable>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}
/* eslint-disable no-undef */
import { useState, useCallback, useEffect, useRef } from "react";
import {
  View, Text, ScrollView, Pressable, ActivityIndicator,
  StyleSheet, TextInput, KeyboardAvoidingView,
} from "react-native";
import { useFocusEffect, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import {
  ChevronLeft, ChevronRight, AlertCircle,
  Copy, Check, QrCode, Clock, Loader, CheckCircle, FileText,
} from "lucide-react-native";
import QRCode from "react-native-qrcode-svg";
import * as Clipboard from "expo-clipboard";
import { useSession } from "@/ctx";
import { getUsdtDepositRecords, createRechargeOrder, getRechargeOrderStatus } from "@/db/api";
import type { UsdtDepositRecord } from "@/types/types";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// ── 本地圖片資源
const BODY_BG       = require("../../../assets/page-img/page_bg.webp");
const IMG_ICON9     = require("../../../assets/page-img/icon9.png");
const IMG_LIST_TOP  = require("../../../assets/page-img/wallet_list_top.png");
const IMG_LIST_MID  = require("../../../assets/page-img/wallet_list_mid.png");
const IMG_LIST_BOT  = require("../../../assets/page-img/wallet_list_bot.png");
const IMG_MODAL_BG    = require("../../../assets/page-img/bg20.png");
const IMG_CARD_FRAME  = require("../../../assets/page-img/deposit_desc_frame.png");
const IMG_BTN_GENERATE = require("../../../assets/page-img/generate_active.png");
const ICON_STEP1_ACTIVE  = require("../../../assets/page-img/num1_active.png");
const ICON_STEP1_DEFAULT = require("../../../assets/page-img/num1_idle.png");
const ICON_STEP2_ACTIVE  = require("../../../assets/page-img/num2_active.png");
const ICON_STEP2_DEFAULT = require("../../../assets/page-img/num2_idle.png");

const PAGE_SIZE = 15;
const CARD_GAP = 12;
const CARD_PAD_H = 16;
const CARD_PAD_V = 16;
const SUB_GAP = 8;

type ActiveTab = "deposit" | "records";

function StatusBadge({ status }: { status: UsdtDepositRecord["status"] }) {
  const cfg = status === "confirmed"
    ? { label: "已確認", bg: "#22C55E18", border: "#22C55E40", color: "#22C55E" }
    : { label: "待確認", bg: "#EAB30818", border: "#EAB30840", color: "#EAB308" };
  return (
    <View className="px-2 py-0.5 rounded-full"
      style={{ backgroundColor: cfg.bg, borderWidth: 1, borderColor: cfg.border }}>
      <Text allowFontScaling={false} style={{ color: cfg.color, fontSize: 11, fontWeight: "700" }}>{cfg.label}</Text>
    </View>
  );
}

function shortHash(hash: string): string {
  if (hash.length <= 16) return hash;
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
}

function fmtCountdown(secs: number): string {
  const m = Math.floor(secs / 60).toString().padStart(2, "0");
  const s = (secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export default function DepositRecordsScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const userId = session?.user.id ?? "";

  // ── Tab 狀態
  const [activeTab, setActiveTab] = useState<ActiveTab>("deposit");

  // ── 充值記錄狀態
  const [records, setRecords] = useState<UsdtDepositRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [recordsLoading, setRecordsLoading] = useState(false);

  // ── 充值表單狀態（三步流程）step 0=輸入金額 1=等待支付 2=到賬成功
  const [dpStep, setDpStep] = useState(0);
  const [dpAmount, setDpAmount] = useState("");
  const [dpAmountErr, setDpAmountErr] = useState("");
  const [dpCreating, setDpCreating] = useState(false);
  const [dpPaymentId, setDpPaymentId] = useState("");
  const [dpPayAddress, setDpPayAddress] = useState("");
  const [dpPayAmount, setDpPayAmount] = useState(0);
  const [dpExpiresAt, setDpExpiresAt] = useState("");
  const [dpCountdown, setDpCountdown] = useState(0);
  const [dpCopied, setDpCopied] = useState(false);
  const [dpCredited, setDpCredited] = useState(0);
  const [dpIsSandbox, setDpIsSandbox] = useState(false);
  const dpCreatingRef = useRef(false);
  const dpPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── 充值倒計時
  useEffect(() => {
    if (dpStep !== 1 || !dpExpiresAt) return;
    const tick = () => {
      const secs = Math.max(0, Math.floor((new Date(dpExpiresAt).getTime() - Date.now()) / 1000));
      setDpCountdown(secs);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [dpStep, dpExpiresAt]);

  // ── 充值狀態輪詢（每15秒）
  useEffect(() => {
    if (dpStep !== 1 || !dpPaymentId) return;
    const poll = async () => {
      const order = await getRechargeOrderStatus(dpPaymentId);
      if (!order) return;
      if (order.status === "finished") {
        setDpCredited(order.actually_paid || order.price_amount);
        setDpStep(2);
        loadPage(0);
        setPage(0);
      } else if (order.status === "expired" || order.status === "failed") {
        setDpStep(0);
        setDpAmountErr("訂單已過期或失敗，請重新建立充值訂單");
      }
    };
    poll();
    dpPollRef.current = setInterval(poll, 15000);
    return () => { if (dpPollRef.current) clearInterval(dpPollRef.current); };
  }, [dpStep, dpPaymentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const resetDeposit = () => {
    setDpStep(0); setDpAmount(""); setDpAmountErr(""); setDpCreating(false);
    setDpPaymentId(""); setDpPayAddress(""); setDpPayAmount(0);
    setDpExpiresAt(""); setDpCountdown(0); setDpCopied(false);
    setDpCredited(0); setDpIsSandbox(false);
    if (dpPollRef.current) clearInterval(dpPollRef.current);
  };

  const handleCreateRecharge = async () => {
    if (dpCreatingRef.current) return;
    const amt = parseFloat(dpAmount);
    if (!dpAmount || isNaN(amt) || amt < 1) { setDpAmountErr("最低充值金額為 1 USDT"); return; }
    if (amt > 100000) { setDpAmountErr("單筆充值上限為 100,000 USDT"); return; }
    setDpAmountErr("");
    dpCreatingRef.current = true;
    setDpCreating(true);
    const { data, error } = await createRechargeOrder(amt);
    dpCreatingRef.current = false;
    setDpCreating(false);
    if (error || !data) { setDpAmountErr(error ?? "建立充值訂單失敗，請重試"); return; }
    setDpPaymentId(data.payment_id);
    setDpPayAddress(data.pay_address);
    setDpPayAmount(data.pay_amount);
    setDpExpiresAt(data.expires_at);
    setDpIsSandbox(data.is_sandbox ?? false);
    setDpStep(1);
  };

  const handleCopyAddress = async () => {
    await Clipboard.setStringAsync(dpPayAddress);
    setDpCopied(true);
    setTimeout(() => setDpCopied(false), 2000);
  };

  // ── 載入充值記錄
  const loadPage = useCallback(async (p: number) => {
    if (!userId) return;
    setRecordsLoading(true);
    const res = await getUsdtDepositRecords(userId, PAGE_SIZE, p * PAGE_SIZE);
    setRecords(res.data);
    setTotal(res.total);
    setRecordsLoading(false);
  }, [userId]);

  useFocusEffect(useCallback(() => {
    (async () => { setPage(0); await loadPage(0); })();
  }, [loadPage]));

  const handlePage = (next: number) => { setPage(next); loadPage(next); };
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasPrev = page > 0;
  const hasNext = (page + 1) * PAGE_SIZE < total;

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <StatusBar style="light" />
      <ExpoImage source={BODY_BG} style={StyleSheet.absoluteFillObject} contentFit="cover" priority="high" cachePolicy="memory-disk" />

      {/* ── 頂部標題 */}
      <View style={{ paddingTop: insets.top + 16, paddingBottom: 12, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Pressable onPress={() => router.back()} className="active:opacity-70">
          <ExpoImage source={IMG_ICON9} style={{ width: 24, height: 24 }} contentFit="contain" />
        </Pressable>
        <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 20, fontWeight: "800", flex: 1 }}>充值</Text>
        {activeTab === "records" && (
          <Text allowFontScaling={false} style={{ color: "#E8520A", fontSize: 13 }}>共 {total} 條</Text>
        )}
      </View>

      {/* ── Tab 切換（與提現頁完全相同樣式） */}
      <View style={{ marginHorizontal: 16, marginBottom: 12, height: 48, borderRadius: 12, overflow: "hidden" }}>
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "#1a0e06", borderRadius: 12, borderWidth: 1, borderColor: "rgba(222,121,45,0.45)" }} />
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, paddingHorizontal: 6, paddingVertical: 6, flexDirection: "row", gap: 6 }}>
          {(["deposit", "records"] as ActiveTab[]).map((tab) => {
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
                    {tab === "deposit" ? "我要充值" : "充值記錄"}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* ── 我要充值 Tab（弹窗卡片背景，高度随内容自适应） */}
      {activeTab === "deposit" && (
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        >
        <View style={{ position: "relative", overflow: "hidden", backgroundColor: "#000", borderRadius: 20, marginHorizontal: 16, paddingTop: 12 }}>
          <ExpoImage source={IMG_MODAL_BG} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="fill" />
          <KeyboardAvoidingView behavior={process.env.EXPO_OS === "ios" ? "padding" : undefined}>
            <View className="gap-4" style={{ paddingHorizontal: 16, paddingBottom: 24 }}>
              {/* ── Step 0：輸入金額 */}
              {dpStep === 0 && (
                <>
                  <View style={{ position: "relative" }}>
                    <ExpoImage source={IMG_CARD_FRAME} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 16 }} contentFit="fill" />
                    <View className="px-4 pt-4 pb-4 gap-3">
                      <Text allowFontScaling={false} className="text-sm font-semibold" style={{ color: "#FFFFFF" }}>充值金額</Text>
                      <View className="flex-row items-center gap-3">
                        <TextInput
                          className="flex-1 px-4 py-3.5 rounded-xl"
                          style={{ backgroundColor: "#111111", borderWidth: 1, borderColor: "#2E2E2E", fontSize: 14, color: "#FFFFFF" }}
                          value={dpAmount}
                          onChangeText={(v) => { setDpAmount(v.replace(/[^0-9.]/g, "")); setDpAmountErr(""); }}
                          placeholder="請輸入充值金額"
                          placeholderTextColor="#475569"
                          underlineColorAndroid="transparent"
                          keyboardType="decimal-pad"
                          allowFontScaling={false}
                        />
                        <Text allowFontScaling={false} style={{ color: "#E8520A", fontWeight: "700", fontSize: 14 }}>USDT</Text>
                      </View>
                      <View className="flex-row gap-2">
                        {[10, 50, 100, 500].map((v) => (
                          <Pressable key={v} onPress={() => { setDpAmount(String(v)); setDpAmountErr(""); }}
                            className="flex-1 py-2 rounded-lg items-center active:opacity-70"
                            style={{ backgroundColor: dpAmount === String(v) ? "#E8520A30" : "#0A0A0A", borderWidth: 1, borderColor: dpAmount === String(v) ? "#E8520A" : "#FFFFFF15" }}>
                            <Text allowFontScaling={false} style={{ color: dpAmount === String(v) ? "#E8520A" : "#94A3B8", fontSize: 13, fontWeight: "600" }}>{v}</Text>
                          </Pressable>
                        ))}
                      </View>
                      {dpAmountErr ? (
                        <View className="flex-row items-center gap-1.5">
                          <AlertCircle size={13} color="#F43F5E" />
                          <Text allowFontScaling={false} style={{ color: "#F43F5E", fontSize: 12, flex: 1 }} numberOfLines={2}>{dpAmountErr}</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>

                  <View style={{ position: "relative" }}>
                    <ExpoImage source={IMG_CARD_FRAME} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 12 }} contentFit="fill" />
                    <View className="px-4 py-3 gap-1.5">
                      <Text allowFontScaling={false} style={{ color: "#A5B4FC", fontSize: 12, fontWeight: "700", marginBottom: 2 }}>充值說明</Text>
                      {["系統為您生成專屬收款地址", "僅支援 BSC 鏈（BEP-20）USDT"].map((tip, i) => (
                        <Text allowFontScaling={false} key={i} className="text-xs text-muted-foreground">• {tip}</Text>
                      ))}
                    </View>
                  </View>

                  <Pressable
                    onPress={handleCreateRecharge}
                    disabled={dpCreating}
                    className="active:opacity-80"
                    style={{ position: "relative", height: 52, justifyContent: "center", alignItems: "center" }}>
                    <ExpoImage source={IMG_BTN_GENERATE} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 12 }} contentFit="fill" />
                    {dpCreating
                      ? <View className="flex-row items-center gap-2">
                          <ActivityIndicator size="small" color="#fff" />
                          <Text allowFontScaling={false} style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>正在生成專屬地址...</Text>
                        </View>
                      : <Text allowFontScaling={false} style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>生成專屬充值地址</Text>
                    }
                  </Pressable>
                </>
              )}

              {/* ── Step 1：等待支付（顯示專屬地址） */}
              {dpStep === 1 && (
                <>
                  {dpIsSandbox && (
                    <View className="flex-row items-center gap-2 px-4 py-3 rounded-xl"
                      style={{ backgroundColor: "#F59E0B15", borderWidth: 1, borderColor: "#F59E0B50" }}>
                      <Text allowFontScaling={false} style={{ fontSize: 16 }}>⚡</Text>
                      <View className="flex-1">
                        <Text allowFontScaling={false} style={{ color: "#F59E0B", fontWeight: "700", fontSize: 13 }}>沙箱測試模式</Text>
                        <Text allowFontScaling={false} style={{ color: "#92400E", fontSize: 11, marginTop: 1 }}>当前为测试环境，充值不会产生真实资金流动</Text>
                      </View>
                    </View>
                  )}

                  {/* 步驟指示器 */}
                  <View className="flex-row items-center justify-center gap-2 pb-1">
                    {["輸入金額", "等待到賬"].map((label, i) => {
                      const stepIcon = i === 0
                        ? (dpStep >= i ? ICON_STEP1_ACTIVE : ICON_STEP1_DEFAULT)
                        : (dpStep >= i ? ICON_STEP2_ACTIVE : ICON_STEP2_DEFAULT);
                      return (
                        <View key={i} className="flex-row items-center gap-2">
                          <View className="flex-row items-center gap-1.5">
                            <ExpoImage source={stepIcon} style={{ width: 20, height: 20 }} contentFit="contain" />
                            <Text allowFontScaling={false} style={{ color: dpStep >= i ? "#FFDDBB" : "#FFFFFF40", fontSize: 12 }}>{label}</Text>
                          </View>
                          {i === 0 && <View className="w-8 h-px" style={{ backgroundColor: dpStep >= 1 ? "#E8520A" : "#1E293B" }} />}
                        </View>
                      );
                    })}
                  </View>

                  <View style={{ position: "relative" }}>
                    <ExpoImage source={IMG_CARD_FRAME} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 12 }} contentFit="fill" />
                    <View className="flex-row items-center justify-between px-4 py-3">
                      <View className="flex-row items-center gap-2">
                        <Clock size={14} color={dpCountdown < 120 ? "#F43F5E" : "#E8520A"} />
                        <Text allowFontScaling={false} style={{ color: dpCountdown < 120 ? "#F43F5E" : "#FFFFFF", fontSize: 13, fontWeight: "600" }}>
                          地址有效期：{fmtCountdown(dpCountdown)}
                        </Text>
                      </View>
                      <View className="flex-row items-center gap-1.5">
                        <Loader size={12} color="#E8520A" />
                        <Text allowFontScaling={false} style={{ color: "#FFFFFF", fontSize: 11 }}>自動檢測到賬</Text>
                      </View>
                    </View>
                  </View>

                  <View style={{ position: "relative" }}>
                    <ExpoImage source={IMG_CARD_FRAME} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 12 }} contentFit="fill" />
                    <View className="px-4 py-3 items-center">
                      <Text allowFontScaling={false} style={{ color: "#94A3B8", fontSize: 12 }}>請轉入精確金額</Text>
                      <Text allowFontScaling={false} style={{ color: "#22C55E", fontSize: 28, fontWeight: "800", fontFamily: "monospace", marginTop: 2 }}>
                        {dpPayAmount > 0 ? dpPayAmount.toFixed(2) : dpAmount} USDT
                      </Text>
                    </View>
                  </View>

                  <View style={{ position: "relative" }}>
                    <ExpoImage source={IMG_CARD_FRAME} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 12 }} contentFit="fill" />
                    <View className="px-4 pt-3 pb-2">
                      <Text allowFontScaling={false} className="text-xs mb-1.5" style={{ color: "#FFFFFF" }}>您的專屬充值地址（BSC鏈 BEP-20）</Text>
                      <View className="flex-row items-center gap-2">
                        <Text allowFontScaling={false} style={{ color: "#FFDDBB", fontSize: 11, fontFamily: "monospace", flex: 1 }} numberOfLines={2}>{dpPayAddress}</Text>
                        <Pressable onPress={handleCopyAddress} className="active:opacity-70 p-2 rounded-lg"
                          style={{ backgroundColor: dpCopied ? "#22C55E20" : "#E8520A20", borderWidth: 1, borderColor: dpCopied ? "#22C55E50" : "#E8520A50" }}>
                          {dpCopied ? <Check size={16} color="#22C55E" /> : <Copy size={16} color="#E8520A" />}
                        </Pressable>
                      </View>
                      {dpCopied && <Text allowFontScaling={false} style={{ color: "#22C55E", fontSize: 11, marginTop: 4 }}>✓ 已複製</Text>}
                    </View>
                  </View>

                  <View className="items-center py-2 rounded-2xl"
                    style={{ backgroundColor: "#0A0A0A", borderWidth: 1, borderColor: "#FFFFFF15" }}>
                    <View className="flex-row items-center gap-1.5 mb-1.5">
                      <QrCode size={14} color="#FFFFFF60" />
                      <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 12 }}>掃碼充值</Text>
                    </View>
                    <View className="p-2 rounded-xl" style={{ backgroundColor: "#FFFFFF" }}>
                      <QRCode value={dpPayAddress} size={104} color="#000000" backgroundColor="#FFFFFF" />
                    </View>
                    <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 11, marginTop: 6 }}>開啟錢包 App 掃描二維碼，或複製地址貼上轉賬</Text>
                  </View>

                  <View style={{ position: "relative" }}>
                    <ExpoImage source={IMG_CARD_FRAME} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 12 }} contentFit="fill" />
                    <View className="px-3 py-2.5 gap-1">
                      <Text allowFontScaling={false} style={{ color: "#EAB308", fontSize: 12, fontWeight: "700" }}>⚠️ 重要提醒</Text>
                      {["此地址過期後請勿再次轉入，需重新生成", "轉錯鏈（非BSC）將無法找回資金"].map((tip, i) => (
                        <Text allowFontScaling={false} key={i} style={{ color: "#FFFFFF60", fontSize: 11 }} numberOfLines={2}>• {tip}</Text>
                      ))}
                    </View>
                  </View>

                  <View style={{ alignItems: "center" }}>
                    <Pressable onPress={() => { setDpStep(0); setDpAmountErr(""); }}
                      className="active:opacity-70 px-8 py-3 rounded-xl"
                      style={{ backgroundColor: "#FFFFFF10", borderWidth: 1, borderColor: "#FFFFFF20" }}>
                      <Text allowFontScaling={false} style={{ color: "#FFFFFF80", fontSize: 14 }}>重新生成</Text>
                    </Pressable>
                  </View>
                </>
              )}

              {/* ── Step 2：到賬成功 */}
              {dpStep === 2 && (
                <>
                  {dpIsSandbox && (
                    <View className="flex-row items-center justify-center gap-2 px-4 py-2 rounded-xl"
                      style={{ backgroundColor: "#F59E0B15", borderWidth: 1, borderColor: "#F59E0B50" }}>
                      <Text allowFontScaling={false} style={{ color: "#F59E0B", fontSize: 12, fontWeight: "700" }}>⚡ 沙箱測試模式 — 非真實充值</Text>
                    </View>
                  )}
                  <View className="items-center py-8 gap-4">
                    <View className="w-20 h-20 rounded-full items-center justify-center"
                      style={{ backgroundColor: "#22C55E20", borderWidth: 2, borderColor: "#22C55E50" }}>
                      <CheckCircle size={40} color="#22C55E" />
                    </View>
                    <View className="items-center gap-1">
                      <Text allowFontScaling={false} className="text-xl font-bold" style={{ color: "#FFFFFF" }}>充值成功！</Text>
                      <Text allowFontScaling={false} style={{ color: "#22C55E", fontSize: 32, fontWeight: "800", fontFamily: "monospace" }}>
                        +{dpCredited.toFixed(2)} USDT
                      </Text>
                      <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 14 }}>已自動充入您的錢包賬戶</Text>
                    </View>
                  </View>

                  <Pressable
                    onPress={() => resetDeposit()}
                    className="py-4 rounded-xl items-center active:opacity-70"
                    style={{ backgroundColor: "#E8520A" }}>
                    <Text allowFontScaling={false} style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>再次充值</Text>
                  </Pressable>

                  <Pressable
                    className="flex-row items-center justify-center gap-2 py-3 active:opacity-70"
                    onPress={() => { resetDeposit(); setActiveTab("records"); }}>
                    <FileText size={14} color="#E8520A" />
                    <Text allowFontScaling={false} style={{ color: "#E8520A", fontSize: 14 }}>檢視充值記錄</Text>
                  </Pressable>
                </>
              )}
            </View>
        </KeyboardAvoidingView>
        </View>
        </ScrollView>
      )}

      {/* ── 充值記錄 Tab */}
      {activeTab === "records" && (
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 120 }}
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
              ) : records.length === 0 ? (
                <View style={{ paddingVertical: 48, alignItems: "center", gap: SUB_GAP }}>
                  <ExpoImage source={require("../../../assets/page-img/records_ui.png")} style={{ width: 80, height: 80 }} contentFit="contain" />
                  <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 14 }}>暫無充值記錄</Text>
                  <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 12 }}>完成充值後記錄將顯示在此處</Text>
                </View>
              ) : (
                <View style={{ gap: SUB_GAP }}>
                  {records.map((rec, idx) => {
                    const dt = new Date(rec.created_at);
                    const dateStr = dt.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
                    const timeStr = dt.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
                    return (
                      <View key={rec.id} style={{ gap: SUB_GAP }}>
                        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
                            <Text allowFontScaling={false} style={{ color: "#22C55E", fontWeight: "900", fontSize: 18, fontFamily: "monospace" }}>
                              +{Number(rec.amount).toFixed(2)}
                            </Text>
                            <Text allowFontScaling={false} style={{ color: "#22C55E", fontSize: 12, fontWeight: "700" }}>{rec.currency}</Text>
                          </View>
                          <StatusBadge status={rec.status} />
                        </View>
                        <View>
                          <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 12, marginBottom: 2 }}>交易哈希</Text>
                          <Text allowFontScaling={false} style={{ color: "#E8520A", fontSize: 11, fontFamily: "monospace" }}>{shortHash(rec.tx_hash)}</Text>
                        </View>
                        {rec.to_address && (
                          <View>
                            <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 12, marginBottom: 2 }}>到賬地址</Text>
                            <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 11, fontFamily: "monospace" }}>{shortHash(rec.to_address)}</Text>
                          </View>
                        )}
                        <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 12 }}>{dateStr}  {timeStr}</Text>
                        {idx < records.length - 1 && (
                          <View style={{ height: 1, backgroundColor: "#FFFFFF10", marginTop: SUB_GAP }} />
                        )}
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          </View>

          {totalPages > 1 && (
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: CARD_GAP }}>
              <Pressable onPress={() => hasPrev && handlePage(page - 1)} disabled={!hasPrev}
                className="flex-row items-center gap-1 px-3 py-2 rounded-lg active:opacity-70"
                style={{ backgroundColor: "#0A0A0A", borderWidth: 1, borderColor: hasPrev ? "#FFFFFF15" : "#FFFFFF10", opacity: hasPrev ? 1 : 0.4 }}>
                <ChevronLeft size={14} color="#FFFFFF60" />
                <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 13 }}>上一頁</Text>
              </Pressable>
              <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 12 }}>第 {page + 1} / {totalPages} 頁</Text>
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


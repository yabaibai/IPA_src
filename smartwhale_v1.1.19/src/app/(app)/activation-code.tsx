/* eslint-disable no-undef */
import { useState, useEffect } from "react";
import {
  View, Text, ScrollView, Pressable, ActivityIndicator, Modal, StyleSheet,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Key, ShoppingBag, Gift, CheckCircle, Copy } from "lucide-react-native";
import * as Clipboard from "expo-clipboard";
import { LinearGradient } from "expo-linear-gradient";
import { useSession } from "@/ctx";
import { getProfile, getWalletBalance, getWhalePool } from "@/db/api";
import { sharedGet } from "@/lib/requestDedup";
import { supabase } from "@/client/supabase";
import type { Profile, WalletBalance, WhalePool } from "@/types/types";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const IMG_BACK         = require("../../../assets/page-img/icon9.png");
const BG_IMG           = require("../../../assets/page-img/page_bg.webp");
const IMG_WALLET_BG    = require("../../../assets/page-img/mine_bg1.png");          // 我的錢包卡片背景 987×297
const IMG_SUPERIOR_BG  = require("../../../assets/page-img/superior_card_bg.png");  // 上級資訊卡片背景 987×533
const IMG_TEAM_BG      = require("../../../assets/page-img/bg31.png");              // 推廣中心-團隊總數卡片背景 977×508
const IMG_BTN          = require("../../../assets/page-img/btg222.png");             // 退出登錄按鈕背景 653×101
const IMG_DIALOG_BG    = require("../../../assets/page-img/mine_dialog_bg.png");     // 彈窗背景 983×778
const IMG_DIALOG_ICON  = require("../../../assets/page-img/icon_activation_key.png"); // 啟用碼鑰匙圖標 143×142
const IMG_ACTIVATION_UI = require("../../../assets/page-img/activation_code_ui.png"); // 用戶上傳激活碼 UI 圖標 143×142（顯示 76×76）
const IMG_ICON30       = require("../../../assets/page-img/mine_icon30.png");        // 領取成功圖標 142×142
const IMG_BTN_CONFIRM  = require("../../../assets/page-img/mine_btn_confirm.png");   // 確認按鈕 390×121
const IMG_BTN_CANCEL   = require("../../../assets/page-img/mine_btn_cancel.png");    // 取消按鈕

// ─── 彈窗尺寸（對齊 style002 ReceiveDialog）───────────────────────
function useDialogDims() {
  const { width: screenW } = useWindowDimensions();
  const contentW = screenW - 64;
  const bgH = contentW * (778 / 983); // mine_dialog_bg 983×778
  return { contentW, bgH };
}
function DialogBtn({
  source, label, onPress, ratio = 390 / 121,
}: {
  source: ReturnType<typeof require>; label: string;
  onPress: () => void; ratio?: number;
}) {
  const { contentW } = useDialogDims();
  const btnH = (contentW * 0.45) / ratio;
  return (
    <Pressable className="active:opacity-80" onPress={onPress}
      style={{ flex: 1, height: btnH, position: "relative" }}>
      <Image source={source} style={StyleSheet.absoluteFillObject} contentFit="fill" />
      <View style={[StyleSheet.absoluteFillObject, { alignItems: "center", justifyContent: "center" }]}>
        <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>{label}</Text>
      </View>
    </Pressable>
  );
}

// ─── SuccessModal：領取成功 / 購買成功彈窗（對齊 style002 ReceiveDialog）─────
function SuccessModal({
  visible, title, amount, subText, btnLabel, onClose,
}: {
  visible: boolean; title: string; amount?: string; subText?: string;
  btnLabel: string; onClose: () => void;
}) {
  const { contentW, bgH } = useDialogDims();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.9)", alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}
        onPress={onClose}
      >
        <Pressable onPress={(e) => e.stopPropagation()} style={{ width: contentW, height: bgH }}>
          <Image source={IMG_DIALOG_BG} style={StyleSheet.absoluteFillObject} contentFit="fill" />
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 20 }}>
            {/* 頂部圖標：mine_icon30 領取成功圖標 52×52 */}
            <Image source={IMG_ICON30} style={{ width: 52, height: 52 }} contentFit="contain" />
            {/* 標題 */}
            <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 20, fontWeight: "800", marginTop: 8 }}>{title}</Text>
            {/* 金額（可選）*/}
            {!!amount && (
              <Text allowFontScaling={false} style={{ color: "#DE792D", fontSize: 24, fontWeight: "800", marginVertical: 4 }}>{amount}</Text>
            )}
            {/* 副文字 */}
            {!!subText && (
              <Text allowFontScaling={false} style={{ color: "#999999", fontSize: 12, marginBottom: 16, textAlign: "center", lineHeight: 18 }}>{subText}</Text>
            )}
            {/* 單按鈕居中 52% */}
            <View style={{ flexDirection: "row", width: "52%" }}>
              <DialogBtn source={IMG_BTN_CONFIRM} label={btnLabel} onPress={onClose} />
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function CodeDisplay({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await Clipboard.setStringAsync(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <View style={{ width: "100%", borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: "#E8520A40" }}>
      {/* 頂部橙色高光線 */}
      <LinearGradient
        colors={["rgba(232,82,10,0)", "rgba(232,82,10,0.6)", "rgba(232,82,10,0)"]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1.5 }}
      />
      <View style={{ backgroundColor: "#000000", flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14 }}>
        <Key size={14} color="#E8520A" style={{ marginRight: 8 }} />
        <Text allowFontScaling={false} style={{ flex: 1, color: "#F5A660", fontSize: 18, fontWeight: "900", fontFamily: "monospace", letterSpacing: 4 }}>
          {code}
        </Text>
        <Pressable onPress={handleCopy} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: copied ? "#22C55E20" : "#E8520A20", borderWidth: 1, borderColor: copied ? "#22C55E50" : "#E8520A40" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Copy size={13} color={copied ? "#22C55E" : "#E8520A"} />
            <Text allowFontScaling={false} style={{ color: copied ? "#22C55E" : "#E8520A", fontSize: 12, fontWeight: "600" }}>
              {copied ? "已複製" : "複製"}
            </Text>
          </View>
        </Pressable>
      </View>
    </View>
  );
}

export default function ActivationCodeScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  // 源頭修復：進入頁面先校驗 userId 是否就緒（依賴 JWT 的寫操作需 session 就緒）
  const userId = session?.user.id ?? "";

  const [profile, setProfile] = useState<Profile | null>(null);
  const [wallet, setWallet] = useState<WalletBalance | null>(null);
  const [pool, setPool] = useState<WhalePool | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [purchaseVisible, setPurchaseVisible] = useState(false);
  const [purchaseSuccess, setPurchaseSuccess] = useState(false);
  const [purchaseSuccessVisible, setPurchaseSuccessVisible] = useState(false);
  const [_message, setMessage] = useState("");
  // 從服務端動態讀取啟用碼價格（預設 5 USDT）
  const [currentPrice, setCurrentPrice] = useState(5);

  const loadData = async () => {
    setLoading(true);
    // profile/wallet/pool 走共用 sharedGet 缓存（与其他页共享，秒显；失败退避重试）；system_config 为私有
    const [p, w, po, cfg] = await Promise.all([
      sharedGet("profile", () => getProfile(userId), { shared: true }).catch(() => null),
      sharedGet("wallet", () => getWalletBalance(userId), { shared: true }).catch(() => null),
      sharedGet("pool", () => getWhalePool(userId), { shared: true }).catch(() => null),
      supabase.from("system_config").select("config_val").eq("config_key", "activation_code_price").maybeSingle(),
    ]);
    setProfile(p);
    setWallet(w);
    setPool(po);
    if (cfg.data?.config_val) {
      const parsed = parseFloat(cfg.data.config_val);
      if (!isNaN(parsed) && parsed > 0) setCurrentPrice(parsed);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [userId]);

  const handlePurchase = async () => {
    if ((wallet?.usdt_balance ?? 0) < currentPrice) {
      setMessage(`USDT餘額不足，需 ${currentPrice} USDT`);
      setPurchaseVisible(false);
      return;
    }
    setPurchasing(true);
    // ── 呼叫服務端 Edge Function，原子事務完成扣款+啟用碼寫入 ──
    const { data, error } = await supabase.functions.invoke("purchase-activation-code", { body: {} });
    setPurchasing(false);
    setPurchaseVisible(false);
    if (error || !data?.success) {
      // 非 2xx 時 data 為 null，真正的響應體在 error.context
      let errMsg = data?.error;
      if (!errMsg && error) {
        try { const b = await (error as any).context?.json?.(); errMsg = b?.error; } catch {}
        if (!errMsg || (error.message ?? "").toLowerCase().includes("non-2xx")) errMsg = undefined;
        errMsg = errMsg ?? "購買失敗，請重試";
      }
      setMessage(errMsg ?? "購買失敗，請重試");
      return;
    }
    setPurchaseSuccess(true);
    setPurchaseVisible(false);
    setPurchaseSuccessVisible(true);
    await loadData();
  };

  if (!userId) {
    return (
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        <StatusBar style="light" />
        <Image source={BG_IMG} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="cover" priority="high" cachePolicy="memory-disk" />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color="#E8520A" />
          <Text allowFontScaling={false} style={{ color: "#999", fontSize: 13, marginTop: 12 }}>用戶信息校驗中…</Text>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        <StatusBar style="light" />
        <Image source={BG_IMG} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="cover" priority="high" cachePolicy="memory-disk" />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color="#E8520A" />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <StatusBar style="light" />
      {/* 全屏背景圖 */}
      <Image source={BG_IMG} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="cover" contentPosition={{ top: 0, left: "50%" }} priority="high" cachePolicy="memory-disk" />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      >
        {/* 頂部導航（對齊推廣獎勵頁風格）*/}
        <View style={{ paddingTop: insets.top + 12, paddingBottom: 12, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Pressable onPress={() => router.back()} className="active:opacity-70">
            <Image source={IMG_BACK} style={{ width: 24, height: 24 }} contentFit="contain" />
          </Pressable>
          <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 20, fontWeight: "800" }}>啟用碼專區</Text>
        </View>

        {/* 商戶互斥：已成為商戶，不可再啟用算力池 */}
        {profile?.is_merchant ? (
          <View className="mx-4 rounded-2xl p-6 items-center gap-3"
            style={{ backgroundColor: "#22C55E10", borderWidth: 1, borderColor: "#22C55E40" }}>
            <Text allowFontScaling={false} style={{ fontSize: 48 }}>🏪</Text>
            <Text allowFontScaling={false} style={{ color: "#FFFFFF", fontSize: 20, fontWeight: "700" }}>商戶賬號無需啟用算力池</Text>
            <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 14, textAlign: "center", lineHeight: 20 }}>
              您已是鲸算商户，商户账号与算力池账号互斥。{"\n"}
              商户享有0手续费转账与收款SMT奖励权益，无需激活算力池。
            </Text>
            <Pressable
              className="py-3 px-10 rounded-xl items-center active:opacity-70"
              style={{ backgroundColor: "#22C55E20", borderWidth: 1, borderColor: "#22C55E50" }}
              onPress={() => router.push("/(app)/merchant-center" as any)}
            >
              <Text allowFontScaling={false} style={{ color: "#22C55E", fontWeight: "700", fontSize: 16 }}>前往商戶中心</Text>
            </Pressable>
          </View>

        ) : /* 已有啟用碼（含購買後未啟用 / 抽獎中獎後未啟用）：直接展示啟用碼，隱藏抽獎和購買入口 */
        profile?.activation_code && !pool?.is_active && !profile?.is_activated ? (
          /* 啟用碼已到賬卡片：推廣中心團隊總數卡片背景 bg31.png */
          <View style={{ marginHorizontal: 16, marginBottom: 20, borderRadius: 16, overflow: "hidden" }}>
            <Image source={IMG_TEAM_BG} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="fill" />
            <View style={{ paddingHorizontal: 20, paddingVertical: 28, gap: 20, alignItems: "center" }}>
              <Image source={IMG_ACTIVATION_UI} style={{ width: 76, height: 76 }} contentFit="contain" />
              <View style={{ alignItems: "center", gap: 8 }}>
                {/* Title Large 20 bold */}
                <Text allowFontScaling={false} style={{ color: "#F5A660", fontSize: 20, fontWeight: "800" }}>啟用碼已到賬</Text>
                {/* Caption 14 */}
                <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 14, textAlign: "center" }}>您的專屬啟用碼已生成，請妥善保管</Text>
              </View>
              <View style={{ width: "100%" }}>
                <CodeDisplay code={profile.activation_code} />
              </View>
              {/* 馬上啟用按鈕：確認升級彈窗確認按鈕背景 mine_btn_confirm.png，寬度 50% */}
              <View style={{ alignItems: "center", width: "100%" }}>
                <View style={{ position: "relative", width: "50%" }}>
                  <Image source={IMG_BTN_CONFIRM} style={{ width: "100%", aspectRatio: 390 / 121 }} contentFit="fill" />
                  <Pressable
                    className="active:opacity-80"
                    style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}
                    onPress={() => router.push("/(app)/(tabs)/pool" as any)}
                  >
                    {/* Body 16 bold */}
                    <Text allowFontScaling={false} style={{ color: "#fff", fontWeight: "800", fontSize: 16, letterSpacing: 1 }}>馬上啟用</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </View>

        ) : /* 已啟用狀態：算力池已執行 */
        profile?.is_activated && pool?.is_active ? (
          <View className="mx-4 rounded-2xl p-6 items-center gap-4"
            style={{ backgroundColor: "#22C55E10", borderWidth: 1, borderColor: "#22C55E40" }}>
            <CheckCircle size={40} color="#22C55E" />
            <View className="items-center gap-2">
              {/* Title Large 20 bold */}
              <Text allowFontScaling={false} style={{ color: "#FFFFFF", fontSize: 20, fontWeight: "800" }}>算力池已啟用</Text>
              {/* Caption 14 */}
              <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 14, textAlign: "center" }}>您已擁有啟用碼，可正常使用全部功能</Text>
            </View>
            {/* 啟用碼展示 */}
            {profile?.activation_code && (
              <CodeDisplay code={profile.activation_code} />
            )}
          </View>

        ) : profile?.is_activated && !pool?.is_active ? (
          /* 激活码已到账卡片：推广中心团队总数卡片背景 bg31.png */
          <View style={{ marginHorizontal: 16, marginBottom: 20, borderRadius: 16, overflow: "hidden" }}>
            <Image source={IMG_TEAM_BG} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="fill" />
            <View style={{ paddingHorizontal: 20, paddingVertical: 28, gap: 20, alignItems: "center" }}>
              <Image source={IMG_ACTIVATION_UI} style={{ width: 76, height: 76 }} contentFit="contain" />

              {/* 標題 + 副標題 */}
              <View style={{ alignItems: "center", gap: 8 }}>
                {/* Title Large 20 bold */}
                <Text allowFontScaling={false} style={{ color: "#F5A660", fontSize: 20, fontWeight: "800" }}>
                  激活码已到账
                </Text>
                {/* Caption 14 */}
                <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 14, textAlign: "center" }}>
                  您的專屬啟用碼已生成，請妥善保管
                </Text>
              </View>

              {/* 啟用碼展示 */}
              {profile?.activation_code && (
                <View style={{ width: "100%" }}>
                  <CodeDisplay code={profile.activation_code} />
                </View>
              )}

              {/* 馬上啟用按鈕：確認升級彈窗確認按鈕背景 mine_btn_confirm.png，寬度 50% */}
              <View style={{ alignItems: "center", width: "100%" }}>
                <View style={{ position: "relative", width: "50%" }}>
                  <Image source={IMG_BTN_CONFIRM} style={{ width: "100%", aspectRatio: 390 / 121 }} contentFit="fill" />
                  <Pressable
                    className="active:opacity-80"
                    style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}
                    onPress={() => router.push("/(app)/(tabs)/pool" as any)}
                  >
                    {/* Body 16 bold */}
                    <Text allowFontScaling={false} style={{ color: "#fff", fontWeight: "800", fontSize: 16, letterSpacing: 1 }}>馬上啟用</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </View>

        ) : (
          <>
            {/* 免費抽取區 — 我的錢包卡片背景 mine_bg1 987×297 */}
            <View style={{ marginHorizontal: 16, marginBottom: 12 }}>
              <View style={{ borderRadius: 16, overflow: "hidden" }}>
                {/* 卡片背景圖 */}
                <Image source={IMG_WALLET_BG} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="fill" />
                {/* 內容 */}
                <View style={{ padding: 20 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 }}>
                    <View style={{ width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#EAB30820" }}>
                      <Gift size={22} color="#EAB308" />
                    </View>
                    <View style={{ gap: 4 }}>
                      {/* Headline 18 bold */}
                      <Text allowFontScaling={false} style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 18 }}>免費抽取啟用碼</Text>
                      {/* Caption 14 */}
                      <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 14 }}>實名認證成功後可參與</Text>
                    </View>
                  </View>
                  {/* 按鈕：btg222 居中 65% 寬 */}
                  <View style={{ alignItems: "center", opacity: profile?.is_verified ? 1 : 0.4 }}>
                    <View style={{ position: "relative", width: "65%" }}>
                      <Image source={IMG_BTN} style={{ width: "100%", aspectRatio: 653 / 101 }} contentFit="fill" />
                      <Pressable
                        className="active:opacity-80"
                        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}
                        onPress={() => {
                          if (profile?.is_verified) router.push("/(app)/lottery" as any);
                          else setMessage("需先完成實名認證才可抽取");
                        }}
                        disabled={!profile?.is_verified}
                      >
                        <Text allowFontScaling={false} style={{ color: "#fff", fontWeight: "800", fontSize: 16, letterSpacing: 1 }}>
                          {profile?.is_verified ? "立即抽取" : "請先完成實名認證"}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              </View>
            </View>

            {/* 直接購買區 — 上級資訊卡片背景 superior_card_bg 987×533 */}
            <View style={{ marginHorizontal: 16, marginBottom: 20 }}>
              <View style={{ borderRadius: 16, overflow: "hidden" }}>
                <Image source={IMG_SUPERIOR_BG} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="fill" />
                <View style={{ padding: 20 }}>
                  {/* 標題行 */}
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 }}>
                    <View style={{ width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#E8520A20" }}>
                      <ShoppingBag size={22} color="#E8520A" />
                    </View>
                    <View style={{ flex: 1, gap: 4 }}>
                      {/* Headline 18 bold */}
                      <Text allowFontScaling={false} style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 18 }}>直接購買啟用碼</Text>
                      {/* Caption 14 */}
                      <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 14 }}>無需實名，即購即用</Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      {/* Headline 20 bold */}
                      <Text allowFontScaling={false} style={{ color: "#E8520A", fontSize: 20, fontWeight: "900", fontFamily: "monospace" }}>
                        {currentPrice} USDT
                      </Text>
                      {/* Caption 14 */}
                      <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 14 }}>固定價格</Text>
                    </View>
                  </View>

                  {purchaseSuccess ? (
                    <View style={{ alignItems: "center", paddingVertical: 8, gap: 16 }}>
                      {/* Headline 18 bold */}
                      <Text allowFontScaling={false} style={{ color: "#22C55E", fontWeight: "700", fontSize: 18 }}>購買成功！啟用碼已到賬</Text>
                      {/* 馬上啟用按鈕：確認升級彈窗確認按鈕背景 mine_btn_confirm.png，寬度 50% */}
                      <View style={{ alignItems: "center", width: "100%" }}>
                        <View style={{ position: "relative", width: "50%" }}>
                          <Image source={IMG_BTN_CONFIRM} style={{ width: "100%", aspectRatio: 390 / 121 }} contentFit="fill" />
                          <Pressable
                            className="active:opacity-80"
                            style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}
                            onPress={() => setPurchaseSuccessVisible(true)}
                          >
                            {/* Body 16 bold */}
                            <Text allowFontScaling={false} style={{ color: "#fff", fontWeight: "800", fontSize: 16, letterSpacing: 1 }}>馬上啟用</Text>
                          </Pressable>
                        </View>
                      </View>
                    </View>
                  ) : (
                    <>
                      {/* 立即購買按鈕：btg222 居中 65% 寬 */}
                      <View style={{ alignItems: "center" }}>
                        <View style={{ position: "relative", width: "65%" }}>
                          <Image source={IMG_BTN} style={{ width: "100%", aspectRatio: 653 / 101 }} contentFit="fill" />
                          <Pressable
                            className="active:opacity-80"
                            style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}
                            onPress={() => { setMessage(""); setPurchaseVisible(true); }}
                          >
                            <Text allowFontScaling={false} style={{ color: "#fff", fontWeight: "800", fontSize: 16, letterSpacing: 1 }}>立即購買</Text>
                          </Pressable>
                        </View>
                      </View>
                    </>
                  )}
                </View>
              </View>
            </View>
          </>
        )}

        {/* 說明 — 上級資訊卡片背景 superior_card_bg */}
        <View style={{ marginHorizontal: 16, marginBottom: 16 }}>
          <View style={{ borderRadius: 16, overflow: "hidden" }}>
            <Image source={IMG_SUPERIOR_BG} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="fill" />
            <View style={{ padding: 20 }}>
              {/* Body 14 */}
              <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 14, lineHeight: 24 }}>
                · 手機號註冊用戶通過實名認證後可以參與抽取啟用碼活動{"\n"}
                · 符合資格用戶每天有三次抽獎啟用，直至抽中為止{"\n"}
                · 任何用戶均可在啟用碼專區購買啟用碼
              </Text>
            </View>
          </View>
        </View>
              <View style={{ height: insets.bottom + 16 }} />
</ScrollView>

      {/* 購買確認彈窗（對齊算力池確認升級彈窗樣式）*/}
      <Modal visible={purchaseVisible} transparent animationType="fade" onRequestClose={() => setPurchaseVisible(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}
          onPress={() => setPurchaseVisible(false)}
        >
          <Pressable onPress={(e) => e.stopPropagation()} style={{ width: "100%" }}>
            <View style={{ width: "100%", position: "relative", backgroundColor: "#000" }}>
              {/* 彈窗背景圖 */}
              <Image source={IMG_DIALOG_BG} style={StyleSheet.absoluteFillObject} contentFit="fill" />
              <View style={{ paddingHorizontal: 20, paddingTop: 28, paddingBottom: 24, alignItems: "center" }}>
                {/* 頂部圖標 */}
                <Image source={IMG_DIALOG_ICON} style={{ width: 52, height: 52, marginBottom: 12 }} contentFit="contain" />
                {/* 標題 */}
                <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 20, fontWeight: "800", marginBottom: 8 }}>
                  確認購買啟用碼
                </Text>
                {/* 說明文字 */}
                <Text allowFontScaling={false} style={{ color: "#999999", fontSize: 14, textAlign: "center", lineHeight: 22, marginBottom: 20 }}>
                  消耗{" "}
                  <Text allowFontScaling={false} style={{ color: "#DE792D", fontFamily: "monospace" }}>{currentPrice} USDT</Text>{"\n"}
                  算力池激活后需前往首页手动開啟鲸鱼
                </Text>
                {/* 雙按鈕（與確認升級同款）*/}
                <View style={{ flexDirection: "row", gap: 12, width: "92%", marginBottom: 4 }}>
                  <Pressable
                    className="active:opacity-80"
                    onPress={handlePurchase}
                    disabled={purchasing}
                    style={{ flex: 1, aspectRatio: 390 / 121, position: "relative" }}
                  >
                    <Image source={IMG_BTN_CONFIRM} style={StyleSheet.absoluteFillObject} contentFit="fill" />
                    <View style={[StyleSheet.absoluteFillObject, { alignItems: "center", justifyContent: "center" }]}>
                      {purchasing
                        ? <ActivityIndicator color="#fff" size="small" />
                        : <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>確認購買</Text>
                      }
                    </View>
                  </Pressable>
                  <Pressable
                    className="active:opacity-80"
                    onPress={() => setPurchaseVisible(false)}
                    style={{ flex: 1, aspectRatio: 390 / 121, position: "relative" }}
                  >
                    <Image source={IMG_BTN_CANCEL} style={StyleSheet.absoluteFillObject} contentFit="fill" />
                    <View style={[StyleSheet.absoluteFillObject, { alignItems: "center", justifyContent: "center" }]}>
                      <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>取消</Text>
                    </View>
                  </Pressable>
                </View>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* 購買成功彈窗（ReceiveDialog 風格）*/}
      <SuccessModal
        visible={purchaseSuccessVisible}
        title="購買成功"
        amount={`+1 啟用碼`}
        subText={`已轉入您的賬戶\n請在啟用碼專區查看`}
        btnLabel="馬上啟用"
        onClose={() => { setPurchaseSuccessVisible(false); setPurchaseSuccess(false); router.push("/(app)/activation-code" as any); }}
      />


    </View>
  );
}

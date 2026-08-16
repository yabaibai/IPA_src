/* eslint-disable no-undef */
import { useState, useCallback, useEffect } from "react";
import {
  View, Text, ScrollView, Pressable, ActivityIndicator, Modal, TextInput, Keyboard, KeyboardAvoidingView, StyleSheet, useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { useFocusEffect, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  Plus, Trash2, Star, Upload, ChevronRight, Camera, ImageIcon, X, Eye, EyeOff, AlertTriangle,
} from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";

const IMG_BACK  = require("../../../assets/page-img/icon9.png");
const IMG_BG    = require("../../../assets/page-img/page_bg.webp");
const IMG_TX_LIST_TOP = require("../../../assets/page-img/wallet_list_top.png");
const IMG_TX_LIST_MID = require("../../../assets/page-img/wallet_list_mid.png");
const IMG_TX_LIST_BOT = require("../../../assets/page-img/wallet_list_bot.png");
const IMG_DIALOG_BG   = require("../../../assets/page-img/mine_dialog_bg.png");
const IMG_BTN_CONFIRM = require("../../../assets/page-img/mine_btn_confirm.png");
const IMG_BTN_CANCEL  = require("../../../assets/page-img/mine_btn_cancel.png");
const IMG_MODAL_BG    = require("../../../assets/page-img/bg20.png");
const ICON_MODAL_CLOSE = require("../../../assets/page-img/icon12.png");
const IMG_CARD_FRAME  = require("../../../assets/page-img/market_card_bg.png");
const IMG_BTN_SUBMIT  = require("../../../assets/page-img/submit_active.png");
import { useSession } from "@/ctx";
import * as ImagePicker from "expo-image-picker";
import { getPaymentMethods, addPaymentMethod, deletePaymentMethod, setDefaultPaymentMethod, verifyTradingPassword, simpleHash } from "@/db/api";
import type { PaymentMethod, PaymentMethodType } from "@/types/types";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { enqueue, cancelQueuedExcept } from "@/lib/requestQueue";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { fetch } from "expo/fetch";
import { supabase } from "@/client/supabase";

// ─── 型別配置 ────────────────────────────────────────────────
interface TypeConfig {
  label: string;
  emoji: string;
  color: string;
  accountPlaceholder: string;
  showBank: boolean;
  accountLabel: string;
}

const TYPE_CONFIG: Record<PaymentMethodType, TypeConfig> = {
  alipay:    { label: "支付寶", emoji: "", color: "#E8520A", accountPlaceholder: "支付寶賬號（手機號/郵箱）", showBank: false, accountLabel: "賬號" },
  wechat:    { label: "微信",   emoji: "", color: "#22C55E", accountPlaceholder: "微訊號",                   showBank: false, accountLabel: "賬號" },
  bank_card: { label: "銀行卡", emoji: "", color: "#EAB308", accountPlaceholder: "銀行卡號",                 showBank: true,  accountLabel: "卡號" },
  usdt:      { label: "USDT",  emoji: "₿",  color: "#A855F7", accountPlaceholder: "USDT錢包地址（TRC20）",    showBank: false, accountLabel: "地址" },
};

// 收款類型圖標（直接使用提供的 URL）
const ICON_ALIPAY    = require("../../../assets/page-img/icon_alipay.png");
const ICON_WECHAT    = require("../../../assets/page-img/icon_wechat.png");
const ICON_BANK_CARD = require("../../../assets/page-img/icon_bank.png");
const ICON_USDT      = require("../../../assets/page-img/us_copy.png");
const TYPE_ICONS: Record<PaymentMethodType, any> = {
  alipay:    ICON_ALIPAY,
  wechat:    ICON_WECHAT,
  bank_card: ICON_BANK_CARD,
  usdt:      ICON_USDT,
};

const TYPE_ORDER: PaymentMethodType[] = ["alipay", "wechat", "bank_card", "usdt"];
const BUCKET = "payment-qrcodes";

// ─── 圖片壓縮 ─────────────────────────────────────────────────
async function compressImage(uri: string, mimeType?: string, width?: number) {
  const isPng = mimeType === "image/png";
  const format = isPng ? SaveFormat.PNG : SaveFormat.JPEG;
  const actions: Parameters<typeof manipulateAsync>[1] = width && width > 1080 ? [{ resize: { width: 1080 } }] : [];
  const result = await manipulateAsync(uri, actions, { compress: isPng ? 1 : 0.8, format });
  return { uri: result.uri, format };
}

// ─── 上傳到 Supabase Storage ──────────────────────────────────
async function uploadToStorage(uri: string, format: SaveFormat, userId: string): Promise<string> {
  const ext = format === SaveFormat.PNG ? "png" : "jpg";
  const mime = format === SaveFormat.PNG ? "image/png" : "image/jpeg";
  // 路徑以 userId 開頭，滿足 payment-qrcodes bucket 的 RLS 歸屬校驗
  const path = `${userId}/qrcode_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

  // 統一用 expo/fetch 讀取 arrayBuffer，相容 Android file:// 和 content:// URI
  const resp = await fetch(uri);
  if (!resp.ok) throw new Error(`讀取圖片失敗: ${resp.status}`);
  const buf = await resp.arrayBuffer();

  const { data, error } = await supabase.storage.from(BUCKET).upload(path, buf, { contentType: mime, upsert: false });
  if (error) throw error;
  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(data.path);
  return publicUrl;
}

// ─── 提現彈窗同款聚焦輸入框 ───────────────────────────────────
const WD_FIELD_BG = "rgba(0,0,0,0.5)";
const WD_BORDER   = "rgba(123,123,123,0.5)";
const WD_FOCUS_CLR = "#DE792D";
const WD_MUTED    = "#999999";
function WdFocusInput({
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
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={WD_MUTED}
        underlineColorAndroid="transparent"
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize ?? "sentences"}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[{ flex: 1, color: "#fff", fontSize: 12, padding: 0, margin: 0 },
          process.env.EXPO_OS === "web" ? { outlineWidth: 0, outlineStyle: "none" } as any : undefined,
          inputStyle]}
        allowFontScaling={false}
        autoCorrect={false}
        selectionColor="transparent"
        cursorColor="#fff"
      />
      {suffix ?? null}
    </View>
  );
}

// ─── 提現彈窗同款圖片按鈕 ─────────────────────────────────────
function DialogActionBtn({ source, label, onPress }: { source: ReturnType<typeof require>; label: string; onPress: () => void }) {
  const { width: screenW } = useWindowDimensions();
  const btnH = (screenW * 0.42) / (390 / 121);
  return (
    <Pressable onPress={onPress} className="active:opacity-80" style={{ flex: 1, height: btnH, position: "relative" }}>
      <Image source={source} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 12 }} contentFit="fill" />
      <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
        <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>{label}</Text>
      </View>
    </Pressable>
  );
}

// ─── 分割槽標題 ──────────────────────────────────────────────────
function SectionTitle({ title, dot = true }: { title: string; dot?: boolean }) {
  return (
    <View className="flex-row items-center gap-2 mb-3">
      {dot && <View className="w-2 h-2 rounded-full" style={{ backgroundColor: "#E8520A" }} />}
      {!dot && <View className="w-1 h-4 rounded-full" style={{ backgroundColor: "#E8520A" }} />}
      <Text allowFontScaling={false} style={{ color: "#F8FAFC", fontWeight: "700", fontSize: 14 }}>{title}</Text>
    </View>
  );
}

export default function PaymentMethodsScreen() {
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const vw = Math.min(screenW, 375) / 100;
  const { session } = useSession();
  // 源頭修復：進入頁面先校驗 userId 是否就緒（避免 session 短暫 null 時用戶看到空白表單並誤操作）
  const userId = session?.user.id ?? "";

  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [addVisible, setAddVisible] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // 表單狀態
  const [selType, setSelType] = useState<PaymentMethodType>("alipay");
  const [accountName, setAccountName] = useState("");
  const [accountNo, setAccountNo] = useState("");
  const [bankName, setBankName] = useState("");
  const [qrPreview, setQrPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [pickMenuVisible, setPickMenuVisible] = useState(false);

  // 交易密碼校驗
  const [tradePwd, setTradePwd] = useState("");
  const [showTradePwd, setShowTradePwd] = useState(false);
  const [tradeVerifying, setTradeVerifying] = useState(false);

  // ─── 圖片選擇 + 壓縮 + 上傳 ──────────────────────────────────
  const handlePickAndUpload = async (source: "camera" | "gallery") => {
    setPickMenuVisible(false);
    let asset: ImagePicker.ImagePickerAsset | undefined;
    if (source === "camera") {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") { setUploadError("請在系統設定中允許訪問相機"); return; }
      const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 1 });
      if (!result.canceled) asset = result.assets[0];
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") { setUploadError("請在系統設定中允許訪問相簿"); return; }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, quality: 1 });
      if (!result.canceled) asset = result.assets[0];
    }
    if (!asset) return;

    // ── 檔案大小前置校驗（5MB 上限）──
    const MAX_BYTES = 5 * 1024 * 1024;
    if (asset.fileSize && asset.fileSize > MAX_BYTES) {
      setUploadError("圖片不能超過 5MB，請選擇更小的圖片");
      return;
    }

    setUploading(true);
    setUploadError("");
    try {
      const { uri, format } = await compressImage(asset.uri, asset.mimeType ?? undefined, asset.width ?? undefined);

      // ── 壓縮後大小二次校驗（fileSize 可能為 null，用 expo/fetch 相容 Android URI）──
      const checkRes = await fetch(uri);
      const checkBuf = await checkRes.arrayBuffer();
      if (checkBuf.byteLength > MAX_BYTES) {
        setUploadError("圖片不能超過 5MB，請選擇更小的圖片");
        return;
      }

      const publicUrl = await uploadToStorage(uri, format, userId);
      setQrPreview(publicUrl);
    } catch (err: any) {
      setUploadError(err?.message ? `上傳失敗：${err.message}` : "上傳失敗，請重試");
    } finally {
      setUploading(false);
    }
  };

  const openAddModal = () => { setAddVisible(true); };
  const closeAddModal = () => { Keyboard.dismiss(); setAddVisible(false); };

  const loadData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    // 本页读取入队（tag=payment:userId），进入页面时已 cancelQueuedExcept 取消其他排隊 → 本页优先读取
    const data = await enqueue(() => getPaymentMethods(userId), { current: false }, "payment:" + userId);
    setMethods(data);
    setLoading(false);
  }, [userId]);

  useFocusEffect(useCallback(() => {
    if (userId) cancelQueuedExcept("payment:" + userId);
    loadData();
  }, [loadData, userId]));

  const resetForm = () => {
    setSelType("alipay");
    setAccountName("");
    setAccountNo("");
    setBankName("");
    setQrPreview(null);
    setError("");
    setUploadError("");
    setPickMenuVisible(false);
    setTradePwd("");
    setShowTradePwd(false);
  };

  const MAX_PER_TYPE = 5;

  const handleAdd = async () => {
    // 每類最多 5 條
    const typeCount = methods.filter(m => m.type === selType).length;
    if (typeCount >= MAX_PER_TYPE) {
      setError(`${TYPE_CONFIG[selType].label}最多隻能新增 ${MAX_PER_TYPE} 條記錄`);
      return;
    }
    if (selType !== "usdt" && !accountName.trim()) { setError("請輸入真實姓名"); return; }
    if (!accountNo.trim()) { setError(`請輸入${TYPE_CONFIG[selType].accountLabel}`); return; }
    if (selType === "bank_card" && !bankName.trim()) { setError("請輸入開戶銀行"); return; }
    // ── 交易密碼校驗 ──
    if (!tradePwd.trim()) { setError("請輸入交易密碼以確認操作"); return; }
    setTradeVerifying(true); setError("");
    const pwdOk = await verifyTradingPassword(userId, simpleHash(tradePwd.trim()));
    setTradeVerifying(false);
    if (!pwdOk) { setError("交易密碼錯誤，請重新輸入"); setTradePwd(""); return; }
    setSaving(true); setError("");
    const res = await addPaymentMethod(userId, {
      type: selType,
      account_name: accountName.trim(),
      account_no: accountNo.trim(),
      bank_name: selType === "bank_card" ? bankName.trim() : null,
      qr_code_url: qrPreview ?? null,
      is_default: methods.length === 0,
    });
    setSaving(false);
    if (res.error) { setError(res.error); return; }
    closeAddModal();
    resetForm();
    await loadData();
  };

  const handleSetDefault = async (id: string) => {
    await setDefaultPaymentMethod(userId, id);
    await loadData();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    await deletePaymentMethod(deleteTarget);
    setDeleting(false);
    setDeleteTarget(null);
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
        <ActivityIndicator size="large" color="#E8520A" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <StatusBar style="light" />
      <Image source={IMG_BG} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="cover" priority="high" cachePolicy="memory-disk" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
      >
        {/* 頂部導航：對齊推廣獎勵頁 */}
        <View style={{ paddingHorizontal: 16, paddingTop: insets.top + 12, paddingBottom: 12, flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Pressable onPress={() => router.back()} className="active:opacity-70">
            <Image source={IMG_BACK} style={{ width: vw * 6, height: vw * 6 }} contentFit="contain" />
          </Pressable>
          <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 20, fontWeight: "800" }}>收款方式</Text>
          <View style={{ flex: 1 }} />
          <Pressable
            className="flex-row items-center gap-1.5 px-3 py-2 rounded-xl active:opacity-70"
            style={{ backgroundColor: "#E8520A20", borderWidth: 1, borderColor: "#E8520A40" }}
            onPress={() => { resetForm(); openAddModal(); }}
          >
            <Plus size={15} color="#E8520A" />
            <Text allowFontScaling={false} style={{ color: "#E8520A", fontSize: 13, fontWeight: "600" }}>添加</Text>
          </Pressable>
        </View>

        {/* 列表：三段背景图拼接外框 */}
        {methods.length === 0 ? (
          <View style={{ marginHorizontal: 16, position: "relative" }}>
            <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 16, overflow: "hidden" }}>
              <Image source={IMG_TX_LIST_TOP} style={{ width: "100%", aspectRatio: 987 / 80 }} contentFit="cover" />
              <Image source={IMG_TX_LIST_MID} style={{ flex: 1, width: "100%" }} contentFit="fill" />
              <Image source={IMG_TX_LIST_BOT} style={{ width: "100%", aspectRatio: 987 / 80 }} contentFit="cover" />
            </View>
            <View style={{ paddingVertical: 48, alignItems: "center" }}>
              <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 14 }}>暫無收款方式</Text>
              <Text allowFontScaling={false} style={{ color: "#FFFFFF40", fontSize: 12, marginTop: 6 }}>點選右上角「新增」按鈕新增</Text>
            </View>
          </View>
        ) : (
          <View style={{ marginHorizontal: 16, position: "relative" }}>
            {/* 列表外框：三段背景图拼接 */}
            <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 16, overflow: "hidden" }}>
              <Image source={IMG_TX_LIST_TOP} style={{ width: "100%", aspectRatio: 987 / 80 }} contentFit="cover" />
              <Image source={IMG_TX_LIST_MID} style={{ flex: 1, width: "100%" }} contentFit="fill" />
              <Image source={IMG_TX_LIST_BOT} style={{ width: "100%", aspectRatio: 987 / 80 }} contentFit="cover" />
            </View>
            <View style={{ padding: 12, gap: 8 }}>
              {methods.map((m) => {
                const cfg = TYPE_CONFIG[m.type] ?? TYPE_CONFIG.alipay;
                const icon = TYPE_ICONS[m.type];
                return (
                  /* 单条记录：金色立体边框 */
                  <View key={m.id} style={{ borderRadius: 12, overflow: "hidden", backgroundColor: "rgba(0,0,0,0.45)", borderWidth: 1.5, borderColor: "#D4A853" }}>
                    {/* 上半：图标+类型+账号/姓名/银行  |  右侧：收款码 */}
                    <View style={{ flexDirection: "row", paddingHorizontal: 14, paddingTop: 14, paddingBottom: 10, gap: 12 }}>
                      {/* 左：文字信息 */}
                      <View style={{ flex: 1 }}>
                        {/* 类型行 */}
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                          {icon ? (
                            <Image source={icon} style={{ width: 20, height: 20, borderRadius: 4 }} contentFit="contain" />
                          ) : (
                            <Text allowFontScaling={false} style={{ fontSize: 16 }}>{cfg.emoji}</Text>
                          )}
                          <Text allowFontScaling={false} style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "700" }}>{cfg.label}</Text>
                          {m.is_default && (
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: cfg.color + "25" }}>
                              <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: cfg.color }} />
                              <Text allowFontScaling={false} style={{ color: cfg.color, fontSize: 11, fontWeight: "600" }}>預設</Text>
                            </View>
                          )}
                        </View>
                        {/* 卡號行 */}
                        <View style={{ marginBottom: 3 }}>
                          <Text allowFontScaling={false} style={{ color: "#FFFFFF", fontSize: 14, fontFamily: "monospace", fontWeight: "600" }} numberOfLines={1} ellipsizeMode="middle">
                            {m.account_no}
                          </Text>
                        </View>
                        {m.account_name ? (
                          <Text allowFontScaling={false} style={{ color: "#FFFFFF", fontSize: 14, marginBottom: 3 }}>{m.account_name}</Text>
                        ) : null}
                        {m.bank_name ? (
                          <Text allowFontScaling={false} style={{ color: "#FFFFFF", fontSize: 14 }}>{m.bank_name}</Text>
                        ) : null}
                      </View>
                      {/* 右：收款码（右对齐） */}
                      {m.qr_code_url ? (
                        <View style={{ borderRadius: 10, overflow: "hidden", borderWidth: 1, borderColor: cfg.color + "40", alignSelf: "flex-start" }}>
                          <Image source={{ uri: m.qr_code_url }} style={{ width: 72, height: 72 }} contentFit="cover" />
                        </View>
                      ) : null}
                    </View>
                    {/* 下方分隔线 */}
                    <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.06)", marginHorizontal: 14 }} />
                    {/* 底部操作栏：右下横排 */}
                    <View style={{ flexDirection: "row", justifyContent: "flex-end", alignItems: "center", paddingHorizontal: 14, paddingVertical: 8, gap: 10 }}>
                      {!m.is_default && (
                        <Pressable
                          style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: "#E8520A18", borderWidth: 1, borderColor: "#E8520A30" }}
                          className="active:opacity-70"
                          onPress={() => handleSetDefault(m.id)}
                        >
                          <Star size={13} color="#E8520A" />
                          <Text allowFontScaling={false} style={{ color: "#E8520A", fontSize: 12, fontWeight: "600" }}>設為預設</Text>
                        </Pressable>
                      )}
                      <Pressable
                        style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: "#F43F5E18", borderWidth: 1, borderColor: "#F43F5E30" }}
                        className="active:opacity-70"
                        onPress={() => setDeleteTarget(m.id)}
                      >
                        <Trash2 size={13} color="#F43F5E" />
                        <Text allowFontScaling={false} style={{ color: "#F43F5E", fontSize: 12, fontWeight: "600" }}>刪除</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>

      {/* ── 新增彈窗：對齊提現彈窗樣式 ── */}
      <Modal visible={addVisible} transparent animationType="slide" onRequestClose={closeAddModal}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.85)", justifyContent: "flex-end", alignItems: "center" }}>
          <KeyboardAvoidingView behavior={process.env.EXPO_OS === "ios" ? "padding" : undefined} style={{ width: "100%" }}>
            <View style={{ width: "96%", maxHeight: screenH * 0.88, alignSelf: "center", position: "relative", overflow: "hidden", backgroundColor: "#000", borderRadius: vw * 4.27 }}>
              <Image source={IMG_MODAL_BG} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="fill" />

              <View style={{ width: "95%", alignSelf: "center", paddingVertical: vw * 4.27 }}>
                {/* 標題列：標題 + 關閉圖示 */}
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: vw * 3 }}>
                  <Text allowFontScaling={false} style={{ color: "#fff", fontSize: vw * 4.53, flex: 1 }}>
                    添加收款方式
                  </Text>
                  <Pressable onPress={closeAddModal} className="active:opacity-70">
                    <Image source={ICON_MODAL_CLOSE} style={{ width: vw * 8, height: vw * 8 }} contentFit="contain" />
                  </Pressable>
                </View>

                <ScrollView
                  bounces={false}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
                >
                  <View style={{ gap: vw * 3.2 }}>

                    {/* ① 收款型別：與錢包交易記錄完全一致的 Tab 樣式 */}
                    <View style={{ height: 48, overflow: "hidden", borderRadius: 12 }}>
                      {/* 外框：深色底 + 橙色細描邊 */}
                      <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "#1a0e06", borderRadius: 12, borderWidth: 1, borderColor: "rgba(222,121,45,0.45)" }} />
                      <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, paddingHorizontal: 6, paddingVertical: 6, flexDirection: "row", gap: 6 }}>
                        {TYPE_ORDER.map((t) => {
                          const cfg = TYPE_CONFIG[t];
                          const active = selType === t;
                          const typeCount = methods.filter(m => m.type === t).length;
                          const isFull = typeCount >= MAX_PER_TYPE;
                          return (
                            <Pressable
                              key={t}
                              onPress={() => {
                                if (isFull) {
                                  setError(`${cfg.label}已達上限（5條），請先刪除舊記錄`);
                                  return;
                                }
                                setSelType(t);
                                setError("");
                              }}
                              className="active:opacity-80"
                              style={{ flex: 1, position: "relative", borderRadius: 999, overflow: "hidden", opacity: isFull ? 0.45 : 1 }}
                            >
                              {/* 選中：橙色漸變；待機：透明無背景 */}
                              {active && (
                                <LinearGradient
                                  colors={["#EB9426", "#C8571A", "#B84010"]}
                                  start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
                                  style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 999 }}
                                />
                              )}
                              <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
                                <Text allowFontScaling={false} style={{ color: active ? "#fff" : "#FFFFFF60", fontSize: 13, fontWeight: active ? "700" : "400" }}>
                                  {cfg.label}
                                </Text>
                              </View>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>

                    {/* ② 收款碼上傳 */}
                    <View style={{ position: "relative" }}>
                      <Image source={IMG_CARD_FRAME} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 12 }} contentFit="fill" />
                      <View style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
                        <SectionTitle title="收款碼上傳" dot={false} />

                        {qrPreview ? (
                          <View style={{ gap: 10 }}>
                            <View style={{ borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: "#E8520A40", backgroundColor: "#00000040", alignItems: "center", paddingVertical: 16 }}>
                              <Image source={{ uri: qrPreview }} style={{ width: 64, height: 64, borderRadius: 10 }} contentFit="contain" />
                            </View>
                            <View style={{ flexDirection: "row", gap: 10 }}>
                              <Pressable
                                style={{ flex: 1, height: 40, borderRadius: 12, overflow: "hidden" }}
                                className="active:opacity-80"
                                onPress={() => setPickMenuVisible(true)}
                                disabled={uploading}
                              >
                                <Image source={IMG_BTN_SUBMIT} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="fill" />
                                <View style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}>
                                  {uploading
                                    ? <ActivityIndicator size="small" color="#E8520A" />
                                    : <><Upload size={15} color="#FFFFFF60" /><Text allowFontScaling={false} style={{ color: "#FFFFFF80", fontSize: 13 }}>更換圖片</Text></>}
                                </View>
                              </Pressable>
                              <Pressable
                                style={{ flex: 1, height: 40, borderRadius: 12, overflow: "hidden" }}
                                className="active:opacity-80"
                                onPress={() => { setQrPreview(null); setUploadError(""); }}
                              >
                                <Image source={IMG_BTN_SUBMIT} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="fill" />
                                <View style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}>
                                  <X size={15} color="#F43F5E" />
                                  <Text allowFontScaling={false} style={{ color: "#F43F5E", fontSize: 13 }}>刪除</Text>
                                </View>
                              </Pressable>
                            </View>
                          </View>
                        ) : (
                          <Pressable
                            style={{ flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: "#00000050", borderWidth: 1, borderColor: "#FFFFFF15", opacity: uploading ? 0.7 : 1 }}
                            className="active:opacity-70"
                            onPress={() => !uploading && setPickMenuVisible(true)}
                            disabled={uploading}
                          >
                            <View style={{ width: 52, height: 52, borderRadius: 12, alignItems: "center", justifyContent: "center", overflow: "hidden", backgroundColor: "#000", borderWidth: 1, borderColor: "#FFFFFF15" }}>
                              {uploading
                                ? <ActivityIndicator size="small" color="#E8520A" />
                                : <Upload size={22} color="#FFFFFF40" />}
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text allowFontScaling={false} style={{ color: "#FFFFFF", fontWeight: "600", fontSize: 14 }}>
                                {uploading ? "上傳中…" : "上傳收款碼"}
                              </Text>
                              <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 12, marginTop: 2 }}>
                                {uploading ? "請稍候" : "支援拍照或從相簿選擇，建議上傳二維碼"}
                              </Text>
                            </View>
                            {!uploading && <ChevronRight size={16} color="#FFFFFF40" />}
                          </Pressable>
                        )}

                        {uploadError ? (
                          <Text allowFontScaling={false} style={{ color: "#F43F5E", fontSize: 12, marginTop: 8 }}>{uploadError}</Text>
                        ) : null}
                      </View>
                    </View>

                    {/* 選擇來源彈窗（拍照 / 相簿） */}
                    {pickMenuVisible && (
                      <View style={{ borderRadius: 16, overflow: "hidden", backgroundColor: "#00000080", borderWidth: 1, borderColor: "#FFFFFF15" }}>
                        <Pressable
                          style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#FFFFFF15" }}
                          className="active:opacity-70"
                          onPress={() => handlePickAndUpload("camera")}
                        >
                          <Camera size={18} color="#E8520A" />
                          <Text allowFontScaling={false} style={{ color: "#FFFFFF", fontSize: 14 }}>拍照</Text>
                        </Pressable>
                        <Pressable
                          style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#FFFFFF15" }}
                          className="active:opacity-70"
                          onPress={() => handlePickAndUpload("gallery")}
                        >
                          <ImageIcon size={18} color="#E8520A" />
                          <Text allowFontScaling={false} style={{ color: "#FFFFFF", fontSize: 14 }}>從相簿選擇</Text>
                        </Pressable>
                        <Pressable
                          style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: 16, paddingVertical: 14 }}
                          className="active:opacity-70"
                          onPress={() => setPickMenuVisible(false)}
                        >
                          <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 14 }}>取消</Text>
                        </Pressable>
                      </View>
                    )}

                    {/* ③ 賬戶資訊：姓名、賬號、開戶銀行、地址統一放入 */}
                    <View style={{ position: "relative" }}>
                      <Image source={IMG_CARD_FRAME} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 12 }} contentFit="fill" />
                      <View style={{ paddingHorizontal: 16, paddingVertical: 14, gap: 10 }}>
                        <SectionTitle title="賬戶資訊" dot={false} />
                        {selType !== "usdt" && (
                          <WdFocusInput
                            value={accountName}
                            onChangeText={(v) => { setAccountName(v.replace(/[<>'";\\\u200B-\u200D\uFEFF]/g, "")); setError(""); }}
                            placeholder="姓名"
                          />
                        )}
                        <WdFocusInput
                          value={accountNo}
                          onChangeText={(v) => { setAccountNo(v.replace(/[<>'";\\\u200B-\u200D\uFEFF]/g, "")); setError(""); }}
                          placeholder={selType === "usdt" ? "USDT收款地址（TRC20/ERC20）" : "賬號"}
                          keyboardType={selType === "bank_card" ? "numeric" : "default"}
                          autoCapitalize="none"
                          inputStyle={selType === "usdt" ? { fontFamily: "monospace", fontSize: 12 } : undefined}
                        />
                        {selType === "bank_card" && (
                          <WdFocusInput
                            value={bankName}
                            onChangeText={(v) => { setBankName(v.replace(/[<>'";\\\u200B-\u200D\uFEFF]/g, "")); setError(""); }}
                            placeholder="開戶銀行（如：中國工商銀行）"
                          />
                        )}
                        {/* 交易密碼確認 */}
                        <WdFocusInput
                          value={tradePwd}
                          onChangeText={(v) => { setTradePwd(v); setError(""); }}
                          placeholder="請輸入交易密碼"
                          secureTextEntry={!showTradePwd}
                          suffix={(
                            <Pressable onPress={() => setShowTradePwd(!showTradePwd)} className="active:opacity-70 pl-2 py-2">
                              {showTradePwd
                                ? <EyeOff size={18} color="#FFFFFF40" />
                                : <Eye size={18} color="#FFFFFF40" />}
                            </Pressable>
                          )}
                        />
                        <Text allowFontScaling={false} style={{ color: "#FFFFFF40", fontSize: 11, marginTop: 2 }}>
                          添加收款方式需驗證交易密码，以确保賬戶安全
                        </Text>
                      </View>
                    </View>

                    {/* 錯誤提示 */}
                    {error ? (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: "#F43F5E10", borderWidth: 1, borderColor: "#F43F5E30" }}>
                        <AlertTriangle size={14} color="#F43F5E" />
                        <Text allowFontScaling={false} style={{ color: "#F43F5E", fontSize: 13, flex: 1 }}>{error}</Text>
                      </View>
                    ) : null}

                    {/* 底部按鈕 */}
                    <View style={{ flexDirection: "row", gap: 12 }}>
                      <DialogActionBtn
                        source={IMG_BTN_CONFIRM}
                        label={saving || tradeVerifying ? "保存中…" : "保存"}
                        onPress={handleAdd}
                      />
                      <DialogActionBtn
                        source={IMG_BTN_CANCEL}
                        label="取消"
                        onPress={closeAddModal}
                      />
                    </View>
                  </View>
                </ScrollView>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ── 刪除確認：對齊退出登錄彈窗樣式 ── */}
      <Modal visible={!!deleteTarget} transparent animationType="fade" onRequestClose={() => setDeleteTarget(null)}>
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}
          onPress={() => setDeleteTarget(null)}
        >
          <Pressable onPress={(e) => e.stopPropagation()} style={{ width: "100%" }}>
            <View style={{ width: "100%", position: "relative", backgroundColor: "#000" }}>
              <Image source={IMG_DIALOG_BG} style={StyleSheet.absoluteFillObject} contentFit="fill" />
              <View style={{ paddingHorizontal: 20, paddingTop: 28, paddingBottom: 24, alignItems: "center" }}>
                {/* 頂部圖標：刪除警告 */}
                <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: "#F59E0A15", borderWidth: 1, borderColor: "#F59E0A40", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
                  <AlertTriangle size={28} color="#F59E0A" />
                </View>
                {/* 標題 */}
                <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 20, fontWeight: "800", marginBottom: 8 }}>
                  確認刪除
                </Text>
                {/* 說明文字 */}
                <Text allowFontScaling={false} style={{ color: "#FFFFFF80", fontSize: 14, textAlign: "center", lineHeight: 22, marginBottom: 20 }}>
                  刪除後無法恢復，請確認操作
                </Text>
                {/* 雙按鈕 */}
                <View style={{ flexDirection: "row", gap: 12, width: "92%", marginBottom: 4 }}>
                  <Pressable
                    className="active:opacity-80"
                    onPress={handleDelete}
                    disabled={deleting}
                    style={{ flex: 1, aspectRatio: 390 / 121, position: "relative" }}
                  >
                    <Image source={IMG_BTN_CONFIRM} style={StyleSheet.absoluteFillObject} contentFit="fill" />
                    <View style={[StyleSheet.absoluteFillObject, { alignItems: "center", justifyContent: "center" }]}>
                      {deleting ? <ActivityIndicator size="small" color="#fff" /> : (
                        <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>確認刪除</Text>
                      )}
                    </View>
                  </Pressable>
                  <Pressable
                    className="active:opacity-80"
                    onPress={() => setDeleteTarget(null)}
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
    </View>
  );
}

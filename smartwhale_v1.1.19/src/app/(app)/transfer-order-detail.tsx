/* eslint-disable no-undef */
import { useState, useCallback, useEffect, useRef } from "react";
import {
  View, Text, ScrollView, KeyboardAvoidingView, Pressable, ActivityIndicator, TextInput, Modal, useWindowDimensions, StyleSheet,
} from "react-native";
import { Image } from "expo-image";
import { useFocusEffect, router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  Clock, CheckCircle2, XCircle, AlertTriangle, Lock,
  Plus, X, Camera, ImageIcon, FileText, Upload, ShieldCheck, Eye, EyeOff,
  ChevronDown,
} from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import * as Haptics from "expo-haptics";
import { decode } from "base64-arraybuffer";
import { useSession } from "@/ctx";
import {
  getTransferOrderDetail, submitTransferProof, confirmTransferReceived,
  disputeTransferOrder, cancelTransferOrder, submitArbitrationEvidence,
  verifyTradingPassword, simpleHash,
  type TransferOrder,
} from "@/db/api";
import * as Clipboard from "expo-clipboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { enqueue, cancelQueuedExcept } from "@/lib/requestQueue";
import { supabase } from "@/client/supabase";

const PROOF_BUCKET = "payment-proofs";
const MAX_IMAGES = 5;

// ─── 本地圖片資源（對齊 style005 交易詳情風格）────────────────────────────────
const IMG_BACK        = require("../../../assets/page-img/icon9.png");
const IMG_ICON28      = require("../../../assets/page-img/icon28.png");
const IMG_COPY        = require("../../../assets/page-img/wosh_icon1.png");
const BG_IMG          = require("../../../assets/page-img/page_bg.webp");
const IMG_BTN_CONFIRM = require("../../../assets/page-img/mine_btn_confirm.png");
const IMG_BTN_CANCEL  = require("../../../assets/page-img/mine_btn_cancel.png");
const IMG_DIALOG_BG   = require("../../../assets/page-img/mine_dialog_bg.png");
const IMG_DIALOG_ICON = require("../../../assets/page-img/mine_icon29.png");
const IMG_MODAL_BG    = require("../../../assets/page-img/bg20.png");
const ICON_MODAL_CLOSE = require("../../../assets/page-img/icon12.png");
const MUTED = "#999999";

const STATUS_LABEL: Record<string, { label: string; color: string; icon: string }> = {
  pending_payment:       { label: "等待付款",   color: "#EAB308",   icon: "⏳" },
  pending_confirm:       { label: "等待確認",   color: "#E8520A",   icon: "🔍" },
  completed:             { label: "交易完成",   color: "#22C55E",   icon: "✅" },
  cancelled:             { label: "已取消",     color: "#FFFFFF40", icon: "❌" },
  arbitration:           { label: "補充材料中", color: "#F97316",   icon: "📋" },
  arbitration_reviewing: { label: "仲裁中",     color: "#F43F5E",   icon: "⚖️" },
};

function Countdown({ expiresAt }: { expiresAt: string }) {
  const [remaining, setRemaining] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const update = () => {
      const diff = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
      setRemaining(diff);
    };
    update();
    timerRef.current = setInterval(update, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [expiresAt]);

  if (remaining <= 0) return (
    <Text allowFontScaling={false} className="text-xs" style={{ color: "#F43F5E" }}>已超時</Text>
  );
  const m = Math.floor(remaining / 60);
  const s = remaining % 60;
  return (
    <View className="flex-row items-center gap-1">
      <Clock size={12} color="#EAB308" />
      <Text allowFontScaling={false} style={{ color: "#EAB308", fontSize: 12, fontFamily: "monospace", fontWeight: "600" }}>
        {String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
      </Text>
    </View>
  );
}

// 取消冷却倒计时：createdAt + CANCEL_COOLDOWN_MS 后才允许取消
const CANCEL_COOLDOWN_MS = 20 * 60 * 1000;

function CancelCooldown({ createdAt, onUnlocked }: { createdAt: string; onUnlocked: () => void }) {
  const unlockAt = new Date(createdAt).getTime() + CANCEL_COOLDOWN_MS;
  const [secsLeft, setSecsLeft] = useState(() => Math.max(0, Math.ceil((unlockAt - Date.now()) / 1000)));
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const notifiedRef = useRef(false);

  useEffect(() => {
    const update = () => {
      const left = Math.max(0, Math.ceil((unlockAt - Date.now()) / 1000));
      setSecsLeft(left);
      if (left === 0 && !notifiedRef.current) {
        notifiedRef.current = true;
        onUnlocked();
      }
    };
    update();
    timerRef.current = setInterval(update, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [unlockAt, onUnlocked]);

  if (secsLeft <= 0) return null;
  const m = Math.floor(secsLeft / 60);
  const s = secsLeft % 60;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, marginTop: 6 }}>
      <Clock size={11} color="#FFFFFF40" />
      <Text allowFontScaling={false} style={{ color: "#FFFFFF40", fontSize: 11 }}>
        {String(m).padStart(2, "0")}:{String(s).padStart(2, "0")} 後可取消
      </Text>
    </View>
  );
}

// ─── 字段行组件（對齊 style005 FieldRow）────────────────────────────────
function FieldRow({
  label, value, color = "#fff", copyValue, last = false,
}: {
  label: string;
  value?: string;
  color?: string;
  copyValue?: string;
  last?: boolean;
}) {
  const handleCopy = async () => {
    if (copyValue) await Clipboard.setStringAsync(copyValue);
  };
  return (
    <View style={{ marginBottom: last ? 0 : 16 }}>
      <Text allowFontScaling={false} style={{ color: "rgba(255,255,255,0.4)", fontSize: 14, marginBottom: 8 }}>
        {label}
      </Text>
      <View style={{
        flexDirection: "row", alignItems: "center",
        minHeight: 48, borderRadius: 8,
        backgroundColor: "#000", borderWidth: 1, borderColor: "#E68331",
        paddingHorizontal: 20, paddingVertical: 12,
        justifyContent: "space-between",
      }}>
        <Text allowFontScaling={false} style={{ color, fontSize: 16, flex: 1, lineHeight: 22 }} numberOfLines={1}>
          {value}
        </Text>
        {!!copyValue && (
          <Pressable onPress={handleCopy} className="active:opacity-70">
            <Image source={IMG_COPY} style={{ width: 14, height: 14, marginLeft: 8 }} contentFit="contain" />
          </Pressable>
        )}
      </View>
    </View>
  );
}

// ─── 可展開折疊卡片 ─────────────────────────────────────────────────────────
function CollapsibleCard({
  title, children, defaultExpanded = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <View style={{ marginBottom: 24 }}>
      <Pressable
        onPress={() => setExpanded(!expanded)}
        className="active:opacity-70"
        style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}
      >
        <Text allowFontScaling={false} style={{ color: "rgba(255,255,255,0.4)", fontSize: 14 }}>{title}</Text>
        <View style={{ transform: [{ rotate: expanded ? "180deg" : "0deg" }] }}>
          <ChevronDown size={18} color="#FFFFFF60" />
        </View>
      </Pressable>
      {expanded && (
        <View style={{ backgroundColor: "#000", borderWidth: 1, borderColor: "#E68331", borderRadius: 8, padding: 16 }}>
          {children}
        </View>
      )}
    </View>
  );
}

// ─── 聚焦輸入框（對齊 account-settings fieldRow 樣式）──────────────────────
const FIELD_BG    = "rgba(0,0,0,0.5)";
const FIELD_BORDER = "rgba(123,123,123,0.5)";
const FOCUS_COLOR = "#DE792D";

function TdFocusInput({
  value, onChangeText, placeholder, secureTextEntry, suffix, prefixIcon, multiline, keyboardType,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  suffix?: React.ReactNode;
  prefixIcon?: React.ReactNode;
  multiline?: boolean;
  keyboardType?: "default" | "numeric" | "email-address";
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{
      flexDirection: "row", alignItems: multiline ? "flex-start" : "center",
      backgroundColor: FIELD_BG,
      borderWidth: 1, borderRadius: 8,
      borderColor: focused ? FOCUS_COLOR : FIELD_BORDER,
      paddingHorizontal: 12, paddingVertical: multiline ? 10 : 0,
    }}>
      {prefixIcon && (
        <View style={{ marginRight: 8, paddingVertical: multiline ? 2 : 0 }}>{prefixIcon}</View>
      )}
      <TextInput
        style={{ flex: 1, color: "#fff", fontSize: 14, paddingVertical: multiline ? 2 : 12, padding: 0, margin: 0 }}
        placeholder={placeholder}
        placeholderTextColor="#FFFFFF40"
        underlineColorAndroid="transparent"
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
        multiline={multiline}
        keyboardType={keyboardType}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        maxLength={multiline ? 300 : 64}
      />
      {suffix && <View style={{ marginLeft: 4 }}>{suffix}</View>}
    </View>
  );
}

export default function TransferOrderDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  // 源頭修復：進入頁面先校驗 userId 是否就緒
  const userId = session?.user.id ?? "";

  const { width, height: screenHeight } = useWindowDimensions();
  const vw = width / 100;
  const sheetMaxHeight = screenHeight * 0.88;
  const navH = insets.top + vw * 10.13;
  const [scrolled, setScrolled] = useState(false);

  const [order, setOrder] = useState<TransferOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState("");
  // 取消冷却：订单创建后 20 分钟内禁止主动取消（挂载时立即计算初始值）
  const [cancelUnlocked, setCancelUnlocked] = useState(false);

  // 憑證輸入
  const [proofInput, setProofInput] = useState("");
  const [proofVisible, setProofVisible] = useState(false);
  // 憑證圖片（本地 URI 列表，上傳後替換為遠端 URL）
  const [proofImages, setProofImages] = useState<string[]>([]);
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  const [proofImageUrls, setProofImageUrls] = useState<string[]>([]);
  const [pickMenuVisible, setPickMenuVisible] = useState(false);
  const [proofPermDenied, setProofPermDenied] = useState("");
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [savingQr, setSavingQr] = useState(false);
  const [qrSavedMsg, setQrSavedMsg] = useState<string | null>(null);

  // 確認/仲裁彈窗
  const [confirmModal, setConfirmModal] = useState<"confirm" | "dispute" | null>(null);

  // 確認收款交易密碼
  const [confirmTradePwd, setConfirmTradePwd] = useState("");
  const [showConfirmTradePwd, setShowConfirmTradePwd] = useState(false);
  const [tradeVerifying, setTradeVerifying] = useState(false);

  // 仲裁證據提交彈窗
  const [evidenceVisible, setEvidenceVisible] = useState(false);
  const [evidenceText, setEvidenceText] = useState("");
  const [evidenceImages, setEvidenceImages] = useState<string[]>([]);
  const [evidenceImageUrls, setEvidenceImageUrls] = useState<string[]>([]);
  const [evidenceUploadingIdx, setEvidenceUploadingIdx] = useState<number | null>(null);
  const [evidencePickMenu, setEvidencePickMenu] = useState(false);
  const [evidencePermDenied, setEvidencePermDenied] = useState("");
  // 仲裁倒計時剩餘秒數（基於 arbitration_started_at）
  const [evidenceSecsLeft, setEvidenceSecsLeft] = useState(0);
  const evidenceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // 同步鎖：防止 setState 非同步延遲期間重複點選穿透（confirm/cancel/dispute/proof/evidence）
  const actingRef = useRef(false);

  const loadData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    // 本页读取入队（tag=transfer-order:userId），进入页面时已 cancelQueuedExcept 取消其他排隊 → 本页优先读取
    const [o] = await enqueue(() => Promise.all([
      getTransferOrderDetail(id, userId),
    ]), { current: false }, "transfer-order:" + userId);
    setOrder(o);
    // 加载时立即判断冷却是否已解锁，避免倒计时未渲染时按钮仍被锁
    if (o?.created_at) {
      const unlockAt = new Date(o.created_at).getTime() + CANCEL_COOLDOWN_MS;
      setCancelUnlocked(Date.now() >= unlockAt);
    }
    setLoading(false);
  }, [id]);

  useFocusEffect(useCallback(() => {
    if (userId) cancelQueuedExcept("transfer-order:" + userId);
    loadData();
  }, [loadData, userId]));

  // 仲裁30分鐘倒計時
  useEffect(() => {
    if (order?.status === "arbitration" && order.arbitration_started_at) {
      const deadline = new Date(order.arbitration_started_at).getTime() + 30 * 60 * 1000;
      const update = () => setEvidenceSecsLeft(Math.max(0, Math.floor((deadline - Date.now()) / 1000)));
      update();
      evidenceTimerRef.current = setInterval(update, 1000);
    } else {
      setEvidenceSecsLeft(0);
    }
    return () => { if (evidenceTimerRef.current) clearInterval(evidenceTimerRef.current); };
  }, [order?.status, order?.arbitration_started_at]);

  if (!userId) {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: "#000" }}>
        <ActivityIndicator size="large" color="#E8520A" />
        <Text allowFontScaling={false} style={{ color: "#999", fontSize: 13, marginTop: 12 }}>用戶信息校驗中…</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: "#000" }}>
        <ActivityIndicator size="large" color="#E8520A" />
      </View>
    );
  }
  if (!order) {
    return (
      <View className="flex-1 items-center justify-center gap-3" style={{ backgroundColor: "#000" }}>
        <Text allowFontScaling={false} style={{ color: "#FFFFFF60" }}>訂單不存在</Text>
        <Pressable onPress={() => router.back()}>
          <Text allowFontScaling={false} style={{ color: "#E8520A" }}>返回</Text>
        </Pressable>
      </View>
    );
  }

  const isSender = order.sender_id === userId;
  const isReceiver = order.receiver_id === userId;
  const st = STATUS_LABEL[order.status] ?? { label: order.status, color: "#FFFFFF60", icon: "?" };
  const isPendingPayment = order.status === "pending_payment";
  const isPendingConfirm = order.status === "pending_confirm";
  const isArbitration = order.status === "arbitration";
  const isArbitrationReviewing = order.status === "arbitration_reviewing";
  const isExpired = isPendingPayment && new Date(order.expires_at) <= new Date();

  // 仲裁30分鐘視窗是否仍開放
  const evidenceWindowOpen = isArbitration && evidenceSecsLeft > 0;
  // 當前使用者是否已提交證據
  const myEvidenceSubmitted = isSender
    ? order.sender_evidence_submitted
    : isReceiver
    ? order.receiver_evidence_submitted
    : false;

  // ── 通用圖片選擇 & 壓縮 & 上傳 ────────────────────────────
  const pickAndUploadImage = async (
    source: "camera" | "gallery",
    images: string[],
    setImages: React.Dispatch<React.SetStateAction<string[]>>,
    setUrls: React.Dispatch<React.SetStateAction<string[]>>,
    setUploadIdx: React.Dispatch<React.SetStateAction<number | null>>,
    setPermDenied: React.Dispatch<React.SetStateAction<string>>,
    setPickMenu: React.Dispatch<React.SetStateAction<boolean>>,
  ) => {
    setPickMenu(false);
    setPermDenied("");
    if (images.length >= MAX_IMAGES) return;

    let asset: ImagePicker.ImagePickerAsset | undefined;
    if (source === "camera") {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") { setPermDenied("請在系統設定中允許訪問相機"); return; }
      const res = await ImagePicker.launchCameraAsync({ quality: 1 });
      if (!res.canceled) asset = res.assets[0];
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") { setPermDenied("請在系統設定中允許訪問相簿"); return; }
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1 });
      if (!res.canceled) asset = res.assets[0];
    }
    if (!asset) return;

    const insertIdx = images.length;
    setImages((prev) => [...prev, asset!.uri]);
    setUploadIdx(insertIdx);

    try {
      const actions: Parameters<typeof manipulateAsync>[1] = (asset.width ?? 0) > 800 ? [{ resize: { width: 800 } }] : [];
      const compressed = await manipulateAsync(asset.uri, actions, { compress: 0.7, format: SaveFormat.JPEG });
      const path = `${userId}/${order?.id ?? "unknown"}_${Date.now()}.jpg`;
      const base64 = await FileSystem.readAsStringAsync(compressed.uri, { encoding: FileSystem.EncodingType.Base64 });
      const buf = decode(base64);
      const { data, error: upErr } = await supabase.storage.from(PROOF_BUCKET).upload(path, buf, { contentType: "image/jpeg", upsert: false });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from(PROOF_BUCKET).getPublicUrl(data.path);
      setUrls((prev) => [...prev, publicUrl]);
    } catch {
      setImages((prev) => prev.filter((_, i) => i !== insertIdx));
      setPermDenied("圖片上傳失敗，請重試");
    } finally {
      setUploadIdx(null);
    }
  };

  // ── 付款憑證圖片 ──────────────────────────────────────────
  const pickAndUploadProofImage = (source: "camera" | "gallery") =>
    pickAndUploadImage(source, proofImages, setProofImages, setProofImageUrls, setUploadingIdx, setProofPermDenied, setPickMenuVisible);

  const removeProofImage = (idx: number) => {
    setProofImages((prev) => prev.filter((_, i) => i !== idx));
    setProofImageUrls((prev) => prev.filter((_, i) => i !== idx));
  };

  // ── 仲裁證據圖片 ──────────────────────────────────────────
  const pickAndUploadEvidenceImage = (source: "camera" | "gallery") =>
    pickAndUploadImage(source, evidenceImages, setEvidenceImages, setEvidenceImageUrls, setEvidenceUploadingIdx, setEvidencePermDenied, setEvidencePickMenu);

  const removeEvidenceImage = (idx: number) => {
    setEvidenceImages((prev) => prev.filter((_, i) => i !== idx));
    setEvidenceImageUrls((prev) => prev.filter((_, i) => i !== idx));
  };

  // 接收人：提交付款憑證
  const handleSubmitProof = async () => {
    if (actingRef.current) return;
    if (proofImages.length === 0 && !proofInput.trim()) {
      setError("請上傳至少一張付款憑證圖片");
      return;
    }
    if (uploadingIdx !== null) { setError("圖片上傳中，請稍候"); return; }
    actingRef.current = true;
    setActing(true); setError("");
    const res = await submitTransferProof(order!.id, userId, proofInput.trim(), proofImageUrls);
    actingRef.current = false;
    setActing(false);
    if (res.error) { setError(res.error); return; }
    setProofVisible(false);
    setProofInput("");
    setProofImages([]);
    setProofImageUrls([]);
    await loadData();
  };

  // 長按保存收款碼到相簿
  const handleSaveQrCode = async (url: string) => {
    if (savingQr) return;
    setQrSavedMsg(null);
    if (process.env.EXPO_OS === "web") {
      setQrSavedMsg("Web 端請長按圖片儲存");
      return;
    }
    setSavingQr(true);
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== "granted") {
        setQrSavedMsg("需要相簿許可權才能儲存圖片");
        setSavingQr(false);
        return;
      }
      const fileUri = FileSystem.cacheDirectory + `qr_${Date.now()}.jpg`;
      const { uri } = await FileSystem.downloadAsync(url, fileUri);
      await MediaLibrary.saveToLibraryAsync(uri);
      if (process.env.EXPO_OS === "ios") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      setQrSavedMsg("已保存到相簿");
      setTimeout(() => setQrSavedMsg(null), 2500);
    } catch {
      setQrSavedMsg("儲存失敗，請重試");
    }
    setSavingQr(false);
  };

  // 傳送人：確認收款
  const handleConfirmReceived = async () => {
    if (actingRef.current) return;
    // ── 交易密碼校驗 ──
    if (!confirmTradePwd.trim()) { setError("請輸入交易密碼以確認操作"); return; }
    setTradeVerifying(true);
    const pwdOk = await verifyTradingPassword(userId, simpleHash(confirmTradePwd.trim()));
    setTradeVerifying(false);
    if (!pwdOk) { setError("交易密碼錯誤，請重新輸入"); setConfirmTradePwd(""); return; }

    actingRef.current = true;
    setActing(true); setError("");
    const res = await confirmTransferReceived(order.id, userId);
    actingRef.current = false;
    setActing(false);
    setConfirmModal(null);
    setConfirmTradePwd(""); setShowConfirmTradePwd(false);
    if (res.error) { setError(res.error); return; }
    await loadData();
  };

  // 傳送人：申請仲裁（未收款）
  const handleDispute = async () => {
    if (actingRef.current) return;
    actingRef.current = true;
    setActing(true); setError("");
    const res = await disputeTransferOrder(order.id, userId);
    actingRef.current = false;
    setActing(false);
    setConfirmModal(null);
    if (res.error) { setError(res.error); return; }
    await loadData();
  };

  // 取消訂單
  const handleCancel = async () => {
    if (actingRef.current) return;
    actingRef.current = true;
    setActing(true); setError("");
    const res = await cancelTransferOrder(order.id, userId);
    actingRef.current = false;
    setActing(false);
    if (res.error) { setError(res.error); return; }
    await loadData();
  };

  // 提交仲裁證據
  const handleSubmitEvidence = async () => {
    if (actingRef.current) return;
    // 接收方：圖片可選，只需文字說明；傳送方：圖片或文字至少一項
    if (isReceiver) {
      if (!evidenceText.trim()) {
        setError("請填寫補充說明");
        return;
      }
    } else if (evidenceImageUrls.length === 0 && !evidenceText.trim()) {
      setError("請至少上傳一張圖片或填寫說明");
      return;
    }
    if (evidenceUploadingIdx !== null) { setError("圖片上傳中，請稍候"); return; }
    actingRef.current = true;
    setActing(true); setError("");
    const res = await submitArbitrationEvidence(order.id, userId, evidenceText.trim(), evidenceImageUrls);
    actingRef.current = false;
    setActing(false);
    if (res.error) { setError(res.error); return; }
    setEvidenceVisible(false);
    setEvidenceText("");
    setEvidenceImages([]);
    setEvidenceImageUrls([]);
    await loadData();
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <StatusBar style="light" />

      {/* 全屏背景圖 */}
      <Image
        source={BG_IMG}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        contentFit="cover"
        contentPosition={{ top: 0, left: "50%" }}
        priority="high"
        cachePolicy="memory-disk"
      />

      {/* 固定 NavBar */}
      <View style={{
        position: "absolute", top: 0, left: 0, right: 0, zIndex: 100,
        paddingTop: insets.top + vw * 2.67,
        paddingBottom: vw * 2.67,
        paddingHorizontal: vw * 4,
        flexDirection: "row", justifyContent: "space-between", alignItems: "center",
        backgroundColor: scrolled ? "rgba(0,0,0,0.7)" : "transparent",
      }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Pressable onPress={() => router.back()} style={{ marginRight: vw * 2.67 }}>
            <Image source={IMG_BACK} style={{ width: vw * 4.27, height: vw * 4.27 }} contentFit="contain" />
          </Pressable>
          <Text allowFontScaling={false} style={{ fontSize: vw * 4.27, color: "#fff", fontWeight: "500" }}>
            轉賬訂單
          </Text>
        </View>
      </View>

      {/* 滾動內容區 */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        onScroll={(e) => setScrolled(e.nativeEvent.contentOffset.y > 50)}
        scrollEventThrottle={16}
        contentContainerStyle={{
          paddingTop: navH,
          paddingHorizontal: vw * 4,
          paddingBottom: insets.bottom + 24,
        }}
      >
        {/* 頂部圖示 + 金額 + 狀態 */}
        <View style={{ alignItems: "center", paddingBottom: 24 }}>
          <Image source={IMG_ICON28} style={{ width: vw * 13.33, height: vw * 13.33 }} contentFit="contain" />
          <Text allowFontScaling={false} style={{ color: "#fff", marginTop: 8, fontSize: 16 }}>
            {isSender ? "轉出" : "收入"}
          </Text>
          <Text allowFontScaling={false} style={{ color: "#E68331", fontSize: 24, fontWeight: "700", marginTop: 4, marginBottom: 12 }}>
            {order.amount.toFixed(4)} SMT
          </Text>
          <View style={{
            flexDirection: "row", alignItems: "center", justifyContent: "center",
            borderRadius: 999, borderWidth: 1, borderColor: st.color,
            paddingHorizontal: 12, paddingVertical: 4, gap: 4,
          }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: st.color }} />
            <Text allowFontScaling={false} style={{ color: st.color, fontSize: 12 }}>{st.label}</Text>
          </View>

          {isPendingPayment && !isExpired && (
            <View style={{
              marginTop: 12, flexDirection: "row", alignItems: "center", gap: 6,
              paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
              backgroundColor: st.color + "15", borderWidth: 1, borderColor: st.color + "40",
            }}>
              <Text allowFontScaling={false} style={{ color: st.color, fontSize: 12 }}>剩餘時間</Text>
              <Countdown expiresAt={order.expires_at} />
            </View>
          )}
          {isExpired && (
            <View style={{
              marginTop: 12, flexDirection: "row", alignItems: "center", gap: 6,
              paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
              backgroundColor: "#F43F5E15", borderWidth: 1, borderColor: "#F43F5E40",
            }}>
              <Text allowFontScaling={false} style={{ color: "#F43F5E", fontSize: 12 }}>訂單已超時，SMT 將自動退回</Text>
            </View>
          )}
          {order.status === "pending_confirm" && order.confirm_expires_at && (
            <View style={{
              marginTop: 12, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
              backgroundColor: "#E8520A15", borderWidth: 1, borderColor: "#E8520A40",
            }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text allowFontScaling={false} style={{ color: "#E8520A", fontSize: 12 }}>確認收款剩餘時間：</Text>
                <Countdown expiresAt={order.confirm_expires_at} />
              </View>
              <Text allowFontScaling={false} style={{ color: "#FFFFFF40", fontSize: 11, marginTop: 2 }}>超時未確認將自動進入仲裁</Text>
            </View>
          )}
        </View>

        {/* 訂單詳情 */}
        <CollapsibleCard title="訂單詳情">
          <View style={{ gap: 0 }}>
            <FieldRow label="訂單編號" value={order.id.substring(0, 16) + "…"} copyValue={order.id} />
            <FieldRow label="傳送人" value={`${order.sender?.username ?? "—"} (${order.sender?.referral_code ?? "—"})`} />
            <FieldRow label="接收人" value={`${order.receiver?.username ?? "—"} (${order.receiver?.referral_code ?? "—"})`} />
            <FieldRow label="建立時間" value={new Date(order.created_at).toLocaleString("zh-CN")} />
            {order.remark ? <FieldRow label="備註" value={order.remark} /> : null}
          </View>
        </CollapsibleCard>

        {/* 交易明細 */}
        <CollapsibleCard title="交易明細">
          <View style={{ gap: 0 }}>
            <FieldRow label="轉出數量" value={`${order.amount.toFixed(4)} SMT`} />
            <FieldRow label="約定單價" value={`${order.price.toFixed(4)} ¥/SMT`} />
            <FieldRow label="應收金額" value={`¥ ${order.total_usdt.toFixed(2)}`} color="#22C55E" />
            <FieldRow label="手續費" value={`${(order.fee ?? 0).toFixed(4)} SMT`} color="#F43F5E" />
            <FieldRow label="實際扣除" value={`${(order.amount + (order.fee ?? 0)).toFixed(4)} SMT`} color="#EAB308" />
            {(order.points_cost ?? 0) > 0 && (
              <FieldRow
                label={order.status === "cancelled" ? "退回能量" : "扣除能量"}
                value={`${order.status === "cancelled" ? "+" : "-"}${(order.points_cost ?? 0).toFixed(4)} 能量`}
                color={order.status === "cancelled" ? "#22C55E" : "#EAB308"}
              />
            )}
          </View>
        </CollapsibleCard>

        {/* 收款方式 */}
        {order.payment_method && (
          <CollapsibleCard title="傳送人收款方式">
            <View style={{ gap: 0 }}>
              <FieldRow label="方式" value={order.payment_method.type} />
              <FieldRow label="賬戶名" value={order.payment_method.account_name} />
              <FieldRow label="賬號" value={order.payment_method.account_no} copyValue={order.payment_method.account_no} />
              {order.payment_method.bank_name ? <FieldRow label="銀行/平臺" value={order.payment_method.bank_name} /> : null}
              {order.payment_method.qr_code_url ? (
                <View style={{ alignItems: "center", paddingTop: 12, paddingBottom: 4 }}>
                  <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 12, marginBottom: 8 }}>收款碼（長按可儲存到相簿）</Text>
                  <Pressable
                    onPress={() => setPreviewImage(order.payment_method!.qr_code_url!)}
                    onLongPress={() => handleSaveQrCode(order.payment_method!.qr_code_url!)}
                    delayLongPress={400}
                    className="active:opacity-80"
                    style={{ position: "relative" }}
                  >
                    <Image source={{ uri: order.payment_method!.qr_code_url! }} style={{ width: 160, height: 160, borderRadius: 12 }} contentFit="cover" />
                    {savingQr ? (
                      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", borderRadius: 12 }]}>
                        <ActivityIndicator color="#fff" />
                      </View>
                    ) : null}
                  </Pressable>
                  {qrSavedMsg ? (
                    <Text allowFontScaling={false} style={{ color: qrSavedMsg.includes("失敗") || qrSavedMsg.includes("許可權") ? "#F43F5E" : "#22C55E", fontSize: 12, marginTop: 8 }}>{qrSavedMsg}</Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          </CollapsibleCard>
        )}

        {/* 付款憑證 */}
        {(order.payment_proof || (order.proof_image_urls && order.proof_image_urls.length > 0)) && (
          <CollapsibleCard title="付款憑證">
            <View style={{ gap: 0 }}>
              {order.proof_image_urls && order.proof_image_urls.length > 0 && (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: order.payment_proof ? 10 : 0 }}>
                  {order.proof_image_urls.map((url, i) => (
                    <Pressable key={i} onPress={() => setPreviewImage(url)} className="active:opacity-80">
                      <Image source={{ uri: url }} style={{ width: 80, height: 80, borderRadius: 10 }} contentFit="cover" />
                    </Pressable>
                  ))}
                </View>
              )}
              {order.payment_proof ? (
                <Text allowFontScaling={false} style={{ color: "#FFFFFF", fontSize: 14, lineHeight: 20 }}>{order.payment_proof}</Text>
              ) : null}
            </View>
          </CollapsibleCard>
        )}

        {/* 錯誤提示 */}
        {error ? (
          <View style={{
            marginBottom: 12, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10,
            backgroundColor: "#F43F5E15", borderWidth: 1, borderColor: "#F43F5E40",
            flexDirection: "row", alignItems: "center", gap: 8,
          }}>
            <AlertTriangle size={14} color="#F43F5E" />
            <Text allowFontScaling={false} style={{ color: "#F43F5E", fontSize: 13, flex: 1 }}>{error}</Text>
          </View>
        ) : null}

        {/* 操作區 */}
        <View style={{ gap: 12, marginBottom: 8 }}>

          {/* 接收人：pending_payment → 提交付款憑證 */}
          {isReceiver && isPendingPayment && !isExpired && (
            <Pressable className="active:opacity-70" style={{ backgroundColor: "#E68331", borderRadius: 8, paddingVertical: 14, alignItems: "center" }} onPress={() => { setProofInput(""); setProofImages([]); setProofImageUrls([]); setProofPermDenied(""); setError(""); setProofVisible(true); }}>
              <Text allowFontScaling={false} style={{ color: "#111111", fontWeight: "700", fontSize: 16 }}>已付款 · 上傳憑證</Text>
            </Pressable>
          )}

          {isSender && isPendingConfirm && (
            /* 橫排雙按鈕，比例與 style002 UpgradeDialog 保持一致：390×121 圖片，flex:1 平分 */
            <View style={{ flexDirection: "row", gap: 12 }}>
              {/* 確認收款 · 放幣（mine_btn_confirm） */}
              <Pressable
                className="active:opacity-80"
                style={{ flex: 1, height: (width - 32 - 12) / 2 / (390 / 121), position: "relative" }}
                onPress={() => setConfirmModal("confirm")}
                disabled={acting}
              >
                <Image source={IMG_BTN_CONFIRM} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="fill" />
                <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
                  {acting
                    ? <ActivityIndicator color="#111111" />
                    : <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>確認收款 · 放幣</Text>
                  }
                </View>
              </Pressable>

              {/* 未收款 · 申請仲裁（mine_btn_cancel） */}
              <Pressable
                className="active:opacity-80"
                style={{ flex: 1, height: (width - 32 - 12) / 2 / (390 / 121), position: "relative" }}
                onPress={() => setConfirmModal("dispute")}
                disabled={acting}
              >
                <Image source={IMG_BTN_CANCEL} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="fill" />
                <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
                  <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>未收款 · 申請仲裁</Text>
                </View>
              </Pressable>
            </View>
          )}

          {isSender && isPendingPayment && !isExpired && (
            <View style={{ gap: 4 }}>
              <Pressable
                className={cancelUnlocked && !acting ? "active:opacity-70" : undefined}
                style={{ backgroundColor: "#000", borderRadius: 8, paddingVertical: 14, alignItems: "center", borderWidth: 1, borderColor: cancelUnlocked ? "#FFFFFF15" : "#FFFFFF08", opacity: cancelUnlocked ? 1 : 0.5 }}
                onPress={cancelUnlocked ? handleCancel : undefined}
                disabled={acting || !cancelUnlocked}
              >
                {acting
                  ? <ActivityIndicator color="#FFFFFF40" />
                  : <Text allowFontScaling={false} style={{ color: cancelUnlocked ? "#FFFFFF60" : "#FFFFFF30", fontWeight: "600", fontSize: 15 }}>取消訂單</Text>
                }
              </Pressable>
              {!cancelUnlocked && order?.created_at && (
                <CancelCooldown createdAt={order.created_at} onUnlocked={() => setCancelUnlocked(true)} />
              )}
            </View>
          )}

          {isArbitration && (
            <View style={{ gap: 12 }}>
              <View style={{ borderRadius: 8, padding: 14, backgroundColor: "#F9731615", borderWidth: 1, borderColor: "#F9731640" }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <FileText size={14} color="#F97316" />
                    <Text allowFontScaling={false} style={{ color: "#F97316", fontWeight: "700", fontSize: 14 }}>補充材料中</Text>
                  </View>
                  {evidenceWindowOpen ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Clock size={11} color="#EAB308" />
                      <Text allowFontScaling={false} style={{ color: "#EAB308", fontSize: 12, fontFamily: "monospace" }}>
                        {String(Math.floor(evidenceSecsLeft / 60)).padStart(2, "0")}:{String(evidenceSecsLeft % 60).padStart(2, "0")}
                      </Text>
                    </View>
                  ) : <Text allowFontScaling={false} style={{ color: "#FFFFFF40", fontSize: 11 }}>視窗已關閉</Text>}
                </View>
                <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 12 }}>
                  {evidenceWindowOpen ? "請在視窗關閉前上傳證據圖片及說明，雙方均提交後立即進入仲裁" : "補充材料視窗已超時，等待管理員仲裁"}
                </Text>
              </View>
              {(isSender || isReceiver) && evidenceWindowOpen && !myEvidenceSubmitted && (
                <Pressable className="active:opacity-70" style={{ backgroundColor: "#F97316", borderRadius: 8, paddingVertical: 14, alignItems: "center" }} onPress={() => { setEvidenceText(""); setEvidenceImages([]); setEvidenceImageUrls([]); setEvidencePermDenied(""); setError(""); setEvidenceVisible(true); }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Upload size={16} color="#111111" />
                    <Text allowFontScaling={false} style={{ color: "#111111", fontWeight: "700", fontSize: 15 }}>上傳我的證據材料</Text>
                  </View>
                </Pressable>
              )}
              {(isSender || isReceiver) && myEvidenceSubmitted && (
                <View style={{ borderRadius: 8, padding: 14, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#22C55E15", borderWidth: 1, borderColor: "#22C55E40" }}>
                  <CheckCircle2 size={14} color="#22C55E" />
                  <Text allowFontScaling={false} style={{ color: "#22C55E", fontSize: 13, fontWeight: "600" }}>已提交证据，等待{isSender ? "接收方" : "傳送方"}提交或管理员仲裁</Text>
                </View>
              )}
            </View>
          )}

          {isArbitrationReviewing && (
            <View style={{ borderRadius: 8, padding: 16, alignItems: "center", gap: 4, backgroundColor: "#F43F5E15", borderWidth: 1, borderColor: "#F43F5E40" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Lock size={16} color="#F43F5E" />
                <Text allowFontScaling={false} style={{ color: "#F43F5E", fontWeight: "700" }}>仲裁中</Text>
              </View>
              <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 12, marginTop: 4 }}>管理員正在稽核，將在 24 小時內處理</Text>
            </View>
          )}


        </View>

        <View style={{ height: insets.bottom + 16 }} />
      </ScrollView>

      {/* 付款憑證彈窗 */}
      {/* 上傳付款憑證彈窗 */}
      <Modal visible={proofVisible} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.85)", justifyContent: "flex-end", alignItems: "center" }}>
          <KeyboardAvoidingView behavior={process.env.EXPO_OS === "ios" ? "padding" : undefined} style={{ width: "100%" }}>
            <Pressable style={{ flex: 1 }} onPress={() => { if (uploadingIdx === null) setProofVisible(false); }} />
            {/* 面板：96% 寬、bg20 背景 */}
            <View style={{ width: "96%", maxHeight: sheetMaxHeight, alignSelf: "center", position: "relative", overflow: "hidden", backgroundColor: "#000", borderRadius: vw * 4.27 }}>
              <Image source={IMG_MODAL_BG} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="fill" />
              <View style={{ width: "95%", alignSelf: "center", paddingVertical: vw * 4.27 }}>
                {/* 標題列 */}
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: vw * 3 }}>
                  <Upload size={vw * 5} color="#E8520A" style={{ marginRight: vw * 3 }} />
                  <Text allowFontScaling={false} style={{ color: "#fff", fontSize: vw * 4.53, flex: 1 }}>上傳付款憑證</Text>
                  <Pressable onPress={() => { if (uploadingIdx === null) setProofVisible(false); }} className="active:opacity-70">
                    <Image source={ICON_MODAL_CLOSE} style={{ width: vw * 10.13, height: vw * 10.13 }} contentFit="contain" />
                  </Pressable>
                </View>
                <Text allowFontScaling={false} style={{ color: MUTED, fontSize: 12, marginBottom: vw * 4 }}>
                  上传付款截图（最多 {MAX_IMAGES} 张），可选填备注说明
                </Text>

                <ScrollView bounces={false} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
                  contentContainerStyle={{ paddingBottom: insets.bottom + 16, gap: vw * 3.2 }}>

                  {/* 圖片選擇網格 */}
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                    {proofImages.map((uri, idx) => (
                      <View key={idx} style={{ width: 72, height: 72, borderRadius: 12, overflow: "hidden", position: "relative" }}>
                        <Image source={{ uri }} style={{ width: 72, height: 72 }} contentFit="cover" />
                        {uploadingIdx === idx ? (
                          <View style={{ position: "absolute", inset: 0, backgroundColor: "#000000AA", alignItems: "center", justifyContent: "center" }}>
                            <ActivityIndicator size="small" color="#E8520A" />
                          </View>
                        ) : (
                          <Pressable onPress={() => removeProofImage(idx)}
                            style={{ position: "absolute", top: 3, right: 3, width: 18, height: 18, borderRadius: 9, backgroundColor: "#F43F5ECC", alignItems: "center", justifyContent: "center" }}>
                            <X size={10} color="#fff" />
                          </Pressable>
                        )}
                      </View>
                    ))}
                    {proofImages.length < MAX_IMAGES && uploadingIdx === null && (
                      <Pressable onPress={() => setPickMenuVisible(true)}
                        style={{ width: 72, height: 72, borderRadius: 12, borderWidth: 1.5, borderColor: "#FFFFFF20", borderStyle: "dashed", alignItems: "center", justifyContent: "center", gap: 4 }}>
                        <Plus size={20} color="#E8520A" />
                        <Text allowFontScaling={false} style={{ color: "#E8520A", fontSize: 10 }}>{proofImages.length}/{MAX_IMAGES}</Text>
                      </Pressable>
                    )}
                  </View>

                  {/* 圖片來源選單 */}
                  {pickMenuVisible && (
                    <View style={{ borderRadius: 14, overflow: "hidden", borderWidth: 1, borderColor: "#FFFFFF15" }}>
                      <Pressable style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#FFFFFF15" }}
                        onPress={() => pickAndUploadProofImage("camera")}>
                        <Camera size={15} color="#E8520A" />
                        <Text allowFontScaling={false} style={{ color: "#FFFFFF", fontSize: 14 }}>拍照</Text>
                      </Pressable>
                      <Pressable style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#FFFFFF15" }}
                        onPress={() => pickAndUploadProofImage("gallery")}>
                        <ImageIcon size={15} color="#E8520A" />
                        <Text allowFontScaling={false} style={{ color: "#FFFFFF", fontSize: 14 }}>從相簿選擇</Text>
                      </Pressable>
                      <Pressable style={{ paddingHorizontal: 16, paddingVertical: 12, alignItems: "center" }} onPress={() => setPickMenuVisible(false)}>
                        <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 14 }}>取消</Text>
                      </Pressable>
                    </View>
                  )}

                  {proofPermDenied ? (
                    <Text allowFontScaling={false} style={{ color: "#F43F5E", fontSize: 12 }}>{proofPermDenied}</Text>
                  ) : null}

                  {/* 文字備註（fieldRow 樣式） */}
                  <TdFocusInput
                    value={proofInput}
                    onChangeText={(v) => { setProofInput(v); setError(""); }}
                    placeholder="備註：轉賬流水號或說明（可選）"
                    multiline
                  />

                  {error ? (
                    <Text allowFontScaling={false} style={{ color: "#F43F5E", fontSize: 12 }}>{error}</Text>
                  ) : null}

                  {/* 雙按鈕 */}
                  <View style={{ flexDirection: "row", gap: 12 }}>
                    <Pressable className="active:opacity-80"
                      onPress={() => { if (uploadingIdx === null) setProofVisible(false); }}
                      style={{ flex: 1, aspectRatio: 390 / 121, position: "relative" }}>
                      <Image source={IMG_BTN_CANCEL} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="fill" />
                      <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
                        <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>取消</Text>
                      </View>
                    </Pressable>
                    <Pressable className="active:opacity-80"
                      onPress={handleSubmitProof}
                      disabled={acting || uploadingIdx !== null}
                      style={{ flex: 1, aspectRatio: 390 / 121, position: "relative" }}>
                      <Image source={IMG_BTN_CONFIRM} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="fill" />
                      <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
                        {acting ? <ActivityIndicator color="#111111" /> : <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>確認已付款</Text>}
                      </View>
                    </Pressable>
                  </View>

                </ScrollView>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* 仲裁證據提交彈窗 */}
      <Modal visible={evidenceVisible} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.85)", justifyContent: "flex-end", alignItems: "center" }}>
          <KeyboardAvoidingView behavior={process.env.EXPO_OS === "ios" ? "padding" : undefined} style={{ width: "100%" }}>
            <Pressable style={{ flex: 1 }} onPress={() => { if (evidenceUploadingIdx === null) setEvidenceVisible(false); }} />
            {/* 面板：96% 寬、bg20 背景 */}
            <View style={{ width: "96%", maxHeight: sheetMaxHeight, alignSelf: "center", position: "relative", overflow: "hidden", backgroundColor: "#000", borderRadius: vw * 4.27 }}>
              <Image source={IMG_MODAL_BG} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="fill" />
              <View style={{ width: "95%", alignSelf: "center", paddingVertical: vw * 4.27 }}>
                {/* 標題列 */}
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: vw * 3 }}>
                  <FileText size={vw * 5} color="#F97316" style={{ marginRight: vw * 3 }} />
                  <Text allowFontScaling={false} style={{ color: "#fff", fontSize: vw * 4.53, flex: 1 }}>
                    {isReceiver ? "補充說明" : "上傳證據材料"}
                  </Text>
                  <Pressable onPress={() => { if (evidenceUploadingIdx === null) setEvidenceVisible(false); }} className="active:opacity-70">
                    <Image source={ICON_MODAL_CLOSE} style={{ width: vw * 10.13, height: vw * 10.13 }} contentFit="contain" />
                  </Pressable>
                </View>
                <Text allowFontScaling={false} style={{ color: MUTED, fontSize: 12, marginBottom: vw * 4 }}>
                  {isReceiver
                    ? "請補充文字說明；如需補充新截圖可選填圖片"
                    : "上傳支援你的截圖（最多 " + MAX_IMAGES + " 張），可附文字說明"}
                </Text>

                <ScrollView bounces={false} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
                  contentContainerStyle={{ paddingBottom: insets.bottom + 16, gap: vw * 3.2 }}>

                  {/* 接收方：展示原始付款憑證 */}
                  {isReceiver && (order.proof_image_urls?.length > 0 || order.payment_proof) && (
                    <View style={{ padding: 12, borderRadius: 12, backgroundColor: "#22C55E10", borderWidth: 1, borderColor: "#22C55E30" }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
                        <CheckCircle2 size={12} color="#22C55E" />
                        <Text allowFontScaling={false} style={{ color: "#22C55E", fontSize: 12, fontWeight: "600" }}>已上傳的付款憑證</Text>
                      </View>
                      {order.proof_image_urls?.length > 0 && (
                        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: order.payment_proof ? 8 : 0 }}>
                          {order.proof_image_urls.map((url, i) => (
                            <Pressable key={i} onPress={() => setPreviewImage(url)}>
                              <Image source={{ uri: url }} style={{ width: 64, height: 64, borderRadius: 8 }} contentFit="cover" />
                            </Pressable>
                          ))}
                        </View>
                      )}
                      {order.payment_proof ? (
                        <Text allowFontScaling={false} style={{ color: "#FFFFFF80", fontSize: 12 }}>{order.payment_proof}</Text>
                      ) : null}
                    </View>
                  )}

                  {/* 圖片網格 */}
                  <View>
                    <Text allowFontScaling={false} style={{ color: "#FFFFFF80", fontSize: 12, marginBottom: 8 }}>
                      {isReceiver ? "補充截圖（可選，最多 " + MAX_IMAGES + " 張）" : "證據截圖（必須至少1張）"}
                    </Text>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                      {evidenceImages.map((uri, idx) => (
                        <View key={idx} style={{ width: 72, height: 72, borderRadius: 12, overflow: "hidden", position: "relative" }}>
                          <Image source={{ uri }} style={{ width: 72, height: 72 }} contentFit="cover" />
                          {evidenceUploadingIdx === idx ? (
                            <View style={{ position: "absolute", inset: 0, backgroundColor: "#000000AA", alignItems: "center", justifyContent: "center" }}>
                              <ActivityIndicator size="small" color="#F97316" />
                            </View>
                          ) : (
                            <Pressable onPress={() => removeEvidenceImage(idx)}
                              style={{ position: "absolute", top: 3, right: 3, width: 18, height: 18, borderRadius: 9, backgroundColor: "#F43F5ECC", alignItems: "center", justifyContent: "center" }}>
                              <X size={10} color="#fff" />
                            </Pressable>
                          )}
                        </View>
                      ))}
                      {evidenceImages.length < MAX_IMAGES && evidenceUploadingIdx === null && (
                        <Pressable onPress={() => setEvidencePickMenu(true)}
                          style={{ width: 72, height: 72, borderRadius: 12, borderWidth: 1.5, borderColor: "#F9731640", borderStyle: "dashed", alignItems: "center", justifyContent: "center", gap: 4 }}>
                          <Plus size={20} color="#F97316" />
                          <Text allowFontScaling={false} style={{ color: "#F97316", fontSize: 10 }}>{evidenceImages.length}/{MAX_IMAGES}</Text>
                        </Pressable>
                      )}
                    </View>
                  </View>

                  {/* 圖片來源選單 */}
                  {evidencePickMenu && (
                    <View style={{ borderRadius: 14, overflow: "hidden", borderWidth: 1, borderColor: "#FFFFFF15" }}>
                      {[
                        { label: "拍照", icon: <Camera size={15} color="#F97316" />, action: () => pickAndUploadEvidenceImage("camera") },
                        { label: "從相簿選擇", icon: <ImageIcon size={15} color="#F97316" />, action: () => pickAndUploadEvidenceImage("gallery") },
                      ].map(({ label, icon, action }) => (
                        <Pressable key={label}
                          style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#FFFFFF15" }}
                          onPress={action}>
                          {icon}
                          <Text allowFontScaling={false} style={{ color: "#FFFFFF", fontSize: 14 }}>{label}</Text>
                        </Pressable>
                      ))}
                      <Pressable style={{ paddingHorizontal: 16, paddingVertical: 12, alignItems: "center" }} onPress={() => setEvidencePickMenu(false)}>
                        <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 14 }}>取消</Text>
                      </Pressable>
                    </View>
                  )}

                  {evidencePermDenied ? (
                    <Text allowFontScaling={false} style={{ color: "#F43F5E", fontSize: 12 }}>{evidencePermDenied}</Text>
                  ) : null}

                  {/* 文字說明（fieldRow 樣式） */}
                  <TdFocusInput
                    value={evidenceText}
                    onChangeText={(v) => { setEvidenceText(v); setError(""); }}
                    placeholder={isReceiver ? "請說明情況，例如：已於 XX 時轉賬，流水號 XXXX" : "補充說明（可選）：描述情況或轉賬流水號"}
                    multiline
                  />

                  {error ? (
                    <Text allowFontScaling={false} style={{ color: "#F43F5E", fontSize: 12 }}>{error}</Text>
                  ) : null}

                  {/* 雙按鈕 */}
                  <View style={{ flexDirection: "row", gap: 12 }}>
                    <Pressable className="active:opacity-80"
                      onPress={() => { if (evidenceUploadingIdx === null) setEvidenceVisible(false); }}
                      style={{ flex: 1, aspectRatio: 390 / 121, position: "relative" }}>
                      <Image source={IMG_BTN_CANCEL} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="fill" />
                      <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
                        <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>取消</Text>
                      </View>
                    </Pressable>
                    <Pressable className="active:opacity-80"
                      onPress={handleSubmitEvidence}
                      disabled={acting || evidenceUploadingIdx !== null}
                      style={{ flex: 1, aspectRatio: 390 / 121, position: "relative" }}>
                      <Image source={IMG_BTN_CONFIRM} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="fill" />
                      <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
                        {acting ? <ActivityIndicator color="#111111" /> : <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>提交證據</Text>}
                      </View>
                    </Pressable>
                  </View>

                </ScrollView>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* 憑證圖片全屏預覽 */}
      <Modal visible={!!previewImage} transparent animationType="fade" onRequestClose={() => setPreviewImage(null)}>
        <Pressable
          style={{ flex: 1, backgroundColor: "#000000EE", alignItems: "center", justifyContent: "center" }}
          onPress={() => setPreviewImage(null)}
        >
          <Image source={{ uri: previewImage ?? "" }} style={{ width: "90%", height: "70%" }} contentFit="contain" />
          <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 13, marginTop: 16 }}>點選任意區域關閉</Text>
        </Pressable>
      </Modal>

      {/* 確認收款 / 申請仲裁 彈窗 */}
      <Modal visible={confirmModal !== null} transparent animationType="fade" onRequestClose={() => setConfirmModal(null)}>
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}
          onPress={() => setConfirmModal(null)}
        >
          <Pressable onPress={(e) => e.stopPropagation()} style={{ width: "100%" }}>
            <View style={{ width: "100%", position: "relative", backgroundColor: "#000" }}>
              <Image source={IMG_DIALOG_BG} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="fill" />
              <View style={{ paddingHorizontal: 20, paddingTop: 28, paddingBottom: 24, alignItems: "center" }}>
                {/* 頂部圖標 */}
                <Image source={IMG_DIALOG_ICON} style={{ width: 52, height: 52, marginBottom: 12 }} contentFit="contain" />

                {confirmModal === "confirm" ? (
                  <>
                    <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 20, fontWeight: "800", marginBottom: 8 }}>確認收款</Text>
                    <Text allowFontScaling={false} style={{ color: MUTED, fontSize: 14, textAlign: "center", lineHeight: 22, marginBottom: 16 }}>
                      確認已收到 <Text style={{ color: "#DE792D" }}>{order.total_usdt.toFixed(2)} ¥</Text>？{"\n"}
                      確認后 <Text style={{ color: "#DE792D" }}>{order.amount.toFixed(4)} SMT</Text> 将立即转入接收人賬戶，操作不可撤销。
                    </Text>
                    {/* 交易密碼 */}
                    <View style={{ width: "92%", marginBottom: 8 }}>
                      <TdFocusInput
                        value={confirmTradePwd}
                        onChangeText={(v) => { setConfirmTradePwd(v); setError(""); }}
                        placeholder="請輸入交易密碼"
                        secureTextEntry={!showConfirmTradePwd}
                        suffix={
                          <Pressable onPress={() => setShowConfirmTradePwd(!showConfirmTradePwd)} className="active:opacity-70 pl-2 py-2">
                            {showConfirmTradePwd ? <EyeOff size={16} color="#FFFFFF40" /> : <Eye size={16} color="#FFFFFF40" />}
                          </Pressable>
                        }
                        prefixIcon={<ShieldCheck size={15} color="#E8520A" />}
                      />
                    </View>
                    {error ? (
                      <Text allowFontScaling={false} style={{ color: "#F43F5E", fontSize: 12, marginBottom: 8 }}>{error}</Text>
                    ) : null}
                    {/* 雙按鈕 */}
                    <View style={{ flexDirection: "row", gap: 12, width: "92%", marginTop: 4 }}>
                      <Pressable
                        className="active:opacity-80"
                        onPress={() => { setConfirmModal(null); setConfirmTradePwd(""); setShowConfirmTradePwd(false); setError(""); }}
                        style={{ flex: 1, aspectRatio: 390 / 121, position: "relative" }}
                      >
                        <Image source={IMG_BTN_CANCEL} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="fill" />
                        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
                          <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>再等等</Text>
                        </View>
                      </Pressable>
                      <Pressable
                        className="active:opacity-80"
                        onPress={handleConfirmReceived}
                        disabled={acting || tradeVerifying}
                        style={{ flex: 1, aspectRatio: 390 / 121, position: "relative" }}
                      >
                        <Image source={IMG_BTN_CONFIRM} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="fill" />
                        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
                          {(acting || tradeVerifying)
                            ? <ActivityIndicator color="#111111" />
                            : <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>確認放幣</Text>
                          }
                        </View>
                      </Pressable>
                    </View>
                  </>
                ) : (
                  <>
                    <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 20, fontWeight: "800", marginBottom: 8 }}>申請仲裁</Text>
                    <Text allowFontScaling={false} style={{ color: MUTED, fontSize: 14, textAlign: "center", lineHeight: 22, marginBottom: 20 }}>
                      选择"未收款"后，订单将进入仲裁状态，{"\n"}
                      SMT 保持锁定由管理员处理，不可撤销。
                    </Text>
                    {/* 雙按鈕 */}
                    <View style={{ flexDirection: "row", gap: 12, width: "92%", marginBottom: 4 }}>
                      <Pressable
                        className="active:opacity-80"
                        onPress={() => setConfirmModal(null)}
                        style={{ flex: 1, aspectRatio: 390 / 121, position: "relative" }}
                      >
                        <Image source={IMG_BTN_CONFIRM} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="fill" />
                        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
                          <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>取消</Text>
                        </View>
                      </Pressable>
                      <Pressable
                        className="active:opacity-80"
                        onPress={handleDispute}
                        disabled={acting}
                        style={{ flex: 1, aspectRatio: 390 / 121, position: "relative" }}
                      >
                        <Image source={IMG_BTN_CANCEL} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="fill" />
                        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
                          {acting
                            ? <ActivityIndicator color="#fff" />
                            : <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>申請仲裁</Text>
                          }
                        </View>
                      </Pressable>
                    </View>
                  </>
                )}
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

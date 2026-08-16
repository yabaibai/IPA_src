/* eslint-disable no-undef */
import { useState, useEffect, useCallback, useRef } from "react";
import {
  View, Text, ScrollView, RefreshControl, KeyboardAvoidingView, Pressable, ActivityIndicator, Modal, TextInput, StyleSheet, useWindowDimensions, ImageBackground,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  User, Shield, Key, ChevronRight, Settings,
  CheckCircle2, Eye, EyeOff, UserPlus,
  RefreshCw, Camera, ImageIcon,
} from "lucide-react-native";
import * as Clipboard from "expo-clipboard";
import * as ImagePicker from "expo-image-picker";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import * as FileSystem from "expo-file-system/legacy";
import { decode } from "base64-arraybuffer";
import { useSession, signOutCleanly, forceLocalSignOut } from "@/ctx";
import { getProfile, getWhalePool, getWalletBalance, updateProfile, getMyReferrer, lookupByReferralCode, bindReferrer, simpleHash, getLevelConfig, applyMerchant, getMerchantLevelConfigs, type MerchantLevelConfigItem } from "@/db/api";
import { withTimeout } from "@/lib/asyncTool";
import { sharedGet, RefreshTooFrequentError } from "@/lib/requestDedup";
import { showToast } from "@/lib/toast";
import { getTierInfo, MERCHANT_LEVEL_CONFIG, type Profile, type WhalePool, type WalletBalance, type LevelConfig } from "@/types/types";
import { supabase } from "@/client/supabase";
import { useVersionCheck } from "@/hooks/useVersionCheck";
import UpdateDialog from "@/components/UpdateDialog";
import { usePendingTransfers } from "@/hooks/usePendingTransfers";

// ─── 顏色常量 ────────────────────────────────────────────
const OG   = "#FF5E1A";
const OG2  = "#DA8103";
const MUTED = "#999999";
const BORDER = "rgba(255,255,255,0.15)";

// ─── style002 圖片資源（每個獨立常量，Metro 靜態分析要求）
const BODY_BG   = require("../../../../assets/page-img/page_bg.webp");
const IMG_BG1    = require("../../../../assets/page-img/mine_bg1.png");
const IMG_BG2    = require("../../../../assets/page-img/mine_bg2.png");
const IMG_BG3    = require("../../../../assets/page-img/mine_bg3.png");
const IMG_BG4    = require("../../../../assets/page-img/mine_bg4.png");
const IMG_BG5    = require("../../../../assets/page-img/mine_bg5.png");
const IMG_ICON2  = require("../../../../assets/page-img/mine_icon2.png");
const IMG_ICON3  = require("../../../../assets/page-img/mine_icon3.png");
const IMG_ICON4  = require("../../../../assets/page-img/mine_icon4.png");
const IMG_ICON5  = require("../../../../assets/page-img/mine_icon5.png");
const IMG_ICON6  = require("../../../../assets/page-img/mine_icon6.png");
const IMG_ICON7  = require("../../../../assets/page-img/mine_icon7.png");
const IMG_ICON8  = require("../../../../assets/page-img/mine_icon8.png");
const IMG_ICON9  = require("../../../../assets/page-img/mine_icon9.png");
const IMG_BTG222 = require("../../../../assets/page-img/btg222.png");
// ─── 图标更换包（icon_update）
const IMG_ICON_SHARE    = require("../../../../assets/page-img/icon_share.png");    // 分享/复制
const IMG_ICON_MERCHANT = require("../../../../assets/page-img/icon_merchant.png"); // 商户申请不可用
const IMG_ICON_WECHAT   = require("../../../../assets/page-img/icon_wechat.png");   // 上级微信
const IMG_ICON_PHONE    = require("../../../../assets/page-img/icon_phone.png");    // 上级 ID / 手机
const IMG_ICON_EMAIL    = require("../../../../assets/page-img/icon_email.png");    // 上级邮箱
const IMG_ICON_KEY      = require("../../../../assets/page-img/icon_key.png");      // 钥匙（修改密码）
const IMG_ICON_ID_VERIFY  = require("../../../../assets/page-img/icon_id_verify.png");  // 實名認證
const IMG_ICON_EDIT_PWD   = require("../../../../assets/page-img/icon_edit_pwd.png");   // 修改密码
const IMG_ICON_ACTIVATION = require("../../../../assets/page-img/icon_activation.png"); // 启用码
const IMG_ICON_PAYMENT  = require("../../../../assets/page-img/icon_payment.png");  // 收款方式
// ─── 上级信息框背景（987×533）
const IMG_SUPERIOR_BG     = require("../../../../assets/page-img/superior_card_bg.png");
// ─── 头像边框 + 编辑图标
const IMG_AVATAR_FRAME    = require("../../../../assets/page-img/avatar_frame.png");   // 头像外框 166×164
const IMG_AVATAR_EDIT     = require("../../../../assets/page-img/avatar_edit_icon.png"); // 头像右下编辑图标 49×49
// ─── 复制图标（待机 / 选中）
const IMG_COPY_IDLE       = require("../../../../assets/page-img/icon_copy_idle.png");   // 复制待机 36×37
const IMG_COPY_ACTIVE     = require("../../../../assets/page-img/icon_copy_active.png"); // 复制选中 36×37
// ─── 等级胶囊背景（194×42，已激活 / 未激活）
const IMG_TIER_CAPSULE    = require("../../../../assets/page-img/tier_capsule_bg.png");
const IMG_TIER_INACTIVE   = require("../../../../assets/page-img/tier_capsule_inactive.png");
// ─── 確認退出弹窗（對齊確認升級樣式）
const IMG_DIALOG_BG       = require("../../../../assets/page-img/mine_dialog_bg.png");
const IMG_DIALOG_ICON     = require("../../../../assets/page-img/mine_icon29.png");
const IMG_BTN_CONFIRM     = require("../../../../assets/page-img/mine_btn_confirm.png");
const IMG_BTN_CANCEL      = require("../../../../assets/page-img/mine_btn_cancel.png");
const IMG_MODAL_BG        = require("../../../../assets/page-img/bg20.png");
const ICON_MODAL_CLOSE    = require("../../../../assets/page-img/icon12.png");
// ─── BgBox：圖片背景卡片 ─────────────────────────────────
function BgBox({ src, ratio, children, style }: {
  src: ReturnType<typeof require>; ratio: number;
  children: React.ReactNode; style?: object;
}) {
  return (
    <View style={[{ position: "relative", width: "100%" }, style]}>
      <Image source={src} style={{ width: "100%", aspectRatio: ratio }} contentFit="fill" />
      <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
        {children}
      </View>
    </View>
  );
}

// ─── CellItem：菜單行（圖標 + 標題 + 備注 + 箭頭）────────
function CellItem({ img, icon, title, remark, remarkColor, onPress }: {
  img?: ReturnType<typeof require>; icon?: React.ReactNode;
  title: string; remark?: string; remarkColor?: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      className="active:opacity-70"
      style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", height: 52, paddingHorizontal: 16 }}
      onPress={onPress}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        {img
          ? <Image source={img} style={{ width: 24, height: 24 }} contentFit="contain" />
          : <View style={{ width: 24, height: 24, alignItems: "center", justifyContent: "center" }}>{icon}</View>}
        <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 14 }} numberOfLines={1}>{title}</Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        {!!remark && (
          <Text allowFontScaling={false} style={{ color: remarkColor ?? MUTED, fontSize: 12 }} numberOfLines={1}>{remark}</Text>
        )}
        <ChevronRight size={16} color={OG2} />
      </View>
    </Pressable>
  );
}

const AVATAR_BUCKET = "avatars";

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: screenHeight } = useWindowDimensions();
  const vw = Math.min(windowWidth, 375) / 100;
  const sheetMaxHeight = screenHeight * 0.88;
  const { session } = useSession();
  const userId = session?.user.id ?? "";
  // 版本檢測：僅用於卡片顯示 + 本頁彈窗，與 _layout 彈窗互斥（透過 dismiss 控制）
  const { showUpdate, forceUpdate, latestVersion, localVersion, apkUrl, dismiss: dismissUpdate } = useVersionCheck();
  const { pendingCount } = usePendingTransfers(userId);
  const [versionDialogOpen, setVersionDialogOpen] = useState(false);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [pool, setPool] = useState<WhalePool | null>(null);
  const [wallet, setWallet] = useState<WalletBalance | null>(null);
  const [currentConfig, setCurrentConfig] = useState<LevelConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [balanceHidden, setBalanceHidden] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [referrer, setReferrer] = useState<{
    id: string; username: string; referral_code: string;
    phone?: string | null; email?: string | null; wechat_id?: string | null;
    show_phone_to_downline?: boolean | null; show_wechat_to_downline?: boolean | null;
  } | null>(null);
  const [editNameVisible, setEditNameVisible] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState("");
  const [logoutVisible, setLogoutVisible] = useState(false);
  const [verifiedTipVisible, setVerifiedTipVisible] = useState(false);
  const [emailOnlyTipVisible, setEmailOnlyTipVisible] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedRefId, setCopiedRefId] = useState(false);
  const [copiedRefPhone, setCopiedRefPhone] = useState(false);
  const [copiedRefWechat, setCopiedRefWechat] = useState(false);

  // 商戶申請狀態
  const [merchantApplying, setMerchantApplying] = useState(false);
  const [merchantApplyMsg, setMerchantApplyMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [merchantConfirmVisible, setMerchantConfirmVisible] = useState(false);
  const [merchantLevelCfg, setMerchantLevelCfg] = useState<MerchantLevelConfigItem[]>([]);

  const handleApplyMerchant = async () => {
    setMerchantConfirmVisible(false);
    setMerchantApplying(true);
    setMerchantApplyMsg(null);
    const res = await applyMerchant(userId);
    setMerchantApplying(false);
    if (res.success) {
      setMerchantApplyMsg({ text: "✅ 申請已提交，正在等待後臺稽核，請耐心等待", ok: true });
      await loadData();
    } else {
      setMerchantApplyMsg({ text: res.error ?? "申請失敗，請重試", ok: false });
    }
  };

  // 頭像上傳狀態
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarPickMenu, setAvatarPickMenu] = useState(false);
  const [avatarPermissionDenied, setAvatarPermissionDenied] = useState("");

  const handleAvatarPickAndUpload = async (source: "camera" | "gallery") => {
    setAvatarPickMenu(false);
    setAvatarPermissionDenied("");
    let asset: ImagePicker.ImagePickerAsset | undefined;
    if (source === "camera") {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") { setAvatarPermissionDenied("請在系統設定中允許訪問相機"); return; }
      const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 1 });
      if (!result.canceled) asset = result.assets[0];
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") { setAvatarPermissionDenied("請在系統設定中允許訪問相簿"); return; }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 1 });
      if (!result.canceled) asset = result.assets[0];
    }
    if (!asset) return;
    setAvatarUploading(true);
    try {
      // 壓縮到 300px 頭像尺寸
      const actions: Parameters<typeof manipulateAsync>[1] = (asset.width ?? 0) > 300 ? [{ resize: { width: 300 } }] : [];
      const compressed = await manipulateAsync(asset.uri, actions, { compress: 0.6, format: SaveFormat.JPEG });
      // 上傳到 Storage（路徑以 userId 開頭滿足 RLS 策略）
      const path = `${userId}/avatar_${Date.now()}.jpg`;
      const base64 = await FileSystem.readAsStringAsync(compressed.uri, { encoding: FileSystem.EncodingType.Base64 });
      const buf = decode(base64);
      const { data, error } = await supabase.storage.from(AVATAR_BUCKET).upload(path, buf, { contentType: "image/jpeg", upsert: true });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(data.path);
      await updateProfile(userId, { avatar_url: publicUrl });
      setProfile((prev) => prev ? { ...prev, avatar_url: publicUrl } : prev);
    } catch {
      setAvatarPermissionDenied("上傳失敗，請重試");
    } finally {
      setAvatarUploading(false);
    }
  };

  // 繫結上級彈窗狀態
  const [bindVisible, setBindVisible] = useState(false);
  const [bindId, setBindId] = useState("");
  const [bindPreview, setBindPreview] = useState<{ username: string | null; phone: string | null } | null>(null);
  const [bindLooking, setBindLooking] = useState(false);
  const [bindPassword, setBindPassword] = useState("");
  const [bindMsg, setBindMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [bindLoading, setBindLoading] = useState(false);

  // ── 數據加載（統一引擎）──
  // 串行 + 間隔拉取：避免登入後瞬時並發觸發 WAF CC 限速導致接口隨機 null（數據不全）。
  const fetchProfile = useCallback(async (force = false) => {
    const uid = userId;
    if (!uid) return null;
    // [PROFILE_PERF] 计时：逐个请求记耗时 + 整体耗时
    const _t0 = Date.now();
    const _log = (label, ms, hit) => console.log("[PROFILE_PERF]", label, "ms=", ms, "cacheHit=", hit);
    const _wrap = async (label, fn, opts) => {
      const a = Date.now();
      const v = await sharedGet(label, fn, opts);
      const b = Date.now();
      _log(label, b - a, (b - a) < 200);
      return v;
    };
    // 共用去重層
    const p = await _wrap("profile", () => getProfile(uid), { force, shared: true });
    const pl = await _wrap("pool", () => getWhalePool(uid), { force, shared: true });
    const w = await _wrap("wallet", () => getWalletBalance(uid), { force, shared: true });
    const ref = await _wrap("referrer", () => getMyReferrer(uid), { force, shared: true });
    const merchantCfg = await _wrap("merchantCfg", () => getMerchantLevelConfigs(), { force, shared: true });
    let cfg = null;
    if (pl) { cfg = await _wrap("levelCfg", () => getLevelConfig(pl.level), { force, shared: true }); }
    console.log("[PROFILE_PERF] TOTAL ms=", Date.now() - _t0, "force=", force);
    console.log("[PROFILE_V2] ref=", JSON.stringify(ref)?.slice(0,160), "p=", !!p, "w=", !!w, "pl=", !!pl);
    return { p, pl, w, ref, merchantCfg, cfg };
  }, [userId]);

  const applyProfile = useCallback((d) => {
    const { p, pl, w, ref, merchantCfg, cfg } = d;
    if (p) setProfile(p);
    if (pl) setPool(pl);
    if (w) setWallet(w);
    if (ref) setReferrer(ref);
    if (merchantCfg) setMerchantLevelCfg(merchantCfg.levels);
    if (cfg) setCurrentConfig(cfg);
  }, []);

  // 簡化加載：userId 就緒即並發加載，數據到達即顯示；下拉刷新復用同一邏輯。
  const loadData = useCallback(async (isRefresh = false) => {
    if (!userId) return;
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const d = await fetchProfile(isRefresh);
      if (d) applyProfile(d);
    } catch (e) {
      // 刷新過於頻密（已有在飛請求）→ 輕提示，不顯示失敗態
      if (e instanceof RefreshTooFrequentError) showToast("刷新過於頻密，請稍後再試");
    } finally { if (isRefresh) setRefreshing(false); else setLoading(false); }
  }, [userId, fetchProfile, applyProfile]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSaveName = async () => {
    if (!newUsername.trim()) { setNameError("使用者名稱不能為空"); return; }
    if (!/^[a-zA-Z0-9_\u4e00-\u9fa5]{2,20}$/.test(newUsername.trim())) {
      setNameError("使用者名稱2-20位，支援中英文數字下劃線");
      return;
    }
    setSavingName(true);
    const err = await updateProfile(userId, { username: newUsername.trim() });
    setSavingName(false);
    if (err) { setNameError("儲存失敗，請重試"); return; }
    setEditNameVisible(false);
    await loadData();
  };

  const handleLogout = async () => {
    setLogoutVisible(false);
    // 強制本地登出（await 確保 AsyncStorage 的 sb-* 舊 session 真正清空，避免重登攜髒 token）
    await forceLocalSignOut();
    router.replace("/(auth)/sign-in" as any);
    // 異步清 DB token + 通知後端（不阻塞 UI）
    signOutCleanly().catch(() => {});
  };

  const handleCopyCode = async () => {
    if (!profile?.referral_code) return;
    await Clipboard.setStringAsync(profile.referral_code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // 查詢上級預覽資訊
  const handleLookupReferrer = async (code: string) => {
    setBindId(code);
    setBindPreview(null);
    setBindMsg(null);
    if (code.trim().length < 4) return;
    setBindLooking(true);
    const result = await lookupByReferralCode(code);
    setBindLooking(false);
    setBindPreview(result ? { username: result.username, phone: result.phone } : null);
    if (!result) setBindMsg({ text: "未找到該ID使用者", ok: false });
  };

  // 確認繫結
  const handleBindReferrer = async () => {
    if (!bindPreview) { setBindMsg({ text: "請先輸入有效的上級ID", ok: false }); return; }
    if (!bindPassword.trim()) { setBindMsg({ text: "請輸入交易密碼", ok: false }); return; }
    setBindLoading(true);
    setBindMsg(null);
    const result = await bindReferrer(userId, bindId, simpleHash(bindPassword.trim()));
    setBindLoading(false);
    if (result.success) {
      setBindMsg({ text: "繫結成功！", ok: true });
      setTimeout(async () => {
        setBindVisible(false);
        await loadData();
      }, 1000);
    } else if (result.error === "NO_TRADING_PWD") {
      setBindMsg({ text: "您尚未設定交易密碼，請先前往[修改密碼]頁面設定", ok: false });
    } else {
      setBindMsg({ text: result.error ?? "繫結失敗，請重試", ok: false });
    }
  };

  // session 尚未就緒（userId 為空）：顯示「用戶信息校驗中…」而非空白/全空數據，避免用戶誤以為數據丟失
  if (!userId) {
    return (
      <View style={{ flex: 1, backgroundColor: "#0A0A0A" }} className="items-center justify-center">
        <ActivityIndicator size="large" color={OG} />
        <Text allowFontScaling={false} style={{ color: "#999", fontSize: 13, marginTop: 12 }}>用戶信息校驗中…</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: "#0A0A0A" }} className="items-center justify-center">
        <ActivityIndicator size="large" color={OG} />
        <Text allowFontScaling={false} style={{ color: "#999", fontSize: 13, marginTop: 12 }}>用戶信息校驗中…</Text>
      </View>
    );
  }

  // pool 為 null 或未啟用時顯示 Lv.0，啟用後顯示真實等級
  const isPoolActive = pool?.is_active === true;
  const displayLevel = isPoolActive ? (pool?.level ?? 1) : 0;
  const tierInfo = getTierInfo(isPoolActive ? (pool?.level ?? 1) : 1);
  // 稱號優先讀 DB level_name → tier_name → 本地 TIER_COLORS，與算力池頁保持一致
  const tierLabel = currentConfig?.level_name ?? currentConfig?.tier_name ?? tierInfo.label;
  const displayName = profile?.username
    || (session?.user.email ? session.user.email.split("@")[0] : null)
    || (session?.user.phone ? session.user.phone.slice(-4).padStart(session.user.phone.length, "*") : null)
    || "未知使用者";

  return (
    <View style={{ flex: 1, backgroundColor: "#0A0A0A" }}>
      <StatusBar style="light" />
      {/* 全屏背景圖：與推薦獎勵頁面一致 */}
      <Image
        source={BODY_BG}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        contentFit="cover"
        priority="high"
        cachePolicy="memory-disk"
      />
      <ScrollView
        style={{ flex: 1 }}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          paddingTop: insets.top,
          paddingBottom: insets.bottom + 88,
          paddingHorizontal: 16,
          gap: 12,
        }}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled={true}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={async () => { await loadData(true); }} tintColor="#E8520A" colors={["#E8520A"]} />
        }
      >
        {loadError && (
          <Pressable onPress={() => loadData()} style={{ backgroundColor: "#3A1A0A", paddingVertical: 10, marginBottom: 8 }}>
            <Text style={{ color: "#FF8C42", fontSize: 13, textAlign: "center" }}>數據加載失敗，點擊重試</Text>
          </Pressable>
        )}
        {/* ── 頂部標題 ── */}
        <View style={{ paddingVertical: 12 }}>
          <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 24, fontWeight: "800" }}>我的</Text>
        </View>

        {/* ── 1. 用戶信息卡片 ── bg1: 987×297 ── */}
        <BgBox src={IMG_BG1} ratio={987 / 297}>
          <View style={{ flex: 1, flexDirection: "row", alignItems: "center", paddingHorizontal: 16 }}>
            {/* 頭像（可點選上傳）— 边框图片叠加 */}
            <Pressable
              onPress={() => !avatarUploading && setAvatarPickMenu(true)}
              disabled={avatarUploading}
              className="active:opacity-80"
              style={{ position: "relative", width: 72, height: 72 }}
            >
              {/* 头像内容（居中于边框内） */}
              <View style={{
                position: "absolute", top: 6, left: 6, right: 6, bottom: 6,
                borderRadius: 12, overflow: "hidden",
                alignItems: "center", justifyContent: "center",
                backgroundColor: "#1A1208",
              }}>
                {avatarUploading
                  ? <ActivityIndicator size="small" color={OG} />
                  : profile?.avatar_url
                    ? <Image source={{ uri: profile.avatar_url }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
                    : <Text allowFontScaling={false} style={{ fontSize: 28 }}>🐋</Text>}
              </View>
              {/* 头像外框图片覆盖 */}
              <Image source={IMG_AVATAR_FRAME} style={{ width: 72, height: 72, position: "absolute", top: 0, left: 0 }} contentFit="contain" />
              {/* 右下编辑图标 */}
              {!avatarUploading && (
                <Image source={IMG_AVATAR_EDIT} style={{
                  position: "absolute", bottom: -2, right: -2,
                  width: 22, height: 22,
                }} contentFit="contain" />
              )}
            </Pressable>

            {/* 用戶信息 */}
            <View style={{ flex: 1, marginLeft: 12, gap: 6 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 16, fontWeight: "700", flex: 1 }} numberOfLines={1}>
                  {displayName}
                </Text>
                <Pressable
                  className="active:opacity-70"
                  onPress={() => router.push("/(app)/personal-info" as any)}
                >
                  <Text allowFontScaling={false} style={{ color: OG2, fontSize: 13 }}>編輯</Text>
                </Pressable>
              </View>
              {/* 邀請碼 */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Text allowFontScaling={false} style={{ color: MUTED, fontSize: 12 }}>邀請碼：</Text>
                <Text allowFontScaling={false} style={{ color: OG2, fontSize: 12, fontWeight: "700", fontFamily: "monospace", flexShrink: 1, flexWrap: "wrap" }}>
                  {profile?.referral_code ?? "------"}
                </Text>
                <Pressable className="active:opacity-70" onPress={handleCopyCode}>
                  <Image source={copiedCode ? IMG_COPY_ACTIVE : IMG_COPY_IDLE} style={{ width: 12, height: 12 }} contentFit="contain" />
                </Pressable>
              </View>
              {/* 等級膠囊 */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                {isPoolActive ? (
                  /* 已激活 — 純色膠囊（圓角+背景+邊框，寬度隨文字自動撐開，不裁切） */
                  <View style={{ alignSelf: "flex-start", paddingVertical: 3, paddingHorizontal: 12, borderRadius: 11, backgroundColor: "#C8860A22", borderWidth: 1, borderColor: "#C8860A" }}>
                    <Text allowFontScaling={false} style={{ color: "#C8860A", fontSize: 11, fontWeight: "800" }}>{tierLabel} - Lv.{displayLevel} </Text>
                  </View>
                ) : (
                  /* 未激活 — 純色膠囊（圓角+背景+邊框，寬度隨文字自動撐開，不裁切） */
                  <View style={{ alignSelf: "flex-start", paddingVertical: 3, paddingHorizontal: 12, borderRadius: 11, backgroundColor: "#88888822", borderWidth: 1, borderColor: "#888888" }}>
                    <Text allowFontScaling={false} style={{ color: "#888888", fontSize: 11 }}>未啟用 - Lv.0 </Text>
                  </View>
                )}
                {pool?.is_active && (
                  <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: "#22C55E20" }}>
                    <Text allowFontScaling={false} style={{ color: "#22C55E", fontSize: 11 }}>已啟用</Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        </BgBox>

        {/* 頭像上傳許可權提示 */}
        {avatarPermissionDenied ? (
          <Text allowFontScaling={false} style={{ color: "#F43F5E", fontSize: 12, paddingHorizontal: 4 }}>{avatarPermissionDenied}</Text>
        ) : null}

        {/* 頭像來源選擇（展開在用戶卡下方） */}
        {avatarPickMenu && (
          <View style={{ backgroundColor: "#1A1A1A", borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: BORDER }}>
            {[
              { label: "拍照", icon: <Camera size={16} color={OG} />, action: () => handleAvatarPickAndUpload("camera") },
              { label: "從相簿選擇", icon: <ImageIcon size={16} color={OG} />, action: () => handleAvatarPickAndUpload("gallery") },
            ].map((item, i) => (
              <Pressable key={item.label}
                style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14,
                  borderBottomWidth: i === 0 ? 1 : 0, borderBottomColor: "#FFFFFF10" }}
                className="active:opacity-70" onPress={item.action}
              >
                {item.icon}
                <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 14 }}>{item.label}</Text>
              </Pressable>
            ))}
            <Pressable style={{ alignItems: "center", paddingVertical: 14, borderTopWidth: 1, borderTopColor: "#FFFFFF10" }}
              className="active:opacity-70" onPress={() => setAvatarPickMenu(false)}>
              <Text allowFontScaling={false} style={{ color: MUTED, fontSize: 14 }}>取消</Text>
            </Pressable>
          </View>
        )}

        {/* ── 2. 我的錢包 ── bg1 外卡 + bg5 三格子卡 ── */}
        <BgBox src={IMG_BG1} ratio={987 / 340}>
          <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 24, gap: 6 }}>
            <Pressable
              className="active:opacity-70"
              style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
              onPress={() => router.push("/(app)/(tabs)/wallet" as any)}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Image source={IMG_ICON2} style={{ width: 16, height: 14 }} contentFit="contain" />
                <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>我的錢包</Text>
                {pendingCount > 0 && (
                  <View style={{ minWidth: 18, height: 18, borderRadius: 9, backgroundColor: "#F43F5E", paddingHorizontal: 4, alignItems: "center", justifyContent: "center" }}>
                    <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 10, fontWeight: "800", lineHeight: 13 }}>{pendingCount > 9 ? "9+" : pendingCount}</Text>
                  </View>
                )}
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Pressable
                  onPress={(e) => { e.stopPropagation(); setBalanceHidden((v) => !v); }}
                  className="active:opacity-60" hitSlop={8}
                >
                  {balanceHidden ? <EyeOff size={15} color={OG2} /> : <Eye size={15} color={OG2} />}
                </Pressable>
                <ChevronRight size={16} color={OG2} />
              </View>
            </Pressable>
            {/* 三格子卡 bg5 269×168 — 精确宽度模式（避免 Android absolute 容器宽度测量失准导致文字截断） */}
            {(() => {
              // ScrollView paddingHorizontal:16×2=32，BgBox内容区 paddingHorizontal:16×2=32，gap:8×2=16，三等分
              const cardW = (windowWidth - 32 - 32 - 16) / 3;
              const cardH = cardW / (269 / 168);
              return (
                <View style={{ flexDirection: "row", gap: 8, flex: 1 }}>
                  {[
                    { label: "SMT",  value: wallet ? wallet.ant_balance.toFixed(2) : "--" },
                    { label: "能量", value: wallet ? wallet.points.toFixed(4) : "--" },
                    { label: "USDT", value: wallet ? wallet.usdt_balance.toFixed(2) : "--" },
                  ].map((item) => (
                    <View key={item.label} style={{ width: cardW, height: cardH }}>
                      {/* 背景图 */}
                      <Image source={IMG_BG5} style={{ position: "absolute", top: 0, left: 0, width: cardW, height: cardH }} contentFit="fill" />
                      {/* 文字内容层：明确 width/height，Android 能正确测量文字宽度 */}
                      <View style={{ position: "absolute", top: 0, left: 0, width: cardW, height: cardH,
                        alignItems: "center", justifyContent: "center", paddingVertical: 6, paddingHorizontal: 4 }}>
                        <Text allowFontScaling={false} style={{ color: OG2, fontSize: 14, fontWeight: "700", width: cardW - 8, textAlign: "center" }}
                          numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                          {balanceHidden ? "****" : item.value}
                        </Text>
                        <Text allowFontScaling={false} style={{ color: MUTED, fontSize: 11, marginTop: 2, width: cardW - 8, textAlign: "center" }}
                          numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{item.label}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              );
            })()}
          </View>
        </BgBox>

        {/* ── 2.5 我的上級資訊 ── superior_card_bg: 987×533（位於錢包卡片下方） ── */}
        {!profile?.is_merchant && (
          <View style={{ position: "relative", width: "100%", borderRadius: 12, overflow: "hidden" }}>
            <Image source={IMG_SUPERIOR_BG} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="fill" />
            <View style={{ minHeight: 100, paddingBottom: 8 }}>
              {/* 标题行 */}
              <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#FFFFFF10" }}>
                <Text allowFontScaling={false} style={{ color: "#fff", fontWeight: "600", fontSize: 14 }}>我的上級資訊</Text>
              </View>
              {referrer ? (
                <>
                  {/* 上級ID */}
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: "#FFFFFF10" }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Image source={IMG_ICON_SHARE} style={{ width: 24, height: 24 }} contentFit="contain" />
                      <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 14 }}>上級ID號</Text>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Text allowFontScaling={false} style={{ color: MUTED, fontFamily: "monospace", fontSize: 12, fontWeight: "700", flexWrap: "wrap", flexShrink: 1, flex: 1, letterSpacing: 1 }}>{referrer.referral_code}</Text>
                      <Pressable className="active:opacity-60" hitSlop={8} onPress={async () => { await Clipboard.setStringAsync(referrer.referral_code); setCopiedRefId(true); setTimeout(() => setCopiedRefId(false), 1500); }}>
                        <Image source={copiedRefId ? IMG_COPY_ACTIVE : IMG_COPY_IDLE} style={{ width: 15, height: 15 }} contentFit="contain" />
                      </Pressable>
                    </View>
                  </View>
                  {/* 上級手機/郵箱 */}
                  {(referrer.phone || referrer.email) ? (() => {
                    const isPhone = !!referrer.phone;
                    const contact = isPhone ? referrer.phone! : referrer.email!;
                    const canShow = referrer.show_phone_to_downline;
                    const maskedPhone = isPhone ? contact.replace(/(\d{3})\d{6}(\d{2,})/, "$1******$2") : null;
                    const maskedEmail = !isPhone ? (() => {
                      const atIdx = contact.indexOf("@"); if (atIdx <= 1) return contact;
                      const local = contact.slice(0, atIdx); const domain = contact.slice(atIdx);
                      const prefix = local.length > 2 ? local.slice(0, 2) : local.slice(0, 1);
                      return prefix + "******" + domain;
                    })() : null;
                    const displayValue = canShow ? contact : (isPhone ? maskedPhone! : maskedEmail!);
                    return (
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: referrer.wechat_id ? 1 : 0, borderBottomColor: "#FFFFFF10" }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <Image source={isPhone ? IMG_ICON_PHONE : IMG_ICON_EMAIL} style={{ width: 24, height: 24 }} contentFit="contain" />
                          <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 14 }}>{isPhone ? "上級手機號" : "上級郵箱"}</Text>
                        </View>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <Text allowFontScaling={false} style={{ color: MUTED, fontFamily: "monospace", fontSize: 12, fontWeight: "700", flexWrap: "wrap", flexShrink: 1, flex: 1 }}>{displayValue}</Text>
                          {canShow && (
                            <Pressable className="active:opacity-60" hitSlop={8} onPress={async () => { await Clipboard.setStringAsync(contact); setCopiedRefPhone(true); setTimeout(() => setCopiedRefPhone(false), 1500); }}>
                              <Image source={copiedRefPhone ? IMG_COPY_ACTIVE : IMG_COPY_IDLE} style={{ width: 15, height: 15 }} contentFit="contain" />
                            </Pressable>
                          )}
                        </View>
                      </View>
                    );
                  })() : null}
                  {/* 上級微信 */}
                  {referrer.wechat_id ? (
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 13 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Image source={IMG_ICON_WECHAT} style={{ width: 24, height: 24 }} contentFit="contain" />
                        <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 14 }}>上級微信</Text>
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Text allowFontScaling={false} style={{ color: MUTED, fontFamily: "monospace", fontSize: 12, fontWeight: "700", flexWrap: "wrap", flexShrink: 1, flex: 1 }}>{referrer.show_wechat_to_downline ? referrer.wechat_id : "******"}</Text>
                        {referrer.show_wechat_to_downline && (
                          <Pressable className="active:opacity-60" hitSlop={8} onPress={async () => { await Clipboard.setStringAsync(referrer.wechat_id!); setCopiedRefWechat(true); setTimeout(() => setCopiedRefWechat(false), 1500); }}>
                            <Image source={copiedRefWechat ? IMG_COPY_ACTIVE : IMG_COPY_IDLE} style={{ width: 15, height: 15 }} contentFit="contain" />
                          </Pressable>
                        )}
                      </View>
                    </View>
                  ) : null}
                </>
              ) : (
                <View style={{ alignItems: "center", padding: 20, gap: 12 }}>
                  <Text allowFontScaling={false} style={{ color: "#fff", opacity: 0.5, fontSize: 14 }}>暫未繫結上級</Text>
                  <Pressable
                    className="active:opacity-70"
                    style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, backgroundColor: "#E8520A18", borderWidth: 1, borderColor: "#E8520A45" }}
                    onPress={() => { setBindId(""); setBindPreview(null); setBindPassword(""); setBindMsg(null); setBindVisible(true); }}
                  >
                    <UserPlus size={16} color={OG} />
                    <Text allowFontScaling={false} style={{ color: OG, fontWeight: "700" }}>繫結上級</Text>
                  </Pressable>
                </View>
              )}
            </View>
          </View>
        )}

        {/* ── 3. 常用功能 ── bg2: 987×503 ── */}
        {(() => {
          const commonItems: Array<{ img?: ReturnType<typeof require>; icon?: React.ReactNode; title: string; remark?: string; remarkColor?: string; onPress: () => void }> = [];
          if (!profile?.is_merchant && !!session?.user.phone && !profile?.is_verified && !pool?.is_active)
            commonItems.push({ img: IMG_ICON_ID_VERIFY, title: "實名認證", remark: "未認證", remarkColor: "#F43F5E", onPress: () => router.push("/(app)/real-name" as any) });
          if (!profile?.is_merchant && !pool?.is_active)
            commonItems.push({ img: IMG_ICON_ACTIVATION, title: "啟用碼專區", remark: "去啟用", remarkColor: "#EAB308", onPress: () => router.push("/(app)/activation-code" as any) });
          if (!profile?.is_merchant)
            commonItems.push({ img: IMG_ICON_SHARE, title: "邀請海報", remark: "分享推廣", onPress: () => router.push("/(app)/poster" as any) });
          commonItems.push(
            { img: IMG_ICON_PAYMENT, title: "收款方式", remark: "支付寶/微信/銀行卡", onPress: () => router.push("/(app)/payment-methods" as any) },
            { img: IMG_ICON_EDIT_PWD, title: "修改密碼", onPress: () => router.push("/(app)/account-settings" as any) },
            { img: IMG_ICON5, title: "個人資訊", onPress: () => router.push("/(app)/personal-info" as any) },
          );
          // bg2 固定 3 行設計，動態行數時計算高度：每行 52px，加上 bg2 上下內邊 16px×2
          const rowH = 52;
          const padV = 16;
          const totalH = rowH * commonItems.length + padV * 2;
          const bgRatio = 987 / 503; // 原始比例
          return (
            <View style={{ position: "relative", width: "100%" }}>
              <Image source={IMG_BG2} style={{ width: "100%", height: totalH }} contentFit="fill" />
              <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, paddingVertical: padV, justifyContent: "space-around" }}>
                {commonItems.map((item) => (
                  <CellItem key={item.title} img={item.img} icon={item.icon}
                    title={item.title} remark={item.remark} remarkColor={item.remarkColor} onPress={item.onPress} />
                ))}
              </View>
            </View>
          );
        })()}

        {/* ── 4. 商戶功能 ── bg3: 987×384 ── */}
        {profile?.is_merchant ? (
          <BgBox src={IMG_BG3} ratio={987 / 384}>
            <View style={{ flex: 1, justifyContent: "space-around" }}>
              <CellItem img={IMG_ICON6} title="商戶中心"
                remark={profile.merchant_level ? `${profile.merchant_level} · ${MERCHANT_LEVEL_CONFIG[profile.merchant_level]?.name ?? "商戶"}` : "S0 普通商戶"}
                remarkColor={MERCHANT_LEVEL_CONFIG[profile.merchant_level ?? ""]?.color ?? "#22C55E"}
                onPress={() => router.push("/(app)/merchant-center" as any)} />
              <CellItem img={IMG_ICON7} title="商戶榜單" onPress={() => router.push("/(app)/merchant-rank" as any)} />
            </View>
          </BgBox>
        ) : profile?.is_activated ? (
          /* 商戶申請不可用 — 使用版本資訊同款 bg4 背景（987×166） */
          <BgBox src={IMG_BG4} ratio={987 / 166}>
            <View style={{ flex: 1, flexDirection: "row", alignItems: "center", paddingHorizontal: 16 }}>
              <Image source={IMG_ICON_MERCHANT} style={{ width: 24, height: 24 }} contentFit="contain" />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text allowFontScaling={false} style={{ color: "#FFFFFF80", fontWeight: "600", fontSize: 14 }}>商戶申請不可用</Text>
                <Text allowFontScaling={false} style={{ color: "#FFFFFF40", fontSize: 12, marginTop: 2 }}>已啟用算力池賬號與商戶賬號互斥</Text>
              </View>
            </View>
          </BgBox>
        ) : profile?.merchant_status === "pending" ? (
          <View style={{ backgroundColor: "#1A1A1A", borderRadius: 12, padding: 16, borderWidth: 1, borderColor: "#F59E0B30", flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Image source={IMG_ICON_MERCHANT} style={{ width: 24, height: 24 }} contentFit="contain" />
            <View style={{ flex: 1 }}>
              <Text allowFontScaling={false} style={{ color: "#F59E0B", fontWeight: "600", fontSize: 14 }}>商戶申請稽核中</Text>
              <Text allowFontScaling={false} style={{ color: "#FFFFFF40", fontSize: 11, marginTop: 2 }}>已提交申請，請等待管理員稽核</Text>
            </View>
          </View>
        ) : !profile?.is_merchant ? (
          <BgBox src={IMG_BG4} ratio={987 / 166}>
            <View style={{ flex: 1, justifyContent: "center" }}>
              <Pressable
                className="active:opacity-70"
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", height: 52, paddingHorizontal: 16 }}
                onPress={() => {
                  if (!profile?.is_verified) router.push("/(app)/real-name" as any);
                  else setMerchantConfirmVisible(true);
                }}
                disabled={merchantApplying}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Image source={IMG_ICON6} style={{ width: 24, height: 24 }} contentFit="contain" />
                  <View>
                    <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 14 }}>申請成為商戶</Text>
                    {merchantApplyMsg && (
                      <Text allowFontScaling={false} style={{ color: merchantApplyMsg.ok ? "#22C55E" : "#F43F5E", fontSize: 11 }}>{merchantApplyMsg.text}</Text>
                    )}
                  </View>
                </View>
                {merchantApplying
                  ? <ActivityIndicator size="small" color={OG} />
                  : <ChevronRight size={16} color={OG2} />}
              </Pressable>
              {/* 非商戶時隱藏商戶榜單入口 */}
            </View>
          </BgBox>
        ) : null}

        {/* ── 6. 版本信息 ── bg4: 987×166 ── */}
        <BgBox src={IMG_BG4} ratio={987 / 166}>
          <Pressable
            style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16 }}
            className="active:opacity-80"
            onPress={showUpdate ? () => setVersionDialogOpen(true) : undefined}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Image source={IMG_ICON8} style={{ width: 24, height: 24 }} contentFit="contain" />
              <View style={{ gap: 2 }}>
                <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 14 }}>版本資訊</Text>
                <Text allowFontScaling={false} style={{ color: "#ffffff60", fontSize: 11 }}>當前版本 v{localVersion}</Text>
              </View>
            </View>
            {showUpdate ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#EAB30820", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: "#EAB30840" }}>
                <RefreshCw size={11} color="#EAB308" />
                <Text allowFontScaling={false} style={{ color: "#EAB308", fontSize: 11, fontWeight: "700" }}>v{latestVersion} 可更新</Text>
              </View>
            ) : (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(1,42,8,0.61)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: OG2 }}>
                <Image source={IMG_ICON9} style={{ width: 10, height: 10 }} contentFit="contain" />
                <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 11 }}>已是最新</Text>
              </View>
            )}
          </Pressable>
        </BgBox>

        {/* ── 退出登錄按鈕 ── btg222 居中 65% 寬 ── */}
        <View style={{ alignItems: "center", marginTop: 4 }}>
          <View style={{ position: "relative", width: "65%" }}>
            <Image source={IMG_BTG222} style={{ width: "100%", aspectRatio: 653 / 101 }} contentFit="fill" />
            <Pressable
              className="active:opacity-80"
              style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}
              onPress={() => setLogoutVisible(true)}
            >
              <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 15, fontWeight: "700", letterSpacing: 2 }}>退出登錄</Text>
            </Pressable>
          </View>
        </View>

      </ScrollView>

      {/* 編輯使用者名稱彈窗 */}
      <Modal visible={editNameVisible} transparent animationType="fade">
        <View className="flex-1 items-center justify-center" style={{ backgroundColor: "#000000AA" }}>
          <View className="mx-6 rounded-2xl p-6 w-80"
            style={{ backgroundColor: "#111111", borderWidth: 1, borderColor: "#FFFFFF15" }}>
            <Text allowFontScaling={false} className="text-lg font-bold text-white mb-4">修改使用者名稱</Text>
            <TextInput
              className="px-4 py-3.5 rounded-xl text-white mb-1"
              style={{ backgroundColor: "#1C1C1C", borderWidth: 1, borderColor: nameError ? "#F43F5E" : "#2E2E2E" }}
              placeholder="2-20位，支援中英文數字"
              placeholderTextColor="#475569"
              underlineColorAndroid="transparent"
              value={newUsername}
              onChangeText={(v) => { setNewUsername(v); setNameError(""); }}
              maxLength={20}
            />
            {nameError ? <Text allowFontScaling={false} className="text-xs mb-2" style={{ color: "#F43F5E" }}>{nameError}</Text> : <View className="mb-2" />}
            <View className="flex-row gap-3">
              <Pressable
                className="flex-1 py-3 rounded-xl items-center active:opacity-70"
                style={{ backgroundColor: "#1C1C1C", borderWidth: 1, borderColor: "#2E2E2E" }}
                onPress={() => setEditNameVisible(false)}
              >
                <Text allowFontScaling={false} style={{ color: "#FFFFFF60" }}>取消</Text>
              </Pressable>
              <Pressable
                className="flex-1 py-3 rounded-xl items-center active:opacity-70"
                style={{ backgroundColor: "#E8520A" }}
                onPress={handleSaveName}
                disabled={savingName}
              >
                {savingName ? <ActivityIndicator color="#111111" size="small" /> : (
                  <Text allowFontScaling={false} style={{ color: "#111111", fontWeight: "700" }}>儲存</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* 繫結上級彈窗 */}
      <Modal visible={bindVisible} transparent animationType="slide">
        <KeyboardAvoidingView className="flex-1 justify-end" behavior="padding" style={{ backgroundColor: "#000000BB" }}>
          <View className="rounded-t-3xl"
            style={{ backgroundColor: "#1C1C1C", borderTopWidth: 1, borderColor: "#2E2E2E" }}>
            <View className="w-10 h-1 rounded-full self-center mt-3 mb-1" style={{ backgroundColor: "#2E2E2E" }} />
            <View className="flex-row items-center justify-between px-6 py-4">
              <View className="flex-row items-center gap-2">
                <UserPlus size={18} color="#E8520A" />
                <Text allowFontScaling={false} className="text-xl font-bold text-foreground">繫結上級</Text>
              </View>
              <Pressable onPress={() => setBindVisible(false)} className="p-1 active:opacity-70">
                <Text allowFontScaling={false} style={{ color: "#6B7280", fontSize: 20 }}>✕</Text>
              </Pressable>
            </View>

            <View className="px-6 gap-4">
              {/* 輸入上級ID */}
              <View>
                <Text allowFontScaling={false} className="text-sm text-muted-foreground mb-1.5">上級ID號</Text>
                <View className="flex-row items-center gap-2">
                  <TextInput
                    className="flex-1 px-4 py-3.5 rounded-xl text-foreground"
                    style={{ backgroundColor: "#111111", borderWidth: 1, borderColor: "#2E2E2E", fontSize: 14 }}
                    placeholder="請輸入上級邀請碼/ID"
                    placeholderTextColor="#475569"
                    underlineColorAndroid="transparent"
                    value={bindId}
                    onChangeText={handleLookupReferrer}
                    autoCapitalize="characters"
                  />
                  {bindLooking && <ActivityIndicator size="small" color="#E8520A" />}
                </View>
              </View>

              {/* 預覽暱稱和手機號 */}
              {bindPreview && (
                <View className="px-4 py-3 rounded-xl gap-1.5"
                  style={{ backgroundColor: "#E8520A10", borderWidth: 1, borderColor: "#E8520A30" }}>
                  <View className="flex-row items-center gap-2">
                    <User size={13} color="#E8520A" />
                    <Text allowFontScaling={false} className="text-xs text-muted-foreground">暱稱：</Text>
                    <Text allowFontScaling={false} style={{ color: "#E8520A", fontSize: 13, fontWeight: "700" }}>
                      {bindPreview.username || "未設定"}
                    </Text>
                  </View>
                  {bindPreview.phone ? (
                    <View className="flex-row items-center gap-2">
                      <Image source={IMG_ICON_PHONE} style={{ width: 16, height: 16 }} contentFit="contain" />
                      <Text allowFontScaling={false} className="text-xs text-muted-foreground">手機號：</Text>
                      <Text allowFontScaling={false} style={{ color: "#22C55E", fontSize: 13, fontWeight: "700", fontFamily: "monospace" }}>
                        {bindPreview.phone.replace(/(\d{3})\d{6}(\d{2,})/, "$1******$2")}
                      </Text>
                    </View>
                  ) : null}
                </View>
              )}

              {/* 交易密碼 */}
              <View>
                <Text allowFontScaling={false} className="text-sm text-muted-foreground mb-1.5">交易密碼</Text>
                <TextInput
                  className="px-4 py-3.5 rounded-xl text-foreground"
                  style={{ backgroundColor: "#111111", borderWidth: 1, borderColor: "#2E2E2E", fontSize: 14 }}
                  placeholder="請輸入交易密碼"
                  placeholderTextColor="#475569"
                  underlineColorAndroid="transparent"
                  value={bindPassword}
                  onChangeText={(v) => { setBindPassword(v); setBindMsg(null); }}
                  secureTextEntry
                />
              </View>

              {/* 狀態訊息 */}
              {bindMsg && (
                <View className="items-center gap-1">
                  <Text allowFontScaling={false} style={{ color: bindMsg.ok ? "#22C55E" : "#F43F5E", fontSize: 13, textAlign: "center" }}>
                    {bindMsg.text}
                  </Text>
                  {bindMsg.text.includes("[修改密碼]") && (
                    <Pressable
                      className="active:opacity-70 mt-1"
                      onPress={() => {
                        setBindVisible(false);
                        router.push("/(app)/account-settings" as any);
                      }}
                    >
                      <Text allowFontScaling={false} style={{ color: "#E8520A", fontSize: 13, fontWeight: "700" }}>前往設定交易密碼 →</Text>
                    </Pressable>
                  )}
                </View>
              )}

              {/* 確認按鈕 */}
              <Pressable
                className="rounded-xl items-center py-4 active:opacity-70"
                style={{ backgroundColor: "#E8520A", opacity: bindLoading ? 0.6 : 1 }}
                onPress={handleBindReferrer}
                disabled={bindLoading}
              >
                {bindLoading
                  ? <ActivityIndicator color="#fff" />
                  : <Text allowFontScaling={false} style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>確認繫結</Text>}
              </Pressable>
            </View>
            <View style={{ height: insets.bottom + 16 }} />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* 退出確認彈窗 */}
      <Modal visible={logoutVisible} transparent animationType="fade" onRequestClose={() => setLogoutVisible(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}
          onPress={() => setLogoutVisible(false)}
        >
          <Pressable onPress={(e) => e.stopPropagation()} style={{ width: "100%" }}>
            <View style={{ width: "100%", position: "relative", backgroundColor: "#000" }}>
              <Image source={IMG_DIALOG_BG} style={StyleSheet.absoluteFillObject} contentFit="fill" />
              <View style={{ paddingHorizontal: 20, paddingTop: 28, paddingBottom: 24, alignItems: "center" }}>
                {/* 頂部圖標 */}
                <Image source={IMG_DIALOG_ICON} style={{ width: 52, height: 52, marginBottom: 12 }} contentFit="contain" />
                {/* 標題 */}
                <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 20, fontWeight: "800", marginBottom: 8 }}>
                  確認退出
                </Text>
                {/* 說明文字 */}
                <Text allowFontScaling={false} style={{ color: MUTED, fontSize: 14, textAlign: "center", lineHeight: 22, marginBottom: 20 }}>
                  退出後需重新登入才能領取SMT
                </Text>
                {/* 雙按鈕 */}
                <View style={{ flexDirection: "row", gap: 12, width: "92%", marginBottom: 4 }}>
                  <Pressable
                    className="active:opacity-80"
                    onPress={handleLogout}
                    style={{ flex: 1, aspectRatio: 390 / 121, position: "relative" }}
                  >
                    <Image source={IMG_BTN_CONFIRM} style={StyleSheet.absoluteFillObject} contentFit="fill" />
                    <View style={[StyleSheet.absoluteFillObject, { alignItems: "center", justifyContent: "center" }]}>
                      <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>確認退出</Text>
                    </View>
                  </Pressable>
                  <Pressable
                    className="active:opacity-80"
                    onPress={() => setLogoutVisible(false)}
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

      {/* 實名認證已完成提示彈窗 */}
      <Modal visible={verifiedTipVisible} transparent animationType="fade">
        <View className="flex-1 items-center justify-center" style={{ backgroundColor: "#000000AA" }}>
          <View className="mx-6 rounded-2xl p-6 w-72 items-center"
            style={{ backgroundColor: "#1C1C1C", borderWidth: 1, borderColor: "#22C55E40" }}>
            {/* 成功圖示 */}
            <View className="w-16 h-16 rounded-full items-center justify-center mb-4"
              style={{ backgroundColor: "#22C55E18", borderWidth: 1.5, borderColor: "#22C55E50" }}>
              <CheckCircle2 size={36} color="#22C55E" />
            </View>
            <Text allowFontScaling={false} className="text-lg font-bold text-foreground mb-2">實名認證已完成</Text>
            <Text allowFontScaling={false} className="text-muted-foreground text-sm text-center mb-5">
              您的身份資訊已透過驗證，賬戶安全有保障
            </Text>
            <Pressable
              className="w-full py-3 rounded-xl items-center active:opacity-70"
              style={{ backgroundColor: "#22C55E", borderWidth: 1, borderColor: "#22C55E" }}
              onPress={() => setVerifiedTipVisible(false)}
            >
              <Text allowFontScaling={false} style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>我知道了</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* 郵箱賬戶無實名資格提示彈窗 */}
      <Modal visible={emailOnlyTipVisible} transparent animationType="fade">
        <View className="flex-1 items-center justify-center" style={{ backgroundColor: "#000000AA" }}>
          <View className="mx-6 rounded-2xl p-6 w-72 items-center"
            style={{ backgroundColor: "#1C1C1C", borderWidth: 1, borderColor: "#EAB30840" }}>
            <View className="w-16 h-16 rounded-full items-center justify-center mb-4"
              style={{ backgroundColor: "#EAB30818", borderWidth: 1.5, borderColor: "#EAB30850" }}>
              <Image source={IMG_ICON_PHONE} style={{ width: 32, height: 32 }} contentFit="contain" />
            </View>
            <Text allowFontScaling={false} className="text-lg font-bold text-foreground mb-2">暫不支援認證</Text>
            <Text allowFontScaling={false} className="text-muted-foreground text-sm text-center mb-5">
              實名認證僅限手機號註冊的賬戶使用{"\n"}請使用手機號重新註冊後再進行認證
            </Text>
            <Pressable
              className="w-full py-3 rounded-xl items-center active:opacity-70"
              style={{ backgroundColor: "#EAB308" }}
              onPress={() => setEmailOnlyTipVisible(false)}
            >
              <Text allowFontScaling={false} style={{ color: "#111111", fontWeight: "700", fontSize: 15 }}>我知道了</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* 商戶申請確認彈窗 */}
      <Modal visible={merchantConfirmVisible} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.85)", justifyContent: "flex-end", alignItems: "center" }}>
          <KeyboardAvoidingView behavior="padding" style={{ width: "100%" }}>
            {/* 面板：96% 寬、bg20 背景 */}
            <View style={{ width: "96%", maxHeight: sheetMaxHeight, alignSelf: "center", position: "relative", overflow: "hidden", backgroundColor: "#000", borderRadius: vw * 4.27 }}>
              <Image source={IMG_MODAL_BG} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="fill" />

              {/* 內容區 95% 居中 */}
              <View style={{ width: "95%", alignSelf: "center", paddingVertical: vw * 4.27 }}>

                {/* 標題列：商戶圖標 + 標題 + 關閉 */}
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: vw * 3 }}>
                  <Image source={IMG_ICON_MERCHANT} style={{ width: vw * 8.8, height: vw * 8.8 }} contentFit="contain" />
                  <Text allowFontScaling={false} style={{ color: "#fff", fontSize: vw * 4.53, flex: 1, paddingLeft: vw * 3 }}>
                    申請成為商戶
                  </Text>
                  <Pressable onPress={() => setMerchantConfirmVisible(false)} className="active:opacity-70">
                    <Image source={ICON_MODAL_CLOSE} style={{ width: vw * 10.13, height: vw * 10.13 }} contentFit="contain" />
                  </Pressable>
                </View>

                {/* 可滾動內容 */}
                <ScrollView bounces={false} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
                  contentContainerStyle={{ paddingBottom: insets.bottom + 16, gap: vw * 3.2 }}>

                  {/* 不可撤銷警告 */}
                  <View style={{ alignItems: "center", paddingVertical: 16, gap: 12 }}>
                    <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: "#F59E0B15", borderWidth: 1, borderColor: "#F59E0B35", alignItems: "center", justifyContent: "center" }}>
                      <Text allowFontScaling={false} style={{ fontSize: 28 }}>⚠️</Text>
                    </View>
                    <Text allowFontScaling={false} style={{ color: "#F59E0B", fontSize: 18, fontWeight: "800" }}>申請後不可撤銷</Text>

                    <View style={{ width: "100%", borderRadius: 12, borderWidth: 1, borderColor: "#F59E0B25", overflow: "hidden" }}>
                      {[
                        { no: "1", text: "變更為商戶後，將無法恢復普通用戶身份。" },
                        { no: "2", text: "算力池及推廣功能將關閉。" },
                      ].map((item, idx) => (
                        <View key={item.no} style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: idx === 0 ? "#F59E0B0C" : "#F59E0B08", borderTopWidth: idx === 0 ? 0 : 1, borderColor: "#F59E0B20" }}>
                          <View style={{ width: 22, height: 22, borderRadius: 7, backgroundColor: "#F59E0B25", borderWidth: 1, borderColor: "#F59E0B45", alignItems: "center", justifyContent: "center" }}>
                            <Text allowFontScaling={false} style={{ color: "#F59E0B", fontSize: 11, fontWeight: "700" }}>{item.no}</Text>
                          </View>
                          <Text allowFontScaling={false} style={{ color: "#F59E0B", fontSize: 13, flex: 1, lineHeight: 20 }}>{item.text}</Text>
                        </View>
                      ))}
                    </View>
                  </View>

                  {/* 雙按鈕 */}
                  <View style={{ flexDirection: "row", gap: 12 }}>
                    <Pressable className="active:opacity-80"
                      onPress={() => setMerchantConfirmVisible(false)}
                      style={{ flex: 1, aspectRatio: 390 / 121, position: "relative" }}>
                      <Image source={IMG_BTN_CANCEL} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="fill" />
                      <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
                        <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>再想想</Text>
                      </View>
                    </Pressable>
                    <Pressable className="active:opacity-80"
                      onPress={handleApplyMerchant}
                      disabled={merchantApplying}
                      style={{ flex: 1, aspectRatio: 390 / 121, position: "relative" }}>
                      <Image source={IMG_BTN_CONFIRM} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="fill" />
                      <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
                        {merchantApplying
                          ? <ActivityIndicator size="small" color="#fff" />
                          : <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>確認申請</Text>}
                      </View>
                    </Pressable>
                  </View>

                </ScrollView>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* 版本更新彈窗（點選版本卡片觸發，與 _layout 啟動檢測彈窗獨立，確保只有一個入口執行下載） */}
      <UpdateDialog
        open={versionDialogOpen || showUpdate}
        latestVersion={latestVersion}
        localVersion={localVersion}
        apkUrl={apkUrl}
        forceUpdate={forceUpdate}
        onDismiss={() => { setVersionDialogOpen(false); dismissUpdate(); }}
      />
    </View>
  );
}

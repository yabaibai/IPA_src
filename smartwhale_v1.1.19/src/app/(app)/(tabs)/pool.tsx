/* eslint-disable no-undef */
import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, Modal, Keyboard, StyleSheet, useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import SliderCaptcha from "@/components/SliderCaptcha";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  TrendingUp, Zap, CheckCircle, Eye, EyeOff,
} from "lucide-react-native";
import Svg, { Path, Defs, LinearGradient as SvgLinearGradient, Stop } from "react-native-svg";
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withDelay,
  withRepeat, withSequence, Easing, runOnJS,
} from "react-native-reanimated";
import { useSession } from "@/ctx";
import {
  getWhalePool, getWalletBalance, getLevelConfig, upgradeWhale,
  getUnreadAnnouncements, getLatestAntPrice, activateWhalePool, getProfile,
  claimAnt, performRebirth, getHarvestRecords, simpleHash,
  getHarvestAmountByDate,
} from "@/db/api";
import {
  getTierInfo,
  type WhalePool, type WalletBalance, type LevelConfig,
  type Announcement, type AntPrice, type Profile, type HarvestRecord,
} from "@/types/types";
import AnnouncementModal from "@/components/AnnouncementModal";
import CapProgressModal from "@/components/CapProgressModal";
import SpinePlayerHost from "@/components/SpinePlayerHost";
import { SPINE_RESOURCES } from "@/lib/spineResources";
import { withTimeout } from "@/lib/asyncTool";
import { sharedGet } from "@/lib/requestDedup";
import { showToast } from "@/lib/toast";
import { supabase } from "@/client/supabase";
import { useTabData } from "@/db/tabData";

// ─── 鲸鱼等级 → Spine 资源映射 ────────────────────────────────────────
// spineAnimIdx 1~7 对应 whale1~whale7（算力池各等级鲸鱼动画）
const WHALE_RESOURCES: Record<number, (typeof SPINE_RESOURCES)[number]> = {
  1: SPINE_RESOURCES.find((r) => r.key === "whale1")!,
  2: SPINE_RESOURCES.find((r) => r.key === "whale2")!,
  3: SPINE_RESOURCES.find((r) => r.key === "whale3")!,
  4: SPINE_RESOURCES.find((r) => r.key === "whale4")!,
  5: SPINE_RESOURCES.find((r) => r.key === "whale5")!,
  6: SPINE_RESOURCES.find((r) => r.key === "whale6")!,
  7: SPINE_RESOURCES.find((r) => r.key === "whale7")!,
};

// ─── 品牌色 ──────────────────────────────────────────────────────
const BC = {
  orange: "#FF5E1A",
  orangeDark: "#762e0b",
  gradientMid: "rgba(237,124,69,0)" as const,
  white: "#FFFFFF",
  gray: "#999999",
  black: "#000000",
};

// ─── 本地圖片（Tab 圖示全部本地化，打包後不依賴網路）──────────────
const IMGS: Record<string, ReturnType<typeof require>> = {
  "page-bg1.png":  require("../../../../assets/page-img/page_bg.webp"),
  "pool_logo.png":            require("../../../../assets/page-img/pool_logo.png"),
  "pool_btn_refresh.png":     require("../../../../assets/page-img/pool_btn_refresh.png"),
  "pool_btn_level_table.png": require("../../../../assets/page-img/pool_btn_level_table.png"),
  "bg5.png":       require("../../../../assets/page-img/bg5.png"),
  "bg6.png":       require("../../../../assets/page-img/bg6.png"),
  "bg7.png":       require("../../../../assets/page-img/bg7.png"),
  "bg8.png":       require("../../../../assets/page-img/bg8.png"),
  "bg9.png":       require("../../../../assets/page-img/bg9.png"),
  "bg10.png":      require("../../../../assets/page-img/bg10.png"),
  "bg11.png":      require("../../../../assets/page-img/bg11.png"),
  "bg12.png":      require("../../../../assets/page-img/bg12.png"),
  "jy.png":        require("../../../../assets/page-img/jy.png"),
  "jy-b.png":      require("../../../../assets/page-img/jy-b.png"),
  "tabbar-bg.png": require("../../../../assets/page-img/tabbar-bg.png"),
  "tab_pool_a.png": require("../../../../assets/page-img/tab_pool_a.png"),
};
const IMG = (name: string) => IMGS[name];

// ─── 啟用算力池彈窗用圖片資源（與 style002 共用）────────────────────────
const IMG_DIALOG_BG   = require("../../../../assets/page-img/mine_dialog_bg.png");
const IMG_DIALOG_ICON = require("../../../../assets/page-img/mine_icon29.png");
const IMG_BTN_CONFIRM = require("../../../../assets/page-img/mine_btn_confirm.png");
const IMG_BTN_CANCEL  = require("../../../../assets/page-img/mine_btn_cancel.png");
const IMG_ICON31      = require("../../../../assets/page-img/mine_icon31.png"); // 操作成功說明行小圖標（68×64）
const IMG_ICON30      = require("../../../../assets/page-img/mine_icon30.png"); // 領取成功頂部圖標（142×142）
// DailyReceiveDialog 圖片資源
const IMG_HOME_BG20   = require("../../../../assets/page-img/home_bg20.png");   // 每日領取背景 983×1474
const IMG_HOME_BG41   = require("../../../../assets/page-img/home_bg41.png");   // 確認領取按鈕
const IMG_HOME_ICON20 = require("../../../../assets/page-img/home_icon20.png"); // 關閉按鈕
const IMG_HOME_ICON32 = require("../../../../assets/page-img/home_icon32.png"); // 驗證提示小圖標
const IMG_HOME_ICON33 = require("../../../../assets/page-img/home_icon33.png"); // 滑塊未完成圖標
const IMG_HOME_ICON34 = require("../../../../assets/page-img/home_icon34.png"); // 滑塊完成圖標
const IMG_HOME_ICON35 = require("../../../../assets/page-img/home_icon35.png"); // 領取按鈕閃電圖標
const IMG_HOME_ICON36 = require("../../../../assets/page-img/home_icon36.png"); // 換一題圖標

// ─── 啟用彈窗設計 Token（對齊 account-settings）────────────────────────
const OG2        = "#DE792D";
const MUTED_COLOR = "#999999";
const FIELD_BG   = "rgba(0,0,0,0.5)";
const FIELD_BORDER = "rgba(123,123,123,0.5)";

const styles = StyleSheet.create({
  activateField: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: FIELD_BG,
    borderWidth: 1,
    borderColor: FIELD_BORDER,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  activateInput: {
    flex: 1,
    color: "#fff",
    fontSize: 12,
    padding: 0,
    margin: 0,
  } as object,
});

// TabBar 配置（全部改用本地 require，不再依賴 CDN）
const POOL_TAB_LIST = [
  { name: "home",     icon: require("../../../../assets/page-img/tab_home.png"),     iconA: require("../../../../assets/page-img/tab_home_a.png")     },
  { name: "shop",     icon: require("../../../../assets/page-img/tab_shop.png"),     iconA: require("../../../../assets/page-img/tab_shop_a.png")     },
  { name: "pool",     icon: require("../../../../assets/page-img/tab_pool.png"),     iconA: null                                                      },
  { name: "referral", icon: require("../../../../assets/page-img/tab_referral.png"), iconA: require("../../../../assets/page-img/tab_referral_a.png") },
  { name: "profile",  icon: require("../../../../assets/page-img/tab_profile.png"),  iconA: require("../../../../assets/page-img/tab_profile_a.png")  },
] as const;

// ─── 8 颗白色粒子配置 ─────────────────────────────────────────────
const PARTICLES = [
  { x: 0.18, y: 0.22, size: 2.5, delay: 0    },
  { x: 0.42, y: 0.08, size: 1.8, delay: 180  },
  { x: 0.65, y: 0.30, size: 3.0, delay: 350  },
  { x: 0.30, y: 0.55, size: 2.0, delay: 520  },
  { x: 0.75, y: 0.48, size: 2.8, delay: 70   },
  { x: 0.55, y: 0.68, size: 1.5, delay: 700  },
  { x: 0.12, y: 0.70, size: 2.2, delay: 850  },
  { x: 0.85, y: 0.18, size: 1.7, delay: 430  },
] as const;

// 单颗粒子
function Particle({ x, y, size, delay, containerW, containerH }: {
  x: number; y: number; size: number; delay: number;
  containerW: number; containerH: number;
}) {
  const opacity    = useSharedValue(0);
  const translateY = useSharedValue(0);
  useEffect(() => {
    opacity.value = withDelay(delay, withRepeat(
      withSequence(
        withTiming(0.9, { duration: 900, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.1, { duration: 900, easing: Easing.inOut(Easing.sin) }),
      ), -1, false,
    ));
    translateY.value = withDelay(Math.floor(delay / 2), withRepeat(
      withSequence(
        withTiming(-3, { duration: 1000, easing: Easing.inOut(Easing.sin) }),
        withTiming( 3, { duration: 1000, easing: Easing.inOut(Easing.sin) }),
      ), -1, false,
    ));
  }, []);
  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));
  return (
    <Animated.View style={[{
      position: "absolute",
      left: containerW * x - size / 2,
      top:  containerH * y - size / 2,
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: "#ffffff",
      boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: size * 3, color: "rgba(255,255,255,0.9)" }],
      zIndex: 3,
    }, animStyle]} />
  );
}

// SVG 星星爆炸粒子（升级动效）
const STAR_PATH = "M12 2 L14.09 8.26 L20.5 9.27 L16 13.5 L17.18 19.91 L12 16.75 L6.82 19.91 L8 13.5 L3.5 9.27 L9.91 8.26 Z";
function StarParticle({ angle, delay, color }: { angle: number; delay: number; color: string }) {
  const dist = 55 + Math.random() * 35;
  const tx = Math.cos(angle) * dist;
  const ty = Math.sin(angle) * dist;
  const x = useSharedValue(0); const y = useSharedValue(0);
  const op = useSharedValue(0); const sc = useSharedValue(0.3);
  useEffect(() => {
    const cfg = { duration: 650, easing: Easing.out(Easing.quad) };
    x.value = withDelay(delay, withTiming(tx, cfg));
    y.value = withDelay(delay, withTiming(ty, cfg));
    sc.value = withDelay(delay, withSequence(withTiming(1.2, { duration: 200 }), withTiming(0.6, { duration: 450 })));
    op.value = withDelay(delay, withSequence(withTiming(1, { duration: 150 }), withTiming(0, { duration: 500 })));
  }, []);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: sc.value }],
    opacity: op.value, position: "absolute",
  }));
  const size = 6 + Math.floor(Math.random() * 5);
  return (
    <Animated.View style={style}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Defs>
          <SvgLinearGradient id={`p${delay}`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#FDE68A" />
            <Stop offset="1" stopColor={color} />
          </SvgLinearGradient>
        </Defs>
        <Path d={STAR_PATH} fill={`url(#p${delay})`} />
      </Svg>
    </Animated.View>
  );
}
function StarExplosion({ visible, color }: { visible: boolean; color: string }) {
  if (!visible) return null;
  const COUNT = 18;
  return (
    <View style={{ position: "absolute", width: 0, height: 0, alignItems: "center", justifyContent: "center", zIndex: 20 }} pointerEvents="none">
      {Array.from({ length: COUNT }).map((_, i) => (
        <StarParticle key={i} angle={(i / COUNT) * Math.PI * 2} delay={Math.floor(Math.random() * 120)} color={color} />
      ))}
    </View>
  );
}

/** 将剩余秒数格式化 */
function fmtHoursCountdown(totalSecs: number): string {
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  if (h > 0) return `${h}小时${m}分${s}秒`;
  if (m > 0) return `${m}分${s}秒`;
  return `${s}秒`;
}

// ─── 主屏幕 ───────────────────────────────────────────────────────
export default function PoolScreen() {
  const insets   = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const { session } = useSession();
  const userId   = session?.user.id ?? "";

  // vw 单位（设计稿 375，限 430）
  const vw = Math.min(screenW, 430) / 100;
  const navH = vw * 13.33;

  // ── 胶囊特效动画值 ──
  const sweepX = useSharedValue(-1);

  useEffect(() => {
    // 扫光：与登录按钮一致 —— 每 3200ms 触发，700ms 扫过，Easing.out(Easing.quad)
    const INTERVAL = 3200;
    const DURATION = 700;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        sweepX.value = -1;
        sweepX.value = withTiming(1, { duration: DURATION, easing: Easing.out(Easing.quad) }, () => {
          runOnJS(schedule)();
        });
      }, INTERVAL);
    };
    schedule();
    return () => clearTimeout(timer);
  }, []);

  // translateX: -1 → 1 映射到胶囊宽度范围
  const sweepAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: sweepX.value * vw * 32.7 }],
  }));

  // ── 业务数据 state ──
  const [pool,          setPool]          = useState<WhalePool | null>(null);
  const [profile,       setProfile]       = useState<Profile | null>(null);
  const [wallet,        setWallet]        = useState<WalletBalance | null>(null);
  const [currentConfig, setCurrentConfig] = useState<LevelConfig | null>(null);
  const [nextConfig,    setNextConfig]    = useState<LevelConfig | null>(null);
  const [levelConfig,   setLevelConfig]   = useState<LevelConfig | null>(null);
  const [_records, setRecords] = useState<HarvestRecord[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [showAnnouncement, setShowAnnouncement] = useState(false);
  const [_antPrice, setAntPrice] = useState<AntPrice | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [loadError,      setLoadError]      = useState(false);
  const [todayEarned,     setTodayEarned]     = useState(0);
  const [yesterdayEarned, setYesterdayEarned] = useState(0);

  // ── 鲸鱼动画（原生渲染，无需预加载）──

  // ── 倒计时 ──
  const [secsToNext, setSecsToNext] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── 滑动驗證 ──
  const [sliderKey,    setSliderKey]    = useState(0);
  const [sliderPassed, setSliderPassed] = useState(false);

  // ── 操作状态 ──
  const [activating,       setActivating]       = useState(false);
  const [upgrading,        setUpgrading]        = useState(false);
  const [showParticles,    setShowParticles]     = useState(false);
  const [claiming,         setClaiming]         = useState(false);
  const [rebirthVisible,   setRebirthVisible]   = useState(false);
  const [rebirthLoading,   setRebirthLoading]   = useState(false);
  const [capModalVisible,  setCapModalVisible]  = useState(false);
  const [activateCodeInput,  setActivateCodeInput]  = useState("");
  const [activatePassInput,  setActivatePassInput]  = useState("");
  const [activateError,      setActivateError]      = useState("");
  const [activateCodeFocused, setActivateCodeFocused] = useState(false);
  const [activatePassFocused, setActivatePassFocused] = useState(false);
  const [showActivatePass,    setShowActivatePass]    = useState(false);
  const [confirmVisible,         setConfirmVisible]         = useState(false);
  const [activateConfirmVisible, setActivateConfirmVisible] = useState(false);
  const [claimModalVisible,      setClaimModalVisible]      = useState(false);
  const [resultVisible,   setResultVisible]   = useState(false);
  const [resultMsg,       setResultMsg]       = useState("");
  const [resultAmount,    setResultAmount]    = useState(0);
  const [resultIsSuccess, setResultIsSuccess] = useState(false);
  const [resultIsRebirth, setResultIsRebirth] = useState(false);
  const [resultRebirthCount, setResultRebirthCount] = useState(0);
  const [warnVisible,     setWarnVisible]     = useState(false);
  const [warnMsg,         setWarnMsg]         = useState("");

  // ── 领取弹窗动画 ──
  const claimPanelY    = useSharedValue(600);
  const claimKbOffset  = useSharedValue(0);
  const claimOverlayOp = useSharedValue(0);
  const claimOverlayAnimStyle = useAnimatedStyle(() => ({ opacity: claimOverlayOp.value }));
  const claimPanelAnimStyle   = useAnimatedStyle(() => ({
    transform: [{ translateY: claimPanelY.value - claimKbOffset.value }],
    maxHeight: screenH - claimKbOffset.value - insets.top - 20,
  }));

  useEffect(() => {
    const showEv = process.env.EXPO_OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEv = process.env.EXPO_OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const onShow = Keyboard.addListener(showEv, (e) => {
      claimKbOffset.value = withTiming(e.endCoordinates.height, { duration: 250 });
    });
    const onHide = Keyboard.addListener(hideEv, () => {
      claimKbOffset.value = withTiming(0, { duration: 200 });
    });
    return () => { onShow.remove(); onHide.remove(); };
  }, []);

  const openClaimModal = () => {
    setClaimModalVisible(true);
    claimPanelY.value    = withTiming(0, { duration: 320, easing: Easing.out(Easing.cubic) });
    claimOverlayOp.value = withTiming(1, { duration: 250 });
  };
  const closeClaimModal = () => {
    Keyboard.dismiss();
    claimPanelY.value    = withTiming(600, { duration: 260, easing: Easing.in(Easing.cubic) }, () => {
      runOnJS(setClaimModalVisible)(false);
    });
    claimOverlayOp.value = withTiming(0, { duration: 220 });
  };

  // ── 倒计时逻辑 ──
  const updateCountdowns = (p: WhalePool) => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!p.is_active) return;
    const calc = () => {
      const nowMs = Date.now();
      const utc8NowMs = nowMs + 8 * 3600_000;
      const utc8MidnightTomorrowMs = Math.ceil(utc8NowMs / 86400_000) * 86400_000 - 8 * 3600_000;
      const utc8Today   = new Date(utc8NowMs).toISOString().slice(0, 10);
      const lastDateStr = p.last_harvest_date
        ?? (p.last_claimed_at ? new Date(new Date(p.last_claimed_at).getTime() + 8 * 3600_000).toISOString().slice(0, 10) : null);
      const alreadyClaimedToday = lastDateStr === utc8Today;
      setSecsToNext(alreadyClaimedToday
        ? Math.max(0, Math.floor((utc8MidnightTomorrowMs - nowMs) / 1000))
        : 0
      );
    };
    calc();
    timerRef.current = setInterval(calc, 1000);
  };

  // ── 数据加载 ──
  // ── 數據加載（統一引擎）──
  const fetchPool = useCallback(async (force = false) => {
    try { await supabase.auth.getSession(); } catch { /* ignore */ }
    // 共用去重層：shared（pool/profile/wallet/unread/price）僅登錄/手動刷新更新；unique（recs/today/yesterday/levelCur/levelNext）3 分鐘自動回源
    const get = (label: string, fn: () => Promise<any>, shared = false) => sharedGet(label, fn, { force, shared });
    const utc8Now      = new Date(Date.now() + 8 * 3600_000);
    const todayStr     = utc8Now.toISOString().slice(0, 10);
    const yesterdayStr = new Date(Date.now() + 8 * 3600_000 - 86400_000).toISOString().slice(0, 10);
    const [p, prof, w, unread, price, recs, todayAmt, yesterdayAmt] = await Promise.all([
      get("pool", () => getWhalePool(userId), true),
      get("profile", () => getProfile(userId), true),
      get("wallet", () => getWalletBalance(userId), true),
      get("unread", () => getUnreadAnnouncements(userId), true),
      get("price", () => getLatestAntPrice(), true),
      get("recs", () => getHarvestRecords(userId, 5)),
      get("today", () => getHarvestAmountByDate(userId, todayStr)),
      get("yesterday", () => getHarvestAmountByDate(userId, yesterdayStr)),
    ]);
    let cur = null, nxt = null;
    if (p) { [cur, nxt] = await Promise.all([
      get("levelCur", () => getLevelConfig(p.level)),
      p.level < 56 ? get("levelNext", () => getLevelConfig(p.level + 1)) : Promise.resolve(null),
    ]); }
    return { p, prof, w, unread, price, recs, todayAmt, yesterdayAmt, cur, nxt };
  }, [userId]);

  const applyPool = useCallback((d: any) => {
    const { p, prof, w, unread, price, recs, todayAmt, yesterdayAmt, cur, nxt } = d;
    if (p) setPool(p);
    if (prof) setProfile(prof);
    if (w) setWallet(w);
    if (price) setAntPrice(price);
    if (recs) setRecords(recs);
    if (todayAmt != null) setTodayEarned(todayAmt);
    if (yesterdayAmt != null) setYesterdayEarned(yesterdayAmt);
    if (cur) { setCurrentConfig(cur); setLevelConfig(cur); }
    if (nxt) setNextConfig(nxt);
    if (p) updateCountdowns(p);
    if (unread && unread.length > 0) { setAnnouncements(unread); setShowAnnouncement(true); }
    setSliderPassed(false); setSliderKey((k) => k + 1);
  }, []);

  const { loadData, refresh, onEnter, onLeave } = useTabData({
    cacheKey: "pool:" + userId,
    fetch: fetchPool,
    apply: applyPool,
    onError: () => setLoadError(true),
    onLoading: (b) => setLoading(b),
    onFrequent: () => showToast("刷新過於頻密，請稍後再試"),
    hasData: () => pool != null || wallet != null || profile != null,
  });

  useFocusEffect(useCallback(() => {
    onEnter();
    loadData();
    return () => { onLeave(); if (timerRef.current) clearInterval(timerRef.current); };
  }, [loadData, onEnter, onLeave]));
  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  // 登录后 session 异步建立：进入本页时若 userId 尚为空，首次 loadData 用空 userId 发请求 → 数据全空。
  // 监听 userId 由空变非空，session 就绪后自动重载，修复「登录后首次进本页 ID/数据为空」时序竞态。
  useEffect(() => {
    if (userId) {
      onEnter();
      loadData();
    }
  }, [userId]);

  // ── 业务操作 handlers ──
  const handleActivatePool = async () => {
    if (!activateCodeInput.trim()) { setActivateError("请输入启用码"); return; }
    if (!activatePassInput.trim()) { setActivateError("请输入交易密码"); return; }
    setActivating(true);
    const res = await activateWhalePool(userId, activateCodeInput.trim(), simpleHash(activatePassInput));
    setActivating(false);
    if (res.success) {
      setActivateConfirmVisible(false);
      setActivateCodeInput(""); setActivatePassInput(""); setActivateError("");
      setResultMsg("算力池啟用成功，開始生產中...");
      setResultIsSuccess(true); setResultVisible(true);
      await loadData(true);
    } else {
      setActivateError(res.error ?? "启用失败，请重试");
    }
  };

  const handleUpgrade = async () => {
    if (!pool || !nextConfig || !wallet) return;
    if (needClaimBeforeUpgrade) {
      setConfirmVisible(false);
      setWarnMsg("⚠️ 請先領取今日收益，再晉升等級，避免損失");
      setWarnVisible(true); return;
    }
    setConfirmVisible(false); setUpgrading(true);
    const result = await upgradeWhale(userId, pool.level, pool.level + 1, nextConfig.upgrade_cost);
    setUpgrading(false);
    setResultMsg(result.success
      ? `升級成功！鯨魚進化至 Lv.${pool.level + 1}`
      : result.need_claim_first
        ? "⚠️ 请先领取今日收益，再晋升等级，避免损失"
        : `❌ 升级失败：${result.error}`);
    setResultIsSuccess(result.success); setResultVisible(true);
    if (result.success) {
      setShowParticles(true);
      setTimeout(() => setShowParticles(false), 1200);
      await loadData(true);
    }
  };

  const handleClaim = async () => {
    if (!sliderPassed || !pool || !levelConfig) return;
    setClaiming(true);
    const result = await claimAnt(userId, pool, levelConfig);
    setClaiming(false);
    closeClaimModal();
    if (result.success) {
      setResultAmount(result.amount ?? 0);
      setResultIsSuccess(true); setResultVisible(true);
      if (result.capped) setTimeout(() => setCapModalVisible(true), 1800);
    } else {
      if (result.capped || (result.error ?? "").includes("封顶")) {
        await loadData(true); setCapModalVisible(true);
      } else {
        setResultMsg(result.error ?? "领取失败");
        setResultIsSuccess(false); setResultVisible(true);
      }
    }
    await loadData(true);
  };

  const handleRebirth = async () => {
    if (needClaimBeforeUpgrade) {
      setRebirthVisible(false);
      setWarnMsg("⚠️ 請先領取今日收益，再重生，避免損失");
      setWarnVisible(true); return;
    }
    setRebirthLoading(true);
    const res = await performRebirth(userId);
    setRebirthLoading(false);
    setRebirthVisible(false);
    if (res.success) {
      setResultIsRebirth(true);
      setResultRebirthCount(res.rebirth_count ?? 1);
      setResultIsSuccess(true);
    } else {
      setResultIsRebirth(false);
      setResultMsg(res.error ?? "重生失敗，請重試");
      setResultIsSuccess(false);
    }
    setResultVisible(true);
    await loadData(true);
  };

  // ── 首次加载全屏转圈 ──
  if (loading && !pool) {
    return (
      <View style={{ flex: 1, backgroundColor: BC.black, alignItems: "center", justifyContent: "center" }}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color="#E8520A" />
      </View>
    );
  }

  // ── 派生变量 ──
  const level      = pool?.level ?? 0;
  const tierInfo   = getTierInfo(level);
  const antBalance = wallet?.ant_balance ?? 0;
  const canUpgrade = !!(pool && nextConfig && antBalance >= nextConfig.upgrade_cost && level < 56);
  const needClaimBeforeUpgrade = !!(pool?.is_active && secsToNext === 0);
  const canClaim    = !!(pool?.is_active && secsToNext === 0);
  const dailyYield  = levelConfig?.daily_yield ?? 0;
  const isLevel0    = !pool?.is_active;
  const isCapped    = !!pool?.capped_at;
  const capLimit    = (currentConfig?.total_investment ?? 0) * 3;
  const totalProduced = pool?.total_produced ?? 0;
  const capPct        = capLimit > 0 ? Math.min((totalProduced / capLimit) * 100, 100) : 0;
  const capBtnColor   = isCapped ? "#EF4444" : capPct >= 90 ? "#F97316" : capPct >= 75 ? "#EAB308" : "#FF8A3D";
  // 激活进度格数（最多 7 格）
  const activeProgressCount = Math.min(Math.max(level > 0 ? Math.ceil(level / 8) : 0, pool?.is_active ? 1 : 0), 7);

  // 商户账号屏蔽
  if (!loading && profile?.is_merchant) {
    return (
      <View style={{ flex: 1, backgroundColor: BC.black, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
        <StatusBar style="light" />
        <Text allowFontScaling={false} style={{ fontSize: 64 }}>🏪</Text>
        <Text allowFontScaling={false} style={{ color: BC.white, fontSize: 20, fontWeight: "700", marginTop: 16, marginBottom: 8, textAlign: "center" }}>
          商戶帳號不可使用算力池
        </Text>
        <Text allowFontScaling={false} style={{ color: BC.gray, fontSize: 13, textAlign: "center", lineHeight: 22 }}>
          商戶帳號與算力池功能互斥。{"\n"}商戶享有0手續費轉帳與收款SMT獎勵權益，{"\n"}無需啟用算力池。
        </Text>
        <Pressable
          style={{ marginTop: 24, paddingVertical: 12, paddingHorizontal: 40, borderRadius: 12, backgroundColor: "#22C55E20", borderWidth: 1, borderColor: "#22C55E50" }}
          onPress={() => router.push("/(app)/merchant-center" as any)}
        >
          <Text allowFontScaling={false} style={{ color: "#22C55E", fontWeight: "700", fontSize: 15 }}>前往商戶中心</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="light" />

      {/* ══ 全屏背景图 ══ */}
      <Image
        source={IMG("page-bg1.png")}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, width: "100%", height: "100%" }}
        contentFit="cover"
      />

      {/* ══ 固定 NavBar ══ */}
      <View style={{
        position: "absolute", top: insets.top, left: 0, right: 0, zIndex: 10,
        height: navH, paddingHorizontal: vw * 4,
        flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      }}>
        {/* 左：标题图标 */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: vw * 2.13 }}>
          <Image source={require("../../../../assets/page-img/slc.png")} style={{ height: vw * 8, width: vw * 26 }} contentFit="contain" />
          {loading && pool && <ActivityIndicator size="small" color="#E8520A" />}
        </View>
        {/* 右：刷新按钮 + 等级表按钮 */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: vw * 2.67 }}>
          <Pressable onPress={loadData}>
            <Image source={IMG("pool_btn_refresh.png")} style={{ height: vw * 9.6, width: vw * 21.33 }} contentFit="contain" />
          </Pressable>
          <Pressable onPress={() => router.push("/(app)/upgrade-table" as any)}>
            <Image source={IMG("pool_btn_level_table.png")} style={{ height: vw * 9.6, width: vw * 21.33 }} contentFit="contain" />
          </Pressable>
        </View>
      </View>

      {/* ══ 主内容滚动区 ══ */}
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + navH,
          paddingBottom: insets.bottom + 91 + 16,
          paddingHorizontal: vw * 4,
        }}
        showsVerticalScrollIndicator={false}
      >
        {loadError && (
          <Pressable onPress={() => loadData()} style={{ backgroundColor: "#3A1A0A", paddingVertical: vw * 2, marginBottom: vw * 2 }}>
            <Text style={{ color: "#FF8C42", fontSize: 13, textAlign: "center" }}>數據加載失敗，點擊重試</Text>
          </Pressable>
        )}
        {/* ── 状态标签（扫光特效）── */}
        <View style={{ alignItems: "center", marginTop: vw * 2, marginBottom: vw * 1 }}>
          <View style={{ width: vw * 32.7, overflow: "hidden", borderRadius: vw * 5 }}>
            <Image source={IMG("bg5.png")} style={{ width: vw * 32.7, aspectRatio: 74 / 30 }} contentFit="fill" />
            {/* 扫光条：与登录按钮一致 —— 宽60%、全高、白色渐变 */}
            <Animated.View style={[{
              position: "absolute",
              top: 0, bottom: 0,
              width: "60%", left: "-10%",
            }, sweepAnimStyle]} pointerEvents="none">
              <LinearGradient
                colors={["transparent", "rgba(255,255,255,0.28)", "transparent"]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={{ flex: 1 }}
              />
            </Animated.View>
            {/* 文字 */}
            <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
              <Text allowFontScaling={false} style={{
                color: pool?.is_active ? "#FFFFFF" : "#9CA3AF",
                fontSize: vw * 3.8,
              }}>
                {pool?.is_active
                  ? (level === 56 ? "⚡ 重生級" : (currentConfig?.level_name ?? currentConfig?.tier_name ?? `Lv.${level}`))
                  : "待激活"}
              </Text>
            </View>
          </View>
        </View>

        {/* ── 鲸鱼区域（Spine 动画在上 / jy-b.png 光圈在下）── */}
        {(() => {
          // jy-b.png 比例 1080×1119 → 0.9651；Spine 区域高度对齐原 jy.png 比例
          const containerW = screenW;
          const whaleScale = 0.9; // 整体缩小为 90%
          const jyW        = containerW * whaleScale;
          const jyH        = jyW / 1.4062;
          const jybW       = containerW;
          const jybH       = jybW / 0.9651;
          const topOffset  = -vw * 4;
          // 容器高度需容纳光圈完整高度（topOffset + jybH），否则光圈底部被 overflow:hidden 切断
          const containerH = topOffset + jybH;
          const jyLeft     = (containerW - jyW) / 2; // 负值 → 两侧等量超出，实现居中裁切
          // 根据等级映射动画：level 1~8→1jie, 9~16→2jie, ... 49~56→7jie，未激活默认1jie
          const spineAnimIdx = pool?.is_active ? Math.min(Math.max(Math.ceil((level || 1) / 8), 1), 7) : 1;
          // 各等级鲸鱼垂直偏移：2（银流鲸）-vw*4，3（赤炽鲸）-vw*6，4（核芯鲸）-vw*6，5（金曜鲸）-vw*4，6（星脉鲸）-vw*6，7（鸿蒙鲸）-vw*10
          const WHALE_TOP_OFFSET: Record<number, number> = { 2: -vw * 4, 3: -vw * 6, 4: -vw * 6, 5: -vw * 4, 6: -vw * 6, 7: -vw * 10 };
          // 缩小后整体往下移 vw*4，使鲸鱼更贴近底座光圈
          const jyTop  = vw * 4 + (WHALE_TOP_OFFSET[spineAnimIdx] ?? 0);
          const whaleResource = WHALE_RESOURCES[spineAnimIdx] ?? WHALE_RESOURCES[1];
          return (
            <View style={{ marginHorizontal: -vw * 4, marginBottom: vw * 2, height: containerH, position: "relative", overflow: "hidden" }}>
              {/* 底座光圈 */}
              <Image source={IMG("jy-b.png")} style={{ position: "absolute", top: topOffset, left: 0, width: jybW, height: jybH, zIndex: 1 }} contentFit="fill" />
              {/* Spine 鲸鱼动画 — 原生渲染（清晰度无损），背景透明 */}
              <View style={{ position: "absolute", top: jyTop, left: jyLeft, width: jyW, height: jyH, zIndex: 2 }}>
                <SpinePlayerHost
                  key={`whale-${spineAnimIdx}`}
                  playing
                  resource={whaleResource}
                />
              </View>
              {/* 星星爆炸粒子（升级动效） */}
              {showParticles && (
                <View style={{ position: "absolute", top: jyH * 0.4, left: containerW * 0.5, zIndex: 20 }} pointerEvents="none">
                  <StarExplosion visible={showParticles} color={tierInfo.color} />
                </View>
              )}
              {/* 白色粒子动效 */}
              {PARTICLES.map((p, i) => (
                <Particle key={i} x={p.x} y={p.y} size={p.size} delay={p.delay} containerW={containerW} containerH={jyH} />
              ))}
            </View>
          );
        })()}

        {/* ── 统计三格 + 下方元素：统一绝对定位，位置与间距精确可控 ── */}
        {(() => {
          // 精确计算每格宽度，传给文字层避免 Android absolute 容器宽度测量失准
          const totalGap = vw * 3.2 * 2;
          const cardW = (screenW - vw * 4 * 2 - totalGap) / 3; // 屏宽 - 外边距*2 - gap*2 / 3
          const cardH = cardW / (100 / 70);
          // 统一间距
          const GAP = vw * 3;
          // 各元素高度（与下方渲染保持一致）
          const contentW = screenW - vw * 4 * 2; // 内容区宽度（两侧 padding 各 vw*4）
          const progH = contentW / (343 / 80);   // 升级进度条高度
          const btnW = (contentW - vw * 3.2) / 2; // 单个按钮宽度
          const btnH = btnW / (160 / 80);         // 按钮高度
          const detailH = contentW / (343 / 70);  // 收益明细行高度
          // 统计三格相对包裹容器上移 vw*26，精确控制与底座光圈的重叠位置
          const cardsTop = -vw * 26;
          // 包裹容器总高度：从统计三格顶部到收益明细行底部
          const blockH = cardsTop + cardH + GAP + progH + GAP + btnH + GAP + detailH;
          // 各元素绝对定位 top（基于统计三格实际底部，保证间距统一）
          const progTop = cardsTop + cardH + GAP;
          const btnTop = progTop + progH + GAP;
          const detailTop = btnTop + btnH + GAP;
          return (
            <View style={{ position: "relative", height: blockH, marginBottom: vw * 3 }}>
              {/* 统计三格 */}
              <View style={{ position: "absolute", top: cardsTop, left: 0, right: 0, flexDirection: "row", gap: vw * 3.2, zIndex: 10 }}>
                {[
                  { label: "今日收益", value: pool?.is_active ? `${todayEarned}` : "0" },
                  { label: "帳戶等級", value: pool?.is_active ? `${level}級` : "0級" },
                  { label: "SMT餘額", value: antBalance.toFixed(2) },
                ].map(({ label, value }) => (
                  <View key={label} style={{ width: cardW, height: cardH }}>
                    {/* 背景图 */}
                    <Image source={IMG("bg6.png")} style={{ position: "absolute", top: 0, left: 0, width: cardW, height: cardH, borderRadius: vw * 5.33 }} contentFit="fill" />
                    {/* 文字层：明确 width/height，Android 能正确测量文字 */}
                    <View style={{ position: "absolute", top: 0, left: 0, width: cardW, height: cardH,
                      alignItems: "center", justifyContent: "center", paddingHorizontal: vw * 2 }}>
                      <Text allowFontScaling={false} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}
                        style={{ color: "#fff", fontSize: vw * 3.2, marginBottom: vw * 0.8, width: cardW - vw * 4, textAlign: "center" }}>{label}</Text>
                      <Text allowFontScaling={false} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.35} ellipsizeMode="tail"
                        style={{ color: "#fff", fontSize: vw * 3.6, fontWeight: "700", textAlign: "center", width: cardW - vw * 4 }}>{value}</Text>
                    </View>
                  </View>
                ))}
              </View>

              {/* 升级进度条 */}
              <View style={{ position: "absolute", top: progTop, left: 0, right: 0 }}>
                <Image source={IMG("bg7.png")} style={{ width: "100%", aspectRatio: 343 / 80, borderRadius: vw * 5.33 }} contentFit="fill" />
                <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, paddingHorizontal: vw * 5.33 }}>
                  <Text allowFontScaling={false} style={{ color: "#fff", fontSize: vw * 3.5, marginTop: vw * 3, marginBottom: vw * -2.13 }}>升級進度</Text>
                  <View style={{ flexDirection: "row", gap: vw * 2.67, marginTop: vw * 5.2, paddingHorizontal: vw * 1.07 }}>
                    {Array.from({ length: 7 }).map((_, i) => (
                      <Image key={i} source={i < activeProgressCount ? IMG("bg8.png") : IMG("bg9.png")} style={{ flex: 1, height: vw * 2.67 }} contentFit="fill" />
                    ))}
                  </View>
                </View>
              </View>

              {/* 操作按钮区：立即升级 / 立即收取 / 待激活 */}
              <View style={{ position: "absolute", top: btnTop, left: 0, right: 0, flexDirection: "row", gap: vw * 3.2 }}>

                {/* 左侧按钮：待激活 / 升级 / 满级重生 */}
                {isLevel0 ? (
                  <Pressable
                    style={{ flex: 1, position: "relative", overflow: "hidden" }}
                    onPress={() => {
                      if (profile?.is_activated) {
                        setActivateCodeInput(""); setActivatePassInput(""); setActivateError("");
                        setActivateConfirmVisible(true);
                      } else {
                        router.push("/(app)/activation-code" as any);
                      }
                    }}
                  >
                    <Image source={IMG("bg10.png")} style={{ width: "100%", aspectRatio: 160 / 80, borderRadius: vw * 5.33 }} contentFit="fill" />
                    <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", gap: vw * 1 }}>
                      <Text allowFontScaling={false} style={{ color: "#fff", fontSize: vw * 4, fontWeight: "700" }}>
                        {profile?.is_activated ? "立即啟用" : "獲取啟用碼"}
                      </Text>
                      {profile?.is_activated && (
                        <Text allowFontScaling={false} style={{ color: "#fff", fontSize: vw * 3 }}>Lv.0 → Lv.1</Text>
                      )}
                    </View>
                  </Pressable>
                ) : level === 56 ? (
                  /* 满级重生：样式与立即升级一致 */
                  <Pressable
                    style={{ flex: 1, position: "relative", overflow: "hidden", opacity: upgrading ? 0.6 : 1 }}
                    onPress={() => setRebirthVisible(true)}
                    disabled={upgrading}
                  >
                    <Image
                      source={IMG("bg10.png")}
                      style={{ width: "100%", aspectRatio: 160 / 80, borderRadius: vw * 5.33 }}
                      contentFit="fill"
                    />
                    <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", gap: vw * 1, paddingHorizontal: vw * 3 }}>
                      {upgrading ? <ActivityIndicator color="#fff" /> : (
                        <>
                          <Text allowFontScaling={false} style={{ color: "#fff", fontSize: vw * 4, fontWeight: "700" }} numberOfLines={1}>
                            鯨魚重生
                          </Text>
                          <Text allowFontScaling={false} style={{ color: "#fff", fontSize: vw * 3, fontWeight: "600" }} numberOfLines={1}>
                            {(pool?.rebirth_count ?? 0) > 0 ? `第${(pool?.rebirth_count ?? 0) + 1}次重生` : "首次重生"}
                          </Text>
                        </>
                      )}
                    </View>
                  </Pressable>
                ) : (
                  /* 升级按钮 */
                  <Pressable
                    style={{ flex: 1, position: "relative", overflow: "hidden", opacity: upgrading ? 0.6 : 1 }}
                    onPress={() => {
                      if (needClaimBeforeUpgrade) {
                        setWarnMsg("⚠️ 請先領取今日收益，再晉升等級，避免損失");
                        setWarnVisible(true); return;
                      }
                      if (canUpgrade) setConfirmVisible(true);
                    }}
                    disabled={upgrading}
                  >
                    <Image
                      source={canUpgrade ? IMG("bg10.png") : IMG("bg11.png")}
                      style={{ width: "100%", aspectRatio: 160 / 80, borderRadius: vw * 5.33 }}
                      contentFit="fill"
                    />
                    <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", gap: vw * 1, paddingHorizontal: vw * 3 }}>
                      {upgrading ? <ActivityIndicator color="#fff" /> : (
                        <>
                          <Text allowFontScaling={false} style={{ color: "#fff", fontSize: vw * 4, fontWeight: "700" }} numberOfLines={1}>
                            {needClaimBeforeUpgrade ? "立即升級" : canUpgrade ? "立即升級" : "餘額不足"}
                          </Text>
                          <View style={{ flexDirection: "row", alignItems: "center" }}>
                            <Text allowFontScaling={false} style={{ color: "#fff", fontSize: vw * 3, fontWeight: "600" }} numberOfLines={1}>Lv.{level} → Lv.{level + 1}</Text>
                          </View>
                        </>
                      )}
                    </View>
                  </Pressable>
                )}

                {/* 右侧按钮：收取 / 今日已領 / 尚未開始 */}
                {isLevel0 ? (
                  <View style={{ flex: 1, position: "relative" }}>
                    <Image source={IMG("bg11.png")} style={{ width: "100%", aspectRatio: 160 / 80 }} contentFit="fill" />
                    <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
                      <Text allowFontScaling={false} style={{ color: "#fff", fontSize: vw * 4, fontWeight: "700" }}>尚未開始</Text>
                    </View>
                  </View>
                ) : canClaim ? (
                  <Pressable
                    style={{ flex: 1, position: "relative", overflow: "hidden" }}
                    onPress={() => { setSliderPassed(false); setSliderKey((k) => k + 1); openClaimModal(); }}
                  >
                    <Image source={IMG("bg10.png")} style={{ width: "100%", aspectRatio: 160 / 80, borderRadius: vw * 5.33 }} contentFit="fill" />
                    <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", gap: vw * 1 }}>
                      <Text allowFontScaling={false} style={{ color: "#fff", fontWeight: "900", fontSize: vw * 4, letterSpacing: 1 }}>立即收取</Text>
                      <Text allowFontScaling={false} style={{ color: "#FFDDBB", fontSize: vw * 3, fontWeight: "600" }}>+{dailyYield}</Text>
                    </View>
                  </Pressable>
                ) : (
                  <View style={{ flex: 1, position: "relative", overflow: "hidden" }}>
                    <Image source={IMG("bg11.png")} style={{ width: "100%", aspectRatio: 160 / 80 }} contentFit="fill" />
                    <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
                      <Text allowFontScaling={false} style={{ color: "#fff", fontSize: vw * 3.8 }}>今日已領取</Text>
                      <Text allowFontScaling={false} style={{ color: "#FFDDBB", fontSize: vw * 2.8, marginTop: vw * 1 }}>
                        {fmtHoursCountdown(secsToNext)} 後重置
                      </Text>
                    </View>
                  </View>
                )}
              </View>

              {/* 收益明细行 */}
              <View style={{ position: "absolute", top: detailTop, left: 0, right: 0 }}>
                <Image source={IMG("bg12.png")} style={{ width: "100%", aspectRatio: 343 / 70 }} contentFit="fill" />
                <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, flexDirection: "row", alignItems: "center" }}>

                  {/* 封顶查询按钮（橙色立体渐变） */}
                  <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                    <Pressable
                      onPress={() => setCapModalVisible(true)}
                      style={{ overflow: "hidden", borderRadius: vw * 3 }}
                    >
                      <View style={{
                        borderRadius: vw * 3,
                        boxShadow: [
                          { offsetX: 0, offsetY: 2, blurRadius: 8, color: `${capBtnColor}BB` },
                          { offsetX: 0, offsetY: 1, blurRadius: 0, color: "rgba(255,255,255,0.18)", inset: true },
                        ],
                      }}>
                        <LinearGradient
                          colors={isCapped ? ["#EF4444", "#B91C1C"] : ["#FF8A3D", "#E8520A", "#C43D00"]}
                          start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
                          style={{
                            paddingHorizontal: vw * 4, paddingVertical: vw * 1.6,
                            borderRadius: vw * 3, alignItems: "center", justifyContent: "center",
                            borderWidth: 1, borderColor: "rgba(255,160,80,0.5)",
                          }}
                        >
                          <LinearGradient
                            colors={["rgba(255,255,255,0.55)", "rgba(255,255,255,0)"]}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                            style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1.5, borderTopLeftRadius: vw * 3, borderTopRightRadius: vw * 3 }}
                          />
                          <Text allowFontScaling={false} style={{
                            color: "#fff", fontSize: vw * 3.5, fontWeight: "800", letterSpacing: 1,
                            textShadowColor: "rgba(0,0,0,0.35)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2,
                          }}>
                            {isCapped ? "🔒 已封頂" : "封頂查詢"}
                          </Text>
                        </LinearGradient>
                      </View>
                    </Pressable>
                  </View>

                  {/* 分隔线 */}
                  <View style={{ width: 1, height: vw * 9 }}>
                    <LinearGradient colors={["rgba(255,255,255,0)", "rgba(255,255,255,0.3)", "rgba(255,255,255,0)"]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={{ flex: 1 }} />
                  </View>

                  {/* 昨日收益 */}
                  <View style={{ flex: 1, alignItems: "center" }}>
                    <Text allowFontScaling={false} style={{ color: "#fff", fontSize: vw * 3, marginBottom: vw * 0.5 }}>昨日收益</Text>
                    <Text allowFontScaling={false} style={{ color: "#22C55E", fontWeight: "700", fontSize: vw * 4 }}>+{yesterdayEarned}</Text>
                  </View>

                  {/* 分隔线 */}
                  <View style={{ width: 1, height: vw * 9 }}>
                    <LinearGradient colors={["rgba(255,255,255,0)", "rgba(255,255,255,0.3)", "rgba(255,255,255,0)"]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={{ flex: 1 }} />
                  </View>

                  {/* 下一级收益 */}
                  <View style={{ flex: 1, alignItems: "center" }}>
                    <Text allowFontScaling={false} style={{ color: "#fff", fontSize: vw * 3, marginBottom: vw * 0.5 }}>晉級收益</Text>
                    <Text allowFontScaling={false} style={{ color: BC.orange, fontWeight: "700", fontSize: vw * 4 }}>
                      {level < 56 ? `+${nextConfig?.daily_yield ?? 0}` : "已滿級"}
                    </Text>
                  </View>

                </View>
              </View>
            </View>
          );
        })()}
      </ScrollView>

      {/* ══ 底部 TabBar ══ */}
      <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 91 + insets.bottom, backgroundColor: "transparent" }}>
        <Image source={IMG("tabbar-bg.png")} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="cover" priority="high" />
        <View style={{ height: 91, flexDirection: "row" }}>
          {POOL_TAB_LIST.map((tab, idx) => {
            const isCenter = idx === 2;
            return (
              <Pressable
                key={tab.name}
                style={{ flex: 1, height: 91, alignItems: "center", justifyContent: "center" }}
                onPress={() => {
                  if (tab.name === "pool") return; // 当前页
                  router.push(`/(app)/(tabs)/${tab.name}` as any);
                }}
              >
                {isCenter ? (
                  <Image source={IMG("tab_pool_a.png")} style={{ width: 64, height: 80 }} contentFit="contain" />
                ) : (
                  <View style={{ position: "absolute", top: 41, alignItems: "center" }}>
                    <Image source={tab.icon} style={{ width: 36, height: 36 }} contentFit="contain" />
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
        <View style={{ height: insets.bottom, backgroundColor: "transparent" }} />
      </View>

      {/* ══ 领取弹窗 ══ */}
      {/* ══ 每日領取彈窗（style002 DailyReceiveDialog 樣式）══ */}
      {claimModalVisible && (
        <Modal visible={claimModalVisible} transparent animationType="fade" onRequestClose={closeClaimModal}>
          <Pressable
            style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}
            onPress={closeClaimModal}
          >
            <Pressable onPress={(e) => e.stopPropagation()} style={{ width: "100%" }}>
              {/* 彈窗容器：黑色底 + home_bg20 背景圖 */}
              <View style={{ width: "100%", backgroundColor: "#000", borderRadius: 12, overflow: "hidden" }}>
                <Image source={IMG_HOME_BG20} style={StyleSheet.absoluteFillObject} contentFit="fill" />
                <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16 }}>
                  {/* 標題行 + 關閉按鈕 */}
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", marginBottom: 12, position: "relative" }}>
                    <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 20, fontWeight: "800" }}>每日領取</Text>
                    <Pressable onPress={closeClaimModal} style={{ position: "absolute", right: 0 }} className="active:opacity-70">
                      <Image source={IMG_HOME_ICON20} style={{ width: 22, height: 22 }} contentFit="contain" />
                    </Pressable>
                  </View>

                  {/* 驗證提示行 */}
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
                    <Image source={IMG_HOME_ICON32} style={{ width: 13, height: 13 }} contentFit="contain" />
                    <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 12 }}>滑動拼圖驗證後領取</Text>
                  </View>

                  {/* SliderCaptcha 驗證元件：傳入弹窗内容宽度，确保拼图与弹窗等宽 */}
                  <View style={{ marginBottom: 16 }}>
                    <SliderCaptcha
                      key={sliderKey}
                      onSuccess={() => setSliderPassed(true)}
                      containerWidth={screenW - 64 - 40}
                      iconNormal={IMG_HOME_ICON33}
                      iconSuccess={IMG_HOME_ICON34}
                    />
                  </View>

                  {/* 確認領取按鈕 home_bg41: 841×130，放在最後確保層級正確 */}
                  <Pressable
                    onPress={handleClaim}
                    className="active:opacity-80"
                    style={{ width: "100%", aspectRatio: 841 / 130, position: "relative", opacity: (claiming || !sliderPassed) ? 0.4 : 1 }}
                    disabled={claiming || !sliderPassed}
                  >
                    <Image source={IMG_HOME_BG41} style={StyleSheet.absoluteFillObject} contentFit="fill" />
                    <View style={[StyleSheet.absoluteFillObject, { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }]}>
                      {claiming ? <ActivityIndicator color="#fff" /> : (
                        <>
                          <Image source={IMG_HOME_ICON35} style={{ width: 18, height: 18 }} contentFit="contain" />
                          <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>
                            確認領取 +{dailyYield} SMT
                          </Text>
                        </>
                      )}
                    </View>
                  </Pressable>
                </View>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {/* ══ 升级確認弹窗（style002 UpgradeDialog 樣式）══ */}
      <Modal visible={confirmVisible} transparent animationType="fade" onRequestClose={() => setConfirmVisible(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}
          onPress={() => setConfirmVisible(false)}
        >
          <Pressable onPress={(e) => e.stopPropagation()} style={{ width: "100%" }}>
            <View style={{ width: "100%", position: "relative", backgroundColor: "#000" }}>
              <Image source={IMG_DIALOG_BG} style={StyleSheet.absoluteFillObject} contentFit="fill" />
              <View style={{ paddingHorizontal: 20, paddingTop: 28, paddingBottom: 24, alignItems: "center" }}>
                {/* 頂部圖標 */}
                <Image source={IMG_DIALOG_ICON} style={{ width: 52, height: 52, marginBottom: 12 }} contentFit="contain" />
                {/* 標題 */}
                <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 20, fontWeight: "800", marginBottom: 8 }}>
                  確認升級
                </Text>
                {/* 說明文字 */}
                <Text allowFontScaling={false} style={{ color: MUTED_COLOR, fontSize: 14, textAlign: "center", lineHeight: 22, marginBottom: 20 }}>
                  消耗 <Text allowFontScaling={false} style={{ color: OG2 }}>{Number(nextConfig?.upgrade_cost ?? 0).toLocaleString("zh-CN")} SMT</Text>{"\n"}
                  升級至 Lv.{(pool?.level ?? 0) + 1}，獲得 <Text allowFontScaling={false} style={{ color: OG2 }}>+{Number(nextConfig?.bonus_energy ?? 0).toLocaleString("zh-CN", { minimumFractionDigits: 4, maximumFractionDigits: 4 })} 能量</Text>
                </Text>
                {/* 雙按鈕 */}
                <View style={{ flexDirection: "row", gap: 12, width: "92%", marginBottom: 4 }}>
                  <Pressable
                    className="active:opacity-80"
                    onPress={handleUpgrade}
                    style={{ flex: 1, aspectRatio: 390 / 121, position: "relative" }}
                  >
                    <Image source={IMG_BTN_CONFIRM} style={StyleSheet.absoluteFillObject} contentFit="fill" />
                    <View style={[StyleSheet.absoluteFillObject, { alignItems: "center", justifyContent: "center" }]}>
                      <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>確認升級</Text>
                    </View>
                  </Pressable>
                  <Pressable
                    className="active:opacity-80"
                    onPress={() => setConfirmVisible(false)}
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

      {/* ══ 啟用算力池彈窗 ══ */}
      <Modal visible={activateConfirmVisible} transparent animationType="fade" onRequestClose={() => { setActivateConfirmVisible(false); setActivateCodeInput(""); setActivatePassInput(""); setActivateError(""); }}>
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}
          onPress={() => { setActivateConfirmVisible(false); setActivateCodeInput(""); setActivatePassInput(""); setActivateError(""); }}
        >
          <Pressable onPress={(e) => e.stopPropagation()} style={{ width: "100%" }}>
            {/* 彈窗：黑色底色保證清晰，背景圖片鋪滿，內容自動撐開高度 */}
            <View style={{ width: "100%", position: "relative", backgroundColor: "#000" }}>
              {/* 背景圖片絕對鋪滿 */}
              <Image source={IMG_DIALOG_BG} style={StyleSheet.absoluteFillObject} contentFit="fill" />
              {/* 內容區：上下左右留間距，自動撐開 */}
              <View style={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 20, alignItems: "center" }}>
                {/* 頂部圖標 */}
                <Image source={IMG_DIALOG_ICON} style={{ width: 52, height: 52, marginBottom: 10 }} contentFit="contain" />
                {/* 標題 */}
                <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 20, fontWeight: "800", marginBottom: 16 }}>
                  啟用算力池
                </Text>
                {/* 啟用碼輸入 */}
                <View style={{ width: "100%", marginBottom: 12 }}>
                  <Text allowFontScaling={false} style={{ color: OG2, fontSize: 13, fontWeight: "600", marginBottom: 6 }}>啟用碼</Text>
                  <View style={[styles.activateField, activateCodeFocused && { borderColor: OG2 }]}>
                    <TextInput
                      value={activateCodeInput}
                      onChangeText={(v) => { setActivateCodeInput(v); setActivateError(""); }}
                      placeholder="請輸入8位啟用碼"
                      placeholderTextColor={MUTED_COLOR}
                      autoCapitalize="characters"
                      onFocus={() => setActivateCodeFocused(true)}
                      onBlur={() => setActivateCodeFocused(false)}
                      style={[styles.activateInput, { color: "#EAB308", letterSpacing: 2 }, process.env.EXPO_OS === "web" ? { outlineWidth: 0, outlineStyle: "none" } as any : undefined]}
                      allowFontScaling={false}
                      autoCorrect={false}
                      underlineColorAndroid="transparent"
                    />
                  </View>
                </View>
                {/* 交易密碼輸入 */}
                <View style={{ width: "100%", marginBottom: 4 }}>
                  <Text allowFontScaling={false} style={{ color: OG2, fontSize: 13, fontWeight: "600", marginBottom: 6 }}>交易密碼</Text>
                  <View style={[styles.activateField, activatePassFocused && { borderColor: OG2 }]}>
                    <TextInput
                      value={activatePassInput}
                      onChangeText={(v) => { setActivatePassInput(v); setActivateError(""); }}
                      placeholder="請輸入交易密碼"
                      placeholderTextColor={MUTED_COLOR}
                      secureTextEntry={!showActivatePass}
                      onFocus={() => setActivatePassFocused(true)}
                      onBlur={() => setActivatePassFocused(false)}
                      style={[styles.activateInput, process.env.EXPO_OS === "web" ? { outlineWidth: 0, outlineStyle: "none" } as any : undefined]}
                      allowFontScaling={false}
                      autoCorrect={false}
                      underlineColorAndroid="transparent"
                    />
                    <Pressable onPress={() => setShowActivatePass(p => !p)} style={{ paddingLeft: 8, paddingVertical: 4 }} className="active:opacity-70">
                      {showActivatePass ? <Eye size={18} color={MUTED_COLOR} /> : <EyeOff size={18} color={MUTED_COLOR} />}
                    </Pressable>
                  </View>
                </View>
                {/* 錯誤提示（固定佔位，避免跳動）*/}
                <View style={{ width: "100%", minHeight: 20, marginBottom: 8 }}>
                  {!!activateError && (
                    <Text allowFontScaling={false} style={{ color: "#F43F5E", fontSize: 12, marginTop: 4 }}>{activateError}</Text>
                  )}
                </View>
                {/* 圖片按鈕行：底部留 padding 與背景邊緣保持間距 */}
                <View style={{ flexDirection: "row", gap: 12, width: "92%", marginBottom: 4 }}>
                  <Pressable
                    className="active:opacity-80"
                    onPress={activating ? undefined : handleActivatePool}
                    disabled={activating}
                    style={{ flex: 1, aspectRatio: 390 / 121, position: "relative" }}
                  >
                    <Image source={IMG_BTN_CONFIRM} style={StyleSheet.absoluteFillObject} contentFit="fill" />
                    <View style={[StyleSheet.absoluteFillObject, { alignItems: "center", justifyContent: "center" }]}>
                      {activating
                        ? <ActivityIndicator color="#fff" size="small" />
                        : <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>確認啟用</Text>}
                    </View>
                  </Pressable>
                  <Pressable
                    className="active:opacity-80"
                    onPress={() => { setActivateConfirmVisible(false); setActivateCodeInput(""); setActivatePassInput(""); setActivateError(""); }}
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

      {/* ══ 重生確認彈窗（與升級確認彈窗樣式一致）══ */}
      <Modal visible={rebirthVisible} transparent animationType="fade" onRequestClose={() => setRebirthVisible(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}
          onPress={() => setRebirthVisible(false)}
        >
          <Pressable onPress={(e) => e.stopPropagation()} style={{ width: "100%" }}>
            <View style={{ width: "100%", position: "relative", backgroundColor: "#000" }}>
              <Image source={IMG_DIALOG_BG} style={StyleSheet.absoluteFillObject} contentFit="fill" />
              <View style={{ paddingHorizontal: 20, paddingTop: 28, paddingBottom: 24, alignItems: "center" }}>
                {/* 頂部圖標 */}
                <Image source={IMG_DIALOG_ICON} style={{ width: 52, height: 52, marginBottom: 12 }} contentFit="contain" />
                {/* 標題 */}
                <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 20, fontWeight: "800", marginBottom: 8 }}>
                  鯨魚重生
                </Text>
                {/* 說明文字 */}
                <Text allowFontScaling={false} style={{ color: MUTED_COLOR, fontSize: 14, textAlign: "center", lineHeight: 22, marginBottom: 8 }}>
                  等級重置為 <Text allowFontScaling={false} style={{ color: OG2 }}>Lv.1</Text>，封頂歸零{"\n"}
                  重新升級 Lv.1→56 可累積獲得約 <Text allowFontScaling={false} style={{ color: OG2 }}>153,179 能量</Text>
                </Text>
                {/* 當前餘額 */}
                <Text allowFontScaling={false} style={{ color: MUTED_COLOR, fontSize: 12, marginBottom: 4 }}>
                  當前 SMT 餘額：<Text allowFontScaling={false} style={{ color: OG2, fontWeight: "700" }}>{antBalance.toFixed(2)} SMT</Text>
                </Text>
                {pool && pool.rebirth_count > 0 && (
                  <Text allowFontScaling={false} style={{ color: MUTED_COLOR, fontSize: 12, marginBottom: 4 }}>
                    已重生 <Text allowFontScaling={false} style={{ color: OG2, fontWeight: "700" }}>{pool.rebirth_count}</Text> 次
                  </Text>
                )}
                <Text allowFontScaling={false} style={{ color: MUTED_COLOR, fontSize: 12, textAlign: "center", lineHeight: 18, marginBottom: 20 }}>
                  建議儲存足夠 SMT 後再重生，以便快速完成重新升級
                </Text>
                {/* 雙按鈕 */}
                <View style={{ flexDirection: "row", gap: 12, width: "92%", marginBottom: 4 }}>
                  <Pressable
                    className="active:opacity-80"
                    onPress={handleRebirth}
                    disabled={rebirthLoading}
                    style={{ flex: 1, aspectRatio: 390 / 121, position: "relative" }}
                  >
                    <Image source={IMG_BTN_CONFIRM} style={StyleSheet.absoluteFillObject} contentFit="fill" />
                    <View style={[StyleSheet.absoluteFillObject, { alignItems: "center", justifyContent: "center" }]}>
                      {rebirthLoading
                        ? <ActivityIndicator color="#fff" size="small" />
                        : <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>確認重生</Text>
                      }
                    </View>
                  </Pressable>
                  <Pressable
                    className="active:opacity-80"
                    onPress={() => setRebirthVisible(false)}
                    disabled={rebirthLoading}
                    style={{ flex: 1, aspectRatio: 390 / 121, position: "relative" }}
                  >
                    <Image source={IMG_BTN_CANCEL} style={StyleSheet.absoluteFillObject} contentFit="fill" />
                    <View style={[StyleSheet.absoluteFillObject, { alignItems: "center", justifyContent: "center" }]}>
                      <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>再想想</Text>
                    </View>
                  </Pressable>
                </View>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ══ 操作結果彈窗 ══ */}
      <Modal visible={resultVisible} transparent animationType="fade" onRequestClose={() => { setResultVisible(false); setResultMsg(""); setResultIsSuccess(false); setResultAmount(0); setResultIsRebirth(false); setResultRebirthCount(0); }}>
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}
          onPress={() => { setResultVisible(false); setResultMsg(""); setResultIsSuccess(false); setResultAmount(0); setResultIsRebirth(false); setResultRebirthCount(0); }}
        >
          <Pressable onPress={(e) => e.stopPropagation()} style={{ width: "100%" }}>
            <View style={{ width: "100%", position: "relative", backgroundColor: "#000" }}>
              <Image source={IMG_DIALOG_BG} style={StyleSheet.absoluteFillObject} contentFit="fill" />
              {resultAmount > 0 ? (
                /* ── 領取成功：style002 ReceiveDialog 樣式 ── */
                <View style={{ paddingHorizontal: 20, paddingTop: 28, paddingBottom: 24, alignItems: "center" }}>
                  <Image source={IMG_ICON30} style={{ width: 52, height: 52 }} contentFit="contain" />
                  <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 20, fontWeight: "800", marginTop: 8 }}>
                    領取成功
                  </Text>
                  <Text allowFontScaling={false} style={{ color: "#DE792D", fontSize: 24, fontWeight: "800", marginVertical: 4 }}>
                    +{resultAmount} SMT
                  </Text>
                  <Text allowFontScaling={false} style={{ color: MUTED_COLOR, fontSize: 12, marginBottom: 16 }}>
                    已轉入您的錢包
                  </Text>
                  <View style={{ flexDirection: "row", width: "52%" }}>
                    <Pressable
                      className="active:opacity-80"
                      onPress={() => { setResultVisible(false); setResultMsg(""); setResultIsSuccess(false); setResultAmount(0); setResultIsRebirth(false); setResultRebirthCount(0); }}
                      style={{ flex: 1, aspectRatio: 390 / 121, position: "relative" }}
                    >
                      <Image source={IMG_BTN_CONFIRM} style={StyleSheet.absoluteFillObject} contentFit="fill" />
                      <View style={[StyleSheet.absoluteFillObject, { alignItems: "center", justifyContent: "center" }]}>
                        <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>好的</Text>
                      </View>
                    </Pressable>
                  </View>
                </View>
              ) : resultIsRebirth ? (
                /* ── 重生成功：與升級成功一致的 SuccessDialog 樣式 ── */
                <View style={{ paddingHorizontal: 20, paddingTop: 28, paddingBottom: 24, alignItems: "center" }}>
                  <Image source={IMG_DIALOG_ICON} style={{ width: 52, height: 52, marginBottom: 12 }} contentFit="contain" />
                  <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 20, fontWeight: "800", marginBottom: 8 }}>
                    重生成功
                  </Text>
                  <Text allowFontScaling={false} style={{ color: MUTED_COLOR, fontSize: 14, textAlign: "center", lineHeight: 22, marginBottom: 20 }}>
                    這是您第 <Text allowFontScaling={false} style={{ color: OG2, fontWeight: "700" }}>{resultRebirthCount}</Text> 次重生{"\n"}
                    鯨魚已重置為 <Text allowFontScaling={false} style={{ color: OG2, fontWeight: "700" }}>Lv.1</Text>，繼續升級獲取更多能量
                  </Text>
                  <View style={{ flexDirection: "row", width: "52%" }}>
                    <Pressable
                      className="active:opacity-80"
                      onPress={() => { setResultVisible(false); setResultMsg(""); setResultIsSuccess(false); setResultAmount(0); setResultIsRebirth(false); setResultRebirthCount(0); }}
                      style={{ flex: 1, aspectRatio: 390 / 121, position: "relative" }}
                    >
                      <Image source={IMG_BTN_CONFIRM} style={StyleSheet.absoluteFillObject} contentFit="fill" />
                      <View style={[StyleSheet.absoluteFillObject, { alignItems: "center", justifyContent: "center" }]}>
                        <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>好的</Text>
                      </View>
                    </Pressable>
                  </View>
                </View>
              ) : (
                /* ── 普通操作結果：SuccessDialog 樣式 ── */
                <View style={{ paddingHorizontal: 20, paddingTop: 28, paddingBottom: 24, alignItems: "center" }}>
                  <Image source={IMG_DIALOG_ICON} style={{ width: 52, height: 52, marginBottom: 12 }} contentFit="contain" />
                  <View style={{ marginBottom: 20 }}>
                    <Text allowFontScaling={false} style={{ color: MUTED_COLOR, fontSize: 14, textAlign: "center" }}>{resultMsg}</Text>
                  </View>
                  <View style={{ flexDirection: "row", width: "52%" }}>
                    <Pressable
                      className="active:opacity-80"
                      onPress={() => { setResultVisible(false); setResultMsg(""); setResultIsSuccess(false); setResultAmount(0); setResultIsRebirth(false); setResultRebirthCount(0); }}
                      style={{ flex: 1, aspectRatio: 390 / 121, position: "relative" }}
                    >
                      <Image source={IMG_BTN_CONFIRM} style={StyleSheet.absoluteFillObject} contentFit="fill" />
                      <View style={[StyleSheet.absoluteFillObject, { alignItems: "center", justifyContent: "center" }]}>
                        <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>好的</Text>
                      </View>
                    </Pressable>
                  </View>
                </View>
              )}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ══ 先領取再升級 / 先領取再重生 警告彈窗 ══ */}
      <Modal visible={warnVisible} transparent animationType="fade" onRequestClose={() => setWarnVisible(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}
          onPress={() => setWarnVisible(false)}
        >
          <Pressable onPress={(e) => e.stopPropagation()} style={{ width: "100%" }}>
            {/* 與操作成功彈窗完全相同的容器結構 */}
            <View style={{ width: "100%", position: "relative", backgroundColor: "#000" }}>
              <Image source={IMG_DIALOG_BG} style={StyleSheet.absoluteFillObject} contentFit="fill" />
              <View style={{ paddingHorizontal: 20, paddingTop: 28, paddingBottom: 24, alignItems: "center" }}>
                {/* 頂部圖標（與操作成功一致） */}
                <Image source={IMG_DIALOG_ICON} style={{ width: 52, height: 52, marginBottom: 12 }} contentFit="contain" />
                {/* 正文 Body 14 Muted lineHeight 22 */}
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 20 }}>
                  <Text allowFontScaling={false} style={{ color: MUTED_COLOR, fontSize: 14, lineHeight: 20, textAlign: "center" }}>
                    {warnMsg.replace("⚠️ ", "")}
                  </Text>
                </View>
                {/* 單按鈕居中，寬 52%（與操作成功一致） */}
                <View style={{ flexDirection: "row", width: "52%" }}>
                  <Pressable
                    className="active:opacity-80"
                    onPress={() => setWarnVisible(false)}
                    style={{ flex: 1, aspectRatio: 390 / 121, position: "relative" }}
                  >
                    <Image source={IMG_BTN_CONFIRM} style={StyleSheet.absoluteFillObject} contentFit="fill" />
                    <View style={[StyleSheet.absoluteFillObject, { alignItems: "center", justifyContent: "center" }]}>
                      <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>我知道了</Text>
                    </View>
                  </Pressable>
                </View>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ══ 公告弹窗 ══ */}
      {showAnnouncement && announcements.length > 0 && (
        <AnnouncementModal announcements={announcements} userId={userId} onClose={() => setShowAnnouncement(false)} />
      )}

      {/* ══ 封顶进度弹窗 ══ */}
      {capModalVisible && pool && currentConfig && (
        <CapProgressModal
          visible={capModalVisible}
          onClose={() => setCapModalVisible(false)}
          pool={pool}
          config={currentConfig}
          onUpgrade={canUpgrade ? () => setConfirmVisible(true) : undefined}
          onRebirth={level === 56 ? () => setRebirthVisible(true) : undefined}
        />
      )}
    </View>
  );
}

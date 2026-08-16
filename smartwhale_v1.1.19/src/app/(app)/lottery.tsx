/* eslint-disable no-undef */
/**
 * 節點共識抽取 — 使用 style006 抽獎 UI，保留抽獎說明與業務邏輯
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { View, Text, Pressable, useWindowDimensions, Modal, ActivityIndicator, Platform, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { sharedGet } from "@/lib/requestDedup";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withDelay,
  Easing,
} from "react-native-reanimated";
import { useSession } from "@/ctx";
import { supabase } from "@/client/supabase";
import { getProfile } from "@/db/api";
import { useFocusEffect } from "expo-router";
import type { Profile } from "@/types/types";
import SpinePlayerHost from "@/components/SpinePlayerHost";
import { SPINE_RESOURCES } from "@/lib/spineResources";

const DEFAULT_DAILY_LIMIT = 3;

// ─── 本地圖片資源 ──────────────────────────────────────────────────
const IMG_CLOSE = require("../../../assets/page-img/ld_icon20.png");
const IMG_P3    = require("../../../assets/page-img/ld_p3.png");
const IMG_P4    = require("../../../assets/page-img/ld_p4.webp");
const IMG_BG28  = require("../../../assets/page-img/ld_bg28.png");
const IMG_BTN5  = require("../../../assets/page-img/ld_btn5.png");
const IMG_BG    = require("../../../assets/page-img/ld_page_bg3.png");
// style002 操作成功/領取成功彈窗資源
const IMG_DIALOG_BG   = require("../../../assets/page-img/mine_dialog_bg.png");
const IMG_ICON30      = require("../../../assets/page-img/mine_icon30.png");
const IMG_BTN_CONFIRM = require("../../../assets/page-img/mine_btn_confirm.png");

export default function LotteryScreen() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const vw = width / 100;

  const { session } = useSession();
  const userId = session?.user.id ?? "";

  const [_profile, setProfile] = useState<Profile | null>(null);
  const [todayCount, setTodayCount] = useState(0);
  const [dailyLimit, setDailyLimit] = useState(DEFAULT_DAILY_LIMIT);
  const [winRate, setWinRate] = useState(0.3);
  const [loading, setLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [wonResult, setWonResult] = useState<boolean | null>(null);
  const [remainingAfter, setRemainingAfter] = useState(0);
  const [resultVisible, setResultVisible] = useState(false);
  const [spinError, setSpinError] = useState("");

  // ── Spine 动画 ──────────────────────────────────────────────────
  // 抽奖页 Spine 资源（原生渲染，清晰度无损）
  const cjResource = SPINE_RESOURCES.find((r) => r.key === "choujiangye") ?? SPINE_RESOURCES[0];
  const [spinePlaying] = useState(true);
  const [spineSpeed, setSpineSpeed] = useState(1);

  // 动画尺寸：宽度设为屏宽的 0.82 倍
  const animWidth = width * 0.82;
  const animHeight = animWidth / 1.019;

  // ── 絕對定位預計算（取代 flex justifyContent:"center"，保證各元素位置確定、不被裁剪）─────
  const p3W       = vw * 66.33;
  const p3H       = p3W / 1.552;                          // P3圖片高度
  const infoItemW = (width - vw * 8 - vw * 3.2) / 2;     // 單個info卡片寬
  const infoH     = infoItemW / (464 / 188);              // info卡片高度（按素材比例）
  const btnW      = vw * 53.33;
  const btnH      = btnW * 0.35;                          // 按鈕高度
  // 各段高度：P3 + Spine(重疊14vw) + Info(重疊5.33vw) + Button + Desc
  const contentH  = p3H + (animHeight - vw * 14) + (infoH - vw * 5.33) + (vw * 6.67 + btnH) + (vw * 5 + vw * 11);
  const availH    = height - insets.top - insets.bottom;
  // 有足夠空間則垂直置中，否則頂部保留 vw*2 最小間距（防止P3貼狀態欄）
  // P3 整體上移 vw*6，讓動畫上方圖片更高
  const startY    = insets.top + Math.max(vw * 2, (availH - contentH) / 2) - vw * 6;
  const p3Top     = startY;
  const spineTop  = p3Top + p3H - vw * 8;               // Spine頂部：與P3底部重疊量減小，動畫整體下移
  // 動畫下方增加間距：infoTop 往下移（減小與 Spine 底部的重疊量）
  const infoTop   = spineTop + animHeight - vw * 6;   // 原重疊18vw→6vw，增大動畫與下方間距
  const btnTop    = infoTop + infoH + vw * 2.67;          // 按鈕：Info下方間距6.67vw→2.67vw，整體往上移vw*4
  const descTop   = btnTop + btnH + vw * 3;               // 說明文字：按鈕下方間距5vw→3vw，整體往上移vw*2

  // ── 动画加载与 5 秒倒计时 Refs ───────────────────────────────
  const animTimerDoneRef = useRef(false);
  const apiDoneRef = useRef(false);
  const apiResultRef = useRef<{ data: any; error: any } | null>(null);
  const showSpineAnimRef = useRef(false);

  const finishSpin = useCallback(() => {
    if (!showSpineAnimRef.current) return;
    showSpineAnimRef.current = false;
    setSpineSpeed(1); // 恢复正常播放速度

    const { data, error } = apiResultRef.current ?? {};

    if (error || !data?.success) {
      let errMsg = data?.error;
      if (!errMsg && error) {
        try { const b = error?.context?.json?.(); errMsg = b?.error; } catch {}
        if (!errMsg || (error?.message ?? "").toLowerCase().includes("non-2xx")) errMsg = undefined;
        errMsg = errMsg ?? "抽獎失敗，請重試";
      }
      setSpinError(errMsg ?? "抽獎失敗，請重試");
      setIsRunning(false);
      return;
    }

    const won: boolean = data.won;
    const rem: number = data.remaining ?? 0;
    if (data.dailyLimit) setDailyLimit(data.dailyLimit);
    setRemainingAfter(rem);
    setWonResult(won);
    setTodayCount(Math.max(0, dailyLimit - rem));
    setResultVisible(true);
    setIsRunning(false);
  }, [dailyLimit]);

  const tryFinishSpin = useCallback(() => {
    if (apiDoneRef.current && animTimerDoneRef.current) {
      finishSpin();
    }
  }, [finishSpin]);

  // 启动 3 倍速 + 5 秒倒计时（仅在抽奖激活时调用）
  const startSpinTimer = useCallback(() => {
    setSpineSpeed(3);
    setTimeout(() => {
      animTimerDoneRef.current = true;
      tryFinishSpin();
    }, 5000);
  }, [tryFinishSpin]);

  const remaining = Math.max(0, dailyLimit - todayCount);

  // ── 加载用户数据 ───────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
    // 本页读取：profile 走共用 sharedGet 缓存（与其他页共享，秒显）；其余为彩票私有数据
    const [p, { count }, limitCfg, rateCfg] = await Promise.all([
      sharedGet("profile", () => getProfile(userId), { shared: true }).catch(() => null),
      supabase.from("lottery_draws").select("*", { count: "exact", head: true })
        .eq("user_id", userId).eq("draw_date", today),
      supabase.from("system_config").select("config_val").eq("config_key", "lottery_daily_limit").maybeSingle(),
      supabase.from("system_config").select("config_val").eq("config_key", "lottery_win_rate").maybeSingle(),
    ]);
    setProfile(p);
    setTodayCount(count ?? 0);
    if (limitCfg.data?.config_val) {
      const parsed = Math.max(1, Math.round(parseFloat(limitCfg.data.config_val)));
      if (!isNaN(parsed)) setDailyLimit(parsed);
    }
    if (rateCfg.data?.config_val) {
      const parsed = parseFloat(rateCfg.data.config_val);
      if (!isNaN(parsed) && parsed > 0 && parsed <= 1) setWinRate(parsed);
    }
    setLoading(false);
  }, [userId]);

  useFocusEffect(useCallback(() => {
    loadData();
  }, [loadData, userId]));

  // ── 发起抽奖 ───────────────────────────────────────────────────
  const handleSpin = async () => {
    if (isRunning || remaining <= 0) return;
    setSpinError("");
    setIsRunning(true);
    setWonResult(null);

    // 重置本轮抽奖倒计时状态
    animTimerDoneRef.current = false;
    apiDoneRef.current = false;
    apiResultRef.current = null;
    showSpineAnimRef.current = true;

    // 原生渲染立即就绪，直接启动 3 倍速 + 5 秒倒计时
    startSpinTimer();

    try {
      const apiCall = await supabase.functions.invoke("draw-lottery", { body: {} });
      apiResultRef.current = apiCall;
      apiDoneRef.current = true;
      tryFinishSpin();
    } catch {
      apiResultRef.current = { data: null, error: { message: "網路異常" } };
      apiDoneRef.current = true;
      tryFinishSpin();
    }
  };

  const handleClose = async () => {
    setResultVisible(false);
    if (wonResult) await loadData();
  };

  // ── 动画共享值 ──────────────────────────────────────────────────
  // p3/btn 初始值设为 1：确保即使 Reanimated 动画未能触发，元素也始终可见
  const closeOpacity = useSharedValue(0);
  const p3Opacity = useSharedValue(1);
  const p3Scale = useSharedValue(0.5);
  const infoOpacity = useSharedValue(0);
  const infoTranslY = useSharedValue(vw * 4);
  const btnOpacity = useSharedValue(1);
  const btnTranslY = useSharedValue(vw * 4);
  const descOpacity = useSharedValue(0);
  const descTranslY = useSharedValue(vw * 4);

  useEffect(() => {
    closeOpacity.value = withTiming(1, { duration: 600, easing: Easing.ease });
    p3Scale.value = withSpring(1, { damping: 10, stiffness: 120, mass: 0.6 });
    infoOpacity.value = withDelay(600, withTiming(1, { duration: 800, easing: Easing.ease }));
    infoTranslY.value = withDelay(600, withTiming(0, { duration: 800, easing: Easing.ease }));
    btnTranslY.value = withDelay(900, withTiming(0, { duration: 800, easing: Easing.ease }));
    descOpacity.value = withDelay(1100, withTiming(1, { duration: 800, easing: Easing.ease }));
    descTranslY.value = withDelay(1100, withTiming(0, { duration: 800, easing: Easing.ease }));
  }, []);

  const closeStyle = useAnimatedStyle(() => ({ opacity: closeOpacity.value }));
  // zIndex 整合进 animated style，避免在 Android 上数组合并时 zIndex 失效
  const p3Style = useAnimatedStyle(() => ({
    opacity: p3Opacity.value,
    transform: [{ scale: p3Scale.value }],
    zIndex: 3,
    // Android TextureView（hardware layer）不遵守普通 zIndex，必須加 elevation 確保 P3 在動畫之上
    elevation: 3,
  }));
  const infoStyle = useAnimatedStyle(() => ({ opacity: infoOpacity.value, transform: [{ translateY: infoTranslY.value }] }));
  const btnStyle = useAnimatedStyle(() => ({ opacity: btnOpacity.value, transform: [{ translateY: btnTranslY.value }] }));
  const descStyle = useAnimatedStyle(() => ({ opacity: descOpacity.value, transform: [{ translateY: descTranslY.value }] }));

  if (!userId) {
    return (
      <View style={{ flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color="#DE792D" />
        <Text allowFontScaling={false} style={{ color: "#999", fontSize: 13, marginTop: 12 }}>用戶信息校驗中…</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color="#DE792D" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="light" />

      <Image
        source={IMG_BG}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        contentFit="cover"
        contentPosition="center"
        priority="high"
        cachePolicy="memory-disk"
      />

      <Animated.View style={[{
        position: "absolute",
        top: insets.top + vw * 3.2,
        left: vw * 4,
        zIndex: 10,
      }, closeStyle]}>
        <Pressable onPress={() => router.back()}>
          <Image source={IMG_CLOSE} style={{ width: vw * 6.4, height: vw * 6.4 }} contentFit="contain" />
        </Pressable>
      </Animated.View>

      {/* P3 裝飾圖：絕對定位，頂部位置由 startY 精確控制，確保不超出螢幕 */}
      <Animated.View style={[p3Style, { position: "absolute", top: p3Top, left: 0, right: 0, alignItems: "center" }]}>
        <Image
          source={IMG_P3}
          style={{ width: p3W, height: p3H }}
          contentFit="contain"
        />
      </Animated.View>

      {/* Spine 動畫：原生渲染（清晰度无损），絕對定位，spineTop 已計算好與P3的重疊關係 */}
      <View style={{ position: "absolute", top: spineTop, left: (width - animWidth) / 2, width: animWidth, height: animHeight, zIndex: 1 }}>
        <SpinePlayerHost
          playing={spinePlaying}
          resource={cjResource}
          speed={spineSpeed}
        />
      </View>

      {/* 今日中獎概率 & 剩餘次數：絕對定位，infoTop 固定 */}
      <Animated.View style={[infoStyle, {
        position: "absolute",
        top: infoTop,
        left: vw * 4,
        right: vw * 4,
        flexDirection: "row",
        zIndex: 2,
        gap: vw * 3.2,
      }]}>
        <View style={{ flex: 1 }}>
          <View style={{ position: "relative" }}>
            <Image source={IMG_BG28} style={{ width: "100%", aspectRatio: 464 / 188 }} contentFit="fill" />
            <View style={{
              position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
              flexDirection: "row", alignItems: "center", justifyContent: "center", gap: vw * 2,
            }}>
              <Text allowFontScaling={false} style={{ fontSize: vw * 3.2, color: "#fff" }}>今日中獎概率</Text>
              <Text allowFontScaling={false} style={{ fontSize: vw * 5.33, fontWeight: "bold", color: "#DE792D" }}>
                {Math.round(winRate * 100)}%
              </Text>
            </View>
          </View>
        </View>

        <View style={{ flex: 1 }}>
          <View style={{ position: "relative" }}>
            <Image source={IMG_BG28} style={{ width: "100%", aspectRatio: 464 / 188 }} contentFit="fill" />
            <View style={{
              position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
              flexDirection: "row", alignItems: "center", justifyContent: "center", gap: vw * 2,
            }}>
              <Text allowFontScaling={false} style={{ fontSize: vw * 3.2, color: "#fff" }}>今日剩餘次數</Text>
              <Text allowFontScaling={false} style={{ fontSize: vw * 5.33, fontWeight: "bold", color: "#DE792D" }}>
                {remaining}
              </Text>
            </View>
          </View>
        </View>
      </Animated.View>

      {/* 抽獎按鈕：絕對定位，btnTop 固定，不受動畫加載狀態影響 */}
      <Animated.View style={[btnStyle, {
        position: "absolute",
        top: btnTop,
        left: 0,
        right: 0,
        alignItems: "center",
      }]}>
        <Pressable
          className="active:opacity-80"
          onPress={handleSpin}
          disabled={isRunning || remaining === 0}
        >
          {isRunning ? (
            <View style={{ width: btnW, height: btnH, alignItems: "center", justifyContent: "center" }}>
              <ActivityIndicator size="small" color="#FFFFFF80" />
            </View>
          ) : (
            <Image
              source={IMG_BTN5}
              style={{
                width: btnW,
                height: btnH,
                opacity: remaining === 0 ? 0.5 : 1,
              }}
              contentFit="contain"
            />
          )}
        </Pressable>
      </Animated.View>

      {/* 抽獎說明文字：絕對定位，descTop 固定 */}
      <Animated.View style={[descStyle, {
        position: "absolute",
        top: descTop,
        left: vw * 8,
        right: vw * 8,
      }]}>
          {spinError ? (
            <Text allowFontScaling={false} style={{ color: "#F43F5E", fontSize: vw * 3.2, textAlign: "center" }}>
              {spinError}
            </Text>
          ) : (
            <>
              <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: vw * 3.2, textAlign: "center", lineHeight: vw * 5.2 }}>
                點選立即抽獎按鈕，向 SmartWhale 算力網路發起激活申請
              </Text>
              <Text allowFontScaling={false} style={{ color: "#FFFFFF40", fontSize: vw * 3.0, textAlign: "center", marginTop: vw * 1.5 }}>
                每日最多 3 次，抽中即可獲得啟用碼
              </Text>
            </>
          )}
        </Animated.View>

      {/* 結果彈窗：統一使用 style002 領取成功彈窗樣式 */}
      <Modal visible={resultVisible} transparent animationType="fade" onRequestClose={handleClose}>
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}
          onPress={handleClose}
        >
          <Pressable onPress={(e) => e.stopPropagation()} style={{ width: "100%" }}>
            <View style={{ width: "100%", position: "relative", backgroundColor: "#000" }}>
              <Image source={IMG_DIALOG_BG} style={StyleSheet.absoluteFillObject} contentFit="fill" />
              <View style={{ paddingHorizontal: 20, paddingTop: 28, paddingBottom: 24, alignItems: "center" }}>
                <Image source={require("../../../assets/page-img/gift_box_12.png")} style={{ width: 52, height: 52 }} contentFit="contain" />
                {wonResult ? (
                  <>
                    <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 20, fontWeight: "800", marginTop: 8 }}>
                      抽奖成功！啟用碼已頒發
                    </Text>
                    <Text allowFontScaling={false} style={{ color: "#999999", fontSize: 14, textAlign: "center", lineHeight: 22, marginVertical: 16 }}>
                      啟用碼已寫入你的賬戶，請前往啟用碼專區查看
                    </Text>
                    <View style={{ flexDirection: "row", width: "52%" }}>
                      <Pressable
                        className="active:opacity-80"
                        onPress={() => { setResultVisible(false); router.push("/(app)/activation-code" as any); }}
                        style={{ flex: 1, aspectRatio: 390 / 121, position: "relative" }}
                      >
                        <Image source={IMG_BTN_CONFIRM} style={StyleSheet.absoluteFillObject} contentFit="fill" />
                        <View style={[StyleSheet.absoluteFillObject, { alignItems: "center", justifyContent: "center" }]}>
                          <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>前往激活碼專區</Text>
                        </View>
                      </Pressable>
                    </View>
                  </>
                ) : (
                  <>
                    <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 20, fontWeight: "800", marginTop: 8 }}>
                      本次未能抽中
                    </Text>
                    {remainingAfter > 0 && (
                      <Text allowFontScaling={false} style={{ color: "#EAB308", fontSize: 12, marginTop: 16, marginBottom: 16 }}>
                        今日還剩 {remainingAfter} 次機會
                      </Text>
                    )}
                    <View style={{ flexDirection: "row", width: "52%" }}>
                      <Pressable
                        className="active:opacity-80"
                        onPress={handleClose}
                        style={{ flex: 1, aspectRatio: 390 / 121, position: "relative" }}
                      >
                        <Image source={IMG_BTN_CONFIRM} style={StyleSheet.absoluteFillObject} contentFit="fill" />
                        <View style={[StyleSheet.absoluteFillObject, { alignItems: "center", justifyContent: "center" }]}>
                          <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>
                            {remainingAfter > 0 ? "好的" : "明日再來"}
                          </Text>
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

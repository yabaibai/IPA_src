/* eslint-disable no-undef */
/* eslint-disable */
// @ts-nocheck
/**
 * index —— 系统启动页
 *
 * 视觉完全采用 style2 方案：
 *   - 全屏背景图 page-bg2.png
 *   - logo3.png（75vw 近正方形大图）+ 橙色粒子飘散
 *   - btn3.png（42.67vw 胶囊按钮）+ shimmer 每 3.2s 扫一次
 *   - 入场 fadeIn+translateY 动效
 * 底部保留原有：
 *   - 橙色进度条（2s 填满）
 *   - © 2026 SmartWhale 版权文字
 * 跳转：
 *   - 2.4s 自动跳转 /(auth)/sign-in
 *   - 点击按钮立即跳转
 */
import { useEffect, useRef } from "react";
import { View, Text, Animated, Pressable, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import MaskedView from "@react-native-masked-view/masked-view";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import RAnimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withRepeat,
  withSequence,
  Easing,
  cancelAnimation,
} from "react-native-reanimated";

// ── 图片映射 ──────────────────────────────────────────────
const IMGS: Record<string, ReturnType<typeof require>> = {
  "page-bg2.png": require("../../assets/page-img/page-bg2.png"),
  "logo3.png":    require("../../assets/page-img/logo3.png"),
  "btn3.png":     require("../../assets/page-img/btn3.png"),
  "btg3.png":     require("../../assets/page-img/btg3.png"),
};

// ── 图片真实宽高比 ─────────────────────────────────────────
const LOGO_RATIO = 820 / 817;  // 新 logo3.png 820×817
const BTN_RATIO  = 552 / 271;  // ≈ 2.037

// ── 橙色品牌色（进度条用） ────────────────────────────────
const C_ORANGE = "#E8520A";

// ── 粒子配置 ──────────────────────────────────────────────
const PARTICLE_COUNT = 10;
const PARTICLES = Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
  angle:  (360 / PARTICLE_COUNT) * i,
  radius: 38 + (i % 3) * 18,
  size:   4 + (i % 4) * 2,
  delay:  (i * 280) % 1800,
  dur:    1800 + (i % 3) * 400,
}));

// ── 单粒子组件 ────────────────────────────────────────────
function Particle({ angle, radius, size, delay, dur }) {
  const opacity = useSharedValue(0);
  const scale   = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withDelay(delay, withRepeat(
      withSequence(
        withTiming(0.9, { duration: dur * 0.4, easing: Easing.out(Easing.quad) }),
        withTiming(0,   { duration: dur * 0.6, easing: Easing.in(Easing.quad) }),
      ), -1, false,
    ));
    scale.value = withDelay(delay, withRepeat(
      withSequence(
        withTiming(1,   { duration: dur * 0.4 }),
        withTiming(0.3, { duration: dur * 0.6 }),
      ), -1, false,
    ));
    return () => { cancelAnimation(opacity); cancelAnimation(scale); };
  }, []);

  const rad = (angle * Math.PI) / 180;
  const tx  = Math.cos(rad) * radius;
  const ty  = Math.sin(rad) * radius;

  const pStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: tx }, { translateY: ty }, { scale: scale.value }],
  }));

  return (
    <RAnimated.View style={[pStyle, {
      position: "absolute",
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: "#FF8C00",
      shadowColor: "#FF6400",
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.9,
      shadowRadius: size,
    }]} />
  );
}

// ── 主组件 ────────────────────────────────────────────────
export default function SplashScreen() {
  const { width, height } = useWindowDimensions();
  const navigated = useRef(false);

  const logoW = width * 0.75;
  const logoH = logoW / LOGO_RATIO;
  const btnW  = width * 0.4267;
  const btnH  = btnW / BTN_RATIO;

  // Reanimated：logo / btn 入场
  const initTY      = height * 0.03;
  const logoOpacity = useSharedValue(0);
  const logoTY      = useSharedValue(initTY);
  const btnOpacity  = useSharedValue(0);
  const btnTY       = useSharedValue(initTY);
  const shimmerX    = useSharedValue(-btnW);

  // 原生 Animated：进度条（useNativeDriver:false）
  const barWidth = useRef(new Animated.Value(0)).current;

  const navigate = () => {
    if (navigated.current) return;
    navigated.current = true;
    router.replace("/(auth)/sign-in");
  };

  useEffect(() => {
    // 入场动效
    logoOpacity.value = withTiming(1, { duration: 1200 });
    logoTY.value      = withTiming(0, { duration: 1200 });
    btnOpacity.value  = withDelay(500, withTiming(1, { duration: 1200 }));
    btnTY.value       = withDelay(500, withTiming(0, { duration: 1200 }));

    // shimmer（按钮出现后启动，每 3.2s 扫一次）
    const tShimmer = setTimeout(() => {
      shimmerX.value = withRepeat(
        withSequence(
          withTiming(-btnW, { duration: 0 }),
          withDelay(800, withTiming(btnW * 1.5, { duration: 700, easing: Easing.inOut(Easing.quad) })),
          withTiming(btnW * 1.5, { duration: 3200 - 700 - 800 }),
        ), -1, false,
      );
    }, 1200);

    // 进度条 2s 填满
    Animated.timing(barWidth, {
      toValue: 1, duration: 2000, useNativeDriver: false,
    }).start();

    // 2.4s 自动跳转
    const tNav = setTimeout(navigate, 2400);

    return () => {
      clearTimeout(tShimmer);
      clearTimeout(tNav);
      cancelAnimation(shimmerX);
    };
  }, []);

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ translateY: logoTY.value }],
  }));
  const btnStyle = useAnimatedStyle(() => ({
    opacity: btnOpacity.value,
    transform: [{ translateY: btnTY.value }],
  }));
  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shimmerX.value }],
  }));

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="light" />

      {/* 全屏背景图 */}
      <Image
        source={IMGS["page-bg2.png"]}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        contentFit="cover"
      />

      {/* 上区：logo + 粒子 */}
      <View style={{ flex: 2.2, alignItems: "center", justifyContent: "flex-end", paddingBottom: height * 0.02 }}>
        <RAnimated.View style={[logoStyle, { alignItems: "center", justifyContent: "center" }]}>
          <View style={{ position: "absolute", width: 0, height: 0, alignItems: "center", justifyContent: "center" }}>
            {PARTICLES.map((p, i) => <Particle key={i} {...p} />)}
          </View>
          <Image
            source={IMGS["logo3.png"]}
            style={{ width: logoW, height: logoH }}
            contentFit="contain"
          />
          {process.env.EXPO_OS === "web" ? (
            <Text allowFontScaling={false} style={{ fontSize: 14, fontWeight: "700", letterSpacing: 2, marginTop: logoH * 0.04, background: "linear-gradient(90deg,#FFD700,#E8A020,#FFF0A0,#E8A020)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" } as any}>開啟您的挖礦之旅</Text>
          ) : (
            <MaskedView maskElement={<Text allowFontScaling={false} style={{ fontSize: 14, fontWeight: "700", letterSpacing: 2, marginTop: logoH * 0.04, backgroundColor: "transparent" }}>開啟您的挖礦之旅</Text>}>
              <LinearGradient colors={["#FFD700", "#E8A020", "#FFF0A0", "#E8A020"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ marginTop: logoH * 0.04 }}>
                <Text allowFontScaling={false} style={{ fontSize: 14, fontWeight: "700", letterSpacing: 2, opacity: 0 }}>開啟您的挖礦之旅</Text>
              </LinearGradient>
            </MaskedView>
          )}
        </RAnimated.View>
      </View>

      {/* 中区：按钮 + shimmer */}
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <RAnimated.View style={btnStyle}>
          <Pressable onPress={navigate}>
            <View style={{ width: btnW, height: btnH, overflow: "hidden", borderRadius: btnH / 2 }}>
              <Image
                source={IMGS["btg3.png"]}
                style={{ width: btnW, height: btnH }}
                contentFit="contain"
              />
              {/* 文字叠加 */}
              <View style={{ position: "absolute", top: 0, left: 0, width: btnW, height: btnH, alignItems: "center", justifyContent: "center", paddingBottom: btnH * 0.25 }}>
                <Text allowFontScaling={false} style={{ color: "#fff", fontSize: btnW * 0.09, fontWeight: "800", letterSpacing: 1.5 }}>立即開啟</Text>
              </View>
              <RAnimated.View style={[shimmerStyle, { position: "absolute", top: 0, left: 0, width: btnW * 0.35, height: btnH }]}>
                <LinearGradient
                  colors={["transparent", "rgba(255,255,255,0.45)", "transparent"]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={{ flex: 1 }}
                />
              </RAnimated.View>
            </View>
          </Pressable>
        </RAnimated.View>
      </View>

      {/* 下区：留白 */}
      <View style={{ flex: 1.2 }} />

      {/* 底部进度条（原有保留） */}
      <View style={{
        position: "absolute", bottom: 68,
        alignSelf: "center",
        width: 160, height: 2, borderRadius: 1,
        backgroundColor: "#1C1C1C", overflow: "hidden",
      }}>
        <Animated.View style={{
          height: "100%", borderRadius: 1,
          backgroundColor: C_ORANGE,
          width: barWidth.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }),
        }} />
      </View>

      {/* 版权文字（原有保留） */}
      <Text allowFontScaling={false} style={{
        position: "absolute", bottom: 30,
        alignSelf: "center",
        color: "rgba(255,255,255,0.25)", fontSize: 10, letterSpacing: 1,
      }}>
        © 2026 SmartWhale
      </Text>
    </View>
  );
}

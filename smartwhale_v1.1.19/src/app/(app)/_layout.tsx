/* eslint-disable no-undef */
import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, Animated, Easing, useWindowDimensions, ScrollView } from "react-native";
import { Image } from "expo-image";
import { Stack, useRouter, usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import MaskedView from "@react-native-masked-view/masked-view";
import { useSession } from "@/ctx";
import { getProfile } from "@/db/api";
import { preloadCoreData, PreloadResult } from "@/lib/preload";
import { setToastListener } from "@/lib/toast";
import tabbarBgImg from "../../../assets/page-img/tabbar-bg.png";

// ── 預加載進度條覆蓋層：複用登錄頁視覺（背景 / logo / 粒子 / 挖礦之旅）──
const PRELOAD_IMGS: Record<string, ReturnType<typeof require>> = {
  "page-bg2.png": require("../../../assets/page-img/page-bg2.png"),
  "logo2.png":    require("../../../assets/page-img/logo2.png"),
  "bg16.png":     require("../../../assets/page-img/bg16.png"),
};
const PIMG = (name: string) => PRELOAD_IMGS[name];

// 粒子動效（與登錄頁一致）
const PARTICLE_COUNT = 14;
interface Particle { tx: number; ty: number; delay: number; size: number; duration: number; }
function buildParticles(vw: number): Particle[] {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => {
    const angle = (i / PARTICLE_COUNT) * Math.PI * 2 + Math.random() * 0.4;
    const dist  = vw * (14 + Math.random() * 18);
    return { tx: Math.cos(angle) * dist, ty: Math.sin(angle) * dist, delay: Math.random() * 1800, size: vw * (1.2 + Math.random() * 1.6), duration: 1600 + Math.random() * 800 };
  });
}
function PreloadParticleLayer({ vw }: { vw: number }) {
  const particles = useRef(buildParticles(vw)).current;
  const anims = useRef(particles.map(() => new Animated.Value(0))).current;
  useEffect(() => {
    const loops = anims.map((anim, i) => {
      const p = particles[i];
      return Animated.loop(Animated.sequence([
        Animated.delay(p.delay),
        Animated.timing(anim, { toValue: 1, duration: p.duration, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]));
    });
    loops.forEach(l => l.start());
    return () => loops.forEach(l => l.stop());
  }, []);
  const logoW = vw * 48.27;
  const logoH = logoW * (529 / 522);
  return (
    <View pointerEvents="none" style={{ position: "absolute", width: logoW, height: logoH, alignItems: "center", justifyContent: "center" }}>
      {particles.map((p, i) => {
        const opacity    = anims[i].interpolate({ inputRange: [0, 0.15, 0.7, 1], outputRange: [0, 1, 0.7, 0] });
        const translateX = anims[i].interpolate({ inputRange: [0, 1], outputRange: [0, p.tx] });
        const translateY = anims[i].interpolate({ inputRange: [0, 1], outputRange: [0, p.ty] });
        const scale      = anims[i].interpolate({ inputRange: [0, 0.15, 1], outputRange: [0.3, 1.2, 0.4] });
        return (
          <Animated.View key={i} style={{ position: "absolute", width: p.size, height: p.size, borderRadius: p.size / 2, backgroundColor: i % 3 === 0 ? "#FF8C00" : i % 3 === 1 ? "#FFA500" : "#E8520A", opacity, transform: [{ translateX }, { translateY }, { scale }] }} />
        );
      })}
    </View>
  );
}

// 商戶允許訪問的路徑前綴
const MERCHANT_ALLOWED_PREFIXES = [
  "/merchant-center",
  "/merchant-rank",
  "/profile",
  "/shenhe",
  "/account-settings",
  "/help-center",
  "/transfer-order-detail",
  "/transfer",
  "/notifications",
];

// 商戶模式 TabBar（絕對定位，懸浮在 Stack 頁面上方）
const MERCHANT_TAB_LIST = [
  { name: "merchant-center", icon: require("../../../assets/page-img/tab_shop.png"),    iconA: require("../../../assets/page-img/tab_shop_a.png"),    stackPath: "/(app)/merchant-center" },
  { name: "merchant-rank",   icon: require("../../../assets/page-img/tab_home.png"),    iconA: require("../../../assets/page-img/tab_home_a.png"),    stackPath: "/(app)/merchant-rank"   },
  // profile 是 Tabs 頁，用 navigate 切 Tab 而非 push 進 Stack
  { name: "profile",         icon: require("../../../assets/page-img/tab_profile.png"), iconA: require("../../../assets/page-img/tab_profile_a.png"), stackPath: null },
];

function MerchantTabBar({ activeName }: { activeName: string }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    // 外層 box-none：容器本身不攔截觸摸，子 Pressable 仍可響應
    <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 91 + insets.bottom }} pointerEvents="box-none">
      {/* 背景圖設 none：不攔截點擊事件，讓事件穿透給 Pressable */}
      <Image
        source={tabbarBgImg}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        contentFit="cover"
        priority="high"
        cachePolicy="memory-disk"
        pointerEvents="none"
      />
      <View style={{ height: 91, flexDirection: "row" }}>
        {MERCHANT_TAB_LIST.map((tab) => {
          const isActive = activeName === tab.name;
          return (
            <Pressable
              key={tab.name}
              onPress={() => {
                if (tab.stackPath) {
                  router.push(tab.stackPath as any);
                } else {
                  // profile：切換到 Tabs 內的 profile Tab
                  router.push("/(app)/(tabs)/profile" as any);
                }
              }}
              style={{ flex: 1, height: 91, alignItems: "center", justifyContent: "center" }}
            >
              <View style={{ position: "absolute", top: 41, alignItems: "center" }}>
                <Image source={isActive ? tab.iconA : tab.icon} style={{ width: 36, height: 36 }} contentFit="contain" />
              </View>
            </Pressable>
          );
        })}
      </View>
      <View style={{ height: insets.bottom }} />
    </View>
  );
}

export default function AppSubLayout() {
  const { session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const vw = width / 100;
  const [isMerchant, setIsMerchant] = useState(false);
  const [toastMsg, setToastMsg] = useState("");

  useEffect(() => { setToastListener((m) => setToastMsg(m)); return () => setToastListener(null); }, []);

  // 登錄後系統數據預加載進度條（真實串行加載，全部成功寫緩存後放行）
  const [preload, setPreload] = useState<PreloadResult | null>(null);
  const preloadUserIdRef = useRef<string | null>(null);

  // 進度條平滑动畫 + 掃光動態效果
  const progressAnim = useRef(new Animated.Value(0)).current;
  const sweepAnim = useRef(new Animated.Value(-1)).current;
  useEffect(() => {
    const target = preload && preload.total ? preload.done / preload.total : 0;
    Animated.timing(progressAnim, { toValue: target, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [preload?.done, preload?.total, preload, progressAnim]);
  useEffect(() => {
    Animated.loop(Animated.timing(sweepAnim, { toValue: 1, duration: 1600, easing: Easing.linear })).start();
    return () => { sweepAnim.stopAnimation(); };
  }, [sweepAnim]);
  const sweepStyle = {
    transform: [{ translateX: sweepAnim.interpolate({ inputRange: [-1, 1], outputRange: [-90, 240] }) }],
  };

  useEffect(() => {
    const uid = session?.user.id;
    if (!uid) return;
    // 同一用戶只預加載一次（避免切 Tab / 重渲染重複觸發）
    if (preloadUserIdRef.current === uid) return;
    preloadUserIdRef.current = uid;
    let alive = true;
    setPreload({ done: 0, total: 5, label: "", failed: [] });
    preloadCoreData(uid, (r) => { if (alive) setPreload(r); })
      .finally(() => { if (alive) setPreload(null); });
    return () => { alive = false; };
  }, [session?.user.id]);

  useEffect(() => {
    if (!session?.user.id) return;

    (async () => {
      const profile = await getProfile(session.user.id);

      // 待稽核：強制跳稽核頁
      if (profile?.merchant_status === "pending") {
        if (pathname !== "/shenhe") {
          router.replace("/(app)/shenhe" as any);
        }
        return;
      }

      // 活躍商戶
      if (profile?.is_merchant === true && profile?.merchant_status === "active") {
        setIsMerchant(true);
        const allowed = MERCHANT_ALLOWED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
        if (!allowed) {
          router.replace("/(app)/merchant-center" as any);
        }
      }
    })();
  }, [session?.user.id]);

  // 根據當前路徑決定 Tab 高亮
  const merchantActiveName = pathname.startsWith("/merchant-rank") ? "merchant-rank"
    : pathname.startsWith("/profile") ? "profile"
    : "merchant-center";

  // 以下頁面為全屏操作操作頁，隱藏商戶固定底部導航
  const HIDE_MERCHANT_TAB_PATHS = ["/withdraw-records", "/transfer", "/smt-transfer", "/exchange", "/transfer-order-detail", "/notifications", "/account-settings", "/help-center"];
  const hideMerchantTab = HIDE_MERCHANT_TAB_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );

  return (
    <View style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }} />
      {isMerchant && !hideMerchantTab && <MerchantTabBar activeName={merchantActiveName} />}
      {/* 登錄後系統數據預加載進度條覆蓋層（真實串行加載，全部成功才放行） */}
      {preload && (
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }}>
          {/* 背景圖：與登錄頁一致 */}
          <Image source={PIMG("page-bg2.png")} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, width: "100%", height: "100%" }} contentFit="cover" />
          <ScrollView contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + vw * 10, paddingBottom: insets.bottom + vw * 8, paddingHorizontal: vw * 4, alignItems: "center", justifyContent: "center", gap: vw * 3 }}>
            {/* logo + 粒子（與登錄頁一致） */}
            <View style={{ alignItems: "center", justifyContent: "center" }}>
              <PreloadParticleLayer vw={vw} />
              <Image source={PIMG("logo2.png")} style={{ width: vw * 48.27, aspectRatio: 522 / 455 }} contentFit="contain" />
              <MaskedView maskElement={<Text allowFontScaling={false} style={{ fontSize: vw * 3.8, fontWeight: "700", letterSpacing: 1.5, marginTop: vw * 1.5, backgroundColor: "transparent" }}>開啟您的挖礦之旅</Text>}>
                <LinearGradient colors={["#FFD700", "#E8A020", "#FFF0A0", "#E8A020"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ marginTop: vw * 1.5 }}>
                  <Text allowFontScaling={false} style={{ fontSize: vw * 3.8, fontWeight: "700", letterSpacing: 1.5, opacity: 0 }}>開啟您的挖礦之旅</Text>
                </LinearGradient>
              </MaskedView>
            </View>
            {/* 進度條展示空間（不使用登錄卡片樣式，保留原有簡潔居中方式） */}
            <View style={{ width: "100%", alignItems: "center", gap: vw * 3, marginTop: vw * 4 }}>
              <ActivityIndicator size="large" color="#E8520A" />
              <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 15, textAlign: "center", flexWrap: "wrap", width: "85%", maxWidth: 320 }}>
                {preload.failed.length > 0 ? "部分數據加載失敗，正在重試…" : `正在加載${preload.label || "系統數據"}…`}
              </Text>
              <Text allowFontScaling={false} style={{ color: "#ccc", fontSize: 12 }}>{preload.done} / {preload.total}</Text>
              {/* 進度條 + 掃光動態 */}
              <View style={{ width: "70%", height: 6, backgroundColor: "#333", borderRadius: 3, overflow: "hidden" }}>
                <Animated.View style={{ width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }), height: "100%", backgroundColor: "#E8520A" }} />
                <Animated.View style={[sweepStyle, { position: "absolute", top: 0, bottom: 0, width: "35%" }]} pointerEvents="none">
                  <View style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.28)" }} />
                </Animated.View>
              </View>
              {preload.failed.length > 0 && (
                <Text allowFontScaling={false} style={{ color: "#E8520A", fontSize: 11, textAlign: "center", flexWrap: "wrap", width: "85%", maxWidth: 320 }}>失敗：{preload.failed.join("、")}（可下拉刷新補全）</Text>
              )}
            </View>
          </ScrollView>
        </View>
      )}
      {/* 全局輕提示（刷新過於頻密等）*/}
      {toastMsg ? (
        <View style={{ position: "absolute", top: 60, left: 20, right: 20, backgroundColor: "rgba(0,0,0,0.82)", paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, zIndex: 1000, alignItems: "center" }}>
          <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 13 }}>{toastMsg}</Text>
        </View>
      ) : null}
    </View>
  );
}

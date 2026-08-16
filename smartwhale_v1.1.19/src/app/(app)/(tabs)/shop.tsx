/* eslint-disable no-undef */
import React, { useState } from "react";
import { View, Text, ScrollView, Pressable, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

// ─── 本地圖片資源（打包後不依賴網路）───────────────────
const LOCAL_IMGS: Record<string, ReturnType<typeof require>> = {
  "page-bg1.png": require("../../../../assets/page-img/page_bg.webp"),
  "p1.png":       require("../../../../assets/page-img/shop_p1.png"),
  "p2.png":       require("../../../../assets/page-img/shop_p2.png"),
};
const P2 = (name: string) => LOCAL_IMGS[name] ?? LOCAL_IMGS["p2.png"];

const TAB_ACTIVE_COLOR = "#de792d";

// ─── Tab 配置（對照 Mall.vue 源碼）────────────────────────────────────────────
const TABS = [
  { label: "SMT兌換好禮",  count: 12, img: "p2.png" },
  { label: "算力周邊裝備", count: 6,  img: "p2.png" },
  { label: "會員專屬福利", count: 6,  img: "p2.png" },
];

// ─── 禮品卡片（精準對照 .gift-card CSS）──────────────────────────────────────
// Mall.vue: background: linear-gradient(0deg, #FFFFFF 0%, #F8D7B4 86%)
// 0deg = 從下(bottom)到上(top)，即底部 #FFFFFF，頂部 #F8D7B4
function GiftCard({ index, imgName }: { index: number; imgName: string }) {
  const { width: screenW } = useWindowDimensions();
  const vw = screenW / 100;
  // 3列自适应（百分比宽度，避免浮點取整導致 16 Pro 等機型折行成2列；整體居中）
  const cardW = "30%";
  const innerW = "100%";

  return (
    <LinearGradient
      colors={["#FFFFFF", "#F8D7B4"]}
      start={{ x: 0, y: 1 }}
      end={{ x: 0, y: 0.14 }}
      style={{ width: cardW, borderRadius: vw * 2.13, padding: vw * 3.2, alignItems: "center" }}
    >
      {/* .gift-title */}
      <Text allowFontScaling={false}
        numberOfLines={1}
        style={{
          fontSize: vw * 3.73, fontWeight: "700", color: "#333",
          marginBottom: vw * 2.13, textAlign: "center", width: "100%",
        }}
      >
        禮品{index + 1}
      </Text>

      {/* .gift-image: 撐滿卡片內寬，保持正方形 */}
      <View style={{ width: innerW, aspectRatio: 1, marginBottom: vw * 2.13 }}>
        <Image
          source={P2(imgName)}
          style={{ width: "100%", height: "100%", borderRadius: vw * 1.07 }}
          contentFit="cover"
        />
      </View>

      {/* .gift-status */}
      <Text allowFontScaling={false} style={{ fontSize: vw * 3.2, color: "#999" }}>敬請期待</Text>
    </LinearGradient>
  );
}

// ─── 主頁面 ───────────────────────────────────────────────────────────────────
export default function ShopScreen() {
  const { width: screenW } = useWindowDimensions();
  const vw = screenW / 100;
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState(0);
  const navH = vw * 13.33;

  const currentTab = TABS[activeTab];

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <StatusBar style="light" />

      {/* 全屏背景圖（global.css: page-bg1.png, cover, top center）*/}
      <Image
        source={P2("page-bg1.png")}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        contentFit="cover"
        contentPosition={{ top: 0, left: "50%" }}
        priority="high"
        cachePolicy="memory-disk"
      />

      {/* ── 固定 NavBar（對齊算力池頁面 logo 位置）── */}
      <View style={{
        position: "absolute", top: insets.top, left: 0, right: 0, zIndex: 10,
        height: navH, paddingHorizontal: vw * 4,
        flexDirection: "row", alignItems: "center",
      }}>
        <Text allowFontScaling={false} style={{
          color: "#fff", fontSize: vw * 5.87, fontWeight: "800",
          letterSpacing: 1,
        }}>算力商城</Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: insets.top + navH, paddingBottom: insets.bottom + 111 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 頂部 Banner（p1.png 全寬）── */}
        <Image
          source={P2("p1.png")}
          style={{ width: "100%", aspectRatio: 375 / 200 }}
          contentFit="fill"
          priority="high"
        />

        {/* ── van-tabs 欄 ── */}
        <View style={{ flexDirection: "row", backgroundColor: "transparent" }}>
          {TABS.map((tab, idx) => {
            const isActive = activeTab === idx;
            return (
              <Pressable
                key={tab.label}
                onPress={() => setActiveTab(idx)}
                style={{ flex: 1, alignItems: "center", paddingVertical: vw * 3.2 }}
              >
                <Text allowFontScaling={false} style={{
                  fontSize: vw * 3.47,
                  fontWeight: isActive ? "700" : "400",
                  color: isActive ? TAB_ACTIVE_COLOR : "#fff",
                }}>
                  {tab.label}
                </Text>
                {/* 下劃線指示器 */}
                <View style={{
                  marginTop: vw * 1.5,
                  height: 2, borderRadius: 1, width: vw * 8,
                  backgroundColor: isActive ? TAB_ACTIVE_COLOR : "transparent",
                }} />
              </Pressable>
            );
          })}
        </View>

        {/* ── 禮品格子（.container padding 4vw 0 20vw + .gift-grid）── */}
        <View style={{
          paddingTop: vw * 4,
          paddingHorizontal: vw * 4,
          flexDirection: "row",
          flexWrap: "wrap",
          rowGap: vw * 2.13,
          columnGap: vw * 3.2,
          justifyContent: "center",
        }}>
          {Array.from({ length: currentTab.count }).map((_, i) => (
            <GiftCard key={`tab${activeTab}-${i}`} index={i} imgName={currentTab.img} />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}


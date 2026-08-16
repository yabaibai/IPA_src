/* eslint-disable no-undef */
import { useState, useCallback } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator, useWindowDimensions } from "react-native";
import { useFocusEffect, router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Image } from "expo-image";
import { getAllAnnouncements } from "@/db/api";
import type { Announcement } from "@/types/types";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// ─── 本地資源（對齊幫助中心）────────────────────────────────
const IMG_BACK = require("../../../assets/page-img/icon9.png");
const BG_IMG   = require("../../../assets/page-img/page_bg.webp");

export default function AnnouncementDetailScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const vw = Math.min(width, 375) / 100;
  const { id } = useLocalSearchParams<{ id: string }>();
  const [item, setItem] = useState<Announcement | null>(null);
  const [loading, setLoading] = useState(true);
  const [scrolled, setScrolled] = useState(false);

  useFocusEffect(useCallback(() => {
    (async () => {
      setLoading(true);
      const all = await getAllAnnouncements();
      setItem(all.find((a) => a.id === id) ?? null);
      setLoading(false);
    })();
  }, [id]));

  return (
    <View style={{ flex: 1, backgroundColor: "#000000" }}>
      <StatusBar style="light" />

      {/* 全屏背景圖（對齊幫助中心）*/}
      <Image
        source={BG_IMG}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        contentFit="cover"
        contentPosition={{ top: 0, left: "50%" }}
        priority="high"
        cachePolicy="memory-disk"
      />

      {/* NavBar（對齊幫助中心：icon9 返回 + 標題）*/}
      <View style={{
        position: "absolute", top: 0, left: 0, right: 0, zIndex: 10,
        height: insets.top + vw * 13.33,
        paddingTop: insets.top,
        paddingHorizontal: vw * 4,
        flexDirection: "row", alignItems: "center",
        backgroundColor: scrolled ? "rgba(0,0,0,0.7)" : "transparent",
      }}>
        <Pressable onPress={() => router.back()} style={{ marginRight: 12 }}>
          <Image source={IMG_BACK} style={{ width: 24, height: 24 }} contentFit="contain" />
        </Pressable>
        <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 20, fontWeight: "600" }}>公告詳情</Text>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color="#DE792D" />
        </View>
      ) : !item ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
          <Text allowFontScaling={false} style={{ color: "#FFFFFF60" }}>公告不存在</Text>
          <Pressable onPress={() => router.back()}>
            <Text allowFontScaling={false} style={{ color: "#DE792D" }}>返回</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          onScroll={(e) => setScrolled(e.nativeEvent.contentOffset.y > 50)}
          scrollEventThrottle={16}
          contentContainerStyle={{
            paddingTop: insets.top + vw * 13.33 + 12,
            paddingHorizontal: 16,
            paddingBottom: insets.bottom + 32,
          }}
        >
          {/* 標題行 */}
          <View style={{
            backgroundColor: "#000000", borderRadius: 8,
            borderWidth: 1, borderColor: "#434141",
            paddingHorizontal: 16, paddingVertical: 14, marginBottom: 10,
          }}>
            <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 12, marginBottom: 6 }}>
              {new Date(item.created_at).toLocaleString("zh-CN")}
            </Text>
            <Text allowFontScaling={false} style={{ color: "#fff", fontWeight: "700", fontSize: 18, lineHeight: 28 }}>
              {item.title}
            </Text>
          </View>

          {/* 正文 */}
          <View style={{
            backgroundColor: "#000000", borderRadius: 8,
            borderWidth: 1, borderColor: "#434141",
            paddingHorizontal: 16, paddingVertical: 14,
          }}>
            <Text allowFontScaling={false} style={{ fontSize: 15, lineHeight: 28, color: "#fff" }}>
              {item.content}
            </Text>
          </View>
        </ScrollView>
      )}
    </View>
  );
}


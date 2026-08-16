/* eslint-disable no-undef */
import { useState, useCallback } from "react";
import { View, Text, FlatList, Pressable, ActivityIndicator, useWindowDimensions } from "react-native";
import { useFocusEffect, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ChevronRight } from "lucide-react-native";
import { Image } from "expo-image";
import { getAllAnnouncements } from "@/db/api";
import type { Announcement } from "@/types/types";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// ─── 本地資源（對齊帮助中心）────────────────────────────────
const IMG_BACK = require("../../../assets/page-img/icon9.png");
const BG_IMG   = require("../../../assets/page-img/page_bg.webp");

function AnnouncementCard({ item }: { item: Announcement }) {
  return (
    <Pressable
      onPress={() => router.push(`/(app)/announcement-detail?id=${item.id}` as any)}
      style={{
        flexDirection: "row", alignItems: "center",
        minHeight: 48, backgroundColor: "#000000",
        borderRadius: 8, borderWidth: 1, borderColor: "#434141",
        paddingHorizontal: 16, paddingVertical: 12,
        marginBottom: 6, gap: 10,
      }}
    >
      <View style={{ flex: 1, gap: 4 }}>
        <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 16, fontWeight: "600", lineHeight: 22 }} numberOfLines={1}>
          {item.title}
        </Text>
        <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 13, lineHeight: 18 }} numberOfLines={2}>
          {item.content}
        </Text>
        <Text allowFontScaling={false} style={{ color: "#FFFFFF30", fontSize: 12, marginTop: 2 }}>
          {new Date(item.created_at).toLocaleDateString("zh-CN")}
        </Text>
      </View>
      <ChevronRight size={16} color="#FFFFFF25" />
    </Pressable>
  );
}

export default function AnnouncementsScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const vw = Math.min(width, 375) / 100;
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [scrolled, setScrolled] = useState(false);

  useFocusEffect(useCallback(() => {
    (async () => {
      setLoading(true);
      const data = await getAllAnnouncements();
      setItems(data);
      setLoading(false);
    })();
  }, []));

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
        <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 20, fontWeight: "800" }}>公告中心</Text>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color="#DE792D" />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(a) => a.id}
          showsVerticalScrollIndicator={false}
          onScroll={(e) => setScrolled(e.nativeEvent.contentOffset.y > 50)}
          scrollEventThrottle={16}
          contentContainerStyle={{
            paddingTop: insets.top + vw * 13.33 + 8,
            paddingHorizontal: 16,
            paddingBottom: insets.bottom + 32,
          }}
          ListEmptyComponent={
            <View style={{ alignItems: "center", paddingVertical: 80, gap: 12 }}>
              <Text allowFontScaling={false} style={{ fontSize: 48 }}>📢</Text>
              <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 14 }}>暫無公告</Text>
            </View>
          }
          renderItem={({ item }) => <AnnouncementCard item={item} />}
        />
      )}
    </View>
  );
}

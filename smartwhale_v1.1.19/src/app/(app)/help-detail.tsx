/* eslint-disable no-undef */
import { useState, useCallback } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator, useWindowDimensions } from "react-native";
import { useFocusEffect, router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { HelpCircle } from "lucide-react-native";
import { Image } from "expo-image";
import { getHelpArticleById } from "@/db/api";
import type { HelpArticle } from "@/types/types";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// ─── 本地資源 ─────────────────────────────────────────────────────────────────
const ICON9 = require("../../../assets/page-img/icon9.png");
const BG_IMG = require("../../../assets/page-img/page_bg.webp");

export default function HelpDetailScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const vw = Math.min(width, 375) / 100;
  const { id } = useLocalSearchParams<{ id: string }>();
  const [article, setArticle] = useState<HelpArticle | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    (async () => {
      setLoading(true);
      const data = await getHelpArticleById(id ?? "");
      setArticle(data);
      setLoading(false);
    })();
  }, [id]));

  return (
    <View style={{ flex: 1, backgroundColor: "#000000" }}>
      <StatusBar style="light" />

      {/* 全屏背景圖（與幫助中心一致）*/}
      <Image
        source={BG_IMG}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        contentFit="cover"
        contentPosition={{ top: 0, left: "50%" }}
        priority="high"
        cachePolicy="memory-disk"
      />

      {/* NavBar：absolute，高度 = insets.top + vw*13.33 */}
      <View style={{
        position: "absolute", top: 0, left: 0, right: 0, zIndex: 10,
        height: insets.top + vw * 13.33,
        paddingTop: insets.top,
        paddingHorizontal: vw * 4,
        flexDirection: "row", alignItems: "center",
        backgroundColor: "transparent",
      }}>
        <Pressable onPress={() => router.back()} style={{ marginRight: 12 }}>
          <Image source={ICON9} style={{ width: 24, height: 24 }} contentFit="contain" />
        </Pressable>
        <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 20, fontWeight: "600" }}>幫助詳情</Text>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color="#DE792D" />
        </View>
      ) : !article ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
          <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 16 }}>內容不存在</Text>
          <Pressable onPress={() => router.back()}>
            <Text allowFontScaling={false} style={{ color: "#DE792D", fontSize: 16 }}>返回</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingTop: insets.top + vw * 13.33 + 12,
            paddingHorizontal: 16,
            paddingBottom: insets.bottom + 32,
          }}
        >
          {/* 標題卡：黑底 + #434141 描邊，橙色 HelpCircle + 分類標籤 */}
          <View style={{
            backgroundColor: "#000000",
            borderRadius: 12, borderWidth: 1, borderColor: "#434141",
            paddingHorizontal: 16, paddingVertical: 16,
            marginBottom: 12,
          }}>
            {/* 分類標籤（橙色豎條樣式）*/}
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
              <View style={{ width: 5, height: 16, backgroundColor: "#DE792D", borderRadius: 3, marginRight: 8 }} />
              <Text allowFontScaling={false} style={{ color: "#DE792D", fontSize: 13, fontWeight: "600" }}>{article.category}</Text>
            </View>
            {/* 標題列（圖示 + 文字）*/}
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
              <HelpCircle size={20} color="#DE792D" style={{ marginTop: 2 }} />
              <Text allowFontScaling={false} style={{ flex: 1, color: "#fff", fontSize: 18, fontWeight: "700", lineHeight: 28 }}>
                {article.title}
              </Text>
            </View>
          </View>

          {/* 正文卡：黑底 + #434141 描邊 */}
          <View style={{
            backgroundColor: "#000000",
            borderRadius: 12, borderWidth: 1, borderColor: "#434141",
            paddingHorizontal: 16, paddingVertical: 16,
            marginBottom: 12,
          }}>
            <Text allowFontScaling={false} style={{ fontSize: 15, lineHeight: 26, color: "#fff" }}>
              {article.content}
            </Text>
          </View>

          {/* 聯絡客服卡 */}
          <View style={{
            backgroundColor: "#000000",
            borderRadius: 12, borderWidth: 1, borderColor: "#434141",
            paddingHorizontal: 16, paddingVertical: 14,
            flexDirection: "row", alignItems: "center", gap: 12,
          }}>
            <Text allowFontScaling={false} style={{ flex: 1, fontSize: 13, color: "#FFFFFF60" }}>
              還有疑問？聯絡在線客服
            </Text>
            <Pressable
              onPress={() => router.back()}
              style={{
                paddingHorizontal: 14, paddingVertical: 8,
                borderRadius: 8,
                backgroundColor: "rgba(222,121,45,0.15)",
                borderWidth: 1, borderColor: "rgba(222,121,45,0.4)",
              }}
            >
              <Text allowFontScaling={false} style={{ color: "#DE792D", fontSize: 13, fontWeight: "600" }}>聯絡客服</Text>
            </Pressable>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

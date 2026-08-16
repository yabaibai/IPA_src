/* eslint-disable no-undef */
import { useState, useCallback } from "react";
import { View, Text, SectionList, Pressable, ActivityIndicator, TextInput, useWindowDimensions } from "react-native";
import { useFocusEffect, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { HelpCircle } from "lucide-react-native";
import { Image } from "expo-image";
import { getHelpArticles } from "@/db/api";
import type { HelpArticle } from "@/types/types";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// ─── 本地資源（page-img 目錄）──────────────────────────────────────────────────
const IMGS: Record<string, ReturnType<typeof require>> = {
  "icon9.png":  require("../../../assets/page-img/icon9.png"),
  "icon10.png": require("../../../assets/page-img/icon10.png"),
  "bg13a.png":  require("../../../assets/page-img/bg13a.png"),
};
const IMG = (name: string) => IMGS[name];
const BG_IMG = require("../../../assets/page-img/page_bg.webp");

interface Section { title: string; data: HelpArticle[] }

function groupByCategory(articles: HelpArticle[]): Section[] {
  const map = new Map<string, HelpArticle[]>();
  for (const a of articles) {
    if (!map.has(a.category)) map.set(a.category, []);
    map.get(a.category)!.push(a);
  }
  return Array.from(map.entries()).map(([title, data]) => ({ title, data }));
}

export default function HelpCenterScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const vw = Math.min(width, 375) / 100;

  const [articles, setArticles] = useState<HelpArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [scrolled, setScrolled] = useState(false);

  useFocusEffect(useCallback(() => {
    (async () => {
      setLoading(true);
      const data = await getHelpArticles();
      setArticles(data);
      setLoading(false);
    })();
  }, []));

  const filtered = query.trim()
    ? articles.filter((a) =>
        a.title.includes(query) || a.content.includes(query) || a.category.includes(query)
      )
    : articles;

  // 有數據時用真實分類，無數據時用佔位分類
  const sections: Section[] = filtered.length > 0
    ? groupByCategory(filtered)
    : [
        { title: "P2P與轉賬", data: [] },
        { title: "充值與提現", data: [] },
        { title: "P2P與轉賬", data: [] },
      ];

  return (
    <View style={{ flex: 1, backgroundColor: "#000000" }}>
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

      {/* NavBar：absolute, height = insets.top + vw*13.33 */}
      <View style={{
        position: "absolute", top: 0, left: 0, right: 0, zIndex: 10,
        height: insets.top + vw * 13.33,
        paddingTop: insets.top,
        paddingHorizontal: vw * 4,
        flexDirection: "row", alignItems: "center",
        backgroundColor: scrolled ? "rgba(0,0,0,0.7)" : "transparent",
      }}>
        <Pressable onPress={() => router.back()} style={{ marginRight: 12 }}>
          <Image source={IMG("icon9.png")} style={{ width: 24, height: 24 }} contentFit="contain" />
        </Pressable>
        <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 20, fontWeight: "800" }}>幫助中心</Text>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color="#DE792D" />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(a, i) => a.id ?? String(i)}
          stickySectionHeadersEnabled={false}
          onScroll={(e) => setScrolled(e.nativeEvent.contentOffset.y > 50)}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingTop: insets.top + vw * 13.33,
            paddingHorizontal: 16,
            paddingBottom: insets.bottom + 32,
          }}
          ListHeaderComponent={
            /* 搜索框：bg13a.png 底圖 + icon10.png + TextInput */
            <View style={{ position: "relative", marginBottom: 12 }}>
              <Image source={IMG("bg13a.png")} style={{ width: "100%", aspectRatio: 343 / 44 }} contentFit="fill" />
              <View style={{
                position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
                flexDirection: "row", alignItems: "center",
                paddingHorizontal: 16, gap: 8,
              }}>
                <Image source={IMG("icon10.png")} style={{ width: 18, height: 18 }} contentFit="contain" />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="搜尋問題"
                  placeholderTextColor="#999"
                  underlineColorAndroid="transparent"
                  autoCorrect={false}
                  style={{
                    flex: 1, color: "#fff", fontSize: 16,
                    backgroundColor: "transparent",
                    outlineStyle: "none",
                  } as any}
                />
              </View>
            </View>
          }
          ListEmptyComponent={
            <View style={{ alignItems: "center", paddingVertical: 80, gap: 12 }}>
              <Text allowFontScaling={false} style={{ fontSize: 48 }}>🔍</Text>
              <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 14 }}>未找到相關內容</Text>
            </View>
          }
          renderSectionHeader={({ section }) => (
            /* .Help-title：橙色豎條 + 分類標題 */
            <View style={{
              flexDirection: "row", alignItems: "center",
              marginTop: 20, marginBottom: 8,
            }}>
              <View style={{
                width: 5, height: 16,
                backgroundColor: "#DE792D",
                borderRadius: 3, marginRight: 8,
              }} />
              <Text allowFontScaling={false} style={{ color: "#DE792D", fontSize: 16, fontWeight: "600" }}>
                {section.title}
              </Text>
            </View>
          )}
          renderItem={({ item, index }) => (
            /* .Help-list .item：黑底 #434141 描邊，minHeight 48 */
            <Pressable
              onPress={() => router.push(`/(app)/help-detail?id=${item.id}` as any)}
              style={{
                flexDirection: "row", alignItems: "center",
                minHeight: 48, backgroundColor: "#000000",
                borderRadius: 8, borderWidth: 1, borderColor: "#434141",
                paddingHorizontal: 16, paddingVertical: 12,
                marginTop: index === 0 ? 0 : 6, gap: 10,
              }}
            >
              <HelpCircle size={20} color="#999" />
              <Text allowFontScaling={false} style={{ flex: 1, color: "#fff", fontSize: 16, lineHeight: 22 }} numberOfLines={1}>
                {item.title}
              </Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

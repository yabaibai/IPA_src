/* eslint-disable no-undef */
/* eslint-disable */
// @ts-nocheck
import { useState, useEffect } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { router } from "expo-router";
import { getAllLevelConfigs } from "@/db/api";
import { getTierNumber, getTierInfo, type LevelConfig } from "@/types/types";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// ── 图片映射（Tab 背景图）────────────────────────────────
const IMGS: Record<string, ReturnType<typeof require>> = {
  "icon9.png":  require("../../../assets/page-img/icon9.png"),
  "bg14.png":   require("../../../assets/page-img/bg14.png"),  // 彩色选中态
  "bg15.png":   require("../../../assets/page-img/bg15.png"),  // "全部" 选中态
};

// ── 表头列配置 ────────────────────────────────────────────
const HEADERS = [
  { line1: "等级名称", line2: null },
  { line1: "升级费用", line2: "(SMT)" },
  { line1: "赠送能量", line2: null },
  { line1: "日产量",   line2: "(SMT)" },
  { line1: "总投入",   line2: "(SMT)" },
];

export default function UpgradeTableScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  // 设计稿基准 375px（与 style6 保持一致）
  const vw = Math.min(width, 375) / 100;

  const [configs, setConfigs]           = useState<LevelConfig[]>([]);
  const [loading, setLoading]           = useState(true);
  const [selectedTier, setSelectedTier] = useState<number | null>(null);
  const [tierNameMap, setTierNameMap]   = useState<Record<number, string>>({});
  const [scrolled, setScrolled]         = useState(false);

  useEffect(() => {
    (async () => {
      const data = await getAllLevelConfigs();
      setConfigs(data);
      // 构建 tier_number → tier_name 映射（供 Tab 按钮显示）
      const map: Record<number, string> = {};
      data.forEach((c) => {
        const t = getTierNumber(c.level);
        if (!map[t]) map[t] = c.tier_name;
      });
      setTierNameMap(map);
      setLoading(false);
    })();
  }, []);

  const filtered = selectedTier === null
    ? configs
    : configs.filter((c) => getTierNumber(c.level) === selectedTier);

  // Tab 按钮列表：全部 + 7个阶段
  const tabItems = [
    { t: null, label: "全部" },
    ...[1, 2, 3, 4, 5, 6, 7].map((t) => ({ t, label: tierNameMap[t] ?? `${t}阶` })),
  ];

  return (
    <View style={{ flex: 1, backgroundColor: "#000000" }}>
      <StatusBar style="light" />

      {/* ── NavBar ── */}
      <View style={{ paddingHorizontal: 16, paddingTop: insets.top + 12, paddingBottom: 8, flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Pressable onPress={() => router.back()} className="active:opacity-70">
          <Image source={IMGS["icon9.png"]} style={{ width: vw * 6, height: vw * 6 }} contentFit="contain" />
        </Pressable>
        <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 24, fontWeight: "800" }}>等級概覽</Text>
      </View>

      {/* ── Tab 筛选栏（style6：图片背景胶囊按钮）── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ maxHeight: vw * 15, marginBottom: vw * 3 }}
        contentContainerStyle={{ paddingHorizontal: vw * 4 }}
      >
        <View style={{
          flexDirection: "row", alignItems: "center",
          backgroundColor: "#000", borderRadius: vw * 26.67,
          borderWidth: 1, borderColor: "#7B7B7B",
          padding: vw * 2.13, gap: vw * 1.6,
        }}>
          {tabItems.map(({ t, label }, i) => {
            const isActive = selectedTier === t;
            return (
              <Pressable
                key={String(t)}
                onPress={() => setSelectedTier(t as number | null)}
                style={{ position: "relative" }}
              >
                {/* 选中态背景图 */}
                {isActive && (
                  <Image
                    source={i === 0 ? IMGS["bg15.png"] : IMGS["bg14.png"]}
                    style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: vw * 26.67 }}
                    contentFit="fill"
                  />
                )}
                <View style={{
                  paddingHorizontal: vw * 4, height: vw * 8.53,
                  borderRadius: vw * 26.67, alignItems: "center", justifyContent: "center",
                  borderWidth: isActive ? 0 : 1, borderColor: "#7B7B7B",
                }}>
                  <Text allowFontScaling={false} style={{ color: "#fff", fontSize: vw * 3.47 }}>{label}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      {/* ── 表格区（style6：#FBB551 金色边框 + 斑马行）── */}
      <View style={{ flex: 1, marginHorizontal: vw * 4 }}>
        {/* 表格外边框容器 */}
        <View style={{
          flex: 1,
          borderRadius: vw * 3.2,
          borderWidth: 1,
          borderColor: "#FBB551",
          overflow: "hidden",
        }}>
          {/* 表头 */}
          <View style={{
            flexDirection: "row",
            backgroundColor: "#000",
            height: vw * 12,
            alignItems: "center",
            borderBottomWidth: 1,
            borderBottomColor: "#FBB551",
          }}>
            {HEADERS.map(({ line1, line2 }, i) => (
              <View key={line1} style={{ flex: 1, alignItems: "center", paddingHorizontal: vw * 0.5 }}>
                <Text allowFontScaling={false} style={{ color: "#fff", fontSize: vw * 3, fontWeight: "600", textAlign: "center" }} numberOfLines={1}>
                  {line1}
                </Text>
                {line2 && (
                  <Text allowFontScaling={false} style={{ color: "#ccc", fontSize: vw * 2.5, textAlign: "center" }} numberOfLines={1}>
                    {line2}
                  </Text>
                )}
              </View>
            ))}
          </View>

          {/* 数据区 */}
          {loading ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#000" }}>
              <ActivityIndicator color="#FBB551" size="large" />
            </View>
          ) : (
            <ScrollView
              nestedScrollEnabled
              onScroll={(e) => setScrolled(e.nativeEvent.contentOffset.y > 50)}
              scrollEventThrottle={16}
              contentContainerStyle={{ paddingBottom: insets.bottom + vw * 4 }}
              showsVerticalScrollIndicator={false}
            >
              {filtered.map((c, idx) => {
                // 按 tier 取对应颜色（与 types.ts TIER_COLORS 一致）
                const tierInfo   = getTierInfo(c.level);
                const nameColor  = tierInfo.color;
                const isRebirth  = c.level === 56;
                const rowBg      = idx % 2 === 1 ? "rgba(49,48,48,0.52)" : "#000";

                return (
                  <View
                    key={c.level}
                    style={{
                      flexDirection: "row",
                      height: vw * 11.2,
                      alignItems: "center",
                      backgroundColor: rowBg,
                    }}
                  >
                    {/* 等级名称 — 白色 */}
                    <Text allowFontScaling={false}
                      style={{ flex: 1, color: "#fff", fontSize: vw * 3.2, fontWeight: "600",
                        textAlign: "center", paddingHorizontal: vw * 0.5 }}
                      numberOfLines={1}
                    >
                      {c.level_name ?? c.tier_name}{isRebirth ? "⚡" : ""}
                    </Text>
                    {/* 升级费用 — 白色 */}
                    <Text allowFontScaling={false}
                      style={{ flex: 1, color: "#fff", fontSize: vw * 3.2, fontWeight: "500", textAlign: "center" }}
                      numberOfLines={1}
                    >
                      {c.upgrade_cost === 0 ? "免费" : c.upgrade_cost.toLocaleString()}
                    </Text>
                    {/* 赠送能量 — 白色 */}
                    <Text allowFontScaling={false}
                      style={{ flex: 1, color: "#fff", fontSize: vw * 3.2, fontWeight: "500", textAlign: "center" }}
                      numberOfLines={1}
                    >
                      {c.upgrade_cost === 0 ? "-" : (c.bonus_energy ?? 0).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}
                    </Text>
                    {/* 日产量 — 金色 #FBB551（重点数据高亮） */}
                    <Text allowFontScaling={false}
                      style={{ flex: 1, color: "#FBB551", fontSize: vw * 3.2, fontWeight: "600", textAlign: "center" }}
                      numberOfLines={1}
                    >
                      {c.daily_yield}
                    </Text>
                    {/* 总投入 — 白色 */}
                    <Text allowFontScaling={false}
                      style={{ flex: 1, color: "#fff", fontSize: vw * 3.2, fontWeight: "500", textAlign: "center" }}
                      numberOfLines={1}
                    >
                      {c.total_investment.toLocaleString()}
                    </Text>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      </View>

      {/* 底部安全区留白 */}
      <View style={{ height: insets.bottom }} />
    </View>
  );
}

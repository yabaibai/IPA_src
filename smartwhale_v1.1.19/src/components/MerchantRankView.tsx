/* eslint-disable no-undef */
/**
 * 商戶榜單核心視圖組件 — UI 全面對齊 style008
 * - Stack 頁（(app)/merchant-rank.tsx）：hideBack=false，顯示返回按鈕
 * - 商戶 TabBar 直接顯示此組件：hideBack=true，隱藏返回按鈕
 */
import { useState, useCallback } from "react";
import { View, Text, FlatList, Pressable, ActivityIndicator, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { getMerchantRank } from "@/db/api";
import { MERCHANT_LEVEL_CONFIG, type MerchantRankItem, type MerchantLevel } from "@/types/types";

// ─── 图片资源（与 style008 完全一致）─────────────────────────────────────────
const IMG_BACK      = require("../../assets/page-img/icon9.png");
const IMG_PAGE_BG   = require("../../assets/page-img/page_bg.webp");
const IMG_BG17      = require("../../assets/page-img/bg17.png");
const IMG_BG17A     = require("../../assets/page-img/bg17a.png");
const IMG_TAB_ICON1 = require("../../assets/page-img/shzx_icon7.png");
const IMG_TAB_ICON2 = require("../../assets/page-img/shzx_icon8.png");
const IMG_RANK1     = require("../../assets/page-img/shzx_rank1.png");
const IMG_RANK2     = require("../../assets/page-img/shzx_rank2.png");
const IMG_RANK3     = require("../../assets/page-img/shzx_rank3.png");
const RANK_ICONS    = [IMG_RANK1, IMG_RANK2, IMG_RANK3];
const LEVEL_IMGS: Record<string, any> = {
  S33: require("../../assets/page-img/shzx_s33.png"),
  S3:  require("../../assets/page-img/shzx_s3.png"),
  S2:  require("../../assets/page-img/shzx_s2.png"),
  S1:  require("../../assets/page-img/shzx_s1.png"),
  S0:  require("../../assets/page-img/shzx_s0.png"),
};

type RankType = "amount" | "count";

function formatNum(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1) + "萬";
  return n.toLocaleString();
}

export default function MerchantRankView({ hideBack = false }: { hideBack?: boolean }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const vw = Math.min(width, 375) / 100;

  const [rankType, setRankType] = useState<RankType>("count");
  const [amountList, setAmountList] = useState<MerchantRankItem[]>([]);
  const [countList, setCountList]   = useState<MerchantRankItem[]>([]);
  const [loading, setLoading]       = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [a, c] = await Promise.all([getMerchantRank("amount", 10), getMerchantRank("count", 10)]);
    setAmountList(a);
    setCountList(c);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const list = rankType === "amount" ? amountList : countList;

  // ── Tab 切换栏（style008 风格 + 系统规范字号）───────────────────────
  const TabBar = () => (
    <View style={{ marginTop: vw * 3 }}>
      <View style={{ borderRadius: vw * 2.13, overflow: "hidden" }}>
        <Image source={IMG_BG17} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="cover" />
        <View style={{ flexDirection: "row", padding: vw * 2, gap: vw * 2.67 }}>
          {([
            { type: "count",  label: "交易笔数榜", icon: IMG_TAB_ICON1 },
            { type: "amount", label: "交易金额榜", icon: IMG_TAB_ICON2 },
          ] as { type: RankType; label: string; icon: any }[]).map((tab) => (
            <Pressable
              key={tab.type}
              onPress={() => setRankType(tab.type)}
              style={{ flex: 1, height: vw * 9.6, borderRadius: vw * 26.67, overflow: "hidden", alignItems: "center", justifyContent: "center" }}
              className="active:opacity-80"
            >
              {rankType === tab.type && (
                <Image source={IMG_BG17A} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="cover" />
              )}
              <View style={{ flexDirection: "row", alignItems: "center", gap: vw * 1.33, zIndex: 1 }}>
                <Image source={tab.icon} style={{ width: vw * 4.27, height: vw * 4.27 }} contentFit="contain" />
                <Text allowFontScaling={false} style={{ fontSize: 14, color: "#fff" }}>{tab.label}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );

  // ── 单行列表项（style008 风格 + 系统规范字号）────────────────────
  const renderRow = (item: MerchantRankItem, index: number, isLast: boolean) => {
    const level = item.merchant_level as MerchantLevel;
    const cfg   = MERCHANT_LEVEL_CONFIG[level] ?? MERCHANT_LEVEL_CONFIG.S0;
    const value = rankType === "amount" ? formatNum(item.total_trade_amount) : formatNum(item.total_trade_count);
    const levelImg = LEVEL_IMGS[level] ?? LEVEL_IMGS.S0;

    return (
      <View
        key={item.user_id}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: vw * 4,
          paddingVertical: vw * 1.5,
          borderBottomWidth: isLast ? 0 : 1,
          borderBottomColor: "rgba(123,123,123,0.2)",
        }}
      >
        {/* 左側：排名圖示/數字 + 等級圖 + 用戶名 */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: vw * 2.67, flex: 1 }}>
          {index < 3 ? (
            <Image source={RANK_ICONS[index]} style={{ width: vw * 8, height: vw * 8 }} contentFit="contain" />
          ) : (
            <View style={{ width: vw * 8, alignItems: "center" }}>
              <Text allowFontScaling={false} style={{ fontSize: 16, fontWeight: "bold", color: "#DE792D" }}>
                {String(index + 1).padStart(2, "0")}
              </Text>
            </View>
          )}
          <Image source={levelImg} style={{ width: vw * 15, height: vw * 15 }} contentFit="contain" />
          <View style={{ gap: vw * 0.53, flex: 1 }}>
            <Text allowFontScaling={false} numberOfLines={1} style={{ fontSize: 15, lineHeight: 20, color: "#fff" }}>{item.display_name}</Text>
            <Text allowFontScaling={false} style={{ fontSize: 13, lineHeight: 18, color: "#7B7B7B" }}>{cfg.name}</Text>
          </View>
        </View>
        {/* 右側：數值（單位已移至表頭） */}
        <Text allowFontScaling={false} style={{ fontSize: 16, fontWeight: "bold", color: "#DE792D" }}>{value}</Text>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#000000" }}>
      <StatusBar style="light" />

      {/* 全屏背景圖（style008 同款） */}
      <Image
        source={IMG_PAGE_BG}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        contentFit="cover"
        contentPosition={{ top: 0, left: "50%" }}
        priority="high"
        cachePolicy="memory-disk"
      />

      {/* NavBar（style008 同款） */}
      <View style={{ paddingHorizontal: 16, paddingTop: insets.top + 12, paddingBottom: 12, flexDirection: "row", alignItems: "center", gap: 12 }}>
        {!hideBack && (
          <Pressable onPress={() => router.back()} className="active:opacity-70">
            <Image source={IMG_BACK} style={{ width: vw * 6, height: vw * 6 }} contentFit="contain" />
          </Pressable>
        )}
        <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 20, fontWeight: "800" }}>商戶榜單</Text>
      </View>

      {/* 内容 FlatList */}
      <FlatList
        data={[{ key: "content" }]}
        keyExtractor={(item) => item.key}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 32 }}
        renderItem={() => (
          <>
            <TabBar />

            {/* 列表卡片（style008 同款：半透明黑底 + 灰色边框圆角） */}
            <View style={{
              marginTop: vw * 2,
              borderWidth: 1,
              borderColor: "rgba(123,123,123,0.5)",
              backgroundColor: "rgba(0,0,0,0.5)",
              borderRadius: vw * 2.13,
              overflow: "hidden",
            }}>
              {/* 表头 */}
              <View style={{
                flexDirection: "row",
                justifyContent: "space-between",
                paddingHorizontal: vw * 4,
                paddingVertical: vw * 3.2,
                borderBottomWidth: 1,
                borderBottomColor: "rgba(123,123,123,0.3)",
              }}>
                <Text allowFontScaling={false} style={{ fontSize: 14, lineHeight: 20, color: "#7B7B7B" }}>商戶</Text>
                <Text allowFontScaling={false} style={{ fontSize: 14, lineHeight: 20, color: "#7B7B7B" }}>
                  {rankType === "count" ? "累计笔数（笔）" : "累计金额（SMT）"}
                </Text>
              </View>

              {/* 加载中 */}
              {loading && (
                <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: vw * 10 }}>
                  <ActivityIndicator color="#DE792D" />
                </View>
              )}

              {/* 空状态 */}
              {!loading && list.length === 0 && (
                <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: vw * 10, gap: vw * 2 }}>
                  <Text allowFontScaling={false} style={{ fontSize: 15, lineHeight: 22, color: "#7B7B7B" }}>暫無上榜商戶</Text>
                  <Text allowFontScaling={false} style={{ fontSize: 13, lineHeight: 18, color: "#7B7B7B" }}>完成收款後即可上榜</Text>
                </View>
              )}

              {/* 列表行 */}
              {!loading && list.map((item, index) =>
                renderRow(item, index, index === list.length - 1)
              )}
            </View>
          </>
        )}
      />
    </View>
  );
}

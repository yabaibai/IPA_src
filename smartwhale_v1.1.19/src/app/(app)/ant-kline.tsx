/* eslint-disable no-undef */
import { useState, useCallback } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { useFocusEffect, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { TrendingUp, TrendingDown } from "lucide-react-native";
import Svg, { Rect, Line, Text as SvgText, G } from "react-native-svg";
import { getAntPrices } from "@/db/api";
import type { AntPrice } from "@/types/types";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAnimatedPrice } from "@/hooks/useAnimatedPrice";

// ── 本地圖片資源 ───────────────────────────────────────────────
const IMG_BACK       = require("../../../assets/page-img/icon9.png");
const BG_IMG         = require("../../../assets/page-img/page_bg.webp");
const IMG_CARD_BG    = require("../../../assets/page-img/market_card_bg.png");   // 行情展示区-底框 977×455
const IMG_KLINE_BG   = require("../../../assets/page-img/market_kline_bg.png");  // K线图底框 977×687
// IMG_LIST_BG 已移除，改為全代碼金色邊框+奇偶條紋

const CHART_WIDTH = 340;
const CHART_HEIGHT = 200;
const PADDING = { top: 16, bottom: 24, left: 48, right: 12 };

function KLineChart({ data }: { data: AntPrice[] }) {
  if (data.length < 2) return null;

  const prices = data.flatMap((d) => [d.high_price, d.low_price]);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const range = maxP - minP || 0.001;

  const W = CHART_WIDTH - PADDING.left - PADDING.right;
  const H = CHART_HEIGHT - PADDING.top - PADDING.bottom;
  const barW = Math.max(4, (W / data.length) - 2);

  const toX = (i: number) => PADDING.left + i * (W / data.length) + (W / data.length) / 2;
  const toY = (p: number) => PADDING.top + H - ((p - minP) / range) * H;

  const ticks = [0, 0.33, 0.67, 1].map((t) => minP + t * range);

  return (
    <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
      {ticks.map((tick) => {
        const y = toY(tick);
        return (
          <G key={tick}>
            <Line x1={PADDING.left} y1={y} x2={CHART_WIDTH - PADDING.right} y2={y} stroke="#FFFFFF25" strokeWidth={0.5} />
            <SvgText x={PADDING.left - 4} y={y + 4} textAnchor="end" fontSize={11} fill="#FFFFFFAA">
              {tick.toFixed(4)}
            </SvgText>
          </G>
        );
      })}
      {data.map((d, i) => {
        const x = toX(i);
        const up = d.close_price >= d.open_price;
        const color = up ? "#22C55E" : "#F43F5E";
        const bodyTop = toY(Math.max(d.open_price, d.close_price));
        const bodyBot = toY(Math.min(d.open_price, d.close_price));
        const bodyH = Math.max(1, bodyBot - bodyTop);
        return (
          <G key={d.id}>
            <Line x1={x} y1={toY(d.high_price)} x2={x} y2={toY(d.low_price)} stroke={color} strokeWidth={1} />
            <Rect x={x - barW / 2} y={bodyTop} width={barW} height={bodyH} fill={up ? color + "CC" : color} stroke={color} strokeWidth={0.5} rx={1} />
          </G>
        );
      })}
      {data.map((d, i) => {
        if (i % 5 !== 0) return null;
        return (
          <SvgText key={d.id + "x"} x={toX(i)} y={CHART_HEIGHT - 4} textAnchor="middle" fontSize={10} fill="#FFFFFFAA">
            {d.trade_date.slice(5)}
          </SvgText>
        );
      })}
    </Svg>
  );
}

export default function AntKlineScreen() {
  const insets = useSafeAreaInsets();
  const [prices, setPrices] = useState<AntPrice[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    const data = await getAntPrices(30);
    setPrices(data);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const latest = prices[prices.length - 1] ?? null;
  const prev   = prices[prices.length - 2] ?? null;

  const AnimatedText = Animated.createAnimatedComponent(Text);
  const { jsPrice, priceColor, dynChange } = useAnimatedPrice({
    closePrice: latest?.close_price ?? 0,
    highPrice:  latest?.high_price  ?? (latest?.close_price ?? 0) * 1.02,
    lowPrice:   latest?.low_price   ?? (latest?.close_price ?? 0) * 0.98,
    openPrice:  latest?.open_price  ?? prev?.close_price ?? 0,
  });
  const priceTextStyle = useAnimatedStyle(() => ({
    color: priceColor.value,
    fontSize: 28,        // Title Large 规格
    fontWeight: "900",
    fontFamily: "monospace",
    lineHeight: 36,
  }));
  const dynUp = dynChange >= 0;

  // 列表背景图使用 aspectRatio 自动计算高度，无需手动计算宽度

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <StatusBar style="light" />

      {/* 全屏背景圖 */}
      <Image source={BG_IMG} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="cover" contentPosition={{ top: 0, left: "50%" }} priority="high" cachePolicy="memory-disk" />

      {/* NavBar（對齊推廣獎勵頁風格）*/}
      <View style={{ paddingTop: insets.top + 12, paddingBottom: 12, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Pressable onPress={() => router.back()} className="active:opacity-70">
          <Image source={IMG_BACK} style={{ width: 24, height: 24 }} contentFit="contain" />
        </Pressable>
        <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 20, fontWeight: "800" }}>SMT 價格行情</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        {loading ? (
          <View style={{ alignItems: "center", paddingVertical: 80 }}>
            <ActivityIndicator size="large" color="#DE792D" />
          </View>
        ) : (
          <>
            {/* ── 當前價格卡（行情展示区-底框 977×455, ratio=2.147）── */}
            {/* 內容決定高度，底框圖片以 absoluteFill + contentFit="fill" 撑滿 */}
            <View style={{ marginHorizontal: 16, marginBottom: 12 }}>
              <View style={{ borderRadius: 12, overflow: "hidden" }}>
                {/* 底框：絕對鋪底，跟隨內容高度拉伸 */}
                <Image source={IMG_CARD_BG} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="fill" />
                {/* 內容區（決定整個卡片高度）*/}
                <View style={{ padding: 20 }}>
                  {/* Caption — SMT / USDT 副標 */}
                  <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 12, lineHeight: 18, marginBottom: 6 }}>SMT / USDT</Text>
                  {/* 價格主值 + 漲跌幅膠囊 */}
                  <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 12, marginBottom: 12 }}>
                    <AnimatedText style={priceTextStyle} numberOfLines={1}>
                      {latest ? jsPrice.toFixed(4) : "--"}
                    </AnimatedText>
                    <View style={{ marginBottom: 4, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: dynUp ? "#22C55E20" : "#F43F5E20" }}>
                      {dynUp ? <TrendingUp size={14} color="#22C55E" /> : <TrendingDown size={14} color="#F43F5E" />}
                      <Text allowFontScaling={false} style={{ color: dynUp ? "#22C55E" : "#F43F5E", fontWeight: "700", fontSize: 14, lineHeight: 20, fontFamily: "monospace" }}>
                        {dynUp ? "+" : ""}{dynChange.toFixed(2)}%
                      </Text>
                    </View>
                  </View>
                  {/* 開盤 / 最高 / 最低（Caption 規格）*/}
                  {latest && (
                    <View style={{ flexDirection: "row", gap: 12 }}>
                      {[
                        { label: "開盤", value: latest.open_price.toFixed(4) },
                        { label: "最高", value: latest.high_price.toFixed(4), color: "#22C55E" },
                        { label: "最低", value: latest.low_price.toFixed(4), color: "#F43F5E" },
                      ].map(({ label, value, color }) => (
                        <View key={label} style={{ flex: 1 }}>
                          <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 12, lineHeight: 18 }}>{label}</Text>
                          <Text allowFontScaling={false} style={{ color: color ?? "#FFFFFF80", fontSize: 13, lineHeight: 20, fontFamily: "monospace", marginTop: 2 }}>{value}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </View>
            </View>

            {/* ── K線圖卡（K线图底框 977×687, ratio=1.422）── */}
            <View style={{ marginHorizontal: 16, marginBottom: 12 }}>
              <View style={{ borderRadius: 12, overflow: "hidden" }}>
                <Image source={IMG_KLINE_BG} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="fill" />
                <View style={{ paddingTop: 16, paddingBottom: 12, paddingHorizontal: 8 }}>
                  {/* Caption — 圖表標題 */}
                  <Text allowFontScaling={false} style={{ color: "#FFFFFF80", fontSize: 14, lineHeight: 20, fontWeight: "600", paddingHorizontal: 12, marginBottom: 10 }}>日K線（近30天）</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <KLineChart data={prices} />
                  </ScrollView>
                </View>
              </View>
            </View>

            {/* ── 歷史列表（全代碼金色邊框 + 奇偶條紋）── */}
            <View style={{ marginHorizontal: 16, marginBottom: 8 }}>
              <View style={{
                borderRadius: 12,
                overflow: "hidden",
                borderWidth: 1,
                borderColor: "rgba(218,165,32,0.55)",   // 金色邊框
                backgroundColor: "#0A0A0A",              // 基底深色
              }}>
                {/* 頂部金色高光線 */}
                <View style={{ height: 1.5, backgroundColor: "rgba(218,165,32,0.4)" }} />

                {/* 表頭 */}
                <View style={{ flexDirection: "row", paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: "rgba(218,165,32,0.25)" }}>
                  {["日期", "開盤", "最高", "最低", "收盤"].map((h) => (
                    <Text allowFontScaling={false} key={h} style={{ flex: 1, color: "#E8C97A", fontSize: 14, fontWeight: "700", lineHeight: 20, textAlign: "center" }}>{h}</Text>
                  ))}
                </View>

                {/* 數據行 — 奇偶條紋 */}
                {[...prices].reverse().slice(0, 10).map((d, i) => {
                  const up = d.close_price >= d.open_price;
                  const stripeBg = i % 2 === 0 ? "rgba(0,0,0,0.6)" : "rgba(40,35,20,0.55)";
                  return (
                    <View key={d.id} style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 13, minHeight: 44, backgroundColor: stripeBg }}>
                      <Text allowFontScaling={false} style={{ flex: 1, color: "#FFFFFFB0", fontSize: 13, lineHeight: 20, textAlign: "center" }}>
                        {d.trade_date.slice(5)}
                      </Text>
                      {[d.open_price, d.high_price, d.low_price].map((v, vi) => (
                        <Text allowFontScaling={false} key={vi} style={{ flex: 1, color: "#FFFFFFB0", fontSize: 13, lineHeight: 20, textAlign: "center", fontFamily: "monospace" }}>
                          {v.toFixed(4)}
                        </Text>
                      ))}
                      <Text allowFontScaling={false} style={{ flex: 1, fontSize: 13, lineHeight: 20, textAlign: "center", fontWeight: "700", color: up ? "#22C55E" : "#F43F5E", fontFamily: "monospace" }}>
                        {d.close_price.toFixed(4)}
                      </Text>
                    </View>
                  );
                })}

                {/* 底部金色高光線 */}
                <View style={{ height: 1.5, backgroundColor: "rgba(218,165,32,0.4)" }} />
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

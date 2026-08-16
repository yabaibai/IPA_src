/* eslint-disable no-undef */
/**
 * 商戶中心核心視圖組件 — style009 UI 風格
 * - Stack 頁（(app)/merchant-center.tsx）：hideBack=false，顯示返回按鈕
 * - Tab 頁（(tabs)/merchant-center.tsx）  ：hideBack=true，隱藏返回按鈕
 */
import { useState, useCallback } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator, NativeScrollEvent, NativeSyntheticEvent, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from "react-native-reanimated";
import { ChevronLeft, ChevronRight, Coins } from "lucide-react-native";
import { useSession } from "@/ctx";
import { getProfile, getMerchantStats, getMerchantRewardTransactions, getMerchantLevelConfigs, type MerchantLevelConfigItem } from "@/db/api";
import { MERCHANT_LEVEL_CONFIG, type Profile, type MerchantStats, type Transaction, type MerchantLevel } from "@/types/types";

// ─── 图片资源 ────────────────────────────────────────────────────────────────
const IMG_BACK     = require("../../assets/page-img/icon9.png");
const IMG_PAGE_BG  = require("../../assets/page-img/page_bg.webp");
const IMG_BG1      = require("../../assets/page-img/shzx_bg1.png");
const IMG_BG2      = require("../../assets/page-img/shzx_bg2.png");
const IMG_BG3      = require("../../assets/page-img/shzx_bg3.png");
const IMG_BG4      = require("../../assets/page-img/shzx_bg4.png");
const IMG_BG5      = require("../../assets/page-img/shzx_bg5.png");
const IMG_BG6      = require("../../assets/page-img/shzx_bg6.png");
const IMG_WOSH_BG5 = require("../../assets/page-img/wosh_bg5.png");
const IMG_ICON1    = require("../../assets/page-img/shzx_icon1.png");
const IMG_ICON2    = require("../../assets/page-img/shzx_icon2.png");
const IMG_ICON3    = require("../../assets/page-img/shzx_icon3.png");
const IMG_ICON4    = require("../../assets/page-img/shzx_icon4.png");
const IMG_ICON5    = require("../../assets/page-img/shzx_icon5.png");
const IMG_ICON6    = require("../../assets/page-img/shzx_icon6.png");

// 等级图片映射
const LEVEL_ICONS: Record<string, any> = {
  S0:  require("../../assets/page-img/shzx_s0.png"),
  S1:  require("../../assets/page-img/shzx_s1.png"),
  S2:  require("../../assets/page-img/shzx_s2.png"),
  S3:  require("../../assets/page-img/shzx_s3.png"),
  S33: require("../../assets/page-img/shzx_s33.png"),
};

// ─── 样式常量 ─u2500──────────────────────────────────────────────────────────────────────────────────────────────
const CARD_RADIUS  = 16;
const CARD_PADDING = 16;
const CARD_GAP     = 16;
const MERCHANT_TAB_BAR_HEIGHT = 91; // 商户底部导航栏高度，避免内容被遮挡

// ─── 工具函数 ────────────────────────────────────────────────────────────────
const LEVEL_ORDER: MerchantLevel[] = ["S0", "S1", "S2", "S3", "S4"];

function formatNum(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1) + "万";
  return n.toLocaleString();
}

function formatDate(str: string): string {
  const d = new Date(str);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type MergedConfig = typeof MERCHANT_LEVEL_CONFIG[MerchantLevel] & { rewardRate: number; minCount: number; minAmount: number };
function buildDynamicConfig(levels: MerchantLevelConfigItem[]): Record<MerchantLevel, MergedConfig> {
  const result = { ...MERCHANT_LEVEL_CONFIG } as Record<MerchantLevel, MergedConfig>;
  levels.forEach((item) => {
    const lv = item.level as MerchantLevel;
    if (result[lv]) {
      result[lv] = { ...result[lv], rewardRate: item.rewardRate, minCount: item.minCount, minAmount: item.minAmount };
    }
  });
  return result;
}

// ─── BgCard：背景图片卡片（onLayout精确覆盖，修复Android裁剪） ───────────────
function BgCard({
  source, children, style, fit = "cover",
}: {
  source: any; children: React.ReactNode; style?: object; fit?: "cover" | "fill" | "contain";
}) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  return (
    <View
      style={[{ borderRadius: CARD_RADIUS, overflow: "hidden" }, style]}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setSize({ w: width, h: height });
      }}
    >
      {size.w > 0 && size.h > 0 && (
        <Image source={source} style={{ position: "absolute", top: 0, left: 0, width: size.w, height: size.h }} contentFit={fit} />
      )}
      {children}
    </View>
  );
}

// ─── ProgressBar：进度条组件 ─────────────────────────────────────────────────
function ProgressBar({ label, value, total }: { label: string; value: number; total: string }) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <View style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
        <Text allowFontScaling={false} style={{ fontSize: 12, color: "#7B7B7B" }}>{label}</Text>
        <Text allowFontScaling={false} style={{ fontSize: 12, color: "#7B7B7B" }}>{total}</Text>
      </View>
      <View style={{ height: 10, backgroundColor: "#444343", borderRadius: 5, overflow: "visible" }}>
        <View style={{ width: `${pct}%`, height: 10, borderRadius: 5, overflow: "hidden" }}>
          <Image source={IMG_BG3} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="cover" />
        </View>
        <View style={{
          position: "absolute", left: `${pct}%`, top: "50%",
          width: 16, height: 16, borderRadius: 8,
          backgroundColor: "#D9732A", borderWidth: 2, borderColor: "#fff",
          transform: [{ translateX: -8 }, { translateY: -8 }],
        }} />
      </View>
    </View>
  );
}

// ─── 主组件 ──────────────────────────────────────────────────────────────────
export default function MerchantCenterView({ hideBack = false }: { hideBack?: boolean }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const vw = Math.min(width, 375) / 100;
  const { session } = useSession();
  const userId = session?.user.id ?? "";

  const [profile, setProfile] = useState<Profile | null>(null);
  const [stats, setStats] = useState<MerchantStats | null>(null);
  const [rewards, setRewards] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [dynConfig, setDynConfig] = useState<Record<MerchantLevel, MergedConfig>>(() => buildDynamicConfig([]));

  // 獎勵明細分頁
  const REWARD_PAGE_SIZE = 10;
  const [rewardPage, setRewardPage] = useState(0);
  const [hasMoreRewards, setHasMoreRewards] = useState(true);
  const [loadingMoreRewards, setLoadingMoreRewards] = useState(false);

  const navBg = useSharedValue(0);
  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    navBg.value = withTiming(y > 50 ? 1 : 0, { duration: 200 });
  }, [navBg]);
  const navStyle = useAnimatedStyle(() => ({
    backgroundColor: `rgba(0,0,0,${0.7 * navBg.value})`,
  }));

  const loadRewards = useCallback(async (page = 0) => {
    if (!userId) return [];
    const offset = page * REWARD_PAGE_SIZE;
    const data = await getMerchantRewardTransactions(userId, REWARD_PAGE_SIZE, offset);
    return data;
  }, [userId]);

  const loadData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const [p, s, r, cfgResult] = await Promise.all([
      getProfile(userId),
      getMerchantStats(userId),
      loadRewards(0),
      getMerchantLevelConfigs(),
    ]);
    setProfile(p);
    setStats(s);
    setRewards(r);
    setRewardPage(0);
    setHasMoreRewards(r.length === REWARD_PAGE_SIZE);
    setDynConfig(buildDynamicConfig(cfgResult.levels));
    setLoading(false);
  }, [userId, loadRewards]);

  const loadMoreRewards = useCallback(async () => {
    if (loadingMoreRewards || !hasMoreRewards || !userId) return;
    setLoadingMoreRewards(true);
    const nextPage = rewardPage + 1;
    const data = await getMerchantRewardTransactions(userId, REWARD_PAGE_SIZE, nextPage * REWARD_PAGE_SIZE);
    setRewards(data);
    setRewardPage(nextPage);
    setHasMoreRewards(data.length === REWARD_PAGE_SIZE);
    setLoadingMoreRewards(false);
  }, [loadingMoreRewards, hasMoreRewards, userId, rewardPage]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const level = (profile?.merchant_level ?? "S0") as MerchantLevel;
  const cfg = dynConfig[level];
  const levelIcon = LEVEL_ICONS[level] ?? LEVEL_ICONS["S0"];

  // 晋升进度
  const curIdx = LEVEL_ORDER.indexOf(level);
  const nextLevel = LEVEL_ORDER[curIdx + 1] as MerchantLevel | undefined;
  const nextCfg = nextLevel ? dynConfig[nextLevel] : null;
  // 进度百分比：无数据/无下一级门槛时一律 0%（不再误显 100%）
  const countPct = (nextCfg && stats && nextCfg.minCount > 0)
    ? Math.round(Math.min(stats.total_trade_count / nextCfg.minCount, 1) * 100)
    : 0;
  const amountPct = (nextCfg && stats && nextCfg.minAmount > 0)
    ? Math.round(Math.min(stats.total_trade_amount / nextCfg.minAmount, 1) * 100)
    : 0;

  const NAV_HEIGHT = insets.top + 52;

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#000" }}>
        <ActivityIndicator color="#DE792D" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <StatusBar style="light" />

      {/* 全屏背景图 */}
      <Image
        source={IMG_PAGE_BG}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        contentFit="cover"
        contentPosition={{ top: 0, left: "50%" }}
        priority="high"
        cachePolicy="memory-disk"
      />

      {/* 滚动内容 */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: NAV_HEIGHT + 16,
          paddingHorizontal: 16,
          paddingBottom: insets.bottom + MERCHANT_TAB_BAR_HEIGHT + 24,
          gap: CARD_GAP,
        }}
        contentInsetAdjustmentBehavior="automatic"
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        {/* ── 商户信息卡片（按 987*642 同比例，宽度跟容器，高度 = width * 642/987 ── */}
        <BgCard source={IMG_BG2}>
          <View style={{ padding: CARD_PADDING, aspectRatio: 987 / 642, justifyContent: "flex-start", paddingTop: 12 }}>
            {/* 等级图 + 用户信息：顶部对齐 */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 12 }}>
              <Image source={levelIcon} style={{ width: 80, height: 80 }} contentFit="contain" />
              <View style={{ flex: 1, gap: 6 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Text allowFontScaling={false} style={{ fontSize: 18, color: "#E68331", fontWeight: "700" }}>{cfg.name}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", borderRadius: 999, paddingHorizontal: 10, height: 22, borderWidth: 1, borderColor: "#FF7E00" }}>
                    <Image source={IMG_ICON2} style={{ width: 13, height: 13, marginRight: 4 }} contentFit="contain" />
                    <Text allowFontScaling={false} style={{ fontSize: 12, color: "#E68331" }}>商户</Text>
                  </View>
                </View>
                <Text allowFontScaling={false} style={{ fontSize: 13, color: "#7B7B7B" }}>
                  申请时间：{profile?.merchant_apply_at ? formatDate(profile.merchant_apply_at) : "—"}
                </Text>
                {cfg.rewardRate > 0 && (
                  <Text allowFontScaling={false} style={{ fontSize: 13, color: "#7B7B7B" }}>
                    每笔收款奖励 <Text style={{ color: "#DE792D" }}>{(cfg.rewardRate * 100).toFixed(0)}% SMT</Text>
                  </Text>
                )}
              </View>
            </View>

            {/* 晋升进度 */}
            {nextLevel && nextCfg ? (
              <>
                <Text allowFontScaling={false} style={{ fontSize: 13, color: "#7B7B7B", marginBottom: 14 }}>
                  距晋升 <Text style={{ color: "#E68331" }}>{nextLevel} {nextCfg.name}</Text> 还需：
                </Text>
                <ProgressBar
                  label="收款笔数"
                  value={countPct}
                  total={`${stats?.total_trade_count ?? 0}/${nextCfg.minCount}`}
                />
                <ProgressBar
                  label="累计收款 (SMT)"
                  value={amountPct}
                  total={`${formatNum(stats?.total_trade_amount ?? 0)}/${formatNum(nextCfg.minAmount)}`}
                />
              </>
            ) : (
              <View style={{ marginTop: 8, padding: 12, borderRadius: 10, backgroundColor: "rgba(222,121,45,0.12)", borderWidth: 1, borderColor: "rgba(222,121,45,0.3)" }}>
                <Text allowFontScaling={false} style={{ color: "#E68331", fontWeight: "700", fontSize: 13 }}>🏆 已達最高等級</Text>
              </View>
            )}
          </View>
        </BgCard>

        {/* ── 等级体系（背景与奖励明细一致：黑色半透明+橙色边框） ── */}
        <View style={{
          borderWidth: 1, borderColor: "#DE792D",
          backgroundColor: "rgba(0,0,0,0.5)",
          borderRadius: CARD_RADIUS,
          padding: CARD_PADDING,
        }}>
          <Text allowFontScaling={false} style={{ fontSize: 15, fontWeight: "700", color: "#fff", marginBottom: 16 }}>等级体系</Text>
          {LEVEL_ORDER.filter((lv) => lv !== "S4").map((lv, index, arr) => {
            const lcfg = dynConfig[lv];
            const isActive = lv === level;
            const isLast = index === arr.length - 1;
            return (
              <View key={lv} style={{ flexDirection: "row", gap: 12 }}>
                <View style={{ alignItems: "center" }}>
                  <View style={{ width: 26, height: 26, borderRadius: 13, overflow: "hidden" }}>
                    <Image source={isActive ? IMG_BG5 : IMG_BG4} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="cover" />
                    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                      <Text allowFontScaling={false} style={{ fontSize: 11, fontWeight: "700", color: "#fff" }}>{lv}</Text>
                    </View>
                  </View>
                  {!isLast && (
                    <View style={{ width: 1, flex: 1, minHeight: 20, backgroundColor: "rgba(123,123,123,0.4)", marginVertical: 3 }} />
                  )}
                </View>
                <View style={{ flex: 1, paddingBottom: isLast ? 0 : 18 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 }}>
                    <Text allowFontScaling={false} style={{ fontSize: 14, fontWeight: "700", color: isActive ? "#DE792D" : "#fff" }}>{lcfg.name}</Text>
                    {lcfg.rewardRate > 0 && (
                      <Text allowFontScaling={false} style={{ fontSize: 12, color: isActive ? "#DE792D" : "#7B7B7B" }}>
                        收款奖励 {(lcfg.rewardRate * 100).toFixed(0)}%
                      </Text>
                    )}
                  </View>
                  {lv !== "S0" ? (
                    <Text allowFontScaling={false} style={{ fontSize: 12, color: "#7B7B7B" }}>
                      ≥{lcfg.minCount.toLocaleString()}笔・≥{formatNum(lcfg.minAmount)} SMT
                    </Text>
                  ) : (
                    <Text allowFontScaling={false} style={{ fontSize: 12, color: "#7B7B7B" }}>默认等级</Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>

        {/* ── 累计数据（双列） ── */}
        <View style={{ flexDirection: "row", gap: CARD_GAP }}>
          {[
            { icon: IMG_ICON3, value: stats ? formatNum(stats.total_trade_count) : "0", label: "累计收款笔数" },
            { icon: IMG_ICON4, value: stats ? formatNum(stats.total_trade_amount) : "0", label: "累计收款 (SMT)" },
          ].map((card, idx) => (
            <BgCard key={idx} source={IMG_WOSH_BG5} style={{ flex: 1 }} fit="fill">
              <View style={{ paddingVertical: 20, alignItems: "center" }}>
                <Image source={card.icon} style={{ width: 28, height: 28, marginBottom: 6 }} contentFit="contain" />
                <Text allowFontScaling={false} style={{ fontSize: 26, fontWeight: "700", color: "#DE792D" }}>{card.value}</Text>
                <Text allowFontScaling={false} style={{ fontSize: 12, color: "#7B7B7B", marginTop: 4 }}>{card.label}</Text>
              </View>
            </BgCard>
          ))}
        </View>

        {/* ── 累计奖励 ── */}
        <View style={{
          borderWidth: 1, borderColor: "#DE792D",
          backgroundColor: "rgba(0,0,0,0.5)",
          borderRadius: CARD_RADIUS,
          paddingVertical: 18, paddingHorizontal: CARD_PADDING,
          gap: 12,
        }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Image source={IMG_ICON5} style={{ width: 40, height: 40 }} contentFit="contain" />
            <Text allowFontScaling={false} style={{ fontSize: 15, color: "#fff" }}>累计获得 SMT 奖励</Text>
            <Text allowFontScaling={false} style={{ fontSize: 18, fontWeight: "700", color: "#DE792D", marginLeft: "auto" }}>
              {stats ? formatNum(stats.total_reward_ac) : "0"}
            </Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}>
              <Coins size={26} color="#EAB308" />
            </View>
            <Text allowFontScaling={false} style={{ fontSize: 15, color: "#fff" }}>累计获得奖励能量</Text>
            <Text allowFontScaling={false} style={{ fontSize: 18, fontWeight: "700", color: "#EAB308", marginLeft: "auto" }}>
              {stats ? (stats.total_reward_points ?? 0).toFixed(4) : "0"}
            </Text>
          </View>
        </View>

        {/* ── 奖励明细 ── */}
        <View style={{
          borderWidth: 1, borderColor: "#DE792D",
          backgroundColor: "rgba(0,0,0,0.5)",
          borderRadius: CARD_RADIUS,
          padding: CARD_PADDING,
        }}>
          <Text allowFontScaling={false} style={{ fontSize: 18, fontWeight: "700", color: "#fff", marginBottom: 20 }}>奖励明细</Text>
          {rewards.length === 0 ? (
            <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 28 }}>
              <Image source={IMG_ICON6} style={{ width: 48, height: 48, marginBottom: 12 }} contentFit="contain" />
              <Text allowFontScaling={false} style={{ fontSize: 14, color: "rgba(255,255,255,0.5)" }}>暂无奖励记录</Text>
              <Text allowFontScaling={false} style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginTop: 6 }}>收款后奖励将会实时发放并显示在此</Text>
            </View>
          ) : (
            <View>
              {rewards.map((tx, idx) => {
                // 左侧显示：订单ID（取后8位）+ 时间
                const shortId = tx.id.slice(-8).toUpperCase();
                return (
                  <View key={tx.id} style={{
                    flexDirection: "row", alignItems: "center",
                    paddingVertical: 14,
                    borderTopWidth: idx > 0 ? 1 : 0, borderTopColor: "rgba(255,255,255,0.08)",
                  }}>
                    <View style={{ flex: 1 }}>
                      <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 14 }} numberOfLines={1}>
                        订单 #{shortId}
                      </Text>
                      <Text allowFontScaling={false} style={{ color: "#7B7B7B", fontSize: 12, marginTop: 2 }}>
                        {formatDate(tx.created_at)}
                      </Text>
                    </View>
                    <Text allowFontScaling={false} style={{ color: "#22C55E", fontWeight: "700", fontSize: 15 }} numberOfLines={1}>+{tx.amount} SMT</Text>
                  </View>
                );
              })}
              {/* ── 分页控制（与推荐奖励页保持一致） ── */}
              {(hasMoreRewards || rewardPage > 0) && (
                <View style={{
                  flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                  marginTop: 12, paddingVertical: 10,
                  borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)",
                }}>
                  <Pressable
                    onPress={async () => {
                      if (rewardPage <= 0 || loadingMoreRewards) return;
                      setLoadingMoreRewards(true);
                      const prevPage = rewardPage - 1;
                      const data = await getMerchantRewardTransactions(userId, REWARD_PAGE_SIZE, prevPage * REWARD_PAGE_SIZE);
                      setRewards(data);
                      setRewardPage(prevPage);
                      setHasMoreRewards(data.length === REWARD_PAGE_SIZE);
                      setLoadingMoreRewards(false);
                    }}
                    disabled={rewardPage <= 0 || loadingMoreRewards}
                    style={{ flexDirection: "row", alignItems: "center", gap: 4, opacity: rewardPage <= 0 ? 0.35 : 1 }}
                    className="active:opacity-60"
                  >
                    <ChevronLeft size={14} color="#DE792D" />
                    <Text allowFontScaling={false} style={{ color: "#DE792D", fontSize: 13, fontWeight: "600" }}>上一页</Text>
                  </Pressable>
                  <Text allowFontScaling={false} style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>
                    {loadingMoreRewards ? "加载中…" : `第 ${rewardPage + 1} 页`}
                  </Text>
                  <Pressable
                    onPress={loadMoreRewards}
                    disabled={!hasMoreRewards || loadingMoreRewards}
                    style={{ flexDirection: "row", alignItems: "center", gap: 4, opacity: !hasMoreRewards ? 0.35 : 1 }}
                    className="active:opacity-60"
                  >
                    <Text allowFontScaling={false} style={{ color: "#DE792D", fontSize: 13, fontWeight: "600" }}>下一页</Text>
                    <ChevronRight size={14} color="#DE792D" />
                  </Pressable>
                </View>
              )}
            </View>
          )}
        </View>
      </ScrollView>

      {/* ── 顶部导航（悬浮，滚动渐变，已移除榜单入口） ── */}
      <Animated.View style={[{
        position: "absolute", top: 0, left: 0, right: 0, zIndex: 100,
        paddingHorizontal: 16, paddingTop: insets.top + 12, paddingBottom: 12,
        flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      }, navStyle]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          {!hideBack && (
            <Pressable onPress={() => router.back()} className="active:opacity-70">
              <Image source={IMG_BACK} style={{ width: vw * 6, height: vw * 6 }} contentFit="contain" />
            </Pressable>
          )}
          <Text allowFontScaling={false} style={{ fontSize: 20, fontWeight: "800", color: "#fff" }}>商户中心</Text>
        </View>
      </Animated.View>
    </View>
  );
}

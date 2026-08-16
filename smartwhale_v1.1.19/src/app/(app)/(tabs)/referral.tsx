/* eslint-disable no-undef */
import { useState, useCallback, useEffect, useRef } from "react";
import {
  View, Text, ScrollView, Pressable, ActivityIndicator, useWindowDimensions, StyleSheet,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ChevronRight, FileText, Gift } from "lucide-react-native";
import { useSession } from "@/ctx";
import { getProfile, getDirectReferrals, getIndirectReferrals, getReferralStats, getReferralEarnings, getReferralLevelConfigs, getTeamPoolSmtConsumption } from "@/db/api";
import { withTimeout } from "@/lib/asyncTool";
import { sharedGet } from "@/lib/requestDedup";
import { showToast } from "@/lib/toast";
import { supabase } from "@/client/supabase";
import { useTabData } from "@/db/tabData";
import { REFERRAL_LEVELS, type Profile, type ReferralRelationship, type ReferralLevelConfig } from "@/types/types";

// ─── 本地圖片資源 ────────────────────────────────────────
const BODY_BG = require("../../../../assets/page-img/page_bg.webp");
const IMG = (name: string) => {
  const map: Record<string, any> = {
    "bg29.png":   require("../../../../assets/page-img/bg29.png"),
    "bg30.png":   require("../../../../assets/page-img/bg30.png"),
    "bg31.png":   require("../../../../assets/page-img/bg31.png"),
    "bg32.png":   require("../../../../assets/page-img/bg32.png"),
    "bg33.png":   require("../../../../assets/page-img/bg33.png"),
    "bg34.png":   require("../../../../assets/page-img/bg34.png"),
    "bg35.png":   require("../../../../assets/page-img/bg35.png"),
    "bg36.png":   require("../../../../assets/page-img/bg36.png"),
    "bg37.png":   require("../../../../assets/page-img/bg37.png"),
    "icon21.png": require("../../../../assets/page-img/icon21.png"),
    "icon22.png": require("../../../../assets/page-img/icon22.png"),
    "icon23.png": require("../../../../assets/page-img/icon23.png"),
    "icon24.png": require("../../../../assets/page-img/icon24.png"),
    "icon25.png": require("../../../../assets/page-img/icon25.png"),
    "icon26.png": require("../../../../assets/page-img/icon26.png"),
    "icon27.png": require("../../../../assets/page-img/icon27.png"),
    "icon_direct.png":   require("../../../../assets/page-img/icon_direct.png"),
    "icon_indirect.png": require("../../../../assets/page-img/icon_indirect.png"),
    "icon_burn.png":     require("../../../../assets/page-img/icon_burn.png"),
    "icon_team.png":     require("../../../../assets/page-img/icon_team.png"),
    "list_border.png": require("../../../../assets/page-img/list_border.png"),
    "list_bg.png":     require("../../../../assets/page-img/list_bg.png"),
    "three_cond_bg.png": require("../../../../assets/page-img/three_cond_bg.png"),
  };
  return map[name];
};

// ─── 遠端圖片資源 ──────────────────────────────────────────────────
const TEAM_REWARD_BG = require("../../../../assets/page-img/team_frame.png");

// ─── BgBox（固定尺寸型）：图片拉伸，内容绝对定位 ─────────
function BgBox({
  bgSrc, bgStyle, children, style,
}: { bgSrc: any; bgStyle?: object; children: React.ReactNode; style?: object }) {
  return (
    <View style={[{ position: "relative" }, style]}>
      <ExpoImage source={bgSrc} style={[{ width: "100%" }, bgStyle]} contentFit="fill" />
      <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
        {children}
      </View>
    </View>
  );
}

// ─── BgBoxAuto（自撑高型）：背景绝对定位，内容正常流 ─────
function BgBoxAuto({
  bgSrc, children, style,
}: { bgSrc: any; children: React.ReactNode; style?: object }) {
  return (
    <View style={[{ position: "relative", overflow: "visible" }, style]}>
      <ExpoImage
        source={bgSrc}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        contentFit="fill"
      />
      {children}
    </View>
  );
}


export default function ReferralScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { session } = useSession();
  const userId = session?.user.id ?? "";

  // ── 设计规范 Token ───────────────────────────────────────
  const CARD_GAP = 12;
  const CARD_PAD_H = 16;
  const CARD_PAD_V = 16;
  const SUB_GAP = 8;
  const ICON_SM = 12;
  const ICON_MD = 18;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [_directReferrals, setDirectReferrals] = useState<ReferralRelationship[]>([]);
  const [_indirectReferrals, setIndirectReferrals] = useState<ReferralRelationship[]>([]);
  const [stats, setStats] = useState({ direct: 0, indirect: 0, validDirect: 0, validIndirect: 0 });
  const [earnings, setEarnings] = useState({ directEarnings: 0, indirectEarnings: 0, burnLoss: 0, promoEarnings: 0, promoSmtEarnings: 0, promoEnergyEarnings: 0, teamPoolSmtConsumption: 0 });
  const [teamPoolLoading, setTeamPoolLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [referralLevelConfigs, setReferralLevelConfigs] = useState<ReferralLevelConfig[]>([]);

  // ── 數據加載（統一引擎）──
  const fetchReferral = useCallback(async (force = false) => {
    try { await supabase.auth.getSession(); } catch { /* ignore */ }
    // 共用去重層：referral 全部接口為共享池（多 Tab 複用），僅登錄/手動刷新更新
    const get = (label: string, fn: () => Promise<any>) => sharedGet(label, fn, { force, shared: true });
    const [p, dr, ir, s, e] = await Promise.all([
      get("profile", () => getProfile(userId)),
      get("dr", () => getDirectReferrals(userId)),
      get("ir", () => getIndirectReferrals(userId)),
      get("stats", () => getReferralStats(userId)),
      get("earn", () => getReferralEarnings(userId)),
    ]);
    const rlc = await get("rlc", () => getReferralLevelConfigs());
    console.log('[TAB_DBG] referral rlc len=', Array.isArray(rlc) ? rlc.length : 'null', 'sample=', Array.isArray(rlc) && rlc[0] ? rlc[0].level_code : '-');
    return { p, dr, ir, s, e, rlc };
  }, [userId]);

  const applyReferral = useCallback((d: any) => {
    const { p, dr, ir, s, e, rlc } = d;
    if (p) setProfile(p);
    if (dr) setDirectReferrals(dr);
    if (ir) setIndirectReferrals(ir);
    if (s) setStats(s);
    if (e) setEarnings(e);
    if (rlc && rlc.length > 0) setReferralLevelConfigs(rlc);
  }, []);

  const { loadData, refresh, onEnter, onLeave } = useTabData({
    cacheKey: "referral:" + userId,
    fetch: fetchReferral,
    apply: applyReferral,
    onError: () => setLoadError(true),
    onLoading: (b) => setLoading(b),
    onFrequent: () => showToast("刷新過於頻密，請稍後再試"),
    hasData: () => profile != null,
    // profile 有效即视为有效缓存；p 为 null 时不当作命中 → 继续 fetch 自愈（与“我的”页一致）
    shouldCache: (d: any) => !!d.p,
  });

  useFocusEffect(useCallback(() => {
    if (userId) {
      onEnter();
      loadData();
    }
    return onLeave;
  }, [loadData, onEnter, onLeave, userId]));

  // 登录后 session 异步建立：进入本页时若 userId 尚为空，首次 loadData 用空 userId 发请求 → 数据全空。
  // 监听 userId 由空变非空，session 就绪后自动重载，修复「登录后首次进本页 ID/数据为空」时序竞态。
  useEffect(() => {
    if (userId) {
      onEnter();
      loadData();
    }
  }, [userId]);

  const calcCurrentLevel = (validDirect: number, validIndirect: number, dbConfigs: ReferralLevelConfig[]): string => {
    const sorted = [...dbConfigs].sort((a, b) => b.sort_order - a.sort_order);
    for (const cfg of sorted) {
      if (validDirect >= cfg.direct_count && validIndirect >= cfg.indirect_count) return cfg.level_code;
    }
    return "V1";
  };

  const currentLevel = referralLevelConfigs.length > 0
    ? calcCurrentLevel(stats.validDirect, stats.validIndirect, referralLevelConfigs)
    : REFERRAL_LEVELS.slice().reverse().find((l) => stats.validDirect >= l.direct && stats.validIndirect >= l.indirect)?.level ?? "V1";

  const currentLevelDbData = referralLevelConfigs.find((l) => l.level_code === currentLevel);
  const currentIdx = referralLevelConfigs.findIndex((l) => l.level_code === currentLevel);
  const nextLevelDbData = currentIdx >= 0 && currentIdx < referralLevelConfigs.length - 1
    ? referralLevelConfigs[currentIdx + 1]
    : null;
  const nextLevelHardcoded = REFERRAL_LEVELS[REFERRAL_LEVELS.findIndex((l) => l.level === currentLevel) + 1];

  const currentLevelName = currentLevelDbData?.level_name ?? currentLevel;
  const currentDirectReward = currentLevelDbData?.direct_reward_pct ?? (REFERRAL_LEVELS.find((l) => l.level === currentLevel)?.directReward ?? 30);
  const currentIndirectReward = currentLevelDbData?.indirect_reward_pct ?? (REFERRAL_LEVELS.find((l) => l.level === currentLevel)?.indirectReward ?? 25);
  const currentPromoReward = currentLevelDbData?.promo_reward_pct ?? 0;
  const currentPromoSmtReward = currentLevelDbData?.promo_smt_reward_pct ?? 0;

  // session 尚未就緒（userId 為空）：顯示「用戶信息校驗中…」而非空白/全空數據
  if (!userId) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" color="#E8520A" />
        <Text allowFontScaling={false} style={{ color: "#999", fontSize: 13, marginTop: 12 }}>用戶信息校驗中…</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" color="#E8520A" />
      </View>
    );
  }

  // 商戶賬號不可使用推廣中心
  if (profile?.is_merchant) {
    return (
      <View className="flex-1 bg-background items-center justify-center px-8">
        <StatusBar style="light" />
        <Text allowFontScaling={false} style={{ fontSize: 64 }}>🏪</Text>
        <Text allowFontScaling={false} className="text-xl font-bold text-foreground mt-4 mb-2 text-center">
          商戶賬號不可使用推廣中心
        </Text>
        <Text allowFontScaling={false} className="text-muted-foreground text-sm text-center leading-6">
          商戶賬號與推廣功能互斥。{"\n"}
          商戶享有0手續費轉賬與收款SMT獎勵權益，{"\n"}推廣功能永久不可用。
        </Text>
        <Pressable
          className="mt-6 py-3 px-10 rounded-xl items-center active:opacity-70"
          style={{ backgroundColor: "#22C55E20", borderWidth: 1, borderColor: "#22C55E50" }}
          onPress={() => router.push("/(app)/merchant-center" as any)}
        >
          <Text allowFontScaling={false} style={{ color: "#22C55E", fontWeight: "700", fontSize: 15 }}>前往商戶中心</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <StatusBar style="light" />
      {/* 全屏背景图 */}
      <ExpoImage
        source={BODY_BG}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        contentFit="cover"
        priority="high"
        cachePolicy="memory-disk"
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 120 }}
      >
        {loadError && (
          <Pressable onPress={() => loadData(true)} style={{ backgroundColor: "#3A1A0A", paddingVertical: 10, marginBottom: 8 }}>
            <Text style={{ color: "#FF8C42", fontSize: 13, textAlign: "center" }}>數據加載失敗，點擊重試</Text>
          </Pressable>
        )}
        {/* ── 顶部标题 ── */}
        <View style={{ paddingTop: insets.top, paddingBottom: 16, flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 24, fontWeight: "800" }}>推廣中心</Text>
          <Text allowFontScaling={false} style={{ color: "#E8520A", fontSize: 13 }}>邀請好友共享收益</Text>
        </View>

        {/* ── 区块1：推广收益总揽 ── */}
        <BgBoxAuto bgSrc={IMG("bg29.png")}>
          <View style={{ paddingHorizontal: CARD_PAD_H, paddingTop: CARD_PAD_V, paddingBottom: 20, gap: SUB_GAP + 4 }}>
            <Text allowFontScaling={false} style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "600" }}>
              推廣收益總覽
            </Text>
            <View style={{ flexDirection: "row", gap: SUB_GAP }}>
              {[
                { icon: "icon_direct.png",   label: "直推收益", value: earnings.directEarnings.toFixed(2) },
                { icon: "icon_indirect.png", label: "間推收益", value: earnings.indirectEarnings.toFixed(2) },
                { icon: "icon_burn.png",     label: "燒傷損失", value: earnings.burnLoss.toFixed(2) },
              ].map((item) => (
                <View key={item.label} style={{ flex: 1 }}>
                  <BgBox bgSrc={IMG("bg30.png")} bgStyle={{ aspectRatio: 1 }}>
                    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 4 }}>
                      <ExpoImage source={IMG(item.icon)} style={{ width: ICON_MD, height: ICON_MD }} contentFit="contain" />
                      <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 15, fontWeight: "700", fontFamily: "monospace" }}>
                        {item.value}
                      </Text>
                      <Text allowFontScaling={false} style={{ color: "#FFFFFF99", fontSize: 10 }}>{item.label}</Text>
                    </View>
                  </BgBox>
                </View>
              ))}
            </View>

            {/* 團隊獎勵行 */}
            <View style={{ position: "relative", paddingHorizontal: 14, paddingVertical: 10, gap: 8 }}>
              <ExpoImage source={TEAM_REWARD_BG} style={{ ...StyleSheet.absoluteFillObject, borderRadius: 12 }} contentFit="fill" />
              {[
                { label: "團隊獎勵（SMT）",  value: earnings.promoSmtEarnings.toFixed(2), isTeamPool: false },
                { label: "團隊獎勵（能量）", value: earnings.promoEnergyEarnings.toFixed(2), isTeamPool: false },
                { label: "團隊業績（SMT）", value: earnings.teamPoolSmtConsumption.toFixed(3), isTeamPool: true },
              ].map((item) => (
                <View key={item.label} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <ExpoImage source={IMG("icon_team.png")} style={{ width: 14, height: 14 }} contentFit="contain" />
                  <Text allowFontScaling={false} style={{ color: "#FFFFFF99", fontSize: 12, flex: 1 }}>{item.label}</Text>
                  {item.isTeamPool && teamPoolLoading ? (
                    <ActivityIndicator size="small" color="#E8520A" />
                  ) : (
                    <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 14, fontWeight: "700", fontFamily: "monospace" }}>
                      {item.value}
                    </Text>
                  )}
                </View>
              ))}
            </View>
          </View>
        </BgBoxAuto>

        {/* ── 区块2：我的团队 + 升级进度 ── */}
        <BgBoxAuto bgSrc={IMG("bg29.png")} style={{ marginTop: CARD_GAP }}>
          <View style={{ paddingHorizontal: CARD_PAD_H, paddingTop: CARD_PAD_V, paddingBottom: 30, gap: SUB_GAP + 4 }}>
            {/* 顶部数据行 */}
            <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text allowFontScaling={false} style={{ color: "#FFFFFF", fontSize: 13 }}>團隊總數</Text>
                <Text allowFontScaling={false} style={{ color: "#E8520A", fontSize: 28, fontWeight: "900", fontFamily: "monospace" }}>
                  {stats.direct + stats.indirect}
                </Text>
              </View>
              {[
                { val: currentLevelName,           label: "當前等級" },
                { val: `${currentDirectReward}%`,  label: "直推獎勵" },
                { val: `${currentIndirectReward}%`,label: "間推獎勵" },
              ].map((item) => (
                <View key={item.label} style={{ alignItems: "center", marginLeft: 20, gap: 2 }}>
                  <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 18, fontWeight: "900", fontFamily: "monospace" }}>{item.val}</Text>
                  <Text allowFontScaling={false} style={{ color: "#FFFFFF99", fontSize: 9 }}>{item.label}</Text>
                </View>
              ))}
            </View>

            {/* 4格统计 */}
            <View style={{ flexDirection: "row", gap: SUB_GAP }}>
              {[
                { val: stats.direct,        label: "直推人數" },
                { val: stats.validDirect,   label: "有效直推" },
                { val: stats.indirect,      label: "間推人數" },
                { val: stats.validIndirect, label: "有效間推" },
              ].map((item) => (
                <View key={item.label} style={{ flex: 1 }}>
                  <BgBox bgSrc={IMG("bg32.png")} bgStyle={{ aspectRatio: 1 }}>
                    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 3 }}>
                      <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 15, fontWeight: "700", fontFamily: "monospace" }}>{item.val}</Text>
                      <Text allowFontScaling={false} style={{ color: "#FFFFFF99", fontSize: 9 }}>{item.label}</Text>
                    </View>
                  </BgBox>
                </View>
              ))}
            </View>

            {/* 升级进度 */}
            {(nextLevelDbData ?? nextLevelHardcoded) && (() => {
              const nxt = nextLevelDbData
                ? { level: nextLevelDbData.level_code, direct: nextLevelDbData.direct_count, indirect: nextLevelDbData.indirect_count }
                : { level: nextLevelHardcoded!.level, direct: nextLevelHardcoded!.direct, indirect: nextLevelHardcoded!.indirect };
              const pct = nxt.direct > 0 ? Math.min((stats.validDirect / nxt.direct) * 100, 100) : 100;
              return (
                <>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text allowFontScaling={false} style={{ color: "#FFFFFF99", fontSize: 10 }} numberOfLines={1}>升級至 {nxt.level}</Text>
                    <Text allowFontScaling={false} style={{ color: "#FFFFFF99", fontSize: 10 }}>
                      還需有效直推 {Math.max(0, nxt.direct - stats.validDirect)} 人
                    </Text>
                    <Text allowFontScaling={false} style={{ color: "#FFFFFF99", fontSize: 10 }} numberOfLines={1}>
                      還需有效間推 {Math.max(0, nxt.indirect - stats.validIndirect)} 人
                    </Text>
                  </View>
                  <View style={{ height: 6, backgroundColor: "#444343", borderRadius: 3 }}>
                    <View style={{ width: `${pct}%`, height: "100%", backgroundColor: "#D9732A", borderRadius: 3 }}>
                      <View style={{
                        width: 12, height: 12, borderRadius: 6,
                        backgroundColor: "#D9732A", borderWidth: 2, borderColor: "#fff",
                        position: "absolute", right: -6, top: -3,
                        shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 2,
                      }} />
                    </View>
                  </View>
                </>
              );
            })()}

            {/* 推广明细 + 奖励记录按钮 */}
            <View style={{ flexDirection: "row", gap: SUB_GAP }}>
              <Pressable onPress={() => router.push("/(app)/referral-detail" as any)} style={{ flex: 1 }}>
                <BgBox bgSrc={IMG("bg33.png")} bgStyle={{ height: 40 }}>
                  <View style={{ flex: 1, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 }}>
                    <ExpoImage source={IMG("icon23.png")} style={{ width: ICON_SM, height: ICON_SM }} contentFit="contain" />
                    <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>推廣明細</Text>
                    <ChevronRight size={12} color="#FFFFFF60" />
                  </View>
                </BgBox>
              </Pressable>
              <Pressable onPress={() => router.push("/(app)/referral-rewards" as any)} style={{ flex: 1 }}>
                <BgBox bgSrc={IMG("bg34.png")} bgStyle={{ height: 40 }}>
                  <View style={{ flex: 1, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 }}>
                    <ExpoImage source={IMG("icon24.png")} style={{ width: ICON_SM, height: ICON_SM }} contentFit="contain" />
                    <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>獎勵記錄</Text>
                    <ChevronRight size={12} color="#FFFFFF60" />
                  </View>
                </BgBox>
              </Pressable>
            </View>
          </View>
        </BgBoxAuto>


        {/* ── 推廣等級收益表 ── */}
        <View style={{
          marginTop: CARD_GAP,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: "#C8922A",
          overflow: "hidden",
          paddingVertical: 0,
        }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 0, paddingHorizontal: 0 }}>
            <View style={{ minWidth: 488 }}>
              <View className="px-4 py-3 flex-row" style={{ backgroundColor: "#1A1200" }}>
                <Text allowFontScaling={false} style={{ color: "#FFFFFF", fontSize: 12, width: 56 }}>等級</Text>
                <Text allowFontScaling={false} style={{ color: "#FFFFFF", fontSize: 12, width: 80, textAlign: "center" }}>直推要求</Text>
                <Text allowFontScaling={false} style={{ color: "#FFFFFF", fontSize: 12, width: 80, textAlign: "center" }}>間推要求</Text>
                <Text allowFontScaling={false} style={{ color: "#FFFFFF", fontSize: 12, width: 80, textAlign: "center" }}>團隊（能量）</Text>
                <Text allowFontScaling={false} style={{ color: "#FFFFFF", fontSize: 12, width: 80, textAlign: "center" }}>團隊（SMT）</Text>
                <Text allowFontScaling={false} style={{ color: "#FFFFFF", fontSize: 12, width: 80, textAlign: "center" }}>直推獎勵</Text>
                <Text allowFontScaling={false} style={{ color: "#FFFFFF", fontSize: 12, width: 80, textAlign: "center" }}>間推獎勵</Text>
              </View>
              {/* 等级收益表：后端 referral_level_config 表可能为空（已实测返回 []），
                  用代码硬编码 REFERRAL_LEVELS 兜底，保证等级表始终可显示（与“升级进度”区块一致） */}
              {(() => {
                const displayLevels: any[] = referralLevelConfigs.length > 0
                  ? referralLevelConfigs
                  : REFERRAL_LEVELS.map((l) => ({
                      level_code: l.level,
                      direct_count: l.direct,
                      indirect_count: l.indirect,
                      direct_reward_pct: l.directReward,
                      indirect_reward_pct: l.indirectReward,
                      promo_reward_pct: 0,
                      promo_smt_reward_pct: 0,
                    }));
                return displayLevels.map((item, idx) => {
                const isCurrentLevel = item.level_code === currentLevel;
                // 奇偶交替：偶数行深黑，奇数行深灰
                const rowBg = isCurrentLevel ? "#E8520A20" : idx % 2 === 0 ? "#000000" : "#3A3A3A40";
                return (
                  <View key={item.level_code} className="px-4 py-3 flex-row items-center"
                    style={{
                      backgroundColor: rowBg,
                      borderLeftWidth: isCurrentLevel ? 3 : 0,
                      borderLeftColor: "#E8520A",
                    }}>
                    <View className="w-14 flex-row items-center gap-1">
                      <Text allowFontScaling={false} style={{ color: isCurrentLevel ? "#E8520A" : "#FFFFFF", fontWeight: isCurrentLevel ? "900" : "400" }}>
                        {item.level_code}
                      </Text>
                      {isCurrentLevel && (
                        <View className="px-1 py-0.5 rounded-full" style={{ backgroundColor: "#E8520A30" }}>
                          <Text allowFontScaling={false} style={{ color: "#E8520A", fontSize: 8, fontWeight: "700" }}>當前</Text>
                        </View>
                      )}
                    </View>
                    <Text allowFontScaling={false} className="text-xs w-20 text-center" style={{ color: "#FFFFFF" }}>{item.direct_count}人</Text>
                    <Text allowFontScaling={false} className="text-xs w-20 text-center" style={{ color: "#FFFFFF" }}>{item.indirect_count}人</Text>
                    {item.promo_reward_pct > 0 ? (
                      <Text allowFontScaling={false} className="text-xs w-20 text-center font-bold" style={{ color: "#FFFFFF" }}>{item.promo_reward_pct}%</Text>
                    ) : (
                      <Text allowFontScaling={false} className="text-xs w-20 text-center" style={{ color: "#FFFFFF40" }}>—</Text>
                    )}
                    {item.promo_smt_reward_pct > 0 ? (
                      <Text allowFontScaling={false} className="text-xs w-20 text-center font-bold" style={{ color: "#FFFFFF" }}>{item.promo_smt_reward_pct}%</Text>
                    ) : (
                      <Text allowFontScaling={false} className="text-xs w-20 text-center" style={{ color: "#FFFFFF40" }}>—</Text>
                    )}
                    <Text allowFontScaling={false} className="text-xs w-20 text-center font-bold" style={{ color: "#FFFFFF" }}>{item.direct_reward_pct}%</Text>
                    <Text allowFontScaling={false} className="text-xs w-20 text-center font-bold" style={{ color: "#FFFFFF" }}>{item.indirect_reward_pct}%</Text>
                  </View>
                );
                });
              })()}
            </View>
          </ScrollView>
        </View>

        {/* ── 区块4：有效推广三大条件 ── */}
        <BgBoxAuto bgSrc={IMG("three_cond_bg.png")} style={{ marginTop: CARD_GAP }}>
          <View style={{ paddingHorizontal: CARD_PAD_H, paddingVertical: CARD_PAD_V, gap: SUB_GAP + 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <ExpoImage source={IMG("icon26.png")} style={{ width: 14, height: 14 }} contentFit="contain" />
              <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>
                有效推廣三大條件（需同時滿足）
              </Text>
            </View>
            <View style={{ flexDirection: "row", gap: SUB_GAP }}>
              {[
                { icon: "icon21.png", label: "算力池\n已啟用",   sub: "①" },
                { icon: "icon21.png", label: "等級\n≥ 2 級",  sub: "②" },
                { icon: "icon22.png", label: "3天內\n有領取", sub: "③" },
              ].map((item) => (
                <View key={item.sub} style={{ flex: 1 }}>
                  <BgBox bgSrc={IMG("bg37.png")} bgStyle={{ aspectRatio: 1 }}>
                    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 4 }}>
                      <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: "#FFFFFF20", alignItems: "center", justifyContent: "center" }}>
                        <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 9, fontWeight: "800" }}>{item.sub}</Text>
                      </View>
                      <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 11, fontWeight: "700", textAlign: "center", lineHeight: 16 }}>
                        {item.label}
                      </Text>
                    </View>
                  </BgBox>
                </View>
              ))}
            </View>
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 5, paddingTop: SUB_GAP, borderTopWidth: 1, borderTopColor: "#FFFFFF15" }}>
              <ExpoImage source={IMG("icon27.png")} style={{ width: 12, height: 12, marginTop: 1 }} contentFit="contain" />
              <Text allowFontScaling={false} style={{ color: "#FFFFFF99", fontSize: 10, flexShrink: 1, lineHeight: 15 }}>
                超3天未領取 或 等级不足2级 将变为<Text style={{ color: "#fff", fontWeight: "600" }}>無效</Text>；滿足條件後下次領取時即刻恢復
              </Text>
            </View>
          </View>
        </BgBoxAuto>

        {/* ── 燒傷機制說明 ── */}
        <BgBoxAuto bgSrc={IMG("bg31.png")} style={{ marginTop: CARD_GAP }}>
          <View style={{ padding: 16 }}>
            <Text allowFontScaling={false} style={{ color: "#F43F5E", fontWeight: "700", fontSize: 13, marginBottom: 8 }}>⚠️ 燒傷機制</Text>
            <Text allowFontScaling={false} style={{ color: "#FFFFFF99", fontSize: 11, lineHeight: 20 }}>
              {"• 直推：上級算力池等級 > 下級等級時，正常領取直推獎勵\n• 間推：上級算力池等級 > 下級等級時，正常領取間推獎勵\n• 當上級算力池等級 ≤ 下級等級時，該次推廣收益全額燒傷，上級不得獎勵，斷檔期間收益不予補發"}
            </Text>
          </View>
        </BgBoxAuto>
      </ScrollView>
    </View>
  );
}

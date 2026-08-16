/* eslint-disable no-undef */
import { useState, useCallback } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator, useWindowDimensions, TextInput } from "react-native";
import { Image } from "expo-image";
import { useFocusEffect, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Flame, ChevronLeft, ChevronRight, Gift, Settings, ChevronDown, ChevronUp } from "lucide-react-native";
import { useSession } from "@/ctx";
import { getReferralRewardRecords, getReferralEarnings, getReferralRewardTabCounts, getActivityRewardConfig, updateActivityRewardConfig } from "@/db/api";
import type { Transaction } from "@/types/types";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAdminSession } from "@/hooks/useAdminSession";

// ── 累計收益匯總子卡 ─────────────────────────────────────────────────────────
function SummaryCard({
  label, value, unit, bg27,
}: { label: string; value: string; unit: string; bg27: ReturnType<typeof require> }) {
  return (
    <View style={{ width: 90, borderRadius: 8, overflow: "hidden", paddingVertical: 14, alignItems: "center", gap: 4, position: "relative" }}>
      <Image source={bg27} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="fill" />
      <Text allowFontScaling={false} style={{ color: "#FFFFFF99", fontSize: 11, lineHeight: 16, textAlign: "center" }} numberOfLines={1}>
        {label}
      </Text>
      <Text allowFontScaling={false} style={{ color: "#D16434", fontSize: 13, fontWeight: "700", lineHeight: 20 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
        {value}
      </Text>
      <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 10, lineHeight: 14 }}>{unit}</Text>
    </View>
  );
}
const IMGS: Record<string, ReturnType<typeof require>> = {
  "icon9.png":  require("../../../assets/page-img/icon9.png"),
  "bg27.png":   require("../../../assets/page-img/bg27.png"),
  "bg23.png":   require("../../../assets/page-img/bg23.png"),
};
const IMG = (name: string) => IMGS[name];

const BG_IMG = require("../../../assets/page-img/page_bg.webp");

const PAGE_SIZE = 20;

type TabKey = "all" | "direct" | "indirect" | "burned" | "promo";

/** 判斷記錄型別（type 優先，promo_reward 按 currency 區分能量/SMT） */
function getRecordTag(t: Transaction & { currency?: string }): {
  label: string; color: string; bgColor: string; kind: TabKey;
} {
  // 團隊獎勵：按 currency 區分
  if (t.type === "promo_reward") {
    if (t.currency === "SMT") {
      return { label: "團隊獎勵(SMT)", color: "#D16434", bgColor: "#D1643415", kind: "promo" };
    }
    return { label: "團隊獎勵(能量)", color: "#D16434", bgColor: "#D1643415", kind: "promo" };
  }
  const desc = t.description ?? "";
  // 活動奖励（烧伤）：優先識別，歸入燒傷 tab
  if (desc.includes("活动奖励烧伤")) {
    return { label: "活動·燒傷", color: "#F59E0B", bgColor: "#F59E0B15", kind: "burned" };
  }
  // 活動奖励（完成）：歸入直推 tab
  if (desc.includes("活动奖励")) {
    return { label: "活動奖励", color: "#22C55E", bgColor: "#22C55E15", kind: "direct" };
  }
  if (t.status === "burned") {
    return { label: "燒傷", color: "#D16434", bgColor: "#D1643415", kind: "burned" };
  }
  if (desc.includes("間推") || desc.includes("间推")) {
    return { label: "間推", color: "#D16434", bgColor: "#D1643415", kind: "indirect" };
  }
  return { label: "直推", color: "#D16434", bgColor: "#D1643415", kind: "direct" };
}

export default function ReferralRewardsScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const vw = Math.min(width, 375) / 100;
  const { session } = useSession();
  const userId = session?.user.id ?? "";
  const { admin, hasRole } = useAdminSession();
  const isAdmin = !!admin && hasRole("superadmin", "ops");

  // ── 活動奖励管理員配置狀態 ──────────────────────────────────────
  const [configExpanded, setConfigExpanded]   = useState(false);
  const [actEnabled, setActEnabled]           = useState(false);
  const [actAmount, setActAmount]             = useState("10");
  const [configLoading, setConfigLoading]     = useState(false);
  const [configSaving, setConfigSaving]       = useState(false);
  const [configSaveMsg, setConfigSaveMsg]     = useState<string | null>(null);

  const [records, setRecords] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState({ directEarnings: 0, indirectEarnings: 0, burnLoss: 0, promoEarnings: 0, promoSmtEarnings: 0, promoEnergyEarnings: 0 });
  // tabCounts: { all, direct, indirect, burned, points, promo }
  const [tabCounts, setTabCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [pageLoading, setPageLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [tab, setTab] = useState<TabKey>("all");
  const [page, setPage] = useState(1);

  const totalForTab = (t: TabKey) => tabCounts[t] ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalForTab(tab) / PAGE_SIZE));

  // 加載活動奖励配置（管理員展開時）
  const loadConfig = useCallback(async () => {
    if (!isAdmin) return;
    setConfigLoading(true);
    try {
      const cfg = await getActivityRewardConfig();
      setActEnabled(cfg.enabled);
      setActAmount(String(cfg.amount));
    } finally {
      setConfigLoading(false);
    }
  }, [isAdmin]);

  const handleConfigExpand = useCallback(() => {
    const next = !configExpanded;
    setConfigExpanded(next);
    if (next) loadConfig();
  }, [configExpanded, loadConfig]);

  const handleSaveConfig = useCallback(async () => {
    const amt = parseFloat(actAmount);
    if (isNaN(amt) || amt < 0) {
      setConfigSaveMsg("請輸入有效金額（≥ 0）");
      return;
    }
    setConfigSaving(true);
    setConfigSaveMsg(null);
    const { error } = await updateActivityRewardConfig(actEnabled, amt);
    setConfigSaving(false);
    setConfigSaveMsg(error ? `保存失敗：${error}` : "✅ 已保存");
    if (!error) setTimeout(() => setConfigSaveMsg(null), 3000);
  }, [actEnabled, actAmount]);

  const loadPage = useCallback(async (uid: string, t: TabKey, p: number) => {
    setPageLoading(true);
    try {
      const recs = await getReferralRewardRecords(uid, PAGE_SIZE, (p - 1) * PAGE_SIZE, t);
      setRecords(recs);
    } finally {
      setPageLoading(false);
    }
  }, []);

  const loadData = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    setLoading(true);
    setLoadError(false);
    try {
      const [recs, summ, counts] = await Promise.all([
        getReferralRewardRecords(userId, PAGE_SIZE, 0, "all"),
        getReferralEarnings(userId),
        getReferralRewardTabCounts(userId),
      ]);
      setRecords(recs);
      setSummary(summ);
      setTabCounts(counts);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useFocusEffect(useCallback(() => {
    loadData();
    setTab("all");
    setPage(1);
  }, [loadData]));

  const handleTabChange = useCallback(async (t: TabKey) => {
    setTab(t);
    setPage(1);
    await loadPage(userId, t, 1);
  }, [userId, loadPage]);

  const handlePageChange = useCallback(async (p: number) => {
    setPage(p);
    await loadPage(userId, tab, p);
  }, [userId, tab, loadPage]);

  const tabs: { key: TabKey; label: string; color: string }[] = [
    { key: "all",      label: "全部",   color: "#E8520A" },
    { key: "direct",   label: "直推",   color: "#E8520A" },
    { key: "indirect", label: "間推",   color: "#A855F7" },
    { key: "promo",    label: "團隊",   color: "#22C55E" },
    { key: "burned",   label: "燒傷",   color: "#F43F5E" },
  ];

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: "#000000" }}>
        <StatusBar style="light" />
        <Image source={BG_IMG} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="cover" priority="high" cachePolicy="memory-disk" />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color="#DE792D" />
        </View>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={{ flex: 1, backgroundColor: "#000000" }}>
        <StatusBar style="light" />
        <Image source={BG_IMG} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="cover" priority="high" cachePolicy="memory-disk" />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16, paddingHorizontal: 32 }}>
          <Text allowFontScaling={false} style={{ fontSize: 40 }}>⚠️</Text>
          <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 16, fontWeight: "600", textAlign: "center" }}>載入失敗</Text>
          <Text allowFontScaling={false} style={{ color: "#7B7B7B", fontSize: 14, textAlign: "center" }}>網路異常，請稍後重試</Text>
          <Pressable onPress={loadData} style={{ marginTop: 8, paddingHorizontal: 32, paddingVertical: 12, borderRadius: 8, backgroundColor: "#DE792D" }} className="active:opacity-70">
            <Text allowFontScaling={false} style={{ color: "#fff", fontWeight: "700" }}>重新載入</Text>
          </Pressable>
          <Pressable onPress={() => router.back()} className="active:opacity-70">
            <Text allowFontScaling={false} style={{ color: "#7B7B7B", fontSize: 14 }}>返回</Text>
          </Pressable>
        </View>
      </View>
    );
  }

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

      {/* NavBar：對齊 style11 */}
      <View style={{ paddingHorizontal: 16, paddingTop: insets.top + 12, paddingBottom: 12, flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Pressable onPress={() => router.back()} className="active:opacity-70">
          <Image source={IMG("icon9.png")} style={{ width: vw * 6, height: vw * 6 }} contentFit="contain" />
        </Pressable>
        <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 20, fontWeight: "800" }}>推廣獎勵</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 32 }}>

        {/* ── 管理員：活動奖励配置卡（僅 superadmin / ops 可見）── */}
        {isAdmin && (
          <View style={{
            marginBottom: 12,
            backgroundColor: "rgba(0,0,0,0.6)",
            borderRadius: 8,
            borderWidth: 1,
            borderColor: "rgba(209,100,52,0.4)",
            overflow: "hidden",
          }}>
            {/* 標題列 */}
            <Pressable
              onPress={handleConfigExpand}
              className="active:opacity-70"
              style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, gap: 8 }}
            >
              <Settings size={15} color="#DE792D" />
              <Text allowFontScaling={false} style={{ flex: 1, color: "#DE792D", fontSize: 13, fontWeight: "700", lineHeight: 20 }}>
                活動奖励配置
              </Text>
              {configExpanded
                ? <ChevronUp size={15} color="#DE792D" />
                : <ChevronDown size={15} color="#DE792D" />}
            </Pressable>

            {/* 展開內容 */}
            {configExpanded && (
              <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 12, borderTopWidth: 1, borderTopColor: "rgba(209,100,52,0.2)" }}>
                {configLoading ? (
                  <View style={{ paddingVertical: 16, alignItems: "center" }}>
                    <ActivityIndicator size="small" color="#DE792D" />
                  </View>
                ) : (
                  <>
                    {/* 開關 */}
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 12 }}>
                      <View style={{ gap: 2 }}>
                        <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 13, fontWeight: "600", lineHeight: 20 }}>
                          啟用活動奖励
                        </Text>
                        <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 11, lineHeight: 16 }}>
                          下級首次達到3級時向上級發放固定 SMT
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => setActEnabled(v => !v)}
                        className="active:opacity-70"
                        style={{
                          width: 48, height: 26, borderRadius: 13,
                          backgroundColor: actEnabled ? "#22C55E" : "rgba(255,255,255,0.15)",
                          justifyContent: "center",
                          paddingHorizontal: 3,
                        }}
                      >
                        <View style={{
                          width: 20, height: 20, borderRadius: 10,
                          backgroundColor: "#fff",
                          alignSelf: actEnabled ? "flex-end" : "flex-start",
                        }} />
                      </Pressable>
                    </View>

                    {/* 金額輸入 */}
                    <View style={{ gap: 6 }}>
                      <Text allowFontScaling={false} style={{ color: "#FFFFFF99", fontSize: 12, lineHeight: 18 }}>
                        奖励金額（SMT）
                      </Text>
                      <View style={{
                        flexDirection: "row", alignItems: "center",
                        backgroundColor: "rgba(255,255,255,0.06)",
                        borderWidth: 1, borderColor: "rgba(123,123,123,0.4)",
                        borderRadius: 8, paddingHorizontal: 12,
                      }}>
                        <TextInput
                          value={actAmount}
                          onChangeText={setActAmount}
                          keyboardType="numeric"
                          placeholder="0"
                          placeholderTextColor="#FFFFFF30"
                          style={[
                            { flex: 1, color: "#fff", fontSize: 14, paddingVertical: 10 },
                            process.env.EXPO_OS === "web" ? { outlineWidth: 0 } as any : undefined,
                          ]}
                          underlineColorAndroid="transparent"
                        />
                        <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 13, fontWeight: "600" }}>SMT</Text>
                      </View>
                    </View>

                    {/* 保存按鈕 + 反饋 */}
                    <Pressable
                      onPress={handleSaveConfig}
                      disabled={configSaving}
                      className="active:opacity-70"
                      style={{
                        paddingVertical: 10, borderRadius: 8,
                        backgroundColor: configSaving ? "rgba(209,100,52,0.4)" : "#DE792D",
                        alignItems: "center",
                      }}
                    >
                      <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>
                        {configSaving ? "保存中…" : "保存配置"}
                      </Text>
                    </Pressable>
                    {configSaveMsg && (
                      <Text allowFontScaling={false} style={{
                        color: configSaveMsg.startsWith("✅") ? "#22C55E" : "#F43F5E",
                        fontSize: 12, textAlign: "center", lineHeight: 18,
                      }}>
                        {configSaveMsg}
                      </Text>
                    )}
                  </>
                )}
              </View>
            )}
          </View>
        )}

        {/* ── Tab 導航（膠囊樣式，100% 全寬等分）── */}
        <View style={{
          flexDirection: "row",
          borderWidth: 1,
          borderColor: "#7B7B7B",
          borderRadius: 44,
          overflow: "hidden",
          height: 44,
        }}>
          {tabs.map(({ key, label }) => {
            const isActive = tab === key;
            return (
              <Pressable
                key={key}
                onPress={() => handleTabChange(key)}
                style={{
                  flex: 1,
                  height: 44,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: isActive ? "rgba(209,100,52,0.2)" : "transparent",
                }}
              >
                <Text allowFontScaling={false} style={{
                  fontSize: 14,
                  lineHeight: 20,
                  color: isActive ? "#fff" : "#7B7B7B",
                  fontWeight: isActive ? "600" : "400",
                }}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* ── Tab 內容列表 ── */}
        <View style={{
          marginTop: 12,
          backgroundColor: "rgba(0,0,0,0.5)",
          borderRadius: 8,
          borderWidth: 1,
          borderColor: "rgba(123,123,123,0.5)",
          paddingHorizontal: 12,
          minHeight: 120,
        }}>
          {pageLoading ? (
            <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 40, gap: 8 }}>
              <ActivityIndicator size="small" color="#DE792D" />
              <Text allowFontScaling={false} style={{ color: "#FFFFFF99", fontSize: 13, lineHeight: 20 }}>載入中…</Text>
            </View>
          ) : records.length === 0 ? (
            <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 40, gap: 8 }}>
              <Gift size={36} color="#7B7B7B" />
              <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 14, fontWeight: "600", lineHeight: 22 }}>暫無推廣獎勵記錄</Text>
              <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 13, lineHeight: 20, textAlign: "center" }}>
                邀請下級激活並收益後，獎勵將自動發放
              </Text>
            </View>
          ) : (
            <>
              {records.map((t, idx) => {
                const tag = getRecordTag(t as Transaction & { currency?: string });
                const isBurned = t.status === "burned";
                return (
                  <View
                    key={t.id}
                    style={{
                      flexDirection: "row", alignItems: "center",
                      paddingVertical: 12,
                      borderBottomWidth: idx < records.length - 1 ? 1 : 0,
                      borderBottomColor: "rgba(255,255,255,0.08)",
                    }}
                  >
                    <View style={{ flex: 1, gap: 3 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <View style={{
                          paddingHorizontal: 7, paddingVertical: 2, borderRadius: 99,
                          backgroundColor: tag.bgColor, borderWidth: 1, borderColor: tag.color + "40",
                        }}>
                          <Text allowFontScaling={false} style={{ color: tag.color, fontSize: 12, fontWeight: "700", lineHeight: 18 }}>{tag.label}</Text>
                        </View>
                        {isBurned && <Flame size={11} color="#CF5C6A" />}
                      </View>
                      <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 13, lineHeight: 20 }} numberOfLines={1}>
                        {t.description ?? "-"}
                      </Text>
                      <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 12, lineHeight: 18 }}>
                        {new Date(t.created_at).toLocaleDateString("zh-CN", { year: "2-digit", month: "2-digit", day: "2-digit" })}
                        {" "}
                        {new Date(t.created_at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 2 }}>
                      <Text allowFontScaling={false} style={{
                        fontSize: 15, fontWeight: "700", lineHeight: 22,
                        color: "#22C55E",
                      }}>
                        {isBurned ? "-" : "+"}{Number(t.amount).toFixed(tag.kind === "promo" ? 2 : 4)}
                      </Text>
                      <Text allowFontScaling={false} style={{ color: "#FFFFFF99", fontSize: 12, lineHeight: 18, fontWeight: "600" }}>
                        {tag.kind === "promo"
                          ? ((t as any).currency === "SMT" ? "SMT" : "能量")
                          : (t as any).currency ?? "SMT"}
                      </Text>
                    </View>
                  </View>
                );
              })}

              {/* 底部彙總 */}
              <View style={{
                flexDirection: "row", justifyContent: "space-between", alignItems: "center",
                paddingVertical: 10,
                borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)",
              }}>
                <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 12, lineHeight: 18 }}>
                  共 {totalForTab(tab).toLocaleString()} 條 · 第 {page}/{totalPages} 頁
                </Text>
                {tab === "promo" ? (
                  <View style={{ alignItems: "flex-end", gap: 2 }}>
                    <Text allowFontScaling={false} style={{ color: "#22C55E", fontSize: 13, lineHeight: 20, fontWeight: "600" }}>團隊 SMT +{summary.promoSmtEarnings.toFixed(2)}</Text>
                    <Text allowFontScaling={false} style={{ color: "#22C55E", fontSize: 13, lineHeight: 20, fontWeight: "600" }}>團隊能量 +{summary.promoEnergyEarnings.toFixed(2)}</Text>
                  </View>
                ) : tab === "burned" ? (
                  <Text allowFontScaling={false} style={{ color: "#F43F5E", fontSize: 13, lineHeight: 20, fontWeight: "600" }}>損失 {summary.burnLoss.toFixed(2)} SMT</Text>
                ) : (
                  <Text allowFontScaling={false} style={{ color: "#22C55E", fontSize: 13, lineHeight: 20, fontWeight: "600" }}>
                    實得 {(tab === "direct"
                      ? summary.directEarnings
                      : tab === "indirect"
                        ? summary.indirectEarnings
                        : summary.directEarnings + summary.indirectEarnings
                    ).toFixed(4)} SMT
                  </Text>
                )}
              </View>
            </>
          )}
        </View>

        {/* ── 分頁控制 ── */}
        {totalPages > 1 && (
          <View style={{
            marginTop: 12,
            flexDirection: "row", alignItems: "center", justifyContent: "space-between",
            paddingHorizontal: 16, paddingVertical: 12,
            backgroundColor: "rgba(0,0,0,0.5)",
            borderRadius: 8,
            borderWidth: 1, borderColor: "rgba(123,123,123,0.5)",
          }}>
            <Pressable
              onPress={() => handlePageChange(Math.max(1, page - 1))}
              disabled={page <= 1 || pageLoading}
              style={{ flexDirection: "row", alignItems: "center", gap: 4, opacity: page <= 1 ? 0.4 : 1 }}
              className="active:opacity-60"
            >
              <ChevronLeft size={14} color="#DE792D" />
              <Text allowFontScaling={false} style={{ color: "#DE792D", fontSize: 13, lineHeight: 20, fontWeight: "600" }}>上一頁</Text>
            </Pressable>
            <Text allowFontScaling={false} style={{ color: "#FFFFFF99", fontSize: 13, lineHeight: 20 }}>{page} / {totalPages}</Text>
            <Pressable
              onPress={() => handlePageChange(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages || pageLoading}
              style={{ flexDirection: "row", alignItems: "center", gap: 4, opacity: page >= totalPages ? 0.4 : 1 }}
              className="active:opacity-60"
            >
              <Text allowFontScaling={false} style={{ color: "#DE792D", fontSize: 13, lineHeight: 20, fontWeight: "600" }}>下一頁</Text>
              <ChevronRight size={14} color="#DE792D" />
            </Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

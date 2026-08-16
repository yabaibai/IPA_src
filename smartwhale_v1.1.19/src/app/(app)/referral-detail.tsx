/* eslint-disable no-undef */
import { useState, useCallback } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator, TextInput, KeyboardAvoidingView, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { useFocusEffect, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react-native";
import { useSession } from "@/ctx";
import { getDirectReferrals, getIndirectReferrals, getReferralStats } from "@/db/api";
import type { ReferralRelationship } from "@/types/types";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// ─── 本地資源 ─────────────────────────────────────────────────────────────────
const IMG_BACK            = require("../../../assets/page-img/icon9.png");
const IMG_PAGE_BG         = require("../../../assets/page-img/page_bg.webp");
const IMG_LIST_BG         = require("../../../assets/page-img/list_bottom_bg.png");
const IMG_TAB_SEL_LEFT    = require("../../../assets/page-img/tab_selected_left.png");
const IMG_TAB_SEL_RIGHT   = require("../../../assets/page-img/tab_selected_right.png");

// ─── 顏色常量（對齊 account-settings）────────────────────────────────────────
const OG2      = "#DE792D";
const MUTED    = "#999999";
const BORDER   = "rgba(123,123,123,0.5)";
const FIELD_BG = "rgba(0,0,0,0.5)";

const PAGE_SIZE = 20;

// ─── 搜尋框（帶 focus 高亮，對齊交易密碼頁）────────────────────────────────
function SearchBox({ value, onChange, onClear }: { value: string; onChange: (v: string) => void; onClear: () => void }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{
      flexDirection: "row", alignItems: "center", gap: 8,
      backgroundColor: FIELD_BG,
      borderWidth: 1, borderColor: focused ? OG2 : BORDER,
      borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12, marginBottom: 12,
    }}>
      <Search size={15} color={focused ? OG2 : MUTED} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="搜尋手機號 / 郵箱 / ID號"
        placeholderTextColor={MUTED}
        underlineColorAndroid="transparent"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          { flex: 1, color: "#fff", fontSize: 12, padding: 0, margin: 0 },
          process.env.EXPO_OS === "web" ? { outlineWidth: 0, outlineStyle: "none" } as any : undefined,
        ]}
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
      />
      {value.length > 0 && (
        <Pressable onPress={onClear} className="active:opacity-60">
          <X size={14} color={MUTED} />
        </Pressable>
      )}
    </View>
  );
}

/** 計算會員有效性標籤（有效條件：啟用 + 3天內收益 + 等級 >= 3）*/
function getValidityTag(r: ReferralRelationship): { label: string; color: string; reason?: string } {
  if (r.is_valid) return { label: "有效", color: "#22C55E" };
  const pool = r.pool_info;
  if (!pool || !pool.is_active) {
    return { label: "未啟用", color: "#F43F5E", reason: "算力池尚未啟用" };
  }
  if ((pool.level ?? 0) < 3) {
    return { label: "等級不足", color: "#F97316", reason: `當前 Lv.${pool.level ?? 0}，需升至 Lv.3` };
  }
  if (!pool.last_claimed_at) {
    return { label: "未收益", color: "#F97316", reason: "從未收取收益" };
  }
  const daysSince = (Date.now() - new Date(pool.last_claimed_at).getTime()) / 86400000;
  if (daysSince > 3) {
    return { label: "已過期", color: "#F97316", reason: `${Math.floor(daysSince)} 天未領取` };
  }
  return { label: "無效", color: "#F43F5E" };
}

/** 脫敏手機號：138****5678 */
function maskPhone(phone: string): string {
  return phone.replace(/(\d{3})\d+(\d{2})$/, "$1****$2");
}

/** 脫敏郵箱：ab***@gmail.com */
function maskEmail(email: string): string {
  const atIdx = email.indexOf("@");
  if (atIdx <= 1) return email;
  const local = email.slice(0, atIdx);
  const domain = email.slice(atIdx);
  const prefix = local.length > 2 ? local.slice(0, 2) : local.slice(0, 1);
  return prefix + "***" + domain;
}

/** 取得聯絡顯示文字（含脫敏邏輯） */
function getContactDisplay(u: {
  phone?: string | null;
  email?: string | null;
  show_phone_to_upline?: boolean | null;
} | undefined): { text: string; masked: boolean } | null {
  if (!u) return null;
  const isPhone = !!u.phone;
  const raw = isPhone ? u.phone! : u.email;
  if (!raw) return null;
  const canShow = u.show_phone_to_upline !== false; // 預設 true
  if (canShow) return { text: raw, masked: false };
  return { text: isPhone ? maskPhone(raw) : maskEmail(raw), masked: true };
}

export default function ReferralDetailScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const vw = Math.min(width, 375) / 100;
  const { session } = useSession();
  const userId = session?.user.id ?? "";

  // 直推：本地全量載入（上限合理，通常不超千人）
  const [directReferrals, setDirectReferrals] = useState<ReferralRelationship[]>([]);
  // 間推：服務端分頁，當前頁資料
  const [indirectPage, setIndirectPage] = useState<ReferralRelationship[]>([]);
  const [stats, setStats] = useState({ direct: 0, indirect: 0, validDirect: 0, validIndirect: 0 });
  const [loading, setLoading] = useState(true);
  const [indirectLoading, setIndirectLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [teamTab, setTeamTab] = useState<"direct" | "indirect">("direct");
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");

  // 間推當前頁（單獨維護，與直推分頁解耦）
  const [indirectCurrentPage, setIndirectCurrentPage] = useState(1);
  const indirectTotalPages = Math.max(1, Math.ceil(stats.indirect / PAGE_SIZE));

  const loadIndirectPage = useCallback(async (uid: string, targetPage: number) => {
    setIndirectLoading(true);
    try {
      const rows = await getIndirectReferrals(uid, PAGE_SIZE, (targetPage - 1) * PAGE_SIZE);
      setIndirectPage(rows);
    } finally {
      setIndirectLoading(false);
    }
  }, []);

  const loadData = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    setLoading(true);
    setLoadError(false);
    try {
      // 直推全量 + stats 並行；間推取第1頁
      const [dr, s, ir] = await Promise.all([
        getDirectReferrals(userId),
        getReferralStats(userId),
        getIndirectReferrals(userId, PAGE_SIZE, 0),
      ]);
      setDirectReferrals(dr);
      setStats(s);
      setIndirectPage(ir);
      setIndirectCurrentPage(1);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useFocusEffect(useCallback(() => {
    loadData();
    setPage(1);
  }, [loadData]));

  const handleIndirectPageChange = useCallback(async (targetPage: number) => {
    setIndirectCurrentPage(targetPage);
    await loadIndirectPage(userId, targetPage);
  }, [userId, loadIndirectPage]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: "#000000" }}>
        <StatusBar style="light" />
        <Image source={IMG_PAGE_BG} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="cover" priority="high" cachePolicy="memory-disk" />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={OG2} />
        </View>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={{ flex: 1, backgroundColor: "#000000" }}>
        <StatusBar style="light" />
        <Image source={IMG_PAGE_BG} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="cover" priority="high" cachePolicy="memory-disk" />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16, paddingHorizontal: 32 }}>
          <Text allowFontScaling={false} style={{ fontSize: 40 }}>⚠️</Text>
          <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 16, fontWeight: "600", textAlign: "center" }}>載入失敗</Text>
          <Text allowFontScaling={false} style={{ color: MUTED, fontSize: 14, textAlign: "center" }}>網路異常，請稍後重試</Text>
          <Pressable onPress={loadData} style={{ marginTop: 8, paddingHorizontal: 32, paddingVertical: 12, borderRadius: 8, backgroundColor: OG2 }} className="active:opacity-70">
            <Text allowFontScaling={false} style={{ color: "#fff", fontWeight: "700" }}>重新載入</Text>
          </Pressable>
          <Pressable onPress={() => router.back()} className="active:opacity-70">
            <Text allowFontScaling={false} style={{ color: MUTED, fontSize: 14 }}>返回</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const handleTabChange = (tab: "direct" | "indirect") => {
    setTeamTab(tab);
    setPage(1);
    setSearchQuery("");
  };

  // 直推本地搜尋過濾
  const filteredDirect = searchQuery.trim()
    ? directReferrals.filter((r) => {
        const q = searchQuery.trim().toLowerCase();
        const u = (r as any).referred_user;
        return (
          u?.phone?.toLowerCase().includes(q) ||
          u?.email?.toLowerCase().includes(q) ||
          u?.referral_code?.toLowerCase().includes(q) ||
          r.referred_id?.toLowerCase().includes(q)
        );
      })
    : directReferrals;

  // 間推本地搜尋過濾（當前頁資料）
  const filteredIndirect = searchQuery.trim()
    ? indirectPage.filter((r) => {
        const q = searchQuery.trim().toLowerCase();
        const u = (r as any).referred_user;
        return (
          u?.username?.toLowerCase().includes(q) ||
          u?.referral_code?.toLowerCase().includes(q) ||
          r.referred_id?.toLowerCase().includes(q)
        );
      })
    : indirectPage;

  // 當前 tab 展示資料
  const isDirect = teamTab === "direct";
  const accentColor = isDirect ? "#E8520A" : "#A855F7";

  // 直推：本地分頁
  const directTotalPages = Math.max(1, Math.ceil(filteredDirect.length / PAGE_SIZE));
  const directPagedList = filteredDirect.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // 間推：服務端分頁，當前頁資料過濾後展示
  const list = isDirect ? directPagedList : filteredIndirect;
  const currentPage = isDirect ? page : indirectCurrentPage;
  const totalPages = isDirect ? directTotalPages : indirectTotalPages;

  // 底部彙總：直推用本地過濾陣列；間推用 stats 快取（精確）
  const totalCount = isDirect ? filteredDirect.length : stats.indirect;
  const validCount = isDirect
    ? filteredDirect.filter((r) => r.is_valid).length
    : stats.validIndirect;

  const handlePageChange = (p: number) => {
    if (isDirect) {
      setPage(p);
    } else {
      handleIndirectPageChange(p);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: "#000000" }} behavior="padding">
      <StatusBar style="light" />

      {/* 全屏背景圖 */}
      <Image
        source={IMG_PAGE_BG}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        contentFit="cover"
        contentPosition={{ top: 0, left: "50%" }}
        priority="high"
        cachePolicy="memory-disk"
      />

      {/* NavBar：對齊推廣獎勵頁 */}
      <View style={{ paddingHorizontal: 16, paddingTop: insets.top + 12, paddingBottom: 12, flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Pressable onPress={() => router.back()} className="active:opacity-70">
          <Image source={IMG_BACK} style={{ width: vw * 6, height: vw * 6 }} contentFit="contain" />
        </Pressable>
        <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 20, fontWeight: "800" }}>推廣明細</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 32 }}>

        {/* Tab 切換：整行背景圖根據選中狀態切換 */}
        <View style={{
          flexDirection: "row", height: 44, marginBottom: 12,
          borderRadius: 22, overflow: "hidden",
          borderWidth: 1, borderColor: "rgba(123,123,123,0.4)",
        }}>
          {/* 整行背景圖：直推選中用左圖，間推選中用右圖 */}
          <Image
            source={teamTab === "direct" ? IMG_TAB_SEL_LEFT : IMG_TAB_SEL_RIGHT}
            style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
            contentFit="fill"
          />
          {([
            { key: "direct",   label: "直推會員", count: stats.direct,   activeColor: "#CE6631" },
            { key: "indirect", label: "間接會員", count: stats.indirect, activeColor: "#9E6EDE" },
          ] as const).map(({ key, label, count, activeColor }) => (
            <Pressable
              key={key}
              style={{ flex: 1, height: 44, alignItems: "center", justifyContent: "center", zIndex: 1 }}
              onPress={() => handleTabChange(key)}
            >
              <Text allowFontScaling={false} style={{
                fontSize: 14, lineHeight: 20,
                color: teamTab === key ? activeColor : "#7B7B7B",
                fontWeight: teamTab === key ? "600" : "400",
              }}>
                {label}（{count}）
              </Text>
            </Pressable>
          ))}
        </View>

        {/* 搜尋框（直推 / 間推共用，切換 tab 時已清空）*/}
        <SearchBox
          value={searchQuery}
          onChange={(v) => { setSearchQuery(v); if (isDirect) setPage(1); }}
          onClear={() => { setSearchQuery(""); if (isDirect) setPage(1); }}
        />

        {/* 列表（底框圖片背景，推廣獎勵頁風格，2列：會員 | 狀態）*/}
        <View style={{
          marginBottom: 12,
          backgroundColor: "rgba(0,0,0,0.5)",
          borderRadius: 8,
          borderWidth: 1,
          borderColor: "rgba(123,123,123,0.5)",
          paddingHorizontal: 12,
          minHeight: 120,
          overflow: "hidden",
        }}>
          {/* 列表背景圖 */}
          <Image source={IMG_LIST_BG} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="fill" />

          {!isDirect && indirectLoading ? (
            <View style={{ paddingVertical: 40, alignItems: "center", gap: 8 }}>
              <ActivityIndicator size="small" color="#A855F7" />
              <Text allowFontScaling={false} style={{ color: "#FFFFFF99", fontSize: 13, lineHeight: 20 }}>載入中…</Text>
            </View>
          ) : list.length === 0 ? (
            <View style={{ paddingVertical: 40, alignItems: "center", gap: 8 }}>
              {searchQuery.trim() ? (
                <>
                  <Search size={28} color="#FFFFFF20" />
                  <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 13, lineHeight: 20, textAlign: "center" }}>未找到匹配的會員</Text>
                </>
              ) : (
                <>
                  <Text allowFontScaling={false} style={{ fontSize: 32 }}>👥</Text>
                  <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 13, lineHeight: 20, textAlign: "center" }}>暫無{isDirect ? "直推" : "間接"}會員</Text>
                </>
              )}
            </View>
          ) : (
            <>
              {list.map((r, idx) => {
                const tag = getValidityTag(r);
                const poolLevel = r.pool_info?.is_active ? (r.pool_info as any).level ?? null : null;
                const u = (r as any).referred_user;
                const contact = getContactDisplay(u);
                const username = u?.username || "使用者" + r.referred_id.slice(0, 6);
                const joinDate = new Date(r.created_at).toLocaleDateString("zh-CN", { year: "2-digit", month: "2-digit", day: "2-digit" });

                return (
                  <View
                    key={r.referred_id + idx}
                    style={{
                      flexDirection: "row", alignItems: "center",
                      paddingVertical: 12,
                      borderBottomWidth: idx < list.length - 1 ? 1 : 0,
                      borderBottomColor: "rgba(255,255,255,0.08)",
                    }}
                  >
                    {/* 左欄：會員信息 */}
                    <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
                      {/* 用戶名 + 等級胶囊 */}
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 13, fontWeight: "600", lineHeight: 20 }} numberOfLines={1}>
                          {username}
                        </Text>
                        {r.pool_info?.is_active && poolLevel !== null && (
                          <View style={{
                            paddingHorizontal: 7, paddingVertical: 2, borderRadius: 99,
                            backgroundColor: "#EAB30820", borderWidth: 1, borderColor: "#EAB30840",
                          }}>
                            <Text allowFontScaling={false} style={{ color: "#EAB308", fontSize: 11, fontWeight: "700", lineHeight: 16 }}>Lv.{poolLevel}</Text>
                          </View>
                        )}
                      </View>
                      {/* 聯絡方式 */}
                      {contact && (
                        <Text allowFontScaling={false}
                          style={{ color: contact.masked ? "#FFFFFF30" : "#22C55E", fontSize: 12, lineHeight: 18 }}
                          numberOfLines={1}
                        >
                          {contact.text}
                        </Text>
                      )}
                      {/* 邀請碼 */}
                      {u?.referral_code && (
                        <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 12, lineHeight: 18 }} numberOfLines={1}>
                          #{u.referral_code}
                        </Text>
                      )}
                    </View>

                    {/* 右欄：狀態胶囊 + 加入時間 */}
                    <View style={{ alignItems: "flex-end", gap: 4, paddingLeft: 8 }}>
                      <View style={{
                        paddingHorizontal: 7, paddingVertical: 2, borderRadius: 99,
                        backgroundColor: tag.color + "22", borderWidth: 1, borderColor: tag.color + "44",
                      }}>
                        <Text allowFontScaling={false} style={{ color: tag.color, fontSize: 12, fontWeight: "700", lineHeight: 18 }}>
                          {r.is_valid ? "有效" : "無效"}
                        </Text>
                      </View>
                      <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 12, lineHeight: 18 }}>
                        {joinDate}
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
                <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 12, lineHeight: 18 }}>共 {totalCount} 人 · 第 {currentPage}/{totalPages} 頁</Text>
                <Text allowFontScaling={false} style={{ color: "#22C55E", fontSize: 13, lineHeight: 20, fontWeight: "600" }}>有效 {validCount} 人</Text>
              </View>
            </>
          )}
        </View>

        {/* 分頁控制（對齊推廣獎勵頁）*/}
        {totalPages > 1 && (
          <View style={{
            flexDirection: "row", alignItems: "center", justifyContent: "space-between",
            paddingHorizontal: 16, paddingVertical: 12,
            backgroundColor: "rgba(0,0,0,0.5)",
            borderRadius: 8, borderWidth: 1, borderColor: BORDER,
          }}>
            <Pressable
              onPress={() => handlePageChange(Math.max(1, currentPage - 1))}
              disabled={currentPage <= 1 || indirectLoading}
              style={{ flexDirection: "row", alignItems: "center", gap: 4, opacity: currentPage <= 1 ? 0.4 : 1 }}
              className="active:opacity-60"
            >
              <ChevronLeft size={14} color={OG2} />
              <Text allowFontScaling={false} style={{ color: OG2, fontSize: 13, lineHeight: 20, fontWeight: "600" }}>上一頁</Text>
            </Pressable>
            <Text allowFontScaling={false} style={{ color: "#FFFFFF99", fontSize: 13, lineHeight: 20 }}>{currentPage} / {totalPages}</Text>
            <Pressable
              onPress={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage >= totalPages || indirectLoading}
              style={{ flexDirection: "row", alignItems: "center", gap: 4, opacity: currentPage >= totalPages ? 0.4 : 1 }}
              className="active:opacity-60"
            >
              <Text allowFontScaling={false} style={{ color: OG2, fontSize: 13, lineHeight: 20, fontWeight: "600" }}>下一頁</Text>
              <ChevronRight size={14} color={OG2} />
            </Pressable>
          </View>
        )}

      </ScrollView>
    </KeyboardAvoidingView>
  );
}


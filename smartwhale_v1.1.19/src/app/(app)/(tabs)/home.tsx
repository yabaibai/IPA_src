/* eslint-disable no-undef */
/* eslint-disable */
// @ts-nocheck
/**
 * Home 首頁（完全復刻 Vue Home.vue + 真實數據）
 */
import { useState, useRef, useCallback, useEffect } from "react";
import {
  View, Text, Pressable, ScrollView, FlatList, Modal,
  StyleSheet, useWindowDimensions, ActivityIndicator, RefreshControl,
} from "react-native";
import { Image } from "expo-image";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, router } from "expo-router";
import { ChevronRight, CheckCircle2 } from "lucide-react-native";
import * as Clipboard from "expo-clipboard";
import { useSession } from "@/ctx";
import { useAnimatedPrice } from "@/hooks/useAnimatedPrice";
import {
  getWalletBalance, getLatestAntPrice, getUnreadAnnouncements, getProfile,
  getBanners, getActiveAnnouncements, getSystemConfigValue,
} from "@/db/api";
import { type WalletBalance, type AntPrice, type Announcement, type Profile, type HomeBanner } from "@/types/types";
import AnnouncementModal from "@/components/AnnouncementModal";
import UpdateDialog from "@/components/UpdateDialog";
import { useVersionCheck } from "@/hooks/useVersionCheck";
import { filterCardBanners, getNextBannerIndex, getSafeBannerIndex } from "@/utils/bannerUtils";
import { CARD_STYLE } from "@/lib/card-styles";
import { withTimeout } from "@/lib/asyncTool";
import { sharedGet } from "@/lib/requestDedup";
import { showToast } from "@/lib/toast";
import { useTabData } from "@/db/tabData";
import AreaSelector, { DEFAULT_AREA_ID } from "@/components/AreaSelector";

// ─── 本地圖片資源映射 ───────────────────────────────────
const IMGS: Record<string, ReturnType<typeof require>> = {
  "logo1.png":   require("../../../../assets/page-img/logo1.png"),
  "bg2.png":     require("../../../../assets/page-img/bg2.png"),
  "bg3.png":     require("../../../../assets/page-img/bg3.png"),
  "bg4.png":     require("../../../../assets/page-img/bg4.png"),
  "body-bg.png": require("../../../../assets/page-img/page_bg.webp"),
  "bg22.png":    require("../../../../assets/page-img/bg22.png"),
  "bg20.png":    require("../../../../assets/page-img/bg20.png"),
  "banner3.png": require("../../../../assets/page-img/banner3.png"),
  "banner4.png": require("../../../../assets/page-img/banner4.png"),
  "icon-help.png":   require("../../../../assets/page-img/icon-help.png"),
  "icon-notice.png": require("../../../../assets/page-img/icon-notice.png"),
  "icon-kefu.png":   require("../../../../assets/page-img/icon-kefu.png"),
  "icon-shop.png":   require("../../../../assets/page-img/icon-shop.png"),
  "icon-shequn.png": require("../../../../assets/page-img/icon-shequn.png"),
  "icon-2.png":  require("../../../../assets/page-img/icon-2.png"),
  "icon-3.png":  require("../../../../assets/page-img/icon-3.png"),
  "icon-4.png":  require("../../../../assets/page-img/icon-4.png"),
  "icon11.png":  require("../../../../assets/page-img/icon11.png"),
  "icon12.png":  require("../../../../assets/page-img/icon12.png"),
};
const IMG = (name: string) => IMGS[name];

// 頂部輪播 Banner 圖（遠程圖失敗回落 title 文字，避免空白）
function CarouselImage({ item, width, vw }: { item: import("@/types/types").HomeBanner; width: number; vw: number }) {
  const [failed, setFailed] = useState(false);
  if (!item.banner_image_url || failed) {
    return (
      <View style={{ width: width - vw * 8, aspectRatio: 984 / 465, backgroundColor: "#1C1C1C", alignItems: "center", justifyContent: "center" }}>
        <Text allowFontScaling={false} style={{ color: "#fff", fontSize: vw * 4 }}>{item.title}</Text>
      </View>
    );
  }
  return (
    <Image
      source={{ uri: item.banner_image_url }}
      style={{ width: width - vw * 8, aspectRatio: 984 / 465 }}
      contentFit="cover"
      onError={() => setFailed(true)}
      transition={200}
    />
  );
}

// 遠程 Banner 圖（帶加載失敗回落本地圖，避免空白）
function BannerImage({ url, onPress, idx = 0, width, vw }: { url: string; onPress?: () => void; idx?: number; width: number; vw: number }) {
  const [failed, setFailed] = useState(false);
  if (failed || !url) {
    const local = idx % 2 === 0 ? "banner3.png" : "banner4.png";
    return (
      <Pressable onPress={onPress} style={{ width: "100%", marginBottom: vw * 2, borderRadius: vw * 2, overflow: "hidden" }}>
        <Image source={IMG(local)} style={{ width: "100%", aspectRatio: 983 / 308 }} contentFit="cover" />
      </Pressable>
    );
  }
  return (
    <Pressable onPress={onPress} style={{ width: "100%", marginBottom: vw * 2, borderRadius: vw * 2, overflow: "hidden" }}>
      <Image
        source={{ uri: url }}
        style={{ width: "100%", aspectRatio: 983 / 308 }}
        contentFit="cover"
        onError={() => setFailed(true)}
        transition={200}
      />
    </Pressable>
  );
}

// ─── 弹窗確認按鈕背景圖（mine_btn_confirm.png 390×121）───
const IMG_BTN_CONFIRM = require("../../../../assets/page-img/mine_btn_confirm.png");

// ─── 顏色常量 ───────────────────────────────────────────
const OG = "#FF5E1A";

// ─── 合約地址佔位 ──────────────────────────────────────
const CONTRACT_ADDRESS_PLACEHOLDER = "載入中...";


export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const userId = session?.user.id ?? "";
  const { width } = useWindowDimensions();
  const vw = width / 100;

  // bg1 按鈕尺寸由 AreaSelector 元件內部處理

  // ── 區域彈窗 ───────────────────────────────────────────
  const [areaIndex, setAreaIndex] = useState(DEFAULT_AREA_ID);

  // ── 數據 state ─────────────────────────────────────────
  const [wallet, setWallet] = useState<WalletBalance | null>(null);
  const [antPrice, setAntPrice] = useState<AntPrice | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [showAnnouncement, setShowAnnouncement] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  // 請求序號守衛：防止瘋狂切頁面時舊請求回來覆蓋新數據（導致空列表）

  // ── 價格動畫（必須在頂層）────────────────────────────────
  const { jsPrice, priceColor, dynChange } = useAnimatedPrice({
    closePrice: antPrice?.close_price  ?? 0,
    highPrice:  antPrice?.high_price   ?? (antPrice?.close_price ?? 0) * 1.02,
    lowPrice:   antPrice?.low_price    ?? (antPrice?.close_price ?? 0) * 0.98,
    openPrice:  antPrice?.open_price   ?? 0,
  });
  const priceTextStyle = useAnimatedStyle(() => ({
    color: priceColor.value,
  }));
  const dynUp = dynChange >= 0;

  // ── 動態資料 ───────────────────────────────────────────
  const [noticeItems, setNoticeItems] = useState<string[]>([]);
  const [banners, setBanners] = useState<HomeBanner[]>([]);
  const [contractAddress, setContractAddress] = useState(CONTRACT_ADDRESS_PLACEHOLDER);
  const [communityContent, setCommunityContent] = useState("官方Telegram群：@ZhiJingAI_Official\n官方微信群：掃碼新增客服後入群");
  const [supportContent, setSupportContent] = useState("客服工作時間：09:00 - 22:00\n請透過官方渠道聯絡，謹防詐騙！\nTelegram: @ZhiJingAI_Support");
  const [communityImageUrl, setCommunityImageUrl] = useState<string>("");
  const [supportImageUrl, setSupportImageUrl] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [tipModal, setTipModal] = useState<{ title: string; content: string; imageUrl?: string; onConfirm?: () => void } | null>(null);

  // ── 版本檢測 ───────────────────────────────────────────
  const { showUpdate, latestVersion, localVersion, apkUrl, dismiss: dismissUpdate } = useVersionCheck();
  const [versionDialogOpen, setVersionDialogOpen] = useState(false);

  // ── 公告/Banner 輪播 refs ──────────────────────────────
  const [noticeIdx, setNoticeIdx] = useState(0);
  const noticeTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [bannerIdx, setBannerIdx] = useState(0);
  const bannerFlatRef = useRef<FlatList<HomeBanner>>(null);
  const bannerTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  // 持有最新輪播數量，避免定時器閉包捕獲舊 cardCount 導致越界/指示器不匹配
  const bannerCardCountRef = useRef(0);

  // 啟動/重啟自動輪播（依賴最新 cardCount ref，banners 變化時重跑）
  const startBannerAutoScroll = useCallback(() => {
    if (bannerTimer.current) clearInterval(bannerTimer.current);
    bannerTimer.current = setInterval(() => {
      setBannerIdx((prev) => {
        const next = getNextBannerIndex(prev, bannerCardCountRef.current);
        bannerFlatRef.current?.scrollToIndex({ index: next, animated: true });
        return next;
      });
    }, 3500);
  }, []);

  // ── 數據載入 ───────────────────────────────────────────
  // ── 數據加載（統一引擎：緩存優先+節流+去重+全局隊列+離Tab取消+整批寫緩存）──
  const fetchHome = useCallback(async (force = false) => {
    try { await supabase.auth.getSession(); } catch { /* ignore */ }
    // 共用去重層：預加載已拉過的核心接口直接命中緩存（不再發請求），避免重複打 WAF；force=true 時穿透重拉
    // shared（共享池）：wallet/price/unread/profile 僅登錄/手動刷新更新；unique：banner/notice/config 3 分鐘自動回源
    const get = (label: string, fn: () => Promise<any>, shared = false) => sharedGet(label, fn, { force, shared });
    const [w, price, unread, prof, dbBanners, activeNotices, contractVal, communityVal, supportVal] = await Promise.all([
      get("wallet", () => getWalletBalance(userId), true),
      get("price", () => getLatestAntPrice(), true),
      get("unread", () => getUnreadAnnouncements(userId), true),
      get("profile", () => getProfile(userId), true),
      get("banners", () => getBanners()),
      get("notices", () => getActiveAnnouncements()),
      get("contract", () => getSystemConfigValue("smt_contract_address")),
      get("community", () => getSystemConfigValue("community_content")),
      get("support", () => getSystemConfigValue("support_content")),
    ]);
    const [communityImgVal, supportImgVal] = await Promise.all([
      get("communityImg", () => getSystemConfigValue("community_image_url")),
      get("supportImg", () => getSystemConfigValue("support_image_url")),
    ]);
    return { w, price, unread, prof, dbBanners, activeNotices, contractVal, communityVal, supportVal, communityImgVal, supportImgVal };
  }, [userId]);

  const applyHome = useCallback((d) => {
    const { w, price, unread, prof, dbBanners, activeNotices, contractVal, communityVal, supportVal, communityImgVal, supportImgVal } = d;
    if (w) setWallet(w);
    if (prof) setProfile(prof);
    if (price) setAntPrice(price);
    if (dbBanners) setBanners(dbBanners);
    if (activeNotices && activeNotices.length > 0) { setNoticeItems(activeNotices.map((a) => a.title)); setNoticeIdx(0); }
    if (contractVal) setContractAddress(contractVal);
    if (communityVal) setCommunityContent(communityVal);
    if (supportVal) setSupportContent(supportVal);
    if (communityImgVal) setCommunityImageUrl(communityImgVal);
    if (supportImgVal) setSupportImageUrl(supportImgVal);
    if (unread && unread.length > 0) { setAnnouncements(unread); setShowAnnouncement(true); }
  }, []);

  const { loadData, refresh, onEnter, onLeave } = useTabData({
    cacheKey: "home:" + userId,
    fetch: fetchHome,
    apply: applyHome,
    onError: () => setLoadError(true),
    onLoading: (b) => setLoading(b),
    hasData: () => wallet != null || profile != null,
    // 任一核心数据有效即视为有效缓存；全 null 时不当作命中 → 继续 fetch 自愈（FRD 空数据自愈，与钱包/我的 一致）
    shouldCache: (d: any) => !!(d.w || d.prof || d.price || (d.dbBanners && (d.dbBanners as any[]).length)),
    onFrequent: () => showToast("刷新過於頻密，請稍後再試"),
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

  // ── Banner CDN 圖片預熱（方案三）──────────────────────────
  useEffect(() => {
    const urls = banners
      .map((b) => b.banner_image_url)
      .filter((u): u is string => !!u);
    if (urls.length > 0) Image.prefetch(urls);
  }, [banners]);

  // 公告輪播定時器
  useEffect(() => {
    if (noticeItems.length === 0) return;
    noticeTimer.current = setInterval(() => {
      setNoticeIdx((prev) => (prev + 1) % noticeItems.length);
    }, 3000);
    return () => { if (noticeTimer.current) clearInterval(noticeTimer.current); };
  }, [noticeItems.length]);

  // Banner 自動輪播定時器
  useEffect(() => {
    const cardCount = filterCardBanners(banners).length;
    bannerCardCountRef.current = cardCount; // 更新最新數量（定時器從 ref 讀，避免越界）
    if (cardCount === 0) {
      if (bannerTimer.current) clearInterval(bannerTimer.current);
      return;
    }
    setBannerIdx((prev) => getSafeBannerIndex(prev, cardCount));
    startBannerAutoScroll();
    return () => { if (bannerTimer.current) clearInterval(bannerTimer.current); };
  }, [banners, startBannerAutoScroll]);

  const handleCopyAddress = async () => {
    await Clipboard.setStringAsync(contractAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // session 尚未就緒（userId 為空）：顯示「用戶信息校驗中…」而非空白/全空數據
  if (!userId) {
    return (
      <View style={{ flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color={OG} />
        <Text allowFontScaling={false} style={{ color: "#999", fontSize: 13, marginTop: 12 }}>用戶信息校驗中…</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color={OG} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      {/* ── 背景圖：expo-image memory-disk 快取（方案二）── */}
      <Image
        source={IMG("body-bg.png")}
        style={StyleSheet.absoluteFillObject}
        contentFit="cover"
        priority="high"
        cachePolicy="memory-disk"
      />
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top,
          paddingBottom: insets.bottom + 111,
          paddingHorizontal: vw * 4,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => { setRefreshing(true); await refresh(); setRefreshing(false); }}
            tintColor={OG} colors={[OG]}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {loadError && (
          <Pressable onPress={() => loadData()} style={{ backgroundColor: "#3A1A0A", paddingVertical: vw * 3, paddingHorizontal: vw * 4, marginBottom: vw * 2 }}>
            <Text style={{ color: "#FF8C42", fontSize: 13, textAlign: "center" }}>數據加載失敗，點擊重試</Text>
          </Pressable>
        )}
        {/* ── 頂部導航：logo1 + AreaSelector 元件 ── */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: vw * 3 }}>
          <Image source={IMG("logo1.png")} style={{ height: vw * 10.13, width: vw * 10.13 * 4.555 }} contentFit="contain" />
          <AreaSelector areaIndex={areaIndex} onSelect={setAreaIndex} btnWidth={vw * 24} />
        </View>

        {/* ── 輪播 Banner（bg22 裝飾邊框在上層，輪播在絕對定位下層）── */}
        {(() => {
          const cardBanners = filterCardBanners(banners);
          return (
            <View style={{ marginBottom: vw * 2, position: "relative" }}>
              {cardBanners.length > 0 && (
                <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
                  overflow: "hidden", borderRadius: vw * 5,
                  height: (width - vw * 8) * 465 / 984 }}>
                  <FlatList
                    ref={bannerFlatRef}
                    data={cardBanners}
                    keyExtractor={(b) => b.id}
                    horizontal pagingEnabled showsHorizontalScrollIndicator={false}
                    getItemLayout={(_, index) => ({ length: width - vw * 8, offset: (width - vw * 8) * index, index })}
                    onMomentumScrollEnd={(e) => {
                      const idx = Math.round(e.nativeEvent.contentOffset.x / (width - vw * 8));
                      setBannerIdx(idx);
                      // 手動滑動後重啟自動輪播（從最新 idx 繼續，避免跳回）
                      startBannerAutoScroll();
                    }}
                    renderItem={({ item }) => (
                      <Pressable style={{ width: width - vw * 8 }} onPress={() => {}}>
                        <CarouselImage item={item} width={width} vw={vw} />
                      </Pressable>
                    )}
                  />
                  <View style={{ position: "absolute", bottom: vw * 2, left: 0, right: 0,
                    flexDirection: "row", justifyContent: "center", gap: vw * 1.5 }}>
                    {cardBanners.map((_, i) => (
                      <View key={i} style={{ width: vw * 2, height: vw * 2, borderRadius: vw,
                        backgroundColor: i === bannerIdx ? OG : "#ffffff80" }} />
                    ))}
                  </View>
                </View>
              )}
              <Image source={IMG("bg22.png")} style={{ width: "100%", aspectRatio: 984 / 465 }}
                contentFit="fill" pointerEvents="none" />
            </View>
          );
        })()}

        {/* ── 公告欄（bg2.png 圖片背景 + 動態公告）── */}
        <Pressable
          style={{ position: "relative", marginBottom: vw * 2 }}
          onPress={() => router.push("/(app)/announcements" as any)}
        >
          <Image source={IMG("bg2.png")} style={{ width: "100%", aspectRatio: 343 / 36 }} contentFit="fill" />
          <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
            flexDirection: "row", alignItems: "center", paddingHorizontal: vw * 3 }}>
            <Image source={IMG("icon-notice.png")} style={{ width: vw * 5, height: vw * 5, marginRight: vw * 2 }} contentFit="contain" />
            <Text allowFontScaling={false} style={{ color: "#fff", fontSize: vw * 3, flex: 1 }} numberOfLines={1}>
              {noticeItems.length > 0 ? noticeItems[noticeIdx] : "暫無公告"}
            </Text>
          </View>
        </Pressable>

        {/* ── 行情雙欄卡片（bg3.png 圖片背景 + 真實數據）── */}
        <View style={{ flexDirection: "row", gap: vw * 3.2, marginBottom: vw * 2 }}>
          {/* 左：SMT/USDT 價格（動態）*/}
          <Pressable style={{ flex: 1, position: "relative" }} onPress={() => router.push("/(app)/ant-kline" as any)}>
            <Image source={IMG("bg3.png")} style={{ width: "100%", aspectRatio: 463 / 263 }} contentFit="fill" />
            <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, padding: vw * 2.93 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: vw * 1.5, marginBottom: vw * 0.8 }}>
                <Image source={IMG("icon-3.png")} style={{ width: vw * 5, height: vw * 5, flexShrink: 0 }} contentFit="contain" />
                <Text style={{ color: "#fff", fontSize: vw * 3.2, flex: 1 }} numberOfLines={1} allowFontScaling={false}>SMT / USDT</Text>
              </View>
              <Animated.Text
                style={[{ fontWeight: "700", fontSize: vw * 4.8 }, priceTextStyle]}
                numberOfLines={1}
                allowFontScaling={false}
              >
                {antPrice ? jsPrice.toFixed(4) : "--"}
              </Animated.Text>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: vw * 0.8 }}>
                <View style={{ backgroundColor: dynUp ? "rgba(99,187,114,0.2)" : "rgba(244,63,94,0.2)",
                  borderRadius: vw * 4, paddingHorizontal: vw * 2, paddingVertical: vw * 0.6 }}>
                  <Text style={{ color: dynUp ? "#63BB72" : "#F43F5E", fontSize: vw * 3.2 }} allowFontScaling={false}>
                    {dynUp ? "+" : ""}{dynChange.toFixed(2)}%
                  </Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", opacity: 0.7 }}>
                  <Text style={{ color: "#fff", fontSize: vw * 3.2 }} allowFontScaling={false}>K線</Text>
                  <ChevronRight size={vw * 3.5} color="#fff" />
                </View>
              </View>
            </View>
          </Pressable>

          {/* 右：SMT 合約地址（動態）*/}
          <View style={{ flex: 1, position: "relative" }}>
            <Image source={IMG("bg3.png")} style={{ width: "100%", aspectRatio: 463 / 263 }} contentFit="fill" />
            <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, padding: vw * 2.93 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: vw * 1.5, marginBottom: vw * 0.8 }}>
                <Image source={IMG("icon-2.png")} style={{ width: vw * 5, height: vw * 5, flexShrink: 0 }} contentFit="contain" />
                <Text style={{ color: "#fff", fontSize: vw * 3.2, flex: 1 }} numberOfLines={1} allowFontScaling={false}>SMT合約</Text>
              </View>
              <Text style={{ color: "#fff", fontSize: vw * 3.6, opacity: 0.7, marginBottom: vw * 1.6, width: "100%" }} numberOfLines={1} allowFontScaling={false}>
                {contractAddress}
              </Text>
              <Pressable
                onPress={handleCopyAddress}
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: vw * 1.2,
                  backgroundColor: "#000", borderRadius: vw * 26.67,
                  borderWidth: 1, borderColor: "#D88003",
                  paddingHorizontal: vw * 1.8, height: vw * 5.8,
                  alignSelf: "center", width: "90%" }}
              >
                {copied
                  ? <CheckCircle2 size={vw * 2.8} color="#22C55E" />
                  : <Image source={IMG("icon-4.png")} style={{ width: vw * 2.8, height: vw * 2.8 }} contentFit="contain" />}
                <Text style={{ color: copied ? "#22C55E" : "#fff", fontSize: vw * 2.8 }} allowFontScaling={false}>
                  {copied ? "已複製" : "複製地址"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* ── 快捷功能（bg4.png + 完整業務邏輯）── */}
        <View style={{ position: "relative", marginBottom: vw * 2 }}>
          <Image source={IMG("bg4.png")} style={{ width: "100%", aspectRatio: 977 / 320 }} contentFit="fill" />
          <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
            paddingHorizontal: vw * 5.33, paddingVertical: vw * 4.2 }}>
            <Text allowFontScaling={false} style={{ color: "#fff", fontSize: vw * 3.2, textAlign: "left", marginBottom: vw * 2 }}>快捷功能</Text>
            <View style={{ flexDirection: "row" }}>
              {[
                { img: "icon-shequn.png", label: "加入社群", onPress: () => setTipModal({ title: "加入社群", content: communityContent, imageUrl: communityImageUrl || undefined }) },
                { img: "icon-kefu.png", label: "線上客服", onPress: () => setTipModal({ title: "線上客服", content: supportContent, imageUrl: supportImageUrl || undefined }) },
                { img: "icon-help.png", label: "幫助中心", onPress: () => router.push("/(app)/help-center" as any) },
                { img: "icon-shop.png", label: "商戶中心", onPress: () => {
                    if (profile?.is_merchant) {
                      router.push("/(app)/merchant-center" as any);
                    } else if (profile?.is_activated) {
                      setTipModal({ title: "您還不是商戶", content: "免費申請商戶後可進入；\n\n0 手續費轉賬；\n\nSMT 收款權益獎勵；" });
                    } else if (profile?.email && !profile?.phone) {
                      setTipModal({ title: "您還不是商戶", content: "免費申請商戶後可進入；\n\n0 手續費轉賬；\n\nSMT 收款權益獎勵；" });
                    } else if (!profile?.is_verified) {
                      setTipModal({ title: "您還不是商戶", content: "免費申請商戶後可進入；\n\n0 手續費轉賬；\n\nSMT 收款權益獎勵；" });
                    } else {
                      setTipModal({ title: "您還不是商戶", content: "免費申請商戶後可進入；\n\n0 手續費轉賬；\n\nSMT 收款權益獎勵；",
                        onConfirm: () => { setTipModal(null); router.push("/(app)/(tabs)/profile" as any); },
                      });
                    }
                  } },
              ].map((item) => (
                <Pressable key={item.label} onPress={item.onPress} style={{ flex: 1, alignItems: "center" }}>
                  <Image source={IMG(item.img)} style={{ width: vw * 10.4, height: vw * 10.4 }} contentFit="contain" />
                  <Text allowFontScaling={false} style={{ color: "#FCDE9D", fontSize: vw * 3.2, marginTop: vw * 1.4, textAlign: "center" }}>{item.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        {/* ── 助力節 Banner（純圖片展示，按實際比例 983×308，寬度同快捷功能卡片 width:100%）── */}
        {banners.filter((b) => b.display_mode === "festival").length > 0
          ? banners.filter((b) => b.display_mode === "festival").map((item) => (
              item.banner_image_url ? (
                <BannerImage key={item.id} url={item.banner_image_url} onPress={item.content_detail ? () => setTipModal({ title: item.title, content: item.content_detail }) : undefined} idx={banners.indexOf(item)} width={width} vw={vw} />
              ) : null
            ))
          : (
            <>
              <Image source={IMG("banner3.png")} style={{ width: "100%", aspectRatio: 983 / 308, borderRadius: vw * 2, marginBottom: vw * 2, overflow: "hidden" }} contentFit="cover" />
              <Image source={IMG("banner4.png")} style={{ width: "100%", aspectRatio: 983 / 308, borderRadius: vw * 2, overflow: "hidden" }} contentFit="cover" />
            </>
          )
        }

        {/* ── 底部版本號 ── */}
        <Pressable onPress={() => setVersionDialogOpen(true)} style={{ alignItems: "center", paddingTop: vw * 3, paddingBottom: vw * 5, paddingHorizontal: vw * 4 }}>
          <Text allowFontScaling={false} numberOfLines={0} style={{ color: "rgba(255,255,255,0.3)", fontSize: vw * 2.93, textAlign: "center", flexShrink: 1, width: "100%" }}>
            {`SmartWhale v${localVersion}`}{showUpdate ? `\n→  新版本 v${latestVersion} 可更新` : ""}
          </Text>
        </Pressable>

      </ScrollView>

      {/* ── 提示彈窗（AreaSelector 風格）── */}
      <Modal visible={!!tipModal} transparent animationType="fade" onRequestClose={() => setTipModal(null)}>
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" }}
          onPress={() => setTipModal(null)}
        >
          <Pressable onPress={(e) => e.stopPropagation()} style={{ width: width * 0.9, position: "relative", backgroundColor: "#000", borderRadius: 16, overflow: "hidden" }}>
            {/* bg20 圖片背景，疊加在黑色底色上 */}
            <Image source={IMG("bg20.png")} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="fill" />
            <View style={{ padding: vw * 4.27 }}>
              {/* 標題列 */}
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: vw * 3 }}>
                <Image source={IMG("icon11.png")} style={{ width: vw * 8.8, height: vw * 8.8 }} contentFit="contain" />
                <Text allowFontScaling={false} style={{ color: "#fff", fontSize: vw * 4.53, flex: 1, paddingLeft: vw * 3, fontWeight: "700" }}>{tipModal?.title}</Text>
                <Pressable onPress={() => setTipModal(null)}>
                  <Image source={IMG("icon12.png")} style={{ width: vw * 10.13, height: vw * 10.13 }} contentFit="contain" />
                </Pressable>
              </View>
              {/* 內容 */}
              <Text allowFontScaling={false} style={{ color: "rgba(255,255,255,0.85)", fontSize: vw * 3.5, lineHeight: vw * 5.5, marginBottom: vw * 3 }}>
                {tipModal?.content}
              </Text>
              {!!tipModal?.imageUrl && (
                <Image source={{ uri: tipModal.imageUrl }} style={{ width: "100%", height: 150, borderRadius: 12, marginBottom: vw * 3 }} contentFit="contain" />
              )}
              {/* 確認按鈕：有 onConfirm 時跳轉，否則關閉 */}
              <Pressable
                onPress={() => tipModal?.onConfirm ? tipModal.onConfirm() : setTipModal(null)}
                style={{ width: "52%", alignSelf: "center", aspectRatio: 390 / 121, position: "relative" }}
                className="active:opacity-80"
              >
                <Image source={IMG_BTN_CONFIRM} style={StyleSheet.absoluteFillObject} contentFit="fill" />
                <View style={[StyleSheet.absoluteFillObject, { alignItems: "center", justifyContent: "center" }]}>
                  <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>
                    {tipModal?.onConfirm ? "立即申請" : "好的"}
                  </Text>
                </View>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── 公告彈窗 ── */}
      {showAnnouncement && announcements.length > 0 && (
        <AnnouncementModal announcements={announcements} userId={userId} onClose={() => setShowAnnouncement(false)} />
      )}

      {/* ── 版本更新彈窗 ── */}
      <UpdateDialog
        open={versionDialogOpen || showUpdate}
        onDismiss={() => { setVersionDialogOpen(false); dismissUpdate(); }}
        latestVersion={latestVersion || localVersion}
        localVersion={localVersion}
        apkUrl={apkUrl}
      />

      {/* ── 區域選擇彈窗由 AreaSelector 元件統一處理 ── */}

    </View>
  );
}

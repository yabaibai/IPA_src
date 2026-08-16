/* eslint-disable no-undef */
import { useState, useRef, useCallback } from "react";
import { View, Text, Pressable, ActivityIndicator, FlatList, Animated, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { useFocusEffect, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { CheckCircle } from "lucide-react-native";
import ViewShot from "@/components/ViewShotWrapper";
import * as MediaLibrary from "expo-media-library";
import QRCode from "react-native-qrcode-svg";
import * as Clipboard from "expo-clipboard";
import { useSession } from "@/ctx";
import { getProfile, getWhalePool } from "@/db/api";
import { sharedGet } from "@/lib/requestDedup";
import { supabase } from "@/client/supabase";
import type { Profile, WhalePool } from "@/types/types";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";

// ── 按鈕背景圖 ──────────────────────────────────────────────────
const IMG_BTN_SAVE  = require("../../../assets/page-img/btn_save_img.png");
const IMG_BTN_LINK  = require("../../../assets/page-img/btn_share_link.png");
const IMG_BACK      = require("../../../assets/page-img/icon9.png");
const BG_IMG        = require("../../../assets/page-img/page_bg.webp");

// 本地兜底背景圖（當資料庫無啟用背景時使用）
import bg1 from "../../../assets/poster-bg/bg1.jpg";
import bg2 from "../../../assets/poster-bg/bg2.jpg";
import bg3 from "../../../assets/poster-bg/bg3.jpg";
import bg4 from "../../../assets/poster-bg/bg4.jpg";

// ── 海報尺寸常量 ──────────────────────────────────────────────
// 背景圖規格要求：豎版，寬:高 = 9:16，推薦 1080×1920px
const POSTER_ASPECT = 16 / 9; // 高/寬 = 16/9（豎版 9:16）

// ── 背景圖型別：支援本地靜態圖（number）和遠端 URL（string）──
type BgOption = {
  id: string;
  label: string;
  source: number | string; // number = require(), string = remote URL
};

const LOCAL_BG_FALLBACK: BgOption[] = [
  { id: "bg1", label: "星雲",   source: bg1 },
  { id: "bg2", label: "暗金",   source: bg2 },
  { id: "bg3", label: "深海鯨", source: bg3 },
  { id: "bg4", label: "熔岩",   source: bg4 },
];

export default function PosterScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const userId = session?.user.id ?? "";
  const viewShotRef = useRef<View>(null);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [_pool,    setPool]    = useState<WhalePool | null>(null);
  const [bgOptions, setBgOptions] = useState<BgOption[]>(LOCAL_BG_FALLBACK);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [msg,     setMsg]     = useState<{ text: string; type: "ok" | "err" } | null>(null);
  const [selectedBg, setSelectedBg] = useState<BgOption>(LOCAL_BG_FALLBACK[0]);

  // 儲存成功動效
  const successOpacity = useRef(new Animated.Value(0)).current;
  const successScale   = useRef(new Animated.Value(0.6)).current;
  const [showSuccess,  setShowSuccess] = useState(false);

  const triggerSuccess = () => {
    setShowSuccess(true);
    successOpacity.setValue(0);
    successScale.setValue(0.6);
    Animated.sequence([
      Animated.parallel([
        Animated.spring(successScale,   { toValue: 1,   useNativeDriver: true, friction: 5 }),
        Animated.timing(successOpacity, { toValue: 1,   duration: 200, useNativeDriver: true }),
      ]),
      Animated.delay(1800),
      Animated.timing(successOpacity,   { toValue: 0,   duration: 400, useNativeDriver: true }),
    ]).start(() => setShowSuccess(false));
  };

  const loadData = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [p, w] = await Promise.all([
        sharedGet("profile", () => getProfile(userId), { shared: true }).catch(() => null),
        sharedGet("pool", () => getWhalePool(userId), { shared: true }).catch(() => null),
      ]);
      setProfile(p);
      setPool(w);

      // 從資料庫載入啟用的背景圖，失敗則保留本地兜底
      const { data: bgs } = await supabase
        .from("poster_backgrounds")
        .select("id, name, image_url")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (bgs && bgs.length > 0) {
        const remote: BgOption[] = bgs.map(b => ({ id: b.id, label: b.name, source: b.image_url }));
        setBgOptions(remote);
        setSelectedBg(remote[0]);
      }
    } catch { /* 靜默處理，保留本地兜底 */ }
    finally   { setLoading(false); }
  }, [userId]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  // ── 派生資料 ────────────────────────────────────────────────
  const inviteCode = profile?.referral_code ?? "------";
  const webBase = process.env.EXPO_PUBLIC_WEB_APP_URL?.trim()
    || ((process.env.EXPO_OS === "web" && typeof window !== "undefined") ? window.location.origin : "")
    || "https://reg.smartwhale.net";
  const inviteUrl = `${webBase}?ref=${inviteCode}`;

  // ── 海報尺寸：先按可用高度反推寬度，保證底部 UI 不被遮擋 ──
  // 固定 UI 區高度：頂部導航 + 背景選擇器 + 提示區 + 底部按鈕區
  const NAV_H       = insets.top + 8 + 44;        // 頂部導航
  const THUMB_H     = 16 + 16 + 100;              // 背景選擇器（標題+間距+縮圖）
  const HINT_H      = 10 + 44;                    // 提示/成功動效區
  const BTN_H       = 8 + 52 + insets.bottom + 16; // 底部按鈕區
  const PADDING_V   = 8;                           // 海報上下邊距
  const availH = screenHeight - NAV_H - THUMB_H - HINT_H - BTN_H - PADDING_V;

  // 按 9:16 比例，從可用高度反推寬度；同時限制最大寬度不超過螢幕寬度-32
  const posterHeightDisplay = Math.max(availH, 160);
  const posterWidthDisplay  = Math.min(
    Math.floor(posterHeightDisplay / POSTER_ASPECT),
    screenWidth - 32
  );
  // 如果寬度被限制，則重新按寬度算高度（寬限場景）
  const finalPosterWidth  = posterWidthDisplay;
  const finalPosterHeight = Math.round(finalPosterWidth * POSTER_ASPECT);

  // ViewShot 截圖使用真實渲染尺寸（無縮放），二維碼大小跟隨
  const qrSize = Math.floor(finalPosterWidth * 0.38);

  // ── 儲存圖片 ────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true); setMsg(null);
    try {
      if (process.env.EXPO_OS === "web") {
        setMsg({ text: "Web 端請長按海報儲存", type: "err" });
        setSaving(false);
        return;
      }
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== "granted") {
        setMsg({ text: "需要相簿許可權才能儲存圖片", type: "err" });
        setSaving(false);
        return;
      }
      const uri = await (viewShotRef.current as any)?.capture();
      if (!uri) throw new Error("截圖失敗");
      await MediaLibrary.saveToLibraryAsync(uri);
      triggerSuccess();
    } catch {
      setMsg({ text: "儲存失敗，請重試", type: "err" });
    }
    setSaving(false);
  };

  // ── 推廣連結（複製 + 原生分享） ─────────────────────────────
  const handleLink = async () => {
    try {
      if (process.env.EXPO_OS !== "web") {
        const { Share } = await import("react-native");
        await Share.share({ message: inviteUrl });
        return;
      }
    } catch { /* 降級到複製 */ }
    await Clipboard.setStringAsync(inviteUrl);
    setMsg({ text: "推廣連結已複製", type: "ok" });
    setTimeout(() => setMsg(null), 2000);
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        <StatusBar style="light" />
        <Image source={BG_IMG} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="cover" priority="high" cachePolicy="memory-disk" />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color="#DE792D" />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <StatusBar style="light" />

      {/* 全屏背景圖（對齊推廣獎勵頁）*/}
      <Image
        source={BG_IMG}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        contentFit="cover"
        contentPosition={{ top: 0, left: "50%" }}
        priority="high"
        cachePolicy="memory-disk"
      />

      {/* ── 頂部導航（對齊推廣獎勵頁風格）──────────────────────── */}
      <View style={{ paddingHorizontal: 16, paddingTop: insets.top + 12, paddingBottom: 12, flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Pressable onPress={() => router.back()} className="active:opacity-70">
          <Image source={IMG_BACK} style={{ width: 24, height: 24 }} contentFit="contain" />
        </Pressable>
        <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 20, fontWeight: "800" }}>邀請海報</Text>
      </View>

      {/* ── 海報預覽 ──────────────────────────────────────────── */}
      <View style={{ alignItems: "center", paddingHorizontal: 16 }}>
        <ViewShot
          ref={viewShotRef}
          options={{ format: "jpg", quality: 0.95 }}
          style={{ borderRadius: 20, overflow: "hidden" }}
        >
          {/* 固定尺寸容器：所有內容絕對定位疊加，方便替換背景圖 */}
          <View style={{ width: finalPosterWidth, height: finalPosterHeight }}>

            {/* 層1：背景圖（鋪滿，支援本地 number 和遠端 string URL） */}
            <Image
              source={typeof selectedBg.source === "string"
                ? { uri: selectedBg.source }
                : selectedBg.source}
              style={{ position: "absolute", width: finalPosterWidth, height: finalPosterHeight }}
              contentFit="cover"
            />

            {/* 層2：遮罩已移除 */}

            {/* 層3：內容（固定位置，與背景圖無關） */}
            <View style={{
              position: "absolute",
              top: Math.round(finalPosterHeight * (893 / 1311)),
              left: 0, right: 0,
              alignItems: "center",
              paddingHorizontal: 24,
            }}>
              {/* 二維碼（無底色、無外框） */}
              <View style={{ alignItems: "center" }}>
                <QRCode
                  value={inviteUrl}
                  size={qrSize}
                  color="#0D0D0D"
                  backgroundColor="transparent"
                />
                {/* 邀請碼標識，在二維碼下方 */}
                <Text allowFontScaling={false} style={{
                  color: "#000000",
                  fontSize: 11,
                  fontWeight: "600",
                  marginTop: 8,
                  letterSpacing: 0.5,
                }}>
                  {inviteCode}
                </Text>
              </View>
            </View>
          </View>
        </ViewShot>
      </View>

      {/* ── 背景選擇器 ────────────────────────────────────────── */}
      <View style={{ marginTop: 16, paddingHorizontal: 16 }}>
        <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 11, marginBottom: 8 }}>切換背景</Text>
        <FlatList
          data={bgOptions}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ gap: 10 }}
          renderItem={({ item }) => {
            const active = item.id === selectedBg.id;
            return (
              <Pressable
                onPress={() => setSelectedBg(item)}
                className="active:opacity-80"
                style={{
                  borderRadius: 10,
                  overflow: "hidden",
                  borderWidth: active ? 2 : 1.5,
                  borderColor: active ? "#E8520A" : "#FFFFFF20",
                }}
              >
                <Image
                  source={typeof item.source === "string" ? { uri: item.source } : item.source}
                  style={{ width: 56, height: 100 }}
                  contentFit="cover"
                />
                {/* 選中遮罩 */}
                {active && (
                  <View style={{
                    position: "absolute", inset: 0,
                    backgroundColor: "#E8520A20",
                    alignItems: "center", justifyContent: "flex-end",
                    paddingBottom: 4,
                  }}>
                    <Text allowFontScaling={false} style={{ color: "#E8520A", fontSize: 9, fontWeight: "700" }}>✓</Text>
                  </View>
                )}
                <Text allowFontScaling={false} style={{
                  position: "absolute", bottom: 3, left: 0, right: 0,
                  color: "#FFFFFFCC", fontSize: 9, textAlign: "center",
                  backgroundColor: "rgba(0,0,0,0.45)",
                }}>
                  {item.label}
                </Text>
              </Pressable>
            );
          }}
        />
      </View>

      {/* ── 提示 / 成功動效 ───────────────────────────────────── */}
      <View style={{ minHeight: 44, marginHorizontal: 16, marginTop: 10, justifyContent: "center" }}>
        {showSuccess && (
          <Animated.View style={{
            opacity: successOpacity,
            transform: [{ scale: successScale }],
            flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
            paddingVertical: 10, borderRadius: 12,
            backgroundColor: "#22C55E15", borderWidth: 1, borderColor: "#22C55E40",
          }}>
            <CheckCircle size={16} color="#22C55E" />
            <Text allowFontScaling={false} style={{ color: "#22C55E", fontSize: 13, fontWeight: "700" }}>海報已儲存到相簿</Text>
          </Animated.View>
        )}
        {!showSuccess && msg && (
          <View style={{
            flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
            paddingVertical: 10, borderRadius: 12,
            backgroundColor: msg.type === "ok" ? "#22C55E15" : "#EAB30815",
            borderWidth: 1,
            borderColor: msg.type === "ok" ? "#22C55E40" : "#EAB30840",
          }}>
            <Text allowFontScaling={false} style={{
              color: msg.type === "ok" ? "#22C55E" : "#EAB308",
              fontSize: 13, fontWeight: "600",
            }}>
              {msg.text}
            </Text>
          </View>
        )}
      </View>

      {/* ── 底部操作按鈕（圖片背景，對齊推廣獎勵頁風格）─────── */}
      <View style={{
        flexDirection: "row", gap: 12,
        marginHorizontal: 16,
        marginTop: 8,
        paddingBottom: insets.bottom + 16,
      }}>
        {/* 儲存圖片：橙色按鈕背景圖 390×121 ratio=3.223 */}
        <Pressable
          onPress={handleSave}
          disabled={saving}
          className="active:opacity-80"
          style={{ flex: 1, opacity: saving ? 0.65 : 1 }}
        >
          <View style={{ width: "100%", alignItems: "center", justifyContent: "center" }}>
            <Image
              source={IMG_BTN_SAVE}
              style={{ width: "100%", aspectRatio: 390 / 121, borderRadius: 10 }}
              contentFit="fill"
            />
            <View style={{ position: "absolute", alignItems: "center", justifyContent: "center" }}>
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text allowFontScaling={false} style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>儲存圖片</Text>
              }
            </View>
          </View>
        </Pressable>

        {/* 推廣連結：深色按鈕背景圖 391×106 ratio=3.689 */}
        <Pressable
          onPress={handleLink}
          className="active:opacity-80"
          style={{ flex: 1 }}
        >
          <View style={{ width: "100%", alignItems: "center", justifyContent: "center" }}>
            <Image
              source={IMG_BTN_LINK}
              style={{ width: "100%", aspectRatio: 391 / 106, borderRadius: 10 }}
              contentFit="fill"
            />
            <View style={{ position: "absolute", alignItems: "center", justifyContent: "center" }}>
              <Text allowFontScaling={false} style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>推廣連結</Text>
            </View>
          </View>
        </Pressable>
      </View>
    </View>
  );
}

/* eslint-disable no-undef */
import { useState, useEffect, useCallback, useRef } from "react";
import {
  View, Text, ScrollView, Pressable, ActivityIndicator,
  Modal, TextInput, Animated, StyleSheet,
} from "react-native";
import { Image } from "expo-image";
import { useFocusEffect, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ChevronRight, Camera, User } from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import { useSession, getValidUserId } from "@/ctx";
import { getProfile, updateProfile } from "@/db/api";
import { sharedGet } from "@/lib/requestDedup";
import { supabase } from "@/client/supabase";
import type { Profile } from "@/types/types";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// ── 图片常量 ──────────────────────────────────────────────
const IMG_PAGE_BG    = require("../../../assets/page-img/page_bg.webp");
const IMG_AVATAR_DEF = require("../../../assets/page-img/mine_wdsh-head.png");
const IMG_DIALOG_BG  = require("../../../assets/page-img/mine_bg6.png");
const IMG_BTN_CANCEL = require("../../../assets/page-img/mine_bg8.png");
const IMG_BTN_SAVE   = require("../../../assets/page-img/mine_bg7.png");
const IMG_ICON9      = require("../../../assets/page-img/icon9.png");

// ── 颜色常量 ─────────────────────────────────────────────
const ORANGE  = "#DE792D";
const WHITE   = "#FFFFFF";
const MUTED   = "rgba(255,255,255,0.5)";
const BORDER  = "#7B7B7B";
const CELL_BG = "#000000";

// ── 弹窗字段类型 ─────────────────────────────────────────
type DialogType = "username" | "nationality" | "wechat_id" | null;

const DIALOG_CONFIG: Record<NonNullable<DialogType>, { title: string; placeholder: string }> = {
  username:    { title: "修改我的暱稱", placeholder: "請輸入暱稱" },
  nationality: { title: "修改國籍",     placeholder: "請輸入國籍" },
  wechat_id:   { title: "修改微信號",   placeholder: "請輸入微信號" },
};

export default function PersonalInfoScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const userId = session?.user.id ?? "";

  const [profile, setProfile]             = useState<Profile | null>(null);
  const [loading, setLoading]             = useState(true);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError]     = useState("");

  // 隐私开关
  const [swWechat,    setSwWechat]    = useState(false);
  const [swPhone,     setSwPhone]     = useState(true);
  const [swShowPhone, setSwShowPhone] = useState(true);

  // 编辑弹窗
  const [dialogType,  setDialogType]  = useState<DialogType>(null);
  const [dialogValue, setDialogValue] = useState("");
  const [saving,      setSaving]      = useState(false);
  const [dialogError, setDialogError] = useState("");  // 弹窗内错误提示
  const [toast,       setToast]       = useState("");

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2000);
  };

  const loadData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    // 共用去重層 sharedGet("profile")：與「我的」/首頁/錢包共享同一份 profile 緩存，
    // 避免每頁各自發請求重複打 WAF 導致時而攔截、時而顯示不全；失敗退避重試，不會永久空。
    const p = await sharedGet("profile", () => getProfile(userId), { shared: true }).catch(() => null);
    // 失敗時保留已有 profile（不覆蓋為空），避免「有時部分顯示」
    if (p) {
      setProfile(p);
      setSwWechat(p.show_wechat_to_downline ?? false);
      setSwPhone(p.show_phone_to_downline ?? false);
      setSwShowPhone(p.show_phone_to_upline ?? false);
    }
    setLoading(false);
  }, [userId]);

  // 進入本頁：直接讀取（共用 sharedGet 緩存，秒顯；無緩存才發請求）。不再用舊 requestQueue 的
  // cancelQueuedExcept —— 它與 sharedGet 不互通，反而會干擾其他頁面已排隊的讀取。
  useFocusEffect(useCallback(() => {
    (async () => { await loadData(); })();
  }, [loadData]));

  // ── 上传头像（限 5MB）──────────────────────────────────
  const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
  const handlePickAvatar = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [1, 1], quality: 0.7,
    });
    if (result.canceled || !result.assets[0]) return;
    setAvatarUploading(true);
    try {
      const asset = result.assets[0];
      if (asset.fileSize && asset.fileSize > AVATAR_MAX_BYTES) {
        setAvatarError("圖片不能超過 5MB");
        return;
      }
      const ext  = asset.uri.split(".").pop()?.toLowerCase() ?? "jpg";
      // 源頭修復：寫操作前獲取已校驗 userId，避免閉包空 userId 導致靜默失敗
      const uid = await getValidUserId();
      if (!uid) { setAvatarError("登錄已失效，請重新登錄"); setAvatarUploading(false); return; }
      const path = `${uid}/avatar.${ext}`;
      const res  = await fetch(asset.uri);
      const blob = await res.blob();
      if (blob.size > AVATAR_MAX_BYTES) { setAvatarError("圖片不能超過 5MB"); return; }
      setAvatarError("");
      const { error } = await supabase.storage.from("avatars").upload(path, blob, {
        upsert: true, contentType: `image/${ext}`,
      });
      if (!error) {
        const { data } = supabase.storage.from("avatars").getPublicUrl(path);
        const url = `${data.publicUrl}?t=${Date.now()}`;
        await updateProfile(userId, { avatar_url: url });
        setProfile((prev) => prev ? { ...prev, avatar_url: url } : prev);
      }
    } finally {
      setAvatarUploading(false);
    }
  };

  // ── 弹窗保存 ──────────────────────────────────────────
  const openDialog = (type: DialogType, current = "") => {
    setDialogType(type);
    setDialogValue(current);
    setDialogError("");  // 打开时清空上次错误
  };

  const handleSave = async () => {
    if (!dialogValue.trim()) {
      setDialogError("請輸入內容");  // 錯誤顯示在彈窗內
      return;
    }
    // 資料未完成載入時禁止保存：避免「部分數據未顯示就修改」導致靜默失敗/覆蓋
    if (loading || !profile) {
      setDialogError("資料加載中，請稍後再試");
      return;
    }
    setDialogError("");
    setSaving(true);
    // 源頭修復：寫操作前獲取已校驗 userId
    const uid = await getValidUserId();
    if (!uid) { setSaving(false); setDialogType(null); showToast("登錄已失效，請重新登錄"); return; }
    if (dialogType) {
      // 檢查返回值：失敗時不顯示「儲存成功」，避免「顯示成功但實際沒成功」
      const err = await updateProfile(uid, { [dialogType]: dialogValue.trim() });
      if (err) {
        setSaving(false);
        showToast("儲存失敗，請重試");
        return;
      }
      setProfile((prev) => prev ? { ...prev, [dialogType]: dialogValue.trim() } : prev);
    }
    setSaving(false);
    setDialogType(null);
    showToast("儲存成功");
  };

  // ── 开关保存 ──────────────────────────────────────────
  const handleToggle = async (
    field: "show_wechat_to_downline" | "show_phone_to_downline" | "show_phone_to_upline",
    value: boolean,
  ) => {
    // 資料未完成載入時禁止保存
    if (loading || !profile) {
      showToast("資料加載中，請稍後再試");
      return;
    }
    // 源頭修復：寫操作前獲取已校驗 userId
    const uid = await getValidUserId();
    if (!uid) { showToast("登錄已失效，請重新登錄"); return; }
    if (field === "show_wechat_to_downline") setSwWechat(value);
    else if (field === "show_phone_to_downline") setSwPhone(value);
    else setSwShowPhone(value);
    // 檢查返回值：失敗時提示，不靜默忽略
    const err = await updateProfile(uid, { [field]: value });
    if (err) { showToast("儲存失敗，請重試"); return; }
  };

  const accountName = profile?.phone ?? profile?.email ?? session?.user?.email ?? "—";

  if (!userId) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#000" }}>
        <ActivityIndicator size="large" color={ORANGE} />
        <Text allowFontScaling={false} style={{ color: "#999", fontSize: 13, marginTop: 12 }}>用戶信息校驗中…</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#000" }}>
        <ActivityIndicator size="large" color={ORANGE} />
        <Text allowFontScaling={false} style={{ color: "#999", fontSize: 13, marginTop: 12 }}>用戶信息校驗中…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="light" />

      {/* ── 全屏背景 ── */}
      <Image source={IMG_PAGE_BG} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="cover" />

      {/* ── NavBar（對齊推廣獎勵頁風格）── */}
      <View style={{
        position: "absolute", top: 0, left: 0, right: 0, zIndex: 100,
        paddingTop: insets.top + 12, paddingBottom: 12, paddingHorizontal: 16,
        flexDirection: "row", alignItems: "center", gap: 12,
        backgroundColor: "transparent",
      }}>
        <Pressable onPress={() => router.back()} className="active:opacity-70">
          <Image source={IMG_ICON9} style={{ width: 24, height: 24 }} contentFit="contain" />
        </Pressable>
        <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 20, fontWeight: "800" }}>
          個人資料設定
        </Text>
      </View>

      {/* ── 内容区 ── */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: insets.top + 44, paddingHorizontal: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 基础资料設置 ── */}
        <Text allowFontScaling={false} style={{ color: ORANGE, fontSize: 13, marginBottom: 10 }}>基礎資料設定</Text>
        <CellGroup>

          {/* 我的头像 — 可点击上传 */}
          <Pressable
            onPress={handlePickAvatar}
            disabled={avatarUploading}
            style={[styles.cellItem, { borderBottomWidth: 1, borderColor: BORDER }]}
            className="active:opacity-70"
          >
            <View>
              <Text allowFontScaling={false} style={styles.cellLabel}>我的頭像</Text>
              {!!avatarError && (
                <Text allowFontScaling={false} style={{ color: "#F43F5E", fontSize: 11, marginTop: 2 }}>{avatarError}</Text>
              )}
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              {avatarUploading ? (
                <ActivityIndicator size="small" color={ORANGE} />
              ) : (
                <View style={{ position: "relative" }}>
                  {profile?.avatar_url ? (
                    <Image source={{ uri: profile.avatar_url }} style={styles.cellAvatar} contentFit="cover" />
                  ) : (
                    <Image source={IMG_AVATAR_DEF} style={styles.cellAvatar} contentFit="cover" />
                  )}
                  <View style={{
                    position: "absolute", bottom: -2, right: -2,
                    width: 16, height: 16, borderRadius: 8,
                    backgroundColor: ORANGE, alignItems: "center", justifyContent: "center",
                  }}>
                    <Camera size={9} color="#fff" />
                  </View>
                </View>
              )}
              <ChevronRight size={14} color={MUTED} />
            </View>
          </Pressable>

          {/* 我的账号（只读） */}
          <CellItem isLast={false}>
            <Text allowFontScaling={false} style={styles.cellLabel}>我的帳號</Text>
            <Text allowFontScaling={false} style={styles.cellValue} numberOfLines={1}>{accountName}</Text>
          </CellItem>

          {/* 我的暱稱（可編輯） */}
          <Pressable
            onPress={() => openDialog("username", profile?.username ?? "")}
            style={[styles.cellItem, { borderBottomWidth: 1, borderColor: BORDER }]}
            className="active:opacity-70"
          >
            <Text allowFontScaling={false} style={styles.cellLabel}>我的暱稱</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Text allowFontScaling={false} style={styles.cellValue}>{profile?.username || "未設定"}</Text>
              <ChevronRight size={14} color={MUTED} />
            </View>
          </Pressable>

          {/* 國籍（可編輯） */}
          <CellItem isLast>
            <Pressable
              onPress={() => openDialog("nationality", profile?.nationality ?? "中國")}
              style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
              className="active:opacity-70"
            >
              <Text allowFontScaling={false} style={styles.cellLabel}>國籍</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Text allowFontScaling={false} style={styles.cellValue}>{profile?.nationality || "中國"}</Text>
                <ChevronRight size={14} color={MUTED} />
              </View>
            </Pressable>
          </CellItem>

          {/* 手机号/邮箱 — 已隐藏 */}
        </CellGroup>

        {/* ── 其他設置 ── */}
        <Text allowFontScaling={false} style={{ color: ORANGE, fontSize: 13, marginTop: 16, marginBottom: 10 }}>其他設定</Text>
        <CellGroup>

          {/* 微信（可编辑） */}
          <Pressable
            onPress={() => openDialog("wechat_id", profile?.wechat_id ?? "")}
            style={[styles.cellItem, { borderBottomWidth: 1, borderColor: BORDER }]}
            className="active:opacity-70"
          >
            <Text allowFontScaling={false} style={styles.cellLabel}>微信</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Text allowFontScaling={false} style={styles.cellValue}>{profile?.wechat_id || "未填写"}</Text>
              <ChevronRight size={14} color={MUTED} />
            </View>
          </Pressable>

          <SwitchRow label="是否展示微信給下級"    value={swWechat}    onValueChange={(v) => handleToggle("show_wechat_to_downline", v)} isLast={false} />
          <SwitchRow label="是否展示手機/郵箱給下級" value={swPhone}    onValueChange={(v) => handleToggle("show_phone_to_downline", v)}  isLast={false} />
          <SwitchRow label="是否向上級展示手機號"   value={swShowPhone} onValueChange={(v) => handleToggle("show_phone_to_upline", v)}    isLast />
        </CellGroup>

        <View style={{ height: insets.bottom + 24 }} />
      </ScrollView>

      {/* ── Toast ── */}
      {!!toast && (
        <View style={{
          position: "absolute", bottom: insets.bottom + 40, alignSelf: "center",
          backgroundColor: "rgba(0,0,0,0.75)", paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20,
        }}>
          <Text allowFontScaling={false} style={{ color: WHITE, fontSize: 14 }}>{toast}</Text>
        </View>
      )}

      {/* ── 编辑弹窗（昵称/国籍/微信） ── */}
      <Modal visible={!!dialogType} transparent animationType="fade">
        <Pressable
          style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.85)" }}
          onPress={() => setDialogType(null)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{ width: "84%", borderRadius: 12, overflow: "hidden" }}
          >
            <Image source={IMG_DIALOG_BG} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="fill" />
            <View style={{ paddingHorizontal: 20, paddingVertical: 16, alignItems: "center" }}>
              <Text allowFontScaling={false} style={{ color: WHITE, fontSize: 15, fontWeight: "bold", marginTop: 10, marginBottom: 15 }}>
                {dialogType ? DIALOG_CONFIG[dialogType].title : ""}
              </Text>
              <TextInput
                style={{
                  width: "100%", height: 42,
                  backgroundColor: CELL_BG,
                  borderWidth: 1,
                  borderColor: dialogError ? "#F43F5E" : BORDER,  // 错误时红色边框
                  borderRadius: 4,
                  paddingHorizontal: 12, fontSize: 12, color: WHITE,
                }}
                placeholder={dialogType ? DIALOG_CONFIG[dialogType].placeholder : ""}
                placeholderTextColor="#999"
                underlineColorAndroid="transparent"
                value={dialogValue}
                onChangeText={(v) => {
                  setDialogValue(v.replace(/[<>'";\\\u200B-\u200D\uFEFF]/g, ""));
                  if (dialogError) setDialogError("");  // 输入时清除错误
                }}
                maxLength={50}
                autoFocus
              />
              {/* 弹窗内错误提示 */}
              {!!dialogError && (
                <Text allowFontScaling={false} style={{ color: "#F43F5E", fontSize: 11, alignSelf: "flex-start", marginTop: 4 }}>
                  {dialogError}
                </Text>
              )}
              <View style={{ flexDirection: "row", gap: 15, marginTop: 15, marginBottom: 8 }}>
                <Pressable onPress={() => setDialogType(null)} style={{ width: 100, height: 37, borderRadius: 8, overflow: "hidden" }} className="active:opacity-80">
                  <Image source={IMG_BTN_CANCEL} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="fill" />
                  <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                    <Text allowFontScaling={false} style={{ color: WHITE, fontSize: 12 }}>取消</Text>
                  </View>
                </Pressable>
                <Pressable onPress={handleSave} disabled={saving || !userId} style={{ width: 100, height: 37, borderRadius: 8, overflow: "hidden" }} className="active:opacity-80">
                  <Image source={IMG_BTN_SAVE} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="fill" />
                  <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                    {saving
                      ? <ActivityIndicator size="small" color={WHITE} />
                      : <Text allowFontScaling={false} style={{ color: WHITE, fontSize: 12 }}>儲存</Text>
                    }
                  </View>
                </Pressable>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ── 子组件 ─────────────────────────────────────────────────

function CellGroup({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: "column", gap: 8 }}>{children}</View>;
}

function CellItem({ children, isLast }: { children: React.ReactNode; isLast: boolean }) {
  return (
    <View style={[styles.cellItem, !isLast && { borderBottomWidth: 1, borderColor: BORDER }]}>
      {children}
    </View>
  );
}

function SwitchRow({ label, value, onValueChange, isLast }: {
  label: string; value: boolean; onValueChange: (v: boolean) => void; isLast: boolean;
}) {
  return (
    <View style={[styles.cellItem, !isLast && { borderBottomWidth: 1, borderColor: BORDER }]}>
      <Text allowFontScaling={false} style={styles.cellLabel}>{label}</Text>
      <ToggleSwitch value={value} onValueChange={onValueChange} />
    </View>
  );
}

// ── 自定义开关：轨道高度 = 圆圈直径，打开橙色+白圈 ──────
const THUMB_SIZE = 20;
const TRACK_W    = 40;
const TRACK_H    = THUMB_SIZE;
const TRAVEL     = TRACK_W - THUMB_SIZE;

function ToggleSwitch({ value, onValueChange }: { value: boolean; onValueChange: (v: boolean) => void }) {
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;

  const toggle = () => {
    const next = !value;
    Animated.timing(anim, { toValue: next ? 1 : 0, duration: 180, useNativeDriver: false }).start();
    onValueChange(next);
  };

  const translateX = anim.interpolate({ inputRange: [0, 1], outputRange: [0, TRAVEL] });
  const bgColor    = anim.interpolate({ inputRange: [0, 1], outputRange: ["#555555", ORANGE] });

  return (
    <Pressable onPress={toggle} style={{ width: TRACK_W, height: TRACK_H, borderRadius: TRACK_H / 2, overflow: "hidden", justifyContent: "center" }}>
      <Animated.View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: bgColor, borderRadius: TRACK_H / 2 }} />
      <Animated.View style={{
        width: THUMB_SIZE, height: THUMB_SIZE, borderRadius: THUMB_SIZE / 2,
        backgroundColor: "#FFFFFF",
        transform: [{ translateX }],
        shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.25, shadowRadius: 2,
        elevation: 2,
      }} />
    </Pressable>
  );
}

// ── 样式 ────────────────────────────────────────────────────
const styles = {
  cellItem: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    height: 52,
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CELL_BG,
    borderRadius: 8,
  },
  cellLabel: { fontSize: 13, color: WHITE, flexShrink: 0 } as const,
  cellValue: { fontSize: 12, color: MUTED, flexShrink: 1, maxWidth: 200, textAlign: "right" as const } as const,
  cellAvatar: { width: 30, height: 30, borderRadius: 15 } as const,
};

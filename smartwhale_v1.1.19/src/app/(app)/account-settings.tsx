/* eslint-disable no-undef */
import { useState, useEffect, useCallback } from "react";
import {
  View, Text, TextInput, Pressable, ScrollView,
  KeyboardAvoidingView, StyleSheet, ActivityIndicator,
  NativeSyntheticEvent, NativeScrollEvent,
} from "react-native";
import { Image } from "expo-image";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { enqueue, cancelQueuedExcept } from "@/lib/requestQueue";
import { StatusBar } from "expo-status-bar";
import { Eye, EyeOff } from "lucide-react-native";
import { useSession, getValidUserId } from "@/ctx";
import { supabase } from "@/client/supabase";
import { setTradingPassword, verifyTradingPassword, simpleHash } from "@/db/api";

// ─── 设计规范 Token ────────────────────────────────────────
const OG2      = "#DE792D";
const MUTED    = "#999999";
const BORDER   = "rgba(123,123,123,0.5)";
const FIELD_BG = "rgba(0,0,0,0.5)";

// ─── 图片资源（模块级 require，Metro 静态分析必须）────────
const IMG_PAGE_BG   = require("../../../assets/page-img/cp_pagebg1.png");
const IMG_ICON9     = require("../../../assets/page-img/cp_icon9.png");
const IMG_BTN_LOGIN = require("../../../assets/page-img/btg111.png"); // 653×119
const BTN_RATIO     = 653 / 119;

// ─── 密码输入行组件 ────────────────────────────────────────
function PasswordField({
  value, onChange, placeholder, showPwd, onToggle,
}: {
  value: string; onChange: (v: string) => void;
  placeholder: string; showPwd: boolean; onToggle: () => void;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.fieldRow, { borderColor: focused ? OG2 : BORDER }]}>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={MUTED}
        underlineColorAndroid="transparent"
        secureTextEntry={!showPwd}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[styles.fieldInput,
          process.env.EXPO_OS === "web" ? { outlineWidth: 0, outlineStyle: "none" } as any : undefined,
        ]}
        allowFontScaling={false}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Pressable onPress={onToggle} style={styles.eyeBtn} className="active:opacity-70">
        {showPwd ? <Eye size={20} color={MUTED} /> : <EyeOff size={20} color={MUTED} />}
      </Pressable>
    </View>
  );
}

// ─── 主页面 ───────────────────────────────────────────────
export default function AccountSettingsScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const userId    = session?.user.id    ?? "";
  const userEmail = session?.user.email ?? "";

  // 滚动渐变 NavBar
  const [isScrolled, setIsScrolled] = useState(false);
  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setIsScrolled(e.nativeEvent.contentOffset.y > 50);
  };

  // 从 profiles 加载手机号/用户名 + 是否已設置交易密码
  const [profilePhone,    setProfilePhone]    = useState<string | null>(null);
  const [profileUsername, setProfileUsername] = useState<string | null>(null);
  const [hasPassword,     setHasPassword]     = useState<boolean | null>(null); // null=加载中

  useFocusEffect(useCallback(() => {
    if (!userId) return;
    if (userId) cancelQueuedExcept("account:" + userId);
    (async () => {
      // 本页读取入队（tag=account:userId），进入页面时已 cancelQueuedExcept 取消其他排隊 → 本页优先读取
      const { data } = await enqueue(() => supabase
        .from("profiles")
        .select("phone, username, trading_password_hash")
        .eq("id", userId)
        .maybeSingle(), { current: false }, "account:" + userId);
      if (data) {
        setProfilePhone(data.phone ?? null);
        setProfileUsername(data.username ?? null);
        setHasPassword(!!data.trading_password_hash);
      }
    })();
  }, [userId]));

  /** 進入頁面：基於本地 userId（與「我的」頁同源，零網絡請求）判斷 session 是否就緒，避免生產包 getUser 網絡校驗失敗導致永久卡「校驗中」 */
  useEffect(() => {
    if (!userId) return;
    if (userId) cancelQueuedExcept("account:" + userId);
    (async () => {
      // 本页读取入队（tag=account:userId），进入页面时已 cancelQueuedExcept 取消其他排隊 → 本页优先读取
      const { data } = await enqueue(() => supabase
        .from("profiles")
        .select("phone, username, trading_password_hash")
        .eq("id", userId)
        .maybeSingle(), { current: false }, "account:" + userId);
      setProfilePhone(data?.phone ?? null);
      setProfileUsername(data?.username ?? null);
      setHasPassword(!!data?.trading_password_hash);
    })();
  }, [userId]);

  /** 脱敏显示手机号：138****5678 */
  const maskPhone = (phone: string) => {
    const raw = phone.replace(/^\+?86/, "");
    if (raw.length >= 7) return raw.slice(0, 3) + "****" + raw.slice(-4);
    return raw;
  };

  /** 优先级：脱敏手机 > 用户名 > email > — */
  const displayAccount = profilePhone
    ? maskPhone(profilePhone)
    : profileUsername || userEmail || "—";

  // ── 表单状态 ──────────────────────────────────────────────
  const [oldPwd,     setOldPwd]     = useState("");
  const [newPwd,     setNewPwd]     = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [showOld,     setShowOld]     = useState(false);
  const [showNew,     setShowNew]     = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [success,  setSuccess]  = useState(false);

  const clearStatus = () => { setErrorMsg(""); setSuccess(false); };

  // ── 提交：完整驗證 + 真实 API ─────────────────────────────
  const handleSubmit = async () => {
    clearStatus();
    if (!newPwd)                              { setErrorMsg("请输入新交易密码"); return; }
    if (newPwd.length < 8)                    { setErrorMsg("交易密码至少需要 8 位"); return; }
    if (newPwd.length > 18)                   { setErrorMsg("交易密码不能超过 18 位"); return; }
    if (!/[A-Z]/.test(newPwd))               { setErrorMsg("交易密码必须包含大写字母"); return; }
    if (!/[a-z]/.test(newPwd))               { setErrorMsg("交易密码必须包含小写字母"); return; }
    if (!/[0-9]/.test(newPwd))               { setErrorMsg("交易密码必须包含数字"); return; }
    if (newPwd !== confirmPwd)               { setErrorMsg("两次密码不一致"); return; }

    setLoading(true);
    // 源頭修復：寫操作前獲取已校驗 userId，避免閉包空 userId 導致 verifyTradingPassword 查不到 / 靜默失敗
    const uid = await getValidUserId();
    if (!uid) { setLoading(false); setErrorMsg("登錄已失效，請重新登錄"); return; }
    // 已有密码时必须输入并校验原密码
    if (hasPassword) {
      if (!oldPwd) { setLoading(false); setErrorMsg("请输入原交易密码"); return; }
      const ok = await verifyTradingPassword(uid, simpleHash(oldPwd));
      if (!ok) { setLoading(false); setErrorMsg("原交易密码错误"); return; }
    }
    const { error } = await setTradingPassword(uid, simpleHash(newPwd), hasPassword ? simpleHash(oldPwd) : undefined);
    setLoading(false);
    if (error) { setErrorMsg(error); return; }
    setSuccess(true);
    setOldPwd(""); setNewPwd(""); setConfirmPwd("");
    // 0.8s 后返回上一页
    setTimeout(() => router.back(), 800);
  };

  if (!userId) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0A0A0A" }}>
        <ActivityIndicator size="large" color={OG2} />
        <Text allowFontScaling={false} style={{ color: "#999", fontSize: 13, marginTop: 12 }}>用戶信息校驗中…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#0A0A0A" }}>
      <StatusBar style="light" />

      {/* 全屏背景 page-bg1: 1080×1920 */}
      <Image source={IMG_PAGE_BG} style={StyleSheet.absoluteFillObject} contentFit="cover" />

      {/* 顶部 NavBar（對齊推廣獎勵頁風格） */}
      <View style={{
        paddingTop: insets.top + 12, paddingBottom: 12, paddingHorizontal: 16,
        flexDirection: "row", alignItems: "center", gap: 12,
        backgroundColor: isScrolled ? "rgba(0,0,0,0.7)" : "transparent",
      }}>
        <Pressable onPress={() => router.back()} className="active:opacity-70">
          <Image source={IMG_ICON9} style={{ width: 24, height: 24 }} contentFit="contain" />
        </Pressable>
        <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 20, fontWeight: "800" }}>
          交易密碼設置
        </Text>
      </View>

      {/* 主内容 */}
      <KeyboardAvoidingView
        behavior={process.env.EXPO_OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          onScroll={handleScroll}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingTop: insets.top + 16,
            paddingBottom: insets.bottom + 120,
            paddingHorizontal: 16,
          }}
          showsVerticalScrollIndicator={false}
        >
          {/* 当前账号（只读） */}
          <View style={styles.section}>
            <Text allowFontScaling={false} style={[styles.sectionLabel, { color: "rgba(255,255,255,0.4)" }]}>
              当前账号
            </Text>
            <View style={[styles.fieldRow, { marginTop: 8, borderColor: BORDER }]}>
              <Text allowFontScaling={false} style={styles.accountText}>{displayAccount}</Text>
            </View>
          </View>

          {/* 修改交易密码表单 */}
          <View style={[styles.section, { marginTop: 12 }]}>
            <Text allowFontScaling={false} style={styles.sectionLabel}>交易密码設置</Text>
            <View style={{ gap: 12, marginTop: 12 }}>
              {/* 原交易密码：首次設置时隐藏（hasPassword===false），加载中也隐藏 */}
              {hasPassword === true && (
                <PasswordField
                  value={oldPwd} onChange={(v) => { setOldPwd(v); clearStatus(); }}
                  placeholder="原交易密码"
                  showPwd={showOld} onToggle={() => setShowOld(v => !v)}
                />
              )}
              <PasswordField
                value={newPwd} onChange={(v) => { setNewPwd(v); clearStatus(); }}
                placeholder="新交易密码（8-18位，含大小写字母+数字）"
                showPwd={showNew} onToggle={() => setShowNew(v => !v)}
              />
              <PasswordField
                value={confirmPwd} onChange={(v) => { setConfirmPwd(v); clearStatus(); }}
                placeholder="確認新交易密码"
                showPwd={showConfirm} onToggle={() => setShowConfirm(v => !v)}
              />
            </View>
          </View>

          {/* 行内提示（错误/成功） */}
          {!!errorMsg && (
            <Text allowFontScaling={false} style={styles.errorText}>{errorMsg}</Text>
          )}
          {success && (
            <Text allowFontScaling={false} style={styles.successText}>✓ 交易密码修改成功</Text>
          )}

          {/* 提交按钮 btg111（登录页同款） */}
          <View style={{ alignItems: "center", marginTop: 20 }}>
            <Pressable
              onPress={handleSubmit}
              disabled={loading || !userId}
              className="active:opacity-80"
              style={{ width: "61%", aspectRatio: BTN_RATIO, position: "relative" }}
            >
              <Image source={IMG_BTN_LOGIN} style={StyleSheet.absoluteFillObject} contentFit="fill" />
              <View style={StyleSheet.absoluteFillObject as object} className="items-center justify-center">
                {loading
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 16, fontWeight: "700", letterSpacing: 1 }}>
                      確認修改
                    </Text>
                }
              </View>
            </Pressable>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── 样式表 ────────────────────────────────────────────────
const styles = StyleSheet.create({
  navBar: {
    position: "absolute",
    top: 0, left: 0, right: 0,
    zIndex: 100,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
  },
  section: {} as object,
  sectionLabel: {
    fontSize: 14,
    color: OG2,
    fontWeight: "600" as const,
  },
  fieldRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    backgroundColor: FIELD_BG,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  fieldInput: {
    flex: 1,
    color: "#fff",
    fontSize: 12,
    padding: 0,
    margin: 0,
  } as object,
  accountText: {
    flex: 1,
    color: "#fff",
    fontSize: 12,
    lineHeight: 20,
  },
  eyeBtn: { paddingLeft: 8 },
  errorText: {
    color: "#DE792D",
    fontSize: 12,
    textAlign: "center" as const,
    marginTop: 8,
  },
  successText: {
    color: "#63BB72",
    fontSize: 12,
    textAlign: "center" as const,
    marginTop: 8,
  },
});

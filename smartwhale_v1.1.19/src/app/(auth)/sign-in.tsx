/* eslint-disable no-undef */
/* eslint-disable */
// @ts-nocheck
import { useState, useEffect, useRef, useCallback } from "react";
import {
  View, Text, TextInput, Pressable, ScrollView,
  KeyboardAvoidingView, useWindowDimensions,
  Animated, ActivityIndicator, Modal,
} from "react-native";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { Stack, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Eye, EyeOff, KeyRound, ShieldX, Headphones } from "lucide-react-native";
import { Linking } from "react-native";
import AreaSelector, { DEFAULT_AREA_ID } from "@/components/AreaSelector";
import Reanimated, { useSharedValue, useAnimatedStyle, withTiming, withDelay, Easing, runOnJS } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import MaskedView from "@react-native-masked-view/masked-view";
import { supabase, functionsBase, supabaseAnonKeyExport } from "@/client/supabase";
import { createClient } from '@supabase/supabase-js';
import { callAuthRpc } from "@/lib/rpc";
import { useI18n } from "@/lib/i18n";
import { useVersionCheck } from "@/hooks/useVersionCheck";
import UpdateDialog from "@/components/UpdateDialog";
import React from "react";
import { saveLocalSessionToken, syncSessionFromClient, consumeKickedOutFlag, clearLocalSessionToken, clearSupabaseLocalSession } from "@/ctx";
import { withTimeout } from "@/lib/asyncTool";
import { setLoginActivity } from "@/lib/httpInterceptor";

// ── OTP 频率限制 ──
const OTP_HOUR_LIMIT = 5;
const OTP_DAY_LIMIT = 10;
const _otpSendLog: number[] = [];
function _cleanOtpLog() {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  while (_otpSendLog.length > 0 && _otpSendLog[0] < cutoff) _otpSendLog.shift();
}
function checkOtpRateLimit(): string | null {
  _cleanOtpLog();
  const now = Date.now();
  const hourAgo = now - 60 * 60 * 1000;
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const hourCount = _otpSendLog.filter(ts => ts > hourAgo).length;
  const dayCount  = _otpSendLog.filter(ts => ts >= todayStart.getTime()).length;
  if (hourCount >= OTP_HOUR_LIMIT) return `傳送過於頻繁，每小時最多 ${OTP_HOUR_LIMIT} 次`;
  if (dayCount  >= OTP_DAY_LIMIT)  return `今日已達上限（每日最多 ${OTP_DAY_LIMIT} 次）`;
  return null;
}
function recordOtpSend() { _otpSendLog.push(Date.now()); }

function detectAccountType(v: string): "phone" | "email" | "unknown" {
  if (/^\d{6,11}$/.test(v.trim())) return "phone";
  if (v.includes("@")) return "email";
  return "unknown";
}

async function extractFnError(data: any, error: any, fallback = "操作失敗，請稍後重試"): Promise<string> {
  if (data?.error) return data.error;
  if (error) {
    try { const b = await (error as any).context?.json?.(); if (b?.error) return b.error; } catch {}
    const raw: string = error.message ?? "";
    if (!raw || raw.toLowerCase().includes("non-2xx")) return fallback;
    return raw;
  }
  return fallback;
}

function translateAuthError(msg: string): string {
  if (!msg) return "操作失敗，請稍後重試";
  const m = msg.toLowerCase();
  if (m.includes("user not found") || m.includes("no user found")) return "賬號不存在，請先註冊";
  if (m.includes("already registered") || m.includes("already exists")) return "該賬號已註冊，請直接登入";
  if (m.includes("invalid login credentials") || m.includes("invalid password")) return "賬號或密碼錯誤，請重試";
  if (m.includes("email not confirmed")) return "郵箱尚未驗證，請查收確認郵件";
  if (m.includes("token has expired") || m.includes("otp expired") || m.includes("token is invalid")) return "驗證碼已過期或無效，請重新傳送";
  if (m.includes("rate limit") || m.includes("too many requests")) return "操作太頻繁，請稍後再試";
  if (m.includes("password should be at least")) return "密碼長度不足，請至少設定8位";
  if (m.includes("network") || m.includes("fetch")) return "網路異常，請檢查網路後重試";
  return msg;
}

function validatePasswordStrength(pwd: string): string | null {
  if (pwd.length < 8)   return "密碼至少需要8位";
  if (pwd.length > 18)  return "密碼不能超過18位";
  if (!/[A-Z]/.test(pwd)) return "密碼必須包含大寫字母";
  if (!/[a-z]/.test(pwd)) return "密碼必須包含小寫字母";
  if (!/[0-9]/.test(pwd)) return "密碼必須包含數字";
  return null;
}
function calcPasswordStrength(pwd: string): { level: 0|1|2|3|4; label: string; color: string } {
  if (!pwd) return { level: 0, label: "", color: "#FFFFFF20" };
  if (pwd.length < 8) return { level: 1, label: "弱", color: "#F43F5E" };
  const types = [/[A-Z]/.test(pwd), /[a-z]/.test(pwd), /[0-9]/.test(pwd)].filter(Boolean).length;
  if (types === 1) return { level: 2, label: "一般", color: "#F97316" };
  if (types === 2) return { level: 3, label: "良好", color: "#EAB308" };
  return { level: 4, label: "強", color: "#22C55E" };
}

// ── 图片资源 ──
const IMGS: Record<string, ReturnType<typeof require>> = {
  "page-bg2.png": require("../../../assets/page-img/page-bg2.png"),
  "logo2.png":    require("../../../assets/page-img/logo2.png"),
  "bg16.png":     require("../../../assets/page-img/bg16.png"),
  "bg17.png":     require("../../../assets/page-img/bg17.png"),
  "bg17a.png":    require("../../../assets/page-img/bg17a.png"),
  "bg18.png":     require("../../../assets/page-img/bg18.png"),
  "bg19.png":     require("../../../assets/page-img/bg19.png"),
  "btn1.png":     require("../../../assets/page-img/btn1.png"),
  "btn2.png":     require("../../../assets/page-img/btn2.png"),
  "btn4.png":     require("../../../assets/page-img/btn4.png"),
  "btg111.png":   require("../../../assets/page-img/btg111.png"),
  "btg222.png":   require("../../../assets/page-img/btg222.png"),
};
const IMG = (name: string) => IMGS[name];

// ── 粒子动效 ──
const PARTICLE_COUNT = 14;
interface Particle { tx: number; ty: number; delay: number; size: number; duration: number; }
function buildParticles(vw: number): Particle[] {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => {
    const angle = (i / PARTICLE_COUNT) * Math.PI * 2 + Math.random() * 0.4;
    const dist  = vw * (14 + Math.random() * 18);
    return { tx: Math.cos(angle) * dist, ty: Math.sin(angle) * dist, delay: Math.random() * 1800, size: vw * (1.2 + Math.random() * 1.6), duration: 1600 + Math.random() * 800 };
  });
}
function ParticleLayer({ vw }: { vw: number }) {
  const particles = useRef(buildParticles(vw)).current;
  const anims = useRef(particles.map(() => new Animated.Value(0))).current;
  useEffect(() => {
    const loops = anims.map((anim, i) => {
      const p = particles[i];
      return Animated.loop(Animated.sequence([
        Animated.delay(p.delay),
        Animated.timing(anim, { toValue: 1, duration: p.duration, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]));
    });
    loops.forEach(l => l.start());
    return () => loops.forEach(l => l.stop());
  }, []);
  const logoW = vw * 48.27;
  const logoH = logoW * (529 / 522);
  return (
    <View pointerEvents="none" style={{ position: "absolute", width: logoW, height: logoH, alignItems: "center", justifyContent: "center" }}>
      {particles.map((p, i) => {
        const opacity    = anims[i].interpolate({ inputRange: [0, 0.15, 0.7, 1], outputRange: [0, 1, 0.7, 0] });
        const translateX = anims[i].interpolate({ inputRange: [0, 1], outputRange: [0, p.tx] });
        const translateY = anims[i].interpolate({ inputRange: [0, 1], outputRange: [0, p.ty] });
        const scale      = anims[i].interpolate({ inputRange: [0, 0.15, 1], outputRange: [0.3, 1.2, 0.4] });
        return (
          <Animated.View key={i} style={{ position: "absolute", width: p.size, height: p.size, borderRadius: p.size / 2, backgroundColor: i % 3 === 0 ? "#FF8C00" : i % 3 === 1 ? "#FFA500" : "#E8520A", opacity, transform: [{ translateX }, { translateY }, { scale }] }} />
        );
      })}
    </View>
  );
}

// ── Shimmer 按钮 ──
const SHIMMER_INTERVAL = 3200;
const SHIMMER_DURATION = 700;
function ShimmerBtn({ children, onPress, style, disabled }: { children: React.ReactNode; onPress: () => void; style?: object; disabled?: boolean }) {
  const shimmerX = useSharedValue(-1);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        shimmerX.value = -1;
        shimmerX.value = withTiming(1, { duration: SHIMMER_DURATION, easing: Easing.out(Easing.quad) }, () => { runOnJS(schedule)(); });
      }, SHIMMER_INTERVAL);
    };
    schedule();
    return () => clearTimeout(timer);
  }, []);
  const shimmerStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shimmerX.value * 200 }] }));
  return (
    <Pressable onPress={disabled ? undefined : onPress} disabled={disabled} style={[{ overflow: "hidden", opacity: disabled ? 0.5 : 1 }, style]}>
      {children}
      <Reanimated.View style={[{ position: "absolute", top: 0, bottom: 0, width: "60%", left: "-10%" }, shimmerStyle]} pointerEvents="none">
        <LinearGradient colors={["transparent", "rgba(255,255,255,0.28)", "transparent"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1 }} />
      </Reanimated.View>
    </Pressable>
  );
}

// ── 输入行组件 ──
interface InputRowProps {
  value: string; onChange: (v: string) => void; placeholder: string;
  secure?: boolean; showToggle?: boolean; onToggle?: () => void; showing?: boolean;
  vw: number; rightSlot?: React.ReactNode;
  keyboardType?: "default" | "email-address" | "numeric" | "phone-pad";
  editable?: boolean;
}
function InputRow({ value, onChange, placeholder, secure, showToggle, onToggle, showing, vw, rightSlot, keyboardType, editable = true }: InputRowProps) {
  const [focused, setFocused] = React.useState(false);
  return (
    <View style={{ position: "relative", marginBottom: vw * 3.2, opacity: editable ? 1 : 0.55 }}>
      <Image source={focused && editable ? IMG("bg19.png") : IMG("bg18.png")} style={{ width: "100%", aspectRatio: 933 / 169 }} contentFit="fill" />
      <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, flexDirection: "row", alignItems: "center", paddingHorizontal: vw * 4 }}>
        <TextInput
          value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor="#999"
          secureTextEntry={secure && !showing} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          underlineColorAndroid="transparent" keyboardType={keyboardType ?? "default"}
          editable={editable}
          style={{ flex: 1, color: "#fff", fontSize: vw * 4.5, backgroundColor: "transparent", borderWidth: 0, outlineWidth: 0, ...(process.env.EXPO_OS === "web" ? { outline: "none" } as any : {}) }}
          autoCapitalize="none" autoCorrect={false}
        />
        {showToggle && (
          <Pressable onPress={editable ? onToggle : undefined}>{showing ? <Eye size={vw * 5} color="#999" /> : <EyeOff size={vw * 5} color="#999" />}</Pressable>
        )}
        {rightSlot}
      </View>
    </View>
  );
}

// ── 主页面 ──
export default function SignIn() {
  const { t } = useI18n();
  const { showUpdate, forceUpdate, latestVersion, localVersion, apkUrl, dismiss: dismissUpdate } = useVersionCheck();
  const [versionDialogOpen, setVersionDialogOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const vw = Math.min(width, 375) / 100;
  const [tab, setTab] = useState<"login" | "register">("login");
  const [areaIndex, setAreaIndex] = useState(DEFAULT_AREA_ID);

  const [account, setAccount] = useState("");
  const accountType = detectAccountType(account);
  const isPhone = accountType === "phone";
  const isEmail  = accountType === "email";

  const [loginPwd, setLoginPwd]         = useState("");
  const [showLoginPwd, setShowLoginPwd] = useState(false);
  const [loginCooldown, setLoginCooldown] = useState(0);
  const loginCooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [regPassword, setRegPassword]         = useState("");
  const [regConfirmPwd, setRegConfirmPwd]     = useState("");
  const [regShowPwd, setRegShowPwd]           = useState(false);
  const [regShowConfirm, setRegShowConfirm]   = useState(false);
  const [regOtp, setRegOtp]                   = useState("");
  const [regCountdown, setRegCountdown]       = useState(0);
  const [regOtpSent, setRegOtpSent]           = useState(false);
  const [emailRegOtp, setEmailRegOtp]                 = useState("");
  const [emailRegCountdown, setEmailRegCountdown]     = useState(0);
  const [emailRegOtpSent, setEmailRegOtpSent]         = useState(false);
  // sentPhone：記錄發送 OTP 時的手機號，防止用戶在發送後偷換號碼
  const [sentPhone, setSentPhone]             = useState("");
  const [inviteCode, setInviteCode]           = useState("");
  const [inviteCodeValid, setInviteCodeValid] = useState(false);
  const [regSuccess, setRegSuccess]           = useState(false);
  const [regSuccessCountdown, setRegSuccessCountdown] = useState(5);
  const regSuccessTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [resetModal, setResetModal]             = useState(false);
  const [resetStep, setResetStep]               = useState<1|2>(1);
  const [resetAccount, setResetAccount]         = useState("");
  const [resetOtp, setResetOtp]                 = useState("");
  const [resetCountdown, setResetCountdown]     = useState(0);
  const [resetNewPwd, setResetNewPwd]           = useState("");
  const [resetConfirm, setResetConfirm]         = useState("");
  const [resetShowPwd, setResetShowPwd]         = useState(false);
  const [resetShowConfirm, setResetShowConfirm] = useState(false);
  const [resetLoading, setResetLoading]         = useState(false);
  const [resetError, setResetError]             = useState("");
  const [resetSuccess, setResetSuccess]         = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [agreed, setAgreed]   = useState(false);

  // ── 封禁提示 Modal ──
  const [bannedModal, setBannedModal] = useState(false);
  const [bannedMsg, setBannedMsg]     = useState("");

  const cdTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const checkAgreed = () => { if (!agreed) { setError(t("auth", "agreeFirst")); return false; } return true; };

  // 偵測被頂號旗標：其他裝置登入後本機被強制登出，回到此頁時顯示提示
  useEffect(() => {
    if (consumeKickedOutFlag()) setError("您的帳號已在其他裝置登入，已自動登出");
  }, []);

  const startCountdown = useCallback((setter: React.Dispatch<React.SetStateAction<number>>, seconds = 120) => {
    if (cdTimerRef.current) clearInterval(cdTimerRef.current);
    const endAt = Date.now() + seconds * 1000;
    const tick = () => {
      const rem = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      setter(rem);
      if (rem <= 0) { clearInterval(cdTimerRef.current!); cdTimerRef.current = null; }
    };
    tick();
    cdTimerRef.current = setInterval(tick, 500);
  }, []);

  const startLoginCooldown = useCallback((seconds: number) => {
    if (loginCooldownRef.current) clearInterval(loginCooldownRef.current);
    const endAt = Date.now() + seconds * 1000;
    const tick = () => {
      const rem = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      setLoginCooldown(rem);
      if (rem <= 0) { clearInterval(loginCooldownRef.current!); loginCooldownRef.current = null; }
    };
    tick();
    loginCooldownRef.current = setInterval(tick, 500);
  }, []);

  useEffect(() => {
    if (loginCooldownRef.current) clearInterval(loginCooldownRef.current);
    setLoginCooldown(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account]);

  useEffect(() => {
    if (typeof localStorage !== "undefined") {
      const pending = localStorage.getItem("pending_invite_code");
      if (pending) { setInviteCode(pending.trim().toUpperCase()); setTab("register"); localStorage.removeItem("pending_invite_code"); }
    }
  }, []);

  useEffect(() => {
    if (regSuccessCountdown === 0 && regSuccess) handleTabChange("login");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regSuccessCountdown]);

  const showRegSuccess = () => {
    setRegSuccess(true);
    const endAt = Date.now() + 5_000;
    const tick = () => {
      const rem = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      setRegSuccessCountdown(rem);
      if (rem <= 0) { clearInterval(regSuccessTimerRef.current!); regSuccessTimerRef.current = null; }
    };
    if (regSuccessTimerRef.current) clearInterval(regSuccessTimerRef.current);
    tick();
    regSuccessTimerRef.current = setInterval(tick, 500);
  };

  const handleTabChange = (nextTab: "login" | "register") => {
    setTab(nextTab); setError("");
    setRegOtp(""); setRegOtpSent(false); setRegCountdown(0); setSentPhone("");
    setEmailRegOtp(""); setEmailRegOtpSent(false); setEmailRegCountdown(0);
    setInviteCode(""); setInviteCodeValid(false); setRegSuccess(false);
    if (regSuccessTimerRef.current) clearInterval(regSuccessTimerRef.current);
  };

  const handlePasswordLogin = async () => {

    if (!checkAgreed()) { return; }
    // 重登前彻底清掉可能残留的髒 session（內存 + AsyncStorage 舊 token），
    // 避免 supabase.functions.invoke 自帶髒 JWT 被 Functions 平台層拒絕（HTTP 418）→ 登入無反應
    try { const r = await supabase.auth.getSession(); } catch {}
    try { await clearSupabaseLocalSession(); } catch { /* ignore */ }
    try { await supabase.auth.setSession(null); } catch { /* ignore */ }
    try { await supabase.auth.signOut({ scope: "global" }); } catch { /* ignore */ }
    try { const r2 = await supabase.auth.getSession(); } catch {}
    if (!account.trim() || !loginPwd.trim()) { setError(t("auth", "inputAccount")); return; }
    if (!isPhone && !isEmail) { setError(t("auth", "invalidAccount")); return; }
    if (loginCooldown > 0) { setError(`賬號已被鎖定，請 ${loginCooldown} 秒後再試`); return; }
    setLoading(true); setError("");
    setLoginActivity(true); // 登入中：401 攔截器不觸發登出（FRD 4.4 排除登入中）
    try {

    const fnUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://base.smartwhale.net').replace(/\/$/, '') + '/functions/v1/password-login';
    const fnKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || supabaseAnonKeyExport || '';


    // 限速處理：後端 WAF 對「短時間多次請求」返回 418「超過限速請求被攔截」。
    // 不自动滚重试（避免長時間卡在重试循环），直接提示用戶 2 分鐘後再試即可。
    let loginData: any = null;
    let loginErr: any = null;
    try {
      const raw = await withTimeout(
        fetch(fnUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': fnKey },
          body: JSON.stringify({ account: account.trim(), password: loginPwd }),
        }).then(async (r) => ({ status: r.status, ok: r.ok, json: await r.json().catch(() => ({})) })),
        8000,
        "password-login"
      );

      if (raw.ok) { loginData = raw.json; }
      else {
        const bodyMsg = (raw.json && (raw.json.message || raw.json.error)) || '';
        const isRate = raw.status === 418 || /限速|超過|過於頻繁|rate|limit|too many/i.test(bodyMsg);
        if (isRate) { loginErr = { message: 'RATE_LIMITED', status: raw.status, body: raw.json }; }
        else { loginErr = { message: 'password-login http ' + raw.status, status: raw.status, body: raw.json }; }
        loginData = raw.json;
      }
    } catch (e: any) { loginErr = { message: e?.message ?? 'fetch failed' }; }

    setLoading(false);
    setLoginActivity(false);
    if (loginErr || !loginData?.success) {
      let respBody: Record<string, any> = (loginData as any) ?? {};
      if (respBody.locked && respBody.remaining > 0) { startLoginCooldown(respBody.remaining); setError(respBody.error ?? "賬號已被鎖定，請稍後再試"); return; }
      if (respBody.banned) {
        clearLocalSessionToken();
        supabase.auth.signOut().catch(() => {});
        setBannedMsg(respBody.error ?? "帳號已被限制使用，如有疑問請聯絡客服");
        setBannedModal(true);
        return;
      }
      const rawMsg = loginErr?.message ?? "";
      const fallback = (rawMsg && !rawMsg.toLowerCase().includes("non-2xx")) ? translateAuthError(rawMsg) : "";
      // 限速（WAF CC 攔截 418）：直接提示 2 分鐘後再試，不自动滚重试
      if (rawMsg === 'RATE_LIMITED') { setError("操作過於頻繁，請 2 分鐘後再試"); return; }
      setError(respBody.error ?? fallback ?? "登入失敗，請重試");
      return;
    }
    const { access_token, refresh_token, session_token } = loginData;
    // C 方案：重登前强制清掉 supabase-js 内存髒 session（RN 上 signOut 可能不可靠，但重登時主動清一次可覆蓋退出後殘留的髒態，避免重登攜帶髒 session 導致部分請求失敗/卡死）
    try { await withTimeout(supabase.auth.signOut({ scope: "local" }), 5000, "pre-login-signOut"); } catch { /* ignore */ }

    if (access_token && refresh_token) { try { await withTimeout(supabase.auth.setSession({ access_token, refresh_token }), 8000, "setSession"); } catch(e) { } }
    else
    // 保存 SSO session token，用於偵測帳號被其他裝置頂號
    if (session_token) saveLocalSessionToken(session_token);
    // 源頭修復：登入後把 session 同步寫入 ctx，確保進 Tab 時 userId 已就緒，避免首屏數據全空

    await syncSessionFromClient();

    // 主動跳轉到主頁（兜底，不純依賴路由守衛；避免「登入沒反應」）
    router.replace("/(app)" as any);

    } catch (e: any) {
      // 防御：invoke 超时/抛错时确保 loading 复位，避免按钮永久 disabled（「登入沒反應」）
      setLoading(false);
      setLoginActivity(false);
      setError("登入失敗，請重試");
    }
  };

  const handleSendRegOtp = async () => {
    if (!checkAgreed()) return;
    if (!account.trim() || !isPhone) { setError(t("auth", "phoneSmsOnly")); return; }
    const pwdErr = validatePasswordStrength(regPassword.trim());
    if (pwdErr) { setError(pwdErr); return; }
    if (regPassword.trim() !== regConfirmPwd.trim()) { setError(t("auth", "pwdMismatch")); return; }
    if (!inviteCode.trim()) { setError("請先填寫邀請碼"); return; }
    const limitErr = checkOtpRateLimit();
    if (limitErr) { setError(limitErr); return; }
    setLoading(true); setError("");
    const { data: codeRes, error: codeErr } = await supabase.functions.invoke("check-account-exists", { body: { type: "referral_code", value: inviteCode.trim() } });
    if (codeRes?.code === "RATE_LIMITED") { setLoading(false); setInviteCodeValid(false); setError(codeRes?.error || "操作過於頻繁，請稍後再試"); return; }
    if (codeErr || !codeRes?.success) { setLoading(false); setInviteCodeValid(false); setError("邀請碼無效，請檢查後重新輸入"); return; }
    if (!codeRes.exists) { setLoading(false); setInviteCodeValid(false); setError("邀請碼無效，請檢查後重新輸入"); return; }
    setInviteCodeValid(true);
    const ph = account.trim();
    const { data: phoneRes, error: phoneErr } = await supabase.functions.invoke("check-account-exists", { body: { type: "phone", value: ph } });
    if (phoneRes?.exists) { setLoading(false); setError("該手機號已註冊，請直接登入"); return; }
    if (phoneErr) { setLoading(false); setError("查詢失敗，請稍後重試"); return; }
    const { data: smsData, error: smsErr } = await supabase.functions.invoke("send-sms-otp", { body: { phone: ph, purpose: "register" } });
    setLoading(false);
    if (smsErr || !smsData?.success) { setError(await extractFnError(smsData, smsErr, "簡訊傳送失敗，請稍後重試")); return; }
    recordOtpSend(); setSentPhone(ph); setRegOtpSent(true); startCountdown(setRegCountdown);
  };

  const handleSendEmailRegOtp = async () => {
    if (!checkAgreed()) return;
    if (!account.trim() || !isEmail) { setError("請輸入有效的郵箱地址"); return; }
    const pwdErr = validatePasswordStrength(regPassword.trim());
    if (pwdErr) { setError(pwdErr); return; }
    if (regPassword.trim() !== regConfirmPwd.trim()) { setError(t("auth", "pwdMismatch")); return; }
    if (!inviteCode.trim()) { setError("請先填寫邀請碼"); return; }
    const limitErr = checkOtpRateLimit();
    if (limitErr) { setError(limitErr); return; }
    setLoading(true); setError("");
    const { data: codeRes, error: codeErr } = await supabase.functions.invoke("check-account-exists", { body: { type: "referral_code", value: inviteCode.trim() } });
    if (codeRes?.code === "RATE_LIMITED") { setLoading(false); setInviteCodeValid(false); setError(codeRes?.error || "操作過於頻繁，請稍後再試"); return; }
    if (codeErr || !codeRes?.success || !codeRes.exists) { setLoading(false); setInviteCodeValid(false); setError("邀請碼無效，請檢查後重新輸入"); return; }
    setInviteCodeValid(true);
    const { data: emailRes, error: emailErr } = await supabase.functions.invoke("check-account-exists", { body: { type: "email", value: account.trim() } });
    if (emailRes?.exists) { setLoading(false); setError("該郵箱已註冊，請直接登入"); return; }
    if (emailErr) { setLoading(false); setError("查詢失敗，請稍後重試"); return; }
    const { data: otpData, error: otpErr } = await supabase.functions.invoke("send-email-otp", { body: { email: account.trim(), purpose: "register" } });
    setLoading(false);
    if (otpErr || !otpData?.success) { setError(await extractFnError(otpData, otpErr, "郵件傳送失敗，請稍後重試")); return; }
    recordOtpSend(); setEmailRegOtpSent(true); startCountdown(setEmailRegCountdown);
  };

  const handleRegister = async () => {
    if (!checkAgreed()) return;
    if (!account.trim() || (!isPhone && !isEmail)) { setError(t("auth", "invalidAccount")); return; }
    const pwdErr = validatePasswordStrength(regPassword.trim());
    if (pwdErr) { setError(pwdErr); return; }
    if (regPassword.trim() !== regConfirmPwd.trim()) { setError(t("auth", "pwdMismatch")); return; }
    if (!inviteCode.trim()) { setError(t("auth", "inputInvite")); return; }
    setLoading(true); setError("");
    let userId: string | null = null;
    if (isPhone) {
      if (!regOtp.trim() || !/^\d{6}$/.test(regOtp.trim())) { setError("請輸入收到的6位數字驗證碼"); setLoading(false); return; }
      const { data: regData, error: regErr } = await supabase.functions.invoke("register-by-sms", { body: { phone: sentPhone || account.trim(), code: regOtp.trim(), password: regPassword.trim(), referral_code: inviteCode.trim() } });
      if (regErr || !regData?.success) {
        setLoading(false);
        const msg = await extractFnError(regData, regErr, "註冊失敗，請稍後重試");
        if (msg.includes("已註冊")) setError("該手機號已註冊，請直接登入");
        else if (msg.includes("驗證碼")) { setRegOtpSent(false); setRegOtp(""); setSentPhone(""); setError(msg); }
        else setError(msg);
        return;
      }
      userId = regData.userId ?? null;
    } else {
      if (!emailRegOtp.trim() || !/^\d{6}$/.test(emailRegOtp.trim())) { setError("請輸入收到的6位數字驗證碼"); setLoading(false); return; }
      const { data: regData, error: regErr } = await supabase.functions.invoke("register-by-email", { body: { email: account.trim(), code: emailRegOtp.trim(), password: regPassword.trim(), referral_code: inviteCode.trim() } });
      if (regErr || !regData?.success) {
        setLoading(false);
        const msg = await extractFnError(regData, regErr, "註冊失敗，請稍後重試");
        if (msg.includes("已註冊")) setError("該郵箱已註冊，請直接登入");
        else if (msg.includes("驗證碼")) { setEmailRegOtpSent(false); setEmailRegOtp(""); setError(msg); }
        else setError(msg);
        return;
      }
      userId = regData.userId ?? null;
    }
    setLoading(false);
    showRegSuccess();
  };

  // sentResetAccount：記錄發送重置 OTP 時的帳號，防止用戶在發送後偷換帳號
  const [sentResetAccount, setSentResetAccount] = useState("");
  const resetAccountType = detectAccountType(resetAccount);
  const resetIsPhone = resetAccountType === "phone";
  const resetIsEmail = resetAccountType === "email";

  const openResetModal = () => {
    setResetStep(1); setResetAccount(""); setResetOtp(""); setResetCountdown(0);
    setResetNewPwd(""); setResetConfirm(""); setResetShowPwd(false);
    setResetShowConfirm(false); setResetError(""); setResetSuccess(false);
    setSentResetAccount("");
    setResetModal(true);
  };

  const handleSendResetOtp = async () => {
    if (!resetAccount.trim() || (!resetIsPhone && !resetIsEmail)) { setResetError(t("auth", "invalidAccount")); return; }
    setResetLoading(true); setResetError("");
    const ph = resetAccount.trim();
    const checkType = resetIsPhone ? "phone" : "email";
    const { data: existRes, error: existErr } = await supabase.functions.invoke("check-account-exists", { body: { type: checkType, value: ph } });
    if (existRes?.code === "RATE_LIMITED") { setResetLoading(false); setResetError(existRes?.error || "操作過於頻繁，請稍後再試"); return; }
    if (existErr) { setResetLoading(false); setResetError("查詢失敗，請稍後重試"); return; }
    if (!existRes?.exists) { setResetLoading(false); setResetError(t("auth", "accountNotFound")); return; }
    const limitErr = checkOtpRateLimit();
    if (limitErr) { setResetLoading(false); setResetError(limitErr); return; }
    if (resetIsPhone) {
      const { data: smsData, error: smsErr } = await supabase.functions.invoke("send-sms-otp", { body: { phone: ph, purpose: "reset_password" } });
      setResetLoading(false);
      if (smsErr || !smsData?.success) { setResetError(await extractFnError(smsData, smsErr, "簡訊傳送失敗")); return; }
    } else {
      const { data, error: e } = await supabase.functions.invoke("send-email-otp", { body: { email: ph, purpose: "reset_password" } });
      setResetLoading(false);
      if (e || !data?.success) { setResetError(await extractFnError(data, e, "郵件傳送失敗")); return; }
    }
    recordOtpSend(); startCountdown(setResetCountdown); setSentResetAccount(ph); setResetStep(2);
  };

  const handleResetPassword = async () => {
    if (!resetOtp.trim()) { setResetError(t("auth", "inputOtp")); return; }
    const pwdErr = validatePasswordStrength(resetNewPwd.trim());
    if (pwdErr) { setResetError(pwdErr); return; }
    if (resetNewPwd.trim() !== resetConfirm.trim()) { setResetError(t("auth", "pwdMismatch")); return; }
    setResetLoading(true); setResetError("");
    const fn = resetIsPhone ? "reset-password-by-sms" : "reset-password-by-email";
    const body = resetIsPhone
      ? { phone: sentResetAccount || resetAccount.trim(), code: resetOtp.trim(), newPassword: resetNewPwd.trim() }
      : { email: sentResetAccount || resetAccount.trim(), code: resetOtp.trim(), newPassword: resetNewPwd.trim() };
    const { data: resetData, error: resetErr } = await supabase.functions.invoke(fn, { body });
    setResetLoading(false);
    if (resetErr || !resetData?.success) { setResetError(await extractFnError(resetData, resetErr, "驗證碼錯誤或已過期，請重新傳送")); return; }
    setResetSuccess(true);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />
      <Image source={IMG("page-bg2.png")} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="cover" />

      {/* 右上角节点选择器 */}
      <View style={{ position: "absolute", top: insets.top + vw * 8, right: vw * 4, zIndex: 10 }}>
        <AreaSelector areaIndex={areaIndex} onSelect={setAreaIndex} />
      </View>

      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + vw * 10, paddingBottom: insets.bottom + vw * 8, paddingHorizontal: vw * 4, alignItems: "center", justifyContent: "center", gap: vw * 3 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* 新版本横幅 */}
        {showUpdate && (
          <Pressable onPress={() => setVersionDialogOpen(true)} style={{ flexDirection: "row", alignItems: "center", gap: vw * 2, paddingHorizontal: vw * 3, paddingVertical: vw * 2, borderRadius: vw * 2.67, backgroundColor: "#EAB30818", borderWidth: 1, borderColor: "#EAB30840", width: "100%" }}>
            <View style={{ width: vw * 2, height: vw * 2, borderRadius: vw, backgroundColor: "#EAB308" }} />
            <Text allowFontScaling={false} style={{ color: "#EAB308", fontSize: vw * 3, fontWeight: "600", flex: 1 }}>發現新版本 v{latestVersion}，點選更新</Text>
          </Pressable>
        )}

        {/* logo + 粒子 */}
        <View style={{ alignItems: "center", justifyContent: "center" }}>
          <ParticleLayer vw={vw} />
          <Image source={IMG("logo2.png")} style={{ width: vw * 48.27, aspectRatio: 522 / 455 }} contentFit="contain" />
          {process.env.EXPO_OS === "web" ? (
            <Text allowFontScaling={false} style={{ fontSize: vw * 3.8, fontWeight: "700", letterSpacing: 1.5, marginTop: vw * 1.5, background: "linear-gradient(90deg,#FFD700,#E8A020,#FFF0A0,#E8A020)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" } as any}>開啟您的挖礦之旅</Text>
          ) : (
            <MaskedView maskElement={<Text allowFontScaling={false} style={{ fontSize: vw * 3.8, fontWeight: "700", letterSpacing: 1.5, marginTop: vw * 1.5, backgroundColor: "transparent" }}>開啟您的挖礦之旅</Text>}>
              <LinearGradient colors={["#FFD700", "#E8A020", "#FFF0A0", "#E8A020"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ marginTop: vw * 1.5 }}>
                <Text allowFontScaling={false} style={{ fontSize: vw * 3.8, fontWeight: "700", letterSpacing: 1.5, opacity: 0 }}>開啟您的挖礦之旅</Text>
              </LinearGradient>
            </MaskedView>
          )}
        </View>

        {/* 主卡片 bg16 — 背景拉伸自适应内容高度 */}
        <View style={{ width: "100%", position: "relative" }}>
          <Image source={IMG("bg16.png")} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="fill" />
          <View style={{ padding: vw * 2.93 }}>

            {/* Tab 切换 */}
            <View style={{ position: "relative", marginTop: vw * 0.53, marginBottom: vw * 4.27 }}>
              <Image source={IMG("bg17.png")} style={{ width: "100%", aspectRatio: 934 / 131 }} contentFit="fill" />
              <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, flexDirection: "row", alignItems: "center", paddingHorizontal: vw * 1.33, gap: vw * 2.67 }}>
                {(["login", "register"] as const).map((tabKey) => (
                  <Pressable key={tabKey} onPress={() => handleTabChange(tabKey)} style={{ flex: 1, borderRadius: vw * 26.67, alignItems: "center", justifyContent: "center", overflow: "hidden", alignSelf: "stretch" }}>
                    {tab === tabKey && <Image source={IMG("bg17a.png")} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="fill" />}
                    <Text allowFontScaling={false} style={{ color: "#fff", fontSize: vw * 3.73, fontWeight: "600", zIndex: 1 }}>{tabKey === "login" ? "登錄" : "註冊"}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* ── 登录 Tab ── */}
            {tab === "login" && (
              <>
                <InputRow value={account} onChange={v => { setAccount(v); setError(""); }} placeholder={t("auth", "account")} keyboardType="email-address" vw={vw} />
                <View style={{ marginBottom: vw * 2 }}>
                  <InputRow value={loginPwd} onChange={setLoginPwd} placeholder={t("auth", "loginPwdHint")} secure showToggle showing={showLoginPwd} onToggle={() => setShowLoginPwd(!showLoginPwd)} vw={vw} />
                </View>
                {error ? <Text allowFontScaling={false} style={{ color: "#F43F5E", fontSize: vw * 3.8, marginBottom: vw * 2, textAlign: "center", fontWeight: "600" }}>{error}</Text> : null}
                {loginCooldown > 0 && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: vw * 2, padding: vw * 3, borderRadius: vw * 2.67, backgroundColor: "#F43F5E18", borderWidth: 1, borderColor: "#F43F5E30", marginBottom: vw * 2 }}>
                    <Text allowFontScaling={false} style={{ fontSize: vw * 3.5 }}>🔒</Text>
                    <Text allowFontScaling={false} style={{ color: "#F43F5E", fontSize: vw * 3, flex: 1 }}>{`賬號已暫時鎖定，請 ${loginCooldown} 秒後重試`}</Text>
                  </View>
                )}
                <View style={{ alignItems: "center", gap: vw * 2.67, marginTop: 10, marginBottom: 10 }}>
                  <ShimmerBtn onPress={handlePasswordLogin} disabled={loading || loginCooldown > 0}>
                    <Image source={IMG("btg111.png")} style={{ width: vw * 60.53, aspectRatio: 653 / 119 }} contentFit="contain" />
                    <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
                      {loading ? <ActivityIndicator color="#fff" size="small" /> : loginCooldown > 0 ? <Text allowFontScaling={false} style={{ color: "#fff", fontSize: vw * 3, fontWeight: "700" }}>{loginCooldown}s 後可重試</Text> : <Text allowFontScaling={false} style={{ color: "#fff", fontSize: vw * 3.5, fontWeight: "800", letterSpacing: 1 }}>立即登錄</Text>}
                    </View>
                  </ShimmerBtn>
                  <ShimmerBtn onPress={openResetModal}>
                    <Image source={IMG("btg222.png")} style={{ width: vw * 60.53, aspectRatio: 653 / 101 }} contentFit="contain" />
                    <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
                      <Text allowFontScaling={false} style={{ color: "#fff", fontSize: vw * 3.5, fontWeight: "800", letterSpacing: 1 }}>修改密碼</Text>
                    </View>
                  </ShimmerBtn>
                </View>
              </>
            )}

            {/* ── 註冊 Tab ── */}
            {tab === "register" && (
              <>
                {regSuccess ? (
                  <View style={{ borderRadius: vw * 4, overflow: "hidden", borderWidth: 1, borderColor: "#FFFFFF15", marginBottom: vw * 3 }}>
                    <LinearGradient colors={["#E8520A30", "#000"]} style={{ paddingVertical: vw * 7, alignItems: "center", gap: vw * 2 }}>
                      <Text allowFontScaling={false} style={{ fontSize: vw * 12 }}>🎉</Text>
                      <Text allowFontScaling={false} style={{ color: "#fff", fontSize: vw * 5, fontWeight: "800", marginTop: vw }}>註冊成功！</Text>
                      <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: vw * 3.3, textAlign: "center", lineHeight: vw * 5 }}>歡迎加入 SmartWhale！{"\n"}請使用您的賬號和密碼登入。</Text>
                    </LinearGradient>
                    <View style={{ paddingHorizontal: vw * 5, paddingBottom: vw * 5, gap: vw * 3, backgroundColor: "#0A0A0A" }}>
                      <View style={{ height: 1, backgroundColor: "#FFFFFF15" }} />
                      <Text allowFontScaling={false} style={{ color: "#FFFFFF40", fontSize: vw * 2.8, textAlign: "center" }}>賬號已建立完成，請重新登入以進入系統</Text>
                      <Pressable onPress={() => { if (regSuccessTimerRef.current) clearInterval(regSuccessTimerRef.current); handleTabChange("login"); }} style={{ paddingVertical: vw * 4, borderRadius: vw * 3, alignItems: "center", backgroundColor: "#E8520A" }}>
                        <Text allowFontScaling={false} style={{ color: "#fff", fontWeight: "700", fontSize: vw * 3.8 }}>立即登入（{regSuccessCountdown}s）</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <>
                    <InputRow value={account} onChange={v => { setAccount(v); setError(""); }} placeholder={t("auth", "account")} keyboardType="email-address" editable={!regOtpSent && !emailRegOtpSent} vw={vw} />
                    {account.trim().length > 0 && (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: vw * 1.5, marginTop: -vw * 2, marginBottom: vw * 2 }}>
                        <View style={{ width: vw * 1.5, height: vw * 1.5, borderRadius: vw, backgroundColor: isPhone || isEmail ? "#22C55E" : "#F43F5E" }} />
                        <Text allowFontScaling={false} style={{ color: isPhone || isEmail ? "#22C55E" : "#FFFFFF60", fontSize: vw * 2.8 }}>
                          {isPhone ? t("auth", "phoneRegister") : isEmail ? t("auth", "emailRegister") : t("auth", "invalidAccount")}
                        </Text>
                      </View>
                    )}
                    <InputRow value={regPassword} onChange={setRegPassword} placeholder={t("auth", "regPwdHint")} secure showToggle showing={regShowPwd} onToggle={() => setRegShowPwd(!regShowPwd)} vw={vw} />
                    {regPassword.length > 0 && (() => {
                      const { level, label, color } = calcPasswordStrength(regPassword);
                      return (
                        <View style={{ gap: vw * 1.5, marginTop: -vw * 2, marginBottom: vw * 2 }}>
                          <View style={{ flexDirection: "row", gap: vw }}>
                            {[1,2,3,4].map(seg => <View key={seg} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: seg <= level ? color : "#FFFFFF15" }} />)}
                          </View>
                          <Text allowFontScaling={false} style={{ fontSize: vw * 2.8, color: level <= 1 ? "#F43F5E" : color }}>密碼強度：{label}</Text>
                        </View>
                      );
                    })()}
                    <InputRow value={regConfirmPwd} onChange={setRegConfirmPwd} placeholder={t("auth", "confirmPwdHint")} secure showToggle showing={regShowConfirm} onToggle={() => setRegShowConfirm(!regShowConfirm)} vw={vw} />
                    <InputRow value={inviteCode} onChange={v => { setInviteCode(v); setInviteCodeValid(false); setError(""); }} placeholder={t("auth", "inviteCodeHint")} vw={vw} />
                    {inviteCodeValid && (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: vw * 1.5, marginTop: -vw * 2, marginBottom: vw * 2 }}>
                        <View style={{ width: vw * 1.5, height: vw * 1.5, borderRadius: vw, backgroundColor: "#22C55E" }} />
                        <Text allowFontScaling={false} style={{ color: "#22C55E", fontSize: vw * 2.8 }}>邀請碼有效</Text>
                      </View>
                    )}
                    {isPhone && (
                      <InputRow value={regOtp} onChange={v => { setRegOtp(v); setError(""); }} placeholder="簡訊驗證碼（6位）" keyboardType="numeric" vw={vw}
                        rightSlot={<Pressable onPress={handleSendRegOtp} disabled={regCountdown > 0 || loading} style={{ paddingHorizontal: vw * 2.5, paddingVertical: vw * 1.2, borderRadius: vw * 2, borderWidth: 1, borderColor: regCountdown > 0 ? "#555" : "#E8520A" }}>
                          <Text allowFontScaling={false} style={{ color: regCountdown > 0 ? "#555" : "#E8520A", fontSize: vw * 2.8 }}>{regCountdown > 0 ? `${regCountdown}s` : "傳送驗證碼"}</Text>
                        </Pressable>}
                      />
                    )}
                    {isEmail && (
                      <InputRow value={emailRegOtp} onChange={v => { setEmailRegOtp(v); setError(""); }} placeholder="郵箱驗證碼（6位）" keyboardType="numeric" vw={vw}
                        rightSlot={<Pressable onPress={handleSendEmailRegOtp} disabled={emailRegCountdown > 0 || loading} style={{ paddingHorizontal: vw * 2.5, paddingVertical: vw * 1.2, borderRadius: vw * 2, borderWidth: 1, borderColor: emailRegCountdown > 0 ? "#555" : "#E8520A" }}>
                          <Text allowFontScaling={false} style={{ color: emailRegCountdown > 0 ? "#555" : "#E8520A", fontSize: vw * 2.8 }}>{emailRegCountdown > 0 ? `${emailRegCountdown}s` : "傳送驗證碼"}</Text>
                        </Pressable>}
                      />
                    )}
                    {(regOtpSent || emailRegOtpSent) && (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: vw * 1.5, marginTop: -vw * 2, marginBottom: vw * 2 }}>
                        <View style={{ width: vw * 1.5, height: vw * 1.5, borderRadius: vw, backgroundColor: "#22C55E" }} />
                        <Text allowFontScaling={false} style={{ color: "#22C55E", fontSize: vw * 2.8 }}>{isPhone ? "驗證碼已傳送，請查收簡訊" : "驗證碼已傳送至郵箱"}</Text>
                      </View>
                    )}
                    {error ? <Text allowFontScaling={false} style={{ color: "#F43F5E", fontSize: vw * 3.8, marginBottom: vw * 2, textAlign: "center", fontWeight: "600" }}>{error}</Text> : null}
                    <View style={{ alignItems: "center", marginTop: vw * 2 + 10, marginBottom: 10 }}>
                      <ShimmerBtn onPress={handleRegister} disabled={loading}>
                        <Image source={IMG("btg111.png")} style={{ width: vw * 60.53, aspectRatio: 653 / 119 }} contentFit="contain" />
                        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
                          {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text allowFontScaling={false} style={{ color: "#fff", fontSize: vw * 3.5, fontWeight: "800", letterSpacing: 1 }}>立即註冊</Text>}
                        </View>
                      </ShimmerBtn>
                    </View>
                  </>
                )}
              </>
            )}
          </View>
        </View>

        {/* 用户协议 */}
        <Pressable onPress={() => { setAgreed(!agreed); setError(""); }} style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: vw * 2 }}>
          <View style={{ width: vw * 3.73, height: vw * 3.73, borderRadius: 3, borderWidth: 1, borderColor: agreed ? "#E8520A" : "#999", backgroundColor: agreed ? "#E8520A" : "transparent", alignItems: "center", justifyContent: "center" }}>
            {agreed && <Text allowFontScaling={false} style={{ color: "#fff", fontSize: vw * 2.5 }}>✓</Text>}
          </View>
          <Text allowFontScaling={false} style={{ color: "#999", fontSize: vw * 3.2 }}>
            {t("auth", "agreeText")}{" "}
            <Text allowFontScaling={false} style={{ color: "#AD481E" }}>{t("auth", "userAgreement")}</Text>
            {" "}{t("auth", "and")}{" "}
            <Text allowFontScaling={false} style={{ color: "#AD481E" }}>{t("auth", "privacyPolicy")}</Text>
          </Text>
        </Pressable>

        <Text allowFontScaling={false} style={{ color: "#555", fontSize: vw * 2.93, textAlign: "center", marginTop: vw * 2 }}>
          © 2026 SmartWhale. All Rights Reserved.
        </Text>
      </ScrollView>

      {/* 找回密码 Modal */}
      <Modal visible={resetModal} transparent animationType="slide">
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.75)" }} onPress={() => setResetModal(false)} />
        <KeyboardAvoidingView behavior="padding">
          <View style={{ backgroundColor: "#000", borderTopLeftRadius: vw * 8, borderTopRightRadius: vw * 8, borderTopWidth: 1.5, borderColor: "#E8520A35" }}>
            <View style={{ width: vw * 10, height: vw, borderRadius: vw, backgroundColor: "#E8520A40", alignSelf: "center", marginTop: vw * 3, marginBottom: vw }} />
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: vw * 6, paddingVertical: vw * 4 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: vw * 2 }}>
                <KeyRound size={vw * 4.5} color="#E8520A" />
                <Text allowFontScaling={false} style={{ color: "#fff", fontSize: vw * 5, fontWeight: "700" }}>{t("auth", "resetPwdTitle")}</Text>
              </View>
              <Pressable onPress={() => setResetModal(false)} style={{ padding: vw }}>
                <Text allowFontScaling={false} style={{ color: "#FFFFFF40", fontSize: vw * 5 }}>✕</Text>
              </Pressable>
            </View>
            <View style={{ paddingHorizontal: vw * 6, paddingBottom: vw * 10, gap: vw * 3 }}>
              {resetSuccess ? (
                <View style={{ alignItems: "center", paddingVertical: vw * 8, gap: vw * 4 }}>
                  <Text allowFontScaling={false} style={{ fontSize: vw * 12 }}>✅</Text>
                  <Text allowFontScaling={false} style={{ color: "#fff", fontSize: vw * 4.5, fontWeight: "700" }}>{t("auth", "resetSuccess")}</Text>
                  <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: vw * 3.5, textAlign: "center" }}>{t("auth", "resetSuccessHint")}</Text>
                  <Pressable onPress={() => setResetModal(false)} style={{ paddingHorizontal: vw * 8, paddingVertical: vw * 3, borderRadius: vw * 3, backgroundColor: "#E8520A", marginTop: vw * 2 }}>
                    <Text allowFontScaling={false} style={{ color: "#fff", fontWeight: "700" }}>{t("auth", "backToLogin")}</Text>
                  </Pressable>
                </View>
              ) : resetStep === 1 ? (
                <>
                  <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: vw * 3.5 }}>{t("auth", "resetStep1Hint")}</Text>
                  <InputRow value={resetAccount} onChange={v => { setResetAccount(v); setResetError(""); }} placeholder={t("auth", "account")} keyboardType="email-address" vw={vw} />
                  {resetAccount.trim().length > 0 && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: vw * 1.5, marginTop: -vw * 2 }}>
                      <View style={{ width: vw * 1.5, height: vw * 1.5, borderRadius: vw, backgroundColor: resetIsPhone || resetIsEmail ? "#22C55E" : "#F43F5E" }} />
                      <Text allowFontScaling={false} style={{ color: resetIsPhone || resetIsEmail ? "#22C55E" : "#FFFFFF60", fontSize: vw * 2.8 }}>
                        {resetIsPhone ? t("auth", "phoneLabel") : resetIsEmail ? t("auth", "emailLabel") : t("auth", "invalidAccount")}
                      </Text>
                    </View>
                  )}
                  {resetError ? <Text allowFontScaling={false} style={{ color: "#F43F5E", fontSize: vw * 3.3 }}>{resetError}</Text> : null}
                  <View style={{ position: "relative", alignItems: "center" }}>
                    <Image source={IMG("btg111.png")} style={{ width: "100%", aspectRatio: 653 / 119 }} contentFit="fill" />
                    <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
                      {resetLoading ? <ActivityIndicator color="#fff" /> : <Text allowFontScaling={false} style={{ color: "#fff", fontWeight: "800", fontSize: vw * 4.2, letterSpacing: 1 }}>{t("auth", "sendCode")}</Text>}
                    </View>
                    <Pressable onPress={handleSendResetOtp} disabled={resetLoading} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
                  </View>
                </>
              ) : (
                <>
                  <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: vw * 3.5 }}>
                    {t("auth", "resetStep2Hint")} <Text allowFontScaling={false} style={{ color: "#E8520A" }}>{resetAccount}</Text>
                  </Text>
                  <InputRow value={resetOtp} onChange={v => { setResetOtp(v); setResetError(""); }} placeholder="驗證碼（6位）" keyboardType="numeric" vw={vw}
                    rightSlot={
                      <View style={{ position: "relative", width: vw * 22, height: vw * 8 }}>
                        <Image source={IMG("btg111.png")} style={{ width: "100%", height: "100%" }} contentFit="fill" />
                        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
                          <Text allowFontScaling={false} style={{ color: resetCountdown > 0 ? "#fff8" : "#fff", fontSize: vw * 2.8, fontWeight: "700" }}>{resetCountdown > 0 ? `${resetCountdown}s` : "重新傳送"}</Text>
                        </View>
                        <Pressable onPress={handleSendResetOtp} disabled={resetCountdown > 0 || resetLoading} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: resetCountdown > 0 ? 0.5 : 1 }} />
                      </View>
                    }
                  />
                  <InputRow value={resetNewPwd} onChange={v => { setResetNewPwd(v); setResetError(""); }} placeholder={t("auth", "newPwd")} secure showToggle showing={resetShowPwd} onToggle={() => setResetShowPwd(!resetShowPwd)} vw={vw} />
                  <InputRow value={resetConfirm} onChange={v => { setResetConfirm(v); setResetError(""); }} placeholder={t("auth", "confirmNewPwd")} secure showToggle showing={resetShowConfirm} onToggle={() => setResetShowConfirm(!resetShowConfirm)} vw={vw} />
                  {resetError ? <Text allowFontScaling={false} style={{ color: "#F43F5E", fontSize: vw * 3.3 }}>{resetError}</Text> : null}
                  <View style={{ flexDirection: "row", gap: vw * 3 }}>
                    <Pressable onPress={() => setResetStep(1)} style={{ flex: 1, paddingVertical: vw * 4, borderRadius: vw * 3, alignItems: "center", backgroundColor: "#0A0A0A", borderWidth: 1, borderColor: "#FFFFFF15" }}>
                      <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontWeight: "600" }}>{t("auth", "prevStep")}</Text>
                    </Pressable>
                    <Pressable onPress={handleResetPassword} disabled={resetLoading} style={{ flex: 1, paddingVertical: vw * 4, borderRadius: vw * 3, alignItems: "center", backgroundColor: "#E8520A", opacity: resetLoading ? 0.6 : 1 }}>
                      {resetLoading ? <ActivityIndicator color="#fff" /> : <Text allowFontScaling={false} style={{ color: "#fff", fontWeight: "700" }}>{t("auth", "confirmChange")}</Text>}
                    </Pressable>
                  </View>
                </>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── 封禁提示 Modal ── */}
      <Modal visible={bannedModal} transparent animationType="fade" onRequestClose={() => setBannedModal(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.72)", alignItems: "center", justifyContent: "center", paddingHorizontal: vw * 6 }}>
          <View style={{ backgroundColor: "#1A1A2E", borderRadius: vw * 5, padding: vw * 7, width: "100%", alignItems: "center", borderWidth: 1, borderColor: "#F85149" }}>
            {/* 警告圖示 */}
            <View style={{ width: vw * 16, height: vw * 16, borderRadius: vw * 8, backgroundColor: "rgba(248,81,73,0.15)", alignItems: "center", justifyContent: "center", marginBottom: vw * 4 }}>
              <ShieldX size={vw * 8} color="#F85149" />
            </View>

            {/* 標題 */}
            <Text allowFontScaling={false} style={{ color: "#F85149", fontSize: vw * 5.5, fontWeight: "800", marginBottom: vw * 2.5 }}>
              帳號已被限制
            </Text>

            {/* 封禁詳情 */}
            <Text allowFontScaling={false} style={{ color: "#CCCCCC", fontSize: vw * 3.8, textAlign: "center", lineHeight: vw * 6, marginBottom: vw * 6 }}>
              {bannedMsg}
            </Text>

            {/* 按鈕區 */}
            <View style={{ flexDirection: "row", gap: vw * 3, width: "100%" }}>
              {/* 聯絡客服 */}
              <Pressable
                onPress={() => Linking.openURL("https://t.me/SmartWhale_service").catch(() => {})}
                style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: vw * 1.5, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: vw * 2.5, paddingVertical: vw * 3.5, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)" }}
              >
                <Headphones size={vw * 4} color="#AAAAAA" />
                <Text allowFontScaling={false} style={{ color: "#AAAAAA", fontSize: vw * 3.8, fontWeight: "600" }}>聯絡客服</Text>
              </Pressable>

              {/* 確認 */}
              <Pressable
                onPress={() => setBannedModal(false)}
                style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#E8520A", borderRadius: vw * 2.5, paddingVertical: vw * 3.5 }}
              >
                <Text allowFontScaling={false} style={{ color: "#fff", fontSize: vw * 3.8, fontWeight: "700" }}>我知道了</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* 版本更新弹窗 */}
      <UpdateDialog
        open={versionDialogOpen || showUpdate}
        latestVersion={latestVersion}
        localVersion={localVersion}
        apkUrl={apkUrl}
        forceUpdate={forceUpdate}
        onDismiss={() => { setVersionDialogOpen(false); dismissUpdate(); }}
      />
    </KeyboardAvoidingView>
  );
}

/* eslint-disable no-undef */
import { useState, useCallback, useRef, useEffect } from "react";
import {
  View, Text, ScrollView, Pressable, TextInput, ActivityIndicator,
  KeyboardAvoidingView,
} from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useFocusEffect } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  CheckCircle, AlertCircle, RefreshCw, Clock,
} from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import Reanimated, {
  useSharedValue, useAnimatedStyle, withTiming, Easing, runOnJS,
} from "react-native-reanimated";
import { useSession } from "@/ctx";
import { supabase } from "@/client/supabase";
import { getProfile } from "@/db/api";
import { sharedGet } from "@/lib/requestDedup";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { enqueue, cancelQueuedExcept } from "@/lib/requestQueue";
import { useWindowDimensions } from "react-native";

// ─── 本地資源 ─────────────────────────────────────────────────────────────────
const IMGS: Record<string, ReturnType<typeof require>> = {
  "icon9.png":   require("../../../assets/page-img/icon9.png"),
  "btg111.png":  require("../../../assets/page-img/btg111.png"),
  "icon14.png":  require("../../../assets/page-img/icon14.png"),
  "icon15.png":  require("../../../assets/page-img/icon15.png"),
};
const IMG = (name: string) => IMGS[name];

const BG_IMG = require("../../../assets/page-img/page_bg.webp");

// ─── ShimmerBtn（與登入頁完全一致）─────────────────────────────────────────────
const SHIMMER_DURATION = 900;
const SHIMMER_INTERVAL = 2200;

function ShimmerBtn({ children, onPress, disabled }: { children: React.ReactNode; onPress: () => void; disabled?: boolean }) {
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
    <Pressable onPress={disabled ? undefined : onPress} disabled={disabled} style={{ overflow: "hidden", opacity: disabled ? 0.5 : 1 }}>
      {children}
      <Reanimated.View style={[{ position: "absolute", top: 0, bottom: 0, width: "60%", left: "-10%" }, shimmerStyle]} pointerEvents="none">
        <LinearGradient colors={["transparent", "rgba(255,255,255,0.28)", "transparent"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1 }} />
      </Reanimated.View>
    </Pressable>
  );
}

type AuthStep = "form" | "verifying" | "success";
type ErrorCode = "SERVICE_UNAVAILABLE" | "VERIFY_FAILED" | "DAILY_LIMIT" | "TOTAL_LIMIT" | "DUPLICATE_INFO" | "ALREADY_VERIFIED" | "GENERAL";

const CHANNEL_CONFIG = {
  bank: {
    label: "身份證四要素",
    desc: "姓名 + 身份證號 + 預留手機 + 銀行卡，四項必須為同一實名",
    fn: "bank-verify",
    accentColor: "#DE792D",
  },
} as const;

/** 錯誤區域（共用元件） */
function ErrorBlock({
  error, errorCode, remaining, dailyLimit, submitting, onRetry,
}: {
  error: string; errorCode: ErrorCode | null;
  remaining: number | null; dailyLimit: number;
  submitting: boolean; onRetry: () => void;
}) {
  if (!error) return null;
  const usedCount = remaining !== null ? dailyLimit - remaining : null;
  return (
    <View className="gap-2">
      {errorCode === "SERVICE_UNAVAILABLE" ? (
        <View className="px-4 py-3 rounded-xl gap-3"
          style={{ backgroundColor: "#F59E0B15", borderWidth: 1, borderColor: "#F59E0B40" }}>
          <View className="flex-row items-start gap-2">
            <RefreshCw size={14} color="#F59E0B" style={{ marginTop: 1 }} />
            <View className="flex-1">
              <Text allowFontScaling={false} style={{ color: "#F59E0B", fontSize: 13, fontWeight: "600" }}>驗證服務暫時不可用</Text>
              <Text allowFontScaling={false} style={{ color: "#F59E0B", fontSize: 12, opacity: 0.8, marginTop: 2 }}>{error}</Text>
            </View>
          </View>
          <Pressable className="py-2.5 rounded-lg items-center active:opacity-70"
            style={{ backgroundColor: "#F59E0B20", borderWidth: 1, borderColor: "#F59E0B60" }}
            onPress={onRetry} disabled={submitting}>
            <Text allowFontScaling={false} style={{ color: "#F59E0B", fontWeight: "600", fontSize: 13 }}>
              {submitting ? "重試中…" : "點選重試"}
            </Text>
          </Pressable>
        </View>
      ) : errorCode === "DAILY_LIMIT" || errorCode === "TOTAL_LIMIT" ? (
        <View className="px-4 py-3 rounded-xl flex-row items-start gap-2"
          style={{ backgroundColor: "#E8520A15", borderWidth: 1, borderColor: "#E8520A40" }}>
          <Clock size={14} color="#E8520A" style={{ marginTop: 1 }} />
          <View className="flex-1">
            <Text allowFontScaling={false} style={{ color: "#E8520A", fontSize: 13, fontWeight: "600" }}>
              {errorCode === "TOTAL_LIMIT" ? "累計次數已達上限" : "今日次數已用完"}
            </Text>
            <Text allowFontScaling={false} style={{ color: "#E8520A", fontSize: 12, opacity: 0.8, marginTop: 2 }}>{error}</Text>
          </View>
        </View>
      ) : errorCode === "DUPLICATE_INFO" ? (
        <View className="px-4 py-3 rounded-xl flex-row items-start gap-2"
          style={{ backgroundColor: "#F97316" + "15", borderWidth: 1, borderColor: "#F97316" + "40" }}>
          <AlertCircle size={14} color="#F97316" style={{ marginTop: 1 }} />
          <View className="flex-1">
            <Text allowFontScaling={false} style={{ color: "#F97316", fontSize: 13, fontWeight: "600" }}>實名資訊已被佔用</Text>
            <Text allowFontScaling={false} style={{ color: "#F97316", fontSize: 12, opacity: 0.8, marginTop: 2 }}>{error}</Text>
          </View>
        </View>
      ) : (
        <View className="px-3 py-2.5 rounded-xl"
          style={{ backgroundColor: "#F43F5E15", borderWidth: 1, borderColor: "#F43F5E30" }}>
          <View className="flex-row items-start gap-2">
            <AlertCircle size={14} color="#F43F5E" style={{ marginTop: 1 }} />
            <View className="flex-1">
              <Text allowFontScaling={false} style={{ color: "#F43F5E", fontSize: 13, lineHeight: 18 }}>{error}</Text>
            </View>
          </View>
        </View>
      )}

      {/* 剩餘次數進度條 */}
      {errorCode === "VERIFY_FAILED" && remaining !== null && usedCount !== null && (
        <View className="gap-1">
          <View className="flex-row justify-between px-1">
            <Text allowFontScaling={false} style={{ color: "#94A3B8", fontSize: 11 }}>今日已用 {usedCount}/{dailyLimit} 次</Text>
            {remaining > 0
              ? <Text allowFontScaling={false} style={{ color: "#F59E0B", fontSize: 11 }}>剩餘 {remaining} 次机会</Text>
              : <Text allowFontScaling={false} style={{ color: "#F43F5E", fontSize: 11 }}>次數已耗盡</Text>}
          </View>
          <View className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "#1E293B" }}>
            <View className="h-full rounded-full" style={{
              width: `${(usedCount / dailyLimit) * 100}%`,
              backgroundColor: remaining === 0 ? "#F43F5E" : remaining === 1 ? "#F59E0B" : "#E8520A",
            }} />
          </View>
        </View>
      )}
    </View>
  );
}

export default function RealNameScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const vw = Math.min(width, 375) / 100;
  const { session } = useSession();
  const userId = session?.user.id ?? "";

  const [step, setStep] = useState<AuthStep>("form");
  const [realName, setRealName] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [bankCard, setBankCard] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState<ErrorCode | null>(null);
  const [checking, setChecking] = useState(true);
  const [maskedName, setMaskedName] = useState("");
  const [maskedCard, setMaskedCard] = useState("");
  const [remaining, setRemaining] = useState<number | null>(null);
  const [dailyLimit, setDailyLimit] = useState(3);
  const [retryCount, setRetryCount] = useState(0);

  useFocusEffect(useCallback(() => {
    (async () => {
      if (!userId) return;
      setChecking(true);
      // 共用 sharedGet("profile") 缓存：与其他页共享，秒显；失败退避重试
      const profile = await sharedGet("profile", () => getProfile(userId), { shared: true }).catch(() => null);
      if (profile?.is_verified) setStep("success");
      setChecking(false);
    })();
  }, [userId]));

  const clearError = () => { setError(""); setErrorCode(null); };

  const validate = () => {
    if (!realName.trim()) return "請輸入真實姓名";
    if (!/^[\u4e00-\u9fa5·•\-A-Za-z]{2,20}$/.test(realName.trim())) return "姓名格式有誤（2-20位中文或英文字母）";
    if (!idNumber.trim()) return "請輸入身份證號";
    if (!/^\d{17}[\dXx]$/.test(idNumber.trim())) return "請輸入正確的18位身份證號";
    if (!phone.trim()) return "請輸入預留手機號";
    if (!/^\d{11}$/.test(phone.trim())) return "手機號必須為11位數字";
    if (!/^1[3-9]\d{9}$/.test(phone.trim())) return "請輸入有效的大陸手機號碼";
    if (!bankCard.trim()) return "請輸入銀行卡號";
    if (!/^\d{16,19}$/.test(bankCard.replace(/\s/g, ""))) return "銀行卡號必須為16-19位數字";
    return null;
  };

  // 同步鎖：防止 setState 非同步延遲期間重複提交穿透
  const submittingRef = useRef(false);

  const doSubmit = async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    clearError();
    setStep("verifying");

    const body = { realName: realName.trim(), idNumber: idNumber.trim(), phone: phone.trim(), bankCard: bankCard.replace(/\s/g, "") };
    const { data, error: fnErr } = await supabase.functions.invoke(CHANNEL_CONFIG.bank.fn, { body });

    submittingRef.current = false;
    setSubmitting(false);

    if (fnErr || !data?.success) {
      // 當 Edge Function 返回非 2xx 時，響應體在 fnErr.context 中，data 為 null
      let parsed: Record<string, unknown> | null = null;
      if (fnErr) {
        try { parsed = await (fnErr as { context?: { json?: () => Promise<Record<string, unknown>> } }).context?.json?.() ?? null; } catch { /* ignore */ }
      }
      const src = parsed ?? data;
      setStep("form");
      setError((src?.error as string) ?? fnErr?.message ?? "驗證失敗，請重試");
      setErrorCode((src?.errorCode as ErrorCode) ?? "GENERAL");
      if (typeof src?.remainingAttempts === "number") setRemaining(src.remainingAttempts as number);
      if (typeof src?.dailyLimit === "number") setDailyLimit(src.dailyLimit as number);
      return;
    }

    setMaskedName(data.masked?.name ?? "");
    setMaskedCard(data.masked?.card ?? "");
    setRetryCount(0);
    setStep("success");
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) { setError(err); setErrorCode("GENERAL"); return; }
    await doSubmit();
  };

  const handleRetry = async () => { setRetryCount(c => c + 1); await doSubmit(); };

  // ── 用戶信息校驗中（session 未就緒）──
  if (!userId) {
    return (
      <View style={{ flex: 1, backgroundColor: "#000000" }}>
        <StatusBar style="light" />
        <Image source={BG_IMG} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="cover" priority="high" cachePolicy="memory-disk" />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color="#DE792D" />
          <Text allowFontScaling={false} style={{ color: "#999", fontSize: 13, marginTop: 12 }}>用戶信息校驗中…</Text>
        </View>
      </View>
    );
  }

  // ── 載入中 ──
  if (checking) {
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

  // ── 驗證中 ──
  if (step === "verifying") {
    return (
      <View style={{ flex: 1, backgroundColor: "#000000" }}>
        <StatusBar style="light" />
        <Image source={BG_IMG} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="cover" priority="high" cachePolicy="memory-disk" />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 }}>
          <ActivityIndicator size="large" color="#DE792D" />
          <Text allowFontScaling={false} style={{ color: "#fff", fontWeight: "600", fontSize: 15, marginTop: 16 }}>正在驗證中…</Text>
          <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 13, marginTop: 4, textAlign: "center", lineHeight: 20 }}>
            正在通過身份證四要素驗證您的身份{"\n"}請稍候，通常不超過10秒
          </Text>
          {retryCount > 0 && (
            <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 12, marginTop: 10 }}>第 {retryCount} 次重試中…</Text>
          )}
        </View>
      </View>
    );
  }

  // ── 成功 ──
  if (step === "success") {
    return (
      <View style={{ flex: 1, backgroundColor: "#000000" }}>
        <StatusBar style="light" />
        <Image source={BG_IMG} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="cover" priority="high" cachePolicy="memory-disk" />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 }}>
          <View style={{ width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", marginBottom: 16, backgroundColor: "rgba(34,197,94,0.12)" }}>
            <CheckCircle size={44} color="#22C55E" />
          </View>
          <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 22, fontWeight: "700" }}>實名認證成功</Text>
          <Text allowFontScaling={false} style={{ color: "#FFFFFF60", textAlign: "center", marginTop: 6, lineHeight: 20, fontSize: 13 }}>
            通過身份證四要素驗證，身份核實完成{"\n"}現可正常使用全部功能
          </Text>
          {maskedName ? (
            <View style={{
              marginTop: 20, paddingHorizontal: 24, paddingVertical: 16,
              borderRadius: 8, gap: 8, width: "100%",
              backgroundColor: "rgba(0,0,0,0.5)", borderWidth: 1, borderColor: "rgba(222,121,45,0.4)",
            }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text allowFontScaling={false} style={{ color: "#7B7B7B", fontSize: 12 }}>認證姓名</Text>
                <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 12, fontWeight: "600" }}>{maskedName}</Text>
              </View>
              {maskedCard ? (
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text allowFontScaling={false} style={{ color: "#7B7B7B", fontSize: 12 }}>銀行卡</Text>
                  <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 12, fontWeight: "600" }}>{maskedCard}</Text>
                </View>
              ) : null}
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text allowFontScaling={false} style={{ color: "#7B7B7B", fontSize: 12 }}>認證渠道</Text>
                <Text allowFontScaling={false} style={{ fontSize: 12, fontWeight: "600", color: "#DE792D" }}>身份證四要素</Text>
              </View>
            </View>
          ) : null}
          <View style={{ alignItems: "center", marginTop: 24 }}>
            <ShimmerBtn onPress={() => router.back()}>
              <Image source={IMG("btg111.png")} style={{ width: vw * 70.93, aspectRatio: 653 / 119 }} contentFit="contain" />
              <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
                <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 16, fontWeight: "800", letterSpacing: 1 }}>完 成</Text>
              </View>
            </ShimmerBtn>
          </View>
        </View>
      </View>
    );
  }

  // ── 表單 ──
  return (
    <View style={{ flex: 1, backgroundColor: "#000000" }}>
      <StatusBar style="light" />
      <Image source={BG_IMG} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="cover" contentPosition={{ top: 0, left: "50%" }} priority="high" cachePolicy="memory-disk" />

      {/* NavBar（對齊推廣獎勵頁風格）*/}
      <View style={{ paddingTop: insets.top + 12, paddingBottom: 12, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Pressable onPress={() => router.back()} className="active:opacity-70">
          <Image source={IMG("icon9.png")} style={{ width: 24, height: 24 }} contentFit="contain" />
        </Pressable>
        <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 20, fontWeight: "800" }}>實名認證</Text>
      </View>

      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 32 }}>

          {/* 身份證四要素說明卡 */}
          <View style={{ borderWidth: 1, borderColor: "#DE792D", backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <Image source={IMG("icon14.png")} style={{ width: 16, height: 16 }} contentFit="contain" />
              <Text allowFontScaling={false} style={{ color: "#DE792D", fontSize: 13, fontWeight: "600" }}>身份證四要素</Text>
            </View>
            <Text allowFontScaling={false} style={{ color: "#C4ADAD", fontSize: 12, lineHeight: 18 }}>
              姓名 + 身份證號 + 預留手機 + 銀行卡，四項必須為同一實名
            </Text>
          </View>

          {/* 表單 */}
          <View style={{ marginTop: 16, gap: 10 }}>
            {[
              { label: "真實姓名",   value: realName, onChange: (v: string) => { setRealName(v); clearError(); },   placeholder: "請輸入身份證上的姓名",     keyType: "default" as const },
              { label: "身份證號",   value: idNumber, onChange: (v: string) => { setIdNumber(v); clearError(); },   placeholder: "請輸入18位身份證號",       keyType: "default" as const },
              { label: "預留手機號", value: phone,    onChange: (v: string) => { setPhone(v); clearError(); },      placeholder: "請輸入銀行卡預留手機號",   keyType: "phone-pad" as const },
              { label: "銀行卡號",   value: bankCard, onChange: (v: string) => { setBankCard(v); clearError(); },   placeholder: "請輸入銀行卡號（16-19位）", keyType: "number-pad" as const },
            ].map(({ label, value, onChange, placeholder, keyType }) => (
              <View key={label} style={{ gap: 5 }}>
                <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 13, fontWeight: "600" }}>{label}</Text>
                <TextInput
                  value={value}
                  onChangeText={onChange}
                  placeholder={placeholder}
                  placeholderTextColor="#666"
                  keyboardType={keyType}
                  underlineColorAndroid="transparent"
                  style={{
                    backgroundColor: "rgba(0,0,0,0.5)",
                    borderWidth: 1, borderColor: "rgba(123,123,123,0.5)",
                    borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10,
                    minHeight: 44, fontSize: 14, color: "#fff",
                    outlineStyle: "none" as const,
                  } as any}
                />
              </View>
            ))}
          </View>

          {/* 錯誤區域 */}
          <View style={{ marginTop: 12 }}>
            <ErrorBlock error={error} errorCode={errorCode} remaining={remaining} dailyLimit={dailyLimit} submitting={submitting} onRetry={handleRetry} />
          </View>

          {/* 警告卡片 */}
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: "rgba(222,121,45,0.3)", borderRadius: 8, gap: 8 }}>
            <Image source={IMG("icon15.png")} style={{ width: 16, height: 16 }} contentFit="contain" />
            <Text allowFontScaling={false} style={{ flex: 1, color: "#F07070", fontSize: 12, lineHeight: 18 }}>
              每日僅 {dailyLimit} 次驗證機會，請確認資訊無誤後再提交。
            </Text>
          </View>

          {/* 提交按鈕 */}
          <View style={{ alignItems: "center", marginTop: 24 }}>
            <ShimmerBtn onPress={handleSubmit} disabled={submitting || errorCode === "DAILY_LIMIT" || errorCode === "TOTAL_LIMIT"}>
              <Image source={IMG("btg111.png")} style={{ width: vw * 70.93, aspectRatio: 653 / 119 }} contentFit="contain" />
              <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
                {submitting
                  ? <ActivityIndicator color="#fff" />
                  : <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 16, fontWeight: "800", letterSpacing: 1 }}>
                      {(errorCode === "DAILY_LIMIT" || errorCode === "TOTAL_LIMIT") ? "次數已用盡" : "立刻認證"}
                    </Text>}
              </View>
            </ShimmerBtn>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

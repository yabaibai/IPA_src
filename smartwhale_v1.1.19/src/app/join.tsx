/**
 * /join 公開邀請落地頁
 * 訪問 URL 示例：https://your-app.web.app/join?code=ABC123
 * 流程：存邀請碼 → 短暫 loading → 跳轉
 *   - 已登入：直接進入 App 主頁 (app)
 *   - 未登入：進入註冊/登入頁 (auth)/sign-in
 */
import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useSession } from "@/ctx";

const INVITE_CODE_KEY = "pending_invite_code";

export default function JoinScreen() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const { session, isLoading } = useSession();

  useEffect(() => {
    // 等 session 狀態確定後再跳轉，避免 isLoading 期間誤判
    if (isLoading) return;

    // 儲存邀請碼（僅 Web 支援 localStorage）
    if (code) {
      const trimmed = code.trim().toUpperCase();
      if (process.env.EXPO_OS === "web" && typeof localStorage !== "undefined") {
        localStorage.setItem(INVITE_CODE_KEY, trimmed);
      }
    }

    const t = setTimeout(() => {
      if (session) {
        // 已登入 → 直接進 App
        router.replace("/(app)" as any);
      } else {
        // 未登入 → 去登入/註冊頁
        router.replace("/(auth)/sign-in" as any);
      }
    }, 600);

    return () => clearTimeout(t);
  }, [code, session, isLoading]);

  return (
    <View style={{ flex: 1, backgroundColor: "#080D28", alignItems: "center", justifyContent: "center" }}>
      <StatusBar style="light" />
      <ActivityIndicator size="large" color="#E8520A" />
    </View>
  );
}

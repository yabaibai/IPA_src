import { Stack } from 'expo-router';
import { ActivityIndicator, Linking, Modal, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { PortalHost } from '@rn-primitives/portal';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as SystemUI from 'expo-system-ui';
import * as NavigationBar from 'expo-navigation-bar';
import { ShieldX, Headphones } from 'lucide-react-native';

import { SessionProvider, useSession } from '@/ctx';
import { I18nProvider } from '@/lib/i18n';
import { initSentry, wrapWithSentry } from '@/lib/sentry';
import { installHttpInterceptor } from '@/lib/httpInterceptor';
import "../global.css";

// 平臺適配：Web 使用空 mock，Native 使用真實 Sentry
initSentry();

// 安裝 HTTP 401 全域攔截（會話過期兜底，FRD 4.4）：在 SessionProvider 之前安裝，
// 確保所有後續 supabase/Edge Function 請求的 401 都能被統一捕獲並觸發登出。
installHttpInterceptor();

// Android：將根檢視背景色與系統導航欄背景色統一為黑色，避免底部出現白色區域
if (process.env.EXPO_OS !== "web") {
  SystemUI.setBackgroundColorAsync("#000000");
  NavigationBar.setBackgroundColorAsync("#000000");
  NavigationBar.setButtonStyleAsync("light"); // 導航欄按鈕圖示顯示為白色
}

function RootLayoutNav() {
  const { session, isLoading, bannedInfo, clearBannedInfo } = useSession();
  const { width } = useWindowDimensions();
  const vw = Math.min(width, 375) / 100;

  if (isLoading) return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0A0F2E" }}>
      <ActivityIndicator size="large" color="#E8520A" />
    </View>
  );

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        {/* 公開路由：無需登入即可訪問（guard={!session} 已登入時自動 redirect 到 (app)） */}
        <Stack.Protected guard={!session}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        {/* 受保護路由：guard=false 時路由從路由表移除，自動回落至最近可用路由 */}
        <Stack.Protected guard={!!session}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
        {/* 全域性公共路由：登入前後均可訪問（不放入任何 Stack.Protected） */}
        <Stack.Screen name="join" />

        {/* 全域性 404 頁面：必須顯式註冊才能覆蓋系統預設 Unmatched Route */}
        <Stack.Screen name="+not-found" />
      </Stack>

      {/* ── 全域封禁提示 Modal（根層渲染，跨頁面持久顯示）── */}
      <Modal
        visible={bannedInfo !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={clearBannedInfo}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.80)", alignItems: "center", justifyContent: "center", paddingHorizontal: vw * 6 }}>
          <View style={{ backgroundColor: "#1A1A2E", borderRadius: vw * 5, padding: vw * 7, width: "100%", alignItems: "center", borderWidth: 1, borderColor: "#F85149" }}>
            {/* 警告圖示 */}
            <View style={{ width: vw * 18, height: vw * 18, borderRadius: vw * 9, backgroundColor: "rgba(248,81,73,0.15)", alignItems: "center", justifyContent: "center", marginBottom: vw * 4 }}>
              <ShieldX size={vw * 9} color="#F85149" />
            </View>

            {/* 標題 */}
            <Text allowFontScaling={false} style={{ color: "#F85149", fontSize: vw * 5.5, fontWeight: "800", marginBottom: vw * 2 }}>
              帳號已被限制使用
            </Text>

            {/* 封禁詳情 */}
            <Text allowFontScaling={false} style={{ color: "#CCCCCC", fontSize: vw * 3.8, textAlign: "center", lineHeight: vw * 6.2, marginBottom: vw * 6 }}>
              {bannedInfo?.msg ?? "您的帳號已被限制，如有疑問請聯絡客服"}
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
                onPress={clearBannedInfo}
                style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#E8520A", borderRadius: vw * 2.5, paddingVertical: vw * 3.5 }}
              >
                <Text allowFontScaling={false} style={{ color: "#fff", fontSize: vw * 3.8, fontWeight: "700" }}>我知道了</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const RootLayout: React.FC = () => {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <I18nProvider>
        <SessionProvider>
          <RootLayoutNav />
          <PortalHost />
        </SessionProvider>
      </I18nProvider>
    </GestureHandlerRootView>
  );
};

export default wrapWithSentry(RootLayout);

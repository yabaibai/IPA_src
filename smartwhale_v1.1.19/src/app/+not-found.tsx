import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";

export default function NotFoundScreen() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0D0D0D" }}>
      <StatusBar style="light" />
      <Text allowFontScaling={false} style={{ fontSize: 64, marginBottom: 16 }}>🐳</Text>
      <Text allowFontScaling={false} style={{ fontSize: 22, fontWeight: "800", color: "#FFFFFF", letterSpacing: 2, marginBottom: 8 }}>
        页面不存在
      </Text>
      <Text allowFontScaling={false} style={{ fontSize: 13, color: "#555555", marginBottom: 40, letterSpacing: 1 }}>
        404 · Page Not Found
      </Text>
      <Pressable
        onPress={() => router.replace("/(auth)/sign-in" as any)}
        style={{
          backgroundColor: "#E8520A",
          paddingHorizontal: 32,
          paddingVertical: 12,
          borderRadius: 24,
        }}
      >
        <Text allowFontScaling={false} style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 15, letterSpacing: 1 }}>
          返回首页
        </Text>
      </Pressable>
    </View>
  );
}

/* eslint-disable no-undef */
/**
 * shenhe — 商戶申請稽核中提示頁
 */
import { View, Text, Pressable, useWindowDimensions, Alert } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { router } from "expo-router";
import { StyleSheet } from "react-native";
import { supabase } from "@/client/supabase";
import { signOutCleanly, forceLocalSignOut } from "@/ctx";

const IMG_HOME_BG42   = require("../../../assets/page-img/home_bg42.png");
const IMG_HOME_BG43   = require("../../../assets/page-img/home_bg43.png");
const IMG_HOME_ICON37 = require("../../../assets/page-img/home_icon37.png");

const MUTED = "#999999";

export default function ShenheScreen() {
  const { width: screenW } = useWindowDimensions();
  const insets = useSafeAreaInsets();


  // bg42 比例 983×1142
  const contentW = screenW - 64;
  const bgH = contentW * (1142 / 983);
  // bg43 按钮高度：宽度 60% × 121/541 比例
  const btnH = (contentW * 0.6) * (121 / 541);

  return (
    <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.95)", alignItems: "center", justifyContent: "center", paddingHorizontal: 32, paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <StatusBar style="light" />

      {/* 卡片主体 */}
      <View style={{ width: contentW, height: bgH }}>
        {/* bg42 背景 983×1142 */}
        <Image source={IMG_HOME_BG42} style={StyleSheet.absoluteFillObject} contentFit="fill" />

        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 20 }}>
          {/* 顶部大图标 icon37: 218×218 → 76×76 */}
          <Image source={IMG_HOME_ICON37} style={{ width: 76, height: 76, marginBottom: 12 }} contentFit="contain" />

          {/* 标题 */}
          <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 20, fontWeight: "800", textAlign: "center", marginBottom: 8 }}>
            商戶申請稽核中
          </Text>

          {/* 说明文字 */}
          <Text allowFontScaling={false} style={{ color: MUTED, fontSize: 14, textAlign: "center", lineHeight: 22, marginBottom: 20 }}>
            已提交申請，請等待管理員稽核。
          </Text>

          {/* 退出登录按钮 bg43: 541×121，宽 60% */}
          <Pressable
            onPress={() => {
              Alert.alert(
                "確認退出",
                "退出後需重新登入才能領取 SMT",
                [
                  { text: "取消", style: "cancel" },
                  {
                    text: "確認退出",
                    style: "destructive",
                    onPress: () => {
                      forceLocalSignOut();
                      router.replace("/(auth)/sign-in" as any);
                      signOutCleanly().catch(() => {});
                    },
                  },
                ]
              );
            }}
            className="active:opacity-80"
            style={{ width: "60%", height: btnH, position: "relative" }}
          >
            <Image source={IMG_HOME_BG43} style={StyleSheet.absoluteFillObject} contentFit="fill" />
            <View style={[StyleSheet.absoluteFillObject, { alignItems: "center", justifyContent: "center" }]}>
              <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>退出登錄</Text>
            </View>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

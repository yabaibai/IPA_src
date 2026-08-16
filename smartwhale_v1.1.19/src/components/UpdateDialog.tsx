/* eslint-disable no-undef */
/**
 * UpdateDialog
 * 檢測到新版本時彈出更新提示彈窗，引導使用者前往下載頁。
 * forceUpdate=true 時為強制更新模式：隱藏「稍後再說」，禁止背景關閉。
 * 外觀對齊每日領取彈窗（IMG_HOME_BG20 背景 + IMG_HOME_BG41 按鈕）
 */
import { useRef } from "react";
import { View, Text, Modal, Pressable, StyleSheet, Linking } from "react-native";
import { Image } from "expo-image";
import { Download, Sparkles, Zap, Shield, ArrowRight, AlertTriangle } from "lucide-react-native";

const IMG_HOME_BG20   = require("../../assets/page-img/home_bg20.png");   // 每日領取背景
const IMG_HOME_BG41   = require("../../assets/page-img/home_bg41.png");   // 確認按鈕
const IMG_HOME_ICON20 = require("../../assets/page-img/home_icon20.png"); // 關閉按鈕

// 更新亮點列表
const UPDATE_HIGHLIGHTS = [
  { icon: Zap,      text: "效能大幅提升，操作更流暢" },
  { icon: Shield,   text: "安全性增強，資產更安全"   },
  { icon: Sparkles, text: "介面全新最佳化，體驗更好"   },
];

interface UpdateDialogProps {
  open: boolean;
  latestVersion: string;
  localVersion: string;
  apkUrl?: string;
  forceUpdate?: boolean;
  onDismiss: () => void;
}

export default function UpdateDialog({
  open,
  latestVersion,
  localVersion,
  apkUrl,
  forceUpdate = false,
  onDismiss,
}: UpdateDialogProps) {
  const isUpdating = useRef(false);

  const handleUpdate = async () => {
    if (isUpdating.current) return;
    isUpdating.current = true;
    if (!forceUpdate) onDismiss();
    if (!apkUrl) return;
    await Linking.openURL(apkUrl);
    setTimeout(() => { isUpdating.current = false; }, 3000);
  };

  const accentColor = forceUpdate ? "#F43F5E" : "#E8520A";

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={forceUpdate ? undefined : onDismiss}>
      <Pressable
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}
        onPress={forceUpdate ? undefined : onDismiss}
      >
        <Pressable onPress={(e) => e.stopPropagation()} style={{ width: "100%" }}>
          {/* 彈窗容器：home_bg20 背景圖 */}
          <View style={{ width: "100%", backgroundColor: "#000", borderRadius: 12, overflow: "hidden" }}>
            <Image source={IMG_HOME_BG20} style={StyleSheet.absoluteFillObject} contentFit="fill" />
            <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16 }}>

              {/* 標題行 + 關閉按鈕 */}
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", marginBottom: 16, position: "relative" }}>
                <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 20, fontWeight: "800" }}>
                  {forceUpdate ? "⚠️ 需要強制更新" : "🚀 發現新版本"}
                </Text>
                {!forceUpdate && (
                  <Pressable onPress={onDismiss} style={{ position: "absolute", right: 0 }} className="active:opacity-70">
                    <Image source={IMG_HOME_ICON20} style={{ width: 22, height: 22 }} contentFit="contain" />
                  </Pressable>
                )}
              </View>

              {/* 強制更新說明 */}
              {forceUpdate && (
                <Text allowFontScaling={false} style={{ color: "#94A3B8", fontSize: 13, textAlign: "center", lineHeight: 20, marginBottom: 12 }}>
                  當前版本已不再受支援{"\n"}請立即更新後繼續使用
                </Text>
              )}

              {/* 版本號對比膠囊 */}
              <View style={{
                flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
                backgroundColor: "#FFFFFF10", borderWidth: 1, borderColor: "#FFFFFF18",
                paddingHorizontal: 14, paddingVertical: 6, borderRadius: 99, marginBottom: 16, alignSelf: "center",
              }}>
                <Text allowFontScaling={false} style={{ color: "#64748B", fontSize: 12 }}>v{localVersion}</Text>
                <ArrowRight size={12} color="#475569" />
                <Text allowFontScaling={false} style={{ color: accentColor, fontSize: 13, fontWeight: "800" }}>v{latestVersion}</Text>
              </View>

              {/* 更新亮點 */}
              <View style={{ gap: 10, marginBottom: 18 }}>
                {UPDATE_HIGHLIGHTS.map(({ icon: Icon, text }, i) => (
                  <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <View style={{
                      width: 32, height: 32, borderRadius: 9,
                      backgroundColor: accentColor + "20",
                      borderWidth: 1, borderColor: accentColor + "40",
                      alignItems: "center", justifyContent: "center", flexShrink: 0,
                    }}>
                      <Icon size={15} color={accentColor} />
                    </View>
                    <Text allowFontScaling={false} style={{ color: "#CBD5E1", fontSize: 13, flex: 1, lineHeight: 20 }}>{text}</Text>
                  </View>
                ))}
              </View>

              {/* 立即更新按鈕：home_bg41 圖片按鈕 */}
              <Pressable
                onPress={handleUpdate}
                className="active:opacity-80"
                style={{ width: "100%", aspectRatio: 841 / 130, position: "relative" }}
              >
                <Image source={IMG_HOME_BG41} style={StyleSheet.absoluteFillObject} contentFit="fill" />
                <View style={[StyleSheet.absoluteFillObject, { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }]}>
                  <Download size={17} color="#fff" />
                  <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 15, fontWeight: "800" }}>立即更新</Text>
                </View>
              </Pressable>

              {/* 稍後再說：強制更新時隱藏 */}
              {!forceUpdate && (
                <Pressable onPress={onDismiss} className="active:opacity-70" style={{ alignItems: "center", paddingTop: 14 }}>
                  <Text allowFontScaling={false} style={{ color: "#475569", fontSize: 14 }}>稍後再說</Text>
                </Pressable>
              )}

            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

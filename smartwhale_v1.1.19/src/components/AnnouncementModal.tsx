import { useState } from "react";
import { View, Text, Pressable, Modal, ScrollView, ActivityIndicator } from "react-native";
import { Megaphone, X, ChevronRight, ChevronLeft } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { markAllAnnouncementsRead } from "@/db/api";
import type { Announcement } from "@/types/types";

interface Props {
  announcements: Announcement[];
  userId: string;
  onClose: () => void;
}

export default function AnnouncementModal({ announcements, userId, onClose }: Props) {
  const [idx, setIdx] = useState(0);
  const [closing, setClosing] = useState(false);

  const current = announcements[idx];
  const total = announcements.length;

  const handleClose = async () => {
    setClosing(true);
    await markAllAnnouncementsRead(userId, announcements.map((a) => a.id));
    setClosing(false);
    onClose();
  };

  if (!current) return null;

  return (
    <Modal visible transparent animationType="fade">
      <View className="flex-1 items-center justify-center px-5" style={{ backgroundColor: "#000000CC" }}>
        <View
          className="w-full overflow-hidden"
          style={{
            backgroundColor: "#141414",
            borderWidth: 1.5, borderColor: "#E8520A40",
            borderRadius: 24, maxWidth: 380,
            shadowColor: "#E8520A",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.2, shadowRadius: 20, elevation: 16,
          }}
        >
          {/* 頂部橙色光暈 Banner */}
          <LinearGradient
            colors={["#1A0A00", "#141414"]}
            start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
            style={{ borderTopLeftRadius: 22, borderTopRightRadius: 22 }}
          >
            {/* 裝飾球 */}
            <View style={{
              position: "absolute", top: -30, right: -30,
              width: 100, height: 100, borderRadius: 50,
              backgroundColor: "#E8520A18",
            }} pointerEvents="none" />

            {/* 頭部內容 */}
            <View
              className="flex-row items-center px-5 py-4 gap-3"
              style={{ borderBottomWidth: 1, borderBottomColor: "#E8520A25" }}
            >
              {/* 圖示徽章 */}
              <View style={{
                width: 38, height: 38, borderRadius: 12,
                backgroundColor: "#E8520A18", borderWidth: 1, borderColor: "#E8520A40",
                alignItems: "center", justifyContent: "center",
              }}>
                <Megaphone size={18} color="#E8520A" />
              </View>

              <View className="flex-1">
                <Text allowFontScaling={false} style={{ color: "#E8520A", fontSize: 12, fontWeight: "700", letterSpacing: 0.8 }}>
                  📢 系统公告
                </Text>
                {total > 1 && (
                  <Text allowFontScaling={false} style={{ color: "#64748B", fontSize: 11, marginTop: 1 }}>
                    {idx + 1} / {total} 条
                  </Text>
                )}
              </View>

              {/* 關閉按鈕 */}
              <Pressable
                onPress={handleClose}
                className="active:opacity-70"
                disabled={closing}
                style={{
                  width: 30, height: 30, borderRadius: 8,
                  backgroundColor: "#FFFFFF0A", borderWidth: 1, borderColor: "#FFFFFF12",
                  alignItems: "center", justifyContent: "center",
                }}
              >
                {closing
                  ? <ActivityIndicator size="small" color="#475569" />
                  : <X size={16} color="#64748B" />}
              </Pressable>
            </View>
          </LinearGradient>

          {/* 標題區 */}
          <View style={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: 10 }}>
            <Text allowFontScaling={false} style={{ color: "#F1F5F9", fontSize: 17, fontWeight: "800", lineHeight: 24 }}>
              {current.title}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 }}>
              <View style={{
                paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99,
                backgroundColor: "#E8520A15", borderWidth: 1, borderColor: "#E8520A30",
              }}>
                <Text allowFontScaling={false} style={{ color: "#FF8C42", fontSize: 10, fontWeight: "700" }}>
                  {new Date(current.created_at).toLocaleDateString("zh-CN")}
                </Text>
              </View>
            </View>
          </View>

          {/* 分割線 */}
          <View style={{ height: 1, backgroundColor: "#2E2E2E", marginHorizontal: 20 }} />

          {/* 內容 */}
          <ScrollView
            style={{ maxHeight: 240, paddingHorizontal: 20, paddingTop: 12 }}
            showsVerticalScrollIndicator={false}
          >
            <Text allowFontScaling={false} style={{ color: "#94A3B8", fontSize: 14, lineHeight: 24 }}>
              {current.content}
            </Text>
            <View style={{ height: 16 }} />
          </ScrollView>

          {/* 翻頁 + 按鈕 */}
          <View
            style={{
              flexDirection: "row", alignItems: "center", gap: 10,
              paddingHorizontal: 20, paddingVertical: 16,
              borderTopWidth: 1, borderTopColor: "#2E2E2E",
            }}
          >
            {total > 1 && (
              <>
                <Pressable
                  style={{
                    width: 42, height: 42, borderRadius: 12,
                    alignItems: "center", justifyContent: "center",
                    backgroundColor: "#1C1C1C",
                    borderWidth: 1,
                    borderColor: idx === 0 ? "#2E2E2E" : "#E8520A40",
                    opacity: idx === 0 ? 0.45 : 1,
                  }}
                  onPress={() => setIdx((i) => Math.max(0, i - 1))}
                  disabled={idx === 0}
                >
                  <ChevronLeft size={18} color={idx === 0 ? "#475569" : "#E8520A"} />
                </Pressable>
                <Pressable
                  style={{
                    width: 42, height: 42, borderRadius: 12,
                    alignItems: "center", justifyContent: "center",
                    backgroundColor: "#1C1C1C",
                    borderWidth: 1,
                    borderColor: idx === total - 1 ? "#2E2E2E" : "#E8520A40",
                    opacity: idx === total - 1 ? 0.45 : 1,
                  }}
                  onPress={() => setIdx((i) => Math.min(total - 1, i + 1))}
                  disabled={idx === total - 1}
                >
                  <ChevronRight size={18} color={idx === total - 1 ? "#475569" : "#E8520A"} />
                </Pressable>
              </>
            )}

            {/* 確認按鈕（愛馬仕橙漸變） */}
            <Pressable
              className="flex-1 overflow-hidden rounded-2xl active:opacity-80"
              onPress={handleClose}
              disabled={closing}
            >
              <LinearGradient
                colors={["#E8520A", "#C43A00"]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={{
                  paddingVertical: 13, alignItems: "center", justifyContent: "center",
                  borderRadius: 16,
                  shadowColor: "#E8520A", shadowOffset: { width: 0, height: 3 },
                  shadowOpacity: 0.4, shadowRadius: 8, elevation: 5,
                }}
              >
                {closing
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text allowFontScaling={false} style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>
                      {idx < total - 1 ? "下一條 →" : "我知道了"}
                    </Text>}
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/* eslint-disable no-undef */
/* eslint-disable */
// @ts-nocheck
import { useState } from "react";
import { View, Text, Pressable, Modal, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { Server, X, CheckCircle2 } from "lucide-react-native";

// ── 本地旗幟圖片映射 ──────────────────────────────────────────
const FLAG_IMGS: Record<string, ReturnType<typeof require>> = {
  hk: require("../../assets/page-img/gq6.png"),
  kr: require("../../assets/page-img/gq5.png"),
  jp: require("../../assets/page-img/gq4.png"),
  th: require("../../assets/page-img/gq4.png"),
  us: require("../../assets/page-img/gq4.png"),
};

// ── 區域多語言文案配置 ─────────────────────────────────────────
interface RegionI18n {
  /** 彈窗標題 */
  title: string;
  /** 正常執行狀態文字 */
  online: string;
  /** 即將開放文字 */
  comingSoon: string;
  /** 當前節點徽章 */
  current: string;
  /** 暫未開放提示（含節點名佔位符 {name}） */
  notOpenTpl: string;
  /** 底部說明 */
  footer: string;
}

const I18N: Record<string, RegionI18n> = {
  "zh-CN": {
    title:       "選擇服務節點",
    online:      "● 連線正常",
    comingSoon:  "即將開放",
    current:     "當前",
    notOpenTpl:  "🚧 {name}暫未開放，敬請期待",
    footer:      "服務節點決定您的資料儲存與處理區域，目前香港區已穩定運營",
  },
  "zh-TW": {
    title:       "選擇服務節點",
    online:      "● 連線正常",
    comingSoon:  "即將開放",
    current:     "當前",
    notOpenTpl:  "🚧 {name}暫未開放，敬請期待",
    footer:      "服務節點決定您的資料儲存與處理區域，目前香港區已穩定運營",
  },
  "ko": {
    title:       "서버 지역 선택",
    online:      "● 연결 정상",
    comingSoon:  "서비스 준비 중",
    current:     "현재",
    notOpenTpl:  "🚧 {name} 지역은 아직 서비스를 제공하지 않습니다",
    footer:      "서버 지역은 데이터 저장 및 처리 위치를 결정합니다. 한국 지역은 준비 중입니다.",
  },
  "ja": {
    title:       "サービスノードを選択",
    online:      "● 接続正常",
    comingSoon:  "近日公開",
    current:     "現在",
    notOpenTpl:  "🚧 {name}はまだご利用いただけません",
    footer:      "サービスノードはデータの儲存・処理場所を決定します。日本ノードは近日公開予定です。",
  },
  "th": {
    title:       "เลือกโหนดเซิร์ฟเวอร์",
    online:      "● เชื่อมต่อปกติ",
    comingSoon:  "เร็วๆ นี้",
    current:     "ปัจจุบัน",
    notOpenTpl:  "🚧 {name} ยังไม่เปิดให้บริการ โปรดรอติดตาม",
    footer:      "โหนดเซิร์ฟเวอร์กำหนดพื้นที่จัดเก็บและประมวลผลข้อมูลของคุณ",
  },
  "en": {
    title:       "Select Server Region",
    online:      "● Connected",
    comingSoon:  "Coming Soon",
    current:     "Active",
    notOpenTpl:  "🚧 {name} is not available yet. Stay tuned!",
    footer:      "The server region determines where your data is stored and processed.",
  },
};

// ── 區域定義 ──────────────────────────────────────────────────
export interface Region {
  key: string;
  /** 對應 FLAG_IMGS 的 key */
  flag: string;
  /** 簡體中文標籤（內部索引用） */
  label: string;
  /** 區域本地語言名稱 */
  localLabel: string;
  available: boolean;
  /** 對應 I18N 語言碼 */
  lang: string;
}

export const REGIONS: Region[] = [
  { key: "hk", flag: "hk", label: "香港區", localLabel: "香港區",        available: true,  lang: "zh-TW" },
  { key: "kr", flag: "kr", label: "韓國區", localLabel: "韓國",           available: false, lang: "ko"    },
  { key: "jp", flag: "jp", label: "日本區", localLabel: "日本區域",       available: false, lang: "ja"    },
  { key: "th", flag: "th", label: "泰國區", localLabel: "泰國區域",       available: false, lang: "th"    },
  { key: "us", flag: "us", label: "美國區", localLabel: "US Region",      available: false, lang: "en"    },
];

interface Props {
  style?: object;
}

export default function ServerRegionSelector({ style }: Props) {
  const [selected, setSelected] = useState<Region>(REGIONS[0]);
  const [modalVisible, setModalVisible] = useState(false);
  const [comingSoonKey, setComingSoonKey] = useState<string | null>(null);

  // 當前選中區域的語言文案
  const i18n = I18N[selected.lang] ?? I18N["zh-CN"];

  const handleSelect = (r: Region) => {
    if (!r.available) {
      setComingSoonKey(r.key);
      return;
    }
    setSelected(r);
    setComingSoonKey(null);
    setModalVisible(false);
  };

  return (
    <>
      {/* 觸發按鈕：旗幟圖片 + 國家文字，與首頁風格一致 */}
      <Pressable
        className="flex-row items-center gap-1.5 px-3 py-2 rounded-full active:opacity-70"
        style={[{
          backgroundColor: "#1A0A0020",
          borderWidth: 1, borderColor: "#E8520A50",
        }, style]}
        onPress={() => { setComingSoonKey(null); setModalVisible(true); }}
      >
        <Server size={12} color="#E8520A" />
        <Image
          source={FLAG_IMGS[selected.flag]}
          style={{ width: 18, height: 14, borderRadius: 2 }}
          contentFit="contain"
        />
        <Text allowFontScaling={false} style={{ color: "#FF8C42", fontSize: 12, fontWeight: "700" }}>
          {selected.localLabel}
        </Text>
      </Pressable>

      {/* 節點選擇 Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setModalVisible(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setModalVisible(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>

            {/* 頂部橙色光暈裝飾 */}
            <View style={styles.glowDecor} pointerEvents="none" />

            {/* 標題欄 */}
            <View style={styles.header}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={styles.headerIcon}>
                  <Server size={15} color="#E8520A" />
                </View>
                <Text allowFontScaling={false} style={styles.title}>{i18n.title}</Text>
              </View>
              <Pressable
                onPress={() => setModalVisible(false)}
                className="active:opacity-70"
                hitSlop={12}
                style={styles.closeBtn}
              >
                <X size={15} color="#64748B" />
              </Pressable>
            </View>

            {/* 節點列表 */}
            <View style={styles.list}>
              {REGIONS.map((r) => {
                const regionI18n = I18N[r.lang] ?? I18N["zh-CN"];
                const isActive = selected.key === r.key;
                const isComingSoon = comingSoonKey === r.key;
                return (
                  <View key={r.key}>
                    <Pressable
                      style={[
                        styles.item,
                        isActive && styles.itemActive,
                        !r.available && styles.itemDisabled,
                      ]}
                      onPress={() => handleSelect(r)}
                      className="active:opacity-70"
                    >
                      <Image
                        source={FLAG_IMGS[r.flag]}
                        style={{ width: 28, height: 22, borderRadius: 3 }}
                        contentFit="contain"
                      />
                      <View style={{ flex: 1 }}>
                        <Text allowFontScaling={false} style={[styles.itemLabel, isActive && styles.itemLabelActive, !r.available && styles.itemLabelDisabled]}>
                          {r.localLabel}
                        </Text>
                        {r.available ? (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
                            <View style={styles.onlineDot} />
                            <Text allowFontScaling={false} style={{ color: "#22C55E", fontSize: 10 }}>{regionI18n.online.replace("● ", "")}</Text>
                          </View>
                        ) : (
                          <Text allowFontScaling={false} style={{ color: "#475569", fontSize: 10, marginTop: 2 }}>{regionI18n.comingSoon}</Text>
                        )}
                      </View>
                      {isActive && (
                        <CheckCircle2 size={18} color="#E8520A" />
                      )}
                      {!r.available && !isActive && (
                        <Text allowFontScaling={false} style={{ color: "#374151", fontSize: 13 }}>🔒</Text>
                      )}
                    </Pressable>

                    {/* 暫未開放提示 */}
                    {isComingSoon && (
                      <View style={styles.comingSoon}>
                        <Text allowFontScaling={false} style={styles.comingSoonText}>
                          {regionI18n.notOpenTpl.replace("{name}", r.localLabel)}
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>

            {/* 底部說明 */}
            <View style={styles.footerRow}>
              <View style={styles.footerDot} />
              <Text allowFontScaling={false} style={styles.footer}>{i18n.footer}</Text>
            </View>

          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "#000000CC",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  sheet: {
    width: "100%",
    backgroundColor: "#141414",
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: "#E8520A35",
    paddingVertical: 20,
    paddingHorizontal: 16,
    overflow: "hidden",
    shadowColor: "#E8520A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 14,
  },
  glowDecor: {
    position: "absolute",
    top: -50, right: -50,
    width: 140, height: 140,
    borderRadius: 70,
    backgroundColor: "#E8520A12",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#E8520A20",
  },
  headerIcon: {
    width: 30, height: 30, borderRadius: 9,
    backgroundColor: "#E8520A18",
    borderWidth: 1, borderColor: "#E8520A40",
    alignItems: "center", justifyContent: "center",
  },
  title: {
    color: "#F1F5F9",
    fontSize: 16,
    fontWeight: "800",
  },
  closeBtn: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: "#FFFFFF0A",
    borderWidth: 1, borderColor: "#FFFFFF12",
    alignItems: "center", justifyContent: "center",
  },
  list: {
    gap: 6,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#2E2E2E",
    backgroundColor: "#1C1C1C",
  },
  itemActive: {
    borderColor: "#E8520A45",
    backgroundColor: "#E8520A0E",
  },
  itemDisabled: {
    opacity: 0.45,
  },
  itemLabel: {
    color: "#94A3B8",
    fontSize: 14,
    fontWeight: "500",
  },
  itemLabelActive: {
    color: "#FF8C42",
    fontWeight: "800",
  },
  itemLabelDisabled: {
    color: "#475569",
  },
  onlineDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: "#22C55E",
  },
  comingSoon: {
    marginTop: 3,
    marginBottom: 3,
    paddingVertical: 7,
    paddingHorizontal: 14,
    backgroundColor: "#EAB30812",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#EAB30830",
  },
  comingSoonText: {
    color: "#EAB308",
    fontSize: 12,
    fontWeight: "500",
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#2E2E2E",
  },
  footerDot: {
    width: 4, height: 4, borderRadius: 2,
    backgroundColor: "#E8520A60",
    marginTop: 5,
  },
  footer: {
    flex: 1,
    color: "#475569",
    fontSize: 11,
    lineHeight: 17,
  },
});

/* eslint-disable no-undef */
/* eslint-disable */
// @ts-nocheck
/**
 * AreaSelector —— 統一服務節點選擇器（首頁 + 登入頁共用）
 *
 * 觸發按鈕：bg1.png 圖片背景 + icon1 定位圖示 + 旗幟圖片
 * 彈窗：bg20.png 全圖背景 + bg21.png 行背景，與首頁完全一致
 *
 * Props:
 *   vw          — 1vw 像素值（width/100），由父層傳入以適應螢幕寬度
 *   areaIndex   — 當前選中區域 id（受控）
 *   onSelect    — 選中回調 (id: number) => void
 */
import { useState } from "react";
import { View, Text, Pressable, Modal, ScrollView, useWindowDimensions } from "react-native";
import { Image } from "expo-image";

// ─── 本地圖片映射 ─────────────────────────────────────────────
const IMGS: Record<string, ReturnType<typeof require>> = {
  "bg1.png":     require("../../assets/page-img/bg1.png"),
  "bg20.png":    require("../../assets/page-img/bg20.png"),
  "bg21.png":    require("../../assets/page-img/bg21.png"),
  "icon1.png":   require("../../assets/page-img/icon1.png"),
  "icon11.png":  require("../../assets/page-img/icon11.png"),
  "icon12.png":  require("../../assets/page-img/icon12.png"),
  "icon13.png":  require("../../assets/page-img/icon13.png"),
  "icon13a.png": require("../../assets/page-img/icon13a.png"),
  "icon13b.png": require("../../assets/page-img/icon13b.png"),
  "gq4.png":     require("../../assets/page-img/gq4.png"),   // 日本
  "gq5.png":     require("../../assets/page-img/gq5.png"),   // 韓國
  "gq6.png":     require("../../assets/page-img/gq6.png"),   // 香港
  "gq-th.png":   require("../../assets/page-img/gq-th.png"), // 泰國
  "gq-ae.png":   require("../../assets/page-img/gq-ae.png"), // 迪拜（阿聯酋）
  "gq-us.png":   require("../../assets/page-img/gq-us.png"), // 美國
};
const IMG = (name: string) => IMGS[name];

// ─── 區域列表（統一定義，兩頁共用）───────────────────────────
export const AREA_LIST = [
  { flag: "gq6.png",  name: "香港區", sub: "連線正常",       locked: false, id: 1 },
  { flag: "gq5.png",  name: "韓國",   sub: "即將開放",       locked: true,  id: 2 },
  { flag: "gq4.png",  name: "日本",   sub: "近日公開",       locked: true,  id: 3 },
  { flag: "gq-th.png",name: "泰國",   sub: "近日公開",       locked: true,  id: 4 },
  { flag: "gq-ae.png",name: "迪拜",   sub: "近日公開",       locked: true,  id: 5 },
  { flag: "gq-us.png",name: "美國",   sub: "近日公開",       locked: true,  id: 6 },
];

/** 預設選中 id（香港區） */
export const DEFAULT_AREA_ID = 1;

interface Props {
  areaIndex: number;
  onSelect: (id: number) => void;
  /** bg1 按鈕寬度，預設 vw*24 */
  btnWidth?: number;
}

export default function AreaSelector({ areaIndex, onSelect, btnWidth }: Props) {
  const { width } = useWindowDimensions();
  const vw = width / 100;

  const bg1W = btnWidth ?? vw * 24;
  const bg1H = bg1W / 3.710;

  const [showArea, setShowArea] = useState(false);

  const currentArea = AREA_LIST.find((a) => a.id === areaIndex) ?? AREA_LIST[0];

  return (
    <>
      {/* ── 觸發按鈕：bg1.png + icon1 + 旗幟 ── */}
      <Pressable onPress={() => setShowArea(true)} style={{ position: "relative", width: bg1W, height: bg1H }}>
        <Image source={IMG("bg1.png")} style={{ width: bg1W, height: bg1H }} contentFit="fill" />
        <View style={{
          position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
          flexDirection: "row", alignItems: "center", justifyContent: "center", gap: vw * 1.5,
        }}>
          <Image source={IMG("icon1.png")} style={{ width: vw * 2.93, height: vw * 2.93 }} contentFit="contain" />
          <Image
            source={IMG(currentArea.flag)}
            style={{ width: vw * 4.5, height: vw * 4.5 / 1.259 }}
            contentFit="contain"
          />
          <Text allowFontScaling={false} style={{ color: "#fff", fontSize: vw * 3.2 }}>{currentArea.name}</Text>
        </View>
      </Pressable>

      {/* ── 彈窗：bg20/bg21 圖片背景 ── */}
      <Modal visible={showArea} transparent animationType="fade" onRequestClose={() => setShowArea(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.95)", alignItems: "center", justifyContent: "center" }}
          onPress={() => setShowArea(false)}
        >
          <Pressable onPress={(e) => e.stopPropagation()} style={{ width: width * 0.9, position: "relative" }}>
            <Image source={IMG("bg20.png")} style={{ width: "100%", aspectRatio: 340 / 480 }} contentFit="fill" />
            <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, padding: vw * 4.27 }}>
              {/* 標題列 */}
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: vw * 3 }}>
                <Image source={IMG("icon11.png")} style={{ width: vw * 8.8, height: vw * 8.8 }} contentFit="contain" />
                <Text allowFontScaling={false} style={{ color: "#fff", fontSize: vw * 4.53, flex: 1, paddingLeft: vw * 3 }}>選擇服務節點</Text>
                <Pressable onPress={() => setShowArea(false)}>
                  <Image source={IMG("icon12.png")} style={{ width: vw * 10.13, height: vw * 10.13 }} contentFit="contain" />
                </Pressable>
              </View>

              {/* 區域列表 */}
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: vw * 100 }}>
                {AREA_LIST.map((area) => (
                  <Pressable
                    key={area.id}
                    onPress={() => {
                      if (!area.locked) {
                        onSelect(area.id);
                        setShowArea(false);
                      }
                    }}
                    style={{ marginBottom: vw * 1.6, position: "relative" }}
                  >
                    <Image source={IMG("bg21.png")} style={{ width: "100%", aspectRatio: 300 / 54 }} contentFit="fill" />
                    <View style={{
                      position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
                      flexDirection: "row", alignItems: "center", paddingHorizontal: vw * 3.2,
                      borderRadius: vw * 3.27,
                      ...(areaIndex === area.id && !area.locked ? { borderWidth: 1, borderColor: "#df5b03" } : {}),
                    }}>
                      <Image
                        source={IMG(area.flag)}
                        style={{ width: vw * 8, height: vw * 5.5, marginRight: vw * 3, opacity: area.locked ? 0.5 : 1 }}
                        contentFit="contain"
                      />
                      <View style={{ flex: 1 }}>
                        <Text allowFontScaling={false} style={{ color: areaIndex === area.id && !area.locked ? "#df5b03" : "#fff", fontSize: vw * 3.2, opacity: area.locked ? 0.5 : 1 }}>
                          {area.name}
                        </Text>
                        <Text allowFontScaling={false} style={{ color: "#fff", fontSize: vw * 3.2, opacity: area.locked ? 0.5 : 0.8 }}>
                          {area.sub}
                        </Text>
                      </View>
                      <Image
                        source={area.locked ? IMG("icon13.png") : areaIndex === area.id ? IMG("icon13a.png") : IMG("icon13b.png")}
                        style={{ width: vw * 6.4, height: vw * 6.4 }}
                        contentFit="contain"
                      />
                    </View>
                  </Pressable>
                ))}
              </ScrollView>

              {/* 底部說明 */}
              <Text allowFontScaling={false} style={{ color: "#fff", fontSize: vw * 3 }}>
                <Text allowFontScaling={false} style={{ color: "#df5b03" }}>* </Text>
                服務節點決定您的資料儲存與處理區域，目前香港區已穩定運營
              </Text>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

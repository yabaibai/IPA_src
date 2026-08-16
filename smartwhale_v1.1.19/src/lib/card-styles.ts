/**
 * SmartWhale 統一卡片設計規範
 * 深炭灰主題 + 愛馬仕橙品牌
 *
 * 使用方式：
 *   import { CARD_STYLE, CARD_STYLE_ACCENT, CARD_INNER } from "@/lib/card-styles";
 *   <View style={CARD_STYLE}>...</View>
 */

import type { ViewStyle } from "react-native";

/** 標準卡片：炭灰底 + 灰色描邊 + 統一立體陰影 */
export const CARD_STYLE: ViewStyle = {
  backgroundColor: "#1C1C1C",
  borderWidth: 1,
  borderColor: "#2E2E2E",
  borderRadius: 16,
  // 立體感：底部輕陰影
  shadowColor: "#000000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.35,
  shadowRadius: 6,
  elevation: 3,
};

/** 品牌卡片：頂部愛馬仕橙微光描邊，用於重要模組卡片 */
export const CARD_STYLE_BRAND: ViewStyle = {
  backgroundColor: "#1C1C1C",
  borderWidth: 1,
  borderColor: "#2E2E2E",
  borderTopColor: "#E8520A40",
  borderTopWidth: 1.5,
  borderRadius: 16,
  shadowColor: "#E8520A",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.15,
  shadowRadius: 8,
  elevation: 4,
};

/** 次級卡片（列表項/內嵌卡片）：更淺、無陰影 */
export const CARD_INNER: ViewStyle = {
  backgroundColor: "#181818",
  borderWidth: 1,
  borderColor: "#282828",
  borderRadius: 12,
};

/** 語義色卡片工廠：用於 tier/狀態等帶品牌色的卡片 */
export function cardWithAccent(accentColor: string): ViewStyle {
  return {
    backgroundColor: "#1C1C1C",
    borderWidth: 1,
    borderColor: accentColor + "40",
    borderTopColor: accentColor + "60",
    borderTopWidth: 1.5,
    borderRadius: 16,
    shadowColor: accentColor,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  };
}

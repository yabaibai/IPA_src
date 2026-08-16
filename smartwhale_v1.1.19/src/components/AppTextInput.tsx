/**
 * AppTextInput — 全域性統一輸入框元件
 * 聚焦時邊框切換為品牌橙色 #E8520A，同時消除 Web 端藍色系統 outline
 * Web 端鍵盤彈出時自動 scrollIntoView，確保輸入框不被鍵盤遮擋
 * 用法：直接替代所有 react-native TextInput，接受相同 props
 */
import React, { useState } from "react";
import { TextInput } from "react-native";

const INPUT_BASE_STYLE = {
  backgroundColor: "#0A0A0A",
  borderWidth: 1,
  color: "#FFFFFF",
  fontSize: 15,
} as const;

const BORDER_DEFAULT = "#FFFFFF15";
const BORDER_FOCUS   = "#E8520A";

const webOutline =
  process.env.EXPO_OS === "web" ? { outlineStyle: "none" as const } : {};

export function AppTextInput(props: React.ComponentProps<typeof TextInput>) {
  const [focused, setFocused] = useState(false);
  const { style, onFocus, onBlur, ...rest } = props;
  return (
    <TextInput
      {...rest}
      underlineColorAndroid="transparent"
      selectionColor={BORDER_FOCUS}
      style={[
        INPUT_BASE_STYLE,
        { borderColor: focused ? BORDER_FOCUS : BORDER_DEFAULT },
        webOutline,
        style as object,
      ]}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
        // Web 端：鍵盤完全彈出後，用 nativeEvent.target 滾動確保輸入框可見
        if (process.env.EXPO_OS === "web") {
          // 先儲存 nativeEvent.target（避免合成事件在 setTimeout 後失效）
          const nativeTarget = e.nativeEvent?.target as unknown as HTMLElement | undefined;
          setTimeout(() => {
            nativeTarget?.scrollIntoView?.({ behavior: "smooth", block: "end" });
          }, 500);
        }
      }}
      onBlur={(e)  => { setFocused(false); onBlur?.(e); }}
    />
  );
}

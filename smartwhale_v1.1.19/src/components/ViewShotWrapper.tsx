// 通用型別基礎（TypeScript 解析用）
// Metro 執行時優先選擇 .native.tsx / .web.tsx
import React from "react";
import { View, type ViewProps } from "react-native";

interface ViewShotProps extends ViewProps {
  options?: Record<string, unknown>;
  children?: React.ReactNode;
}

const ViewShotWrapper = React.forwardRef<View, ViewShotProps>(
  ({ children, options: _options, ...props }, ref) => (
    <View ref={ref} {...props}>{children}</View>
  )
);
ViewShotWrapper.displayName = "ViewShotWrapper";
export default ViewShotWrapper;

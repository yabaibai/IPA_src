// Web 環境：普通 View 替代，capture() 不可用，UI 正常渲染
import React from "react";
import { View, type ViewProps } from "react-native";

interface ViewShotProps extends ViewProps {
  options?: Record<string, unknown>;
  children?: React.ReactNode;
}

// Web 上 ref.capture() 不支援，poster 頁已有 Web 端提示文字兜底
const ViewShotWrapper = React.forwardRef<View, ViewShotProps>(
  ({ children, options: _options, ...props }, ref) => (
    <View ref={ref} {...props}>{children}</View>
  )
);
ViewShotWrapper.displayName = "ViewShotWrapper";
export default ViewShotWrapper;

import { Component, type ReactNode } from 'react';
import { View, Text } from 'react-native';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

// 简易错误边界：捕获子树渲染异常，避免整屏空白
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, message: error instanceof Error ? error.message : String(error) };
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <View className="flex-1 items-center justify-center bg-background px-8">
          <Text className="text-center text-base text-destructive">
            渲染出错：{this.state.message}
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}
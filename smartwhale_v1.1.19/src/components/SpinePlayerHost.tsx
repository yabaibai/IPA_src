import React, { Suspense, useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import type { SpineResource } from '@/lib/spineResources';
import { loadSkiaWeb } from '@/lib/loadSkiaWeb';

// 动态加载 SpinePlayer，确保 @shopify/react-native-skia 的 Skia.web.js 副作用
// （JsiSkApi(global.CanvasKit)）只在 CanvasKit WASM 就绪后才求值，避免白屏。
const SpinePlayer = React.lazy(() => import('./SpinePlayer'));

const SpinePlayerHost: React.FC<{
  playing: boolean;
  resource: SpineResource;
  speed?: number;
}> = (props) => {
  const [ready, setReady] = useState(process.env.EXPO_OS !== 'web');

  useEffect(() => {
    if (process.env.EXPO_OS !== 'web') return;
    let mounted = true;
    (async () => {
      try {
        // loadSkiaWeb 在 web 端动态加载 CanvasKit WASM（平台特定文件，native 端为 no-op）
        await loadSkiaWeb();
      } catch (e) {
        console.error('[spine] LoadSkiaWeb 失败', e);
      } finally {
        if (mounted) setReady(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  if (!ready) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator color="#2563EB" />
        <Text className="mt-3 text-sm text-muted-foreground">动效加载中…</Text>
      </View>
    );
  }

  return (
    <Suspense
      fallback={
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#2563EB" />
          <Text className="mt-3 text-sm text-muted-foreground">动效加载中…</Text>
        </View>
      }
    >
      <SpinePlayer {...props} />
    </Suspense>
  );
};

export default SpinePlayerHost;

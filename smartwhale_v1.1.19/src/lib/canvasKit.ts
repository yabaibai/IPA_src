// 原生端：Skia 通过 JSI 同步安装，无需异步初始化
// Web 端：需调用 LoadSkiaWeb 异步加载 CanvasKit WASM，否则 Skia.Image 等为 undefined
// 通过 locateFile 指向 public/canvaskit.wasm（Expo Web 直接 serve public/ 目录）
export async function ensureCanvasKit(): Promise<void> {
  if (process.env.EXPO_OS === 'web') {
    const { LoadSkiaWeb } = await import(
      '@shopify/react-native-skia/lib/module/web/LoadSkiaWeb.js'
    );
    await LoadSkiaWeb({
      locateFile: () => '/canvaskit.wasm',
    });
  }
}

// Web 专用：动态加载 @shopify/react-native-skia 的 Skia.web.js
// 使用动态 import()，仅在 web 平台打包（.web.ts 后缀让 metro 在 native 打包时跳过此文件）
export async function loadSkiaWeb(): Promise<void> {
  const { LoadSkiaWeb } = await import(
    '@shopify/react-native-skia/lib/module/web/LoadSkiaWeb.js'
  );
  await LoadSkiaWeb({ locateFile: () => '/canvaskit.wasm' });
}
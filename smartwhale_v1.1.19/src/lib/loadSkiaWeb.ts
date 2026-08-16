// Native（Android/iOS）专用：no-op
// Skia 在 native 平台由 JSI 自动初始化，无需加载 CanvasKit WASM
// 此文件仅在 native 打包时被解析（.web.ts 在 native 下被跳过）
export async function loadSkiaWeb(): Promise<void> {
  // native 端无需加载
}
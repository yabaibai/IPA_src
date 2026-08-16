// @shopify/react-native-skia/web 子路径无官方类型声明，手动补充
declare module '@shopify/react-native-skia/lib/module/web/LoadSkiaWeb.js' {
  export const LoadSkiaWeb: (opts?: {
    locateFile?: (file: string) => string;
  }) => Promise<void>;
  export const LoadSkia: (opts?: unknown) => Promise<void>;
}
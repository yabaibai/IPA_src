// Spine 资源加载与运行时封装
// 使用官方 @esotericsoftware/spine-core（spine-ts core）解析骨骼数据，
// 并通过 @shopify/react-native-skia 的 SkImage 提供纹理，实现原生渲染。

import { Asset } from 'expo-asset';
import { Skia } from '@shopify/react-native-skia';
import {
  AtlasAttachmentLoader,
  Skeleton,
  SkeletonData,
  SkeletonJson,
  SkeletonRendererCore,
  Texture,
  TextureAtlas,
} from '@esotericsoftware/spine-core';
// 确保 CanvasKit 已初始化（Web 端异步加载 WASM）
import { ensureCanvasKit } from '@/lib/canvasKit';
import type { SkImage } from '@shopify/react-native-skia';
import type { SpineResource } from '@/lib/spineResources';

export interface LoadedSpine {
  skeleton: Skeleton;
  skeletonData: SkeletonData;
  bounds: { x: number; y: number; width: number; height: number };
  skImage: SkImage;
  renderer: SkeletonRendererCore;
}

// 将 SkImage 适配为 spine Texture 抽象类（供 TextureAtlasPage.setTexture 使用）
class SkiaTexture extends Texture {
  constructor(image: SkImage) {
    super(image as unknown as HTMLImageElement);
  }
  setFilters(): void {}
  setWraps(): void {}
  dispose(): void {}
}

// 图集文本已内联为模块，纹理通过 expo-asset 加载，无需读取本地文件

export async function loadSpine(resource: SpineResource): Promise<LoadedSpine> {
  // 0. 确保 CanvasKit 已就绪（Web 端加载 WASM 并写入 global.CanvasKit）
  await ensureCanvasKit();

  // 1. 通过 expo-asset 加载纹理资源，获取本地可访问 URI
  const pngAssets = await Asset.loadAsync(resource.png);
  const pngAsset = pngAssets[0];
  const pngUri = pngAsset.localUri || pngAsset.uri;

  // 2. 加载纹理图片为 SkImage
  const skData = await Skia.Data.fromURI(pngUri);
  const skImage = Skia.Image.MakeImageFromEncoded(skData);
  if (!skImage) throw new Error('纹理图片解码失败');

  // 3. 图集文本（已内联为模块）
  const atlasText = resource.atlas;

  // 4. 构建 TextureAtlas
  const atlas = new TextureAtlas(atlasText);
  // 将 Skia 纹理注入到每个 page，并修正 page 尺寸为真实纹理尺寸
  const skiaTexture = new SkiaTexture(skImage);
  for (const page of atlas.pages) {
    page.setTexture(skiaTexture);
    page.width = skImage.width();
    page.height = skImage.height();
  }

  // 5. 解析骨骼数据（JSON 已由 Metro 解析为对象）
  const attachmentLoader = new AtlasAttachmentLoader(atlas);
  const parser = new SkeletonJson(attachmentLoader);
  const skeletonData = parser.readSkeletonData(resource.json);

  // 6. 创建 Skeleton 实例
  const skeleton = new Skeleton(skeletonData);
  skeleton.setupPose();

  return {
    skeleton,
    skeletonData,
    bounds: {
      x: skeletonData.x,
      y: skeletonData.y,
      width: skeletonData.width,
      height: skeletonData.height,
    },
    skImage,
    renderer: new SkeletonRendererCore(),
  };
}
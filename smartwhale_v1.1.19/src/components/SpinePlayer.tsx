// Spine 动画渲染组件
// 使用 @shopify/react-native-skia 的 PictureRecorder 将骨骼网格绘制为 SkPicture，
// 每帧通过 requestAnimationFrame 驱动 AnimationState 更新并重绘，实现原生渲染。

import { useEffect, useRef, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import {
  Canvas,
  Picture,
  useCanvasSize,
  type CanvasRef,
  type SkPicture,
} from '@shopify/react-native-skia';
import {
  AnimationState,
  AnimationStateData,
  type RenderCommand,
  type Skeleton,
} from '@esotericsoftware/spine-core';
import { Skia, BlendMode, VertexMode, TileMode, FilterMode, MipmapMode } from '@shopify/react-native-skia';
import type { SkCanvas } from '@shopify/react-native-skia';

import { loadSpine, type LoadedSpine } from '@/lib/spineLoader';
import type { SpineResource } from '@/lib/spineResources';

interface SpinePlayerProps {
  // 是否正在播放（由父组件控制）
  playing: boolean;
  // 当前选中的动画资源
  resource: SpineResource;
  // 播放速度倍率，默认 1
  speed?: number;
}

// 将 spine RenderCommand 链表绘制到 SkCanvas
function drawCommands(
  canvas: SkCanvas,
  command: RenderCommand | undefined,
  skImage: LoadedSpine['skImage'],
) {
  if (!command || !skImage) return;
  const imgW = skImage.width();
  const imgH = skImage.height();
  // 纹理采样画笔：SrcOver 模式，shader 直接提供纹理颜色
  // 注意：CanvasKit 的 drawVertices 用顶点 UV 作为 shader 本地坐标采样，
  // 图片 shader 的本地坐标是像素空间，故 UV 需乘以纹理尺寸
  const texPaint = Skia.Paint();
  texPaint.setAntiAlias(true);
  const shader = skImage.makeShaderOptions(
    TileMode.Clamp,
    TileMode.Clamp,
    FilterMode.Linear,
    MipmapMode.None,
  );
  texPaint.setShader(shader);

  let cmd: RenderCommand | undefined = command;
  while (cmd) {
    const numV = cmd.numVertices;
    const positions: { x: number; y: number }[] = [];
    const texCoords: { x: number; y: number }[] = [];
    const stride = cmd.positions.length / numV;
    for (let i = 0; i < numV; i++) {
      positions.push({ x: cmd.positions[i * stride], y: cmd.positions[i * stride + 1] });
      // UV 由归一化 (0..1) 转为像素空间 (0..imgW, 0..imgH)
      // Spine UV 原点在左上（与图片纹理一致），无需翻转
      texCoords.push({ x: cmd.uvs[i * 2] * imgW, y: cmd.uvs[i * 2 + 1] * imgH });
    }
    const indices = Array.from(cmd.indices.subarray(0, cmd.numIndices));
    // 不传顶点颜色：纹理 shader 直接提供颜色与透明度，避免白色 tint 导致背景
    const verts = Skia.MakeVertices(VertexMode.Triangles, positions, texCoords, undefined, indices);
    canvas.drawVertices(verts, BlendMode.SrcOver, texPaint);
    cmd = cmd.next;
  }
}

// 生成一帧 SkPicture（含骨骼网格 + 诊断参考框）
function buildPicture(
  loaded: LoadedSpine,
  width: number,
  height: number,
): SkPicture {
  const b = loaded.bounds;
  const scale = Math.min(width / b.width, height / b.height) * 0.9;
  // X 轴居中；Y 轴翻转（Spine 坐标系 Y 向上，画布 Y 向下）
  const offsetX = (width - b.width * scale) / 2 - b.x * scale;
  const offsetY = height / 2 + (b.y + b.height / 2) * scale;

  const recorder = Skia.PictureRecorder();
  const canvas = recorder.beginRecording();
  canvas.translate(offsetX, offsetY);
  canvas.scale(scale, -scale);
  const command = loaded.renderer.render(loaded.skeleton as Skeleton, false);
  drawCommands(canvas, command, loaded.skImage);
  return recorder.finishRecordingAsPicture();
}

export default function SpinePlayer({ playing, resource, speed = 1 }: SpinePlayerProps) {
  const { ref, size } = useCanvasSize();
  const canvasRef = ref as React.RefObject<CanvasRef | null>;
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [picture, setPicture] = useState<SkPicture | null>(null);

  const loadedRef = useRef<LoadedSpine | null>(null);
  const animStateRef = useRef<AnimationState | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const playingRef = useRef(playing);
  const sizeRef = useRef(size);
  const speedRef = useRef(speed);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  useEffect(() => {
    sizeRef.current = size;
  }, [size]);

  // 加载资源（resource 变化时重新加载）
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPicture(null);
    (async () => {
      try {
        const loaded = await loadSpine(resource);
        if (cancelled) return;
        loadedRef.current = loaded;
        const stateData = new AnimationStateData(loaded.skeletonData);
        const state = new AnimationState(stateData);
        state.setAnimation(0, 'animation', true);
        animStateRef.current = state;
        setLoading(false);
      } catch (e) {
        console.error('[spine] load error', e);
        if (!cancelled) {
          setError(e instanceof Error ? e.message : '资源加载失败');
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [resource]);

  // 动画循环：加载完成后启动，每帧更新骨骼并重建 SkPicture
  useEffect(() => {
    if (loading || error) return;
    lastTimeRef.current = performance.now();
    const loop = (now: number) => {
      const loaded = loadedRef.current;
      const state = animStateRef.current;
      if (!loaded || !state) return;
      const delta = Math.min((now - lastTimeRef.current) / 1000, 0.05);
      lastTimeRef.current = now;
      if (playingRef.current) {
        state.update(delta * speedRef.current);
        state.apply(loaded.skeleton);
        loaded.skeleton.updateWorldTransform(2); // Physics.update
      }
      const { width, height } = sizeRef.current;
      if (width > 0 && height > 0) {
        setPicture(buildPicture(loaded, width, height));
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [loading, error]);

  return (
    <View className="flex-1">
      {/* Canvas 始终挂载，Picture 始终存在（即使初始为 null），确保渲染管线稳定 */}
      {/* opaque={false} 使画布背景透明，可叠加在任意背景之上 */}
      <Canvas ref={canvasRef} className="flex-1" style={{ width: '100%', height: '100%' }} opaque={false}>
        {picture ? <Picture picture={picture} /> : null}
      </Canvas>

      {loading ? (
        <View className="absolute inset-0 items-center justify-center">
          <ActivityIndicator color="#2563EB" />
          <Text className="mt-3 text-sm text-muted-foreground">动效加载中…</Text>
        </View>
      ) : null}

      {error ? (
        <View className="absolute inset-0 items-center justify-center bg-background px-8">
          <Text className="text-center text-base text-destructive">{error}</Text>
        </View>
      ) : null}
    </View>
  );
}
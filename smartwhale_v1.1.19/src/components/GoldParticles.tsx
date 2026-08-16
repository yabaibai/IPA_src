/**
 * GoldParticles — 全屏金色粒子爆炸動效
 * - 共識達成時觸發，30 顆粒子從螢幕中央向四周擴散
 * - 每顆粒子：隨機方向 + 隨機大小 + 隨機速度
 * - 動畫：scale 0→1 + 離心運動 + opacity 1→0，持續 1.8s
 */
import { useEffect, useRef } from "react";
import { View, Animated, Easing, useWindowDimensions } from "react-native";

const PARTICLE_COUNT = 30;
const GOLD_COLORS = ["#FDE68A", "#FCD34D", "#F59E0B", "#FBBF24", "#FEF08A", "#FFFFFF"];

interface ParticleConfig {
  angle: number;       // 飛出角度（rad）
  distance: number;   // 飛出距離 px
  size: number;        // 粒子直徑 px
  color: string;
  delay: number;       // 啟動延遲 ms
  duration: number;    // 動畫時長 ms
}

let _seed = 7;
const rand = () => { _seed = (_seed * 1664525 + 1013904223) & 0xffffffff; return (_seed >>> 0) / 0xffffffff; };

function genParticles(w: number, h: number): ParticleConfig[] {
  _seed = Date.now() & 0xffffff; // 每次炸開隨機化
  const maxDist = Math.min(w, h) * 0.45;
  return Array.from({ length: PARTICLE_COUNT }, () => ({
    angle: rand() * Math.PI * 2,
    distance: maxDist * (0.35 + rand() * 0.65),
    size: 3 + rand() * 8,
    color: GOLD_COLORS[Math.floor(rand() * GOLD_COLORS.length)],
    delay: rand() * 200,
    duration: 1200 + rand() * 600,
  }));
}

function Particle({ cfg, originX, originY }: { cfg: ParticleConfig; originX: number; originY: number }) {
  const progress = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.sequence([
      Animated.delay(cfg.delay),
      Animated.parallel([
        Animated.timing(progress, {
          toValue: 1, duration: cfg.duration,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(opacity, { toValue: 1, duration: 80, useNativeDriver: true }),
          Animated.timing(opacity, {
            toValue: 0, duration: cfg.duration - 80,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ]),
    ]);
    anim.start();
    return () => anim.stop();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const dx = Math.cos(cfg.angle) * cfg.distance;
  const dy = Math.sin(cfg.angle) * cfg.distance;

  return (
    <Animated.View
      style={{
        position: "absolute",
        left: originX - cfg.size / 2,
        top: originY - cfg.size / 2,
        width: cfg.size,
        height: cfg.size,
        borderRadius: cfg.size / 2,
        backgroundColor: cfg.color,
        opacity,
        transform: [
          { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, dx] }) },
          { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, dy] }) },
          { scale: progress.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1.4, 0.6] }) },
        ],
      }}
    />
  );
}

export default function GoldParticles() {
  const { width, height } = useWindowDimensions();
  // 爆炸原點：螢幕中央偏上（與 ConsensusNetwork 中心對齊）
  const originX = width / 2;
  const originY = height * 0.42;

  // 每次渲染重新生成粒子（won 變 true 時只掛載一次）
  const particles = useRef(genParticles(width, height)).current;

  return (
    <View
      style={{
        position: "absolute",
        left: 0, top: 0,
        width, height,
        pointerEvents: "none",
      }}
    >
      {particles.map((cfg, i) => (
        <Particle key={i} cfg={cfg} originX={originX} originY={originY} />
      ))}
    </View>
  );
}

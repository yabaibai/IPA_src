/**
 * StarryBackground — 星空背景元件
 * - 隨機分佈的星星，各自獨立閃爍（opacity 迴圈動畫）
 * - 偶爾飛過的流星（漸變拖尾光效：頭部亮白 → 尾部透明）
 */
import { useEffect, useRef } from "react";
import { View, Animated, Easing, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

// ── 星星配置 ─────────────────────────────────────────────────
const STAR_COUNT = 70;

interface StarConfig {
  x: number;       // 百分比 0~1
  y: number;
  size: number;    // 1~3
  delay: number;   // 動畫延遲 ms
  period: number;  // 閃爍週期 ms
  baseOpacity: number;
}

function genStars(seed: number): StarConfig[] {
  // 固定偽隨機（避免每次渲染重新佈局）
  let s = seed;
  const rand = () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
  return Array.from({ length: STAR_COUNT }, () => ({
    x: rand(),
    y: rand(),
    size: 1 + rand() * 2,
    delay: rand() * 4000,
    period: 2000 + rand() * 4000,
    baseOpacity: 0.3 + rand() * 0.5,
  }));
}
const STARS = genStars(42);

// ── 流星配置 ─────────────────────────────────────────────────

interface MeteorConfig {
  startX: number;  // 起始 x 百分比（右側區域 0.5~1.1）
  startY: number;  // 起始 y 百分比（上方區域 -0.1~0.3）
  length: number;  // 長度 px
  interval: number;// 觸發間隔 ms
  duration: number;// 飛行時長 ms
  angle: number;   // 角度（deg）
}

const METEORS: MeteorConfig[] = [
  { startX: 0.85, startY: 0.05, length: 120, interval: 5000, duration: 900, angle: 215 },
  { startX: 0.65, startY: -0.02, length: 90, interval: 8000, duration: 700, angle: 220 },
  { startX: 1.0, startY: 0.15, length: 150, interval: 11000, duration: 1100, angle: 210 },
  { startX: 0.75, startY: 0.08, length: 100, interval: 15000, duration: 800, angle: 225 },
];

// ── 星星子元件 ────────────────────────────────────────────────
function Star({ config, width, height }: { config: StarConfig; width: number; height: number }) {
  const opacity = useRef(new Animated.Value(config.baseOpacity)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(config.delay),
        Animated.timing(opacity, {
          toValue: 1,
          duration: config.period / 2,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: config.baseOpacity * 0.3,
          duration: config.period / 2,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const left = config.x * width;
  const top = config.y * height;

  return (
    <Animated.View
      style={{
        position: "absolute",
        left,
        top,
        width: config.size,
        height: config.size,
        borderRadius: config.size / 2,
        backgroundColor: config.size > 2 ? "#E0E7FF" : "#94A3B8",
        opacity,
      }}
    />
  );
}

// ── 流星子元件（漸變拖尾版） ──────────────────────────────────
// 漸變方向：頭部（運動方向前端）= 亮白/藍，尾部 = 完全透明
// LinearGradient colors[0] 對應 start，colors[1] 對應 end
// 流星 rotate 後，左邊是頭（運動前端），右邊是尾
// 所以 start={x:0,y:0.5} → end={x:1,y:0.5} 即從左（頭）到右（尾）
// 頭部：rgba(255,255,255,0.95)  尾部：完全透明
function Meteor({ config, width, height }: { config: MeteorConfig; width: number; height: number }) {
  const progress = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    function fire() {
      progress.setValue(0);
      opacity.setValue(0);
      Animated.parallel([
        // 整體淡入後慢慢淡出
        Animated.sequence([
          Animated.timing(opacity, { toValue: 1, duration: 120, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0, duration: config.duration - 120, useNativeDriver: true }),
        ]),
        Animated.timing(progress, {
          toValue: 1, duration: config.duration,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
      timer = setTimeout(fire, config.interval + Math.random() * 3000);
    }
    timer = setTimeout(fire, config.interval * Math.random());
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const rad = (config.angle * Math.PI) / 180;
  const dx = Math.cos(rad) * config.length * 1.8; // 移動距離略大於自身長度
  const dy = Math.sin(rad) * config.length * 1.8;

  const startX = config.startX * width;
  const startY = config.startY * height;

  // 漸變：右（尾）→ 左（頭）= 透明 → 白亮
  // rotate 後左端是運動方向，所以 colors[0]=白(頭) colors[1]=透明(尾)
  return (
    <Animated.View
      style={{
        position: "absolute",
        left: startX,
        top: startY - 1.5, // 垂直居中 3px 高度
        width: config.length,
        height: 3,
        borderRadius: 2,
        overflow: "hidden",
        opacity,
        transform: [
          { rotate: `${config.angle}deg` },
          { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, dx] }) },
          { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, dy] }) },
        ],
      }}
    >
      {/* 漸變拖尾：頭部(左)亮白 → 尾部(右)完全透明 */}
      <LinearGradient
        colors={["rgba(255,255,255,0.95)", "rgba(147,197,253,0.6)", "transparent"]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={{ flex: 1, borderRadius: 2 }}
      />
    </Animated.View>
  );
}

// ── 主元件 ────────────────────────────────────────────────────
export default function StarryBackground() {
  const { width, height } = useWindowDimensions();

  return (
    <View
      style={{
        position: "absolute",
        left: 0, top: 0,
        width, height,
        overflow: "hidden",
        pointerEvents: "none",
      }}
    >
      {STARS.map((s, i) => (
        <Star key={i} config={s} width={width} height={height} />
      ))}
      {METEORS.map((m, i) => (
        <Meteor key={i} config={m} width={width} height={height} />
      ))}
    </View>
  );
}

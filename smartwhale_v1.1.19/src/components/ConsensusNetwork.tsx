/**
 * ConsensusNetwork — 節點共識投票動畫元件
 *
 * 動畫階段：
 *  Phase 0: 待機（節點呼吸脈衝）
 *  Phase 1: 廣播發起（中心節點放大 + 水波紋擴散，0~0.8s）
 *  Phase 2: 訊息廣播（連線流光，內環→外環，0.8~2.5s）
 *  Phase 3: 節點投票（逐節點變色 + 觸覺反饋，2.5~4.5s）
 *  Phase 4: 共識揭曉（全網光效 + 觸覺通知，4.5~5.5s）
 *  Phase 5: 結束（回撥通知父元件）
 */
import { useEffect, useRef, useCallback, useState, useMemo } from "react";
import { View, Text, Animated, Easing, Pressable, Modal } from "react-native";
import Svg, { Line, Circle } from "react-native-svg";
import * as Haptics from "expo-haptics";

// ── 節點座標計算 ──────────────────────────────────────────────
const CANVAS = 340;  // 畫布尺寸
const CX = CANVAS / 2;
const CY = CANVAS / 2;

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

// 內環4個節點（90° 間隔，從 -60° 開始錯開）
const INNER_R = 88;
const INNER_NODES = Array.from({ length: 4 }, (_, i) => polar(CX, CY, INNER_R, -60 + i * 90));

// 外環8個節點（45° 間隔，從 -80° 開始錯開）
const OUTER_R = 150;
const OUTER_NODES = Array.from({ length: 8 }, (_, i) => polar(CX, CY, OUTER_R, -80 + i * 45));

// 所有對等節點（不含中心）
const PEER_NODES = [...INNER_NODES, ...OUTER_NODES]; // 12個

// 連線：中心→內環（4條） + 內環→部分外環（8條交叉）
type Edge = { from: { x: number; y: number }; to: { x: number; y: number }; nodeIdx: number };
const CENTER = { x: CX, y: CY };

const EDGES: Edge[] = [
  ...INNER_NODES.map((n, i) => ({ from: CENTER, to: n, nodeIdx: i })),
  ...OUTER_NODES.map((n, i) => ({
    from: INNER_NODES[i % 4],
    to: n,
    nodeIdx: 4 + i,
  })),
];

// ── 顏色常量 ─────────────────────────────────────────────────
const COLORS = {
  bg: "#0A0F2E",
  nodeBg: "#1E293B",
  nodeBorder: "#334155",
  center: "#EAB308",
  broadcast: "#E8520A",
  win: "#22C55E",
  lose: "#EF4444",
  edgeDefault: "#1E2940",
  edgeActive: "#E8520A",
  edgeWin: "#22C55E",
};

// ── 節點靜態資訊（每次元件掛載時生成，保持穩定） ──────────
const NODE_LABELS = ["A", "B", "C", "D", "E", "F", "G", "H", "J", "K", "L", "M"];

function genHex(len: number): string {
  return Array.from({ length: len }, () =>
    Math.floor(Math.random() * 16).toString(16).toUpperCase()
  ).join("");
}

interface NodeInfo {
  label: string;
  address: string;
  hashrate: string;
  region: string;
}

function genNodeInfos(): NodeInfo[] {
  const regions = ["Asia-SG", "US-West", "EU-DE", "Asia-JP", "US-East", "EU-NL", "Asia-HK", "AU-SYD", "CA-MTL", "BR-SAO", "IN-MUM", "KR-SEL"];
  return NODE_LABELS.map((label, i) => ({
    label,
    address: `0x${genHex(4)}...${genHex(4)}`,
    hashrate: `${(0.5 + Math.random() * 8).toFixed(1)} TH/s`,
    region: regions[i],
  }));
}

// ── Props ────────────────────────────────────────────────────
export type ConsensusPhase = 0 | 1 | 2 | 3 | 4 | 5;

interface Props {
  phase: ConsensusPhase;
  won: boolean | null;      // null = 尚未知曉
  onPhaseComplete?: (phase: ConsensusPhase) => void;
}

// ── 輔助：將 Animated.Value 包裝為可驅動的 AnimatedCircle ──
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedLine = Animated.createAnimatedComponent(Line);

export default function ConsensusNetwork({ phase, won, onPhaseComplete }: Props) {
  // ── 節點靜態資訊（元件掛載時生成一次） ─────────────────────
  const nodeInfos = useMemo(() => genNodeInfos(), []);

  // ── 節點資訊卡片狀態 ───────────────────────────────────────
  const [selectedNode, setSelectedNode] = useState<number | null>(null);
  // ── 中心節點動畫 ───────────────────────────────────────────
  const centerScale = useRef(new Animated.Value(1)).current;
  const centerGlow = useRef(new Animated.Value(0)).current;  // 0=待機 1=啟用

  // ── 水波紋（3圈） ──────────────────────────────────────────
  const waves = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;

  // ── 節點狀態：每個節點獨立透明度 + 顏色插值 ───────────────
  // 0=待機灰, 1=廣播紫, 2=贊成綠, 3=反對紅
  const nodeStates = useRef(
    PEER_NODES.map(() => new Animated.Value(0))
  ).current;

  // ── 節點呼吸（待機） ──────────────────────────────────────
  const breathe = useRef(new Animated.Value(0.6)).current;
  const breatheAnim = useRef<Animated.CompositeAnimation | null>(null);

  // ── 連線啟用狀態 ──────────────────────────────────────────
  const edgeStates = useRef(EDGES.map(() => new Animated.Value(0))).current;

  // ── 全域性光暈（共識揭曉） ───────────────────────────────────
  const globalGlow = useRef(new Animated.Value(0)).current;

  // ── 投票分佈（由 won 值決定） ─────────────────────────────
  const voteDistRef = useRef<boolean[]>([]);

  const computeVoteDist = useCallback((didWin: boolean) => {
    const total = PEER_NODES.length; // 12
    // 中獎：9~11個贊成；未中獎：3~4個贊成
    const winCount = didWin
      ? 9 + Math.floor(Math.random() * 3)   // 9~11
      : 3 + Math.floor(Math.random() * 2);   // 3~4
    const indices = Array.from({ length: total }, (_, i) => i);
    // Fisher-Yates shuffle 取前 winCount 個
    for (let i = total - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    voteDistRef.current = Array.from({ length: total }, (_, i) =>
      indices.slice(0, winCount).includes(i)
    );
  }, []);

  // ── Phase 0：待機呼吸 ─────────────────────────────────────
  useEffect(() => {
    if (phase === 0) {
      breatheAnim.current = Animated.loop(
        Animated.sequence([
          Animated.timing(breathe, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(breathe, { toValue: 0.6, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ])
      );
      breatheAnim.current.start();
    } else {
      breatheAnim.current?.stop();
      breathe.setValue(1);
    }
    return () => breatheAnim.current?.stop();
  }, [phase, breathe]);

  // ── Phase 1：廣播發起（中心放大 + 水波紋） ────────────────
  useEffect(() => {
    if (phase !== 1) return;
    // 重置
    waves.forEach(w => w.setValue(0));
    centerGlow.setValue(0);

    Animated.sequence([
      // 中心節點彈跳
      Animated.timing(centerScale, { toValue: 1.4, duration: 180, useNativeDriver: true }),
      Animated.timing(centerScale, { toValue: 1.0, duration: 180, useNativeDriver: true }),
      // 中心變金色啟用
      Animated.timing(centerGlow, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();

    // 3圈水波紋錯開發出
    waves.forEach((w, i) => {
      Animated.sequence([
        Animated.delay(i * 200),
        Animated.timing(w, {
          toValue: 1, duration: 700,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
    });

    const timer = setTimeout(() => onPhaseComplete?.(1), 900);
    return () => clearTimeout(timer);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Phase 2：連線流光廣播 ─────────────────────────────────
  useEffect(() => {
    if (phase !== 2) return;
    edgeStates.forEach(e => e.setValue(0));

    // 內環連線先亮（0~4），外環後亮（4~12），錯開時間
    const anims = EDGES.map((_, i) => {
      const delay = i < 4 ? i * 120 : 400 + (i - 4) * 100;
      return Animated.sequence([
        Animated.delay(delay),
        Animated.timing(edgeStates[i], { toValue: 1, duration: 350, useNativeDriver: true }),
      ]);
    });

    Animated.parallel(anims).start();

    // 連線啟用後，節點短暫紫色閃爍
    PEER_NODES.forEach((_, ni) => {
      const delay = ni < 4 ? ni * 120 + 300 : 700 + (ni - 4) * 100;
      setTimeout(() => {
        Animated.sequence([
          Animated.timing(nodeStates[ni], { toValue: 1, duration: 200, useNativeDriver: true }),
          Animated.timing(nodeStates[ni], { toValue: 0, duration: 300, useNativeDriver: true }),
        ]).start();
      }, delay);
    });

    const timer = setTimeout(() => onPhaseComplete?.(2), 1900);
    return () => clearTimeout(timer);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Phase 3：逐節點投票 ────────────────────────────────────
  useEffect(() => {
    if (phase !== 3 || won === null) return;
    computeVoteDist(won);
    nodeStates.forEach(n => n.setValue(0));

    PEER_NODES.forEach((_, ni) => {
      const delay = 200 + ni * 150 + Math.random() * 100;
      const targetVal = voteDistRef.current[ni] ? 2 : 3; // 2=綠 3=紅
      setTimeout(() => {
        Animated.timing(nodeStates[ni], {
          toValue: targetVal, duration: 300, useNativeDriver: true,
        }).start();
        // 每個節點投票時輕微觸覺反饋
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }, delay);
    });

    const timer = setTimeout(() => onPhaseComplete?.(3), 2500);
    return () => clearTimeout(timer);
  }, [phase, won]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Phase 4：共識揭曉 ─────────────────────────────────────
  useEffect(() => {
    if (phase !== 4) return;
    Animated.sequence([
      Animated.timing(globalGlow, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(globalGlow, { toValue: 0.3, duration: 400, useNativeDriver: true }),
    ]).start();

    // 連線全部變色
    edgeStates.forEach((e, i) => {
      setTimeout(() => {
        Animated.timing(e, { toValue: won ? 2 : 1.5, duration: 300, useNativeDriver: true }).start();
      }, i * 40);
    });

    // 共識揭曉觸覺通知
    setTimeout(() => {
      if (won) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    }, 300);

    const timer = setTimeout(() => onPhaseComplete?.(4), 1200);
    return () => clearTimeout(timer);
  }, [phase, won]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 統計票數 ──────────────────────────────────────────────
  const winVotes = phase >= 3 ? voteDistRef.current.filter(Boolean).length : 0;
  const loseVotes = phase >= 3 ? PEER_NODES.length - winVotes : 0;
  const pending = phase === 3 ? PEER_NODES.length - winVotes - loseVotes : 0;

  // ── 節點投票狀態文字 ──────────────────────────────────────
  function voteStatusLabel(ni: number): string {
    if (phase < 3) return "待投票";
    const voted = voteDistRef.current[ni];
    if (voted === undefined) return "待投票";
    return voted ? "✅ 贊成" : "❌ 反對";
  }

  function voteStatusColor(ni: number): string {
    if (phase < 3) return "#64748B";
    const voted = voteDistRef.current[ni];
    if (voted === undefined) return "#64748B";
    return voted ? COLORS.win : COLORS.lose;
  }

  return (
    <View style={{ width: CANVAS, alignSelf: "center" }}>

      {/* ── 投票計數器 ─────────────────────────────── */}
      {phase >= 3 && (
        <View style={{ flexDirection: "row", justifyContent: "center", gap: 16, marginBottom: 8 }}>
          <Text allowFontScaling={false} style={{ color: COLORS.win, fontSize: 13, fontWeight: "700" }}>
            ✅ 赞成 {winVotes}
          </Text>
          <Text allowFontScaling={false} style={{ color: COLORS.lose, fontSize: 13, fontWeight: "700" }}>
            ❌ 反对 {loseVotes}
          </Text>
          {pending > 0 && (
            <Text allowFontScaling={false} style={{ color: "#64748B", fontSize: 13 }}>
              ⏳ 待投 {pending}
            </Text>
          )}
        </View>
      )}

      {/* ── 共識結果標籤 ────────────────────────────── */}
      {phase >= 4 && (
        <View style={{
          alignSelf: "center", marginBottom: 8, paddingHorizontal: 16, paddingVertical: 6,
          borderRadius: 20, backgroundColor: won ? "#22C55E20" : "#EF444420",
          borderWidth: 1, borderColor: won ? "#22C55E50" : "#EF444450",
        }}>
          <Text allowFontScaling={false} style={{ color: won ? COLORS.win : COLORS.lose, fontSize: 13, fontWeight: "700" }}>
            {won
              ? `共識達成 ✅ ${winVotes}/${PEER_NODES.length} 節點透過`
              : `共識未達成 ❌ 僅 ${winVotes}/${PEER_NODES.length} 節點透過`}
          </Text>
        </View>
      )}

      {/* ── SVG 畫布 ─────────────────────────────────── */}
      <View style={{ position: "relative", width: CANVAS, height: CANVAS }}>

        {/* 水波紋（phase 1） */}
        {phase === 1 && waves.map((w, i) => (
          <Animated.View key={i} style={{
            position: "absolute",
            width: CANVAS, height: CANVAS,
            borderRadius: CANVAS / 2,
            borderWidth: 1.5,
            borderColor: COLORS.broadcast,
            opacity: w.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 0.7, 0] }),
            transform: [{
              scale: w.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.9] }),
            }],
            left: 0, top: 0,
          }} />
        ))}

        <Svg width={CANVAS} height={CANVAS}>
          {/* ── 連線 ─────────────────────────────── */}
          {EDGES.map((edge, i) => {
            const state = edgeStates[i];
            return (
              <AnimatedLine
                key={`edge-${i}`}
                x1={edge.from.x} y1={edge.from.y}
                x2={edge.to.x} y2={edge.to.y}
                stroke={state.interpolate({
                  inputRange: [0, 0.99, 1, 1.5, 2],
                  outputRange: [COLORS.edgeDefault, COLORS.edgeDefault, COLORS.edgeActive, COLORS.edgeActive, COLORS.edgeWin],
                }) as unknown as string}
                strokeWidth={state.interpolate({
                  inputRange: [0, 1, 2], outputRange: [0.8, 1.8, 1.5],
                }) as unknown as number}
                opacity={state.interpolate({
                  inputRange: [0, 0.5, 1, 2], outputRange: [0.3, 0.8, 1, 0.9],
                }) as unknown as number}
              />
            );
          })}

          {/* ── 對等節點（內環4 + 外環8） ─────────── */}
          {PEER_NODES.map((node, i) => {
            const r = i < 4 ? 16 : 13;
            const state = nodeStates[i];
            return (
              <AnimatedCircle
                key={`node-${i}`}
                cx={node.x} cy={node.y} r={r}
                fill={COLORS.nodeBg}
                stroke={state.interpolate({
                  inputRange: [0, 0.99, 1, 1.99, 2, 2.99, 3],
                  outputRange: [
                    COLORS.nodeBorder, COLORS.nodeBorder,
                    COLORS.broadcast, COLORS.broadcast,
                    COLORS.win, COLORS.win,
                    COLORS.lose,
                  ],
                }) as unknown as string}
                strokeWidth={state.interpolate({
                  inputRange: [0, 1, 2, 3], outputRange: [1, 2.5, 2.5, 2.5],
                }) as unknown as number}
                opacity={breathe as unknown as number}
              />
            );
          })}

          {/* ── 中心節點 ──────────────────────────── */}
          <AnimatedCircle
            cx={CX} cy={CY} r={22}
            fill={COLORS.nodeBg}
            stroke={centerGlow.interpolate({
              inputRange: [0, 1],
              outputRange: [COLORS.center, "#FDE68A"],
            }) as unknown as string}
            strokeWidth={centerGlow.interpolate({
              inputRange: [0, 1], outputRange: [2, 4],
            }) as unknown as number}
          />

          {/* 全域性光暈疊加（phase 4） */}
          {phase >= 4 && (
            <AnimatedCircle
              cx={CX} cy={CY} r={CANVAS / 2 - 4}
              fill="none"
              stroke={won ? COLORS.win : COLORS.lose}
              strokeWidth={2}
              opacity={globalGlow as unknown as number}
            />
          )}
        </Svg>

        {/* 中心節點文字（不可點選） */}
        <Animated.View style={{
          position: "absolute",
          left: CX - 22, top: CY - 22,
          width: 44, height: 44,
          borderRadius: 22,
          alignItems: "center", justifyContent: "center",
          transform: [{ scale: centerScale }],
        }}>
          <Text allowFontScaling={false} style={{ fontSize: 18 }}>🐋</Text>
        </Animated.View>

        {/* 對等節點 — 可點選熱區（覆蓋 SVG 節點位置） */}
        {PEER_NODES.map((node, i) => {
          const hitSize = i < 4 ? 36 : 30; // 點選區略大於節點半徑
          const label = nodeInfos[i].label;
          return (
            <Pressable
              key={`hit-${i}`}
              onPress={() => { setSelectedNode(i); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
              style={{
                position: "absolute",
                left: node.x - hitSize / 2,
                top: node.y - hitSize / 2,
                width: hitSize, height: hitSize,
                borderRadius: hitSize / 2,
                alignItems: "center", justifyContent: "center",
              }}
            >
              <Text allowFontScaling={false} style={{ color: "#64748B", fontSize: i < 4 ? 9 : 8, fontFamily: "monospace" }}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* ── 節點資訊懸浮卡片 Modal ────────────────────── */}
      <Modal transparent visible={selectedNode !== null} animationType="fade" onRequestClose={() => setSelectedNode(null)}>
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center" }}
          onPress={() => setSelectedNode(null)}
        >
          {selectedNode !== null && (() => {
            const info = nodeInfos[selectedNode];
            const statusColor = voteStatusColor(selectedNode);
            const statusLabel = voteStatusLabel(selectedNode);
            return (
              <Pressable
                onPress={(e) => e.stopPropagation()}
                style={{
                  backgroundColor: "#0D1130",
                  borderRadius: 20, padding: 20, width: 270,
                  borderWidth: 1, borderColor: "#2D3060",
                }}
              >
                {/* 卡片頭 */}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 }}>
                  <View style={{
                    width: 36, height: 36, borderRadius: 18,
                    backgroundColor: "#1E2040", borderWidth: 1.5, borderColor: "#4F46E5",
                    alignItems: "center", justifyContent: "center",
                  }}>
                    <Text allowFontScaling={false} style={{ color: "#FF8C42", fontSize: 13, fontWeight: "700", fontFamily: "monospace" }}>
                      {info.label}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text allowFontScaling={false} style={{ color: "#E2E8F0", fontSize: 14, fontWeight: "700" }}>
                      节点 {info.label}
                    </Text>
                    <Text allowFontScaling={false} style={{ color: "#64748B", fontSize: 11, fontFamily: "monospace", marginTop: 2 }}>
                      {info.address}
                    </Text>
                  </View>
                </View>

                {/* 節點詳情 */}
                {[
                  { label: "節點地區", value: info.region, icon: "🌐" },
                  { label: "當前算力", value: info.hashrate, icon: "⚡" },
                  { label: "投票狀態", value: statusLabel, icon: "🗳️", color: statusColor },
                ].map(row => (
                  <View key={row.label} style={{
                    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
                    paddingVertical: 8, borderTopWidth: 1, borderTopColor: "#1E2040",
                  }}>
                    <Text allowFontScaling={false} style={{ color: "#64748B", fontSize: 12 }}>{row.icon} {row.label}</Text>
                    <Text allowFontScaling={false} style={{ color: row.color ?? "#CBD5E1", fontSize: 12, fontWeight: "600" }}>
                      {row.value}
                    </Text>
                  </View>
                ))}

                <Pressable
                  onPress={() => setSelectedNode(null)}
                  style={{
                    marginTop: 14, paddingVertical: 9, borderRadius: 12,
                    backgroundColor: "#1E2040", alignItems: "center",
                  }}
                >
                  <Text allowFontScaling={false} style={{ color: "#94A3B8", fontSize: 13, fontWeight: "600" }}>關閉</Text>
                </Pressable>
              </Pressable>
            );
          })()}
        </Pressable>
      </Modal>
    </View>
  );
}

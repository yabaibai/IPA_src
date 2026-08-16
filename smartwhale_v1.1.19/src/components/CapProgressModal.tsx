/* eslint-disable no-undef */
/**
 * CapProgressModal — 鯨池封頂進度彈窗（樣式同每日領取彈窗）
 */

import { Modal, View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { Image } from "expo-image";
import type { WhalePool, LevelConfig } from "@/types/types";

// ── 圖片資源（與每日領取彈窗相同外殼）──────────────────────────
const IMG_BG      = require("../../assets/page-img/home_bg20.png");   // 弹窗背景 983×1474
const IMG_CLOSE   = require("../../assets/page-img/home_icon20.png"); // 關閉按鈕
const IMG_BTN_CONFIRM = require("../../assets/page-img/mine_btn_confirm.png");
const IMG_BTN_CANCEL  = require("../../assets/page-img/mine_btn_cancel.png");

// ── 品牌色 ────────────────────────────────────────────────────
const ORANGE  = "#DE792D";
const WHITE   = "#FFFFFF";
const GRAY    = "#999999";
const DIM     = "#666666";
const MUTED   = "#888888";

// ── 進度條顏色 ────────────────────────────────────────────────
function barColor(pct: number): string {
  if (pct >= 100) return "#EF4444";
  if (pct >= 90)  return "#F97316";
  if (pct >= 75)  return "#EAB308";
  return "#22C55E";
}

interface Props {
  visible:    boolean;
  onClose:    () => void;
  pool:       WhalePool;
  config:     LevelConfig;
  onUpgrade?: () => void;
  onRebirth?: () => void;
}

export default function CapProgressModal({
  visible, onClose, pool, config, onUpgrade, onRebirth,
}: Props) {
  // ── 封頂計算 ──────────────────────────────────────────────
  const totalInvestment = Number(config.total_investment) || 0;
  const capLimit        = totalInvestment * 3;
  const totalProduced   = Number(pool.total_produced) || 0;
  const remaining       = Math.max(capLimit - totalProduced, 0);
  const pct             = capLimit > 0 ? Math.min((totalProduced / capLimit) * 100, 100) : 0;
  const isCapped        = !!pool.capped_at;
  const dailyYield      = Number(config.daily_yield) || 0;
  const daysLeft        = (!isCapped && dailyYield > 0 && remaining > 0)
    ? Math.ceil(remaining / dailyYield) : 0;

  const cycleStartMs = isCapped ? new Date(pool.created_at).getTime() : 0;
  const cycleDays    = isCapped
    ? Math.ceil((new Date(pool.capped_at!).getTime() - cycleStartMs) / 86400_000) : 0;

  const color  = barColor(pct);
  const isLv56 = pool.level === 56;
  const isLv1  = pool.level === 1;

  const fmt = (n: number) => n.toFixed(4).replace(/\.?0+$/, "");
  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}
        onPress={onClose}
      >
        <Pressable onPress={(e) => e.stopPropagation()} style={{ width: "100%" }}>
          {/* 外殼與每日領取彈窗完全一致 */}
          <View style={{ width: "100%", backgroundColor: "#000", borderRadius: 12, overflow: "hidden" }}>
            <Image source={IMG_BG} style={StyleSheet.absoluteFillObject} contentFit="fill" />
            <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16 }}>

              {/* 標題行 + 關閉按鈕 */}
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", marginBottom: 16, position: "relative" }}>
                <Text allowFontScaling={false} style={{ color: WHITE, fontSize: 20, fontWeight: "800" }}>
                  {isCapped ? "算力池已封頂" : "封頂查詢"}
                </Text>
                <Pressable onPress={onClose} style={{ position: "absolute", right: 0 }} className="active:opacity-70">
                  <Image source={IMG_CLOSE} style={{ width: 22, height: 22 }} contentFit="contain" />
                </Pressable>
              </View>

              {/* ── Lv.1 無封頂說明 ── */}
              {isLv1 ? (
                <View style={{ backgroundColor: "#16A34A18", borderRadius: 10, padding: 14, borderWidth: 1, borderColor: "#16A34A40", marginBottom: 4 }}>
                  <Text allowFontScaling={false} style={{ color: "#22C55E", fontSize: 14, fontWeight: "700", marginBottom: 4 }}>♾️ 1級永久產出</Text>
                  <Text allowFontScaling={false} style={{ color: GRAY, fontSize: 13, lineHeight: 20 }}>
                    1級算力池無封頂限制，可持續產出 SMT，升級即可解鎖更高日收益。
                  </Text>
                </View>
              ) : (
                <>
                  {/* 數據卡片：第一行 3 欄 */}
                  <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
                    <DataCard label="累計投入" value={`${fmt(totalInvestment)} SMT`} />
                    <DataCard label="封頂倍數" value="× 3" accent={ORANGE} />
                    <DataCard label="產出上限" value={`${fmt(capLimit)} SMT`} accent={ORANGE} />
                  </View>
                  {/* 數據卡片：第二行 2 欄 */}
                  <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
                    <DataCard label="已產出" value={`${fmt(totalProduced)} SMT`} accent={isCapped ? "#EF4444" : WHITE} />
                    <DataCard
                      label="剩餘可產"
                      value={isCapped ? "0 SMT（已封頂）" : `${fmt(remaining)} SMT`}
                      accent={isCapped ? "#EF4444" : "#22C55E"}
                    />
                  </View>

                  {/* 進度條 */}
                  <View style={{ marginBottom: 14 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 5 }}>
                      <Text allowFontScaling={false} style={{ color: GRAY, fontSize: 12 }}>產出進度</Text>
                      <Text allowFontScaling={false} style={{ color, fontSize: 12, fontWeight: "700" }}>{pct.toFixed(1)}%</Text>
                    </View>
                    <View style={{ height: 8, backgroundColor: "#2a2a2a", borderRadius: 100, overflow: "hidden" }}>
                      <View style={{ height: 8, width: `${Math.max(pct, 2)}%`, backgroundColor: color, borderRadius: 100 }} />
                    </View>
                  </View>

                  {/* 即將封頂警示（僅 ≥90% 時顯示） */}
                  {!isCapped && pct >= 90 && (
                    <View style={{ backgroundColor: "#F9731618", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: "#F9731640", marginBottom: 14 }}>
                      <Text allowFontScaling={false} style={{ color: "#F97316", fontSize: 13, fontWeight: "700" }}>⚠️ 即將封頂，建議提前準備升級</Text>
                    </View>
                  )}

                  {/* 已封頂：時間 + 週期 */}
                  {isCapped && (
                    <View style={{ backgroundColor: "#EF444418", borderRadius: 10, padding: 14, borderWidth: 1, borderColor: "#EF444440", marginBottom: 14, gap: 6 }}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                        <Text allowFontScaling={false} style={{ color: DIM, fontSize: 13 }}>封頂時間</Text>
                        <Text allowFontScaling={false} style={{ color: WHITE, fontSize: 13, fontWeight: "600" }}>{fmtDate(pool.capped_at!)}</Text>
                      </View>
                      {cycleDays > 0 && (
                        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                          <Text allowFontScaling={false} style={{ color: DIM, fontSize: 13 }}>本次週期</Text>
                          <Text allowFontScaling={false} style={{ color: WHITE, fontSize: 13, fontWeight: "600" }}>{cycleDays} 天</Text>
                        </View>
                      )}
                    </View>
                  )}

                  {/* 操作按鈕（已封頂時顯示） */}
                  {isCapped && !isLv56 && onUpgrade && (
                    <View style={{ flexDirection: "row", width: "92%", alignSelf: "center", marginTop: 4 }}>
                      <Pressable
                        className="active:opacity-80"
                        onPress={() => { onClose(); setTimeout(onUpgrade, 300); }}
                        style={{ flex: 1, aspectRatio: 390 / 121, position: "relative" }}
                      >
                        <Image source={IMG_BTN_CONFIRM} style={StyleSheet.absoluteFillObject} contentFit="fill" />
                        <View style={[StyleSheet.absoluteFillObject, { alignItems: "center", justifyContent: "center" }]}>
                          <Text allowFontScaling={false} style={{ color: WHITE, fontSize: 14, fontWeight: "700" }}>升級解鎖</Text>
                        </View>
                      </Pressable>
                    </View>
                  )}
                  {isCapped && isLv56 && onRebirth && (
                    <View style={{ flexDirection: "row", width: "92%", alignSelf: "center", marginTop: 4 }}>
                      <Pressable
                        className="active:opacity-80"
                        onPress={() => { onClose(); setTimeout(onRebirth, 300); }}
                        style={{ flex: 1, aspectRatio: 390 / 121, position: "relative" }}
                      >
                        <Image source={IMG_BTN_CANCEL} style={StyleSheet.absoluteFillObject} contentFit="fill" />
                        <View style={[StyleSheet.absoluteFillObject, { alignItems: "center", justifyContent: "center" }]}>
                          <Text allowFontScaling={false} style={{ color: WHITE, fontSize: 14, fontWeight: "700" }}>🌟 鯨魚重生</Text>
                        </View>
                      </Pressable>
                    </View>
                  )}
                </>
              )}
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── 數據小卡片 ────────────────────────────────────────────────
function DataCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: "#1A1A1A", borderRadius: 10, padding: 10, borderWidth: 1, borderColor: "#2A2A2A" }}>
      <Text allowFontScaling={false} style={{ color: "#666", fontSize: 11, marginBottom: 4 }}>{label}</Text>
      <Text allowFontScaling={false} style={{ color: accent ?? WHITE, fontSize: 12, fontWeight: "700" }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {value}
      </Text>
    </View>
  );
}

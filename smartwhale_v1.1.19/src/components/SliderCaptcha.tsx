/* eslint-disable no-undef */
import { useRef, useState, useMemo, useCallback, useEffect } from "react";
import { View, Text, Animated, PanResponder, Pressable, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { CheckCircle, ChevronsRight, RefreshCw, MoveRight } from "lucide-react-native";

const PIECE_SIZE = 52;
const SLIDER_H   = 50;
const PUZZLE_H   = 130;
const TOLERANCE  = 16;
const MAX_ATTEMPTS = 5;

// 真實場景圖片庫 56 張（seed % 長度 選取）
const BG_IMAGES = [
  // ── 原始 6 張 ──
  "https://miaoda-site-img.cdn.bcebos.com/images/baidu_image_search_e3b5f479-c09f-4839-948e-e49c395ecbc5.jpg", // 珊瑚礁水下
  "https://miaoda-site-img.cdn.bcebos.com/images/MiaoTu_9e800648-d92d-4164-a6a5-3be7fa371cd5.jpg",            // 山林風景
  "https://miaoda-site-img.cdn.bcebos.com/images/baidu_image_search_677ab761-0498-45bd-9134-01b34dbaed21.jpg", // 星雲宇宙
  "https://miaoda-site-img.cdn.bcebos.com/images/MiaoTu_70fb2d2f-d510-4e42-914c-68832358cc35.jpg",            // 熱帶海灘
  "https://miaoda-site-img.cdn.bcebos.com/images/baidu_image_search_0794a46a-87e4-4944-91d5-f843b29b9427.jpg", // 抽象幾何
  "https://miaoda-site-img.cdn.bcebos.com/images/baidu_image_search_bf310423-ce3b-4534-ae37-a0a495fa6157.jpg", // 賽博朋克夜城
  // ── 新增 50 張 ──
  "https://miaoda-site-img.cdn.bcebos.com/images/MiaoTu_f9cec1d8-6119-42d2-a293-056b0eb9e6f0.jpg",            // 瀑布森林
  "https://miaoda-site-img.cdn.bcebos.com/images/MiaoTu_497f0321-3752-44eb-99c1-aaa7da570bfd.jpg",            // 櫻花春日
  "https://miaoda-site-img.cdn.bcebos.com/images/baidu_image_search_3bf3999f-f302-436e-bb64-96218b99dfed.jpg", // 北極光
  "https://miaoda-site-img.cdn.bcebos.com/images/baidu_image_search_97cf17bb-201e-4f1a-8451-bbc7b6525d94.jpg", // 火山熔岩夜
  "https://miaoda-site-img.cdn.bcebos.com/images/baidu_image_search_5e0b8505-5745-4ad3-8ae5-777a033a4c64.jpg", // 沙漠沙丘日落
  "https://miaoda-site-img.cdn.bcebos.com/images/MiaoTu_f160acd0-a85c-49b2-afff-291571a39daf.jpg",            // 雪山山峰
  "https://miaoda-site-img.cdn.bcebos.com/images/MiaoTu_646f9687-7c94-4e7a-a150-38a50778fe9b.jpg",            // 熱帶雨林
  "https://miaoda-site-img.cdn.bcebos.com/images/baidu_image_search_6e99d90e-a2ff-494b-8dff-1d61b7c0cb68.jpg", // 閃電風暴
  "https://miaoda-site-img.cdn.bcebos.com/images/MiaoTu_35162542-ad5a-4987-87a7-646506321f4a.jpg",            // 秋葉森林
  "https://miaoda-site-img.cdn.bcebos.com/images/baidu_image_search_b5b4b063-c4c7-4b2c-920c-5079432dc3a3.jpg", // 深海鯨魚
  "https://miaoda-site-img.cdn.bcebos.com/images/baidu_image_search_6b996c60-1754-4a82-9b13-d7c6ded85c8d.jpg", // 熱氣球節
  "https://miaoda-site-img.cdn.bcebos.com/images/MiaoTu_a42606d8-d1ff-4326-8831-8a9ea20b8e45.jpg",            // 古代神廟遺址
  "https://miaoda-site-img.cdn.bcebos.com/images/baidu_image_search_de86d12e-f753-4af9-8ef2-87c44062069f.jpg", // 亞洲霓虹夜市
  "https://miaoda-site-img.cdn.bcebos.com/images/baidu_image_search_fcbf7d23-b9d7-41ac-96ea-303ab1704a54.jpg", // 金門大橋霧
  "https://miaoda-site-img.cdn.bcebos.com/images/MiaoTu_58394769-507a-4fbe-a0f8-cf82a1278d97.jpg",            // 薰衣草花田
  "https://miaoda-site-img.cdn.bcebos.com/images/MiaoTu_f4283874-7ecf-468f-8333-608e914fafe4.jpg",            // 蝴蝶微距
  "https://miaoda-site-img.cdn.bcebos.com/images/MiaoTu_73a1617a-104c-4b0c-891a-da4f33b9ac87.jpg",            // 孔雀羽毛
  "https://miaoda-site-img.cdn.bcebos.com/images/baidu_image_search_c69c41e9-f792-42ea-a8b3-e00296a17a9a.jpg", // 老虎橙紋
  "https://miaoda-site-img.cdn.bcebos.com/images/baidu_image_search_eff0ca03-21ef-4eb4-9664-48d0139c5897.jpg", // 老鷹翱翔
  "https://miaoda-site-img.cdn.bcebos.com/images/MiaoTu_b0ad03a1-1925-42bb-9f13-bf7e5bc5d535.jpg",            // 錦鯉池塘
  "https://miaoda-site-img.cdn.bcebos.com/images/MiaoTu_ec633fcd-51e3-4f6f-b20d-135037d85b45.jpg",            // 煙火夜空
  "https://miaoda-site-img.cdn.bcebos.com/images/baidu_image_search_d1a2cf30-81c5-4abb-8853-b7e15af2e043.jpg", // 水晶洞穴
  "https://miaoda-site-img.cdn.bcebos.com/images/baidu_image_search_f075c415-54da-4485-905f-4b3c227b3675.jpg", // 太陽系星球
  "https://miaoda-site-img.cdn.bcebos.com/images/MiaoTu_652aadc2-44c1-4073-84a6-ba08292ab925.jpg",            // 分形抽象
  "https://miaoda-site-img.cdn.bcebos.com/images/baidu_image_search_bca768c3-69bf-4c86-9c20-8bae1ddc8c64.jpg", // 曼陀羅圖案
  "https://miaoda-site-img.cdn.bcebos.com/images/baidu_image_search_eff6c94e-0b11-42b0-9a9e-dc0e99eaf048.jpg", // 水母發光
  "https://miaoda-site-img.cdn.bcebos.com/images/MiaoTu_7bb43b27-a8c9-46c2-8ef6-94a52d3f181c.jpg",            // 竹林綠光
  "https://miaoda-site-img.cdn.bcebos.com/images/baidu_image_search_56fbe553-b0b6-4a01-8a4b-cd024e5a753c.jpg", // 夢蓮湖倒影
  "https://miaoda-site-img.cdn.bcebos.com/images/baidu_image_search_a52e1ff1-4038-4791-9e7b-66f741efbd22.jpg", // 向日葵田
  "https://miaoda-site-img.cdn.bcebos.com/images/baidu_image_search_296e6b10-701c-4be5-9269-b16909c17a00.jpg", // 大峽穀日落
  "https://miaoda-site-img.cdn.bcebos.com/images/baidu_image_search_3325485d-f60d-4734-88d0-421713a60f20.jpg", // 生物發光海灘
  "https://miaoda-site-img.cdn.bcebos.com/images/baidu_image_search_2e83a38b-1ea5-405d-bee7-4e0185fe994b.jpg", // 北歐峽灣雪
  "https://miaoda-site-img.cdn.bcebos.com/images/baidu_image_search_314bdf24-40b6-4cef-9ca7-d361c7d54b6c.jpg", // 夜櫻燈光
  "https://miaoda-site-img.cdn.bcebos.com/images/baidu_image_search_200e342f-ad33-4140-a157-0e94200086ab.jpg", // 銀河山湖倒影
  "https://miaoda-site-img.cdn.bcebos.com/images/baidu_image_search_f270409e-011f-4ade-81bb-d0a345946d18.jpg", // 火烈鳥群
  "https://miaoda-site-img.cdn.bcebos.com/images/baidu_image_search_52980a56-962d-4bd8-87e6-fb3810f05c55.jpg", // 雪花晶體微距
  "https://miaoda-site-img.cdn.bcebos.com/images/baidu_image_search_1eb4f9da-9f73-47b8-bf61-1d132e172c75.jpg", // 小熊貓
  "https://miaoda-site-img.cdn.bcebos.com/images/MiaoTu_3b282b49-07c9-437c-af69-13a74413c5b3.jpg",            // 熱帶魚礁
  "https://miaoda-site-img.cdn.bcebos.com/images/MiaoTu_838fbad9-31a7-48ce-b1a4-8b22ec278ca3.jpg",            // 中國古代宮殿
  "https://miaoda-site-img.cdn.bcebos.com/images/baidu_image_search_ea46c266-b0c5-447e-a2f8-b55e06ff50d8.jpg", // 地熱溫泉
  "https://miaoda-site-img.cdn.bcebos.com/images/MiaoTu_5ff109d5-aff8-40d7-8fdf-8e89f989ff4c.jpg",            // 俯拍梯田
  "https://miaoda-site-img.cdn.bcebos.com/images/MiaoTu_95ef89ca-5325-4789-a068-3d7b3300376f.jpg",            // 液態抽象漩渦
  "https://miaoda-site-img.cdn.bcebos.com/images/MiaoTu_5bc8db1c-2606-48bb-bf61-8199d22b723b.jpg",            // 海浪桶形卷
  "https://miaoda-site-img.cdn.bcebos.com/images/baidu_image_search_2de352ee-e364-4cc0-b449-1313115199a6.jpg", // 蜂鳥花園
  "https://miaoda-site-img.cdn.bcebos.com/images/baidu_image_search_20b837e5-9ced-4d5d-bfac-20f870cf8c72.jpg", // 鯨鯊潛水員
  "https://miaoda-site-img.cdn.bcebos.com/images/baidu_image_search_d48fd43d-6937-4a21-81d5-a1c38b7dae3c.jpg", // 冰川洞穴
  "https://miaoda-site-img.cdn.bcebos.com/images/MiaoTu_9aa52c0a-fead-410a-9cc7-e013ff626a7f.jpg",            // 楓葉水面倒影
  "https://miaoda-site-img.cdn.bcebos.com/images/baidu_image_search_ab6332fb-aa2c-479c-934b-f9fa6afa0ab5.jpg", // 獅子非洲日落
  "https://miaoda-site-img.cdn.bcebos.com/images/baidu_image_search_640b4a4a-ea07-42b4-9a7b-7adbf774d659.jpg", // 孔雀蜘蛛微距
  "https://miaoda-site-img.cdn.bcebos.com/images/baidu_image_search_cb5a4900-403e-43be-8111-4d8ce6de7adf.jpg", // 宇宙星雲彩色
];

// 每張圖片對應的主題色（用於滑塊/進度條），迴圈複用
const IMG_ACCENTS = [
  "#06B6D4", "#22C55E", "#A855F7", "#F97316", "#E8520A", "#F43F5E",
  "#10B981", "#EAB308", "#3B82F6", "#EC4899", "#14B8A6", "#F59E0B",
  "#8B5CF6", "#84CC16", "#0EA5E9", "#FB7185", "#34D399", "#FBBF24",
];

// 生成挑戰 token（時間戳 + seed 混合，防止重放）
function makeToken(seed: number, targetX: number): string {
  const ts = Date.now();
  const hash = ((ts ^ (seed * 31)) >>> 0).toString(16).padStart(8, "0");
  return `${ts}.${targetX}.${hash}`;
}

// 校驗 token 簽名（時間視窗 120s 內有效）
function verifyToken(token: string, seed: number, finalX: number): boolean {
  try {
    const [tsStr, txStr, hash] = token.split(".");
    const ts = parseInt(tsStr, 10);
    const tx = parseInt(txStr, 10);
    if (Date.now() - ts > 120_000) return false;
    if (Math.abs(finalX - tx) > TOLERANCE) return false;
    const expected = ((ts ^ (seed * 31)) >>> 0).toString(16).padStart(8, "0");
    return hash === expected;
  } catch {
    return false;
  }
}

interface Props {
  onSuccess: () => void;
  /** 可選：外部傳入拼圖寬度，不傳則自動根據屏幕計算 */
  containerWidth?: number;
  /** 可選：滑塊未完成圖標圖片資源（替換預設 ChevronsRight）*/
  iconNormal?: ReturnType<typeof require>;
  /** 可選：滑塊完成圖標圖片資源（替換預設 CheckCircle）*/
  iconSuccess?: ReturnType<typeof require>;
}

export default function SliderCaptcha({ onSuccess, containerWidth, iconNormal, iconSuccess: iconSuccessProp }: Props) {
  const { width: screenW } = useWindowDimensions();
  const PUZZLE_W = containerWidth
    ? Math.max(containerWidth, 220)
    : Math.min(Math.max(screenW - 40, 270), 340);
  const MAX_SLIDE = PUZZLE_W - SLIDER_H;

  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 89999) + 10000);
  const [status, setStatus] = useState<"idle" | "success" | "fail">("idle");
  const [attempts, setAttempts] = useState(0);
  const [hintDelta, setHintDelta] = useState<number | null>(null);

  // 根據 seed 選取圖片和主題色
  const bgImage  = useMemo(() => BG_IMAGES[seed % BG_IMAGES.length],  [seed]);
  const accent   = useMemo(() => IMG_ACCENTS[seed % IMG_ACCENTS.length], [seed]);
  const puzzleNo = useMemo(() => (seed % 900) + 100, [seed]);

  // 缺口位置：全軌道範圍 [12, PUZZLE_W - PIECE_SIZE - 12]
  const targetX = useMemo(() => {
    const pct = ((seed * 11 + 7) % 97) / 97;
    return Math.floor(pct * (PUZZLE_W - PIECE_SIZE - 24)) + 12;
  }, [seed, PUZZLE_W]);

  const pieceTop = (PUZZLE_H - PIECE_SIZE) / 2;

  // token 每題重新整理
  const tokenRef = useRef(makeToken(seed, targetX));
  useEffect(() => {
    tokenRef.current = makeToken(seed, targetX);
  }, [seed, targetX]);

  const slideX   = useRef(new Animated.Value(0)).current;
  const fillAnim = useRef(new Animated.Value(0)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const startX   = useRef(0);

  const doReset = useCallback((delay = 0) => {
    const run = () => {
      Animated.timing(slideX,   { toValue: 0, duration: 280, useNativeDriver: true  }).start();
      Animated.timing(fillAnim, { toValue: 0, duration: 280, useNativeDriver: false }).start();
      setStatus("idle");
      setHintDelta(null);
    };
    if (delay > 0) setTimeout(run, delay);
    else run();
  }, [slideX, fillAnim]);

  const handleRefresh = useCallback(() => {
    setSeed(Math.floor(Math.random() * 89999) + 10000);
    slideX.setValue(0);
    fillAnim.setValue(0);
    setStatus("idle");
    setAttempts(0);
    setHintDelta(null);
  }, [slideX, fillAnim]);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder:  () => true,
    onPanResponderGrant: () => {
      slideX.stopAnimation((v) => { startX.current = v; });
    },
    onPanResponderMove: (_, { dx }) => {
      const nx = Math.max(0, Math.min(MAX_SLIDE, startX.current + dx));
      slideX.setValue(nx);
      // 進度條到滑塊中心（不超過圖標半徑）
      fillAnim.setValue(nx + 22);
    },
    onPanResponderRelease: (_, { dx }) => {
      const finalX = Math.max(0, Math.min(MAX_SLIDE, startX.current + dx));
      const hit = Math.abs(finalX - targetX) <= TOLERANCE;

      if (hit && verifyToken(tokenRef.current, seed, finalX)) {
        Animated.spring(slideX, { toValue: targetX, useNativeDriver: true, tension: 180, friction: 8 }).start();
        // 驗證成功：進度條填滿整個軌道
        Animated.timing(fillAnim, { toValue: PUZZLE_W, duration: 300, useNativeDriver: false }).start();
        setStatus("success");
        setTimeout(() => onSuccess(), 600);
      } else {
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        setHintDelta(Math.round(finalX - targetX));
        setStatus("fail");
        Animated.sequence([
          Animated.timing(shakeAnim, { toValue: 10,  duration: 50, useNativeDriver: true }),
          Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
          Animated.timing(shakeAnim, { toValue: 7,   duration: 50, useNativeDriver: true }),
          Animated.timing(shakeAnim, { toValue: -7,  duration: 50, useNativeDriver: true }),
          Animated.timing(shakeAnim, { toValue: 0,   duration: 50, useNativeDriver: true }),
        ]).start(() => {
          if (newAttempts >= MAX_ATTEMPTS) {
            handleRefresh();
          } else {
            doReset(500);
          }
        });
      }
    },
  }), [seed, targetX, MAX_SLIDE, attempts, slideX, fillAnim, shakeAnim, onSuccess, handleRefresh, doReset]);

  const isSuccess = status === "success";

  const hintText = hintDelta !== null
    ? (hintDelta > 0
      ? `偏右 ${Math.abs(hintDelta)}px，再向左調整`
      : `偏左 ${Math.abs(hintDelta)}px，再向右調整`)
    : null;

  return (
    <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
      {/* 題號（右對齊） */}
      <View className="flex-row items-center justify-end mb-2 px-0.5">
        <Text allowFontScaling={false} style={{ color: accent, fontSize: 11, fontWeight: "700" }}>#{puzzleNo}</Text>
      </View>

      {/* 拼圖主區域 */}
      <View style={{
        width: PUZZLE_W, height: PUZZLE_H, borderRadius: 14, overflow: "hidden",
        borderWidth: 1, borderColor: isSuccess ? "#22C55E60" : "#2D1B69",
        backgroundColor: "#0D0A2E",
      }}>
        {/* ── 背景全圖 ── */}
        <Image
          source={{ uri: bgImage }}
          style={{ position: "absolute", left: 0, top: 0, width: PUZZLE_W, height: PUZZLE_H }}
          contentFit="cover"
          cachePolicy="memory-disk"
        />

        {/* ── 全域性半透明暗化層，讓缺口陰影更明顯 ── */}
        <View style={{ position: "absolute", left: 0, top: 0, width: PUZZLE_W, height: PUZZLE_H, backgroundColor: "#00000030" }} />

        {/* ── 目標缺口：深色遮罩 + 虛線邊框 ── */}
        <View style={{
          position: "absolute", left: targetX, top: pieceTop,
          width: PIECE_SIZE, height: PIECE_SIZE, borderRadius: 10,
          backgroundColor: "#00000085",
          borderWidth: 2, borderStyle: "dashed",
          borderColor: isSuccess ? "#22C55E" : "#FFFFFFAA",
        }} />

        {/* 缺口內向右箭頭提示 */}
        {!isSuccess && (
          <View style={{
            position: "absolute", left: targetX, top: pieceTop,
            width: PIECE_SIZE, height: PIECE_SIZE,
            alignItems: "center", justifyContent: "center",
          }}>
            <MoveRight size={20} color="#FFFFFF" style={{ opacity: 0.6 }} />
          </View>
        )}

        {/* ── 滑動拼圖塊：擷取背景圖對應區域 ── */}
        <Animated.View style={{
          position: "absolute", top: pieceTop,
          width: PIECE_SIZE, height: PIECE_SIZE,
          borderRadius: 10, overflow: "hidden",
          borderWidth: 2.5,
          borderColor: isSuccess ? "#22C55E" : "#FFFFFFDD",
          transform: [{ translateX: slideX }],
          shadowColor: "#000", shadowOpacity: 0.6, shadowRadius: 8, elevation: 10,
        }}>
          {/* 背景圖向左偏移 targetX，向上偏移 pieceTop，使拼圖塊內容與缺口位置完全匹配 */}
          <Image
            source={{ uri: bgImage }}
            style={{
              position: "absolute",
              left: -targetX,
              top:  -pieceTop,
              width: PUZZLE_W,
              height: PUZZLE_H,
            }}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        </Animated.View>

        {/* 成功遮罩 */}
        {isSuccess && (
          <View style={{
            position: "absolute", left: 0, right: 0, top: 0, bottom: 0,
            backgroundColor: "#22C55E18", alignItems: "center", justifyContent: "center",
          }}>
            <CheckCircle size={38} color="#22C55E" />
          </View>
        )}
      </View>

      {/* 差距提示 */}
      {hintText && !isSuccess && (
        <Text allowFontScaling={false} style={{ color: "#F59E0B", fontSize: 10, marginTop: 4, textAlign: "center" }}>
          ↑ {hintText}
          {attempts >= 2 ? `（剩餘 ${MAX_ATTEMPTS - attempts} 次）` : ""}
        </Text>
      )}

      {/* 滑動軌道（style002 樣式：#2a2a2a 底色，完成後 #DE792D，高度 44，白色圓形滑塊）*/}
      <View style={{
        marginTop: hintText ? 4 : 10, height: 44, borderRadius: 22,
        width: PUZZLE_W, backgroundColor: "#2a2a2a",
        overflow: "hidden", justifyContent: "center",
      }}>
        {/* 進度填充層：跟隨滑塊位置，顏色與驗證成功一致 #DE792D */}
        <Animated.View style={{
          position: "absolute", left: 0, top: 0, bottom: 0,
          width: fillAnim,
          backgroundColor: "#DE792D",
        }} />
        {/* 軌道文字 */}
        <Text allowFontScaling={false} style={{
          textAlign: "center", fontSize: 12,
          color: isSuccess ? "#fff" : "#888",
          fontWeight: isSuccess ? "700" : "400",
          position: "absolute", width: "100%",
        }}>
          {isSuccess ? "驗證成功 ✓" : "向右拖動滑塊完成驗證"}
        </Text>
        {/* 拖動手柄：白色圓形 + 圖標（外部傳入 or 預設 lucide）*/}
        <Animated.View
          {...(!isSuccess ? panResponder.panHandlers : {})}
          style={{
            position: "absolute",
            width: 44, height: 44, borderRadius: 22,
            backgroundColor: "#fff",
            alignItems: "center", justifyContent: "center",
            transform: [{ translateX: slideX }],
            shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 4, elevation: 4,
          }}
        >
          {isSuccess
            ? (iconSuccessProp
                ? <Image source={iconSuccessProp} style={{ width: 26, height: 26 }} contentFit="contain" />
                : <CheckCircle size={22} color="#DE792D" />)
            : (iconNormal
                ? <Image source={iconNormal} style={{ width: 26, height: 26 }} contentFit="contain" />
                : <ChevronsRight size={22} color="#DE792D" />)}
        </Animated.View>
      </View>

      {/* 換一題 */}
      {!isSuccess && (
        <Pressable
          onPress={handleRefresh}
          className="self-end mt-1.5 flex-row items-center gap-1 active:opacity-60"
        >
          <RefreshCw size={11} color="#E8520A" />
          <Text allowFontScaling={false} style={{ color: "#E8520A", fontSize: 12 }}>換一題</Text>
        </Pressable>
      )}
    </Animated.View>
  );
}

import { useEffect, useRef, useCallback, useState } from "react";
import {
  useSharedValue,
  useDerivedValue,
  withTiming,
  withSequence,
  Easing,
} from "react-native-reanimated";
import { AppState } from "react-native";

// 隨機浮點數：[min, max]
function randBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

// 步長：當前價格 × 隨機係數，方向隨機
function nextStep(current: number, rangeSpread: number) {
  const maxStep = Math.max(rangeSpread * 0.06, current * 0.003);
  const step = randBetween(current * 0.001, maxStep);
  return Math.random() < 0.5 ? step : -step;
}

export interface UseAnimatedPriceOptions {
  closePrice: number;
  highPrice: number;
  lowPrice: number;
  openPrice: number;
  animDuration?: number;
  intervalMin?: number;
  intervalMax?: number;
}

export interface UseAnimatedPriceResult {
  /** JS state：當前展示價格數值，可直接用在 JSX Text 裡 */
  jsPrice: number;
  /** reanimated shared value：顏色閃爍，用在 useAnimatedStyle */
  priceColor: ReturnType<typeof useDerivedValue<string>>;
  /** 當前動態價格相對 openPrice 的漲跌幅 (%)，隨 jsPrice 同步更新 */
  dynChange: number;
}

export function useAnimatedPrice({
  closePrice,
  highPrice,
  lowPrice,
  openPrice,
  animDuration = 700,
  intervalMin = 1500,
  intervalMax = 3000,
}: UseAnimatedPriceOptions): UseAnimatedPriceResult {
  // JS state：驅動 JSX 數字重渲染
  const [jsPrice, setJsPrice] = useState(closePrice);

  // reanimated shared values：顏色閃爍（UI 執行緒）
  const direction = useSharedValue(0);
  const colorFlash = useSharedValue(0);

  const priceColor = useDerivedValue<string>(() => {
    if (colorFlash.value === 0) return "#F8FAFC";
    return direction.value >= 0 ? "#22C55E" : "#F43F5E";
  });

  const currentRef = useRef(closePrice);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appStateRef = useRef(AppState.currentState);
  // openPrice ref：供 setTimeout 回撥讀取最新值
  const openPriceRef = useRef(openPrice);
  useEffect(() => { openPriceRef.current = openPrice; }, [openPrice]);

  // AppState 監聽：後臺暫停
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => { appStateRef.current = s; });
    return () => sub.remove();
  }, []);

  // closePrice 變化（下拉重新整理）時重置基準
  useEffect(() => {
    currentRef.current = closePrice;
    setJsPrice(closePrice);
  }, [closePrice]);

  const scheduleNext = useCallback(() => {
    const delay = randBetween(intervalMin, intervalMax);
    timerRef.current = setTimeout(() => {
      if (appStateRef.current !== "active") { scheduleNext(); return; }

      const spread = highPrice - lowPrice || closePrice * 0.02;
      let next = currentRef.current + nextStep(currentRef.current, spread);
      if (next > highPrice) next = highPrice - Math.random() * spread * 0.05;
      if (next < lowPrice)  next = lowPrice  + Math.random() * spread * 0.05;

      const dir = next > currentRef.current ? 1 : next < currentRef.current ? -1 : 0;
      currentRef.current = next;

      // 1. reanimated：顏色閃爍
      direction.value = dir;
      colorFlash.value = withSequence(
        withTiming(1, { duration: 200, easing: Easing.out(Easing.ease) }),
        withTiming(0, { duration: animDuration, easing: Easing.in(Easing.ease) }),
      );

      // 2. JS state：數字 + 漲跌幅同步更新
      setTimeout(() => setJsPrice(parseFloat(next.toFixed(4))), 0);

      scheduleNext();
    }, delay);
  }, [highPrice, lowPrice, closePrice, animDuration, intervalMin, intervalMax,
      direction, colorFlash]);

  useEffect(() => {
    scheduleNext();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [scheduleNext]);

  // 動態漲跌幅：基於 jsPrice 和 openPrice 實時計算
  const dynChange = openPrice > 0
    ? ((jsPrice - openPrice) / openPrice) * 100
    : 0;

  return { jsPrice, priceColor, dynChange };
}

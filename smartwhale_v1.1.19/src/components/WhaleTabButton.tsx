import { View, Text, Pressable, type GestureResponderEvent } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolate,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect } from "react";

interface WhaleTabButtonProps {
  onPress?: ((e: GestureResponderEvent) => void) | null;
  onLongPress?: ((e: GestureResponderEvent) => void) | null;
  children?: React.ReactNode;
  accessibilityState?: { selected?: boolean };
  [key: string]: unknown;
}

export default function WhaleTabButton(props: WhaleTabButtonProps) {
  const { onPress, onLongPress, accessibilityState } = props;
  const focused = accessibilityState?.selected;
  const scale = useSharedValue(1);
  const glow = useSharedValue(0);

  // 在 useEffect 中驅動動畫，避免渲染期 side effect
  useEffect(() => {
    glow.value = focused
      ? withTiming(1, { duration: 250 })
      : withTiming(0, { duration: 200 });
  }, [focused]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(glow.value, [0, 1], [0, 0.45]),
    transform: [{ scale: interpolate(glow.value, [0, 1], [0.7, 1.15]) }],
  }));

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={() => { scale.value = withSpring(0.85, { damping: 12 }); }}
      onPressOut={() => { scale.value = withSpring(1, { damping: 10 }); }}
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",  // 居中對齊，不依賴 overflow:visible
        paddingBottom: 4,
      }}
    >
      <View style={{ alignItems: "center", justifyContent: "center" }}>

        {/* 外層光暈：移除 elevation（position:absolute + elevation 在 Android 層疊不穩定），靠 JSX 渲染順序自然置底 */}
        <Animated.View style={[glowStyle, {
          position: "absolute",
          width: 68, height: 68, borderRadius: 34,
          backgroundColor: "#7C3AED",
        }]} />

        {/* 主圓圈：拆為兩層解決 Android overflow+elevation 互斥
            外層：只負責 elevation 陰影（不設 overflow，陰影可正常向外擴散）
            內層：只負責 overflow:hidden 裁剪 LinearGradient 圓角              */}
        <Animated.View style={[animStyle, {
          width: 56, height: 56, borderRadius: 28,
          elevation: focused ? 12 : 4,
          shadowColor: "#E8520A",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: focused ? 0.5 : 0.15,
          shadowRadius: 8,
        }]}>
          <View style={{
            width: 56, height: 56, borderRadius: 28,
            overflow: "hidden",
            borderWidth: focused ? 0 : 1.5,
            borderColor: "#2D1B69",
          }}>
            <LinearGradient
              colors={focused
                ? ["#7C3AED", "#E8520A", "#06B6D4"]
                : ["#1A1040", "#0D1130"]}
              start={{ x: 0.2, y: 0 }}
              end={{ x: 0.8, y: 1 }}
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text allowFontScaling={false} style={{ fontSize: focused ? 26 : 22, lineHeight: 30 }}>🐋</Text>
            </LinearGradient>
          </View>
        </Animated.View>

        {/* 標籤文字 */}
        <Text allowFontScaling={false} style={{
          fontSize: 10,
          marginTop: 4,
          color: focused ? "#A78BFA" : "#475569",
          fontWeight: focused ? "700" : "400",
        }}>
          算力池
        </Text>
      </View>
    </Pressable>
  );
}

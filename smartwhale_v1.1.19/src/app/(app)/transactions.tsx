/* eslint-disable no-undef */
import { useState, useCallback } from "react";
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import { useFocusEffect, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Image as ExpoImage } from "expo-image";
import { TrendingUp, TrendingDown } from "lucide-react-native";
import { useSession } from "@/ctx";
import { getTransactions } from "@/db/api";
import { sharedGet } from "@/lib/requestDedup";
import type { Transaction } from "@/types/types";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FlatList } from "react-native";

// ── 本地圖片資源（對齊提現記錄頁面）
const BODY_BG = require("../../../assets/page-img/page_bg.webp");
const IMG_ICON9 = require("../../../assets/page-img/icon9.png");
const IMG_LIST_TOP = require("../../../assets/page-img/wallet_list_top.png");
const IMG_LIST_MID = require("../../../assets/page-img/wallet_list_mid.png");
const IMG_LIST_BOT = require("../../../assets/page-img/wallet_list_bot.png");

type Tab = "ALL" | "SMT" | "USDT" | "POINTS";

const TABS: { key: Tab; label: string }[] = [
  { key: "ALL",    label: "全部" },
  { key: "SMT",     label: "SMT"   },
  { key: "USDT",   label: "USDT" },
  { key: "POINTS", label: "能量" },
];

const TYPE_LABELS: Record<string, string> = {
  harvest:         "日產領取",
  upgrade:         "鯨魚升級",
  exchange:        "兌換",
  referral_reward: "推廣獎勵",
  promo_reward:    "團隊獎勵",
  p2p_buy:         "P2P購買",
  p2p_sell:        "P2P出售",
  deposit:         "充值",
  withdraw:        "提現",
  transfer:        "轉賬",
};

function normalizeCurrency(currency: string) {
  if (currency === "POINTS") return "能量";
  return currency;
}

function currencyColor(currency: string) {
  const c = normalizeCurrency(currency);
  if (c === "SMT")    return "#E8520A";
  if (c === "USDT")   return "#22C55E";
  if (c === "POINTS") return "#EAB308";
  return "#94A3B8";
}


function TxRow({ item }: { item: Transaction }) {
  const displayCurrency = normalizeCurrency(item.currency);
  const color = currencyColor(item.currency);
  const isPositive = item.amount >= 0;
  return (
    <View className="flex-row items-center px-4 py-3.5 gap-3"
      style={{ borderBottomWidth: 1, borderBottomColor: "#FFFFFF10" }}>
      <View className="w-9 h-9 rounded-xl items-center justify-center"
        style={{ backgroundColor: (isPositive ? "#22C55E" : "#F43F5E") + "15" }}>
        {isPositive
          ? <TrendingUp size={16} color="#22C55E" />
          : <TrendingDown size={16} color="#F43F5E" />}
      </View>
      <View className="flex-1">
        <Text allowFontScaling={false} style={{ color: "#FFFFFF", fontSize: 14, fontWeight: "500" }} numberOfLines={1}>
          {item.description || TYPE_LABELS[item.type] || item.type}
        </Text>
        <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 12, marginTop: 2 }}>
          {new Date(item.created_at).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
        </Text>
      </View>
      <View className="items-end">
        <Text allowFontScaling={false} style={{ color: isPositive ? "#22C55E" : "#F43F5E", fontWeight: "700", fontFamily: "monospace", fontSize: 14 }}>
          {isPositive ? "+" : ""}{item.amount.toFixed(displayCurrency === "USDT" ? 2 : 4)}
        </Text>
        <Text allowFontScaling={false} style={{ color, fontSize: 11, fontWeight: "600" }}>{displayCurrency}</Text>
      </View>
    </View>
  );
}

export default function TransactionsScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const userId = session?.user.id ?? "";
  const [tab, setTab] = useState<Tab>("ALL");
  const [items, setItems] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    (async () => {
      setLoading(true);
      const currency = tab === "ALL" ? undefined : tab;
      // 走共用去重層（unique，3 分鐘 TTL），避免每次進頁狂打 WAF；失敗容錯返回空列表
      const { data } = await sharedGet("txs:" + (currency ?? "ALL"), () => getTransactions(userId, currency, 100), { isEmpty: (r: any) => !r || !Array.isArray(r.data) || r.data.length === 0 }).catch(() => ({ data: [] as Transaction[] }));
      setItems(data ?? []);
      setLoading(false);
    })();
  }, [userId, tab]));

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <StatusBar style="light" />
      <ExpoImage source={BODY_BG} style={StyleSheet.absoluteFillObject} contentFit="cover" priority="high" cachePolicy="memory-disk" />

      {/* 頂部導航（對齊提現記錄頁面） */}
      <View style={{ paddingTop: insets.top + 16, paddingBottom: 16, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Pressable onPress={() => router.back()} className="active:opacity-70">
          <ExpoImage source={IMG_ICON9} style={{ width: 24, height: 24 }} contentFit="contain" />
        </Pressable>
        <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 20, fontWeight: "800" }}>變化記錄</Text>
      </View>

      {/* 標籤篩選 */}
      <View className="flex-row px-4 mb-3 gap-2">
        {TABS.map((t) => (
          <Pressable
            key={t.key}
            className="flex-1 py-2 rounded-xl items-center active:opacity-70"
            style={{
              backgroundColor: tab === t.key ? "#E8520A" : "#0A0A0A",
              borderWidth: 1,
              borderColor: tab === t.key ? "#E8520A" : "#FFFFFF15",
            }}
            onPress={() => setTab(t.key)}
          >
            <Text allowFontScaling={false} style={{ color: tab === t.key ? "#000000" : "#FFFFFF40", fontWeight: "700", fontSize: 12 }}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* 列表（三圖拼接背景） */}
      <View style={{ flex: 1, marginHorizontal: 16, marginBottom: insets.bottom + 16 }}>
        {loading ? (
          <View style={{ position: "relative" }}>
            <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 16, overflow: "hidden" }}>
              <ExpoImage source={IMG_LIST_TOP} style={{ width: "100%", aspectRatio: 987 / 80 }} contentFit="cover" />
              <ExpoImage source={IMG_LIST_MID} style={{ flex: 1, width: "100%" }} contentFit="fill" />
              <ExpoImage source={IMG_LIST_BOT} style={{ width: "100%", aspectRatio: 987 / 80 }} contentFit="cover" />
            </View>
            <View style={{ paddingVertical: 48, alignItems: "center" }}>
              <ActivityIndicator size="large" color="#E8520A" />
            </View>
          </View>
        ) : (
          <View style={{ flex: 1, position: "relative" }}>
            <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 16, overflow: "hidden" }}>
              <ExpoImage source={IMG_LIST_TOP} style={{ width: "100%", aspectRatio: 987 / 80 }} contentFit="cover" />
              <ExpoImage source={IMG_LIST_MID} style={{ flex: 1, width: "100%" }} contentFit="fill" />
              <ExpoImage source={IMG_LIST_BOT} style={{ width: "100%", aspectRatio: 987 / 80 }} contentFit="cover" />
            </View>
            <FlatList
              data={items}
              keyExtractor={(i) => i.id}
              contentInsetAdjustmentBehavior="automatic"
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingBottom: 16 }}
              ListEmptyComponent={
                <View className="items-center py-16 gap-3">
                  <Text allowFontScaling={false} style={{ fontSize: 40 }}>📭</Text>
                  <Text allowFontScaling={false} style={{ color: "#FFFFFF60", fontSize: 14 }}>暫無記錄</Text>
                </View>
              }
              renderItem={({ item }) => <TxRow item={item} />}
            />
          </View>
        )}
      </View>
    </View>
  );
}

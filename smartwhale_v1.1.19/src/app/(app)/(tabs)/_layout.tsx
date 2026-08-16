/* eslint-disable no-undef */
import { useEffect, useState } from "react";
import { View, Pressable } from "react-native";
import { Image } from "expo-image";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSession } from "@/ctx";
import { usePendingTransfers } from "@/hooks/usePendingTransfers";
import { getProfile } from "@/db/api";
import tabbarBgImg from "../../../../assets/page-img/tabbar-bg.png";

const NORMAL_TAB_LIST = [
  { name: "home",     icon: require("../../../../assets/page-img/tab_home.png"),     iconA: require("../../../../assets/page-img/tab_home_a.png")     },
  { name: "shop",     icon: require("../../../../assets/page-img/tab_shop.png"),     iconA: require("../../../../assets/page-img/tab_shop_a.png")     },
  { name: "pool",     icon: require("../../../../assets/page-img/tab_pool.png"),     iconA: require("../../../../assets/page-img/tab_pool_a.png")     },
  { name: "referral", icon: require("../../../../assets/page-img/tab_referral.png"), iconA: require("../../../../assets/page-img/tab_referral_a.png") },
  { name: "profile",  icon: require("../../../../assets/page-img/tab_profile.png"),  iconA: require("../../../../assets/page-img/tab_profile_a.png")  },
];

type TabBarRoute = { key: string; name: string };
type TabBarState = { index: number; routes: TabBarRoute[] };
type TabBarNavigation = { navigate: (name: string) => void };
type CustomTabBarProps = { state: TabBarState; navigation: TabBarNavigation; badgeRoutes?: string[] };

function CustomTabBar({ state, navigation, badgeRoutes }: CustomTabBarProps) {
  const insets = useSafeAreaInsets();
  const activeName = state.routes[state.index]?.name ?? "";

  return (
    <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 91 + insets.bottom, backgroundColor: "transparent" }}>
      <Image source={tabbarBgImg} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="cover" priority="high" cachePolicy="memory-disk" />
      <View style={{ height: 91, flexDirection: "row" }}>
        {NORMAL_TAB_LIST.map((tab, idx) => {
          const isActive = activeName === tab.name;
          const isCenter = idx === 2;
          const route = state.routes.find((r: TabBarRoute) => r.name === tab.name);
          const hasBadge = badgeRoutes?.includes(tab.name);
          return (
            <Pressable key={tab.name} onPress={() => route && navigation.navigate(tab.name)}
              style={{ flex: 1, height: 91, alignItems: "center", justifyContent: "center" }}>
              {isCenter ? (
                <Image source={isActive ? tab.iconA : tab.icon} style={{ width: 64, height: 80 }} contentFit="contain" />
              ) : (
                <View style={{ position: "absolute", top: 41, alignItems: "center" }}>
                  <Image source={isActive ? tab.iconA : tab.icon} style={{ width: 36, height: 36 }} contentFit="contain" />
                  {hasBadge && (
                    <View style={{ position: "absolute", top: 0, right: -4, width: 8, height: 8, borderRadius: 4, backgroundColor: "#F43F5E", borderWidth: 1.5, borderColor: "#000" }} />
                  )}
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
      <View style={{ height: insets.bottom, backgroundColor: "transparent" }} />
    </View>
  );
}

export default function TabsLayout() {
  const { session } = useSession();
  const userId = session?.user.id ?? "";
  const { pendingCount } = usePendingTransfers(userId);
  // 若為商戶，隱藏普通 TabBar（商戶 TabBar 已在上層 (app)/_layout.tsx 渲染）
  const [isMerchant, setIsMerchant] = useState(false);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const profile = await getProfile(userId);
      setIsMerchant(profile?.is_merchant === true && profile?.merchant_status === "active");
      // ⚠️ 不在此處做任何 router.replace，商戶跳轉由 (app)/_layout.tsx 統一負責
    })();
  }, [userId]);

  const badgeRoutes = pendingCount > 0 ? ["profile"] : [];

  return (
    <Tabs
      initialRouteName="home"
      screenOptions={{ headerShown: false, tabBarStyle: { position: "absolute", backgroundColor: "transparent", borderTopWidth: 0, elevation: 0 } }}
      tabBar={isMerchant ? () => null : (props) => <CustomTabBar {...props} badgeRoutes={badgeRoutes} />}
    >
      <Tabs.Screen name="home"     options={{ title: "首頁" }} />
      <Tabs.Screen name="shop"     options={{ title: "商城" }} />
      <Tabs.Screen name="pool"     options={{ title: "算力池" }} />
      <Tabs.Screen name="referral" options={{ title: "推廣" }} />
      <Tabs.Screen name="profile"  options={{ title: "我的" }} />
      <Tabs.Screen name="wallet"   options={{ href: null, title: "錢包" }} />
    </Tabs>
  );
}


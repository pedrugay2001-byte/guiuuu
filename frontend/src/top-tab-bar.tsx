import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";

const GOLD = "#F5C150";
const INACTIVE = "#6E6E6E";
const BG = "#050505";

type IconCfg = { ion?: string; mat?: string };
const ICONS: Record<string, { label: string; active: IconCfg; inactive: IconCfg }> = {
  home:        { label: "Home",   active: { ion: "home" },                 inactive: { ion: "home-outline" } },
  catalog:     { label: "Loja",   active: { ion: "storefront" },           inactive: { ion: "storefront-outline" } },
  community:   { label: "Social", active: { ion: "people" },               inactive: { ion: "people-outline" } },
  performance: { label: "Metas",  active: { mat: "chart-line-variant" },   inactive: { mat: "chart-line" } },
  wallet:      { label: "Banco",  active: { ion: "wallet" },               inactive: { ion: "wallet-outline" } },
};

/**
 * Barra de navegação superior premium.
 * NÃO aplica SafeAreaView próprio — isso é responsabilidade do (tabs)/_layout.tsx,
 * que envolve toda a hierarquia num único SafeAreaView. Evita duplicação no iPhone.
 */
export default function TopTabBar({ state, navigation }: BottomTabBarProps) {
  const visibleRoutes = state.routes.filter((r) => ICONS[r.name]);

  return (
    <View style={st.bar}>
      {visibleRoutes.map((route) => {
        const idx = state.routes.findIndex((r) => r.key === route.key);
        const focused = state.index === idx;
        const cfg = ICONS[route.name];
        const col = focused ? GOLD : INACTIVE;
        const onPress = () => {
          const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name as never);
        };

        return (
          <TouchableOpacity
            key={route.key}
            style={st.item}
            onPress={onPress}
            activeOpacity={0.75}
            testID={`top-tab-${route.name}`}
            accessibilityRole="button"
            accessibilityState={focused ? { selected: true } : {}}
          >
            {focused && <View style={st.activeBar} />}
            {cfg.active.ion ? (
              <Ionicons
                name={(focused ? cfg.active.ion : cfg.inactive.ion) as any}
                size={22}
                color={col}
              />
            ) : (
              <MaterialCommunityIcons
                name={(focused ? cfg.active.mat : cfg.inactive.mat) as any}
                size={22}
                color={col}
              />
            )}
            <Text
              numberOfLines={1}
              allowFontScaling={false}
              style={[st.lbl, { color: col, fontWeight: focused ? "800" : "600" }]}
            >
              {cfg.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const st = StyleSheet.create({
  safe: { backgroundColor: BG },
  bar: {
    flexDirection: "row",
    backgroundColor: BG,
    paddingTop: 4,
    paddingBottom: 4,
    paddingHorizontal: 4,
  },
  item: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingVertical: 2,
  },
  activeBar: {
    position: "absolute",
    top: 0,
    width: 30,
    height: 2,
    borderRadius: 1,
    backgroundColor: GOLD,
  },
  lbl: {
    fontSize: 10,
    letterSpacing: 0,
    marginTop: 1,
    includeFontPadding: false as any,
  },
});

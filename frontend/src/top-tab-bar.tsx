import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "./icons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useGate } from "./gate";
import { useMessageInbox } from "./message-inbox";

// Paleta ativa por tier:
// - diamond → azul-prateado (platinum) #C5D1DA / highlight #EAF1F6
// - demais → dourado luxo #F5C150
const ACCENT_GOLD = "#F5C150";
const ACCENT_PLATINUM = "#C5D1DA";
const ACCENT_PLATINUM_LIGHT = "#EAF1F6";
const INACTIVE = "#6E6E6E";
const BG = "#050505";

type IconCfg = { ion?: string; mat?: string };
const ICONS: Record<string, { label: string; active: IconCfg; inactive: IconCfg; isAvatar?: boolean }> = {
  // "member" ficou no lugar onde antes era "home" (primeira posição).
  member:      { label: "Perfil", active: { ion: "person-circle" },        inactive: { ion: "person-circle-outline" }, isAvatar: true },
  catalog:     { label: "Loja",   active: { ion: "storefront" },           inactive: { ion: "storefront-outline" } },
  community:   { label: "Social", active: { ion: "people" },               inactive: { ion: "people-outline" } },
  performance: { label: "Metas",  active: { mat: "chart-line-variant" },   inactive: { mat: "chart-line" } },
  wallet:      { label: "Banco",  active: { ion: "wallet" },               inactive: { ion: "wallet-outline" } },
};

/**
 * Barra de navegação superior premium.
 * NÃO aplica SafeAreaView próprio — isso é responsabilidade do (tabs)/_layout.tsx,
 * que envolve toda a hierarquia num único SafeAreaView. Evita duplicação no iPhone.
 *
 * Layout: [Perfil] [Loja] [Social] [Metas] [Banco]
 * O botão "Perfil" exibe o avatar real do usuário (foto) quando disponível.
 * Cor de destaque muda para azul-prateado (platinum) para membros DIAMOND.
 */
export default function TopTabBar({ state, navigation }: BottomTabBarProps) {
  const { member } = useGate();
  const inbox = useMessageInbox();
  const avatar = member?.avatar_base64;
  const isDiamond = member?.tier === "diamond";
  const GOLD = isDiamond ? ACCENT_PLATINUM : ACCENT_GOLD;

  // Ordena: sempre member na primeira posição, depois o restante na ordem dada em ICONS
  const ORDER = ["member", "catalog", "community", "performance", "wallet"];
  const visibleRoutes = ORDER
    .map((name) => state.routes.find((r) => r.name === name))
    .filter(Boolean) as typeof state.routes;

  return (
    <View style={st.bar}>
      {visibleRoutes.map((route) => {
        const idx = state.routes.findIndex((r) => r.key === route.key);
        const focused = state.index === idx;
        const cfg = ICONS[route.name];
        const col = focused ? GOLD : INACTIVE;
        const onPress = () => {
          // Ao tocar em PERFIL, limpa todas as notificações (DMs + sino + chat heads).
          if (route.name === "member") {
            inbox.markEverythingRead?.().catch(() => {});
          }
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
            {focused && <View style={[st.activeBar, { backgroundColor: GOLD }]} />}
            {/* Se é "member" e temos avatar → mostra foto do usuário com anel colorido se focused */}
            {cfg.isAvatar && avatar ? (
              <View style={[st.avatarRing, focused && { borderColor: GOLD, borderWidth: 2 }]}>
                <Image source={{ uri: avatar }} style={st.avatarImg} />
              </View>
            ) : cfg.active.ion ? (
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
  },
  lbl: {
    fontSize: 10,
    letterSpacing: 0,
    marginTop: 1,
    includeFontPadding: false as any,
  },
  // Avatar do perfil na tab bar — anel dourado/platinum quando selecionado.
  avatarRing: {
    width: 24, height: 24, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
  },
  avatarImg: { width: 22, height: 22, borderRadius: 11 },
});

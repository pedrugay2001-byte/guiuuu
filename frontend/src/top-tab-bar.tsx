import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image } from "react-native";
import { Ionicons } from "./icons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useGate } from "./gate";
import { useMessageInbox } from "./message-inbox";
import { useFocusEffect } from "expo-router";
import { api } from "./api";
import { BrandLogo } from "./brand";
import { formatBLXShort } from "./blx";

// Paleta por tier:
// - diamond → azul-prateado (platinum) #C5D1DA / highlight #EAF1F6
// - demais → dourado luxo #F5C150
const ACCENT_GOLD = "#F5C150";
const ACCENT_PLATINUM = "#C5D1DA";
const INACTIVE = "#6E6E6E";
const BG = "#050505";

/**
 * Barra superior premium — 3 elementos:
 *   [Perfil (avatar)] ........... [BLACKSCLUB logo centralizado] ........... [Banco (wallet) + saldo BLX]
 *
 * - Esquerda: avatar do membro (ou ícone person-circle como fallback). Toca → /member.
 * - Centro: logo BLACKSCLUB (mesma família/estilo do rodapé antigo).
 *           Toca → /home.
 * - Direita: ícone de carteira + saldo BLX abreviado (ex: "1.5K BLX") logo abaixo.
 *           Toca → /wallet.
 *
 * O componente recebe BottomTabBarProps porque o expo-router usa este tabBar
 * como render slot — mas usamos navigation.navigate(routeName) diretamente.
 */
export default function TopTabBar({ state, navigation }: BottomTabBarProps) {
  const { member } = useGate();
  const inbox = useMessageInbox();
  const avatar = member?.avatar_base64;
  const isDiamond = member?.tier === "diamond";
  const ACCENT = isDiamond ? ACCENT_PLATINUM : ACCENT_GOLD;

  const [balanceCentavos, setBalanceCentavos] = useState<number | null>(null);

  // Atualiza saldo BLX a cada foco da tela e a cada 60s.
  const refreshBalance = useCallback(async () => {
    if (!member?.member_id) return;
    try {
      const w = await api.blxWallet(member.member_id);
      setBalanceCentavos(w.balance_centavos ?? 0);
    } catch { /* silent — não bloqueia render */ }
  }, [member?.member_id]);
  useFocusEffect(useCallback(() => { refreshBalance(); }, [refreshBalance]));
  useEffect(() => {
    if (!member?.member_id) return;
    const t = setInterval(refreshBalance, 60_000);
    return () => clearInterval(t);
  }, [member?.member_id, refreshBalance]);

  // Detecta se estamos nas rotas de "member" ou "wallet" para destacar
  const currentRouteName = state.routes[state.index]?.name;
  const isOnMember = currentRouteName === "member";
  const isOnWallet = currentRouteName === "wallet";

  // Helper para navegar até uma tab (usa o navigation do tabBar)
  const goto = (routeName: string) => {
    // Limpa notificações ao clicar em Perfil (igual versão antiga)
    if (routeName === "member") {
      inbox.markEverythingRead?.().catch(() => {});
    }
    const target = state.routes.find((r) => r.name === routeName);
    if (target) {
      const event = navigation.emit({
        type: "tabPress",
        target: target.key,
        canPreventDefault: true,
      });
      if (!event.defaultPrevented) navigation.navigate(routeName as never);
    }
  };

  return (
    <View style={st.bar}>
      {/* ESQUERDA — Perfil (avatar do usuário) */}
      <TouchableOpacity
        style={st.side}
        onPress={() => goto("member")}
        activeOpacity={0.78}
        testID="top-bar-profile"
      >
        <View style={[st.avatarRing, isOnMember && { borderColor: ACCENT, borderWidth: 2 }]}>
          {avatar ? (
            <Image source={{ uri: avatar }} style={st.avatarImg} />
          ) : (
            <Ionicons name="person-circle" size={34} color={isOnMember ? ACCENT : INACTIVE} />
          )}
        </View>
      </TouchableOpacity>

      {/* CENTRO — Logo BLACKSCLUB */}
      <TouchableOpacity
        style={st.center}
        onPress={() => {
          const home = state.routes.find((r) => r.name === "home");
          if (home) navigation.navigate("home" as never);
        }}
        activeOpacity={0.85}
        testID="top-bar-brand"
        hitSlop={{ top: 6, bottom: 6, left: 8, right: 8 }}
      >
        <BrandLogo size="sm" />
      </TouchableOpacity>

      {/* DIREITA — Banco (wallet) + saldo BLX abaixo */}
      <TouchableOpacity
        style={st.side}
        onPress={() => goto("wallet")}
        activeOpacity={0.78}
        testID="top-bar-wallet"
      >
        <View style={st.walletWrap}>
          <Ionicons name="wallet" size={22} color={isOnWallet ? ACCENT : "#E8E8E8"} />
          <Text
            numberOfLines={1}
            allowFontScaling={false}
            style={[st.balanceTxt, { color: isOnWallet ? ACCENT : "#C5C5C5" }]}
          >
            {balanceCentavos === null ? "..." : formatBLXShort(balanceCentavos) + " BLX"}
          </Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}

const st = StyleSheet.create({
  bar: {
    flexDirection: "row",
    backgroundColor: BG,
    paddingTop: 6,
    paddingBottom: 6,
    paddingHorizontal: 10,
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#0E0E0E",
  },
  // Esquerda e direita ocupam o mesmo espaço; centro fica no meio absoluto.
  side: {
    flex: 1,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  center: {
    flex: 1.2,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarRing: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: "center", justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "#101010",
  },
  avatarImg: { width: 34, height: 34, borderRadius: 17 },
  // Wallet à direita — ícone em cima, saldo logo abaixo (formato compacto)
  walletWrap: {
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 2,
    paddingRight: 4,
    minWidth: 0,
    flexShrink: 1,
    width: "100%",
  },
  balanceTxt: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.3,
    includeFontPadding: false as any,
    marginTop: 1,
  },
});

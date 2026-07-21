/**
 * BalanceWidget — canto superior esquerdo da Home.
 *
 * Card premium com efeito 3D discreto (bordas arredondadas, sombra suave,
 * borda dourada sutil). Layout:
 *
 *   ┌─────────────────────────────┐
 *   │  60.917 pyx        👁      │  ← número grande, sigla pequena
 *   │  USx 12.183,44             │  ← USD em dourado, fonte um pouco menor
 *   └─────────────────────────────┘
 *
 * Toque no card leva para /wallet. Botão do olho mostra/oculta ambos.
 */

import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "./icons";
import { formatPYX, formatUSD } from "./pyx";
import { useBalanceVisibility, maskAmount } from "./use-balance-visibility";
import { usePYXRate } from "./pyx-rate";

const GOLD = "#F5C150";
const GOLD_DEEP = "#D4AF37";

export function BalanceWidget({
  memberId,
  balanceCentavos,
}: {
  memberId?: string;
  balanceCentavos: number | null | undefined;
}) {
  const router = useRouter();
  const { rateCentavos } = usePYXRate();
  const { hidden, toggle } = useBalanceVisibility(memberId);

  const pyxNum = formatPYX(balanceCentavos || 0);
  const usdStr = formatUSD(balanceCentavos || 0, rateCentavos);
  const shownPyxNum = maskAmount(pyxNum, hidden);
  const shownUsdStr = maskAmount(usdStr, hidden);

  return (
    <View style={st.card} testID="home-balance-widget">
      <TouchableOpacity
        style={st.tapArea}
        activeOpacity={0.75}
        onPress={() => router.push("/(tabs)/wallet" as any)}
        testID="home-balance-open-wallet"
      >
        {/* Linha PYX — número em destaque, sigla pequena */}
        <View style={st.pyxRow}>
          <Text style={st.pyxValue} numberOfLines={1} allowFontScaling={false}>
            {shownPyxNum}
          </Text>
          <Text style={st.pyxUnit} allowFontScaling={false}>pyx</Text>
        </View>
        {/* Linha USD — dourado, fonte um pouco menor */}
        <Text style={st.usd} numberOfLines={1} allowFontScaling={false}>
          {shownUsdStr}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={toggle}
        style={st.eyeBtn}
        activeOpacity={0.7}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        testID="home-balance-eye-toggle"
      >
        <Ionicons
          name={hidden ? "eye-off" : "eye"}
          size={14}
          color={hidden ? "#7A7A7A" : GOLD_DEEP}
        />
      </TouchableOpacity>
    </View>
  );
}

const st = StyleSheet.create({
  // Card premium: bordas arredondadas, sombra dourada suave, gradiente sutil (border top)
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingLeft: 12,
    paddingRight: 8,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "#0B0B0B",
    borderWidth: 1,
    borderColor: "rgba(212,175,55,0.28)",
    // Sombra sutil (efeito 3D discreto)
    ...Platform.select({
      web: {
        // @ts-ignore — RN Web aceita boxShadow via style
        boxShadow: "0 4px 12px rgba(0,0,0,0.35), 0 0 0 1px rgba(212,175,55,0.05) inset",
      } as any,
      default: {
        shadowColor: "#000",
        shadowOpacity: 0.35,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
        elevation: 3,
      },
    }),
  },
  tapArea: {
    flexDirection: "column",
    justifyContent: "center",
    minWidth: 0,
    flexShrink: 1,
  },
  pyxRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 3,
  },
  pyxValue: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: -0.2,
    fontVariant: ["tabular-nums"] as any,
  },
  pyxUnit: {
    color: "#8A8A8A",
    fontSize: 9.5,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginLeft: 2,
    textTransform: "uppercase",
  },
  usd: {
    color: GOLD,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.2,
    fontVariant: ["tabular-nums"] as any,
    marginTop: 1,
  },
  eyeBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(212,175,55,0.10)",
    borderWidth: 1,
    borderColor: "rgba(212,175,55,0.25)",
  },
});

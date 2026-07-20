/**
 * BalanceWidget — usado no canto superior esquerdo da Home.
 *
 * Layout:
 *   ┌──────────────────────────────┐
 *   │  1.500 PYX          👁      │  ← linha 1: saldo PYX + toggle
 *   │  $300.00             tap   │  ← linha 2: equivalente em USD (verde)
 *   └──────────────────────────────┘
 *
 * O ícone de olho (mostrar/ocultar) fica junto ao PYX para reduzir área.
 * Toque na área toda leva para /wallet.
 */

import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "./icons";
import { formatPYX, formatUSD } from "./pyx";
import { useBalanceVisibility, maskAmount } from "./use-balance-visibility";
import { usePYXRate } from "./pyx-rate";

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

  const pyxStr = maskAmount(`${formatPYX(balanceCentavos || 0)} PYX`, hidden);
  const usdStr = maskAmount(formatUSD(balanceCentavos || 0, rateCentavos), hidden);

  return (
    <View style={st.wrap} testID="home-balance-widget">
      <TouchableOpacity
        style={st.mainRow}
        activeOpacity={0.75}
        onPress={() => router.push("/(tabs)/wallet" as any)}
        testID="home-balance-open-wallet"
      >
        <View style={{ minWidth: 0, flexShrink: 1 }}>
          <Text style={st.pyx} numberOfLines={1} allowFontScaling={false}>
            {pyxStr}
          </Text>
          <Text style={st.usd} numberOfLines={1} allowFontScaling={false}>
            {usdStr}
          </Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={toggle}
        style={st.eyeBtn}
        activeOpacity={0.7}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        testID="home-balance-eye-toggle"
      >
        <Ionicons
          name={hidden ? "eye-off" : "eye"}
          size={16}
          color={hidden ? "#7A7A7A" : "#C5D1DA"}
        />
      </TouchableOpacity>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  mainRow: {
    flexDirection: "column",
    justifyContent: "center",
    minWidth: 0,
    flexShrink: 1,
  },
  pyx: {
    color: "#EEE",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.4,
    fontVariant: ["tabular-nums"] as any,
  },
  usd: {
    color: "#4EE07F",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.3,
    fontVariant: ["tabular-nums"] as any,
    marginTop: 1,
  },
  eyeBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(197,209,218,0.08)",
    borderWidth: 1,
    borderColor: "rgba(197,209,218,0.20)",
    marginLeft: 2,
  },
});

import { View, Text, StyleSheet, ScrollView } from "react-native";
import { Stack } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useGate } from "../src/gate";
import { theme, TIERS } from "../src/theme";

export default function Wallet() {
  const { member } = useGate();
  const tier = member ? TIERS[member.tier] || TIERS.black : TIERS.black;
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <Stack.Screen options={{ title: "BLACK COINS" }} />
      <SafeAreaView style={{ flex: 1 }} edges={["bottom"]}>
        <ScrollView contentContainerStyle={styles.c}>
          <View style={[styles.balanceCard, { borderColor: tier.color }]}>
            <View style={styles.balanceTop}>
              <Ionicons name="wallet" size={18} color={tier.color} />
              <Text style={[styles.kicker, { color: tier.color }]}>SEU SALDO</Text>
            </View>
            <View style={styles.balanceRow}>
              <Text style={styles.balanceValue}>0</Text>
              <Text style={styles.balanceUnit}>BC</Text>
            </View>
            <Text style={styles.balanceSub}>Black Coins • Moeda interna do clube</Text>
          </View>

          <Text style={[styles.kicker, { marginTop: 24 }]}>EM BREVE</Text>
          <Text style={styles.title}>SUA MOEDA DO CLUBE.</Text>
          <Text style={styles.text}>
            Estamos preparando um sistema de moedas próprio do BLACKSCLUB:
          </Text>

          <View style={styles.list}>
            <Row icon="cart-outline" label="Use Black Coins em pedidos do clube" />
            <Row icon="gift-outline" label="Ganhe ao indicar novos membros aprovados" />
            <Row icon="star-outline" label="Recompensas por atividade e plano" />
            <Row icon="trending-up-outline" label="Promoções exclusivas para top holders" />
          </View>

          <Text style={styles.note}>
            Você será avisado pelo suporte assim que a carteira estiver ativa.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function Row({ icon, label }: any) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={18} color={theme.colors.silver} />
      <Text style={styles.rowText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  c: { padding: theme.spacing.lg, gap: 10 },
  balanceCard: {
    padding: 20, borderRadius: 12, borderWidth: 1,
    backgroundColor: theme.colors.surface,
  },
  balanceTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  kicker: { color: theme.colors.silver, fontSize: 11, fontWeight: "800", letterSpacing: 3 },
  balanceRow: { flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: 10 },
  balanceValue: { color: theme.colors.white, fontSize: 52, fontWeight: "900", letterSpacing: -2 },
  balanceUnit: { color: theme.colors.silver, fontSize: 16, fontWeight: "800", letterSpacing: 2 },
  balanceSub: { color: theme.colors.textMuted, fontSize: 12, marginTop: 4 },
  title: { color: theme.colors.white, fontSize: 32, fontWeight: "900", letterSpacing: -1.2, marginTop: 6, textTransform: "uppercase" },
  text: { color: theme.colors.textMuted, fontSize: 14, lineHeight: 22, marginTop: 8 },
  list: {
    marginTop: 14, gap: 2, borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: 10, backgroundColor: theme.colors.surface, overflow: "hidden",
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  rowText: { color: theme.colors.text, fontSize: 13, fontWeight: "600" },
  note: { color: theme.colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 18, fontStyle: "italic" },
});

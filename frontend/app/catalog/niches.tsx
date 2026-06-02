import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "../../src/icons";

// 6 nichos premium em grade 2x3 — exibidos antes dos produtos
const NICHES = [
  { id: "tech",        label: "Tecnologia & Eletrônicos",  icon: "laptop-outline" as const,    accent: "#7FB8E5" },
  { id: "performance", label: "Performance Humana",        icon: "fitness-outline" as const,    accent: "#FF8A4C" },
  { id: "beleza",      label: "Moda, Saúde & Beleza",      icon: "sparkles" as const,           accent: "#F58FC3" },
  { id: "casa",        label: "Casa & Lifestyle",          icon: "home-outline" as const,       accent: "#7FD7C5" },
  { id: "lazer",       label: "Lazer, Hobby & Camp",       icon: "bicycle-outline" as const,    accent: "#A8D070" },
  { id: "black",       label: "Exclusivos Black",          icon: "diamond" as const,            accent: "#C5D1DA" },
] as const;

export default function NichesScreen() {
  const router = useRouter();
  const { tier } = useLocalSearchParams<{ tier?: string }>();
  const safeTier = (tier || "diamond").toLowerCase();

  return (
    <SafeAreaView edges={["top"]} style={st.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()} style={st.backBtn} hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}>
          <Ionicons name="chevron-back" size={22} color="#EEE" />
        </TouchableOpacity>
        <Text style={st.title}>ESCOLHA SEU NICHO</Text>
        <View style={{ width: 30 }} />
      </View>
      <Text style={st.sub}>Marketplace {safeTier.toUpperCase()} · selecione uma categoria premium</Text>

      <ScrollView contentContainerStyle={st.grid} showsVerticalScrollIndicator={false}>
        {NICHES.map((n) => (
          <TouchableOpacity
            key={n.id}
            style={[st.card, { borderColor: n.accent + "55" }]}
            activeOpacity={0.85}
            onPress={() => router.push({ pathname: "/catalog/[tier]", params: { tier: safeTier, niche: n.id } } as any)}
          >
            <View style={[st.iconWrap, { borderColor: n.accent + "66" }]}>
              <Ionicons name={n.icon} size={26} color={n.accent} />
            </View>
            <Text style={st.cardLabel}>{n.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#050505" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 14, paddingVertical: 10,
  },
  backBtn: { padding: 4 },
  title: { color: "#EEE", fontSize: 14, fontWeight: "900", letterSpacing: 2 },
  sub: { color: "#888", fontSize: 11, textAlign: "center", marginBottom: 18, paddingHorizontal: 20 },
  // Grade 2 colunas x 3 linhas
  grid: {
    flexDirection: "row", flexWrap: "wrap",
    justifyContent: "space-between",
    paddingHorizontal: 14, paddingBottom: 30, gap: 12,
  },
  card: {
    width: "48%",
    aspectRatio: 1.15,
    backgroundColor: "#0A0A0A",
    borderWidth: 1.2,
    borderRadius: 14,
    padding: 14,
    justifyContent: "space-between",
  },
  iconWrap: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1.2, backgroundColor: "#0E0E0E",
  },
  cardLabel: { color: "#EEE", fontSize: 13, fontWeight: "800", letterSpacing: 0.3, lineHeight: 17 },
});

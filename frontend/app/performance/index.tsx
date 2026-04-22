import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";

const GOLD = "#D4AF37";

export default function Performance() {
  const router = useRouter();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#050505" }} edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <View style={st.headerRow}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <Ionicons name="chevron-back" size={26} color="#FFF" />
          </TouchableOpacity>
          <Text style={st.headerTitle}>PERFORMANCE</Text>
          <View style={{ width: 26 }} />
        </View>

        <View style={st.hero}>
          <View style={st.heroGlow} />
          <View style={st.heroIconWrap}>
            <MaterialCommunityIcons name="chart-line" size={40} color={GOLD} />
          </View>
          <Text style={st.heroKicker}>EM CONSTRUÇÃO — FASE 3</Text>
          <Text style={st.heroTitle}>Central de Performance</Text>
          <Text style={st.heroSub}>
            Em breve você poderá criar metas (peso, financeiro, hábitos, produtividade),
            acompanhar seu ritmo em tempo real, receber previsões inteligentes e insights
            personalizados por IA.
          </Text>
        </View>

        <View style={st.featList}>
          <FeatRow icon="target" label="Metas inteligentes com prazo" />
          <FeatRow icon="trending-up" label="Análise de ritmo (adiantado / atrasado)" />
          <FeatRow icon="calendar" label="Calendário heatmap de consistência" />
          <FeatRow icon="chart-timeline-variant" label="Gráficos: linha ideal vs real" />
          <FeatRow icon="brain" label="Insights gerados pela BLACK AI" />
          <FeatRow icon="medal" label="Score geral de performance (0-100)" />
        </View>

        <TouchableOpacity style={st.cta} onPress={() => router.back()}>
          <Text style={st.ctaTxt}>VOLTAR</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function FeatRow({ icon, label }: { icon: string; label: string }) {
  return (
    <View style={st.featRow}>
      <View style={st.featIcon}>
        <MaterialCommunityIcons name={icon as any} size={18} color={GOLD} />
      </View>
      <Text style={st.featLabel}>{label}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
  headerTitle: { color: "#FFF", fontSize: 13, fontWeight: "900", letterSpacing: 3 },

  hero: {
    backgroundColor: "#0B0B0B",
    borderWidth: 1.5, borderColor: "rgba(212,175,55,0.35)",
    borderRadius: 16, padding: 24, alignItems: "center",
    position: "relative", overflow: "hidden",
  },
  heroGlow: { position: "absolute", top: -50, left: -50, width: 200, height: 200, borderRadius: 100, backgroundColor: "rgba(212,175,55,0.08)" },
  heroIconWrap: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: "rgba(212,175,55,0.1)",
    borderWidth: 1.5, borderColor: "rgba(212,175,55,0.35)",
    alignItems: "center", justifyContent: "center",
    marginBottom: 18,
  },
  heroKicker: { color: GOLD, fontSize: 9, fontWeight: "900", letterSpacing: 2.5 },
  heroTitle: { color: "#FFF", fontSize: 22, fontWeight: "900", marginTop: 6, letterSpacing: 1 },
  heroSub: { color: "#999", fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: 12, maxWidth: 320 },

  featList: { marginTop: 24, gap: 10 },
  featRow: {
    flexDirection: "row", alignItems: "center", gap: 14,
    backgroundColor: "#0B0B0B",
    borderWidth: 1, borderColor: "#1F1F1F", borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  featIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "rgba(212,175,55,0.08)",
    alignItems: "center", justifyContent: "center",
  },
  featLabel: { color: "#DDD", fontSize: 13, fontWeight: "600" },

  cta: {
    marginTop: 28, alignSelf: "center",
    paddingHorizontal: 32, paddingVertical: 14,
    borderRadius: 28,
    borderWidth: 1, borderColor: "#333",
  },
  ctaTxt: { color: "#DDD", fontSize: 11, fontWeight: "900", letterSpacing: 2 },
});

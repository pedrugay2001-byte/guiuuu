import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";

const { width } = Dimensions.get("window");
const GOLD = "#D4AF37";

/**
 * PERFORMANCE TAB — placeholder premium.
 * Fase 3 will replace this with the full dashboard (goals, charts, insights, calendar).
 */
export default function PerformanceTab() {
  const router = useRouter();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#050505" }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* Hero premium card */}
        <View style={st.hero}>
          <View style={st.heroGlow} />
          <View style={st.heroRow}>
            <View style={st.heroIconWrap}>
              <MaterialCommunityIcons name="chart-line-variant" size={30} color={GOLD} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={st.heroKicker}>CENTRAL DE PERFORMANCE</Text>
              <Text style={st.heroTitle}>Sua evolução, sob controle.</Text>
            </View>
          </View>

          <Text style={st.heroSub}>
            Defina metas, acompanhe seu ritmo em tempo real e receba previsões inteligentes
            baseadas no seu desempenho diário.
          </Text>

          <View style={st.statsRow}>
            <Stat label="METAS" value="0" />
            <View style={st.divider} />
            <Stat label="SCORE" value="—" />
            <View style={st.divider} />
            <Stat label="DIAS ATIVOS" value="0" />
          </View>
        </View>

        {/* Categories preview */}
        <Text style={st.sectionLabel}>O QUE VOCÊ VAI PODER RASTREAR</Text>

        <View style={st.catGrid}>
          <CatBlock icon="dumbbell" label="Fitness" sub="Peso, treino, medidas" color="#FF6B35" highlight />
          <CatBlock icon="cash-multiple" label="Financeiro" sub="Economia, meta, patrimônio" color="#2ECC71" />
          <CatBlock icon="brain" label="Hábitos" sub="Disciplina, rotina, foco" color="#B794F4" />
          <CatBlock icon="briefcase" label="Produtividade" sub="Projetos, prazos, entregas" color="#7FD7E5" />
        </View>

        {/* Feature preview list */}
        <Text style={st.sectionLabel}>FERRAMENTAS INCLUSAS</Text>

        <View style={st.featList}>
          <Feat icon="target" label="Metas inteligentes com prazo automático" />
          <Feat icon="speedometer" label="Análise de ritmo (adiantado / no ritmo / atrasado)" />
          <Feat icon="chart-timeline-variant" label="Gráficos: linha ideal vs progresso real" />
          <Feat icon="calendar-month" label="Calendário heatmap de consistência" />
          <Feat icon="crystal-ball" label="Previsões: “você atingirá em X dias”" />
          <Feat icon="lightbulb-on" label="Insights automáticos gerados pela BLACK AI" />
        </View>

        <TouchableOpacity style={st.cta} onPress={() => router.push("/performance")} activeOpacity={0.9} testID="performance-start">
          <Text style={st.ctaTxt}>CONHECER A CENTRAL</Text>
          <Ionicons name="arrow-forward" size={16} color="#000" />
        </TouchableOpacity>

        <Text style={st.disclaimer}>
          Nova funcionalidade em construção.{'\n'}
          Em breve você poderá criar sua primeira meta.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={st.stat}>
      <Text style={st.statValue}>{value}</Text>
      <Text style={st.statLabel}>{label}</Text>
    </View>
  );
}

function CatBlock({ icon, label, sub, color, highlight }: { icon: string; label: string; sub: string; color: string; highlight?: boolean }) {
  return (
    <View style={[st.catBlock, highlight && { borderColor: "rgba(212,175,55,0.4)" }]}>
      {highlight && <View style={st.catStar}><Text style={st.catStarTxt}>PRIORIDADE</Text></View>}
      <View style={[st.catIconRing, { borderColor: `${color}55` }]}>
        <MaterialCommunityIcons name={icon as any} size={22} color={color} />
      </View>
      <Text style={st.catLabel}>{label}</Text>
      <Text style={st.catSub}>{sub}</Text>
    </View>
  );
}

function Feat({ icon, label }: { icon: string; label: string }) {
  return (
    <View style={st.featRow}>
      <View style={st.featIcon}>
        <MaterialCommunityIcons name={icon as any} size={16} color={GOLD} />
      </View>
      <Text style={st.featLabel}>{label}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  hero: {
    backgroundColor: "#0B0B0B",
    borderWidth: 1.5, borderColor: "rgba(212,175,55,0.35)",
    borderRadius: 16, padding: 18,
    position: "relative", overflow: "hidden",
  },
  heroGlow: { position: "absolute", top: -60, right: -60, width: 220, height: 220, borderRadius: 110, backgroundColor: "rgba(212,175,55,0.07)" },
  heroRow: { flexDirection: "row", alignItems: "center" },
  heroIconWrap: {
    width: 54, height: 54, borderRadius: 27,
    backgroundColor: "rgba(212,175,55,0.1)",
    borderWidth: 1.2, borderColor: "rgba(212,175,55,0.4)",
    alignItems: "center", justifyContent: "center",
  },
  heroKicker: { color: GOLD, fontSize: 9, fontWeight: "900", letterSpacing: 2.5 },
  heroTitle: { color: "#FFF", fontSize: 17, fontWeight: "800", marginTop: 3 },
  heroSub: { color: "#9A9A9A", fontSize: 13, lineHeight: 19, marginTop: 14 },

  statsRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-around",
    marginTop: 18, paddingTop: 16,
    borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)",
  },
  stat: { alignItems: "center", flex: 1 },
  statValue: { color: "#FFF", fontSize: 20, fontWeight: "900" },
  statLabel: { color: "#666", fontSize: 9, fontWeight: "800", letterSpacing: 1.5, marginTop: 3 },
  divider: { width: 1, height: 28, backgroundColor: "rgba(255,255,255,0.08)" },

  sectionLabel: { color: "#A3A3A3", fontSize: 10, fontWeight: "900", letterSpacing: 2.5, marginTop: 22, marginBottom: 10 },

  catGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  catBlock: {
    width: (width - 50) / 2,
    backgroundColor: "#0B0B0B",
    borderWidth: 1, borderColor: "#1F1F1F",
    borderRadius: 12, padding: 14, position: "relative",
  },
  catStar: { position: "absolute", top: 10, right: 10, backgroundColor: GOLD, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  catStarTxt: { color: "#000", fontSize: 8, fontWeight: "900", letterSpacing: 0.5 },
  catIconRing: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1.2,
    alignItems: "center", justifyContent: "center",
  },
  catLabel: { color: "#FFF", fontSize: 14, fontWeight: "800", marginTop: 10 },
  catSub: { color: "#777", fontSize: 11, marginTop: 3, fontWeight: "600" },

  featList: { gap: 8 },
  featRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: "#0B0B0B",
    borderWidth: 1, borderColor: "#1F1F1F", borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 11,
  },
  featIcon: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: "rgba(212,175,55,0.08)",
    alignItems: "center", justifyContent: "center",
  },
  featLabel: { color: "#DDD", fontSize: 12.5, fontWeight: "600", flex: 1 },

  cta: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    marginTop: 24, backgroundColor: GOLD, paddingVertical: 15, borderRadius: 28,
  },
  ctaTxt: { color: "#000", fontSize: 12, fontWeight: "900", letterSpacing: 2 },

  disclaimer: { color: "#666", fontSize: 11, textAlign: "center", marginTop: 16, lineHeight: 16 },
});

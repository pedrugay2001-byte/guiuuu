import { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { api, Plan } from "../../src/api";
import { useGate } from "../../src/gate";
import ActionSheet from "../../src/action-sheet";

const GOLD = "#D4AF37";
const MUTED = "#8A8A8A";

const TIER_ICONS: Record<string, any> = {
  silver: "medal-outline",
  gold: "star-outline",
  diamond: "diamond-outline",
};

// Acento sóbrio por plano (muito sutil — só borda e ícone)
const TIER_ACCENT: Record<string, string> = {
  silver:  "#C0C0C0",
  gold:    "#D4AF37",
  diamond: "#E8E8E8",
};

export default function Negocios() {
  const router = useRouter();
  const { member } = useGate();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [upgradeSheet, setUpgradeSheet] = useState<Plan | null>(null);

  useEffect(() => {
    api.plans().then((p) => { setPlans(p); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const myPlan = member?.tier || "silver";

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: "#050505", justifyContent: "center" }}>
        <ActivityIndicator color={GOLD} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#050505" }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>

        {/* HERO minimalista */}
        <View style={styles.hero}>
          <Text style={styles.kicker}>PLANOS BLACKSCLUB</Text>
          <Text style={styles.heroTitle}>Escolha seu{"\n"}nível no clube.</Text>
          <Text style={styles.heroSub}>
            Acesso privado, descontos reais e curadoria sob demanda. Sem barulho visual.
          </Text>
        </View>

        {/* Marketplace shortcut — sóbrio */}
        <TouchableOpacity
          style={styles.marketBtn}
          onPress={() => router.push("/ads")}
          activeOpacity={0.85}
          testID="open-marketplace"
        >
          <Ionicons name="storefront-outline" size={18} color={GOLD} />
          <View style={{ flex: 1 }}>
            <Text style={styles.marketTitle}>Marketplace privado</Text>
            <Text style={styles.marketHint}>Entre membros BLACK DIAMOND</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={MUTED} />
        </TouchableOpacity>

        {/* Section label */}
        <Text style={styles.section}>PLANOS DE MEMBRO</Text>

        {plans.map((p) => {
          const accent = TIER_ACCENT[p.id] || GOLD;
          const isMine = myPlan === p.id;
          return (
            <View
              key={p.id}
              style={[styles.card, isMine && { borderColor: accent }]}
            >
              {/* Linha superior com ícone e nome */}
              <View style={styles.cardHead}>
                <View style={[styles.cardIcon, { borderColor: accent }]}>
                  <Ionicons name={TIER_ICONS[p.id] || "ellipse-outline"} size={15} color={accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardName}>{p.name}</Text>
                  <Text style={styles.cardTag}>
                    {p.id === "silver" ? "Essencial" : p.id === "gold" ? "Premium" : "Elite"}
                  </Text>
                </View>
                {isMine && (
                  <View style={styles.mineBadge}>
                    <Text style={styles.mineTxt}>ATUAL</Text>
                  </View>
                )}
              </View>

              {/* Preço destacado */}
              <View style={styles.priceBlock}>
                <Text style={styles.priceCurr}>R$</Text>
                <Text style={styles.priceVal}>{p.price_monthly}</Text>
                <Text style={styles.priceMo}>/mês</Text>
              </View>

              {/* Features sóbrias */}
              <View style={styles.feats}>
                {p.features.map((f, i) => (
                  <View key={i} style={styles.featRow}>
                    <View style={styles.featDot} />
                    <Text style={styles.featTxt}>{f}</Text>
                  </View>
                ))}
              </View>

              {/* KPI row minimalista */}
              <View style={styles.kpiRow}>
                <View style={styles.kpi}>
                  <Text style={styles.kpiVal}>{p.discount}%</Text>
                  <Text style={styles.kpiLbl}>DESCONTO</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.kpi}>
                  <Text style={styles.kpiVal}>{p.can_sell ? "•" : "—"}</Text>
                  <Text style={styles.kpiLbl}>VENDER</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.kpi}>
                  <Text style={styles.kpiVal}>•</Text>
                  <Text style={styles.kpiLbl}>COMPRAR</Text>
                </View>
              </View>

              {/* CTA — só outline, sóbrio */}
              {!isMine && (
                <TouchableOpacity
                  style={[styles.cta, { borderColor: accent }]}
                  onPress={() => setUpgradeSheet(p)}
                  testID={`upgrade-${p.id}`}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.ctaTxt, { color: accent }]}>QUERO ESSE PLANO</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}

        <View style={styles.disclaimer}>
          <MaterialCommunityIcons name="shield-lock-outline" size={14} color={MUTED} />
          <Text style={styles.disclaimerTxt}>
            Clube privado. Transações via BLACK Coins em escrow. Upgrade validado manualmente pela equipe.
          </Text>
        </View>
      </ScrollView>

      {/* ActionSheet de upgrade */}
      <ActionSheet
        visible={!!upgradeSheet}
        title={upgradeSheet ? `Upgrade para ${upgradeSheet.name}` : undefined}
        subtitle="O upgrade é validado manualmente pela equipe BLACKSCLUB."
        onClose={() => setUpgradeSheet(null)}
        actions={upgradeSheet ? [
          {
            label: "Falar com suporte",
            icon: "chatbubbles-outline",
            onPress: () => { setUpgradeSheet(null); setTimeout(() => router.push("/chat" as any), 150); },
          },
        ] : []}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { paddingHorizontal: 22, paddingTop: 24, paddingBottom: 14 },
  kicker: { color: GOLD, fontSize: 10, fontWeight: "900", letterSpacing: 3 },
  heroTitle: { color: "#FFF", fontSize: 26, fontWeight: "900", lineHeight: 32, marginTop: 10 },
  heroSub: { color: MUTED, fontSize: 12.5, marginTop: 10, lineHeight: 18 },

  marketBtn: {
    flexDirection: "row", alignItems: "center", gap: 12,
    marginHorizontal: 16, marginTop: 4, paddingHorizontal: 14, paddingVertical: 14,
    borderRadius: 12, backgroundColor: "#0B0B0B",
    borderWidth: 1, borderColor: "rgba(212,175,55,0.25)",
  },
  marketTitle: { color: "#FFF", fontSize: 13.5, fontWeight: "700" },
  marketHint: { color: MUTED, fontSize: 11, marginTop: 2 },

  section: {
    color: MUTED, fontSize: 10, fontWeight: "900", letterSpacing: 2.5,
    paddingHorizontal: 22, marginTop: 28, marginBottom: 12,
  },

  card: {
    marginHorizontal: 16, marginBottom: 14,
    backgroundColor: "#0B0B0B", borderRadius: 16,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.06)",
    padding: 18,
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  cardIcon: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, backgroundColor: "rgba(255,255,255,0.02)",
  },
  cardName: { color: "#FFF", fontSize: 14, fontWeight: "800", letterSpacing: 1.6 },
  cardTag: { color: MUTED, fontSize: 10.5, fontWeight: "600", marginTop: 2, letterSpacing: 0.5 },
  mineBadge: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.15)",
  },
  mineTxt: { color: "#E0E0E0", fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },

  priceBlock: { flexDirection: "row", alignItems: "baseline", marginTop: 14, gap: 4 },
  priceCurr: { color: MUTED, fontSize: 13, fontWeight: "700" },
  priceVal: { color: "#FFF", fontSize: 30, fontWeight: "900", letterSpacing: -0.5 },
  priceMo: { color: MUTED, fontSize: 12, fontWeight: "600" },

  feats: { marginTop: 16, gap: 9 },
  featRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  featDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: GOLD, opacity: 0.8 },
  featTxt: { color: "#CFCFCF", fontSize: 12.5, flex: 1, lineHeight: 17 },

  kpiRow: {
    flexDirection: "row", alignItems: "center",
    marginTop: 16, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.05)",
  },
  kpi: { flex: 1, alignItems: "center", gap: 3 },
  kpiVal: { color: "#FFF", fontSize: 14, fontWeight: "800" },
  kpiLbl: { color: MUTED, fontSize: 8.5, fontWeight: "800", letterSpacing: 1.3 },
  divider: { width: 1, height: 22, backgroundColor: "rgba(255,255,255,0.06)" },

  cta: {
    marginTop: 16, paddingVertical: 12, borderRadius: 10,
    alignItems: "center", borderWidth: 1, backgroundColor: "transparent",
  },
  ctaTxt: { fontSize: 11, fontWeight: "900", letterSpacing: 2 },

  disclaimer: {
    flexDirection: "row", gap: 8, alignItems: "flex-start",
    paddingHorizontal: 22, marginTop: 16,
  },
  disclaimerTxt: { flex: 1, color: MUTED, fontSize: 11, lineHeight: 16 },
});

import { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { api, Plan } from "../../src/api";
import { useGate } from "../../src/gate";
import { theme } from "../../src/theme";

const TIER_ICONS: Record<string, any> = {
  silver: "medal",
  gold: "star",
  diamond: "diamond",
};

export default function Negocios() {
  const router = useRouter();
  const { member } = useGate();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.plans().then((p) => { setPlans(p); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const myPlan = member?.tier || "silver";

  if (loading) return <View style={{ flex: 1, backgroundColor: "#050505", justifyContent: "center" }}><ActivityIndicator color="#FFF" /></View>;

  return (
    <View style={{ flex: 1, backgroundColor: "#050505" }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Hero */}
        <View style={styles.hero}>
          <Text style={styles.kicker}>BLACKSCLUB</Text>
          <Text style={styles.heroTitle}>Seja membro.{"\n"}Negocie entre iguais.</Text>
          <Text style={styles.heroSub}>Marketplace privado entre membros. Sem intermediários. Sem comissão.</Text>
        </View>

        {/* Marketplace shortcut */}
        <TouchableOpacity style={styles.marketBtn} onPress={() => router.push("/ads")} activeOpacity={0.85} testID="open-marketplace">
          <View style={styles.marketIcon}>
            <Ionicons name="storefront" size={22} color="#D4AF37" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.marketTitle}>ENTRAR NO MARKETPLACE</Text>
            <Text style={styles.marketHint}>Anúncios privados dos membros BLACK DIAMOND</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#999" />
        </TouchableOpacity>

        <Text style={styles.section}>PLANOS DE MEMBRO</Text>

        {plans.map((p) => {
          const isMine = myPlan === p.id;
          return (
            <View key={p.id} style={[styles.card, isMine && { borderColor: p.color, borderWidth: 2 }]}>
              <View style={styles.cardHead}>
                <View style={[styles.cardIcon, { backgroundColor: p.color + "22", borderColor: p.color }]}>
                  <Ionicons name={TIER_ICONS[p.id] || "ellipse"} size={18} color={p.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardName, { color: p.color }]}>{p.name}</Text>
                  <Text style={styles.cardPrice}>R$ {p.price_monthly}<Text style={styles.cardMo}>/mês</Text></Text>
                </View>
                {isMine && (
                  <View style={[styles.mineBadge, { backgroundColor: p.color + "22", borderColor: p.color }]}>
                    <Text style={[styles.mineTxt, { color: p.color }]}>SEU PLANO</Text>
                  </View>
                )}
              </View>

              <View style={styles.feats}>
                {p.features.map((f, i) => (
                  <View key={i} style={styles.featRow}>
                    <Ionicons name="checkmark-circle" size={14} color={p.color} />
                    <Text style={styles.featTxt}>{f}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.benefitsRow}>
                <View style={styles.bb}>
                  <Text style={styles.bbNum}>{p.discount}%</Text>
                  <Text style={styles.bbLbl}>DESCONTO</Text>
                </View>
                <View style={styles.bb}>
                  <Text style={[styles.bbNum, { color: p.can_sell ? "#4EE07F" : "#666" }]}>{p.can_sell ? "SIM" : "NÃO"}</Text>
                  <Text style={styles.bbLbl}>PODE VENDER</Text>
                </View>
                <View style={styles.bb}>
                  <Text style={[styles.bbNum, { color: "#4EE07F" }]}>SIM</Text>
                  <Text style={styles.bbLbl}>PODE COMPRAR</Text>
                </View>
              </View>

              {!isMine && (
                <TouchableOpacity
                  style={[styles.cta, { backgroundColor: p.color }]}
                  onPress={() => Alert.alert("Upgrade de plano", `Para evoluir para ${p.name} entre em contato com o suporte interno. O upgrade é validado manualmente pela equipe BLACKSCLUB.`, [{ text: "Falar com suporte", onPress: () => router.push("/chat") }, { text: "OK" }])}
                  testID={`upgrade-${p.id}`}
                >
                  <Text style={styles.ctaTxt}>QUERO ESSE PLANO</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}

        <View style={styles.disclaimer}>
          <MaterialCommunityIcons name="shield-lock" size={16} color="#666" />
          <Text style={styles.disclaimerTxt}>
            O BLACKSCLUB é um clube privado. O app monitora as transações via BLACK Coins em escrow. Só BLACK DIAMOND pode anunciar; todos os planos podem comprar e participar. Descontos aplicados automaticamente no momento da compra.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { paddingHorizontal: 22, paddingTop: 24, paddingBottom: 16 },
  kicker: { color: "#D4AF37", fontSize: 10, fontWeight: "900", letterSpacing: 4 },
  heroTitle: { color: "#FFF", fontSize: 26, fontWeight: "900", lineHeight: 32, marginTop: 8 },
  heroSub: { color: "#999", fontSize: 12, marginTop: 10, lineHeight: 17 },

  marketBtn: { flexDirection: "row", alignItems: "center", gap: 12, marginHorizontal: 16, padding: 14, borderRadius: 12, backgroundColor: "#141414", borderWidth: 1, borderColor: "#D4AF37" },
  marketIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(212,175,55,0.12)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#D4AF37" },
  marketTitle: { color: "#D4AF37", fontSize: 12, fontWeight: "900", letterSpacing: 1.5 },
  marketHint: { color: "#999", fontSize: 11, marginTop: 2 },

  section: { color: "#777", fontSize: 10, fontWeight: "900", letterSpacing: 3, paddingHorizontal: 22, marginTop: 24, marginBottom: 12 },

  card: { marginHorizontal: 16, marginBottom: 14, backgroundColor: "#111", borderRadius: 14, borderWidth: 1, borderColor: "#1F1F1F", padding: 16 },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  cardIcon: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  cardName: { fontSize: 13, fontWeight: "900", letterSpacing: 2 },
  cardPrice: { color: "#FFF", fontSize: 22, fontWeight: "900", marginTop: 2 },
  cardMo: { color: "#888", fontSize: 12, fontWeight: "700" },
  mineBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  mineTxt: { fontSize: 9, fontWeight: "900", letterSpacing: 1 },

  feats: { marginTop: 14, gap: 8 },
  featRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  featTxt: { color: "#DDD", fontSize: 12, flex: 1 },

  benefitsRow: { flexDirection: "row", marginTop: 14, backgroundColor: "#0A0A0A", borderRadius: 8, padding: 10 },
  bb: { flex: 1, alignItems: "center" },
  bbNum: { color: "#FFF", fontSize: 14, fontWeight: "900" },
  bbLbl: { color: "#888", fontSize: 9, fontWeight: "800", letterSpacing: 1, marginTop: 3 },

  cta: { marginTop: 14, paddingVertical: 12, borderRadius: 10, alignItems: "center" },
  ctaTxt: { color: "#000", fontSize: 11, fontWeight: "900", letterSpacing: 2 },

  disclaimer: { flexDirection: "row", gap: 8, paddingHorizontal: 22, marginTop: 14, alignItems: "flex-start" },
  disclaimerTxt: { flex: 1, color: "#666", fontSize: 11, lineHeight: 16 },
});

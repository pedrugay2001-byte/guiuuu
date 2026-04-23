import React, { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator,
  TouchableOpacity, RefreshControl, Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../src/api";
import { TIERS, TierId } from "../../src/theme";
import { formatBLX } from "../../src/blx";
import { notify } from "../../src/alerts";
import ScreenHeader from "../../src/screen-header";

const GOLD = "#D4AF37";
const BG = "#050505";

type Metrics = Awaited<ReturnType<typeof api.adminMetrics>>;

export default function AdminMetrics() {
  const router = useRouter();
  const [data, setData] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const m = await api.adminMetrics();
      setData(m);
    } catch (e: any) {
      const msg = String(e?.message || "").toLowerCase();
      if (msg.includes("staff") || msg.includes("401") || msg.includes("403")) {
        notify("Acesso negado", "Faça login como staff/admin.");
        setTimeout(() => router.replace("/staff/login" as any), 500);
      } else {
        notify("Erro", e?.message || "Falha ao carregar métricas");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = () => { setRefreshing(true); load(); };

  if (loading && !data) {
    return (
      <View style={{ flex: 1, backgroundColor: BG, alignItems: "center", justifyContent: "center" }}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator color={GOLD} size="large" />
        <Text style={{ color: "#888", marginTop: 12, fontSize: 12 }}>Carregando métricas…</Text>
      </View>
    );
  }

  if (!data) {
    return (
      <View style={{ flex: 1, backgroundColor: BG, alignItems: "center", justifyContent: "center", padding: 20 }}>
        <Stack.Screen options={{ headerShown: false }} />
        <Ionicons name="analytics-outline" size={48} color="#555" />
        <Text style={{ color: "#888", marginTop: 12, fontSize: 14 }}>Sem dados disponíveis</Text>
        <TouchableOpacity style={st.retryBtn} onPress={load}>
          <Text style={st.retryTxt}>TENTAR NOVAMENTE</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const totalSupply = data.supply.total_cents;
  const available = data.supply.available_cents;
  const escrow = data.supply.escrow_out_cents;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }} edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Métricas BLX" subtitle="Painel executivo do ecossistema" />

      <ScrollView
        contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
        refreshControl={<RefreshControl tintColor={GOLD} refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* SUPPLY CARD */}
        <View style={st.heroCard}>
          <View style={st.heroGlow} />
          <Text style={st.heroKicker}>SUPPLY TOTAL EM CIRCULAÇÃO</Text>
          <Text style={st.heroValue}>{formatBLX(totalSupply)}</Text>
          <Text style={st.heroUnit}>BLX</Text>
          <View style={st.heroDividers}>
            <View style={st.heroMini}>
              <Text style={st.miniLabel}>DISPONÍVEL</Text>
              <Text style={st.miniValue}>{formatBLX(available)}</Text>
            </View>
            <View style={st.heroMini}>
              <Text style={st.miniLabel}>EM ESCROW</Text>
              <Text style={[st.miniValue, { color: "#F5C150" }]}>{formatBLX(escrow)}</Text>
            </View>
          </View>
        </View>

        {/* WALLETS + VOLUME GRID */}
        <View style={st.row2}>
          <MetricCard
            icon="wallet-outline"
            label="CARTEIRAS ATIVAS"
            value={`${data.supply.wallets_with_balance}`}
            hint={`de ${data.supply.wallets_count} total`}
            color="#4EE07F"
          />
          <MetricCard
            icon="trending-up-outline"
            label="VOLUME 30D"
            value={`${formatBLX(data.volume_30d.total_cents)}`}
            hint={`${data.volume_30d.tx_count} transações`}
            color={GOLD}
          />
        </View>

        <View style={st.row2}>
          <MetricCard
            icon="time-outline"
            label="PEDIDOS ABERTOS"
            value={`${data.orders.open}`}
            hint="aguardando entrega"
            color="#F5C150"
          />
          <MetricCard
            icon="checkmark-circle-outline"
            label="PEDIDOS CONCLUÍDOS"
            value={`${data.orders.completed}`}
            hint="escrow liberado"
            color="#4EE07F"
          />
        </View>

        {/* TOP SELLERS */}
        <View style={st.sectionHead}>
          <Ionicons name="trophy" size={16} color={GOLD} />
          <Text style={st.sectionTitle}>TOP SELLERS</Text>
          <Text style={st.sectionSub}>(por volume liberado)</Text>
        </View>

        {data.top_sellers.length === 0 ? (
          <View style={st.emptyBox}>
            <Ionicons name="storefront-outline" size={28} color="#555" />
            <Text style={st.emptyTxt}>Nenhuma venda liberada ainda.</Text>
          </View>
        ) : (
          data.top_sellers.map((s, idx) => {
            const tier = TIERS[(s.tier as TierId)] || TIERS.silver;
            return (
              <View key={s.member_id} style={st.sellerRow}>
                <View style={st.rankBadge}>
                  <Text style={[st.rankTxt, idx === 0 && { color: GOLD }, idx === 1 && { color: "#C0C0C0" }, idx === 2 && { color: "#CD7F32" }]}>
                    {idx + 1}º
                  </Text>
                </View>
                {s.avatar_base64 ? (
                  <Image source={{ uri: s.avatar_base64 }} style={st.avatar} />
                ) : (
                  <View style={[st.avatar, st.avFallback]}>
                    <Text style={st.avLetter}>{(s.name || "?").charAt(0).toUpperCase()}</Text>
                  </View>
                )}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={st.sellerName} numberOfLines={1}>{s.name}</Text>
                  <View style={st.sellerMeta}>
                    <View style={[st.tierPill, { borderColor: tier.color }]}>
                      <Ionicons name={tier.icon as any} size={8} color={tier.color} />
                      <Text style={[st.tierPillTxt, { color: tier.color }]}>{tier.label.toUpperCase()}</Text>
                    </View>
                    {s.rating_count > 0 ? (
                      <View style={st.rating}>
                        <Ionicons name="star" size={10} color="#F5C150" />
                        <Text style={st.ratingTxt}>{s.rating_avg.toFixed(1)} ({s.rating_count})</Text>
                      </View>
                    ) : (
                      <Text style={st.noRating}>sem avaliações</Text>
                    )}
                  </View>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={st.sellerValue}>{formatBLX(s.total_cents)}</Text>
                  <Text style={st.sellerUnit}>BLX · {s.sales_count} venda{s.sales_count === 1 ? "" : "s"}</Text>
                </View>
              </View>
            );
          })
        )}

        <Text style={st.footerNote}>
          Atualizado em tempo real · Dados extraídos de wallet_txs (escrow liberado) e blx_ratings.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function MetricCard({ icon, label, value, hint, color }: {
  icon: any; label: string; value: string; hint: string; color: string;
}) {
  return (
    <View style={[st.metricCard, { borderColor: color + "30" }]}>
      <View style={[st.metricIcon, { backgroundColor: color + "20" }]}>
        <Ionicons name={icon} size={16} color={color} />
      </View>
      <Text style={st.metricValue}>{value}</Text>
      <Text style={st.metricLabel}>{label}</Text>
      <Text style={st.metricHint}>{hint}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  heroCard: {
    backgroundColor: "#0B0B0B", borderRadius: 16, padding: 22,
    borderWidth: 1, borderColor: "rgba(212,175,55,0.3)",
    position: "relative", overflow: "hidden", marginBottom: 12,
  },
  heroGlow: {
    position: "absolute", top: -60, right: -60, width: 220, height: 220, borderRadius: 110,
    backgroundColor: GOLD, opacity: 0.08,
  },
  heroKicker: { color: GOLD, fontSize: 10, fontWeight: "900", letterSpacing: 2 },
  heroValue: { color: "#FFF", fontSize: 42, fontWeight: "900", letterSpacing: -1, marginTop: 6 },
  heroUnit: { color: GOLD, fontSize: 13, fontWeight: "800", letterSpacing: 2, marginTop: -4 },
  heroDividers: {
    flexDirection: "row", gap: 14, marginTop: 16,
    paddingTop: 14, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)",
  },
  heroMini: { flex: 1 },
  miniLabel: { color: "#888", fontSize: 9, fontWeight: "900", letterSpacing: 1.5 },
  miniValue: { color: "#FFF", fontSize: 16, fontWeight: "800", marginTop: 4 },

  row2: { flexDirection: "row", gap: 8, marginBottom: 10 },
  metricCard: {
    flex: 1, backgroundColor: "#0B0B0B", borderRadius: 12, padding: 12,
    borderWidth: 1, gap: 4,
  },
  metricIcon: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: "center", justifyContent: "center", marginBottom: 4,
  },
  metricValue: { color: "#FFF", fontSize: 22, fontWeight: "900", letterSpacing: -0.5 },
  metricLabel: { color: "#888", fontSize: 9, fontWeight: "900", letterSpacing: 1.3 },
  metricHint: { color: "#555", fontSize: 10, fontWeight: "600", marginTop: 1 },

  sectionHead: {
    flexDirection: "row", alignItems: "center", gap: 6,
    marginTop: 20, marginBottom: 10,
  },
  sectionTitle: { color: "#FFF", fontSize: 12, fontWeight: "900", letterSpacing: 2 },
  sectionSub: { color: "#666", fontSize: 10, fontWeight: "600", marginLeft: 2 },

  sellerRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    padding: 10, backgroundColor: "#0B0B0B", borderRadius: 10,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.05)", marginBottom: 6,
  },
  rankBadge: { width: 28, alignItems: "center" },
  rankTxt: { color: "#888", fontSize: 12, fontWeight: "900" },
  avatar: { width: 38, height: 38, borderRadius: 19 },
  avFallback: { backgroundColor: "#1A1A1A", alignItems: "center", justifyContent: "center" },
  avLetter: { color: "#FFF", fontWeight: "900", fontSize: 13 },
  sellerName: { color: "#FFF", fontSize: 13, fontWeight: "700" },
  sellerMeta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3, flexWrap: "wrap" },
  tierPill: {
    flexDirection: "row", alignItems: "center", gap: 3,
    paddingHorizontal: 5, paddingVertical: 2, borderRadius: 8, borderWidth: 1,
  },
  tierPillTxt: { fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  rating: { flexDirection: "row", alignItems: "center", gap: 3 },
  ratingTxt: { color: "#F5C150", fontSize: 10, fontWeight: "700" },
  noRating: { color: "#555", fontSize: 9, fontWeight: "600", fontStyle: "italic" },
  sellerValue: { color: GOLD, fontSize: 14, fontWeight: "900" },
  sellerUnit: { color: "#666", fontSize: 9, fontWeight: "700", marginTop: 1 },

  emptyBox: {
    alignItems: "center", justifyContent: "center", gap: 8, padding: 24,
    backgroundColor: "#0B0B0B", borderRadius: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.05)",
  },
  emptyTxt: { color: "#888", fontSize: 12, fontWeight: "600" },

  footerNote: {
    color: "#555", fontSize: 10, textAlign: "center",
    marginTop: 20, fontStyle: "italic", lineHeight: 14,
  },

  retryBtn: {
    marginTop: 16, paddingHorizontal: 20, paddingVertical: 10,
    borderRadius: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.2)",
  },
  retryTxt: { color: "#FFF", fontWeight: "800", fontSize: 11, letterSpacing: 1.5 },
});

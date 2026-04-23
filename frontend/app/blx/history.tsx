import { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api, BlxTx } from "../../src/api";
import { useGate } from "../../src/gate";
import { formatBLX } from "../../src/blx";

type Filter = "all" | "in" | "out";

export default function History() {
  const router = useRouter();
  const { member } = useGate();
  const [txs, setTxs] = useState<BlxTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");

  const PAGE = 30;

  const load = useCallback(async (reset = false) => {
    if (!member) return;
    try {
      const data = await api.blxTransactions(member.member_id, PAGE, 0);
      setTxs(data);
      setHasMore(data.length === PAGE);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [member]);

  useEffect(() => { load(true); }, [load]);

  const loadMore = async () => {
    if (!member || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const more = await api.blxTransactions(member.member_id, PAGE, txs.length);
      setTxs((prev) => [...prev, ...more]);
      if (more.length < PAGE) setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  };

  const filtered = txs.filter((t) => {
    if (filter === "all") return true;
    if (filter === "in") return t.to_id === member?.member_id;
    if (filter === "out") return t.from_id === member?.member_id && t.type !== "topup";
    return true;
  });

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: "#050505", justifyContent: "center" }}>
        <ActivityIndicator color="#D4AF37" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#050505" }}>
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} testID="blx-history-back">
            <Ionicons name="chevron-back" size={22} color="#FFF" />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={styles.title}>EXTRATO BLX</Text>
            <Text style={styles.sub}>{txs.length} {txs.length === 1 ? "movimentação" : "movimentações"}</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        {/* Filtros */}
        <View style={styles.filterRow}>
          {([{ id: "all", lbl: "TUDO" }, { id: "in", lbl: "RECEBIDO" }, { id: "out", lbl: "ENVIADO" }] as const).map((f) => (
            <TouchableOpacity
              key={f.id}
              style={[styles.filterBtn, filter === f.id && styles.filterBtnActive]}
              onPress={() => setFilter(f.id)}
              testID={`blx-filter-${f.id}`}
            >
              <Text style={[styles.filterText, filter === f.id && styles.filterTextActive]}>{f.lbl}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <FlatList
          data={filtered}
          keyExtractor={(i) => i.tx_id}
          refreshControl={
            <RefreshControl tintColor="#D4AF37" refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} />
          }
          renderItem={({ item }) => <Row tx={item} me={member?.member_id || ""} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={() => (
            <View style={styles.emptyBox}>
              <Ionicons name="receipt-outline" size={40} color="#2E2E2E" />
              <Text style={styles.emptyText}>Sem movimentações aqui</Text>
            </View>
          )}
          ListFooterComponent={() => (
            loadingMore ? <ActivityIndicator color="#D4AF37" style={{ marginVertical: 16 }} /> : <View style={{ height: 30 }} />
          )}
          contentContainerStyle={{ padding: 16, paddingBottom: 30 }}
        />
      </SafeAreaView>
    </View>
  );
}

function Row({ tx, me }: { tx: BlxTx; me: string }) {
  const isOut = tx.from_id === me;
  let icon: any = "swap-horizontal";
  let color = "#AAA";
  let title = tx.note || tx.type.toUpperCase();
  let counterpart = "";
  if (tx.type === "transfer") {
    if (isOut) { icon = "arrow-up-circle"; color = "#F87171"; title = "Transferência enviada"; counterpart = tx.to_name ? `Para ${tx.to_name}` : (tx.to_wallet || ""); }
    else { icon = "arrow-down-circle"; color = "#4EE07F"; title = "Transferência recebida"; counterpart = tx.from_name ? `De ${tx.from_name}` : (tx.from_wallet || ""); }
  } else if (tx.type === "topup") { icon = "add-circle"; color = "#4EE07F"; title = "Crédito recebido"; counterpart = "Administração do clube"; }
  else if (tx.type === "withdraw") { icon = "remove-circle"; color = "#F5C150"; title = "Débito"; counterpart = "Administração do clube"; }
  else if (tx.type === "escrow") {
    if (isOut) { icon = "lock-closed"; color = tx.status === "settled" ? "#4EE07F" : tx.status === "refunded" ? "#AAA" : "#F5C150"; title = `Compra: ${tx.ad_title || "Anúncio"}`; }
    else { icon = "cash"; color = tx.status === "settled" ? "#4EE07F" : "#F5C150"; title = `Venda: ${tx.ad_title || "Anúncio"}`; }
  }
  const sign = isOut ? "−" : "+";
  const date = new Date(tx.created_at);
  const dateStr = date.toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <View style={styles.txRow}>
      <View style={[styles.txIcon, { backgroundColor: color + "22", borderColor: color + "55" }]}>
        <Ionicons name={icon} size={16} color={color} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.txTitle} numberOfLines={1}>{title}</Text>
        <Text style={styles.txSub} numberOfLines={1}>
          {counterpart ? `${counterpart} · ${dateStr}` : dateStr}
        </Text>
        {tx.note && tx.type === "transfer" && (
          <Text style={styles.txNote} numberOfLines={2}>“{tx.note}”</Text>
        )}
      </View>
      <Text style={[styles.txAmt, { color: isOut ? "#F87171" : "#4EE07F" }]}>
        {sign}{formatBLX(tx.amount_centavos)} BLX
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 12,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#141414",
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { color: "#FFF", fontSize: 13, fontWeight: "900", letterSpacing: 2 },
  sub: { color: "#8A8A8A", fontSize: 10, fontWeight: "700", letterSpacing: 1.5, marginTop: 2 },

  filterRow: { flexDirection: "row", paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  filterBtn: {
    flex: 1, paddingVertical: 9, borderRadius: 10,
    backgroundColor: "#0E0E0E", borderWidth: 1, borderColor: "#1A1A1A",
    alignItems: "center",
  },
  filterBtnActive: { backgroundColor: "#D4AF37", borderColor: "#D4AF37" },
  filterText: { color: "#AAA", fontSize: 10.5, fontWeight: "900", letterSpacing: 1.5 },
  filterTextActive: { color: "#0A0A0A" },

  emptyBox: { alignItems: "center", paddingVertical: 60, gap: 10 },
  emptyText: { color: "#6B6B6B", fontSize: 12 },

  txRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 12, paddingHorizontal: 12,
    backgroundColor: "#0A0A0A",
    borderRadius: 10, marginBottom: 6,
    borderWidth: 1, borderColor: "#121212",
  },
  txIcon: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1,
  },
  txTitle: { color: "#EEE", fontSize: 13, fontWeight: "700" },
  txSub: { color: "#777", fontSize: 11, marginTop: 2 },
  txNote: { color: "#AAA", fontSize: 11, marginTop: 4, fontStyle: "italic" },
  txAmt: { fontSize: 13, fontWeight: "900" },
});

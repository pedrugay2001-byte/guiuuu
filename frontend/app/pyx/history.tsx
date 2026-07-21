/**
 * ETAPA 5 — Extrato PYX (com clique, agrupamento por dia, filtros e busca).
 *
 * O que muda vs. versão anterior:
 *  - Cada transação vira um <TouchableOpacity> que navega para /pyx/receipt/[txId].
 *  - Linhas agrupadas por dia com cabeçalhos "HOJE", "ONTEM", "15 de julho" etc.
 *  - Filtros expandidos: TUDO / RECEBIDO / ENVIADO / COMPRAS / RECARGAS
 *    (chips horizontais scrolláveis para caber em telas pequenas).
 *  - Campo de busca (debounced) por nome da contraparte, note ou tx_id.
 *  - Chevron > à direita de cada linha para reforçar affordance de clique.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
  RefreshControl, ScrollView, TextInput,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "../../src/icons";
import { api, PyxTx } from "../../src/api";
import { useGate } from "../../src/gate";
import { formatPYXParts } from "../../src/pyx";
import { AmountText } from "../../src/amount-text";

type Filter = "all" | "in" | "out" | "purchases" | "topups";
type RowItem =
  | { kind: "header"; label: string; id: string }
  | { kind: "tx"; tx: PyxTx };

/** Retorna label amigável para agrupamento por dia. */
function dayLabel(d: Date): string {
  const now = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(now) - startOf(d)) / 86400000);
  if (diffDays === 0) return "HOJE";
  if (diffDays === 1) return "ONTEM";
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" }).toUpperCase();
  }
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Chave estável do dia (para gerar id do header). */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

const FILTERS: { id: Filter; lbl: string; icon: any }[] = [
  { id: "all", lbl: "TUDO", icon: "grid" },
  { id: "in", lbl: "RECEBIDO", icon: "arrow-down-circle" },
  { id: "out", lbl: "ENVIADO", icon: "arrow-up-circle" },
  { id: "purchases", lbl: "COMPRAS", icon: "bag-handle" },
  { id: "topups", lbl: "RECARGAS", icon: "add-circle" },
];

const PURCHASE_TYPES = new Set(["purchase", "escrow", "delivery_settle", "refund"]);

export default function History() {
  const router = useRouter();
  const { member } = useGate();
  const [txs, setTxs] = useState<PyxTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");

  const [rawSearch, setRawSearch] = useState("");
  const [search, setSearch] = useState("");
  const debRef = useRef<any>(null);

  const PAGE = 30;

  const load = useCallback(async () => {
    if (!member) return;
    try {
      const data = await api.pyxTransactions(member.member_id, PAGE, 0);
      setTxs(data);
      setHasMore(data.length === PAGE);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [member]);

  useEffect(() => { load(); }, [load]);

  // Debounce da busca
  useEffect(() => {
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(() => setSearch(rawSearch.trim().toLowerCase()), 220);
    return () => { if (debRef.current) clearTimeout(debRef.current); };
  }, [rawSearch]);

  const loadMore = async () => {
    if (!member || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const more = await api.pyxTransactions(member.member_id, PAGE, txs.length);
      setTxs((prev) => [...prev, ...more]);
      if (more.length < PAGE) setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  };

  const filtered = useMemo(() => {
    const me = member?.member_id;
    return txs.filter((t) => {
      // filtro por tipo/direção
      if (filter === "in" && t.to_id !== me) return false;
      if (filter === "out" && !(t.from_id === me && t.type === "transfer")) return false;
      if (filter === "purchases" && !PURCHASE_TYPES.has(t.type)) return false;
      if (filter === "topups" && t.type !== "topup") return false;
      // filtro por busca
      if (search) {
        const hay = [
          t.tx_id,
          t.note,
          t.from_name,
          t.to_name,
          t.from_wallet,
          t.to_wallet,
          t.ad_title,
        ].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(search)) return false;
      }
      return true;
    });
  }, [txs, filter, search, member]);

  // Agrupamento por dia (ordem já é decrescente vindo do backend).
  // Se a tx traz `display_date_brt` (novas — BRT), usamos essa data como chave
  // para garantir agrupamento consistente independente do fuso do dispositivo.
  const rows: RowItem[] = useMemo(() => {
    const acc: RowItem[] = [];
    let last = "";
    filtered.forEach((tx) => {
      const d = new Date(tx.created_at);
      let key: string;
      let label: string;
      if (tx.display_date_brt) {
        // "dd/mm/yyyy" — chave estável no fuso BRT
        key = `brt-${tx.display_date_brt}`;
        // Convertemos para Date usando o campo ISO com offset (created_at_brt)
        // para calcular HOJE/ONTEM corretamente em qualquer TZ.
        const brtDate = tx.created_at_brt ? new Date(tx.created_at_brt) : d;
        label = dayLabel(brtDate);
      } else {
        key = dayKey(d);
        label = dayLabel(d);
      }
      if (key !== last) {
        acc.push({ kind: "header", label, id: `h-${key}` });
        last = key;
      }
      acc.push({ kind: "tx", tx });
    });
    return acc;
  }, [filtered]);

  // Contadores para as chips (mostra "5" ao lado de FILTER se aplicável)
  const counts = useMemo(() => {
    const me = member?.member_id;
    const c = { all: txs.length, in: 0, out: 0, purchases: 0, topups: 0 };
    txs.forEach((t) => {
      if (t.to_id === me) c.in++;
      if (t.from_id === me && t.type === "transfer") c.out++;
      if (PURCHASE_TYPES.has(t.type)) c.purchases++;
      if (t.type === "topup") c.topups++;
    });
    return c;
  }, [txs, member]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: "#050505", justifyContent: "center" }}>
        <ActivityIndicator color="#C5D1DA" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#050505" }}>
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} testID="pyx-history-back">
            <Ionicons name="chevron-back" size={22} color="#FFF" />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={styles.title}>EXTRATO PYX</Text>
            <Text style={styles.sub}>
              {filtered.length} de {txs.length} {txs.length === 1 ? "movimentação" : "movimentações"}
            </Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        {/* Busca */}
        <View style={styles.searchBox}>
          <Ionicons name="search" size={14} color="#8A8A8A" />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar por nome, nota ou ID"
            placeholderTextColor="#5A5A5A"
            value={rawSearch}
            onChangeText={setRawSearch}
            autoCapitalize="none"
            testID="pyx-history-search"
          />
          {rawSearch ? (
            <TouchableOpacity onPress={() => setRawSearch("")} testID="pyx-history-search-clear">
              <Ionicons name="close-circle" size={16} color="#5A5A5A" />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Filtros (horizontal scroll) */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {FILTERS.map((f) => {
            const active = filter === f.id;
            const count = (counts as any)[f.id];
            return (
              <TouchableOpacity
                key={f.id}
                style={[styles.filterBtn, active && styles.filterBtnActive]}
                onPress={() => setFilter(f.id)}
                testID={`pyx-filter-${f.id}`}
                activeOpacity={0.85}
              >
                <Ionicons name={f.icon} size={12} color={active ? "#0A0A0A" : "#AAA"} />
                <Text style={[styles.filterText, active && styles.filterTextActive]}>
                  {f.lbl}
                </Text>
                <View style={[styles.badge, active && styles.badgeActive]}>
                  <Text style={[styles.badgeTxt, active && styles.badgeTxtActive]}>{count}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <FlatList
          data={rows}
          keyExtractor={(i) => (i.kind === "header" ? i.id : `tx-${i.tx.tx_id}`)}
          refreshControl={
            <RefreshControl
              tintColor="#C5D1DA"
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(); }}
            />
          }
          renderItem={({ item }) => {
            if (item.kind === "header") {
              return <SectionHeader label={item.label} />;
            }
            return (
              <TxRow
                tx={item.tx}
                me={member?.member_id || ""}
                onPress={() =>
                  router.push({ pathname: "/pyx/receipt/[txId]", params: { txId: item.tx.tx_id } } as any)
                }
              />
            );
          }}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={() => (
            <View style={styles.emptyBox}>
              <Ionicons name="receipt-outline" size={40} color="#2E2E2E" />
              <Text style={styles.emptyText}>
                {search
                  ? "Nada encontrado para essa busca"
                  : filter === "all"
                    ? "Sem movimentações aqui"
                    : "Nenhuma movimentação neste filtro"}
              </Text>
              {(search || filter !== "all") && (
                <TouchableOpacity
                  onPress={() => { setRawSearch(""); setFilter("all"); }}
                  style={styles.clearBtn}
                  testID="pyx-history-reset"
                >
                  <Text style={styles.clearBtnTxt}>LIMPAR FILTROS</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          ListFooterComponent={() => (
            loadingMore ? <ActivityIndicator color="#C5D1DA" style={{ marginVertical: 16 }} /> : <View style={{ height: 30 }} />
          )}
          contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 30 }}
          stickyHeaderIndices={undefined /* deixamos rolar junto — visual mais limpo */}
        />
      </SafeAreaView>
    </View>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <View style={styles.headerRow}>
      <View style={styles.headerLine} />
      <Text style={styles.headerLbl}>{label}</Text>
      <View style={styles.headerLine} />
    </View>
  );
}

function TxRow({ tx, me, onPress }: { tx: PyxTx; me: string; onPress: () => void }) {
  const isOut = tx.from_id === me;
  let icon: any = "swap-horizontal";
  let color = "#AAA";
  const TYPE_LABEL: Record<string, string> = {
    purchase: "Compra",
    refund: "Reembolso",
    delivery_settle: "Pagamento na entrega",
    escrow: "Reserva Diamante",
    transfer: "Transferência",
    topup: "Recarga",
    withdraw: "Saque",
  };
  let title = tx.note || TYPE_LABEL[tx.type] || tx.type.toUpperCase();
  let counterpart = "";
  if (tx.type === "transfer") {
    if (isOut) { icon = "arrow-up-circle"; color = "#F87171"; title = "Transferência enviada"; counterpart = tx.to_name ? `Para ${tx.to_name}` : (tx.to_wallet || ""); }
    else { icon = "arrow-down-circle"; color = "#4EE07F"; title = "Transferência recebida"; counterpart = tx.from_name ? `De ${tx.from_name}` : (tx.from_wallet || ""); }
  } else if (tx.type === "topup") { icon = "add-circle"; color = "#4EE07F"; title = "Crédito recebido"; counterpart = "Administração do clube"; }
  else if (tx.type === "withdraw") { icon = "remove-circle"; color = "#F5C150"; title = "Débito"; counterpart = "Administração do clube"; }
  else if (tx.type === "escrow") {
    if (isOut) { icon = "lock-closed"; color = tx.status === "settled" ? "#4EE07F" : tx.status === "refunded" ? "#AAA" : "#F5C150"; title = `Compra: ${tx.ad_title || "Anúncio"}`; }
    else { icon = "cash"; color = tx.status === "settled" ? "#4EE07F" : "#F5C150"; title = `Venda: ${tx.ad_title || "Anúncio"}`; }
  } else if (tx.type === "purchase") {
    icon = "bag-handle"; color = "#F87171"; title = tx.note || "Compra"; counterpart = "Catálogo oficial";
  } else if (tx.type === "refund") {
    icon = "return-up-back"; color = "#4EE07F"; title = "Reembolso"; counterpart = tx.note || "Pedido cancelado";
  } else if (tx.type === "delivery_settle") {
    icon = "checkmark-circle"; color = "#4EE07F"; title = "Entrega confirmada"; counterpart = "Saldo devedor liberado";
  }
  const sign = isOut ? "−" : "+";
  const date = new Date(tx.created_at);
  // BRT — se o backend enviou hora formatada em Brasília, priorizamos ela.
  const timeStr = tx.display_time_brt
    ? tx.display_time_brt.slice(0, 5)  // "HH:MM" (sem segundos, mais limpo na lista)
    : date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return (
    <TouchableOpacity
      style={styles.txRow}
      onPress={onPress}
      activeOpacity={0.75}
      testID={`pyx-history-row-${tx.tx_id}`}
    >
      <View style={[styles.txIcon, { backgroundColor: color + "22", borderColor: color + "55" }]}>
        <Ionicons name={icon} size={16} color={color} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.txTitle} numberOfLines={1}>{title}</Text>
        <Text style={styles.txSub} numberOfLines={1}>
          {counterpart ? `${counterpart} · ${timeStr}` : timeStr}
        </Text>
        {tx.note && tx.type === "transfer" && (
          <Text style={styles.txNote} numberOfLines={2}>“{tx.note}”</Text>
        )}
      </View>
      <View style={styles.txRight}>
        <AmountText
          parts={{ ...formatPYXParts(tx.amount_centavos), sign }}
          unit="PYX"
          style={[styles.txAmt, { color: isOut ? "#F87171" : "#4EE07F" }]}
          unitStyle={[styles.txAmt, { color: isOut ? "#F87171" : "#4EE07F" }]}
        />
        <Ionicons name="chevron-forward" size={16} color="#3A3A3A" />
      </View>
    </TouchableOpacity>
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

  // Search
  searchBox: {
    flexDirection: "row", alignItems: "center", gap: 10,
    marginHorizontal: 16, marginTop: 12,
    paddingHorizontal: 12, backgroundColor: "#0E0E0E",
    borderRadius: 10, borderWidth: 1, borderColor: "#1A1A1A",
  },
  searchInput: { flex: 1, color: "#FFF", paddingVertical: 10, fontSize: 13 },

  // Filter chips
  filterRow: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  filterBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: "#0E0E0E", borderWidth: 1, borderColor: "#1A1A1A",
  },
  filterBtnActive: { backgroundColor: "#C5D1DA", borderColor: "#C5D1DA" },
  filterText: { color: "#AAA", fontSize: 10.5, fontWeight: "900", letterSpacing: 1.2 },
  filterTextActive: { color: "#0A0A0A" },
  badge: {
    minWidth: 20, height: 18, paddingHorizontal: 6,
    borderRadius: 9,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "#1A1A1A",
  },
  badgeActive: { backgroundColor: "#0A0A0A" },
  badgeTxt: { color: "#EEE", fontSize: 9.5, fontWeight: "900" },
  badgeTxtActive: { color: "#C5D1DA" },

  // Section header
  headerRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    marginTop: 14, marginBottom: 6,
  },
  headerLine: { flex: 1, height: 1, backgroundColor: "#151515" },
  headerLbl: {
    color: "#8A8A8A", fontSize: 10, fontWeight: "900", letterSpacing: 2,
  },

  // Empty
  emptyBox: { alignItems: "center", paddingVertical: 60, gap: 10 },
  emptyText: { color: "#6B6B6B", fontSize: 12, textAlign: "center" },
  clearBtn: {
    marginTop: 10, paddingHorizontal: 20, paddingVertical: 10,
    backgroundColor: "#1A1A1A", borderRadius: 8,
    borderWidth: 1, borderColor: "#2E2E2E",
  },
  clearBtnTxt: { color: "#EEE", fontSize: 10.5, fontWeight: "900", letterSpacing: 1.5 },

  // Tx row
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
  txRight: { alignItems: "flex-end", gap: 4 },
  txAmt: { fontSize: 13, fontWeight: "900" },
});

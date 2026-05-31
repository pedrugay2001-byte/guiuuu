import { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  RefreshControl, Modal, TextInput, KeyboardAvoidingView, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "../../src/icons";
import { api } from "../../src/api";
import type { PixOrder } from "../../src/api";
import { confirm, notify } from "../../src/alerts";

const TABS = [
  { key: "pending",  label: "Pendentes",  color: "#F5C150", icon: "time-outline" },
  { key: "approved", label: "Aprovados",  color: "#4EE07F", icon: "checkmark-circle" },
  { key: "rejected", label: "Rejeitados", color: "#F87171", icon: "close-circle" },
] as const;

type TabKey = typeof TABS[number]["key"];

/**
 * Painel de pedidos PIX para STAFF/ADMIN.
 * - Lista pedidos por status (Pendentes/Aprovados/Rejeitados)
 * - Aprovação credita BLX automaticamente na carteira do membro (com taxa 1%)
 * - Rejeição requer um motivo
 */
export default function StaffPixOrders() {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("pending");
  const [orders, setOrders] = useState<PixOrder[]>([]);
  const [stats, setStats] = useState({ pending: 0, approved: 0, rejected: 0 });
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [actioning, setActioning] = useState<string | null>(null); // order_id em ação

  // Modal de rejeição
  const [rejecting, setRejecting] = useState<PixOrder | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ls, st] = await Promise.all([
        api.pixOrdersList(tab),
        api.pixOrdersStats(),
      ]);
      setOrders(ls.orders || []);
      setStats(st || { pending: 0, approved: 0, rejected: 0 });
    } catch (e: any) {
      if (String(e.message || "").toLowerCase().includes("staff")) {
        notify("Acesso negado", "Apenas staff/admin");
        router.replace("/staff/login");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tab, router]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const approve = async (o: PixOrder) => {
    // confirm() universal: funciona tanto em web (window.confirm) quanto em mobile (Alert nativo)
    const ok = await confirm(
      "Aprovar pedido?",
      `Confirma o crédito de ${(o.blx_centavos / 100).toFixed(2)} BLX para ${o.member_name || "membro"}?\n(R$ ${(o.amount_brl_centavos / 100).toFixed(2)} pago no PIX)`,
    );
    if (!ok) return;
    setActioning(o.order_id);
    try {
      await api.pixOrderApprove(o.order_id);
      notify(
        "✅ Pedido aprovado",
        `${(o.blx_centavos / 100).toFixed(2)} BLX creditados para ${o.member_name || "o membro"}.`,
      );
      load();
    } catch (e: any) {
      notify("Erro ao aprovar", e?.message || "Falha ao aprovar pedido.");
    } finally {
      setActioning(null);
    }
  };

  const openReject = (o: PixOrder) => {
    setRejectReason("");
    setRejecting(o);
  };

  const confirmReject = async () => {
    if (!rejecting) return;
    if (!rejectReason.trim()) {
      notify("Informe um motivo", "Descreva por que está rejeitando.");
      return;
    }
    setActioning(rejecting.order_id);
    try {
      await api.pixOrderReject(rejecting.order_id, rejectReason.trim());
      notify(
        "❌ Pedido rejeitado",
        `Membro será notificado com o motivo: "${rejectReason.trim().slice(0, 60)}"`,
      );
      setRejecting(null);
      setRejectReason("");
      load();
    } catch (e: any) {
      notify("Erro ao rejeitar", e?.message || "Falha ao rejeitar pedido.");
    } finally {
      setActioning(null);
    }
  };

  return (
    <SafeAreaView style={st.container} edges={["top", "bottom"]}>
      <Stack.Screen
        options={{
          title: "Pedidos PIX → BLX",
          headerStyle: { backgroundColor: "#050505" },
          headerTintColor: "#FFF",
        }}
      />

      {/* Tabs */}
      <View style={st.tabs}>
        {TABS.map((t) => {
          const active = t.key === tab;
          const count = (stats as any)[t.key] || 0;
          return (
            <TouchableOpacity
              key={t.key}
              style={[st.tab, active && { backgroundColor: t.color + "1A", borderColor: t.color }]}
              onPress={() => setTab(t.key)}
              activeOpacity={0.85}
              testID={`pix-tab-${t.key}`}
            >
              <Ionicons name={t.icon as any} size={14} color={active ? t.color : "#888"} />
              <Text style={[st.tabTxt, { color: active ? t.color : "#888" }]}>
                {t.label} ({count})
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#FFF" />}
      >
        {loading && orders.length === 0 ? (
          <ActivityIndicator color="#F5C150" style={{ marginTop: 30 }} />
        ) : orders.length === 0 ? (
          <View style={st.empty}>
            <Ionicons name="documents-outline" size={42} color="#333" />
            <Text style={st.emptyTxt}>Nenhum pedido {TABS.find((x) => x.key === tab)?.label.toLowerCase()}</Text>
          </View>
        ) : (
          orders.map((o) => (
            <OrderCard
              key={o.order_id}
              o={o}
              onApprove={() => approve(o)}
              onReject={() => openReject(o)}
              busy={actioning === o.order_id}
            />
          ))
        )}
      </ScrollView>

      {/* Modal de Rejeição */}
      <Modal visible={!!rejecting} transparent animationType="fade" onRequestClose={() => setRejecting(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={st.modalBg}>
          <View style={st.modalCard}>
            <View style={st.modalHead}>
              <Ionicons name="close-circle" size={20} color="#F87171" />
              <Text style={st.modalTitle}>Rejeitar pedido</Text>
              <TouchableOpacity onPress={() => setRejecting(null)} style={{ marginLeft: "auto" }}>
                <Ionicons name="close" size={22} color="#888" />
              </TouchableOpacity>
            </View>
            {rejecting && (
              <>
                <Text style={st.modalSub}>
                  {rejecting.member_name || "Membro"} • R$ {(rejecting.amount_brl_centavos / 100).toFixed(2)}
                </Text>
                <Text style={st.modalLbl}>MOTIVO</Text>
                <TextInput
                  style={st.modalInput}
                  value={rejectReason}
                  onChangeText={setRejectReason}
                  placeholder="Ex: PIX não identificado, valor divergente..."
                  placeholderTextColor="#555"
                  multiline
                  maxLength={300}
                />
                <View style={st.modalActions}>
                  <TouchableOpacity onPress={() => setRejecting(null)} style={[st.modalBtn, st.modalBtnGhost]}>
                    <Text style={st.modalBtnGhostTxt}>CANCELAR</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={confirmReject}
                    style={[st.modalBtn, { backgroundColor: "#F87171" }]}
                    disabled={actioning === rejecting?.order_id}
                  >
                    {actioning === rejecting?.order_id ? (
                      <ActivityIndicator color="#FFF" size="small" />
                    ) : (
                      <Text style={st.modalBtnTxt}>CONFIRMAR REJEIÇÃO</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

// ============================================================================
function OrderCard({
  o,
  onApprove,
  onReject,
  busy,
}: {
  o: PixOrder;
  onApprove: () => void;
  onReject: () => void;
  busy: boolean;
}) {
  const date = o.created_at ? new Date(o.created_at).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  }) : "—";
  const isPending = o.status === "pending";
  const tierColor = o.member_tier === "diamond" ? "#C5D1DA"
    : o.member_tier === "gold" ? "#F5C150"
    : o.member_tier === "silver" ? "#A8B2BD"
    : "#888";

  return (
    <View style={st.card}>
      <View style={st.cardHead}>
        <View style={[st.tierTag, { borderColor: tierColor }]}>
          <Text style={[st.tierTxt, { color: tierColor }]}>{(o.member_tier || "—").toUpperCase()}</Text>
        </View>
        <Text style={st.memberName}>{o.member_name || "Membro"}</Text>
        <Text style={st.cardDate}>{date}</Text>
      </View>

      <View style={st.amountRow}>
        <View style={st.amountCol}>
          <Text style={st.amountLbl}>PAGOU NO PIX</Text>
          <Text style={st.amountVal}>R$ {(o.amount_brl_centavos / 100).toFixed(2).replace(".", ",")}</Text>
        </View>
        <Ionicons name="arrow-forward" size={18} color="#666" />
        <View style={st.amountCol}>
          <Text style={[st.amountLbl, { textAlign: "right" }]}>RECEBE EM BLX</Text>
          <Text style={[st.amountVal, { color: "#4EE07F", textAlign: "right" }]}>
            {(o.blx_centavos / 100).toFixed(2)} BLX
          </Text>
        </View>
      </View>

      {o.note ? (
        <View style={st.noteBox}>
          <Text style={st.noteLbl}>Observação:</Text>
          <Text style={st.noteTxt}>{o.note}</Text>
        </View>
      ) : null}

      {!isPending && o.rejection_reason ? (
        <View style={[st.noteBox, { borderColor: "#F8717155" }]}>
          <Text style={[st.noteLbl, { color: "#F87171" }]}>Motivo da rejeição:</Text>
          <Text style={st.noteTxt}>{o.rejection_reason}</Text>
        </View>
      ) : null}

      {!isPending && o.approved_by_email ? (
        <Text style={st.byTxt}>Aprovado por {o.approved_by_email}</Text>
      ) : null}
      {!isPending && o.rejected_by_email ? (
        <Text style={[st.byTxt, { color: "#F87171" }]}>Rejeitado por {o.rejected_by_email}</Text>
      ) : null}

      {isPending && (
        <View style={st.cardActions}>
          <TouchableOpacity
            onPress={onReject}
            style={[st.btn, st.btnGhost]}
            disabled={busy}
            testID={`pix-reject-${o.order_id}`}
          >
            <Ionicons name="close-circle" size={16} color="#F87171" />
            <Text style={[st.btnTxt, { color: "#F87171" }]}>REJEITAR</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onApprove}
            style={[st.btn, { backgroundColor: "#4EE07F" }]}
            disabled={busy}
            testID={`pix-approve-${o.order_id}`}
          >
            {busy ? (
              <ActivityIndicator color="#000" size="small" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={16} color="#000" />
                <Text style={[st.btnTxt, { color: "#000" }]}>APROVAR & CREDITAR</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ============================================================================
const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#050505" },

  tabs: {
    flexDirection: "row", gap: 6, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4,
  },
  tab: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4,
    paddingVertical: 9, paddingHorizontal: 6,
    borderWidth: 1, borderColor: "#1F1F1F",
    backgroundColor: "#0A0A0A",
    borderRadius: 8,
  },
  tabTxt: { fontSize: 11, fontWeight: "800", letterSpacing: 0.4 },

  empty: { alignItems: "center", paddingVertical: 60, gap: 12 },
  emptyTxt: { color: "#555", fontSize: 13 },

  card: {
    backgroundColor: "#0A0A0A",
    borderWidth: 1, borderColor: "#1A1A1A",
    borderRadius: 12, padding: 14,
    marginBottom: 12,
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  tierTag: {
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5,
    borderWidth: 1,
  },
  tierTxt: { fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  memberName: { color: "#F5F5F5", fontSize: 13, fontWeight: "800", flex: 1 },
  cardDate: { color: "#666", fontSize: 10 },

  amountRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12,
    paddingVertical: 8,
  },
  amountCol: { flex: 1 },
  amountLbl: { color: "#777", fontSize: 9, fontWeight: "800", letterSpacing: 1 },
  amountVal: { color: "#F5F5F5", fontSize: 16, fontWeight: "900", marginTop: 2 },

  noteBox: {
    marginTop: 10, padding: 10,
    borderWidth: 1, borderColor: "#1F1F1F", borderRadius: 8,
    backgroundColor: "#0E0E0E",
  },
  noteLbl: { color: "#888", fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  noteTxt: { color: "#CCC", fontSize: 12, marginTop: 3, lineHeight: 16 },

  byTxt: { color: "#666", fontSize: 10, marginTop: 8 },

  cardActions: { flexDirection: "row", gap: 8, marginTop: 14 },
  btn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    paddingVertical: 11, borderRadius: 9,
  },
  btnGhost: { backgroundColor: "transparent", borderWidth: 1.2, borderColor: "#F8717155" },
  btnTxt: { fontSize: 11, fontWeight: "900", letterSpacing: 0.5 },

  // Modal
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.78)", justifyContent: "center", padding: 20 },
  modalCard: {
    backgroundColor: "#0E0E0E",
    borderWidth: 1, borderColor: "#1F1F1F",
    borderRadius: 14, padding: 18,
  },
  modalHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  modalTitle: { color: "#F5F5F5", fontSize: 14, fontWeight: "900" },
  modalSub: { color: "#999", fontSize: 12, marginBottom: 14 },
  modalLbl: { color: "#888", fontSize: 10, fontWeight: "900", letterSpacing: 1.5, marginBottom: 6 },
  modalInput: {
    backgroundColor: "#121212",
    borderWidth: 1, borderColor: "#1F1F1F",
    borderRadius: 8, padding: 10,
    color: "#FFF", minHeight: 70, fontSize: 13,
  },
  modalActions: { flexDirection: "row", gap: 8, marginTop: 16 },
  modalBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  modalBtnGhost: { backgroundColor: "transparent", borderWidth: 1, borderColor: "#1F1F1F" },
  modalBtnGhostTxt: { color: "#888", fontSize: 12, fontWeight: "800", letterSpacing: 1 },
  modalBtnTxt: { color: "#FFF", fontSize: 12, fontWeight: "900", letterSpacing: 1 },
});

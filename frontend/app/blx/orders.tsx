import { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  RefreshControl, Image, Alert, Modal, TextInput, KeyboardAvoidingView, Platform,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "../../src/icons";
import { api, BlxOrder } from "../../src/api";
import { useGate } from "../../src/gate";
import { formatBLX } from "../../src/blx";
import { TIERS } from "../../src/theme";

type Tab = "buyer" | "seller";

export default function Orders() {
  const router = useRouter();
  const { member } = useGate();
  const [tab, setTab] = useState<Tab>("buyer");
  const [orders, setOrders] = useState<BlxOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [confirmTx, setConfirmTx] = useState<BlxOrder | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [ratingTx, setRatingTx] = useState<BlxOrder | null>(null);
  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState("");

  const load = useCallback(async () => {
    if (!member) return;
    try {
      const list = await api.blxOrders(member.member_id, tab);
      setOrders(list);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [member, tab]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const doConfirm = async () => {
    if (!member || !confirmTx) return;
    setSubmitting(true);
    try {
      await api.walletConfirm(confirmTx.tx_id, member.member_id);
      // Recarregar
      const list = await api.blxOrders(member.member_id, tab);
      setOrders(list);
      // Abre avaliação na sequência se for comprador
      const updated = list.find(o => o.tx_id === confirmTx.tx_id);
      setConfirmTx(null);
      if (updated && updated.i_am_buyer && updated.status === "settled" && !updated.i_rated) {
        setStars(5); setComment("");
        setTimeout(() => setRatingTx(updated), 300);
      }
    } catch (e: any) {
      Alert.alert("Erro", e.message || "Falha ao confirmar.");
    } finally {
      setSubmitting(false);
    }
  };

  const submitRating = async () => {
    if (!member || !ratingTx) return;
    setSubmitting(true);
    try {
      await api.blxCreateRating({
        tx_id: ratingTx.tx_id,
        rater_id: member.member_id,
        rating: stars,
        comment: comment.trim() || undefined,
      });
      setOrders(prev => prev.map(o => o.tx_id === ratingTx.tx_id ? { ...o, i_rated: true } : o));
      setRatingTx(null);
      Alert.alert("Obrigado!", "Sua avaliação foi enviada.");
    } catch (e: any) {
      Alert.alert("Erro", e.message || "Falha ao enviar avaliação.");
    } finally {
      setSubmitting(false);
    }
  };

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
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} testID="orders-back">
            <Ionicons name="chevron-back" size={22} color="#FFF" />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={styles.title}>MINHAS COMPRAS</Text>
            <Text style={styles.sub}>{orders.length} {orders.length === 1 ? "pedido" : "pedidos"}</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, tab === "buyer" && styles.tabActive]}
            onPress={() => { setTab("buyer"); setLoading(true); setTimeout(load, 0); }}
            testID="orders-tab-buyer"
          >
            <Ionicons name="bag-handle" size={14} color={tab === "buyer" ? "#0A0A0A" : "#AAA"} />
            <Text style={[styles.tabText, tab === "buyer" && styles.tabTextActive]}>COMPRAS</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, tab === "seller" && styles.tabActive]}
            onPress={() => { setTab("seller"); setLoading(true); setTimeout(load, 0); }}
            testID="orders-tab-seller"
          >
            <Ionicons name="cash" size={14} color={tab === "seller" ? "#0A0A0A" : "#AAA"} />
            <Text style={[styles.tabText, tab === "seller" && styles.tabTextActive]}>VENDAS</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          refreshControl={
            <RefreshControl tintColor="#C5D1DA" refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />
          }
          contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
        >
          {orders.length === 0 && (
            <View style={styles.emptyBox}>
              <Ionicons name="receipt-outline" size={40} color="#2E2E2E" />
              <Text style={styles.emptyText}>
                {tab === "buyer" ? "Você ainda não fez compras no Marketplace." : "Você ainda não vendeu nada no Marketplace."}
              </Text>
              <TouchableOpacity style={styles.emptyBtn} onPress={() => router.push("/(tabs)/catalog" as any)}>
                <Text style={styles.emptyBtnTxt}>IR AO MARKETPLACE</Text>
              </TouchableOpacity>
            </View>
          )}

          {orders.map((o) => <OrderRow key={o.tx_id} order={o} onConfirm={setConfirmTx} onRate={setRatingTx} onChat={(id) => router.push(`/community/dm/${id}` as any)} onOpen={(oid) => router.push(`/order/${oid}` as any)} />)}
        </ScrollView>
      </SafeAreaView>

      {/* MODAL CONFIRMAR RECEBIMENTO */}
      <Modal visible={!!confirmTx} transparent animationType="slide" onRequestClose={() => !submitting && setConfirmTx(null)}>
        <View style={styles.modalBackdrop}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => !submitting && setConfirmTx(null)} />
          <View style={styles.modalCard}>
            <Ionicons name="checkmark-circle" size={48} color="#4EE07F" style={{ alignSelf: "center" }} />
            <Text style={styles.modalTitle}>Confirmar recebimento</Text>
            <Text style={styles.modalDesc}>
              Ao confirmar, os <Text style={{ color: "#FFF", fontWeight: "900" }}>{confirmTx ? formatBLX(confirmTx.amount_centavos) : ""} BLX</Text> sairão do escrow e irão para a carteira de{" "}
              <Text style={{ color: "#FFF", fontWeight: "900" }}>{confirmTx?.counterpart?.name || "vendedor"}</Text>.
              {"\n\n"}Esta ação é definitiva.
            </Text>
            <TouchableOpacity
              style={[styles.primaryBtn, submitting && { opacity: 0.7 }]}
              disabled={submitting}
              onPress={doConfirm}
              testID="orders-confirm-receive"
            >
              {submitting ? <ActivityIndicator color="#0A0A0A" /> : (
                <>
                  <Ionicons name="checkmark-done" size={18} color="#0A0A0A" />
                  <Text style={styles.primaryBtnTxt}>CONFIRMAR RECEBIMENTO</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.ghostBtn} onPress={() => setConfirmTx(null)} disabled={submitting}>
              <Text style={styles.ghostBtnTxt}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL AVALIAR VENDEDOR */}
      <Modal visible={!!ratingTx} transparent animationType="slide" onRequestClose={() => !submitting && setRatingTx(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <View style={styles.modalBackdrop}>
            <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => !submitting && setRatingTx(null)} />
            <View style={styles.modalCard}>
              <Text style={[styles.modalKicker, { alignSelf: "center" }]}>AVALIAR VENDEDOR</Text>
              <Text style={[styles.modalTitle, { fontSize: 17 }]}>{ratingTx?.counterpart?.name || "Vendedor"}</Text>
              <Text style={[styles.modalDesc, { marginBottom: 18 }]}>
                {ratingTx?.ad_title}
              </Text>
              <View style={styles.starsRow}>
                {[1,2,3,4,5].map(n => (
                  <TouchableOpacity key={n} onPress={() => setStars(n)} hitSlop={8} testID={`rate-star-${n}`}>
                    <Ionicons name={n <= stars ? "star" : "star-outline"} size={34} color={n <= stars ? "#F5C150" : "#3A3A3A"} />
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                style={styles.commentInput}
                value={comment}
                onChangeText={setComment}
                placeholder="Escreva um comentário (opcional)"
                placeholderTextColor="#6B6B6B"
                maxLength={500}
                multiline
              />
              <TouchableOpacity
                style={[styles.primaryBtn, submitting && { opacity: 0.7 }]}
                disabled={submitting}
                onPress={submitRating}
                testID="orders-rating-submit"
              >
                {submitting ? <ActivityIndicator color="#0A0A0A" /> : (
                  <>
                    <Ionicons name="star" size={18} color="#0A0A0A" />
                    <Text style={styles.primaryBtnTxt}>ENVIAR AVALIAÇÃO</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={styles.ghostBtn} onPress={() => setRatingTx(null)} disabled={submitting}>
                <Text style={styles.ghostBtnTxt}>Avaliar depois</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function OrderRow({ order, onConfirm, onRate, onChat, onOpen }: {
  order: BlxOrder;
  onConfirm: (o: BlxOrder) => void;
  onRate: (o: BlxOrder) => void;
  onChat: (cpId: string) => void;
  onOpen: (orderId: string) => void;
}) {
  const tier = TIERS[order.counterpart?.tier || "black"];
  const isBuyer = order.i_am_buyer;
  let statusColor = "#F5C150";
  let statusLabel = "AGUARDANDO ENTREGA";
  let statusIcon: any = "lock-closed";
  if (order.status === "settled") { statusColor = "#4EE07F"; statusLabel = "LIBERADO"; statusIcon = "checkmark-done"; }
  else if (order.status === "refunded") { statusColor = "#AAA"; statusLabel = "REEMBOLSADO"; statusIcon = "return-up-back"; }
  else if (order.status === "delivered_settled") { statusColor = "#4EE07F"; statusLabel = "ENTREGUE"; statusIcon = "checkmark-circle"; }
  else if (order.status === "awaiting_delivery_payment") { statusColor = "#F5C150"; statusLabel = "AGUARDANDO ENTREGA"; statusIcon = "cube-outline"; }
  else if (order.status === "cancelled") { statusColor = "#AAA"; statusLabel = "CANCELADO"; statusIcon = "close-circle"; }
  const date = new Date(order.created_at);
  return (
    <TouchableOpacity
      style={styles.orderCard}
      onPress={() => onOpen(order.order_id)}
      activeOpacity={0.85}
      testID={`order-row-${order.order_id}`}
    >
      <View style={styles.orderTop}>
        <View style={styles.orderImgBox}>
          {order.ad_image ? (
            <Image source={{ uri: order.ad_image }} style={styles.orderImg} />
          ) : (
            <View style={[styles.orderImg, { alignItems: "center", justifyContent: "center" }]}>
              <Ionicons name="cube-outline" size={26} color="#3A3A3A" />
            </View>
          )}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.orderTitle} numberOfLines={2}>{order.ad_title || "Anúncio"}</Text>
          <Text style={styles.orderMeta}>
            {date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}
          </Text>
          <View style={[styles.statusPill, { borderColor: statusColor }]}>
            <Ionicons name={statusIcon} size={9} color={statusColor} />
            <Text style={[styles.statusPillTxt, { color: statusColor }]}>{statusLabel}</Text>
          </View>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={[styles.amountVal, { color: isBuyer ? "#F87171" : "#4EE07F" }]}>
            {isBuyer ? "−" : "+"}{formatBLX(order.amount_centavos)}
          </Text>
          <Text style={styles.amountUnit}>BLX</Text>
        </View>
      </View>

      {order.counterpart && (
        <TouchableOpacity
          style={styles.cpRow}
          onPress={() => order.counterpart && onChat(order.counterpart.member_id)}
          activeOpacity={0.8}
        >
          <View style={[styles.cpAvatar, { borderColor: tier.color }]}>
            {order.counterpart.avatar_base64 ? (
              <Image source={{ uri: order.counterpart.avatar_base64 }} style={{ width: "100%", height: "100%" }} />
            ) : (
              <Text style={{ color: "#FFF", fontWeight: "900" }}>{(order.counterpart.name || "?").charAt(0).toUpperCase()}</Text>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cpName}>{isBuyer ? "Vendedor" : "Comprador"}: {order.counterpart.name}</Text>
            <Text style={[styles.cpTier, { color: tier.color }]}>{tier.label.toUpperCase()}</Text>
          </View>
          <Ionicons name="chatbubble" size={16} color="#666" />
        </TouchableOpacity>
      )}

      {/* Ações */}
      {isBuyer && order.status === "escrow" && (
        <TouchableOpacity style={styles.actionPrimary} onPress={() => onConfirm(order)} testID={`confirm-${order.tx_id}`}>
          <Ionicons name="checkmark-done" size={16} color="#0A0A0A" />
          <Text style={styles.actionPrimaryTxt}>CONFIRMAR RECEBIMENTO</Text>
        </TouchableOpacity>
      )}
      {isBuyer && order.status === "settled" && !order.i_rated && (
        <TouchableOpacity style={styles.actionSecondary} onPress={() => onRate(order)} testID={`rate-${order.tx_id}`}>
          <Ionicons name="star" size={16} color="#F5C150" />
          <Text style={styles.actionSecondaryTxt}>AVALIAR VENDEDOR</Text>
        </TouchableOpacity>
      )}
      {isBuyer && order.status === "settled" && order.i_rated && (
        <View style={styles.doneBadge}>
          <Ionicons name="checkmark-circle" size={14} color="#4EE07F" />
          <Text style={styles.doneBadgeTxt}>PEDIDO FINALIZADO E AVALIADO</Text>
        </View>
      )}
      {!isBuyer && order.status === "escrow" && (
        <View style={styles.infoBox}>
          <Ionicons name="hourglass" size={13} color="#F5C150" />
          <Text style={styles.infoBoxTxt}>Aguardando comprador confirmar recebimento. Entre em contato para acertar a entrega.</Text>
        </View>
      )}
      {!isBuyer && order.status === "settled" && (
        <View style={styles.doneBadge}>
          <Ionicons name="checkmark-circle" size={14} color="#4EE07F" />
          <Text style={styles.doneBadgeTxt}>PAGAMENTO LIBERADO</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#141414" },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { color: "#FFF", fontSize: 13, fontWeight: "900", letterSpacing: 2 },
  sub: { color: "#8A8A8A", fontSize: 10, fontWeight: "700", letterSpacing: 1.5, marginTop: 2 },

  tabs: { flexDirection: "row", paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  tab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: "#0E0E0E", borderWidth: 1, borderColor: "#1A1A1A" },
  tabActive: { backgroundColor: "#C5D1DA", borderColor: "#C5D1DA" },
  tabText: { color: "#AAA", fontSize: 10.5, fontWeight: "900", letterSpacing: 1.5 },
  tabTextActive: { color: "#0A0A0A" },

  emptyBox: { alignItems: "center", paddingVertical: 60, gap: 12 },
  emptyText: { color: "#8A8A8A", fontSize: 13, textAlign: "center", paddingHorizontal: 30, lineHeight: 19 },
  emptyBtn: { marginTop: 10, paddingHorizontal: 18, paddingVertical: 11, borderRadius: 10, backgroundColor: "#1A1A1A", borderWidth: 1, borderColor: "#2A2A2A" },
  emptyBtnTxt: { color: "#FFF", fontSize: 11, fontWeight: "900", letterSpacing: 1.5 },

  orderCard: { padding: 12, backgroundColor: "#0E0E0E", borderRadius: 12, borderWidth: 1, borderColor: "#1A1A1A", marginBottom: 10 },
  orderTop: { flexDirection: "row", gap: 12 },
  orderImgBox: { width: 64, height: 64, borderRadius: 10, backgroundColor: "#141414", overflow: "hidden", borderWidth: 1, borderColor: "#1F1F1F" },
  orderImg: { width: 64, height: 64 },
  orderTitle: { color: "#FFF", fontSize: 13, fontWeight: "800" },
  orderMeta: { color: "#888", fontSize: 11, marginTop: 3 },
  statusPill: { flexDirection: "row", alignSelf: "flex-start", alignItems: "center", gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 12, borderWidth: 1, marginTop: 6 },
  statusPillTxt: { fontSize: 8.5, fontWeight: "900", letterSpacing: 1.2 },
  amountVal: { fontSize: 15, fontWeight: "900" },
  amountUnit: { color: "#C5D1DA", fontSize: 10, fontWeight: "900", letterSpacing: 1.2, marginTop: 2 },

  cpRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#1A1A1A" },
  cpAvatar: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, backgroundColor: "#1A1A1A", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  cpName: { color: "#EEE", fontSize: 12, fontWeight: "700" },
  cpTier: { fontSize: 9, fontWeight: "900", letterSpacing: 1.2, marginTop: 2 },

  actionPrimary: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 12, paddingVertical: 12, borderRadius: 10, backgroundColor: "#4EE07F" },
  actionPrimaryTxt: { color: "#0A0A0A", fontSize: 11.5, fontWeight: "900", letterSpacing: 1.3 },
  actionSecondary: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 12, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: "rgba(245,193,80,0.35)", backgroundColor: "rgba(245,193,80,0.08)" },
  actionSecondaryTxt: { color: "#F5C150", fontSize: 11.5, fontWeight: "900", letterSpacing: 1.3 },
  doneBadge: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: "rgba(78,224,127,0.08)", borderWidth: 1, borderColor: "rgba(78,224,127,0.25)" },
  doneBadgeTxt: { color: "#4EE07F", fontSize: 10.5, fontWeight: "900", letterSpacing: 1.3 },
  infoBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 12, padding: 10, borderRadius: 10, backgroundColor: "rgba(245,193,80,0.07)", borderWidth: 1, borderColor: "rgba(245,193,80,0.22)" },
  infoBoxTxt: { flex: 1, color: "#E8C77A", fontSize: 11, lineHeight: 15 },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: "#0E0E0E", padding: 20, paddingBottom: 40, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderWidth: 1, borderColor: "#1F1F1F" },
  modalKicker: { color: "#8A8A8A", fontSize: 10, fontWeight: "900", letterSpacing: 2.5, marginBottom: 6 },
  modalTitle: { color: "#FFF", fontSize: 18, fontWeight: "900", letterSpacing: 1, textAlign: "center", marginTop: 10 },
  modalDesc: { color: "#AAA", fontSize: 13, lineHeight: 18, textAlign: "center", marginTop: 10 },
  starsRow: { flexDirection: "row", gap: 10, justifyContent: "center", marginBottom: 16 },
  commentInput: { backgroundColor: "#1A1A1A", borderRadius: 10, padding: 14, color: "#FFF", fontSize: 13.5, minHeight: 80, textAlignVertical: "top" },
  primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 14, borderRadius: 12, backgroundColor: "#C5D1DA", marginTop: 16 },
  primaryBtnTxt: { color: "#0A0A0A", fontSize: 12.5, fontWeight: "900", letterSpacing: 1.5 },
  ghostBtn: { paddingVertical: 12, alignItems: "center", marginTop: 4 },
  ghostBtnTxt: { color: "#888", fontSize: 11.5, fontWeight: "700" },
});

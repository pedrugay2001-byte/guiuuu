import { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image,
  ActivityIndicator, Alert, RefreshControl,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { api, MyOrder } from "../../src/api";
import { useGate } from "../../src/gate";
import { formatBLX } from "../../src/blx";

const STATUS_META: Record<string, { label: string; color: string; icon: any }> = {
  awaiting_delivery_payment: { label: "AGUARDANDO ENTREGA", color: "#F5C150", icon: "cube-outline" },
  in_escrow: { label: "AGUARDANDO LIBERAÇÃO", color: "#F5C150", icon: "lock-closed" },
  awaiting_delivery: { label: "AGUARDANDO ENTREGA", color: "#F5C150", icon: "cube-outline" },
  delivered_settled: { label: "ENTREGUE", color: "#4EE07F", icon: "checkmark-circle" },
  settled: { label: "LIBERADO", color: "#4EE07F", icon: "checkmark-done" },
  cancelled: { label: "CANCELADO", color: "#AAA", icon: "close-circle" },
  refunded: { label: "REEMBOLSADO", color: "#AAA", icon: "return-up-back" },
};

/**
 * Detalhe completo de um pedido — pagamento parcial, timeline, vendedor/comprador,
 * ações contextuais (marcar entregue, cancelar).
 */
export default function OrderDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { member } = useGate();
  const [data, setData] = useState<Awaited<ReturnType<typeof api.orderDetail>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    if (!id || !member) return;
    try {
      const d = await api.orderDetail(id, member.member_id);
      setData(d);
    } catch (e: any) {
      Alert.alert("Erro", e?.message || "Não foi possível carregar o pedido");
      router.back();
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id, member]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const markDelivered = async () => {
    if (!id || !member) return;
    Alert.alert(
      "Confirmar entrega?",
      "O saldo devedor travado do comprador será liberado automaticamente para você.",
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Confirmar", onPress: async () => {
            setActing(true);
            try { await api.orderDeliver(id, member.member_id); await load(); Alert.alert("Entrega confirmada!", "Saldo liberado."); }
            catch (e: any) { Alert.alert("Erro", e?.message); }
            finally { setActing(false); }
          },
        },
      ],
    );
  };

  const cancel = async () => {
    if (!id || !member) return;
    Alert.alert(
      "Cancelar pedido?",
      "Todo valor travado e pago será devolvido ao comprador.",
      [
        { text: "Voltar", style: "cancel" },
        { text: "Cancelar pedido", style: "destructive", onPress: async () => {
            setActing(true);
            try { await api.orderCancel(id, member.member_id, "Cancelado pelo usuário"); await load(); }
            catch (e: any) { Alert.alert("Erro", e?.message); }
            finally { setActing(false); }
          },
        },
      ],
    );
  };

  if (loading || !data) {
    return (
      <View style={{ flex: 1, backgroundColor: "#050505", justifyContent: "center" }}>
        <Stack.Screen options={{ title: "Pedido", headerStyle: { backgroundColor: "#050505" }, headerTintColor: "#FFF" }} />
        <ActivityIndicator color="#D4AF37" />
      </View>
    );
  }

  const o: MyOrder = data.order;
  const status = STATUS_META[o.status] || { label: o.status.toUpperCase(), color: "#AAA", icon: "ellipse" };
  const total = o.total_cents || 0;
  const entry = o.entry_cents ?? o.total_cents ?? 0;
  const remaining = o.remaining_cents ?? 0;
  const canDeliver = data.i_am_seller && (o.status === "awaiting_delivery_payment" || o.status === "in_escrow" || o.status === "awaiting_delivery");
  const canCancel = (data.i_am_buyer || data.i_am_seller) && o.status !== "delivered_settled" && o.status !== "settled" && o.status !== "cancelled" && o.status !== "refunded";

  return (
    <View style={{ flex: 1, backgroundColor: "#050505" }}>
      <Stack.Screen
        options={{
          title: "DETALHE DO PEDIDO",
          headerStyle: { backgroundColor: "#050505" },
          headerTintColor: "#FFF",
          headerTitleStyle: { fontWeight: "900", letterSpacing: 1, fontSize: 13 },
        }}
      />
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#D4AF37" />}
      >
        {/* STATUS HERO */}
        <View style={s.heroWrap}>
          <LinearGradient
            colors={[status.color + "22", "#0A0A0A", "#050505"]}
            style={s.hero}
          >
            <View style={[s.statusPill, { backgroundColor: status.color + "1F", borderColor: status.color + "66" }]}>
              <Ionicons name={status.icon} size={12} color={status.color} />
              <Text style={[s.statusTxt, { color: status.color }]}>{status.label}</Text>
            </View>
            {o.image ? (
              <Image source={{ uri: o.image }} style={s.productImg} />
            ) : (
              <View style={[s.productImg, { backgroundColor: "#111", alignItems: "center", justifyContent: "center" }]}>
                <MaterialCommunityIcons name="package-variant" size={48} color="#444" />
              </View>
            )}
            <Text style={s.productName} numberOfLines={2}>{o.product_name || "Pedido"}</Text>
            <Text style={s.productQty}>Quantidade: {o.quantity}</Text>
          </LinearGradient>
        </View>

        {/* VALORES / PAGAMENTO PARCIAL */}
        <View style={s.card}>
          <Text style={s.cardTitle}>PAGAMENTO</Text>
          <View style={s.row}>
            <Text style={s.rowLbl}>Total do pedido</Text>
            <Text style={s.rowVal}>{formatBLX(total)} BLX</Text>
          </View>
          <View style={s.row}>
            <Text style={s.rowLbl}>
              Pago agora
              {o.pay_option && <Text style={s.hint}>  ({o.pay_option === "full" ? "100%" : o.pay_option === "half" ? "50%" : "10%"})</Text>}
            </Text>
            <Text style={[s.rowVal, { color: "#4EE07F" }]}>{formatBLX(entry)} BLX</Text>
          </View>
          {remaining > 0 && (
            <View style={s.row}>
              <Text style={s.rowLbl}>
                <Ionicons name="lock-closed" size={10} color="#F5C150" /> Saldo travado
              </Text>
              <Text style={[s.rowVal, { color: "#F5C150" }]}>{formatBLX(remaining)} BLX</Text>
            </View>
          )}
          {remaining > 0 && (
            <Text style={s.devNote}>
              O saldo devedor está travado na carteira do comprador e será liberado
              automaticamente ao confirmar a entrega.
            </Text>
          )}
        </View>

        {/* CONTRAPARTE */}
        <View style={s.card}>
          <Text style={s.cardTitle}>
            {data.i_am_buyer ? "VENDEDOR" : data.i_am_seller ? "COMPRADOR" : "PARTES"}
          </Text>
          {data.i_am_buyer && (
            <Party
              name={o.seller_name || "Vendedor"}
              tier={o.seller_tier}
              avatar={o.seller_avatar || null}
            />
          )}
          {data.i_am_seller && (
            <Party
              name={o.buyer_name || "Comprador"}
              tier={o.buyer_tier}
              avatar={o.buyer_avatar || null}
            />
          )}
        </View>

        {/* TIMELINE */}
        <View style={s.card}>
          <Text style={s.cardTitle}>HISTÓRICO DO PEDIDO</Text>
          {data.timeline.map((t, i) => (
            <View key={i} style={s.tlRow}>
              <View style={[s.tlDot, { backgroundColor: t.event === "cancelled" ? "#AAA" : t.event === "delivered" ? "#4EE07F" : "#D4AF37" }]} />
              <View style={{ flex: 1 }}>
                <Text style={s.tlLbl}>{t.label}</Text>
                <Text style={s.tlDate}>
                  {t.at ? new Date(t.at).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* META */}
        <View style={s.card}>
          <Text style={s.cardTitle}>REFERÊNCIA</Text>
          <View style={s.row}><Text style={s.rowLbl}>Pedido</Text><Text style={s.mono}>{o.order_id}</Text></View>
          {!!o.tx_id && <View style={s.row}><Text style={s.rowLbl}>Transação</Text><Text style={s.mono}>{o.tx_id}</Text></View>}
          {!!o.channel && <View style={s.row}><Text style={s.rowLbl}>Canal</Text><Text style={s.rowVal}>{channelLabel(o.channel)}</Text></View>}
        </View>

        {/* AÇÕES */}
        {(canDeliver || canCancel) && (
          <View style={{ paddingHorizontal: 14, gap: 10, marginTop: 6 }}>
            {canDeliver && (
              <TouchableOpacity
                style={s.primary}
                onPress={markDelivered}
                disabled={acting}
                activeOpacity={0.88}
                testID="order-deliver-btn"
              >
                <LinearGradient
                  colors={["#F4D47A", "#D4AF37", "#8C6F1E"]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={s.primaryInner}
                >
                  {acting ? <ActivityIndicator color="#000" /> : (
                    <>
                      <Ionicons name="checkmark-circle" size={16} color="#0A0A0A" />
                      <Text style={s.primaryTxt}>CONFIRMAR ENTREGA</Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            )}
            {canCancel && (
              <TouchableOpacity
                style={s.danger}
                onPress={cancel}
                disabled={acting}
                activeOpacity={0.85}
                testID="order-cancel-btn"
              >
                <Ionicons name="close-circle-outline" size={14} color="#FF8A8A" />
                <Text style={s.dangerTxt}>CANCELAR PEDIDO</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function channelLabel(ch: string): string {
  const map: Record<string, string> = {
    catalog_blx: "Catálogo · BLX direto",
    ad_direct: "Círculo Diamante · Direto",
    cart_catalog: "Catálogo · Carrinho",
    cart_diamond: "Círculo Diamante · Carrinho",
  };
  return map[ch] || ch;
}

function Party({ name, tier, avatar }: { name: string; tier?: string; avatar: string | null }) {
  const tierColor: Record<string, string> = {
    black: "#666", silver: "#B8B8B8", gold: "#D4AF37", diamond: "#C5D1DA",
  };
  const col = tier ? (tierColor[tier] || "#D4AF37") : "#D4AF37";
  return (
    <View style={s.partyRow}>
      {avatar ? (
        <Image source={{ uri: avatar }} style={s.partyAvatar} />
      ) : (
        <View style={[s.partyAvatar, { backgroundColor: "#1A1A1A", alignItems: "center", justifyContent: "center" }]}>
          <Ionicons name="person" size={18} color="#555" />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={s.partyName} numberOfLines={1}>{name}</Text>
        {tier && (
          <View style={[s.tierBadge, { borderColor: col + "55", backgroundColor: col + "14" }]}>
            <Text style={[s.tierTxt, { color: col }]}>MEMBRO {tier.toUpperCase()}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  heroWrap: { marginTop: 8, marginHorizontal: 14, marginBottom: 14, borderRadius: 16, overflow: "hidden" },
  hero: {
    alignItems: "center", padding: 22,
    borderWidth: 1, borderColor: "#1A1A1A",
  },
  statusPill: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 14, borderWidth: 1,
    marginBottom: 16,
  },
  statusTxt: { fontSize: 10, fontWeight: "900", letterSpacing: 1.5 },
  productImg: { width: 110, height: 110, borderRadius: 14, marginBottom: 14 },
  productName: { color: "#FFF", fontSize: 16, fontWeight: "900", textAlign: "center", letterSpacing: -0.3 },
  productQty: { color: "#888", fontSize: 11, fontWeight: "700", marginTop: 4 },

  card: {
    marginHorizontal: 14, marginBottom: 12, padding: 14,
    backgroundColor: "#0B0B0B", borderRadius: 12,
    borderWidth: 1, borderColor: "#171717",
  },
  cardTitle: { color: "#FFF", fontSize: 11, fontWeight: "900", letterSpacing: 1.5, marginBottom: 10 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 5 },
  rowLbl: { color: "#999", fontSize: 12, fontWeight: "700" },
  rowVal: { color: "#FFF", fontSize: 13, fontWeight: "800" },
  hint: { color: "#666", fontSize: 11 },
  devNote: { color: "#888", fontSize: 10.5, marginTop: 8, fontStyle: "italic", lineHeight: 14 },
  mono: { color: "#D4AF37", fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },

  partyRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  partyAvatar: { width: 48, height: 48, borderRadius: 24 },
  partyName: { color: "#FFF", fontSize: 13, fontWeight: "800" },
  tierBadge: {
    alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 10, borderWidth: 1, marginTop: 4,
  },
  tierTxt: { fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },

  // Timeline
  tlRow: { flexDirection: "row", gap: 10, paddingVertical: 7, alignItems: "flex-start" },
  tlDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  tlLbl: { color: "#DDD", fontSize: 12, fontWeight: "700" },
  tlDate: { color: "#888", fontSize: 10, marginTop: 2 },

  // Actions
  primary: { borderRadius: 12, overflow: "hidden" },
  primaryInner: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 14,
  },
  primaryTxt: { color: "#0A0A0A", fontSize: 11.5, fontWeight: "900", letterSpacing: 1.5 },
  danger: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 12, borderRadius: 12,
    backgroundColor: "rgba(255,107,107,0.08)",
    borderWidth: 1, borderColor: "rgba(255,107,107,0.3)",
  },
  dangerTxt: { color: "#FF8A8A", fontSize: 11, fontWeight: "900", letterSpacing: 1.5 },
});

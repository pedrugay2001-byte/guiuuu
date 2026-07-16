import { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image,
  ActivityIndicator, Alert, RefreshControl, Modal,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialCommunityIcons } from "../src/icons";
import { api, CartResponse, PyxWallet, ApiError } from "../src/api";
import { useGate } from "../src/gate";
import { formatPYX } from "../src/pyx";
import { TIERS } from "../src/theme";
import InsufficientBalanceModal from "../src/components/InsufficientBalanceModal";

const GOLD_LIGHT = "#F4D47A";
const GOLD = "#D4AF37";
const GOLD_DARK = "#8C6F1E";

type PayOption = "full" | "half" | "entry";
const PAY_META: Record<PayOption, { label: string; entry_pct: number; disc_pct: number }> = {
  full:  { label: "100% ANTECIPADO",      entry_pct: 100, disc_pct: 30 },
  half:  { label: "50% ENTRADA",          entry_pct: 50,  disc_pct: 15 },
  entry: { label: "10% ENTRADA · SINAL",  entry_pct: 10,  disc_pct: 0 },
};

/**
 * Carrinho unificado — suporta itens do Catálogo (pagamento direto) e do Círculo Diamante (escrow).
 * Um único checkout "COMPRAR TUDO" processa tudo debitando PYX de uma vez.
 */
export default function Cart() {
  const router = useRouter();
  const { member, refreshMember } = useGate();
  const [cart, setCart] = useState<CartResponse | null>(null);
  const [wallet, setWallet] = useState<PyxWallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [buying, setBuying] = useState(false);
  const [payOption, setPayOption] = useState<PayOption>("full");
  const [insuf, setInsuf] = useState<{ required: number; current: number; missing: number } | null>(null);

  const load = useCallback(async () => {
    if (!member) return;
    try {
      const [c, w] = await Promise.all([
        api.cartList(member.member_id),
        api.pyxWallet(member.member_id).catch(() => null),
      ]);
      setCart(c);
      setWallet(w);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [member]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const updateQty = async (ad_id: string, newQty: number) => {
    if (!member) return;
    setUpdating(ad_id);
    try {
      if (newQty <= 0) {
        await api.cartRemove(member.member_id, ad_id);
      } else {
        await api.cartUpdate(member.member_id, ad_id, newQty);
      }
      await load();
    } finally {
      setUpdating(null);
    }
  };

  const handleCheckout = async () => {
    if (!member) return;
    setBuying(true);
    try {
      const r = await api.cartCheckoutPYX(member.member_id, payOption);
      setShowConfirm(false);
      Alert.alert(
        "Compra concluída!",
        `${r.orders.length} pedido(s) processado(s). ${(r.entry_cents / 100).toFixed(2)} PYX debitados.` +
          (r.remaining_cents > 0
            ? `\n\nSaldo de ${(r.remaining_cents / 100).toFixed(2)} PYX foi TRAVADO na sua carteira e será liberado automaticamente ao confirmar a entrega.`
            : ""),
        [{ text: "Ver meus pedidos", onPress: () => router.push("/pyx/orders" as any) }, { text: "OK" }],
      );
      await refreshMember();
      await load();
    } catch (e: any) {
      setShowConfirm(false);
      if (e instanceof ApiError && e.error_code === "INSUFFICIENT_PYX") {
        setInsuf({
          required: e.data.required_centavos || 0,
          current: e.data.current_centavos || 0,
          missing: e.data.missing_centavos || 0,
        });
      } else {
        Alert.alert("Não foi possível concluir", e?.message || "Tente novamente.");
      }
    } finally {
      setBuying(false);
    }
  };

  if (loading) {
    return <View style={{ flex: 1, backgroundColor: "#050505", justifyContent: "center" }}><ActivityIndicator color={GOLD} /></View>;
  }

  const hasItems = !!cart && cart.items.length > 0;
  const totalGrossCents = cart?.total_centavos || 0;
  const balanceCents = wallet?.balance_centavos || 0;
  const reservedCents = wallet?.reserved_centavos || 0;
  // Estimativa do total final (depois do desconto do pay_option, sem tier)
  const payMeta = PAY_META[payOption];
  const estFinalCents = Math.round(totalGrossCents * (100 - payMeta.disc_pct) / 100);
  const estEntryCents = Math.round(estFinalCents * payMeta.entry_pct / 100);
  const estRemainingCents = estFinalCents - estEntryCents;
  const canAfford = balanceCents >= estFinalCents;
  const missingCents = canAfford ? 0 : estFinalCents - balanceCents;

  return (
    <View style={{ flex: 1, backgroundColor: "#050505" }}>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        {/* Top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} testID="cart-back">
            <Ionicons name="chevron-back" size={22} color="#FFF" />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={styles.title}>CARRINHO</Text>
            <Text style={styles.sub}>{cart?.count || 0} {cart?.count === 1 ? "item" : "itens"}</Text>
          </View>
          {hasItems && cart ? (
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => Alert.alert("Esvaziar carrinho?", "Todos os itens serão removidos.", [
                { text: "Cancelar" },
                { text: "Esvaziar", style: "destructive", onPress: async () => { if (member) { await api.cartClear(member.member_id); load(); } } },
              ])}
              testID="cart-clear"
            >
              <Ionicons name="trash-outline" size={20} color="#AAA" />
            </TouchableOpacity>
          ) : <View style={{ width: 40 }} />}
        </View>

        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} tintColor="#FFF" onRefresh={() => { setRefreshing(true); load(); }} />}
          contentContainerStyle={{ padding: 14, paddingBottom: hasItems ? 130 : 30 }}
        >
          {!hasItems && (
            <View style={styles.emptyBox}>
              <Ionicons name="bag-outline" size={48} color="#2E2E2E" />
              <Text style={styles.emptyTitle}>Seu carrinho está vazio</Text>
              <Text style={styles.emptyText}>Explore os nichos e adicione produtos aqui.</Text>
              <TouchableOpacity
                style={styles.emptyBtn}
                onPress={() => router.push(`/catalog/niches?tier=${(member?.tier || "silver").toLowerCase()}` as any)}
                testID="cart-go-niches"
              >
                <Text style={styles.emptyBtnTxt}>ESCOLHER NICHO</Text>
              </TouchableOpacity>
            </View>
          )}

          {cart?.groups.map((g) => {
            // Catálogo = tier "official" (cor dourada), ads = tier do vendedor (cor do tier)
            const isCatalog = g.seller_tier === "official" || g.seller_id === "catalog";
            const tier = isCatalog ? null : TIERS[g.seller_tier] || TIERS.black;
            const accent = isCatalog ? GOLD : (tier?.color || "#FFF");
            return (
              <View key={g.seller_id || "_"} style={styles.groupCard}>
                <View style={styles.sellerRow}>
                  {isCatalog ? (
                    <View style={[styles.sellerAv, { borderColor: GOLD, backgroundColor: "rgba(212,175,55,0.1)" }]}>
                      <Ionicons name="ribbon" size={14} color={GOLD} />
                    </View>
                  ) : (
                    <TouchableOpacity
                      onPress={() => g.seller_id && router.push(`/community/member/${g.seller_id}` as any)}
                      style={[styles.sellerAv, { borderColor: accent }]}
                    >
                      {g.seller_avatar ? <Image source={{ uri: g.seller_avatar }} style={{ width: 30, height: 30, borderRadius: 15 }} /> : <Text style={{ color: "#FFF", fontWeight: "900" }}>{(g.seller_name || "?").charAt(0)}</Text>}
                    </TouchableOpacity>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sellerName} numberOfLines={1}>{g.seller_name || "Vendedor"}</Text>
                    <Text style={[styles.sellerTier, { color: accent }]}>
                      {isCatalog ? "CATÁLOGO OFICIAL" : (tier?.label || "MEMBRO").toUpperCase()}
                    </Text>
                  </View>
                </View>

                {g.items.map((item) => (
                  <View key={item.ad_id} style={styles.itemRow}>
                    <TouchableOpacity
                      onPress={() => isCatalog
                        ? router.push(`/product/${item.ad_id}` as any)
                        : router.push(`/ads/${item.ad_id}` as any)}
                    >
                      {item.image ? (
                        <Image source={{ uri: item.image }} style={styles.itemImg} />
                      ) : (
                        <View style={[styles.itemImg, { alignItems: "center", justifyContent: "center" }]}>
                          <Ionicons name="cube-outline" size={22} color="#333" />
                        </View>
                      )}
                    </TouchableOpacity>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.itemName} numberOfLines={2}>{item.title}</Text>
                      <Text style={[styles.itemPrice, { color: accent }]}>{formatPYX(item.price_full_centavos)} PYX</Text>
                      <View style={styles.qtyRow}>
                        <TouchableOpacity style={styles.qtyBtn} disabled={!!updating} onPress={() => updateQty(item.ad_id, item.qty - 1)}>
                          <Ionicons name="remove" size={14} color="#FFF" />
                        </TouchableOpacity>
                        <Text style={styles.qtyVal}>{item.qty}</Text>
                        <TouchableOpacity style={styles.qtyBtn} disabled={!!updating} onPress={() => updateQty(item.ad_id, item.qty + 1)}>
                          <Ionicons name="add" size={14} color="#FFF" />
                        </TouchableOpacity>
                      </View>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={styles.subtotalVal}>{formatPYX(item.subtotal_centavos)}</Text>
                      <Text style={[styles.subtotalUnit, { color: accent }]}>PYX</Text>
                      <TouchableOpacity onPress={() => updateQty(item.ad_id, 0)} style={{ marginTop: 6 }}>
                        <Ionicons name="trash-outline" size={15} color="#666" />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}

                <View style={styles.groupFooter}>
                  <Text style={styles.groupSubLbl}>SUBTOTAL</Text>
                  <Text style={[styles.groupSubVal, { color: accent }]}>{formatPYX(g.subtotal_centavos)} PYX</Text>
                </View>
              </View>
            );
          })}

          {hasItems && cart && (
            <View style={styles.infoBox}>
              <Ionicons name="lock-closed" size={15} color={GOLD} />
              <Text style={styles.infoTxt}>
                Apenas a <Text style={{ color: GOLD, fontWeight: "900" }}>entrada</Text> é debitada
                agora. O saldo devedor fica <Text style={{ color: GOLD, fontWeight: "900" }}>TRAVADO</Text>{" "}
                na sua carteira e é liberado automaticamente na entrega.
              </Text>
            </View>
          )}
        </ScrollView>

        {/* FOOTER fixo — botão de checkout único */}
        {hasItems && (
          <SafeAreaView style={styles.footer} edges={["bottom"]}>
            <View style={styles.totalRow}>
              <View>
                <Text style={styles.totalLbl}>TOTAL ({payMeta.disc_pct}% desc.)</Text>
                <Text style={[styles.totalVal, { color: canAfford ? GOLD_LIGHT : "#FF6B6B" }]}>
                  {formatPYX(estFinalCents)} PYX
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.balanceLbl}>SALDO LIVRE</Text>
                <Text style={[styles.balanceVal, { color: canAfford ? "#4EE07F" : "#FF6B6B" }]}>
                  {formatPYX(balanceCents)} PYX
                </Text>
                {reservedCents > 0 && (
                  <Text style={styles.reservedVal}>
                    <Ionicons name="lock-closed" size={9} color="#F5C150" />{" "}
                    {formatPYX(reservedCents)} PYX reservado
                  </Text>
                )}
              </View>
            </View>
            {!canAfford && (
              <Text style={styles.insufficientTxt}>
                Faltam {formatPYX(missingCents)} PYX. Fale com o suporte para recarregar.
              </Text>
            )}
            <TouchableOpacity
              style={styles.checkoutBtn}
              onPress={() => setShowConfirm(true)}
              testID="cart-checkout"
              activeOpacity={0.88}
            >
              <LinearGradient
                colors={canAfford ? [GOLD_LIGHT, GOLD, GOLD_DARK] : ["#333", "#222", "#1A1A1A"]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={styles.checkoutInner}
              >
                <MaterialCommunityIcons name="diamond-stone" size={16} color={canAfford ? "#0A0A0A" : "#666"} />
                <Text style={[styles.checkoutTxt, !canAfford && { color: "#666" }]}>
                  {canAfford
                    ? `COMPRAR TUDO · ${formatPYX(estEntryCents)} PYX AGORA`
                    : "SALDO INSUFICIENTE"}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </SafeAreaView>
        )}
      </SafeAreaView>

      {/* Modal de confirmação com seletor de forma de pagamento */}
      <Modal visible={showConfirm} transparent animationType="fade" onRequestClose={() => setShowConfirm(false)}>
        <View style={modalS.bg}>
          <ScrollView style={{ width: "100%", maxWidth: 400 }} contentContainerStyle={{ alignItems: "center", paddingVertical: 20 }}>
            <View style={modalS.card}>
              <LinearGradient
                colors={[GOLD_LIGHT, GOLD, GOLD_DARK]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={{ height: 3, marginHorizontal: -22, marginBottom: 18 }}
              />
              <Text style={modalS.kicker}>FINALIZAR COMPRA</Text>
              <Text style={modalS.title}>Escolha a forma de pagamento</Text>

              {/* Pay options */}
              <View style={{ gap: 8, marginBottom: 14 }}>
                {(Object.keys(PAY_META) as PayOption[]).map((opt) => {
                  const meta = PAY_META[opt];
                  const selected = payOption === opt;
                  return (
                    <TouchableOpacity
                      key={opt}
                      onPress={() => setPayOption(opt)}
                      style={[modalS.payOpt, selected && modalS.payOptSel]}
                      testID={`pay-opt-${opt}`}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[modalS.payOptLbl, selected && { color: GOLD_LIGHT }]}>
                          {meta.label}
                        </Text>
                        <Text style={modalS.payOptSub}>
                          {meta.disc_pct > 0
                            ? `Desconto de ${meta.disc_pct}% sobre o total`
                            : "Sem desconto · reserva do restante"}
                        </Text>
                      </View>
                      <View style={[modalS.radio, selected && modalS.radioSel]}>
                        {selected && <View style={modalS.radioInner} />}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Summary */}
              <View style={modalS.summary}>
                <View style={modalS.row}>
                  <Text style={modalS.lbl}>Subtotal ({cart?.count || 0} {cart?.count === 1 ? "item" : "itens"})</Text>
                  <Text style={modalS.val}>{formatPYX(totalGrossCents)} PYX</Text>
                </View>
                {payMeta.disc_pct > 0 && (
                  <View style={modalS.row}>
                    <Text style={[modalS.lbl, { color: "#4EE07F" }]}>Desconto ({payMeta.disc_pct}%)</Text>
                    <Text style={[modalS.val, { color: "#4EE07F" }]}>
                      -{formatPYX(totalGrossCents - estFinalCents)} PYX
                    </Text>
                  </View>
                )}
                <View style={[modalS.row, modalS.rowTop]}>
                  <Text style={[modalS.lbl, { color: GOLD, fontWeight: "900" }]}>TOTAL</Text>
                  <Text style={[modalS.val, { color: GOLD_LIGHT, fontSize: 16 }]}>
                    {formatPYX(estFinalCents)} PYX
                  </Text>
                </View>

                {/* Destaque: debitado agora vs travado */}
                <View style={modalS.splitBox}>
                  <View style={modalS.splitCol}>
                    <Text style={modalS.splitLbl}>A DEBITAR AGORA</Text>
                    <Text style={modalS.splitVal}>{formatPYX(estEntryCents)}</Text>
                    <Text style={modalS.splitUnit}>PYX · {payMeta.entry_pct}%</Text>
                  </View>
                  <View style={[modalS.splitCol, { borderLeftWidth: 1, borderLeftColor: "#1F1F1F" }]}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Ionicons name="lock-closed" size={9} color="#F5C150" />
                      <Text style={modalS.splitLbl}>TRAVADO · ENTREGA</Text>
                    </View>
                    <Text style={[modalS.splitVal, { color: "#F5C150" }]}>
                      {formatPYX(estRemainingCents)}
                    </Text>
                    <Text style={modalS.splitUnit}>PYX · {100 - payMeta.entry_pct}%</Text>
                  </View>
                </View>
              </View>

              <Text style={modalS.note}>
                O saldo devedor fica TRAVADO na sua carteira e é liberado automaticamente ao
                confirmar a entrega. Em caso de cancelamento, devolvemos tudo.
              </Text>

              <View style={modalS.actions}>
                <TouchableOpacity style={modalS.cancel} onPress={() => setShowConfirm(false)} disabled={buying}>
                  <Text style={modalS.cancelTxt}>CANCELAR</Text>
                </TouchableOpacity>
                <TouchableOpacity style={modalS.confirm} onPress={handleCheckout} disabled={buying} testID="cart-confirm-checkout">
                  <LinearGradient
                    colors={buying ? ["#555", "#333"] : [GOLD_LIGHT, GOLD, GOLD_DARK]}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    style={modalS.confirmInner}
                  >
                    {buying ? <ActivityIndicator color="#000" size="small" /> : <Text style={modalS.confirmTxt}>CONFIRMAR</Text>}
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Modal de saldo insuficiente */}
      <InsufficientBalanceModal
        visible={!!insuf}
        onClose={() => setInsuf(null)}
        requiredCents={insuf?.required || 0}
        currentCents={insuf?.current || 0}
        missingCents={insuf?.missing || 0}
        contextLabel="Carrinho"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#141414" },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { color: "#FFF", fontSize: 13, fontWeight: "900", letterSpacing: 2 },
  sub: { color: "#8A8A8A", fontSize: 10, fontWeight: "700", letterSpacing: 1.5, marginTop: 2 },

  emptyBox: { alignItems: "center", paddingVertical: 60, gap: 12 },
  emptyTitle: { color: "#FFF", fontSize: 15, fontWeight: "900" },
  emptyText: { color: "#888", fontSize: 13, textAlign: "center", paddingHorizontal: 30 },
  emptyBtn: { marginTop: 10, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10, backgroundColor: "#1A1A1A", borderWidth: 1, borderColor: "#2A2A2A" },
  emptyBtnTxt: { color: "#FFF", fontSize: 11, fontWeight: "900", letterSpacing: 1.5 },

  groupCard: { marginBottom: 12, padding: 12, backgroundColor: "#0E0E0E", borderRadius: 14, borderWidth: 1, borderColor: "#1A1A1A" },
  sellerRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: "#1A1A1A" },
  sellerAv: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, backgroundColor: "#1A1A1A", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  sellerName: { color: "#EEE", fontSize: 13, fontWeight: "800" },
  sellerTier: { fontSize: 9, fontWeight: "900", letterSpacing: 1.2, marginTop: 2 },

  itemRow: { flexDirection: "row", gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#151515" },
  itemImg: { width: 56, height: 56, borderRadius: 8, backgroundColor: "#141414" },
  itemName: { color: "#EEE", fontSize: 13, fontWeight: "700" },
  itemPrice: { fontSize: 11, marginTop: 3, fontWeight: "700" },
  qtyRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  qtyBtn: { width: 26, height: 26, borderRadius: 13, backgroundColor: "#1A1A1A", borderWidth: 1, borderColor: "#2A2A2A", alignItems: "center", justifyContent: "center" },
  qtyVal: { color: "#FFF", fontSize: 13, fontWeight: "800", minWidth: 22, textAlign: "center" },
  subtotalVal: { color: "#FFF", fontSize: 14, fontWeight: "900" },
  subtotalUnit: { fontSize: 9, fontWeight: "900", letterSpacing: 1, marginTop: 1 },

  groupFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 10 },
  groupSubLbl: { color: "#888", fontSize: 9, fontWeight: "900", letterSpacing: 1.5 },
  groupSubVal: { fontSize: 14, fontWeight: "900" },

  infoBox: { flexDirection: "row", gap: 8, marginTop: 6, padding: 12, backgroundColor: "#0A0A0A", borderRadius: 10, borderWidth: 1, borderColor: "#141414" },
  infoTxt: { flex: 1, color: "#AAA", fontSize: 11, lineHeight: 15 },

  // Footer fixo
  footer: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    paddingHorizontal: 14, paddingTop: 12, paddingBottom: 10,
    backgroundColor: "#0A0A0A",
    borderTopWidth: 1, borderTopColor: "rgba(212,175,55,0.25)",
  },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 8 },
  totalLbl: { color: "#888", fontSize: 9, fontWeight: "900", letterSpacing: 1.8 },
  totalVal: { fontSize: 22, fontWeight: "900", letterSpacing: -0.5, marginTop: 2 },
  balanceLbl: { color: "#888", fontSize: 9, fontWeight: "900", letterSpacing: 1.5 },
  balanceVal: { fontSize: 13, fontWeight: "900", marginTop: 2 },
  insufficientTxt: { color: "#FF6B6B", fontSize: 11, fontWeight: "700", textAlign: "center", marginBottom: 6 },
  reservedVal: { color: "#F5C150", fontSize: 10, fontWeight: "700", marginTop: 2 },

  checkoutBtn: { borderRadius: 12, overflow: "hidden", marginTop: 4 },
  checkoutInner: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14 },
  checkoutTxt: { color: "#0A0A0A", fontSize: 12.5, fontWeight: "900", letterSpacing: 1.5 },
});

const modalS = StyleSheet.create({
  bg: { flex: 1, backgroundColor: "rgba(0,0,0,0.85)", alignItems: "center", justifyContent: "center", padding: 22 },
  card: {
    width: "100%", maxWidth: 380,
    backgroundColor: "#0B0B0B", borderRadius: 18, padding: 22,
    borderWidth: 1, borderColor: "rgba(212,175,55,0.3)", overflow: "hidden",
  },
  kicker: { color: GOLD, fontSize: 10, fontWeight: "900", letterSpacing: 2.5 },
  title: { color: "#FFF", fontSize: 15, fontWeight: "800", marginTop: 6, marginBottom: 16, lineHeight: 20 },

  payOpt: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "#0A0A0A", borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: "#1A1A1A",
  },
  payOptSel: { borderColor: GOLD, backgroundColor: "rgba(212,175,55,0.07)" },
  payOptLbl: { color: "#DDD", fontSize: 12, fontWeight: "900", letterSpacing: 0.8 },
  payOptSub: { color: "#777", fontSize: 10.5, marginTop: 2 },
  radio: {
    width: 18, height: 18, borderRadius: 9,
    borderWidth: 1.5, borderColor: "#333",
    alignItems: "center", justifyContent: "center",
  },
  radioSel: { borderColor: GOLD },
  radioInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: GOLD },

  summary: {
    backgroundColor: "#0A0A0A", borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: "#1A1A1A", marginBottom: 10,
  },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4 },
  rowTop: { borderTopWidth: 1, borderTopColor: "#1F1F1F", paddingTop: 10, marginTop: 6 },
  lbl: { color: "#888", fontSize: 12, fontWeight: "700", letterSpacing: 0.5 },
  val: { color: "#FFF", fontSize: 13, fontWeight: "800" },

  splitBox: {
    flexDirection: "row", gap: 0, marginTop: 12,
    backgroundColor: "#070707", borderRadius: 10,
    borderWidth: 1, borderColor: "#1A1A1A",
  },
  splitCol: { flex: 1, padding: 12, alignItems: "center" },
  splitLbl: { color: "#888", fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  splitVal: { color: "#FFF", fontSize: 18, fontWeight: "900", marginTop: 4 },
  splitUnit: { color: "#666", fontSize: 9, fontWeight: "800", letterSpacing: 1, marginTop: 2 },

  note: { color: "#666", fontSize: 11, marginTop: 10, textAlign: "center", fontStyle: "italic", lineHeight: 15 },
  actions: { flexDirection: "row", gap: 10, marginTop: 16 },
  cancel: {
    flex: 1, paddingVertical: 13, borderRadius: 10,
    borderWidth: 1, borderColor: "#2A2A2A",
    alignItems: "center", justifyContent: "center",
  },
  cancelTxt: { color: "#BBB", fontWeight: "800", fontSize: 11, letterSpacing: 1.5 },
  confirm: { flex: 1.4, borderRadius: 10, overflow: "hidden" },
  confirmInner: { paddingVertical: 13, alignItems: "center", justifyContent: "center" },
  confirmTxt: { color: "#0A0A0A", fontWeight: "900", fontSize: 11, letterSpacing: 1.2 },
});

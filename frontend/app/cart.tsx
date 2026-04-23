import { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image,
  ActivityIndicator, Alert, RefreshControl,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api, CartResponse, CartGroup } from "../src/api";
import { useGate } from "../src/gate";
import { formatBLX } from "../src/blx";
import { TIERS } from "../src/theme";

/**
 * Carrinho do Marketplace Diamond.
 * Agrupa itens por vendedor. Ao fechar pedido → abre DM com o vendedor
 * passando um resumo do pedido no texto inicial.
 */
export default function Cart() {
  const router = useRouter();
  const { member } = useGate();
  const [cart, setCart] = useState<CartResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!member) return;
    try {
      const c = await api.cartList(member.member_id);
      setCart(c);
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

  const finishWithSeller = (group: CartGroup) => {
    if (!member) return;
    const items = group.items.map(i => `• ${i.title} (x${i.qty})`).join("\n");
    const msg = `Olá ${group.seller_name || ""}, tenho interesse em reservar:\n\n${items}\n\nTotal: ${formatBLX(group.subtotal_centavos)} BLX.\nPoderia combinar a entrega e a forma de pagamento?`;
    router.push({ pathname: `/community/dm/${group.seller_id}` as any, params: { msg } });
  };

  if (loading) {
    return <View style={{ flex: 1, backgroundColor: "#050505", justifyContent: "center" }}><ActivityIndicator color="#FFF" /></View>;
  }

  const hasItems = !!cart && cart.items.length > 0;

  return (
    <View style={{ flex: 1, backgroundColor: "#050505" }}>
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
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
          contentContainerStyle={{ padding: 14, paddingBottom: 30 }}
        >
          {!hasItems && (
            <View style={styles.emptyBox}>
              <Ionicons name="bag-outline" size={48} color="#2E2E2E" />
              <Text style={styles.emptyTitle}>Seu carrinho está vazio</Text>
              <Text style={styles.emptyText}>Explore o marketplace e adicione itens aqui.</Text>
              <TouchableOpacity style={styles.emptyBtn} onPress={() => router.push("/(tabs)/catalog" as any)}>
                <Text style={styles.emptyBtnTxt}>EXPLORAR MARKETPLACE</Text>
              </TouchableOpacity>
            </View>
          )}

          {cart?.groups.map((g) => {
            const tier = TIERS[g.seller_tier] || TIERS.black;
            return (
              <View key={g.seller_id || "_"} style={styles.groupCard}>
                <TouchableOpacity style={styles.sellerRow} onPress={() => g.seller_id && router.push(`/community/member/${g.seller_id}` as any)}>
                  <View style={[styles.sellerAv, { borderColor: tier.color }]}>
                    {g.seller_avatar ? <Image source={{ uri: g.seller_avatar }} style={{ width: 30, height: 30, borderRadius: 15 }} /> : <Text style={{ color: "#FFF", fontWeight: "900" }}>{(g.seller_name || "?").charAt(0)}</Text>}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sellerName} numberOfLines={1}>{g.seller_name || "Vendedor"}</Text>
                    <Text style={[styles.sellerTier, { color: tier.color }]}>{tier.label.toUpperCase()}</Text>
                  </View>
                  <Ionicons name="chatbubble-outline" size={16} color="#888" />
                </TouchableOpacity>

                {g.items.map((item) => (
                  <View key={item.ad_id} style={styles.itemRow}>
                    <TouchableOpacity onPress={() => router.push(`/ads/${item.ad_id}` as any)}>
                      {item.image ? (
                        <Image source={{ uri: item.image }} style={styles.itemImg} />
                      ) : (
                        <View style={[styles.itemImg, { alignItems: "center", justifyContent: "center" }]}><Ionicons name="cube-outline" size={22} color="#333" /></View>
                      )}
                    </TouchableOpacity>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.itemName} numberOfLines={2}>{item.title}</Text>
                      <Text style={styles.itemPrice}>{formatBLX(item.price_full_centavos)} BLX</Text>
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
                      <Text style={styles.subtotalVal}>{formatBLX(item.subtotal_centavos)}</Text>
                      <Text style={styles.subtotalUnit}>BLX</Text>
                      <TouchableOpacity onPress={() => updateQty(item.ad_id, 0)} style={{ marginTop: 6 }}>
                        <Ionicons name="trash-outline" size={15} color="#666" />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}

                <View style={styles.groupFooter}>
                  <View>
                    <Text style={styles.groupSubLbl}>SUBTOTAL DESTE VENDEDOR</Text>
                    <Text style={styles.groupSubVal}>{formatBLX(g.subtotal_centavos)} BLX</Text>
                  </View>
                  <TouchableOpacity style={styles.closeBtn} onPress={() => finishWithSeller(g)} testID={`cart-close-${g.seller_id}`}>
                    <Ionicons name="checkmark" size={16} color="#000" />
                    <Text style={styles.closeBtnTxt}>FECHAR PEDIDO</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}

          {hasItems && cart && (
            <>
              <View style={styles.totalCard}>
                <Text style={styles.totalLbl}>TOTAL GERAL DO CARRINHO</Text>
                <View style={styles.totalRow}>
                  <Text style={styles.totalVal}>{formatBLX(cart.total_centavos)}</Text>
                  <Text style={styles.totalUnit}>BLX</Text>
                </View>
                <Text style={styles.totalInfo}>* Preços e descontos aplicados ao fechar com o vendedor.</Text>
              </View>
              <View style={styles.infoBox}>
                <Ionicons name="information-circle" size={15} color="#AAA" />
                <Text style={styles.infoTxt}>
                  Cada vendedor fecha pedido separado. Combine a entrega e a forma de pagamento no chat — descontos: 30% antecipado, 15% meia, 0% com 10% de entrada.
                </Text>
              </View>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
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

  groupCard: { marginBottom: 14, padding: 12, backgroundColor: "#0E0E0E", borderRadius: 14, borderWidth: 1, borderColor: "#1A1A1A" },
  sellerRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: "#1A1A1A" },
  sellerAv: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, backgroundColor: "#1A1A1A", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  sellerName: { color: "#EEE", fontSize: 13, fontWeight: "800" },
  sellerTier: { fontSize: 9, fontWeight: "900", letterSpacing: 1.2, marginTop: 2 },

  itemRow: { flexDirection: "row", gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#151515" },
  itemImg: { width: 56, height: 56, borderRadius: 8, backgroundColor: "#141414" },
  itemName: { color: "#EEE", fontSize: 13, fontWeight: "700" },
  itemPrice: { color: "#888", fontSize: 11, marginTop: 3 },
  qtyRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  qtyBtn: { width: 26, height: 26, borderRadius: 13, backgroundColor: "#1A1A1A", borderWidth: 1, borderColor: "#2A2A2A", alignItems: "center", justifyContent: "center" },
  qtyVal: { color: "#FFF", fontSize: 13, fontWeight: "800", minWidth: 22, textAlign: "center" },
  subtotalVal: { color: "#FFF", fontSize: 14, fontWeight: "900" },
  subtotalUnit: { color: "#D4AF37", fontSize: 9, fontWeight: "900", letterSpacing: 1, marginTop: 1 },

  groupFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 12 },
  groupSubLbl: { color: "#888", fontSize: 9, fontWeight: "900", letterSpacing: 1.5 },
  groupSubVal: { color: "#FFF", fontSize: 15, fontWeight: "900", marginTop: 3 },
  closeBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 11, borderRadius: 10, backgroundColor: "#FFF" },
  closeBtnTxt: { color: "#000", fontSize: 11, fontWeight: "900", letterSpacing: 1.2 },

  totalCard: { marginTop: 6, padding: 16, backgroundColor: "#0E0E0E", borderRadius: 14, borderWidth: 1, borderColor: "#1A1A1A" },
  totalLbl: { color: "#888", fontSize: 10, fontWeight: "900", letterSpacing: 2 },
  totalRow: { flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: 6 },
  totalVal: { color: "#FFF", fontSize: 28, fontWeight: "900", letterSpacing: -0.5 },
  totalUnit: { color: "#D4AF37", fontSize: 13, fontWeight: "900", letterSpacing: 1.5 },
  totalInfo: { color: "#888", fontSize: 11, marginTop: 8 },

  infoBox: { flexDirection: "row", gap: 8, marginTop: 12, padding: 12, backgroundColor: "#0A0A0A", borderRadius: 10, borderWidth: 1, borderColor: "#141414" },
  infoTxt: { flex: 1, color: "#AAA", fontSize: 11, lineHeight: 15 },
});

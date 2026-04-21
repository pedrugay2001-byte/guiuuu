import {
  View, Text, StyleSheet, FlatList, Image, TouchableOpacity, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCart } from "../../src/cart";
import { theme } from "../../src/theme";
import { api, formatBRL } from "../../src/api";
import { useGate } from "../../src/gate";
import { useState } from "react";

export default function Cart() {
  const router = useRouter();
  const { items, updateQty, remove, total, clear, count } = useCart();
  const { member } = useGate();
  const [placing, setPlacing] = useState(false);

  const placeOrder = async () => {
    if (items.length === 0 || !member) return;
    setPlacing(true);
    try {
      await api.createOrder({
        member_id: member.member_id,
        items: items.map((i) => ({
          product_id: i.product.product_id,
          name: i.product.name,
          quantity: i.quantity,
          price: i.product.member_price,
        })),
        total,
      });
      clear();
      router.push("/chat");
    } catch (e: any) {
      Alert.alert("Erro", e.message || "Não foi possível fechar o pedido");
    } finally {
      setPlacing(false);
    }
  };

  if (items.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]} testID="cart-empty">
        <View style={styles.empty}>
          <Ionicons name="bag-outline" size={64} color={theme.colors.textMuted} />
          <Text style={styles.emptyTitle}>Carrinho vazio</Text>
          <Text style={styles.emptyText}>Adicione produtos do catálogo para continuar.</Text>
          <TouchableOpacity
            style={styles.ghostBtn}
            onPress={() => router.push("/chat")}
            testID="cart-open-chat"
          >
            <Ionicons name="chatbubbles" size={16} color={theme.colors.white} />
            <Text style={styles.ghostText}>ABRIR CONVERSA COM SUPORTE</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="cart-screen">
      <View style={styles.headerRow}>
        <Text style={styles.header}>Seu carrinho</Text>
        <TouchableOpacity onPress={() => clear()} testID="cart-clear-button">
          <Text style={styles.clearText}>Limpar</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={items}
        keyExtractor={(i) => i.product.product_id}
        contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.md }}
        renderItem={({ item }) => (
          <View style={styles.row} testID={`cart-item-${item.product.product_id}`}>
            <Image source={{ uri: item.product.image_url }} style={styles.thumb} />
            <View style={{ flex: 1 }}>
              <Text numberOfLines={2} style={styles.name}>{item.product.name}</Text>
              <Text style={styles.price}>{formatBRL(item.product.member_price)}</Text>
              <View style={styles.qtyRow}>
                <TouchableOpacity
                  onPress={() => updateQty(item.product.product_id, item.quantity - 1)}
                  style={styles.qtyBtn}
                >
                  <Ionicons name="remove" size={14} color={theme.colors.white} />
                </TouchableOpacity>
                <Text style={styles.qty}>{item.quantity}</Text>
                <TouchableOpacity
                  onPress={() => updateQty(item.product.product_id, item.quantity + 1)}
                  style={styles.qtyBtn}
                >
                  <Ionicons name="add" size={14} color={theme.colors.white} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => remove(item.product.product_id)}
                  style={styles.removeBtn}
                >
                  <Ionicons name="trash-outline" size={16} color={theme.colors.error} />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      />

      <View style={styles.footer}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total ({count} itens)</Text>
          <Text style={styles.totalValue} testID="cart-total">{formatBRL(total)}</Text>
        </View>
        <TouchableOpacity
          onPress={placeOrder}
          style={[styles.closeBtn, placing && { opacity: 0.6 }]}
          disabled={placing}
          testID="cart-close-order"
        >
          <Ionicons name="chatbubble-ellipses" size={18} color={theme.colors.bg} />
          <Text style={styles.closeText}>
            {placing ? "ENVIANDO..." : "FECHAR PEDIDO"}
          </Text>
        </TouchableOpacity>
        <Text style={styles.hint}>
          Seu pedido é enviado diretamente para nosso time de suporte via chat interno.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  headerRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    padding: theme.spacing.lg,
  },
  header: { color: theme.colors.white, fontSize: 22, fontWeight: "800", letterSpacing: -0.5 },
  clearText: { color: theme.colors.textMuted, fontSize: 13 },
  row: {
    flexDirection: "row", gap: 12,
    padding: 12, backgroundColor: theme.colors.surface,
    borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8,
  },
  thumb: { width: 72, height: 72, borderRadius: 4, backgroundColor: theme.colors.surfaceElevated },
  name: { color: theme.colors.text, fontSize: 13, fontWeight: "600" },
  price: { color: theme.colors.silver, fontSize: 13, marginTop: 4 },
  qtyRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 10 },
  qtyBtn: {
    width: 28, height: 28, borderRadius: 4,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1, borderColor: theme.colors.border,
    alignItems: "center", justifyContent: "center",
  },
  qty: { color: theme.colors.white, fontWeight: "700", minWidth: 20, textAlign: "center" },
  removeBtn: { marginLeft: "auto", padding: 6 },
  footer: {
    padding: theme.spacing.lg, gap: theme.spacing.md,
    borderTopWidth: 1, borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  totalLabel: { color: theme.colors.textMuted, fontSize: 13 },
  totalValue: { color: theme.colors.white, fontSize: 22, fontWeight: "800" },
  closeBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    backgroundColor: theme.colors.white, paddingVertical: 16, borderRadius: 4,
  },
  closeText: { color: theme.colors.bg, fontWeight: "800", letterSpacing: 1.5, fontSize: 13 },
  hint: { color: theme.colors.textMuted, fontSize: 11, textAlign: "center" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: theme.spacing.lg, gap: 12 },
  emptyTitle: { color: theme.colors.white, fontSize: 20, fontWeight: "700" },
  emptyText: { color: theme.colors.textMuted, fontSize: 14, textAlign: "center" },
  ghostBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    borderWidth: 1, borderColor: theme.colors.border,
    paddingHorizontal: 20, paddingVertical: 14, borderRadius: 4, marginTop: 16,
  },
  ghostText: { color: theme.colors.white, fontSize: 12, fontWeight: "700", letterSpacing: 1.5 },
});

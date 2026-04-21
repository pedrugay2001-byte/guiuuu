import {
  View, Text, StyleSheet, FlatList, Image, TouchableOpacity, Alert, Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useCart } from "../../src/cart";
import { theme, WHATSAPP_NUMBER } from "../../src/theme";
import { formatBRL } from "../../src/api";
import { useAuth } from "../../src/auth";

export default function Cart() {
  const { items, updateQty, remove, total, clear, count } = useCart();
  const { user } = useAuth();

  const checkoutWhatsapp = async () => {
    if (items.length === 0) return;
    const lines = items.map(
      (i) => `• ${i.product.name} x${i.quantity} — ${formatBRL(i.product.member_price * i.quantity)}`,
    );
    const msg =
      `*Pedido FarmaClube*\n` +
      `Membro: ${user?.name}\n` +
      `Email: ${user?.email}\n\n` +
      lines.join("\n") +
      `\n\n*Total:* ${formatBRL(total)}\n\nGostaria de finalizar a compra.`;
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
    try {
      const ok = await Linking.canOpenURL(url);
      if (ok) await Linking.openURL(url);
      else Alert.alert("WhatsApp", "WhatsApp não está disponível neste dispositivo.");
    } catch {
      Alert.alert("Erro", "Não foi possível abrir o WhatsApp.");
    }
  };

  if (items.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]} testID="cart-empty">
        <View style={styles.empty}>
          <Ionicons name="bag-outline" size={64} color={theme.colors.textMuted} />
          <Text style={styles.emptyTitle}>Carrinho vazio</Text>
          <Text style={styles.emptyText}>Adicione produtos do catálogo para continuar.</Text>
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
                  testID={`cart-minus-${item.product.product_id}`}
                >
                  <Ionicons name="remove" size={14} color={theme.colors.white} />
                </TouchableOpacity>
                <Text style={styles.qty}>{item.quantity}</Text>
                <TouchableOpacity
                  onPress={() => updateQty(item.product.product_id, item.quantity + 1)}
                  style={styles.qtyBtn}
                  testID={`cart-plus-${item.product.product_id}`}
                >
                  <Ionicons name="add" size={14} color={theme.colors.white} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => remove(item.product.product_id)}
                  style={styles.removeBtn}
                  testID={`cart-remove-${item.product.product_id}`}
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
          onPress={checkoutWhatsapp}
          style={styles.whatsappBtn}
          testID="cart-whatsapp-checkout"
        >
          <Ionicons name="logo-whatsapp" size={18} color={theme.colors.white} />
          <Text style={styles.whatsappText}>FINALIZAR VIA WHATSAPP</Text>
        </TouchableOpacity>
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
    borderTopWidth: 1, borderTopColor: theme.colors.border, backgroundColor: theme.colors.surface,
  },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  totalLabel: { color: theme.colors.textMuted, fontSize: 13 },
  totalValue: { color: theme.colors.white, fontSize: 22, fontWeight: "800" },
  whatsappBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    backgroundColor: theme.colors.whatsapp, paddingVertical: 16, borderRadius: 4,
  },
  whatsappText: { color: theme.colors.white, fontWeight: "800", letterSpacing: 1.5, fontSize: 13 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: theme.spacing.lg, gap: 10 },
  emptyTitle: { color: theme.colors.white, fontSize: 20, fontWeight: "700" },
  emptyText: { color: theme.colors.textMuted, fontSize: 14, textAlign: "center" },
});

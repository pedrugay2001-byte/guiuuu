import { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, Image, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, Product, formatBRL } from "../../src/api";
import { useCart } from "../../src/cart";
import { theme, WHATSAPP_NUMBER } from "../../src/theme";

export default function ProductDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { add } = useCart();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    api.product(id).then(setProduct).catch(() => setProduct(null)).finally(() => setLoading(false));
  }, [id]);

  const handleWhatsapp = async () => {
    if (!product) return;
    const msg = `Olá! Tenho interesse no produto *${product.name}* (${formatBRL(product.member_price)}) do FarmaClube.`;
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
    const ok = await Linking.canOpenURL(url);
    if (ok) await Linking.openURL(url);
    else Alert.alert("WhatsApp não disponível");
  };

  const handleAdd = () => {
    if (!product) return;
    add(product);
    Alert.alert("Adicionado", `${product.name} foi adicionado ao carrinho.`);
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.bg, justifyContent: "center" }}>
        <ActivityIndicator color={theme.colors.white} />
      </View>
    );
  }

  if (!product) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
        <Text style={{ color: theme.colors.text, padding: 20 }}>Produto não encontrado.</Text>
      </SafeAreaView>
    );
  }

  const discount = Math.round(((product.price - product.member_price) / product.price) * 100);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }} testID="product-details">
      <Stack.Screen options={{ title: "" }} />
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        <View style={styles.imageWrap}>
          <Image source={{ uri: product.image_url }} style={styles.image} />
          {discount > 0 && (
            <View style={styles.discount}>
              <Text style={styles.discountText}>-{discount}%</Text>
            </View>
          )}
        </View>

        <View style={styles.body}>
          <Text style={styles.category}>{product.category.toUpperCase()}</Text>
          <Text style={styles.name}>{product.name}</Text>
          <View style={styles.priceRow}>
            <Text style={styles.priceOld}>{formatBRL(product.price)}</Text>
            <Text style={styles.priceNew}>{formatBRL(product.member_price)}</Text>
          </View>
          <View style={styles.memberBadge}>
            <Ionicons name="diamond" size={12} color={theme.colors.silver} />
            <Text style={styles.memberBadgeText}>PREÇO EXCLUSIVO MEMBRO</Text>
          </View>

          <View style={styles.divider} />
          <Text style={styles.label}>DESCRIÇÃO</Text>
          <Text style={styles.desc}>{product.description}</Text>

          <View style={styles.infoRow}>
            <View style={styles.infoBlock}>
              <Ionicons name="cube-outline" size={18} color={theme.colors.silver} />
              <Text style={styles.infoLabel}>Estoque</Text>
              <Text style={styles.infoValue}>{product.stock} un.</Text>
            </View>
            <View style={styles.infoBlock}>
              <Ionicons name="shield-checkmark-outline" size={18} color={theme.colors.silver} />
              <Text style={styles.infoLabel}>Autêntico</Text>
              <Text style={styles.infoValue}>Original</Text>
            </View>
            <View style={styles.infoBlock}>
              <Ionicons name="rocket-outline" size={18} color={theme.colors.silver} />
              <Text style={styles.infoLabel}>Envio</Text>
              <Text style={styles.infoValue}>Discreto</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      <SafeAreaView style={styles.footer} edges={["bottom"]}>
        <TouchableOpacity style={styles.cartBtn} onPress={handleAdd} testID="product-add-cart">
          <Ionicons name="cart" size={18} color={theme.colors.bg} />
          <Text style={styles.cartBtnText}>ADICIONAR</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.waBtn} onPress={handleWhatsapp} testID="product-whatsapp">
          <Ionicons name="logo-whatsapp" size={18} color={theme.colors.white} />
          <Text style={styles.waBtnText}>WHATSAPP</Text>
        </TouchableOpacity>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  imageWrap: { backgroundColor: theme.colors.surfaceElevated },
  image: { width: "100%", height: 340 },
  discount: {
    position: "absolute", top: 16, right: 16,
    backgroundColor: theme.colors.white, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 4,
  },
  discountText: { color: theme.colors.bg, fontWeight: "900", fontSize: 12, letterSpacing: 1 },
  body: { padding: theme.spacing.lg, gap: 8 },
  category: { color: theme.colors.silver, fontSize: 10, fontWeight: "700", letterSpacing: 2 },
  name: {
    color: theme.colors.white, fontSize: 22, fontWeight: "800",
    letterSpacing: -0.5, marginTop: 6, lineHeight: 28,
  },
  priceRow: { flexDirection: "row", alignItems: "baseline", gap: 12, marginTop: 8 },
  priceOld: { color: theme.colors.textMuted, fontSize: 14, textDecorationLine: "line-through" },
  priceNew: { color: theme.colors.white, fontSize: 28, fontWeight: "900" },
  memberBadge: {
    flexDirection: "row", alignItems: "center", gap: 6,
    alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 4, borderWidth: 1, borderColor: theme.colors.border,
    marginTop: 8,
  },
  memberBadgeText: { color: theme.colors.silver, fontSize: 10, fontWeight: "700", letterSpacing: 1.5 },
  divider: { height: 1, backgroundColor: theme.colors.border, marginVertical: theme.spacing.lg },
  label: { color: theme.colors.silver, fontSize: 10, fontWeight: "700", letterSpacing: 2, marginBottom: 8 },
  desc: { color: theme.colors.textMuted, fontSize: 14, lineHeight: 22 },
  infoRow: { flexDirection: "row", gap: 10, marginTop: theme.spacing.lg },
  infoBlock: {
    flex: 1, padding: 14, borderRadius: 6,
    backgroundColor: theme.colors.surface,
    borderWidth: 1, borderColor: theme.colors.border,
    alignItems: "center", gap: 4,
  },
  infoLabel: { color: theme.colors.textMuted, fontSize: 10, letterSpacing: 1 },
  infoValue: { color: theme.colors.white, fontSize: 12, fontWeight: "700" },
  footer: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    flexDirection: "row", gap: 10, padding: theme.spacing.md,
    backgroundColor: theme.colors.bg, borderTopWidth: 1, borderTopColor: theme.colors.border,
  },
  cartBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: theme.colors.white, paddingVertical: 16, borderRadius: 4,
  },
  cartBtnText: { color: theme.colors.bg, fontWeight: "800", fontSize: 13, letterSpacing: 1 },
  waBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: theme.colors.whatsapp, paddingVertical: 16, borderRadius: 4,
  },
  waBtnText: { color: theme.colors.white, fontWeight: "800", fontSize: 13, letterSpacing: 1 },
});

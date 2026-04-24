import { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, Image, ScrollView, TouchableOpacity,
  ActivityIndicator, Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { api, Product, formatBRL } from "../../src/api";
import { useGate } from "../../src/gate";
import { formatBLX } from "../../src/blx";
import { notify } from "../../src/alerts";
import { theme } from "../../src/theme";

const GOLD_LIGHT = "#F4D47A";
const GOLD = "#D4AF37";
const GOLD_DARK = "#8C6F1E";

const TIER_DISCOUNT: Record<string, number> = {
  silver: 0.05,
  gold: 0.10,
  diamond: 0.15,
};

export default function ProductDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { member, refreshMember } = useGate();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [showConfirm, setShowConfirm] = useState(false);
  const [buying, setBuying] = useState(false);

  useEffect(() => {
    if (!id) return;
    api.product(id).then(setProduct).catch(() => setProduct(null)).finally(() => setLoading(false));
  }, [id]);

  const tier = (member?.tier || "black").toLowerCase();
  const disc = TIER_DISCOUNT[tier] || 0;
  const discountedBRL = product ? Math.round(product.member_price * (1 - disc) * 100) / 100 : 0;
  const priceCents = Math.round(discountedBRL * 100);

  const handleBuy = async () => {
    if (!product || !member) return;
    setBuying(true);
    try {
      const r = await api.buyProductBLX(product.product_id, { member_id: member.member_id, quantity: 1 });
      setShowConfirm(false);
      notify("Compra confirmada", r.message || "BLX debitados com sucesso.");
      // Atualizar saldo local
      refreshMember();
      // Voltar após 1.5s
      setTimeout(() => router.back(), 1200);
    } catch (e: any) {
      setShowConfirm(false);
      notify("Compra não realizada", e?.message || "Tente novamente.");
    } finally {
      setBuying(false);
    }
  };

  const consultDelivery = () => router.push("/chat");

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.bg, justifyContent: "center" }}>
        <ActivityIndicator color={GOLD} />
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

  const canBuy = tier === "silver" || tier === "gold" || tier === "diamond";

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }} testID="product-details">
      <Stack.Screen options={{ title: "" }} />
      <ScrollView contentContainerStyle={{ paddingBottom: 130 }}>
        <View style={s.imageWrap}>
          <Image source={{ uri: product.image_url }} style={s.image} resizeMode="cover" />
          {/* Gradiente elegante no topo da imagem */}
          <LinearGradient
            colors={["rgba(5,5,5,0.7)", "transparent"]}
            style={s.imageTopGradient}
            pointerEvents="none"
          />
          {/* Gradiente inferior para transição suave */}
          <LinearGradient
            colors={["transparent", theme.colors.bg]}
            style={s.imageBottomGradient}
            pointerEvents="none"
          />
          {/* Faixa dourada lateral — acento premium */}
          <View style={s.goldStripe} />
        </View>

        <View style={s.body}>
          <Text style={s.category}>{product.category.toUpperCase()}</Text>
          <Text style={s.name}>{product.name}</Text>

          {/* Price card com degradê dourado */}
          <LinearGradient
            colors={[GOLD_LIGHT + "20", "#0B0906", GOLD_DARK + "14"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={s.priceCard}
          >
            <View>
              <Text style={s.priceLabel}>VALOR EM BLX</Text>
              <View style={s.priceRow}>
                <Text style={s.priceBLX}>{formatBLX(priceCents)}</Text>
                <Text style={s.priceUnit}>BLX</Text>
              </View>
              {disc > 0 && (
                <Text style={s.priceOld}>
                  {formatBRL(product.member_price)} · desconto {tier.toUpperCase()} -{Math.round(disc * 100)}%
                </Text>
              )}
            </View>
            <View style={s.tierSeal}>
              <Ionicons name="diamond" size={12} color={GOLD} />
              <Text style={s.tierSealTxt}>{tier.toUpperCase()}</Text>
            </View>
          </LinearGradient>

          <View style={s.divider} />

          <Text style={s.label}>DESCRIÇÃO</Text>
          <Text style={s.desc}>{product.description}</Text>

          <View style={s.infoRow}>
            <InfoBlock icon="cube-outline" label="Estoque" value={`${product.stock} un.`} />
            <InfoBlock icon="shield-checkmark-outline" label="Autêntico" value="Original" />
            <InfoBlock icon="rocket-outline" label="Envio" value="Discreto" />
          </View>

          {/* Link discreto "Consultar prazo" (sem cor chamativa) */}
          <TouchableOpacity style={s.supportLink} onPress={consultDelivery} testID="product-delivery-support">
            <Ionicons name="time-outline" size={13} color="#888" />
            <Text style={s.supportLinkTxt}>Consultar prazo de entrega</Text>
            <Ionicons name="chevron-forward" size={13} color="#888" />
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* FOOTER — Botão principal "Comprar com BLX" */}
      <SafeAreaView style={s.footer} edges={["bottom"]}>
        {!canBuy ? (
          <View style={s.blockedBox}>
            <Ionicons name="lock-closed" size={14} color="#888" />
            <Text style={s.blockedTxt}>Disponível para Silver, Gold ou Diamante</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={s.buyBtn}
            onPress={() => setShowConfirm(true)}
            testID="product-buy-blx"
            activeOpacity={0.88}
          >
            <LinearGradient
              colors={[GOLD_LIGHT, GOLD, GOLD_DARK]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={s.buyBtnInner}
            >
              <MaterialCommunityIcons name="diamond-stone" size={16} color="#0A0A0A" />
              <Text style={s.buyBtnTxt}>COMPRAR · {formatBLX(priceCents)} BLX</Text>
            </LinearGradient>
          </TouchableOpacity>
        )}
      </SafeAreaView>

      {/* Modal de confirmação (evita clique acidental) */}
      <Modal visible={showConfirm} transparent animationType="fade" onRequestClose={() => setShowConfirm(false)}>
        <View style={s.modalBg}>
          <View style={s.modalCard}>
            <LinearGradient
              colors={[GOLD_LIGHT, GOLD, GOLD_DARK]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={{ height: 2, marginHorizontal: -22, marginBottom: 18 }}
            />
            <Text style={s.modalKicker}>CONFIRMAR COMPRA</Text>
            <Text style={s.modalTitle} numberOfLines={2}>{product.name}</Text>

            <View style={s.modalRow}>
              <Text style={s.modalLbl}>Valor</Text>
              <Text style={s.modalVal}>{formatBLX(priceCents)} BLX</Text>
            </View>
            {disc > 0 && (
              <View style={s.modalRow}>
                <Text style={s.modalLbl}>Desconto {tier.toUpperCase()}</Text>
                <Text style={[s.modalVal, { color: "#4EE07F" }]}>-{Math.round(disc * 100)}%</Text>
              </View>
            )}
            <View style={[s.modalRow, { borderTopWidth: 1, borderTopColor: "#1F1F1F", paddingTop: 12, marginTop: 6 }]}>
              <Text style={[s.modalLbl, { color: GOLD }]}>TOTAL A DEBITAR</Text>
              <Text style={[s.modalVal, { color: GOLD, fontSize: 18 }]}>{formatBLX(priceCents)} BLX</Text>
            </View>

            <Text style={s.modalNote}>
              O valor será debitado imediatamente do seu saldo BLX.
            </Text>

            <View style={s.modalActions}>
              <TouchableOpacity
                style={s.modalCancel}
                onPress={() => setShowConfirm(false)}
                disabled={buying}
              >
                <Text style={s.modalCancelTxt}>CANCELAR</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.modalConfirm}
                onPress={handleBuy}
                disabled={buying}
                testID="product-confirm-buy"
              >
                <LinearGradient
                  colors={buying ? ["#555", "#333"] : [GOLD_LIGHT, GOLD, GOLD_DARK]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={s.modalConfirmInner}
                >
                  {buying ? (
                    <ActivityIndicator color="#000" size="small" />
                  ) : (
                    <Text style={s.modalConfirmTxt}>CONFIRMAR</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function InfoBlock({ icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <View style={s.infoBlock}>
      <Ionicons name={icon} size={16} color={GOLD} />
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={s.infoValue}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  imageWrap: { backgroundColor: "#0B0B0B", position: "relative" },
  image: { width: "100%", height: 360 },
  imageTopGradient: {
    position: "absolute", top: 0, left: 0, right: 0, height: 80,
  },
  imageBottomGradient: {
    position: "absolute", bottom: 0, left: 0, right: 0, height: 60,
  },
  goldStripe: {
    position: "absolute", right: 0, top: 40, bottom: 40, width: 2.5,
    backgroundColor: GOLD, opacity: 0.7,
  },

  body: { padding: 18, gap: 4 },
  category: { color: GOLD_DARK, fontSize: 10, fontWeight: "800", letterSpacing: 2.5 },
  name: { color: "#FFF", fontSize: 22, fontWeight: "900", marginTop: 6, lineHeight: 28, letterSpacing: -0.3 },

  // Price card com gradiente dourado elitizado
  priceCard: {
    marginTop: 16, padding: 18, borderRadius: 14,
    borderWidth: 1, borderColor: "rgba(212,175,55,0.28)",
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  priceLabel: { color: GOLD_DARK, fontSize: 10, fontWeight: "900", letterSpacing: 2 },
  priceRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, marginTop: 6 },
  priceBLX: { color: "#FFF", fontSize: 32, fontWeight: "900", letterSpacing: -1 },
  priceUnit: { color: GOLD, fontSize: 14, fontWeight: "900", letterSpacing: 1.5, marginBottom: 6 },
  priceOld: { color: "#777", fontSize: 11, marginTop: 6, textDecorationLine: "line-through" },
  tierSeal: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
    borderWidth: 1, borderColor: GOLD_DARK + "60",
    backgroundColor: "rgba(212,175,55,0.08)",
  },
  tierSealTxt: { color: GOLD_LIGHT, fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },

  divider: { height: 1, backgroundColor: "#1A1A1A", marginVertical: 20 },
  label: { color: GOLD_DARK, fontSize: 10, fontWeight: "900", letterSpacing: 2, marginBottom: 8 },
  desc: { color: "#BBB", fontSize: 14, lineHeight: 22 },

  infoRow: { flexDirection: "row", gap: 8, marginTop: 18 },
  infoBlock: {
    flex: 1, padding: 12, borderRadius: 10,
    backgroundColor: "#0B0B0B",
    borderWidth: 1, borderColor: "rgba(212,175,55,0.15)",
    alignItems: "center", gap: 4,
  },
  infoLabel: { color: "#888", fontSize: 10, letterSpacing: 1, fontWeight: "700" },
  infoValue: { color: "#FFF", fontSize: 12, fontWeight: "800" },

  // Link discreto (sem cor chamativa)
  supportLink: {
    marginTop: 22,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    paddingVertical: 12, paddingHorizontal: 10,
    borderTopWidth: 1, borderTopColor: "#1A1A1A",
    borderBottomWidth: 1, borderBottomColor: "#1A1A1A",
  },
  supportLinkTxt: { color: "#AAA", fontSize: 12, fontWeight: "600" },

  // Footer e botão de compra
  footer: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: "#050505",
    borderTopWidth: 1, borderTopColor: "rgba(212,175,55,0.15)",
  },
  buyBtn: { borderRadius: 12, overflow: "hidden" },
  buyBtnInner: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 15,
  },
  buyBtnTxt: { color: "#0A0A0A", fontWeight: "900", fontSize: 13, letterSpacing: 1.8 },

  blockedBox: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 15, borderRadius: 10, backgroundColor: "#0B0B0B",
    borderWidth: 1, borderColor: "#1A1A1A",
  },
  blockedTxt: { color: "#888", fontSize: 12, fontWeight: "700" },

  // Modal confirmação
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.85)", alignItems: "center", justifyContent: "center", padding: 24 },
  modalCard: {
    width: "100%", maxWidth: 380,
    backgroundColor: "#0B0B0B",
    borderRadius: 18, padding: 22,
    borderWidth: 1, borderColor: "rgba(212,175,55,0.3)",
    overflow: "hidden",
  },
  modalKicker: { color: GOLD, fontSize: 10, fontWeight: "900", letterSpacing: 2.5 },
  modalTitle: { color: "#FFF", fontSize: 16, fontWeight: "800", marginTop: 6, marginBottom: 16, lineHeight: 21 },
  modalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6 },
  modalLbl: { color: "#888", fontSize: 12, fontWeight: "700", letterSpacing: 0.5 },
  modalVal: { color: "#FFF", fontSize: 14, fontWeight: "800" },
  modalNote: { color: "#666", fontSize: 11, marginTop: 14, textAlign: "center", fontStyle: "italic" },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 18 },
  modalCancel: {
    flex: 1, paddingVertical: 13, borderRadius: 10,
    borderWidth: 1, borderColor: "#2A2A2A",
    alignItems: "center", justifyContent: "center",
  },
  modalCancelTxt: { color: "#BBB", fontWeight: "800", fontSize: 11, letterSpacing: 1.5 },
  modalConfirm: { flex: 1, borderRadius: 10, overflow: "hidden" },
  modalConfirmInner: { paddingVertical: 13, alignItems: "center", justifyContent: "center" },
  modalConfirmTxt: { color: "#0A0A0A", fontWeight: "900", fontSize: 11, letterSpacing: 1.5 },
});

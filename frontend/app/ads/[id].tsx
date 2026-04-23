import { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Image, TouchableOpacity,
  ActivityIndicator, Alert, Dimensions,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, Ad } from "../../src/api";
import { useGate } from "../../src/gate";
import { TIERS } from "../../src/theme";
import ScreenHeader from "../../src/screen-header";
import { formatBLX } from "../../src/blx";

const { width } = Dimensions.get("window");

/**
 * Marketplace — Detalhe do anúncio (DIAMOND ONLY).
 *
 * Regras de negócio:
 *  - Não há desconto por tier (apenas Diamond acessa).
 *  - Desconto é por forma de pagamento:
 *      Antecipado 100%  → −30%
 *      50% de entrada   → −15%
 *      10% de entrada   → 0% (preço cheio)
 *  - Prazo de entrega: consultar suporte no chat dedicado.
 *  - Ações: Favoritar, Adicionar ao carrinho, Falar com vendedor.
 */

const PAY_OPTIONS = [
  { id: "full", label: "Antecipado 100%", discount: 30, sub: "Melhor preço" },
  { id: "half", label: "50% de entrada", discount: 15, sub: "50% saldo na entrega" },
  { id: "entry", label: "10% de entrada", discount: 0, sub: "90% saldo na entrega" },
] as const;
type PayId = typeof PAY_OPTIONS[number]["id"];

export default function AdView() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { member } = useGate();
  const [ad, setAd] = useState<Ad | null>(null);
  const [pay, setPay] = useState<PayId>("full");
  const [favorited, setFavorited] = useState(false);
  const [adding, setAdding] = useState(false);
  const [favoriting, setFavoriting] = useState(false);

  useEffect(() => {
    if (!id) return;
    api.getAd(id).then(setAd).catch(() => {});
    if (member) {
      api.favIds(member.member_id).then(ids => setFavorited(ids.includes(id))).catch(() => {});
    }
  }, [id, member]);

  if (!ad) return <View style={{ flex: 1, backgroundColor: "#050505", justifyContent: "center" }}><ActivityIndicator color="#FFF" /></View>;

  const opt = PAY_OPTIONS.find(o => o.id === pay)!;
  const fullCents = Math.round(ad.price_full * 100);
  const finalCents = Math.round(fullCents * (100 - opt.discount) / 100);
  const entryCents = Math.round(finalCents * (pay === "full" ? 100 : pay === "half" ? 50 : 10) / 100);
  const remainingCents = finalCents - entryCents;
  const isOwner = ad.seller_id === member?.member_id;
  const tier = TIERS[ad.seller_tier || "diamond"];

  const toggleFav = async () => {
    if (!member) return;
    setFavoriting(true);
    try {
      const r = await api.favToggle(member.member_id, ad.ad_id);
      setFavorited(r.favorited);
    } finally { setFavoriting(false); }
  };

  const addToCart = async () => {
    if (!member) return;
    if (isOwner) { Alert.alert("Aviso", "Você não pode comprar seu próprio anúncio."); return; }
    setAdding(true);
    try {
      await api.cartAdd(member.member_id, ad.ad_id, 1);
      Alert.alert("No carrinho!", `${ad.title} foi adicionado ao seu carrinho.`, [
        { text: "Ver carrinho", onPress: () => router.push("/cart" as any) },
        { text: "Continuar" },
      ]);
    } catch (e: any) {
      Alert.alert("Erro", e.message || "Falha ao adicionar");
    } finally { setAdding(false); }
  };

  const chatSeller = () => router.push(`/community/dm/${ad.seller_id}` as any);
  const consultDelivery = () => {
    Alert.alert(
      "Prazo de entrega",
      "Prazos e logística são combinados caso a caso. Deseja falar com o suporte agora?",
      [{ text: "Agora não" }, { text: "Falar com suporte", onPress: () => router.push("/chat" as any) }],
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#050505" }}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Anúncio" />
      <ScrollView>
        {ad.images?.[0] ? (
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
            {ad.images.map((uri, i) => (
              <Image key={i} source={{ uri }} style={{ width, height: width, backgroundColor: "#111" }} />
            ))}
          </ScrollView>
        ) : (
          <View style={{ width, height: width, backgroundColor: "#111", alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="cube-outline" size={60} color="#333" />
          </View>
        )}

        <View style={{ padding: 16, paddingBottom: 20 }}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{ad.title}</Text>
            <TouchableOpacity
              style={[styles.favBtn, favorited && styles.favBtnActive]}
              onPress={toggleFav}
              disabled={favoriting}
              testID="ad-favorite"
            >
              <Ionicons name={favorited ? "heart" : "heart-outline"} size={22} color={favorited ? "#FF6B6B" : "#DDD"} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.sellerRow} onPress={() => router.push(`/community/member/${ad.seller_id}` as any)}>
            <View style={[styles.sellerAv, { backgroundColor: tier.color + "22", borderColor: tier.color }]}>
              {ad.seller_avatar ? <Image source={{ uri: ad.seller_avatar }} style={{ width: 30, height: 30, borderRadius: 15 }} /> : <Text style={{ color: tier.color, fontWeight: "900" }}>{(ad.seller_nickname || "?").charAt(0)}</Text>}
            </View>
            <View>
              <Text style={styles.sellerName}>{ad.seller_nickname}</Text>
              <Text style={[styles.sellerTier, { color: tier.color }]}>{tier.label.toUpperCase()} · VENDEDOR VERIFICADO</Text>
            </View>
          </TouchableOpacity>

          {/* Preço de tabela */}
          <View style={styles.priceBox}>
            <Text style={styles.priceLbl}>PREÇO DE TABELA</Text>
            <View style={styles.priceRow}>
              <Text style={styles.priceNew}>{formatBLX(fullCents)}</Text>
              <Text style={styles.priceUnit}>BLX</Text>
            </View>
          </View>

          {/* Formas de pagamento — regra Diamond */}
          <Text style={styles.sectionLbl}>FORMA DE PAGAMENTO</Text>
          <View style={{ gap: 8 }}>
            {PAY_OPTIONS.map(o => {
              const discCents = Math.round(fullCents * (100 - o.discount) / 100);
              const selected = pay === o.id;
              return (
                <TouchableOpacity
                  key={o.id}
                  style={[styles.payOpt, selected && styles.payOptActive]}
                  onPress={() => setPay(o.id)}
                  activeOpacity={0.85}
                  testID={`ad-pay-${o.id}`}
                >
                  <View style={[styles.payRadio, selected && styles.payRadioActive]}>
                    {selected && <View style={styles.payRadioDot} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.payLabel, selected && { color: "#FFF" }]}>{o.label}</Text>
                    <Text style={styles.paySub}>{o.sub}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    {o.discount > 0 && (
                      <View style={styles.discPill}>
                        <Text style={styles.discPillTxt}>−{o.discount}%</Text>
                      </View>
                    )}
                    <Text style={[styles.payPrice, selected && { color: "#FFF" }]}>{formatBLX(discCents)} BLX</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Resumo */}
          <View style={styles.summaryBox}>
            {pay !== "full" && (
              <>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLbl}>Entrada ({pay === "half" ? 50 : 10}%)</Text>
                  <Text style={styles.summaryVal}>{formatBLX(entryCents)} BLX</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLbl}>Saldo na entrega</Text>
                  <Text style={styles.summaryVal}>{formatBLX(remainingCents)} BLX</Text>
                </View>
                <View style={styles.summaryDivider} />
              </>
            )}
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLblBold}>Total a pagar</Text>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.summaryTotal}>{formatBLX(finalCents)} BLX</Text>
                {opt.discount > 0 && <Text style={styles.summarySaving}>economia {formatBLX(fullCents - finalCents)} BLX</Text>}
              </View>
            </View>
          </View>

          {/* Prazo de entrega */}
          <TouchableOpacity style={styles.deliveryBox} onPress={consultDelivery} testID="ad-delivery">
            <Ionicons name="bicycle-outline" size={18} color="#DDD" />
            <View style={{ flex: 1 }}>
              <Text style={styles.deliveryLbl}>PRAZO DE ENTREGA</Text>
              <Text style={styles.deliveryTxt}>Consultar no suporte</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#666" />
          </TouchableOpacity>

          <Text style={styles.sectionLbl}>DESCRIÇÃO</Text>
          <Text style={styles.desc}>{ad.description}</Text>

          <View style={styles.securityBox}>
            <Ionicons name="shield-checkmark" size={20} color="#AAA" />
            <Text style={styles.securityTxt}>
              Transação privada entre membros Diamond. Pagamento em BLEX Token (BLX) com custódia em escrow. Entrega combinada diretamente com o vendedor após reserva.
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* FOOTER */}
      {!isOwner && (
        <View style={styles.footer}>
          <TouchableOpacity style={styles.footerIconBtn} onPress={chatSeller} testID="ad-chat">
            <Ionicons name="chatbubble" size={18} color="#FFF" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.cartBtn, adding && { opacity: 0.6 }]}
            onPress={addToCart}
            disabled={adding}
            testID="ad-cart"
          >
            {adding ? <ActivityIndicator color="#FFF" size="small" /> : (
              <>
                <Ionicons name="bag-add" size={17} color="#FFF" />
                <Text style={styles.cartBtnTxt}>ADICIONAR</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.buyBtn} onPress={addToCart} testID="ad-buy-now">
            <Text style={styles.buyTxt}>RESERVAR · {formatBLX(finalCents)}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  title: { flex: 1, color: "#FFF", fontSize: 19, fontWeight: "900", lineHeight: 25 },
  favBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#141414", borderWidth: 1, borderColor: "#222", alignItems: "center", justifyContent: "center" },
  favBtnActive: { borderColor: "rgba(255,107,107,0.5)", backgroundColor: "rgba(255,107,107,0.08)" },

  sellerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: "#0E0E0E", borderRadius: 10, borderWidth: 1, borderColor: "#1A1A1A" },
  sellerAv: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  sellerName: { color: "#EEE", fontSize: 13, fontWeight: "800" },
  sellerTier: { fontSize: 9, fontWeight: "900", letterSpacing: 1.5, marginTop: 2 },

  priceBox: { marginTop: 18, alignItems: "center" },
  priceLbl: { color: "#8A8A8A", fontSize: 10, fontWeight: "900", letterSpacing: 2.5 },
  priceRow: { flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: 6 },
  priceNew: { color: "#FFF", fontSize: 30, fontWeight: "900", letterSpacing: -0.5 },
  priceUnit: { color: "#D4AF37", fontSize: 13, fontWeight: "900", letterSpacing: 1.5 },

  sectionLbl: { color: "#8A8A8A", fontSize: 10, fontWeight: "900", letterSpacing: 2.5, marginTop: 22, marginBottom: 10 },
  payOpt: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingHorizontal: 14, backgroundColor: "#0E0E0E", borderRadius: 12, borderWidth: 1, borderColor: "#1A1A1A" },
  payOptActive: { borderColor: "#444", backgroundColor: "#161616" },
  payRadio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: "#444", alignItems: "center", justifyContent: "center" },
  payRadioActive: { borderColor: "#FFF" },
  payRadioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#FFF" },
  payLabel: { color: "#DDD", fontSize: 13, fontWeight: "800" },
  paySub: { color: "#777", fontSize: 11, marginTop: 2 },
  discPill: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10, backgroundColor: "rgba(78,224,127,0.15)", borderWidth: 1, borderColor: "rgba(78,224,127,0.35)", marginBottom: 4 },
  discPillTxt: { color: "#4EE07F", fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  payPrice: { color: "#DDD", fontSize: 13, fontWeight: "900" },

  summaryBox: { marginTop: 14, padding: 14, backgroundColor: "#0E0E0E", borderRadius: 12, borderWidth: 1, borderColor: "#1A1A1A" },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4 },
  summaryDivider: { height: 1, backgroundColor: "#1A1A1A", marginVertical: 8 },
  summaryLbl: { color: "#AAA", fontSize: 12 },
  summaryLblBold: { color: "#EEE", fontSize: 13, fontWeight: "800" },
  summaryVal: { color: "#EEE", fontSize: 12.5, fontWeight: "700" },
  summaryTotal: { color: "#FFF", fontSize: 17, fontWeight: "900" },
  summarySaving: { color: "#4EE07F", fontSize: 10.5, fontWeight: "700", marginTop: 2 },

  deliveryBox: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 14, padding: 14, backgroundColor: "#0E0E0E", borderRadius: 12, borderWidth: 1, borderColor: "#1A1A1A" },
  deliveryLbl: { color: "#8A8A8A", fontSize: 10, fontWeight: "900", letterSpacing: 1.8 },
  deliveryTxt: { color: "#EEE", fontSize: 13, fontWeight: "700", marginTop: 3 },

  desc: { color: "#CCC", fontSize: 14, lineHeight: 21 },
  securityBox: { flexDirection: "row", gap: 10, marginTop: 20, padding: 12, backgroundColor: "#0A0A0A", borderRadius: 10, borderWidth: 1, borderColor: "#1A1A1A" },
  securityTxt: { flex: 1, color: "#AAA", fontSize: 11, lineHeight: 16 },

  footer: { flexDirection: "row", gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: "#151515", backgroundColor: "#0A0A0A" },
  footerIconBtn: { width: 48, height: 48, borderRadius: 10, backgroundColor: "#1A1A1A", borderWidth: 1, borderColor: "#2A2A2A", alignItems: "center", justifyContent: "center" },
  cartBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 48, paddingHorizontal: 14, borderRadius: 10, backgroundColor: "#1A1A1A", borderWidth: 1, borderColor: "#2A2A2A" },
  cartBtnTxt: { color: "#FFF", fontSize: 11.5, fontWeight: "900", letterSpacing: 1.2 },
  buyBtn: { flex: 1, height: 48, borderRadius: 10, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  buyTxt: { color: "#000", fontSize: 12.5, fontWeight: "900", letterSpacing: 1 },
});

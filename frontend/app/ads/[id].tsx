import { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, Image, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "../../src/icons";
import { api, Ad, ApiError } from "../../src/api";
import { useGate } from "../../src/gate";
import { formatBLX } from "../../src/blx";
import { notify } from "../../src/alerts";
import { theme, TIERS } from "../../src/theme";
import InsufficientBalanceModal from "../../src/components/InsufficientBalanceModal";

// Paleta DIAMANTE — CIANO / AZUL
const DIAMOND_LIGHT = "#A8E4EF";
const DIAMOND = "#7FD7E5";
const DIAMOND_DARK = "#4A8F99";

// Opções de pagamento — regra Diamante
const PAY_OPTIONS = [
  { id: "full", label: "Antecipado 100%", discount: 30, sub: "Melhor preço" },
  { id: "half", label: "50% de entrada", discount: 15, sub: "50% saldo na entrega" },
  { id: "entry", label: "10% de entrada", discount: 0, sub: "90% saldo na entrega" },
] as const;
type PayId = typeof PAY_OPTIONS[number]["id"];

export default function AdView() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { member, refreshMember } = useGate();
  const [ad, setAd] = useState<Ad | null>(null);
  const [pay, setPay] = useState<PayId>("full");
  const [favorited, setFavorited] = useState(false);
  const [adding, setAdding] = useState(false);
  const [favoriting, setFavoriting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [buying, setBuying] = useState(false);
  const [insuf, setInsuf] = useState<{ required: number; current: number; missing: number } | null>(null);

  useEffect(() => {
    if (!id) return;
    api.getAd(id).then(setAd).catch(() => {});
    if (member) {
      api.favIds(member.member_id).then(ids => setFavorited(ids.includes(id))).catch(() => {});
    }
  }, [id, member]);

  if (!ad) {
    return <View style={{ flex: 1, backgroundColor: theme.colors.bg, justifyContent: "center" }}><ActivityIndicator color={DIAMOND} /></View>;
  }

  const opt = PAY_OPTIONS.find(o => o.id === pay)!;
  const fullCents = Math.round(ad.price_full * 100);
  const finalCents = Math.round(fullCents * (100 - opt.discount) / 100);
  const entryPct = pay === "full" ? 100 : pay === "half" ? 50 : 10;
  const entryCents = Math.round(finalCents * entryPct / 100);
  const remainingCents = finalCents - entryCents;
  const isOwner = ad.seller_id === member?.member_id;
  const sellerTier = (ad.seller_tier || "diamond").toLowerCase();
  const sellerIsDiamond = sellerTier === "diamond";

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
      await api.cartAdd(member.member_id, ad.ad_id, 1, "ad");
      Alert.alert("No carrinho!", `${ad.title} foi adicionado ao seu carrinho.`, [
        { text: "Ver carrinho", onPress: () => router.push("/cart" as any) },
        { text: "Continuar" },
      ]);
    } catch (e: any) {
      Alert.alert("Erro", e.message || "Falha ao adicionar");
    } finally { setAdding(false); }
  };

  const handleBuyNow = async () => {
    if (!member || !ad) return;
    setBuying(true);
    try {
      const r = await api.buyAdBLX(ad.ad_id, { member_id: member.member_id, pay_option: pay });
      setShowConfirm(false);
      notify(
        "Reserva confirmada",
        (r.message || "BLX retidos em escrow.") +
          (r.remaining_cents > 0
            ? ` Saldo de ${(r.remaining_cents / 100).toFixed(2)} BLX travado na sua carteira — liberado automaticamente na entrega.`
            : ""),
      );
      refreshMember();
      setTimeout(() => router.back(), 1200);
    } catch (e: any) {
      setShowConfirm(false);
      if (e instanceof ApiError && e.error_code === "INSUFFICIENT_BLX") {
        setInsuf({
          required: e.data.required_centavos || 0,
          current: e.data.current_centavos || 0,
          missing: e.data.missing_centavos || 0,
        });
      } else {
        notify("Compra não realizada", e?.message || "Tente novamente.");
      }
    } finally { setBuying(false); }
  };

  const chatSeller = () => router.push(`/community/dm/${ad.seller_id}` as any);

  const consultDelivery = () => {
    Alert.alert(
      "Prazo de entrega",
      "Prazos e logística são combinados com o suporte. Deseja falar com o suporte agora?",
      [{ text: "Agora não" }, { text: "Falar com suporte", onPress: () => router.push("/chat" as any) }],
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }} testID="ad-details">
      <Stack.Screen options={{ title: "" }} />
      <ScrollView contentContainerStyle={{ paddingBottom: 110 }} showsVerticalScrollIndicator={false}>
        {/* HEADER — imagem COMPACTA com faixa CIANO lateral */}
        <View style={s.imageWrap}>
          {ad.images?.[0] ? (
            <Image source={{ uri: ad.images[0] }} style={s.image} resizeMode="cover" />
          ) : (
            <View style={[s.image, { backgroundColor: "#111", alignItems: "center", justifyContent: "center" }]}>
              <Ionicons name="cube-outline" size={48} color="#333" />
            </View>
          )}
          <LinearGradient colors={["rgba(5,5,5,0.55)", "transparent"]} style={s.imageTopGradient} pointerEvents="none" />
          <LinearGradient colors={["transparent", theme.colors.bg]} style={s.imageBottomGradient} pointerEvents="none" />
          <View style={s.cyanStripe} />
          {/* Botão Favoritar no canto */}
          <TouchableOpacity
            style={[s.favBtn, favorited && s.favBtnActive]}
            onPress={toggleFav}
            disabled={favoriting}
            testID="ad-favorite"
          >
            <Ionicons name={favorited ? "heart" : "heart-outline"} size={18} color={favorited ? "#FF6B6B" : "#FFF"} />
          </TouchableOpacity>
        </View>

        <View style={s.body}>
          {/* Categoria + título + selo Diamante do vendedor (pequeno) */}
          <Text style={s.category}>CÍRCULO DIAMANTE</Text>
          <View style={s.titleRow}>
            <Text style={s.title} numberOfLines={2}>{ad.title}</Text>
            {sellerIsDiamond && (
              <View style={s.sealPill}>
                <Ionicons name="diamond" size={9} color={DIAMOND} />
                <Text style={s.sealTxt}>DIAMOND</Text>
              </View>
            )}
          </View>

          {/* Vendedor — linha compacta (sem card "VENDEDOR VERIFICADO" enorme) */}
          <TouchableOpacity style={s.sellerRow} onPress={() => router.push(`/community/member/${ad.seller_id}` as any)}>
            <View style={s.sellerAv}>
              {ad.seller_avatar
                ? <Image source={{ uri: ad.seller_avatar }} style={{ width: 26, height: 26, borderRadius: 13 }} resizeMode="cover" />
                : <Text style={{ color: DIAMOND, fontWeight: "900", fontSize: 11 }}>{(ad.seller_nickname || "?").charAt(0).toUpperCase()}</Text>}
            </View>
            <Text style={s.sellerName} numberOfLines={1}>Vendedor: {ad.seller_nickname}</Text>
            <Ionicons name="chevron-forward" size={14} color="#555" />
          </TouchableOpacity>

          {/* Preço principal — gradiente CIANO */}
          <LinearGradient
            colors={[DIAMOND_LIGHT + "18", "#0A0E10", DIAMOND_DARK + "10"]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={s.priceCard}
          >
            <View>
              <Text style={s.priceLabel}>VALOR EM BLX</Text>
              <View style={s.priceRow}>
                <Text style={s.priceBLX}>{formatBLX(finalCents)}</Text>
                <Text style={s.priceUnit}>BLX</Text>
              </View>
              {opt.discount > 0 && (
                <Text style={s.priceOld}>
                  Valor cheio {formatBLX(fullCents)} BLX · {opt.label.toLowerCase()} −{opt.discount}%
                </Text>
              )}
            </View>
          </LinearGradient>

          {/* Formas de pagamento — IGUAL Catálogo, só muda a cor */}
          <Text style={s.sectionLbl}>FORMA DE PAGAMENTO</Text>
          <View style={{ gap: 6 }}>
            {PAY_OPTIONS.map(o => {
              const discCents = Math.round(fullCents * (100 - o.discount) / 100);
              const selected = pay === o.id;
              return (
                <TouchableOpacity
                  key={o.id}
                  style={[s.payOpt, selected && s.payOptActive]}
                  onPress={() => setPay(o.id)}
                  activeOpacity={0.85}
                  testID={`ad-pay-${o.id}`}
                >
                  <View style={[s.payRadio, selected && { borderColor: DIAMOND }]}>
                    {selected && <View style={[s.payRadioDot, { backgroundColor: DIAMOND }]} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.payLabel, selected && { color: "#FFF" }]}>{o.label}</Text>
                    <Text style={s.paySub}>{o.sub}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    {o.discount > 0 && (
                      <View style={s.discPill}>
                        <Text style={s.discPillTxt}>−{o.discount}%</Text>
                      </View>
                    )}
                    <Text style={[s.payPrice, selected && { color: DIAMOND_LIGHT }]}>{formatBLX(discCents)} BLX</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Resumo — IGUAL Catálogo */}
          <View style={s.summaryBox}>
            {pay !== "full" && (
              <>
                <View style={s.summaryRow}>
                  <Text style={s.summaryLbl}>Entrada ({entryPct}%)</Text>
                  <Text style={s.summaryVal}>{formatBLX(entryCents)} BLX</Text>
                </View>
                <View style={s.summaryRow}>
                  <Text style={s.summaryLbl}>Saldo na entrega</Text>
                  <Text style={s.summaryVal}>{formatBLX(remainingCents)} BLX</Text>
                </View>
                <View style={s.summaryDivider} />
              </>
            )}
            <View style={s.summaryRow}>
              <Text style={s.summaryLblBold}>Total</Text>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={[s.summaryTotal, { color: DIAMOND_LIGHT }]}>{formatBLX(finalCents)} BLX</Text>
                {opt.discount > 0 && <Text style={s.summarySaving}>economia {formatBLX(fullCents - finalCents)} BLX</Text>}
              </View>
            </View>
          </View>

          {/* Prazo de entrega — MESMO ícone do Catálogo */}
          <TouchableOpacity style={s.deliveryBox} onPress={consultDelivery} testID="ad-delivery">
            <Ionicons name="bicycle-outline" size={18} color="#AAA" />
            <View style={{ flex: 1 }}>
              <Text style={s.deliveryLbl}>PRAZO DE ENTREGA</Text>
              <Text style={s.deliveryTxt}>Consultar no suporte</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#666" />
          </TouchableOpacity>

          {/* Descrição */}
          <Text style={s.sectionLbl}>DESCRIÇÃO</Text>
          <Text style={s.desc}>{ad.description}</Text>

          {/* Info blocks IGUAL Catálogo */}
          <View style={s.infoRow}>
            <InfoBlock icon="shield-checkmark-outline" label="Escrow" value="BLX" color={DIAMOND} />
            <InfoBlock icon="lock-closed-outline" label="Acesso" value="Privado" color={DIAMOND} />
            <InfoBlock icon="rocket-outline" label="Envio" value="Discreto" color={DIAMOND} />
          </View>

          <View style={s.securityBox}>
            <Ionicons name="shield-checkmark" size={18} color="#AAA" />
            <Text style={s.securityTxt}>
              Transação privada entre membros do Círculo Diamante. Pagamento em BLEX Token (BLX) com custódia em escrow. Entrega combinada diretamente com o vendedor.
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* FOOTER — carrinho + comprar BLX */}
      {!isOwner && (
        <SafeAreaView style={s.footer} edges={["bottom"]}>
          <TouchableOpacity style={s.iconBtn} onPress={chatSeller} testID="ad-chat">
            <Ionicons name="chatbubble" size={17} color="#FFF" />
          </TouchableOpacity>
          <TouchableOpacity
            style={s.cartBtn}
            onPress={addToCart}
            disabled={adding}
            testID="ad-add-to-cart"
            activeOpacity={0.85}
          >
            {adding
              ? <ActivityIndicator color={DIAMOND} size="small" />
              : <Ionicons name="cart-outline" size={18} color={DIAMOND} />}
          </TouchableOpacity>
          <TouchableOpacity
            style={s.buyBtn}
            onPress={() => setShowConfirm(true)}
            testID="ad-buy-blx"
            activeOpacity={0.88}
          >
            <LinearGradient
              colors={[DIAMOND_LIGHT, DIAMOND, DIAMOND_DARK]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={s.buyBtnInner}
            >
              <MaterialCommunityIcons name="diamond-stone" size={16} color="#0A0A0A" />
              <Text style={s.buyBtnTxt}>COMPRAR · {formatBLX(entryCents)} BLX AGORA</Text>
            </LinearGradient>
          </TouchableOpacity>
        </SafeAreaView>
      )}

      {/* Modal de confirmação (igual Catálogo) */}
      <Modal visible={showConfirm} transparent animationType="fade" onRequestClose={() => setShowConfirm(false)}>
        <View style={s.modalBg}>
          <View style={s.modalCard}>
            <LinearGradient
              colors={[DIAMOND_LIGHT, DIAMOND, DIAMOND_DARK]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={{ height: 2, marginHorizontal: -22, marginBottom: 18 }}
            />
            <Text style={s.modalKicker}>CONFIRMAR COMPRA</Text>
            <Text style={s.modalTitle} numberOfLines={2}>{ad.title}</Text>

            <View style={s.modalRow}>
              <Text style={s.modalLbl}>Pagamento</Text>
              <Text style={s.modalVal}>{opt.label}</Text>
            </View>
            {opt.discount > 0 && (
              <View style={s.modalRow}>
                <Text style={s.modalLbl}>Desconto pagamento</Text>
                <Text style={[s.modalVal, { color: "#4EE07F" }]}>−{opt.discount}%</Text>
              </View>
            )}
            <View style={s.modalRow}>
              <Text style={s.modalLbl}>Vendedor</Text>
              <Text style={s.modalVal} numberOfLines={1}>{ad.seller_nickname}</Text>
            </View>
            <View style={[s.modalRow, { borderTopWidth: 1, borderTopColor: "#1F1F1F", paddingTop: 12, marginTop: 6 }]}>
              <Text style={[s.modalLbl, { color: DIAMOND }]}>TOTAL</Text>
              <Text style={[s.modalVal, { color: DIAMOND_LIGHT, fontSize: 17 }]}>{formatBLX(finalCents)} BLX</Text>
            </View>

            {/* Destaque: debitado agora vs travado */}
            <View style={s.splitBox}>
              <View style={s.splitCol}>
                <Text style={s.splitLbl}>A DEBITAR AGORA</Text>
                <Text style={s.splitVal}>{formatBLX(entryCents)}</Text>
                <Text style={s.splitUnit}>BLX · {entryPct}%</Text>
              </View>
              <View style={[s.splitCol, { borderLeftWidth: 1, borderLeftColor: "#1F1F1F" }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Ionicons name="lock-closed" size={9} color="#F5C150" />
                  <Text style={s.splitLbl}>TRAVADO · ENTREGA</Text>
                </View>
                <Text style={[s.splitVal, { color: "#F5C150" }]}>{formatBLX(remainingCents)}</Text>
                <Text style={s.splitUnit}>BLX · {100 - entryPct}%</Text>
              </View>
            </View>

            <Text style={s.modalNote}>
              A entrada fica em custódia (escrow) até confirmação de entrega. O saldo devedor fica TRAVADO
              na sua carteira e é liberado automaticamente na entrega.
            </Text>

            <View style={s.modalActions}>
              <TouchableOpacity style={s.modalCancel} onPress={() => setShowConfirm(false)} disabled={buying}>
                <Text style={s.modalCancelTxt}>CANCELAR</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.modalConfirm} onPress={handleBuyNow} disabled={buying} testID="ad-confirm-buy">
                <LinearGradient
                  colors={buying ? ["#555", "#333"] : [DIAMOND_LIGHT, DIAMOND, DIAMOND_DARK]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={s.modalConfirmInner}
                >
                  {buying ? <ActivityIndicator color="#000" size="small" /> : <Text style={s.modalConfirmTxt}>CONFIRMAR</Text>}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal de saldo insuficiente */}
      <InsufficientBalanceModal
        visible={!!insuf}
        onClose={() => setInsuf(null)}
        requiredCents={insuf?.required || 0}
        currentCents={insuf?.current || 0}
        missingCents={insuf?.missing || 0}
        contextLabel={`Compra Diamante · ${ad.title}`}
      />
    </View>
  );
}

function InfoBlock({ icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  return (
    <View style={s.infoBlock}>
      <Ionicons name={icon} size={14} color={color} />
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={s.infoValue}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  // HEADER — mesma altura compacta do Catálogo
  imageWrap: { backgroundColor: "#0B0B0B", position: "relative" },
  image: { width: "100%", height: 220 },
  imageTopGradient: { position: "absolute", top: 0, left: 0, right: 0, height: 60 },
  imageBottomGradient: { position: "absolute", bottom: 0, left: 0, right: 0, height: 40 },
  cyanStripe: { position: "absolute", right: 0, top: 30, bottom: 30, width: 2.5, backgroundColor: DIAMOND, opacity: 0.7 },
  favBtn: {
    position: "absolute", top: 12, right: 12,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.15)",
    alignItems: "center", justifyContent: "center",
  },
  favBtnActive: { borderColor: "rgba(255,107,107,0.5)", backgroundColor: "rgba(255,107,107,0.12)" },

  body: { padding: 16, paddingTop: 12, gap: 4 },
  category: { color: DIAMOND_DARK, fontSize: 10, fontWeight: "800", letterSpacing: 2.5 },
  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginTop: 4 },
  title: { flex: 1, color: "#FFF", fontSize: 19, fontWeight: "900", lineHeight: 24, letterSpacing: -0.3 },
  // Selo Diamond PEQUENO (igual pattern do Catálogo "OFICIAL")
  sealPill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20,
    borderWidth: 1, borderColor: DIAMOND_DARK + "80",
    backgroundColor: "rgba(127,215,229,0.08)",
  },
  sealTxt: { color: DIAMOND_LIGHT, fontSize: 8.5, fontWeight: "900", letterSpacing: 1.2 },

  // Vendedor — linha discreta
  sellerRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginTop: 10, paddingVertical: 8, paddingHorizontal: 10,
    backgroundColor: "#0B0B0B", borderRadius: 10,
    borderWidth: 1, borderColor: "rgba(127,215,229,0.15)",
  },
  sellerAv: {
    width: 28, height: 28, borderRadius: 14,
    borderWidth: 1, borderColor: DIAMOND,
    backgroundColor: "rgba(127,215,229,0.1)",
    alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  sellerName: { flex: 1, color: "#EEE", fontSize: 12.5, fontWeight: "700" },

  // Ações de gerenciamento (dono ou staff)
  ownerActions: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginTop: 12, marginBottom: 4,
  },
  ownerBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    paddingVertical: 11, borderRadius: 9,
    borderWidth: 1.2,
    backgroundColor: "#0A0A0A",
  },
  ownerBtnTxt: { fontSize: 11, fontWeight: "900", letterSpacing: 0.6 },
  modBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 8, paddingVertical: 5,
    backgroundColor: "#F5C15014",
    borderWidth: 1, borderColor: "#F5C15044",
    borderRadius: 6,
  },
  modBadgeTxt: { color: "#F5C150", fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },

  priceCard: {
    marginTop: 14, padding: 14, borderRadius: 12,
    borderWidth: 1, borderColor: "rgba(127,215,229,0.3)",
  },
  priceLabel: { color: DIAMOND_DARK, fontSize: 9.5, fontWeight: "900", letterSpacing: 2 },
  priceRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, marginTop: 4 },
  priceBLX: { color: "#FFF", fontSize: 26, fontWeight: "900", letterSpacing: -1 },
  priceUnit: { color: DIAMOND, fontSize: 13, fontWeight: "900", letterSpacing: 1.5, marginBottom: 5 },
  priceOld: { color: "#777", fontSize: 10.5, marginTop: 4, fontStyle: "italic" },

  sectionLbl: { color: DIAMOND_DARK, fontSize: 10, fontWeight: "900", letterSpacing: 2, marginTop: 18, marginBottom: 8 },

  payOpt: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 10, paddingHorizontal: 12,
    backgroundColor: "#0B0B0B", borderRadius: 10,
    borderWidth: 1, borderColor: "rgba(127,215,229,0.12)",
  },
  payOptActive: { borderColor: DIAMOND, backgroundColor: "rgba(127,215,229,0.06)" },
  payRadio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: "#444", alignItems: "center", justifyContent: "center" },
  payRadioDot: { width: 8, height: 8, borderRadius: 4 },
  payLabel: { color: "#DDD", fontSize: 12.5, fontWeight: "800" },
  paySub: { color: "#777", fontSize: 10.5, marginTop: 1 },
  discPill: {
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10,
    backgroundColor: "rgba(78,224,127,0.15)",
    borderWidth: 1, borderColor: "rgba(78,224,127,0.3)",
    marginBottom: 3,
  },
  discPillTxt: { color: "#4EE07F", fontSize: 9, fontWeight: "900" },
  payPrice: { color: "#DDD", fontSize: 12, fontWeight: "900" },

  summaryBox: {
    marginTop: 10, padding: 12,
    backgroundColor: "#0B0B0B", borderRadius: 10,
    borderWidth: 1, borderColor: "rgba(127,215,229,0.15)",
  },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 3 },
  summaryDivider: { height: 1, backgroundColor: "#1A1A1A", marginVertical: 6 },
  summaryLbl: { color: "#AAA", fontSize: 11.5 },
  summaryLblBold: { color: "#EEE", fontSize: 12.5, fontWeight: "800" },
  summaryVal: { color: "#DDD", fontSize: 12, fontWeight: "700" },
  summaryTotal: { fontSize: 16, fontWeight: "900" },
  summarySaving: { color: "#4EE07F", fontSize: 10, fontWeight: "700", marginTop: 2 },

  // Prazo — MESMO layout do Catálogo
  deliveryBox: {
    flexDirection: "row", alignItems: "center", gap: 10,
    marginTop: 12, padding: 12,
    backgroundColor: "#0B0B0B", borderRadius: 10,
    borderWidth: 1, borderColor: "rgba(127,215,229,0.15)",
  },
  deliveryLbl: { color: DIAMOND_DARK, fontSize: 9.5, fontWeight: "900", letterSpacing: 1.8 },
  deliveryTxt: { color: "#DDD", fontSize: 12, fontWeight: "700", marginTop: 2 },

  desc: { color: "#BBB", fontSize: 13, lineHeight: 19 },

  infoRow: { flexDirection: "row", gap: 6, marginTop: 14 },
  infoBlock: {
    flex: 1, padding: 10, borderRadius: 8,
    backgroundColor: "#0B0B0B",
    borderWidth: 1, borderColor: "rgba(127,215,229,0.1)",
    alignItems: "center", gap: 3,
  },
  infoLabel: { color: "#888", fontSize: 9, letterSpacing: 0.8, fontWeight: "700" },
  infoValue: { color: "#FFF", fontSize: 11, fontWeight: "800" },

  securityBox: {
    flexDirection: "row", gap: 8,
    marginTop: 14, padding: 10,
    backgroundColor: "#0A0A0A", borderRadius: 8,
    borderWidth: 1, borderColor: "#141414",
  },
  securityTxt: { flex: 1, color: "#888", fontSize: 10.5, lineHeight: 15 },

  // FOOTER (mesma estrutura do Catálogo mas com 2 botões)
  footer: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    flexDirection: "row", gap: 8,
    paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: "#050505",
    borderTopWidth: 1, borderTopColor: "rgba(127,215,229,0.18)",
  },
  iconBtn: {
    width: 46, height: 46, borderRadius: 10,
    backgroundColor: "#121212",
    borderWidth: 1, borderColor: "rgba(127,215,229,0.25)",
    alignItems: "center", justifyContent: "center",
  },
  cartBtn: {
    width: 46, height: 46, borderRadius: 10,
    backgroundColor: "#121212",
    borderWidth: 1, borderColor: "rgba(127,215,229,0.4)",
    alignItems: "center", justifyContent: "center",
  },
  buyBtn: { flex: 1, borderRadius: 12, overflow: "hidden" },
  buyBtnInner: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 14,
  },
  buyBtnTxt: { color: "#0A0A0A", fontWeight: "900", fontSize: 12.5, letterSpacing: 1.2 },

  // Modal de confirmação (mesmo layout do Catálogo)
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.85)", alignItems: "center", justifyContent: "center", padding: 24 },
  modalCard: {
    width: "100%", maxWidth: 380,
    backgroundColor: "#0B0B0B", borderRadius: 18, padding: 22,
    borderWidth: 1, borderColor: "rgba(127,215,229,0.3)", overflow: "hidden",
  },
  modalKicker: { color: DIAMOND, fontSize: 10, fontWeight: "900", letterSpacing: 2.5 },
  modalTitle: { color: "#FFF", fontSize: 16, fontWeight: "800", marginTop: 6, marginBottom: 16, lineHeight: 21 },
  modalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 5 },
  modalLbl: { color: "#888", fontSize: 12, fontWeight: "700", letterSpacing: 0.5 },
  modalVal: { color: "#FFF", fontSize: 13, fontWeight: "800" },
  modalNote: { color: "#666", fontSize: 11, marginTop: 14, textAlign: "center", fontStyle: "italic" },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 18 },

  // Split entrada / travado
  splitBox: {
    flexDirection: "row", marginTop: 14,
    backgroundColor: "#070707", borderRadius: 10,
    borderWidth: 1, borderColor: "#1A1A1A",
  },
  splitCol: { flex: 1, padding: 12, alignItems: "center" },
  splitLbl: { color: "#888", fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  splitVal: { color: "#FFF", fontSize: 18, fontWeight: "900", marginTop: 4 },
  splitUnit: { color: "#666", fontSize: 9, fontWeight: "800", letterSpacing: 1, marginTop: 2 },
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

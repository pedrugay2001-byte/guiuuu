import { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Image, TouchableOpacity,
  ActivityIndicator, Alert, Dimensions,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, Ad, BlxWallet } from "../../src/api";
import { useGate } from "../../src/gate";
import { TIERS } from "../../src/theme";
import ScreenHeader from "../../src/screen-header";
import { formatBLX } from "../../src/blx";

const DISC: Record<string, number> = { silver: 0, gold: 15, diamond: 30 };
const { width } = Dimensions.get("window");

/**
 * Marketplace — Página do anúncio.
 * Compra é feita em BLX (BLEX Token), liquidação em escrow.
 *
 * IMPORTANTE: Preço `price_full` do anúncio representa o valor em BLX
 * (unidades inteiras). O saldo do comprador é armazenado em `balance_centavos`
 * para precisão total. Convertemos `price_full * 100` para comparar.
 */
export default function AdView() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { member } = useGate();
  const [ad, setAd] = useState<Ad | null>(null);
  const [wallet, setWallet] = useState<BlxWallet | null>(null);
  const [buying, setBuying] = useState(false);

  useEffect(() => {
    if (!id) return;
    api.getAd(id).then(setAd).catch(() => {});
    if (member) api.blxWallet(member.member_id).then(setWallet).catch(() => {});
  }, [id, member]);

  if (!ad) return <View style={{ flex: 1, backgroundColor: "#050505", justifyContent: "center" }}><ActivityIndicator color="#FFF" /></View>;

  const myDisc = DISC[member?.tier || "silver"];
  const finalBlx = Number((ad.price_full * (100 - myDisc) / 100).toFixed(2));
  const finalCents = Math.round(finalBlx * 100);
  const isOwner = ad.seller_id === member?.member_id;
  const tier = TIERS[ad.seller_tier || "diamond"];
  const balanceCents = wallet?.balance_centavos || 0;
  const canAfford = balanceCents >= finalCents;

  const buy = () => {
    if (!member) return;
    if (isOwner) { Alert.alert("Aviso", "Você não pode comprar seu próprio anúncio."); return; }
    if (!canAfford) {
      Alert.alert(
        "Saldo BLX insuficiente",
        `Você precisa de ${formatBLX(finalCents)} BLX. Seu saldo atual: ${formatBLX(balanceCents)} BLX.\n\nPeça um crédito à administração ou receba BLX de outro membro.`,
        [
          { text: "Falar com suporte", onPress: () => router.push("/chat" as any) },
          { text: "Cancelar" },
        ],
      );
      return;
    }
    Alert.alert(
      "Confirmar compra em BLX",
      `${ad.title}\n\nTotal: ${formatBLX(finalCents)} BLX (desconto ${myDisc}%)\n\nO valor fica em ESCROW até você confirmar o recebimento. O vendedor não consegue sacar enquanto você não liberar.`,
      [
        { text: "Cancelar" },
        { text: "CONFIRMAR COMPRA", onPress: async () => {
          setBuying(true);
          try {
            await api.walletPurchase(ad.ad_id, member.member_id, 1);
            Alert.alert(
              "Compra efetuada em BLX!",
              "O vendedor foi notificado. Quando receber o produto, confirme o recebimento no seu Banco para liberar o pagamento.",
              [
                { text: "Falar com vendedor", onPress: () => router.push(`/community/dm/${ad.seller_id}` as any) },
                { text: "Ver Banco", onPress: () => router.push("/(tabs)/wallet" as any) },
              ],
            );
          } catch (e: any) { Alert.alert("Erro", e.message); } finally { setBuying(false); }
        } },
      ],
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

        <View style={{ padding: 16 }}>
          <Text style={styles.title}>{ad.title}</Text>
          <TouchableOpacity style={styles.sellerRow} onPress={() => router.push(`/community/member/${ad.seller_id}` as any)}>
            <View style={[styles.sellerAv, { backgroundColor: tier.color + "22", borderColor: tier.color }]}>
              {ad.seller_avatar ? <Image source={{ uri: ad.seller_avatar }} style={{ width: 30, height: 30, borderRadius: 15 }} /> : <Text style={{ color: tier.color, fontWeight: "900" }}>{(ad.seller_nickname || "?").charAt(0)}</Text>}
            </View>
            <View>
              <Text style={styles.sellerName}>{ad.seller_nickname}</Text>
              <Text style={[styles.sellerTier, { color: tier.color }]}>{tier.label.toUpperCase()}</Text>
            </View>
          </TouchableOpacity>

          {/* Preço em BLX */}
          <Text style={styles.priceLbl}>PREÇO DE TABELA</Text>
          <View style={styles.priceRow}>
            <Text style={styles.priceNew}>{formatBLX(Math.round(ad.price_full * 100))}</Text>
            <Text style={styles.priceUnit}>BLX</Text>
          </View>

          <View style={styles.plansTable}>
            <Text style={styles.plansTitle}>VALOR POR PLANO</Text>
            <View style={styles.planRow}>
              <View style={[styles.planDot, { backgroundColor: "#C8C8C8" }]} />
              <Text style={styles.planName}>Silver</Text>
              <Text style={styles.planDisc}>sem desconto</Text>
              <Text style={styles.planPrice}>{formatBLX(Math.round(ad.price_full * 100))} BLX</Text>
            </View>
            <View style={styles.planRow}>
              <View style={[styles.planDot, { backgroundColor: "#D4AF37" }]} />
              <Text style={styles.planName}>Gold</Text>
              <Text style={styles.planDisc}>−15%</Text>
              <Text style={styles.planPrice}>{formatBLX(Math.round(ad.price_full * 85))} BLX</Text>
            </View>
            <View style={styles.planRow}>
              <View style={[styles.planDot, { backgroundColor: "#7FD7E5" }]} />
              <Text style={styles.planName}>Diamond</Text>
              <Text style={styles.planDisc}>−30%</Text>
              <Text style={styles.planPrice}>{formatBLX(Math.round(ad.price_full * 70))} BLX</Text>
            </View>
            <View style={styles.yourPriceBox}>
              <Text style={styles.yourPriceLbl}>VOCÊ PAGA ({tier.label.toUpperCase()}):</Text>
              <Text style={styles.yourPrice}>{formatBLX(finalCents)} BLX</Text>
            </View>
          </View>

          {/* Saldo do comprador */}
          {!isOwner && member && (
            <View style={[styles.balanceBox, !canAfford && styles.balanceBoxWarn]}>
              <Ionicons
                name={canAfford ? "wallet" : "warning"}
                size={16}
                color={canAfford ? "#4EE07F" : "#F5C150"}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.balanceLbl}>
                  {canAfford ? "SEU SALDO BLX" : "SALDO BLX INSUFICIENTE"}
                </Text>
                <Text style={[styles.balanceVal, !canAfford && { color: "#F5C150" }]}>
                  {formatBLX(balanceCents)} BLX
                </Text>
              </View>
              {!canAfford && (
                <TouchableOpacity
                  style={styles.topupBtn}
                  onPress={() => router.push("/chat" as any)}
                  testID="ad-request-topup"
                >
                  <Text style={styles.topupBtnTxt}>SOLICITAR</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          <Text style={styles.descLbl}>DESCRIÇÃO</Text>
          <Text style={styles.desc}>{ad.description}</Text>

          <View style={styles.securityBox}>
            <Ionicons name="shield-checkmark" size={20} color="#7FD7E5" />
            <Text style={styles.securityTxt}>
              Pagamento em BLEX Token (BLX). Valor fica em escrow até você confirmar o recebimento — o vendedor só saca depois da liberação.
            </Text>
          </View>
        </View>
      </ScrollView>

      {!isOwner && (
        <View style={styles.footer}>
          <TouchableOpacity style={styles.chatBtn} onPress={() => router.push(`/community/dm/${ad.seller_id}` as any)}>
            <Ionicons name="chatbubble" size={18} color="#FFF" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.buyBtn, buying && { opacity: 0.6 }, !canAfford && styles.buyBtnDisabled]}
            onPress={buy}
            disabled={buying}
            testID="ad-buy"
          >
            {buying ? <ActivityIndicator color="#000" /> : (
              <Text style={[styles.buyTxt, !canAfford && { color: "#666" }]}>
                {canAfford ? `COMPRAR · ${formatBLX(finalCents)} BLX` : "SALDO INSUFICIENTE"}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { color: "#FFF", fontSize: 20, fontWeight: "900", lineHeight: 26 },
  sellerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },
  sellerAv: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  sellerName: { color: "#EEE", fontSize: 13, fontWeight: "800" },
  sellerTier: { fontSize: 9, fontWeight: "900", letterSpacing: 1.5, marginTop: 1 },
  priceLbl: { color: "#888", fontSize: 9, fontWeight: "900", letterSpacing: 2, marginTop: 16 },
  priceRow: { flexDirection: "row", alignItems: "baseline", gap: 6, marginTop: 4 },
  priceNew: { color: "#FFF", fontSize: 30, fontWeight: "900" },
  priceUnit: { color: "#D4AF37", fontSize: 13, fontWeight: "900", letterSpacing: 1.5 },
  plansTable: { marginTop: 14, padding: 14, backgroundColor: "#0F0F0F", borderRadius: 12, borderWidth: 1, borderColor: "#1A1A1A" },
  plansTitle: { color: "#888", fontSize: 9, fontWeight: "900", letterSpacing: 2, marginBottom: 10 },
  planRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 7, borderTopWidth: 1, borderTopColor: "#151515" },
  planDot: { width: 8, height: 8, borderRadius: 4 },
  planName: { color: "#DDD", fontSize: 12, fontWeight: "800", width: 70 },
  planDisc: { flex: 1, color: "#888", fontSize: 11 },
  planPrice: { color: "#EEE", fontSize: 12, fontWeight: "800" },
  yourPriceBox: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#222", flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  yourPriceLbl: { color: "#EEE", fontSize: 10, fontWeight: "900", letterSpacing: 1.5 },
  yourPrice: { color: "#FFF", fontSize: 16, fontWeight: "900" },

  balanceBox: {
    flexDirection: "row", alignItems: "center", gap: 12,
    marginTop: 14, padding: 12,
    backgroundColor: "#0F0F0F", borderRadius: 10,
    borderWidth: 1, borderColor: "#1A1A1A",
  },
  balanceBoxWarn: {
    backgroundColor: "rgba(245,193,80,0.06)",
    borderColor: "rgba(245,193,80,0.25)",
  },
  balanceLbl: { color: "#888", fontSize: 9, fontWeight: "900", letterSpacing: 1.8 },
  balanceVal: { color: "#FFF", fontSize: 14, fontWeight: "900", marginTop: 3 },
  topupBtn: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
    backgroundColor: "#1A1A1A", borderWidth: 1, borderColor: "#2A2A2A",
  },
  topupBtnTxt: { color: "#FFF", fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },

  descLbl: { color: "#888", fontSize: 10, fontWeight: "900", letterSpacing: 2, marginTop: 24, marginBottom: 8 },
  desc: { color: "#CCC", fontSize: 14, lineHeight: 21 },
  securityBox: {
    flexDirection: "row", gap: 10, marginTop: 20, padding: 12,
    backgroundColor: "rgba(127,215,229,0.06)",
    borderRadius: 10, borderWidth: 1, borderColor: "rgba(127,215,229,0.2)",
  },
  securityTxt: { flex: 1, color: "#C8E8EE", fontSize: 11, lineHeight: 16 },
  footer: { flexDirection: "row", gap: 10, padding: 14, borderTopWidth: 1, borderTopColor: "#151515", backgroundColor: "#0A0A0A" },
  chatBtn: { width: 52, height: 50, borderRadius: 10, backgroundColor: "#222", alignItems: "center", justifyContent: "center" },
  buyBtn: { flex: 1, height: 50, borderRadius: 10, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  buyBtnDisabled: { backgroundColor: "#1A1A1A" },
  buyTxt: { color: "#000", fontSize: 13, fontWeight: "900", letterSpacing: 1 },
});

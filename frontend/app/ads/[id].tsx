import { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Image, TouchableOpacity,
  ActivityIndicator, Alert, Dimensions,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, Ad, formatBRL, Wallet } from "../../src/api";
import { useGate } from "../../src/gate";
import { TIERS } from "../../src/theme";

const DISC: Record<string, number> = { silver: 0, gold: 15, diamond: 30 };
const { width } = Dimensions.get("window");

export default function AdView() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { member } = useGate();
  const [ad, setAd] = useState<Ad | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [buying, setBuying] = useState(false);

  useEffect(() => {
    if (!id) return;
    api.getAd(id).then(setAd).catch(() => {});
    if (member) api.getWallet(member.member_id).then(setWallet).catch(() => {});
  }, [id, member]);

  if (!ad) return <View style={{ flex: 1, backgroundColor: "#050505", justifyContent: "center" }}><ActivityIndicator color="#FFF" /></View>;

  const myDisc = DISC[member?.tier || "silver"];
  const final = ad.price_full * (100 - myDisc) / 100;
  const isOwner = ad.seller_id === member?.member_id;
  const tier = TIERS[ad.seller_tier || "diamond"];
  const canAfford = wallet && wallet.balance >= final;

  const buy = () => {
    if (!member) return;
    if (isOwner) { Alert.alert("Aviso", "Você não pode comprar seu próprio anúncio."); return; }
    if (!canAfford) {
      Alert.alert("Saldo insuficiente", `Você precisa de ${formatBRL(final)} em BLACK Coins. Saldo atual: ${formatBRL(wallet?.balance || 0)}.`, [
        { text: "Recarregar agora", onPress: () => router.push("/wallet/topup") }, { text: "Cancelar" },
      ]);
      return;
    }
    Alert.alert("Confirmar compra", `${ad.title}\n\nTotal: ${formatBRL(final)} (desc. ${myDisc}%)\n\nO valor fica em ESCROW até você confirmar o recebimento.`, [
      { text: "Cancelar" },
      { text: "CONFIRMAR COMPRA", onPress: async () => {
        setBuying(true);
        try {
          const tx = await api.walletPurchase(ad.ad_id, member.member_id, 1);
          Alert.alert("Compra efetuada!", "O vendedor foi notificado. Quando receber o produto, confirme no seu Banco.", [
            { text: "Falar com vendedor", onPress: () => router.push(`/community/dm/${ad.seller_id}`) },
            { text: "Ver Banco", onPress: () => router.push("/(tabs)/wallet") },
          ]);
        } catch (e: any) { Alert.alert("Erro", e.message); } finally { setBuying(false); }
      } },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#050505" }}>
      <Stack.Screen options={{ title: "Anúncio", headerStyle: { backgroundColor: "#050505" }, headerTintColor: "#FFF" }} />
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
          <TouchableOpacity style={styles.sellerRow} onPress={() => router.push(`/community/member/${ad.seller_id}`)}>
            <View style={[styles.sellerAv, { backgroundColor: tier.color + "22", borderColor: tier.color }]}>
              {ad.seller_avatar ? <Image source={{ uri: ad.seller_avatar }} style={{ width: 30, height: 30, borderRadius: 15 }} /> : <Text style={{ color: tier.color, fontWeight: "900" }}>{(ad.seller_nickname || "?").charAt(0)}</Text>}
            </View>
            <View>
              <Text style={styles.sellerName}>{ad.seller_nickname}</Text>
              <Text style={[styles.sellerTier, { color: tier.color }]}>{tier.label.toUpperCase()}</Text>
            </View>
          </TouchableOpacity>

          {myDisc > 0 && <Text style={styles.priceOld}>{formatBRL(ad.price_full)}</Text>}
          <Text style={styles.priceNew}>{formatBRL(final)}</Text>
          {myDisc > 0 && (
            <View style={styles.discBadge}>
              <Ionicons name="pricetag" size={12} color="#4EE07F" />
              <Text style={styles.discTxt}>−{myDisc}% automático por ser {tier.label}</Text>
            </View>
          )}

          <Text style={styles.descLbl}>DESCRIÇÃO</Text>
          <Text style={styles.desc}>{ad.description}</Text>

          <View style={styles.securityBox}>
            <Ionicons name="shield-checkmark" size={20} color="#D4AF37" />
            <Text style={styles.securityTxt}>Pagamento em BLACK Coins em escrow. Valor só liberado ao vendedor após você confirmar o recebimento.</Text>
          </View>
        </View>
      </ScrollView>

      {!isOwner && (
        <View style={styles.footer}>
          <TouchableOpacity style={styles.chatBtn} onPress={() => router.push(`/community/dm/${ad.seller_id}`)}>
            <Ionicons name="chatbubble" size={18} color="#FFF" />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.buyBtn, buying && { opacity: 0.6 }]} onPress={buy} disabled={buying} testID="ad-buy">
            {buying ? <ActivityIndicator color="#000" /> : <Text style={styles.buyTxt}>COMPRAR · {formatBRL(final)}</Text>}
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
  priceOld: { color: "#666", fontSize: 14, textDecorationLine: "line-through", marginTop: 16 },
  priceNew: { color: "#FFF", fontSize: 30, fontWeight: "900", marginTop: 4 },
  discBadge: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", marginTop: 8, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: "#4EE07F", backgroundColor: "rgba(78,224,127,0.08)" },
  discTxt: { color: "#4EE07F", fontSize: 11, fontWeight: "800" },
  descLbl: { color: "#888", fontSize: 10, fontWeight: "900", letterSpacing: 2, marginTop: 24, marginBottom: 8 },
  desc: { color: "#CCC", fontSize: 14, lineHeight: 21 },
  securityBox: { flexDirection: "row", gap: 10, marginTop: 20, padding: 12, backgroundColor: "#111", borderRadius: 10, borderWidth: 1, borderColor: "#1F1F1F" },
  securityTxt: { flex: 1, color: "#BBB", fontSize: 11, lineHeight: 16 },
  footer: { flexDirection: "row", gap: 10, padding: 14, borderTopWidth: 1, borderTopColor: "#151515", backgroundColor: "#0A0A0A" },
  chatBtn: { width: 52, height: 50, borderRadius: 10, backgroundColor: "#222", alignItems: "center", justifyContent: "center" },
  buyBtn: { flex: 1, height: 50, borderRadius: 10, backgroundColor: "#D4AF37", alignItems: "center", justifyContent: "center" },
  buyTxt: { color: "#000", fontSize: 13, fontWeight: "900", letterSpacing: 1 },
});

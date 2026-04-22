import { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, TextInput, FlatList, TouchableOpacity,
  ActivityIndicator, Image, RefreshControl,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, Ad, formatBRL } from "../../src/api";
import { useGate } from "../../src/gate";
import { TIERS } from "../../src/theme";

const DISC: Record<string, number> = { silver: 0, gold: 15, diamond: 30 };

export default function AdsIndex() {
  const router = useRouter();
  const { member } = useGate();
  const [q, setQ] = useState("");
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { const d = await api.listAds({ q }); setAds(d); }
    finally { setLoading(false); setRefreshing(false); }
  }, [q]);

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  const canSell = member?.tier === "diamond";
  const myDisc = DISC[member?.tier || "silver"];

  return (
    <View style={{ flex: 1, backgroundColor: "#050505" }}>
      <Stack.Screen options={{ title: "Marketplace", headerStyle: { backgroundColor: "#050505" }, headerTintColor: "#FFF", headerRight: () => canSell ? (
        <TouchableOpacity onPress={() => router.push("/ads/create")} testID="ad-create" style={{ paddingHorizontal: 8 }}>
          <Ionicons name="add-circle" size={26} color="#D4AF37" />
        </TouchableOpacity>
      ) : null }} />

      <View style={styles.headerCard}>
        <View style={styles.searchRow}>
          <Ionicons name="search" size={16} color="#888" />
          <TextInput value={q} onChangeText={setQ} placeholder="Buscar anúncios..." placeholderTextColor="#666" style={styles.searchInput} />
        </View>
        <View style={styles.discPill}>
          <Ionicons name="pricetag" size={12} color="#D4AF37" />
          <Text style={styles.discTxt}>SEU DESCONTO: {myDisc}%</Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color="#FFF" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={ads}
          keyExtractor={(a) => a.ad_id}
          numColumns={2}
          columnWrapperStyle={{ gap: 10, paddingHorizontal: 14 }}
          contentContainerStyle={{ gap: 10, paddingVertical: 10, paddingBottom: 40 }}
          refreshControl={<RefreshControl tintColor="#FFF" refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          ListEmptyComponent={<View style={styles.empty}><Ionicons name="storefront-outline" size={40} color="#555" /><Text style={styles.emptyTxt}>Sem anúncios ainda.</Text>{canSell && <Text style={styles.emptyHint}>Você é BLACK DIAMOND — toque em + para criar o primeiro.</Text>}</View>}
          renderItem={({ item }) => {
            const final = item.price_full * (100 - myDisc) / 100;
            const tier = TIERS[item.seller_tier || "diamond"];
            return (
              <TouchableOpacity style={styles.card} onPress={() => router.push(`/ads/${item.ad_id}`)} activeOpacity={0.85} testID={`ad-${item.ad_id}`}>
                {item.images?.[0] ? (
                  <Image source={{ uri: item.images[0] }} style={styles.img} />
                ) : (
                  <View style={[styles.img, { backgroundColor: "#161616", alignItems: "center", justifyContent: "center" }]}>
                    <Ionicons name="cube-outline" size={28} color="#444" />
                  </View>
                )}
                <View style={styles.cardBody}>
                  <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
                  <View style={styles.sellerRow}>
                    <Ionicons name={tier.icon as any} size={10} color={tier.color} />
                    <Text style={[styles.seller, { color: tier.color }]}>{item.seller_nickname}</Text>
                  </View>
                  {myDisc > 0 && <Text style={styles.priceOld}>{formatBRL(item.price_full)}</Text>}
                  <Text style={styles.priceNew}>{formatBRL(final)}</Text>
                  {myDisc > 0 && <Text style={styles.disc}>−{myDisc}% aplicado</Text>}
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  headerCard: { padding: 12, gap: 10, borderBottomWidth: 1, borderBottomColor: "#151515" },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#121212", paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10 },
  searchInput: { flex: 1, color: "#EEE", fontSize: 14 },
  discPill: { flexDirection: "row", gap: 6, alignSelf: "flex-start", alignItems: "center", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: "#D4AF37", backgroundColor: "rgba(212,175,55,0.06)" },
  discTxt: { color: "#D4AF37", fontSize: 10, fontWeight: "900", letterSpacing: 1.5 },
  card: { flex: 1, backgroundColor: "#111", borderRadius: 10, borderWidth: 1, borderColor: "#1F1F1F", overflow: "hidden" },
  img: { width: "100%", height: 140 },
  cardBody: { padding: 10 },
  title: { color: "#EEE", fontSize: 13, fontWeight: "700", minHeight: 34 },
  sellerRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  seller: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  priceOld: { color: "#777", fontSize: 11, textDecorationLine: "line-through", marginTop: 6 },
  priceNew: { color: "#FFF", fontSize: 16, fontWeight: "900", marginTop: 2 },
  disc: { color: "#4EE07F", fontSize: 10, fontWeight: "800", marginTop: 2 },
  empty: { alignItems: "center", marginTop: 60, gap: 10 },
  emptyTxt: { color: "#888", fontSize: 14, fontWeight: "700" },
  emptyHint: { color: "#D4AF37", fontSize: 11, textAlign: "center", paddingHorizontal: 40 },
});

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  Image, ActivityIndicator, ScrollView, FlatList, Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { api, Category, Product, Ad, formatBRL } from "../../src/api";
import { useGate } from "../../src/gate";
import { theme } from "../../src/theme";

const { width } = Dimensions.get("window");
const GOLD = "#D4AF37";

const CAT_META: Record<string, { label: string; icon: string; lib: "ion" | "mci"; color: string }> = {
  emagrecedores: { label: "Emagrecedores", icon: "flash", lib: "ion", color: "#FF6B35" },
  peptideos:     { label: "Peptídeos",    icon: "flask", lib: "ion", color: "#7FD7E5" },
  landerlan:     { label: "Landerlan",    icon: "shield-checkmark", lib: "ion", color: "#D4AF37" },
  hormonios:     { label: "Hormônios",    icon: "sparkles", lib: "ion", color: "#E8C96B" },
  pre_treinos:   { label: "Pré-treinos",  icon: "rocket", lib: "ion", color: "#FF4757" },
  suplementos:   { label: "Suplementos",  icon: "nutrition", lib: "ion", color: "#2ECC71" },
  bem_estar:     { label: "Bem-estar",    icon: "leaf", lib: "ion", color: "#95D5B2" },
  tecnologia:    { label: "Tecnologia",   icon: "hardware-chip", lib: "ion", color: "#B794F4" },
  outros:        { label: "Outros",       icon: "cube", lib: "ion", color: "#8E9097" },
};

export default function Marketplace() {
  const router = useRouter();
  const { member } = useGate();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("all");
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [cats, prods, aa] = await Promise.all([
        api.categories().catch(() => []),
        api.listProducts({ category: cat, q }).catch(() => []),
        api.listAds().catch(() => []),
      ]);
      setCategories(cats);
      setProducts(prods);
      setAds(aa.slice(0, 8));
    } finally { setLoading(false); }
  }, [cat, q]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  // Tier-based discount for member preview
  const tierDisc = useMemo(() => {
    if (member?.tier === "diamond") return 0.30;
    if (member?.tier === "gold") return 0.15;
    return 0;
  }, [member]);

  const priceFor = (base: number) => Math.round(base * (1 - tierDisc));

  const filteredCats = categories.filter(c => c.id !== "all");

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }} edges={["top"]} testID="marketplace-screen">
      {/* Search */}
      <View style={st.searchRow}>
        <Ionicons name="search" size={16} color="#777" />
        <TextInput
          style={st.searchInput}
          value={q} onChangeText={setQ}
          placeholder="Buscar produto, categoria, marca..."
          placeholderTextColor="#666"
          autoCapitalize="none"
          testID="marketplace-search"
        />
        {q.length > 0 && (
          <TouchableOpacity onPress={() => setQ("")} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <Ionicons name="close-circle" size={16} color="#666" />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* SAÚDE — Premium featured banner */}
        <TouchableOpacity
          style={st.healthBanner}
          onPress={() => router.push({ pathname: "/category/[id]", params: { id: "emagrecedores" } })}
          activeOpacity={0.9}
          testID="saude-banner"
        >
          <View style={st.healthBannerGlow} />
          <View style={st.healthLeft}>
            <View style={st.healthIconRing}>
              <MaterialCommunityIcons name="heart-pulse" size={28} color={GOLD} />
            </View>
            <View style={{ marginLeft: 14, flex: 1 }}>
              <Text style={st.healthKicker}>CATEGORIA PRINCIPAL</Text>
              <Text style={st.healthTitle}>SAÚDE</Text>
              <Text style={st.healthSub}>Emagrecedores · Peptídeos · Landerlan · TRT</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={22} color={GOLD} />
        </TouchableOpacity>

        {/* Categories row */}
        <Text style={st.sectionTitle}>CATEGORIAS</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.catRow}>
          <CatChip
            active={cat === "all"}
            onPress={() => setCat("all")}
            label="Todos"
            icon="apps"
            color="#EEE"
          />
          {filteredCats.map((c) => {
            const meta = CAT_META[c.id] || { label: c.name, icon: c.icon || "cube", lib: "ion" as const, color: "#888" };
            return (
              <CatChip
                key={c.id}
                active={cat === c.id}
                onPress={() => setCat(c.id)}
                label={meta.label}
                icon={meta.icon}
                color={meta.color}
              />
            );
          })}
        </ScrollView>

        {/* Marketplace P2P — ads from Diamond members */}
        {ads.length > 0 && (
          <View style={{ marginTop: 8 }}>
            <View style={st.sectionHead}>
              <Text style={st.sectionTitle}>MEMBROS BLACK DIAMOND</Text>
              <TouchableOpacity onPress={() => router.push("/ads")} hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}>
                <Text style={st.sectionLink}>Ver todos</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={ads}
              keyExtractor={(a) => a.ad_id}
              contentContainerStyle={{ paddingHorizontal: 14, gap: 10 }}
              renderItem={({ item }) => <AdCard ad={item} onPress={() => router.push({ pathname: "/ads/[id]", params: { id: item.ad_id } })} />}
            />
          </View>
        )}

        {/* Products grid */}
        <View style={st.sectionHead}>
          <Text style={st.sectionTitle}>CATÁLOGO OFICIAL</Text>
          {loading ? <ActivityIndicator color="#888" size="small" /> : <Text style={st.sectionCount}>{products.length} itens</Text>}
        </View>

        {loading ? (
          <View style={{ padding: 32, alignItems: "center" }}>
            <ActivityIndicator color={GOLD} />
          </View>
        ) : products.length === 0 ? (
          <View style={st.emptyBox}>
            <Ionicons name="search" size={32} color="#444" />
            <Text style={st.emptyTitle}>Nada encontrado</Text>
            <Text style={st.emptySub}>Tente outra categoria ou palavra.</Text>
          </View>
        ) : (
          <View style={st.grid}>
            {products.map((p) => (
              <TouchableOpacity
                key={p.product_id}
                style={st.productCard}
                onPress={() => router.push({ pathname: "/product/[id]", params: { id: p.product_id } })}
                activeOpacity={0.88}
              >
                <View style={st.prodImgWrap}>
                  {p.image_url ? (
                    <Image source={{ uri: p.image_url }} style={st.prodImg} resizeMode="cover" />
                  ) : (
                    <View style={[st.prodImg, { backgroundColor: "#141414", alignItems: "center", justifyContent: "center" }]}>
                      <Ionicons name="cube" size={26} color="#444" />
                    </View>
                  )}
                </View>
                <Text style={st.prodName} numberOfLines={2}>{p.name}</Text>
                <View style={{ marginTop: 6 }}>
                  {tierDisc > 0 ? (
                    <>
                      <Text style={st.prodPriceOld}>{formatBRL(p.member_price)}</Text>
                      <Text style={st.prodPrice}>{formatBRL(priceFor(p.member_price))}</Text>
                    </>
                  ) : (
                    <Text style={st.prodPrice}>{formatBRL(p.member_price)}</Text>
                  )}
                </View>
                {tierDisc > 0 && (
                  <View style={st.discBadge}>
                    <Text style={st.discBadgeTxt}>-{Math.round(tierDisc * 100)}%</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function CatChip({ active, onPress, label, icon, color }: { active: boolean; onPress: () => void; label: string; icon: string; color: string }) {
  return (
    <TouchableOpacity onPress={onPress} style={[st.chip, active && { backgroundColor: "#1A1A1A", borderColor: color }]} activeOpacity={0.85}>
      <Ionicons name={icon as any} size={14} color={active ? color : "#888"} />
      <Text style={[st.chipTxt, active && { color: "#FFF" }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function AdCard({ ad, onPress }: { ad: Ad; onPress: () => void }) {
  const img = ad.images?.[0];
  return (
    <TouchableOpacity onPress={onPress} style={st.adCard} activeOpacity={0.88}>
      <View style={st.adImgWrap}>
        {img ? <Image source={{ uri: img }} style={st.adImg} /> : (
          <View style={[st.adImg, { backgroundColor: "#141414", alignItems: "center", justifyContent: "center" }]}>
            <Ionicons name="diamond" size={22} color="#7FD7E5" />
          </View>
        )}
        <View style={st.adDiamondPill}>
          <Ionicons name="diamond" size={10} color="#000" />
          <Text style={st.adDiamondTxt}>DIAMOND</Text>
        </View>
      </View>
      <Text style={st.adTitle} numberOfLines={2}>{ad.title}</Text>
      <Text style={st.adSeller} numberOfLines={1}>@{ad.seller_nickname || "membro"}</Text>
      <Text style={st.adPrice}>{formatBRL(ad.price_full)}</Text>
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  searchRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginHorizontal: 14, marginTop: 10, marginBottom: 8,
    paddingHorizontal: 14, paddingVertical: 11,
    backgroundColor: "#101010",
    borderWidth: 1, borderColor: "#1F1F1F", borderRadius: 10,
  },
  searchInput: { flex: 1, color: "#EEE", fontSize: 14 },

  healthBanner: {
    flexDirection: "row", alignItems: "center",
    marginHorizontal: 14, marginTop: 10, marginBottom: 8,
    paddingHorizontal: 16, paddingVertical: 16,
    backgroundColor: "#0B0B0B",
    borderWidth: 1.5, borderColor: "rgba(212,175,55,0.45)",
    borderRadius: 16, position: "relative", overflow: "hidden",
  },
  healthBannerGlow: {
    position: "absolute", top: -40, right: -40,
    width: 180, height: 180, borderRadius: 90,
    backgroundColor: "rgba(212,175,55,0.06)",
  },
  healthLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
  healthIconRing: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: "rgba(212,175,55,0.12)",
    borderWidth: 1.5, borderColor: "rgba(212,175,55,0.4)",
    alignItems: "center", justifyContent: "center",
  },
  healthKicker: { color: GOLD, fontSize: 9, fontWeight: "900", letterSpacing: 2.5 },
  healthTitle: { color: "#FFF", fontSize: 22, fontWeight: "900", letterSpacing: 3, marginTop: 2 },
  healthSub: { color: "#888", fontSize: 11, marginTop: 3, fontWeight: "600" },

  sectionTitle: { color: "#A3A3A3", fontSize: 10, fontWeight: "900", letterSpacing: 2.5, marginLeft: 14, marginTop: 18, marginBottom: 10 },
  sectionHead: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingRight: 16 },
  sectionLink: { color: GOLD, fontSize: 11, fontWeight: "800", letterSpacing: 1, marginTop: 18, marginBottom: 10 },
  sectionCount: { color: "#666", fontSize: 11, fontWeight: "700", marginTop: 18, marginBottom: 10 },

  catRow: { paddingHorizontal: 14, gap: 8, paddingRight: 24 },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: "#0E0E0E",
    borderWidth: 1, borderColor: "#1F1F1F", borderRadius: 20,
  },
  chipTxt: { color: "#888", fontSize: 12, fontWeight: "700" },

  adCard: {
    width: 160,
    backgroundColor: "#0B0B0B",
    borderWidth: 1, borderColor: "#1F1F1F", borderRadius: 12,
    padding: 10,
  },
  adImgWrap: { position: "relative" },
  adImg: { width: "100%", height: 110, borderRadius: 8, backgroundColor: "#141414" },
  adDiamondPill: {
    position: "absolute", top: 6, left: 6,
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: "#7FD7E5", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
  },
  adDiamondTxt: { color: "#000", fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  adTitle: { color: "#EEE", fontSize: 12, fontWeight: "700", marginTop: 8, minHeight: 30 },
  adSeller: { color: "#777", fontSize: 10, marginTop: 2, fontWeight: "600" },
  adPrice: { color: "#FFF", fontSize: 14, fontWeight: "900", marginTop: 4 },

  grid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 10, gap: 8 },
  productCard: {
    width: (width - 36) / 2,
    backgroundColor: "#0B0B0B",
    borderWidth: 1, borderColor: "#1F1F1F", borderRadius: 12,
    padding: 10, position: "relative",
  },
  prodImgWrap: { position: "relative" },
  prodImg: { width: "100%", aspectRatio: 1.15, borderRadius: 8 },
  prodName: { color: "#EEE", fontSize: 12, fontWeight: "700", marginTop: 8, minHeight: 32 },
  prodPriceOld: { color: "#555", fontSize: 10, fontWeight: "700", textDecorationLine: "line-through" },
  prodPrice: { color: "#FFF", fontSize: 15, fontWeight: "900" },
  discBadge: { position: "absolute", top: 14, right: 14, backgroundColor: GOLD, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4 },
  discBadgeTxt: { color: "#000", fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },

  emptyBox: { alignItems: "center", padding: 32, gap: 6 },
  emptyTitle: { color: "#EEE", fontSize: 14, fontWeight: "800", marginTop: 8 },
  emptySub: { color: "#666", fontSize: 12 },
});

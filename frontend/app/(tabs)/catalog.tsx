import { useEffect, useState, useCallback, useMemo } from "react";
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  Image, ActivityIndicator, ScrollView, FlatList,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { api, Category, Product, Ad, formatBRL } from "../../src/api";
import { formatBLX } from "../../src/blx";
import { useGate } from "../../src/gate";
import { theme } from "../../src/theme";

const GOLD = "#D4AF37";
const DIAMOND_BLUE = "#7FD7E5"; // ciano premium usado para destacar seção Diamond

const CAT_META: Record<string, { label: string; icon: string; color: string }> = {
  // Públicas
  tecnologia:   { label: "Tecnologia",  icon: "hardware-chip",      color: "#B794F4" },
  bem_estar:    { label: "Bem-estar",   icon: "leaf",               color: "#95D5B2" },
  beleza:       { label: "Beleza",      icon: "sparkles",           color: "#F58FC3" },
  suplementos:  { label: "Suplementos", icon: "nutrition",          color: "#2ECC71" },
  eletronicos:  { label: "Eletrônicos", icon: "phone-portrait",     color: "#7FD7E5" },
  outros:       { label: "Outros",      icon: "cube",               color: "#999" },
  // Umbrella Saúde (Diamond) — AZUL premium para destacar exclusividade
  saude_diamante: { label: "Saúde Diamante", icon: "shield-checkmark", color: "#7FD7E5" },
  // Legados (mantidos para retrocompatibilidade interna)
  hormonios:    { label: "Hormônios",   icon: "pulse",              color: "#E8C96B" },
  emagrecedores:{ label: "Emagrecedores", icon: "flame",            color: "#FF6B35" },
  peptideos:    { label: "Peptídeos",     icon: "flask",            color: "#7FD7E5" },
  landerlan:    { label: "Landerlan",     icon: "shield-checkmark", color: "#D4AF37" },
};

// Cache em memória simples (dura enquanto a app está aberta) para
// dados que quase não mudam — evita refetch a cada troca de tela.
const _catCache: { data?: Category[]; ts?: number } = {};
const _CACHE_MS = 5 * 60 * 1000; // 5 min

export default function Marketplace() {
  const router = useRouter();
  const { member } = useGate();
  const tier = (member?.tier || "black").toLowerCase();
  const isDiamond = tier === "diamond";
  const hasMarketplaceAccess = ["silver", "gold", "diamond"].includes(tier);

  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("all");
  const [categories, setCategories] = useState<Category[]>(_catCache.data || []);
  const [products, setProducts] = useState<Product[]>([]);
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!hasMarketplaceAccess || !member) { setLoading(false); return; }
    try {
      // Usa cache de categorias se recente (<5min)
      const catsFresh = _catCache.data && _catCache.ts && (Date.now() - _catCache.ts) < _CACHE_MS;
      const catsPromise = catsFresh
        ? Promise.resolve(_catCache.data as Category[])
        : api.categories(member.member_id).catch(() => [] as Category[]);
      const [cats, prods, aa] = await Promise.all([
        catsPromise,
        api.listProducts({ category: cat, q, member_id: member.member_id }).catch(() => []),
        api.listAds().catch(() => []),
      ]);
      if (!catsFresh) { _catCache.data = cats as Category[]; _catCache.ts = Date.now(); }
      setCategories(cats as Category[]);
      setProducts(prods);
      setAds(aa.slice(0, 8));
    } finally { setLoading(false); }
  }, [cat, q, member, hasMarketplaceAccess]);

  // Carrega no foco E debounce quando muda categoria/busca — sem duplicar
  useFocusEffect(useCallback(() => { load(); }, [hasMarketplaceAccess, member?.member_id]));
  useEffect(() => {
    // Debounce apenas quando usuário digita/troca categoria
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [cat, q]);

  // Descontos por tier (Silver 0%, Gold 15%, Diamond 30%)
  const tierDisc = useMemo(() => {
    if (tier === "diamond") return 0.30;
    if (tier === "gold") return 0.15;
    return 0;
  }, [tier]);
  const priceFor = (base: number) => Math.round(base * (1 - tierDisc));

  // Black comum não acessa
  if (!hasMarketplaceAccess) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
        <View style={st.lockWrap}>
          <View style={st.lockIcon}>
            <Ionicons name="lock-closed" size={36} color={GOLD} />
          </View>
          <Text style={st.lockTitle}>ÁREA EXCLUSIVA</Text>
          <Text style={st.lockMsg}>
            Esta função é exclusiva para membros{"\n"}
            <Text style={{ color: GOLD, fontWeight: "900" }}>Black Silver, Gold e Diamante</Text>.
          </Text>
          <Text style={st.lockSub}>
            Converse com o suporte para saber como fazer upgrade do seu plano.
          </Text>
          <TouchableOpacity
            style={st.lockBtn}
            onPress={() => router.push("/chat" as any)}
            activeOpacity={0.85}
          >
            <Ionicons name="headset" size={16} color="#000" />
            <Text style={st.lockBtnTxt}>FALAR COM SUPORTE</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Separa categorias públicas das de saúde
  const publicCats = categories.filter(c => (c as any).group !== "saude");
  const healthCats = categories.filter(c => (c as any).group === "saude");

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }} testID="marketplace-screen">
      {/* Search */}
      <View style={st.searchRow}>
        <Ionicons name="search" size={16} color="#777" />
        <TextInput
          style={st.searchInput}
          value={q} onChangeText={setQ}
          placeholder="Buscar produto..."
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
        {/* SAÚDE — apenas para Diamond. Alinhado à esquerda, compacto. Cor AZUL diamante. */}
        {isDiamond && healthCats.length > 0 && (
          <View style={st.saudeSection}>
            <View style={st.saudeHead}>
              <MaterialCommunityIcons name="heart-pulse" size={14} color={DIAMOND_BLUE} />
              <Text style={[st.saudeHeadTxt, { color: DIAMOND_BLUE }]}>SAÚDE · DIAMANTE</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.saudeRow}>
              {healthCats.map((c) => {
                const meta = CAT_META[c.id] || { label: c.name, icon: "cube", color: "#888" };
                const active = cat === c.id;
                return (
                  <TouchableOpacity
                    key={c.id}
                    onPress={() => setCat(active ? "all" : c.id)}
                    style={[st.saudeChip, active && { backgroundColor: "rgba(127,215,229,0.15)", borderColor: DIAMOND_BLUE }]}
                    activeOpacity={0.85}
                  >
                    <Ionicons name={meta.icon as any} size={13} color={active ? DIAMOND_BLUE : "#999"} />
                    <Text style={[st.saudeChipTxt, active && { color: "#FFF" }]} numberOfLines={1}>{meta.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Categorias públicas */}
        <Text style={st.sectionTitle}>CATEGORIAS</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.catRow}>
          <CatChip active={cat === "all"} onPress={() => setCat("all")} label="Todos" icon="apps" color="#EEE" />
          {publicCats.map((c) => {
            const meta = CAT_META[c.id] || { label: c.name, icon: c.icon || "cube", color: "#888" };
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

        {/* MEMBROS BLACK DIAMOND — exclusivo Diamond, banner premium em AZUL */}
        {isDiamond && (
          <View style={st.diamondSection}>
            <View style={st.diamondHero}>
              <View style={st.diamondHeroIcon}>
                <Ionicons name="diamond" size={26} color="#FFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={st.diamondKicker}>CÍRCULO BLACK DIAMOND</Text>
                <Text style={st.diamondTitle}>Transações privadas entre membros</Text>
                <Text style={st.diamondSub}>
                  Acesso restrito ao tier Diamante. Ambiente verificado, custódia em BLEX Token e liquidação instantânea entre membros qualificados.
                </Text>
              </View>
            </View>

            {ads.length > 0 ? (
              <>
                <View style={[st.sectionHead, { marginTop: 4 }]}>
                  <Text style={[st.sectionTitle, { color: DIAMOND_BLUE }]}>ANÚNCIOS DA ELITE</Text>
                  <TouchableOpacity onPress={() => router.push("/ads")} hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}>
                    <Text style={[st.sectionLink, { color: DIAMOND_BLUE }]}>Ver todos →</Text>
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
              </>
            ) : (
              <TouchableOpacity
                style={st.diamondEmptyCta}
                onPress={() => router.push("/ads")}
                activeOpacity={0.88}
              >
                <Text style={st.diamondEmptyCtaTxt}>EXPLORAR MARKETPLACE DIAMOND</Text>
                <Ionicons name="chevron-forward" size={16} color={DIAMOND_BLUE} />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Produtos */}
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
    </View>
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
      </View>
      <Text style={st.adName} numberOfLines={2}>{ad.title}</Text>
      <Text style={st.adPrice}>{formatBLX(Math.round(ad.price_full * 100))} BLX</Text>
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  searchRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginHorizontal: 14, marginTop: 10, marginBottom: 6,
    paddingHorizontal: 12, paddingVertical: 9,
    backgroundColor: "#101010", borderRadius: 10, borderWidth: 1, borderColor: "#1C1C1C",
  },
  searchInput: { flex: 1, color: "#EEE", fontSize: 13.5, padding: 0 },

  // Área Saúde (Diamond) — alinhada à esquerda, compacta
  saudeSection: { marginTop: 12, marginBottom: 4, paddingLeft: 14 },
  saudeHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  saudeHeadTxt: { color: DIAMOND_BLUE, fontSize: 10, fontWeight: "900", letterSpacing: 2 },
  saudeRow: { paddingRight: 14, gap: 6 },
  saudeChip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1, borderColor: "#252525", backgroundColor: "#0D0D0D",
  },
  saudeChipTxt: { color: "#CCC", fontSize: 11, fontWeight: "700", maxWidth: 90 },

  sectionTitle: { color: "#888", fontSize: 10, fontWeight: "900", letterSpacing: 2.5, marginLeft: 18, marginTop: 16, marginBottom: 10 },
  sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingRight: 18 },
  sectionLink: { color: GOLD, fontSize: 11, fontWeight: "800" },

  // === MEMBROS BLACK DIAMOND — banner exclusivo em AZUL ===
  diamondSection: {
    marginTop: 16,
    marginHorizontal: 14,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: "rgba(127,215,229,0.45)",
    backgroundColor: "rgba(127,215,229,0.06)",
    paddingBottom: 16,
  },
  diamondHero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(127,215,229,0.12)",
  },
  diamondHeroIcon: {
    width: 54, height: 54, borderRadius: 27,
    backgroundColor: DIAMOND_BLUE,
    alignItems: "center", justifyContent: "center",
    shadowColor: DIAMOND_BLUE,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 4,
  },
  diamondKicker: {
    color: DIAMOND_BLUE,
    fontSize: 10, fontWeight: "900", letterSpacing: 2.5,
  },
  diamondTitle: {
    color: "#FFF", fontSize: 17, fontWeight: "900",
    marginTop: 4, letterSpacing: 0.3,
  },
  diamondSub: {
    color: "#C8E8EE",
    fontSize: 11.5, fontWeight: "500",
    marginTop: 6, lineHeight: 16,
  },
  diamondEmptyCta: {
    marginHorizontal: 18, marginTop: 14,
    paddingVertical: 12, paddingHorizontal: 14,
    borderWidth: 1, borderColor: "rgba(127,215,229,0.55)",
    borderRadius: 10,
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6,
    backgroundColor: "rgba(127,215,229,0.08)",
  },
  diamondEmptyCtaTxt: {
    color: DIAMOND_BLUE, fontSize: 11.5, fontWeight: "900", letterSpacing: 1.5,
  },
  sectionCount: { color: "#666", fontSize: 11 },

  catRow: { paddingHorizontal: 14, gap: 8 },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 18, borderWidth: 1, borderColor: "#222", backgroundColor: "#0A0A0A",
  },
  chipTxt: { color: "#999", fontSize: 11.5, fontWeight: "700" },

  emptyBox: { alignItems: "center", padding: 30, gap: 8 },
  emptyTitle: { color: "#888", fontSize: 14, fontWeight: "800" },
  emptySub: { color: "#555", fontSize: 11 },

  grid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 12, gap: 8, marginTop: 8 },
  productCard: {
    width: "48.5%", backgroundColor: "#0E0E0E",
    borderWidth: 1, borderColor: "#1A1A1A",
    borderRadius: 12, padding: 10, position: "relative",
  },
  prodImgWrap: { width: "100%", aspectRatio: 1, borderRadius: 8, overflow: "hidden", backgroundColor: "#141414" },
  prodImg: { width: "100%", height: "100%" },
  prodName: { color: "#EEE", fontSize: 12.5, fontWeight: "700", marginTop: 8, minHeight: 32 },
  prodPrice: { color: GOLD, fontSize: 14, fontWeight: "900" },
  prodPriceOld: { color: "#666", fontSize: 11, textDecorationLine: "line-through" },
  discBadge: {
    position: "absolute", top: 10, right: 10,
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8,
    backgroundColor: "#FF4757",
  },
  discBadgeTxt: { color: "#FFF", fontSize: 9, fontWeight: "900" },

  adCard: { width: 150, backgroundColor: "#0E0E0E", borderWidth: 1, borderColor: "#1A1A1A", borderRadius: 12, padding: 8 },
  adImgWrap: { width: "100%", aspectRatio: 1.1, borderRadius: 8, overflow: "hidden" },
  adImg: { width: "100%", height: "100%", backgroundColor: "#141414" },
  adName: { color: "#EEE", fontSize: 11.5, fontWeight: "700", marginTop: 6, minHeight: 30 },
  adPrice: { color: "#7FD7E5", fontSize: 12.5, fontWeight: "900", marginTop: 2 },

  // Lock screen
  lockWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 30, gap: 12 },
  lockIcon: {
    width: 84, height: 84, borderRadius: 42,
    backgroundColor: "rgba(212,175,55,0.08)",
    borderWidth: 1.5, borderColor: GOLD,
    alignItems: "center", justifyContent: "center",
  },
  lockTitle: { color: GOLD, fontSize: 12, fontWeight: "900", letterSpacing: 3, marginTop: 8 },
  lockMsg: { color: "#EEE", fontSize: 15, fontWeight: "600", textAlign: "center", lineHeight: 22, marginTop: 4 },
  lockSub: { color: "#888", fontSize: 12, textAlign: "center", lineHeight: 17, marginTop: 6 },
  lockBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingHorizontal: 22, paddingVertical: 13, borderRadius: 12,
    backgroundColor: GOLD, marginTop: 16,
  },
  lockBtnTxt: { color: "#000", fontSize: 12, fontWeight: "900", letterSpacing: 1.2 },
});

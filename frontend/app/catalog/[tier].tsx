import { useEffect, useState, useCallback, useMemo } from "react";
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  Image, ActivityIndicator, ScrollView, FlatList,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect, useLocalSearchParams, Stack } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { api, Category, Product, Ad, formatBRL } from "../../src/api";
import { formatBLX } from "../../src/blx";
import { useGate } from "../../src/gate";
import { useAuth } from "../../src/auth";
import { theme } from "../../src/theme";

const GOLD = "#D4AF37";
const DIAMOND_BLUE = "#7FD7E5"; // ciano premium usado para destacar seção Diamond

const CAT_META: Record<string, { label: string; icon: string; color: string }> = {
  // NOVAS CATEGORIAS BLACKSCLUB — classes de performance/metabolismo
  metabolicos: { label: "Metabólicos", icon: "flame",              color: "#FF6B35" },
  performance: { label: "Performance", icon: "flash",              color: "#FFD700" },
  regeneracao: { label: "Regeneração", icon: "leaf",               color: "#95D5B2" },
  estetica:    { label: "Estética",    icon: "sparkles",           color: "#F58FC3" },
  foco:        { label: "Foco",        icon: "bulb",               color: "#B794F4" },
  funcionais:  { label: "Funcionais",  icon: "barbell",            color: "#7FD7E5" },
  // Umbrella Saúde (Diamond) — AZUL premium para destacar exclusividade
  saude_diamante: { label: "Saúde Diamante", icon: "shield-checkmark", color: "#7FD7E5" },
  // Legados (retrocompat de produtos antigos — não aparecem no seletor novo)
  hormonios:    { label: "Hormônios",   icon: "pulse",              color: "#E8C96B" },
  emagrecedores:{ label: "Emagrecedores", icon: "flame",            color: "#FF6B35" },
  peptideos:    { label: "Peptídeos",     icon: "flask",            color: "#7FD7E5" },
  landerlan:    { label: "Landerlan",     icon: "shield-checkmark", color: "#D4AF37" },
  tecnologia:   { label: "Tecnologia",  icon: "hardware-chip",      color: "#B794F4" },
  bem_estar:    { label: "Bem-estar",   icon: "leaf",               color: "#95D5B2" },
  beleza:       { label: "Beleza",      icon: "sparkles",           color: "#F58FC3" },
  suplementos:  { label: "Suplementos", icon: "nutrition",          color: "#2ECC71" },
  eletronicos:  { label: "Eletrônicos", icon: "phone-portrait",     color: "#7FD7E5" },
  outros:       { label: "Outros",      icon: "cube",               color: "#999" },
};

// Cache em memória simples (dura enquanto a app está aberta) para
// dados que quase não mudam — evita refetch a cada troca de tela.
const _catCache: { data?: Category[]; ts?: number } = {};
const _CACHE_MS = 5 * 60 * 1000; // 5 min

const TIER_META: Record<string, { label: string; color: string; accent: string; icon: string }> = {
  silver:  { label: "Marketplace Silver",   color: "#B8B8B8", accent: "#D9D9D9", icon: "medal-outline" },
  gold:    { label: "Marketplace Gold",     color: "#D4AF37", accent: "#F4D47A", icon: "star" },
  diamond: { label: "Marketplace Diamante", color: "#C5D1DA", accent: "#EAF1F6", icon: "diamond" },
};

export default function Marketplace() {
  const router = useRouter();
  const { member } = useGate();
  const { user } = useAuth();
  const { tier: tierParam } = useLocalSearchParams<{ tier: string }>();
  const paramTier = (String(tierParam || "").toLowerCase()) as "silver" | "gold" | "diamond";
  const tierMeta = TIER_META[paramTier];
  const myTier = (member?.tier || "black").toLowerCase();
  const isDiamond = myTier === "diamond";
  // Regra hierárquica: Diamante > Gold > Silver
  // Diamond acessa todos; Gold acessa Gold+Silver; Silver só Silver; Black nenhum.
  const TIER_RANK: Record<string, number> = { silver: 1, gold: 2, diamond: 3, black: 0 };
  const hasMarketplaceAccess = (TIER_RANK[myTier] ?? 0) >= (TIER_RANK[paramTier] ?? 99);
  // Apenas staff (admin/support/financeiro) pode publicar anúncios — marketplace curado
  const canPost = !!user && ["admin", "support", "financeiro"].includes((user.role || "") as string);
  // Diamond é marketplace exclusivamente de anúncios curados (sem catálogo de produtos dourados)
  const isDiamondView = paramTier === "diamond";

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
        // FILTRO ESTRITO POR TIER — ao entrar em /catalog/gold, só produtos Gold
        api.listProducts({ category: cat, q, member_id: member.member_id, tier: paramTier }).catch(() => []),
        // Anúncios também filtrados estritamente pelo tier da URL
        api.listAds({ tier: paramTier }).catch(() => []),
      ]);
      if (!catsFresh) { _catCache.data = cats as Category[]; _catCache.ts = Date.now(); }
      setCategories(cats as Category[]);
      setProducts(prods);
      setAds(aa.slice(0, 8));
    } finally { setLoading(false); }
  }, [cat, q, member, hasMarketplaceAccess, paramTier]);

  // Carrega no foco E debounce quando muda categoria/busca — sem duplicar
  useFocusEffect(useCallback(() => { load(); }, [hasMarketplaceAccess, member?.member_id]));
  useEffect(() => {
    // Debounce apenas quando usuário digita/troca categoria
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [cat, q]);

  // Descontos por tier (Silver 0%, Gold 15%, Diamond 30%)
  const tierDisc = useMemo(() => {
    if (myTier === "diamond") return 0.30;
    if (myTier === "gold") return 0.15;
    return 0;
  }, [myTier]);
  const priceFor = (base: number) => Math.round(base * (1 - tierDisc));

  // Validação do tier_param da URL — se é um tier válido
  if (!tierMeta) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.bg, justifyContent: "center", alignItems: "center" }}>
        <Stack.Screen options={{ headerShown: false }} />
        <Text style={{ color: "#888" }}>Marketplace inválido.</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 20 }}>
          <Text style={{ color: GOLD, fontWeight: "900" }}>VOLTAR</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Regra: só pode entrar no marketplace do próprio tier (rígido)
  if (!hasMarketplaceAccess) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
          <View style={st.lockTopBar}>
            <TouchableOpacity onPress={() => router.back()} style={st.lockBack}>
              <Ionicons name="chevron-back" size={22} color="#FFF" />
            </TouchableOpacity>
          </View>
          <View style={st.lockWrap}>
            <View style={[st.lockIcon, { backgroundColor: tierMeta.color + "14", borderColor: tierMeta.color + "55" }]}>
              <Ionicons name="lock-closed" size={36} color={tierMeta.color} />
            </View>
            <Text style={[st.lockTitle, { color: tierMeta.accent }]}>ACESSO EXCLUSIVO</Text>
            <Text style={st.lockMsg}>
              {tierMeta.label}{"\n"}
              <Text style={{ color: tierMeta.accent, fontWeight: "900" }}>
                exclusivo para membros {paramTier.toUpperCase()}.
              </Text>
            </Text>
            <Text style={st.lockSub}>
              Seu plano atual é <Text style={{ color: "#CCC", fontWeight: "900" }}>MEMBRO {myTier.toUpperCase()}</Text>.
              Converse com o suporte para saber como fazer upgrade e liberar este marketplace.
            </Text>
            <TouchableOpacity
              style={[st.lockBtn, { backgroundColor: tierMeta.accent }]}
              onPress={() => router.push("/chat" as any)}
              activeOpacity={0.85}
            >
              <Ionicons name="headset" size={16} color="#000" />
              <Text style={st.lockBtnTxt}>FALAR COM SUPORTE</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // Separa categorias públicas das de saúde
  const publicCats = categories.filter(c => (c as any).group !== "saude");
  const healthCats = categories.filter(c => (c as any).group === "saude");

  // Filtro client-side de anúncios por categoria (Diamond view)
  // + busca por texto (title/description) também funciona no Diamond
  const qLower = q.trim().toLowerCase();
  const filteredAds = ads.filter((a) => {
    const matchCat = cat === "all" || a.category === cat;
    const matchQ = !qLower ||
      (a.title || "").toLowerCase().includes(qLower) ||
      (a.description || "").toLowerCase().includes(qLower);
    return matchCat && matchQ;
  });

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }} testID="marketplace-screen">
      <Stack.Screen options={{ headerShown: false }} />
      {/* HEADER premium — título do tier + carrinho (ícone de sacola à direita) */}
      <SafeAreaView edges={["top"]} style={{ backgroundColor: theme.colors.bg }}>
        <View style={st.topHeader}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={st.topBackBtn}
            hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
          >
            <Ionicons name="chevron-back" size={22} color="#EEE" />
          </TouchableOpacity>
          <View style={st.topTitleWrap}>
            <View style={[st.topDot, { backgroundColor: tierMeta.color }]} />
            <Text style={st.topTitle}>
              MEMBRO <Text style={{ color: tierMeta.accent, fontWeight: "900" }}>{paramTier.toUpperCase()}</Text>
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => router.push("/cart" as any)}
            style={st.topCartBtn}
            hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
            testID="marketplace-cart"
          >
            <Ionicons name="bag-handle-outline" size={20} color="#EEE" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* Search ocupa toda largura agora — carrinho já saiu daqui */}
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

      {/* CTA — Botão de publicar anúncio (apenas staff: admin/support/financeiro) */}
      {canPost && (
        <TouchableOpacity
          style={[st.postCta, { borderColor: tierMeta.color + "55", backgroundColor: tierMeta.color + "10" }]}
          onPress={() => router.push({ pathname: "/ads/create", params: { tier: paramTier } } as any)}
          activeOpacity={0.85}
          testID="marketplace-post-ad"
        >
          <View style={[st.postCtaIcon, { backgroundColor: tierMeta.color + "22", borderColor: tierMeta.color + "66" }]}>
            <Ionicons name="add" size={16} color={tierMeta.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[st.postCtaTitle, { color: tierMeta.accent }]}>
              PUBLICAR ANÚNCIO NO {paramTier.toUpperCase()}
            </Text>
            <Text style={st.postCtaSub}>Curadoria oficial BlacksClub · Staff autorizado</Text>
          </View>
          <Ionicons name="arrow-forward" size={14} color={tierMeta.color} />
        </TouchableOpacity>
      )}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>

        {/* ==================== DIAMOND VIEW — apenas anúncios curados ==================== */}
        {isDiamondView ? (
          <>
            {/* Header premium Diamante */}
            <View style={st.diamondHeroHead}>
              <View style={st.diamondDivider}>
                <View style={st.diamondDividerLine} />
                <View style={st.diamondDividerBadge}>
                  <Ionicons name="diamond" size={10} color={DIAMOND_BLUE} />
                  <Text style={st.diamondDividerTxt}>CURADORIA OFICIAL</Text>
                  <Ionicons name="diamond" size={10} color={DIAMOND_BLUE} />
                </View>
                <View style={st.diamondDividerLine} />
              </View>
              <Text style={st.diamondHeroTitle}>Anúncios Exclusivos Diamante</Text>
              <Text style={st.diamondHeroSub}>
                Seleção curada pelo time BlacksClub · Todos os itens verificados
              </Text>
            </View>

            {/* Categorias (chips horizontais) — também presentes no Diamond */}
            <Text style={[st.sectionTitle, { marginTop: 2 }]}>CATEGORIAS</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.catRow}>
              <CatChip active={cat === "all"} onPress={() => setCat("all")} label="Todos" icon="apps" color={DIAMOND_BLUE} />
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

            {loading ? (
              <View style={{ padding: 32, alignItems: "center" }}>
                <ActivityIndicator color={DIAMOND_BLUE} />
              </View>
            ) : filteredAds.length === 0 ? (
              <View style={st.emptyBox}>
                <Ionicons name="diamond-outline" size={36} color={DIAMOND_BLUE + "55"} />
                <Text style={[st.emptyTitle, { color: DIAMOND_BLUE }]}>
                  {ads.length === 0 ? "Marketplace em curadoria" : "Nenhum anúncio nessa categoria"}
                </Text>
                <Text style={st.emptySub}>
                  {ads.length === 0
                    ? "Aguarde — novos anúncios serão publicados em breve pela equipe oficial."
                    : "Experimente outra categoria ou busque por palavra-chave."}
                </Text>
              </View>
            ) : (
              <View style={st.adsGrid}>
                {filteredAds.map((ad) => (
                  <AdGridCard
                    key={ad.ad_id}
                    ad={ad}
                    onPress={() => router.push({ pathname: "/ads/[id]", params: { id: ad.ad_id } })}
                  />
                ))}
              </View>
            )}
          </>
        ) : (
          <>
            {/* ==================== GOLD / SILVER VIEW ==================== */}
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

            {/* CATÁLOGO OFICIAL — divisor elegante em DOURADO */}
            <View style={st.catalogDivider}>
              <View style={st.catalogDividerLine} />
              <View style={st.catalogDividerBadge}>
                <Ionicons name="ribbon" size={10} color={GOLD} />
                <Text style={st.catalogDividerTxt}>CATÁLOGO</Text>
                <Ionicons name="ribbon" size={10} color={GOLD} />
              </View>
              <View style={st.catalogDividerLine} />
            </View>
            <View style={st.catalogSubRow}>
              <Text style={st.catalogSubTxt}>Selecionados pela curadoria do clube</Text>
              {!loading && <Text style={st.catalogCount}>{products.length} itens</Text>}
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
                      <View style={st.prodAccentStripe} />
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
          </>
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

/**
 * AdGridCard — Card premium de anúncio Diamante usado no grid vertical.
 * Exibe imagem em destaque + badge "VERIFICADO · BLACKSCLUB" em cyan/platinum.
 */
function AdGridCard({ ad, onPress }: { ad: Ad; onPress: () => void }) {
  const img = ad.images?.[0];
  return (
    <TouchableOpacity onPress={onPress} style={st.adGridCard} activeOpacity={0.88}>
      <View style={st.adGridImgWrap}>
        {img ? (
          <Image source={{ uri: img }} style={st.adGridImg} resizeMode="cover" />
        ) : (
          <View style={[st.adGridImg, { backgroundColor: "#0E1620", alignItems: "center", justifyContent: "center" }]}>
            <Ionicons name="diamond" size={32} color={DIAMOND_BLUE + "77"} />
          </View>
        )}
        {/* Faixa cyan no topo */}
        <View style={st.adGridAccent} />
        {/* Badge VERIFICADO BLACKSCLUB */}
        <View style={st.adGridVerified}>
          <Ionicons name="shield-checkmark" size={9} color={DIAMOND_BLUE} />
          <Text style={st.adGridVerifiedTxt}>VERIFICADO</Text>
        </View>
      </View>
      <Text style={st.adGridTitle} numberOfLines={2}>{ad.title}</Text>
      <View style={st.adGridPriceRow}>
        <Ionicons name="diamond" size={11} color={DIAMOND_BLUE} />
        <Text style={st.adGridPrice}>{formatBLX(Math.round(ad.price_full * 100))} BLX</Text>
      </View>
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
  headerIconBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: "#1A1A1A", borderWidth: 1, borderColor: "#2A2A2A",
    alignItems: "center", justifyContent: "center",
    marginLeft: 4,
  },

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

  // === MEMBROS BLACK DIAMOND — apresentação leve e minimalista ===
  diamondSection: {
    marginTop: 26, marginBottom: 8,
  },
  // Divisor elegante com título embutido estilo "─── CÍRCULO DIAMANTE ───"
  diamondDivider: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 24, marginBottom: 14,
  },
  diamondDividerLine: {
    flex: 1, height: 1,
    backgroundColor: "rgba(127,215,229,0.25)",
  },
  diamondDividerBadge: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 5,
    marginHorizontal: 10,
    borderRadius: 20, borderWidth: 1,
    borderColor: "rgba(127,215,229,0.35)",
    backgroundColor: "rgba(127,215,229,0.06)",
  },
  diamondDividerTxt: {
    color: DIAMOND_BLUE, fontSize: 9.5,
    fontWeight: "900", letterSpacing: 2,
  },
  diamondSubheadRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 18, marginBottom: 12,
  },
  diamondSubheadTxt: {
    color: "#AAA", fontSize: 12, fontWeight: "600", letterSpacing: 0.2,
    flex: 1, marginRight: 10,
  },
  diamondSeeAllBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingVertical: 4, paddingHorizontal: 2,
  },
  diamondSeeAllTxt: {
    color: DIAMOND_BLUE, fontSize: 10, fontWeight: "900", letterSpacing: 1.5,
  },
  diamondEmptyCta: {
    marginHorizontal: 18, marginTop: 4,
    paddingVertical: 14, paddingHorizontal: 14,
    borderWidth: 1, borderColor: "rgba(127,215,229,0.25)",
    borderRadius: 12,
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8,
    backgroundColor: "rgba(127,215,229,0.04)",
  },
  diamondEmptyCtaTxt: {
    color: DIAMOND_BLUE, fontSize: 11, fontWeight: "900", letterSpacing: 1.8,
  },
  diamondCloseLine: {
    height: 1, marginTop: 16, marginHorizontal: 24,
    backgroundColor: "rgba(127,215,229,0.12)",
  },

  // === CATÁLOGO — divisor DOURADO elegante (sem símbolo de diamante) ===
  catalogDivider: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 24, marginTop: 24, marginBottom: 10,
  },
  catalogDividerLine: {
    flex: 1, height: 1,
    backgroundColor: "rgba(212,175,55,0.28)",
  },
  catalogDividerBadge: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 14, paddingVertical: 5,
    marginHorizontal: 10,
    borderRadius: 20, borderWidth: 1,
    borderColor: "rgba(212,175,55,0.4)",
    backgroundColor: "rgba(212,175,55,0.06)",
  },
  catalogDividerTxt: {
    color: GOLD, fontSize: 9.5,
    fontWeight: "900", letterSpacing: 2.5,
  },
  catalogSubRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 18, marginBottom: 14,
  },
  catalogSubTxt: {
    color: "#AAA", fontSize: 12, fontWeight: "600", fontStyle: "italic",
  },
  catalogCount: { color: "#666", fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },

  // Faixa dourada sutil no topo da imagem do produto (toque elitizado)
  prodAccentStripe: {
    position: "absolute", top: 0, left: 0, right: 0, height: 2,
    backgroundColor: GOLD, opacity: 0.65,
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
  lockTopBar: { paddingHorizontal: 8, paddingVertical: 6 },
  lockBack: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: "center", justifyContent: "center",
  },
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

  // === Botão "Publicar Anúncio" (exclusivo Diamond) — usa tema do tier ===
  postCta: {
    flexDirection: "row", alignItems: "center", gap: 10,
    marginHorizontal: 14, marginTop: 4, marginBottom: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 12, borderWidth: 1,
  },
  postCtaIcon: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1,
  },
  postCtaTitle: {
    fontSize: 11, fontWeight: "900", letterSpacing: 1.5,
  },
  postCtaSub: {
    color: "#888", fontSize: 10, fontWeight: "600", marginTop: 2,
  },

  // === Hero Diamante (topo do marketplace exclusivo) ===
  diamondHeroHead: {
    marginTop: 10, marginBottom: 14,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  diamondHeroTitle: {
    color: "#EAF1F6",
    fontSize: 20, fontWeight: "900",
    letterSpacing: -0.3,
    marginTop: 8,
    textAlign: "center",
  },
  diamondHeroSub: {
    color: "#888", fontSize: 12,
    marginTop: 4, lineHeight: 17,
    fontWeight: "500",
    textAlign: "center",
  },

  // === Grid vertical de anúncios Diamante ===
  adsGrid: {
    flexDirection: "row", flexWrap: "wrap",
    paddingHorizontal: 12, gap: 10, marginTop: 6,
  },
  adGridCard: {
    width: "48.5%",
    backgroundColor: "#0B1218",
    borderRadius: 14, padding: 10,
    borderWidth: 1, borderColor: "rgba(127,215,229,0.15)",
  },
  adGridImgWrap: {
    width: "100%", aspectRatio: 1, borderRadius: 10,
    overflow: "hidden", backgroundColor: "#0E1620",
    position: "relative",
  },
  adGridImg: { width: "100%", height: "100%" },
  adGridAccent: {
    position: "absolute", top: 0, left: 0, right: 0, height: 2,
    backgroundColor: DIAMOND_BLUE, opacity: 0.75,
  },
  adGridVerified: {
    position: "absolute", top: 6, right: 6,
    flexDirection: "row", alignItems: "center", gap: 3,
    paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6,
    backgroundColor: "rgba(4,8,12,0.72)",
    borderWidth: 0.5, borderColor: "rgba(127,215,229,0.4)",
  },
  adGridVerifiedTxt: {
    color: DIAMOND_BLUE, fontSize: 7.5, fontWeight: "900",
    letterSpacing: 1,
  },
  adGridTitle: {
    color: "#EAF1F6", fontSize: 13, fontWeight: "700",
    marginTop: 10, minHeight: 34,
  },
  adGridPriceRow: {
    flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4,
  },
  adGridPrice: {
    color: DIAMOND_BLUE, fontSize: 14.5, fontWeight: "900",
    letterSpacing: 0.3,
  },

  // === Header premium do marketplace (título + carrinho) ===
  topHeader: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 14, paddingTop: 8, paddingBottom: 10,
    gap: 10,
  },
  topBackBtn: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "#141414", borderWidth: 1, borderColor: "#222",
  },
  topTitleWrap: {
    flex: 1, flexDirection: "row", alignItems: "center", gap: 8,
  },
  topDot: {
    width: 7, height: 7, borderRadius: 3.5,
  },
  topTitle: {
    color: "#AAA", fontSize: 12, fontWeight: "800", letterSpacing: 2,
  },
  topCartBtn: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "#141414", borderWidth: 1, borderColor: "#222",
  },
});

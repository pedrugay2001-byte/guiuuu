import { useEffect, useState, useCallback, useMemo } from "react";
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  Image, ActivityIndicator, ScrollView, FlatList, Keyboard,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect, useLocalSearchParams, Stack } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "../../src/icons";
import { LinearGradient } from "expo-linear-gradient";
import { api, Category, Product, Ad, formatBRL } from "../../src/api";
import { formatBLX } from "../../src/blx";
import { useGate } from "../../src/gate";
import { useAuth } from "../../src/auth";
import { theme } from "../../src/theme";

const GOLD = "#D4AF37";
const DIAMOND_BLUE = "#7FD7E5"; // ciano premium usado para destacar seção Diamond

const CAT_META: Record<string, { label: string; icon: string; color: string; emoji: string }> = {
  // CATEGORIAS COMERCIAIS BlacksClub — nomes diretos e foco em conversão
  metabolicos: { label: "Emagrecedores",  emoji: "🔥", icon: "flame",              color: "#FF6B35" },
  performance: { label: "Força e Massa",  emoji: "💪", icon: "flash",              color: "#FFD700" },
  regeneracao: { label: "Recuperação",    emoji: "🩹", icon: "leaf",               color: "#95D5B2" },
  estetica:    { label: "Estética",       emoji: "✨", icon: "sparkles",           color: "#F58FC3" },
  foco:        { label: "Foco",           emoji: "🧠", icon: "bulb",               color: "#B794F4" },
  funcionais:  { label: "Energia",        emoji: "⚡", icon: "barbell",            color: "#7FD7E5" },
  oportunidades:{ label: "Oportunidades", emoji: "🚀", icon: "rocket",             color: "#4EE07F" },
  // Umbrella Saúde (Diamond) — AZUL premium para destacar exclusividade
  saude_diamante: { label: "Saúde Diamante", emoji: "💎", icon: "shield-checkmark", color: "#7FD7E5" },
  // Legados (retrocompat de produtos antigos — não aparecem no seletor novo)
  hormonios:    { label: "Hormônios",     emoji: "🧪", icon: "pulse",              color: "#E8C96B" },
  emagrecedores:{ label: "Emagrecedores", emoji: "🔥", icon: "flame",              color: "#FF6B35" },
  peptideos:    { label: "Peptídeos",     emoji: "🧬", icon: "flask",              color: "#7FD7E5" },
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
  const { member, refreshMember } = useGate();
  const { user } = useAuth();
  const { tier: tierParam, niche: nicheParam } = useLocalSearchParams<{ tier: string; niche?: string }>();
  const paramTier = (String(tierParam || "").toLowerCase()) as "silver" | "gold" | "diamond";
  // Nicho selecionado (vem da tela /catalog/niches). Se vazio, marketplace mostra todos.
  // "casa" antigo é migrado automaticamente para "semi-novos" (mantém compatibilidade).
  const rawNiche = (nicheParam || "").toString().toLowerCase();
  const paramNiche = rawNiche === "casa" ? "semi-novos" : rawNiche;
  const tierMeta = TIER_META[paramTier];
  const myTier = (member?.tier || "black").toLowerCase();
  const isDiamond = myTier === "diamond";
  // Regra hierárquica: Diamante > Gold > Silver
  // Diamond acessa todos; Gold acessa Gold+Silver; Silver só Silver; Black nenhum.
  const TIER_RANK: Record<string, number> = { silver: 1, gold: 2, diamond: 3, black: 0 };
  const hasMarketplaceAccess = (TIER_RANK[myTier] ?? 0) >= (TIER_RANK[paramTier] ?? 99);
  // Pode publicar:
  //   - staff JWT (admin/support/financeiro), OU
  //   - membro com flag `can_post_ads` (concedida individualmente pelo admin)
  // Membros com flag só publicam no próprio tier ou inferior.
  const isStaff = !!user && ["admin", "support", "financeiro"].includes((user.role || "") as string);
  const isMemberPublisher = !!member?.can_post_ads;
  const canPostMemberTier = isMemberPublisher && (TIER_RANK[myTier] ?? 0) >= (TIER_RANK[paramTier] ?? 99);
  const canPost = isStaff || canPostMemberTier;
  // Diamond é marketplace exclusivamente de anúncios curados (sem catálogo de produtos dourados)
  const isDiamondView = paramTier === "diamond";

  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("all");
  const [categories, setCategories] = useState<Category[]>(_catCache.data || []);
  const [products, setProducts] = useState<Product[]>([]);
  const [ads, setAds] = useState<Ad[]>([]);
  // Paginação de anúncios — 20 por página
  const ADS_PER_PAGE = 20;
  const [adsPage, setAdsPage] = useState(1);
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
        // Anúncios filtrados estritamente pelo tier E nicho da URL
        api.listAds({ tier: paramTier, niche: paramNiche || undefined }).catch(() => []),
      ]);
      if (!catsFresh) { _catCache.data = cats as Category[]; _catCache.ts = Date.now(); }
      setCategories(cats as Category[]);
      setProducts(prods);
      setAds(aa);  // mostra TODOS os anúncios filtrados (paginação faz a divisão depois)
      setAdsPage(1);  // reseta pra primeira página em qualquer reload
    } finally { setLoading(false); }
  }, [cat, q, member, hasMarketplaceAccess, paramTier, paramNiche]);

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

  // Reset para a página 1 quando categoria/busca mudam (UX intuitiva)
  // CRITICAL: este useEffect deve ficar ANTES dos early returns para
  // respeitar Rules of Hooks (mesma quantidade de hooks em todos os renders).
  useEffect(() => { setAdsPage(1); }, [cat, q]);

  // Força refresh do membro ao abrir um nicho restrito — garante que mudanças
  // recentes do admin (ex.: liberação de Performance) sejam refletidas
  // imediatamente, sem exigir logout/login. TAMBÉM precisa estar antes dos
  // early returns para respeitar Rules of Hooks.
  useEffect(() => {
    if (paramNiche === "performance" || paramNiche === "black") {
      refreshMember(true).catch(() => {});
    }
  }, [paramNiche, refreshMember]);

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

  // ============================================================================
  // GATES POR NICHO — restrições específicas:
  // - "black"       → exclusivo para tier DIAMOND
  // - "performance" → exclusivo para membros com acesso aprovado pela admin
  //   (master admin Guilherme bypassa via staff_user.role === 'admin')
  // ============================================================================
  const isMasterAdmin = !!(member as any)?.staff_user && (member as any).staff_user.role === "admin";
  const hasPerformanceAccess = isMasterAdmin || !!(member as any)?.performance_access;
  const blackBlocked = paramNiche === "black" && myTier !== "diamond";
  const performanceBlocked = paramNiche === "performance" && !hasPerformanceAccess;

  if (blackBlocked || performanceBlocked) {
    const nicheLabel = paramNiche === "black" ? "EXCLUSIVOS BLACK" : "PERFORMANCE HUMANA";
    const accentColor = paramNiche === "black" ? "#A8C5E5" : "#E67A35";
    const titleMsg = paramNiche === "black"
      ? "Conteúdo restrito ao tier Diamante"
      : "Conteúdo restrito · Acesso liberado pela administração";
    const subMsg = paramNiche === "black"
      ? `Seu plano atual é MEMBRO ${myTier.toUpperCase()}. Apenas membros DIAMOND acessam esse nicho. Faça upgrade para liberar.`
      : "Esse nicho exige liberação manual pela administração BlacksClub. Solicite seu acesso abaixo e nossa equipe analisará seu perfil.";
    const ctaLabel = paramNiche === "black" ? "FALAR COM SUPORTE" : "SOLICITAR ACESSO";
    const ctaRoute = paramNiche === "black" ? "/chat" : "/quote";

    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
          <View style={st.lockTopBar}>
            <TouchableOpacity onPress={() => router.back()} style={st.lockBack} testID="niche-locked-back">
              <Ionicons name="chevron-back" size={22} color="#FFF" />
            </TouchableOpacity>
          </View>
          <View style={st.lockWrap}>
            <View style={[st.lockIcon, { backgroundColor: accentColor + "14", borderColor: accentColor + "55" }]}>
              <Ionicons name="lock-closed" size={36} color={accentColor} />
            </View>
            <Text style={[st.lockTitle, { color: accentColor }]}>ACESSO EXCLUSIVO</Text>
            <Text style={st.lockMsg}>
              {nicheLabel}{"\n"}
              <Text style={{ color: accentColor, fontWeight: "900" }}>{titleMsg}</Text>
            </Text>
            <Text style={st.lockSub}>{subMsg}</Text>
            <TouchableOpacity
              style={[st.lockBtn, { backgroundColor: accentColor }]}
              onPress={() => router.push(ctaRoute as any)}
              activeOpacity={0.85}
              testID="niche-locked-cta"
            >
              <Ionicons name={paramNiche === "black" ? "headset" : "sparkles-outline"} size={16} color="#000" />
              <Text style={st.lockBtnTxt}>{ctaLabel}</Text>
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

  // Paginação após filtro
  const adsTotalPages = Math.max(1, Math.ceil(filteredAds.length / ADS_PER_PAGE));
  const safePage = Math.min(adsPage, adsTotalPages);  // se filtrar e ficar com menos pgs
  const pagedAds = filteredAds.slice((safePage - 1) * ADS_PER_PAGE, safePage * ADS_PER_PAGE);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }} testID="marketplace-screen">
      <Stack.Screen options={{ headerShown: false }} />

      {/* ============== HEADER REFATORADO ============== */}
      {/* Barra de busca no TOPO ABSOLUTO (substituindo o título "MEMBRO XYZ") */}
      {/* Layout: [voltar] [busca full-width] [carrinho]                    */}
      <SafeAreaView edges={["top"]} style={{ backgroundColor: theme.colors.bg }}>
        <View style={st.topBarSearch}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={st.topBackBtn}
            hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
            testID="marketplace-back"
          >
            <Ionicons name="chevron-back" size={22} color="#EEE" />
          </TouchableOpacity>

          <View style={[st.searchBoxTop, { borderColor: tierMeta.color + "44" }]}>
            <Ionicons name="search" size={15} color={tierMeta.accent} style={{ marginRight: 6 }} />
            <TextInput
              style={st.searchInputTop}
              value={q}
              onChangeText={setQ}
              placeholder={`Buscar em ${tierMeta.label.replace("Marketplace ", "")}...`}
              placeholderTextColor="#666"
              autoCapitalize="none"
              returnKeyType="search"
              onSubmitEditing={() => Keyboard.dismiss()}
              testID="marketplace-search"
            />
            {q.length > 0 && (
              <TouchableOpacity
                onPress={() => setQ("")}
                hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
              >
                <Ionicons name="close-circle" size={16} color="#888" />
              </TouchableOpacity>
            )}
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

      {/* CATEGORIAS — fixadas LOGO ABAIXO da busca (sem sobreposição).
          Se a tela foi aberta via /catalog/niches → /catalog/[tier]?niche=X,
          renderiza a barra de SUBCATEGORIAS do nicho (NICHE_SUBCATS).
          Caso contrário, renderiza as categorias legadas do banco (/api/categories). */}
      <View style={st.catContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={st.catRowTop}
          keyboardShouldPersistTaps="handled"
        >
          {paramNiche && NICHE_SUBCATS[paramNiche] ? (
            // Barra de subcategorias do nicho selecionado (sem emojis — visual premium minimalista)
            NICHE_SUBCATS[paramNiche].map((s) => (
              <CatChip
                key={s.id}
                active={cat === s.id}
                onPress={() => setCat(s.id)}
                label={s.label}
                color={tierMeta.accent}
              />
            ))
          ) : (
            <>
              <CatChip active={cat === "all"} onPress={() => setCat("all")} label="Todos" emoji="🛍️" color={tierMeta.accent} />
              {publicCats.map((c) => {
                const meta = CAT_META[c.id] || { label: c.name, emoji: "📦", color: "#888" };
                return (
                  <CatChip
                    key={c.id}
                    active={cat === c.id}
                    onPress={() => setCat(c.id)}
                    label={meta.label}
                    emoji={meta.emoji}
                    color={meta.color}
                  />
                );
              })}
            </>
          )}
        </ScrollView>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>

        {/* ==================== DIAMOND VIEW — apenas anúncios curados ==================== */}
        {isDiamondView ? (
          <>
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
              <>
                <View style={st.adsGrid}>
                  {pagedAds.map((ad) => (
                    <AdGridCard
                      key={ad.ad_id}
                      ad={ad}
                      onPress={() => router.push({ pathname: "/ads/[id]", params: { id: ad.ad_id } })}
                    />
                  ))}
                </View>

                {/* Paginação — aparece apenas se houver mais de 1 página de anúncios */}
                {adsTotalPages > 1 && (
                  <View style={st.pagination}>
                    <TouchableOpacity
                      style={[st.pagBtn, safePage <= 1 && { opacity: 0.35 }]}
                      onPress={() => setAdsPage((p) => Math.max(1, p - 1))}
                      disabled={safePage <= 1}
                      activeOpacity={0.75}
                      testID="ads-prev-page"
                    >
                      <Ionicons name="chevron-back" size={16} color="#EEE" />
                      <Text style={st.pagBtnTxt}>ANTERIOR</Text>
                    </TouchableOpacity>

                    <Text style={st.pagInfo}>
                      <Text style={{ color: GOLD, fontWeight: "900" }}>{safePage}</Text>
                      <Text> de {adsTotalPages}</Text>
                      <Text style={st.pagInfoSub}>{"\n"}{filteredAds.length} anúncio{filteredAds.length === 1 ? "" : "s"}</Text>
                    </Text>

                    <TouchableOpacity
                      style={[st.pagBtn, safePage >= adsTotalPages && { opacity: 0.35 }]}
                      onPress={() => setAdsPage((p) => Math.min(adsTotalPages, p + 1))}
                      disabled={safePage >= adsTotalPages}
                      activeOpacity={0.75}
                      testID="ads-next-page"
                    >
                      <Text style={st.pagBtnTxt}>PRÓXIMA</Text>
                      <Ionicons name="chevron-forward" size={16} color="#EEE" />
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}
          </>
        ) : (
          <>
            {/* ==================== GOLD / SILVER VIEW ==================== */}
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

import { NICHE_SUBCATS, NICHE_LABEL } from "../../src/niche-subcats";

function CatChip({ active, onPress, label, emoji, color }: { active: boolean; onPress: () => void; label: string; emoji?: string; color: string }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        st.chip,
        active && { backgroundColor: color + "1A", borderColor: color, borderWidth: 1.5 },
      ]}
      activeOpacity={0.85}
    >
      {!!emoji && <Text style={st.chipEmoji}>{emoji}</Text>}
      <Text style={[st.chipTxt, active && { color: "#FFF", fontWeight: "900" }]}>{label}</Text>
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
      <Text style={st.adName} numberOfLines={2}>{toTitleCase(ad.title)}</Text>
      <Text style={st.adPrice}>
        {formatBLX(Math.round(ad.price_full * 100))}
        <Text style={st.adPriceUnit}> BLX</Text>
      </Text>
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
      <Text style={st.adGridTitle} numberOfLines={2}>{toTitleCase(ad.title)}</Text>
      <View style={st.adGridPriceRow}>
        <Ionicons name="diamond" size={11} color={DIAMOND_BLUE} />
        <Text style={st.adGridPrice}>
          {formatBLX(Math.round(ad.price_full * 100))}
          <Text style={st.adGridPriceUnit}> BLX</Text>
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// Converte "PRODUTO PREMIUM TOP" / "produto premium top" → "Produto Premium Top"
// Preserva siglas curtas (até 3 letras maiúsculas) e palavras com hífen/abreviações.
function toTitleCase(input: string): string {
  if (!input) return "";
  return input
    .toLowerCase()
    .split(/(\s+)/)
    .map((seg) => {
      if (!seg.trim()) return seg;
      // Preserva strings com números/siglas como "S10", "MX532LL/A"
      if (/\d/.test(seg) || /[\/-]/.test(seg)) return seg.toUpperCase();
      return seg.charAt(0).toUpperCase() + seg.slice(1);
    })
    .join("");
}

const st = StyleSheet.create({
  // === Header refatorado: busca no topo + categorias logo abaixo ===
  // Layout linha única: [back] [search-input] [cart]
  topBarSearch: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 12, paddingTop: 8, paddingBottom: 10,
  },
  searchBoxTop: {
    flex: 1,
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 12, paddingVertical: 9,
    backgroundColor: "#0E0E0E",
    borderRadius: 12, borderWidth: 1,
  },
  searchInputTop: {
    flex: 1,
    color: "#EEE", fontSize: 13.5,
    padding: 0, // Android default padding kills layout
  },
  // Container das categorias — logo abaixo da busca, sem sobreposição
  catContainer: {
    backgroundColor: theme.colors.bg,
    borderTopWidth: 1, borderTopColor: "#141414",
    borderBottomWidth: 1, borderBottomColor: "#141414",
  },
  // Divider sutil entre categorias e busca
  catSearchDivider: {
    height: 1,
    backgroundColor: "#1A1A1A",
    marginHorizontal: 14,
    marginBottom: 4,
  },

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
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 22,
    borderWidth: 1, borderColor: "#1F1F1F",
    backgroundColor: "#0E0E0E",
    minHeight: 38,
  },
  chipEmoji: { fontSize: 15, lineHeight: 18 },
  chipTxt: { color: "#CCC", fontSize: 12, fontWeight: "800", letterSpacing: 0.2 },

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
  adName: { color: "#EEE", fontSize: 12, fontWeight: "400", marginTop: 6, minHeight: 30 },
  adPrice: { color: "#7FD7E5", fontSize: 13, fontWeight: "900", marginTop: 2 },
  adPriceUnit: { color: "#7FD7E5", fontSize: 9.5, fontWeight: "700", letterSpacing: 0.4 },

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

  // Paginação de anúncios
  pagination: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 16, marginTop: 6,
    gap: 8,
  },
  pagBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingVertical: 10, paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1, borderColor: "#1F1F1F",
    backgroundColor: "#0E1216",
  },
  pagBtnTxt: { color: "#EEE", fontSize: 11, fontWeight: "900", letterSpacing: 0.5 },
  pagInfo: { color: "#999", fontSize: 12, textAlign: "center", lineHeight: 16 },
  pagInfoSub: { color: "#666", fontSize: 10 },
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
    color: "#EAF1F6", fontSize: 13.5, fontWeight: "400",
    marginTop: 10, minHeight: 34,
  },
  adGridPriceRow: {
    flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4,
  },
  adGridPrice: {
    color: DIAMOND_BLUE, fontSize: 15, fontWeight: "900",
    letterSpacing: 0.3,
  },
  adGridPriceUnit: {
    color: DIAMOND_BLUE, fontSize: 10, fontWeight: "700",
    letterSpacing: 0.4,
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

  // === Categoria chips FIXAS no topo (acima da busca, com destaque visual) ===
  // Layout: separadas da busca por divider sutil para evitar competição visual
  catRowTop: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 8,
  },
  // === Busca funcional (full width + botão lupa à direita) ===
  searchInputFull: {
    flex: 1, color: "#EEE", fontSize: 14, paddingVertical: 0,
  },
  searchClearBtn: {
    width: 22, height: 22, alignItems: "center", justifyContent: "center",
    marginRight: 4,
  },
  searchBtn: {
    width: 36, height: 30, borderRadius: 8,
    alignItems: "center", justifyContent: "center",
    marginLeft: 4,
  },
});

import { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, Image, TouchableOpacity,
  ImageBackground, ActivityIndicator, RefreshControl, FlatList,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { api, Category, Product, formatBRL } from "../../src/api";
import { useGate } from "../../src/gate";
import { theme, TIERS } from "../../src/theme";
import { BrandSerifHero } from "../../src/brand";

const GOLD = "#D4AF37";
const GOLD_LIGHT = "#E8C96B";

const CATEGORY_COLORS: Record<string, string> = {
  emagrecedores: "#F5C150",
  peptideos: "#7FD7E5",
  landerlan: "#D4AF37",
  hormonios: "#E57FD7",
  pre_treinos: "#FF7A4D",
  suplementos: "#4EE07F",
  tecnologia: "#4E8FE0",
  bem_estar: "#A8E04E",
};

const CATEGORY_ICONS: Record<string, any> = {
  emagrecedores: "flash",
  peptideos: "flask",
  landerlan: "shield-checkmark",
  hormonios: "sparkles",
  pre_treinos: "rocket",
  suplementos: "nutrition",
  tecnologia: "hardware-chip",
  bem_estar: "leaf",
};

// "Areas" of the club — shown at the top carousel
type Area = {
  id: string;
  title: string;
  subtitle?: string;
  icon: { lib: "ion" | "mci"; name: string };
  route?: string;
  comingSoon?: boolean;
};

const AREAS: Area[] = [
  { id: "ai", title: "INTELIGÊNCIA", subtitle: "ARTIFICIAL", icon: { lib: "mci", name: "brain" }, route: "/ai" },
  { id: "community", title: "COMUNIDADE", icon: { lib: "ion", name: "chatbubbles" }, route: "/(tabs)/community" },
  { id: "catalog", title: "PRODUTOS", subtitle: "DO CLUBE", icon: { lib: "ion", name: "cube" }, route: "/(tabs)/catalog" },
  { id: "saude", title: "SAÚDE", subtitle: "E FORMA", icon: { lib: "mci", name: "dumbbell" }, comingSoon: true },
  { id: "medicos", title: "MÉDICOS", subtitle: "PARCEIROS", icon: { lib: "mci", name: "stethoscope" }, comingSoon: true },
  { id: "academias", title: "ACADEMIAS", subtitle: "PARCEIRAS", icon: { lib: "mci", name: "weight-lifter" }, comingSoon: true },
  { id: "delivery", title: "DELIVERY", subtitle: "FITNESS", icon: { lib: "mci", name: "food-apple" }, comingSoon: true },
  { id: "educacao", title: "EDUCAÇÃO", subtitle: "E CURSOS", icon: { lib: "ion", name: "school" }, comingSoon: true },
  { id: "negocios", title: "NEGÓCIOS", subtitle: "B2B", icon: { lib: "ion", name: "trending-up" }, comingSoon: true },
  { id: "chat", title: "SUPORTE", subtitle: "PRIVADO", icon: { lib: "ion", name: "headset" }, route: "/chat" },
];

function AreaIcon({ icon, size, color }: { icon: Area["icon"]; size: number; color: string }) {
  if (icon.lib === "mci") {
    return <MaterialCommunityIcons name={icon.name as any} size={size} color={color} />;
  }
  return <Ionicons name={icon.name as any} size={size} color={color} />;
}

export default function Home() {
  const router = useRouter();
  const { member } = useGate();
  const { width } = useWindowDimensions();
  const [featured, setFeatured] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);

  const load = useCallback(async () => {
    try {
      const [f, c] = await Promise.all([api.featured(), api.categories()]);
      setFeatured(f);
      setCategories(c);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  const onRefresh = () => { setRefreshing(true); load(); };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.bg, justifyContent: "center" }}>
        <ActivityIndicator color={theme.colors.white} />
      </View>
    );
  }

  const tier = member ? TIERS[member.tier] || TIERS.black : TIERS.black;
  const firstName = member?.name?.split(" ")[0] || "Membro";
  const memberNum = (member as any)?.member_number;

  // Single card per page (big hero style) — more impactful + matches the reference
  const PAGE_SIZE = 1;
  const pages: Area[][] = [];
  for (let i = 0; i < AREAS.length; i += PAGE_SIZE) pages.push(AREAS.slice(i, i + PAGE_SIZE));

  const H_PAD = 24;
  const cardW = width - H_PAD * 2;
  const pageW = width;

  return (
    <ImageBackground
      source={{ uri: "https://images.unsplash.com/photo-1614850523060-8da1d56ae167?auto=format&fit=crop&w=900&q=80" }}
      style={{ flex: 1, backgroundColor: "#000" }}
      imageStyle={{ opacity: 0.10 }}
      testID="home-screen"
    >
      <View style={styles.bgVignette} />
      <ScrollView
        refreshControl={<RefreshControl tintColor={theme.colors.white} refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 80, paddingBottom: 30 }}
      >
        {/* Top name */}
        <View style={styles.topNameWrap}>
          <Text style={styles.topNameSmall}>Olá,</Text>
          <Text style={styles.topName} numberOfLines={1} adjustsFontSizeToFit>{firstName}</Text>
        </View>

        {/* Serif brand + diamond hero */}
        <View style={styles.heroBlock}>
          <BrandSerifHero fontSize={width < 380 ? 32 : 38} />
          <View style={styles.diamondWrap}>
            <View style={styles.diamondGlow} />
            <MaterialCommunityIcons name="diamond-stone" size={64} color={GOLD} />
            <View style={styles.diamondShine} />
          </View>
          <View style={styles.tierRow}>
            <View style={[styles.tierPill, { borderColor: tier.color }]}>
              <Ionicons name={tier.icon as any} size={11} color={tier.color} />
              <Text style={[styles.tierTxt, { color: tier.color }]}>{tier.label.toUpperCase()}</Text>
            </View>
            {memberNum && <Text style={styles.codeTxt}>#{memberNum}</Text>}
          </View>
        </View>

        {/* Areas carousel — paginated, 2 big cards per page */}
        <FlatList
          data={pages}
          keyExtractor={(_, i) => `p-${i}`}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16 }}
          snapToInterval={pageW}
          decelerationRate="fast"
          onMomentumScrollEnd={(e) => setPageIndex(Math.round(e.nativeEvent.contentOffset.x / pageW))}
          renderItem={({ item }) => (
            <View style={{ width: pageW, paddingHorizontal: H_PAD }}>
              {item.map((a) => (
                <TouchableOpacity
                  key={a.id}
                  style={[styles.areaCard, { width: cardW }]}
                  activeOpacity={0.85}
                  onPress={() => {
                    if (a.comingSoon) return;
                    if (a.route) router.push(a.route as any);
                  }}
                  testID={`area-${a.id}`}
                >
                  <View style={styles.areaCardGloss} />
                  <View style={styles.areaIconWrap}>
                    <AreaIcon icon={a.icon} size={64} color={GOLD_LIGHT} />
                  </View>
                  <View style={styles.areaLabelWrap}>
                    <Text style={styles.areaTitle}>{a.title}</Text>
                    {a.subtitle && <Text style={styles.areaSubtitle}>{a.subtitle}</Text>}
                  </View>
                  {a.comingSoon ? (
                    <View style={styles.soonTag}>
                      <Text style={styles.soonTxt}>EM BREVE</Text>
                    </View>
                  ) : (
                    <View style={styles.arrowTag}>
                      <Ionicons name="arrow-forward" size={18} color={GOLD} />
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}
        />

        {/* Dots */}
        <View style={styles.dots}>
          {pages.map((_, i) => (
            <View key={i} style={[styles.dot, i === pageIndex && styles.dotActive]} />
          ))}
        </View>

        {/* Separator */}
        <View style={styles.sep} />

        {/* Featured */}
        {featured.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>DESTAQUES DA SEMANA</Text>
            <View style={styles.grid}>
              {featured.slice(0, 4).map((p) => (
                <TouchableOpacity
                  key={p.product_id}
                  style={styles.card}
                  onPress={() => router.push(`/product/${p.product_id}`)}
                  testID={`product-card-${p.product_id}`}
                >
                  <Image source={{ uri: p.image_url }} style={styles.cardImg} />
                  <View style={styles.cardBody}>
                    <Text numberOfLines={2} style={styles.cardTitle}>{p.name}</Text>
                    {p.price_old && <Text style={styles.priceOld}>{formatBRL(p.price_old)}</Text>}
                    <Text style={styles.priceNew}>{formatBRL(p.price)}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Product Categories — moved to the bottom */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>CATEGORIAS DE PRODUTOS</Text>
          <FlatList
            data={categories}
            keyExtractor={(i) => i.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: theme.spacing.lg, gap: 10 }}
            renderItem={({ item }) => {
              const color = CATEGORY_COLORS[item.id] || theme.colors.silver;
              const icon = CATEGORY_ICONS[item.id] || item.icon;
              return (
                <TouchableOpacity
                  style={[styles.catChip, { borderLeftColor: color, borderLeftWidth: 3 }]}
                  onPress={() => router.push(`/category/${item.id}`)}
                  testID={`home-category-${item.id}`}
                  activeOpacity={0.8}
                >
                  <Ionicons name={icon as any} size={17} color={color} />
                  <Text style={styles.catChipText}>{item.name}</Text>
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </ScrollView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bgVignette: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.85)",
  },
  topNameWrap: {
    alignItems: "center",
    paddingTop: 4, paddingBottom: 4,
  },
  topNameSmall: { color: "#888", fontSize: 11, letterSpacing: 3, fontWeight: "600" },
  topName: {
    color: "#F6F6F6", fontSize: 30, fontWeight: "700",
    letterSpacing: 1, marginTop: -2,
    fontStyle: "italic",
  },

  heroBlock: { alignItems: "center", paddingTop: 14, paddingBottom: 26 },
  diamondWrap: {
    marginTop: 14,
    width: 110, height: 110,
    alignItems: "center", justifyContent: "center",
  },
  diamondGlow: {
    position: "absolute",
    width: 150, height: 150, borderRadius: 75,
    backgroundColor: GOLD,
    opacity: 0.18,
    top: -20, left: -20,
  },
  diamondShine: {
    position: "absolute",
    width: 70, height: 6, bottom: 6,
    borderRadius: 6,
    backgroundColor: GOLD_LIGHT,
    opacity: 0.35,
  },
  tierRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },
  tierPill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
    borderWidth: 1, backgroundColor: "rgba(0,0,0,0.5)",
  },
  tierTxt: { fontSize: 10, fontWeight: "900", letterSpacing: 2 },
  codeTxt: { color: "#999", fontSize: 11, fontWeight: "700", letterSpacing: 1.5 },

  areaCard: {
    height: 170, borderRadius: 20, padding: 20,
    backgroundColor: "rgba(22,22,22,0.92)",
    borderWidth: 1, borderColor: "rgba(212,175,55,0.25)",
    flexDirection: "row", alignItems: "center", gap: 18,
    position: "relative", overflow: "hidden",
  },
  areaCardGloss: {
    position: "absolute", top: 0, left: 0, right: 0, height: 1,
    backgroundColor: "rgba(212,175,55,0.35)",
  },
  areaIconWrap: {
    width: 90, height: 90, borderRadius: 45,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(212,175,55,0.10)",
    borderWidth: 1, borderColor: "rgba(212,175,55,0.30)",
  },
  areaLabelWrap: { flex: 1 },
  areaTitle: {
    color: "#F3F3F3", fontSize: 18, fontWeight: "800",
    letterSpacing: 2,
  },
  areaSubtitle: {
    color: GOLD_LIGHT, fontSize: 16, fontWeight: "700",
    letterSpacing: 1.5, marginTop: 4,
  },
  soonTag: {
    position: "absolute", top: 14, right: 14,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4,
    backgroundColor: "rgba(212,175,55,0.15)",
    borderWidth: 1, borderColor: "rgba(212,175,55,0.35)",
  },
  soonTxt: { color: GOLD_LIGHT, fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  arrowTag: {
    width: 36, height: 36, borderRadius: 18,
    borderWidth: 1, borderColor: "rgba(212,175,55,0.35)",
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(212,175,55,0.08)",
  },

  dots: { flexDirection: "row", gap: 5, justifyContent: "center", marginTop: 14, marginBottom: 6 },
  dot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: "rgba(255,255,255,0.2)" },
  dotActive: { backgroundColor: GOLD, width: 18 },

  sep: {
    height: 1, marginHorizontal: 24, marginTop: 18, marginBottom: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
  },

  section: { marginTop: theme.spacing.md, marginBottom: theme.spacing.sm },
  sectionTitle: {
    color: "#BBB", fontSize: 10, fontWeight: "800",
    letterSpacing: 3, paddingHorizontal: theme.spacing.lg, marginBottom: theme.spacing.md,
  },
  catChip: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8,
    backgroundColor: "rgba(22,22,22,0.85)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
  },
  catChipText: { color: theme.colors.text, fontSize: 12, fontWeight: "700" },

  grid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: theme.spacing.lg, gap: theme.spacing.md },
  card: {
    width: "47%",
    backgroundColor: "rgba(22,22,22,0.9)",
    borderRadius: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", overflow: "hidden",
  },
  cardImg: { width: "100%", height: 130, backgroundColor: theme.colors.surfaceElevated },
  cardBody: { padding: 10 },
  cardTitle: { color: theme.colors.text, fontSize: 12, fontWeight: "700", minHeight: 32 },
  priceOld: { color: theme.colors.textMuted, fontSize: 10, textDecorationLine: "line-through", marginTop: 4 },
  priceNew: { color: theme.colors.white, fontSize: 15, fontWeight: "800", marginTop: 2 },
});

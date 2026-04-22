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

type Area = {
  id: string;
  label: string[]; // 1 or 2 lines
  icon: { lib: "ion" | "mci"; name: string };
  route?: string;
  comingSoon?: boolean;
};

// Match the reference layout — short 1-2 word labels, golden filled icons
const AREAS: Area[] = [
  { id: "ai", label: ["INTELIGÊNCIA", "ARTIFICIAL"], icon: { lib: "mci", name: "brain" }, route: "/ai" },
  { id: "community", label: ["COMUNIDADE"], icon: { lib: "ion", name: "chatbubbles" }, route: "/(tabs)/community" },
  { id: "negocios", label: ["NEGÓCIOS"], icon: { lib: "ion", name: "trending-up" }, comingSoon: true },
  { id: "educacao", label: ["EDUCAÇÃO"], icon: { lib: "ion", name: "school" }, comingSoon: true },
  { id: "saude", label: ["SAÚDE", "E FORMA"], icon: { lib: "mci", name: "dumbbell" }, comingSoon: true },
  { id: "catalog", label: ["PRODUTOS"], icon: { lib: "ion", name: "cube" }, route: "/(tabs)/catalog" },
  { id: "medicos", label: ["MÉDICOS"], icon: { lib: "mci", name: "stethoscope" }, comingSoon: true },
  { id: "academias", label: ["ACADEMIAS"], icon: { lib: "mci", name: "weight-lifter" }, comingSoon: true },
  { id: "delivery", label: ["DELIVERY", "FITNESS"], icon: { lib: "mci", name: "food-apple" }, comingSoon: true },
  { id: "chat", label: ["SUPORTE"], icon: { lib: "ion", name: "headset" }, route: "/chat" },
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

  const load = useCallback(async () => {
    try {
      const [f, c] = await Promise.all([api.featured(), api.categories()]);
      setFeatured(f);
      setCategories(c);
    } finally { setLoading(false); setRefreshing(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: "#000", justifyContent: "center" }}>
        <ActivityIndicator color={theme.colors.white} />
      </View>
    );
  }

  const tier = member ? TIERS[member.tier] || TIERS.black : TIERS.black;
  const firstName = (member?.name?.split(" ")[0] || "Membro").toUpperCase();
  const memberNum = (member as any)?.member_number;

  // 4.3 cards visible at once (peek on edge) — cap width to mobile for desktop web
  const H_PAD = 16;
  const GAP = 10;
  const visible = 4;
  const W = Math.min(width, 420);
  const cardW = Math.floor((W - H_PAD * 2 - GAP * (visible - 1)) / (visible + 0.3));
  const cardH = cardW * 1.15;

  return (
    <ImageBackground
      source={{ uri: "https://images.unsplash.com/photo-1616690710400-a16d146927c5?auto=format&fit=crop&w=900&q=80" }}
      style={{ flex: 1, backgroundColor: "#000" }}
      imageStyle={{ opacity: 0.12 }}
      testID="home-screen"
    >
      <View style={styles.bgVignette} />

      <ScrollView
        refreshControl={<RefreshControl tintColor={theme.colors.white} refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 70, paddingBottom: 30 }}
      >
        {/* Big user name centered */}
        <Text style={styles.bigName} numberOfLines={1} adjustsFontSizeToFit allowFontScaling={false}>{firstName}</Text>

        {/* Serif brand */}
        <View style={{ marginTop: 6, alignItems: "center" }}>
          <BrandSerifHero fontSize={width < 380 ? 30 : 34} />
        </View>

        {/* Diamond with strong gold glow */}
        <View style={styles.diamondWrap}>
          <View style={styles.goldGlowBig} />
          <View style={styles.goldGlowMid} />
          <View style={styles.diamondDisc}>
            <MaterialCommunityIcons name="diamond-stone" size={72} color={GOLD} />
          </View>
          <View style={styles.goldLine} />
        </View>

        {/* Tier & number */}
        <View style={styles.tierRow}>
          <View style={[styles.tierPill, { borderColor: tier.color }]}>
            <Ionicons name={tier.icon as any} size={11} color={tier.color} />
            <Text style={[styles.tierTxt, { color: tier.color }]}>{tier.label.toUpperCase()}</Text>
          </View>
          {memberNum && <Text style={styles.codeTxt}>#{memberNum}</Text>}
        </View>

        {/* Areas — horizontal scrollable row of small square cards */}
        <FlatList
          style={{ marginTop: 22 }}
          data={AREAS}
          keyExtractor={(a) => a.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: H_PAD, gap: GAP }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.areaCard, { width: cardW, height: cardH }]}
              activeOpacity={0.85}
              onPress={() => {
                if (item.comingSoon) return;
                if (item.route) router.push(item.route as any);
              }}
              testID={`area-${item.id}`}
            >
              <View style={styles.areaCardTopLine} />
              <View style={styles.areaIconBox}>
                <AreaIcon icon={item.icon} size={Math.round(cardW * 0.42)} color={GOLD} />
              </View>
              <View style={styles.areaLabelBox}>
                {item.label.map((l, i) => (
                  <Text key={i} style={styles.areaLbl} numberOfLines={1} adjustsFontSizeToFit>{l}</Text>
                ))}
              </View>
              {item.comingSoon && (
                <View style={styles.soonDot} />
              )}
            </TouchableOpacity>
          )}
        />

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

        {/* Product Categories */}
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
    backgroundColor: "rgba(0,0,0,0.88)",
  },

  bigName: {
    color: "#F6F6F6", fontSize: 28, fontWeight: "700",
    textAlign: "center", letterSpacing: 6,
  },

  diamondWrap: {
    alignItems: "center", justifyContent: "center",
    marginTop: 12, marginBottom: 6,
    position: "relative", height: 180,
  },
  goldGlowBig: {
    position: "absolute", width: 260, height: 260, borderRadius: 130,
    backgroundColor: GOLD, opacity: 0.10, top: -40,
  },
  goldGlowMid: {
    position: "absolute", width: 160, height: 160, borderRadius: 80,
    backgroundColor: GOLD, opacity: 0.22, top: 10,
  },
  diamondDisc: {
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: "#1a1508",
    borderWidth: 1, borderColor: "rgba(212,175,55,0.4)",
    alignItems: "center", justifyContent: "center",
  },
  goldLine: {
    position: "absolute", bottom: 28,
    width: 80, height: 4, borderRadius: 4,
    backgroundColor: GOLD_LIGHT, opacity: 0.55,
  },

  tierRow: { flexDirection: "row", alignItems: "center", gap: 10, justifyContent: "center", marginTop: 2 },
  tierPill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
    borderWidth: 1, backgroundColor: "rgba(0,0,0,0.5)",
  },
  tierTxt: { fontSize: 10, fontWeight: "900", letterSpacing: 2 },
  codeTxt: { color: "#AAA", fontSize: 11, fontWeight: "700", letterSpacing: 1.5 },

  // Small square area cards — like the reference image
  areaCard: {
    backgroundColor: "#0F0F0F",
    borderRadius: 14,
    borderWidth: 1, borderColor: "rgba(212,175,55,0.25)",
    padding: 8,
    alignItems: "center", justifyContent: "space-between",
    position: "relative", overflow: "hidden",
  },
  areaCardTopLine: {
    position: "absolute", left: 8, right: 8, top: 0, height: 1,
    backgroundColor: "rgba(212,175,55,0.45)",
  },
  areaIconBox: {
    flex: 1, alignItems: "center", justifyContent: "center",
    paddingTop: 4,
  },
  areaLabelBox: {
    alignItems: "center",
    paddingBottom: 4, minHeight: 26,
  },
  areaLbl: {
    color: "#EFEFEF",
    fontSize: 9, fontWeight: "800",
    letterSpacing: 1,
    textAlign: "center",
  },
  soonDot: {
    position: "absolute", top: 6, right: 6,
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: GOLD, opacity: 0.6,
  },

  section: { marginTop: theme.spacing.lg, marginBottom: theme.spacing.sm },
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

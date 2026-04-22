import { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, Image, TouchableOpacity,
  ImageBackground, ActivityIndicator, RefreshControl, FlatList,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, Category, Product, formatBRL } from "../../src/api";
import { useGate } from "../../src/gate";
import { theme, TIERS } from "../../src/theme";

const CATEGORY_COLORS: Record<string, string> = {
  emagrecedores: "#F5C150",  // yellow highlight
  peptideos: "#7FD7E5",
  landerlan: "#D4AF37",
  hormonios: "#E57FD7",      // Wonderland
  pre_treinos: "#FF7A4D",
  suplementos: "#4EE07F",
  tecnologia: "#4E8FE0",
  bem_estar: "#A8E04E",
};

const CATEGORY_ICONS: Record<string, any> = {
  emagrecedores: "flash",
  peptideos: "flask",
  landerlan: "shield-checkmark",
  hormonios: "sparkles",  // Wonderland icon
  pre_treinos: "rocket",
  suplementos: "nutrition",
  tecnologia: "hardware-chip",
  bem_estar: "leaf",
};

export default function Home() {
  const router = useRouter();
  const { member } = useGate();
  const [featured, setFeatured] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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
  const codeLabel = memberNum ? `#${memberNum}` : `#${(member?.member_id || "").slice(-5)}`;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }} testID="home-screen">
      <ScrollView
        refreshControl={<RefreshControl tintColor={theme.colors.white} refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero with background */}
        <ImageBackground
          source={{ uri: "https://images.unsplash.com/photo-1709315957145-a4bad1feef28?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2Njd8MHwxfHNlYXJjaHwzfHxkYXJrJTIwZ3ltJTIwZml0bmVzcyUyMGF0aGxldGV8ZW58MHx8fHwxNzc2NzY2Njc2fDA&ixlib=rb-4.1.0&q=85" }}
          style={styles.hero}
          imageStyle={styles.heroImg}
        >
          <View style={styles.heroVignette} />
          <View style={styles.heroOverlay}>
            <View style={styles.heroKickerRow}>
              <View style={[styles.heroTierPill, { borderColor: tier.color }]}>
                <Ionicons name={tier.icon as any} size={11} color={tier.color} />
                <Text style={[styles.heroTierText, { color: tier.color }]}>{tier.label.toUpperCase()}</Text>
              </View>
              <Text style={styles.heroCode}>{codeLabel}</Text>
            </View>
            <Text style={styles.heroTitle} numberOfLines={1} adjustsFontSizeToFit>{firstName.toUpperCase()}</Text>
            <Text style={styles.heroSub}>Bem-vindo de volta ao BLACKSCLUB. Deslize para ver o que preparamos para você.</Text>
            <View style={styles.heroScrollHint}>
              <Text style={styles.heroScrollTxt}>DESTAQUES DA SEMANA</Text>
              <Ionicons name="chevron-down" size={16} color={theme.colors.silver} />
            </View>
          </View>
        </ImageBackground>

        {/* BLACK AI Card */}
        <TouchableOpacity
          style={styles.aiCard}
          onPress={() => router.push("/ai")}
          testID="home-black-ai"
          activeOpacity={0.9}
        >
          <View style={styles.aiGlow} />
          <View style={styles.aiCardTop}>
            <View style={styles.aiBadge}>
              <Ionicons name="sparkles" size={13} color={theme.colors.bg} />
              <Text style={styles.aiBadgeText}>IA EXCLUSIVA</Text>
            </View>
          </View>
          <Text style={styles.aiTitle}>BLACK AI</Text>
          <Text style={styles.aiSub}>
            Sua assistente inteligente para tirar dúvidas e orientar sua jornada.
          </Text>
          <View style={styles.aiBtnRow}>
            <View style={styles.aiBtn}>
              <Text style={styles.aiBtnText}>CONVERSAR AGORA</Text>
              <Ionicons name="arrow-forward" size={14} color={theme.colors.white} />
            </View>
          </View>
        </TouchableOpacity>

        {/* Categories */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>CATEGORIAS</Text>
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

        {/* Destaques */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>DESTAQUES DA SEMANA</Text>
          <View style={styles.grid}>
            {featured.map((p) => (
              <TouchableOpacity
                key={p.product_id}
                style={styles.card}
                onPress={() => router.push(`/product/${p.product_id}`)}
                testID={`product-card-${p.product_id}`}
              >
                <Image source={{ uri: p.image_url }} style={styles.cardImg} />
                <View style={styles.cardBody}>
                  <Text numberOfLines={2} style={styles.cardTitle}>{p.name}</Text>
                  <Text style={styles.priceOld}>De {formatBRL(p.price)}</Text>
                  <Text style={styles.priceNew}>{formatBRL(p.member_price)}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { height: 420, marginHorizontal: theme.spacing.lg, marginTop: theme.spacing.sm, marginBottom: theme.spacing.lg },
  heroImg: { borderRadius: 14 },
  heroVignette: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.70)",
    borderRadius: 14,
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    padding: theme.spacing.lg, justifyContent: "space-between", borderRadius: 14,
  },
  heroKickerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 },
  heroTierPill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
    borderWidth: 1, backgroundColor: "rgba(0,0,0,0.4)",
  },
  heroTierText: { fontSize: 10, fontWeight: "900", letterSpacing: 2 },
  heroCode: { color: theme.colors.silver, fontSize: 12, fontWeight: "700", letterSpacing: 1 },
  heroKicker: { color: theme.colors.silver, fontSize: 10, fontWeight: "800", letterSpacing: 3 },
  heroTitle: {
    color: theme.colors.white, fontSize: 52, fontWeight: "900", letterSpacing: -1.5,
    lineHeight: 54, textTransform: "uppercase",
    marginTop: "auto",
  },
  heroSub: { color: "#CFCFCF", fontSize: 13, marginTop: 8, maxWidth: 360 },
  heroScrollHint: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    alignSelf: "center",
    marginTop: 18,
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
  },
  heroScrollTxt: { color: theme.colors.silver, fontSize: 10, fontWeight: "900", letterSpacing: 2 },
  aiCard: {
    marginHorizontal: theme.spacing.lg, marginBottom: theme.spacing.lg,
    padding: 20, borderRadius: 14, overflow: "hidden",
    backgroundColor: "#0A0A0A",
    borderWidth: 1, borderColor: "#2A2A2A",
    position: "relative",
  },
  aiGlow: {
    position: "absolute", top: -40, right: -40, width: 180, height: 180, borderRadius: 90,
    backgroundColor: "#7FD7E5", opacity: 0.12,
  },
  aiCardTop: { flexDirection: "row", marginBottom: 14 },
  aiBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20,
    backgroundColor: theme.colors.white,
  },
  aiBadgeText: { color: theme.colors.bg, fontSize: 9, fontWeight: "900", letterSpacing: 1.5 },
  aiTitle: {
    color: theme.colors.white, fontSize: 32, fontWeight: "900",
    letterSpacing: 4, marginBottom: 6,
  },
  aiSub: { color: theme.colors.textMuted, fontSize: 13, lineHeight: 19, marginBottom: 14 },
  aiBtnRow: { flexDirection: "row" },
  aiBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 8, borderWidth: 1, borderColor: "#7FD7E5",
    backgroundColor: "rgba(127, 215, 229, 0.12)",
  },
  aiBtnText: { color: theme.colors.white, fontWeight: "900", fontSize: 11, letterSpacing: 1.5 },
  section: { marginBottom: theme.spacing.lg },
  sectionTitle: {
    color: theme.colors.silver, fontSize: 11, fontWeight: "800",
    letterSpacing: 3, paddingHorizontal: theme.spacing.lg, marginBottom: theme.spacing.md,
  },
  catChip: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 16, paddingVertical: 12, borderRadius: 8,
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
  },
  catChipText: { color: theme.colors.text, fontSize: 13, fontWeight: "700" },
  grid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: theme.spacing.lg, gap: theme.spacing.md },
  card: {
    width: "47%", backgroundColor: theme.colors.surface,
    borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border, overflow: "hidden",
  },
  cardImg: { width: "100%", height: 140, backgroundColor: theme.colors.surfaceElevated },
  cardBody: { padding: 12 },
  cardTitle: { color: theme.colors.text, fontSize: 13, fontWeight: "700", minHeight: 36 },
  priceOld: { color: theme.colors.textMuted, fontSize: 11, textDecorationLine: "line-through", marginTop: 6 },
  priceNew: { color: theme.colors.white, fontSize: 16, fontWeight: "800", marginTop: 2 },
});

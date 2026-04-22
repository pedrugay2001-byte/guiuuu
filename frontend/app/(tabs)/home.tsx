import { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, Image, TouchableOpacity,
  ImageBackground, ActivityIndicator, RefreshControl, FlatList,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, Category, Product, formatBRL } from "../../src/api";
import { useGate } from "../../src/gate";
import { theme, TIERS } from "../../src/theme";

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

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }} testID="home-screen">
      <ScrollView
        refreshControl={<RefreshControl tintColor={theme.colors.white} refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Greeting */}
        <View style={styles.greetBlock}>
          <Text style={styles.hello}>Olá, {member?.name?.split(" ")[0] || "Membro"}</Text>
          <Text style={styles.tagline}>Curadoria privada. Acesso restrito.</Text>
        </View>

        {/* Hero */}
        <ImageBackground
          source={{ uri: "https://images.unsplash.com/photo-1709315957145-a4bad1feef28?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2Njd8MHwxfHNlYXJjaHwzfHxkYXJrJTIwZ3ltJTIwZml0bmVzcyUyMGF0aGxldGV8ZW58MHx8fHwxNzc2NzY2Njc2fDA&ixlib=rb-4.1.0&q=85" }}
          style={styles.hero}
          imageStyle={{ borderRadius: 12 }}
        >
          <View style={styles.heroOverlay}>
            <Text style={styles.heroKicker}>ACESSO EXCLUSIVO</Text>
            <Text style={styles.heroTitle}>VALORES QUE{"\n"}SÓ MEMBROS VEEM.</Text>
            <TouchableOpacity style={styles.heroBtn} onPress={() => router.push("/(tabs)/catalog")}>
              <Text style={styles.heroBtnText}>EXPLORAR CATÁLOGO</Text>
              <Ionicons name="arrow-forward" size={15} color={theme.colors.bg} />
            </TouchableOpacity>
          </View>
        </ImageBackground>

        {/* Quick actions */}
        <View style={styles.quickRow}>
          <TouchableOpacity
            style={[styles.quickCard, styles.quickPrimary]}
            onPress={() => router.push("/quote")}
            testID="home-quote"
            activeOpacity={0.85}
          >
            <Ionicons name="sparkles" size={18} color={theme.colors.bg} />
            <Text style={styles.quickPrimaryTitle}>SOLICITAR ORÇAMENTO</Text>
            <Text style={styles.quickPrimarySub}>Peça o que não está no catálogo</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.quickCard, styles.quickGhost]}
            onPress={() => router.push("/chat")}
            testID="home-support"
            activeOpacity={0.85}
          >
            <Ionicons name="chatbubbles" size={18} color={theme.colors.white} />
            <Text style={styles.quickGhostTitle}>FALAR COM{"\n"}SUPORTE</Text>
          </TouchableOpacity>
        </View>

        {/* Categories */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>CATEGORIAS</Text>
          <FlatList
            data={categories}
            keyExtractor={(i) => i.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: theme.spacing.lg, gap: 10 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.catChip}
                onPress={() => router.push({ pathname: "/(tabs)/catalog", params: { category: item.id } })}
                testID={`home-category-${item.id}`}
              >
                <Ionicons name={item.icon as any} size={17} color={theme.colors.silver} />
                <Text style={styles.catChipText}>{item.name}</Text>
              </TouchableOpacity>
            )}
          />
        </View>

        {/* Featured */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>SELECIONADOS</Text>
            <TouchableOpacity onPress={() => router.push("/(tabs)/catalog")}>
              <Text style={styles.link}>VER TUDO</Text>
            </TouchableOpacity>
          </View>
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
  greetBlock: { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md, paddingBottom: theme.spacing.md },
  hello: { color: theme.colors.white, fontSize: 20, fontWeight: "800", letterSpacing: -0.3 },
  tagline: { color: theme.colors.textMuted, fontSize: 12, fontWeight: "600", letterSpacing: 0.5, marginTop: 2 },
  hero: {
    height: 220, marginHorizontal: theme.spacing.lg, marginBottom: theme.spacing.md,
    borderRadius: 12, overflow: "hidden",
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.52)", padding: theme.spacing.lg,
    justifyContent: "flex-end", borderRadius: 12,
  },
  heroKicker: { color: theme.colors.silver, fontSize: 10, fontWeight: "800", letterSpacing: 3 },
  heroTitle: {
    color: theme.colors.white, fontSize: 30, fontWeight: "900", letterSpacing: -1,
    marginTop: 8, marginBottom: 16, lineHeight: 32, textTransform: "uppercase",
  },
  heroBtn: {
    flexDirection: "row", alignSelf: "flex-start", alignItems: "center", gap: 8,
    backgroundColor: theme.colors.white, paddingHorizontal: 18, paddingVertical: 11, borderRadius: 8,
  },
  heroBtnText: { color: theme.colors.bg, fontWeight: "900", fontSize: 12, letterSpacing: 1.5 },
  quickRow: { flexDirection: "row", gap: 10, paddingHorizontal: theme.spacing.lg, marginBottom: theme.spacing.lg },
  quickCard: { flex: 1, padding: 14, borderRadius: 10, gap: 8 },
  quickPrimary: { backgroundColor: theme.colors.white },
  quickPrimaryTitle: { color: theme.colors.bg, fontSize: 12, fontWeight: "900", letterSpacing: 1.2 },
  quickPrimarySub: { color: "#444", fontSize: 10 },
  quickGhost: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border },
  quickGhostTitle: { color: theme.colors.white, fontSize: 12, fontWeight: "900", letterSpacing: 1.2, lineHeight: 15 },
  section: { marginBottom: theme.spacing.lg },
  sectionHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: theme.spacing.lg, marginBottom: theme.spacing.md,
  },
  sectionTitle: {
    color: theme.colors.silver, fontSize: 11, fontWeight: "800",
    letterSpacing: 3, paddingHorizontal: theme.spacing.lg, marginBottom: theme.spacing.md,
  },
  link: { color: theme.colors.white, fontSize: 11, fontWeight: "800", letterSpacing: 1.5 },
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

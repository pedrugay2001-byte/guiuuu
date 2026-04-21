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
import { theme } from "../../src/theme";

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

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.bg, justifyContent: "center" }}>
        <ActivityIndicator color={theme.colors.white} />
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }} edges={["top"]} testID="home-screen">
      <ScrollView
        refreshControl={<RefreshControl tintColor={theme.colors.white} refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greet}>OLÁ, {(member?.name?.split(" ")[0] || "MEMBRO").toUpperCase()}</Text>
            <Text style={styles.brand}>FARMACLUBE</Text>
            <Text style={styles.brandSub}>MEMBERS ONLY</Text>
          </View>
          <View style={styles.avatar}>
            <Ionicons name="diamond" size={18} color={theme.colors.silver} />
          </View>
        </View>

        {/* Hero */}
        <ImageBackground
          source={{ uri: "https://images.unsplash.com/photo-1709315957145-a4bad1feef28?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2Njd8MHwxfHNlYXJjaHwzfHxkYXJrJTIwZ3ltJTIwZml0bmVzcyUyMGF0aGxldGV8ZW58MHx8fHwxNzc2NzY2Njc2fDA&ixlib=rb-4.1.0&q=85" }}
          style={styles.hero}
          imageStyle={{ borderRadius: 10 }}
        >
          <View style={styles.heroOverlay}>
            <Text style={styles.heroKicker}>ACESSO EXCLUSIVO</Text>
            <Text style={styles.heroTitle}>PREÇOS QUE{"\n"}SÓ MEMBROS VÊEM.</Text>
            <TouchableOpacity
              style={styles.heroBtn}
              onPress={() => router.push("/(tabs)/catalog")}
              testID="home-explore-button"
              activeOpacity={0.85}
            >
              <Text style={styles.heroBtnText}>EXPLORAR CATÁLOGO</Text>
              <Ionicons name="arrow-forward" size={15} color={theme.colors.bg} />
            </TouchableOpacity>
          </View>
        </ImageBackground>

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
                <Ionicons name={item.icon as any} size={18} color={theme.colors.silver} />
                <Text style={styles.catChipText}>{item.name}</Text>
              </TouchableOpacity>
            )}
          />
        </View>

        {/* Featured */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>EM DESTAQUE</Text>
            <TouchableOpacity onPress={() => router.push("/(tabs)/catalog")}>
              <Text style={styles.link}>Ver todos</Text>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.md,
  },
  greet: { color: theme.colors.textMuted, fontSize: 10, fontWeight: "700", letterSpacing: 2 },
  brand: { color: theme.colors.white, fontSize: 24, fontWeight: "900", letterSpacing: 1, marginTop: 4 },
  brandSub: { color: theme.colors.silver, fontSize: 9, fontWeight: "700", letterSpacing: 3, marginTop: 2 },
  avatar: {
    width: 44, height: 44, borderRadius: 22, borderWidth: 1,
    borderColor: theme.colors.border, alignItems: "center", justifyContent: "center",
    backgroundColor: theme.colors.surface,
  },
  hero: {
    height: 220, marginHorizontal: theme.spacing.lg, marginBottom: theme.spacing.lg,
    borderRadius: 10, overflow: "hidden",
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
    padding: theme.spacing.lg,
    justifyContent: "flex-end",
    borderRadius: 10,
  },
  heroKicker: { color: theme.colors.silver, fontSize: 10, fontWeight: "800", letterSpacing: 3 },
  heroTitle: {
    color: theme.colors.white, fontSize: 30, fontWeight: "900", letterSpacing: -1,
    marginTop: 8, marginBottom: 16, lineHeight: 32, textTransform: "uppercase",
  },
  heroBtn: {
    flexDirection: "row", alignSelf: "flex-start", alignItems: "center", gap: 8,
    backgroundColor: theme.colors.white, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 6,
  },
  heroBtnText: { color: theme.colors.bg, fontWeight: "900", fontSize: 12, letterSpacing: 1.5 },
  section: { marginBottom: theme.spacing.lg },
  sectionHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: theme.spacing.lg, marginBottom: theme.spacing.md,
  },
  sectionTitle: {
    color: theme.colors.silver, fontSize: 11, fontWeight: "800",
    letterSpacing: 3, paddingHorizontal: theme.spacing.lg, marginBottom: theme.spacing.md,
  },
  link: { color: theme.colors.white, fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  catChip: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 16, paddingVertical: 12, borderRadius: 4,
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
  },
  catChipText: { color: theme.colors.text, fontSize: 13, fontWeight: "600" },
  grid: {
    flexDirection: "row", flexWrap: "wrap", paddingHorizontal: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  card: {
    width: "47%", backgroundColor: theme.colors.surface,
    borderRadius: 8, borderWidth: 1, borderColor: theme.colors.border, overflow: "hidden",
  },
  cardImg: { width: "100%", height: 140, backgroundColor: theme.colors.surfaceElevated },
  cardBody: { padding: 12 },
  cardTitle: { color: theme.colors.text, fontSize: 13, fontWeight: "600", minHeight: 36 },
  priceOld: {
    color: theme.colors.textMuted, fontSize: 11, textDecorationLine: "line-through", marginTop: 6,
  },
  priceNew: { color: theme.colors.white, fontSize: 16, fontWeight: "800", marginTop: 2 },
});

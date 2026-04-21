import { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  FlatList, Image, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, Category, Product, formatBRL } from "../../src/api";
import { theme } from "../../src/theme";

export default function Catalog() {
  const router = useRouter();
  const params = useLocalSearchParams<{ category?: string }>();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>(params.category || "all");
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (params.category) setCat(params.category);
  }, [params.category]);

  useEffect(() => {
    api.categories().then(setCategories);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.listProducts({ category: cat, q });
      setProducts(data);
    } finally {
      setLoading(false);
    }
  }, [cat, q]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const allCats: Category[] = [{ id: "all", name: "Todos", icon: "apps" }, ...categories];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }} edges={["top"]} testID="catalog-screen">
      <View style={styles.searchRow}>
        <Ionicons name="search" size={18} color={theme.colors.textMuted} />
        <TextInput
          testID="catalog-search-input"
          style={styles.searchInput}
          value={q}
          onChangeText={setQ}
          placeholder="Buscar produto..."
          placeholderTextColor={theme.colors.textMuted}
          autoCapitalize="none"
        />
      </View>

      <FlatList
        data={allCats}
        keyExtractor={(i) => i.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.catBar}
        renderItem={({ item }) => {
          const active = item.id === cat;
          return (
            <TouchableOpacity
              onPress={() => setCat(item.id)}
              style={[styles.catPill, active && styles.catPillActive]}
              testID={`catalog-cat-${item.id}`}
            >
              <Text style={[styles.catPillText, active && styles.catPillTextActive]}>
                {item.name}
              </Text>
            </TouchableOpacity>
          );
        }}
      />

      {loading ? (
        <View style={{ flex: 1, justifyContent: "center" }}>
          <ActivityIndicator color={theme.colors.white} />
        </View>
      ) : products.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="search-outline" size={48} color={theme.colors.textMuted} />
          <Text style={styles.emptyText}>Nenhum produto encontrado</Text>
        </View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(i) => i.product_id}
          numColumns={2}
          columnWrapperStyle={{ gap: theme.spacing.md, paddingHorizontal: theme.spacing.lg }}
          contentContainerStyle={{ gap: theme.spacing.md, paddingBottom: theme.spacing.xl }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => router.push(`/product/${item.product_id}`)}
              testID={`catalog-product-${item.product_id}`}
            >
              <Image source={{ uri: item.image_url }} style={styles.cardImg} />
              <View style={styles.cardBody}>
                <Text numberOfLines={2} style={styles.cardTitle}>{item.name}</Text>
                <Text style={styles.priceOld}>{formatBRL(item.price)}</Text>
                <Text style={styles.priceNew}>{formatBRL(item.member_price)}</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  searchRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    marginHorizontal: theme.spacing.lg, marginTop: theme.spacing.md,
    paddingHorizontal: 14, paddingVertical: 12, backgroundColor: theme.colors.surface,
    borderRadius: 4, borderWidth: 1, borderColor: theme.colors.border,
  },
  searchInput: { flex: 1, color: theme.colors.text, fontSize: 14 },
  catBar: { paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md, gap: 8 },
  catPill: {
    paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 4, borderWidth: 1, borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  catPillActive: { backgroundColor: theme.colors.white, borderColor: theme.colors.white },
  catPillText: { color: theme.colors.textMuted, fontSize: 12, fontWeight: "700", letterSpacing: 0.5 },
  catPillTextActive: { color: theme.colors.bg },
  card: {
    flex: 1, backgroundColor: theme.colors.surface, borderRadius: 8,
    borderWidth: 1, borderColor: theme.colors.border, overflow: "hidden",
  },
  cardImg: { width: "100%", height: 140, backgroundColor: theme.colors.surfaceElevated },
  cardBody: { padding: 12 },
  cardTitle: { color: theme.colors.text, fontSize: 13, fontWeight: "600", minHeight: 36 },
  priceOld: {
    color: theme.colors.textMuted, fontSize: 11, textDecorationLine: "line-through", marginTop: 6,
  },
  priceNew: { color: theme.colors.white, fontSize: 16, fontWeight: "800", marginTop: 2 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  emptyText: { color: theme.colors.textMuted, fontSize: 14 },
});

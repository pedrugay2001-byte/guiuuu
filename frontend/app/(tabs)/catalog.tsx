import { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  FlatList, Image, ActivityIndicator, ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, Category, Product, formatBRL } from "../../src/api";
import { theme } from "../../src/theme";

const CAT_ICONS: Record<string, string> = {
  all: "apps",
  emagrecedores: "flash",
  peptideos: "flask",
  landerlan: "shield-checkmark",
  hormonios: "sparkles",
  pre_treinos: "rocket",
  suplementos: "nutrition",
  tecnologia: "hardware-chip",
  bem_estar: "leaf",
};

export default function Catalog() {
  const router = useRouter();
  const params = useLocalSearchParams<{ category?: string }>();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>(params.category || "all");
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (params.category) setCat(params.category); }, [params.category]);
  useEffect(() => { api.categories().then(setCategories); }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try { const data = await api.listProducts({ category: cat, q }); setProducts(data); }
    finally { setLoading(false); }
  }, [cat, q]);

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  const allCats: Category[] = [{ id: "all", name: "Todos", icon: "apps" }, ...categories];
  const activeCat = allCats.find(c => c.id === cat);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }} edges={["top"]} testID="catalog-screen">
      <View style={styles.searchRow}>
        <Ionicons name="search" size={16} color={theme.colors.textMuted} />
        <TextInput testID="catalog-search-input" style={styles.searchInput} value={q} onChangeText={setQ} placeholder="Buscar produto..." placeholderTextColor={theme.colors.textMuted} autoCapitalize="none" />
      </View>

      <View style={{ flex: 1, flexDirection: "row" }}>
        {/* Compact icon-only sidebar */}
        <View style={styles.sidebar}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 10 }}>
            {allCats.map((c) => {
              const active = c.id === cat;
              const icon = CAT_ICONS[c.id] || c.icon || "apps";
              return (
                <TouchableOpacity key={c.id} style={[styles.sideBtn, active && styles.sideBtnActive]} onPress={() => setCat(c.id)} testID={`catalog-cat-${c.id}`}>
                  {active && <View style={styles.activeBar} />}
                  <Ionicons name={icon as any} size={20} color={active ? "#D4AF37" : "#888"} />
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        <View style={{ flex: 1 }}>
          <View style={styles.activeCatRow}>
            <Text style={styles.activeCatName}>{activeCat?.name || "Todos"}</Text>
            <Text style={styles.activeCatCount}>{products.length} item(s)</Text>
          </View>
          {loading ? (
            <View style={{ flex: 1, justifyContent: "center" }}><ActivityIndicator color={theme.colors.white} /></View>
          ) : products.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="search-outline" size={40} color={theme.colors.textMuted} />
              <Text style={styles.emptyText}>Nenhum produto encontrado</Text>
            </View>
          ) : (
            <FlatList
              data={products}
              keyExtractor={(i) => i.product_id}
              numColumns={2}
              columnWrapperStyle={{ gap: 10, paddingHorizontal: 10 }}
              contentContainerStyle={{ gap: 10, paddingBottom: 30, paddingTop: 4 }}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.card} onPress={() => router.push(`/product/${item.product_id}`)} testID={`catalog-product-${item.product_id}`}>
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
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  searchRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginHorizontal: 12, marginTop: 10, marginBottom: 8,
    paddingHorizontal: 12, paddingVertical: 10, backgroundColor: theme.colors.surface,
    borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border,
  },
  searchInput: { flex: 1, color: theme.colors.text, fontSize: 14 },

  sidebar: {
    width: 50, backgroundColor: "#0A0A0A",
    borderRightWidth: 1, borderRightColor: "#151515",
    alignItems: "center",
  },
  sideBtn: {
    width: 40, height: 42, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
    position: "relative",
  },
  sideBtnActive: { backgroundColor: "rgba(212,175,55,0.08)" },
  activeBar: { position: "absolute", left: -5, top: 8, bottom: 8, width: 3, borderRadius: 2, backgroundColor: "#D4AF37" },

  activeCatRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 8 },
  activeCatName: { color: "#EEE", fontSize: 15, fontWeight: "900" },
  activeCatCount: { color: "#888", fontSize: 11, fontWeight: "700" },

  card: { flex: 1, backgroundColor: theme.colors.surface, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border, overflow: "hidden" },
  cardImg: { width: "100%", height: 150, backgroundColor: theme.colors.surfaceElevated },
  cardBody: { padding: 10 },
  cardTitle: { color: theme.colors.text, fontSize: 13, fontWeight: "600", minHeight: 36 },
  priceOld: { color: theme.colors.textMuted, fontSize: 11, textDecorationLine: "line-through", marginTop: 6 },
  priceNew: { color: theme.colors.white, fontSize: 16, fontWeight: "800", marginTop: 2 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  emptyText: { color: theme.colors.textMuted, fontSize: 13 },
});

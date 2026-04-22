import { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Image, TouchableOpacity,
  ActivityIndicator, FlatList,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, Product, Category, formatBRL } from "../../src/api";
import { theme } from "../../src/theme";

const CATEGORY_COLORS: Record<string, string> = {
  emagrecedores: "#F5C150", peptideos: "#7FD7E5", landerlan: "#D4AF37",
  hormonios: "#E57FD7", pre_treinos: "#FF7A4D", suplementos: "#4EE07F",
  tecnologia: "#4E8FE0", bem_estar: "#A8E04E",
};
const CATEGORY_ICONS: Record<string, any> = {
  emagrecedores: "flash", peptideos: "flask", landerlan: "shield-checkmark",
  hormonios: "sparkles", pre_treinos: "rocket", suplementos: "nutrition",
  tecnologia: "hardware-chip", bem_estar: "leaf",
};

export default function CategoryPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [subs, setSubs] = useState<{ id: string; count: number }[]>([]);
  const [activeSub, setActiveSub] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [cats, subsList, prods] = await Promise.all([
        api.categories(),
        api.subcategories(id),
        api.listProducts({ category: id }),
      ]);
      setCategories(cats);
      setSubs(subsList);
      setProducts(prods);
    } finally { setLoading(false); }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filterSub = async (s: string | null) => {
    setActiveSub(s);
    setLoading(true);
    try {
      const prods = await api.listProducts({ category: id, subcategory: s || undefined });
      setProducts(prods);
    } finally { setLoading(false); }
  };

  const current = categories.find((c) => c.id === id);
  const color = (id && CATEGORY_COLORS[id]) || theme.colors.silver;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <Stack.Screen options={{ title: current?.name || "Categoria" }} />
      <SafeAreaView style={{ flex: 1 }} edges={["bottom"]}>
        <View style={styles.wrap}>
          {/* Sidebar of other categories */}
          <ScrollView style={styles.sidebar} contentContainerStyle={{ paddingVertical: 8 }}>
            {categories.map((c) => {
              const isActive = c.id === id;
              const col = CATEGORY_COLORS[c.id] || theme.colors.silver;
              return (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.sideItem, isActive && { backgroundColor: "#141414", borderLeftColor: col, borderLeftWidth: 3 }]}
                  onPress={() => router.replace(`/category/${c.id}`)}
                >
                  <Ionicons name={(CATEGORY_ICONS[c.id] || c.icon) as any} size={16} color={isActive ? col : theme.colors.textMuted} />
                  <Text style={[styles.sideText, isActive && { color: theme.colors.white }]} numberOfLines={2}>
                    {c.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Main content */}
          <View style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 30 }}>
              {/* Subcategory chips */}
              {subs.length > 0 && (
                <View style={styles.subChipsRow}>
                  <TouchableOpacity
                    style={[styles.subChip, activeSub === null && { backgroundColor: theme.colors.white }]}
                    onPress={() => filterSub(null)}
                  >
                    <Text style={[styles.subChipText, activeSub === null && { color: theme.colors.bg }]}>TODOS</Text>
                  </TouchableOpacity>
                  {subs.map((s) => (
                    <TouchableOpacity
                      key={s.id}
                      style={[styles.subChip, activeSub === s.id && { backgroundColor: theme.colors.white }]}
                      onPress={() => filterSub(s.id)}
                    >
                      <Text style={[styles.subChipText, activeSub === s.id && { color: theme.colors.bg }]}>
                        {s.id}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {loading ? (
                <ActivityIndicator color={theme.colors.white} style={{ marginTop: 30 }} />
              ) : products.length === 0 ? (
                <Text style={styles.empty}>Nenhum produto nesta seleção.</Text>
              ) : (
                <View style={{ gap: 10 }}>
                  {products.map((p) => (
                    <TouchableOpacity
                      key={p.product_id}
                      style={styles.pCard}
                      onPress={() => router.push(`/product/${p.product_id}`)}
                    >
                      <Image source={{ uri: p.image_url }} style={styles.pImg} />
                      <View style={{ flex: 1 }}>
                        {p.subcategory && <Text style={[styles.pSub, { color }]}>{p.subcategory.toUpperCase()}</Text>}
                        <Text numberOfLines={2} style={styles.pName}>{p.name}</Text>
                        <Text numberOfLines={2} style={styles.pDesc}>{p.description}</Text>
                        <Text style={styles.pPrice}>{formatBRL(p.member_price)}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, flexDirection: "row" },
  sidebar: {
    width: 88,
    borderRightWidth: 1, borderRightColor: theme.colors.border,
    backgroundColor: theme.colors.bg2,
  },
  sideItem: {
    paddingVertical: 14, paddingHorizontal: 8,
    alignItems: "center", gap: 5,
    borderLeftWidth: 3, borderLeftColor: "transparent",
  },
  sideText: { color: theme.colors.textMuted, fontSize: 10, fontWeight: "700", textAlign: "center" },
  subChipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 14 },
  subChip: {
    paddingHorizontal: 11, paddingVertical: 6, borderRadius: 16,
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
  },
  subChipText: { color: theme.colors.text, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  empty: { color: theme.colors.textMuted, textAlign: "center", marginTop: 40, fontSize: 13 },
  pCard: {
    flexDirection: "row", gap: 10, padding: 10,
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: 10,
  },
  pImg: { width: 84, height: 84, borderRadius: 6, backgroundColor: theme.colors.surfaceElevated },
  pSub: { fontSize: 9, fontWeight: "900", letterSpacing: 1.5, marginBottom: 2 },
  pName: { color: theme.colors.white, fontSize: 13, fontWeight: "700" },
  pDesc: { color: theme.colors.textMuted, fontSize: 11, lineHeight: 15, marginTop: 3 },
  pPrice: { color: theme.colors.white, fontSize: 16, fontWeight: "900", marginTop: 6 },
});

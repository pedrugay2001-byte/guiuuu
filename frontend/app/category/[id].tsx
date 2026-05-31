import { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Image, TouchableOpacity,
  ActivityIndicator, FlatList,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "../../src/icons";
import { api, Product, Category, formatBRL } from "../../src/api";
import { theme } from "../../src/theme";
import { useGate } from "../../src/gate";

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
  const { member } = useGate();
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [subs, setSubs] = useState<{ id: string; count: number }[]>([]);
  const [activeSub, setActiveSub] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id || !member) return;
    setLoading(true);
    setBlocked(null);
    try {
      const [cats, subsList, prods] = await Promise.all([
        api.categories(member.member_id).catch(() => []),
        api.subcategories(id, member.member_id).catch(() => []),
        api.listProducts({ category: id, member_id: member.member_id }),
      ]);
      setCategories(cats);
      setSubs(subsList);
      setProducts(prods);
    } catch (e: any) {
      const msg = String(e?.message || "");
      if (msg.includes("Diamante") || msg.includes("403")) {
        setBlocked(msg.includes("Diamante") ? msg : "Categoria exclusiva para membros Black Diamante.");
      } else if (msg.includes("Silver") || msg.includes("Gold")) {
        setBlocked(msg);
      }
    } finally { setLoading(false); }
  }, [id, member]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filterSub = async (s: string | null) => {
    setActiveSub(s);
    setLoading(true);
    try {
      const prods = await api.listProducts({ category: id, subcategory: s || undefined, member_id: member?.member_id });
      setProducts(prods);
    } finally { setLoading(false); }
  };

  const current = categories.find((c) => c.id === id);
  const color = (id && CATEGORY_COLORS[id]) || theme.colors.silver;

  // Bloqueio por tier (via 403 do backend)
  if (blocked) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
        <Stack.Screen options={{ title: "Área restrita" }} />
        <SafeAreaView style={{ flex: 1 }}>
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 30, gap: 14 }}>
            <Ionicons name="lock-closed" size={48} color="#D4AF37" />
            <Text style={{ color: "#D4AF37", fontSize: 12, fontWeight: "900", letterSpacing: 3 }}>ÁREA RESTRITA</Text>
            <Text style={{ color: "#EEE", fontSize: 14, textAlign: "center", lineHeight: 20 }}>{blocked}</Text>
            <TouchableOpacity
              style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 10, backgroundColor: "#D4AF37", marginTop: 14 }}
              onPress={() => router.back()}
              activeOpacity={0.85}
            >
              <Text style={{ color: "#000", fontWeight: "900", letterSpacing: 1.2 }}>VOLTAR</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

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
    width: 64,
    borderRightWidth: 1, borderRightColor: theme.colors.border,
    backgroundColor: theme.colors.bg2,
  },
  sideItem: {
    paddingVertical: 14, paddingHorizontal: 4,
    alignItems: "center", gap: 4,
    borderLeftWidth: 3, borderLeftColor: "transparent",
  },
  sideText: { color: theme.colors.textMuted, fontSize: 8, fontWeight: "800", textAlign: "center", letterSpacing: 0.5 },
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

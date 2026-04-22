import { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, FlatList,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { api, Category } from "../../src/api";
import { theme } from "../../src/theme";
import { BrandSerifHero } from "../../src/brand";

// Color palette per reference
const BG = "#1A1A1A";            // dark charcoal / chumbo background
const CARD_BG = "#2A2A2A";       // lighter charcoal for the cards
const ICON_GREY = "#C8C8C8";     // light grey icons (interior of cards)
const LABEL = "#E8E8E8";         // whiteish label
const GOLD = "#D4AF37";

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
  label: string[];
  icon: { lib: "ion" | "mci"; name: string };
  route?: string;
  comingSoon?: boolean;
};

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
  const { width } = useWindowDimensions();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const c = await api.categories();
      setCategories(c);
    } finally { setLoading(false); setRefreshing(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: BG, justifyContent: "center" }}>
        <ActivityIndicator color={theme.colors.white} />
      </View>
    );
  }

  // Card sizing: 4 visible + small peek of 5th
  const H_PAD = 16;
  const GAP = 10;
  const visible = 4;
  const W = Math.min(width, 420);
  const cardW = Math.floor((W - H_PAD * 2 - GAP * (visible - 1)) / (visible + 0.3));
  const cardH = cardW * 1.15;

  return (
    <View style={{ flex: 1, backgroundColor: BG }} testID="home-screen">
      <ScrollView
        refreshControl={<RefreshControl tintColor={theme.colors.white} refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 110, paddingBottom: 30 }}
      >
        {/* Just the brand, centered, premium */}
        <View style={styles.brandWrap}>
          <BrandSerifHero fontSize={width < 380 ? 34 : 40} />
        </View>

        {/* Areas carousel */}
        <FlatList
          style={{ marginTop: 40 }}
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
              <View style={styles.areaIconBox}>
                <AreaIcon icon={item.icon} size={Math.round(cardW * 0.42)} color={ICON_GREY} />
              </View>
              <View style={styles.areaLabelBox}>
                {item.label.map((l, i) => (
                  <Text key={i} style={styles.areaLbl} numberOfLines={1} adjustsFontSizeToFit>{l}</Text>
                ))}
              </View>
              {item.comingSoon && <View style={styles.soonDot} />}
            </TouchableOpacity>
          )}
        />

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
    </View>
  );
}

const styles = StyleSheet.create({
  brandWrap: { alignItems: "center", marginTop: 40 },

  areaCard: {
    backgroundColor: CARD_BG,
    borderRadius: 14,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.06)",
    padding: 8,
    alignItems: "center", justifyContent: "space-between",
    position: "relative", overflow: "hidden",
  },
  areaIconBox: {
    flex: 1, alignItems: "center", justifyContent: "center",
    paddingTop: 6,
  },
  areaLabelBox: {
    alignItems: "center",
    paddingBottom: 6, minHeight: 26,
  },
  areaLbl: {
    color: LABEL,
    fontSize: 9, fontWeight: "700",
    letterSpacing: 1,
    textAlign: "center",
  },
  soonDot: {
    position: "absolute", top: 6, right: 6,
    width: 5, height: 5, borderRadius: 3,
    backgroundColor: GOLD, opacity: 0.65,
  },

  section: { marginTop: 36, marginBottom: theme.spacing.sm },
  sectionTitle: {
    color: "#999", fontSize: 10, fontWeight: "800",
    letterSpacing: 3, paddingHorizontal: theme.spacing.lg, marginBottom: theme.spacing.md,
  },
  catChip: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8,
    backgroundColor: CARD_BG,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.06)",
  },
  catChipText: { color: theme.colors.text, fontSize: 12, fontWeight: "700" },
});

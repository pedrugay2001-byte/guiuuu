import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "../../src/icons";

// 6 nichos premium em coluna única — ocupam toda a tela.
// Ordem: Exclusivos Black (1º), depois Tech, Performance, Beleza, Casa, Lazer.
const NICHES = [
  {
    id: "black",
    label: "Exclusivos Black",
    icon: "diamond" as const,
    accent: "#A8C5E5", // diamond silver-blue
    bgImage: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=600&q=60",
  },
  {
    id: "tech",
    label: "Tecnologia & Eletrônicos",
    icon: "laptop-outline" as const,
    accent: "#5BA8F0", // azul tech
    bgImage: "https://images.unsplash.com/photo-1518770660439-4636190af475?w=600&q=60",
  },
  {
    id: "performance",
    label: "Performance Humana",
    icon: "barbell" as const,
    accent: "#E67A35", // laranja discreto
    bgImage: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=600&q=60",
  },
  {
    id: "beleza",
    label: "Moda, Saúde & Beleza",
    icon: "sparkles" as const,
    accent: "#B570D9", // roxo
    bgImage: "https://images.unsplash.com/photo-1522335789203-aaa2db6bd0f1?w=600&q=60",
  },
  {
    id: "casa",
    label: "Casa & Lifestyle",
    icon: "home-outline" as const,
    accent: "#4FD1C5", // turquesa
    bgImage: "https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?w=600&q=60",
  },
  {
    id: "lazer",
    label: "Lazer, Hobby & Camp",
    icon: "bicycle-outline" as const,
    accent: "#9CAF55", // verde-oliva
    bgImage: "https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=600&q=60",
  },
] as const;

export default function NichesScreen() {
  const router = useRouter();
  const { tier } = useLocalSearchParams<{ tier?: string }>();
  const safeTier = (tier || "diamond").toLowerCase();

  return (
    <SafeAreaView edges={["top"]} style={st.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()} style={st.backBtn} hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}>
          <Ionicons name="chevron-back" size={22} color="#EEE" />
        </TouchableOpacity>
        <Text style={st.title}>ESCOLHA SEU NICHO</Text>
        <View style={{ width: 30 }} />
      </View>
      <Text style={st.sub}>Marketplace {safeTier.toUpperCase()} · selecione uma categoria</Text>

      {/* Coluna única — cards ocupam toda a altura disponível, sem ScrollView */}
      <View style={st.grid}>
        {NICHES.map((n) => (
          <TouchableOpacity
            key={n.id}
            style={[st.card, { borderColor: n.accent + "33" }]}
            activeOpacity={0.85}
            onPress={() => router.push({ pathname: "/catalog/[tier]", params: { tier: safeTier, niche: n.id } } as any)}
          >
            {/* Imagem de fundo temática (opacidade ~12%) */}
            <Image source={{ uri: n.bgImage }} style={st.bgImg} resizeMode="cover" />
            {/* Overlay escuro para garantir legibilidade */}
            <View style={st.bgOverlay} />
            {/* Conteúdo */}
            <View style={st.cardContent}>
              <Ionicons name={n.icon} size={38} color={n.accent} style={st.cardIcon} />
              <Text style={st.cardLabel}>{n.label}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#050505" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 14, paddingVertical: 10,
  },
  backBtn: { padding: 4 },
  title: { color: "#EEE", fontSize: 14, fontWeight: "900", letterSpacing: 2 },
  sub: { color: "#888", fontSize: 11, textAlign: "center", marginBottom: 18, paddingHorizontal: 20 },
  // Coluna única — preenche toda a área restante (após header e sub).
  // Cards distribuem o espaço vertical igualmente via flex: 1.
  grid: {
    flex: 1,
    flexDirection: "column",
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 12,
  },
  card: {
    flex: 1,
    width: "100%",
    backgroundColor: "#0A0A0A",
    borderWidth: 1,
    borderRadius: 14,
    overflow: "hidden",
    position: "relative",
  },
  // Imagem temática de fundo — bem sutil
  bgImg: {
    ...StyleSheet.absoluteFillObject as any,
    opacity: 0.12,
  },
  bgOverlay: {
    ...StyleSheet.absoluteFillObject as any,
    backgroundColor: "rgba(5,5,5,0.55)",
  },
  cardContent: {
    flex: 1,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  cardIcon: { marginRight: 4 },
  // Label SEMPRE branco — não colorido (regra do BlacksClub)
  cardLabel: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.2,
    lineHeight: 17,
  },
});

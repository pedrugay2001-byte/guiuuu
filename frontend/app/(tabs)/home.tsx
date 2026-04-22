import { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ImageBackground, useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { theme } from "../../src/theme";

const CARD_BG = "rgba(22,22,22,0.85)";
const ICON_GREY = "#E0E0E0";
const LABEL = "#F5F5F5";
const GOLD = "#D4AF37";

// New cinematic male gym background
const BG_IMAGE = "https://images.pexels.com/photos/13951611/pexels-photo-13951611.jpeg?auto=compress&cs=tinysrgb&w=1200";

type Area = {
  id: string; label: string[]; icon: { lib: "ion" | "mci"; name: string };
  route?: string; comingSoon?: boolean;
};

const AREAS: Area[] = [
  { id: "ai", label: ["INTELIGÊNCIA", "ARTIFICIAL"], icon: { lib: "mci", name: "brain" }, route: "/ai" },
  { id: "community", label: ["COMUNIDADE"], icon: { lib: "ion", name: "chatbubbles" }, route: "/(tabs)/community" },
  { id: "negocios", label: ["NEGÓCIOS"], icon: { lib: "ion", name: "storefront" }, route: "/(tabs)/negocios" },
  { id: "ads", label: ["MARKETPLACE"], icon: { lib: "mci", name: "shopping" }, route: "/ads" },
  { id: "wallet", label: ["BLACK", "COINS"], icon: { lib: "ion", name: "wallet" }, route: "/(tabs)/wallet" },
  { id: "catalog", label: ["PRODUTOS"], icon: { lib: "ion", name: "cube" }, route: "/(tabs)/catalog" },
  { id: "chat", label: ["SUPORTE"], icon: { lib: "ion", name: "headset" }, route: "/chat" },
  { id: "saude", label: ["SAÚDE"], icon: { lib: "mci", name: "dumbbell" }, comingSoon: true },
  { id: "educacao", label: ["EDUCAÇÃO"], icon: { lib: "ion", name: "school" }, comingSoon: true },
];

function AreaIcon({ icon, size, color }: { icon: Area["icon"]; size: number; color: string }) {
  if (icon.lib === "mci") return <MaterialCommunityIcons name={icon.name as any} size={size} color={color} />;
  return <Ionicons name={icon.name as any} size={size} color={color} />;
}

export default function Home() {
  const router = useRouter();
  const { width } = useWindowDimensions();

  const H_PAD = 16;
  const GAP = 10;
  const visible = 4;
  const W = Math.min(width, 420);
  const cardW = Math.floor((W - H_PAD * 2 - GAP * (visible - 1)) / (visible + 0.3));
  const cardH = cardW * 1.15;

  return (
    <ImageBackground
      source={{ uri: BG_IMAGE }}
      style={{ flex: 1, backgroundColor: "#000" }}
      imageStyle={{ opacity: 0.45 }}
      testID="home-screen"
    >
      <View style={styles.dark1} />
      <View style={styles.dark2} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 150, paddingBottom: 40 }}
      >
        {/* Hero copy */}
        <View style={styles.heroBox}>
          <Text style={styles.heroKicker}>BLACKSCLUB</Text>
          <Text style={styles.heroTitle}>Disciplina.{"\n"}Comunidade.{"\n"}Exclusividade.</Text>
        </View>

        {/* Areas carousel */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: H_PAD, gap: GAP, paddingVertical: 20 }}>
          {AREAS.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.areaCard, { width: cardW, height: cardH }]}
              activeOpacity={0.85}
              onPress={() => { if (item.comingSoon) return; if (item.route) router.push(item.route as any); }}
              testID={`area-${item.id}`}
            >
              <View style={styles.areaIconBox}>
                <AreaIcon icon={item.icon} size={Math.round(cardW * 0.42)} color={ICON_GREY} />
              </View>
              <View style={styles.areaLabelBox}>
                {item.label.map((l, i) => <Text key={i} style={styles.areaLbl} numberOfLines={1} adjustsFontSizeToFit>{l}</Text>)}
              </View>
              {item.comingSoon && <View style={styles.soonDot} />}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </ScrollView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  dark1: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)" },
  dark2: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.15)" },

  heroBox: { paddingHorizontal: 20, marginBottom: 4 },
  heroKicker: { color: GOLD, fontSize: 10, fontWeight: "900", letterSpacing: 4 },
  heroTitle: { color: "#FFF", fontSize: 26, fontWeight: "900", lineHeight: 32, marginTop: 8 },

  areaCard: {
    backgroundColor: CARD_BG, borderRadius: 14,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
    padding: 8, alignItems: "center", justifyContent: "space-between",
    position: "relative", overflow: "hidden",
  },
  areaIconBox: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 6 },
  areaLabelBox: { alignItems: "center", paddingBottom: 6, minHeight: 26 },
  areaLbl: { color: LABEL, fontSize: 9, fontWeight: "700", letterSpacing: 1, textAlign: "center" },
  soonDot: { position: "absolute", top: 6, right: 6, width: 5, height: 5, borderRadius: 3, backgroundColor: GOLD, opacity: 0.6 },
});

import { useRef, useState } from "react";
import {
  View, Text, StyleSheet, ImageBackground, TouchableOpacity, FlatList,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../src/theme";

const SLIDES = [
  {
    kicker: "CLUBE PRIVADO",
    title: "ACESSO QUE\nPOUCOS TÊM.",
    subtitle: "Produtos, preços e atendimento fora do mercado comum. Só entra quem é indicado.",
    image: "https://images.pexels.com/photos/29825227/pexels-photo-29825227.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    icon: "diamond" as const,
  },
  {
    kicker: "ENTREGA INVISÍVEL",
    title: "CHEGA SEM\nDEIXAR RASTROS.",
    subtitle: "Embalagem neutra, rastreio privado e suporte 1-a-1. O que passa aqui, fica aqui.",
    image: "https://images.unsplash.com/photo-1709315957145-a4bad1feef28?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2Njd8MHwxfHNlYXJjaHwzfHxkYXJrJTIwZ3ltJTIwZml0bmVzcyUyMGF0aGxldGV8ZW58MHx8fHwxNzc2NzY2Njc2fDA&ixlib=rb-4.1.0&q=85",
    icon: "shield-checkmark" as const,
  },
  {
    kicker: "PERFORMANCE REAL",
    title: "O QUE EXISTE\nDE MAIS FORTE.",
    subtitle: "Tirzepatida, retatrutida, HGH, BPC-157 e toda linha Landerlan autêntica. Para quem joga em outro nível.",
    image: "https://images.pexels.com/photos/29611432/pexels-photo-29611432.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    icon: "flash" as const,
  },
];

export default function Welcome() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList>(null);

  const next = () => {
    if (index < SLIDES.length - 1) {
      const nextIdx = index + 1;
      listRef.current?.scrollToIndex({ index: nextIdx, animated: true });
      setIndex(nextIdx);
    } else {
      router.push("/terms");
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }} testID="welcome-screen">
      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(_, i) => String(i)}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => {
          const i = Math.round(e.nativeEvent.contentOffset.x / width);
          setIndex(i);
        }}
        renderItem={({ item }) => (
          <ImageBackground source={{ uri: item.image }} style={[styles.slide, { width }]} resizeMode="cover">
            <View style={styles.overlay} />
            <View style={styles.vignetteTop} />
            <View style={styles.vignetteBottom} />
            <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
              <View style={styles.topArea}>
                <View style={styles.iconBadge}>
                  <Ionicons name={item.icon} size={15} color={theme.colors.silver} />
                </View>
                <View>
                  <Text style={styles.brand}>FARMACLUBE</Text>
                  <Text style={styles.brandSub}>MEMBERS ONLY</Text>
                </View>
              </View>

              <View style={styles.bottomArea}>
                <View style={styles.kickerRow}>
                  <View style={styles.kickerBar} />
                  <Text style={styles.kicker}>{item.kicker}</Text>
                </View>
                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.subtitle}>{item.subtitle}</Text>
              </View>
            </SafeAreaView>
          </ImageBackground>
        )}
      />

      <SafeAreaView style={styles.controls} edges={["bottom"]}>
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>
        <TouchableOpacity style={styles.cta} onPress={next} testID="welcome-next-button" activeOpacity={0.85}>
          <Text style={styles.ctaText}>
            {index < SLIDES.length - 1 ? "AVANÇAR" : "ENTRAR NO CLUBE"}
          </Text>
          <Ionicons name="arrow-forward" size={16} color={theme.colors.bg} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => router.push("/staff/login")}
          testID="welcome-staff-link"
          style={styles.staffLink}
        >
          <Ionicons name="shield-checkmark-outline" size={11} color={theme.colors.textMuted} />
          <Text style={styles.staffLinkText}>ACESSO DA EQUIPE</Text>
        </TouchableOpacity>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  slide: { flex: 1, height: "100%" },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)" },
  vignetteTop: {
    position: "absolute", top: 0, left: 0, right: 0, height: 160,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  vignetteBottom: {
    position: "absolute", bottom: 0, left: 0, right: 0, height: 360,
    backgroundColor: "rgba(0,0,0,0.75)",
  },
  safe: {
    flex: 1, paddingHorizontal: theme.spacing.lg,
    paddingBottom: 160, justifyContent: "space-between",
  },
  topArea: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingTop: theme.spacing.md,
  },
  iconBadge: {
    width: 34, height: 34, borderRadius: 4,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.15)",
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  brand: {
    color: theme.colors.white, fontSize: 14,
    fontWeight: "900", letterSpacing: 4,
  },
  brandSub: {
    color: theme.colors.textMuted, fontSize: 9,
    fontWeight: "700", letterSpacing: 3, marginTop: 2,
  },
  bottomArea: { gap: 14 },
  kickerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  kickerBar: { width: 28, height: 2, backgroundColor: theme.colors.silver },
  kicker: {
    color: theme.colors.silver, fontSize: 11,
    fontWeight: "800", letterSpacing: 3.5,
  },
  title: {
    color: theme.colors.white, fontSize: 44,
    fontWeight: "900", letterSpacing: -1.5, lineHeight: 46,
    textTransform: "uppercase",
  },
  subtitle: {
    color: "#D4D4D4", fontSize: 15,
    lineHeight: 23, maxWidth: 400, marginTop: 6,
  },
  controls: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    padding: theme.spacing.lg, gap: theme.spacing.md,
  },
  dots: { flexDirection: "row", gap: 6, justifyContent: "center" },
  dot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  dotActive: { backgroundColor: theme.colors.white, width: 28 },
  cta: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    backgroundColor: theme.colors.white,
    paddingVertical: 17, borderRadius: 6,
  },
  ctaText: {
    color: theme.colors.bg, fontWeight: "900",
    fontSize: 13, letterSpacing: 2,
  },
  staffLink: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 6, marginTop: 2,
  },
  staffLinkText: {
    color: theme.colors.textMuted, fontSize: 10,
    fontWeight: "700", letterSpacing: 2.5,
  },
});

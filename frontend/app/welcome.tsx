import { useRef, useState } from "react";
import {
  View, Text, StyleSheet, ImageBackground, TouchableOpacity, FlatList,
  useWindowDimensions, Animated,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../src/theme";
import { BrandLogo } from "../src/brand";

const SLIDES = [
  {
    kicker: "ACESSO RESTRITO",
    title: "APENAS\nPARA MEMBROS.",
    subtitle: "Um círculo fechado para quem busca qualidade, discrição e preços fora do mercado tradicional.",
    image: "https://images.pexels.com/photos/29825227/pexels-photo-29825227.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
  },
  {
    kicker: "ECOSSISTEMA EXCLUSIVO",
    title: "PRODUTOS E\nOPORTUNIDADES.",
    subtitle: "Curadoria rigorosa de produtos, serviços e tecnologia que não chegam ao público comum.",
    image: "https://images.unsplash.com/photo-1709315957145-a4bad1feef28?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2Njd8MHwxfHNlYXJjaHwzfHxkYXJrJTIwZ3ltJTIwZml0bmVzcyUyMGF0aGxldGV8ZW58MHx8fHwxNzc2NzY2Njc2fDA&ixlib=rb-4.1.0&q=85",
  },
  {
    kicker: "COMUNIDADE DE CONFIANÇA",
    title: "UMA IRMANDADE\nSELECIONADA.",
    subtitle: "Você passa a integrar um ambiente privado, onde discrição e padrão caminham juntos.",
    image: "https://images.pexels.com/photos/29611432/pexels-photo-29611432.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
  },
];

export default function Welcome() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList>(null);

  const handleScroll = (e: any) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== index && i >= 0 && i < SLIDES.length) setIndex(i);
  };

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
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onMomentumScrollEnd={handleScroll}
        renderItem={({ item }) => (
          <ImageBackground source={{ uri: item.image }} style={[styles.slide, { width }]} resizeMode="cover">
            <View style={styles.overlay} />
            <View style={styles.vignetteBottom} />
            <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
              <View style={styles.topArea}>
                <BrandLogo size="md" />
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
            {index < SLIDES.length - 1 ? "AVANÇAR" : "INICIAR ACESSO"}
          </Text>
          <Ionicons name="arrow-forward" size={16} color={theme.colors.bg} />
        </TouchableOpacity>
        <View style={styles.bottomLinks}>
          <TouchableOpacity
            onPress={() => router.push("/login")}
            testID="welcome-login-link"
            style={styles.bottomLink}
          >
            <Text style={styles.bottomLinkText}>JÁ SOU MEMBRO</Text>
          </TouchableOpacity>
          <View style={styles.sep} />
          <TouchableOpacity
            onPress={() => router.push("/staff/login")}
            testID="welcome-staff-link"
            style={styles.bottomLink}
          >
            <Text style={styles.bottomLinkText}>ÁREA DA EQUIPE</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  slide: { flex: 1, height: "100%" },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.48)" },
  vignetteBottom: {
    position: "absolute", bottom: 0, left: 0, right: 0, height: 460,
    backgroundColor: "rgba(0,0,0,0.85)",
  },
  safe: {
    flex: 1, paddingHorizontal: theme.spacing.lg,
    paddingBottom: 190, justifyContent: "space-between",
  },
  topArea: {
    paddingTop: theme.spacing.md,
    paddingBottom: 60, // Extra distance from logo to title area
  },
  bottomArea: { gap: 16 },
  kickerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  kickerBar: { width: 32, height: 2, backgroundColor: theme.colors.silver },
  kicker: { color: theme.colors.silver, fontSize: 11, fontWeight: "800", letterSpacing: 3.5 },
  title: {
    color: theme.colors.white, fontSize: 50,
    fontWeight: "900", letterSpacing: -1.5, lineHeight: 52,
    textTransform: "uppercase",
  },
  subtitle: { color: "#DADADA", fontSize: 16, lineHeight: 24, maxWidth: 440, marginTop: 10 },
  controls: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    padding: theme.spacing.lg, gap: theme.spacing.md,
  },
  dots: { flexDirection: "row", gap: 6, justifyContent: "center" },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.25)" },
  dotActive: { backgroundColor: theme.colors.white, width: 32 },
  cta: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    backgroundColor: theme.colors.white,
    paddingVertical: 17, borderRadius: 8,
  },
  ctaText: { color: theme.colors.bg, fontWeight: "900", fontSize: 13, letterSpacing: 2 },
  bottomLinks: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 10, paddingVertical: 6, marginTop: 2,
  },
  bottomLink: { paddingHorizontal: 4, paddingVertical: 4 },
  bottomLinkText: { color: theme.colors.textMuted, fontSize: 10, fontWeight: "800", letterSpacing: 2.5 },
  sep: { width: 3, height: 3, borderRadius: 2, backgroundColor: theme.colors.textMuted },
});

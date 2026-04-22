import { useRef, useState } from "react";
import {
  View, Text, StyleSheet, ImageBackground, TouchableOpacity, FlatList,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../src/theme";
import { BrandLogo } from "../src/brand";

const SLIDES = [
  {
    kicker: "ACESSO RESTRITO",
    title: "APENAS\nPARA MEMBROS",
    subtitle: "Um círculo fechado para quem busca qualidade, procedência e preços fora do mercado tradicional.",
    image: "https://images.pexels.com/photos/29825227/pexels-photo-29825227.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
  },
  {
    kicker: "COMUNIDADE DE CONFIANÇA",
    title: "CONFIANÇA E\nRESPEITO",
    subtitle: "Um ambiente privado onde confiança e respeito caminham junto com quem vive o mesmo padrão que você.",
    image: "https://images.pexels.com/photos/29611432/pexels-photo-29611432.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
  },
  {
    kicker: "CLUBE QUE SE AJUDA",
    title: "IRMANDADE\nSELECIONADA",
    subtitle: "Aqui membros se ajudam, se orientam e compartilham acesso a produtos, serviços e conhecimento curados para performance.",
    image: "https://images.unsplash.com/photo-1709315957145-a4bad1feef28?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2Njd8MHwxfHNlYXJjaHwzfHxkYXJrJTIwZ3ltJTIwZml0bmVzcyUyMGF0aGxldGV8ZW58MHx8fHwxNzc2NzY2Njc2fDA&ixlib=rb-4.1.0&q=85",
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
      // Go directly to enter (code + data) then terms then home
      router.push("/enter");
    }
  };

  // Dynamically shrink title if too wide on small screens to avoid "OPORTUNIDADES" cropping
  const titleSize = width < 380 ? 40 : width < 420 ? 46 : 50;

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
                <Text
                  style={[styles.title, { fontSize: titleSize, lineHeight: titleSize + 2 }]}
                  adjustsFontSizeToFit
                  numberOfLines={2}
                  minimumFontScale={0.7}
                >
                  {item.title}
                </Text>
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
            {index < SLIDES.length - 1 ? "AVANÇAR" : "PRIMEIRO ACESSO"}
          </Text>
          <Ionicons name="arrow-forward" size={16} color={theme.colors.bg} />
        </TouchableOpacity>

        <View style={styles.bottomLinks}>
          <TouchableOpacity
            onPress={() => router.push("/login")}
            testID="welcome-login-link"
            style={styles.bottomLink}
            activeOpacity={0.8}
          >
            <View style={[styles.bottomIconBox, { borderColor: "#7FD7E5" }]}>
              <Ionicons name="key" size={18} color="#7FD7E5" />
            </View>
            <View>
              <Text style={styles.bottomLinkTitle}>JÁ SOU MEMBRO</Text>
              <Text style={styles.bottomLinkSub}>Entre com e-mail e senha</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push("/staff/choose")}
            testID="welcome-staff-link"
            style={styles.bottomLink}
            activeOpacity={0.8}
          >
            <View style={[styles.bottomIconBox, { borderColor: "#F5C150" }]}>
              <Ionicons name="shield-checkmark" size={18} color="#F5C150" />
            </View>
            <View>
              <Text style={styles.bottomLinkTitle}>ÁREA DA EQUIPE</Text>
              <Text style={styles.bottomLinkSub}>Suporte, admin e financeiro</Text>
            </View>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  slide: { flex: 1, height: "100%" },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.65)" },
  vignetteBottom: {
    position: "absolute", bottom: 0, left: 0, right: 0, height: 520,
    backgroundColor: "rgba(0,0,0,0.88)",
  },
  safe: {
    flex: 1, paddingHorizontal: theme.spacing.lg,
    paddingBottom: 260, justifyContent: "space-between",
  },
  topArea: {
    paddingTop: theme.spacing.md,
    paddingBottom: 60,
  },
  bottomArea: { gap: 16 },
  kickerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  kickerBar: { width: 32, height: 2, backgroundColor: theme.colors.silver },
  kicker: { color: theme.colors.silver, fontSize: 11, fontWeight: "800", letterSpacing: 3.5 },
  title: {
    color: theme.colors.white, fontWeight: "900",
    letterSpacing: -1.2, textTransform: "uppercase",
  },
  subtitle: { color: "#DADADA", fontSize: 15, lineHeight: 22, maxWidth: 440, marginTop: 10 },
  controls: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    padding: theme.spacing.lg, gap: 14,
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
    flexDirection: "row", gap: 10,
  },
  bottomLink: {
    flex: 1,
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 12, paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
  },
  bottomIconBox: {
    width: 38, height: 38, borderRadius: 19,
    borderWidth: 1.5,
    alignItems: "center", justifyContent: "center",
  },
  bottomLinkTitle: { color: theme.colors.white, fontSize: 11, fontWeight: "900", letterSpacing: 1.5 },
  bottomLinkSub: { color: theme.colors.textMuted, fontSize: 9, marginTop: 2, letterSpacing: 0.5 },
});

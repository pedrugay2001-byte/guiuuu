import { useRef, useState } from "react";
import {
  View, Text, StyleSheet, ImageBackground, TouchableOpacity, FlatList,
  Dimensions, useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../src/theme";

const SLIDES = [
  {
    kicker: "CLUBE EXCLUSIVO",
    title: "Acesso\nque poucos têm",
    subtitle: "FarmaClube é um círculo fechado. Preços, produtos e atendimento que não estão à venda no mercado comum.",
    image: "https://images.pexels.com/photos/29825227/pexels-photo-29825227.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    icon: "diamond" as const,
  },
  {
    kicker: "DISCRIÇÃO ABSOLUTA",
    title: "Entregas\nsem chamar atenção",
    subtitle: "Embalagem neutra, envio nacional rastreado e suporte 1-para-1 via WhatsApp. O que acontece aqui, fica aqui.",
    image: "https://images.unsplash.com/photo-1709315957145-a4bad1feef28?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2Njd8MHwxfHNlYXJjaHwzfHxkYXJrJTIwZ3ltJTIwZml0bmVzcyUyMGF0aGxldGV8ZW58MHx8fHwxNzc2NzY2Njc2fDA&ixlib=rb-4.1.0&q=85",
    icon: "shield-checkmark" as const,
  },
  {
    kicker: "PERFORMANCE EXTREMA",
    title: "Landerlan, peptídeos\ne linha Paraguai",
    subtitle: "Tirzepatidas, retatrutidas, Landerlan autêntico e o que há de mais avançado para quem leva a sério.",
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
            <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
              <View style={styles.topArea}>
                <View style={styles.iconBadge}>
                  <Ionicons name={item.icon} size={16} color={theme.colors.silver} />
                </View>
                <Text style={styles.brand}>FARMACLUBE</Text>
              </View>

              <View style={styles.bottomArea}>
                <Text style={styles.kicker}>{item.kicker}</Text>
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
        <TouchableOpacity style={styles.cta} onPress={next} testID="welcome-next-button">
          <Text style={styles.ctaText}>
            {index < SLIDES.length - 1 ? "CONTINUAR" : "ENTRAR NO CLUBE"}
          </Text>
          <Ionicons name="arrow-forward" size={16} color={theme.colors.bg} />
        </TouchableOpacity>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  slide: { flex: 1, height: "100%" },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.65)" },
  safe: {
    flex: 1, paddingHorizontal: theme.spacing.lg,
    paddingBottom: 140, justifyContent: "space-between",
  },
  topArea: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingTop: theme.spacing.md,
  },
  iconBadge: {
    width: 32, height: 32, borderRadius: 4,
    borderWidth: 1, borderColor: theme.colors.border,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  brand: {
    color: theme.colors.white, fontSize: 14,
    fontWeight: "900", letterSpacing: 3,
  },
  bottomArea: { gap: 12 },
  kicker: {
    color: theme.colors.silver, fontSize: 11,
    fontWeight: "700", letterSpacing: 3,
  },
  title: {
    color: theme.colors.white, fontSize: 42,
    fontWeight: "900", letterSpacing: -1.5, lineHeight: 44,
  },
  subtitle: {
    color: theme.colors.textMuted, fontSize: 15,
    lineHeight: 22, maxWidth: 380, marginTop: 4,
  },
  controls: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    padding: theme.spacing.lg, gap: theme.spacing.md,
  },
  dots: { flexDirection: "row", gap: 6, justifyContent: "center" },
  dot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: theme.colors.border,
  },
  dotActive: { backgroundColor: theme.colors.white, width: 24 },
  cta: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    backgroundColor: theme.colors.white,
    paddingVertical: 16, borderRadius: 4,
  },
  ctaText: {
    color: theme.colors.bg, fontWeight: "800",
    fontSize: 13, letterSpacing: 1.5,
  },
});

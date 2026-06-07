import { useRef, useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, useWindowDimensions,
  NativeSyntheticEvent, NativeScrollEvent, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, Stack } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "../src/icons";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";

const GOLD = "#F5C150";
const GOLD_DARK = "#C89A3A";
const BG = "#050505";
const TILE_BG = "#0B0D10";

type Slide = {
  title: string;
  subtitle: string;
  icon: string;
  iconLib: "ion" | "mci";
};

const SLIDES: Slide[] = [
  {
    title: "Controle total\nda sua evolução",
    subtitle: "Acompanhe metas, progresso e resultados reais em um só lugar.",
    icon: "chart-line-variant",
    iconLib: "mci",
  },
  {
    title: "Metas inteligentes.\nResultados reais.",
    subtitle: "A IA analisa seu ritmo, prevê conquistas e te mantém no caminho.",
    icon: "brain",
    iconLib: "mci",
  },
  {
    title: "Foco hoje.\nResultado amanhã.",
    subtitle: "Disciplina todo dia. Evolução constante. O clube te espera.",
    icon: "diamond-stone",
    iconLib: "mci",
  },
];

export default function Onboarding() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const W = Math.min(width, 430); // mesma constraint da home
  const [idx, setIdx] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== idx && i >= 0 && i < SLIDES.length) setIdx(i);
  };

  const finish = async () => {
    try { await AsyncStorage.setItem("onboarding_done", "1"); } catch {}
    router.replace("/(tabs)/home");
  };

  const goTo = (i: number) => {
    const safe = Math.max(0, Math.min(SLIDES.length - 1, i));
    setIdx(safe);
    // scrollTo é mais confiável que scrollToIndex no RN-Web
    scrollRef.current?.scrollTo({ x: safe * width, animated: true });
  };

  const next = () => {
    if (idx < SLIDES.length - 1) {
      goTo(idx + 1);
    } else {
      finish();
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        {/* HEADER — logo discreta + skip */}
        <View style={styles.top}>
          <View style={styles.brandRow}>
            <Text style={styles.brandTxt}>BLACKS</Text>
            <View style={styles.brandDot}>
              <Text style={styles.brandDotTxt}>S</Text>
            </View>
            <Text style={styles.brandTxt}>CLUB</Text>
          </View>
          <TouchableOpacity onPress={finish} hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}>
            <Text style={styles.skip}>Pular</Text>
          </TouchableOpacity>
        </View>

        {/* CAROUSEL */}
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          style={{ flex: 1 }}
          contentContainerStyle={{ alignItems: "center" }}
        >
          {SLIDES.map((item, i) => (
            <View key={i} style={[styles.slide, { width }]}>
              <View style={[styles.cardWrap, { width: W - 32 }]}>
                <LinearGradient
                  colors={[GOLD + "55", "transparent", GOLD_DARK + "33"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.cardBorder}
                >
                  <View style={styles.cardInner}>
                    {/* Ícone em oval slate com border gold (mesmo padrão da home) */}
                    <View style={styles.iconOval}>
                      {item.iconLib === "mci" ? (
                        <MaterialCommunityIcons name={item.icon as any} size={44} color={GOLD} />
                      ) : (
                        <Ionicons name={item.icon as any} size={44} color={GOLD} />
                      )}
                    </View>

                    <Text style={styles.cardKicker}>PASSO {i + 1} DE {SLIDES.length}</Text>
                    <Text style={styles.title}>{item.title}</Text>
                    <View style={styles.divider} />
                    <Text style={styles.subtitle}>{item.subtitle}</Text>
                  </View>
                </LinearGradient>
              </View>
            </View>
          ))}
        </ScrollView>

        {/* DOTS — clicáveis para navegar direto */}
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <TouchableOpacity
              key={i}
              onPress={() => goTo(i)}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              activeOpacity={0.7}
            >
              <View style={[styles.dot, idx === i && styles.dotActive]} />
            </TouchableOpacity>
          ))}
        </View>

        {/* BOTÃO PRIMÁRIO */}
        <View style={styles.footer}>
          <TouchableOpacity style={styles.btn} onPress={next} activeOpacity={0.85} testID="onboarding-next">
            <Text style={styles.btnTxt}>
              {idx === SLIDES.length - 1 ? "ACESSAR O CLUBE" : "CONTINUAR"}
            </Text>
            <Ionicons name="arrow-forward" size={16} color="#000" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  top: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 22, paddingTop: 4, paddingBottom: 6,
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  brandTxt: { color: "#FFF", fontSize: 13, fontWeight: "900", letterSpacing: 2 },
  brandDot: {
    width: 18, height: 18, borderRadius: 9, backgroundColor: GOLD,
    alignItems: "center", justifyContent: "center", marginHorizontal: 2,
  },
  brandDotTxt: { color: "#000", fontSize: 10, fontWeight: "900" },
  skip: { color: "#888", fontSize: 13, fontWeight: "700", letterSpacing: 0.5 },

  slide: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 20 },

  // Card com border gold gradient (mesmo padrão dos tiles da home)
  cardWrap: {
    maxWidth: 400,
  },
  cardBorder: {
    borderRadius: 18,
    padding: 1.5,
  },
  cardInner: {
    backgroundColor: TILE_BG,
    borderRadius: 16.5,
    paddingVertical: 36,
    paddingHorizontal: 24,
    alignItems: "center",
    ...Platform.select({
      ios: {
        shadowColor: GOLD,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.18,
        shadowRadius: 14,
      },
      android: { elevation: 6 },
      default: {},
    }),
  },

  iconOval: {
    width: 88, height: 56, borderRadius: 28,
    backgroundColor: "rgba(143,163,180,0.12)",
    borderWidth: 1, borderColor: GOLD_DARK + "66",
    alignItems: "center", justifyContent: "center",
    marginBottom: 18,
  },

  cardKicker: {
    color: GOLD, fontSize: 10, fontWeight: "900",
    letterSpacing: 2.2, marginBottom: 14,
  },

  title: {
    color: "#FFF", fontSize: 24, fontWeight: "900",
    textAlign: "center", lineHeight: 30, letterSpacing: -0.3,
  },

  divider: {
    width: 36, height: 2, backgroundColor: GOLD,
    marginVertical: 16, borderRadius: 1, opacity: 0.85,
  },

  subtitle: {
    color: "#B8B8B8", fontSize: 13.5, fontWeight: "500",
    textAlign: "center", lineHeight: 20, maxWidth: 300,
  },

  dots: { flexDirection: "row", justifyContent: "center", gap: 8, paddingVertical: 16 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#2A2A2A" },
  dotActive: { backgroundColor: GOLD, width: 22 },

  footer: { paddingHorizontal: 22, paddingBottom: 10 },
  btn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: GOLD, paddingVertical: 14, borderRadius: 12,
    ...Platform.select({
      ios: {
        shadowColor: GOLD,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
      },
      android: { elevation: 4 },
      default: {},
    }),
  },
  btnTxt: { color: "#000", fontSize: 13, fontWeight: "900", letterSpacing: 1.4 },
});

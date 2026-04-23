import { useRef, useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, Dimensions,
  NativeSyntheticEvent, NativeScrollEvent,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, Stack } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";

const GOLD = "#D4AF37";
const BG = "#050505";
const { width: W } = Dimensions.get("window");

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
    subtitle: "IA analisa seu ritmo, prevê conquistas e te mantém no caminho.",
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
  const [idx, setIdx] = useState(0);
  const listRef = useRef<FlatList>(null);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / W);
    if (i !== idx) setIdx(i);
  };

  const finish = async () => {
    try { await AsyncStorage.setItem("onboarding_done", "1"); } catch {}
    router.replace("/welcome");
  };

  const next = () => {
    if (idx < SLIDES.length - 1) {
      listRef.current?.scrollToIndex({ index: idx + 1, animated: true });
    } else {
      finish();
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        {/* SKIP */}
        <View style={styles.top}>
          <TouchableOpacity onPress={finish} hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}>
            <Text style={styles.skip}>Pular</Text>
          </TouchableOpacity>
        </View>

        <FlatList
          ref={listRef}
          data={SLIDES}
          keyExtractor={(_, i) => String(i)}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          renderItem={({ item }) => (
            <View style={[styles.slide, { width: W }]}>
              <View style={styles.iconWrap}>
                {item.iconLib === "mci" ? (
                  <MaterialCommunityIcons name={item.icon as any} size={64} color={GOLD} />
                ) : (
                  <Ionicons name={item.icon as any} size={64} color={GOLD} />
                )}
              </View>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.subtitle}>{item.subtitle}</Text>
            </View>
          )}
        />

        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View key={i} style={[styles.dot, idx === i && styles.dotActive]} />
          ))}
        </View>

        <View style={styles.footer}>
          <TouchableOpacity style={styles.btn} onPress={next} activeOpacity={0.85}>
            <Text style={styles.btnTxt}>
              {idx === SLIDES.length - 1 ? "ACESSAR O CLUBE" : "CONTINUAR"}
            </Text>
            <Ionicons name="arrow-forward" size={18} color="#000" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: 22, paddingTop: 8 },
  skip: { color: "#888", fontSize: 14, fontWeight: "600", letterSpacing: 0.5 },
  slide: { alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  iconWrap: {
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: "rgba(212,175,55,0.08)",
    alignItems: "center", justifyContent: "center", marginBottom: 36,
  },
  title: {
    color: "#FFF", fontSize: 28, fontWeight: "900",
    textAlign: "center", lineHeight: 34, letterSpacing: -0.5,
  },
  subtitle: {
    color: "#B8B8B8", fontSize: 15, fontWeight: "400",
    textAlign: "center", marginTop: 18, lineHeight: 22, maxWidth: 320,
  },
  dots: { flexDirection: "row", justifyContent: "center", gap: 8, paddingVertical: 18 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#333" },
  dotActive: { backgroundColor: GOLD, width: 24 },
  footer: { paddingHorizontal: 22, paddingBottom: 8 },
  btn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    backgroundColor: GOLD, paddingVertical: 16, borderRadius: 14,
  },
  btnTxt: { color: "#000", fontSize: 13, fontWeight: "900", letterSpacing: 1.5 },
});

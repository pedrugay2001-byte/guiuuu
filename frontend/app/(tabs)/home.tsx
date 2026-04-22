import { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Pressable,
  ImageBackground, useWindowDimensions, Image, Animated,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { api, Post, Ad, formatBRL } from "../../src/api";
import { useGate } from "../../src/gate";
import { TIERS } from "../../src/theme";
import { BrandLogo } from "../../src/brand";

const GOLD = "#D4AF37";
const BG_IMAGE = "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=1400&q=80";

type Area = {
  id: string; label: string; icon: { lib: "ion" | "mci"; name: string };
  route?: string; soon?: boolean;
};

const AREAS: Area[] = [
  { id: "ai", label: "BLACK AI", icon: { lib: "mci", name: "brain" }, route: "/ai" },
  { id: "community", label: "Comunidade", icon: { lib: "ion", name: "chatbubbles" }, route: "/(tabs)/community" },
  { id: "marketplace", label: "Marketplace", icon: { lib: "ion", name: "storefront" }, route: "/(tabs)/catalog" },
  { id: "planos", label: "Planos", icon: { lib: "mci", name: "diamond-stone" }, route: "/(tabs)/negocios" },
  { id: "wallet", label: "Banco", icon: { lib: "ion", name: "wallet" }, route: "/(tabs)/wallet" },
  { id: "performance", label: "Performance", icon: { lib: "mci", name: "chart-line-variant" }, route: "/(tabs)/performance" },
  { id: "chat", label: "Suporte", icon: { lib: "ion", name: "headset" }, route: "/chat" },
  { id: "profissionais", label: "Profissionais", icon: { lib: "mci", name: "stethoscope" }, route: "/ai" },
];

function AreaIcon({ icon, size, color }: { icon: Area["icon"]; size: number; color: string }) {
  if (icon.lib === "mci") return <MaterialCommunityIcons name={icon.name as any} size={size} color={color} />;
  return <Ionicons name={icon.name as any} size={size} color={color} />;
}

export default function Home() {
  const router = useRouter();
  const { member } = useGate();
  const { width } = useWindowDimensions();
  const [posts, setPosts] = useState<Post[]>([]);
  const [ads, setAds] = useState<Ad[]>([]);

  const load = useCallback(async () => {
    try {
      const [pp, aa] = await Promise.all([api.listPosts().catch(() => []), api.listAds().catch(() => [])]);
      setPosts(pp.slice(0, 6));
      setAds(aa.slice(0, 6));
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const W = Math.min(width, 430);
  const featW = W - 36;  // wider margins so right side isn't cut
  const featH = featW * 0.48;

  return (
    <ImageBackground
      source={{ uri: BG_IMAGE }}
      style={{ flex: 1, backgroundColor: "#000" }}
      imageStyle={{ opacity: 0.28 }}
      testID="home-screen"
    >
      <View style={styles.overlay1} />
      <View style={styles.overlay2} />

      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        {/* Minimalist header */}
        <View style={styles.header}>
          <View style={{ flex: 1, flexDirection: "row", alignItems: "center" }}>
            <BrandLogo size="sm" />
          </View>
          <TouchableOpacity style={styles.avBtn} onPress={() => router.push("/(tabs)/member")} testID="home-profile" activeOpacity={0.85}>
            {member?.avatar_base64 ? (
              <Image source={{ uri: member.avatar_base64 }} style={styles.av} />
            ) : (
              <View style={[styles.av, { backgroundColor: "#1A1A1A", alignItems: "center", justifyContent: "center" }]}>
                <Ionicons name="person" size={16} color="#D4AF37" />
              </View>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {/* Greeting (no gold kicker above name) */}
          <View style={styles.greet}>
            <Text style={styles.greetTitle}>Bem-vindo, {(member?.nickname || member?.name || "você").split(" ")[0]}.</Text>
          </View>

          {/* Central de Performance — replaces "Destaque da Semana" */}
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => router.push("/(tabs)/performance")}
            style={[styles.featured, { width: featW, marginHorizontal: 18 }]}
            testID="home-performance"
          >
            <View style={styles.perfCard}>
              <View style={styles.perfGlow} />
              <View style={styles.perfRow}>
                <View style={styles.perfIconRing}>
                  <MaterialCommunityIcons name="chart-line-variant" size={22} color={GOLD} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.perfKicker}>CENTRAL DE PERFORMANCE</Text>
                  <Text style={styles.perfTitle}>Defina sua primeira meta</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={GOLD} />
              </View>
              <Text style={styles.perfSub}>
                Fitness, financeiro, hábitos e produtividade — tudo em um só lugar, com previsões inteligentes.
              </Text>
              <View style={styles.perfStats}>
                <View style={styles.perfStat}>
                  <Text style={styles.perfStatVal}>0</Text>
                  <Text style={styles.perfStatLbl}>METAS</Text>
                </View>
                <View style={styles.perfDiv} />
                <View style={styles.perfStat}>
                  <Text style={styles.perfStatVal}>—</Text>
                  <Text style={styles.perfStatLbl}>SCORE</Text>
                </View>
                <View style={styles.perfDiv} />
                <View style={styles.perfStat}>
                  <Text style={styles.perfStatVal}>0d</Text>
                  <Text style={styles.perfStatLbl}>SEQUÊNCIA</Text>
                </View>
              </View>
            </View>
          </TouchableOpacity>

          {/* Quick access glass grid */}
          <View style={styles.gridWrap}>
            <Text style={styles.sectionLbl}>ACESSO RÁPIDO</Text>
            <View style={styles.grid}>
              {AREAS.map((a) => (
                <Pressable
                  key={a.id}
                  onPress={() => { if (!a.soon && a.route) router.push(a.route as any); }}
                  style={({ pressed }) => [styles.tile, pressed && { transform: [{ scale: 0.94 }] }]}
                  testID={`area-${a.id}`}
                >
                  {({ pressed }) => (
                    <View style={[styles.tileGlass, pressed && { borderColor: GOLD, backgroundColor: "rgba(212,175,55,0.12)" }]}>
                      <AreaIcon icon={a.icon} size={22} color={pressed ? GOLD : "#EEE"} />
                      <Text style={[styles.tileLbl, pressed && { color: GOLD }]}>{a.label}</Text>
                    </View>
                  )}
                </Pressable>
              ))}
            </View>
          </View>

          {/* Feed preview */}
          {posts.length > 0 && (
            <View style={{ marginTop: 22 }}>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionLbl}>ATIVIDADE DO CLUBE</Text>
                <TouchableOpacity onPress={() => router.push("/(tabs)/community")}>
                  <Text style={styles.seeAll}>Ver tudo</Text>
                </TouchableOpacity>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, gap: 10 }}>
                {posts.map((p) => {
                  const tier = TIERS[p.author_tier || "silver"];
                  return (
                    <TouchableOpacity key={p.post_id} style={styles.postCard} onPress={() => router.push(`/community/member/${p.member_id}`)} activeOpacity={0.9}>
                      <View style={styles.postCardGlass}>
                        <View style={styles.postHead}>
                          <View style={[styles.postAvRing, { borderColor: tier.color }]}>
                            {p.author_avatar ? <Image source={{ uri: p.author_avatar }} style={styles.postAv} /> : (
                              <View style={[styles.postAv, { backgroundColor: "#2A2A2A", alignItems: "center", justifyContent: "center" }]}>
                                <Text style={{ color: "#EEE", fontWeight: "800", fontSize: 11 }}>{(p.author_nickname || "?").charAt(0).toUpperCase()}</Text>
                              </View>
                            )}
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.postAuthor}>{p.author_nickname}</Text>
                            <Text style={styles.postCity}>{p.author_city || "BLACKSCLUB"}</Text>
                          </View>
                        </View>
                        {p.image_base64 ? <Image source={{ uri: p.image_base64 }} style={styles.postImg} /> : (
                          <Text style={styles.postText} numberOfLines={3}>{p.text}</Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* Marketplace preview */}
          {ads.length > 0 && (
            <View style={{ marginTop: 22 }}>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionLbl}>MARKETPLACE EM ALTA</Text>
                <TouchableOpacity onPress={() => router.push("/ads")}>
                  <Text style={styles.seeAll}>Ver tudo</Text>
                </TouchableOpacity>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, gap: 10 }}>
                {ads.map((a) => (
                  <TouchableOpacity key={a.ad_id} style={styles.adCard} onPress={() => router.push(`/ads/${a.ad_id}`)} activeOpacity={0.9}>
                    {a.images?.[0] ? <Image source={{ uri: a.images[0] }} style={styles.adImg} /> : (
                      <View style={[styles.adImg, { alignItems: "center", justifyContent: "center" }]}>
                        <Ionicons name="cube-outline" size={22} color="#444" />
                      </View>
                    )}
                    <Text style={styles.adTitle} numberOfLines={2}>{a.title}</Text>
                    <Text style={styles.adPrice}>{formatBRL(a.price_full)}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  overlay1: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.70)" },
  overlay2: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(5,5,5,0.35)" },

  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 6, paddingBottom: 8 },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1 },
  logoDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: GOLD },
  logoTxt: { color: "#FFF", fontSize: 11, fontWeight: "900", letterSpacing: 3.2 },
  avBtn: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: "rgba(212,175,55,0.6)", overflow: "hidden" },
  av: { width: 30, height: 30, borderRadius: 15 },

  greet: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 4 },
  greetKicker: { color: GOLD, fontSize: 9, fontWeight: "900", letterSpacing: 3 },
  greetTitle: { color: "#F0F0F0", fontSize: 20, fontWeight: "800", marginTop: 4, letterSpacing: 0.2 },

  featured: { marginTop: 14, borderRadius: 18, overflow: "hidden" },
  featuredGlass: {
    flex: 1,
    padding: 18,
    backgroundColor: "rgba(14,14,14,0.55)",
    borderWidth: 1,
    borderColor: "rgba(212,175,55,0.4)",
    borderRadius: 18,
    justifyContent: "space-between",
  },
  featuredBadge: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20, backgroundColor: "rgba(212,175,55,0.1)", borderWidth: 1, borderColor: "rgba(212,175,55,0.3)" },
  featuredBadgeTxt: { color: GOLD, fontSize: 8.5, fontWeight: "900", letterSpacing: 1.5 },
  featuredTitle: { color: "#FFF", fontSize: 20, fontWeight: "900", lineHeight: 23 },
  featuredSub: { color: "#BBB", fontSize: 11, lineHeight: 15 },
  featuredCta: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", backgroundColor: GOLD, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 },
  featuredCtaTxt: { color: "#000", fontSize: 11, fontWeight: "900", letterSpacing: 1.2 },

  // Central de Performance card
  perfCard: {
    backgroundColor: "rgba(11,11,11,0.85)",
    borderWidth: 1.5,
    borderColor: "rgba(212,175,55,0.45)",
    borderRadius: 18,
    padding: 18,
    position: "relative",
    overflow: "hidden",
  },
  perfGlow: {
    position: "absolute",
    top: -60, right: -60,
    width: 220, height: 220, borderRadius: 110,
    backgroundColor: "rgba(212,175,55,0.07)",
  },
  perfRow: { flexDirection: "row", alignItems: "center" },
  perfIconRing: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: "rgba(212,175,55,0.1)",
    borderWidth: 1.2, borderColor: "rgba(212,175,55,0.4)",
    alignItems: "center", justifyContent: "center",
  },
  perfKicker: { color: GOLD, fontSize: 9, fontWeight: "900", letterSpacing: 2.5 },
  perfTitle: { color: "#FFF", fontSize: 16, fontWeight: "800", marginTop: 3 },
  perfSub: { color: "#A3A3A3", fontSize: 12, lineHeight: 17, marginTop: 12 },
  perfStats: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-around",
    marginTop: 14, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)",
  },
  perfStat: { alignItems: "center", flex: 1 },
  perfStatVal: { color: "#FFF", fontSize: 18, fontWeight: "900" },
  perfStatLbl: { color: "#666", fontSize: 9, fontWeight: "800", letterSpacing: 1.2, marginTop: 2 },
  perfDiv: { width: 1, height: 24, backgroundColor: "rgba(255,255,255,0.08)" },

  gridWrap: { marginTop: 22 },
  sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingRight: 18 },
  sectionLbl: { color: "#888", fontSize: 10, fontWeight: "900", letterSpacing: 2.5, paddingHorizontal: 18, marginBottom: 10 },
  seeAll: { color: GOLD, fontSize: 11, fontWeight: "800", letterSpacing: 1 },

  grid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 10, gap: 8 },
  tile: { width: "23%" },
  tileGlass: { aspectRatio: 1, borderRadius: 14, backgroundColor: "rgba(15,15,15,0.65)", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", alignItems: "center", justifyContent: "center", padding: 6, gap: 6 },
  tileLbl: { color: "#DDD", fontSize: 9, fontWeight: "700", letterSpacing: 0.5, textAlign: "center" },

  postCard: { width: 170, borderRadius: 14, overflow: "hidden" },
  postCardGlass: { backgroundColor: "rgba(15,15,15,0.7)", padding: 12, borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" },
  postHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  postAvRing: { borderWidth: 2, borderRadius: 18, padding: 1 },
  postAv: { width: 28, height: 28, borderRadius: 14 },
  postAuthor: { color: "#EEE", fontSize: 12, fontWeight: "800" },
  postCity: { color: "#999", fontSize: 10 },
  postImg: { width: "100%", height: 110, borderRadius: 8, backgroundColor: "#1A1A1A" },
  postText: { color: "#CCC", fontSize: 12, lineHeight: 16, minHeight: 60 },

  adCard: { width: 140, borderRadius: 12, overflow: "hidden", backgroundColor: "rgba(15,15,15,0.7)", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", padding: 8 },
  adImg: { width: "100%", height: 90, borderRadius: 8, backgroundColor: "#1A1A1A" },
  adTitle: { color: "#EEE", fontSize: 12, fontWeight: "700", marginTop: 8, minHeight: 32 },
  adPrice: { color: GOLD, fontSize: 13, fontWeight: "900", marginTop: 4 },
});

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

const GOLD = "#D4AF37";
const BG_IMAGE = "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=1400&q=80";

type Area = {
  id: string; label: string; icon: { lib: "ion" | "mci"; name: string };
  route?: string; soon?: boolean;
};

const AREAS: Area[] = [
  { id: "ai", label: "BLACK AI", icon: { lib: "mci", name: "brain" }, route: "/ai" },
  { id: "community", label: "Comunidade", icon: { lib: "ion", name: "chatbubbles" }, route: "/(tabs)/community" },
  { id: "ads", label: "Marketplace", icon: { lib: "ion", name: "storefront" }, route: "/ads" },
  { id: "negocios", label: "Negócios", icon: { lib: "mci", name: "diamond-stone" }, route: "/(tabs)/negocios" },
  { id: "wallet", label: "BLACK Coins", icon: { lib: "ion", name: "wallet" }, route: "/(tabs)/wallet" },
  { id: "catalog", label: "Produtos", icon: { lib: "ion", name: "cube" }, route: "/(tabs)/catalog" },
  { id: "chat", label: "Suporte", icon: { lib: "ion", name: "headset" }, route: "/chat" },
  { id: "alertas", label: "Alertas", icon: { lib: "ion", name: "notifications" }, route: "/(tabs)/notifications" },
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
  const featW = W - 28;
  const featH = featW * 0.5;

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
          <View style={styles.logoRow}>
            <View style={styles.logoDot} />
            <Text style={styles.logoTxt}>BLACKSCLUB</Text>
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
          {/* Greeting */}
          <View style={styles.greet}>
            <Text style={styles.greetKicker}>Membro {TIERS[member?.tier || "silver"].label.toUpperCase()}</Text>
            <Text style={styles.greetTitle}>Bem-vindo, {(member?.nickname || member?.name || "você").split(" ")[0]}.</Text>
          </View>

          {/* Featured of the week */}
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => router.push("/ads")}
            style={[styles.featured, { width: featW, height: featH, marginHorizontal: 14 }]}
            testID="home-featured"
          >
            <View style={styles.featuredGlass}>
              <View style={styles.featuredBadge}>
                <MaterialCommunityIcons name="star-four-points" size={10} color={GOLD} />
                <Text style={styles.featuredBadgeTxt}>DESTAQUE DA SEMANA</Text>
              </View>
              <Text style={styles.featuredTitle}>Marketplace{"\n"}entre membros.</Text>
              <Text style={styles.featuredSub}>Compre de Black Diamonds verificados · Pagamento com escrow em BLACK Coins</Text>
              <View style={styles.featuredCta}>
                <Text style={styles.featuredCtaTxt}>Explorar</Text>
                <Ionicons name="arrow-forward" size={13} color="#000" />
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
                  style={({ pressed }) => [styles.tile, pressed && { transform: [{ scale: 0.97 }], opacity: 0.85 }]}
                  testID={`area-${a.id}`}
                >
                  <View style={styles.tileGlass}>
                    <AreaIcon icon={a.icon} size={22} color="#EEE" />
                    <Text style={styles.tileLbl}>{a.label}</Text>
                  </View>
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

  gridWrap: { marginTop: 22 },
  sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingRight: 18 },
  sectionLbl: { color: "#888", fontSize: 10, fontWeight: "900", letterSpacing: 2.5, paddingHorizontal: 18, marginBottom: 10 },
  seeAll: { color: GOLD, fontSize: 11, fontWeight: "800", letterSpacing: 1 },

  grid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 10, gap: 8 },
  tile: { width: "23%" },
  tileGlass: { aspectRatio: 1, borderRadius: 14, backgroundColor: "rgba(15,15,15,0.65)", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", alignItems: "center", justifyContent: "center", padding: 6, gap: 6 },
  tileLbl: { color: "#DDD", fontSize: 9, fontWeight: "700", letterSpacing: 0.5, textAlign: "center" },

  postCard: { width: 220, borderRadius: 14, overflow: "hidden" },
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

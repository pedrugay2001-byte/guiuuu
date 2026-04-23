import { useCallback, useState, useEffect } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, useWindowDimensions, ImageBackground,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Svg, { Circle, Path, Defs, LinearGradient, Stop } from "react-native-svg";
import { api, Post, Ad, formatBRL } from "../../src/api";
import { useGate } from "../../src/gate";
import { TIERS } from "../../src/theme";
import { BrandLogo } from "../../src/brand";

const GOLD = "#F5C150";      // brighter gold from the mockup
const GOLD_DIM = "#D4AF37";
const RED = "#FF4F4F";
const GREEN = "#2ECC71";
const BG_IMAGE = "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=1400&q=80";

type AreaId = "ai" | "community" | "marketplace" | "planos" | "wallet" | "performance" | "chat" | "profissionais";
type Area = { id: AreaId; label: string; icon: { lib: "ion" | "mci"; name: string }; route: string };

const AREAS: Area[] = [
  { id: "ai",             label: "BLACK AI",      icon: { lib: "mci", name: "brain" },               route: "/ai" },
  { id: "community",      label: "Comunidade",    icon: { lib: "ion", name: "chatbubbles" },         route: "/(tabs)/community" },
  { id: "marketplace",    label: "Marketplace",   icon: { lib: "ion", name: "storefront" },          route: "/(tabs)/catalog" },
  { id: "planos",         label: "Planos",        icon: { lib: "mci", name: "diamond-stone" },       route: "/(tabs)/negocios" },
  { id: "wallet",         label: "Banco",         icon: { lib: "ion", name: "wallet" },              route: "/(tabs)/wallet" },
  { id: "performance",    label: "Performance",   icon: { lib: "mci", name: "chart-line-variant" },  route: "/(tabs)/performance" },
  { id: "chat",           label: "Suporte",       icon: { lib: "ion", name: "headset" },             route: "/chat" },
  { id: "profissionais",  label: "Profissionais", icon: { lib: "mci", name: "stethoscope" },         route: "/ai" },
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
      setAds(aa.slice(0, 8));
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const W = Math.min(width, 430);
  const name = (member?.nickname || member?.name || "você").split(" ")[0];

  // MOCK data — will be replaced by real goals in Phase 3 backend
  const stats = {
    activeGoals: 0,
    progress: 0,
    rhythm: 0,
    daysLeft: 0,
    weeklyDelta: 0,
    hasAnyGoal: false,
  };

  return (
    <ImageBackground source={{ uri: BG_IMAGE }} style={{ flex: 1 }} resizeMode="cover">
      <View style={s.backdrop} />
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        {/* HEADER */}
        <View style={s.header}>
          <BrandLogo size="md" />
          <TouchableOpacity
            onPress={() => router.push("/(tabs)/member")}
            style={s.profileBtn}
            testID="home-profile"
            activeOpacity={0.85}
          >
            <Ionicons name="person" size={18} color={GOLD} />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingBottom: 60 }}
          showsVerticalScrollIndicator={false}
          testID="home-scroll"
        >
          {/* GREETING */}
          <View style={s.greet}>
            <Text style={s.greetHello}>Bem-vindo,</Text>
            <Text style={s.greetName}>{name}.</Text>
            <Text style={s.greetSub}>Foco hoje, resultado amanhã.</Text>
          </View>

          {/* CENTRAL DE PERFORMANCE — HERO */}
          <View style={[s.central, { marginHorizontal: 14 }]} testID="central-performance">
            <View style={s.centralHeader}>
              <View style={s.centralHeaderIcon}>
                <MaterialCommunityIcons name="chart-line-variant" size={14} color={GOLD} />
              </View>
              <Text style={s.centralTitle}>CENTRAL DE PERFORMANCE</Text>
            </View>

            {/* ASSISTENTE BLACK */}
            <View style={s.aiBlock}>
              <View style={s.aiLeft}>
                <View style={s.aiBrainWrap}>
                  <View style={s.aiBrainGlow} />
                  <MaterialCommunityIcons name="brain" size={40} color={GOLD} />
                </View>
              </View>
              <View style={s.aiRight}>
                <View style={s.aiLabelRow}>
                  <Text style={s.aiLabel}>ASSISTENTE BLACK</Text>
                  <View style={s.aiBadge}>
                    <Text style={s.aiBadgeTxt}>AI</Text>
                  </View>
                </View>
                <Text style={s.aiMsg}>
                  {stats.hasAnyGoal
                    ? "Você está 12% abaixo do ritmo ideal para atingir sua meta."
                    : "Defina sua primeira meta e a IA começa a te guiar."}
                </Text>
                <Text style={s.aiTip}>
                  {stats.hasAnyGoal ? "Consistência é a chave." : "Clique abaixo para começar."}
                </Text>
              </View>
            </View>

            <View style={s.aiBtnRow}>
              <TouchableOpacity
                style={s.aiBtnGhost}
                onPress={() => router.push("/(tabs)/performance")}
                testID="ai-ver-analise"
                activeOpacity={0.85}
              >
                <Text style={s.aiBtnGhostTxt}>Ver análise completa</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.aiBtnMain}
                onPress={() => router.push("/(tabs)/performance")}
                testID="ai-fazer-hoje"
                activeOpacity={0.9}
              >
                <MaterialCommunityIcons name="star-four-points" size={13} color="#000" />
                <Text style={s.aiBtnMainTxt}>O QUE FAZER HOJE?</Text>
              </TouchableOpacity>
            </View>

            {/* STATS GRID 4 cols */}
            <View style={s.statsDivider} />
            <View style={s.statsRow}>
              <StatBox
                icon="target"
                value={stats.activeGoals}
                label="METAS ATIVAS"
                caption={stats.activeGoals > 0 ? "ver metas" : "criar meta"}
                captionColor={GOLD}
                onPress={() => router.push("/(tabs)/performance")}
              />
              <StatBox
                ring={stats.progress}
                value={`${stats.progress}%`}
                label="PROGRESSO GERAL"
                caption={stats.weeklyDelta > 0 ? `+${stats.weeklyDelta}% essa semana` : "—"}
                captionColor={GREEN}
              />
              <StatBox
                icon="trending-up"
                value={stats.rhythm > 0 ? `+${stats.rhythm}%` : `${stats.rhythm}%`}
                label="RITMO ATUAL"
                caption={stats.hasAnyGoal ? "abaixo do ideal" : "sem dados"}
                captionColor={stats.hasAnyGoal ? RED : "#666"}
              />
              <StatBox
                icon="calendar-month"
                value={stats.daysLeft > 0 ? String(stats.daysLeft) : "—"}
                label="DIAS RESTANTES"
                caption={stats.hasAnyGoal ? "para sua meta" : "sem meta ativa"}
                captionColor="#888"
              />
            </View>

            {/* PREVISÃO DE RESULTADO */}
            <View style={s.statsDivider} />
            <View style={s.forecastRow}>
              <View style={s.forecastChart}>
                <View style={s.forecastHead}>
                  <Text style={s.forecastKicker}>PREVISÃO DE RESULTADO</Text>
                  <Ionicons name="information-circle-outline" size={12} color="#888" />
                </View>
                <Text style={s.forecastSub}>Baseado no seu desempenho atual</Text>
                <ForecastChart w={(W - 28 - 24) * 0.56} h={78} hasData={stats.hasAnyGoal} />
                <View style={s.forecastLabels}>
                  <Text style={s.forecastLbl}>Hoje</Text>
                  <Text style={s.forecastLbl}>Meta</Text>
                </View>
              </View>
              <View style={s.forecastRight}>
                <View style={s.trophyWrap}>
                  <Ionicons name="trophy" size={22} color={GOLD} />
                </View>
                <Text style={s.forecastSmall}>
                  {stats.hasAnyGoal ? "Se manter esse ritmo, você alcança sua meta em" : "Crie uma meta para ver a previsão."}
                </Text>
                {stats.hasAnyGoal && (
                  <>
                    <Text style={s.forecastDays}>63 dias</Text>
                    <Text style={s.forecastDate}>16 de Ago de 2024</Text>
                  </>
                )}
                <TouchableOpacity
                  style={s.forecastBtn}
                  onPress={() => router.push("/(tabs)/performance")}
                  activeOpacity={0.85}
                >
                  <Text style={s.forecastBtnTxt}>
                    {stats.hasAnyGoal ? "Ver projeção detalhada" : "Começar agora"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* ACESSO RÁPIDO */}
          <Text style={s.sectionLbl}>ACESSO RÁPIDO</Text>
          <View style={s.grid}>
            {AREAS.map((a) => (
              <TouchableOpacity
                key={a.id}
                onPress={() => router.push(a.route as any)}
                style={s.tile}
                activeOpacity={0.85}
                testID={`area-${a.id}`}
              >
                <AreaIcon icon={a.icon} size={22} color="#EFEFEF" />
                <Text style={s.tileLbl}>{a.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ATIVIDADE DO CLUBE — revealed on scroll */}
          {posts.length > 0 && (
            <View style={{ marginTop: 30 }}>
              <View style={s.sectionHead}>
                <Text style={s.sectionLbl2}>ATIVIDADE DO CLUBE</Text>
                <TouchableOpacity onPress={() => router.push("/(tabs)/community")} hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}>
                  <Text style={s.seeAllMuted}>Ver tudo</Text>
                </TouchableOpacity>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, gap: 10 }}>
                {posts.map((p) => {
                  const tier = TIERS[p.author_tier || "silver"];
                  return (
                    <TouchableOpacity key={p.post_id} style={s.postCard} onPress={() => router.push(`/community/member/${p.member_id}`)} activeOpacity={0.9}>
                      <View style={s.postHead}>
                        <View style={[s.postAvRing, { borderColor: tier.color }]}>
                          {p.author_avatar ? <Image source={{ uri: p.author_avatar }} style={s.postAv} /> : (
                            <View style={[s.postAv, { backgroundColor: "#2A2A2A", alignItems: "center", justifyContent: "center" }]}>
                              <Text style={{ color: "#EEE", fontWeight: "800", fontSize: 11 }}>{(p.author_nickname || "?").charAt(0).toUpperCase()}</Text>
                            </View>
                          )}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.postAuthor}>{p.author_nickname}</Text>
                          <Text style={s.postCity}>{p.author_city || "BLACKSCLUB"}</Text>
                        </View>
                      </View>
                      {p.image_base64 ? <Image source={{ uri: p.image_base64 }} style={s.postImg} /> : (
                        <Text style={s.postText} numberOfLines={3}>{p.text}</Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* MARKETPLACE EM ALTA — Gold emphasis */}
          {ads.length > 0 && (
            <View style={{ marginTop: 28 }}>
              <View style={s.sectionHead}>
                <Text style={s.sectionLblGold}>MARKETPLACE EM ALTA</Text>
                <TouchableOpacity onPress={() => router.push("/(tabs)/catalog")} hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}>
                  <Text style={s.seeAllGold}>Ver tudo</Text>
                </TouchableOpacity>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, gap: 10 }}>
                {ads.map((ad) => (
                  <TouchableOpacity
                    key={ad.ad_id}
                    style={s.adCard}
                    onPress={() => router.push({ pathname: "/ads/[id]", params: { id: ad.ad_id } })}
                    activeOpacity={0.9}
                  >
                    {ad.images?.[0] ? (
                      <Image source={{ uri: ad.images[0] }} style={s.adImg} />
                    ) : (
                      <View style={[s.adImg, { alignItems: "center", justifyContent: "center", backgroundColor: "#1A1A1A" }]}>
                        <Ionicons name="diamond" size={20} color="#7FD7E5" />
                      </View>
                    )}
                    <Text style={s.adTitle} numberOfLines={2}>{ad.title}</Text>
                    <Text style={s.adPrice}>{formatBRL(ad.price_full)}</Text>
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

/* ------------ SUB-COMPONENTS ------------ */

function StatBox({
  icon, ring, value, label, caption, captionColor, onPress,
}: {
  icon?: string;
  ring?: number;
  value: string | number;
  label: string;
  caption?: string;
  captionColor?: string;
  onPress?: () => void;
}) {
  const Wrapper = onPress ? TouchableOpacity : View;
  return (
    <Wrapper style={s.statBox} onPress={onPress} activeOpacity={0.85}>
      <View style={s.statIconWrap}>
        {ring !== undefined ? (
          <RingProgress size={42} stroke={3.5} progress={ring} centerLabel={`${ring}%`} />
        ) : (
          <MaterialCommunityIcons name={(icon || "star") as any} size={22} color="#EFEFEF" />
        )}
      </View>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={s.statValue}>{value}</Text>
      {caption ? <Text style={[s.statCaption, { color: captionColor || "#888" }]}>{caption}</Text> : null}
    </Wrapper>
  );
}

function RingProgress({ size, stroke, progress, centerLabel }: { size: number; stroke: number; progress: number; centerLabel?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, progress));
  const off = c - (c * pct) / 100;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke="#2A2A2A" strokeWidth={stroke} fill="transparent" />
        <Circle
          cx={size / 2} cy={size / 2} r={r}
          stroke={GOLD} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${c} ${c}`} strokeDashoffset={off}
          fill="transparent"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {centerLabel ? <Text style={{ position: "absolute", color: "#FFF", fontSize: 11, fontWeight: "900" }}>{centerLabel}</Text> : null}
    </View>
  );
}

function ForecastChart({ w, h, hasData }: { w: number; h: number; hasData: boolean }) {
  // Simulated smooth curve (8 pts) that grows
  const pts = [
    [0, 0.85], [w * 0.12, 0.72], [w * 0.24, 0.62], [w * 0.36, 0.55],
    [w * 0.48, 0.46], [w * 0.6, 0.38], [w * 0.72, 0.33], [w * 0.86, 0.24],
  ];
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0]} ${p[1] * h}`).join(" ");
  const dashed = `M ${w * 0.86} ${0.24 * h} L ${w} ${0.08 * h}`;
  return (
    <View style={{ marginTop: 10, width: w, height: h }}>
      <Svg width={w} height={h}>
        <Defs>
          <LinearGradient id="lg" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={GOLD} stopOpacity="0.2" />
            <Stop offset="1" stopColor={GOLD} stopOpacity="1" />
          </LinearGradient>
        </Defs>
        {hasData && (
          <>
            <Path d={path} stroke="url(#lg)" strokeWidth={2} fill="transparent" strokeLinecap="round" />
            <Path d={dashed} stroke={GOLD} strokeWidth={1.3} fill="transparent" strokeDasharray="3,3" strokeLinecap="round" />
            <Circle cx={w} cy={0.08 * h} r={5} fill={GOLD} />
            <Circle cx={w} cy={0.08 * h} r={8} fill={GOLD} fillOpacity={0.3} />
          </>
        )}
        {!hasData && (
          <Path d={`M 0 ${h * 0.7} L ${w} ${h * 0.3}`} stroke="#2A2A2A" strokeWidth={1.5} strokeDasharray="4,4" fill="transparent" />
        )}
      </Svg>
    </View>
  );
}

/* ------------ STYLES ------------ */

const s = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(5,5,5,0.92)" },

  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 18, paddingTop: 8, paddingBottom: 12,
  },
  profileBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(10,10,10,0.6)",
    borderWidth: 2, borderColor: GOLD,
  },

  greet: { paddingHorizontal: 20, marginTop: 16, marginBottom: 26, alignItems: "center" },
  greetHello: { color: "#EEE", fontSize: 18, fontWeight: "500" },
  greetName: { color: GOLD, fontSize: 32, fontWeight: "900", marginTop: -4, letterSpacing: 0.5 },
  greetSub: { color: "#888", fontSize: 12, marginTop: 6, fontWeight: "600" },

  // CENTRAL
  central: {
    backgroundColor: "rgba(10,10,10,0.85)",
    borderWidth: 1.5, borderColor: "rgba(245,193,80,0.5)",
    borderRadius: 18, paddingVertical: 16, paddingHorizontal: 14,
  },
  centralHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14, paddingHorizontal: 2 },
  centralHeaderIcon: {
    width: 26, height: 26, borderRadius: 13,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(245,193,80,0.1)",
    borderWidth: 1, borderColor: "rgba(245,193,80,0.3)",
  },
  centralTitle: { color: GOLD, fontSize: 12, fontWeight: "900", letterSpacing: 2.5 },

  // AI BLOCK
  aiBlock: {
    flexDirection: "row",
    backgroundColor: "rgba(20,20,20,0.5)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.05)",
    borderRadius: 12, padding: 12, gap: 12,
  },
  aiLeft: { width: 70, alignItems: "center", justifyContent: "center" },
  aiBrainWrap: {
    width: 64, height: 64, borderRadius: 32,
    alignItems: "center", justifyContent: "center", position: "relative",
  },
  aiBrainGlow: {
    position: "absolute", width: 64, height: 64, borderRadius: 32,
    backgroundColor: "rgba(245,193,80,0.18)",
  },
  aiRight: { flex: 1 },
  aiLabelRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  aiLabel: { color: GOLD, fontSize: 11, fontWeight: "900", letterSpacing: 1.5 },
  aiBadge: { backgroundColor: GOLD, borderRadius: 9, paddingHorizontal: 5, paddingVertical: 1 },
  aiBadgeTxt: { color: "#000", fontSize: 8, fontWeight: "900", letterSpacing: 0.5 },
  aiMsg: { color: "#FFF", fontSize: 13, fontWeight: "700", lineHeight: 17 },
  aiTip: { color: "#888", fontSize: 11, marginTop: 3, fontWeight: "500" },

  aiBtnRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  aiBtnGhost: {
    flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(20,20,20,0.4)",
  },
  aiBtnGhostTxt: { color: "#DDD", fontSize: 11, fontWeight: "700" },
  aiBtnMain: {
    flex: 1.1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    paddingVertical: 11, borderRadius: 10,
    backgroundColor: GOLD,
  },
  aiBtnMainTxt: { color: "#000", fontSize: 11, fontWeight: "900", letterSpacing: 1 },

  // STATS
  statsDivider: { height: 1, backgroundColor: "rgba(255,255,255,0.05)", marginVertical: 14 },
  statsRow: { flexDirection: "row", justifyContent: "space-between", gap: 4 },
  statBox: { flex: 1, alignItems: "center", paddingHorizontal: 2 },
  statIconWrap: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    marginBottom: 10,
  },
  statLabel: { color: "#999", fontSize: 8.5, fontWeight: "900", letterSpacing: 1, textAlign: "center", minHeight: 22 },
  statValue: { color: "#FFF", fontSize: 20, fontWeight: "900", marginTop: 4 },
  statCaption: { fontSize: 9, fontWeight: "700", marginTop: 4, textAlign: "center" },

  // FORECAST
  forecastRow: { flexDirection: "row", gap: 10 },
  forecastChart: {
    flex: 1.3,
    backgroundColor: "rgba(20,20,20,0.5)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.05)",
    borderRadius: 10, padding: 10,
  },
  forecastHead: { flexDirection: "row", alignItems: "center", gap: 4 },
  forecastKicker: { color: GOLD, fontSize: 9.5, fontWeight: "900", letterSpacing: 1.5 },
  forecastSub: { color: "#888", fontSize: 9, marginTop: 2 },
  forecastLabels: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  forecastLbl: { color: "#888", fontSize: 9, fontWeight: "700" },

  forecastRight: {
    flex: 1, alignItems: "center",
    backgroundColor: "rgba(20,20,20,0.5)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.05)",
    borderRadius: 10, padding: 10,
  },
  trophyWrap: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(245,193,80,0.12)",
    borderWidth: 1, borderColor: "rgba(245,193,80,0.3)",
    marginBottom: 6,
  },
  forecastSmall: { color: "#CCC", fontSize: 10, textAlign: "center", lineHeight: 13 },
  forecastDays: { color: GOLD, fontSize: 19, fontWeight: "900", marginTop: 4 },
  forecastDate: { color: "#888", fontSize: 9, marginBottom: 8 },
  forecastBtn: {
    paddingVertical: 7, paddingHorizontal: 10, borderRadius: 14,
    borderWidth: 1, borderColor: "rgba(245,193,80,0.5)",
  },
  forecastBtnTxt: { color: GOLD, fontSize: 9.5, fontWeight: "800", letterSpacing: 0.5 },

  // SECTIONS
  sectionLbl: { color: "#B0B0B0", fontSize: 11, fontWeight: "900", letterSpacing: 2.5, marginTop: 30, marginBottom: 14, paddingHorizontal: 18 },
  sectionLbl2: { color: "#888", fontSize: 10, fontWeight: "900", letterSpacing: 2.5, paddingHorizontal: 18 },
  sectionLblGold: { color: GOLD, fontSize: 10, fontWeight: "900", letterSpacing: 2.5, paddingHorizontal: 18 },
  sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12, paddingRight: 18 },
  seeAllMuted: { color: "#888", fontSize: 11, fontWeight: "700" },
  seeAllGold: { color: GOLD, fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },

  // GRID TILES (bigger, 2×4)
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, paddingHorizontal: 14 },
  tile: {
    width: "23%",
    aspectRatio: 1,
    backgroundColor: "rgba(18,18,18,0.85)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.07)",
    borderRadius: 14,
    alignItems: "center", justifyContent: "center", gap: 8,
    paddingHorizontal: 4,
  },
  tileLbl: { color: "#DDD", fontSize: 9.5, fontWeight: "700", textAlign: "center" },

  // FEED CARDS
  postCard: { width: 170, borderRadius: 14, backgroundColor: "rgba(15,15,15,0.7)", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", padding: 12 },
  postHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  postAvRing: { borderWidth: 2, borderRadius: 18, padding: 1 },
  postAv: { width: 28, height: 28, borderRadius: 14 },
  postAuthor: { color: "#EEE", fontSize: 12, fontWeight: "800" },
  postCity: { color: "#999", fontSize: 10 },
  postImg: { width: "100%", height: 110, borderRadius: 8, backgroundColor: "#1A1A1A" },
  postText: { color: "#CCC", fontSize: 12, lineHeight: 16, minHeight: 60 },

  adCard: { width: 140, borderRadius: 12, backgroundColor: "rgba(15,15,15,0.7)", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", padding: 8 },
  adImg: { width: "100%", height: 90, borderRadius: 8, backgroundColor: "#1A1A1A" },
  adTitle: { color: "#EEE", fontSize: 12, fontWeight: "700", marginTop: 8, minHeight: 32 },
  adPrice: { color: GOLD, fontSize: 13, fontWeight: "900", marginTop: 4 },
});

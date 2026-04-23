import { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Svg, { Circle, Path, Defs, LinearGradient, Stop, RadialGradient } from "react-native-svg";
import { api, Post, Ad, formatBRL } from "../../src/api";
import { useGate } from "../../src/gate";
import { TIERS } from "../../src/theme";
import { BrandLogo } from "../../src/brand";

const GOLD = "#F5C150";
const GOLD_DARK = "#C89A3A";
const GREEN = "#2ECC71";
const RED = "#FF5B5B";
const BG = "#000";
const CARD_BG = "#0C0C0C";
const TILE_BG = "#1A1A1A";
const INNER_CARD_BG = "#121212";

type AreaId = "ai" | "community" | "marketplace" | "planos" | "wallet" | "performance" | "chat" | "profissionais";
type Area = { id: AreaId; label: string; icon: { lib: "ion" | "mci"; name: string }; route: string };

const AREAS: Area[] = [
  { id: "ai",            label: "BLACK AI",      icon: { lib: "mci", name: "brain" },              route: "/ai" },
  { id: "community",     label: "Comunidade",    icon: { lib: "ion", name: "chatbubbles" },        route: "/(tabs)/community" },
  { id: "marketplace",   label: "Marketplace",   icon: { lib: "ion", name: "storefront" },         route: "/(tabs)/catalog" },
  { id: "planos",        label: "Planos",        icon: { lib: "mci", name: "diamond-stone" },      route: "/(tabs)/negocios" },
  { id: "wallet",        label: "Banco",         icon: { lib: "ion", name: "wallet" },             route: "/(tabs)/wallet" },
  { id: "performance",   label: "Performance",   icon: { lib: "mci", name: "chart-line-variant" }, route: "/(tabs)/performance" },
  { id: "chat",          label: "Suporte",       icon: { lib: "ion", name: "headset" },            route: "/chat" },
  { id: "profissionais", label: "Profissionais", icon: { lib: "mci", name: "stethoscope" },        route: "/ai" },
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

  // MOCK data while backend goals module is not ready (Phase 3)
  const hasGoals = false;
  const stats = {
    activeGoals: hasGoals ? 3 : 0,
    progress: hasGoals ? 68 : 0,
    weeklyDelta: hasGoals ? 8 : 0,
    rhythm: hasGoals ? -12 : 0,
    daysLeft: hasGoals ? 63 : 0,
  };

  const cardInnerW = W - 28 - 24; // padding estimates
  const forecastChartW = Math.round(cardInnerW * 0.52);

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        {/* HEADER: logo menor + Guigui + avatar */}
        <View style={s.header}>
          <BrandLogo size="sm" goldS />
          <TouchableOpacity
            onPress={() => router.push("/(tabs)/member")}
            style={s.headerRight}
            testID="home-profile"
            activeOpacity={0.85}
          >
            <Text style={s.headerName} numberOfLines={1}>{name}</Text>
            <View style={s.profileBtn}>
              <Ionicons name="person" size={15} color={GOLD} />
            </View>
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          testID="home-scroll"
        >
          {/* CENTRAL DE PERFORMANCE — compact version */}
          <View style={s.central}>
            {/* Title row */}
            <View style={s.centralHead}>
              <View style={s.centralHeadIcon}>
                <MaterialCommunityIcons name="chart-line-variant" size={12} color={GOLD} />
              </View>
              <Text style={s.centralHeadTxt}>CENTRAL DE PERFORMANCE</Text>
            </View>

            {/* ASSISTENTE BLACK sub-card */}
            <View style={s.aiCard}>
              <View style={s.aiLeft}>
                <View style={s.aiBrainOval}>
                  <Svg width={92} height={70} style={StyleSheet.absoluteFillObject}>
                    <Defs>
                      <RadialGradient id="brainGlow" cx="50%" cy="50%" r="50%">
                        <Stop offset="0%" stopColor={GOLD} stopOpacity="0.55" />
                        <Stop offset="50%" stopColor={GOLD} stopOpacity="0.18" />
                        <Stop offset="100%" stopColor={GOLD} stopOpacity="0" />
                      </RadialGradient>
                    </Defs>
                    <Circle cx="46" cy="35" rx="42" ry="30" fill="url(#brainGlow)" />
                  </Svg>
                  <MaterialCommunityIcons name="brain" size={36} color={GOLD} />
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
                  {hasGoals
                    ? "Você está 12% abaixo do ritmo ideal."
                    : "Defina sua primeira meta e a IA te guia."}
                </Text>
              </View>

              <Ionicons name="chevron-forward" size={16} color={GOLD} style={s.aiChev} />
            </View>

            {/* Buttons row */}
            <View style={s.aiBtnRow}>
              <TouchableOpacity
                style={s.btnGhost}
                onPress={() => router.push("/(tabs)/performance")}
                activeOpacity={0.85}
                testID="btn-analise"
              >
                <Text style={s.btnGhostTxt}>Ver análise completa</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.btnPrimary}
                onPress={() => router.push("/(tabs)/performance")}
                activeOpacity={0.9}
                testID="btn-fazer-hoje"
              >
                <MaterialCommunityIcons name="star-four-points" size={12} color="#000" />
                <Text style={s.btnPrimaryTxt}>O QUE FAZER HOJE?</Text>
              </TouchableOpacity>
            </View>

            {/* Divider */}
            <View style={s.dividerH} />

            {/* STATS — 4 columns */}
            <View style={s.statsRow}>
              <Stat
                iconCircle={<MaterialCommunityIcons name="target" size={18} color="#EEE" />}
                label="METAS"
                value={stats.activeGoals}
                caption={hasGoals ? "ver metas" : "criar"}
                captionColor={GOLD}
              />
              <Stat
                iconCircle={<RingProgress size={36} stroke={3} progress={stats.progress} label={`${stats.progress}%`} />}
                label="PROGRESSO"
                value={`${stats.progress}%`}
                caption={hasGoals ? `+${stats.weeklyDelta}%/sem` : "—"}
                captionColor={GREEN}
              />
              <Stat
                iconCircle={<Ionicons name="trending-up" size={18} color="#EEE" />}
                label="RITMO"
                value={hasGoals ? `${Math.abs(stats.rhythm)}%` : "—"}
                caption={hasGoals ? "abaixo" : "—"}
                captionColor={hasGoals ? RED : "#777"}
              />
              <Stat
                iconCircle={<MaterialCommunityIcons name="calendar-month" size={18} color="#EEE" />}
                label="DIAS"
                value={hasGoals ? stats.daysLeft : "—"}
                caption={hasGoals ? "restantes" : "—"}
                captionColor="#888"
              />
            </View>

            {/* Divider */}
            <View style={s.dividerH} />

            {/* Forecast row — compact summary only */}
            <TouchableOpacity
              style={s.forecastSummary}
              onPress={() => router.push("/(tabs)/performance")}
              activeOpacity={0.88}
            >
              <View style={s.forecastMini}>
                <Svg width={70} height={28}>
                  <Path
                    d="M 0 22 Q 12 16, 22 14 T 44 9 L 60 4"
                    stroke={GOLD} strokeWidth={1.6} fill="transparent" strokeLinecap="round"
                  />
                  <Circle cx="60" cy="4" r="3" fill={GOLD} />
                </Svg>
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={s.forecastKicker}>PREVISÃO DE RESULTADO</Text>
                <Text style={s.forecastSummaryTxt} numberOfLines={1}>
                  {hasGoals
                    ? `Meta em ${stats.daysLeft} dias · 16 Ago 2024`
                    : "Crie uma meta para ver sua projeção"}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={GOLD} />
            </TouchableOpacity>
          </View>

          {/* ACESSO RÁPIDO — no scroll needed */}
          <Text style={s.sectionLbl}>ACESSO RÁPIDO</Text>
          <View style={s.grid}>
            {AREAS.map((a) => {
              const tileW = (W - 24 - 18) / 4; // 24 padding, 18 total gaps (6×3)
              return (
                <TouchableOpacity
                  key={a.id}
                  onPress={() => router.push(a.route as any)}
                  style={[s.tile, { width: tileW }]}
                  activeOpacity={0.85}
                  testID={`area-${a.id}`}
                >
                  <AreaIcon icon={a.icon} size={24} color="#FFF" />
                  <Text style={s.tileLbl} numberOfLines={1}>{a.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Below the fold */}
          {posts.length > 0 && (
            <View style={{ marginTop: 36 }}>
              <View style={s.sectionHead}>
                <Text style={s.sectionLbl2}>ATIVIDADE DO CLUBE</Text>
                <TouchableOpacity onPress={() => router.push("/(tabs)/community")} hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}>
                  <Text style={s.seeAllGrey}>Ver tudo</Text>
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

          {ads.length > 0 && (
            <View style={{ marginTop: 40 }}>
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
    </View>
  );
}

/* ------------ SUB-COMPONENTS ------------ */

function Stat({
  iconCircle, label, value, caption, captionColor,
}: {
  iconCircle: React.ReactNode;
  label: string;
  value: string | number;
  caption?: string;
  captionColor?: string;
}) {
  return (
    <View style={s.stat}>
      <View style={s.statIcon}>{iconCircle}</View>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={s.statValue}>{value}</Text>
      {caption ? <Text style={[s.statCaption, { color: captionColor || "#888" }]}>{caption}</Text> : null}
    </View>
  );
}

function RingProgress({ size, stroke, progress, label }: { size: number; stroke: number; progress: number; label?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, progress));
  const off = c - (c * pct) / 100;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke="#2D2D2D" strokeWidth={stroke} fill="transparent" />
        <Circle
          cx={size / 2} cy={size / 2} r={r}
          stroke={GOLD} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${c} ${c}`} strokeDashoffset={off}
          fill="transparent"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {label ? <Text style={{ position: "absolute", color: "#FFF", fontSize: 10, fontWeight: "900" }}>{label}</Text> : null}
    </View>
  );
}

function ForecastChart({ width: w, height: h, hasData }: { width: number; height: number; hasData: boolean }) {
  // Smooth ascending curve: goes from bottom-left (70% of h) up to ~25% then dashed to top-right
  const pts = [
    [0, 0.78], [w * 0.12, 0.67], [w * 0.24, 0.58], [w * 0.36, 0.48],
    [w * 0.48, 0.42], [w * 0.6, 0.36], [w * 0.72, 0.30], [w * 0.82, 0.26],
  ];
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0]} ${p[1] * h}`).join(" ");
  const dashed = `M ${w * 0.82} ${0.26 * h} L ${w} ${0.12 * h}`;
  return (
    <View style={{ marginTop: 10, width: w, height: h }}>
      <Svg width={w} height={h}>
        <Defs>
          <LinearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={GOLD} stopOpacity="0.35" />
            <Stop offset="1" stopColor={GOLD} stopOpacity="1" />
          </LinearGradient>
        </Defs>
        {hasData ? (
          <>
            <Path d={path} stroke="url(#lineGrad)" strokeWidth={2} fill="transparent" strokeLinecap="round" />
            <Path d={dashed} stroke={GOLD} strokeWidth={1.4} fill="transparent" strokeDasharray="3,3" strokeLinecap="round" />
            <Circle cx={w} cy={0.12 * h} r={6} fill={GOLD} />
            <Circle cx={w} cy={0.12 * h} r={10} fill={GOLD} fillOpacity={0.25} />
          </>
        ) : (
          <Path d={`M 0 ${h * 0.72} L ${w} ${h * 0.28}`} stroke="#2A2A2A" strokeWidth={1.5} strokeDasharray="4,4" fill="transparent" />
        )}
      </Svg>
    </View>
  );
}

/* ------------ STYLES ------------ */

const s = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingTop: 6, paddingBottom: 14,
  },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerName: { color: "#EEE", fontSize: 13, fontWeight: "700", maxWidth: 120 },
  profileBtn: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "#0A0A0A",
    borderWidth: 2, borderColor: GOLD,
  },

  // Central — compacta
  central: {
    marginHorizontal: 12,
    backgroundColor: CARD_BG,
    borderWidth: 1.5, borderColor: "rgba(245,193,80,0.5)",
    borderRadius: 18,
    padding: 12,
  },
  centralHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10, paddingHorizontal: 2 },
  centralHeadIcon: {
    width: 24, height: 24, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(245,193,80,0.1)",
    borderWidth: 1, borderColor: "rgba(245,193,80,0.35)",
  },
  centralHeadTxt: { color: GOLD, fontSize: 11, fontWeight: "900", letterSpacing: 2 },

  // AI CARD compacto
  aiCard: {
    position: "relative",
    flexDirection: "row",
    backgroundColor: INNER_CARD_BG,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.05)",
    borderRadius: 12, padding: 10, gap: 4,
  },
  aiLeft: { width: 64, alignItems: "center", justifyContent: "center" },
  aiBrainOval: {
    width: 92, height: 70,
    alignItems: "center", justifyContent: "center",
    position: "relative",
  },
  aiRight: { flex: 1, paddingRight: 22 },
  aiLabelRow: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 4 },
  aiLabel: { color: GOLD, fontSize: 10.5, fontWeight: "900", letterSpacing: 1.3 },
  aiBadge: {
    width: 18, height: 18, borderRadius: 9,
    alignItems: "center", justifyContent: "center",
    backgroundColor: GOLD,
  },
  aiBadgeTxt: { color: "#000", fontSize: 8, fontWeight: "900", letterSpacing: 0.3 },
  aiMsg: { color: "#FFF", fontSize: 12.5, fontWeight: "700", lineHeight: 16 },
  aiTip: { color: "#AAA", fontSize: 11, marginTop: 3, fontWeight: "500" },
  aiChev: { position: "absolute", top: "50%", right: 8, marginTop: -8 },

  aiBtnRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  btnGhost: {
    flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "rgba(245,193,80,0.5)",
    backgroundColor: "transparent",
  },
  btnGhostTxt: { color: "#EEE", fontSize: 10.5, fontWeight: "700" },
  btnPrimary: {
    flex: 1.15, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    paddingVertical: 10, borderRadius: 10,
    backgroundColor: GOLD,
  },
  btnPrimaryTxt: { color: "#000", fontSize: 10.5, fontWeight: "900", letterSpacing: 0.8 },

  dividerH: { height: 1, backgroundColor: "rgba(255,255,255,0.06)", marginVertical: 12 },

  // STATS compactos
  statsRow: { flexDirection: "row", justifyContent: "space-between" },
  stat: { flex: 1, alignItems: "center", paddingHorizontal: 2 },
  statIcon: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "#1C1C1C",
    marginBottom: 7,
  },
  statLabel: { color: "#B0B0B0", fontSize: 8, fontWeight: "900", letterSpacing: 1, textAlign: "center" },
  statValue: { color: "#FFF", fontSize: 17, fontWeight: "900", marginTop: 3 },
  statCaption: { fontSize: 9, fontWeight: "700", marginTop: 3, textAlign: "center" },

  // Forecast mini (atalho compacto)
  forecastSummary: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: INNER_CARD_BG,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.05)",
    borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12,
  },
  forecastMini: { width: 70, height: 28, alignItems: "center", justifyContent: "center" },
  forecastKicker: { color: GOLD, fontSize: 9.5, fontWeight: "900", letterSpacing: 1.2 },
  forecastSummaryTxt: { color: "#DDD", fontSize: 11.5, marginTop: 2, fontWeight: "600" },

  // Sections — destaque maior
  sectionLbl: { color: "#B5B5B5", fontSize: 11, fontWeight: "900", letterSpacing: 2.5, marginTop: 18, marginBottom: 12, paddingHorizontal: 18 },
  sectionLbl2: { color: "#E8E8E8", fontSize: 12, fontWeight: "900", letterSpacing: 2.2, paddingHorizontal: 18 },
  sectionLblGold: { color: GOLD, fontSize: 12, fontWeight: "900", letterSpacing: 2.2, paddingHorizontal: 18 },
  sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12, paddingRight: 18 },
  seeAllGrey: { color: "#888", fontSize: 11, fontWeight: "700" },
  seeAllGold: { color: GOLD, fontSize: 11, fontWeight: "800" },

  // TILES 4x2 maiores — width calculated inline for precision
  grid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 12, gap: 6 },
  tile: {
    aspectRatio: 0.95,
    backgroundColor: TILE_BG,
    borderRadius: 14,
    alignItems: "center", justifyContent: "center",
    gap: 8,
    paddingHorizontal: 4,
  },
  tileLbl: { color: "#F5F5F5", fontSize: 10, fontWeight: "700", textAlign: "center" },

  // Below-fold
  postCard: { width: 170, borderRadius: 14, backgroundColor: "#0E0E0E", borderWidth: 1, borderColor: "#1A1A1A", padding: 12 },
  postHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  postAvRing: { borderWidth: 2, borderRadius: 18, padding: 1 },
  postAv: { width: 28, height: 28, borderRadius: 14 },
  postAuthor: { color: "#EEE", fontSize: 12, fontWeight: "800" },
  postCity: { color: "#999", fontSize: 10 },
  postImg: { width: "100%", height: 110, borderRadius: 8, backgroundColor: "#1A1A1A" },
  postText: { color: "#CCC", fontSize: 12, lineHeight: 16, minHeight: 60 },

  adCard: { width: 140, borderRadius: 12, backgroundColor: "#0E0E0E", borderWidth: 1, borderColor: "#1A1A1A", padding: 8 },
  adImg: { width: "100%", height: 90, borderRadius: 8, backgroundColor: "#1A1A1A" },
  adTitle: { color: "#EEE", fontSize: 12, fontWeight: "700", marginTop: 8, minHeight: 32 },
  adPrice: { color: GOLD, fontSize: 13, fontWeight: "900", marginTop: 4 },
});

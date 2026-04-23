import { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Svg, { Circle, Defs, Stop, RadialGradient } from "react-native-svg";
import { api, GoalDashboard } from "../../src/api";
import { useGate } from "../../src/gate";

const GOLD = "#F5C150";
const GOLD_DARK = "#C89A3A";
const SILVER = "#C0C0C0";
const SILVER_DIM = "rgba(200,200,200,0.45)";
const GREY = "#2A2A2A";
const GREY_DIM = "rgba(160,160,160,0.35)";
const GREEN = "#2ECC71";
const RED = "#FF5B5B";
const BG = "#000";
const CARD_BG = "#0C0C0C";
const TILE_BG = "#1A1A1A";
const INNER_CARD_BG = "#121212";

type AreaId = "ai" | "community" | "marketplace" | "planos" | "wallet" | "performance" | "chat" | "profissionais";
type Area = { id: AreaId; label: string; icon: { lib: "ion" | "mci"; name: string }; route: string };

const AREAS: Area[] = [
  { id: "cart",          label: "Carrinho",      icon: { lib: "ion", name: "cart" },               route: "/(tabs)/cart" },
  { id: "planos",        label: "Planos",        icon: { lib: "mci", name: "diamond-stone" },      route: "/(tabs)/negocios" },
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
  const [dashboard, setDashboard] = useState<GoalDashboard | null>(null);

  const load = useCallback(async () => {
    try {
      const dd = member ? await api.goalsDashboard(member.member_id).catch(() => null) : null;
      setDashboard(dd);
    } catch {}
  }, [member]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const W = Math.min(width, 430);
  const name = (member?.nickname || member?.name || "você").split(" ")[0];

  const hasGoals = !!dashboard?.has_goals;
  const stats = {
    activeGoals: dashboard?.active_count || 0,
    progress: Math.round(dashboard?.overall_progress || 0),
    weeklyDelta: dashboard?.weekly_delta || 0,
    rhythm: Math.round(dashboard?.avg_rhythm || 0),
    daysLeft: dashboard?.days_left ?? 0,
  };

  const forecastGoal = dashboard?.critical_goal;

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: 20, flexGrow: 1 }}
          showsVerticalScrollIndicator={false}
          testID="home-scroll"
        >
          {/* GREETING — centralizado, limpo */}
          <View style={s.greet}>
            <Text style={s.greetHello}>Bem-vindo,</Text>
            <Text style={s.greetSub}>Foco hoje, resultado amanhã.</Text>
          </View>

          {/* CENTRAL DE PERFORMANCE */}
          <View style={s.central}>
            {/* Title row with user name on right */}
            <View style={s.centralHead}>
              <View style={s.centralHeadIcon}>
                <MaterialCommunityIcons name="chart-line-variant" size={13} color={SILVER} />
              </View>
              <Text style={s.centralHeadTxt}>CENTRAL DE PERFORMANCE</Text>
              <Text style={s.centralUser}>{name}</Text>
            </View>

            {/* ASSISTENTE BLACK — agora clicável, abre análise detalhada + chat */}
            <TouchableOpacity
              style={s.aiCard}
              onPress={() => router.push("/black-ai" as any)}
              activeOpacity={0.85}
              testID="assistente-black-ai"
            >
              <View style={s.aiLeft}>
                <View style={s.aiBrainOval}>
                  <Svg width={96} height={72} style={StyleSheet.absoluteFillObject}>
                    <Defs>
                      <RadialGradient id="brainGlow" cx="50%" cy="50%" r="50%">
                        <Stop offset="0%" stopColor={SILVER} stopOpacity="0.55" />
                        <Stop offset="50%" stopColor={SILVER} stopOpacity="0.18" />
                        <Stop offset="100%" stopColor={SILVER} stopOpacity="0" />
                      </RadialGradient>
                    </Defs>
                    <Circle cx="48" cy="36" rx="44" ry="32" fill="url(#brainGlow)" />
                  </Svg>
                  <MaterialCommunityIcons name="brain" size={38} color={SILVER} />
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
                    ? `${stats.activeGoals} ${stats.activeGoals === 1 ? "meta ativa" : "metas ativas"} · ${stats.progress}% de progresso.`
                    : "Defina sua primeira meta e a IA te guia."}
                </Text>
                <Text style={s.aiTip}>Toque para ver análise detalhada</Text>
              </View>

              <Ionicons name="chevron-forward" size={18} color={SILVER} style={s.aiChev} />
            </TouchableOpacity>

            {/* Buttons row — nome da meta ativa (cor da meta) + MENSAGEM DO DIA (cinza) */}
            <View style={s.aiBtnRow}>
              <TouchableOpacity
                style={[
                  s.btnGhost,
                  hasGoals && forecastGoal?.color
                    ? { borderColor: `${forecastGoal.color}90`, backgroundColor: `${forecastGoal.color}18` }
                    : null,
                ]}
                onPress={() => router.push("/(tabs)/performance")}
                activeOpacity={0.85}
                testID="btn-meta-nome"
              >
                <Text
                  numberOfLines={1}
                  style={[
                    s.btnGhostTxt,
                    hasGoals && forecastGoal?.color ? { color: forecastGoal.color } : null,
                  ]}
                >
                  {hasGoals ? (forecastGoal?.title || "Sua meta") : "Criar meta"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.btnPrimary}
                onPress={() => {
                  const gid = forecastGoal?.goal_id;
                  router.push(gid ? `/daily-message?goalId=${gid}` as any : "/daily-message" as any);
                }}
                activeOpacity={0.9}
                testID="btn-mensagem-dia"
              >
                <MaterialCommunityIcons name="book-open-variant" size={13} color="#FFF" />
                <Text style={s.btnPrimaryTxt}>MENSAGEM DO DIA</Text>
              </TouchableOpacity>
            </View>

            {/* STATS — 4 columns with vertical dividers */}
            <View style={s.statsRow}>
              <Stat
                iconCircle={<MaterialCommunityIcons name="target" size={20} color="#EEE" />}
                label="METAS ATIVAS"
                value={stats.activeGoals}
                caption={hasGoals ? "ver metas" : "criar"}
                captionColor={GOLD}
              />
              <View style={s.statDividerV} />
              <Stat
                iconCircle={<RingProgress size={42} stroke={3.5} progress={stats.progress} label={`${stats.progress}%`} />}
                label="PROGRESSO GERAL"
                value={`${stats.progress}%`}
                caption={hasGoals ? `+${stats.weeklyDelta}% essa semana` : "—"}
                captionColor={GREEN}
              />
              <View style={s.statDividerV} />
              <Stat
                iconCircle={<Ionicons name="trending-up" size={20} color="#EEE" />}
                label="RITMO ATUAL"
                value={hasGoals ? `${Math.abs(stats.rhythm)}%` : "—"}
                caption={hasGoals ? "abaixo do ideal" : "sem dados"}
                captionColor={hasGoals ? RED : "#777"}
              />
              <View style={s.statDividerV} />
              <Stat
                iconCircle={<MaterialCommunityIcons name="calendar-month" size={20} color="#EEE" />}
                label="DIAS RESTANTES"
                value={hasGoals ? stats.daysLeft : "—"}
                caption={hasGoals ? "para sua meta" : "—"}
                captionColor="#888"
              />
            </View>
          </View>

          {/* ACESSO RÁPIDO — agora logo após a Central */}
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
                <AreaIcon icon={a.icon} size={22} color="#FFF" />
                <Text style={s.tileLbl} numberOfLines={1}>{a.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>
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



/* ------------ STYLES ------------ */

const s = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingTop: 6, paddingBottom: 6,
  },
  profileBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "#0A0A0A",
    borderWidth: 1.5, borderColor: GOLD,
    overflow: "hidden",
  },
  profileImg: { width: 33, height: 33, borderRadius: 16.5 },

  // Greeting centralizado
  greet: { alignItems: "center", marginTop: 16, marginBottom: 18 },
  greetHello: { color: "#FFF", fontSize: 22, fontWeight: "800" },
  greetSub: { color: "#B8B8B8", fontSize: 13, marginTop: 6, fontWeight: "500" },

  // Central
  central: {
    marginHorizontal: 12,
    backgroundColor: CARD_BG,
    borderRadius: 18,
    padding: 12,
  },
  centralHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12, paddingHorizontal: 2 },
  centralHeadIcon: {
    width: 26, height: 26, borderRadius: 13,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(200,200,200,0.08)",
  },
  centralHeadTxt: { color: SILVER, fontSize: 11, fontWeight: "900", letterSpacing: 2, flex: 1 },
  centralUser: { color: "#9E9E9E", fontSize: 12, fontWeight: "600" },

  // AI CARD
  aiCard: {
    position: "relative",
    flexDirection: "row",
    backgroundColor: "#000",
    borderRadius: 12, padding: 12, gap: 6,
  },
  aiLeft: { width: 72, alignItems: "center", justifyContent: "center" },
  aiBrainOval: {
    width: 96, height: 72,
    alignItems: "center", justifyContent: "center",
    position: "relative",
  },
  aiRight: { flex: 1, paddingRight: 22 },
  aiLabelRow: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 5 },
  aiLabel: { color: SILVER, fontSize: 10.5, fontWeight: "900", letterSpacing: 1.3 },
  aiBadge: {
    width: 20, height: 20, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
    backgroundColor: SILVER,
  },
  aiBadgeTxt: { color: "#000", fontSize: 8.5, fontWeight: "900", letterSpacing: 0.3 },
  aiMsg: { color: "#FFF", fontSize: 13, fontWeight: "700", lineHeight: 17 },
  aiTip: { color: "#BBB", fontSize: 11.5, marginTop: 5, fontWeight: "500" },
  aiChev: { position: "absolute", top: "50%", right: 8, marginTop: -9 },

  aiBtnRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  btnGhost: {
    flex: 1, paddingVertical: 11, paddingHorizontal: 8,
    borderRadius: 10, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "transparent",
  },
  btnGhostTxt: { color: "#EEE", fontSize: 11, fontWeight: "800", letterSpacing: 0.4 },
  btnPrimary: {
    flex: 1.1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    paddingVertical: 11, borderRadius: 10,
    backgroundColor: GREY, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)",
  },
  btnPrimaryTxt: { color: "#FFF", fontSize: 11, fontWeight: "900", letterSpacing: 0.8 },

  // STATS — 4 columns with vertical dividers
  statsRow: { flexDirection: "row", alignItems: "stretch", marginTop: 16, marginBottom: 16 },
  stat: { flex: 1, alignItems: "center", paddingHorizontal: 2 },
  statIcon: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "#1C1C1C",
    marginBottom: 8,
  },
  statLabel: { color: "#B0B0B0", fontSize: 8.5, fontWeight: "900", letterSpacing: 1, textAlign: "center", minHeight: 22 },
  statValue: { color: "#FFF", fontSize: 20, fontWeight: "900", marginTop: 3 },
  statCaption: { fontSize: 9.5, fontWeight: "700", marginTop: 4, textAlign: "center" },
  statDividerV: { width: 1, backgroundColor: "rgba(255,255,255,0.06)", marginVertical: 6 },

  // FORECAST — sub-card completo
  forecastCard: {
    backgroundColor: INNER_CARD_BG,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.05)",
    borderRadius: 12, padding: 12,
  },
  forecastInner: { flexDirection: "row", gap: 10 },
  forecastLeft: { flex: 1.1, justifyContent: "center" },
  forecastRight: { flex: 1, alignItems: "flex-end", justifyContent: "center" },
  forecastHead: { flexDirection: "row", alignItems: "center" },
  forecastKicker: { color: GOLD, fontSize: 10.5, fontWeight: "900", letterSpacing: 1.2 },
  forecastDesc: { color: "#C8C8C8", fontSize: 11.5, marginTop: 6, lineHeight: 15 },
  forecastDaysBig: { color: GOLD, fontSize: 26, fontWeight: "900", marginTop: 5 },
  forecastDate: { color: "#888", fontSize: 10.5, marginTop: 1, fontWeight: "500" },
  forecastLabels: { flexDirection: "row", justifyContent: "space-between", width: "100%", marginTop: 2 },
  forecastLblTxt: { color: "#888", fontSize: 9.5, fontWeight: "700" },
  forecastBtn: {
    marginTop: 12, paddingVertical: 10, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "rgba(245,193,80,0.55)",
  },
  forecastBtnTxt: { color: GOLD, fontSize: 11, fontWeight: "800" },

  // SECTIONS
  sectionLbl: { color: "#B5B5B5", fontSize: 11, fontWeight: "900", letterSpacing: 2.5, marginTop: 20, marginBottom: 12, paddingHorizontal: 18 },
  sectionLbl2: { color: "#E8E8E8", fontSize: 12, fontWeight: "900", letterSpacing: 2.2, paddingHorizontal: 18 },
  sectionLblGold: { color: GOLD, fontSize: 12, fontWeight: "900", letterSpacing: 2.2, paddingHorizontal: 18 },
  sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12, paddingRight: 18 },
  seeAllGrey: { color: "#888", fontSize: 11, fontWeight: "700" },
  seeAllGold: { color: GOLD, fontSize: 11, fontWeight: "800" },

  // TILES 4 col — flex robusto, 4 por linha
  grid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 12, gap: 6, justifyContent: "space-between" },
  tile: {
    flexBasis: "23.5%",
    aspectRatio: 0.95,
    backgroundColor: TILE_BG,
    borderRadius: 14,
    alignItems: "center", justifyContent: "center",
    gap: 6,
    paddingHorizontal: 4, paddingVertical: 8,
  },
  tileLbl: { color: "#F5F5F5", fontSize: 10, fontWeight: "700", textAlign: "center", letterSpacing: 0.2 },

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

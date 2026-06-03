import { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, useWindowDimensions, Platform, Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "../../src/icons";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle, Defs, Stop, RadialGradient, LinearGradient as SvgLinearGradient } from "react-native-svg";
import { api, GoalDashboard, BlxWallet, Ad } from "../../src/api";
import { useGate } from "../../src/gate";
import { useTierAccent } from "../../src/use-tier-accent";
import { formatBLX } from "../../src/blx";

const DIAMOND_LIGHT = "#A8E4EF";
const DIAMOND = "#7FD7E5";
const DIAMOND_DARK = "#4A8F99";

const GOLD = "#F5C150";
const GOLD_DARK = "#C89A3A";
const SILVER = "#C0C0C0";
const SILVER_DIM = "rgba(200,200,200,0.45)";
const GREY = "#2A2A2A";
const GREY_DIM = "rgba(160,160,160,0.35)";
const GREEN = "#2ECC71";
const RED = "#FF5B5B";
const BG = "#050505";
const CARD_BG = "#0C0C0C";
const TILE_BG = "#0C0C0C";
const INNER_CARD_BG = "#101010";

type AreaId = "ai" | "community" | "marketplace" | "planos" | "wallet" | "performance" | "chat" | "profissionais";
type Area = { id: AreaId; label: string; icon: { lib: "ion" | "mci"; name: string }; route: string };

// Grid de 3 atalhos em quadrados cinza (Planos, Suporte, Profissionais).
// O botão "Carrinho" foi REMOVIDO da home a pedido do usuário.
const AREAS: Area[] = [
  { id: "planos",        label: "Planos",        icon: { lib: "mci", name: "diamond-stone" },      route: "/(tabs)/catalog" },
  { id: "chat",          label: "Suporte",       icon: { lib: "ion", name: "headset" },            route: "/chat" },
  { id: "profissionais", label: "Profissionais", icon: { lib: "mci", name: "stethoscope" },        route: "/ai" },
];

function AreaIcon({ icon, size, color }: { icon: Area["icon"]; size: number; color: string }) {
  if (icon.lib === "mci") return <MaterialCommunityIcons name={icon.name as any} size={size} color={color} />;
  return <Ionicons name={icon.name as any} size={size} color={color} />;
}

/* Ícone prateado metálico "3D" — usado no Acesso Rápido para se diferenciar
 * dos ícones das barras superior (dourado) e inferior (branco flat). */
function SilverMetalChip({ icon, size = 58 }: { icon: Area["icon"]; size?: number }) {
  const half = size / 2;
  const inner = size - 10; // anel metálico externo de 5px
  const innerHalf = inner / 2;
  return (
    <View style={[silverSt.wrap, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        <Defs>
          {/* Anel metálico externo: gradiente de cromo */}
          <SvgLinearGradient id="chromeRing" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%"   stopColor="#FFFFFF" stopOpacity="1" />
            <Stop offset="25%"  stopColor="#DDDDDD" stopOpacity="1" />
            <Stop offset="55%"  stopColor="#8E8E8E" stopOpacity="1" />
            <Stop offset="100%" stopColor="#3A3A3A" stopOpacity="1" />
          </SvgLinearGradient>
          {/* Miolo escuro (inset) com leve vinheta */}
          <RadialGradient id="insetDark" cx="50%" cy="40%" r="60%">
            <Stop offset="0%"   stopColor="#2A2A2A" stopOpacity="1" />
            <Stop offset="60%"  stopColor="#111111" stopOpacity="1" />
            <Stop offset="100%" stopColor="#050505" stopOpacity="1" />
          </RadialGradient>
          {/* Reflexo sutil superior */}
          <SvgLinearGradient id="glossy" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%"  stopColor="#FFFFFF" stopOpacity="0.22" />
            <Stop offset="60%" stopColor="#FFFFFF" stopOpacity="0" />
          </SvgLinearGradient>
        </Defs>
        {/* Anel externo metálico */}
        <Circle cx={half} cy={half} r={half - 0.5} fill="url(#chromeRing)" />
        {/* Miolo escuro */}
        <Circle cx={half} cy={half} r={innerHalf} fill="url(#insetDark)" />
        {/* Reflexo "glossy" no topo */}
        <Circle cx={half} cy={half} r={innerHalf} fill="url(#glossy)" />
      </Svg>
      {/* Ícone centralizado em cima do SVG */}
      <View style={silverSt.iconCenter} pointerEvents="none">
        <AreaIcon icon={icon} size={Math.round(size * 0.4)} color="#E8E8E8" />
      </View>
    </View>
  );
}

const silverSt = StyleSheet.create({
  wrap: {
    alignItems: "center", justifyContent: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.55,
        shadowRadius: 4,
      },
      android: { elevation: 5 },
      default: {},
    }),
  },
  iconCenter: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    alignItems: "center", justifyContent: "center",
  },
});

export default function Home() {
  const router = useRouter();
  const { member } = useGate();
  const { width } = useWindowDimensions();
  const [dashboard, setDashboard] = useState<GoalDashboard | null>(null);
  const [diamondAds, setDiamondAds] = useState<Ad[]>([]);

  const isDiamond = (member?.tier || "").toLowerCase() === "diamond";

  const load = useCallback(async () => {
    try {
      const [dd, w, ads] = await Promise.all([
        member ? api.goalsDashboard(member.member_id).catch(() => null) : Promise.resolve(null),
        member ? api.blxWallet(member.member_id).catch(() => null) : Promise.resolve(null),
        // Carrega anúncios Diamond apenas se o membro for diamond (otimização)
        isDiamond ? api.listAds({ tier: "diamond", limit: 6 }).catch(() => []) : Promise.resolve([]),
      ]);
      setDashboard(dd);
      setWallet(w);
      setDiamondAds((ads as any[]) || []);
    } catch {}
  }, [member, isDiamond]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const W = Math.min(width, 430);
  const name = (member?.nickname || member?.name || "você").split(" ")[0];
  const accent = useTierAccent();
  const [wallet, setWallet] = useState<BlxWallet | null>(null);

  const hasGoals = !!dashboard?.has_goals;
  const stats = {
    activeGoals: dashboard?.active_count || 0,
    completedGoals: (dashboard as any)?.completed_count || 0,
    progress: Math.round(dashboard?.overall_progress || 0),
    weeklyDelta: dashboard?.weekly_delta || 0,
    rhythm: Math.round(dashboard?.avg_rhythm || 0),
    daysLeft: dashboard?.days_left ?? 0,
  };

  const forecastGoal = dashboard?.critical_goal;

  // Bloco da Central de Performance — extraído em função para ser renderizado
  // em posição diferente conforme o tier (topo para não-Diamond, base para Diamond).
  const renderCentralPerformance = () => (
    <View style={s.central}>
      {/* Title row with user name on right */}
      <View style={s.centralHead}>
        <View style={s.centralHeadIcon}>
          <MaterialCommunityIcons name="chart-line-variant" size={13} color={SILVER} />
        </View>
        <Text style={s.centralHeadTxt}>CENTRAL DE PERFORMANCE</Text>
        <Text style={s.centralUser}>{name}</Text>
      </View>

      {/* Buttons row — nome da meta ativa (cor da meta) + BLACK AI (preto) */}
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
            router.push(gid ? `/black-ai?goalId=${gid}` as any : "/black-ai" as any);
          }}
          activeOpacity={0.9}
          testID="btn-black-ai"
        >
          <MaterialCommunityIcons name="brain" size={13} color="#FFF" />
          <Text style={s.btnPrimaryTxt}>BLACK AI</Text>
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
        {/* RITMO ATUAL — mostra kg perdidos/ganhos com frase dinâmica verde/vermelho */}
        {(() => {
          const g: any = forecastGoal;
          const hasData = !!g && typeof g.current_value === "number" && typeof g.initial_value === "number";
          const init = hasData ? g.initial_value : 0;
          const cur = hasData ? g.current_value : 0;
          const tgt = hasData ? g.target_value : 0;
          const losing = hasData ? tgt < init : false;
          const achievedRaw = losing ? init - cur : cur - init;
          const achieved = Math.max(0, achievedRaw);
          const regressing = achievedRaw < 0;
          const unit = g?.unit || (g?.type === "financial" ? "R$" : g?.type === "productivity" ? "h" : "kg");
          const fmt = (n: number) => {
            const abs = Math.abs(n);
            if (unit === "R$") return `R$ ${abs.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
            const isInt = Math.abs(abs - Math.round(abs)) < 0.01;
            return `${isInt ? Math.round(abs) : abs.toFixed(1).replace(".", ",")} ${unit}`;
          };
          const verb = g?.type === "financial" ? "acumulou"
            : g?.type === "productivity" ? "entregou"
            : losing ? "perdeu" : "ganhou";
          const verbBad = g?.type === "financial" ? "recuou" : losing ? "voltou a ganhar" : "recuou";
          const value = hasData ? fmt(regressing ? Math.abs(achievedRaw) : achieved) : "—";
          const caption = !hasData ? "sem dados"
            : regressing ? `Cuidado — ${verbBad}`
            : achieved > 0 ? `Boa! Você já ${verb}`
            : "comece a registrar";
          const captionColor = !hasData ? "#777"
            : regressing ? RED
            : achieved > 0 ? GREEN
            : "#888";
          return (
            <Stat
              iconCircle={<Ionicons name={regressing ? "trending-down" : "trending-up"} size={20} color="#EEE" />}
              label="RITMO ATUAL"
              value={value}
              caption={caption}
              captionColor={captionColor}
            />
          );
        })()}
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
  );

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingVertical: 6, paddingBottom: 16 }}
        showsVerticalScrollIndicator={false}
        testID="home-scroll"
      >
          {/* GREETING compacto + nome do membro */}
          <View style={s.greet}>
            <Text style={s.greetHello}>Olá, {name}</Text>
            <Text style={s.greetSub}>Foco hoje, resultado amanhã.</Text>
          </View>

          {/* ============================================================
              TIER BANNER do membro — substitui o card BLEX e o card
              "MARKETPLACE DIAMANTE". Mostra a arte oficial do tier
              (Diamante/Gold/Silver) com banner full-width clicável que
              leva direto ao marketplace correspondente.
              Acesso à carteira fica no botão "Carteira" do TOPO.
              ============================================================ */}
          {(() => {
            // Define imagem + cor de destaque do plano do usuário
            const tierKey = (member?.tier || "silver").toLowerCase();
            // Banner único do Marketplace de Elite (BLACKSCLUB) — usado para todos os tiers.
            // Imagem oficial "Acesso as melhores marcas" com produtos premium em destaque.
            const MKT_BANNER = "https://customer-assets.emergentagent.com/job_member-shop-2/artifacts/apwwtp98_banner%20marketplace.png";
            const TIER_BANNER: Record<string, { image: string; title: string; sub: string; accent: string; route: string }> = {
              diamond: {
                image: MKT_BANNER,
                title: "PLANO DIAMANTE",
                sub: "Acesso total · Marketplace completo",
                accent: "#EAF1F6",
                route: "/catalog/diamond",
              },
              gold: {
                image: MKT_BANNER,
                title: "PLANO GOLD",
                sub: "Acesso Premium · Ofertas exclusivas",
                accent: "#F4D47A",
                route: "/catalog/gold",
              },
              silver: {
                image: MKT_BANNER,
                title: "PLANO SILVER",
                sub: "Acesso Inicial · Linha essencial",
                accent: "#E8E8E8",
                route: "/catalog/silver",
              },
            };
            const banner = TIER_BANNER[tierKey] || TIER_BANNER.silver;
            return (
              <TouchableOpacity
                style={s.tierBanner}
                onPress={() => router.push({ pathname: "/catalog/niches", params: { tier: tierKey } } as any)}
                activeOpacity={0.9}
                testID="home-tier-banner"
              >
                <Image source={{ uri: banner.image }} style={s.tierBannerImg} resizeMode="cover" />
                <LinearGradient
                  colors={["transparent", "rgba(0,0,0,0.45)", "rgba(0,0,0,0.92)"] as const}
                  start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
                  style={s.tierBannerOverlay}
                />
                <View style={s.tierBannerFooter}>
                  <View style={[s.tierBannerCta, { backgroundColor: banner.accent }]}>
                    <Text style={s.tierBannerCtaTxt}>ENTRAR</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })()}

          {/* ============================================================
              REMOVIDOS A PEDIDO DO USUÁRIO:
              - Card BLEX TOKEN (saldo grande) → acesso via /wallet no TOPO
              - Card MARKETPLACE DIAMANTE → substituído pelo tier banner acima
              - Seção CENTRAL DE PERFORMANCE → removida
              ============================================================ */}

          {/* ACESSO RÁPIDO — grid 2x4 em quadrados cinza (sem título) */}
          <View style={s.grid}>
            {AREAS.map((a) => (
              <TouchableOpacity
                key={a.id}
                onPress={() => router.push(a.route as any)}
                style={s.tile}
                activeOpacity={0.85}
                testID={`area-${a.id}`}
              >
                <AreaIcon icon={a.icon} size={26} color="#F5F5F5" />
                <Text style={s.tileLbl} numberOfLines={1}>{a.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* CENTRAL DE PERFORMANCE — REMOVIDA da Home a pedido do usuário.
              Para acessar metas/progresso/dias, use o botão "Metas" do rodapé. */}
        </ScrollView>
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

  // Greeting compacto (reduzido para não ocupar todo o topo)
  greet: { alignItems: "flex-start", paddingHorizontal: 16, marginTop: 6, marginBottom: 14 },

  // ====================== TIER BANNER (Home) ======================
  // Banner do plano do usuário (Diamante/Gold/Silver) — full-width clicável
  // que substitui o card BLEX e o card MARKETPLACE DIAMANTE antigos.
  tierBanner: {
    marginHorizontal: 16,
    marginBottom: 18,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#0A0A0A",
    aspectRatio: 16 / 9,
    position: "relative",
  },
  tierBannerImg: { ...StyleSheet.absoluteFillObject as any, width: "100%", height: "100%" },
  tierBannerOverlay: { ...StyleSheet.absoluteFillObject as any },
  tierBannerFooter: {
    position: "absolute",
    left: 0, right: 0, bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingBottom: 12,
    paddingTop: 10,
  },
  tierBannerTitle: { fontSize: 16, fontWeight: "900", letterSpacing: 1.2 },
  tierBannerSub: { color: "#D7D7D7", fontSize: 11, fontWeight: "600", marginTop: 2 },
  tierBannerCta: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 7,
    borderRadius: 8,
  },
  tierBannerCtaTxt: { color: "#050505", fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  greetHello: { color: "#FFF", fontSize: 20, fontWeight: "900", letterSpacing: -0.3, lineHeight: 24 },
  greetSub: { color: "#8A8A8A", fontSize: 12, marginTop: 2, fontWeight: "500", letterSpacing: 0 },

  // Mini card BLX premium no topo (glance rápido)
  blxCard: {
    marginHorizontal: 12,
    marginBottom: 14,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#1F1F1F",
  },
  blxInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  blxIconWrap: {},
  blxIcon: {
    width: 34, height: 34, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
  },
  blxLbl: { fontSize: 9, fontWeight: "900", letterSpacing: 2 },
  blxVal: { color: "#FFF", fontSize: 20, fontWeight: "900", letterSpacing: -0.5 },
  blxUnit: { fontSize: 11, fontWeight: "900", letterSpacing: 1.2 },
  blxReserved: { color: "#B79045", fontSize: 10, fontWeight: "700", marginTop: 3 },

  // Marketplace Diamond — card especial no topo da home pra membros Diamond
  diamondMkt: {
    marginHorizontal: 12,
    marginTop: 4,
    marginBottom: 14,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#7FD7E533",
  },
  diamondMktInner: { padding: 16 },
  diamondMktHead: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
  diamondMktIcon: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1,
  },
  diamondMktTitle: { flex: 1, fontSize: 12, fontWeight: "900", letterSpacing: 1.5 },
  diamondMktSub: { color: "#9AA0A6", fontSize: 11, lineHeight: 15 },
  adChip: {
    width: 130,
    backgroundColor: "#0F1216",
    borderWidth: 1, borderColor: "#1A1F25",
    borderRadius: 10,
    padding: 7,
  },
  adChipImg: { width: "100%", height: 80, borderRadius: 7, marginBottom: 6 },
  adChipTitle: { color: "#EEE", fontSize: 11, fontWeight: "800", marginBottom: 3 },
  adChipPrice: { fontSize: 11, fontWeight: "900" },
  adEmpty: { alignItems: "center", paddingVertical: 16, gap: 6 },
  adEmptyTxt: { color: "#666", fontSize: 11 },

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

  // AI CARD — compacto, arredondado, discreto
  aiCard: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0A0A0A",
    borderRadius: 100, padding: 10, gap: 10,
  },
  aiLeft: { width: 44, alignItems: "center", justifyContent: "center" },
  aiBrainOval: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: "center", justifyContent: "center",
    position: "relative",
    backgroundColor: "rgba(200,200,200,0.06)",
  },
  aiRight: { flex: 1, paddingRight: 22 },
  aiLabelRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  aiLabel: { color: SILVER, fontSize: 9.5, fontWeight: "900", letterSpacing: 1.2 },
  aiBadge: {
    width: 16, height: 16, borderRadius: 8,
    alignItems: "center", justifyContent: "center",
    backgroundColor: SILVER,
  },
  aiBadgeTxt: { color: "#000", fontSize: 7.5, fontWeight: "900", letterSpacing: 0.3 },
  aiMsg: { color: "#EEE", fontSize: 11.5, fontWeight: "600", lineHeight: 15 },
  aiTip: { color: "#777", fontSize: 10, marginTop: 2, fontWeight: "500" },
  aiChev: { position: "absolute", top: "50%", right: 14, marginTop: -9 },

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

  // TILES 4 col — quadrados cinza (estilo referência do usuário)
  grid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 12, gap: 8, justifyContent: "space-between", marginTop: 8 },
  tile: {
    flexBasis: "23%",
    aspectRatio: 0.95,
    backgroundColor: "#0E0E0E",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    alignItems: "center", justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  tileLbl: { color: "#E8E8E8", fontSize: 10, fontWeight: "800", textAlign: "center", letterSpacing: 0.8 },

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

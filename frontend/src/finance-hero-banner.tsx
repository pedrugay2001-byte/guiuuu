/**
 * FinanceHeroBanner — Painel financeiro premium da home.
 *
 * Layout revisado (v4 — minimalismo maior):
 *
 *   ┌────────────────────────────────────────────────────────────┐
 *   │  SALDO                              COTAÇÃO DO DIA         │
 *   │  50.915 PYX (gradient metálico)  ┃  ┌ 1 USx = 5,00 PYX ┐   │
 *   │  ┌ USx 10.183,04 ┐                ┃  └─────────────────┘   │
 *   │  └───────────────┘                ┃                        │
 *   └────────────────────────────────────────────────────────────┘
 *
 * Tipografia:
 *  - Valor principal (50.915): degradê metálico prata + 3D + glow discreto
 *  - "PYX" em maiúsculas menor, mesma família metálica
 *  - Título "SALDO" em cinza claro discreto para hierarquia
 *  - Pill USx: preto fosco + borda verde fina + shadow suave
 *  - Pill Cotação: preto fosco + borda dourada fina + shadow suave
 */

import React from "react";
import { View, Text, StyleSheet, Image, Platform } from "react-native";
import Svg, {
  Defs, LinearGradient as SvgGradient, Stop, Rect, Path,
  Circle, G, Ellipse,
} from "react-native-svg";
import { formatPYXParts, formatUSxParts } from "./pyx";
import { usePYXRate } from "./pyx-rate";
import { useBalanceVisibility } from "./use-balance-visibility";

const GOLD = "#F5C150";
const GOLD_LIGHT = "#FFE082";
const GOLD_DEEP = "#B8860B";
const GREEN = "#4EE07F";
const GREEN_DEEP = "#0F5A3A";

// Paletas para o efeito metálico (top → mid → bottom)
const METALLIC = {
  silver: { top: "#FAFCFD", mid: "#C5D1DA", deep: "#6B7A85", glow: "rgba(200,215,225,0.35)", solid: "#E8EEF3" },
  gold:   { top: GOLD_LIGHT, mid: GOLD, deep: GOLD_DEEP, glow: "rgba(212,175,55,0.35)", solid: GOLD_LIGHT },
  green:  { top: "#B8F3D0", mid: GREEN, deep: "#1E7A3F", glow: "rgba(78,224,127,0.35)", solid: "#8BE8B0" },
} as const;

type MetalScheme = keyof typeof METALLIC;

/**
 * <MetallicText/> — renderiza texto com efeito de degradê metálico (prata/ouro/verde).
 * Web: CSS `background-clip: text` com gradiente vertical + drop-shadow (3D + glow).
 * Native: fallback para cor sólida clara + textShadow (glow + 3D).
 */
function MetallicText({
  children, style, scheme = "gold",
}: { children: React.ReactNode; style?: any; scheme?: MetalScheme }) {
  const p = METALLIC[scheme];
  if (Platform.OS === "web") {
    return (
      <Text
        style={[
          style,
          {
            // @ts-ignore — RN Web aceita propriedades CSS raw
            backgroundImage: `linear-gradient(180deg, ${p.top} 0%, ${p.mid} 45%, ${p.deep} 100%)`,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            WebkitTextFillColor: "transparent",
            color: "transparent",
            filter: `drop-shadow(0 1px 0 rgba(0,0,0,0.4)) drop-shadow(0 0 8px ${p.glow})`,
          } as any,
        ]}
        allowFontScaling={false}
      >
        {children}
      </Text>
    );
  }
  // Fallback nativo — cor sólida + glow via textShadow
  return (
    <Text
      style={[
        style,
        {
          color: p.solid,
          textShadowColor: p.glow,
          textShadowOffset: { width: 0, height: 1 },
          textShadowRadius: 6,
        },
      ]}
      allowFontScaling={false}
    >
      {children}
    </Text>
  );
}

export function FinanceHeroBanner({
  memberId,
  balanceCentavos,
  height,
}: {
  memberId?: string;
  balanceCentavos: number | null | undefined;
  height: number;
}) {
  const { rate, rateCentavos } = usePYXRate();
  const { hidden } = useBalanceVisibility(memberId);

  const pyxP = formatPYXParts(balanceCentavos || 0);
  const usxP = formatUSxParts(balanceCentavos || 0, rateCentavos);
  const rateDisplay = rate?.pyx_per_usd_display || "5,00";

  const customBg =
    (rate?.finance_hero_image_base64 && rate.finance_hero_image_base64.trim()) ||
    (rate?.finance_hero_image_url && rate.finance_hero_image_url.trim()) ||
    "";

  return (
    <View style={[s.card, { height }]} testID="home-finance-hero">
      {/* BACKGROUND — imagem custom OU SVG default */}
      {customBg ? (
        <Image source={{ uri: customBg }} style={s.bgImage} resizeMode="cover" />
      ) : (
        <DefaultFinanceBackground />
      )}

      {/* Overlay escuro sutil para legibilidade */}
      <View style={s.overlay} pointerEvents="none" />

      {/* CONTEÚDO */}
      <View style={s.content}>
        {/* Coluna esquerda — SALDO (sem sigla "PYX") */}
        <View style={s.left}>
          <Text style={s.title}>SALDO</Text>
          <View style={s.balanceRow}>
            {hidden ? (
              <MetallicText scheme="silver" style={s.balanceValue}>••••••</MetallicText>
            ) : (
              <>
                <MetallicText scheme="silver" style={s.balanceValue}>{pyxP.int}</MetallicText>
                <MetallicText scheme="silver" style={s.balanceCents}>,{pyxP.dec}</MetallicText>
              </>
            )}
          </View>
          <View style={s.usdPill}>
            {hidden ? (
              <View style={s.usdInline}>
                <Text style={s.usxLabel}>USx </Text>
                <MetallicText scheme="green" style={s.usdVal}>•••••</MetallicText>
              </View>
            ) : (
              <View style={s.usdInline}>
                <Text style={s.usxLabel}>USx </Text>
                <MetallicText scheme="green" style={s.usdVal}>{usxP.int}</MetallicText>
                <MetallicText scheme="green" style={s.usdCents}>,{usxP.dec}</MetallicText>
              </View>
            )}
          </View>
        </View>

        {/* Divisor sutil */}
        <View style={s.divider} pointerEvents="none" />

        {/* Coluna direita — COTAÇÃO (USx em cinza, resto em dourado) */}
        <View style={s.right}>
          <Text style={s.title}>COTAÇÃO DO DIA</Text>
          <View style={s.ratePill}>
            <View style={s.rateInline}>
              <MetallicText scheme="gold" style={s.rateTxt}>1 </MetallicText>
              <Text style={s.rateUsxLabel}>USx</Text>
              <MetallicText scheme="gold" style={s.rateTxt}> = {rateDisplay} PYX</MetallicText>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

/**
 * SVG default: gradiente verde escuro + dourado, com gráfico de linha
 * ascendente verde à direita e moedas douradas empilhadas.
 */
function DefaultFinanceBackground() {
  return (
    <View style={s.bgSvg}>
      <Svg width="100%" height="100%" viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice">
        <Defs>
          <SvgGradient id="baseBg" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#0A1F14" stopOpacity="1" />
            <Stop offset="50%" stopColor="#0D2E1E" stopOpacity="1" />
            <Stop offset="100%" stopColor="#050F0A" stopOpacity="1" />
          </SvgGradient>
          <SvgGradient id="goldGlow" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#D4AF37" stopOpacity="0" />
            <Stop offset="80%" stopColor="#D4AF37" stopOpacity="0.15" />
            <Stop offset="100%" stopColor="#F5C150" stopOpacity="0.25" />
          </SvgGradient>
          <SvgGradient id="coinGold" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor="#FFE082" stopOpacity="1" />
            <Stop offset="50%" stopColor="#F5C150" stopOpacity="1" />
            <Stop offset="100%" stopColor="#B8860B" stopOpacity="1" />
          </SvgGradient>
          <SvgGradient id="chartFill" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor="#4EE07F" stopOpacity="0.35" />
            <Stop offset="100%" stopColor="#4EE07F" stopOpacity="0" />
          </SvgGradient>
        </Defs>

        <Rect x="0" y="0" width="400" height="200" fill="url(#baseBg)" />
        <Rect x="0" y="0" width="400" height="200" fill="url(#goldGlow)" />

        <G opacity="0.06">
          {[40, 80, 120, 160].map((y) => (
            <Rect key={y} x="0" y={y} width="400" height="0.5" fill="#4EE07F" />
          ))}
          {[100, 200, 300].map((x) => (
            <Rect key={x} x={x} y="0" width="0.5" height="200" fill="#4EE07F" />
          ))}
        </G>

        <G opacity="0.28">
          {[
            { x: 220, y: 130, h: 40, w: 6, c: GREEN },
            { x: 236, y: 110, h: 55, w: 6, c: GREEN },
            { x: 252, y: 90,  h: 70, w: 6, c: GREEN },
            { x: 268, y: 100, h: 55, w: 6, c: GREEN_DEEP },
            { x: 284, y: 78,  h: 78, w: 6, c: GREEN },
            { x: 300, y: 60,  h: 90, w: 6, c: GREEN },
            { x: 316, y: 68,  h: 80, w: 6, c: GREEN },
            { x: 332, y: 45,  h: 100, w: 6, c: GREEN },
            { x: 348, y: 30,  h: 115, w: 6, c: GREEN },
          ].map((k, i) => (
            <Rect key={i} x={k.x} y={k.y} width={k.w} height={k.h} rx="1" fill={k.c} />
          ))}
        </G>

        <Path
          d="M 40 160 L 90 145 L 130 135 L 170 118 L 210 105 L 250 82 L 290 65 L 330 50 L 370 30 L 370 200 L 40 200 Z"
          fill="url(#chartFill)"
        />
        <Path
          d="M 40 160 L 90 145 L 130 135 L 170 118 L 210 105 L 250 82 L 290 65 L 330 50 L 370 30"
          stroke="#4EE07F"
          strokeWidth="2"
          fill="none"
        />
        <Path
          d="M 370 30 L 362 42 M 370 30 L 358 32"
          stroke="#4EE07F"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
        />
        {[
          [90, 145], [130, 135], [170, 118], [210, 105],
          [250, 82], [290, 65], [330, 50], [370, 30],
        ].map(([cx, cy], i) => (
          <Circle key={i} cx={cx} cy={cy} r="2.5" fill="#4EE07F" opacity="0.9" />
        ))}

        <G opacity="0.85">
          <Ellipse cx="270" cy="180" rx="14" ry="4" fill="url(#coinGold)" />
          <Ellipse cx="270" cy="175" rx="14" ry="4" fill="url(#coinGold)" />
          <Ellipse cx="270" cy="170" rx="14" ry="4" fill="url(#coinGold)" />
          <Ellipse cx="270" cy="165" rx="14" ry="4" fill="url(#coinGold)" />
          <Ellipse cx="310" cy="180" rx="16" ry="5" fill="url(#coinGold)" />
          <Ellipse cx="310" cy="174" rx="16" ry="5" fill="url(#coinGold)" />
          <Ellipse cx="310" cy="168" rx="16" ry="5" fill="url(#coinGold)" />
          <Ellipse cx="310" cy="162" rx="16" ry="5" fill="url(#coinGold)" />
          <Ellipse cx="310" cy="156" rx="16" ry="5" fill="url(#coinGold)" />
          <Ellipse cx="350" cy="180" rx="13" ry="4" fill="url(#coinGold)" />
          <Ellipse cx="350" cy="175" rx="13" ry="4" fill="url(#coinGold)" />
          <Ellipse cx="350" cy="170" rx="13" ry="4" fill="url(#coinGold)" />
          <Circle cx="330" cy="130" r="18" fill="url(#coinGold)" stroke="#8B6914" strokeWidth="0.5" />
          <Circle cx="330" cy="130" r="14" fill="none" stroke="#8B6914" strokeWidth="0.4" opacity="0.5" />
          <Text
            x="330" y="130"
            fill="#7A5B10"
            fontSize="18" fontWeight="900"
            textAnchor="middle"
            {...({ dy: 6 } as any)}
          >$</Text>
        </G>
      </Svg>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    borderRadius: 14,
    overflow: "hidden",
    marginHorizontal: 12,
    marginTop: 4,               // encostado no greeting (foi 8)
    borderWidth: 1,
    borderColor: "rgba(212,175,55,0.30)",
    backgroundColor: "#050505",
    position: "relative",
    ...Platform.select({
      web: {
        // @ts-ignore
        boxShadow: "0 8px 24px rgba(0,0,0,0.55), 0 0 0 1px rgba(212,175,55,0.06) inset",
      } as any,
      default: {
        shadowColor: "#000",
        shadowOpacity: 0.55,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
        elevation: 5,
      },
    }),
  },
  bgImage: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  bgSvg: { ...StyleSheet.absoluteFillObject as any, width: "100%", height: "100%" },
  overlay: {
    ...StyleSheet.absoluteFillObject as any,
    backgroundColor: "rgba(0,0,0,0.18)",
  },

  content: {
    flex: 1,
    flexDirection: "row",
    paddingHorizontal: 14,
    paddingTop: 10,          // conteúdo colado no topo (foi 16)
    paddingBottom: 14,
    gap: 10,
    zIndex: 2,
  },
  left: {
    flex: 1.1,
    justifyContent: "flex-start", // saldo próximo ao topo
    gap: 4,
  },
  divider: {
    width: 1,
    backgroundColor: "rgba(212,175,55,0.28)",
    alignSelf: "stretch",
    marginVertical: 4,
  },
  right: {
    flex: 1,
    justifyContent: "flex-start",  // cotação alinhada ao topo do saldo
    gap: 6,
    alignItems: "flex-start",
  },

  // Título (SALDO PYX / COTAÇÃO DO DIA)
  title: {
    color: "#DDE4EA",
    fontSize: 10.5,
    fontWeight: "900",
    letterSpacing: 1.9,
    opacity: 0.8,
    marginBottom: 3,
  },

  // Saldo principal — degradê dourado metálico
  balanceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    marginTop: 2,
  },
  balanceValue: {
    fontSize: 34,
    fontWeight: "900",
    letterSpacing: -1.2,
    fontVariant: ["tabular-nums"] as any,
    lineHeight: 40,
  },
  balanceCents: {
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: -0.4,
    fontVariant: ["tabular-nums"] as any,
    lineHeight: 40,
    marginLeft: 1,
  },
  balanceUnit: {
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 1.4,
    lineHeight: 40,
  },

  // Pill do valor em USx (verde) — preto fosco + borda VERDE + shadow
  usdPill: {
    marginTop: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: "rgba(78,224,127,0.55)",
    ...Platform.select({
      web: {
        // @ts-ignore
        boxShadow: "0 2px 10px rgba(0,0,0,0.5), 0 0 0 1px rgba(78,224,127,0.10) inset",
        backdropFilter: "blur(6px)",
      } as any,
      default: {
        shadowColor: "#000",
        shadowOpacity: 0.4,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
      },
    }),
  },
  usdLbl: {
    color: "#B7BEC5",
    fontSize: 9.5,
    fontWeight: "700",
    letterSpacing: 0.8,
    marginBottom: 1,
  },
  usdInline: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  // Rótulo "USx" — cinza escuro (destaque menor)
  usxLabel: {
    color: "#5A5F66",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.6,
    fontVariant: ["tabular-nums"] as any,
  },
  usdVal: {
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 0.2,
    fontVariant: ["tabular-nums"] as any,
  },
  usdCents: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.2,
    fontVariant: ["tabular-nums"] as any,
  },

  // Pill "Cotação do dia" — preto fosco + borda DOURADA (destaque atual)
  ratePill: {
    marginTop: 2,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: "rgba(212,175,55,0.55)",
    alignSelf: "flex-start",
    ...Platform.select({
      web: {
        // @ts-ignore
        boxShadow: "0 2px 10px rgba(0,0,0,0.5), 0 0 0 1px rgba(212,175,55,0.10) inset",
        backdropFilter: "blur(6px)",
      } as any,
      default: {
        shadowColor: "#000",
        shadowOpacity: 0.4,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
      },
    }),
  },
  rateTxt: {
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.4,
    fontVariant: ["tabular-nums"] as any,  },
  rateInline: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  // "USx" dentro da cotação — cinza escuro
  rateUsxLabel: {
    color: "#5A5F66",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.6,
    fontVariant: ["tabular-nums"] as any,
  },
});

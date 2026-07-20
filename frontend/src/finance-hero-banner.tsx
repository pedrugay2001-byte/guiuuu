/**
 * FinanceHeroBanner — Painel financeiro premium na home (substitui o tier banner).
 *
 * Layout (responsivo em 16:9 aproximado):
 *   ┌─────────────────────────────────────────────────────────┐
 *   │  SALDO PYX           │  COTAÇÃO DO DIA                  │
 *   │  50.915 pyx          │  ● 1 USD = 5,00 PYX  (pill verde)│
 *   │  US$ 10.183,04       │                                  │
 *   │  (pill dourada)      │         (gráfico + moedas)       │
 *   └─────────────────────────────────────────────────────────┘
 *
 * Background:
 *  - Se o admin subiu imagem custom → usa ela via <Image>
 *  - Caso contrário → SVG default (verde escuro + dourado + gráfico ascendente + moedas)
 *
 * Respeita o toggle olho (mostrar/ocultar) via useBalanceVisibility.
 */

import React from "react";
import { View, Text, StyleSheet, Image, Platform } from "react-native";
import Svg, {
  Defs, LinearGradient as SvgGradient, Stop, Rect, Path,
  Circle, G, Ellipse,
} from "react-native-svg";
import { formatPYX, formatUSD } from "./pyx";
import { usePYXRate } from "./pyx-rate";
import { useBalanceVisibility, maskAmount } from "./use-balance-visibility";

const GOLD = "#F5C150";
const GREEN = "#4EE07F";
const GREEN_DEEP = "#0F5A3A";

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

  const pyxStr = maskAmount(formatPYX(balanceCentavos || 0), hidden);
  const usdStr = maskAmount(formatUSD(balanceCentavos || 0, rateCentavos), hidden);
  const rateDisplay = rate?.pyx_per_usd_display || "5,00";

  const customBg =
    (rate?.finance_hero_image_base64 && rate.finance_hero_image_base64.trim()) ||
    (rate?.finance_hero_image_url && rate.finance_hero_image_url.trim()) ||
    "";

  return (
    <View style={[s.card, { height }]} testID="home-finance-hero">
      {/* BACKGROUND: imagem custom OU SVG default */}
      {customBg ? (
        <Image source={{ uri: customBg }} style={s.bgImage} resizeMode="cover" />
      ) : (
        <DefaultFinanceBackground />
      )}

      {/* Overlay escuro sutil pra legibilidade */}
      <View style={s.overlay} pointerEvents="none" />

      {/* CONTEÚDO em duas colunas */}
      <View style={s.content}>
        {/* ESQUERDA — Saldo PYX */}
        <View style={s.left}>
          <Text style={s.label}>SALDO PYX</Text>
          <View style={s.pyxRow}>
            <Text style={s.pyxValue} numberOfLines={1} allowFontScaling={false}>
              {pyxStr}
            </Text>
            <Text style={s.pyxUnit} allowFontScaling={false}>pyx</Text>
          </View>
          <View style={s.usdPill}>
            <Text style={s.usdTxt} numberOfLines={1}>{usdStr}</Text>
          </View>
        </View>

        {/* Divisor vertical sutil */}
        <View style={s.divider} pointerEvents="none" />

        {/* DIREITA — Cotação do dia */}
        <View style={s.right}>
          <Text style={s.label}>COTAÇÃO DO DIA</Text>
          <View style={s.ratePill}>
            <View style={s.rateDot} />
            <Text style={s.rateTxt} numberOfLines={1}>1 USD = {rateDisplay} PYX</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

/**
 * SVG default: gradiente verde escuro + dourado, com gráfico de linha
 * ascendente verde à direita e moedas douradas empilhadas.
 * Totalmente vetorial — sem depender de asset externo.
 */
function DefaultFinanceBackground() {
  return (
    <View style={s.bgSvg}>
      <Svg width="100%" height="100%" viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice">
        <Defs>
          {/* Gradiente base: preto → verde escuro → preto */}
          <SvgGradient id="baseBg" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#0A1F14" stopOpacity="1" />
            <Stop offset="50%" stopColor="#0D2E1E" stopOpacity="1" />
            <Stop offset="100%" stopColor="#050F0A" stopOpacity="1" />
          </SvgGradient>
          {/* Glow dourado radial no canto direito */}
          <SvgGradient id="goldGlow" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#D4AF37" stopOpacity="0" />
            <Stop offset="80%" stopColor="#D4AF37" stopOpacity="0.15" />
            <Stop offset="100%" stopColor="#F5C150" stopOpacity="0.25" />
          </SvgGradient>
          {/* Gradiente dourado das moedas */}
          <SvgGradient id="coinGold" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor="#FFE082" stopOpacity="1" />
            <Stop offset="50%" stopColor="#F5C150" stopOpacity="1" />
            <Stop offset="100%" stopColor="#B8860B" stopOpacity="1" />
          </SvgGradient>
          {/* Gradiente da área do gráfico (verde translúcido) */}
          <SvgGradient id="chartFill" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor="#4EE07F" stopOpacity="0.35" />
            <Stop offset="100%" stopColor="#4EE07F" stopOpacity="0" />
          </SvgGradient>
        </Defs>

        {/* Camada base */}
        <Rect x="0" y="0" width="400" height="200" fill="url(#baseBg)" />
        {/* Glow dourado */}
        <Rect x="0" y="0" width="400" height="200" fill="url(#goldGlow)" />

        {/* Linhas de grade sutis */}
        <G opacity="0.06">
          {[40, 80, 120, 160].map((y) => (
            <Rect key={y} x="0" y={y} width="400" height="0.5" fill="#4EE07F" />
          ))}
          {[100, 200, 300].map((x) => (
            <Rect key={x} x={x} y="0" width="0.5" height="200" fill="#4EE07F" />
          ))}
        </G>

        {/* Candles no fundo (financeiro) — coluna direita */}
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

        {/* Área do gráfico ascendente (verde translúcido) + linha superior */}
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
        {/* Ponta da linha (seta cima) */}
        <Path
          d="M 370 30 L 362 42 M 370 30 L 358 32"
          stroke="#4EE07F"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
        />
        {/* Pontos verdes ao longo da linha */}
        {[
          [90, 145], [130, 135], [170, 118], [210, 105],
          [250, 82], [290, 65], [330, 50], [370, 30],
        ].map(([cx, cy], i) => (
          <Circle key={i} cx={cx} cy={cy} r="2.5" fill="#4EE07F" opacity="0.9" />
        ))}

        {/* Moedas empilhadas (canto inferior direito) — estilizadas */}
        <G opacity="0.85">
          {/* Pilha 1 — atrás */}
          <Ellipse cx="270" cy="180" rx="14" ry="4" fill="url(#coinGold)" />
          <Ellipse cx="270" cy="175" rx="14" ry="4" fill="url(#coinGold)" />
          <Ellipse cx="270" cy="170" rx="14" ry="4" fill="url(#coinGold)" />
          <Ellipse cx="270" cy="165" rx="14" ry="4" fill="url(#coinGold)" />

          {/* Pilha 2 — meio (maior) */}
          <Ellipse cx="310" cy="180" rx="16" ry="5" fill="url(#coinGold)" />
          <Ellipse cx="310" cy="174" rx="16" ry="5" fill="url(#coinGold)" />
          <Ellipse cx="310" cy="168" rx="16" ry="5" fill="url(#coinGold)" />
          <Ellipse cx="310" cy="162" rx="16" ry="5" fill="url(#coinGold)" />
          <Ellipse cx="310" cy="156" rx="16" ry="5" fill="url(#coinGold)" />

          {/* Pilha 3 — direita */}
          <Ellipse cx="350" cy="180" rx="13" ry="4" fill="url(#coinGold)" />
          <Ellipse cx="350" cy="175" rx="13" ry="4" fill="url(#coinGold)" />
          <Ellipse cx="350" cy="170" rx="13" ry="4" fill="url(#coinGold)" />

          {/* Moeda destaque (grande, com $) */}
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
    marginTop: 8,
    borderWidth: 1,
    borderColor: "rgba(212,175,55,0.30)",
    backgroundColor: "#050505",
    position: "relative",
    // Sombra premium (efeito 3D discreto)
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
    backgroundColor: "rgba(0,0,0,0.15)",
  },

  content: {
    flex: 1,
    flexDirection: "row",
    padding: 16,
    gap: 12,
    zIndex: 2,
  },
  left: { flex: 1.05, justifyContent: "center", gap: 6 },
  divider: {
    width: 1,
    backgroundColor: "rgba(212,175,55,0.30)",
    alignSelf: "stretch",
    marginVertical: 8,
  },
  right: { flex: 1, justifyContent: "center", gap: 6, alignItems: "flex-start" },

  label: {
    color: "#EAF1F6",
    fontSize: 10.5,
    fontWeight: "900",
    letterSpacing: 1.8,
    opacity: 0.85,
  },
  pyxRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
  },
  pyxValue: {
    color: GOLD,
    fontSize: 32,
    fontWeight: "900",
    letterSpacing: -1,
    fontVariant: ["tabular-nums"] as any,
    // Sombra sutil dourada
    ...Platform.select({
      web: { textShadow: "0 2px 8px rgba(212,175,55,0.35)" } as any,
      default: {
        textShadowColor: "rgba(212,175,55,0.4)",
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 4,
      },
    }),
  },
  pyxUnit: {
    color: "#EAF1F6",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.2,
    opacity: 0.75,
  },
  usdPill: {
    marginTop: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(212,175,55,0.55)",
    backgroundColor: "rgba(212,175,55,0.10)",
    alignSelf: "flex-start",
  },
  usdTxt: {
    color: GOLD,
    fontSize: 13.5,
    fontWeight: "900",
    letterSpacing: 0.3,
    fontVariant: ["tabular-nums"] as any,
  },
  ratePill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 24,
    backgroundColor: "rgba(15,42,26,0.65)",
    borderWidth: 1,
    borderColor: "rgba(78,224,127,0.55)",
    gap: 8,
  },
  rateDot: {
    width: 7, height: 7, borderRadius: 4,
    backgroundColor: GREEN,
  },
  rateTxt: {
    color: GREEN,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.4,
    fontVariant: ["tabular-nums"] as any,
  },
});

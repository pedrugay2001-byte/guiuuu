import { useMemo } from "react";
import { useGate } from "./gate";
import type { TierId } from "./theme";

export type TierAccent = {
  tier: TierId;
  isDiamond: boolean;
  /** Cor principal de destaque (para textos/ícones ativos). */
  accent: string;
  /** Cor clara (realce/reflexo). */
  accentLight: string;
  /** Cor escura (sombra/borda). */
  accentDark: string;
  /** Cor profunda (background de gradientes). */
  accentDeep: string;
  /** Trio de gradiente pronto para `<LinearGradient colors={gradient}>`. */
  gradient: readonly [string, string, string];
};

/** Paleta prata/platinum — DIAMOND */
const PLATINUM = {
  light: "#EAF1F6",
  base: "#C5D1DA",
  dark: "#8FA3B4",
  deep: "#2A3744",
} as const;

/** Paleta dourada — BLACK / SILVER / GOLD */
const GOLD = {
  light: "#F4D47A",
  base: "#D4AF37",
  dark: "#8C6F1E",
  deep: "#4A3810",
} as const;

/**
 * Retorna a paleta de destaque do membro atual:
 *  - Diamond → azul-prateado (platinum metálico)
 *  - Outros → dourado clássico
 *
 * Uso:
 *   const accent = useTierAccent();
 *   <Text style={{ color: accent.accent }}>...</Text>
 *   <LinearGradient colors={accent.gradient} ...>
 */
export function useTierAccent(): TierAccent {
  const { member } = useGate();
  const tier = (member?.tier || "black") as TierId;
  return useMemo(() => {
    const isDiamond = tier === "diamond";
    const palette = isDiamond ? PLATINUM : GOLD;
    return {
      tier,
      isDiamond,
      accent: palette.base,
      accentLight: palette.light,
      accentDark: palette.dark,
      accentDeep: palette.deep,
      gradient: [palette.light, palette.base, palette.dark] as const,
    };
  }, [tier]);
}

/** Retorna a paleta de um tier específico (sem ler o membro atual). */
export function getTierPalette(tier: TierId): TierAccent {
  const isDiamond = tier === "diamond";
  const palette = isDiamond ? PLATINUM : GOLD;
  return {
    tier,
    isDiamond,
    accent: palette.base,
    accentLight: palette.light,
    accentDark: palette.dark,
    accentDeep: palette.deep,
    gradient: [palette.light, palette.base, palette.dark] as const,
  };
}

export const BRAND = {
  name: "BLACKSCLUB",
  tagline: "MEMBERS ONLY",
  pronunciation: "Black Club",
};

export const theme = {
  colors: {
    bg: "#050505",
    bg2: "#0A0A0A",
    surface: "#101010",
    surfaceElevated: "#171717",
    border: "#1F1F1F",
    borderStrong: "#2A2A2A",
    text: "#F5F5F5",
    textMuted: "#9A9A9A",
    white: "#FFFFFF",
    silver: "#C8C8C8",
    accent: "#E5E5E5",
    // Tier colors
    tierBlack: "#222222",
    tierSilver: "#B8B8B8",
    tierGold: "#D4AF37",
    tierDiamond: "#C5D1DA",  // azul-prateado metálico premium
    // Platinum / prateado metálico (premium para membros Diamond)
    platinumLight: "#EAF1F6",   // reflexo prata claro
    platinum: "#C5D1DA",         // prata-azulado base
    platinumMid: "#8FA3B4",      // prata metálico médio
    platinumDark: "#4A5F74",     // azul-aço escuro
    platinumShadow: "#2A3744",   // base profunda para gradientes
    diamondGlow: "#9FE6F2",      // highlight diamond
    whatsapp: "#1EBE5D",
    error: "#FF3B30",
  },
  // Gradientes reutilizáveis (3D metálico premium)
  gradients: {
    gold: ["#F4D47A", "#D4AF37", "#8C6F1E"] as const,
    platinum: ["#EAF1F6", "#C5D1DA", "#8FA3B4", "#4A5F74"] as const,
    diamond: ["#C5D1DA", "#7FD7E5", "#4A5F74"] as const,
  },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 },
  radius: { sm: 4, md: 8, lg: 12, xl: 16 },
};

export type TierId = "black" | "silver" | "gold" | "diamond";

export const TIERS: Record<TierId, { label: string; color: string; icon: string }> = {
  black: { label: "Membro", color: theme.colors.silver, icon: "ellipse" },
  silver: { label: "Membro Silver", color: theme.colors.tierSilver, icon: "ellipse" },
  gold: { label: "Membro Gold", color: theme.colors.tierGold, icon: "star" },
  diamond: { label: "Membro Diamond", color: theme.colors.tierDiamond, icon: "diamond" },
};

export const BR_STATES = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA",
  "PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
];

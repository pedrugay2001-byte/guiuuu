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
    tierDiamond: "#7FD7E5",
    whatsapp: "#1EBE5D",
    error: "#FF3B30",
  },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 },
  radius: { sm: 4, md: 8, lg: 12, xl: 16 },
};

export type TierId = "black" | "silver" | "gold" | "diamond";

export const TIERS: Record<TierId, { label: string; color: string; icon: string }> = {
  black: { label: "Black", color: theme.colors.silver, icon: "ellipse" },
  silver: { label: "Black Silver", color: theme.colors.tierSilver, icon: "ellipse" },
  gold: { label: "Black Gold", color: theme.colors.tierGold, icon: "star" },
  diamond: { label: "Black Diamond", color: theme.colors.tierDiamond, icon: "diamond" },
};

export const BR_STATES = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA",
  "PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
];

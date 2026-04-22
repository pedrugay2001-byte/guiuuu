import { View, Text, StyleSheet, ViewStyle, TextStyle } from "react-native";
import { theme } from "./theme";

// BLACK · S · CLUB logo. The central S is accented.
export function BrandLogo({
  size = "md",
  style,
}: {
  size?: "sm" | "md" | "lg" | "xl";
  style?: ViewStyle;
}) {
  const map = {
    sm: { fs: 13, gap: 3 },
    md: { fs: 18, gap: 4 },
    lg: { fs: 28, gap: 6 },
    xl: { fs: 44, gap: 10 },
  } as const;
  const { fs, gap } = map[size];
  const baseText: TextStyle = {
    color: theme.colors.white,
    fontSize: fs,
    fontWeight: "900",
    letterSpacing: fs > 24 ? 2 : 3,
  };
  return (
    <View style={[styles.row, { gap }, style]}>
      <Text style={baseText}>BLACK</Text>
      <View style={[styles.sWrap, { width: fs + 4, height: fs + 4, borderRadius: (fs + 4) / 2 }]}>
        <Text style={[baseText, { color: theme.colors.bg, fontSize: fs - 2, letterSpacing: 0 }]}>S</Text>
      </View>
      <Text style={baseText}>CLUB</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  sWrap: {
    backgroundColor: theme.colors.white,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#FFF",
    shadowOpacity: 0.5,
    shadowRadius: 8,
  },
});

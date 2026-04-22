import { View, Text, StyleSheet, ViewStyle } from "react-native";
import { theme } from "./theme";

// Brand rendered as individual letters to prevent OS translation
// (e.g. 'BLACKSCLUB' being auto-translated into 'PRETOSCLUBE').
export function BrandLogo({
  size = "md",
  style,
}: {
  size?: "sm" | "md" | "lg" | "xl";
  style?: ViewStyle;
}) {
  const map = {
    sm: { fs: 13, sRadius: 9, gap: 3, spacing: 1 },
    md: { fs: 18, sRadius: 12, gap: 5, spacing: 1.5 },
    lg: { fs: 26, sRadius: 16, gap: 7, spacing: 2 },
    xl: { fs: 40, sRadius: 24, gap: 10, spacing: 2.5 },
  } as const;
  const { fs, sRadius, gap, spacing } = map[size];

  const blackLetters = ["B", "L", "A", "C", "K"];
  const clubLetters = ["C", "L", "U", "B"];

  return (
    <View
      style={[styles.row, { height: Math.max(fs, sRadius * 2) + 2 }, style]}
      accessibilityLabel="Black S Club"
    >
      {blackLetters.map((l, i) => (
        <Text
          key={`b-${i}`}
          style={[styles.letter, { fontSize: fs, marginRight: i < blackLetters.length - 1 ? spacing : 0 }]}
          allowFontScaling={false}
        >
          {l}
        </Text>
      ))}
      <View
        style={{
          width: sRadius * 2,
          height: sRadius * 2,
          borderRadius: sRadius,
          backgroundColor: theme.colors.white,
          alignItems: "center",
          justifyContent: "center",
          marginHorizontal: gap,
        }}
      >
        <Text
          style={{
            color: theme.colors.bg,
            fontSize: fs - 2,
            fontWeight: "900",
            lineHeight: fs + 2,
          }}
          allowFontScaling={false}
        >
          S
        </Text>
      </View>
      {clubLetters.map((l, i) => (
        <Text
          key={`c-${i}`}
          style={[styles.letter, { fontSize: fs, marginRight: i < clubLetters.length - 1 ? spacing : 0 }]}
          allowFontScaling={false}
        >
          {l}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  letter: { color: theme.colors.white, fontWeight: "900" },
});

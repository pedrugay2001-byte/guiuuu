import { View, Text, StyleSheet, ViewStyle, Platform } from "react-native";
import { theme } from "./theme";

// Brand rendered as individual letters to prevent OS translation
// (e.g. 'BLACKSCLUB' being auto-translated into 'PRETOSCLUBE').
export function BrandLogo({
  size = "md",
  style,
  goldS = false,
}: {
  size?: "sm" | "md" | "lg" | "xl";
  style?: ViewStyle;
  goldS?: boolean;
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
  const sBg = goldS ? "#F5C150" : theme.colors.white;

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
          backgroundColor: sBg,
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

// Premium serif hero logo — "BLACK CLUB" with gold K, elegant serif look.
// Used on the Home hero area.
// Compact single-word logo "BLACKSCLUB" — for header use, top-left corner.
export function BrandMark({ fontSize = 16 }: { fontSize?: number }) {
  const serifFamily = Platform.select({ ios: "Times New Roman", android: "serif", default: "serif" });
  const base = {
    fontFamily: serifFamily,
    fontSize,
    color: "#EFEFEF",
    fontWeight: "600" as const,
    letterSpacing: fontSize * 0.08,
    includeFontPadding: false,
  };
  const gold = { ...base, color: "#D4AF37" };
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <Text allowFontScaling={false} style={base}>BLAC</Text>
      <Text allowFontScaling={false} style={gold}>KS</Text>
      <Text allowFontScaling={false} style={base}>CLUB</Text>
    </View>
  );
}

export function BrandSerifHero({ fontSize = 38 }: { fontSize?: number }) {
  const serifFamily = Platform.select({ ios: "Times New Roman", android: "serif", default: "serif" });
  const baseLetter = {
    fontFamily: serifFamily,
    fontSize,
    color: "#F4F4F4",
    fontWeight: "500" as const,
    letterSpacing: fontSize * 0.08,
    includeFontPadding: false,
  };
  const goldLetter = { ...baseLetter, color: "#D4AF37" };

  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center" }}>
      <Text allowFontScaling={false} style={baseLetter}>BLAC</Text>
      <Text allowFontScaling={false} style={goldLetter}>K</Text>
      <Text allowFontScaling={false} style={goldLetter}>S</Text>
      <Text allowFontScaling={false} style={[baseLetter, { marginLeft: fontSize * 0.2 }]}>CLUB</Text>
    </View>
  );
}

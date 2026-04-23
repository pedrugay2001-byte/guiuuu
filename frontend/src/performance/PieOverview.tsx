import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Circle, G } from "react-native-svg";

type Slice = { label: string; value: number; color: string };
type Props = { size?: number; data: Slice[]; averageLabel?: string };

export default function PieOverview({ size = 150, data, averageLabel }: Props) {
  const stroke = 18;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = data.reduce((s, d) => s + Math.max(0, d.value), 0);
  const avg = data.length ? Math.round(data.reduce((s, d) => s + d.value, 0) / data.length) : 0;

  // Build arcs equally spaced by slice weight (or equal if total == 0)
  const fallback = total <= 0;
  let offset = 0;
  const arcs = data.map((d) => {
    const weight = fallback ? 1 / Math.max(1, data.length) : Math.max(0, d.value) / Math.max(1, total);
    const len = weight * circumference;
    const arc = { ...d, len, offset };
    offset += len;
    return arc;
  });

  return (
    <View style={{ alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: "-90deg" }] }}>
        <Circle cx={size/2} cy={size/2} r={radius} stroke="#1B1B1B" strokeWidth={stroke} fill="none" />
        <G>
          {arcs.map((a, i) => (
            <Circle
              key={i}
              cx={size/2} cy={size/2} r={radius}
              stroke={a.color} strokeWidth={stroke}
              strokeDasharray={`${a.len} ${circumference}`}
              strokeDashoffset={-a.offset}
              strokeLinecap="butt"
              fill="none"
              opacity={fallback ? 0.35 : 1}
            />
          ))}
        </G>
      </Svg>
      <View style={st.center} pointerEvents="none">
        <Text style={st.val}>{avg}%</Text>
        <Text style={st.lbl}>{averageLabel || "MÉDIA"}</Text>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  center: { position: "absolute", alignItems: "center", justifyContent: "center" },
  val: { color: "#FFF", fontSize: 28, fontWeight: "900", letterSpacing: -0.5 },
  lbl: { color: "#888", fontSize: 9.5, fontWeight: "800", letterSpacing: 1.5, marginTop: 2 },
});

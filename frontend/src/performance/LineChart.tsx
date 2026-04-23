import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Path, Circle, Line, Defs, LinearGradient, Stop } from "react-native-svg";

type Pt = { x: number; y: number };
type Props = {
  width: number;
  height: number;
  real: { date: string; value: number }[];
  ideal: { date: string; ideal: number }[];
  color?: string;
  realLabel?: string;
  idealLabel?: string;
};

function toISO(d: string) { return d; }

export default function LineChart({ width, height, real, ideal, color = "#F5C150", realLabel = "REAL", idealLabel = "IDEAL" }: Props) {
  const padX = 24, padY = 16;
  const W = width - padX * 2, H = height - padY * 2;

  // union X axis by date index
  const dates = Array.from(new Set([...real.map(r => toISO(r.date)), ...ideal.map(i => toISO(i.date))])).sort();
  if (dates.length < 2) {
    return (
      <View style={{ width, height, alignItems: "center", justifyContent: "center" }}>
        <Text style={st.empty}>Sem dados suficientes ainda.</Text>
      </View>
    );
  }
  const xIndex = new Map<string, number>();
  dates.forEach((d, i) => xIndex.set(d, i));

  // Value range
  const values = [...real.map(r => r.value), ...ideal.map(i => i.ideal)];
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const span = Math.max(1e-9, maxV - minV);

  const sx = (d: string) => {
    const idx = xIndex.get(d) ?? 0;
    return padX + (idx / Math.max(1, dates.length - 1)) * W;
  };
  const sy = (v: number) => padY + H - ((v - minV) / span) * H;

  const buildPath = (pts: Pt[]) => {
    if (!pts.length) return "";
    let p = `M ${pts[0].x},${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) p += ` L ${pts[i].x},${pts[i].y}`;
    return p;
  };

  const realPts: Pt[] = real.map(r => ({ x: sx(r.date), y: sy(r.value) }));
  const idealPts: Pt[] = ideal.map(i => ({ x: sx(i.date), y: sy(i.ideal) }));

  // Area fill under real line
  const areaPath = realPts.length
    ? buildPath(realPts) + ` L ${realPts[realPts.length-1].x},${padY+H} L ${realPts[0].x},${padY+H} Z`
    : "";

  // Horizontal grid lines (3)
  const grid = [0, 0.5, 1].map(t => padY + H - t * H);

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="lcfill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity="0.22" />
            <Stop offset="1" stopColor={color} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        {grid.map((y, i) => (
          <Line key={i} x1={padX} y1={y} x2={padX + W} y2={y}
            stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
        ))}
        {/* Ideal line (dashed) */}
        <Path d={buildPath(idealPts)} stroke="rgba(255,255,255,0.35)"
          strokeWidth={1.4} strokeDasharray="4,5" fill="none" />
        {/* Real area */}
        <Path d={areaPath} fill="url(#lcfill)" />
        {/* Real line */}
        <Path d={buildPath(realPts)} stroke={color} strokeWidth={2.4}
          fill="none" strokeLinecap="round" strokeLinejoin="round" />
        {/* Last point dot */}
        {realPts.length ? (
          <Circle cx={realPts[realPts.length-1].x} cy={realPts[realPts.length-1].y}
            r={4.5} fill={color} stroke="#000" strokeWidth={2} />
        ) : null}
      </Svg>
      <View style={st.legendRow}>
        <View style={st.legItem}>
          <View style={[st.legDot, { backgroundColor: color }]} />
          <Text style={st.legTxt}>{realLabel}</Text>
        </View>
        <View style={st.legItem}>
          <View style={[st.legDashWrap]}>
            {[0,1,2,3].map(i => <View key={i} style={st.legDash} />)}
          </View>
          <Text style={st.legTxt}>{idealLabel}</Text>
        </View>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  empty: { color: "#666", fontSize: 12 },
  legendRow: { flexDirection: "row", justifyContent: "flex-end", gap: 14, paddingRight: 10, marginTop: -4 },
  legItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legDot: { width: 8, height: 8, borderRadius: 4 },
  legTxt: { color: "#888", fontSize: 9.5, fontWeight: "700", letterSpacing: 1 },
  legDashWrap: { flexDirection: "row", gap: 2 },
  legDash: { width: 3, height: 2, backgroundColor: "rgba(255,255,255,0.45)" },
});

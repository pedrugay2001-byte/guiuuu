import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated, Easing } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Stop } from "react-native-svg";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type Props = {
  size?: number;
  stroke?: number;
  progress: number;        // 0..100
  color?: string;
  trackColor?: string;
  label?: string;          // Small label below %
  centerValue?: string;    // If provided, shows this instead of %
  centerSub?: string;
  animated?: boolean;
};

export default function CircularProgress({
  size = 160, stroke = 12, progress, color = "#F5C150",
  trackColor = "#1B1B1B", label, centerValue, centerSub, animated = true,
}: Props) {
  const clamped = Math.max(0, Math.min(100, progress || 0));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!animated) { anim.setValue(clamped); return; }
    Animated.timing(anim, {
      toValue: clamped, duration: 900, easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [clamped, animated]);

  const strokeDashoffset = anim.interpolate({
    inputRange: [0, 100],
    outputRange: [circumference, 0],
  });

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: "-90deg" }] }}>
        <Defs>
          <LinearGradient id="cpgrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity="1" />
            <Stop offset="1" stopColor={color} stopOpacity="0.6" />
          </LinearGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={trackColor} strokeWidth={stroke} fill="none" />
        <AnimatedCircle
          cx={size / 2} cy={size / 2} r={radius}
          stroke="url(#cpgrad)" strokeWidth={stroke} fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference}, ${circumference}`}
          strokeDashoffset={strokeDashoffset as unknown as number}
        />
      </Svg>
      <View style={st.center}>
        <Text style={[st.val, { color: "#FFF" }]}>
          {centerValue ?? `${Math.round(clamped)}%`}
        </Text>
        {(label || centerSub) ? (
          <Text style={st.lbl}>{centerSub || label}</Text>
        ) : null}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  center: { position: "absolute", alignItems: "center", justifyContent: "center" },
  val: { fontSize: 32, fontWeight: "900", letterSpacing: -0.5 },
  lbl: { color: "#999", fontSize: 10, fontWeight: "800", letterSpacing: 1.4, marginTop: 4 },
});

import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";

type Props = {
  value: string;                 // YYYY-MM-DD
  onChange: (iso: string) => void;
  minDate?: string;
  color?: string;
};

const MONTHS_PT = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const DOWS_PT = ["D", "S", "T", "Q", "Q", "S", "S"];

function iso(d: Date) {
  const y = d.getFullYear(); const m = String(d.getMonth()+1).padStart(2,"0"); const dd = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${dd}`;
}

export default function CalendarPicker({ value, onChange, minDate, color = "#F5C150" }: Props) {
  const initial = value ? new Date(value + "T00:00:00") : new Date();
  const [viewDate, setViewDate] = useState<Date>(new Date(initial.getFullYear(), initial.getMonth(), 1));
  const today = new Date();
  const min = minDate ? new Date(minDate + "T00:00:00") : null;

  const days = useMemo(() => {
    const year = viewDate.getFullYear(), month = viewDate.getMonth();
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const startDow = first.getDay();
    const arr: (Date | null)[] = [];
    for (let i = 0; i < startDow; i++) arr.push(null);
    for (let d = 1; d <= last.getDate(); d++) arr.push(new Date(year, month, d));
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [viewDate]);

  const prev = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  const next = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));

  return (
    <View style={st.wrap}>
      <View style={st.head}>
        <TouchableOpacity onPress={prev} hitSlop={8}>
          <Ionicons name="chevron-back" size={20} color="#CCC" />
        </TouchableOpacity>
        <Text style={st.title}>{MONTHS_PT[viewDate.getMonth()]} {viewDate.getFullYear()}</Text>
        <TouchableOpacity onPress={next} hitSlop={8}>
          <Ionicons name="chevron-forward" size={20} color="#CCC" />
        </TouchableOpacity>
      </View>
      <View style={st.dowRow}>
        {DOWS_PT.map((d, i) => <Text key={i} style={st.dow}>{d}</Text>)}
      </View>
      <View style={st.grid}>
        {days.map((d, i) => {
          if (!d) return <View key={i} style={st.cell} />;
          const id = iso(d);
          const isSelected = id === value;
          const isToday = id === iso(today);
          const isDisabled = min ? d < min : false;
          return (
            <TouchableOpacity
              key={i}
              style={[st.cell, isSelected && { backgroundColor: color }, isDisabled && { opacity: 0.25 }]}
              disabled={isDisabled}
              onPress={() => onChange(id)}
              activeOpacity={0.85}
            >
              <Text style={[st.cellTxt,
                isSelected && { color: "#000", fontWeight: "900" },
                isToday && !isSelected && { color, fontWeight: "800" },
              ]}>
                {d.getDate()}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { backgroundColor: "#0B0B0B", borderRadius: 12, borderWidth: 1, borderColor: "#1A1A1A", padding: 12 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  title: { color: "#FFF", fontSize: 13, fontWeight: "800", letterSpacing: 0.3 },
  dowRow: { flexDirection: "row" },
  dow: { flex: 1, textAlign: "center", color: "#666", fontSize: 10, fontWeight: "800", letterSpacing: 0.8 },
  grid: { flexDirection: "row", flexWrap: "wrap", marginTop: 6 },
  cell: { width: `${100/7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center", borderRadius: 8 },
  cellTxt: { color: "#DDD", fontSize: 13, fontWeight: "600" },
});

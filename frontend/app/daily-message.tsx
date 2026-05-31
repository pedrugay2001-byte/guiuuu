import { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "../src/icons";
import { api, Goal, DailyMessage } from "../src/api";
import { useGate } from "../src/gate";

const GOLD = "#F5C150";
const SILVER = "#C0C0C0";

export default function DailyMessageScreen() {
  const router = useRouter();
  const { member } = useGate();
  const params = useLocalSearchParams<{ goalId?: string }>();
  const { width } = useWindowDimensions();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>((params?.goalId as string) || null);
  const [msg, setMsg] = useState<DailyMessage | null>(null);
  const [loading, setLoading] = useState(true);

  const loadGoals = useCallback(async () => {
    if (!member) return;
    try {
      const g = await api.goalsList(member.member_id);
      setGoals(g);
      if (!selectedId) {
        const crit = g.sort((a, b) => a.rhythm - b.rhythm)[0];
        setSelectedId(crit?.goal_id ?? null);
      }
    } catch {}
  }, [member, selectedId]);

  useEffect(() => { loadGoals(); }, [loadGoals]);

  useEffect(() => {
    if (!selectedId) { setLoading(false); return; }
    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);
    setMsg(null);
    api.goalDailyMessage(selectedId)
      .then(m => { if (!cancelled) setMsg(m); })
      .catch(() => { if (!cancelled) setMsg(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; controller.abort(); };
  }, [selectedId]);

  const selectedGoal = goals.find(g => g.goal_id === selectedId);
  const color = msg?.goal_color || selectedGoal?.color || SILVER;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#050505" }} edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* HEADER */}
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()} style={st.backBtn} hitSlop={10}>
          <Ionicons name="chevron-back" size={22} color="#FFF" />
        </TouchableOpacity>
        <Text style={st.headTitle}>MENSAGEM DO DIA</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>

        {/* Goal selector */}
        {goals.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingBottom: 4 }} style={{ marginBottom: 14 }}>
            {goals.map(g => {
              const sel = g.goal_id === selectedId;
              const gc = g.color || SILVER;
              return (
                <TouchableOpacity key={g.goal_id} onPress={() => setSelectedId(g.goal_id)}
                  style={[st.chip, sel && { borderColor: gc, backgroundColor: `${gc}20` }]}
                  activeOpacity={0.85}>
                  <Text style={[st.chipTxt, sel && { color: "#FFF" }]} numberOfLines={1}>{g.title}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {loading ? (
          <View style={{ padding: 40, alignItems: "center" }}>
            <ActivityIndicator color={color} size="large" />
            <Text style={st.wait}>Preparando sua mensagem...</Text>
          </View>
        ) : !selectedId ? (
          <View style={st.emptyCard}>
            <MaterialCommunityIcons name="book-open-variant" size={42} color={SILVER} />
            <Text style={st.emptyTitle}>Nenhuma meta ativa</Text>
            <Text style={st.emptyTxt}>Crie uma meta na aba Metas para receber sua mensagem do dia.</Text>
            <TouchableOpacity style={st.goBtn} onPress={() => router.push("/(tabs)/performance")}>
              <Text style={st.goBtnTxt}>IR PARA METAS</Text>
            </TouchableOpacity>
          </View>
        ) : msg ? (
          <View style={[st.card, { borderColor: `${color}50` }]}>
            <Text style={st.dayLbl}>{(msg.day_label || "").toUpperCase()}</Text>
            <View style={[st.goalTag, { borderColor: `${color}70`, backgroundColor: `${color}22` }]}>
              <Text style={[st.goalTagTxt, { color }]}>META: {msg.goal_title.toUpperCase()}</Text>
            </View>

            <Text style={st.headline}>{msg.headline}</Text>
            <Text style={st.focus}>{msg.focus}</Text>

            <View style={[st.verseBox, { borderLeftColor: color }]}>
              <Text style={st.verseTxt}>“{msg.verse}”</Text>
              <Text style={st.verseRef}>— {msg.verse_ref}</Text>
            </View>

            <Text style={st.parableLbl}>HISTÓRIA</Text>
            <Text style={st.parable}>{msg.parable}</Text>

            <View style={st.divider} />
            <Text style={[st.closing, { color }]}>{msg.closing}</Text>
          </View>
        ) : (
          <View style={st.emptyCard}>
            <Text style={st.emptyTxt}>Não foi possível carregar a mensagem agora.</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#111" },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headTitle: { color: SILVER, fontSize: 12, fontWeight: "900", letterSpacing: 2.5 },

  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1, borderColor: "#1E1E1E", backgroundColor: "#0B0B0B", maxWidth: 200 },
  chipTxt: { color: "#BBB", fontSize: 12, fontWeight: "700", maxWidth: 170 },

  card: { backgroundColor: "#0A0A0A", borderWidth: 1, borderRadius: 18, padding: 22 },
  dayLbl: { color: "#888", fontSize: 10, fontWeight: "900", letterSpacing: 1.8, marginBottom: 10 },
  goalTag: { alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  goalTagTxt: { fontSize: 10.5, fontWeight: "900", letterSpacing: 1.4 },

  headline: { color: "#FFF", fontSize: 20, fontWeight: "800", lineHeight: 27, marginTop: 18 },
  focus: { color: "#D6D6D6", fontSize: 14.5, lineHeight: 21, marginTop: 10 },

  verseBox: { borderLeftWidth: 2, paddingLeft: 14, marginTop: 20, marginBottom: 4 },
  verseTxt: { color: "#E8E8E8", fontSize: 14.5, fontStyle: "italic", lineHeight: 22 },
  verseRef: { color: "#888", fontSize: 11.5, fontWeight: "700", marginTop: 6 },

  parableLbl: { color: "#888", fontSize: 10, fontWeight: "900", letterSpacing: 1.8, marginTop: 22, marginBottom: 6 },
  parable: { color: "#C8C8C8", fontSize: 13.5, lineHeight: 20 },

  divider: { height: 1, backgroundColor: "rgba(255,255,255,0.08)", marginTop: 20, marginBottom: 16 },
  closing: { fontSize: 15, fontWeight: "700", lineHeight: 22 },

  emptyCard: { backgroundColor: "#0A0A0A", borderWidth: 1, borderColor: "#1A1A1A", borderRadius: 16,
    padding: 30, alignItems: "center", gap: 12 },
  emptyTitle: { color: "#FFF", fontSize: 15, fontWeight: "800" },
  emptyTxt: { color: "#888", fontSize: 13, textAlign: "center" },
  goBtn: { marginTop: 10, paddingHorizontal: 20, paddingVertical: 12, backgroundColor: SILVER, borderRadius: 10 },
  goBtnTxt: { color: "#000", fontWeight: "900", letterSpacing: 1.2, fontSize: 12 },

  wait: { color: "#888", fontSize: 12, marginTop: 12 },
});

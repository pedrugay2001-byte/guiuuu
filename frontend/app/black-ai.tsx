import { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "../src/icons";
import { api, Goal, GoalDashboard } from "../src/api";
import { useGate } from "../src/gate";
import ScreenHeader from "../src/screen-header";

const GOLD = "#F5C150";
const SILVER = "#C0C0C0";
const GREEN = "#2ECC71";
const RED = "#FF5B5B";
const BLUE = "#7FD7E5";
const BG = "#050505";
const CARD = "#0C0C0C";
const INNER = "#121212";

type ChatMsg = { id: string; sender: "member" | "ai"; text: string; ts: number };

const TYPE_ICON: Record<string, string> = {
  weight: "scale-bathroom", fitness: "scale-bathroom",
  financial: "cash-multiple", habit: "repeat-variant",
  behavior: "meditation", productivity: "briefcase",
};

function statusLabel(s: string) {
  if (s === "ahead") return { text: "Adiantado", color: GREEN };
  if (s === "on_track") return { text: "No ritmo", color: BLUE };
  if (s === "slightly_behind") return { text: "Levemente atrasado", color: "#E8C96B" };
  if (s === "behind") return { text: "Atrasado", color: RED };
  return { text: "—", color: "#888" };
}

export default function BlackAIScreen() {
  const router = useRouter();
  const { member } = useGate();

  const [dashboard, setDashboard] = useState<GoalDashboard | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const scrollRef = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    if (!member) return;
    try {
      const [d, g] = await Promise.all([
        api.goalsDashboard(member.member_id).catch(() => null),
        api.goalsList(member.member_id).catch(() => []),
      ]);
      setDashboard(d);
      setGoals(g || []);
    } finally { setLoading(false); }
  }, [member]);

  useEffect(() => { load(); }, [load]);

  // Mensagem inicial da IA contextual
  useEffect(() => {
    if (loading || messages.length > 0) return;
    const hasGoals = (goals?.length || 0) > 0;
    const welcome = hasGoals
      ? `Olá ${member?.nickname || "membro"}! Sou a BLACK AI. Analisei suas ${goals.length} ${goals.length === 1 ? "meta" : "metas"} e estou pronto para te ajudar. Pergunte o que quiser sobre sua evolução.`
      : `Olá! Sou a BLACK AI. Você ainda não tem metas ativas. Que tal começar criando sua primeira meta? Posso te guiar.`;
    setMessages([{ id: "welcome", sender: "ai", text: welcome, ts: Date.now() }]);
  }, [loading, goals.length, member, messages.length]);

  const send = async () => {
    const txt = input.trim();
    if (!txt || !member || sending) return;
    setInput("");
    const userMsg: ChatMsg = { id: `u_${Date.now()}`, sender: "member", text: txt, ts: Date.now() };
    setMessages((m) => [...m, userMsg]);
    setSending(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);

    // Contexto: injeta status das metas para a IA ter visão real do membro
    const ctx = goals.length > 0
      ? `Contexto do membro (dados reais em tempo real):\n${goals.map(g =>
          `- ${g.title} (${g.type}): ${Math.round(g.progress_pct)}% · ritmo ${g.rhythm > 0 ? "+" : ""}${g.rhythm.toFixed(1)}% · ${g.days_remaining} dias restantes · status: ${g.rhythm_status}`
        ).join("\n")}\n\nPergunta: ${txt}`
      : txt;

    try {
      const r = await api.aiChat(member.member_id, ctx, "performance");
      const reply = (r?.reply || "Não consegui responder agora. Tente novamente.").trim();
      setMessages((m) => [...m, { id: `a_${Date.now()}`, sender: "ai", text: reply, ts: Date.now() }]);
    } catch (e: any) {
      setMessages((m) => [...m, {
        id: `a_${Date.now()}`, sender: "ai",
        text: "Ocorreu um problema ao falar com a BLACK AI. Tente novamente.", ts: Date.now(),
      }]);
    } finally {
      setSending(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: BG, justifyContent: "center" }}>
        <ActivityIndicator color={GOLD} size="large" />
      </View>
    );
  }

  const stats = {
    active: dashboard?.active_count || 0,
    progress: Math.round(dashboard?.overall_progress || 0),
    rhythm: Math.round(dashboard?.avg_rhythm || 0),
    weekly: dashboard?.weekly_delta || 0,
  };

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="BLACK AI" />
      <SafeAreaView style={{ flex: 1 }} edges={["bottom"]}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
        >
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={{ padding: 14, paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}
          >
            {/* HERO — BLACK AI + análise rápida */}
            <View style={s.hero}>
              <View style={s.heroIcon}>
                <MaterialCommunityIcons name="brain" size={32} color={SILVER} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={s.heroLabelRow}>
                  <Text style={s.heroLbl}>ASSISTENTE BLACK</Text>
                  <View style={s.aiBadge}><Text style={s.aiBadgeTxt}>AI</Text></View>
                </View>
                <Text style={s.heroTitle}>Análise detalhada das suas metas</Text>
                <Text style={s.heroSub}>Dados reais · insights personalizados</Text>
              </View>
            </View>

            {/* STATS row */}
            <View style={s.statsRow}>
              <StatBox label="METAS" value={String(stats.active)} color={GOLD} />
              <StatBox label="PROGRESSO" value={`${stats.progress}%`} color={GREEN} />
              <StatBox label="RITMO" value={`${stats.rhythm > 0 ? "+" : ""}${stats.rhythm}%`}
                color={stats.rhythm >= 0 ? GREEN : RED} />
              <StatBox label="SEMANA" value={`${stats.weekly > 0 ? "+" : ""}${stats.weekly}%`}
                color={stats.weekly >= 0 ? GREEN : RED} />
            </View>

            {/* PROJETOS DETALHADOS */}
            <Text style={s.sectionLbl}>PROJETOS DETALHADOS</Text>

            {goals.length === 0 ? (
              <View style={s.emptyCard}>
                <MaterialCommunityIcons name="flag-outline" size={28} color="#666" />
                <Text style={s.emptyTxt}>Nenhuma meta ativa</Text>
                <TouchableOpacity
                  style={s.emptyBtn}
                  onPress={() => router.push("/(tabs)/performance")}
                  activeOpacity={0.85}
                >
                  <Text style={s.emptyBtnTxt}>Criar primeira meta</Text>
                </TouchableOpacity>
              </View>
            ) : (
              goals.map((g) => {
                const color = g.color || "#F5C150";
                const stt = statusLabel(g.rhythm_status);
                return (
                  <TouchableOpacity
                    key={g.goal_id}
                    style={[s.goalCard, { borderColor: `${color}35` }]}
                    onPress={() => router.push("/(tabs)/performance" as any)}
                    activeOpacity={0.9}
                    testID={`goal-card-${g.goal_id}`}
                  >
                    <View style={s.goalHead}>
                      <View style={[s.goalIcon, { backgroundColor: `${color}22`, borderColor: `${color}55` }]}>
                        <MaterialCommunityIcons name={(TYPE_ICON[g.type] || "target") as any} size={18} color={color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.goalTitle} numberOfLines={1}>{g.title}</Text>
                        <Text style={[s.goalStatus, { color: stt.color }]}>{stt.text}</Text>
                      </View>
                      <Text style={[s.goalPct, { color }]}>{Math.round(g.progress_pct)}%</Text>
                    </View>
                    {/* Progress bar */}
                    <View style={s.progressTrack}>
                      <View style={[s.progressFill, {
                        width: `${Math.max(0, Math.min(100, g.progress_pct))}%`,
                        backgroundColor: color,
                      }]} />
                    </View>
                    <View style={s.goalMeta}>
                      <View style={s.metaItem}>
                        <Ionicons name="trending-up" size={12} color={g.rhythm >= 0 ? GREEN : RED} />
                        <Text style={[s.metaTxt, { color: g.rhythm >= 0 ? GREEN : RED }]}>
                          {g.rhythm > 0 ? "+" : ""}{g.rhythm.toFixed(1)}%
                        </Text>
                      </View>
                      <View style={s.metaItem}>
                        <Ionicons name="calendar-outline" size={12} color="#888" />
                        <Text style={s.metaTxt}>{g.days_remaining}d</Text>
                      </View>
                      {g.is_regressing && (
                        <View style={s.metaItem}>
                          <Ionicons name="warning" size={12} color={RED} />
                          <Text style={[s.metaTxt, { color: RED }]}>REGRESSÃO</Text>
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })
            )}

            {/* CHAT com a IA */}
            <Text style={[s.sectionLbl, { marginTop: 20 }]}>CONVERSA COM A IA</Text>
            <View style={s.chatBox}>
              {messages.map((m) => (
                <View key={m.id} style={[s.msgRow, m.sender === "member" ? s.msgMine : s.msgAi]}>
                  {m.sender === "ai" && (
                    <View style={s.msgAiIcon}>
                      <MaterialCommunityIcons name="brain" size={14} color={SILVER} />
                    </View>
                  )}
                  <View style={[
                    s.msgBubble,
                    m.sender === "member" ? s.bubbleMine : s.bubbleAi,
                  ]}>
                    <Text style={[s.msgTxt, m.sender === "member" && { color: "#000" }]}>{m.text}</Text>
                  </View>
                </View>
              ))}
              {sending && (
                <View style={[s.msgRow, s.msgAi]}>
                  <View style={s.msgAiIcon}>
                    <MaterialCommunityIcons name="brain" size={14} color={SILVER} />
                  </View>
                  <View style={[s.msgBubble, s.bubbleAi]}>
                    <ActivityIndicator size="small" color={SILVER} />
                  </View>
                </View>
              )}
            </View>
          </ScrollView>

          {/* INPUT */}
          <View style={s.inputBar}>
            <TextInput
              style={s.input}
              placeholder="Pergunte à BLACK AI..."
              placeholderTextColor="#666"
              value={input}
              onChangeText={setInput}
              multiline
              maxLength={500}
              editable={!sending}
              testID="black-ai-input"
            />
            <TouchableOpacity
              style={[s.sendBtn, (!input.trim() || sending) && { opacity: 0.4 }]}
              disabled={!input.trim() || sending}
              onPress={send}
              activeOpacity={0.85}
              testID="black-ai-send"
            >
              <Ionicons name="send" size={18} color="#000" />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

function StatBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={s.statBox}>
      <Text style={s.statLbl}>{label}</Text>
      <Text style={[s.statVal, { color }]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  hero: {
    flexDirection: "row", alignItems: "center", gap: 14,
    backgroundColor: CARD, borderWidth: 1, borderColor: "rgba(200,200,200,0.2)",
    borderRadius: 16, padding: 14, marginBottom: 14,
  },
  heroIcon: {
    width: 58, height: 58, borderRadius: 29,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(200,200,200,0.08)",
    borderWidth: 1, borderColor: "rgba(200,200,200,0.25)",
  },
  heroLabelRow: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 4 },
  heroLbl: { color: SILVER, fontSize: 10.5, fontWeight: "900", letterSpacing: 1.3 },
  aiBadge: {
    width: 20, height: 20, borderRadius: 10,
    alignItems: "center", justifyContent: "center", backgroundColor: SILVER,
  },
  aiBadgeTxt: { color: "#000", fontSize: 8.5, fontWeight: "900" },
  heroTitle: { color: "#FFF", fontSize: 14, fontWeight: "800" },
  heroSub: { color: "#888", fontSize: 11, marginTop: 2 },

  statsRow: { flexDirection: "row", gap: 8, marginBottom: 18 },
  statBox: {
    flex: 1, backgroundColor: INNER,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.05)",
    borderRadius: 12, paddingVertical: 10, alignItems: "center",
  },
  statLbl: { color: "#888", fontSize: 8.5, fontWeight: "900", letterSpacing: 1.2, marginBottom: 4 },
  statVal: { fontSize: 16, fontWeight: "900" },

  sectionLbl: {
    color: "#B5B5B5", fontSize: 11, fontWeight: "900",
    letterSpacing: 2.2, marginBottom: 10, paddingHorizontal: 2,
  },

  goalCard: {
    backgroundColor: CARD, borderWidth: 1,
    borderRadius: 14, padding: 12, marginBottom: 10,
  },
  goalHead: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  goalIcon: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: "center", justifyContent: "center", borderWidth: 1,
  },
  goalTitle: { color: "#FFF", fontSize: 14, fontWeight: "800" },
  goalStatus: { fontSize: 11, fontWeight: "700", marginTop: 1 },
  goalPct: { fontSize: 18, fontWeight: "900" },
  progressTrack: {
    height: 6, borderRadius: 3, backgroundColor: "#1A1A1A",
    overflow: "hidden", marginBottom: 10,
  },
  progressFill: { height: "100%", borderRadius: 3 },
  goalMeta: { flexDirection: "row", gap: 14 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaTxt: { color: "#888", fontSize: 11, fontWeight: "700" },

  emptyCard: {
    backgroundColor: CARD, borderRadius: 14,
    padding: 22, alignItems: "center", gap: 10, marginBottom: 10,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.06)",
  },
  emptyTxt: { color: "#888", fontSize: 13, fontWeight: "600" },
  emptyBtn: {
    marginTop: 6, paddingHorizontal: 18, paddingVertical: 10,
    borderRadius: 10, backgroundColor: GOLD,
  },
  emptyBtnTxt: { color: "#000", fontSize: 12, fontWeight: "800", letterSpacing: 0.5 },

  // CHAT
  chatBox: { gap: 10, paddingBottom: 8 },
  msgRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  msgAi: { justifyContent: "flex-start" },
  msgMine: { justifyContent: "flex-end", alignSelf: "flex-end" },
  msgAiIcon: {
    width: 26, height: 26, borderRadius: 13,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(200,200,200,0.12)",
    borderWidth: 1, borderColor: "rgba(200,200,200,0.25)",
  },
  msgBubble: {
    maxWidth: "78%", paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 14,
  },
  bubbleAi: { backgroundColor: "#151515", borderBottomLeftRadius: 4 },
  bubbleMine: { backgroundColor: GOLD, borderBottomRightRadius: 4 },
  msgTxt: { color: "#EEE", fontSize: 13.5, lineHeight: 19 },

  // INPUT
  inputBar: {
    flexDirection: "row", alignItems: "flex-end", gap: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: "#151515", backgroundColor: BG,
  },
  input: {
    flex: 1, color: "#FFF", fontSize: 14,
    backgroundColor: "#0F0F0F", borderWidth: 1, borderColor: "#222",
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10,
    maxHeight: 100,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: "center", justifyContent: "center", backgroundColor: GOLD,
  },
});

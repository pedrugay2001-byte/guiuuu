import { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Modal, KeyboardAvoidingView, Platform,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter, useFocusEffect } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Svg, { Circle, Path, Defs, LinearGradient, Stop } from "react-native-svg";
import { api, Goal, GoalDashboard, GoalType, WhatToDoReply } from "../../src/api";
import { useGate } from "../../src/gate";
import { notify } from "../../src/alerts";

const GOLD = "#F5C150";
const GREEN = "#2ECC71";
const RED = "#FF5B5B";
const BLUE = "#7FD7E5";

const TYPE_META: Record<GoalType, { label: string; icon: string; color: string; unitHint: string }> = {
  fitness:      { label: "Fitness",       icon: "dumbbell",     color: "#FF6B35", unitHint: "kg" },
  financial:    { label: "Financeiro",    icon: "cash-multiple", color: GREEN,    unitHint: "R$" },
  habit:        { label: "Hábitos",       icon: "brain",        color: "#B794F4", unitHint: "dias" },
  productivity: { label: "Produtividade", icon: "briefcase",    color: BLUE,     unitHint: "h" },
};

function statusLabel(s: string): { text: string; color: string } {
  if (s === "ahead") return { text: "🟢 Adiantado", color: GREEN };
  if (s === "on_track") return { text: "🔵 No ritmo", color: BLUE };
  if (s === "slightly_behind") return { text: "🟡 Levemente atrasado", color: "#E8C96B" };
  if (s === "behind") return { text: "🔴 Atrasado", color: RED };
  return { text: "—", color: "#888" };
}

export default function PerformanceTab() {
  const router = useRouter();
  const { member } = useGate();
  const { width } = useWindowDimensions();
  const [dashboard, setDashboard] = useState<GoalDashboard | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [whatToDo, setWhatToDo] = useState<WhatToDoReply | null>(null);
  const [wtdLoading, setWtdLoading] = useState(false);
  const [wtdGoalId, setWtdGoalId] = useState<string | null>(null);
  const [progressModal, setProgressModal] = useState<Goal | null>(null);

  const load = useCallback(async () => {
    if (!member) return;
    try {
      const [d, g] = await Promise.all([
        api.goalsDashboard(member.member_id),
        api.goalsList(member.member_id),
      ]);
      setDashboard(d); setGoals(g);
    } catch (e: any) {
      console.log("performance load", e?.message);
    } finally { setLoading(false); }
  }, [member]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openWhatToDo = async (goal: Goal) => {
    setWtdGoalId(goal.goal_id);
    setWtdLoading(true);
    setWhatToDo(null);
    try {
      const r = await api.goalWhatToDo(goal.goal_id);
      setWhatToDo(r);
    } catch (e: any) {
      notify("Erro", "Não foi possível gerar sugestões agora.");
      setWtdGoalId(null);
    } finally { setWtdLoading(false); }
  };

  const W = Math.min(width, 480);

  if (loading) {
    return (
      <View style={st.loadWrap}><ActivityIndicator color={GOLD} size="large" /></View>
    );
  }

  const hasGoals = (goals?.length || 0) > 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#050505" }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>

        {/* DASHBOARD HERO */}
        <View style={st.hero}>
          <View style={st.heroHead}>
            <Text style={st.heroKicker}>CENTRAL DE PERFORMANCE</Text>
          </View>
          <Text style={st.heroTitle}>
            {dashboard?.has_goals
              ? `Score ${dashboard.score}/100`
              : "Comece sua evolução"}
          </Text>
          <Text style={st.heroSub}>{dashboard?.message || "—"}</Text>

          {dashboard?.has_goals && (
            <View style={st.heroStats}>
              <View style={st.heroStat}>
                <Text style={st.heroStatVal}>{dashboard.active_count}</Text>
                <Text style={st.heroStatLbl}>METAS</Text>
              </View>
              <View style={st.hSep} />
              <View style={st.heroStat}>
                <Text style={st.heroStatVal}>{dashboard.overall_progress}%</Text>
                <Text style={st.heroStatLbl}>PROGRESSO</Text>
              </View>
              <View style={st.hSep} />
              <View style={st.heroStat}>
                <Text style={[st.heroStatVal, { color: dashboard.avg_rhythm >= 0 ? GREEN : RED }]}>
                  {dashboard.avg_rhythm > 0 ? "+" : ""}{dashboard.avg_rhythm}%
                </Text>
                <Text style={st.heroStatLbl}>RITMO</Text>
              </View>
            </View>
          )}
        </View>

        {/* CREATE BUTTON */}
        <TouchableOpacity style={st.createBtn} onPress={() => setCreateOpen(true)} activeOpacity={0.9} testID="create-goal">
          <Ionicons name="add-circle" size={18} color="#000" />
          <Text style={st.createTxt}>{hasGoals ? "NOVA META" : "CRIAR MINHA PRIMEIRA META"}</Text>
        </TouchableOpacity>

        {!hasGoals && <EmptyExplainer />}

        {/* GOALS LIST */}
        {hasGoals && (
          <View style={{ marginTop: 24, gap: 14 }}>
            <Text style={st.sectionLbl}>SUAS METAS</Text>
            {goals.map((g) => (
              <GoalCard
                key={g.goal_id}
                goal={g}
                onWhatToDo={() => openWhatToDo(g)}
                onRegister={() => setProgressModal(g)}
                onArchive={async () => {
                  try { await api.goalArchive(g.goal_id); load(); notify("Meta arquivada"); } catch {}
                }}
                width={W - 32}
              />
            ))}
          </View>
        )}
      </ScrollView>

      {/* CREATE MODAL */}
      <Modal visible={createOpen} animationType="slide" transparent>
        <CreateGoalForm
          memberId={member?.member_id || ""}
          onClose={() => setCreateOpen(false)}
          onSaved={() => { setCreateOpen(false); load(); }}
        />
      </Modal>

      {/* WHAT TO DO MODAL */}
      <Modal visible={!!wtdGoalId} animationType="fade" transparent onRequestClose={() => setWtdGoalId(null)}>
        <View style={st.modalBackdrop}>
          <View style={st.modalCard}>
            <View style={st.wtdHead}>
              <MaterialCommunityIcons name="brain" size={26} color={GOLD} />
              <Text style={st.wtdTitle}>O QUE FAZER HOJE</Text>
              <TouchableOpacity onPress={() => setWtdGoalId(null)}>
                <Ionicons name="close" size={22} color="#FFF" />
              </TouchableOpacity>
            </View>
            {wtdLoading ? (
              <View style={{ padding: 30, alignItems: "center" }}><ActivityIndicator color={GOLD} /></View>
            ) : whatToDo ? (
              <>
                <Text style={st.wtdHeadline}>{whatToDo.headline}</Text>
                {whatToDo.actions?.map((a, i) => (
                  <View key={i} style={st.wtdAction}>
                    <View style={st.wtdDot}><Text style={st.wtdDotTxt}>{i + 1}</Text></View>
                    <Text style={st.wtdActionTxt}>{a}</Text>
                  </View>
                ))}
                {whatToDo.warning ? (
                  <View style={st.wtdWarn}>
                    <Ionicons name="warning" size={14} color={RED} />
                    <Text style={st.wtdWarnTxt}>{whatToDo.warning}</Text>
                  </View>
                ) : null}
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* REGISTER PROGRESS MODAL */}
      <Modal visible={!!progressModal} animationType="slide" transparent onRequestClose={() => setProgressModal(null)}>
        {progressModal && (
          <RegisterProgressForm
            goal={progressModal}
            onClose={() => setProgressModal(null)}
            onSaved={() => { setProgressModal(null); load(); }}
          />
        )}
      </Modal>
    </SafeAreaView>
  );
}

/* ------------------- SUB-COMPONENTS ------------------- */

function EmptyExplainer() {
  return (
    <View style={st.explainer}>
      <Text style={st.explainerKicker}>O QUE VOCÊ VAI CONSEGUIR</Text>
      <ExplainRow icon="target"                  txt="Definir metas com prazo e acompanhar progresso em tempo real" />
      <ExplainRow icon="speedometer"             txt="Análise de ritmo: adiantado / no ritmo / atrasado" />
      <ExplainRow icon="chart-timeline-variant"  txt="Gráficos de evolução e previsão inteligente" />
      <ExplainRow icon="brain"                   txt="Sugestões diárias geradas pela BLACK AI" />
      <ExplainRow icon="medal"                   txt="Score geral de performance (0-100)" />
    </View>
  );
}
function ExplainRow({ icon, txt }: { icon: string; txt: string }) {
  return (
    <View style={st.exRow}>
      <View style={st.exIcon}><MaterialCommunityIcons name={icon as any} size={16} color={GOLD} /></View>
      <Text style={st.exTxt}>{txt}</Text>
    </View>
  );
}

function GoalCard({ goal, onWhatToDo, onRegister, onArchive, width }:
  { goal: Goal; onWhatToDo: () => void; onRegister: () => void; onArchive: () => void; width: number }) {
  const meta = TYPE_META[goal.type];
  const st_ = statusLabel(goal.rhythm_status);
  return (
    <View style={st.gCard}>
      <View style={st.gHead}>
        <View style={[st.gIcon, { borderColor: `${meta.color}55` }]}>
          <MaterialCommunityIcons name={meta.icon as any} size={20} color={meta.color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={st.gTitle} numberOfLines={1}>{goal.title}</Text>
          <Text style={st.gMeta}>{meta.label} · {st_.text}</Text>
        </View>
      </View>

      <View style={st.gBar}>
        <View style={[st.gBarFill, { width: `${goal.progress_pct}%` }]} />
      </View>

      <View style={st.gNums}>
        <View>
          <Text style={st.gNumLbl}>PROGRESSO</Text>
          <Text style={st.gNumVal}>{goal.progress_pct}%</Text>
        </View>
        <View>
          <Text style={st.gNumLbl}>ATUAL</Text>
          <Text style={st.gNumVal}>{goal.current_value} {goal.unit}</Text>
        </View>
        <View>
          <Text style={st.gNumLbl}>META</Text>
          <Text style={st.gNumVal}>{goal.target_value} {goal.unit}</Text>
        </View>
        <View>
          <Text style={st.gNumLbl}>FALTAM</Text>
          <Text style={st.gNumVal}>{goal.days_remaining}d</Text>
        </View>
      </View>

      <View style={st.gBtnRow}>
        <TouchableOpacity style={st.gBtnGhost} onPress={onRegister} activeOpacity={0.85}>
          <Ionicons name="add" size={14} color="#EEE" />
          <Text style={st.gBtnGhostTxt}>Registrar progresso</Text>
        </TouchableOpacity>
        <TouchableOpacity style={st.gBtnGold} onPress={onWhatToDo} activeOpacity={0.88}>
          <MaterialCommunityIcons name="star-four-points" size={12} color="#000" />
          <Text style={st.gBtnGoldTxt}>HOJE</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function CreateGoalForm({ memberId, onClose, onSaved }: { memberId: string; onClose: () => void; onSaved: () => void }) {
  const [type, setType] = useState<GoalType>("fitness");
  const [title, setTitle] = useState("");
  const [current, setCurrent] = useState("");
  const [target, setTarget] = useState("");
  const [unit, setUnit] = useState(TYPE_META.fitness.unitHint);
  const [endDate, setEndDate] = useState<string>(() => {
    const d = new Date(); d.setDate(d.getDate() + 90);
    return d.toISOString().slice(0, 10);
  });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!title.trim()) return notify("Dê um título pra sua meta.");
    const c = parseFloat(current), t = parseFloat(target);
    if (isNaN(c) || isNaN(t)) return notify("Preencha valor atual e valor meta.");
    if (!endDate) return notify("Defina a data final.");
    setSaving(true);
    try {
      await api.goalCreate({ member_id: memberId, type, title: title.trim(),
        current_value: c, target_value: t, unit: unit.trim(), end_date: endDate });
      notify("Meta criada!", "Agora é só manter o ritmo.");
      onSaved();
    } catch (e: any) {
      notify("Erro", e?.message || "Falha ao criar meta");
    } finally { setSaving(false); }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <View style={st.modalBackdrop}>
        <View style={st.createCard}>
          <View style={st.wtdHead}>
            <Text style={st.wtdTitle}>NOVA META</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color="#FFF" /></TouchableOpacity>
          </View>

          <Text style={st.inpLbl}>TIPO</Text>
          <View style={st.typeGrid}>
            {(Object.keys(TYPE_META) as GoalType[]).map((t) => {
              const m = TYPE_META[t];
              const active = type === t;
              return (
                <TouchableOpacity
                  key={t}
                  onPress={() => { setType(t); setUnit(m.unitHint); }}
                  style={[st.typeBtn, active && { borderColor: m.color, backgroundColor: `${m.color}15` }]}
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons name={m.icon as any} size={18} color={active ? m.color : "#999"} />
                  <Text style={[st.typeLbl, active && { color: "#FFF" }]}>{m.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={st.inpLbl}>TÍTULO</Text>
          <TextInput style={st.inp} value={title} onChangeText={setTitle} placeholder="Ex: Perder 8kg" placeholderTextColor="#555" />

          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={st.inpLbl}>VALOR ATUAL</Text>
              <TextInput style={st.inp} value={current} onChangeText={setCurrent} keyboardType="decimal-pad" placeholder="95" placeholderTextColor="#555" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={st.inpLbl}>META</Text>
              <TextInput style={st.inp} value={target} onChangeText={setTarget} keyboardType="decimal-pad" placeholder="87" placeholderTextColor="#555" />
            </View>
            <View style={{ width: 70 }}>
              <Text style={st.inpLbl}>UNIDADE</Text>
              <TextInput style={st.inp} value={unit} onChangeText={setUnit} placeholder="kg" placeholderTextColor="#555" />
            </View>
          </View>

          <Text style={st.inpLbl}>DATA FINAL (YYYY-MM-DD)</Text>
          <TextInput style={st.inp} value={endDate} onChangeText={setEndDate} placeholder="2025-08-30" placeholderTextColor="#555" />

          <TouchableOpacity style={[st.saveBtn, saving && { opacity: 0.5 }]} onPress={submit} disabled={saving} activeOpacity={0.88}>
            {saving ? <ActivityIndicator color="#000" /> : <Text style={st.saveTxt}>CRIAR META</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function RegisterProgressForm({ goal, onClose, onSaved }: { goal: Goal; onClose: () => void; onSaved: () => void }) {
  const [val, setVal] = useState(String(goal.current_value));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    const n = parseFloat(val);
    if (isNaN(n)) return notify("Valor inválido");
    setSaving(true);
    try {
      await api.goalAddEntry(goal.goal_id, { value: n, note });
      notify("Progresso registrado!");
      onSaved();
    } catch (e: any) { notify("Erro", e?.message || "Falha ao registrar"); }
    finally { setSaving(false); }
  };
  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <View style={st.modalBackdrop}>
        <View style={st.createCard}>
          <View style={st.wtdHead}>
            <Text style={st.wtdTitle}>REGISTRAR PROGRESSO</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color="#FFF" /></TouchableOpacity>
          </View>
          <Text style={{ color: "#888", fontSize: 12, marginBottom: 12 }}>{goal.title}</Text>

          <Text style={st.inpLbl}>VALOR ATUAL ({goal.unit})</Text>
          <TextInput style={st.inp} value={val} onChangeText={setVal} keyboardType="decimal-pad" placeholder={`${goal.current_value}`} placeholderTextColor="#555" />

          <Text style={st.inpLbl}>OBSERVAÇÃO (opcional)</Text>
          <TextInput style={[st.inp, { height: 70 }]} value={note} onChangeText={setNote} multiline placeholder="Como foi hoje?" placeholderTextColor="#555" />

          <TouchableOpacity style={[st.saveBtn, saving && { opacity: 0.5 }]} onPress={submit} disabled={saving} activeOpacity={0.88}>
            {saving ? <ActivityIndicator color="#000" /> : <Text style={st.saveTxt}>SALVAR</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

/* ------------------- STYLES ------------------- */
const st = StyleSheet.create({
  loadWrap: { flex: 1, backgroundColor: "#050505", alignItems: "center", justifyContent: "center" },

  hero: {
    backgroundColor: "#0B0B0B",
    borderWidth: 1, borderColor: "rgba(245,193,80,0.45)",
    borderRadius: 18, padding: 18, marginBottom: 16,
  },
  heroHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  heroKicker: { color: GOLD, fontSize: 10.5, fontWeight: "900", letterSpacing: 2.2 },
  heroTitle: { color: "#FFF", fontSize: 24, fontWeight: "900", marginTop: 10 },
  heroSub: { color: "#BBB", fontSize: 13, marginTop: 6, lineHeight: 17 },
  heroStats: { flexDirection: "row", marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)" },
  heroStat: { flex: 1, alignItems: "center" },
  heroStatVal: { color: "#FFF", fontSize: 20, fontWeight: "900" },
  heroStatLbl: { color: "#777", fontSize: 9, fontWeight: "900", letterSpacing: 1, marginTop: 2 },
  hSep: { width: 1, backgroundColor: "rgba(255,255,255,0.08)", marginVertical: 4 },

  createBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: GOLD, paddingVertical: 14, borderRadius: 14,
  },
  createTxt: { color: "#000", fontWeight: "900", letterSpacing: 1.5, fontSize: 12 },

  explainer: { marginTop: 22, gap: 10 },
  explainerKicker: { color: "#999", fontSize: 10.5, fontWeight: "900", letterSpacing: 2, marginBottom: 4 },
  exRow: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#0B0B0B", borderWidth: 1, borderColor: "#1A1A1A", borderRadius: 10, padding: 12 },
  exIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(245,193,80,0.1)", alignItems: "center", justifyContent: "center" },
  exTxt: { color: "#DDD", fontSize: 12.5, flex: 1, fontWeight: "500", lineHeight: 16 },

  sectionLbl: { color: "#BBB", fontSize: 10.5, fontWeight: "900", letterSpacing: 2.2 },

  gCard: { backgroundColor: "#0B0B0B", borderWidth: 1, borderColor: "#1A1A1A", borderRadius: 14, padding: 14 },
  gHead: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  gIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", borderWidth: 1, backgroundColor: "#121212" },
  gTitle: { color: "#FFF", fontSize: 14, fontWeight: "800" },
  gMeta: { color: "#888", fontSize: 11, marginTop: 2 },
  gBar: { height: 6, borderRadius: 3, backgroundColor: "#1F1F1F", overflow: "hidden", marginBottom: 12 },
  gBarFill: { height: "100%", backgroundColor: GOLD, borderRadius: 3 },
  gNums: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  gNumLbl: { color: "#666", fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  gNumVal: { color: "#EEE", fontSize: 13, fontWeight: "800", marginTop: 2 },
  gBtnRow: { flexDirection: "row", gap: 8 },
  gBtnGhost: { flex: 1.4, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: "#2A2A2A" },
  gBtnGhostTxt: { color: "#EEE", fontSize: 11, fontWeight: "700" },
  gBtnGold: { flex: 0.7, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 10, borderRadius: 10, backgroundColor: GOLD },
  gBtnGoldTxt: { color: "#000", fontSize: 11, fontWeight: "900", letterSpacing: 0.8 },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.85)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: "#0B0B0B", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36, borderTopWidth: 1, borderColor: "rgba(245,193,80,0.3)" },
  createCard: { backgroundColor: "#0B0B0B", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36, borderTopWidth: 1, borderColor: "rgba(245,193,80,0.3)" },

  wtdHead: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 },
  wtdTitle: { color: GOLD, fontSize: 12, fontWeight: "900", letterSpacing: 2, flex: 1 },
  wtdHeadline: { color: "#FFF", fontSize: 15, fontWeight: "800", lineHeight: 20, marginBottom: 14 },
  wtdAction: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 10 },
  wtdDot: { width: 22, height: 22, borderRadius: 11, backgroundColor: "rgba(245,193,80,0.15)", borderWidth: 1, borderColor: GOLD, alignItems: "center", justifyContent: "center", marginTop: 2 },
  wtdDotTxt: { color: GOLD, fontSize: 11, fontWeight: "900" },
  wtdActionTxt: { color: "#DDD", fontSize: 13, flex: 1, lineHeight: 18 },
  wtdWarn: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10, padding: 10, borderRadius: 8, backgroundColor: "rgba(255,91,91,0.1)", borderWidth: 1, borderColor: "rgba(255,91,91,0.25)" },
  wtdWarnTxt: { color: RED, fontSize: 12, flex: 1 },

  inpLbl: { color: "#999", fontSize: 10, fontWeight: "900", letterSpacing: 1.2, marginTop: 12, marginBottom: 6 },
  inp: { backgroundColor: "#121212", borderWidth: 1, borderColor: "#222", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, color: "#FFF", fontSize: 14 },
  typeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  typeBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 22, borderWidth: 1, borderColor: "#2A2A2A", backgroundColor: "#121212" },
  typeLbl: { color: "#999", fontSize: 12, fontWeight: "700" },
  saveBtn: { marginTop: 18, paddingVertical: 14, borderRadius: 12, backgroundColor: GOLD, alignItems: "center" },
  saveTxt: { color: "#000", fontWeight: "900", letterSpacing: 1.5, fontSize: 12 },
});

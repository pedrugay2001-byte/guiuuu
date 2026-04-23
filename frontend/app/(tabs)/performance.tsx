import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Modal, KeyboardAvoidingView, Platform, Image,
  useWindowDimensions, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import {
  api, Goal, GoalDashboard, GoalType, DailyMessage,
} from "../../src/api";
import { useGate } from "../../src/gate";
import { notify } from "../../src/alerts";
import { pickCompressedImage } from "../../src/imagepicker";
import CircularProgress from "../../src/performance/CircularProgress";
import LineChart from "../../src/performance/LineChart";
import PieOverview from "../../src/performance/PieOverview";
import CalendarPicker from "../../src/performance/CalendarPicker";
import EditGoalForm from "../../src/performance/EditGoalForm";
import ActionSheet, { SheetAction } from "../../src/action-sheet";

const GOLD = "#F5C150";
const GREEN = "#2ECC71";
const RED = "#FF5B5B";
const BLUE = "#7FD7E5";

const TYPE_META: Record<GoalType, { label: string; icon: string; color: string; unitHint: string; description: string }> = {
  weight:       { label: "Peso / Saúde",   icon: "scale-bathroom", color: "#2ECC71", unitHint: "kg",     description: "Acompanhe peso, medidas ou saúde física" },
  fitness:      { label: "Peso / Saúde",   icon: "scale-bathroom", color: "#2ECC71", unitHint: "kg",     description: "Acompanhe peso, medidas ou saúde física" },
  financial:    { label: "Financeiro",     icon: "cash-multiple",  color: "#F5C150", unitHint: "R$",     description: "Patrimônio, faturamento ou economia" },
  habit:        { label: "Hábitos",        icon: "repeat-variant", color: "#5DADE2", unitHint: "dias",   description: "Frequência e consistência diária" },
  behavior:     { label: "Comportamento",  icon: "meditation",     color: "#A569BD", unitHint: "/10",    description: "Equilíbrio emocional e disciplina" },
  productivity: { label: "Produtividade",  icon: "briefcase",      color: "#E67E22", unitHint: "h",      description: "Entregas, marcos e carreira" },
};

const PALETTE = ["#F5C150", "#2ECC71", "#5DADE2", "#A569BD", "#E67E22", "#FF6B9D", "#FFFFFF"];

function statusLabel(s: string): { text: string; color: string } {
  if (s === "ahead") return { text: "Adiantado", color: GREEN };
  if (s === "on_track") return { text: "No ritmo", color: BLUE };
  if (s === "slightly_behind") return { text: "Levemente atrasado", color: "#E8C96B" };
  if (s === "behind") return { text: "Atrasado", color: RED };
  return { text: "—", color: "#888" };
}

function fmtVal(v: number, unit?: string) {
  const abs = Math.abs(v);
  const isInt = Math.abs(v - Math.round(v)) < 0.01;
  const txt = isInt ? Math.round(v).toString() : v.toFixed(1);
  if (unit === "R$") return `R$ ${abs.toLocaleString("pt-BR")}`;
  return `${txt}${unit ? " " + unit : ""}`;
}

export default function PerformanceTab() {
  const { member } = useGate();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [dashboard, setDashboard] = useState<GoalDashboard | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [progressModal, setProgressModal] = useState<Goal | null>(null);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [menuGoal, setMenuGoal] = useState<Goal | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<Goal | null>(null);

  const load = useCallback(async () => {
    if (!member) return;
    try {
      const [d, g] = await Promise.all([
        api.goalsDashboard(member.member_id),
        api.goalsList(member.member_id),
      ]);
      setDashboard(d); setGoals(g);
      // mantém seleção atual se existir, caso contrário seleciona a primeira
      setSelectedId(prev => (prev && g.find(x => x.goal_id === prev)) ? prev : (g[0]?.goal_id ?? null));
    } catch (e: any) {
      console.log("performance load", e?.message);
    } finally { setLoading(false); }
  }, [member]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const selectedGoal = goals.find(g => g.goal_id === selectedId) || null;

  const W = Math.min(width, 480) - 32;

  if (loading) {
    return <View style={st.loadWrap}><ActivityIndicator color={GOLD} size="large" /></View>;
  }

  const hasGoals = (goals?.length || 0) > 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#050505" }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 80 }} showsVerticalScrollIndicator={false}>

        {/* HEADER */}
        <View style={st.headerRow}>
          <View>
            <Text style={st.kicker}>CENTRAL DE PERFORMANCE</Text>
            <Text style={st.h1}>Seu painel de evolução</Text>
          </View>
          <TouchableOpacity style={st.addBtn} onPress={() => setCreateOpen(true)} activeOpacity={0.85}>
            <Ionicons name="add" size={18} color="#000" />
          </TouchableOpacity>
        </View>

        {!hasGoals && <EmptyExplainer />}

        {hasGoals && (
          <>
            {/* SELETOR DE METAS */}
            <Text style={st.sectionLbl}>SUAS METAS</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 10, paddingVertical: 4, paddingRight: 10 }}>
              {goals.map(g => {
                const selected = g.goal_id === selectedId;
                const meta = TYPE_META[g.type];
                const color = g.color || meta.color;
                return (
                  <TouchableOpacity key={g.goal_id}
                    onPress={() => setSelectedId(g.goal_id)}
                    activeOpacity={0.85}
                    style={[st.goalChip, selected && { borderColor: color, backgroundColor: `${color}18` }]}>
                    <MaterialCommunityIcons name={meta.icon as any} size={15}
                      color={selected ? color : "#888"} />
                    <Text style={[st.goalChipTxt, selected && { color: "#FFF" }]} numberOfLines={1}>
                      {g.title}
                    </Text>
                    <View style={[st.goalChipPct, { backgroundColor: `${color}22` }]}>
                      <Text style={[st.goalChipPctTxt, { color }]}>{Math.round(g.progress_pct)}%</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* META SELECIONADA - CARD PRINCIPAL */}
            {selectedGoal && (
              <GoalDetailCard goal={selectedGoal} width={W}
                onRegister={() => setProgressModal(selectedGoal)}
                onMenu={() => setMenuGoal(selectedGoal)}
              />
            )}

            {/* MENSAGEM DO DIA - banner discreto (abre tela dedicada) */}
            {selectedGoal && (
              <TouchableOpacity
                style={st.dmBanner}
                onPress={() => router.push(`/daily-message?goalId=${selectedGoal.goal_id}` as any)}
                activeOpacity={0.85}
                testID="perf-daily-banner"
              >
                <MaterialCommunityIcons name="book-open-variant" size={20} color={selectedGoal.color || "#C0C0C0"} />
                <View style={{ flex: 1 }}>
                  <Text style={st.dmBannerTxt}>Mensagem do Dia</Text>
                  <Text style={st.dmBannerSub}>Reflexão personalizada para hoje</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#777" />
              </TouchableOpacity>
            )}

            {/* GRÁFICO DE EVOLUÇÃO */}
            {selectedGoal && (selectedGoal.history?.length ?? 0) > 0 && (
              <View style={st.card}>
                <View style={st.cardHead}>
                  <Text style={st.cardTitle}>EVOLUÇÃO</Text>
                  <Text style={st.cardSub}>Real × Ideal</Text>
                </View>
                <LineChart
                  width={W - 20}
                  height={170}
                  color={selectedGoal.color || TYPE_META[selectedGoal.type].color}
                  real={(selectedGoal.history || []).map(h => ({ date: h.date, value: h.value }))}
                  ideal={(selectedGoal.ideal_series || []).map(i => ({ date: i.date, ideal: i.ideal }))}
                />
              </View>
            )}

            {/* HISTÓRICO DE REGISTROS */}
            {selectedGoal && (
              <EntriesHistory
                goal={selectedGoal}
                onDeleted={async () => { await load(); }}
              />
            )}

            {/* RESUMO GERAL - PIZZA */}
            {goals.length >= 1 && (
              <View style={st.card}>
                <View style={st.cardHead}>
                  <Text style={st.cardTitle}>RESUMO GERAL</Text>
                  <Text style={st.cardSub}>Todas as metas</Text>
                </View>
                <View style={{ flexDirection: "row", gap: 16, alignItems: "center" }}>
                  <PieOverview
                    size={140}
                    data={goals.map(g => ({
                      label: g.title, value: g.progress_pct,
                      color: g.color || TYPE_META[g.type].color,
                    }))}
                  />
                  <View style={{ flex: 1, gap: 10 }}>
                    {goals.map(g => (
                      <View key={g.goal_id} style={st.legRow}>
                        <View style={[st.legColor, { backgroundColor: g.color || TYPE_META[g.type].color }]} />
                        <Text style={st.legName} numberOfLines={1}>{g.title}</Text>
                        <Text style={st.legPct}>{Math.round(g.progress_pct)}%</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* CREATE MODAL */}
      <Modal visible={createOpen} animationType="slide" transparent onRequestClose={() => setCreateOpen(false)}>
        <CreateGoalForm
          memberId={member?.member_id || ""}
          onClose={() => setCreateOpen(false)}
          onSaved={async (g) => {
            setCreateOpen(false);
            setSelectedId(g.goal_id);
            await load();
          }}
        />
      </Modal>

      {/* REGISTER PROGRESS MODAL */}
      <Modal visible={!!progressModal} animationType="slide" transparent onRequestClose={() => setProgressModal(null)}>
        {progressModal && (
          <RegisterProgressForm
            goal={progressModal}
            onClose={() => setProgressModal(null)}
            onSaved={async () => { setProgressModal(null); await load(); }}
          />
        )}
      </Modal>

      {/* EDIT GOAL MODAL */}
      <Modal visible={!!editingGoal} animationType="slide" transparent onRequestClose={() => setEditingGoal(null)}>
        {editingGoal && (
          <EditGoalForm
            goal={editingGoal}
            onClose={() => setEditingGoal(null)}
            onSaved={async () => { setEditingGoal(null); await load(); }}
          />
        )}
      </Modal>

      {/* ACTION SHEET — menu da meta */}
      <ActionSheet
        visible={!!menuGoal}
        title={menuGoal?.title}
        subtitle={menuGoal ? TYPE_META[menuGoal.type].label : undefined}
        onClose={() => setMenuGoal(null)}
        actions={menuGoal ? [
          { label: "Editar meta", icon: "create-outline",
            onPress: () => { const g = menuGoal; setMenuGoal(null); setTimeout(() => setEditingGoal(g), 150); } },
          { label: "Registrar progresso", icon: "add-circle-outline",
            onPress: () => { const g = menuGoal; setMenuGoal(null); setTimeout(() => setProgressModal(g), 150); } },
          { label: "Excluir meta", icon: "trash-outline", destructive: true,
            onPress: () => { const g = menuGoal; setMenuGoal(null); setTimeout(() => setConfirmArchive(g), 150); } },
        ] : []}
      />

      {/* ACTION SHEET — confirmar arquivamento */}
      <ActionSheet
        visible={!!confirmArchive}
        title="Excluir meta?"
        subtitle="Esta ação não pode ser desfeita. O histórico será perdido."
        onClose={() => setConfirmArchive(null)}
        actions={confirmArchive ? [
          { label: "Sim, excluir meta", icon: "trash", destructive: true,
            onPress: async () => {
              try {
                await api.goalArchive(confirmArchive.goal_id);
                notify("Meta excluída");
                await load();
              } catch (e: any) { notify("Erro", e?.message || "Falha"); }
            } },
        ] : []}
      />
    </SafeAreaView>
  );
}

/* ----------------------- GOAL DETAIL CARD ----------------------- */

function GoalDetailCard({ goal, width, onRegister, onMenu }:
  { goal: Goal; width: number; onRegister: () => void; onMenu: () => void }) {
  const meta = TYPE_META[goal.type];
  const color = goal.color || meta.color;
  const stt = statusLabel(goal.rhythm_status);
  const gtype = goal.type;

  const centerValue = useMemo(() => {
    if (gtype === "habit") return `${goal.done_count ?? 0}/${goal.expected_count ?? goal.target_value}`;
    if (gtype === "behavior") return `${goal.avg_score ?? goal.current_value}`;
    return `${Math.round(goal.progress_pct)}%`;
  }, [goal]);

  return (
    <View style={[st.card, { borderColor: `${color}35` }]}>
      <View style={st.cardHead}>
        <View style={[st.goalIcon, { backgroundColor: `${color}20`, borderColor: `${color}55` }]}>
          <MaterialCommunityIcons name={meta.icon as any} size={18} color={color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={st.cardTitle} numberOfLines={1}>{goal.title.toUpperCase()}</Text>
          <Text style={st.cardSub}>{meta.label} · {stt.text}</Text>
        </View>
        <TouchableOpacity onPress={onMenu} hitSlop={14} testID="goal-menu-btn">
          <Ionicons name="ellipsis-horizontal" size={20} color="#AAA" />
        </TouchableOpacity>
      </View>

      <View style={{ flexDirection: "row", marginTop: 10, gap: 14, alignItems: "center" }}>
        <CircularProgress
          size={width * 0.42}
          progress={goal.progress_pct}
          color={color}
          centerValue={centerValue}
          centerSub={gtype === "habit" ? "CHECK-INS" : gtype === "behavior" ? "MÉDIA" : "PROGRESSO"}
        />
        <View style={{ flex: 1, gap: 8 }}>
          <Stat label="Ritmo" value={`${goal.rhythm > 0 ? "+" : ""}${goal.rhythm.toFixed(1)}%`}
            color={goal.rhythm >= 0 ? GREEN : RED} />
          <Stat label="Faltam" value={`${goal.days_remaining} dias`} />
          <Stat label={gtype === "habit" ? "Sequência" : gtype === "behavior" ? "Alvo" : "Ideal hoje"}
            value={
              gtype === "habit" ? `${goal.streak ?? 0}🔥 (rec ${goal.best_streak ?? 0})` :
              gtype === "behavior" ? `${goal.target_score ?? goal.target_value}` :
              fmtVal(goal.ideal_today ?? 0, goal.unit)
            } />
        </View>
      </View>

      {/* Indicador visual de PROGRESSÃO vs REGRESSÃO (só para tipos contínuos) */}
      {(gtype === "weight" || gtype === "fitness" || gtype === "financial" || gtype === "productivity") &&
        goal.delta_from_start !== undefined && goal.delta_from_start !== 0 && (
        <View style={[st.deltaBox, { backgroundColor: goal.is_regressing ? "rgba(255,91,91,0.12)" : "rgba(46,204,113,0.12)",
          borderColor: goal.is_regressing ? "rgba(255,91,91,0.35)" : "rgba(46,204,113,0.35)" }]}>
          <Ionicons
            name={goal.is_regressing ? "trending-down" : "trending-up"}
            size={18}
            color={goal.is_regressing ? RED : GREEN}
          />
          <View style={{ flex: 1 }}>
            <Text style={[st.deltaLbl, { color: goal.is_regressing ? RED : GREEN }]}>
              {goal.is_regressing ? "REGRESSÃO" : "PROGRESSO"}
            </Text>
            <Text style={st.deltaVal}>
              {goal.is_regressing ? "Você afastou-se " : "Você avançou "}
              {fmtVal(Math.abs(goal.delta_from_start), goal.unit)}
              {" desde o início"}
            </Text>
          </View>
        </View>
      )}

      {/* Numbers detail per type */}
      <View style={[st.numbers, { borderColor: "rgba(255,255,255,0.06)" }]}>
        {gtype === "habit" ? (
          <>
            <NumBlock label="FEITOS" value={String(goal.done_count ?? 0)} />
            <NumBlock label="ESPERADOS" value={String(goal.expected_count ?? goal.target_value)} />
            <NumBlock label="DIAS" value={`${goal.days_elapsed}/${goal.days_total}`} />
          </>
        ) : gtype === "behavior" ? (
          <>
            <NumBlock label="MÉDIA" value={`${goal.avg_score ?? goal.current_value}`} />
            <NumBlock label="ALVO" value={`${goal.target_score ?? goal.target_value}`} />
            <NumBlock label="REGISTROS" value={`${goal.entries_count}`} />
          </>
        ) : (
          <>
            <NumBlock label="INÍCIO" value={fmtVal(goal.initial_value, goal.unit)} />
            <NumBlock label="ATUAL" value={fmtVal(goal.current_value, goal.unit)} color={color} />
            <NumBlock label="META" value={fmtVal(goal.target_value, goal.unit)} />
          </>
        )}
      </View>

      {/* Foto inicial (se houver) */}
      {goal.photo_initial ? (
        <View style={{ marginTop: 12 }}>
          <Text style={st.mini}>FOTO INICIAL</Text>
          <Image source={{ uri: goal.photo_initial.startsWith("data:")
            ? goal.photo_initial : `data:image/jpeg;base64,${goal.photo_initial}` }}
            style={st.photoInit} />
        </View>
      ) : null}

      <TouchableOpacity style={[st.registerBtn, { backgroundColor: color }]}
        onPress={onRegister} activeOpacity={0.9}>
        <Ionicons name="add-circle" size={16} color="#000" />
        <Text style={st.registerTxt}>REGISTRAR PROGRESSO</Text>
      </TouchableOpacity>
    </View>
  );
}

function Stat({ label, value, color = "#EEE" }: { label: string; value: string; color?: string }) {
  return (
    <View>
      <Text style={st.statLbl}>{label.toUpperCase()}</Text>
      <Text style={[st.statVal, { color }]}>{value}</Text>
    </View>
  );
}

function NumBlock({ label, value, color = "#EEE" }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ alignItems: "center", flex: 1 }}>
      <Text style={st.mini}>{label}</Text>
      <Text style={[st.numVal, { color }]}>{value}</Text>
    </View>
  );
}

/* ----------------------- CREATE GOAL FORM ----------------------- */

function CreateGoalForm({ memberId, onClose, onSaved }:
  { memberId: string; onClose: () => void; onSaved: (g: Goal) => void }) {
  const [type, setType] = useState<GoalType>("weight");
  const [title, setTitle] = useState("");
  const [initial, setInitial] = useState("");
  const [current, setCurrent] = useState("");
  const [target, setTarget] = useState("");
  const [unit, setUnit] = useState(TYPE_META.weight.unitHint);
  const [endDate, setEndDate] = useState<string>(() => {
    const d = new Date(); d.setDate(d.getDate() + 90);
    return d.toISOString().slice(0, 10);
  });
  const [color, setColor] = useState<string>(TYPE_META.weight.color);
  const [description, setDescription] = useState("");
  const [motive, setMotive] = useState("");
  const [photoInitial, setPhotoInitial] = useState<string | null>(null);
  const [showCal, setShowCal] = useState(false);
  const [saving, setSaving] = useState(false);

  const applyType = (t: GoalType) => {
    setType(t);
    const m = TYPE_META[t];
    setUnit(m.unitHint);
    setColor(m.color);
    if (t === "habit") { setInitial("0"); setCurrent("0"); }
    if (t === "behavior") { setInitial("5"); setCurrent("5"); }
  };

  const pickPhoto = async () => {
    try {
      const b64 = await pickCompressedImage({ aspect: [1, 1], quality: 0.6 });
      if (b64) setPhotoInitial(b64);
    } catch {}
  };

  const submit = async () => {
    if (!title.trim()) return notify("Dê um título pra sua meta.");
    const t = parseFloat(target);
    const c = parseFloat(current || initial);
    const i = parseFloat(initial || current);
    if (isNaN(c) || isNaN(t) || isNaN(i)) return notify("Preencha valores válidos.");
    if (!endDate) return notify("Defina a data final.");
    setSaving(true);
    try {
      const g = await api.goalCreate({
        member_id: memberId, type, title: title.trim(),
        initial_value: i, current_value: c, target_value: t,
        unit: unit.trim(), end_date: endDate,
        color, description: description.trim(), motive: motive.trim(),
        photo_initial: photoInitial,
      });
      notify("Meta criada!", "Agora é só manter o ritmo.");
      onSaved(g);
    } catch (e: any) {
      notify("Erro", e?.message || "Falha ao criar meta");
    } finally { setSaving(false); }
  };

  const prettyEnd = (() => {
    try {
      const d = new Date(endDate + "T00:00:00");
      return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
    } catch { return endDate; }
  })();

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <View style={st.modalBackdrop}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ justifyContent: "flex-end", flexGrow: 1 }}
          keyboardShouldPersistTaps="handled">
          <View style={st.createCard}>
            <View style={st.wtdHead}>
              <Text style={st.wtdTitle}>NOVA META</Text>
              <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color="#FFF" /></TouchableOpacity>
            </View>

            <Text style={st.inpLbl}>TIPO DE META</Text>
            <View style={st.typeGrid}>
              {(["weight", "financial", "habit", "behavior", "productivity"] as GoalType[]).map((t) => {
                const m = TYPE_META[t];
                const active = type === t;
                return (
                  <TouchableOpacity key={t} onPress={() => applyType(t)}
                    style={[st.typeBtn, active && { borderColor: m.color, backgroundColor: `${m.color}18` }]}
                    activeOpacity={0.8}>
                    <MaterialCommunityIcons name={m.icon as any} size={16} color={active ? m.color : "#999"} />
                    <Text style={[st.typeLbl, active && { color: "#FFF" }]}>{m.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={st.typeDesc}>{TYPE_META[type].description}</Text>

            <Text style={st.inpLbl}>TÍTULO</Text>
            <TextInput style={st.inp} value={title} onChangeText={setTitle}
              placeholder="Ex: Perder 8kg em 90 dias" placeholderTextColor="#555" />

            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={st.inpLbl}>INICIAL</Text>
                <TextInput style={st.inp} value={initial} onChangeText={setInitial}
                  keyboardType="decimal-pad" placeholder="95" placeholderTextColor="#555" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={st.inpLbl}>ATUAL</Text>
                <TextInput style={st.inp} value={current} onChangeText={setCurrent}
                  keyboardType="decimal-pad" placeholder="92" placeholderTextColor="#555" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={st.inpLbl}>META</Text>
                <TextInput style={st.inp} value={target} onChangeText={setTarget}
                  keyboardType="decimal-pad" placeholder="87" placeholderTextColor="#555" />
              </View>
              <View style={{ width: 70 }}>
                <Text style={st.inpLbl}>UNIDADE</Text>
                <TextInput style={st.inp} value={unit} onChangeText={setUnit}
                  placeholder="kg" placeholderTextColor="#555" />
              </View>
            </View>

            <Text style={st.inpLbl}>DATA FINAL</Text>
            <TouchableOpacity style={[st.inp, { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]}
              onPress={() => setShowCal(v => !v)} activeOpacity={0.8}>
              <Text style={{ color: "#FFF", fontSize: 14 }}>{prettyEnd}</Text>
              <Ionicons name="calendar" size={18} color={GOLD} />
            </TouchableOpacity>
            {showCal && (
              <View style={{ marginTop: 10 }}>
                <CalendarPicker value={endDate} onChange={(iso) => { setEndDate(iso); setShowCal(false); }}
                  minDate={new Date().toISOString().slice(0, 10)} color={color} />
              </View>
            )}

            <Text style={st.inpLbl}>COR DA META</Text>
            <View style={st.colorRow}>
              {PALETTE.map(c => (
                <TouchableOpacity key={c} onPress={() => setColor(c)}
                  style={[st.colorDot, { backgroundColor: c }, color === c && st.colorDotActive]} />
              ))}
            </View>

            <Text style={st.inpLbl}>MOTIVO (por que essa meta?)</Text>
            <TextInput style={[st.inp, { height: 60 }]} value={motive} onChangeText={setMotive}
              multiline placeholder="Ex: Quero ter saúde para brincar com meus filhos..."
              placeholderTextColor="#555" />

            <Text style={st.inpLbl}>DESCRIÇÃO (opcional)</Text>
            <TextInput style={[st.inp, { height: 50 }]} value={description} onChangeText={setDescription}
              multiline placeholder="Detalhes da sua meta" placeholderTextColor="#555" />

            <Text style={st.inpLbl}>FOTO INICIAL (antes)</Text>
            <TouchableOpacity style={st.photoBtn} onPress={pickPhoto} activeOpacity={0.85}>
              {photoInitial ? (
                <Image source={{ uri: photoInitial.startsWith("data:") ? photoInitial : `data:image/jpeg;base64,${photoInitial}` }}
                  style={st.photoBtnImg} />
              ) : (
                <>
                  <Ionicons name="camera" size={20} color="#888" />
                  <Text style={st.photoBtnTxt}>Adicionar foto</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={[st.saveBtn, { backgroundColor: color }, saving && { opacity: 0.5 }]}
              onPress={submit} disabled={saving} activeOpacity={0.88}>
              {saving ? <ActivityIndicator color="#000" /> : <Text style={st.saveTxt}>CRIAR META</Text>}
            </TouchableOpacity>
            <View style={{ height: 16 }} />
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

/* ----------------------- REGISTER PROGRESS FORM ----------------------- */

function RegisterProgressForm({ goal, onClose, onSaved }:
  { goal: Goal; onClose: () => void; onSaved: () => void }) {
  const gtype = goal.type;
  const color = goal.color || TYPE_META[gtype].color;
  const initialVal = gtype === "habit" ? "1" : gtype === "behavior" ? "7" : String(goal.current_value);
  const [val, setVal] = useState(initialVal);
  const [note, setNote] = useState("");
  const [mood, setMood] = useState<number | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const pickPhoto = async () => {
    try {
      const b64 = await pickCompressedImage({ aspect: [1, 1], quality: 0.6 });
      if (b64) setPhoto(b64);
    } catch {}
  };

  const submit = async () => {
    const n = gtype === "habit" ? 1 : parseFloat(val);
    if (isNaN(n)) return notify("Valor inválido");
    setSaving(true);
    try {
      await api.goalAddEntry(goal.goal_id, {
        value: n, note, mood: gtype === "behavior" ? mood : null, photo_base64: photo,
      });
      notify("Progresso registrado!");
      onSaved();
    } catch (e: any) { notify("Erro", e?.message || "Falha ao registrar"); }
    finally { setSaving(false); }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <View style={st.modalBackdrop}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ justifyContent: "flex-end", flexGrow: 1 }}
          keyboardShouldPersistTaps="handled">
          <View style={st.createCard}>
            <View style={st.wtdHead}>
              <Text style={[st.wtdTitle, { color }]}>REGISTRAR PROGRESSO</Text>
              <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color="#FFF" /></TouchableOpacity>
            </View>
            <Text style={{ color: "#888", fontSize: 12, marginBottom: 12 }}>{goal.title}</Text>

            {gtype === "habit" ? (
              <View style={st.habitCheck}>
                <MaterialCommunityIcons name="check-circle" size={48} color={color} />
                <Text style={st.habitTxt}>Marcar dia cumprido</Text>
                <Text style={st.habitSub}>1 check-in será adicionado para hoje</Text>
              </View>
            ) : gtype === "behavior" ? (
              <>
                <Text style={st.inpLbl}>SCORE DE HOJE (0-10)</Text>
                <View style={st.scoreRow}>
                  {Array.from({length: 11}, (_, i) => (
                    <TouchableOpacity key={i} onPress={() => setVal(String(i))}
                      style={[st.scoreBtn, String(i) === val && { backgroundColor: color }]}>
                      <Text style={[st.scoreTxt, String(i) === val && { color: "#000" }]}>{i}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={st.inpLbl}>HUMOR</Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {["😞", "😐", "🙂", "😊", "🤩"].map((emo, i) => (
                    <TouchableOpacity key={i} onPress={() => setMood(i + 1)}
                      style={[st.moodBtn, mood === i + 1 && { borderColor: color }]}>
                      <Text style={{ fontSize: 22 }}>{emo}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            ) : (
              <>
                <Text style={st.inpLbl}>VALOR ATUAL ({goal.unit})</Text>
                <TextInput style={st.inp} value={val} onChangeText={setVal}
                  keyboardType="decimal-pad" placeholder={String(goal.current_value)}
                  placeholderTextColor="#555" />
              </>
            )}

            <Text style={st.inpLbl}>OBSERVAÇÃO (opcional)</Text>
            <TextInput style={[st.inp, { height: 60 }]} value={note} onChangeText={setNote}
              multiline placeholder="Como foi hoje?" placeholderTextColor="#555" />

            {(gtype === "weight" || gtype === "fitness") && (
              <>
                <Text style={st.inpLbl}>FOTO DE PROGRESSO (opcional)</Text>
                <TouchableOpacity style={st.photoBtn} onPress={pickPhoto} activeOpacity={0.85}>
                  {photo ? (
                    <Image source={{ uri: photo.startsWith("data:") ? photo : `data:image/jpeg;base64,${photo}` }}
                      style={st.photoBtnImg} />
                  ) : (
                    <>
                      <Ionicons name="camera" size={20} color="#888" />
                      <Text style={st.photoBtnTxt}>Adicionar foto</Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity style={[st.saveBtn, { backgroundColor: color }, saving && { opacity: 0.5 }]}
              onPress={submit} disabled={saving} activeOpacity={0.88}>
              {saving ? <ActivityIndicator color="#000" /> : <Text style={st.saveTxt}>SALVAR</Text>}
            </TouchableOpacity>
            <View style={{ height: 16 }} />
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

/* ----------------------- ENTRIES HISTORY ----------------------- */

function EntriesHistory({ goal, onDeleted }:
  { goal: Goal; onDeleted: () => Promise<void> | void }) {
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const color = goal.color || TYPE_META[goal.type].color;

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const r = await api.goalEntries(goal.goal_id);
      setEntries(r.slice().reverse()); // mais recentes no topo
    } finally { setLoading(false); }
  }, [goal.goal_id]);

  useEffect(() => { load(); }, [load]);

  const doDelete = async (entryId: string) => {
    try {
      await api.goalDeleteEntry(goal.goal_id, entryId);
      setEntries(prev => prev.filter(e => e.entry_id !== entryId));
      await onDeleted();
      notify("Registro excluído");
    } catch (e: any) { notify("Erro", e?.message || "Falha ao excluir"); }
  };

  if (loading) return (
    <View style={st.card}><ActivityIndicator color={color} /></View>
  );

  return (
    <View style={st.card}>
      <View style={st.cardHead}>
        <Text style={st.cardTitle}>HISTÓRICO DE REGISTROS</Text>
        <Text style={st.cardSub}>{entries.length} {entries.length === 1 ? "registro" : "registros"}</Text>
      </View>
      {entries.length === 0 ? (
        <Text style={{ color: "#666", fontSize: 12, paddingVertical: 10, textAlign: "center" }}>
          Nenhum registro ainda.
        </Text>
      ) : (
        entries.map(e => {
          const d = new Date(e.date);
          const label = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
          const valTxt = goal.type === "habit" ? "✓ Check-in"
            : goal.type === "behavior" ? `Score ${e.value}/10`
            : fmtVal(e.value, goal.unit);
          return (
            <View key={e.entry_id} style={st.entryRow}>
              <View style={[st.entryDot, { backgroundColor: color }]} />
              <View style={{ flex: 1 }}>
                <Text style={st.entryVal}>{valTxt}</Text>
                <Text style={st.entryDate}>{label}{e.note ? ` · ${e.note}` : ""}</Text>
              </View>
              <TouchableOpacity onPress={() => setConfirmDel(e.entry_id)} hitSlop={10}>
                <Ionicons name="trash-outline" size={16} color="#FF5B5B" />
              </TouchableOpacity>
            </View>
          );
        })
      )}
      <ActionSheet
        visible={!!confirmDel}
        title="Excluir registro?"
        subtitle="Esta ação recalculará automaticamente seu progresso."
        onClose={() => setConfirmDel(null)}
        actions={confirmDel ? [
          { label: "Sim, excluir", icon: "trash", destructive: true,
            onPress: async () => { if (confirmDel) await doDelete(confirmDel); } },
        ] : []}
      />
    </View>
  );
}

/* ----------------------- EMPTY ----------------------- */

function EmptyExplainer() {
  return (
    <View style={st.explainer}>
      <Text style={st.explainerKicker}>O QUE VOCÊ VAI CONSEGUIR</Text>
      <ExplainRow icon="target" txt="Definir metas com prazo e acompanhar progresso em tempo real" />
      <ExplainRow icon="speedometer" txt="Análise de ritmo automática: adiantado / no ritmo / atrasado" />
      <ExplainRow icon="chart-timeline-variant" txt="Gráficos de evolução e previsão inteligente" />
      <ExplainRow icon="book-open" txt="Mensagem do Dia personalizada com passagem bíblica e parábola" />
      <ExplainRow icon="chart-donut" txt="Resumo geral consolidado de todas as suas metas" />
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

/* ----------------------- STYLES ----------------------- */
const st = StyleSheet.create({
  loadWrap: { flex: 1, backgroundColor: "#050505", alignItems: "center", justifyContent: "center" },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 18 },
  kicker: { color: GOLD, fontSize: 10, fontWeight: "900", letterSpacing: 2.2 },
  h1: { color: "#FFF", fontSize: 22, fontWeight: "900", marginTop: 4 },
  addBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: GOLD, alignItems: "center", justifyContent: "center" },

  sectionLbl: { color: "#BBB", fontSize: 10.5, fontWeight: "900", letterSpacing: 2.2, marginTop: 6, marginBottom: 10 },

  goalChip: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 22, borderWidth: 1, borderColor: "#1E1E1E", backgroundColor: "#0B0B0B", maxWidth: 240 },
  goalChipTxt: { color: "#BBB", fontSize: 12.5, fontWeight: "700", maxWidth: 140 },
  goalChipPct: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  goalChipPctTxt: { fontSize: 10, fontWeight: "900" },

  card: { backgroundColor: "#0B0B0B", borderWidth: 1, borderColor: "rgba(245,193,80,0.2)",
    borderRadius: 18, padding: 16, marginTop: 16 },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  cardTitle: { color: "#FFF", fontSize: 12, fontWeight: "900", letterSpacing: 1.8, flex: 1 },
  cardSub: { color: "#888", fontSize: 10.5, fontWeight: "700", letterSpacing: 1 },
  goalIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", borderWidth: 1 },

  statLbl: { color: "#777", fontSize: 9.5, fontWeight: "900", letterSpacing: 1.3 },
  statVal: { fontSize: 17, fontWeight: "800", marginTop: 1 },

  numbers: { flexDirection: "row", marginTop: 16, paddingTop: 14, borderTopWidth: 1 },
  mini: { color: "#666", fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  numVal: { fontSize: 15, fontWeight: "900", marginTop: 4 },

  photoInit: { width: 80, height: 80, borderRadius: 10, marginTop: 6, borderWidth: 1, borderColor: "#1A1A1A" },

  registerBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 12, borderRadius: 12, marginTop: 14 },
  registerTxt: { color: "#000", fontWeight: "900", letterSpacing: 1.5, fontSize: 12 },

  // Daily message
  dayLbl: { color: "#888", fontSize: 10, fontWeight: "900", letterSpacing: 1.6, marginTop: 6, marginBottom: 8 },
  goalTag: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  goalTagTxt: { fontSize: 10, fontWeight: "900", letterSpacing: 1.3 },
  headline: { color: "#FFF", fontSize: 17, fontWeight: "800", lineHeight: 23, marginTop: 12 },
  focus: { color: "#CFCFCF", fontSize: 13.5, lineHeight: 19, marginTop: 8 },
  verseBox: { borderLeftWidth: 2, borderLeftColor: "rgba(245,193,80,0.7)", paddingLeft: 12,
    marginTop: 14, marginBottom: 4 },
  verseTxt: { color: "#DDD", fontSize: 13.5, fontStyle: "italic", lineHeight: 19 },
  verseRef: { color: "#888", fontSize: 11, fontWeight: "700", marginTop: 4 },
  parable: { color: "#BBB", fontSize: 13, lineHeight: 19, marginTop: 12 },
  closing: { fontSize: 13.5, fontWeight: "700", lineHeight: 19, marginTop: 14 },

  // Legend pizza
  legRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  legColor: { width: 10, height: 10, borderRadius: 5 },
  legName: { color: "#DDD", fontSize: 12, flex: 1 },
  legPct: { color: "#EEE", fontSize: 12, fontWeight: "800" },

  // Empty
  explainer: { marginTop: 22, gap: 10 },
  explainerKicker: { color: "#999", fontSize: 10.5, fontWeight: "900", letterSpacing: 2, marginBottom: 4 },
  exRow: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#0B0B0B",
    borderWidth: 1, borderColor: "#1A1A1A", borderRadius: 10, padding: 12 },
  exIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(245,193,80,0.1)",
    alignItems: "center", justifyContent: "center" },
  exTxt: { color: "#DDD", fontSize: 12.5, flex: 1, fontWeight: "500", lineHeight: 16 },

  // Forms
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.85)" },
  createCard: { backgroundColor: "#0B0B0B", borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, paddingBottom: 16, borderTopWidth: 1, borderColor: "rgba(245,193,80,0.3)" },
  wtdHead: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 },
  wtdTitle: { color: GOLD, fontSize: 12, fontWeight: "900", letterSpacing: 2, flex: 1 },
  inpLbl: { color: "#999", fontSize: 10, fontWeight: "900", letterSpacing: 1.2, marginTop: 12, marginBottom: 6 },
  inp: { backgroundColor: "#121212", borderWidth: 1, borderColor: "#222", borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, color: "#FFF", fontSize: 14 },
  typeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  typeBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 9,
    borderRadius: 20, borderWidth: 1, borderColor: "#2A2A2A", backgroundColor: "#121212" },
  typeLbl: { color: "#999", fontSize: 11.5, fontWeight: "700" },
  typeDesc: { color: "#666", fontSize: 11, marginTop: 8, fontStyle: "italic" },
  saveBtn: { marginTop: 18, paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  saveTxt: { color: "#000", fontWeight: "900", letterSpacing: 1.5, fontSize: 12 },
  colorRow: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  colorDot: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: "#1A1A1A" },
  colorDotActive: { borderColor: "#FFF", borderWidth: 3 },
  photoBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    height: 100, borderRadius: 10, borderWidth: 1, borderStyle: "dashed", borderColor: "#2A2A2A",
    backgroundColor: "#0E0E0E", overflow: "hidden" },
  photoBtnTxt: { color: "#888", fontSize: 12, fontWeight: "700" },
  photoBtnImg: { width: "100%", height: "100%" },

  habitCheck: { alignItems: "center", gap: 10, padding: 20 },
  habitTxt: { color: "#FFF", fontSize: 15, fontWeight: "800" },
  habitSub: { color: "#888", fontSize: 12 },
  scoreRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  scoreBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: "#2A2A2A",
    alignItems: "center", justifyContent: "center", backgroundColor: "#121212" },
  scoreTxt: { color: "#CCC", fontSize: 13, fontWeight: "800" },
  moodBtn: { width: 52, height: 52, borderRadius: 26, borderWidth: 1, borderColor: "#2A2A2A",
    alignItems: "center", justifyContent: "center", backgroundColor: "#121212" },

  entryRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)" },
  entryDot: { width: 8, height: 8, borderRadius: 4 },
  entryVal: { color: "#EEE", fontSize: 13, fontWeight: "700" },
  entryDate: { color: "#777", fontSize: 11, marginTop: 2 },

  deltaBox: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14,
    paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1 },
  deltaLbl: { fontSize: 10, fontWeight: "900", letterSpacing: 1.4 },
  deltaVal: { color: "#E0E0E0", fontSize: 12.5, marginTop: 2, fontWeight: "600" },

  dmBanner: { flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1,
    borderColor: "rgba(200,200,200,0.3)", backgroundColor: "#0A0A0A", marginTop: 12 },
  dmBannerTxt: { color: "#EEE", fontSize: 13, fontWeight: "700", flex: 1 },
  dmBannerSub: { color: "#999", fontSize: 11, fontWeight: "500", marginTop: 2 },
});

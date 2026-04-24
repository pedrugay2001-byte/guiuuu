import { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image,
  ActivityIndicator, RefreshControl, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { api, GoalDetail, Goal, GoalEntry, WhatToDoReply } from "../../src/api";
import LineChart from "../../src/performance/LineChart";

const GOAL_TYPE_META: Record<string, { label: string; icon: string; color: string }> = {
  weight: { label: "Peso", icon: "weight", color: "#F59E0B" },
  fitness: { label: "Fitness", icon: "arm-flex", color: "#FF6B6B" },
  financial: { label: "Financeiro", icon: "cash", color: "#10B981" },
  habit: { label: "Hábito", icon: "check-circle", color: "#A855F7" },
  behavior: { label: "Comportamento", icon: "head-lightbulb", color: "#EC4899" },
  productivity: { label: "Produtividade", icon: "lightning-bolt", color: "#3B82F6" },
};

/**
 * Drill-down de uma meta — tudo sobre a meta em uma só tela.
 *
 * Seções:
 *   1. Hero (imagem de motivação + título + prazo)
 *   2. Cartões de métricas principais (atual, meta, progresso, dias)
 *   3. Gráfico de evolução + Comparativo 7d/30d
 *   4. Observações inteligentes (IA "O que fazer")
 *   5. Histórico completo de registros (editável/deletável)
 *   6. Descrição e motivo
 */
export default function GoalDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<GoalDetail | null>(null);
  const [whatToDo, setWhatToDo] = useState<WhatToDoReply | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const d = await api.goalDetail(id);
      setData(d);
    } catch (e: any) {
      Alert.alert("Erro", e?.message || "Não foi possível carregar a meta");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  const askAi = async () => {
    if (!id) return;
    setLoadingAi(true);
    try {
      const r = await api.goalWhatToDo(id);
      setWhatToDo(r);
    } catch (e: any) {
      Alert.alert("IA indisponível", e?.message || "Tente novamente em instantes.");
    } finally {
      setLoadingAi(false);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const deleteEntry = async (entryId: string) => {
    if (!id) return;
    Alert.alert(
      "Remover registro?",
      "Essa ação não pode ser desfeita.",
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Remover", style: "destructive", onPress: async () => {
            try { await api.goalDeleteEntry(id, entryId); load(); }
            catch (e: any) { Alert.alert("Erro", e?.message); }
          },
        },
      ],
    );
  };

  if (loading || !data) {
    return (
      <View style={{ flex: 1, backgroundColor: "#050505", justifyContent: "center" }}>
        <Stack.Screen options={{ title: "Detalhe da meta", headerStyle: { backgroundColor: "#050505" }, headerTintColor: "#FFF" }} />
        <ActivityIndicator color="#D4AF37" />
      </View>
    );
  }

  const goal = data.goal;
  const meta = GOAL_TYPE_META[goal.type] || { label: "Meta", icon: "flag", color: "#D4AF37" };
  const color = goal.color || meta.color;
  const progress = Math.max(0, Math.min(100, goal.progress || 0));
  const unit = goal.unit || "";
  const dateStr = (d: string) => new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });

  return (
    <View style={{ flex: 1, backgroundColor: "#050505" }}>
      <Stack.Screen
        options={{
          title: goal.title.toUpperCase(),
          headerStyle: { backgroundColor: "#050505" },
          headerTintColor: "#FFF",
          headerTitleStyle: { fontWeight: "900", letterSpacing: 1, fontSize: 13 },
        }}
      />
      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={color} />}
      >
        {/* 1. HERO */}
        <View style={[s.hero, { borderColor: color + "33" }]}>
          {goal.photo_initial ? (
            <Image source={{ uri: goal.photo_initial }} style={s.heroImg} />
          ) : (
            <LinearGradient
              colors={[color + "22", "#0A0A0A", "#050505"]}
              style={s.heroImg}
            >
              <MaterialCommunityIcons name={meta.icon as any} size={58} color={color + "BB"} />
            </LinearGradient>
          )}
          <View style={s.heroOverlay}>
            <View style={[s.typeBadge, { backgroundColor: color + "22", borderColor: color + "55" }]}>
              <MaterialCommunityIcons name={meta.icon as any} size={10} color={color} />
              <Text style={[s.typeBadgeTxt, { color }]}>{meta.label.toUpperCase()}</Text>
            </View>
            <Text style={s.heroTitle} numberOfLines={2}>{goal.title}</Text>
            <Text style={s.heroSub}>
              {dateStr(goal.start_date)} → {dateStr(goal.end_date)}  ·  {goal.days_remaining ?? "—"} dias restantes
            </Text>
          </View>
        </View>

        {/* 2. MÉTRICAS PRINCIPAIS — grid 2x2 */}
        <View style={s.metricsGrid}>
          <MetricCell label="ATUAL" value={fmt(goal.current_value)} unit={unit} color="#FFF" />
          <MetricCell label="META" value={fmt(goal.target_value)} unit={unit} color={color} />
          <MetricCell label="INÍCIO" value={fmt(goal.initial_value ?? 0)} unit={unit} color="#888" />
          <MetricCell label="PROGRESSO" value={`${progress.toFixed(0)}%`} unit="" color={progress >= 100 ? "#2ECC71" : color} />
        </View>

        {/* Barra de progresso grande */}
        <View style={s.progressBar}>
          <View style={[s.progressFill, { width: `${progress}%`, backgroundColor: color }]} />
        </View>

        {/* 3. GRÁFICO EVOLUÇÃO */}
        {(goal.history?.length ?? 0) > 0 && (
          <View style={s.card}>
            <View style={s.cardHead}>
              <Text style={s.cardTitle}>EVOLUÇÃO</Text>
              <Text style={s.cardSub}>Real × Ideal</Text>
            </View>
            <LineChart
              width={358}
              height={200}
              color={color}
              real={(goal.history || []).map(h => ({ date: h.date, value: h.value }))}
              ideal={(goal.ideal_series || []).map(i => ({ date: i.date, ideal: i.ideal }))}
            />
            <ComparativeRow goal={goal} />
          </View>
        )}

        {/* 4. IA — "O que fazer agora" */}
        <View style={s.card}>
          <View style={s.cardHead}>
            <MaterialCommunityIcons name="robot" size={14} color="#D4AF37" />
            <Text style={s.cardTitle}>OBSERVAÇÕES INTELIGENTES</Text>
          </View>
          {!whatToDo && (
            <TouchableOpacity style={s.aiBtn} onPress={askAi} disabled={loadingAi} testID="goal-ai-btn">
              <LinearGradient
                colors={["#F4D47A", "#D4AF37", "#8C6F1E"]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={s.aiBtnInner}
              >
                {loadingAi ? <ActivityIndicator size="small" color="#000" /> : (
                  <>
                    <Ionicons name="sparkles" size={14} color="#000" />
                    <Text style={s.aiBtnTxt}>PERGUNTAR PARA A IA</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          )}
          {whatToDo && (
            <View>
              <Text style={s.aiHeadline}>{whatToDo.headline}</Text>
              {whatToDo.actions.map((a, i) => (
                <View key={i} style={s.aiAction}>
                  <View style={[s.aiNum, { backgroundColor: color + "33" }]}>
                    <Text style={[s.aiNumTxt, { color }]}>{i + 1}</Text>
                  </View>
                  <Text style={s.aiActionTxt}>{a}</Text>
                </View>
              ))}
              {whatToDo.warning && (
                <View style={s.aiWarn}>
                  <Ionicons name="warning" size={12} color="#FF6B6B" />
                  <Text style={s.aiWarnTxt}>{whatToDo.warning}</Text>
                </View>
              )}
              <TouchableOpacity style={s.aiRefresh} onPress={() => { setWhatToDo(null); askAi(); }}>
                <Ionicons name="refresh" size={12} color="#888" />
                <Text style={s.aiRefreshTxt}>Atualizar</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* 5. HISTÓRICO */}
        <View style={s.card}>
          <View style={s.cardHead}>
            <Text style={s.cardTitle}>HISTÓRICO</Text>
            <Text style={s.cardSub}>{data.entries.length} registro(s)</Text>
          </View>
          {data.entries.length === 0 ? (
            <Text style={s.emptyTxt}>Ainda não há registros. Adicione o primeiro pela tela Metas.</Text>
          ) : (
            data.entries.map((e: GoalEntry, idx) => {
              const prev = data.entries[idx + 1]; // já ordenado desc pelo backend (mais novo primeiro)
              const delta = prev ? e.value - prev.value : 0;
              const deltaColor = delta === 0 ? "#888" : (delta > 0 ? "#2ECC71" : "#FF6B6B");
              const sign = delta > 0 ? "+" : "";
              return (
                <View key={e.entry_id} style={s.entryRow}>
                  <View style={s.entryDate}>
                    <Text style={s.entryDay}>{new Date(e.date).toLocaleDateString("pt-BR", { day: "2-digit" })}</Text>
                    <Text style={s.entryMonth}>{new Date(e.date).toLocaleDateString("pt-BR", { month: "short" }).replace(".", "").toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.entryVal}>{fmt(e.value)} {unit}</Text>
                    {!!e.note && <Text style={s.entryNote} numberOfLines={2}>{e.note}</Text>}
                  </View>
                  {prev && delta !== 0 && (
                    <Text style={[s.entryDelta, { color: deltaColor }]}>
                      {sign}{fmt(Math.abs(delta))}
                    </Text>
                  )}
                  <TouchableOpacity onPress={() => deleteEntry(e.entry_id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name="trash-outline" size={15} color="#666" />
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </View>

        {/* 6. DESCRIÇÃO E MOTIVO */}
        {(goal.description || goal.motive) && (
          <View style={s.card}>
            <View style={s.cardHead}>
              <Text style={s.cardTitle}>DETALHES</Text>
            </View>
            {!!goal.description && (
              <View style={{ marginBottom: 10 }}>
                <Text style={s.detailLbl}>Descrição</Text>
                <Text style={s.detailTxt}>{goal.description}</Text>
              </View>
            )}
            {!!goal.motive && (
              <View>
                <Text style={s.detailLbl}>Motivo</Text>
                <Text style={s.detailTxt}>{goal.motive}</Text>
              </View>
            )}
          </View>
        )}

        {/* CTA */}
        <TouchableOpacity
          style={[s.cta, { backgroundColor: color }]}
          onPress={() => router.push(`/(tabs)/performance?focus=${goal.goal_id}` as any)}
          testID="goal-register-cta"
        >
          <Ionicons name="add-circle" size={16} color="#0A0A0A" />
          <Text style={s.ctaTxt}>REGISTRAR NOVO PROGRESSO</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function fmt(n: number): string {
  const x = Number(n) || 0;
  if (Number.isInteger(x)) return String(x);
  return x.toFixed(1).replace(".0", "");
}

function MetricCell({ label, value, unit, color }: { label: string; value: string; unit: string; color: string }) {
  return (
    <View style={s.metricCell}>
      <Text style={s.metricLbl}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 3 }}>
        <Text style={[s.metricVal, { color }]}>{value}</Text>
        {!!unit && <Text style={[s.metricUnit, { color }]}>{unit}</Text>}
      </View>
    </View>
  );
}

function ComparativeRow({ goal }: { goal: Goal }) {
  const hist = (goal.history || []).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
  if (hist.length < 2) return null;
  const last = hist[hist.length - 1];
  const now = new Date(last.date).getTime();
  const DAY = 24 * 60 * 60 * 1000;
  const findOld = (ts: number) => {
    for (let i = hist.length - 1; i >= 0; i--) {
      if (new Date(hist[i].date).getTime() <= ts) return hist[i];
    }
    return null;
  };
  const week = findOld(now - 7 * DAY);
  const month = findOld(now - 30 * DAY);
  const initial = hist[0];
  const decreasingIsGood = (goal.target_value || 0) < (goal.initial_value || 0);
  const calc = (prev: { value: number } | null) => {
    if (!prev) return { d: null as number | null, pct: null as number | null };
    const d = last.value - prev.value;
    const pct = prev.value ? (d / Math.abs(prev.value)) * 100 : null;
    return { d, pct };
  };
  const colorFor = (d: number | null) => {
    if (d === null || Math.abs(d) < 0.001) return "#888";
    const improving = decreasingIsGood ? d < 0 : d > 0;
    return improving ? "#2ECC71" : "#FF6B6B";
  };
  const cells = [
    { lbl: "7 DIAS", ...calc(week) },
    { lbl: "30 DIAS", ...calc(month) },
    { lbl: "DESDE O INÍCIO", ...calc(initial) },
  ];
  return (
    <View style={s.compRow}>
      {cells.map((c, i) => (
        <View key={i} style={[s.compCell, i < cells.length - 1 && s.compBorder]}>
          <Text style={s.compLbl}>{c.lbl}</Text>
          <Text style={[s.compVal, { color: colorFor(c.d) }]}>
            {c.d === null ? "—" : `${c.d > 0 ? "+" : ""}${fmt(c.d)}`}
          </Text>
          {c.pct !== null && (
            <Text style={[s.compPct, { color: colorFor(c.d) }]}>
              {c.d !== null && c.d > 0 ? "+" : ""}{c.pct.toFixed(1)}%
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  hero: {
    marginHorizontal: 14, marginTop: 12, marginBottom: 14,
    borderRadius: 16, overflow: "hidden",
    borderWidth: 1, backgroundColor: "#0B0B0B",
  },
  heroImg: { width: "100%", height: 180, alignItems: "center", justifyContent: "center" },
  heroOverlay: { padding: 14, gap: 6 },
  typeBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 12, borderWidth: 1,
  },
  typeBadgeTxt: { fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  heroTitle: { color: "#FFF", fontSize: 18, fontWeight: "900", letterSpacing: -0.5 },
  heroSub: { color: "#999", fontSize: 11, fontWeight: "700" },

  metricsGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 14, gap: 8, marginBottom: 10 },
  metricCell: {
    flex: 1, minWidth: "47%", padding: 12, borderRadius: 10,
    backgroundColor: "#0E0E0E", borderWidth: 1, borderColor: "#1A1A1A",
  },
  metricLbl: { color: "#888", fontSize: 9, fontWeight: "900", letterSpacing: 1.5 },
  metricVal: { fontSize: 18, fontWeight: "900", marginTop: 3, letterSpacing: -0.3 },
  metricUnit: { fontSize: 11, fontWeight: "800" },

  progressBar: {
    marginHorizontal: 14, marginTop: 4, marginBottom: 18,
    height: 8, borderRadius: 4,
    backgroundColor: "#1A1A1A", overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 4 },

  card: {
    marginHorizontal: 14, marginBottom: 14, padding: 14,
    borderRadius: 14, backgroundColor: "#0B0B0B",
    borderWidth: 1, borderColor: "#171717",
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  cardTitle: { color: "#FFF", fontSize: 11, fontWeight: "900", letterSpacing: 1.5, flex: 1 },
  cardSub: { color: "#888", fontSize: 10, fontWeight: "700" },

  // Comparativo
  compRow: {
    flexDirection: "row", marginTop: 14, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: "#1A1A1A",
  },
  compCell: { flex: 1, alignItems: "center", paddingHorizontal: 6 },
  compBorder: { borderRightWidth: 1, borderRightColor: "#1A1A1A" },
  compLbl: { color: "#777", fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  compVal: { fontSize: 13, fontWeight: "900", marginTop: 4 },
  compPct: { fontSize: 10, fontWeight: "800", marginTop: 1 },

  // AI section
  aiBtn: { borderRadius: 10, overflow: "hidden" },
  aiBtnInner: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 13,
  },
  aiBtnTxt: { color: "#000", fontSize: 11.5, fontWeight: "900", letterSpacing: 1.5 },
  aiHeadline: { color: "#FFF", fontSize: 13, fontWeight: "800", lineHeight: 18, marginBottom: 12 },
  aiAction: { flexDirection: "row", gap: 10, marginBottom: 10, alignItems: "flex-start" },
  aiNum: {
    width: 22, height: 22, borderRadius: 11,
    alignItems: "center", justifyContent: "center",
  },
  aiNumTxt: { fontSize: 10, fontWeight: "900" },
  aiActionTxt: { flex: 1, color: "#D8D8D8", fontSize: 12, lineHeight: 17 },
  aiWarn: {
    flexDirection: "row", alignItems: "flex-start", gap: 6,
    marginTop: 8, padding: 10, borderRadius: 8,
    backgroundColor: "rgba(255,107,107,0.08)",
    borderWidth: 1, borderColor: "rgba(255,107,107,0.2)",
  },
  aiWarnTxt: { flex: 1, color: "#FFB7B7", fontSize: 11, lineHeight: 15 },
  aiRefresh: {
    flexDirection: "row", alignItems: "center", gap: 4,
    alignSelf: "flex-end", marginTop: 8, padding: 6,
  },
  aiRefreshTxt: { color: "#888", fontSize: 10, fontWeight: "700" },

  // Histórico
  entryRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#141414",
  },
  entryDate: {
    width: 44, alignItems: "center",
    backgroundColor: "#121212", borderRadius: 8, paddingVertical: 6,
  },
  entryDay: { color: "#FFF", fontSize: 15, fontWeight: "900", lineHeight: 17 },
  entryMonth: { color: "#888", fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  entryVal: { color: "#FFF", fontSize: 14, fontWeight: "900" },
  entryNote: { color: "#888", fontSize: 11, marginTop: 2 },
  entryDelta: { fontSize: 12, fontWeight: "900" },
  emptyTxt: { color: "#888", fontSize: 12, textAlign: "center", paddingVertical: 20 },

  // Detalhes
  detailLbl: { color: "#888", fontSize: 10, fontWeight: "900", letterSpacing: 1.2, marginBottom: 4 },
  detailTxt: { color: "#DDD", fontSize: 13, lineHeight: 19 },

  // CTA
  cta: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, marginHorizontal: 14, marginTop: 6, paddingVertical: 14,
    borderRadius: 12,
  },
  ctaTxt: { color: "#0A0A0A", fontSize: 12, fontWeight: "900", letterSpacing: 1.5 },
});

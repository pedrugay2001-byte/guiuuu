import { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, Image, ActivityIndicator,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "../icons";
import { api, Goal, GoalType } from "../api";
import { notify } from "../alerts";
import { pickCompressedImage } from "../imagepicker";
import CalendarPicker from "./CalendarPicker";

const TYPE_META: Record<GoalType, { label: string; icon: string; color: string; unitHint: string }> = {
  weight:       { label: "Peso / Saúde",   icon: "scale-bathroom", color: "#2ECC71", unitHint: "kg" },
  fitness:      { label: "Peso / Saúde",   icon: "scale-bathroom", color: "#2ECC71", unitHint: "kg" },
  financial:    { label: "Financeiro",     icon: "cash-multiple",  color: "#F5C150", unitHint: "R$" },
  habit:        { label: "Hábitos",        icon: "repeat-variant", color: "#5DADE2", unitHint: "dias" },
  behavior:     { label: "Comportamento",  icon: "meditation",     color: "#A569BD", unitHint: "/10" },
  productivity: { label: "Produtividade",  icon: "briefcase",      color: "#E67E22", unitHint: "h" },
};
const PALETTE = ["#F5C150", "#2ECC71", "#5DADE2", "#A569BD", "#E67E22", "#FF6B9D", "#FFFFFF"];

type Props = {
  goal: Goal;
  onClose: () => void;
  onSaved: (g: Goal) => void;
};

export default function EditGoalForm({ goal, onClose, onSaved }: Props) {
  const [title, setTitle] = useState(goal.title);
  const [initial, setInitial] = useState(String(goal.initial_value));
  const [current, setCurrent] = useState(String(goal.current_value));
  const [target, setTarget] = useState(String(goal.target_value));
  const [unit, setUnit] = useState(goal.unit || TYPE_META[goal.type].unitHint);
  const [endDate, setEndDate] = useState(goal.end_date?.slice(0, 10) || "");
  const [color, setColor] = useState(goal.color || TYPE_META[goal.type].color);
  const [description, setDescription] = useState(goal.description || "");
  const [motive, setMotive] = useState(goal.motive || "");
  const [photoInitial, setPhotoInitial] = useState<string | null>(goal.photo_initial || null);
  const [showCal, setShowCal] = useState(false);
  const [saving, setSaving] = useState(false);

  const pickPhoto = async () => {
    try {
      const b64 = await pickCompressedImage({ aspect: [1, 1], quality: 0.45 });
      if (b64) setPhotoInitial(b64);
    } catch {}
  };

  const submit = async () => {
    if (!title.trim()) return notify("Dê um título pra sua meta.");
    const t = parseFloat(target);
    const c = parseFloat(current);
    if (isNaN(c) || isNaN(t)) return notify("Preencha valores válidos.");
    if (!endDate) return notify("Defina a data final.");
    setSaving(true);
    try {
      const g = await api.goalUpdate(goal.goal_id, {
        title: title.trim(),
        target_value: t,
        current_value: c,
        end_date: endDate,
        color,
        description: description.trim(),
        motive: motive.trim(),
        photo_initial: photoInitial,
      });
      notify("Meta atualizada!");
      onSaved(g);
    } catch (e: any) {
      notify("Erro", e?.message || "Falha ao salvar");
    } finally { setSaving(false); }
  };

  const prettyEnd = (() => {
    try { return new Date(endDate + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }); }
    catch { return endDate; }
  })();

  const meta = TYPE_META[goal.type];

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <View style={st.backdrop}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ justifyContent: "flex-end", flexGrow: 1 }}
          keyboardShouldPersistTaps="handled">
          <View style={st.card}>
            <View style={st.head}>
              <MaterialCommunityIcons name={meta.icon as any} size={18} color={color} />
              <Text style={[st.title, { color }]}>EDITAR META</Text>
              <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color="#FFF" /></TouchableOpacity>
            </View>
            <Text style={st.subtitle}>O tipo da meta não pode ser alterado.</Text>

            <Text style={st.lbl}>TÍTULO</Text>
            <TextInput style={st.inp} value={title} onChangeText={setTitle} placeholderTextColor="#555" />

            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={st.lbl}>INICIAL</Text>
                <TextInput style={[st.inp, { opacity: 0.5 }]} value={initial} editable={false} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={st.lbl}>ATUAL</Text>
                <TextInput style={st.inp} value={current} onChangeText={setCurrent}
                  keyboardType="decimal-pad" placeholderTextColor="#555" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={st.lbl}>META</Text>
                <TextInput style={st.inp} value={target} onChangeText={setTarget}
                  keyboardType="decimal-pad" placeholderTextColor="#555" />
              </View>
            </View>

            <Text style={st.lbl}>DATA FINAL</Text>
            <TouchableOpacity style={[st.inp, { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]}
              onPress={() => setShowCal(v => !v)} activeOpacity={0.85}>
              <Text style={{ color: "#FFF", fontSize: 14 }}>{prettyEnd}</Text>
              <Ionicons name="calendar" size={18} color={color} />
            </TouchableOpacity>
            {showCal && (
              <View style={{ marginTop: 10 }}>
                <CalendarPicker value={endDate} onChange={(iso) => { setEndDate(iso); setShowCal(false); }}
                  minDate={new Date().toISOString().slice(0, 10)} color={color} />
              </View>
            )}

            <Text style={st.lbl}>COR</Text>
            <View style={st.colorRow}>
              {PALETTE.map(c => (
                <TouchableOpacity key={c} onPress={() => setColor(c)}
                  style={[st.dot, { backgroundColor: c }, color === c && st.dotActive]} />
              ))}
            </View>

            <Text style={st.lbl}>MOTIVO</Text>
            <TextInput style={[st.inp, { height: 56 }]} value={motive} onChangeText={setMotive}
              multiline placeholderTextColor="#555" placeholder="Por que essa meta é importante?" />

            <Text style={st.lbl}>DESCRIÇÃO</Text>
            <TextInput style={[st.inp, { height: 48 }]} value={description} onChangeText={setDescription}
              multiline placeholderTextColor="#555" />

            <Text style={st.lbl}>FOTO INICIAL</Text>
            <TouchableOpacity style={st.photoBtn} onPress={pickPhoto} activeOpacity={0.85}>
              {photoInitial ? (
                <Image source={{ uri: photoInitial.startsWith("data:") ? photoInitial : `data:image/jpeg;base64,${photoInitial}` }}
                  style={st.photoImg} />
              ) : (
                <><Ionicons name="camera" size={20} color="#888" /><Text style={st.photoTxt}>Adicionar foto</Text></>
              )}
            </TouchableOpacity>
            {photoInitial && (
              <TouchableOpacity onPress={() => setPhotoInitial(null)} style={{ alignSelf: "center", marginTop: 8 }}>
                <Text style={{ color: "#FF5B5B", fontSize: 12, fontWeight: "700" }}>Remover foto</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={[st.save, { backgroundColor: color }, saving && { opacity: 0.5 }]}
              onPress={submit} disabled={saving} activeOpacity={0.88}>
              {saving ? <ActivityIndicator color="#000" /> : <Text style={st.saveTxt}>SALVAR ALTERAÇÕES</Text>}
            </TouchableOpacity>
            <View style={{ height: 16 }} />
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.85)" },
  card: { backgroundColor: "#0B0B0B", borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, paddingBottom: 16, borderTopWidth: 1, borderColor: "rgba(245,193,80,0.3)" },
  head: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 4 },
  title: { fontSize: 12, fontWeight: "900", letterSpacing: 2, flex: 1 },
  subtitle: { color: "#888", fontSize: 11, fontStyle: "italic", marginBottom: 12 },
  lbl: { color: "#999", fontSize: 10, fontWeight: "900", letterSpacing: 1.2, marginTop: 12, marginBottom: 6 },
  inp: { backgroundColor: "#121212", borderWidth: 1, borderColor: "#222", borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, color: "#FFF", fontSize: 14 },
  colorRow: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  dot: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: "#1A1A1A" },
  dotActive: { borderColor: "#FFF", borderWidth: 3 },
  photoBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    height: 100, borderRadius: 10, borderWidth: 1, borderStyle: "dashed", borderColor: "#2A2A2A",
    backgroundColor: "#0E0E0E", overflow: "hidden" },
  photoTxt: { color: "#888", fontSize: 12, fontWeight: "700" },
  photoImg: { width: "100%", height: "100%" },
  save: { marginTop: 18, paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  saveTxt: { color: "#000", fontWeight: "900", letterSpacing: 1.5, fontSize: 12 },
});

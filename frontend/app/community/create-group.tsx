import { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, Image, Alert, ActivityIndicator,
  FlatList,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "../../src/icons";
import { api, CommunityMember } from "../../src/api";
import { useGate } from "../../src/gate";
import { TIERS } from "../../src/theme";
import ScreenHeader from "../../src/screen-header";

const COLORS = ["#D4AF37", "#4EE07F", "#F5C150", "#FF7A4D", "#B287FF", "#7FD7E5", "#FF6BD5"];
const ICONS = ["people", "barbell", "nutrition", "flash", "rocket", "trophy", "heart", "sparkles"];

export default function CreateGroup() {
  const router = useRouter();
  const { member } = useGate();
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [icon, setIcon] = useState(ICONS[0]);
  const [members, setMembers] = useState<CommunityMember[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!member) return;
    api.communityMembers(member.member_id).then((m) => { setMembers(m); setLoading(false); });
  }, [member]);

  const toggle = (id: string) => {
    const n = new Set(selected);
    n.has(id) ? n.delete(id) : n.add(id);
    setSelected(n);
  };

  const submit = async () => {
    if (!member) return;
    if (!name.trim()) { Alert.alert("Dê um nome ao grupo"); return; }
    setSaving(true);
    try {
      const g = await api.createCustomGroup({
        owner_id: member.member_id, name: name.trim(), description: desc.trim(),
        color, icon, invite_ids: Array.from(selected),
      });
      router.replace(`/community/group/${g.group_id}`);
    } catch (e: any) { Alert.alert("Erro", e.message); } finally { setSaving(false); }
  };

  if (loading) return <View style={{ flex: 1, backgroundColor: "#050505", justifyContent: "center" }}><ActivityIndicator color="#FFF" /></View>;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, backgroundColor: "#050505" }}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Novo Grupo" />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <View style={styles.preview}>
          <View style={[styles.pIc, { backgroundColor: color + "22", borderColor: color }]}>
            <Ionicons name={icon as any} size={24} color={color} />
          </View>
          <Text style={[styles.pName, { color }]}>{name || "Nome do grupo"}</Text>
          <Text style={styles.pCount}>{selected.size + 1} participantes</Text>
        </View>

        <Text style={styles.lbl}>NOME DO GRUPO</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Ex.: Quebrada do Shape" placeholderTextColor="#555" />

        <Text style={styles.lbl}>DESCRIÇÃO</Text>
        <TextInput style={[styles.input, { minHeight: 60, textAlignVertical: "top" }]} value={desc} onChangeText={setDesc} placeholder="Do que fala o grupo?" placeholderTextColor="#555" multiline />

        <Text style={styles.lbl}>ÍCONE</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
          {ICONS.map((ic) => (
            <TouchableOpacity key={ic} style={[styles.iconBtn, icon === ic && { borderColor: color }]} onPress={() => setIcon(ic)}>
              <Ionicons name={ic as any} size={20} color={icon === ic ? color : "#888"} />
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={styles.lbl}>COR</Text>
        <View style={styles.colorRow}>
          {COLORS.map((c) => (
            <TouchableOpacity key={c} style={[styles.colorDot, { backgroundColor: c }, color === c && styles.colorSel]} onPress={() => setColor(c)} />
          ))}
        </View>

        <Text style={[styles.lbl, { marginTop: 16 }]}>CONVIDAR MEMBROS ({selected.size})</Text>
        {members.map((m) => {
          const picked = selected.has(m.member_id);
          const tier = TIERS[m.tier] || TIERS.silver;
          return (
            <TouchableOpacity key={m.member_id} style={styles.invite} onPress={() => toggle(m.member_id)}>
              <View style={[styles.inviteAv, { borderColor: tier.color }]}>
                {m.avatar_base64 ? <Image source={{ uri: m.avatar_base64 }} style={{ width: 34, height: 34, borderRadius: 17 }} /> : (
                  <Text style={{ color: "#EEE", fontWeight: "800" }}>{m.nickname.charAt(0).toUpperCase()}</Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.inviteName}>{m.nickname}</Text>
                <Text style={styles.inviteCity}>{m.city || m.profession || "Membro"}</Text>
              </View>
              <View style={[styles.check, picked && { borderColor: color, backgroundColor: color }]}>
                {picked && <Ionicons name="checkmark" size={14} color="#000" />}
              </View>
            </TouchableOpacity>
          );
        })}

        <TouchableOpacity style={[styles.submit, { backgroundColor: color }, saving && { opacity: 0.5 }]} onPress={submit} disabled={saving} testID="create-group-submit">
          {saving ? <ActivityIndicator color="#000" /> : <Text style={styles.submitTxt}>CRIAR GRUPO</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  preview: { alignItems: "center", marginBottom: 20, padding: 20 },
  pIc: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", borderWidth: 1, marginBottom: 10 },
  pName: { fontSize: 18, fontWeight: "900" },
  pCount: { color: "#888", fontSize: 12, marginTop: 4 },

  lbl: { color: "#888", fontSize: 10, fontWeight: "900", letterSpacing: 2, marginBottom: 6, marginTop: 10 },
  input: { backgroundColor: "#121212", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, color: "#EEE", fontSize: 14, borderWidth: 1, borderColor: "#1F1F1F" },
  iconBtn: { width: 42, height: 42, borderRadius: 10, borderWidth: 1, borderColor: "#222", alignItems: "center", justifyContent: "center", marginRight: 8, backgroundColor: "#0F0F0F" },
  colorRow: { flexDirection: "row", gap: 10 },
  colorDot: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: "transparent" },
  colorSel: { borderColor: "#FFF" },

  invite: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  inviteAv: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, padding: 1, backgroundColor: "#2A2A2A", alignItems: "center", justifyContent: "center" },
  inviteName: { color: "#EEE", fontSize: 13, fontWeight: "800" },
  inviteCity: { color: "#888", fontSize: 11, marginTop: 2 },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: "#444", alignItems: "center", justifyContent: "center" },

  submit: { marginTop: 24, padding: 15, borderRadius: 10, alignItems: "center" },
  submitTxt: { color: "#000", fontSize: 12, fontWeight: "900", letterSpacing: 2 },
});

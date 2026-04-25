import { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  RefreshControl, Alert, Modal, TextInput, KeyboardAvoidingView, Platform,
  Switch,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../src/api";
import type { StaffTeamMember, StaffAuditEntry } from "../../src/api";

const ROLE_CFG: Record<string, { label: string; color: string; icon: string }> = {
  admin:      { label: "ADMINISTRADOR", color: "#FF3B30", icon: "shield-checkmark" },
  support:    { label: "SUPORTE",       color: "#F5C150", icon: "headset" },
  financeiro: { label: "FINANCEIRO",    color: "#4EE07F", icon: "cash" },
};

const ACTION_LABELS: Record<string, string> = {
  team_create:           "Conta criada",
  team_update_name:      "Nome alterado",
  team_password_change:  "Senha alterada",
  team_activate:         "Conta ativada",
  team_deactivate:       "Conta desativada",
  team_delete:           "Conta excluída",
};

/**
 * Central de Gestão de Equipe — APENAS admin.
 * - Lista contas da equipe (admin/support/financeiro)
 * - Criar nova conta, trocar senha, editar nome, ativar/desativar, excluir
 * - Histórico de ações (audit log)
 */
export default function StaffTeam() {
  const router = useRouter();
  const [tab, setTab] = useState<"team" | "audit">("team");
  const [team, setTeam] = useState<StaffTeamMember[]>([]);
  const [auditLog, setAuditLog] = useState<StaffAuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  // Modais
  const [createOpen, setCreateOpen] = useState(false);
  const [pwdTarget, setPwdTarget] = useState<StaffTeamMember | null>(null);
  const [nameTarget, setNameTarget] = useState<StaffTeamMember | null>(null);

  // Forms
  const [createForm, setCreateForm] = useState({ name: "", email: "", password: "", role: "support" as "admin" | "support" | "financeiro" });
  const [newPwd, setNewPwd] = useState("");
  const [newPwdConfirm, setNewPwdConfirm] = useState("");
  const [newName, setNewName] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === "team") {
        const res = await api.staffTeamList();
        setTeam(res.team || []);
      } else {
        const res = await api.staffTeamAuditLog(100);
        setAuditLog(res.entries || []);
      }
    } catch (e: any) {
      if (String(e.message || "").toLowerCase().includes("admin")) {
        Alert.alert("Acesso negado", "Apenas administradores podem acessar esta tela.");
        router.replace("/staff/dashboard");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tab, router]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // ===== AÇÕES =====
  const submitCreate = async () => {
    const { name, email, password, role } = createForm;
    if (name.trim().length < 2) { Alert.alert("Nome muito curto"); return; }
    if (!email.includes("@")) { Alert.alert("Email inválido"); return; }
    if (password.length < 8) { Alert.alert("Senha precisa ter pelo menos 8 caracteres"); return; }
    setBusyUserId("__create__");
    try {
      await api.staffTeamCreate({ name: name.trim(), email: email.trim().toLowerCase(), password, role });
      setCreateOpen(false);
      setCreateForm({ name: "", email: "", password: "", role: "support" });
      Alert.alert("Conta criada!", `Lembre-se de informar a senha para ${email}.`);
      load();
    } catch (e: any) {
      Alert.alert("Erro", e.message || "Falha ao criar conta");
    } finally {
      setBusyUserId(null);
    }
  };

  const submitPassword = async () => {
    if (!pwdTarget) return;
    if (newPwd.length < 8) { Alert.alert("Senha precisa ter pelo menos 8 caracteres"); return; }
    if (newPwd !== newPwdConfirm) { Alert.alert("Senhas não coincidem"); return; }
    setBusyUserId(pwdTarget.user_id);
    try {
      await api.staffTeamChangePassword(pwdTarget.user_id, newPwd);
      Alert.alert("Senha alterada!", `Anote: a senha de ${pwdTarget.email} foi atualizada.`);
      setPwdTarget(null);
      setNewPwd(""); setNewPwdConfirm("");
      load();
    } catch (e: any) {
      Alert.alert("Erro", e.message || "Falha ao alterar senha");
    } finally {
      setBusyUserId(null);
    }
  };

  const submitName = async () => {
    if (!nameTarget) return;
    if (newName.trim().length < 2) { Alert.alert("Nome muito curto"); return; }
    setBusyUserId(nameTarget.user_id);
    try {
      await api.staffTeamUpdateName(nameTarget.user_id, newName.trim());
      setNameTarget(null);
      setNewName("");
      load();
    } catch (e: any) {
      Alert.alert("Erro", e.message || "Falha ao atualizar nome");
    } finally {
      setBusyUserId(null);
    }
  };

  const toggleActive = (m: StaffTeamMember) => {
    const next = !m.active;
    Alert.alert(
      next ? "Reativar conta?" : "Desativar conta?",
      `${m.email}\n${next ? "A conta poderá fazer login novamente." : "A conta NÃO poderá mais fazer login até ser reativada."}`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: next ? "REATIVAR" : "DESATIVAR",
          style: next ? "default" : "destructive",
          onPress: async () => {
            setBusyUserId(m.user_id);
            try {
              await api.staffTeamSetActive(m.user_id, next);
              load();
            } catch (e: any) { Alert.alert("Erro", e.message); }
            finally { setBusyUserId(null); }
          },
        },
      ],
    );
  };

  const deleteAccount = (m: StaffTeamMember) => {
    Alert.alert(
      "Excluir conta?",
      `${m.email}\n\nEsta ação é PERMANENTE e não pode ser desfeita.\n\nTem certeza?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "EXCLUIR PERMANENTEMENTE",
          style: "destructive",
          onPress: async () => {
            setBusyUserId(m.user_id);
            try {
              await api.staffTeamDelete(m.user_id);
              load();
            } catch (e: any) { Alert.alert("Erro", e.message); }
            finally { setBusyUserId(null); }
          },
        },
      ],
    );
  };

  // ===== RENDER =====
  return (
    <SafeAreaView style={st.container} edges={["top", "bottom"]}>
      <Stack.Screen options={{ title: "Gestão de Equipe", headerStyle: { backgroundColor: "#050505" }, headerTintColor: "#FFF" }} />

      {/* Tabs */}
      <View style={st.tabs}>
        <TabBtn active={tab === "team"}  label="EQUIPE"    icon="people"   onPress={() => setTab("team")} />
        <TabBtn active={tab === "audit"} label="HISTÓRICO" icon="time"     onPress={() => setTab("audit")} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 14, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#FFF" />}
      >
        {loading ? (
          <ActivityIndicator color="#F5C150" style={{ marginTop: 30 }} />
        ) : tab === "team" ? (
          team.length === 0 ? (
            <Empty txt="Nenhuma conta de equipe cadastrada." />
          ) : (
            team.map((m) => (
              <TeamCard
                key={m.user_id}
                m={m}
                busy={busyUserId === m.user_id}
                onChangePwd={() => { setPwdTarget(m); setNewPwd(""); setNewPwdConfirm(""); }}
                onChangeName={() => { setNameTarget(m); setNewName(m.name); }}
                onToggleActive={() => toggleActive(m)}
                onDelete={() => deleteAccount(m)}
              />
            ))
          )
        ) : (
          auditLog.length === 0 ? <Empty txt="Sem registros no histórico ainda." /> :
          auditLog.map((e) => <AuditRow key={e.log_id} e={e} />)
        )}
      </ScrollView>

      {/* FAB — Criar nova conta (visível apenas na tab de equipe) */}
      {tab === "team" && (
        <TouchableOpacity
          style={st.fab}
          onPress={() => setCreateOpen(true)}
          activeOpacity={0.85}
          testID="team-fab-create"
        >
          <Ionicons name="add" size={26} color="#000" />
          <Text style={st.fabTxt}>NOVA CONTA</Text>
        </TouchableOpacity>
      )}

      {/* Modal CRIAR */}
      <Modal visible={createOpen} transparent animationType="slide" onRequestClose={() => setCreateOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={st.modalBg}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 20 }} keyboardShouldPersistTaps="handled">
            <View style={st.modalCard}>
              <View style={st.modalHead}>
                <Ionicons name="person-add" size={20} color="#F5C150" />
                <Text style={st.modalTitle}>Nova conta de equipe</Text>
                <TouchableOpacity onPress={() => setCreateOpen(false)} style={{ marginLeft: "auto" }}>
                  <Ionicons name="close" size={22} color="#888" />
                </TouchableOpacity>
              </View>

              <Field label="Nome completo" value={createForm.name} onChange={(v) => setCreateForm({ ...createForm, name: v })} placeholder="João da Silva" />
              <Field label="Email" value={createForm.email} onChange={(v) => setCreateForm({ ...createForm, email: v })} placeholder="email@blacksclub.com" autoCapitalize="none" keyboardType="email-address" />
              <Field label="Senha (mín. 8)" value={createForm.password} onChange={(v) => setCreateForm({ ...createForm, password: v })} placeholder="Senha forte" secure />

              <Text style={st.lbl}>PAPEL</Text>
              <View style={st.roleRow}>
                {(["support", "financeiro", "admin"] as const).map((r) => {
                  const cfg = ROLE_CFG[r];
                  const sel = createForm.role === r;
                  return (
                    <TouchableOpacity
                      key={r}
                      style={[st.roleBtn, sel && { borderColor: cfg.color, backgroundColor: cfg.color + "1A" }]}
                      onPress={() => setCreateForm({ ...createForm, role: r })}
                    >
                      <Ionicons name={cfg.icon as any} size={14} color={sel ? cfg.color : "#777"} />
                      <Text style={[st.roleBtnTxt, { color: sel ? cfg.color : "#777" }]}>{cfg.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {createForm.role === "admin" && (
                <Text style={st.warnTxt}>⚠️ Admin tem PODER TOTAL — incluindo gerenciar outros admins. Crie com cuidado.</Text>
              )}

              <View style={st.modalActions}>
                <TouchableOpacity onPress={() => setCreateOpen(false)} style={[st.modalBtn, st.modalBtnGhost]}>
                  <Text style={st.modalBtnGhostTxt}>CANCELAR</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={submitCreate} style={[st.modalBtn, { backgroundColor: "#F5C150" }]} disabled={busyUserId === "__create__"}>
                  {busyUserId === "__create__" ? <ActivityIndicator color="#000" /> : <Text style={[st.modalBtnTxt, { color: "#000" }]}>CRIAR CONTA</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal SENHA */}
      <Modal visible={!!pwdTarget} transparent animationType="fade" onRequestClose={() => setPwdTarget(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={st.modalBg}>
          <View style={[st.modalCard, { margin: 20 }]}>
            <View style={st.modalHead}>
              <Ionicons name="key" size={20} color="#F5C150" />
              <Text style={st.modalTitle}>Trocar senha</Text>
              <TouchableOpacity onPress={() => setPwdTarget(null)} style={{ marginLeft: "auto" }}>
                <Ionicons name="close" size={22} color="#888" />
              </TouchableOpacity>
            </View>
            {pwdTarget && <Text style={st.modalSub}>{pwdTarget.email}</Text>}
            <Field label="Nova senha (mín. 8)" value={newPwd} onChange={setNewPwd} placeholder="Nova senha" secure />
            <Field label="Confirmar senha" value={newPwdConfirm} onChange={setNewPwdConfirm} placeholder="Confirme" secure />
            <View style={st.modalActions}>
              <TouchableOpacity onPress={() => setPwdTarget(null)} style={[st.modalBtn, st.modalBtnGhost]}>
                <Text style={st.modalBtnGhostTxt}>CANCELAR</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={submitPassword} style={[st.modalBtn, { backgroundColor: "#F5C150" }]} disabled={busyUserId === pwdTarget?.user_id}>
                {busyUserId === pwdTarget?.user_id ? <ActivityIndicator color="#000" /> : <Text style={[st.modalBtnTxt, { color: "#000" }]}>SALVAR SENHA</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal NOME */}
      <Modal visible={!!nameTarget} transparent animationType="fade" onRequestClose={() => setNameTarget(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={st.modalBg}>
          <View style={[st.modalCard, { margin: 20 }]}>
            <View style={st.modalHead}>
              <Ionicons name="create" size={20} color="#F5C150" />
              <Text style={st.modalTitle}>Editar nome</Text>
              <TouchableOpacity onPress={() => setNameTarget(null)} style={{ marginLeft: "auto" }}>
                <Ionicons name="close" size={22} color="#888" />
              </TouchableOpacity>
            </View>
            {nameTarget && <Text style={st.modalSub}>{nameTarget.email}</Text>}
            <Field label="Novo nome" value={newName} onChange={setNewName} placeholder="Nome completo" />
            <View style={st.modalActions}>
              <TouchableOpacity onPress={() => setNameTarget(null)} style={[st.modalBtn, st.modalBtnGhost]}>
                <Text style={st.modalBtnGhostTxt}>CANCELAR</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={submitName} style={[st.modalBtn, { backgroundColor: "#F5C150" }]} disabled={busyUserId === nameTarget?.user_id}>
                {busyUserId === nameTarget?.user_id ? <ActivityIndicator color="#000" /> : <Text style={[st.modalBtnTxt, { color: "#000" }]}>SALVAR</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

// ============================================================================
function TabBtn({ active, label, icon, onPress }: { active: boolean; label: string; icon: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={[st.tab, active && st.tabActive]} onPress={onPress} activeOpacity={0.8}>
      <Ionicons name={icon as any} size={14} color={active ? "#F5C150" : "#888"} />
      <Text style={[st.tabTxt, active && { color: "#F5C150" }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function TeamCard({ m, busy, onChangePwd, onChangeName, onToggleActive, onDelete }: {
  m: StaffTeamMember; busy: boolean;
  onChangePwd: () => void; onChangeName: () => void; onToggleActive: () => void; onDelete: () => void;
}) {
  const cfg = ROLE_CFG[m.role] || ROLE_CFG.support;
  const lastPwd = m.password_changed_at
    ? new Date(m.password_changed_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })
    : "—";
  return (
    <View style={[st.card, !m.active && { opacity: 0.55 }]}>
      <View style={st.cardHead}>
        <View style={[st.roleTag, { borderColor: cfg.color, backgroundColor: cfg.color + "1A" }]}>
          <Ionicons name={cfg.icon as any} size={11} color={cfg.color} />
          <Text style={[st.roleTagTxt, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
        <View style={[st.statusDot, { backgroundColor: m.active ? "#4EE07F" : "#888" }]} />
        <Text style={[st.statusTxt, { color: m.active ? "#4EE07F" : "#888" }]}>{m.active ? "ATIVO" : "INATIVO"}</Text>
      </View>

      <Text style={st.name}>{m.name}</Text>
      <Text style={st.email}>{m.email}</Text>
      <Text style={st.meta}>Senha alterada em {lastPwd}</Text>

      <View style={st.actions}>
        <ActionBtn icon="key-outline"     label="SENHA"     onPress={onChangePwd}    busy={busy} />
        <ActionBtn icon="create-outline"  label="NOME"      onPress={onChangeName}   busy={busy} />
        <ActionBtn icon={m.active ? "pause-outline" : "play-outline"} label={m.active ? "PAUSAR" : "ATIVAR"} onPress={onToggleActive} busy={busy} />
        <ActionBtn icon="trash-outline"   label="EXCLUIR"   onPress={onDelete}       busy={busy} danger />
      </View>
    </View>
  );
}

function ActionBtn({ icon, label, onPress, busy, danger }: { icon: string; label: string; onPress: () => void; busy: boolean; danger?: boolean }) {
  return (
    <TouchableOpacity
      style={[st.actBtn, danger && { borderColor: "#F8717155" }]}
      onPress={onPress}
      disabled={busy}
      activeOpacity={0.75}
    >
      <Ionicons name={icon as any} size={14} color={danger ? "#F87171" : "#DDD"} />
      <Text style={[st.actBtnTxt, danger && { color: "#F87171" }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function AuditRow({ e }: { e: StaffAuditEntry }) {
  const date = new Date(e.timestamp).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
  const label = ACTION_LABELS[e.action] || e.action;
  const isDelete = e.action === "team_delete";
  const color = isDelete ? "#F87171" : (e.action.includes("activate") ? "#4EE07F" : "#F5C150");
  return (
    <View style={st.audit}>
      <View style={[st.auditDot, { backgroundColor: color + "22", borderColor: color + "66" }]}>
        <Ionicons name="time" size={12} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={st.auditTitle}>{label}</Text>
        <Text style={st.auditSub}>
          <Text style={{ color: "#F5F5F5" }}>{e.actor_email || "?"}</Text>
          {" → "}
          <Text style={{ color }}>{e.target_email || "?"}</Text>
        </Text>
        <Text style={st.auditDate}>{date}</Text>
      </View>
    </View>
  );
}

function Field({ label, value, onChange, placeholder, secure, autoCapitalize, keyboardType }: any) {
  return (
    <>
      <Text style={st.lbl}>{label}</Text>
      <TextInput
        style={st.input}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="#555"
        secureTextEntry={!!secure}
        autoCapitalize={autoCapitalize || "sentences"}
        keyboardType={keyboardType}
      />
    </>
  );
}

function Empty({ txt }: { txt: string }) {
  return (
    <View style={st.empty}>
      <Ionicons name="information-circle-outline" size={42} color="#333" />
      <Text style={st.emptyTxt}>{txt}</Text>
    </View>
  );
}

// ============================================================================
const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#050505" },

  tabs: { flexDirection: "row", gap: 6, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 },
  tab: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    paddingVertical: 10, borderRadius: 8,
    borderWidth: 1, borderColor: "#1F1F1F",
    backgroundColor: "#0A0A0A",
  },
  tabActive: { borderColor: "#F5C150", backgroundColor: "#F5C1501A" },
  tabTxt: { color: "#888", fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },

  card: {
    backgroundColor: "#0A0A0A", borderWidth: 1, borderColor: "#1A1A1A",
    borderRadius: 12, padding: 14, marginBottom: 12,
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  roleTag: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 7, paddingVertical: 3,
    borderRadius: 5, borderWidth: 1,
  },
  roleTagTxt: { fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  statusDot: { width: 7, height: 7, borderRadius: 4, marginLeft: "auto" },
  statusTxt: { fontSize: 10, fontWeight: "900", letterSpacing: 0.5 },

  name: { color: "#F5F5F5", fontSize: 15, fontWeight: "800" },
  email: { color: "#999", fontSize: 12, marginTop: 2 },
  meta: { color: "#666", fontSize: 10, marginTop: 4 },

  actions: { flexDirection: "row", gap: 6, marginTop: 12, flexWrap: "wrap" },
  actBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingVertical: 8, paddingHorizontal: 10,
    borderWidth: 1, borderColor: "#222", borderRadius: 7,
    backgroundColor: "#0E0E0E",
  },
  actBtnTxt: { color: "#DDD", fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },

  // FAB
  fab: {
    position: "absolute", right: 16, bottom: 24,
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "#F5C150",
    paddingHorizontal: 18, paddingVertical: 14,
    borderRadius: 30,
    shadowColor: "#F5C150",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5, shadowRadius: 12,
    elevation: 8,
  },
  fabTxt: { color: "#000", fontSize: 12, fontWeight: "900", letterSpacing: 1 },

  // Audit
  audit: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    backgroundColor: "#0A0A0A", borderWidth: 1, borderColor: "#1A1A1A",
    borderRadius: 10, padding: 12, marginBottom: 8,
  },
  auditDot: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  auditTitle: { color: "#F5F5F5", fontSize: 12, fontWeight: "800" },
  auditSub: { color: "#888", fontSize: 11, marginTop: 2 },
  auditDate: { color: "#555", fontSize: 10, marginTop: 3 },

  empty: { alignItems: "center", paddingVertical: 60, gap: 12 },
  emptyTxt: { color: "#555", fontSize: 13 },

  // Modal
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.78)" },
  modalCard: {
    backgroundColor: "#0E0E0E",
    borderWidth: 1, borderColor: "#1F1F1F",
    borderRadius: 14, padding: 18,
  },
  modalHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  modalTitle: { color: "#F5F5F5", fontSize: 15, fontWeight: "900" },
  modalSub: { color: "#999", fontSize: 12, marginBottom: 8 },
  lbl: { color: "#888", fontSize: 10, fontWeight: "900", letterSpacing: 1.5, marginTop: 12, marginBottom: 6 },
  input: {
    backgroundColor: "#121212",
    borderWidth: 1, borderColor: "#1F1F1F",
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 11,
    color: "#FFF", fontSize: 14,
  },
  roleRow: { flexDirection: "row", gap: 6 },
  roleBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4,
    paddingVertical: 10, borderRadius: 8,
    borderWidth: 1, borderColor: "#1F1F1F",
    backgroundColor: "#0A0A0A",
  },
  roleBtnTxt: { fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },
  warnTxt: { color: "#F87171", fontSize: 11, marginTop: 8, lineHeight: 15 },
  modalActions: { flexDirection: "row", gap: 8, marginTop: 18 },
  modalBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  modalBtnGhost: { backgroundColor: "transparent", borderWidth: 1, borderColor: "#1F1F1F" },
  modalBtnGhostTxt: { color: "#888", fontSize: 12, fontWeight: "800", letterSpacing: 1 },
  modalBtnTxt: { color: "#000", fontSize: 12, fontWeight: "900", letterSpacing: 1 },
});

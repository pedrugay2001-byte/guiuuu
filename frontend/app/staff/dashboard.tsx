import { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  RefreshControl, Alert, TextInput, Modal, KeyboardAvoidingView, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, setToken } from "../../src/api";
import { theme, TIERS, TierId } from "../../src/theme";
import { BrandLogo } from "../../src/brand";

export default function StaffDashboard() {
  const router = useRouter();
  const [stats, setStats] = useState({
    members: 0, active_members: 0, open_quotes: 0,
    total_quotes: 0, open_orders: 0, unread_messages: 0,
  });
  const [members, setMembers] = useState<any[]>([]);
  const [pixPending, setPixPending] = useState(0);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = await api.adminStats();
      setStats(s);
      try {
        const me = await api.me();
        if (me.role === "admin") setIsAdmin(true);
      } catch {}
      // Both admin and support can list & edit members now
      try {
        const m = await api.adminMembers();
        setMembers(m);
      } catch {}
      // Pedidos PIX pendentes (badge)
      try {
        const ps = await api.pixOrdersStats();
        setPixPending(ps?.pending || 0);
      } catch {}
    } catch (e: any) {
      if (String(e.message).toLowerCase().includes("auth")) {
        router.replace("/staff/login");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const logout = async () => {
    await setToken(null);
    router.replace("/staff/login");
  };

  const removeMember = (m: any) => {
    Alert.alert("Remover membro", `Excluir ${m.name}? Isso apaga conversa e pedidos.`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Excluir", style: "destructive", onPress: async () => {
          try { await api.adminDeleteMember(m.member_id); await load(); }
          catch (e: any) { Alert.alert("Erro", e.message); }
        } },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }} testID="staff-dashboard">
      <Stack.Screen
        options={{
          headerTitle: () => <BrandLogo size="sm" />,
          headerRight: () => (
            <View style={{ flexDirection: "row", gap: 14, marginRight: 12, alignItems: "center" }}>
              <TouchableOpacity onPress={() => router.push("/staff/inbox")}>
                <Ionicons name="chatbubbles" size={22} color={theme.colors.white} />
                {stats.unread_messages > 0 && (
                  <View style={styles.dot}><Text style={styles.dotText}>{stats.unread_messages}</Text></View>
                )}
              </TouchableOpacity>
              {isAdmin && (
                <TouchableOpacity onPress={() => router.push("/admin/members")}>
                  <Ionicons name="person-add" size={22} color={theme.colors.white} />
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={logout}>
                <Ionicons name="log-out-outline" size={22} color={theme.colors.white} />
              </TouchableOpacity>
            </View>
          ),
        }}
      />

      <ScrollView
        contentContainerStyle={{ padding: theme.spacing.lg }}
        refreshControl={<RefreshControl tintColor={theme.colors.white} refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        <Text style={styles.kicker}>PAINEL DA EQUIPE</Text>
        <Text style={styles.title}>VISÃO GERAL</Text>

        {/* BIG PRE-AUTHORIZATION CARD */}
        <TouchableOpacity
          style={styles.preauthCard}
          onPress={() => router.push("/admin/members")}
          testID="dashboard-preauth-card"
          activeOpacity={0.9}
        >
          <View style={styles.preauthGlow} />
          <View style={styles.preauthIcon}>
            <Ionicons name="person-add" size={24} color={theme.colors.bg} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.preauthKicker}>PRÉ-AUTORIZAÇÃO</Text>
            <Text style={styles.preauthTitle}>CADASTRAR{"\n"}NOVO MEMBRO</Text>
            <Text style={styles.preauthSub}>
              Libere o acesso de um novo membro gerando o código do clube.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color={theme.colors.white} />
        </TouchableOpacity>

        {/* Stat cards */}
        <View style={styles.statGrid}>
          <StatCard
            label="MEMBROS ATIVOS" value={stats.active_members}
            icon="people" color="#4EE07F" accent
          />
          <StatCard
            label="MENSAGENS NÃO LIDAS" value={stats.unread_messages}
            icon="mail-unread" color="#F5C150" urgent={stats.unread_messages > 0}
            onPress={() => router.push("/staff/inbox")}
          />
          <StatCard
            label="CHAMADOS ABERTOS" value={stats.open_quotes}
            icon="clipboard" color="#7FD7E5"
            onPress={() => router.push("/staff/inbox")}
          />
          <StatCard
            label="TOTAL DE MEMBROS" value={stats.members}
            icon="diamond" color="#D4AF37"
          />
        </View>

        {/* BLX Metrics CTA */}
        {isAdmin && (
          <TouchableOpacity
            style={styles.metricsCard}
            onPress={() => router.push("/staff/metrics" as any)}
            testID="dashboard-metrics-card"
            activeOpacity={0.9}
          >
            <View style={styles.metricsIcon}>
              <Ionicons name="analytics" size={22} color="#D4AF37" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.metricsKicker}>PAINEL EXECUTIVO BLX</Text>
              <Text style={styles.metricsTitle}>Métricas do ecossistema</Text>
              <Text style={styles.metricsSub}>Supply em circulação, top sellers e volume 30d</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#888" />
          </TouchableOpacity>
        )}

        {/* Quick actions */}
        <Text style={[styles.kicker, { marginTop: 24 }]}>AÇÕES RÁPIDAS</Text>
        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => router.push("/staff/inbox")}>
            <Ionicons name="chatbubbles" size={18} color={theme.colors.bg} />
            <Text style={styles.actionText}>MENSAGENS A RESPONDER</Text>
          </TouchableOpacity>
          {isAdmin && (
            <>
              <TouchableOpacity style={[styles.actionBtn, styles.actionGhost]} onPress={() => router.push("/admin/members")}>
                <Ionicons name="person-add" size={18} color={theme.colors.white} />
                <Text style={[styles.actionText, { color: theme.colors.white }]}>CADASTRAR NOVO MEMBRO</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, styles.actionGhost]} onPress={() => router.push("/admin/edit")}>
                <Ionicons name="pricetags" size={18} color={theme.colors.white} />
                <Text style={[styles.actionText, { color: theme.colors.white }]}>GERENCIAR CATÁLOGO</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: "#2ECC71", borderColor: "#2ECC71" }]}
                onPress={() => router.push("/admin/wallet" as any)}
                testID="staff-action-wallet"
              >
                <Ionicons name="wallet" size={18} color="#000" />
                <Text style={[styles.actionText, { color: "#000" }]}>CREDITAR BLACK COINS</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: "#F5C150", borderColor: "#F5C150" }]}
                onPress={() => router.push("/staff/pix-orders" as any)}
                testID="staff-action-pix-orders"
              >
                <Ionicons name="qr-code" size={18} color="#000" />
                <Text style={[styles.actionText, { color: "#000" }]}>PEDIDOS PIX (BLX)</Text>
                {pixPending > 0 && (
                  <View style={styles.pixBadge}>
                    <Text style={styles.pixBadgeTxt}>{pixPending > 9 ? "9+" : pixPending}</Text>
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: "#FF3B30", borderColor: "#FF3B30" }]}
                onPress={() => router.push("/staff/team" as any)}
                testID="staff-action-team"
              >
                <Ionicons name="shield-checkmark" size={18} color="#FFF" />
                <Text style={[styles.actionText, { color: "#FFF" }]}>GESTÃO DE EQUIPE (ADMIN)</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Members list (staff + admin) */}
        <>
          <View style={styles.sectionHead}>
            <Text style={styles.kicker}>MEMBROS ({members.length})</Text>
            <TouchableOpacity onPress={() => router.push("/admin/members")}>
              <Text style={styles.linkTxt}>+ NOVO</Text>
            </TouchableOpacity>
          </View>
          {loading ? <ActivityIndicator color={theme.colors.white} style={{ marginTop: 16 }} /> : (
            <View style={{ gap: 8 }}>
              {members.map((m) => {
                const tier = TIERS[(m.tier as TierId) || "black"];
                const active = m.active !== false;
                return (
                  <View key={m.member_id} style={styles.memberCard}>
                    <View style={[styles.statusDot, { backgroundColor: active ? "#4EE07F" : theme.colors.textMuted }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.memberName}>{m.name}</Text>
                      <Text style={styles.memberMeta}>{m.phone || "—"} · {m.email || "sem email"}</Text>
                      <View style={styles.memberFooter}>
                        <View style={[styles.pill, { borderColor: tier.color }]}>
                          <Ionicons name={tier.icon as any} size={9} color={tier.color} />
                          <Text style={[styles.pillTxt, { color: tier.color }]}>{tier.label.toUpperCase()}</Text>
                        </View>
                        <Text style={styles.memberCode}>{m.invite_code}</Text>
                        {active && <Text style={styles.activeLabel}>ATIVO</Text>}
                      </View>
                    </View>
                    <TouchableOpacity onPress={() => setEditing(m)} style={styles.rowIcon}>
                      <Ionicons name="create-outline" size={18} color={theme.colors.white} />
                    </TouchableOpacity>
                    {isAdmin && (
                      <TouchableOpacity onPress={() => removeMember(m)} style={styles.rowIcon}>
                        <Ionicons name="trash-outline" size={18} color={theme.colors.error} />
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </>
      </ScrollView>

      <EditMemberModal
        member={editing}
        onClose={() => setEditing(null)}
        onSaved={async () => { setEditing(null); await load(); }}
      />
    </View>
  );
}

function StatCard({ label, value, icon, color, urgent, accent, onPress }: any) {
  const body = (
    <View style={[styles.statCard, urgent && { borderColor: color }, accent && { borderColor: color }]}>
      <View style={[styles.statIcon, { backgroundColor: color + "22" }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
  if (onPress) return <TouchableOpacity onPress={onPress} style={{ flexBasis: "48%" }}>{body}</TouchableOpacity>;
  return <View style={{ flexBasis: "48%" }}>{body}</View>;
}

function EditMemberModal({ member, onClose, onSaved }: { member: any; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [tier, setTier] = useState<TierId>("black");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newPwd, setNewPwd] = useState("");
  const [resetting, setResetting] = useState(false);

  const open = !!member;
  if (open && name === "" && member.name) {
    setName(member.name);
    setPhone(member.phone || "");
    setTier(member.tier || "black");
    setActive(member.active !== false);
  }

  const save = async () => {
    if (!member) return;
    setSaving(true);
    try {
      await api.adminUpdateMember(member.member_id, { name, phone, tier, active });
      onSaved();
      setName(""); setPhone(""); setNewPwd("");
    } catch (e: any) {
      Alert.alert("Erro", e.message);
    } finally { setSaving(false); }
  };

  const resetPassword = async () => {
    if (!member) return;
    const pwd = newPwd.trim();
    if (pwd.length < 6) {
      Alert.alert("Senha curta", "A nova senha precisa de pelo menos 6 caracteres.");
      return;
    }
    setResetting(true);
    try {
      const res = await api.adminResetMemberPassword(member.member_id, pwd);
      Alert.alert(
        "Senha redefinida",
        `Nova senha definida para ${member.name}${res.email ? `\nE-mail: ${res.email}` : ""}`,
      );
      setNewPwd("");
    } catch (e: any) {
      Alert.alert("Erro", e.message || "Falha ao redefinir senha");
    } finally {
      setResetting(false);
    }
  };

  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <View style={modalStyles.backdrop}>
          <ScrollView style={modalStyles.sheet} contentContainerStyle={{ paddingBottom: 20 }}>
            <View style={modalStyles.handle} />
            <Text style={styles.kicker}>EDITAR MEMBRO</Text>
            <Text style={modalStyles.title}>{member?.name}</Text>

            <Text style={styles.label}>NOME</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} />

            <Text style={styles.label}>TELEFONE</Text>
            <TextInput style={styles.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />

            <Text style={styles.label}>PLANO</Text>
            <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
              {(Object.keys(TIERS) as TierId[]).map((t) => (
                <TouchableOpacity key={t}
                  style={[modalStyles.tierChip, tier === t && { borderColor: TIERS[t].color, backgroundColor: "#151515" }]}
                  onPress={() => setTier(t)}>
                  <Ionicons name={TIERS[t].icon as any} size={12} color={TIERS[t].color} />
                  <Text style={modalStyles.tierChipTxt}>{TIERS[t].label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={modalStyles.statusRow} onPress={() => setActive((v) => !v)}>
              <View style={[modalStyles.check, active && { backgroundColor: "#4EE07F", borderColor: "#4EE07F" }]}>
                {active && <Ionicons name="checkmark" size={12} color={theme.colors.bg} />}
              </View>
              <Text style={modalStyles.statusTxt}>Mensalidade ativa (verde)</Text>
            </TouchableOpacity>

            {/* Reset password block */}
            <View style={modalStyles.resetBlock}>
              <View style={modalStyles.resetHead}>
                <Ionicons name="key" size={14} color="#F5C150" />
                <Text style={modalStyles.resetTitle}>REDEFINIR SENHA</Text>
              </View>
              <Text style={modalStyles.resetHint}>
                Informe uma nova senha temporária (mínimo 6 caracteres). Você deve compartilhá-la com o membro.
              </Text>
              <TextInput
                style={[styles.input, { marginTop: 8 }]}
                value={newPwd}
                onChangeText={setNewPwd}
                placeholder="Nova senha"
                placeholderTextColor={theme.colors.textMuted}
                secureTextEntry
              />
              <TouchableOpacity
                style={[modalStyles.resetBtn, (newPwd.length < 6 || resetting) && { opacity: 0.5 }]}
                onPress={resetPassword}
                disabled={newPwd.length < 6 || resetting}
              >
                {resetting ? (
                  <ActivityIndicator color={theme.colors.bg} size="small" />
                ) : (
                  <>
                    <Ionicons name="refresh" size={14} color={theme.colors.bg} />
                    <Text style={modalStyles.resetBtnTxt}>REDEFINIR SENHA</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: "row", gap: 8, marginTop: 16 }}>
              <TouchableOpacity style={modalStyles.cancelBtn} onPress={onClose}>
                <Text style={modalStyles.cancelTxt}>FECHAR</Text>
              </TouchableOpacity>
              <TouchableOpacity style={modalStyles.saveBtn} onPress={save} disabled={saving}>
                {saving ? <ActivityIndicator color={theme.colors.bg} /> : <Text style={modalStyles.saveTxt}>SALVAR ALTERAÇÕES</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  kicker: { color: theme.colors.silver, fontSize: 11, fontWeight: "800", letterSpacing: 3 },
  title: { color: theme.colors.white, fontSize: 28, fontWeight: "900", letterSpacing: -0.8, marginTop: 6, marginBottom: 18, textTransform: "uppercase" },

  preauthCard: {
    flexDirection: "row", alignItems: "center", gap: 14,
    padding: 18, borderRadius: 14, marginBottom: theme.spacing.lg,
    backgroundColor: "#F5C150", overflow: "hidden", position: "relative",
  },
  preauthGlow: {
    position: "absolute", top: -50, right: -50, width: 180, height: 180, borderRadius: 90,
    backgroundColor: "#FFFFFF", opacity: 0.15,
  },
  preauthIcon: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: "rgba(0,0,0,0.15)",
    alignItems: "center", justifyContent: "center",
  },
  preauthKicker: { color: "rgba(0,0,0,0.6)", fontSize: 9, fontWeight: "900", letterSpacing: 2 },
  preauthTitle: { color: theme.colors.bg, fontSize: 20, fontWeight: "900", letterSpacing: -0.5, lineHeight: 22, marginTop: 2 },
  preauthSub: { color: "rgba(0,0,0,0.7)", fontSize: 11, lineHeight: 15, marginTop: 6 },

  metricsCard: {
    flexDirection: "row", alignItems: "center", gap: 14,
    padding: 16, borderRadius: 12, marginTop: 12,
    backgroundColor: "#0B0B0B",
    borderWidth: 1, borderColor: "rgba(212,175,55,0.3)",
  },
  metricsIcon: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: "rgba(212,175,55,0.12)",
    alignItems: "center", justifyContent: "center",
  },
  metricsKicker: { color: "#D4AF37", fontSize: 9, fontWeight: "900", letterSpacing: 2 },
  metricsTitle: { color: theme.colors.white, fontSize: 15, fontWeight: "800", marginTop: 3 },
  metricsSub: { color: theme.colors.textMuted, fontSize: 11, marginTop: 3, lineHeight: 14 },

  label: { color: theme.colors.silver, fontSize: 10, fontWeight: "800", letterSpacing: 2, marginTop: 10, marginBottom: 6 },
  input: {
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: 8, padding: 12, color: theme.colors.text, fontSize: 14, minHeight: 44,
  },
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 10 },
  statCard: {
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: 10, padding: 14, gap: 6,
  },
  statIcon: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: "center", justifyContent: "center", marginBottom: 4,
  },
  statValue: { color: theme.colors.white, fontSize: 26, fontWeight: "900", letterSpacing: -0.5 },
  statLabel: { color: theme.colors.silver, fontSize: 9, fontWeight: "800", letterSpacing: 1.5 },
  actions: { gap: 8, marginTop: 10 },
  actionBtn: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: theme.colors.white, padding: 14, borderRadius: 8,
  },
  actionGhost: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border },
  actionText: { color: theme.colors.bg, fontSize: 12, fontWeight: "900", letterSpacing: 1 },
  pixBadge: {
    position: "absolute", top: -8, right: -8,
    minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11,
    backgroundColor: "#FF3B30",
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "#050505",
  },
  pixBadgeTxt: { color: "#FFF", fontSize: 11, fontWeight: "900" },
  sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 24, marginBottom: 10 },
  linkTxt: { color: theme.colors.white, fontSize: 11, fontWeight: "800", letterSpacing: 1.5 },
  memberCard: {
    flexDirection: "row", alignItems: "center", gap: 10,
    padding: 12, backgroundColor: theme.colors.surface,
    borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  memberName: { color: theme.colors.white, fontSize: 14, fontWeight: "700" },
  memberMeta: { color: theme.colors.textMuted, fontSize: 11, marginTop: 2 },
  memberFooter: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 5, flexWrap: "wrap" },
  pill: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10, borderWidth: 1 },
  pillTxt: { fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  memberCode: { color: theme.colors.silver, fontSize: 10, fontWeight: "800" },
  activeLabel: { color: "#4EE07F", fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  rowIcon: { padding: 8 },
  dot: {
    position: "absolute", top: -4, right: -6,
    backgroundColor: "#F5C150", minWidth: 18, height: 18, borderRadius: 9,
    paddingHorizontal: 4, alignItems: "center", justifyContent: "center",
  },
  dotText: { color: theme.colors.bg, fontSize: 10, fontWeight: "900" },
});

const modalStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: theme.colors.bg,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, maxHeight: "85%",
  },
  handle: { width: 40, height: 4, backgroundColor: theme.colors.border, borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  title: { color: theme.colors.white, fontSize: 22, fontWeight: "900", letterSpacing: -0.5, marginTop: 4 },
  tierChip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 8, borderRadius: 6,
    borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface,
  },
  tierChipTxt: { color: theme.colors.textMuted, fontSize: 11, fontWeight: "700" },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14 },
  check: { width: 22, height: 22, borderRadius: 4, borderWidth: 1.5, borderColor: theme.colors.border, alignItems: "center", justifyContent: "center" },
  statusTxt: { color: theme.colors.text, fontSize: 14 },

  resetBlock: {
    marginTop: 20,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(245,193,80,0.35)",
    backgroundColor: "rgba(245,193,80,0.05)",
  },
  resetHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  resetTitle: { color: "#F5C150", fontSize: 11, fontWeight: "900", letterSpacing: 1.5 },
  resetHint: { color: theme.colors.textMuted, fontSize: 11, lineHeight: 16 },
  resetBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    marginTop: 10, padding: 12, borderRadius: 8,
    backgroundColor: "#F5C150",
  },
  resetBtnTxt: { color: theme.colors.bg, fontWeight: "900", fontSize: 12, letterSpacing: 1.5 },

  cancelBtn: { flex: 1, padding: 14, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.border, alignItems: "center" },
  cancelTxt: { color: theme.colors.white, fontWeight: "800", fontSize: 12, letterSpacing: 1 },
  saveBtn: { flex: 2, padding: 14, borderRadius: 8, backgroundColor: theme.colors.white, alignItems: "center" },
  saveTxt: { color: theme.colors.bg, fontWeight: "900", fontSize: 12, letterSpacing: 1 },
});

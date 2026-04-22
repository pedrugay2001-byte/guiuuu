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
        if (me.role === "admin") {
          setIsAdmin(true);
          const m = await api.adminMembers();
          setMembers(m);
        }
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
            </>
          )}
        </View>

        {/* Members list (admin only) */}
        {isAdmin && (
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
                      <TouchableOpacity onPress={() => removeMember(m)} style={styles.rowIcon}>
                        <Ionicons name="trash-outline" size={18} color={theme.colors.error} />
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            )}
          </>
        )}
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
      setName(""); setPhone("");
    } catch (e: any) {
      Alert.alert("Erro", e.message);
    } finally { setSaving(false); }
  };

  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <View style={modalStyles.backdrop}>
          <View style={modalStyles.sheet}>
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

            <View style={{ flexDirection: "row", gap: 8, marginTop: 16 }}>
              <TouchableOpacity style={modalStyles.cancelBtn} onPress={onClose}>
                <Text style={modalStyles.cancelTxt}>CANCELAR</Text>
              </TouchableOpacity>
              <TouchableOpacity style={modalStyles.saveBtn} onPress={save} disabled={saving}>
                {saving ? <ActivityIndicator color={theme.colors.bg} /> : <Text style={modalStyles.saveTxt}>SALVAR</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  kicker: { color: theme.colors.silver, fontSize: 11, fontWeight: "800", letterSpacing: 3 },
  title: { color: theme.colors.white, fontSize: 28, fontWeight: "900", letterSpacing: -0.8, marginTop: 6, marginBottom: 18, textTransform: "uppercase" },
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
  cancelBtn: { flex: 1, padding: 14, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.border, alignItems: "center" },
  cancelTxt: { color: theme.colors.white, fontWeight: "800", fontSize: 12, letterSpacing: 1 },
  saveBtn: { flex: 2, padding: 14, borderRadius: 8, backgroundColor: theme.colors.white, alignItems: "center" },
  saveTxt: { color: theme.colors.bg, fontWeight: "900", fontSize: 12, letterSpacing: 1 },
});

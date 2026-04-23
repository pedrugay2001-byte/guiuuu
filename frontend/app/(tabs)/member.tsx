import { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
  Image, ActivityIndicator, Share, TextInput, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useGate } from "../../src/gate";
import { useAuth } from "../../src/auth";
import { api, Product, formatBRL, setToken } from "../../src/api";
import { theme, TIERS } from "../../src/theme";

export default function Member() {
  const router = useRouter();
  const { member, clear, updateMember, refreshMember } = useGate();
  const { user: authUser, refreshUser } = useAuth();
  // Revalida dados do usuário E do membro contra o backend ao abrir a tela,
  // assim mudanças feitas via admin (role, avatar, tier) aparecem sem logout.
  useFocusEffect(useCallback(() => {
    refreshUser();
    refreshMember();
  }, [refreshUser, refreshMember]));
  const isStaff = ["admin", "support", "financeiro"].includes(authUser?.role || "");
  const [adminProducts, setAdminProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalMembers, setTotalMembers] = useState<number | null>(null);
  const [editingNick, setEditingNick] = useState(false);
  const [nickInput, setNickInput] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [products, stats] = await Promise.all([
        api.listProducts().catch(() => []),
        api.memberStats().catch(() => ({ total_members: 0 })),
      ]);
      setAdminProducts(products);
      setTotalMembers(stats.total_members);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const lockClub = async () => {
    // Direct logout — more reliable across web and mobile
    try { await setToken(null); } catch {}
    try { await clear(); } catch {}
    router.replace("/welcome");
  };

  const shareGeneric = async () => {
    if (!member) return;
    try {
      await Share.share({
        message: `BLACKSCLUB — clube privado. Sua entrada só é possível através de autorização da administração. Código de referência: *${member.invite_code}*`,
      });
    } catch {}
  };
  const shareInvite = shareGeneric;

  const contactSupport = () => router.push("/chat");

  const saveNickname = async () => {
    if (!member) return;
    const nick = nickInput.trim();
    if (nick.length < 2 || nick.length > 24) {
      Alert.alert("Apelido inválido", "Use entre 2 e 24 caracteres.");
      return;
    }
    try {
      await api.updateNickname(member.member_id, nick);
      await updateMember({ nickname: nick });
      setEditingNick(false);
    } catch (e: any) {
      Alert.alert("Erro", e.message);
    }
  };

  const deleteProduct = (id: string, name: string) => {
    Alert.alert("Excluir produto", `Remover "${name}" do catálogo?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Excluir", style: "destructive", onPress: async () => { try { await api.deleteProduct(id); await load(); } catch (e: any) { Alert.alert("Erro", e.message); } } },
    ]);
  };

  const tier = member ? TIERS[member.tier] || TIERS.black : TIERS.black;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }} testID="member-screen">
      <ScrollView>
        <View style={styles.profileCard}>
          <TouchableOpacity
            style={[styles.avatar, { borderColor: tier.color }]}
            onPress={() => router.push("/community/edit-profile")}
            activeOpacity={0.8}
            testID="member-avatar-edit"
          >
            {member?.avatar_base64 ? (
              <Image source={{ uri: member.avatar_base64 }} style={styles.avatarImg} />
            ) : (
              <Text style={styles.avatarText}>{member?.name?.substring(0, 1).toUpperCase() || "M"}</Text>
            )}
            <View style={styles.cameraBadge}>
              <Ionicons name="camera" size={12} color="#000" />
            </View>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={1}>{member?.name}</Text>
            <Text style={styles.email}>{member?.phone}</Text>
            <View style={styles.pillRow}>
              <View style={[styles.tierBadge, { borderColor: tier.color }]}>
                <Ionicons name={tier.icon as any} size={11} color={tier.color} />
                <Text style={[styles.tierText, { color: tier.color }]}>{tier.label.toUpperCase()}</Text>
              </View>
              {(member as any)?.member_number && (
                <View style={styles.numberPill}>
                  <Text style={styles.numberTxt}>#{(member as any).member_number}</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Big, obvious EDIT PROFILE button */}
        <TouchableOpacity
          style={styles.editProfileCta}
          onPress={() => router.push("/community/edit-profile")}
          testID="member-edit-profile"
          activeOpacity={0.85}
        >
          <View style={styles.editProfileIcon}>
            <Ionicons name="person-circle" size={22} color="#D4AF37" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.editProfileTitle}>EDITAR PERFIL PÚBLICO</Text>
            <Text style={styles.editProfileSub}>Foto, apelido, bio, cidade, galeria (10 fotos)</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#D4AF37" />
        </TouchableOpacity>

        {/* INVITE CODE — visible, shareable */}
        {member?.invite_code ? (
          <View style={styles.inviteCard}>
            <View style={styles.inviteHead}>
              <Ionicons name="key" size={14} color="#F5C150" />
              <Text style={styles.inviteKicker}>SEU CÓDIGO DE ACESSO</Text>
            </View>
            <Text style={styles.inviteCode}>{member.invite_code}</Text>
            <Text style={styles.inviteHint}>
              Use este código para indicar outra pessoa ao clube. Cada indicação passa pela aprovação da administração.
            </Text>
            <TouchableOpacity style={styles.inviteShare} onPress={shareInvite} testID="member-share-invite">
              <Ionicons name="share-social" size={14} color={theme.colors.bg} />
              <Text style={styles.inviteShareTxt}>COMPARTILHAR CONVITE</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Nickname */}
        <View style={styles.nickCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.nickLabel}>APELIDO NA COMUNIDADE</Text>
            {editingNick ? (
              <TextInput
                style={styles.nickInput}
                value={nickInput}
                onChangeText={setNickInput}
                placeholder="Seu apelido público"
                placeholderTextColor={theme.colors.textMuted}
                autoFocus
                onSubmitEditing={saveNickname}
              />
            ) : (
              <Text style={styles.nickValue}>{member?.nickname || "— não definido"}</Text>
            )}
          </View>
          {editingNick ? (
            <TouchableOpacity onPress={saveNickname} style={styles.nickSave}><Ionicons name="checkmark" size={18} color={theme.colors.bg} /></TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={() => { setNickInput(member?.nickname || ""); setEditingNick(true); }} style={styles.nickEdit}>
              <Ionicons name="create-outline" size={16} color={theme.colors.white} />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.planCard} testID="member-plan-card">
          <View style={styles.planHeader}>
            <Text style={styles.planKicker}>SEU PLANO</Text>
            <Text style={styles.planFreeTag}>ATUALMENTE GRATUITO</Text>
          </View>
          {Object.entries(TIERS).map(([k, t]) => (
            <View key={k} style={[styles.planRow, member?.tier === k && { backgroundColor: "#1A1A1A" }]}>
              <Ionicons name={t.icon as any} size={14} color={t.color} />
              <Text style={[styles.planName, member?.tier === k && { color: theme.colors.white }]}>{t.label.toUpperCase()}</Text>
              {member?.tier === k && <Text style={styles.planCurrent}>ATUAL</Text>}
            </View>
          ))}
        </View>

        <TouchableOpacity style={styles.supportCta} onPress={contactSupport} testID="member-support-cta">
          <View style={styles.supportIcon}>
            <Ionicons name="chatbubbles" size={20} color={theme.colors.bg} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.supportTitle}>FALAR COM O SUPORTE</Text>
            <Text style={styles.supportSub}>Chat privado — resposta em minutos</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.white} />
        </TouchableOpacity>

        <View style={styles.menu}>
          <MenuRow icon="sparkles-outline" label="Solicitar orçamento" onPress={() => router.push("/quote")} testID="member-quote" />
          <MenuRow icon="share-social-outline" label="Compartilhar referência" onPress={shareGeneric} testID="member-share" />
        </View>

        {/* Botão SAIR DO CLUBE — vermelho, ação crítica, destacado */}
        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={lockClub}
          activeOpacity={0.85}
          testID="logout-button"
        >
          <Ionicons name="log-out-outline" size={18} color="#FF6B6B" />
          <Text style={styles.logoutTxt}>SAIR DO CLUBE</Text>
        </TouchableOpacity>

        {totalMembers !== null && (
          <View style={styles.statRow}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{totalMembers}</Text>
              <Text style={styles.statLabel}>MEMBROS NO CLUBE</Text>
            </View>
          </View>
        )}

        {isStaff && (
        <View style={styles.adminSection}>
          {/* ATALHOS RÁPIDOS DE STAFF */}
          <Text style={styles.sectionTitle}>ÁREA DA EQUIPE</Text>
          <View style={{ gap: 8, marginTop: 8 }}>
            <TouchableOpacity
              style={[styles.quickAction, { backgroundColor: "#2ECC71" }]}
              onPress={() => router.push("/admin/wallet" as any)}
              testID="profile-admin-wallet"
              activeOpacity={0.88}
            >
              <Ionicons name="wallet" size={18} color="#000" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.quickActionTitle, { color: "#000" }]}>CREDITAR BLACK COINS</Text>
                <Text style={[styles.quickActionSub, { color: "#0A4D2E" }]}>Adicionar saldo a qualquer membro</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#000" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.quickAction}
              onPress={() => router.push("/admin/members" as any)}
              testID="profile-admin-members"
              activeOpacity={0.88}
            >
              <Ionicons name="person-add" size={18} color="#FFF" />
              <View style={{ flex: 1 }}>
                <Text style={styles.quickActionTitle}>CADASTRAR MEMBRO</Text>
                <Text style={styles.quickActionSub}>Pré-autorizar entrada no clube</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#888" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.quickAction}
              onPress={() => router.push("/staff/dashboard" as any)}
              testID="profile-admin-dashboard"
              activeOpacity={0.88}
            >
              <Ionicons name="stats-chart" size={18} color="#FFF" />
              <View style={{ flex: 1 }}>
                <Text style={styles.quickActionTitle}>PAINEL COMPLETO</Text>
                <Text style={styles.quickActionSub}>Dashboard, pedidos, chat staff</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#888" />
            </TouchableOpacity>
          </View>

          {/* Catálogo — mantém abaixo dos atalhos principais */}
          <View style={[styles.adminHeader, { marginTop: 22 }]}>
            <Text style={styles.sectionTitle}>GERENCIAR CATÁLOGO</Text>
            <TouchableOpacity style={styles.addBtn} onPress={() => router.push("/admin/edit")} testID="admin-add-product">
              <Ionicons name="add" size={16} color={theme.colors.bg} />
              <Text style={styles.addBtnText}>NOVO</Text>
            </TouchableOpacity>
          </View>

          {loading ? <ActivityIndicator color={theme.colors.white} style={{ marginTop: 20 }} /> : (
            <View style={{ gap: theme.spacing.sm }}>
              {adminProducts.slice(0, 5).map((p) => (
                <View key={p.product_id} style={styles.adminRow}>
                  <Image source={{ uri: p.image_url }} style={styles.adminThumb} />
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={styles.adminName}>{p.name}</Text>
                    <Text style={styles.adminMeta}>{formatBRL(p.member_price)} · Estoque {p.stock}</Text>
                  </View>
                  <TouchableOpacity onPress={() => router.push({ pathname: "/admin/edit", params: { id: p.product_id } })} style={styles.iconBtn}>
                    <Ionicons name="create-outline" size={18} color={theme.colors.white} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => deleteProduct(p.product_id, p.name)} style={styles.iconBtn}>
                    <Ionicons name="trash-outline" size={18} color={theme.colors.error} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

function MenuRow({ icon, label, onPress, testID }: { icon: any; label: string; onPress?: () => void; testID?: string }) {
  return (
    <TouchableOpacity style={styles.menuRow} onPress={onPress} testID={testID}>
      <Ionicons name={icon} size={18} color={theme.colors.silver} />
      <Text style={styles.menuLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  profileCard: {
    flexDirection: "row", alignItems: "center", gap: theme.spacing.md,
    margin: theme.spacing.lg, padding: theme.spacing.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12,
  },
  avatar: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 2, alignItems: "center", justifyContent: "center",
    overflow: "hidden", position: "relative",
  },
  avatarImg: { width: "100%", height: "100%", borderRadius: 36 },
  cameraBadge: {
    position: "absolute", bottom: -2, right: -2,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: "#D4AF37", alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: theme.colors.surface,
  },
  avatarText: { color: theme.colors.white, fontSize: 26, fontWeight: "900" },
  name: { color: theme.colors.white, fontSize: 17, fontWeight: "800" },
  email: { color: theme.colors.textMuted, fontSize: 12, marginTop: 2 },
  tierBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 20, borderWidth: 1,
  },
  tierText: { fontSize: 9, fontWeight: "900", letterSpacing: 1.5 },
  pillRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8, flexWrap: "wrap" },
  numberPill: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20,
    borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated,
  },
  numberTxt: { color: theme.colors.text, fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },

  editProfileCta: {
    flexDirection: "row", alignItems: "center", gap: 12,
    marginHorizontal: theme.spacing.lg, marginBottom: theme.spacing.md,
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: "#0F0F0F",
    borderWidth: 1.5, borderColor: "rgba(212,175,55,0.4)",
    borderRadius: 12,
  },
  editProfileIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(212,175,55,0.12)",
    alignItems: "center", justifyContent: "center",
  },
  editProfileTitle: { color: "#D4AF37", fontSize: 12, fontWeight: "900", letterSpacing: 1.5 },
  editProfileSub: { color: theme.colors.textMuted, fontSize: 11, marginTop: 3 },

  inviteCard: {
    marginHorizontal: theme.spacing.lg, marginBottom: theme.spacing.md,
    padding: 16, borderRadius: 12,
    backgroundColor: "#0F0F0F",
    borderWidth: 1, borderColor: "rgba(245,193,80,0.35)",
  },
  inviteHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  inviteKicker: { color: "#F5C150", fontSize: 10, fontWeight: "900", letterSpacing: 2 },
  inviteCode: {
    color: theme.colors.white, fontSize: 26, fontWeight: "900",
    letterSpacing: 6, textAlign: "center",
    paddingVertical: 10,
    backgroundColor: "rgba(245,193,80,0.08)",
    borderRadius: 8, borderWidth: 1, borderColor: "rgba(245,193,80,0.25)",
    marginVertical: 4,
  },
  inviteHint: { color: theme.colors.textMuted, fontSize: 11, lineHeight: 15, marginTop: 8 },
  inviteShare: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    marginTop: 12, padding: 12, borderRadius: 8,
    backgroundColor: "#F5C150",
  },
  inviteShareTxt: { color: theme.colors.bg, fontSize: 11, fontWeight: "900", letterSpacing: 1.5 },
  nickCard: {
    flexDirection: "row", alignItems: "center", gap: 10,
    marginHorizontal: theme.spacing.lg, marginBottom: theme.spacing.md,
    padding: 14, backgroundColor: theme.colors.surface,
    borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10,
  },
  nickLabel: { color: theme.colors.silver, fontSize: 9, fontWeight: "800", letterSpacing: 2 },
  nickValue: { color: theme.colors.white, fontSize: 15, fontWeight: "700", marginTop: 3 },
  nickInput: { color: theme.colors.white, fontSize: 15, fontWeight: "700", marginTop: 3, paddingVertical: 2 },
  nickEdit: { padding: 8 },
  nickSave: {
    width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center",
    backgroundColor: theme.colors.white,
  },
  planCard: {
    marginHorizontal: theme.spacing.lg, marginBottom: theme.spacing.md,
    padding: 14, backgroundColor: theme.colors.surface,
    borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10,
  },
  planHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  planKicker: { color: theme.colors.silver, fontSize: 10, fontWeight: "800", letterSpacing: 2 },
  planFreeTag: { color: theme.colors.textMuted, fontSize: 9, fontWeight: "700", letterSpacing: 1.5 },
  planRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, paddingHorizontal: 8, borderRadius: 6 },
  planName: { color: theme.colors.textMuted, fontSize: 12, fontWeight: "700", letterSpacing: 1, flex: 1 },
  planCurrent: { color: theme.colors.white, fontSize: 9, fontWeight: "900", letterSpacing: 1.5, backgroundColor: theme.colors.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  supportCta: {
    flexDirection: "row", alignItems: "center", gap: 14,
    marginHorizontal: theme.spacing.lg, marginBottom: theme.spacing.md,
    paddingHorizontal: 16, paddingVertical: 16,
    backgroundColor: theme.colors.white, borderRadius: 10,
  },
  supportIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: "#000", alignItems: "center", justifyContent: "center" },
  supportTitle: { color: theme.colors.bg, fontSize: 13, fontWeight: "900", letterSpacing: 1 },
  supportSub: { color: "#333", fontSize: 11, marginTop: 2 },
  menu: { marginHorizontal: theme.spacing.lg, gap: 2 },
  logoutBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    marginHorizontal: theme.spacing.lg, marginTop: 16, paddingVertical: 14,
    borderRadius: 12, backgroundColor: "rgba(255,107,107,0.08)",
    borderWidth: 1, borderColor: "rgba(255,107,107,0.35)",
  },
  logoutTxt: { color: "#FF6B6B", fontSize: 12.5, fontWeight: "900", letterSpacing: 2.5 },
  menuRow: {
    flexDirection: "row", alignItems: "center", gap: 14,
    paddingVertical: 14, paddingHorizontal: 14,
    backgroundColor: theme.colors.surface,
    borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8,
  },
  menuLabel: { color: theme.colors.text, fontSize: 13, flex: 1, fontWeight: "600" },
  sectionTitle: { color: theme.colors.silver, fontSize: 11, fontWeight: "800", letterSpacing: 2 },
  statRow: { flexDirection: "row", gap: 10, paddingHorizontal: theme.spacing.lg, marginTop: theme.spacing.md, marginBottom: theme.spacing.md },
  statBox: {
    flex: 1, padding: theme.spacing.md, alignItems: "center",
    backgroundColor: theme.colors.surface, borderRadius: 10,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  statValue: { color: theme.colors.white, fontSize: 28, fontWeight: "900" },
  statLabel: { color: theme.colors.silver, fontSize: 10, fontWeight: "800", letterSpacing: 1.5, marginTop: 4 },
  adminSection: { marginTop: theme.spacing.md, paddingHorizontal: theme.spacing.lg },
  adminHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: theme.spacing.md },

  // Atalhos rápidos da área de staff (botões grandes com ícone + título + subtítulo).
  quickAction: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    backgroundColor: "#111", borderRadius: 12,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.06)",
  },
  quickActionTitle: { color: "#FFF", fontSize: 12.5, fontWeight: "900", letterSpacing: 1 },
  quickActionSub: { color: "#888", fontSize: 11, fontWeight: "500", marginTop: 2 },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: theme.colors.white, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 6 },
  addBtnText: { color: theme.colors.bg, fontWeight: "900", fontSize: 11, letterSpacing: 1 },
  adminRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8 },
  adminThumb: { width: 48, height: 48, borderRadius: 6, backgroundColor: theme.colors.surfaceElevated },
  adminName: { color: theme.colors.text, fontSize: 13, fontWeight: "600" },
  adminMeta: { color: theme.colors.textMuted, fontSize: 11, marginTop: 2 },
  iconBtn: { padding: 8 },
});

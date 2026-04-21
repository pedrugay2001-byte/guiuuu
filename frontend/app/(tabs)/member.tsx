import { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
  Image, ActivityIndicator, Share, Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useGate } from "../../src/gate";
import { api, Product, formatBRL, setToken } from "../../src/api";
import { theme, WHATSAPP_NUMBER } from "../../src/theme";

export default function Member() {
  const router = useRouter();
  const { member, clear } = useGate();
  const [adminProducts, setAdminProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalMembers, setTotalMembers] = useState<number | null>(null);

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

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const lockClub = () => {
    Alert.alert(
      "Sair do clube",
      "Você precisará digitar um código de acesso válido para entrar novamente. Continuar?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Sair",
          style: "destructive",
          onPress: async () => {
            await setToken(null);
            await clear();
            router.replace("/welcome");
          },
        },
      ],
    );
  };

  const shareWhatsapp = async () => {
    if (!member) return;
    const msg = `Você foi convidado(a) para o FarmaClube. Use meu código pessoal: *${member.invite_code}*`;
    const url = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    try {
      const ok = await Linking.canOpenURL(url);
      if (ok) await Linking.openURL(url);
    } catch {}
  };

  const shareGeneric = async () => {
    if (!member) return;
    try {
      await Share.share({
        message: `🖤 Você foi convidado(a) para o FarmaClube.\n\nUse meu código pessoal para entrar:\n\n*${member.invite_code}*\n\nClube exclusivo — acesso intransferível.`,
      });
    } catch {}
  };

  const contactSupport = async () => {
    const msg = `Olá, sou membro FarmaClube (${member?.name}). Preciso de suporte.`;
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
    try {
      const ok = await Linking.canOpenURL(url);
      if (ok) await Linking.openURL(url);
    } catch {}
  };

  const deleteProduct = (id: string, name: string) => {
    Alert.alert("Excluir produto", `Remover "${name}" do catálogo?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: async () => {
          try {
            await api.deleteProduct(id);
            await load();
          } catch (e: any) {
            Alert.alert("Erro", e.message);
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }} edges={["top"]} testID="member-screen">
      <ScrollView>
        {/* Profile */}
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {member?.name?.substring(0, 1).toUpperCase() || "M"}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{member?.name}</Text>
            <Text style={styles.email}>{member?.phone}</Text>
            <View style={styles.roleBadge}>
              <Ionicons name="diamond" size={12} color={theme.colors.silver} />
              <Text style={styles.roleText}>MEMBRO ATIVO</Text>
            </View>
          </View>
        </View>

        {/* Invite code card */}
        <View style={styles.inviteCard} testID="member-invite-card">
          <Text style={styles.inviteLabel}>SEU CÓDIGO DE INDICAÇÃO</Text>
          <Text style={styles.inviteCode}>{member?.invite_code}</Text>
          <Text style={styles.inviteHint}>
            Padrinho: {member?.parent_name || "—"}
          </Text>
          <View style={styles.inviteActions}>
            <TouchableOpacity style={styles.waShare} onPress={shareWhatsapp} testID="member-share-whatsapp">
              <Ionicons name="logo-whatsapp" size={16} color={theme.colors.white} />
              <Text style={styles.waShareText}>INDICAR NO WHATSAPP</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconShare} onPress={shareGeneric} testID="member-share-generic">
              <Ionicons name="share-social" size={16} color={theme.colors.white} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Club stats */}
        {totalMembers !== null && (
          <View style={styles.statRow}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{totalMembers}</Text>
              <Text style={styles.statLabel}>MEMBROS NO CLUBE</Text>
            </View>
          </View>
        )}

        {/* Menu */}
        <View style={styles.menu}>
          <MenuRow icon="help-circle-outline" label="Suporte via WhatsApp" onPress={contactSupport} testID="support-row" />
          <MenuRow icon="lock-closed-outline" label="Sair do clube (bloquear)" onPress={lockClub} testID="logout-button" />
        </View>

        {/* Admin catalog (always visible on this device after gate) */}
        <View style={styles.adminSection}>
          <View style={styles.adminHeader}>
            <Text style={styles.sectionTitle}>GERENCIAR CATÁLOGO</Text>
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => router.push("/admin/edit")}
              testID="admin-add-product"
            >
              <Ionicons name="add" size={16} color={theme.colors.bg} />
              <Text style={styles.addBtnText}>NOVO</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator color={theme.colors.white} style={{ marginTop: 20 }} />
          ) : (
            <View style={{ gap: theme.spacing.sm }}>
              {adminProducts.map((p) => (
                <View key={p.product_id} style={styles.adminRow}>
                  <Image source={{ uri: p.image_url }} style={styles.adminThumb} />
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={styles.adminName}>{p.name}</Text>
                    <Text style={styles.adminMeta}>
                      {formatBRL(p.member_price)} · Estoque {p.stock}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => router.push({ pathname: "/admin/edit", params: { id: p.product_id } })}
                    style={styles.iconBtn}
                    testID={`admin-edit-${p.product_id}`}
                  >
                    <Ionicons name="create-outline" size={18} color={theme.colors.white} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => deleteProduct(p.product_id, p.name)}
                    style={styles.iconBtn}
                    testID={`admin-delete-${p.product_id}`}
                  >
                    <Ionicons name="trash-outline" size={18} color={theme.colors.error} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function MenuRow({
  icon, label, onPress, testID,
}: { icon: any; label: string; onPress?: () => void; testID?: string }) {
  return (
    <TouchableOpacity style={styles.menuRow} onPress={onPress} testID={testID}>
      <Ionicons name={icon} size={20} color={theme.colors.silver} />
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
    borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8,
  },
  avatar: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1, borderColor: theme.colors.silver,
    alignItems: "center", justifyContent: "center",
  },
  avatarText: { color: theme.colors.white, fontSize: 22, fontWeight: "800" },
  name: { color: theme.colors.white, fontSize: 18, fontWeight: "700" },
  email: { color: theme.colors.textMuted, fontSize: 13, marginTop: 2 },
  roleBadge: {
    flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8,
    alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 4, borderWidth: 1, borderColor: theme.colors.border,
  },
  roleText: { color: theme.colors.silver, fontSize: 10, fontWeight: "700", letterSpacing: 1.5 },
  inviteCard: {
    marginHorizontal: theme.spacing.lg, marginBottom: theme.spacing.lg,
    padding: theme.spacing.lg, backgroundColor: theme.colors.surface,
    borderWidth: 1, borderColor: theme.colors.silver, borderRadius: 8,
    alignItems: "center",
  },
  inviteLabel: { color: theme.colors.silver, fontSize: 10, fontWeight: "700", letterSpacing: 2 },
  inviteCode: {
    color: theme.colors.white, fontSize: 32, fontWeight: "900",
    letterSpacing: 2, marginVertical: 8,
  },
  inviteHint: { color: theme.colors.textMuted, fontSize: 12, marginBottom: theme.spacing.md },
  inviteActions: { flexDirection: "row", gap: 8, alignSelf: "stretch" },
  waShare: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: theme.colors.whatsapp, paddingVertical: 12, borderRadius: 4,
  },
  waShareText: { color: theme.colors.white, fontWeight: "800", fontSize: 11, letterSpacing: 1.5 },
  iconShare: {
    width: 44, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: theme.colors.border, borderRadius: 4,
  },
  statRow: { flexDirection: "row", gap: 10, paddingHorizontal: theme.spacing.lg, marginBottom: theme.spacing.lg },
  statBox: {
    flex: 1, padding: theme.spacing.md, alignItems: "center",
    backgroundColor: theme.colors.surface, borderRadius: 6,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  statValue: { color: theme.colors.white, fontSize: 28, fontWeight: "900" },
  statLabel: { color: theme.colors.silver, fontSize: 10, fontWeight: "700", letterSpacing: 1.5, marginTop: 4 },
  menu: { marginHorizontal: theme.spacing.lg, gap: 2 },
  menuRow: {
    flexDirection: "row", alignItems: "center", gap: 14,
    paddingVertical: 16, paddingHorizontal: 16,
    backgroundColor: theme.colors.surface,
    borderWidth: 1, borderColor: theme.colors.border, borderRadius: 6,
  },
  menuLabel: { color: theme.colors.text, fontSize: 14, flex: 1, fontWeight: "500" },
  sectionTitle: { color: theme.colors.silver, fontSize: 11, fontWeight: "700", letterSpacing: 2 },
  adminSection: { marginTop: theme.spacing.xl, paddingHorizontal: theme.spacing.lg },
  adminHeader: {
    flexDirection: "row", justifyContent: "space-between",
    alignItems: "center", marginBottom: theme.spacing.md,
  },
  addBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: theme.colors.white,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 4,
  },
  addBtnText: { color: theme.colors.bg, fontWeight: "800", fontSize: 11, letterSpacing: 1 },
  adminRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    padding: 10, backgroundColor: theme.colors.surface,
    borderWidth: 1, borderColor: theme.colors.border, borderRadius: 6,
  },
  adminThumb: { width: 48, height: 48, borderRadius: 4, backgroundColor: theme.colors.surfaceElevated },
  adminName: { color: theme.colors.text, fontSize: 13, fontWeight: "600" },
  adminMeta: { color: theme.colors.textMuted, fontSize: 11, marginTop: 2 },
  iconBtn: { padding: 8 },
});

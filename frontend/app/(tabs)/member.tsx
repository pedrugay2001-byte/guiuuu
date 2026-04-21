import { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
  FlatList, Image, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../src/auth";
import { api, Product, formatBRL } from "../../src/api";
import { theme } from "../../src/theme";

export default function Member() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [adminProducts, setAdminProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);

  const loadAdminProducts = useCallback(async () => {
    if (user?.role !== "admin") return;
    setLoading(true);
    try {
      const data = await api.listProducts();
      setAdminProducts(data);
    } finally {
      setLoading(false);
    }
  }, [user?.role]);

  useFocusEffect(
    useCallback(() => {
      loadAdminProducts();
    }, [loadAdminProducts]),
  );

  const doLogout = () => {
    Alert.alert("Sair", "Tem certeza que deseja sair?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Sair",
        style: "destructive",
        onPress: async () => {
          await logout();
          router.replace("/");
        },
      },
    ]);
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
            await loadAdminProducts();
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
        {/* Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user?.name?.substring(0, 1).toUpperCase() || "M"}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{user?.name}</Text>
            <Text style={styles.email}>{user?.email}</Text>
            <View style={styles.roleBadge}>
              <Ionicons
                name={user?.role === "admin" ? "shield-checkmark" : "diamond"}
                size={12}
                color={theme.colors.silver}
              />
              <Text style={styles.roleText}>
                {user?.role === "admin" ? "ADMINISTRADOR" : "MEMBRO ATIVO"}
              </Text>
            </View>
          </View>
        </View>

        {/* Menu */}
        <View style={styles.menu}>
          <MenuRow icon="heart-outline" label="Favoritos" disabled />
          <MenuRow icon="receipt-outline" label="Meus pedidos" disabled />
          <MenuRow icon="help-circle-outline" label="Suporte via WhatsApp"
            onPress={() => router.push("/(tabs)/cart")} />
          <MenuRow icon="log-out-outline" label="Sair" onPress={doLogout} testID="logout-button" />
        </View>

        {/* Admin Section */}
        {user?.role === "admin" && (
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
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function MenuRow({
  icon, label, onPress, disabled, testID,
}: { icon: any; label: string; onPress?: () => void; disabled?: boolean; testID?: string }) {
  return (
    <TouchableOpacity
      style={[styles.menuRow, disabled && { opacity: 0.4 }]}
      onPress={onPress}
      disabled={disabled}
      testID={testID}
    >
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

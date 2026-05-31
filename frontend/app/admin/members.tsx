import { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "../../src/icons";
import { api, AuthorizedEntry, setToken } from "../../src/api";
import { theme, TIERS, TierId } from "../../src/theme";

export default function AdminMembers() {
  const router = useRouter();
  const [list, setList] = useState<AuthorizedEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [tier, setTier] = useState<TierId>("black");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.adminListAuthorized();
      setList(data);
    } catch (e: any) {
      const msg = String(e?.message || "").toLowerCase();
      if (msg.includes("staff") || msg.includes("admin") || msg.includes("401") || msg.includes("403")) {
        Alert.alert("Acesso negado", "Faça login novamente.", [
          { text: "OK", onPress: () => router.replace("/staff/login") },
        ]);
      } else {
        Alert.alert("Erro ao carregar", e?.message || "Tente novamente");
      }
    } finally {
      setLoading(false);
    }
  }, [router]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const add = async () => {
    if (!name.trim() || !phone.trim() || !code.trim()) {
      Alert.alert("Dados obrigatórios", "Preencha nome, telefone e código.");
      return;
    }
    if (name.trim().split(/\s+/).length < 2) {
      Alert.alert("Nome incompleto", "Informe o nome completo do membro.");
      return;
    }
    setSaving(true);
    try {
      await api.adminAddAuthorized({ name: name.trim(), phone: phone.trim(), code: code.trim().toUpperCase(), tier });
      setName(""); setPhone(""); setCode(""); setTier("black");
      Alert.alert("Cadastrado", "Membro pré-autorizado com sucesso. Ele já pode criar a conta no app.");
      await load();
    } catch (e: any) {
      Alert.alert("Erro", e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = (item: AuthorizedEntry) => {
    Alert.alert("Remover autorização", `Revogar acesso de "${item.name}"?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Remover", style: "destructive", onPress: async () => {
          try { await api.adminDeleteAuthorized(item.auth_id); await load(); }
          catch (e: any) { Alert.alert("Erro", e.message); }
        } },
    ]);
  };

  const logout = async () => {
    await setToken(null);
    router.replace("/staff/login");
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
    >
      <Stack.Screen
        options={{
          title: "Membros autorizados",
          headerRight: () => (
            <TouchableOpacity onPress={logout} style={{ marginRight: 14 }}>
              <Ionicons name="log-out-outline" size={22} color={theme.colors.white} />
            </TouchableOpacity>
          ),
        }}
      />
      <SafeAreaView style={{ flex: 1 }} edges={["bottom"]}>
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.kicker}>CADASTRAR NOVO</Text>
          <Text style={styles.title}>PRÉ-AUTORIZAR MEMBRO</Text>
          <Text style={styles.sub}>
            Preencha os dados combinados. O membro precisará usar o <Text style={{ color: theme.colors.white }}>mesmo nome, telefone e código</Text> no cadastro.
          </Text>

          <View style={styles.field}>
            <Text style={styles.label}>NOME COMPLETO</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName}
              placeholder="Ex: João da Silva" placeholderTextColor={theme.colors.textMuted} autoCapitalize="words" />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>TELEFONE</Text>
            <TextInput style={styles.input} value={phone} onChangeText={setPhone}
              placeholder="(11) 99999-9999" placeholderTextColor={theme.colors.textMuted} keyboardType="phone-pad" />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>CÓDIGO DE ACESSO</Text>
            <TextInput style={styles.input} value={code} onChangeText={setCode}
              placeholder="Ex: BLACK-J2025" placeholderTextColor={theme.colors.textMuted} autoCapitalize="characters" />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>PLANO INICIAL</Text>
            <View style={styles.tierRow}>
              {(Object.keys(TIERS) as TierId[]).map((t) => (
                <TouchableOpacity key={t}
                  style={[styles.tierChip, tier === t && { borderColor: TIERS[t].color, backgroundColor: "#151515" }]}
                  onPress={() => setTier(t)}>
                  <Ionicons name={TIERS[t].icon as any} size={14} color={TIERS[t].color} />
                  <Text style={[styles.tierChipText, tier === t && { color: theme.colors.white }]}>
                    {TIERS[t].label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <TouchableOpacity style={styles.primaryBtn} onPress={add} disabled={saving}>
            {saving ? <ActivityIndicator color={theme.colors.bg} /> : (
              <>
                <Ionicons name="person-add" size={16} color={theme.colors.bg} />
                <Text style={styles.primaryBtnText}>CADASTRAR AUTORIZAÇÃO</Text>
              </>
            )}
          </TouchableOpacity>

          <View style={styles.divider} />

          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={styles.kicker}>MEMBROS AUTORIZADOS</Text>
            <Text style={{ color: theme.colors.textMuted, fontSize: 11 }}>{list.length} total</Text>
          </View>

          {loading ? (
            <ActivityIndicator color={theme.colors.white} style={{ marginTop: 20 }} />
          ) : (
            <View style={{ gap: 8, marginTop: 10 }}>
              {list.length === 0 && (
                <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>Nenhum cadastro ainda.</Text>
              )}
              {list.map((item) => {
                const t = TIERS[item.tier as TierId] || TIERS.black;
                return (
                  <View key={item.auth_id} style={styles.row}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowName}>{item.name}</Text>
                      <Text style={styles.rowMeta}>{item.phone}</Text>
                      <View style={styles.rowFoot}>
                        <Text style={styles.rowCode}>{item.code}</Text>
                        <View style={[styles.tierPill, { borderColor: t.color }]}>
                          <Ionicons name={t.icon as any} size={9} color={t.color} />
                          <Text style={[styles.tierPillText, { color: t.color }]}>{t.label.toUpperCase()}</Text>
                        </View>
                      </View>
                    </View>
                    <TouchableOpacity onPress={() => remove(item)} style={{ padding: 10 }}>
                      <Ionicons name="trash-outline" size={18} color={theme.colors.error} />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: theme.spacing.lg, gap: theme.spacing.md, paddingBottom: 60 },
  kicker: { color: theme.colors.silver, fontSize: 11, fontWeight: "800", letterSpacing: 3 },
  title: {
    color: theme.colors.white, fontSize: 26, fontWeight: "900",
    letterSpacing: -0.8, marginTop: 6, textTransform: "uppercase",
  },
  sub: { color: theme.colors.textMuted, fontSize: 13, lineHeight: 20, marginTop: 6 },
  field: { gap: 8 },
  label: { color: theme.colors.silver, fontSize: 10, fontWeight: "800", letterSpacing: 2 },
  input: {
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: 8, padding: 14, color: theme.colors.text, fontSize: 15, minHeight: 48,
  },
  tierRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  tierChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 9, borderRadius: 8,
    borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface,
  },
  tierChipText: { color: theme.colors.textMuted, fontSize: 12, fontWeight: "700" },
  primaryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: theme.colors.white, paddingVertical: 15, borderRadius: 8,
    marginTop: theme.spacing.sm,
  },
  primaryBtnText: { color: theme.colors.bg, fontWeight: "900", fontSize: 13, letterSpacing: 1.2 },
  divider: { height: 1, backgroundColor: theme.colors.border, marginVertical: theme.spacing.md },
  row: {
    flexDirection: "row", alignItems: "center", gap: 8,
    padding: 12, backgroundColor: theme.colors.surface,
    borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8,
  },
  rowName: { color: theme.colors.white, fontSize: 14, fontWeight: "700" },
  rowMeta: { color: theme.colors.textMuted, fontSize: 12, marginTop: 2 },
  rowFoot: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  rowCode: {
    fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }),
    color: theme.colors.silver, fontSize: 11, fontWeight: "800",
  },
  tierPill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10, borderWidth: 1,
  },
  tierPillText: { fontSize: 9, fontWeight: "900", letterSpacing: 1 },
});

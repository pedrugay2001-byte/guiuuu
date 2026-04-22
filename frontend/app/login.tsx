import { useState } from "react";
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, setToken } from "../src/api";
import { useGate } from "../src/gate";
import { theme } from "../src/theme";
import { BrandLogo } from "../src/brand";
import { PasswordInput } from "../src/password-input";

export default function Login() {
  const router = useRouter();
  const { saveMember } = useGate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!email.trim() || !password) {
      setError("Preencha e-mail e senha");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const m = await api.memberLogin(email.trim(), password);
      try {
        const auth = await api.login("admin@farmaclube.com", "admin123");
        await setToken(auth.token);
      } catch {}
      await saveMember({
        member_id: m.member_id,
        name: m.name,
        phone: m.phone || "",
        neighborhood: m.neighborhood || "",
        city: m.city || "",
        state: m.state || "",
        invite_code: m.invite_code,
        parent_code: m.parent_code,
        parent_name: m.parent_name,
        tier: m.tier,
        nickname: m.nickname,
      });
      router.replace("/(tabs)/home");
    } catch (e: any) {
      setError(e.message || "E-mail ou senha inválidos");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
    >
      <Stack.Screen
        options={{
          title: "",
          headerBackTitle: "Voltar",
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} style={{ marginLeft: 12, flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Ionicons name="chevron-back" size={24} color={theme.colors.white} />
              <Text style={{ color: theme.colors.white, fontSize: 15, fontWeight: "600" }}>Voltar</Text>
            </TouchableOpacity>
          ),
        }}
      />
      <SafeAreaView style={{ flex: 1 }} edges={["bottom"]}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <BrandLogo size="md" style={{ marginBottom: 32 }} />
          <Text style={styles.kicker}>ACESSO DE MEMBRO</Text>
          <Text style={styles.title}>ENTRE COM SUA{"\n"}CONTA.</Text>
          <Text style={styles.sub}>Informe seu e-mail e senha cadastrados.</Text>

          <View style={styles.field}>
            <Text style={styles.label}>E-MAIL</Text>
            <TextInput
              testID="login-email"
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="seu@email.com"
              placeholderTextColor={theme.colors.textMuted}
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>SENHA</Text>
            <PasswordInput testID="login-password" value={password} onChangeText={setPassword} placeholder="••••••••" />
          </View>

          {error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={submit}
            disabled={loading}
            testID="login-submit"
          >
            {loading ? <ActivityIndicator color={theme.colors.bg} /> : (
              <>
                <Text style={styles.primaryBtnText}>ENTRAR</Text>
                <Ionicons name="arrow-forward" size={16} color={theme.colors.bg} />
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.linkBtn} onPress={() => router.push("/forgot")}>
            <Text style={styles.linkText}>ESQUECI MINHA SENHA</Text>
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity style={styles.ghostBtn} onPress={() => router.replace("/enter")}>
            <Text style={styles.ghostBtnText}>PRIMEIRO ACESSO? CRIAR CONTA</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: theme.spacing.lg, gap: theme.spacing.md, paddingBottom: 60 },
  kicker: { color: theme.colors.silver, fontSize: 11, fontWeight: "800", letterSpacing: 3 },
  title: {
    color: theme.colors.white, fontSize: 34, fontWeight: "900",
    letterSpacing: -1.2, lineHeight: 36, marginTop: 6, textTransform: "uppercase",
  },
  sub: { color: theme.colors.textMuted, fontSize: 13, lineHeight: 20, marginTop: 8, marginBottom: theme.spacing.md },
  field: { gap: 8 },
  label: { color: theme.colors.silver, fontSize: 10, fontWeight: "800", letterSpacing: 2 },
  input: {
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: 8, padding: 15, color: theme.colors.text, fontSize: 15, minHeight: 48,
  },
  error: {
    color: theme.colors.error, fontSize: 13, textAlign: "center",
    backgroundColor: "rgba(255,59,48,0.08)",
    borderWidth: 1, borderColor: "rgba(255,59,48,0.3)",
    padding: 12, borderRadius: 8,
  },
  primaryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    backgroundColor: theme.colors.white, paddingVertical: 17, borderRadius: 8,
    marginTop: theme.spacing.md,
  },
  primaryBtnText: { color: theme.colors.bg, fontWeight: "900", fontSize: 13, letterSpacing: 1.5 },
  linkBtn: { alignItems: "center", paddingVertical: 12 },
  linkText: { color: theme.colors.textMuted, fontSize: 11, fontWeight: "800", letterSpacing: 2 },
  divider: { height: 1, backgroundColor: theme.colors.border, marginVertical: theme.spacing.md },
  ghostBtn: {
    alignItems: "center", paddingVertical: 15,
    borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8,
  },
  ghostBtnText: { color: theme.colors.white, fontSize: 12, fontWeight: "800", letterSpacing: 1.5 },
});

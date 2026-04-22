import { useState } from "react";
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, KeyboardAvoidingView,
  Platform, ScrollView, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, setToken } from "../../src/api";
import { theme } from "../../src/theme";

export default function StaffLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("suporte@blacksclub.com");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    if (!email || !password) {
      setError("Preencha email e senha");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await api.login(email.trim().toLowerCase(), password);
      if (!["support", "admin"].includes(res.user.role)) {
        setError("Conta sem permissão de suporte");
        return;
      }
      await setToken(res.token);
      router.replace("/staff/inbox");
    } catch (e: any) {
      setError(e.message || "Falha ao entrar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
    >
      <Stack.Screen options={{ title: "Área da Equipe" }} />
      <SafeAreaView style={{ flex: 1 }} edges={["bottom"]}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.iconWrap}>
            <Ionicons name="shield-checkmark" size={28} color={theme.colors.silver} />
          </View>
          <Text style={styles.kicker}>ACESSO INTERNO</Text>
          <Text style={styles.title}>Entrada da equipe</Text>
          <Text style={styles.sub}>
            Área exclusiva para suporte e administração. Responda membros em tempo real.
          </Text>

          <View style={styles.field}>
            <Text style={styles.label}>E-mail</Text>
            <TextInput
              testID="staff-email-input"
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholderTextColor={theme.colors.textMuted}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Senha</Text>
            <TextInput
              testID="staff-password-input"
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="••••••••"
              placeholderTextColor={theme.colors.textMuted}
            />
          </View>

          {error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={onSubmit}
            disabled={loading}
            testID="staff-submit-button"
          >
            {loading ? (
              <ActivityIndicator color={theme.colors.bg} />
            ) : (
              <Text style={styles.primaryBtnText}>ENTRAR</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: theme.spacing.lg, gap: theme.spacing.md },
  iconWrap: {
    width: 56, height: 56, borderRadius: 4,
    borderWidth: 1, borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    alignItems: "center", justifyContent: "center",
    marginBottom: theme.spacing.md,
  },
  kicker: { color: theme.colors.silver, fontSize: 11, fontWeight: "700", letterSpacing: 2 },
  title: { color: theme.colors.white, fontSize: 26, fontWeight: "800", letterSpacing: -0.5 },
  sub: { color: theme.colors.textMuted, fontSize: 13, lineHeight: 20, marginBottom: theme.spacing.md },
  field: { gap: 8 },
  label: { color: theme.colors.silver, fontSize: 11, fontWeight: "700", letterSpacing: 1.5 },
  input: {
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: 4, padding: 16, color: theme.colors.text, fontSize: 15,
  },
  error: { color: theme.colors.error, fontSize: 13 },
  primaryBtn: {
    backgroundColor: theme.colors.white, paddingVertical: 16,
    borderRadius: 4, alignItems: "center", marginTop: theme.spacing.md,
  },
  primaryBtnText: { color: theme.colors.bg, fontWeight: "800", fontSize: 13, letterSpacing: 1.5 },
});

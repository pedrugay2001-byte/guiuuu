import { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, Link } from "expo-router";
import { useAuth } from "../src/auth";
import { theme } from "../src/theme";

export default function Login() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
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
      await login(email.trim(), password);
      router.replace("/(tabs)/home");
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
      <SafeAreaView style={{ flex: 1 }} edges={["bottom"]}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Bem-vindo de volta</Text>
          <Text style={styles.subtitle}>Acesse sua conta do FarmaClube</Text>

          <View style={styles.field}>
            <Text style={styles.label}>E-mail</Text>
            <TextInput
              testID="login-email-input"
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="seu@email.com"
              placeholderTextColor={theme.colors.textMuted}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Senha</Text>
            <TextInput
              testID="login-password-input"
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={theme.colors.textMuted}
              secureTextEntry
            />
          </View>

          {error && <Text style={styles.error} testID="login-error">{error}</Text>}

          <TouchableOpacity
            testID="login-submit-button"
            style={styles.primaryBtn}
            onPress={onSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={theme.colors.bg} />
            ) : (
              <Text style={styles.primaryBtnText}>ENTRAR</Text>
            )}
          </TouchableOpacity>

          <Link href="/register" asChild>
            <TouchableOpacity testID="go-to-register" style={styles.linkBtn}>
              <Text style={styles.linkText}>
                Não tem conta? <Text style={styles.linkAccent}>Cadastre-se</Text>
              </Text>
            </TouchableOpacity>
          </Link>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: theme.spacing.lg, gap: theme.spacing.md },
  title: { color: theme.colors.white, fontSize: 28, fontWeight: "800", letterSpacing: -0.5 },
  subtitle: { color: theme.colors.textMuted, fontSize: 14, marginBottom: theme.spacing.md },
  field: { gap: 8 },
  label: { color: theme.colors.silver, fontSize: 11, fontWeight: "700", letterSpacing: 1.5 },
  input: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 4,
    padding: 16,
    color: theme.colors.text,
    fontSize: 15,
  },
  primaryBtn: {
    backgroundColor: theme.colors.white,
    paddingVertical: 16,
    borderRadius: 4,
    alignItems: "center",
    marginTop: theme.spacing.md,
  },
  primaryBtnText: { color: theme.colors.bg, fontWeight: "800", fontSize: 14, letterSpacing: 1.5 },
  linkBtn: { alignItems: "center", padding: theme.spacing.md },
  linkText: { color: theme.colors.textMuted, fontSize: 14 },
  linkAccent: { color: theme.colors.white, fontWeight: "700" },
  error: { color: theme.colors.error, fontSize: 13 },
});

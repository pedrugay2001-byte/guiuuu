import { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, Link } from "expo-router";
import { useAuth } from "../src/auth";
import { theme } from "../src/theme";

export default function Register() {
  const router = useRouter();
  const { register } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    if (!name || !email || !password) {
      setError("Preencha todos os campos");
      return;
    }
    if (password.length < 6) {
      setError("Senha deve ter pelo menos 6 caracteres");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await register(email.trim(), password, name.trim());
      router.replace("/(tabs)/home");
    } catch (e: any) {
      setError(e.message || "Falha ao cadastrar");
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
          <Text style={styles.title}>Torne-se membro</Text>
          <Text style={styles.subtitle}>Acesso exclusivo com preços especiais</Text>

          <View style={styles.field}>
            <Text style={styles.label}>Nome completo</Text>
            <TextInput
              testID="register-name-input"
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Seu nome"
              placeholderTextColor={theme.colors.textMuted}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>E-mail</Text>
            <TextInput
              testID="register-email-input"
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
            <Text style={styles.label}>Senha</Text>
            <TextInput
              testID="register-password-input"
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="Mínimo 6 caracteres"
              placeholderTextColor={theme.colors.textMuted}
              secureTextEntry
            />
          </View>

          {error && <Text style={styles.error} testID="register-error">{error}</Text>}

          <TouchableOpacity
            testID="register-submit-button"
            style={styles.primaryBtn}
            onPress={onSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={theme.colors.bg} />
            ) : (
              <Text style={styles.primaryBtnText}>CRIAR CONTA</Text>
            )}
          </TouchableOpacity>

          <Link href="/login" asChild>
            <TouchableOpacity testID="go-to-login" style={styles.linkBtn}>
              <Text style={styles.linkText}>
                Já é membro? <Text style={styles.linkAccent}>Entrar</Text>
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

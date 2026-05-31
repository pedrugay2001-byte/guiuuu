import { useState } from "react";
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "../src/icons";
import { api } from "../src/api";
import { theme } from "../src/theme";

export default function Forgot() {
  const router = useRouter();
  const [step, setStep] = useState<"req" | "reset">("req");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [token, setToken] = useState("");
  const [newPass, setNewPass] = useState("");
  const [loading, setLoading] = useState(false);

  const request = async () => {
    if (!email.trim() || !code.trim()) {
      Alert.alert("Dados obrigatórios", "Informe seu e-mail e código pessoal.");
      return;
    }
    setLoading(true);
    try {
      const res = await api.memberForgot(email.trim(), code.trim());
      if (res.short_token) {
        // Mock mode: show the code
        Alert.alert(
          "Código gerado (modo demo)",
          `Como o e-mail real não está configurado, use este código:\n\n${res.short_token}\n\nNa versão final, esse código será enviado ao seu e-mail.`,
        );
      } else {
        Alert.alert(
          "Verifique seu e-mail",
          "Se os dados estiverem corretos, você receberá um código de redefinição em breve.",
        );
      }
      setStep("reset");
    } catch (e: any) {
      Alert.alert("Erro", e.message);
    } finally {
      setLoading(false);
    }
  };

  const reset = async () => {
    if (!token.trim() || newPass.length < 6) {
      Alert.alert("Dados inválidos", "Informe o código recebido e uma nova senha com 6+ caracteres.");
      return;
    }
    setLoading(true);
    try {
      await api.memberReset(token.trim(), newPass);
      Alert.alert("Senha alterada", "Você já pode entrar com a nova senha.", [
        { text: "OK", onPress: () => router.replace("/login") },
      ]);
    } catch (e: any) {
      Alert.alert("Erro", e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
    >
      <Stack.Screen options={{ title: "Recuperar senha" }} />
      <SafeAreaView style={{ flex: 1 }} edges={["bottom"]}>
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.kicker}>{step === "req" ? "RECUPERAR SENHA" : "DEFINIR NOVA SENHA"}</Text>
          <Text style={styles.title}>
            {step === "req" ? "ESQUECEU\nSUA SENHA?" : "ESCOLHA\nUMA NOVA."}
          </Text>
          <Text style={styles.sub}>
            {step === "req"
              ? "Informe o e-mail cadastrado e seu código pessoal. Enviaremos um código de redefinição."
              : "Cole o código que chegou no seu e-mail e defina uma nova senha."}
          </Text>

          {step === "req" ? (
            <>
              <View style={styles.field}>
                <Text style={styles.label}>E-MAIL</Text>
                <TextInput
                  style={styles.input} value={email} onChangeText={setEmail}
                  placeholder="seu@email.com" placeholderTextColor={theme.colors.textMuted}
                  autoCapitalize="none" keyboardType="email-address"
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>SEU CÓDIGO PESSOAL</Text>
                <TextInput
                  style={styles.input} value={code} onChangeText={setCode}
                  placeholder="Ex: BLAA7" placeholderTextColor={theme.colors.textMuted}
                  autoCapitalize="characters"
                />
              </View>
              <TouchableOpacity style={styles.primaryBtn} onPress={request} disabled={loading}>
                {loading ? <ActivityIndicator color={theme.colors.bg} /> : (
                  <Text style={styles.primaryBtnText}>ENVIAR CÓDIGO</Text>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={styles.field}>
                <Text style={styles.label}>CÓDIGO DE REDEFINIÇÃO</Text>
                <TextInput
                  style={styles.input} value={token} onChangeText={setToken}
                  placeholder="Cole o código aqui" placeholderTextColor={theme.colors.textMuted}
                  autoCapitalize="characters"
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>NOVA SENHA</Text>
                <TextInput
                  style={styles.input} value={newPass} onChangeText={setNewPass}
                  placeholder="Mínimo 6 caracteres" placeholderTextColor={theme.colors.textMuted}
                  secureTextEntry
                />
              </View>
              <TouchableOpacity style={styles.primaryBtn} onPress={reset} disabled={loading}>
                {loading ? <ActivityIndicator color={theme.colors.bg} /> : (
                  <Text style={styles.primaryBtnText}>REDEFINIR SENHA</Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: theme.spacing.lg, gap: theme.spacing.md },
  kicker: { color: theme.colors.silver, fontSize: 11, fontWeight: "800", letterSpacing: 3 },
  title: {
    color: theme.colors.white, fontSize: 32, fontWeight: "900",
    letterSpacing: -1.2, lineHeight: 34, marginTop: 6, textTransform: "uppercase",
  },
  sub: { color: theme.colors.textMuted, fontSize: 13, lineHeight: 20, marginTop: 8, marginBottom: theme.spacing.md },
  field: { gap: 8 },
  label: { color: theme.colors.silver, fontSize: 10, fontWeight: "800", letterSpacing: 2 },
  input: {
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: 8, padding: 15, color: theme.colors.text, fontSize: 15, minHeight: 48,
  },
  primaryBtn: {
    backgroundColor: theme.colors.white, paddingVertical: 17, borderRadius: 8,
    alignItems: "center", marginTop: theme.spacing.md,
  },
  primaryBtnText: { color: theme.colors.bg, fontWeight: "900", fontSize: 13, letterSpacing: 1.5 },
});

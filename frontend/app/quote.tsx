import { useState } from "react";
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../src/api";
import { useGate } from "../src/gate";
import { theme } from "../src/theme";

export default function QuoteScreen() {
  const router = useRouter();
  const { member } = useGate();
  const [description, setDescription] = useState("");
  const [budget, setBudget] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!member) return;
    if (description.trim().length < 10) {
      Alert.alert("Descrição curta", "Descreva o produto desejado com mais detalhes.");
      return;
    }
    setLoading(true);
    try {
      await api.requestQuote({
        member_id: member.member_id,
        description: description.trim(),
        budget: budget.trim() || undefined,
      });
      Alert.alert(
        "Solicitação enviada",
        "Você acompanhará o retorno no chat de suporte em instantes.",
        [{ text: "Abrir chat", onPress: () => router.replace("/chat") }],
      );
    } catch (e: any) {
      Alert.alert("Erro", e.message || "Não foi possível enviar.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
    >
      <Stack.Screen options={{ title: "Solicitar orçamento" }} />
      <SafeAreaView style={{ flex: 1 }} edges={["bottom"]}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Text style={styles.kicker}>CURADORIA SOB DEMANDA</Text>
          <Text style={styles.title}>SOLICITE O QUE{"\n"}NÃO ESTÁ NO APP.</Text>
          <Text style={styles.sub}>
            Descreva o produto e nossa equipe retorna com disponibilidade, marca sugerida e valor fechado para você.
          </Text>

          <View style={styles.field}>
            <Text style={styles.label}>PRODUTO / MARCA / OBJETIVO</Text>
            <TextInput
              testID="quote-description"
              style={[styles.input, { minHeight: 140, textAlignVertical: "top" }]}
              value={description}
              onChangeText={setDescription}
              placeholder="Ex: Retatrutida 10mg, marca Pharmaqo, para protocolo de 12 semanas."
              placeholderTextColor={theme.colors.textMuted}
              multiline
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>FAIXA DE ORÇAMENTO (OPCIONAL)</Text>
            <TextInput
              testID="quote-budget"
              style={styles.input}
              value={budget}
              onChangeText={setBudget}
              placeholder="Ex: até R$ 2.000"
              placeholderTextColor={theme.colors.textMuted}
            />
          </View>

          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={submit}
            disabled={loading}
            testID="quote-submit"
          >
            {loading ? <ActivityIndicator color={theme.colors.bg} /> : (
              <>
                <Ionicons name="send" size={15} color={theme.colors.bg} />
                <Text style={styles.primaryBtnText}>ENVIAR SOLICITAÇÃO</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: theme.spacing.lg, gap: theme.spacing.md },
  kicker: { color: theme.colors.silver, fontSize: 11, fontWeight: "800", letterSpacing: 3 },
  title: {
    color: theme.colors.white, fontSize: 30, fontWeight: "900",
    letterSpacing: -1.2, lineHeight: 32, marginTop: 6, textTransform: "uppercase",
  },
  sub: { color: theme.colors.textMuted, fontSize: 13, lineHeight: 20, marginTop: 8, marginBottom: theme.spacing.md },
  field: { gap: 8 },
  label: { color: theme.colors.silver, fontSize: 10, fontWeight: "800", letterSpacing: 2 },
  input: {
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: 8, padding: 14, color: theme.colors.text, fontSize: 14,
  },
  primaryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    backgroundColor: theme.colors.white, paddingVertical: 16, borderRadius: 8,
    marginTop: theme.spacing.md,
  },
  primaryBtnText: { color: theme.colors.bg, fontWeight: "900", fontSize: 13, letterSpacing: 1.5 },
});

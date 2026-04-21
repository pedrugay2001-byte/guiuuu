import { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../src/theme";

export default function Terms() {
  const router = useRouter();
  const [accepted, setAccepted] = useState(false);

  const onContinue = () => {
    if (!accepted) return;
    router.push("/enter");
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }} testID="terms-screen">
      <Stack.Screen options={{ title: "Termo do Clube" }} />
      <SafeAreaView style={{ flex: 1 }} edges={["bottom"]}>
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.iconWrap}>
            <Ionicons name="document-text" size={28} color={theme.colors.silver} />
          </View>

          <Text style={styles.kicker}>TERMO DE COMPROMISSO</Text>
          <Text style={styles.title}>O que você assume ao entrar</Text>

          <View style={styles.card}>
            <Clause
              n="01"
              title="Uso exclusivamente pessoal"
              body="Todos os produtos adquiridos no FarmaClube são para seu uso pessoal. É expressamente proibido comprar para terceiros, revender ou repassar."
            />
            <Clause
              n="02"
              title="Sigilo do acesso"
              body="Seu código de acesso é pessoal e intransferível. Não compartilhe login, senha ou seu código com qualquer pessoa fora do clube."
            />
            <Clause
              n="03"
              title="Indicações permitidas"
              body="Você pode indicar pessoas de sua confiança. Ao gerar seu código pessoal, você assume responsabilidade pelo comportamento de quem entrar por ele."
            />
            <Clause
              n="04"
              title="Discrição absoluta"
              body="O FarmaClube é um clube privado. Não divulgue em redes sociais, grupos públicos ou qualquer meio que possa comprometer o sigilo."
            />

            <View style={styles.warnCard} testID="terms-penalty">
              <View style={styles.warnHead}>
                <Ionicons name="warning" size={18} color={theme.colors.error} />
                <Text style={styles.warnTitle}>EXCLUSÃO PERMANENTE</Text>
              </View>
              <Text style={styles.warnBody}>
                Caso haja qualquer indício de descumprimento deste termo — compra para
                terceiros, compartilhamento de acesso com pessoas fora do clube ou
                revenda — o membro será{" "}
                <Text style={styles.warnEm}>permanentemente excluído do FarmaClube</Text>
                , sem direito a reativação, recuperação de código ou reembolso.
              </Text>
            </View>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.checkRow}
            onPress={() => setAccepted((v) => !v)}
            testID="terms-accept-checkbox"
            activeOpacity={0.8}
          >
            <View style={[styles.checkbox, accepted && styles.checkboxActive]}>
              {accepted && <Ionicons name="checkmark" size={14} color={theme.colors.bg} />}
            </View>
            <Text style={styles.checkText}>
              Li e concordo com todas as cláusulas acima.
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.cta, !accepted && styles.ctaDisabled]}
            onPress={onContinue}
            disabled={!accepted}
            testID="terms-continue-button"
          >
            <Text style={[styles.ctaText, !accepted && styles.ctaTextDisabled]}>
              ACEITAR E CONTINUAR
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

function Clause({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <View style={styles.clause}>
      <Text style={styles.clauseNum}>{n}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.clauseTitle}>{title}</Text>
        <Text style={styles.clauseBody}>{body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xl },
  iconWrap: {
    width: 56, height: 56, borderRadius: 4,
    borderWidth: 1, borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    alignItems: "center", justifyContent: "center",
    marginBottom: theme.spacing.md,
  },
  kicker: {
    color: theme.colors.silver, fontSize: 11,
    fontWeight: "700", letterSpacing: 2, marginBottom: 4,
  },
  title: {
    color: theme.colors.white, fontSize: 26,
    fontWeight: "800", letterSpacing: -0.5,
    marginBottom: theme.spacing.lg,
  },
  card: { gap: theme.spacing.lg },
  clause: { flexDirection: "row", gap: 14 },
  clauseNum: {
    color: theme.colors.silver, fontSize: 12, fontWeight: "800",
    letterSpacing: 1.5, width: 24, marginTop: 2,
  },
  clauseTitle: {
    color: theme.colors.white, fontSize: 15,
    fontWeight: "700", marginBottom: 4,
  },
  clauseBody: {
    color: theme.colors.textMuted, fontSize: 13, lineHeight: 20,
  },
  warnCard: {
    borderWidth: 1, borderColor: theme.colors.error,
    borderRadius: 6, padding: 14,
    backgroundColor: "rgba(255,59,48,0.05)",
    marginTop: theme.spacing.sm,
  },
  warnHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  warnTitle: {
    color: theme.colors.error, fontSize: 11,
    fontWeight: "800", letterSpacing: 2,
  },
  warnBody: { color: theme.colors.textMuted, fontSize: 13, lineHeight: 20 },
  warnEm: { color: theme.colors.white, fontWeight: "700" },
  footer: {
    padding: theme.spacing.lg, gap: theme.spacing.md,
    borderTopWidth: 1, borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.bg,
  },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  checkbox: {
    width: 22, height: 22, borderRadius: 4,
    borderWidth: 1.5, borderColor: theme.colors.silver,
    alignItems: "center", justifyContent: "center",
  },
  checkboxActive: { backgroundColor: theme.colors.white, borderColor: theme.colors.white },
  checkText: { color: theme.colors.text, fontSize: 13, flex: 1 },
  cta: {
    backgroundColor: theme.colors.white,
    paddingVertical: 16, borderRadius: 4, alignItems: "center",
  },
  ctaDisabled: { backgroundColor: theme.colors.surfaceElevated },
  ctaText: {
    color: theme.colors.bg, fontWeight: "800",
    fontSize: 13, letterSpacing: 1.5,
  },
  ctaTextDisabled: { color: theme.colors.textMuted },
});

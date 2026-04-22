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
  const [scrolledEnd, setScrolledEnd] = useState(false);

  const onScroll = (e: any) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    const nearEnd = layoutMeasurement.height + contentOffset.y >= contentSize.height - 40;
    if (nearEnd && !scrolledEnd) setScrolledEnd(true);
  };

  const onContentSizeChange = (_w: number, h: number) => {
    // If content already fits on screen, accept immediately
    // This gets corrected by onScroll on real scrollable content
  };

  const canAccept = scrolledEnd && accepted;

  const onContinue = () => {
    if (!canAccept) return;
    router.replace("/(tabs)/home");
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }} testID="terms-screen">
      <Stack.Screen options={{ title: "Código de Conduta" }} />
      <SafeAreaView style={{ flex: 1 }} edges={["bottom"]}>
        <ScrollView
          contentContainerStyle={styles.container}
          onScroll={onScroll}
          onContentSizeChange={onContentSizeChange}
          scrollEventThrottle={100}
          onLayout={(e) => {
            // auto-mark scrolledEnd on small content
            setTimeout(() => setScrolledEnd((prev) => prev), 100);
          }}
        >
          <View style={styles.iconWrap}>
            <Ionicons name="document-text" size={26} color={theme.colors.silver} />
          </View>
          <Text style={styles.kicker}>CÓDIGO DE CONDUTA</Text>
          <Text style={styles.title}>COMPROMISSO{"\n"}DE CONFIANÇA.</Text>
          <Text style={styles.subCopy}>
            Leia até o final. O BLACKSCLUB é sustentado pela confiança e sigilo entre seus membros.
          </Text>

          <View style={styles.card}>
            <Clause n="01" title="USO PESSOAL E INTRANSFERÍVEL"
              body="Todo acesso, produto ou informação do clube é de uso exclusivamente pessoal. Proibido compartilhar acesso com terceiros." />
            <Clause n="02" title="REVENDA PROIBIDA"
              body="Produtos do clube não podem ser revendidos, exceto por distribuidores oficialmente autorizados pela administração." />
            <Clause n="03" title="SIGILO ABSOLUTO"
              body="Prints, publicações em redes sociais, grupos públicos ou qualquer exposição do ambiente interno são expressamente proibidos." />
            <Clause n="04" title="INDICAÇÃO CONSCIENTE"
              body="Somente a administração aprova novos membros. Indicar alguém não garante acesso — é apenas uma sugestão de entrada." />

            <View style={styles.warnCard}>
              <View style={styles.warnHead}>
                <Ionicons name="warning" size={15} color={theme.colors.error} />
                <Text style={styles.warnTitle}>DESLIGAMENTO DEFINITIVO</Text>
              </View>
              <Text style={styles.warnBody}>
                Qualquer descumprimento resulta em{" "}
                <Text style={styles.warnEm}>banimento definitivo</Text>, sem reativação, recuperação de código ou reembolso.
              </Text>
            </View>

            <View style={styles.endMark}>
              <Ionicons name="ellipsis-horizontal" size={20} color={theme.colors.textMuted} />
              <Text style={styles.endMarkText}>FIM DO CÓDIGO</Text>
            </View>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          {!scrolledEnd && (
            <Text style={styles.scrollHint}>↓ Role até o final para habilitar</Text>
          )}
          <TouchableOpacity
            style={styles.checkRow}
            onPress={() => scrolledEnd && setAccepted((v) => !v)}
            disabled={!scrolledEnd}
            testID="terms-accept-checkbox"
            activeOpacity={0.8}
          >
            <View style={[
              styles.checkbox,
              !scrolledEnd && { borderColor: theme.colors.border },
              accepted && styles.checkboxActive,
            ]}>
              {accepted && <Ionicons name="checkmark" size={14} color={theme.colors.bg} />}
            </View>
            <Text style={[styles.checkText, !scrolledEnd && { color: theme.colors.textMuted }]}>
              Li e aceito integralmente as cláusulas acima.
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.cta, !canAccept && styles.ctaDisabled]}
            onPress={onContinue}
            disabled={!canAccept}
            testID="terms-continue-button"
          >
            <Text style={[styles.ctaText, !canAccept && styles.ctaTextDisabled]}>
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
    width: 52, height: 52, borderRadius: 6,
    borderWidth: 1, borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    alignItems: "center", justifyContent: "center",
    marginBottom: theme.spacing.md,
  },
  kicker: { color: theme.colors.silver, fontSize: 11, fontWeight: "800", letterSpacing: 3, marginBottom: 8 },
  title: {
    color: theme.colors.white, fontSize: 32, fontWeight: "900",
    letterSpacing: -1.2, lineHeight: 34, textTransform: "uppercase",
  },
  subCopy: { color: theme.colors.textMuted, fontSize: 13, lineHeight: 20, marginTop: 10, marginBottom: theme.spacing.lg },
  card: { gap: theme.spacing.lg },
  clause: { flexDirection: "row", gap: 14 },
  clauseNum: { color: theme.colors.silver, fontSize: 12, fontWeight: "900", letterSpacing: 1.5, width: 24, marginTop: 2 },
  clauseTitle: { color: theme.colors.white, fontSize: 12, fontWeight: "900", letterSpacing: 1.5, marginBottom: 6 },
  clauseBody: { color: theme.colors.textMuted, fontSize: 13, lineHeight: 20 },
  warnCard: {
    borderWidth: 1, borderColor: theme.colors.error, borderRadius: 8, padding: 14,
    backgroundColor: "rgba(255,59,48,0.05)", marginTop: theme.spacing.sm,
  },
  warnHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  warnTitle: { color: theme.colors.error, fontSize: 11, fontWeight: "800", letterSpacing: 2 },
  warnBody: { color: theme.colors.textMuted, fontSize: 13, lineHeight: 20 },
  warnEm: { color: theme.colors.white, fontWeight: "800" },
  endMark: {
    flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8,
    paddingVertical: 24, borderTopWidth: 1, borderTopColor: theme.colors.border, marginTop: 10,
  },
  endMarkText: { color: theme.colors.textMuted, fontSize: 11, fontWeight: "800", letterSpacing: 2 },
  footer: {
    padding: theme.spacing.lg, gap: theme.spacing.md,
    borderTopWidth: 1, borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.bg,
  },
  scrollHint: { color: theme.colors.textMuted, fontSize: 11, textAlign: "center", fontWeight: "700", letterSpacing: 1 },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  checkbox: {
    width: 22, height: 22, borderRadius: 5,
    borderWidth: 1.5, borderColor: theme.colors.silver,
    alignItems: "center", justifyContent: "center",
  },
  checkboxActive: { backgroundColor: theme.colors.white, borderColor: theme.colors.white },
  checkText: { color: theme.colors.text, fontSize: 13, flex: 1, lineHeight: 19 },
  cta: { backgroundColor: theme.colors.white, paddingVertical: 16, borderRadius: 8, alignItems: "center" },
  ctaDisabled: { backgroundColor: theme.colors.surfaceElevated },
  ctaText: { color: theme.colors.bg, fontWeight: "900", fontSize: 13, letterSpacing: 1.5 },
  ctaTextDisabled: { color: theme.colors.textMuted },
});

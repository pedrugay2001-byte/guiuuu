import { useRef, useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../../src/theme";

const AREAS = [
  {
    id: "suporte",
    title: "SUPORTE",
    subtitle: "Atendimento e relação com membros",
    description: "Responda chamados, envie mensagens, gerencie membros cadastrados e redefina senhas quando necessário.",
    icon: "headset" as const,
    color: "#7FD7E5",
    route: "/staff/login?area=suporte",
    enabled: true,
  },
  {
    id: "admin",
    title: "ADMINISTRAÇÃO",
    subtitle: "Gestão completa do clube",
    description: "Catálogo, pré-autorizações, gestão de membros, planos, equipe e configurações gerais.",
    icon: "shield-checkmark" as const,
    color: "#F5C150",
    route: "/staff/login?area=admin",
    enabled: true,
  },
  {
    id: "financeiro",
    title: "FINANCEIRO",
    subtitle: "Pagamentos e conciliação",
    description: "Receitas, pedidos pagos, mensalidades, acerto com membros e relatórios financeiros.",
    icon: "cash" as const,
    color: "#4EE07F",
    route: "/staff/login?area=financeiro",
    enabled: true,
  },
];

export default function StaffChoose() {
  const router = useRouter();

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
    >
      <Stack.Screen
        options={{
          title: "Voltar",
          headerTitleStyle: { color: theme.colors.white, fontWeight: "600", fontSize: 14, letterSpacing: 0 },
          headerBackTitle: "",
        }}
      />
      <SafeAreaView style={{ flex: 1 }} edges={["bottom"]}>
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.iconWrap}>
            <Ionicons name="shield-checkmark" size={28} color={theme.colors.silver} />
          </View>
          <Text style={styles.kicker}>ÁREA DA EQUIPE</Text>
          <Text style={styles.title}>QUEM VOCÊ É</Text>
          <Text style={styles.sub}>Selecione sua área de atuação para continuar.</Text>

          <View style={styles.list}>
            {AREAS.map((a) => (
              <TouchableOpacity
                key={a.id}
                style={[styles.card, { borderLeftColor: a.color, borderLeftWidth: 3 }]}
                onPress={() => router.push(a.route as any)}
                testID={`staff-choose-${a.id}`}
                activeOpacity={0.85}
              >
                <View style={[styles.cardIcon, { backgroundColor: a.color + "1A", borderColor: a.color + "66" }]}>
                  <Ionicons name={a.icon} size={22} color={a.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardTitle, { color: a.color }]}>{a.title}</Text>
                  <Text style={styles.cardSub}>{a.subtitle}</Text>
                  <Text numberOfLines={2} style={styles.cardDesc}>{a.description}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.footer}>
            <Ionicons name="information-circle-outline" size={14} color={theme.colors.textMuted} />
            <Text style={styles.footerText}>
              O acesso é liberado com base nas permissões vinculadas ao seu e-mail de equipe.
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: theme.spacing.lg, gap: theme.spacing.md, paddingBottom: 60 },
  iconWrap: {
    width: 56, height: 56, borderRadius: 8,
    borderWidth: 1, borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    alignItems: "center", justifyContent: "center",
    marginBottom: theme.spacing.md,
  },
  kicker: { color: theme.colors.silver, fontSize: 11, fontWeight: "800", letterSpacing: 3 },
  title: {
    color: theme.colors.white, fontSize: 34, fontWeight: "900",
    letterSpacing: -1.2, lineHeight: 36, marginTop: 6, textTransform: "uppercase",
  },
  sub: { color: theme.colors.textMuted, fontSize: 13, lineHeight: 20, marginTop: 8, marginBottom: theme.spacing.md },
  list: { gap: 10 },
  card: {
    flexDirection: "row", alignItems: "center", gap: 14,
    padding: 14, borderRadius: 12,
    backgroundColor: theme.colors.surface,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  cardIcon: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1.5,
  },
  cardTitle: { fontSize: 13, fontWeight: "900", letterSpacing: 2 },
  cardSub: { color: theme.colors.text, fontSize: 13, fontWeight: "700", marginTop: 2 },
  cardDesc: { color: theme.colors.textMuted, fontSize: 11, lineHeight: 16, marginTop: 4 },
  footer: {
    flexDirection: "row", gap: 8,
    marginTop: theme.spacing.lg,
    padding: 12, borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.02)",
    borderWidth: 1, borderColor: theme.colors.border,
    alignItems: "flex-start",
  },
  footerText: { color: theme.colors.textMuted, fontSize: 11, lineHeight: 16, flex: 1 },
});

import { View, Text, StyleSheet, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../../src/theme";

export default function Community() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }} edges={[]} testID="community-screen">
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.iconWrap}>
          <Ionicons name="people" size={36} color={theme.colors.silver} />
        </View>
        <Text style={styles.kicker}>COMUNIDADE PRIVADA</Text>
        <Text style={styles.title}>EM BREVE.</Text>
        <Text style={styles.text}>
          Um espaço restrito onde membros conversam, compartilham descobertas e constroem a irmandade BLACKSCLUB.
        </Text>
        <View style={styles.list}>
          <Row icon="chatbubbles-outline" label="Feed privado entre membros" />
          <Row icon="lock-closed-outline" label="Mensagens 1-a-1 com nickname" />
          <Row icon="sparkles-outline" label="Curadoria semanal de membros" />
        </View>
        <Text style={styles.footNote}>
          Estamos preparando este ambiente com calma. Você será avisado no chat de suporte quando abrir.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ icon, label }: { icon: any; label: string }) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={18} color={theme.colors.silver} />
      <Text style={styles.rowText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: theme.spacing.lg, gap: 16 },
  iconWrap: {
    width: 72, height: 72, borderRadius: 36,
    borderWidth: 1, borderColor: theme.colors.border,
    alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.surface,
    marginTop: theme.spacing.lg,
  },
  kicker: { color: theme.colors.silver, fontSize: 11, fontWeight: "800", letterSpacing: 3, marginTop: 8 },
  title: {
    color: theme.colors.white, fontSize: 40, fontWeight: "900",
    letterSpacing: -1.5, textTransform: "uppercase",
  },
  text: { color: theme.colors.textMuted, fontSize: 14, lineHeight: 22, marginTop: 4 },
  list: {
    marginTop: 12, gap: 2,
    borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10,
    backgroundColor: theme.colors.surface, overflow: "hidden",
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  rowText: { color: theme.colors.text, fontSize: 13, fontWeight: "600" },
  footNote: { color: theme.colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 16, fontStyle: "italic" },
});

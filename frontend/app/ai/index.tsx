import { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, Image, TouchableOpacity,
  ActivityIndicator, RefreshControl, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "../../src/icons";
import { api } from "../../src/api";
import { theme } from "../../src/theme";
import ScreenHeader from "../../src/screen-header";

type Specialist = {
  id: string;
  name: string;
  title: string;
  category?: string;
  tagline: string;
  description: string;
  color: string;
  avatar: string;
  starters: string[];
};

const CATEGORIES: { id: string; label: string; icon: string }[] = [
  { id: "fisico", label: "FÍSICO & SAÚDE", icon: "fitness" },
  { id: "mental", label: "MENTE & CIÊNCIA", icon: "bulb" },
  { id: "vida", label: "VIDA & EMERGÊNCIA", icon: "shield" },
  { id: "espiritual", label: "ESPIRITUAL", icon: "sparkles" },
];

export default function AISpecialists() {
  const router = useRouter();
  const [specialists, setSpecialists] = useState<Specialist[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await api.aiSpecialists();
      setSpecialists(list);
    } catch (e) {
      // graceful fallback
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  const onRefresh = () => { setRefreshing(true); load(); };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        {/* Botão voltar minimalista (substitui a faixa preta antiga) */}
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backFab}
          hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
        >
          <Ionicons name="chevron-back" size={22} color="#EEE" />
        </TouchableOpacity>
        {loading ? (
          <View style={styles.centerFill}>
            <ActivityIndicator color={theme.colors.white} />
          </View>
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl tintColor={theme.colors.white} refreshing={refreshing} onRefresh={onRefresh} />
            }
            contentContainerStyle={{ paddingBottom: 40 }}
          >
            {/* Hero */}
            <View style={styles.hero}>
              <View style={styles.heroGlow} />
              <View style={styles.heroBadge}>
                <Ionicons name="sparkles" size={12} color="#7FD7E5" />
                <Text style={styles.heroBadgeText}>INTELIGÊNCIA EXCLUSIVA</Text>
              </View>
              <Text style={styles.heroTitle}>BLACK AI</Text>
              <Text style={styles.heroSub}>
                Converse com uma equipe de especialistas virtuais de alto nível. Escolha o profissional certo para sua dúvida.
              </Text>
            </View>

            <Text style={styles.sectionLabel}>SELECIONE O ESPECIALISTA</Text>

            {/* Grouped by category */}
            {CATEGORIES.map((cat) => {
              const list = specialists.filter(s => (s.category || "fisico") === cat.id);
              if (!list.length) return null;
              return (
                <View key={cat.id} style={{ marginBottom: 6 }}>
                  <View style={styles.catHeader}>
                    <Ionicons name={cat.icon as any} size={14} color="#D4AF37" />
                    <Text style={styles.catLbl}>{cat.label}</Text>
                    <View style={styles.catLine} />
                  </View>
                  <View style={styles.list}>
                    {list.map((s) => (
                      <TouchableOpacity
                        key={s.id}
                        style={styles.card}
                        onPress={() => router.push({ pathname: "/ai/[specialist]", params: { specialist: s.id } })}
                        testID={`specialist-${s.id}`}
                        activeOpacity={0.9}
                      >
                        <View style={[styles.cardAccent, { backgroundColor: s.color }]} />
                        <View style={styles.cardRow}>
                          <View style={styles.avatarWrap}>
                            <Image source={{ uri: s.avatar }} style={styles.avatar} />
                            <View style={[styles.avatarRing, { borderColor: s.color }]} />
                            <View style={[styles.onlineDot, { backgroundColor: s.color }]} />
                          </View>
                          <View style={{ flex: 1, marginLeft: 14, minWidth: 0 }}>
                            <Text style={[styles.cardTitle, { color: s.color }]} numberOfLines={1}>{s.title.toUpperCase()}</Text>
                            <Text style={styles.cardName} numberOfLines={1} ellipsizeMode="tail">{s.name}</Text>
                            <Text style={styles.cardTagline} numberOfLines={2} ellipsizeMode="tail">{s.tagline}</Text>
                            <View style={styles.ctaRow}>
                              <Text style={styles.ctaText}>Conversar</Text>
                              <Ionicons name="arrow-forward" size={13} color="#888" />
                            </View>
                          </View>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              );
            })}

            <View style={styles.disclaimer}>
              <Ionicons name="shield-checkmark" size={14} color={theme.colors.textMuted} />
              <Text style={styles.disclaimerText}>
                Os especialistas da BLACK AI oferecem orientação educativa. Nunca substituem avaliação presencial com profissional habilitado.
              </Text>
            </View>
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  centerFill: { flex: 1, alignItems: "center", justifyContent: "center" },
  backFab: {
    position: "absolute", top: 8, left: 12, zIndex: 10,
    width: 36, height: 36, borderRadius: 18,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(20,20,20,0.9)",
    borderWidth: 1, borderColor: "#222",
  },
  hero: {
    marginHorizontal: theme.spacing.lg, marginTop: theme.spacing.sm,
    padding: 22, borderRadius: 16, overflow: "hidden",
    backgroundColor: "#0A0A0A", borderWidth: 1, borderColor: "#1F1F1F",
    position: "relative", marginBottom: theme.spacing.lg,
  },
  heroGlow: {
    position: "absolute", top: -60, right: -60, width: 200, height: 200, borderRadius: 100,
    backgroundColor: "#7FD7E5", opacity: 0.1,
  },
  heroBadge: {
    flexDirection: "row", alignItems: "center", gap: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
    backgroundColor: "rgba(127,215,229,0.12)",
    borderWidth: 1, borderColor: "rgba(127,215,229,0.35)",
    marginBottom: 12,
  },
  heroBadgeText: { color: "#7FD7E5", fontSize: 9, fontWeight: "900", letterSpacing: 2 },
  heroTitle: {
    color: theme.colors.white, fontSize: 34, fontWeight: "900",
    letterSpacing: 4, marginBottom: 8,
  },
  heroSub: { color: theme.colors.textMuted, fontSize: 13, lineHeight: 19 },
  sectionLabel: {
    color: theme.colors.silver, fontSize: 10, fontWeight: "800",
    letterSpacing: 3, paddingHorizontal: theme.spacing.lg, marginBottom: 12,
  },
  list: { paddingHorizontal: theme.spacing.lg, gap: 12 },
  card: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: 14, overflow: "hidden",
    position: "relative",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 3 },
    }),
  },
  cardAccent: {
    position: "absolute", left: 0, top: 0, bottom: 0, width: 3,
  },
  cardRow: { flexDirection: "row", padding: 14, alignItems: "center" },
  avatarWrap: { width: 72, height: 72, position: "relative" },
  avatar: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: theme.colors.surfaceElevated,
  },
  avatarRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 36,
    borderWidth: 2,
    opacity: 0.55,
  },
  onlineDot: {
    position: "absolute", bottom: 2, right: 2,
    width: 14, height: 14, borderRadius: 7,
    borderWidth: 2, borderColor: theme.colors.surface,
  },
  titleRow: { flexDirection: "row", alignItems: "center", marginBottom: 2 },
  cardTitle: { fontSize: 10, fontWeight: "900", letterSpacing: 2 },
  cardName: { color: theme.colors.white, fontSize: 16, fontWeight: "800", marginTop: 2 },
  cardTagline: { color: "#CCC", fontSize: 13, lineHeight: 18, marginTop: 4, fontWeight: "500" },
  cardDesc: { color: theme.colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 4 },
  ctaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 10 },
  ctaText: { fontSize: 11, fontWeight: "900", letterSpacing: 1.5, color: "#888" },
  catHeader: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: theme.spacing.lg, marginTop: 18, marginBottom: 10 },
  catLbl: { color: "#D4AF37", fontSize: 10, fontWeight: "900", letterSpacing: 2.5 },
  catLine: { flex: 1, height: 1, backgroundColor: "#1A1A1A" },
  disclaimer: {
    flexDirection: "row", gap: 8,
    marginHorizontal: theme.spacing.lg, marginTop: theme.spacing.lg,
    padding: 14, borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.02)",
    borderWidth: 1, borderColor: theme.colors.border,
    alignItems: "flex-start",
  },
  disclaimerText: {
    color: theme.colors.textMuted, fontSize: 11, lineHeight: 16, flex: 1,
  },
});

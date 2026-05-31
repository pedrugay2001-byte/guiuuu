import { useCallback, useState, useMemo } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  RefreshControl, Alert, TextInput, Image, KeyboardAvoidingView, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "../../src/icons";
import { api } from "../../src/api";
import type { PublisherMember } from "../../src/api";

const TIER_COLORS: Record<string, string> = {
  diamond: "#C5D1DA",
  gold: "#F5C150",
  silver: "#A8B2BD",
  black: "#666",
};

/**
 * Painel de Publicadores — apenas admin/staff.
 * - Lista todos os membros com permissão de publicar (`can_post_ads = true`)
 * - Busca por nome/email/cidade entre TODOS os membros para conceder permissão
 * - Revoga com 1 clique
 */
export default function StaffPublishers() {
  const router = useRouter();
  const [publishers, setPublishers] = useState<PublisherMember[]>([]);
  const [allMembers, setAllMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pub, members] = await Promise.all([
        api.listPublishers(),
        api.adminMembers().catch(() => [] as any[]),
      ]);
      setPublishers(pub.publishers || []);
      setAllMembers(members || []);
    } catch (e: any) {
      if (String(e.message || "").toLowerCase().includes("staff")) {
        Alert.alert("Acesso negado", "Apenas staff/admin podem acessar.");
        router.replace("/staff/dashboard");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Filtro de busca: mostra TODOS os membros que NÃO são publishers
  // e que casam com o termo (nome, email, cidade)
  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || q.length < 2) return [];
    const publisherIds = new Set(publishers.map((p) => p.member_id));
    return allMembers
      .filter((m) => !publisherIds.has(m.member_id))
      .filter((m) =>
        (m.name || "").toLowerCase().includes(q) ||
        (m.nickname || "").toLowerCase().includes(q) ||
        (m.email || "").toLowerCase().includes(q) ||
        (m.city || "").toLowerCase().includes(q)
      )
      .slice(0, 20);
  }, [search, allMembers, publishers]);

  const grant = async (m: any) => {
    Alert.alert(
      "Conceder permissão?",
      `${m.name} (${m.tier?.toUpperCase() || "—"})\n\n${m.email || ""}\n\nSerá autorizado a publicar anúncios no marketplace ${m.tier} ou inferior.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "CONCEDER",
          style: "default",
          onPress: async () => {
            setBusyId(m.member_id);
            try {
              await api.grantPublisher(m.member_id);
              setSearch("");
              load();
            } catch (e: any) {
              Alert.alert("Erro", e.message || "Falha ao conceder");
            } finally {
              setBusyId(null);
            }
          },
        },
      ],
    );
  };

  const revoke = async (m: PublisherMember) => {
    Alert.alert(
      "Revogar permissão?",
      `${m.name}\n\nNão poderá mais publicar novos anúncios. Os anúncios já publicados continuam ativos.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "REVOGAR",
          style: "destructive",
          onPress: async () => {
            setBusyId(m.member_id);
            try {
              await api.revokePublisher(m.member_id);
              load();
            } catch (e: any) {
              Alert.alert("Erro", e.message || "Falha ao revogar");
            } finally {
              setBusyId(null);
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={st.container} edges={["top", "bottom"]}>
      <Stack.Screen
        options={{ title: "Publicadores", headerStyle: { backgroundColor: "#050505" }, headerTintColor: "#FFF" }}
      />

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#FFF" />}
        >
          {/* Hero info */}
          <View style={st.hero}>
            <Ionicons name="megaphone" size={26} color="#F5C150" />
            <View style={{ flex: 1 }}>
              <Text style={st.heroTitle}>QUEM PODE PUBLICAR</Text>
              <Text style={st.heroSub}>
                Membros confiáveis autorizados pelo admin a criar anúncios no marketplace.
                Eles publicam apenas no próprio tier ou inferior.
              </Text>
            </View>
          </View>

          {/* Lista de publicadores ativos */}
          <Text style={st.sectionLbl}>PUBLICADORES ATIVOS ({publishers.length})</Text>
          {loading && publishers.length === 0 ? (
            <ActivityIndicator color="#F5C150" style={{ marginVertical: 30 }} />
          ) : publishers.length === 0 ? (
            <View style={st.empty}>
              <Ionicons name="document-outline" size={40} color="#333" />
              <Text style={st.emptyTxt}>Nenhum membro com permissão ainda.</Text>
            </View>
          ) : (
            publishers.map((p) => (
              <PublisherCard
                key={p.member_id}
                m={p}
                busy={busyId === p.member_id}
                onRevoke={() => revoke(p)}
              />
            ))
          )}

          {/* Busca para conceder permissão a outro membro */}
          <Text style={[st.sectionLbl, { marginTop: 26 }]}>CONCEDER PERMISSÃO</Text>
          <View style={st.searchRow}>
            <Ionicons name="search" size={16} color="#888" style={{ marginLeft: 12 }} />
            <TextInput
              style={st.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Buscar por nome, email ou cidade..."
              placeholderTextColor="#555"
              autoCapitalize="none"
              testID="pub-search"
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch("")} style={{ paddingHorizontal: 10 }}>
                <Ionicons name="close-circle" size={18} color="#666" />
              </TouchableOpacity>
            )}
          </View>

          {search.trim().length >= 2 && (
            searchResults.length === 0 ? (
              <Text style={st.searchEmpty}>Nenhum membro encontrado para &ldquo;{search}&rdquo;.</Text>
            ) : (
              searchResults.map((m) => (
                <CandidateCard
                  key={m.member_id}
                  m={m}
                  busy={busyId === m.member_id}
                  onGrant={() => grant(m)}
                />
              ))
            )
          )}

          {search.trim().length < 2 && (
            <Text style={st.tipTxt}>
              Digite pelo menos 2 caracteres para buscar entre todos os membros do clube.
            </Text>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ============================================================================
function PublisherCard({ m, busy, onRevoke }: { m: PublisherMember; busy: boolean; onRevoke: () => void }) {
  const tierColor = TIER_COLORS[m.tier] || "#888";
  return (
    <View style={st.card}>
      <Avatar uri={m.avatar_base64} size={42} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <View style={st.cardTopRow}>
          <Text style={st.cardName}>{m.name}</Text>
          <View style={[st.tierTag, { borderColor: tierColor }]}>
            <Text style={[st.tierTagTxt, { color: tierColor }]}>{m.tier?.toUpperCase()}</Text>
          </View>
        </View>
        <Text style={st.cardEmail}>{m.email || m.nickname || "—"}</Text>
        {m.city && <Text style={st.cardMeta}>📍 {m.city}{m.state ? `/${m.state}` : ""}</Text>}
      </View>
      <TouchableOpacity
        onPress={onRevoke}
        style={[st.btnRevoke, busy && { opacity: 0.5 }]}
        disabled={busy}
        activeOpacity={0.75}
        testID={`pub-revoke-${m.member_id}`}
      >
        {busy ? (
          <ActivityIndicator color="#F87171" size="small" />
        ) : (
          <>
            <Ionicons name="close-circle" size={14} color="#F87171" />
            <Text style={st.btnRevokeTxt}>REVOGAR</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

function CandidateCard({ m, busy, onGrant }: { m: any; busy: boolean; onGrant: () => void }) {
  const tierColor = TIER_COLORS[m.tier] || "#888";
  return (
    <View style={st.card}>
      <Avatar uri={m.avatar_base64} size={42} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <View style={st.cardTopRow}>
          <Text style={st.cardName}>{m.name}</Text>
          <View style={[st.tierTag, { borderColor: tierColor }]}>
            <Text style={[st.tierTagTxt, { color: tierColor }]}>{(m.tier || "—").toUpperCase()}</Text>
          </View>
        </View>
        <Text style={st.cardEmail}>{m.email || "—"}</Text>
        {m.city && <Text style={st.cardMeta}>📍 {m.city}{m.state ? `/${m.state}` : ""}</Text>}
      </View>
      <TouchableOpacity
        onPress={onGrant}
        style={[st.btnGrant, busy && { opacity: 0.5 }]}
        disabled={busy}
        activeOpacity={0.85}
        testID={`pub-grant-${m.member_id}`}
      >
        {busy ? (
          <ActivityIndicator color="#000" size="small" />
        ) : (
          <>
            <Ionicons name="checkmark-circle" size={14} color="#000" />
            <Text style={st.btnGrantTxt}>CONCEDER</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

function Avatar({ uri, size }: { uri?: string | null; size: number }) {
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: "#1A1A1A" }}
      />
    );
  }
  return (
    <View style={[st.avatarFallback, { width: size, height: size, borderRadius: size / 2 }]}>
      <Ionicons name="person" size={size * 0.55} color="#666" />
    </View>
  );
}

// ============================================================================
const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#050505" },

  hero: {
    flexDirection: "row", alignItems: "center", gap: 14,
    backgroundColor: "#0A0A0A",
    borderWidth: 1, borderColor: "#F5C15022",
    borderRadius: 12, padding: 14, marginBottom: 18,
  },
  heroTitle: { color: "#F5C150", fontSize: 12, fontWeight: "900", letterSpacing: 1.5, marginBottom: 4 },
  heroSub: { color: "#999", fontSize: 11, lineHeight: 15 },

  sectionLbl: { color: "#777", fontSize: 10, fontWeight: "900", letterSpacing: 2, marginBottom: 10 },

  card: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#0A0A0A",
    borderWidth: 1, borderColor: "#1A1A1A",
    borderRadius: 12, padding: 12,
    marginBottom: 10,
  },
  avatarFallback: {
    backgroundColor: "#1A1A1A", alignItems: "center", justifyContent: "center",
  },
  cardTopRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardName: { color: "#F5F5F5", fontSize: 13, fontWeight: "800", flex: 1 },
  cardEmail: { color: "#888", fontSize: 11, marginTop: 2 },
  cardMeta: { color: "#666", fontSize: 10, marginTop: 2 },

  tierTag: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4, borderWidth: 1 },
  tierTagTxt: { fontSize: 9, fontWeight: "900", letterSpacing: 1 },

  btnRevoke: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingVertical: 9, paddingHorizontal: 12,
    borderWidth: 1, borderColor: "#F8717155", borderRadius: 8,
    backgroundColor: "#F8717110",
  },
  btnRevokeTxt: { color: "#F87171", fontSize: 10, fontWeight: "900", letterSpacing: 0.5 },

  btnGrant: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingVertical: 9, paddingHorizontal: 12,
    backgroundColor: "#F5C150", borderRadius: 8,
  },
  btnGrantTxt: { color: "#000", fontSize: 10, fontWeight: "900", letterSpacing: 0.5 },

  searchRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#0E0E0E",
    borderWidth: 1, borderColor: "#1F1F1F",
    borderRadius: 10,
    marginBottom: 14,
  },
  searchInput: { flex: 1, color: "#FFF", paddingVertical: 12, paddingHorizontal: 10, fontSize: 13 },
  searchEmpty: { color: "#666", fontSize: 12, textAlign: "center", paddingVertical: 24 },
  tipTxt: { color: "#555", fontSize: 11, fontStyle: "italic", textAlign: "center", paddingVertical: 8 },

  empty: { alignItems: "center", paddingVertical: 30, gap: 10 },
  emptyTxt: { color: "#555", fontSize: 12 },
});

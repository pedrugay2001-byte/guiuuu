import { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ActivityIndicator, Alert,
} from "react-native";
import { Ionicons } from "./icons";
import { api } from "./api";
import { theme, TIERS, TierId } from "./theme";

// Tipo do membro retornado por /api/admin/members
type RegisteredMember = {
  member_id: string;
  name?: string;
  email?: string;
  phone?: string;
  tier?: TierId;
  code?: string;
  active?: boolean;
  performance_access?: boolean;
  avatar_base64?: string;
};

/**
 * Painel para gerenciar acessos especiais por nicho (atualmente: Performance Humana).
 * Lista todos os membros registrados com toggle para liberar/revogar acesso ao
 * Performance — chama POST /api/admin/members/grant-niche-access.
 */
export default function AdminPerformanceAccessManager() {
  const [members, setMembers] = useState<RegisteredMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [grantingId, setGrantingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.adminListMembers();
      setMembers(Array.isArray(data) ? data : []);
    } catch (e: any) {
      Alert.alert("Erro ao carregar", e?.message || "Tente novamente");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleAccess = async (m: RegisteredMember) => {
    const willGrant = !m.performance_access;
    setGrantingId(m.member_id);
    try {
      await api.adminGrantNicheAccess({
        identifier: m.member_id,
        niche: "performance",
        grant: willGrant,
      });
      // Atualiza local (não recarrega lista inteira pra UI ficar fluida)
      setMembers((prev) =>
        prev.map((x) =>
          x.member_id === m.member_id ? { ...x, performance_access: willGrant } : x,
        ),
      );
    } catch (e: any) {
      Alert.alert("Erro", e?.message || "Não foi possível atualizar");
    } finally {
      setGrantingId(null);
    }
  };

  // Filtro client-side por nome, email ou código
  const q = search.trim().toLowerCase();
  const filtered = !q ? members : members.filter((m) =>
    (m.name || "").toLowerCase().includes(q) ||
    (m.email || "").toLowerCase().includes(q) ||
    (m.code || "").toLowerCase().includes(q),
  );

  return (
    <View>
      <View style={{ gap: 4, marginTop: 8 }}>
        <Text style={s.kicker}>ACESSO RESTRITO</Text>
        <Text style={s.title}>PERFORMANCE HUMANA</Text>
        <Text style={s.sub}>
          Libere o acesso ao nicho Performance para membros específicos. O membro precisa
          fazer login novamente para a permissão refletir no app.
        </Text>
      </View>

      <View style={s.searchBox}>
        <Ionicons name="search" size={14} color={theme.colors.textMuted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar por nome, email ou código..."
          placeholderTextColor={theme.colors.textMuted}
          style={s.searchInput}
          autoCapitalize="none"
        />
      </View>

      {loading ? (
        <ActivityIndicator color={theme.colors.white} style={{ marginTop: 14 }} />
      ) : filtered.length === 0 ? (
        <Text style={{ color: theme.colors.textMuted, fontSize: 13, marginTop: 12 }}>
          {q ? "Nenhum membro encontrado." : "Nenhum membro registrado ainda."}
        </Text>
      ) : (
        <View style={{ gap: 8, marginTop: 10 }}>
          {filtered.map((m) => {
            const t = TIERS[(m.tier as TierId) || "black"] || TIERS.black;
            const granted = !!m.performance_access;
            const loading_ = grantingId === m.member_id;
            return (
              <View key={m.member_id} style={s.row}>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowName} numberOfLines={1}>{m.name || "Sem nome"}</Text>
                  <Text style={s.rowMeta} numberOfLines={1}>
                    {m.email || "—"}{m.code ? ` · #${m.code}` : ""}
                  </Text>
                  <View style={s.rowFoot}>
                    <View style={[s.tierPill, { borderColor: t.color }]}>
                      <Ionicons name={t.icon as any} size={9} color={t.color} />
                      <Text style={[s.tierPillText, { color: t.color }]}>{t.label.toUpperCase()}</Text>
                    </View>
                    {granted && (
                      <View style={s.grantedPill}>
                        <Ionicons name="checkmark-circle" size={10} color="#4FD1C5" />
                        <Text style={s.grantedTxt}>PERFORMANCE</Text>
                      </View>
                    )}
                  </View>
                </View>
                <TouchableOpacity
                  onPress={() => toggleAccess(m)}
                  disabled={loading_}
                  style={[
                    s.toggleBtn,
                    granted ? s.toggleBtnRevoke : s.toggleBtnGrant,
                  ]}
                  testID={`grant-perf-${m.member_id}`}
                >
                  {loading_ ? (
                    <ActivityIndicator color={granted ? "#FFB3AA" : "#0A0A0A"} size="small" />
                  ) : (
                    <>
                      <Ionicons
                        name={granted ? "lock-closed-outline" : "lock-open"}
                        size={12}
                        color={granted ? "#E74C3C" : "#0A0A0A"}
                      />
                      <Text
                        style={[
                          s.toggleBtnTxt,
                          { color: granted ? "#FFB3AA" : "#0A0A0A" },
                        ]}
                      >
                        {granted ? "REVOGAR" : "LIBERAR"}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  kicker: { color: theme.colors.silver, fontSize: 11, fontWeight: "800", letterSpacing: 3 },
  title: {
    color: theme.colors.white, fontSize: 22, fontWeight: "900",
    letterSpacing: -0.4, marginTop: 4, textTransform: "uppercase",
  },
  sub: { color: theme.colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  searchBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#0B0D10",
    borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8,
    paddingHorizontal: 12, marginTop: 14,
  },
  searchInput: {
    flex: 1, color: theme.colors.text, fontSize: 13,
    paddingVertical: 10,
  },
  row: {
    flexDirection: "row", alignItems: "center", gap: 8,
    padding: 12, backgroundColor: theme.colors.surface,
    borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10,
  },
  rowName: { color: theme.colors.white, fontSize: 13, fontWeight: "800" },
  rowMeta: { color: theme.colors.textMuted, fontSize: 11, marginTop: 2 },
  rowFoot: { flexDirection: "row", gap: 6, marginTop: 6, flexWrap: "wrap" },
  tierPill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 4, borderWidth: 1,
  },
  tierPillText: { fontSize: 8, fontWeight: "900", letterSpacing: 0.6 },
  grantedPill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 4, borderWidth: 1, borderColor: "#4FD1C566",
    backgroundColor: "rgba(79,209,197,0.08)",
  },
  grantedTxt: { color: "#4FD1C5", fontSize: 8, fontWeight: "900", letterSpacing: 0.6 },
  toggleBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 12, paddingVertical: 9,
    borderRadius: 6, minWidth: 110, justifyContent: "center",
  },
  toggleBtnGrant: { backgroundColor: "#4FD1C5" },
  toggleBtnRevoke: {
    backgroundColor: "rgba(231, 76, 60, 0.12)",
    borderWidth: 1, borderColor: "#E74C3C66",
  },
  toggleBtnTxt: { fontSize: 10, fontWeight: "900", letterSpacing: 0.8 },
});

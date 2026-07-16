import React, { useCallback, useState, useMemo } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, KeyboardAvoidingView, Platform, Modal, Image,
} from "react-native";
import { useRouter, useFocusEffect, Stack } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "../../src/icons";
import { api } from "../../src/api";
import { TIERS, TierId } from "../../src/theme";
import ScreenHeader from "../../src/screen-header";
import { notify } from "../../src/alerts";
import { formatPYX, maskPYXInput, maskedToCents } from "../../src/pyx";

type Member = {
  member_id: string;
  name: string;
  email?: string;
  phone?: string;
  tier: TierId;
  avatar_base64?: string | null;
};

const GOLD = "#D4AF37";
const GREEN = "#2ECC71";
const BG = "#050505";

/**
 * ADMIN · CRÉDITO PYX TOKEN (PYX)
 *
 * Lista todos os membros do clube e permite ao staff/admin/financeiro
 * creditar PYX (moeda interna) na carteira de cada membro.
 *
 * Valores em centavos para precisão total (1 PYX = 100 centavos).
 * Endpoint backend: POST /api/wallet/topup  (require_staff).
 */
export default function AdminWallet() {
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Member | null>(null);
  const [selectedWallet, setSelectedWallet] = useState<string>("");
  const [masked, setMasked] = useState("0,00");
  const [saving, setSaving] = useState(false);
  const [balances, setBalances] = useState<Record<string, number>>({}); // em centavos

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.adminMembers();
      setMembers(list as Member[]);
      // Busca saldo PYX em centavos dos 30 primeiros membros em paralelo
      const slice = (list as Member[]).slice(0, 30);
      const results = await Promise.all(
        slice.map(async (m) => {
          try {
            const w = await api.pyxWallet(m.member_id);
            return [m.member_id, w.balance_centavos] as const;
          } catch { return [m.member_id, 0] as const; }
        })
      );
      const b: Record<string, number> = {};
      for (const [id, v] of results) b[id] = v;
      setBalances(b);
    } catch (e: any) {
      const msg = String(e?.message || "").toLowerCase();
      if (msg.includes("staff") || msg.includes("401") || msg.includes("403")) {
        notify("Acesso negado", "Faça login como staff/admin.");
        setTimeout(() => router.replace("/staff/login" as any), 500);
      } else {
        notify("Erro", e?.message || "Falha ao carregar membros");
      }
    } finally {
      setLoading(false);
    }
  }, [router]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter(m =>
      m.name.toLowerCase().includes(q) ||
      (m.email || "").toLowerCase().includes(q) ||
      (m.phone || "").includes(q)
    );
  }, [members, query]);

  const openTopup = async (m: Member) => {
    setSelected(m);
    setMasked("0,00");
    setSelectedWallet("");
    // Busca saldo + número de carteira atualizados
    try {
      const w = await api.pyxWallet(m.member_id);
      setBalances(b => ({ ...b, [m.member_id]: w.balance_centavos }));
      setSelectedWallet(w.wallet_number || "");
    } catch {}
  };

  const confirmTopup = async () => {
    if (!selected) return;
    const cents = maskedToCents(masked);
    if (cents <= 0 || cents > 100_000_000) {
      return notify("Valor inválido", "Informe um valor maior que zero.");
    }
    setSaving(true);
    try {
      await api.walletTopupCents(selected.member_id, cents);
      setBalances(b => ({ ...b, [selected.member_id]: (b[selected.member_id] || 0) + cents }));
      notify("Crédito realizado!", `+${formatPYX(cents)} PYX para ${selected.name}.`);
      setSelected(null);
      setMasked("0,00");
    } catch (e: any) {
      notify("Erro", e?.message || "Falha ao creditar");
    } finally { setSaving(false); }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1, backgroundColor: BG }}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Crédito PYX Token" subtitle="Adicionar PYX à carteira dos membros" />

      <View style={st.searchBox}>
        <Ionicons name="search" size={16} color="#888" />
        <TextInput
          style={st.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar por nome, email ou telefone..."
          placeholderTextColor="#666"
          autoCapitalize="none"
        />
        {query ? (
          <TouchableOpacity onPress={() => setQuery("")}>
            <Ionicons name="close-circle" size={16} color="#888" />
          </TouchableOpacity>
        ) : null}
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={GOLD} />
          <Text style={{ color: "#888", marginTop: 10, fontSize: 12 }}>Carregando membros...</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40, gap: 8 }}>
          {filtered.length === 0 && (
            <Text style={{ color: "#888", textAlign: "center", marginTop: 30 }}>
              Nenhum membro encontrado.
            </Text>
          )}
          {filtered.map((m) => {
            const tier = TIERS[m.tier] || TIERS.black;
            const bal = balances[m.member_id];
            return (
              <View key={m.member_id} style={st.row}>
                {m.avatar_base64 ? (
                  <Image source={{ uri: m.avatar_base64 }} style={st.avatar} />
                ) : (
                  <View style={[st.avatar, { alignItems: "center", justifyContent: "center", backgroundColor: "#1A1A1A" }]}>
                    <Text style={{ color: "#FFF", fontWeight: "900" }}>{m.name.charAt(0).toUpperCase()}</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={st.name} numberOfLines={1}>{m.name}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 3 }}>
                    <View style={[st.tierPill, { borderColor: tier.color }]}>
                      <Ionicons name={tier.icon as any} size={8} color={tier.color} />
                      <Text style={[st.tierPillTxt, { color: tier.color }]}>{tier.label.toUpperCase()}</Text>
                    </View>
                    <Text style={st.balance}>
                      {typeof bal === "number" ? `${formatPYX(bal)} PYX` : "— PYX"}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={st.addBtn}
                  onPress={() => openTopup(m)}
                  activeOpacity={0.85}
                  testID={`topup-${m.member_id}`}
                >
                  <Ionicons name="add-circle" size={18} color="#000" />
                  <Text style={st.addBtnTxt}>CREDITAR</Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* MODAL DE CRÉDITO */}
      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
          <View style={st.modalBackdrop}>
            <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => !saving && setSelected(null)} />
            <View style={st.modalCard}>
              <View style={st.modalHead}>
                <View style={{ flex: 1 }}>
                  <Text style={st.modalKicker}>CREDITAR PYX TOKEN</Text>
                  <Text style={st.modalTitle} numberOfLines={1}>{selected?.name}</Text>
                  <Text style={st.modalSub}>
                    Saldo atual: {selected ? formatPYX(balances[selected.member_id] || 0) : "0,00"} PYX
                  </Text>
                  {selectedWallet ? (
                    <Text style={st.modalWallet}>{selectedWallet}</Text>
                  ) : null}
                </View>
                <TouchableOpacity onPress={() => !saving && setSelected(null)} style={st.closeBtn} hitSlop={10}>
                  <Ionicons name="close" size={22} color="#FFF" />
                </TouchableOpacity>
              </View>

              <Text style={st.inpLbl}>VALOR EM PYX (CENTAVOS AUTOM.)</Text>
              <View style={st.inpBox}>
                <TextInput
                  style={st.inp}
                  value={masked}
                  onChangeText={(t) => setMasked(maskPYXInput(t))}
                  placeholder="0,00"
                  placeholderTextColor="#3A3A3A"
                  keyboardType="number-pad"
                  autoFocus
                  selectTextOnFocus
                />
                <Text style={st.inpUnit}>PYX</Text>
              </View>

              {/* Atalhos */}
              <View style={st.quickRow}>
                {[10000, 50000, 100000, 500000, 1000000].map(c => (
                  <TouchableOpacity key={c} onPress={() => setMasked(maskPYXInput(String(c)))} style={st.quickChip}>
                    <Text style={st.quickChipTxt}>+{formatPYX(c)}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={[st.confirmBtn, saving && { opacity: 0.5 }]}
                onPress={confirmTopup}
                disabled={saving}
                activeOpacity={0.88}
              >
                {saving ? <ActivityIndicator color="#000" /> : (
                  <>
                    <MaterialCommunityIcons name="hand-coin" size={18} color="#000" />
                    <Text style={st.confirmBtnTxt}>CONFIRMAR CRÉDITO</Text>
                  </>
                )}
              </TouchableOpacity>
              <Text style={st.hint}>
                Registrado com seu usuário de staff. O membro verá o crédito no Extrato PYX imediatamente.
              </Text>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  searchBox: {
    flexDirection: "row", alignItems: "center", gap: 10,
    marginHorizontal: 14, marginTop: 10, paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 10, backgroundColor: "#0D0D0D",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
  },
  searchInput: { flex: 1, color: "#FFF", fontSize: 13.5, padding: 0 },

  row: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: "#0B0B0B", borderRadius: 12,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.05)",
  },
  avatar: { width: 42, height: 42, borderRadius: 21, overflow: "hidden" },
  name: { color: "#FFF", fontSize: 13.5, fontWeight: "700" },
  tierPill: {
    flexDirection: "row", alignItems: "center", gap: 3,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10, borderWidth: 1,
  },
  tierPillTxt: { fontSize: 8.5, fontWeight: "900", letterSpacing: 0.8 },
  balance: { color: GOLD, fontSize: 11, fontWeight: "800" },
  addBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 9, borderRadius: 8, backgroundColor: GREEN,
  },
  addBtnTxt: { color: "#000", fontSize: 10.5, fontWeight: "900", letterSpacing: 0.8 },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.72)", justifyContent: "flex-end" },
  modalCard: {
    backgroundColor: "#0B0B0B", borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderTopWidth: 1, borderColor: "rgba(212,175,55,0.3)",
    paddingHorizontal: 20, paddingTop: 18, paddingBottom: 22,
  },
  modalHead: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)",
    marginBottom: 14,
  },
  modalKicker: { color: GOLD, fontSize: 10, fontWeight: "900", letterSpacing: 2 },
  modalTitle: { color: "#FFF", fontSize: 16, fontWeight: "800", marginTop: 3 },
  modalSub: { color: "#8A8A8A", fontSize: 11.5, marginTop: 2, fontWeight: "600" },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
  },

  inpLbl: { color: "#888", fontSize: 10, fontWeight: "900", letterSpacing: 2, marginBottom: 6 },
  inpBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#141414", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 10, paddingHorizontal: 14,
  },
  inp: {
    flex: 1, color: "#FFF", fontSize: 22, fontWeight: "800",
    paddingVertical: 14, textAlign: "right",
  },
  inpUnit: { color: GOLD, fontSize: 13, fontWeight: "900", letterSpacing: 1.5 },
  modalWallet: { color: GOLD, fontSize: 11, fontWeight: "800", letterSpacing: 1.5, marginTop: 4 },
  quickRow: { flexDirection: "row", gap: 6, marginTop: 10, flexWrap: "wrap" },
  quickChip: {
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 6, backgroundColor: "#181818",
    borderWidth: 1, borderColor: "rgba(212,175,55,0.2)",
  },
  quickChipTxt: { color: GOLD, fontSize: 11, fontWeight: "800" },

  confirmBtn: {
    marginTop: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 14, borderRadius: 10, backgroundColor: GOLD,
  },
  confirmBtnTxt: { color: "#000", fontSize: 13, fontWeight: "900", letterSpacing: 1.5 },
  hint: { color: "#666", fontSize: 10.5, marginTop: 10, fontStyle: "italic", textAlign: "center" },
});

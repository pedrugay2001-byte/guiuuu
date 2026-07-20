/**
 * Tela de configuração da cotação PYX/USD — acesso exclusivo do Master Admin.
 *
 * Fluxo:
 *  1. Mostra a cotação vigente (com quem alterou por último e quando).
 *  2. Campo para digitar novo valor "X,XX" PYX por USD.
 *  3. Botão SALVAR — chama PUT /api/pyx/rate e atualiza o cache global.
 *  4. Histórico das últimas 20 alterações abaixo.
 *
 * Ao salvar, chama refresh() do PYXRateProvider para propagar
 * automaticamente para todas as telas (Home, Wallet, etc.).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "../../src/icons";
import { api, PyxRateHistory } from "../../src/api";
import { usePYXRate } from "../../src/pyx-rate";
import { maskPYXInput, maskedToCents } from "../../src/pyx";
import { notify } from "../../src/alerts";

export default function PyxRateScreen() {
  const router = useRouter();
  const { rate, refresh } = usePYXRate();

  const [input, setInput] = useState("5,00");
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<PyxRateHistory[]>([]);
  const [loadingHist, setLoadingHist] = useState(true);

  const loadHistory = useCallback(async () => {
    setLoadingHist(true);
    try {
      const h = await api.pyxRateHistory(50);
      setHistory(h);
    } catch { /* silencioso */ }
    finally { setLoadingHist(false); }
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  // Sincroniza o input com o rate atual quando ele carrega/atualiza.
  useEffect(() => {
    if (rate?.pyx_per_usd_centavos) {
      const cents = rate.pyx_per_usd_centavos;
      // formata "500" → "5,00"
      const whole = Math.floor(cents / 100);
      const dec = String(cents % 100).padStart(2, "0");
      setInput(`${whole.toLocaleString("pt-BR")},${dec}`);
    }
  }, [rate?.pyx_per_usd_centavos]);

  const newCentavos = useMemo(() => maskedToCents(input || "0"), [input]);
  const isValid = newCentavos >= 1 && newCentavos <= 10_000_000;
  const changed = rate?.pyx_per_usd_centavos !== newCentavos;

  const save = async () => {
    if (!isValid || saving || !changed) return;
    setSaving(true);
    try {
      await api.pyxRateSet({ pyx_per_usd_centavos: newCentavos });
      await refresh();
      await loadHistory();
      notify("Cotação PYX/USD atualizada", `Nova cotação: 1 USD = ${(newCentavos / 100).toFixed(2).replace(".", ",")} PYX`);
    } catch (e: any) {
      notify("Falha ao atualizar cotação", e?.message || "Tente novamente");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#050505" }}>
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom", "left", "right"]}>
        <View style={s.topBar}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()} testID="pyx-rate-back">
            <Ionicons name="chevron-back" size={22} color="#FFF" />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={s.title}>COTAÇÃO PYX / USD</Text>
            <Text style={s.sub}>Master Admin</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
            {/* Cotação vigente */}
            <View style={s.currentCard}>
              <View style={s.currentHead}>
                <View style={s.dotGreen} />
                <Text style={s.currentKicker}>COTAÇÃO VIGENTE</Text>
              </View>
              <View style={s.currentAmountRow}>
                <Text style={s.usdMark}>1 USD =</Text>
                <Text style={s.currentAmount}>
                  {rate?.pyx_per_usd_display || "5,00"}
                </Text>
                <Text style={s.pyxMark}>PYX</Text>
              </View>
              <Text style={s.currentMeta}>
                {rate?.updated_at
                  ? `Atualizada em ${new Date(rate.updated_at).toLocaleString("pt-BR", {
                      timeZone: "America/Sao_Paulo",
                      day: "2-digit", month: "2-digit", year: "numeric",
                      hour: "2-digit", minute: "2-digit",
                    })}${rate.updated_by_name ? ` por ${rate.updated_by_name}` : ""}`
                  : "Nunca alterada"}
              </Text>
            </View>

            {/* Editor */}
            <Text style={s.section}>NOVA COTAÇÃO</Text>
            <View style={s.editor}>
              <Text style={s.editorPrefix} numberOfLines={1}>1 USD =</Text>
              <TextInput
                style={s.editorInput}
                value={input}
                onChangeText={(t) => setInput(maskPYXInput(t))}
                keyboardType="numeric"
                placeholder="0,00"
                placeholderTextColor="#3A3A3A"
                testID="pyx-rate-input"
                selectTextOnFocus
              />
              <Text style={s.editorSuffix} numberOfLines={1}>PYX</Text>
            </View>
            <Text style={s.editorHint}>
              Digite quantos PYX equivalem a 1 USD. Ao salvar, todos os saldos em USD do
              app serão recalculados automaticamente.
            </Text>

            <TouchableOpacity
              style={[s.saveBtn, (!isValid || !changed || saving) && s.saveBtnDisabled]}
              onPress={save}
              disabled={!isValid || !changed || saving}
              activeOpacity={0.85}
              testID="pyx-rate-save"
            >
              {saving ? (
                <ActivityIndicator color="#0A0A0A" />
              ) : (
                <>
                  <Ionicons name="checkmark" size={18} color="#0A0A0A" />
                  <Text style={s.saveBtnTxt}>
                    {!changed ? "Sem alterações" : "SALVAR NOVA COTAÇÃO"}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            {/* Histórico */}
            <Text style={s.section}>HISTÓRICO DE ALTERAÇÕES</Text>
            {loadingHist ? (
              <ActivityIndicator color="#C5D1DA" style={{ marginTop: 12 }} />
            ) : history.length === 0 ? (
              <View style={s.emptyHist}>
                <Ionicons name="time-outline" size={30} color="#2E2E2E" />
                <Text style={s.emptyHistTxt}>Sem alterações ainda</Text>
              </View>
            ) : (
              history.map((h) => {
                const prevStr = `${(h.prev_pyx_per_usd_centavos / 100).toFixed(2).replace(".", ",")}`;
                const newStr = `${(h.new_pyx_per_usd_centavos / 100).toFixed(2).replace(".", ",")}`;
                const up = h.new_pyx_per_usd_centavos > h.prev_pyx_per_usd_centavos;
                return (
                  <View key={h.history_id} style={s.histRow} testID={`pyx-rate-hist-${h.history_id}`}>
                    <View
                      style={[
                        s.histIcon,
                        { backgroundColor: up ? "rgba(78,224,127,0.15)" : "rgba(248,113,113,0.15)",
                          borderColor: up ? "#4EE07F" : "#F87171" },
                      ]}
                    >
                      <Ionicons
                        name={up ? "trending-up" : "trending-down"}
                        size={14}
                        color={up ? "#4EE07F" : "#F87171"}
                      />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={s.histAmount} numberOfLines={1}>
                        {prevStr} → <Text style={{ color: up ? "#4EE07F" : "#F87171" }}>{newStr}</Text> PYX/USD
                      </Text>
                      <Text style={s.histMeta} numberOfLines={1}>
                        {new Date(h.changed_at).toLocaleString("pt-BR", {
                          timeZone: "America/Sao_Paulo",
                          day: "2-digit", month: "2-digit", year: "numeric",
                          hour: "2-digit", minute: "2-digit",
                        })}
                        {h.changed_by_name ? ` · ${h.changed_by_name}` : ""}
                      </Text>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  topBar: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 12,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#141414",
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { color: "#FFF", fontSize: 13, fontWeight: "900", letterSpacing: 2 },
  sub: { color: "#F5C150", fontSize: 10, fontWeight: "900", letterSpacing: 1.5, marginTop: 2 },

  currentCard: {
    padding: 20, borderRadius: 14,
    backgroundColor: "#0B0B0B",
    borderWidth: 1, borderColor: "rgba(78,224,127,0.30)",
  },
  currentHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  dotGreen: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#4EE07F" },
  currentKicker: { color: "#4EE07F", fontSize: 10, fontWeight: "900", letterSpacing: 2 },
  currentAmountRow: { flexDirection: "row", alignItems: "baseline", gap: 6, marginTop: 12 },
  usdMark: { color: "#8A8A8A", fontSize: 15, fontWeight: "800", letterSpacing: 0.4 },
  currentAmount: { color: "#FFF", fontSize: 40, fontWeight: "900", letterSpacing: -1, fontVariant: ["tabular-nums"] as any },
  pyxMark: { color: "#C5D1DA", fontSize: 15, fontWeight: "800", letterSpacing: 1.4 },
  currentMeta: { color: "#6B6B6B", fontSize: 11, marginTop: 10, fontStyle: "italic" },

  section: {
    color: "#8A8A8A", fontSize: 10, fontWeight: "900", letterSpacing: 2,
    marginTop: 26, marginBottom: 10,
  },

  editor: {
    flexDirection: "row", alignItems: "center", gap: 8,
    padding: 16, backgroundColor: "#0B0B0B",
    borderRadius: 12, borderWidth: 1, borderColor: "#1F1F1F",
  },
  editorPrefix: {
    color: "#8A8A8A", fontSize: 13, fontWeight: "800", letterSpacing: 0.3,
    flexShrink: 0,
  },
  editorInput: {
    flex: 1, minWidth: 40,
    color: "#FFF", fontSize: 26, fontWeight: "900",
    letterSpacing: -0.5, textAlign: "right",
    fontVariant: ["tabular-nums"] as any,
    padding: 0,
  },
  editorSuffix: {
    color: "#C5D1DA", fontSize: 13, fontWeight: "900", letterSpacing: 1.2,
    flexShrink: 0,
  },
  editorHint: { color: "#7A7A7A", fontSize: 11, marginTop: 8, lineHeight: 15 },

  saveBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    padding: 15, borderRadius: 10,
    backgroundColor: "#F5C150", marginTop: 18,
  },
  saveBtnDisabled: { backgroundColor: "#2A2A2A" },
  saveBtnTxt: { color: "#0A0A0A", fontSize: 12.5, fontWeight: "900", letterSpacing: 1.4 },

  emptyHist: { alignItems: "center", padding: 30, gap: 6 },
  emptyHistTxt: { color: "#6B6B6B", fontSize: 12 },
  histRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 12, backgroundColor: "#0A0A0A", borderRadius: 10,
    marginBottom: 8, borderWidth: 1, borderColor: "#121212",
  },
  histIcon: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1,
  },
  histAmount: { color: "#EEE", fontSize: 13, fontWeight: "800", fontVariant: ["tabular-nums"] as any },
  histMeta: { color: "#777", fontSize: 11, marginTop: 3 },
});

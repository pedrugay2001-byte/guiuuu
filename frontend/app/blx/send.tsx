import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Image,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api, BlxContact, BlxWallet } from "../../src/api";
import { useGate } from "../../src/gate";
import { formatBLX, maskBLXInput, maskedToCents } from "../../src/blx";
import { TIERS } from "../../src/theme";

type Step = "search" | "amount" | "review" | "success";

export default function Send() {
  const router = useRouter();
  const params = useLocalSearchParams<{ wallet?: string }>();
  const { member } = useGate();

  const [step, setStep] = useState<Step>("search");
  const [query, setQuery] = useState(params?.wallet || "");
  const [results, setResults] = useState<BlxContact[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<BlxContact | null>(null);
  const [w, setW] = useState<BlxWallet | null>(null);
  const [masked, setMasked] = useState("0,00");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [txSuccess, setTxSuccess] = useState<any>(null);
  const [limits, setLimits] = useState<{
    unlimited: boolean;
    limit_centavos: number;
    used_centavos: number;
    available_centavos: number;
  } | null>(null);
  const debounceRef = useRef<any>(null);

  useEffect(() => {
    if (!member) return;
    api.blxWallet(member.member_id).then(setW).catch(() => {});
    api.blxTransferLimits(member.member_id).then(setLimits).catch(() => {});
  }, [member]);

  // Busca com debounce
  useEffect(() => {
    if (step !== "search") return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 3) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await api.blxLookup(q);
        // Nunca mostra o próprio usuário
        setResults(r.filter((x) => x.member_id !== member?.member_id));
      } catch { setResults([]); }
      finally { setSearching(false); }
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, step, member]);

  const amountCents = useMemo(() => maskedToCents(masked), [masked]);
  const balance = w?.balance_centavos || 0;
  const enough = amountCents > 0 && amountCents <= balance;

  const pickContact = (c: BlxContact) => {
    setSelected(c);
    setStep("amount");
  };

  const confirmAmount = () => {
    if (amountCents <= 0) { Alert.alert("Valor inválido", "Informe um valor maior que zero."); return; }
    if (amountCents > balance) { Alert.alert("Saldo insuficiente", `Você tem apenas ${formatBLX(balance)} BLX disponíveis.`); return; }
    setStep("review");
  };

  const submitTransfer = async () => {
    if (!member || !selected) return;
    setSubmitting(true);
    try {
      const tx = await api.blxTransfer({
        from_member_id: member.member_id,
        to_member_id: selected.member_id,
        amount_centavos: amountCents,
        note: note.trim() || undefined,
      });
      setTxSuccess(tx);
      setStep("success");
    } catch (e: any) {
      Alert.alert("Erro na transferência", e.message || "Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!member) {
    return (
      <View style={{ flex: 1, backgroundColor: "#050505", justifyContent: "center" }}>
        <ActivityIndicator color="#D4AF37" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: "#050505" }}
    >
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => {
              if (step === "search") router.back();
              else if (step === "amount") setStep("search");
              else if (step === "review") setStep("amount");
              else router.back();
            }}
            testID="blx-send-back"
          >
            <Ionicons name="chevron-back" size={22} color="#FFF" />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={styles.title}>
              {step === "search" ? "ENVIAR BLX" : step === "amount" ? "VALOR" : step === "review" ? "CONFIRMAR" : "ENVIADO"}
            </Text>
            <Text style={styles.sub}>
              {step === "search" ? "Escolha o destinatário"
                : step === "amount" ? `Saldo: ${formatBLX(balance)} BLX`
                : step === "review" ? "Revise antes de confirmar"
                : "Transferência concluída"}
            </Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        {step === "search" && (
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
            {/* CARD — Limite mensal de transferência por tier */}
            {limits && !limits.unlimited && (
              <View style={styles.limitCard}>
                <View style={styles.limitHeaderRow}>
                  <View style={styles.limitTitleRow}>
                    <Ionicons name="speedometer-outline" size={14} color="#D4AF37" />
                    <Text style={styles.limitTitle}>LIMITE MENSAL</Text>
                  </View>
                  <Text style={styles.limitValue}>
                    {formatBLX(limits.used_centavos)} / {formatBLX(limits.limit_centavos)} BLX
                  </Text>
                </View>
                <View style={styles.limitBar}>
                  <View
                    style={[
                      styles.limitBarFill,
                      {
                        width: `${Math.min(100, limits.limit_centavos > 0 ? (limits.used_centavos / limits.limit_centavos) * 100 : 0)}%`,
                        backgroundColor: limits.available_centavos <= 0 ? "#E74C3C" : "#D4AF37",
                      },
                    ]}
                  />
                </View>
                <Text style={styles.limitSub}>
                  {limits.available_centavos <= 0
                    ? "Limite mensal atingido — renova no próximo mês."
                    : `Disponível: ${formatBLX(limits.available_centavos)} BLX`}
                </Text>
              </View>
            )}
            {limits && limits.unlimited && (
              <View style={[styles.limitCard, { borderColor: "#7FD7E5" + "44" }]}>
                <View style={styles.limitTitleRow}>
                  <Ionicons name="infinite" size={14} color="#7FD7E5" />
                  <Text style={[styles.limitTitle, { color: "#7FD7E5" }]}>TRANSFERÊNCIAS ILIMITADAS</Text>
                </View>
                <Text style={styles.limitSub}>Seu perfil de staff não possui limite mensal.</Text>
              </View>
            )}

            <Text style={styles.label}>BUSCAR POR CARTEIRA, NOME, E-MAIL OU TELEFONE</Text>
            <View style={styles.inputBox}>
              <Ionicons name="search" size={16} color="#8A8A8A" />
              <TextInput
                testID="blx-search-input"
                style={styles.input}
                placeholder="BLX-XXXXXXXX ou nome"
                placeholderTextColor="#6B6B6B"
                autoCapitalize="characters"
                value={query}
                onChangeText={setQuery}
              />
            </View>

            {searching && <ActivityIndicator color="#D4AF37" style={{ marginTop: 16 }} />}

            {!searching && query.trim().length >= 3 && results.length === 0 && (
              <View style={styles.emptyBox}>
                <Ionicons name="search" size={26} color="#2E2E2E" />
                <Text style={styles.emptyText}>Nenhum destinatário encontrado</Text>
              </View>
            )}

            <View style={{ marginTop: 16, gap: 8 }}>
              {results.map((c) => {
                const tier = TIERS[c.tier] || TIERS.black;
                return (
                  <TouchableOpacity
                    key={c.member_id}
                    style={styles.contactRow}
                    onPress={() => pickContact(c)}
                    testID={`blx-contact-${c.member_id}`}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.avatar, { borderColor: tier.color }]}>
                      {c.avatar_base64 ? (
                        <Image source={{ uri: c.avatar_base64 }} style={styles.avatarImg} />
                      ) : (
                        <Text style={styles.avatarTxt}>{(c.nickname || c.name).charAt(0).toUpperCase()}</Text>
                      )}
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.contactName} numberOfLines={1}>{c.nickname || c.name}</Text>
                      <Text style={styles.contactWallet}>{c.wallet_number}</Text>
                    </View>
                    <View style={[styles.tierPill, { borderColor: tier.color }]}>
                      <Text style={[styles.tierPillTxt, { color: tier.color }]}>{tier.label.toUpperCase()}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {query.trim().length < 3 && (
              <View style={styles.hintBox}>
                <Ionicons name="bulb-outline" size={14} color="#D4AF37" />
                <Text style={styles.hintText}>
                  Digite ao menos 3 caracteres para buscar. Você pode usar o número da carteira (BLX-XXXX), nome, apelido, e-mail ou telefone.
                </Text>
              </View>
            )}
          </ScrollView>
        )}

        {step === "amount" && selected && (
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
            <ContactCard c={selected} />

            <Text style={[styles.label, { marginTop: 24, textAlign: "center" }]}>
              VALOR A ENVIAR (BLX)
            </Text>
            <View style={styles.amountBox}>
              <TextInput
                testID="blx-amount-input"
                style={styles.amountInput}
                value={masked}
                onChangeText={(t) => setMasked(maskBLXInput(t))}
                keyboardType="number-pad"
                placeholder="0,00"
                placeholderTextColor="#3A3A3A"
                autoFocus
                selectTextOnFocus
              />
              <Text style={styles.amountUnit}>BLX</Text>
            </View>
            <Text style={[styles.balanceHint, !enough && amountCents > 0 && { color: "#F87171" }]}>
              {amountCents > 0 && amountCents > balance
                ? `Saldo insuficiente (${formatBLX(balance)} BLX)`
                : `Disponível: ${formatBLX(balance)} BLX`}
            </Text>

            <View style={styles.quickRow}>
              {[1000, 5000, 10000, 50000].map((c) => (
                <TouchableOpacity
                  key={c}
                  style={styles.quickBtn}
                  onPress={() => setMasked(maskBLXInput(String(c)))}
                  testID={`blx-quick-${c}`}
                >
                  <Text style={styles.quickBtnTxt}>+{formatBLX(c)}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.label, { marginTop: 24 }]}>MENSAGEM (OPCIONAL)</Text>
            <TextInput
              style={styles.noteInput}
              value={note}
              onChangeText={setNote}
              placeholder="Ex: Pagamento do anel"
              placeholderTextColor="#6B6B6B"
              maxLength={140}
            />

            <TouchableOpacity
              style={[styles.primaryBtn, !enough && styles.primaryBtnDisabled]}
              disabled={!enough}
              onPress={confirmAmount}
              testID="blx-next-review"
              activeOpacity={0.85}
            >
              <Text style={[styles.primaryBtnText, !enough && { color: "#555" }]}>REVISAR</Text>
              <Ionicons name="arrow-forward" size={18} color={enough ? "#0A0A0A" : "#555"} />
            </TouchableOpacity>
          </ScrollView>
        )}

        {step === "review" && selected && (
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
            <View style={styles.reviewCard}>
              <Text style={styles.reviewKicker}>VALOR A TRANSFERIR</Text>
              <View style={styles.reviewAmountRow}>
                <Text style={styles.reviewAmount}>{formatBLX(amountCents)}</Text>
                <Text style={styles.reviewUnit}>BLX</Text>
              </View>

              <View style={styles.reviewLine} />

              <View style={styles.reviewRow}>
                <Text style={styles.reviewLbl}>PARA</Text>
                <View style={{ alignItems: "flex-end", flex: 1, marginLeft: 16 }}>
                  <Text style={styles.reviewVal} numberOfLines={1}>{selected.nickname || selected.name}</Text>
                  <Text style={styles.reviewValSmall}>{selected.wallet_number}</Text>
                </View>
              </View>
              <View style={styles.reviewRow}>
                <Text style={styles.reviewLbl}>DE</Text>
                <View style={{ alignItems: "flex-end", flex: 1, marginLeft: 16 }}>
                  <Text style={styles.reviewVal} numberOfLines={1}>{member.nickname || member.name}</Text>
                  <Text style={styles.reviewValSmall}>{w?.wallet_number}</Text>
                </View>
              </View>
              {note.trim() && (
                <View style={styles.reviewRow}>
                  <Text style={styles.reviewLbl}>MENSAGEM</Text>
                  <Text style={[styles.reviewVal, { flex: 1, textAlign: "right", marginLeft: 16 }]} numberOfLines={3}>
                    {note.trim()}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.warnBox}>
              <Ionicons name="warning" size={14} color="#F5C150" />
              <Text style={styles.warnText}>
                Transferências BLX são instantâneas e definitivas. Ao confirmar, o valor sai imediatamente da sua carteira.
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, submitting && { opacity: 0.7 }]}
              disabled={submitting}
              onPress={submitTransfer}
              testID="blx-confirm-transfer"
              activeOpacity={0.85}
            >
              {submitting ? (
                <ActivityIndicator color="#0A0A0A" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={18} color="#0A0A0A" />
                  <Text style={styles.primaryBtnText}>CONFIRMAR ENVIO</Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        )}

        {step === "success" && txSuccess && selected && (
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40, alignItems: "center" }}>
            <View style={styles.successIcon}>
              <Ionicons name="checkmark" size={48} color="#0A0A0A" />
            </View>
            <Text style={styles.successTitle}>TRANSFERÊNCIA CONCLUÍDA</Text>
            <Text style={styles.successAmount}>{formatBLX(amountCents)} BLX</Text>
            <Text style={styles.successSub}>enviados para {selected.nickname || selected.name}</Text>

            <View style={[styles.reviewCard, { marginTop: 24, width: "100%" }]}>
              <View style={styles.reviewRow}>
                <Text style={styles.reviewLbl}>CÓDIGO</Text>
                <Text style={styles.reviewVal}>{txSuccess.tx_id}</Text>
              </View>
              <View style={styles.reviewRow}>
                <Text style={styles.reviewLbl}>DATA</Text>
                <Text style={styles.reviewVal}>
                  {new Date(txSuccess.created_at).toLocaleString("pt-BR")}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, { width: "100%" }]}
              onPress={() => router.replace("/(tabs)/wallet" as any)}
              testID="blx-success-home"
            >
              <Text style={styles.primaryBtnText}>VOLTAR AO BANCO</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.ghostBtn}
              onPress={() => router.replace("/blx/history" as any)}
            >
              <Text style={styles.ghostBtnText}>VER EXTRATO</Text>
            </TouchableOpacity>
          </ScrollView>
        )}
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

function ContactCard({ c }: { c: BlxContact }) {
  const tier = TIERS[c.tier] || TIERS.black;
  return (
    <View style={styles.contactCard}>
      <View style={[styles.avatarBig, { borderColor: tier.color }]}>
        {c.avatar_base64 ? (
          <Image source={{ uri: c.avatar_base64 }} style={styles.avatarBigImg} />
        ) : (
          <Text style={styles.avatarBigTxt}>{(c.nickname || c.name).charAt(0).toUpperCase()}</Text>
        )}
      </View>
      <Text style={styles.contactCardName}>{c.nickname || c.name}</Text>
      <Text style={styles.contactCardWallet}>{c.wallet_number}</Text>
      <View style={[styles.tierPill, { borderColor: tier.color, marginTop: 8 }]}>
        <Text style={[styles.tierPillTxt, { color: tier.color }]}>{tier.label.toUpperCase()}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 12,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#141414",
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { color: "#FFF", fontSize: 13, fontWeight: "900", letterSpacing: 2 },
  sub: { color: "#8A8A8A", fontSize: 10, fontWeight: "700", letterSpacing: 1.5, marginTop: 2 },

  label: { color: "#8A8A8A", fontSize: 10, fontWeight: "900", letterSpacing: 2, marginBottom: 8 },
  inputBox: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 14, backgroundColor: "#0E0E0E",
    borderRadius: 12, borderWidth: 1, borderColor: "#1A1A1A",
  },
  input: { flex: 1, color: "#FFF", fontSize: 14, paddingVertical: 14, fontWeight: "700", letterSpacing: 0.5 },

  contactRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 12, backgroundColor: "#0E0E0E",
    borderRadius: 12, borderWidth: 1, borderColor: "#1A1A1A",
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: "#1A1A1A", borderWidth: 2,
    alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  avatarImg: { width: "100%", height: "100%" },
  avatarTxt: { color: "#FFF", fontSize: 16, fontWeight: "900" },
  contactName: { color: "#FFF", fontSize: 14, fontWeight: "800" },
  contactWallet: { color: "#8A8A8A", fontSize: 11, marginTop: 2, letterSpacing: 1 },
  tierPill: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 20, borderWidth: 1 },
  tierPillTxt: { fontSize: 8.5, fontWeight: "900", letterSpacing: 1.2 },

  emptyBox: { alignItems: "center", marginTop: 30, gap: 8 },
  emptyText: { color: "#6B6B6B", fontSize: 12 },
  hintBox: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    marginTop: 24, padding: 14, borderRadius: 10,
    backgroundColor: "rgba(212,175,55,0.08)",
    borderWidth: 1, borderColor: "rgba(212,175,55,0.2)",
  },
  hintText: { flex: 1, color: "#B4C5D2", fontSize: 11.5, lineHeight: 16 },

  // Contact card (step amount)
  contactCard: {
    alignItems: "center", padding: 18,
    backgroundColor: "#0E0E0E", borderRadius: 14,
    borderWidth: 1, borderColor: "#1A1A1A",
  },
  avatarBig: {
    width: 72, height: 72, borderRadius: 36, borderWidth: 2,
    backgroundColor: "#1A1A1A",
    alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  avatarBigImg: { width: "100%", height: "100%" },
  avatarBigTxt: { color: "#FFF", fontSize: 24, fontWeight: "900" },
  contactCardName: { color: "#FFF", fontSize: 16, fontWeight: "800", marginTop: 10 },
  contactCardWallet: { color: "#C5D1DA", fontSize: 11, fontWeight: "800", letterSpacing: 1.2, marginTop: 3 },
  amountInput: {
    textAlign: "center",
    color: "#FFF", fontSize: 38, fontWeight: "900",
    letterSpacing: -1, paddingVertical: 6,
  },
  amountUnit: { color: "#C5D1DA", fontSize: 13, fontWeight: "900", letterSpacing: 1.5 },
  balanceHint: { textAlign: "center", color: "#8A8A8A", fontSize: 11, marginTop: 4, fontWeight: "700" },
  quickRow: { flexDirection: "row", gap: 8, marginTop: 14 },
  quickBtn: {
    flex: 1, paddingVertical: 10,
    borderRadius: 10, borderWidth: 1, borderColor: "#1F1F1F",
    backgroundColor: "#0B0D10",
    alignItems: "center",
  },
  quickBtnTxt: { color: "#C5D1DA", fontSize: 10.5, fontWeight: "800", letterSpacing: 0.5 },

  // Amount input (tipografia equilibrada + prata metálica)
  amountBox: {
    flexDirection: "row", alignItems: "baseline", justifyContent: "center", gap: 8,
    paddingVertical: 10,
  },

  noteInput: {
    backgroundColor: "#0E0E0E", borderRadius: 10,
    borderWidth: 1, borderColor: "#1A1A1A",
    paddingHorizontal: 14, paddingVertical: 13,
    color: "#FFF", fontSize: 14,
  },

  primaryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    paddingVertical: 15, borderRadius: 12, marginTop: 20,
    backgroundColor: "#C5D1DA",
  },
  primaryBtnDisabled: { backgroundColor: "#1A1A1A" },
  primaryBtnText: { color: "#0A0A0A", fontSize: 12.5, fontWeight: "900", letterSpacing: 1.5 },
  ghostBtn: {
    paddingVertical: 14, alignItems: "center", marginTop: 10,
  },
  ghostBtnText: { color: "#AAA", fontSize: 11, fontWeight: "800", letterSpacing: 1.5 },

  // Review
  reviewCard: {
    padding: 18, backgroundColor: "#0E0E0E",
    borderRadius: 14, borderWidth: 1, borderColor: "#1A1A1A",
  },
  reviewKicker: { color: "#8A8A8A", fontSize: 10, fontWeight: "900", letterSpacing: 2.5, textAlign: "center" },
  reviewAmountRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "center", gap: 8, marginTop: 8 },
  reviewAmount: { color: "#FFF", fontSize: 38, fontWeight: "900", letterSpacing: -1 },
  reviewUnit: { color: "#C5D1DA", fontSize: 14, fontWeight: "900", letterSpacing: 1.5 },
  reviewLine: { height: 1, backgroundColor: "#1A1A1A", marginVertical: 16 },
  reviewRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start",
    paddingVertical: 8,
  },
  reviewLbl: { color: "#8A8A8A", fontSize: 10, fontWeight: "900", letterSpacing: 1.5 },
  reviewVal: { color: "#FFF", fontSize: 13, fontWeight: "700" },
  reviewValSmall: { color: "#C5D1DA", fontSize: 11, fontWeight: "700", marginTop: 3, letterSpacing: 1 },

  warnBox: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    marginTop: 16, padding: 12, borderRadius: 10,
    backgroundColor: "rgba(245,193,80,0.08)",
    borderWidth: 1, borderColor: "rgba(245,193,80,0.25)",
  },
  warnText: { flex: 1, color: "#E8C77A", fontSize: 11.5, lineHeight: 16 },

  // Success
  successIcon: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: "#4EE07F",
    alignItems: "center", justifyContent: "center",
    marginTop: 20, marginBottom: 18,
  },
  successTitle: { color: "#4EE07F", fontSize: 13, fontWeight: "900", letterSpacing: 2.5 },
  successAmount: { color: "#FFF", fontSize: 34, fontWeight: "900", marginTop: 12, letterSpacing: -1 },
  successSub: { color: "#8A8A8A", fontSize: 13, marginTop: 6 },

  // Card de limite mensal de transferência
  limitCard: {
    backgroundColor: "#0E0E0E",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(212,175,55,0.22)",
    padding: 12,
    marginBottom: 16,
  },
  limitHeaderRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  limitTitleRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
  },
  limitTitle: {
    color: "#D4AF37", fontSize: 10.5, fontWeight: "900", letterSpacing: 1.5,
  },
  limitValue: {
    color: "#EEE", fontSize: 11.5, fontWeight: "800", fontVariant: ["tabular-nums"],
  },
  limitBar: {
    height: 5, borderRadius: 3,
    backgroundColor: "#1A1A1A", marginTop: 10, overflow: "hidden",
  },
  limitBarFill: { height: "100%", borderRadius: 3 },
  limitSub: {
    color: "#888", fontSize: 10.5, fontWeight: "600", marginTop: 8,
  },
});

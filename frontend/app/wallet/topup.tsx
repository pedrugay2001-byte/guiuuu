import { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Clipboard from "expo-clipboard";
import { api } from "../../src/api";
import { useGate } from "../../src/gate";
import { useTierAccent } from "../../src/use-tier-accent";

const PRESETS = [50, 100, 250, 500, 1000];

/**
 * Tela de Recarga BLX — fluxo PIX MANUAL com aprovação do suporte.
 *
 * UX:
 *  1. Mostra instruções claras (3 passos).
 *  2. Caixa "Dados do PIX" com beneficiário, CNPJ mascarado, instituição.
 *  3. Botão grande "Copiar código PIX" (copia o copia-e-cola).
 *  4. Campo VALOR R$ + presets → cliente informa quanto pagou.
 *  5. Botão "Já fiz o PIX → Abrir pedido" cria a ordem (status: pending).
 *  6. Lista de pedidos recentes do membro (status, valor, data).
 *
 * Conversão: R$ paga × 0,99 = BLX creditado (taxa de 1%).
 * Aprovação manual feita em /staff/pix-orders pelo suporte.
 */
export default function Topup() {
  const router = useRouter();
  const { member } = useGate();
  const accent = useTierAccent();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [copied, setCopied] = useState(false);
  // Estado de sucesso após criar pedido — botão vira verde com confirmação
  const [success, setSuccess] = useState<{ blx: number; brl: number } | null>(null);

  // PIX info é pública — carrega independente de login
  useEffect(() => {
    api.pixInfo().then(setInfo).catch(() => {});
  }, []);

  // Carrega pedidos do usuário (requer login)
  const loadAll = useCallback(async () => {
    if (!member) return;
    try {
      const mine = await api.pixOrdersMine(member.member_id);
      setOrders(mine.orders || []);
    } catch {}
  }, [member]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Cálculo do BLX a receber (com taxa de 1%)
  const v = parseFloat((amount || "").replace(",", "."));
  const validAmount = Number.isFinite(v) && v >= (info?.min_brl ?? 10);
  const fee_pct = info?.fee_pct ?? 1;
  const blxOut = validAmount ? v * (1 - fee_pct / 100) : 0;

  const copyPix = async () => {
    if (!info?.pix_code) return;
    await Clipboard.setStringAsync(info.pix_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  const submit = async () => {
    if (!member) return;
    if (!validAmount) {
      Alert.alert("Valor inválido", `Informe o valor mínimo de R$ ${(info?.min_brl ?? 10).toFixed(2)} pago no PIX.`);
      return;
    }
    setLoading(true);
    try {
      const order = await api.pixOrderCreate({
        member_id: member.member_id,
        amount_brl: v,
        note: note.trim() || undefined,
      });
      // Estado de sucesso — botão fica VERDE com mensagem de confirmação
      setSuccess({ blx: order.blx_centavos / 100, brl: v });
      // Limpa form para próximo pedido
      setAmount("");
      setNote("");
      // Recarrega lista de pedidos
      loadAll();
      // Auto-reset do estado verde após 8 segundos (volta ao botão padrão)
      setTimeout(() => setSuccess(null), 8000);
    } catch (e: any) {
      Alert.alert("Erro ao criar pedido", e.message || "Tente novamente");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, backgroundColor: "#050505" }}>
      <Stack.Screen options={{ title: "Adicionar BLX", headerStyle: { backgroundColor: "#050505" }, headerTintColor: "#FFF" }} />
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">

        {/* HERO */}
        <View style={[st.heroCard, { borderColor: accent.accent + "33" }]}>
          <LinearGradient
            colors={["transparent", accent.accent + "10"]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={[st.heroIcon, { backgroundColor: accent.accent + "1A", borderColor: accent.accent + "55" }]}>
            <MaterialCommunityIcons name="qrcode-scan" size={26} color={accent.accent} />
          </View>
          <Text style={[st.heroTitle, { color: accent.accent }]}>RECARGA VIA PIX</Text>
          <Text style={st.heroSub}>
            Pague o PIX, abra o pedido e o suporte libera seu saldo BLX.
            <Text style={{ color: accent.accent, fontWeight: "900" }}>  ~{info?.estimated_minutes ?? 10} min</Text>
          </Text>
        </View>

        {/* PASSO 1 */}
        <Text style={st.sectionLbl}>1. DADOS DO PIX</Text>
        <View style={st.pixCard}>
          <Row label="Beneficiário" value={info?.beneficiario || "—"} />
          <Row label="CNPJ" value={info?.cnpj_masked || "—"} />
          <Row label="Instituição" value={info?.instituicao || "—"} />
        </View>

        {/* Botão copiar */}
        <TouchableOpacity
          style={[st.copyBtn, copied && { borderColor: "#4EE07F", backgroundColor: "#4EE07F1A" }]}
          onPress={copyPix}
          disabled={!info?.pix_code}
          activeOpacity={0.85}
          testID="topup-copy-pix"
        >
          <Ionicons
            name={copied ? "checkmark-circle" : "copy-outline"}
            size={20}
            color={copied ? "#4EE07F" : accent.accent}
          />
          <Text style={[st.copyBtnTxt, { color: copied ? "#4EE07F" : accent.accent }]}>
            {copied ? "CÓDIGO COPIADO!" : "COPIAR CÓDIGO PIX"}
          </Text>
        </TouchableOpacity>

        {/* Visualizador do código (read-only, scrollable) */}
        {info?.pix_code ? (
          <View style={st.pixCodeBox}>
            <Text style={st.pixCodeLbl}>PIX COPIA E COLA</Text>
            <Text style={st.pixCodeTxt} numberOfLines={3}>
              {info.pix_code}
            </Text>
          </View>
        ) : null}

        {/* PASSO 2 — Valor pago */}
        <Text style={st.sectionLbl}>2. VALOR PAGO (R$)</Text>
        <TextInput
          style={st.input}
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="0,00"
          placeholderTextColor="#444"
          testID="topup-amount"
        />
        <View style={st.presets}>
          {PRESETS.map((p) => {
            const active = parseFloat((amount || "").replace(",", ".")) === p;
            return (
              <TouchableOpacity
                key={p}
                style={[st.preset, active && { borderColor: accent.accent, backgroundColor: accent.accent + "14" }]}
                onPress={() => setAmount(String(p))}
              >
                <Text style={[st.presetTxt, active && { color: accent.accent }]}>R${p}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Conversão preview */}
        {validAmount ? (
          <View style={st.previewBox}>
            <View style={st.previewRow}>
              <Text style={st.previewLbl}>Valor pago no PIX</Text>
              <Text style={st.previewVal}>{formatBRL(v)}</Text>
            </View>
            <View style={st.previewRow}>
              <Text style={st.previewLbl}>Taxa de processamento ({fee_pct}%)</Text>
              <Text style={[st.previewVal, { color: "#F87171" }]}>− {formatBRL(v * fee_pct / 100)}</Text>
            </View>
            <View style={[st.previewRow, st.previewTotal]}>
              <Text style={[st.previewLbl, { color: accent.accent, fontWeight: "900" }]}>VOCÊ RECEBE</Text>
              <Text style={[st.previewVal, { color: accent.accent, fontSize: 20, fontWeight: "900" }]}>
                {blxOut.toFixed(2)} BLX
              </Text>
            </View>
          </View>
        ) : null}

        {/* Observação opcional */}
        <Text style={st.sectionLbl}>OBSERVAÇÃO (OPCIONAL)</Text>
        <TextInput
          style={[st.input, { fontSize: 14, fontWeight: "500", paddingVertical: 10, minHeight: 60 }]}
          value={note}
          onChangeText={setNote}
          placeholder="Ex: comprovante anexado no chat, transferência feita às 14h..."
          placeholderTextColor="#444"
          multiline
          maxLength={300}
        />

        {/* PASSO 3 — Botão de envio (ou estado de sucesso verde) */}
        {success ? (
          <View style={st.successCard} testID="topup-success">
            <View style={st.successIconWrap}>
              <Ionicons name="checkmark-circle" size={42} color="#0A0A0A" />
            </View>
            <Text style={st.successTitle}>PEDIDO ENVIADO!</Text>
            <Text style={st.successSub}>
              Recebemos seu pedido de <Text style={st.successStrong}>{formatBRL(success.brl)}</Text>.{"\n"}
              Em breve <Text style={st.successStrong}>{success.blx.toFixed(2)} BLX</Text> cairão em sua carteira após análise do suporte.
            </Text>
            <View style={st.successFooter}>
              <Ionicons name="time-outline" size={14} color="#0A0A0A" />
              <Text style={st.successFooterTxt}>Tempo estimado: ~{info?.estimated_minutes ?? 10} min</Text>
            </View>
            <TouchableOpacity
              style={st.successDismiss}
              onPress={() => setSuccess(null)}
              activeOpacity={0.7}
              testID="topup-success-dismiss"
            >
              <Text style={st.successDismissTxt}>FAZER OUTRO PEDIDO</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[st.submit, (!validAmount || loading) && { opacity: 0.45 }]}
            onPress={submit}
            disabled={!validAmount || loading}
            activeOpacity={0.85}
            testID="topup-submit"
          >
            <LinearGradient
              colors={accent.gradient}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={st.submitInner}
            >
              {loading ? (
                <ActivityIndicator color="#000" />
              ) : (
                <>
                  <Ionicons name="checkmark-done-circle" size={20} color="#000" />
                  <Text style={st.submitTxt}>JÁ FIZ O PIX → ABRIR PEDIDO</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        )}

        {/* Como funciona */}
        <View style={st.howCard}>
          <Text style={st.howTitle}>COMO FUNCIONA</Text>
          {(info?.instructions || []).map((it: string, idx: number) => (
            <View key={idx} style={st.howRow}>
              <View style={[st.howStep, { backgroundColor: accent.accent + "22", borderColor: accent.accent + "55" }]}>
                <Text style={[st.howStepTxt, { color: accent.accent }]}>{idx + 1}</Text>
              </View>
              <Text style={st.howTxt}>{it}</Text>
            </View>
          ))}
        </View>

        {/* Meus pedidos */}
        {orders.length > 0 ? (
          <>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 28, marginBottom: 8 }}>
              <Text style={st.sectionLbl}>MEUS PEDIDOS RECENTES</Text>
              <TouchableOpacity onPress={loadAll}><Ionicons name="refresh" size={16} color="#888" /></TouchableOpacity>
            </View>
            {orders.slice(0, 8).map((o) => (
              <OrderRow key={o.order_id} o={o} accent={accent.accent} />
            ))}
          </>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ============================================================================
// Componentes auxiliares
// ============================================================================

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={st.row}>
      <Text style={st.rowLbl}>{label}</Text>
      <Text style={st.rowVal} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function OrderRow({ o, accent }: { o: any; accent: string }) {
  const status = o.status as "pending" | "approved" | "rejected" | "cancelled";
  const cfg = STATUS_CFG[status] || STATUS_CFG.pending;
  const date = o.created_at ? new Date(o.created_at).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  }) : "—";
  return (
    <View style={st.orderRow}>
      <View style={[st.orderDot, { backgroundColor: cfg.color + "22", borderColor: cfg.color + "66" }]}>
        <Ionicons name={cfg.icon as any} size={16} color={cfg.color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={st.orderTitle}>{formatBRL(o.amount_brl_centavos / 100)} → {(o.blx_centavos / 100).toFixed(2)} BLX</Text>
        <Text style={st.orderSub}>{cfg.label} • {date}</Text>
        {status === "rejected" && o.rejection_reason ? (
          <Text style={[st.orderSub, { color: "#F87171", marginTop: 2 }]}>Motivo: {o.rejection_reason}</Text>
        ) : null}
      </View>
    </View>
  );
}

const STATUS_CFG: Record<string, { color: string; icon: string; label: string }> = {
  pending:   { color: "#F5C150", icon: "time-outline",          label: "Aguardando aprovação" },
  approved:  { color: "#4EE07F", icon: "checkmark-circle",      label: "Aprovado" },
  rejected:  { color: "#F87171", icon: "close-circle",          label: "Rejeitado" },
  cancelled: { color: "#888888", icon: "ban-outline",           label: "Cancelado" },
};

const formatBRL = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;
const formatBLX = (cents: number) => (cents / 100).toFixed(2);

// ============================================================================
// Styles
// ============================================================================
const st = StyleSheet.create({
  heroCard: {
    backgroundColor: "#0A0A0A",
    borderWidth: 1,
    borderRadius: 14,
    padding: 18,
    alignItems: "center",
    marginBottom: 22,
    overflow: "hidden",
  },
  heroIcon: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, marginBottom: 10,
  },
  heroTitle: { fontSize: 12, fontWeight: "900", letterSpacing: 2.5, marginBottom: 6 },
  heroSub: { color: "#AAA", fontSize: 12, lineHeight: 17, textAlign: "center" },

  sectionLbl: { color: "#777", fontSize: 10, fontWeight: "900", letterSpacing: 2, marginTop: 18, marginBottom: 8 },
  pixCard: {
    backgroundColor: "#0E0E0E",
    borderWidth: 1, borderColor: "#1F1F1F",
    borderRadius: 12, padding: 14, gap: 10,
  },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  rowLbl: { color: "#888", fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  rowVal: { color: "#F5F5F5", fontSize: 13, fontWeight: "800", flexShrink: 1, textAlign: "right" },

  copyBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 14,
    borderWidth: 1.5, borderRadius: 12,
    borderColor: "#1F1F1F",
    backgroundColor: "#0A0A0A",
    marginTop: 12,
  },
  copyBtnTxt: { fontSize: 12, fontWeight: "900", letterSpacing: 1.5 },

  pixCodeBox: {
    backgroundColor: "#080808",
    borderWidth: 1, borderColor: "#1A1A1A",
    borderRadius: 10, padding: 10, marginTop: 8,
  },
  pixCodeLbl: { color: "#666", fontSize: 9, fontWeight: "900", letterSpacing: 1.5, marginBottom: 4 },
  pixCodeTxt: { color: "#AAA", fontSize: 10, lineHeight: 14, fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }) },

  input: {
    backgroundColor: "#121212",
    borderWidth: 1, borderColor: "#1F1F1F",
    borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    color: "#FFF", fontSize: 22, fontWeight: "900",
  },
  presets: { flexDirection: "row", gap: 6, marginTop: 8 },
  preset: {
    flex: 1, paddingVertical: 9, alignItems: "center",
    borderRadius: 8, borderWidth: 1, borderColor: "#222",
    backgroundColor: "#111",
  },
  presetTxt: { color: "#DDD", fontSize: 11, fontWeight: "800" },

  previewBox: {
    backgroundColor: "#0A0A0A",
    borderWidth: 1, borderColor: "#1F1F1F",
    borderRadius: 12, padding: 14, marginTop: 14,
  },
  previewRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4 },
  previewLbl: { color: "#888", fontSize: 12 },
  previewVal: { color: "#F5F5F5", fontSize: 14, fontWeight: "800" },
  previewTotal: { borderTopWidth: 1, borderTopColor: "#1F1F1F", marginTop: 6, paddingTop: 8 },

  submit: { marginTop: 20, borderRadius: 12, overflow: "hidden" },
  submitInner: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 16,
  },
  submitTxt: { color: "#000", fontSize: 12, fontWeight: "900", letterSpacing: 1.2 },

  // Estado de sucesso — botão "vira" um card verde de confirmação
  successCard: {
    marginTop: 20,
    backgroundColor: "#4EE07F",
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 22,
    alignItems: "center",
    shadowColor: "#4EE07F",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 8,
  },
  successIconWrap: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: "#FFFFFF",
    alignItems: "center", justifyContent: "center",
    marginBottom: 12,
  },
  successTitle: {
    color: "#0A0A0A",
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  successSub: {
    color: "#0A0A0A",
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    opacity: 0.92,
  },
  successStrong: { fontWeight: "900" },
  successFooter: {
    flexDirection: "row", alignItems: "center", gap: 6,
    marginTop: 14,
    paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: "rgba(0,0,0,0.10)",
    borderRadius: 20,
  },
  successFooterTxt: { color: "#0A0A0A", fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  successDismiss: {
    marginTop: 14,
    paddingHorizontal: 18, paddingVertical: 9,
    borderWidth: 1.5, borderColor: "#0A0A0A",
    borderRadius: 22,
  },
  successDismissTxt: { color: "#0A0A0A", fontSize: 11, fontWeight: "900", letterSpacing: 1.2 },

  howCard: {
    marginTop: 22, padding: 14,
    backgroundColor: "#0A0A0A",
    borderWidth: 1, borderColor: "#1A1A1A",
    borderRadius: 12, gap: 10,
  },
  howTitle: { color: "#F5F5F5", fontSize: 11, fontWeight: "900", letterSpacing: 2, marginBottom: 4 },
  howRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  howStep: {
    width: 22, height: 22, borderRadius: 11,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1,
  },
  howStepTxt: { fontSize: 11, fontWeight: "900" },
  howTxt: { color: "#BBB", fontSize: 12, lineHeight: 17, flex: 1 },

  orderRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: "#0A0A0A",
    borderWidth: 1, borderColor: "#1A1A1A",
    borderRadius: 10, padding: 12, marginBottom: 8,
  },
  orderDot: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  orderTitle: { color: "#F5F5F5", fontSize: 13, fontWeight: "800" },
  orderSub: { color: "#888", fontSize: 11, marginTop: 2 },
});

import { useState } from "react";
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { api } from "../../src/api";
import { useGate } from "../../src/gate";
import { useTierAccent } from "../../src/use-tier-accent";

const PRESETS = [99, 499, 999, 2000];

/**
 * Recarga BLX — visual premium, paleta dinâmica por tier (platinum p/ Diamond).
 * MOCKED: Pix está em modo simulado, crédito imediato após confirmação.
 */
export default function Topup() {
  const router = useRouter();
  const { member, refreshMember } = useGate();
  const accent = useTierAccent();
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!member) return;
    const v = parseFloat(amount.replace(",", "."));
    if (!v || v < 10) { Alert.alert("Valor mínimo R$ 10"); return; }
    setLoading(true);
    try {
      await api.walletTopup(member.member_id, v);
      await refreshMember();
      Alert.alert("Recarga concluída!", `${v.toFixed(2)} BLX adicionadas à sua carteira.`, [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (e: any) { Alert.alert("Erro", e.message); } finally { setLoading(false); }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, backgroundColor: "#050505" }}>
      <Stack.Screen options={{ title: "Adicionar BLX", headerStyle: { backgroundColor: "#050505" }, headerTintColor: "#FFF" }} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>

        {/* Hero card premium */}
        <View style={[styles.card, { borderColor: accent.accent + "33" }]}>
          <View style={[styles.cardIcon, { backgroundColor: accent.accent + "1A", borderColor: accent.accent + "55" }]}>
            <MaterialCommunityIcons name="diamond-stone" size={22} color={accent.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: accent.accent }]}>PIX → BLEX TOKEN</Text>
            <Text style={styles.sub}>
              Recarga simulada — o valor é creditado imediatamente em BLX para teste.
              Quando o gateway Pix estiver integrado, vira QR Code real.
            </Text>
          </View>
        </View>

        <Text style={styles.lbl}>VALOR (R$)</Text>
        <TextInput
          style={styles.input}
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="0,00"
          placeholderTextColor="#555"
          testID="topup-input"
        />

        <View style={styles.presets}>
          {PRESETS.map((p) => {
            const active = parseFloat(amount.replace(",", ".")) === p;
            return (
              <TouchableOpacity
                key={p}
                style={[styles.preset, active && { borderColor: accent.accent, backgroundColor: accent.accent + "14" }]}
                onPress={() => setAmount(String(p))}
                testID={`topup-preset-${p}`}
              >
                <Text style={[styles.presetTxt, active && { color: accent.accent }]}>R$ {p}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          style={[styles.btn, loading && { opacity: 0.5 }]}
          disabled={loading}
          onPress={submit}
          testID="topup-submit"
          activeOpacity={0.88}
        >
          <LinearGradient
            colors={accent.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.btnInner}
          >
            {loading ? <ActivityIndicator color="#000" /> : (
              <>
                <Ionicons name="flash" size={16} color="#0A0A0A" />
                <Text style={styles.btnTxt}>GERAR PIX (SIMULADO)</Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>

        <Text style={styles.note}>
          Quando você nos enviar a API Key do gateway (Mercado Pago, PagBank, Efi, etc.),
          esta tela vira Pix real com QR code e webhook.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row", gap: 12, alignItems: "flex-start",
    padding: 14, backgroundColor: "#0A0A0A", borderWidth: 1,
    borderRadius: 12, marginBottom: 20,
  },
  cardIcon: {
    width: 38, height: 38, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1,
  },
  title: { fontSize: 11, fontWeight: "900", letterSpacing: 2 },
  sub: { color: "#888", fontSize: 11, lineHeight: 15, marginTop: 4 },
  lbl: { color: "#888", fontSize: 10, fontWeight: "900", letterSpacing: 2, marginBottom: 8 },
  input: {
    backgroundColor: "#121212", borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 14,
    color: "#FFF", fontSize: 22, fontWeight: "900",
    borderWidth: 1, borderColor: "#1F1F1F",
  },
  presets: { flexDirection: "row", gap: 8, marginTop: 10 },
  preset: {
    flex: 1, paddingVertical: 10, alignItems: "center",
    borderRadius: 8, borderWidth: 1, borderColor: "#222",
    backgroundColor: "#111",
  },
  presetTxt: { color: "#DDD", fontSize: 12, fontWeight: "800" },
  btn: { marginTop: 24, borderRadius: 12, overflow: "hidden" },
  btnInner: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 14,
  },
  btnTxt: { color: "#000", fontSize: 12, fontWeight: "900", letterSpacing: 1.5 },
  note: { color: "#666", fontSize: 11, textAlign: "center", marginTop: 14, lineHeight: 16 },
});

import { useState } from "react";
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../src/api";
import { useGate } from "../../src/gate";

const PRESETS = [99, 499, 999, 2000];

export default function Topup() {
  const router = useRouter();
  const { member } = useGate();
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!member) return;
    const v = parseFloat(amount.replace(",", "."));
    if (!v || v < 10) { Alert.alert("Valor mínimo R$ 10"); return; }
    setLoading(true);
    try {
      await api.walletTopup(member.member_id, v);
      Alert.alert("Recarga concluída!", `${v.toFixed(2)} BLACK Coins adicionadas à sua carteira.`, [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (e: any) { Alert.alert("Erro", e.message); } finally { setLoading(false); }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, backgroundColor: "#050505" }}>
      <Stack.Screen options={{ title: "Recarregar Pix", headerStyle: { backgroundColor: "#050505" }, headerTintColor: "#FFF" }} />
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <View style={styles.card}>
          <Ionicons name="shield-checkmark" size={22} color="#D4AF37" />
          <Text style={styles.title}>Pix → BLACK Coins</Text>
          <Text style={styles.sub}>A recarga está em modo simulado até integrarmos seu gateway Pix. O valor crédita instantaneamente para você testar o fluxo completo.</Text>
        </View>

        <Text style={styles.lbl}>VALOR (R$)</Text>
        <TextInput style={styles.input} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0,00" placeholderTextColor="#555" />

        <View style={styles.presets}>
          {PRESETS.map((p) => (
            <TouchableOpacity key={p} style={styles.preset} onPress={() => setAmount(String(p))}>
              <Text style={styles.presetTxt}>R$ {p}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={[styles.btn, loading && { opacity: 0.5 }]} disabled={loading} onPress={submit} testID="topup-submit">
          {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.btnTxt}>GERAR PIX (SIMULADO)</Text>}
        </TouchableOpacity>

        <Text style={styles.note}>Quando você nos enviar a API Key do gateway (Mercado Pago, PagBank, Efi, etc.), esta tela vira Pix real com QR code e webhook.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", gap: 10, alignItems: "center", padding: 12, backgroundColor: "#0A0A0A", borderWidth: 1, borderColor: "#1F1F1F", borderRadius: 10, marginBottom: 18 },
  title: { color: "#D4AF37", fontSize: 12, fontWeight: "900", letterSpacing: 2 },
  sub: { color: "#888", fontSize: 11, lineHeight: 15, flex: 1 },
  lbl: { color: "#888", fontSize: 10, fontWeight: "900", letterSpacing: 2, marginBottom: 6 },
  input: { backgroundColor: "#121212", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 14, color: "#FFF", fontSize: 24, fontWeight: "900", borderWidth: 1, borderColor: "#1F1F1F" },
  presets: { flexDirection: "row", gap: 8, marginTop: 10 },
  preset: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: 8, borderWidth: 1, borderColor: "#222", backgroundColor: "#111" },
  presetTxt: { color: "#DDD", fontSize: 12, fontWeight: "800" },
  btn: { marginTop: 24, backgroundColor: "#D4AF37", padding: 15, borderRadius: 10, alignItems: "center" },
  btnTxt: { color: "#000", fontSize: 12, fontWeight: "900", letterSpacing: 2 },
  note: { color: "#666", fontSize: 11, textAlign: "center", marginTop: 14, lineHeight: 16 },
});

import { useState } from "react";
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "../../src/icons";
import { api } from "../../src/api";
import { useGate } from "../../src/gate";

export default function Withdraw() {
  const router = useRouter();
  const { member } = useGate();
  const [amount, setAmount] = useState("");
  const [key, setKey] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!member) return;
    const v = parseFloat(amount.replace(",", "."));
    if (!v || v < 10) { Alert.alert("Valor mínimo R$ 10"); return; }
    if (!key.trim()) { Alert.alert("Chave Pix necessária"); return; }
    setLoading(true);
    try {
      await api.walletWithdraw(member.member_id, v, key.trim());
      Alert.alert("Saque processado (simulado)", `${v.toFixed(2)} BLACK Coins serão enviadas para a chave Pix ${key}.`, [{ text: "OK", onPress: () => router.back() }]);
    } catch (e: any) { Alert.alert("Erro", e.message); } finally { setLoading(false); }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, backgroundColor: "#050505" }}>
      <Stack.Screen options={{ title: "Sacar para Pix", headerStyle: { backgroundColor: "#050505" }, headerTintColor: "#FFF" }} />
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <View style={styles.card}>
          <Ionicons name="alert-circle" size={22} color="#F5C150" />
          <Text style={styles.sub}>Saque processado em até 24h em modo simulado. Quando conectarmos o gateway real, o tempo baixa para segundos.</Text>
        </View>

        <Text style={styles.lbl}>VALOR (R$)</Text>
        <TextInput style={styles.input} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0,00" placeholderTextColor="#555" />

        <Text style={styles.lbl}>CHAVE PIX DE DESTINO</Text>
        <TextInput style={styles.inputSmall} value={key} onChangeText={setKey} placeholder="CPF, email, telefone ou chave aleatória" placeholderTextColor="#555" autoCapitalize="none" />

        <TouchableOpacity style={[styles.btn, loading && { opacity: 0.5 }]} disabled={loading} onPress={submit} testID="withdraw-submit">
          {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnTxt}>SACAR (SIMULADO)</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", gap: 10, alignItems: "center", padding: 12, backgroundColor: "#0A0A0A", borderWidth: 1, borderColor: "#1F1F1F", borderRadius: 10, marginBottom: 18 },
  sub: { color: "#888", fontSize: 11, lineHeight: 15, flex: 1 },
  lbl: { color: "#888", fontSize: 10, fontWeight: "900", letterSpacing: 2, marginBottom: 6, marginTop: 10 },
  input: { backgroundColor: "#121212", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 14, color: "#FFF", fontSize: 24, fontWeight: "900", borderWidth: 1, borderColor: "#1F1F1F" },
  inputSmall: { backgroundColor: "#121212", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, color: "#EEE", fontSize: 14, borderWidth: 1, borderColor: "#1F1F1F" },
  btn: { marginTop: 24, backgroundColor: "#F5C150", padding: 15, borderRadius: 10, alignItems: "center" },
  btnTxt: { color: "#000", fontSize: 12, fontWeight: "900", letterSpacing: 2 },
});

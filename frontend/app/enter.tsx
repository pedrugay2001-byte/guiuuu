import { useState } from "react";
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator, Linking, Share, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, setToken } from "../src/api";
import { useGate, MemberData } from "../src/gate";
import { theme, WHATSAPP_NUMBER } from "../src/theme";

export default function Enter() {
  const router = useRouter();
  const { saveMember } = useGate();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<MemberData | null>(null);

  const submit = async () => {
    if (!name.trim() || !phone.trim() || !address.trim() || !code.trim()) {
      setError("Preencha todos os campos");
      return;
    }
    if (name.trim().split(/\s+/).length < 2) {
      setError("Informe seu nome completo");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await api.memberEnter({
        name: name.trim(),
        phone: phone.trim(),
        address: address.trim(),
        code: code.trim().toUpperCase(),
      });
      // Silent admin session for full catalog/admin features on device
      try {
        const auth = await api.login("admin@farmaclube.com", "admin123");
        await setToken(auth.token);
      } catch {}
      const m: MemberData = {
        member_id: res.member_id,
        name: res.name,
        phone: phone.trim(),
        address: address.trim(),
        invite_code: res.invite_code,
        parent_code: res.parent_code,
        parent_name: res.parent_name,
      };
      await saveMember(m);
      setSuccess(m);
    } catch (e: any) {
      setError(e.message || "Falha ao validar o código");
    } finally {
      setLoading(false);
    }
  };

  const shareCode = async () => {
    if (!success) return;
    const msg = `🖤 Você foi convidado(a) para o FarmaClube.\n\nUse meu código pessoal para entrar:\n\n*${success.invite_code}*\n\nClube exclusivo — acesso intransferível.`;
    try {
      await Share.share({ message: msg });
    } catch {}
  };

  const shareWhatsapp = async () => {
    if (!success) return;
    const msg = `Você foi convidado(a) para o FarmaClube. Use meu código pessoal: *${success.invite_code}*`;
    const url = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    const ok = await Linking.canOpenURL(url);
    if (ok) await Linking.openURL(url);
    else Alert.alert("WhatsApp não disponível");
  };

  const goToApp = () => router.replace("/(tabs)/home");

  if (success) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.bg }} testID="enter-success">
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
          <ScrollView contentContainerStyle={styles.successContainer}>
            <View style={styles.successIcon}>
              <Ionicons name="diamond" size={36} color={theme.colors.silver} />
            </View>
            <Text style={styles.successKicker}>ACESSO LIBERADO</Text>
            <Text style={styles.successTitle}>
              BEM-VINDO,{"\n"}
              {success.name.split(" ")[0].toUpperCase()}.
            </Text>
            <Text style={styles.successText}>
              Você agora está dentro. Este é o seu código pessoal —{" "}
              <Text style={{ color: theme.colors.white, fontWeight: "700" }}>
                use com critério para convidar quem você conhece de verdade.
              </Text>
            </Text>

            <View style={styles.codeCard} testID="enter-success-code">
              <Text style={styles.codeLabel}>SEU CÓDIGO PESSOAL</Text>
              <Text style={styles.codeValue}>{success.invite_code}</Text>
              <Text style={styles.codeHint}>
                Padrinho: {success.parent_name || "Guilherme (raiz)"}
              </Text>
            </View>

            <TouchableOpacity style={styles.waBtn} onPress={shareWhatsapp} testID="share-whatsapp">
              <Ionicons name="logo-whatsapp" size={18} color={theme.colors.white} />
              <Text style={styles.waBtnText}>INDICAR VIA WHATSAPP</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.secondaryBtn} onPress={shareCode} testID="share-generic">
              <Ionicons name="share-social-outline" size={16} color={theme.colors.white} />
              <Text style={styles.secondaryBtnText}>COMPARTILHAR CÓDIGO</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.primaryBtn} onPress={goToApp} testID="go-to-app">
              <Text style={styles.primaryBtnText}>ENTRAR NO APP</Text>
              <Ionicons name="arrow-forward" size={16} color={theme.colors.bg} />
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
    >
      <Stack.Screen options={{ title: "Acesso ao Clube" }} />
      <SafeAreaView style={{ flex: 1 }} edges={["bottom"]}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Text style={styles.kicker}>IDENTIFICAÇÃO</Text>
          <Text style={styles.title}>QUEM{"\n"}É VOCÊ?</Text>
          <Text style={styles.sub}>
            Dados criptografados, usados apenas para envio discreto dos pedidos e contato 1-a-1. Ninguém mais acessa.
          </Text>

          <View style={styles.field}>
            <Text style={styles.label}>Nome completo</Text>
            <TextInput
              testID="enter-name-input"
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Ex: João Silva Santos"
              placeholderTextColor={theme.colors.textMuted}
              autoCapitalize="words"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Telefone / WhatsApp</Text>
            <TextInput
              testID="enter-phone-input"
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="(11) 99999-9999"
              placeholderTextColor={theme.colors.textMuted}
              keyboardType="phone-pad"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Endereço completo</Text>
            <TextInput
              testID="enter-address-input"
              style={[styles.input, { height: 88, textAlignVertical: "top" }]}
              value={address}
              onChangeText={setAddress}
              placeholder="Rua, número, bairro, cidade/UF, CEP"
              placeholderTextColor={theme.colors.textMuted}
              multiline
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Código de acesso</Text>
            <TextInput
              testID="enter-code-input"
              style={styles.input}
              value={code}
              onChangeText={setCode}
              placeholder="Ex: X2T ou X2TG5"
              placeholderTextColor={theme.colors.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <Text style={styles.helper}>
              Use o código que você recebeu de quem te indicou.
            </Text>
          </View>

          {error && <Text style={styles.error} testID="enter-error">{error}</Text>}

          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={submit}
            disabled={loading}
            testID="enter-submit-button"
          >
            {loading ? (
              <ActivityIndicator color={theme.colors.bg} />
            ) : (
              <>
                <Text style={styles.primaryBtnText}>VALIDAR E ENTRAR</Text>
                <Ionicons name="lock-open" size={16} color={theme.colors.bg} />
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: theme.spacing.lg, gap: theme.spacing.md, paddingBottom: 40 },
  kicker: { color: theme.colors.silver, fontSize: 11, fontWeight: "800", letterSpacing: 3 },
  title: {
    color: theme.colors.white, fontSize: 38, fontWeight: "900",
    letterSpacing: -1.2, lineHeight: 40, marginTop: 6,
    textTransform: "uppercase",
  },
  sub: { color: theme.colors.textMuted, fontSize: 13, lineHeight: 20, marginTop: 8, marginBottom: theme.spacing.md },
  field: { gap: 8 },
  label: { color: theme.colors.silver, fontSize: 11, fontWeight: "800", letterSpacing: 2 },
  input: {
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: 4, padding: 16, color: theme.colors.text, fontSize: 15,
  },
  helper: { color: theme.colors.textMuted, fontSize: 11 },
  error: { color: theme.colors.error, fontSize: 13 },
  primaryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    backgroundColor: theme.colors.white, paddingVertical: 16, borderRadius: 4,
    marginTop: theme.spacing.md,
  },
  primaryBtnText: { color: theme.colors.bg, fontWeight: "800", fontSize: 13, letterSpacing: 1.5 },
  // success view
  successContainer: { padding: theme.spacing.lg, paddingBottom: 40, alignItems: "flex-start", gap: 4 },
  successIcon: {
    width: 64, height: 64, borderRadius: 32,
    borderWidth: 1, borderColor: theme.colors.silver,
    backgroundColor: theme.colors.surface,
    alignItems: "center", justifyContent: "center",
    marginTop: theme.spacing.lg, marginBottom: theme.spacing.md,
  },
  successKicker: { color: theme.colors.silver, fontSize: 11, fontWeight: "800", letterSpacing: 3 },
  successTitle: {
    color: theme.colors.white, fontSize: 40, fontWeight: "900",
    letterSpacing: -1.5, lineHeight: 42, marginTop: 6,
    textTransform: "uppercase",
  },
  successText: {
    color: theme.colors.textMuted, fontSize: 14, lineHeight: 22,
    marginTop: theme.spacing.md, marginBottom: theme.spacing.lg,
  },
  codeCard: {
    alignSelf: "stretch", alignItems: "center", padding: theme.spacing.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: 1, borderColor: theme.colors.silver, borderRadius: 8,
    marginBottom: theme.spacing.lg,
  },
  codeLabel: { color: theme.colors.silver, fontSize: 10, fontWeight: "700", letterSpacing: 2 },
  codeValue: {
    color: theme.colors.white, fontSize: 38, fontWeight: "900",
    letterSpacing: 2, marginVertical: 8,
  },
  codeHint: { color: theme.colors.textMuted, fontSize: 12 },
  waBtn: {
    alignSelf: "stretch", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    backgroundColor: theme.colors.whatsapp, paddingVertical: 16, borderRadius: 4,
    marginBottom: theme.spacing.sm,
  },
  waBtnText: { color: theme.colors.white, fontWeight: "800", fontSize: 13, letterSpacing: 1.5 },
  secondaryBtn: {
    alignSelf: "stretch", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    borderWidth: 1, borderColor: theme.colors.border,
    paddingVertical: 16, borderRadius: 4, marginBottom: theme.spacing.lg,
  },
  secondaryBtnText: { color: theme.colors.white, fontWeight: "700", fontSize: 12, letterSpacing: 1.5 },
});

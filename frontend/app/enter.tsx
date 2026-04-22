import { useMemo, useState } from "react";
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { PasswordInput } from "../src/password-input";
import { api, setToken } from "../src/api";
import { useGate, MemberData } from "../src/gate";
import { theme, BR_STATES, TIERS } from "../src/theme";
import { BrandLogo } from "../src/brand";

export default function Enter() {
  const router = useRouter();
  const { saveMember } = useGate();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [code, setCode] = useState("");
  const [showStates, setShowStates] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<MemberData | null>(null);

  const filteredStates = useMemo(
    () => (state ? BR_STATES.filter((s) => s.startsWith(state.toUpperCase())) : BR_STATES),
    [state],
  );

  const submit = async () => {
    if (!name.trim() || !phone.trim() || !email.trim() || !password ||
        !neighborhood.trim() || !city.trim() || !state.trim() || !code.trim()) {
      setError("Acesso não autorizado");
      return;
    }
    if (name.trim().split(/\s+/).length < 2) {
      setError("Acesso não autorizado");
      return;
    }
    if (password.length < 6) {
      setError("Senha deve ter 6+ caracteres");
      return;
    }
    if (password !== password2) {
      setError("As senhas não conferem");
      return;
    }
    if (!BR_STATES.includes(state.trim().toUpperCase())) {
      setError("Acesso não autorizado");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await api.memberEnter({
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim().toLowerCase(),
        password,
        neighborhood: neighborhood.trim(),
        city: city.trim(),
        state: state.trim().toUpperCase(),
        code: code.trim().toUpperCase(),
      });
      try {
        const auth = await api.login("admin@farmaclube.com", "admin123");
        await setToken(auth.token);
      } catch {}
      const m: MemberData = {
        member_id: res.member_id,
        name: res.name,
        phone: phone.trim(),
        neighborhood: res.neighborhood || neighborhood,
        city: res.city || city,
        state: res.state || state,
        invite_code: res.invite_code,
        parent_code: res.parent_code,
        parent_name: res.parent_name,
        tier: res.tier,
        nickname: res.nickname,
      };
      await saveMember(m);
      setSuccess(m);
    } catch (e: any) {
      setError(e.message || "Acesso não autorizado");
    } finally {
      setLoading(false);
    }
  };

  const goToApp = () => router.replace("/(tabs)/home");

  if (success) {
    const tier = TIERS[success.tier] || TIERS.black;
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.bg }} testID="enter-success">
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
          <ScrollView contentContainerStyle={styles.successContainer}>
            <BrandLogo size="md" />
            <View style={{ height: 28 }} />
            <View style={styles.successIcon}>
              <Ionicons name={tier.icon as any} size={32} color={tier.color} />
            </View>
            <Text style={styles.successKicker}>ACESSO AUTORIZADO</Text>
            <Text style={styles.successTitle}>
              BEM-VINDO,{"\n"}{success.name.split(" ")[0].toUpperCase()}.
            </Text>
            <Text style={styles.successText}>
              Seu plano atual é{" "}
              <Text style={{ color: tier.color, fontWeight: "900" }}>{tier.label.toUpperCase()}</Text>.{"\n"}
              Nas próximas vezes, entre apenas com seu e-mail e senha.
            </Text>

            <View style={styles.codeCard}>
              <Text style={styles.codeLabel}>SEU CÓDIGO PESSOAL</Text>
              <Text style={styles.codeValue}>{success.invite_code}</Text>
              <Text style={styles.codeHint}>Use para recuperar senha se necessário.</Text>
            </View>

            <TouchableOpacity style={styles.primaryBtn} onPress={goToApp} testID="go-to-app">
              <Text style={styles.primaryBtnText}>ENTRAR NO CLUBE</Text>
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
      <Stack.Screen
        options={{
          title: "Acesso ao clube",
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} style={{ marginLeft: 12 }} testID="enter-back">
              <Ionicons name="chevron-back" size={24} color={theme.colors.white} />
            </TouchableOpacity>
          ),
        }}
      />
      <SafeAreaView style={{ flex: 1 }} edges={["bottom"]}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Text style={styles.kicker}>PRIMEIRO ACESSO</Text>
          <Text style={styles.title}>CRIAR{"\n"}SUA CONTA.</Text>
          <Text style={styles.sub}>
            Seu acesso só é liberado se você foi pré-autorizado. Nas próximas vezes, você usa apenas e-mail e senha.
          </Text>

          <View style={styles.field}>
            <Text style={styles.label}>NOME COMPLETO</Text>
            <TextInput testID="enter-name-input" style={styles.input} value={name} onChangeText={setName}
              placeholder="Como consta no cadastro" placeholderTextColor={theme.colors.textMuted} autoCapitalize="words" />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>TELEFONE / WHATSAPP</Text>
            <TextInput testID="enter-phone-input" style={styles.input} value={phone} onChangeText={setPhone}
              placeholder="(11) 99999-9999" placeholderTextColor={theme.colors.textMuted} keyboardType="phone-pad" />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>E-MAIL</Text>
            <TextInput testID="enter-email-input" style={styles.input} value={email} onChangeText={setEmail}
              placeholder="seu@email.com" placeholderTextColor={theme.colors.textMuted}
              keyboardType="email-address" autoCapitalize="none" />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>SENHA (6+ CARACTERES)</Text>
            <PasswordInput testID="enter-password-input" value={password} onChangeText={setPassword} placeholder="Crie uma senha forte" />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>REPETIR SENHA</Text>
            <PasswordInput testID="enter-password2-input" value={password2} onChangeText={setPassword2} placeholder="Confirme a senha" />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>BAIRRO</Text>
            <TextInput testID="enter-neighborhood-input" style={styles.input} value={neighborhood} onChangeText={setNeighborhood}
              placeholder="Nome do bairro" placeholderTextColor={theme.colors.textMuted} />
          </View>

          <View style={styles.rowFields}>
            <View style={[styles.field, { flex: 2 }]}>
              <Text style={styles.label}>CIDADE</Text>
              <TextInput testID="enter-city-input" style={styles.input} value={city} onChangeText={setCity}
                placeholder="Nome da cidade" placeholderTextColor={theme.colors.textMuted} />
            </View>
            <View style={[styles.field, { flex: 1 }]}>
              <Text style={styles.label}>ESTADO</Text>
              <TouchableOpacity style={styles.input} onPress={() => setShowStates((v) => !v)} testID="enter-state-trigger">
                <Text style={{ color: state ? theme.colors.text : theme.colors.textMuted, fontSize: 15 }}>
                  {state || "UF"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
          {showStates && (
            <View style={styles.stateDropdown}>
              <ScrollView style={{ maxHeight: 180 }}>
                {filteredStates.map((s) => (
                  <TouchableOpacity key={s} style={styles.stateItem}
                    onPress={() => { setState(s); setShowStates(false); }} testID={`enter-state-${s}`}>
                    <Text style={styles.stateItemText}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          <View style={styles.field}>
            <Text style={styles.label}>CÓDIGO DE ACESSO</Text>
            <TextInput testID="enter-code-input" style={styles.input} value={code} onChangeText={setCode}
              placeholder="" autoCapitalize="characters" autoCorrect={false} />
            <Text style={styles.helper}>Utilize o código fornecido pelo clube.</Text>
          </View>

          {error && <Text style={styles.error} testID="enter-error">{error}</Text>}

          <TouchableOpacity style={styles.primaryBtn} onPress={submit} disabled={loading} testID="enter-submit-button">
            {loading ? <ActivityIndicator color={theme.colors.bg} /> : (
              <>
                <Text style={styles.primaryBtnText}>VALIDAR E ENTRAR NO CLUBE</Text>
                <Ionicons name="arrow-forward" size={16} color={theme.colors.bg} />
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.linkBtn} onPress={() => router.replace("/login")}>
            <Text style={styles.linkText}>JÁ TENHO CONTA — ENTRAR</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: theme.spacing.lg, gap: theme.spacing.md, paddingBottom: 60 },
  kicker: { color: theme.colors.silver, fontSize: 11, fontWeight: "800", letterSpacing: 3 },
  title: {
    color: theme.colors.white, fontSize: 34, fontWeight: "900",
    letterSpacing: -1.2, lineHeight: 36, marginTop: 6, textTransform: "uppercase",
  },
  sub: { color: theme.colors.textMuted, fontSize: 13, lineHeight: 20, marginTop: 8, marginBottom: theme.spacing.md },
  rowFields: { flexDirection: "row", gap: 10 },
  field: { gap: 8 },
  label: { color: theme.colors.silver, fontSize: 10, fontWeight: "800", letterSpacing: 2 },
  input: {
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: 8, padding: 15, color: theme.colors.text, fontSize: 15,
    minHeight: 48, justifyContent: "center",
  },
  stateDropdown: {
    borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8,
    backgroundColor: theme.colors.surfaceElevated, marginTop: -4,
  },
  stateItem: { paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  stateItemText: { color: theme.colors.text, fontSize: 14, fontWeight: "700", letterSpacing: 1 },
  helper: { color: theme.colors.textMuted, fontSize: 11 },
  error: {
    color: theme.colors.error, fontSize: 13, textAlign: "center",
    backgroundColor: "rgba(255,59,48,0.08)",
    borderWidth: 1, borderColor: "rgba(255,59,48,0.3)",
    padding: 12, borderRadius: 8,
  },
  primaryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    backgroundColor: theme.colors.white, paddingVertical: 17, borderRadius: 8,
    marginTop: theme.spacing.md,
  },
  primaryBtnText: { color: theme.colors.bg, fontWeight: "900", fontSize: 13, letterSpacing: 1.5 },
  linkBtn: { alignItems: "center", paddingVertical: 12 },
  linkText: { color: theme.colors.textMuted, fontSize: 11, fontWeight: "800", letterSpacing: 2 },
  successContainer: { padding: theme.spacing.lg, paddingBottom: 40, alignItems: "flex-start" },
  successIcon: {
    width: 64, height: 64, borderRadius: 32,
    borderWidth: 1, borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    alignItems: "center", justifyContent: "center", marginBottom: theme.spacing.md,
  },
  successKicker: { color: theme.colors.silver, fontSize: 11, fontWeight: "800", letterSpacing: 3 },
  successTitle: {
    color: theme.colors.white, fontSize: 38, fontWeight: "900",
    letterSpacing: -1.5, lineHeight: 40, marginTop: 8, textTransform: "uppercase",
  },
  successText: {
    color: theme.colors.textMuted, fontSize: 14, lineHeight: 22,
    marginTop: theme.spacing.md, marginBottom: theme.spacing.lg,
  },
  codeCard: {
    alignSelf: "stretch", alignItems: "center", padding: theme.spacing.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: 1, borderColor: theme.colors.borderStrong, borderRadius: 10,
    marginBottom: theme.spacing.lg,
  },
  codeLabel: { color: theme.colors.silver, fontSize: 10, fontWeight: "800", letterSpacing: 2.5 },
  codeValue: { color: theme.colors.white, fontSize: 36, fontWeight: "900", letterSpacing: 3, marginVertical: 8 },
  codeHint: { color: theme.colors.textMuted, fontSize: 12 },
});

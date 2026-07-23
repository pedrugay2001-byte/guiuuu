import { useState } from "react";
import {
  View, Text, StyleSheet, ImageBackground, TouchableOpacity,
  TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "../src/icons";
import { theme } from "../src/theme";
import { BrandLogo } from "../src/brand";

// Dark gym hero image as the background of the gate
const BG = "https://images.unsplash.com/photo-1546483875-ad9014c88eba?auto=format&fit=crop&w=1200&q=60";

const API_BASE = (process.env.EXPO_PUBLIC_BACKEND_URL || "https://member-shop-2.preview.emergentagent.com").replace(/\/$/, "") + "/api";

export default function Welcome() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  const onEnter = async () => {
    setError("");
    const clean = code.trim().toUpperCase();
    if (clean.length < 3) {
      setError("Digite o código de acesso.");
      return;
    }
    setChecking(true);
    try {
      // Check if the code is authorized on backend (admin pre-authorization)
      const res = await fetch(`${API_BASE}/gate/check?code=${encodeURIComponent(clean)}`);
      if (res.ok) {
        // Code is valid, go to register flow with code pre-filled
        router.push({ pathname: "/enter", params: { code: clean } });
      } else {
        setError("Código não autorizado. Solicite sua autorização à administração.");
      }
    } catch (e: any) {
      // If endpoint not available, still allow to continue
      router.push({ pathname: "/enter", params: { code: clean } });
    } finally {
      setChecking(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1, backgroundColor: "#000" }}
    >
      <ImageBackground source={{ uri: BG }} style={{ flex: 1 }} imageStyle={{ opacity: 0.55 }}>
        <View style={styles.overlay} />
        <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
          {/* Brand top */}
          <View style={styles.brandWrap}>
            <BrandLogo size="md" />
          </View>

          {/* Center content */}
          <View style={styles.center}>
            <View style={styles.kickerRow}>
              <View style={styles.kickerBar} />
              <Text style={styles.kicker}>ACESSO RESTRITO</Text>
            </View>
            <Text style={styles.title}>CLUBE{"\n"}PRIVADO</Text>
            <Text style={styles.sub}>
              Insira o código de acesso para entrar. O acesso é liberado apenas por indicação e autorização da administração.
            </Text>

            <View style={styles.field}>
              <Text style={styles.label}>CÓDIGO DE ACESSO</Text>
              <TextInput
                style={styles.input}
                value={code}
                onChangeText={(t) => { setCode(t); setError(""); }}
                placeholder="Ex.: BLACK-XXXXXX"
                placeholderTextColor={"#555"}
                autoCapitalize="characters"
                autoCorrect={false}
                onSubmitEditing={onEnter}
                testID="gate-code-input"
              />
              {error ? <Text style={styles.err}>{error}</Text> : null}
            </View>

            <TouchableOpacity
              style={[styles.cta, (!code.trim() || checking) && { opacity: 0.55 }]}
              onPress={onEnter}
              disabled={!code.trim() || checking}
              testID="gate-continue"
              activeOpacity={0.85}
            >
              {checking ? (
                <ActivityIndicator color={theme.colors.bg} />
              ) : (
                <>
                  <Text style={styles.ctaText}>CONTINUAR</Text>
                  <Ionicons name="arrow-forward" size={16} color={theme.colors.bg} />
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Bottom links */}
          <View style={styles.bottomLinks}>
            <TouchableOpacity
              onPress={() => router.push("/login")}
              testID="welcome-login-link"
              style={styles.bottomLink}
              activeOpacity={0.8}
            >
              <View style={[styles.bottomIconBox, { borderColor: "#7FD7E5" }]}>
                <Ionicons name="key" size={16} color="#7FD7E5" />
              </View>
              <View>
                <Text style={styles.bottomLinkTitle}>JÁ SOU MEMBRO</Text>
                <Text style={styles.bottomLinkSub}>Entre com e-mail e senha</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push("/staff/choose")}
              testID="welcome-staff-link"
              style={styles.bottomLink}
              activeOpacity={0.8}
            >
              <View style={[styles.bottomIconBox, { borderColor: "#F5C150" }]}>
                <Ionicons name="shield-checkmark" size={16} color="#F5C150" />
              </View>
              <View>
                <Text style={styles.bottomLinkTitle}>ÁREA DA EQUIPE</Text>
                <Text style={styles.bottomLinkSub}>Suporte, admin e financeiro</Text>
              </View>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </ImageBackground>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.65)" },

  safe: {
    flex: 1, paddingHorizontal: 22,
    justifyContent: "space-between",
  },
  brandWrap: {
    alignItems: "center", paddingTop: 10,
  },
  center: {
    flex: 1, justifyContent: "center", paddingBottom: 20,
  },
  kickerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  kickerBar: { width: 32, height: 2, backgroundColor: theme.colors.silver },
  kicker: { color: theme.colors.silver, fontSize: 11, fontWeight: "800", letterSpacing: 3.5 },
  title: {
    color: theme.colors.white, fontSize: 44, fontWeight: "900",
    letterSpacing: -1.2, lineHeight: 46, textTransform: "uppercase",
    marginBottom: 10,
  },
  sub: { color: "#C8C8C8", fontSize: 13, lineHeight: 19, marginBottom: 22, maxWidth: 380 },

  field: { marginBottom: 16 },
  label: { color: theme.colors.silver, fontSize: 10, fontWeight: "800", letterSpacing: 2, marginBottom: 8 },
  input: {
    backgroundColor: "rgba(20,20,20,0.75)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 10,
    color: theme.colors.white,
    fontSize: 18, fontWeight: "700", letterSpacing: 2,
    padding: 16,
  },
  err: { color: theme.colors.error, fontSize: 11, marginTop: 6 },

  cta: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    backgroundColor: theme.colors.white,
    paddingVertical: 17, borderRadius: 8,
    marginTop: 4,
  },
  ctaText: { color: theme.colors.bg, fontWeight: "900", fontSize: 13, letterSpacing: 2 },

  bottomLinks: { gap: 10, paddingBottom: 10 },
  bottomLink: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 12, paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
  },
  bottomIconBox: {
    width: 34, height: 34, borderRadius: 17,
    borderWidth: 1.5,
    alignItems: "center", justifyContent: "center",
  },
  bottomLinkTitle: { color: theme.colors.white, fontSize: 11, fontWeight: "900", letterSpacing: 1.5 },
  bottomLinkSub: { color: theme.colors.textMuted, fontSize: 9, marginTop: 2, letterSpacing: 0.5 },
});

import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";

type Props = { children: React.ReactNode };
type State = { hasError: boolean; error?: Error };

/**
 * Global error boundary. Prevents the app from going blank on any render error.
 * Shows a premium-looking error screen with a retry CTA.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Log but never crash
    // eslint-disable-next-line no-console
    console.log("[BLACKSCLUB ErrorBoundary]", error?.message, info?.componentStack);
  }

  reset = () => {
    this.setState({ hasError: false, error: undefined });
    if (Platform.OS === "web" && typeof window !== "undefined") {
      try { window.location.href = "/home"; } catch {}
    }
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    const msg = this.state.error?.message || "Algo inesperado aconteceu.";
    return (
      <View style={s.container}>
        <View style={s.badge}>
          <Ionicons name="alert-circle" size={28} color="#D4AF37" />
        </View>
        <Text style={s.kicker}>BLACKSCLUB</Text>
        <Text style={s.title}>Tivemos um contratempo.</Text>
        <Text style={s.sub}>{msg}</Text>
        <Text style={s.hint}>Seu acesso ao clube continua ativo.</Text>

        <TouchableOpacity style={s.cta} onPress={this.reset} testID="error-retry">
          <Ionicons name="refresh" size={16} color="#000" />
          <Text style={s.ctaTxt}>VOLTAR AO CLUBE</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const s = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: "#050505",
    alignItems: "center", justifyContent: "center",
    paddingHorizontal: 32,
  },
  badge: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: "rgba(212,175,55,0.12)",
    borderWidth: 1, borderColor: "rgba(212,175,55,0.35)",
    alignItems: "center", justifyContent: "center",
    marginBottom: 18,
  },
  kicker: { color: "#D4AF37", fontSize: 10, fontWeight: "900", letterSpacing: 4, marginBottom: 8 },
  title: { color: "#FFF", fontSize: 20, fontWeight: "800", textAlign: "center" },
  sub: { color: "#999", fontSize: 13, textAlign: "center", marginTop: 10, maxWidth: 320, lineHeight: 19 },
  hint: { color: "#666", fontSize: 11, marginTop: 14, letterSpacing: 1 },
  cta: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#D4AF37",
    paddingHorizontal: 22, paddingVertical: 14,
    borderRadius: 28, marginTop: 28,
  },
  ctaTxt: { color: "#000", fontSize: 12, fontWeight: "900", letterSpacing: 2 },
});

export default ErrorBoundary;

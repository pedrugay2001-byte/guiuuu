import { useEffect } from "react";
import { View, Text, StyleSheet, ImageBackground, TouchableOpacity, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../src/auth";
import { theme } from "../src/theme";

export default function Welcome() {
  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    if (user) router.replace("/(tabs)/home");
  }, [user, router]);

  if (user === undefined) {
    return (
      <View style={[styles.container, { justifyContent: "center" }]}>
        <ActivityIndicator color={theme.colors.white} />
      </View>
    );
  }

  return (
    <View style={styles.container} testID="welcome-screen">
      <ImageBackground
        source={{
          uri: "https://images.pexels.com/photos/29825227/pexels-photo-29825227.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
        }}
        style={styles.bg}
        resizeMode="cover"
      >
        <View style={styles.overlay} />
        <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
          <View style={styles.topArea}>
            <View style={styles.badge}>
              <Ionicons name="diamond" size={14} color={theme.colors.silver} />
              <Text style={styles.badgeText}>CLUBE EXCLUSIVO</Text>
            </View>
          </View>

          <View style={styles.bottomArea}>
            <Text style={styles.brand}>FARMA</Text>
            <Text style={[styles.brand, styles.brandAccent]}>CLUBE</Text>
            <Text style={styles.subtitle}>
              Acesso premium a emagrecedores, peptídeos, hormônios e a linha Landerlan.
              Preços exclusivos para membros.
            </Text>

            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => router.push("/login")}
              testID="welcome-login-button"
            >
              <Text style={styles.primaryBtnText}>ENTRAR NO CLUBE</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => router.push("/register")}
              testID="welcome-register-button"
            >
              <Text style={styles.secondaryBtnText}>CRIAR CONTA</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  bg: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  safe: { flex: 1, paddingHorizontal: theme.spacing.lg, justifyContent: "space-between" },
  topArea: { alignItems: "flex-start", paddingTop: theme.spacing.md },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  badgeText: {
    color: theme.colors.silver,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 2,
  },
  bottomArea: { paddingBottom: theme.spacing.xl, gap: theme.spacing.sm },
  brand: {
    color: theme.colors.white,
    fontSize: 56,
    fontWeight: "900",
    letterSpacing: -2,
    lineHeight: 56,
  },
  brandAccent: { color: theme.colors.silver },
  subtitle: {
    color: theme.colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.lg,
    maxWidth: 340,
  },
  primaryBtn: {
    backgroundColor: theme.colors.white,
    paddingVertical: 16,
    borderRadius: 4,
    alignItems: "center",
    marginBottom: theme.spacing.sm,
  },
  primaryBtnText: {
    color: theme.colors.bg,
    fontWeight: "800",
    fontSize: 14,
    letterSpacing: 1.5,
  },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: 16,
    borderRadius: 4,
    alignItems: "center",
  },
  secondaryBtnText: {
    color: theme.colors.white,
    fontWeight: "600",
    fontSize: 14,
    letterSpacing: 1.5,
  },
});

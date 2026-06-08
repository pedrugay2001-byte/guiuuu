import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useGate } from "../src/gate";
import { theme } from "../src/theme";

export default function Index() {
  const router = useRouter();
  const { member } = useGate();

  useEffect(() => {
    if (member === undefined) return; // still loading
    if (member) {
      // Logado — direto para a home (sem onboarding)
      router.replace("/(tabs)/home");
    } else {
      // Não logado — direto para a tela de LOGIN (sem onboarding, sem welcome gate)
      router.replace("/login");
    }
  }, [member, router]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg, justifyContent: "center" }}>
      <ActivityIndicator color={theme.colors.white} />
    </View>
  );
}

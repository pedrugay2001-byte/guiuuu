import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useGate } from "../src/gate";
import { theme } from "../src/theme";

export default function Index() {
  const router = useRouter();
  const { member } = useGate();

  useEffect(() => {
    if (member === undefined) return; // still loading
    (async () => {
      if (member) {
        // Logado — mas mostra onboarding na PRIMEIRA vez (após login inicial)
        try {
          const seen = await AsyncStorage.getItem("onboarding_done");
          if (seen === "1") {
            router.replace("/(tabs)/home");
          } else {
            router.replace("/onboarding");
          }
        } catch {
          router.replace("/(tabs)/home");
        }
        return;
      }
      // Sem membro logado — vai direto pro fluxo de boas-vindas/login
      router.replace("/welcome");
    })();
  }, [member, router]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg, justifyContent: "center" }}>
      <ActivityIndicator color={theme.colors.white} />
    </View>
  );
}

import { Tabs, useRouter } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useEffect } from "react";
import { useGate } from "../../src/gate";
import { theme } from "../../src/theme";
import TopTabBar from "../../src/top-tab-bar";

export default function TabsLayout() {
  const router = useRouter();
  const { member } = useGate();

  useEffect(() => {
    if (member === null) router.replace("/login");
  }, [member, router]);

  if (!member) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.bg, justifyContent: "center" }}>
        <ActivityIndicator color={theme.colors.white} />
      </View>
    );
  }

  // ARQUITETURA (iPhone-safe):
  // - SafeAreaView aplica TOPO + laterais (edges=["top","left","right"]).
  // - BARRA INFERIOR é GLOBAL e fica no _layout root (visível em TODAS as telas).
  // - TopTabBar (BLACKSCLUB + Perfil) só renderiza na Home (lógica interna do componente).
  // - Demais abas ficam sem cabeçalho → mais área útil para o conteúdo.
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
      edges={["top", "left", "right"]}
    >
      <Tabs
        tabBar={(props) => <TopTabBar {...props} />}
        screenOptions={{
          headerShown: false,
          tabBarPosition: "top",
        }}
      >
        <Tabs.Screen name="home" options={{ href: null }} />
        <Tabs.Screen name="catalog" options={{ title: "Loja" }} />
        <Tabs.Screen name="community" options={{ title: "Social" }} />
        <Tabs.Screen name="performance" options={{ title: "Metas" }} />
        <Tabs.Screen name="wallet" options={{ title: "Banco" }} />
        <Tabs.Screen name="member" options={{ title: "Perfil" }} />
        <Tabs.Screen name="cart" options={{ href: null }} />
        <Tabs.Screen name="notifications" options={{ href: null }} />
        <Tabs.Screen name="negocios" options={{ href: null }} />
      </Tabs>
    </SafeAreaView>
  );
}

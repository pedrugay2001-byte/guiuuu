import { Tabs, useRouter } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useEffect, useState } from "react";
import { useGate } from "../../src/gate";
import { theme } from "../../src/theme";
import { api } from "../../src/api";
import TopTabBar from "../../src/top-tab-bar";
import BottomBrandBar from "../../src/bottom-brand-bar";

export default function TabsLayout() {
  const router = useRouter();
  const { member } = useGate();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (member === null) router.replace("/welcome");
  }, [member, router]);

  useEffect(() => {
    if (!member) return;
    let alive = true;
    const poll = async () => {
      try {
        const r = await api.notificationsCount(member.member_id);
        if (alive) setUnread(r?.count || 0);
      } catch {}
    };
    poll();
    const t = setInterval(poll, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, [member]);

  if (!member) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.bg, justifyContent: "center" }}>
        <ActivityIndicator color={theme.colors.white} />
      </View>
    );
  }

  // ARQUITETURA (iPhone-safe):
  // - UM único SafeAreaView cobrindo topo + fundo (edges=["top","bottom"]).
  // - TopTabBar e BottomBrandBar como Views puros (não aplicam safe-area por conta própria).
  // - Telas internas também como Views puros (edges=[] no SafeAreaView das telas, se houver).
  // Isso elimina duplicação de padding no iPhone real e garante que o conteúdo ocupe
  // EXATAMENTE o espaço entre a top bar e a bottom bar, sem corte nem sobreposição.
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
      edges={["top", "bottom", "left", "right"]}
    >
      <Tabs
        tabBar={(props) => <TopTabBar {...props} />}
        screenOptions={{
          headerShown: false,
          tabBarPosition: "top",
        }}
      >
        <Tabs.Screen name="home" options={{ title: "Home" }} />
        <Tabs.Screen name="catalog" options={{ title: "Loja" }} />
        <Tabs.Screen name="community" options={{ title: "Social" }} />
        <Tabs.Screen name="performance" options={{ title: "Metas" }} />
        <Tabs.Screen name="wallet" options={{ title: "Banco" }} />
        <Tabs.Screen name="cart" options={{ href: null }} />
        <Tabs.Screen name="notifications" options={{ href: null }} />
        <Tabs.Screen name="negocios" options={{ href: null }} />
        <Tabs.Screen name="member" options={{ href: null }} />
      </Tabs>
      <BottomBrandBar unread={unread} />
    </SafeAreaView>
  );
}

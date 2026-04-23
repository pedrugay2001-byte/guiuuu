import { Tabs, useRouter } from "expo-router";
import { View, ActivityIndicator } from "react-native";
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

  // Notificações (badge da barra inferior)
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

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
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

        {/* Hidden tabs (accessed only via direct navigation) */}
        <Tabs.Screen name="cart" options={{ href: null }} />
        <Tabs.Screen name="notifications" options={{ href: null }} />
        <Tabs.Screen name="negocios" options={{ href: null }} />
        <Tabs.Screen name="member" options={{ href: null }} />
      </Tabs>

      {/* Rodapé fixo com logo BLACKSCLUB + perfil + notificações */}
      <BottomBrandBar unread={unread} />
    </View>
  );
}

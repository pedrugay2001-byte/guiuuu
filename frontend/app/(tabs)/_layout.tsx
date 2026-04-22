import { Tabs, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from "react-native";
import { useEffect } from "react";
import { useGate } from "../../src/gate";
import { theme, TIERS } from "../../src/theme";
import { BrandLogo } from "../../src/brand";

export default function TabsLayout() {
  const router = useRouter();
  const { member } = useGate();

  useEffect(() => {
    if (member === null) router.replace("/welcome");
  }, [member, router]);

  if (!member) {
    return <View style={{ flex: 1, backgroundColor: theme.colors.bg, justifyContent: "center" }}><ActivityIndicator color={theme.colors.white} /></View>;
  }

  const HeaderLeft = () => <View style={{ width: 14 }} />;
  const HeaderRight = () => (
    <TouchableOpacity style={styles.memberBtn} onPress={() => router.push("/(tabs)/member")} testID="header-member" activeOpacity={0.85}>
      <View style={styles.memberInner}>
        <Ionicons name="person" size={18} color="#E8C96B" />
      </View>
    </TouchableOpacity>
  );

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.bg, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
        headerTintColor: theme.colors.text,
        headerTitle: () => <BrandLogo size="md" />,
        headerTitleAlign: "center",
        headerLeft: () => <HeaderLeft />,
        headerRight: () => <HeaderRight />,
        tabBarStyle: { backgroundColor: theme.colors.bg, borderTopColor: theme.colors.border, borderTopWidth: 1, height: 70, paddingTop: 6, paddingBottom: 12 },
        tabBarActiveTintColor: theme.colors.white,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarLabelStyle: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
      }}
    >
      <Tabs.Screen name="home" options={{ title: "Início", headerTransparent: true, headerStyle: { backgroundColor: "transparent", borderBottomWidth: 0, elevation: 0, shadowOpacity: 0 }, headerTitle: () => null, tabBarIcon: ({ color, size }) => <Ionicons name="home" color={color} size={size} /> }} />
      <Tabs.Screen name="catalog" options={{ title: "Catálogo", headerStyle: { backgroundColor: theme.colors.bg, borderBottomWidth: 1, borderBottomColor: theme.colors.border }, headerTitle: () => <BrandLogo size="sm" />, tabBarIcon: ({ color, size }) => <Ionicons name="grid" color={color} size={size} /> }} />
      <Tabs.Screen name="community" options={{ title: "Comunidade", headerShown: false, tabBarIcon: ({ color, size }) => <Ionicons name="people" color={color} size={size} /> }} />
      <Tabs.Screen name="negocios" options={{ href: null }} />
      <Tabs.Screen name="notifications" options={{ title: "Alertas", headerStyle: { backgroundColor: theme.colors.bg, borderBottomWidth: 1, borderBottomColor: theme.colors.border }, headerTitle: () => <Text style={{ color: "#FFF", fontWeight: "900", letterSpacing: 2, fontSize: 14 }}>NOTIFICAÇÕES</Text>, tabBarIcon: ({ color, size }) => <Ionicons name="notifications" color={color} size={size} /> }} />
      <Tabs.Screen name="wallet" options={{ title: "Banco", tabBarIcon: ({ color, size }) => <Ionicons name="wallet" color={color} size={size} /> }} />
      <Tabs.Screen name="member" options={{ href: null }} />
      <Tabs.Screen name="cart" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  memberBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", marginRight: 14, backgroundColor: "#0A0A0A", borderWidth: 2, borderColor: "#D4AF37", shadowColor: "#D4AF37", shadowOpacity: 0.8, shadowRadius: 6, shadowOffset: { width: 0, height: 0 }, elevation: 4 },
  memberInner: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "#0F0F0F" },
});

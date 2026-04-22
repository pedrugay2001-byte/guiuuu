import { Tabs, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from "react-native";
import { useEffect } from "react";
import { useGate } from "../../src/gate";
import { useCart } from "../../src/cart";
import { theme, TIERS } from "../../src/theme";
import { BrandLogo } from "../../src/brand";

export default function TabsLayout() {
  const router = useRouter();
  const { member } = useGate();
  const { count } = useCart();

  useEffect(() => {
    if (member === null) router.replace("/welcome");
  }, [member, router]);

  if (!member) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.bg, justifyContent: "center" }}>
        <ActivityIndicator color={theme.colors.white} />
      </View>
    );
  }

  const tier = TIERS[member.tier] || TIERS.black;

  const HeaderLeft = () => (
    <View style={{ marginLeft: 14, flexDirection: "row", alignItems: "center", gap: 10 }}>
      <BrandLogo size="sm" />
    </View>
  );

  const HeaderRight = () => (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginRight: 12 }}>
      <View style={[styles.tierPill, { borderColor: tier.color }]}>
        <Ionicons name={tier.icon as any} size={10} color={tier.color} />
        <Text style={[styles.tierText, { color: tier.color }]}>{tier.label.toUpperCase()}</Text>
      </View>
      <TouchableOpacity onPress={() => router.push("/chat")} style={styles.chatBtn} testID="header-chat-button">
        <Ionicons name="chatbubble-ellipses" size={16} color={theme.colors.white} />
      </TouchableOpacity>
    </View>
  );

  return (
    <Tabs
      screenOptions={{
        headerStyle: {
          backgroundColor: theme.colors.bg,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
        },
        headerTintColor: theme.colors.text,
        headerTitle: "",
        headerLeft: () => <HeaderLeft />,
        headerRight: () => <HeaderRight />,
        tabBarStyle: {
          backgroundColor: theme.colors.bg,
          borderTopColor: theme.colors.border,
          borderTopWidth: 1,
          height: 70,
          paddingTop: 6,
          paddingBottom: 12,
        },
        tabBarActiveTintColor: theme.colors.white,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarLabelStyle: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
      }}
    >
      <Tabs.Screen name="home" options={{ title: "Início", tabBarIcon: ({ color, size }) => <Ionicons name="home" color={color} size={size} /> }} />
      <Tabs.Screen name="catalog" options={{ title: "Catálogo", tabBarIcon: ({ color, size }) => <Ionicons name="grid" color={color} size={size} /> }} />
      <Tabs.Screen name="community" options={{ title: "Comunidade", tabBarIcon: ({ color, size }) => <Ionicons name="people" color={color} size={size} /> }} />
      <Tabs.Screen
        name="cart"
        options={{
          title: "Carrinho",
          tabBarIcon: ({ color, size }) => (
            <View>
              <Ionicons name="cart" color={color} size={size} />
              {count > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{count}</Text>
                </View>
              )}
            </View>
          ),
        }}
      />
      <Tabs.Screen name="member" options={{ title: "Membro", tabBarIcon: ({ color, size }) => <Ionicons name="person" color={color} size={size} /> }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tierPill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderRadius: 20,
  },
  tierText: { fontSize: 9, fontWeight: "900", letterSpacing: 1.5 },
  chatBtn: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: "center", justifyContent: "center",
    backgroundColor: theme.colors.surface,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  badge: {
    position: "absolute",
    top: -4, right: -8,
    backgroundColor: theme.colors.white,
    borderRadius: 10, minWidth: 18, height: 18, paddingHorizontal: 4,
    alignItems: "center", justifyContent: "center",
  },
  badgeText: { color: theme.colors.bg, fontSize: 10, fontWeight: "800" },
});

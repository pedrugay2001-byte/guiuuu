import { Tabs, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { useEffect } from "react";
import { useAuth } from "../../src/auth";
import { useCart } from "../../src/cart";
import { theme } from "../../src/theme";

export default function TabsLayout() {
  const router = useRouter();
  const { user } = useAuth();
  const { count } = useCart();

  useEffect(() => {
    if (user === null) router.replace("/");
  }, [user, router]);

  if (user === undefined || user === null) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.bg, justifyContent: "center" }}>
        <ActivityIndicator color={theme.colors.white} />
      </View>
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.bg, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
        headerTintColor: theme.colors.text,
        headerTitleStyle: { fontWeight: "700", letterSpacing: 0.5 },
        tabBarStyle: {
          backgroundColor: theme.colors.bg,
          borderTopColor: theme.colors.border,
          borderTopWidth: 1,
          height: 68,
          paddingTop: 6,
          paddingBottom: 10,
        },
        tabBarActiveTintColor: theme.colors.white,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarLabelStyle: { fontSize: 10, fontWeight: "600", letterSpacing: 0.5 },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Início",
          tabBarIcon: ({ color, size }) => <Ionicons name="home" color={color} size={size} />,
          tabBarTestID: "tab-home",
        }}
      />
      <Tabs.Screen
        name="catalog"
        options={{
          title: "Catálogo",
          tabBarIcon: ({ color, size }) => <Ionicons name="grid" color={color} size={size} />,
          tabBarTestID: "tab-catalog",
        }}
      />
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
          tabBarTestID: "tab-cart",
        }}
      />
      <Tabs.Screen
        name="member"
        options={{
          title: "Membro",
          tabBarIcon: ({ color, size }) => <Ionicons name="person" color={color} size={size} />,
          tabBarTestID: "tab-member",
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: "absolute",
    top: -4,
    right: -8,
    backgroundColor: theme.colors.white,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: theme.colors.bg, fontSize: 10, fontWeight: "800" },
});

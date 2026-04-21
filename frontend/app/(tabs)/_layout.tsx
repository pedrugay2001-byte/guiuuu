import { Tabs, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from "react-native";
import { useEffect } from "react";
import { useGate } from "../../src/gate";
import { useCart } from "../../src/cart";
import { theme } from "../../src/theme";

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

  const HeaderChatButton = () => (
    <TouchableOpacity
      onPress={() => router.push("/chat")}
      style={styles.headerChat}
      testID="header-chat-button"
      activeOpacity={0.7}
    >
      <Ionicons name="chatbubble-ellipses" size={18} color={theme.colors.white} />
      <Text style={styles.headerChatText}>SUPORTE</Text>
    </TouchableOpacity>
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
        headerTitleStyle: { fontWeight: "800", letterSpacing: 1 },
        headerRight: () => <HeaderChatButton />,
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
        tabBarLabelStyle: { fontSize: 10, fontWeight: "700", letterSpacing: 0.8 },
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
  headerChat: {
    flexDirection: "row", alignItems: "center", gap: 6,
    marginRight: 14, paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: 20, backgroundColor: theme.colors.surface,
  },
  headerChatText: {
    color: theme.colors.white, fontSize: 10, fontWeight: "800", letterSpacing: 1.5,
  },
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

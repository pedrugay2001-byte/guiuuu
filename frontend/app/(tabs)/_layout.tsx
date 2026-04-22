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
  const firstName = member.name?.split(" ")[0] || "Membro";

  const HeaderLeft = () => (
    <TouchableOpacity
      style={styles.headerLeft}
      onPress={() => router.push("/(tabs)/member")}
      testID="header-member"
    >
      <Ionicons name="diamond" size={12} color={tier.color} />
      <Text style={styles.memberName} numberOfLines={1}>{firstName}</Text>
    </TouchableOpacity>
  );

  const HeaderTitle = () => <BrandLogo size="sm" />;

  const HeaderRight = () => (
    <TouchableOpacity
      style={styles.walletBtn}
      onPress={() => router.push("/wallet")}
      testID="header-wallet-button"
    >
      <Ionicons name="wallet" size={16} color={theme.colors.white} />
      <Text style={styles.walletBalance}>0 BC</Text>
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
        headerTitle: () => <HeaderTitle />,
        headerTitleAlign: "center",
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

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

  // LEFT: Wallet (functional) + decorative diamond beside it
  const HeaderLeft = () => (
    <TouchableOpacity
      style={styles.walletBtn}
      onPress={() => router.push("/wallet")}
      testID="header-wallet-button"
      activeOpacity={0.85}
    >
      <Ionicons name="wallet" size={16} color={theme.colors.white} />
      <Text style={styles.walletBalance}>0 BC</Text>
      <View style={[styles.deco, { borderColor: tier.color }]}>
        <Ionicons name="diamond" size={10} color={tier.color} />
      </View>
    </TouchableOpacity>
  );

  const HeaderTitle = () => <BrandLogo size="sm" />;

  // RIGHT: Member icon — goes to /member tab — gold halo like the reference
  const HeaderRight = () => (
    <TouchableOpacity
      style={styles.memberBtn}
      onPress={() => router.push("/(tabs)/member")}
      testID="header-member"
      activeOpacity={0.85}
    >
      <View style={styles.memberInner}>
        <Ionicons name="person" size={18} color="#E8C96B" />
      </View>
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
        headerTitle: () => <BrandLogo size="sm" />,
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
      <Tabs.Screen name="home" options={{ title: "Início", headerTransparent: true, headerStyle: { backgroundColor: "transparent", borderBottomWidth: 0, elevation: 0, shadowOpacity: 0 }, headerTitle: () => null, tabBarIcon: ({ color, size }) => <Ionicons name="home" color={color} size={size} /> }} />
      <Tabs.Screen name="catalog" options={{ title: "Catálogo", headerTransparent: false, headerStyle: { backgroundColor: theme.colors.bg, borderBottomWidth: 1, borderBottomColor: theme.colors.border }, headerTitle: () => <BrandLogo size="sm" />, tabBarIcon: ({ color, size }) => <Ionicons name="grid" color={color} size={size} /> }} />
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
      <Tabs.Screen name="member" options={{ href: null }} />
      <Tabs.Screen name="wallet" options={{ title: "Carteira", tabBarIcon: ({ color, size }) => <Ionicons name="wallet" color={color} size={size} /> }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  walletBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    marginLeft: 14,
    paddingHorizontal: 10, paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: theme.colors.surface,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  walletBalance: { color: theme.colors.white, fontSize: 11, fontWeight: "800", letterSpacing: 0.3 },
  deco: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 1,
    alignItems: "center", justifyContent: "center",
    marginLeft: 2,
  },
  memberBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: "center", justifyContent: "center",
    marginRight: 14,
    backgroundColor: "#0A0A0A",
    borderWidth: 2,
    borderColor: "#D4AF37",
    shadowColor: "#D4AF37",
    shadowOpacity: 0.8,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  memberInner: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "#0F0F0F",
  },
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

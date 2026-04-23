import { Tabs, useRouter } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Platform } from "react-native";
import { useEffect, useState } from "react";
import { useGate } from "../../src/gate";
import { theme } from "../../src/theme";
import { BrandLogo } from "../../src/brand";
import { api } from "../../src/api";

const GOLD = "#F5C150";

export default function TabsLayout() {
  const router = useRouter();
  const { member } = useGate();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (member === null) router.replace("/welcome");
  }, [member, router]);

  // Poll notifications count (the bell in the header)
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
    return <View style={{ flex: 1, backgroundColor: theme.colors.bg, justifyContent: "center" }}><ActivityIndicator color={theme.colors.white} /></View>;
  }

  const HeaderRight = () => (
    <View style={styles.rightRow}>
      {/* Bell with unread badge */}
      <TouchableOpacity style={styles.iconBtn} onPress={() => router.push("/notifications" as any)} testID="header-bell" activeOpacity={0.85}>
        <Ionicons name="notifications" size={20} color="#EEE" />
        {unread > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeTxt}>{unread > 9 ? "9+" : unread}</Text>
          </View>
        )}
      </TouchableOpacity>
      {/* Profile ring */}
      <TouchableOpacity style={styles.profileBtn} onPress={() => router.push("/(tabs)/member")} testID="header-member" activeOpacity={0.85}>
        <View style={styles.profileInner}>
          <Ionicons name="person" size={16} color={GOLD} />
        </View>
      </TouchableOpacity>
    </View>
  );

  // Label premium — nomes curtos, nunca cortam, 2 linhas permitidas
  const TabLabel = ({ focused, label }: { focused: boolean; label: string }) => (
    <Text
      numberOfLines={1}
      allowFontScaling={false}
      adjustsFontSizeToFit={Platform.OS === "ios"}
      style={{
        fontSize: 10.5,
        fontWeight: focused ? "800" : "600",
        letterSpacing: 0,
        color: focused ? GOLD : "#7A7A7A",
        textAlign: "center",
        marginTop: 4,
        includeFontPadding: false,
      } as any}
    >
      {label}
    </Text>
  );

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.bg, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
        headerTintColor: theme.colors.text,
        headerTitle: () => <BrandLogo size="md" />,
        headerTitleAlign: "center",
        headerLeft: () => <View style={{ width: 14 }} />,
        headerRight: () => <HeaderRight />,
        tabBarStyle: {
          backgroundColor: "#050505",
          borderTopColor: "#1A1A1A",
          borderTopWidth: 1,
          height: 76,
          paddingTop: 10,
          paddingBottom: 14,
          paddingHorizontal: 4,
        },
        tabBarActiveTintColor: GOLD,
        tabBarInactiveTintColor: "#7A7A7A",
        tabBarLabelPosition: "below-icon",
        tabBarItemStyle: { paddingHorizontal: 2, paddingVertical: 0 },
        tabBarIconStyle: { marginTop: 0 },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          headerShown: false,
          tabBarLabel: ({ focused }) => <TabLabel focused={focused} label="Home" />,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "home" : "home-outline"} color={color} size={23} />
          ),
        }}
      />
      <Tabs.Screen
        name="catalog"
        options={{
          title: "Loja",
          headerStyle: { backgroundColor: theme.colors.bg, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
          headerTitle: () => <Text style={styles.screenTitle}>MARKETPLACE</Text>,
          tabBarLabel: ({ focused }) => <TabLabel focused={focused} label="Loja" />,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "storefront" : "storefront-outline"} color={color} size={23} />
          ),
        }}
      />
      <Tabs.Screen
        name="community"
        options={{
          title: "Social",
          headerShown: false,
          tabBarLabel: ({ focused }) => <TabLabel focused={focused} label="Social" />,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "people" : "people-outline"} color={color} size={23} />
          ),
        }}
      />
      <Tabs.Screen
        name="performance"
        options={{
          title: "Metas",
          headerStyle: { backgroundColor: theme.colors.bg, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
          headerTitle: () => <Text style={[styles.screenTitle, { color: GOLD }]}>PERFORMANCE</Text>,
          tabBarLabel: ({ focused }) => <TabLabel focused={focused} label="Metas" />,
          tabBarIcon: ({ color, focused }) => (
            <MaterialCommunityIcons
              name={focused ? "chart-line-variant" : "chart-line"}
              color={color}
              size={23}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="wallet"
        options={{
          title: "Banco",
          headerTitle: () => <Text style={styles.screenTitle}>BANCO</Text>,
          tabBarLabel: ({ focused }) => <TabLabel focused={focused} label="Banco" />,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "wallet" : "wallet-outline"} color={color} size={23} />
          ),
        }}
      />
      {/* Hidden tabs — accessible via header/deep-links only */}
      <Tabs.Screen name="negocios" options={{ href: null }} />
      <Tabs.Screen name="notifications" options={{ href: null, title: "Notificações" }} />
      <Tabs.Screen name="member" options={{ href: null }} />
      <Tabs.Screen name="cart" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  rightRow: { flexDirection: "row", alignItems: "center", marginRight: 10, gap: 8 },
  iconBtn: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "#0A0A0A",
    borderWidth: 1, borderColor: "#1F1F1F",
    position: "relative",
  },
  badge: {
    position: "absolute", top: 4, right: 4,
    minWidth: 16, height: 16, paddingHorizontal: 4,
    borderRadius: 8, backgroundColor: "#FF3B30",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1.5, borderColor: "#050505",
  },
  badgeTxt: { color: "#FFF", fontSize: 9, fontWeight: "900" },
  profileBtn: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "#0A0A0A",
    borderWidth: 2, borderColor: GOLD,
  },
  profileInner: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "#0F0F0F",
  },
  screenTitle: { color: "#FFF", fontSize: 12, fontWeight: "900", letterSpacing: 3 },
});

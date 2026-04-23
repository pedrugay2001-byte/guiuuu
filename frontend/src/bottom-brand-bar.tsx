import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { BrandLogo } from "./brand";

const GOLD = "#F5C150";

type Props = {
  unread?: number;
  unreadMessages?: number;
};

/**
 * Barra inferior premium: logo BLACKSCLUB à esquerda + ícones de mensagens/notificações/perfil à direita.
 */
export default function BottomBrandBar({ unread = 0, unreadMessages = 0 }: Props) {
  const router = useRouter();

  return (
    <View style={st.bar}>
      <TouchableOpacity
        onPress={() => router.push("/(tabs)/home" as any)}
        activeOpacity={0.85}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        testID="bottom-brand-home"
      >
        <BrandLogo size="sm" />
      </TouchableOpacity>

      <View style={st.right}>
        <TouchableOpacity
          style={st.iconBtn}
          onPress={() => router.push("/community/messages" as any)}
          activeOpacity={0.75}
          testID="bottom-messages"
        >
          <Ionicons name="chatbubble-ellipses-outline" size={22} color="#D8D8D8" />
          {unreadMessages > 0 && (
            <View style={st.badge}>
              <Text style={st.badgeTxt}>{unreadMessages > 9 ? "9+" : String(unreadMessages)}</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={st.iconBtn}
          onPress={() => router.push("/notifications" as any)}
          activeOpacity={0.75}
          testID="bottom-notifications"
        >
          <Ionicons name="notifications-outline" size={22} color="#D8D8D8" />
          {unread > 0 && (
            <View style={st.badge}>
              <Text style={st.badgeTxt}>{unread > 9 ? "9+" : String(unread)}</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={st.profileBtn}
          onPress={() => router.push("/(tabs)/member" as any)}
          activeOpacity={0.85}
          testID="bottom-profile"
        >
          <Ionicons name="person" size={18} color={GOLD} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  safe: { backgroundColor: "#050505" },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 4,
    backgroundColor: "#050505",
  },
  right: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  badge: { position: "absolute", top: 4, right: 4, minWidth: 14, height: 14, borderRadius: 7,
    backgroundColor: "#FF3B30", alignItems: "center", justifyContent: "center", paddingHorizontal: 3 },
  badgeTxt: { color: "#FFF", fontSize: 9, fontWeight: "800" },
  profileBtn: {
    width: 32, height: 32, borderRadius: 16,
    borderWidth: 1.5, borderColor: GOLD,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(245,193,80,0.08)",
  },
});

import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { BrandLogo } from "./brand";

const GOLD = "#F5C150";

type Props = {
  unread?: number;
};

/**
 * Barra inferior premium: logo BLACKSCLUB à esquerda + ícones de perfil/notificações à direita.
 * NÃO aplica SafeAreaView — o (tabs)/_layout.tsx já envolve toda a hierarquia num SafeAreaView.
 */
export default function BottomBrandBar({ unread = 0 }: Props) {
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
    paddingVertical: 10,
    backgroundColor: "#050505",
  },
  right: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  badge: { position: "absolute", top: 6, right: 6, minWidth: 15, height: 15, borderRadius: 8,
    backgroundColor: "#FF3B30", alignItems: "center", justifyContent: "center", paddingHorizontal: 3 },
  badgeTxt: { color: "#FFF", fontSize: 9, fontWeight: "800" },
  profileBtn: {
    width: 36, height: 36, borderRadius: 18,
    borderWidth: 1.5, borderColor: GOLD,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(245,193,80,0.08)",
  },
});

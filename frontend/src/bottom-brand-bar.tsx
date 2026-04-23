import React from "react";
import { View, StyleSheet, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { BrandLogo } from "./brand";

const GOLD = "#F5C150";
const BG = "#050505";

type Props = {
  unread?: number;
  unreadMessages?: number;
};

/**
 * Barra de marca inferior premium.
 *
 * LAYOUT (reformulado):
 *   [Logo] ............. [Home ◉ (centro, destacado dourado)] ............. [Chat] [Sino]
 *
 * - O botão "Home" é o elemento principal e fica no CENTRO, com círculo dourado
 *   maior que os demais para criar um centro de gravidade visual.
 * - O avatar/perfil foi movido para a TopTabBar (primeira posição).
 * - Chat e Sino permanecem à direita com dots vermelhos discretos para notificação.
 */
export default function BottomBrandBar({ unread = 0, unreadMessages = 0 }: Props) {
  const router = useRouter();

  return (
    <View style={st.bar}>
      {/* Esquerda — logo da marca */}
      <View style={st.side}>
        <TouchableOpacity
          onPress={() => router.push("/(tabs)/home" as any)}
          activeOpacity={0.85}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          testID="bottom-brand-logo"
        >
          <BrandLogo size="sm" />
        </TouchableOpacity>
      </View>

      {/* Centro — botão principal HOME (destaque dourado) */}
      <View style={st.center}>
        <TouchableOpacity
          style={st.homeBtn}
          onPress={() => router.push("/(tabs)/home" as any)}
          activeOpacity={0.88}
          testID="bottom-home"
        >
          <Ionicons name="home" size={22} color="#000" />
        </TouchableOpacity>
      </View>

      {/* Direita — chat + sino */}
      <View style={st.side}>
        <View style={st.right}>
          <TouchableOpacity
            style={st.iconBtn}
            onPress={() => router.push("/community/messages" as any)}
            activeOpacity={0.75}
            testID="bottom-messages"
          >
            <Ionicons name="chatbubble-ellipses-outline" size={22} color="#D8D8D8" />
            {unreadMessages > 0 && <View style={st.dot} />}
          </TouchableOpacity>

          <TouchableOpacity
            style={st.iconBtn}
            onPress={() => router.push("/notifications" as any)}
            activeOpacity={0.75}
            testID="bottom-notifications"
          >
            <Ionicons name="notifications-outline" size={22} color="#D8D8D8" />
            {unread > 0 && <View style={st.dot} />}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: BG,
  },
  // 3 colunas iguais para garantir centralização perfeita do botão HOME
  side: { flex: 1, flexDirection: "row", alignItems: "center" },
  center: { flexDirection: "row", justifyContent: "center", alignItems: "center" },
  right: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 8 },

  iconBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: "center", justifyContent: "center",
  },
  dot: {
    position: "absolute", top: 8, right: 8,
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: "#FF3B30",
    borderWidth: 1.5, borderColor: BG,
  },
  // Botão Home central — grande, dourado, com glow sutil
  homeBtn: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: "center", justifyContent: "center",
    backgroundColor: GOLD,
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
});

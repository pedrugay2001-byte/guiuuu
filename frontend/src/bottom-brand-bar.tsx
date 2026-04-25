import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { BrandLogo } from "./brand";
import { useGate } from "./gate";
import { useMessageInbox } from "./message-inbox";

// Paleta por tier
const ACCENT_GOLD = "#F5C150";
const ACCENT_PLATINUM = "#C5D1DA";
const BG = "#050505";

type Props = {
  unread?: number;
  unreadMessages?: number;
};

/**
 * Barra de marca inferior premium.
 *
 * LAYOUT:
 *   [Logo] ............. [Home ◉ (centro, destacado)] ............. [Chat] [Sino]
 *
 * - O botão "Home" é o elemento principal e fica no CENTRO.
 * - Cor de destaque: dourada para tiers regulares; PRATEADA (azul-prateado)
 *   para membros DIAMOND, criando hierarquia visual de prestígio.
 * - Badges (chat e sino) mostram o NÚMERO de não-lidos em vermelho.
 *   Os valores vêm direto do MessageInboxProvider quando não passados via props.
 */
export default function BottomBrandBar({ unread, unreadMessages }: Props) {
  const router = useRouter();
  const { member } = useGate();
  const inbox = useMessageInbox();
  const isDiamond = member?.tier === "diamond";
  const GOLD = isDiamond ? ACCENT_PLATINUM : ACCENT_GOLD;

  // Usa props se vierem; senão pega do Provider (vivo entre telas)
  const msgs = typeof unreadMessages === "number" ? unreadMessages : inbox.unreadMessages;
  const notifs = typeof unread === "number" ? unread : inbox.unreadNotifications;

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

      {/* Centro — botão principal HOME */}
      <View style={st.center}>
        <TouchableOpacity
          style={[st.homeBtn, { backgroundColor: GOLD, shadowColor: GOLD }]}
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
            onPress={async () => {
              // Limpa todas as notificações de mensagens (badge + chat heads) ao tocar
              try { await inbox.markAllMessagesRead(); } catch {}
              router.push("/community/messages" as any);
            }}
            activeOpacity={0.75}
            testID="bottom-messages"
          >
            <Ionicons name="chatbubble-ellipses-outline" size={22} color="#D8D8D8" />
            {msgs > 0 && (
              <View style={st.numBadge}>
                <Text style={st.numBadgeTxt}>{msgs > 9 ? "9+" : msgs}</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={st.iconBtn}
            onPress={async () => {
              // Limpa todas as notificações do sino ao tocar
              try { await inbox.markAllNotificationsRead(); } catch {}
              router.push("/notifications" as any);
            }}
            activeOpacity={0.75}
            testID="bottom-notifications"
          >
            <Ionicons name="notifications-outline" size={22} color="#D8D8D8" />
            {notifs > 0 && (
              <View style={st.numBadge}>
                <Text style={st.numBadgeTxt}>{notifs > 9 ? "9+" : notifs}</Text>
              </View>
            )}
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
  side: { flex: 1, flexDirection: "row", alignItems: "center" },
  center: { flexDirection: "row", justifyContent: "center", alignItems: "center" },
  right: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 8 },

  iconBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: "center", justifyContent: "center",
    position: "relative",
  },
  // Badge numérico vermelho (substitui o ponto antigo)
  numBadge: {
    position: "absolute", top: 2, right: 0,
    minWidth: 16, height: 16,
    paddingHorizontal: 4, borderRadius: 8,
    backgroundColor: "#FF3B30",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1.2, borderColor: BG,
  },
  numBadgeTxt: { color: "#FFF", fontSize: 9, fontWeight: "900" },
  // Botão Home central — grande, com glow sutil; cor vem do theme
  homeBtn: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: "center", justifyContent: "center",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
});

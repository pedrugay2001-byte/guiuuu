import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useRouter, usePathname } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "./icons";
import { useGate } from "./gate";
import { useMessageInbox } from "./message-inbox";

// Paleta por tier
const ACCENT_GOLD = "#F5C150";
const ACCENT_PLATINUM = "#C5D1DA";
const INACTIVE = "#7A7A7A";
const BG = "#050505";

type Props = {
  unread?: number;
  unreadMessages?: number;
};

/**
 * Barra de navegação INFERIOR (novo layout solicitado):
 *
 *   [Loja] ... [Metas] ... [Home ◉ (centro, destacado)] ... [Social] ... [Notificações]
 *
 * - 5 botões no rodapé, com o "Home/Menu" central destacado em círculo dourado.
 * - O ícone de "chat/mensagem" foi REMOVIDO desta barra (saiu do projeto a pedido do usuário).
 * - Acessível e responsivo: flex:1 em cada lateral para distribuir igualmente.
 * - Badge vermelho com contador aparece em Notificações quando há não-lidos.
 */
export default function BottomBrandBar({ unread, unreadMessages: _ignored }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { member } = useGate();
  const inbox = useMessageInbox();
  const isDiamond = member?.tier === "diamond";
  const ACCENT = isDiamond ? ACCENT_PLATINUM : ACCENT_GOLD;

  const notifs = typeof unread === "number" ? unread : inbox.unreadNotifications;

  // Helper para detectar rota ativa — comparação tolerante (startsWith)
  const isActive = (route: string) => pathname === route || pathname.startsWith(route + "/");

  // Helper de cor: dourado/platinum se ativo, cinza claro se inativo
  const col = (route: string) => (isActive(route) ? ACCENT : INACTIVE);

  return (
    <View style={st.bar}>
      {/* 1) Loja */}
      <TouchableOpacity
        style={st.item}
        onPress={() => router.push("/catalog" as any)}
        activeOpacity={0.78}
        testID="bottom-catalog"
      >
        <Ionicons name="storefront" size={22} color={col("/catalog")} />
        <Text allowFontScaling={false} style={[st.lbl, { color: col("/catalog") }]}>Loja</Text>
      </TouchableOpacity>

      {/* 2) Metas */}
      <TouchableOpacity
        style={st.item}
        onPress={() => router.push("/performance" as any)}
        activeOpacity={0.78}
        testID="bottom-performance"
      >
        <MaterialCommunityIcons name="chart-line-variant" size={22} color={col("/performance")} />
        <Text allowFontScaling={false} style={[st.lbl, { color: col("/performance") }]}>Metas</Text>
      </TouchableOpacity>

      {/* 3) HOME — centro, destacado */}
      <View style={st.centerWrap}>
        <TouchableOpacity
          style={[st.homeBtn, { backgroundColor: ACCENT, shadowColor: ACCENT }]}
          onPress={() => router.push("/home" as any)}
          activeOpacity={0.88}
          testID="bottom-home"
        >
          <Ionicons name="home" size={22} color="#000" />
        </TouchableOpacity>
      </View>

      {/* 4) Social */}
      <TouchableOpacity
        style={st.item}
        onPress={() => router.push("/community" as any)}
        activeOpacity={0.78}
        testID="bottom-community"
      >
        <Ionicons name="people" size={22} color={col("/community")} />
        <Text allowFontScaling={false} style={[st.lbl, { color: col("/community") }]}>Social</Text>
      </TouchableOpacity>

      {/* 5) Notificações — com badge vermelho */}
      <TouchableOpacity
        style={st.item}
        onPress={async () => {
          try { await inbox.markAllNotificationsRead(); } catch {}
          router.push("/notifications" as any);
        }}
        activeOpacity={0.78}
        testID="bottom-notifications"
      >
        <View style={{ position: "relative" }}>
          <Ionicons name="notifications-outline" size={22} color={col("/notifications")} />
          {notifs > 0 && (
            <View style={st.numBadge}>
              <Text style={st.numBadgeTxt}>{notifs > 9 ? "9+" : notifs}</Text>
            </View>
          )}
        </View>
        <Text allowFontScaling={false} style={[st.lbl, { color: col("/notifications") }]}>Avisos</Text>
      </TouchableOpacity>
    </View>
  );
}

const st = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingTop: 6,
    paddingBottom: 8,
    backgroundColor: BG,
    borderTopWidth: 1,
    borderTopColor: "#0E0E0E",
  },
  item: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingVertical: 4,
  },
  lbl: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.2,
    marginTop: 1,
    includeFontPadding: false as any,
  },
  // Container do botão central (mantém o flex:1 para alinhamento horizontal)
  centerWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  // Botão Home central — círculo destacado em ouro/platinum
  homeBtn: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: "center", justifyContent: "center",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 5,
  },
  // Badge numérico (vermelho) — em Notificações
  numBadge: {
    position: "absolute", top: -4, right: -8,
    minWidth: 16, height: 16,
    paddingHorizontal: 4, borderRadius: 8,
    backgroundColor: "#FF3B30",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1.2, borderColor: BG,
  },
  numBadgeTxt: { color: "#FFF", fontSize: 9, fontWeight: "900" },
});

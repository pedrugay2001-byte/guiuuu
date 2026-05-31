import React, { useEffect, useRef } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, Image, Animated, Easing,
} from "react-native";
import { Ionicons } from "./icons";
import { useRouter, useSegments } from "expo-router";
import { useMessageInbox, RecentSender } from "./message-inbox";

/**
 * Avatares "Chat Heads" flutuantes — aparecem em qualquer tela quando há
 * mensagens privadas não lidas. Empilham até 3 avatares verticalmente no canto
 * direito da tela. Toque abre a conversa; "X" descarta a head (some até nova msg).
 *
 * Não aparece dentro da própria conversa (rotas /community/dm/*).
 */
export default function ChatHeadsOverlay() {
  const router = useRouter();
  const segments = useSegments();
  const { senders, visibleHeadIds, dismissHead } = useMessageInbox();

  // Esconde overlay dentro da conversa privada (não polui a tela)
  const inDM = (segments as any[]).some((s) => String(s).includes("dm")) ||
    (segments as any[]).join("/").includes("community/dm");
  if (inDM) return null;
  if (!visibleHeadIds.length) return null;

  const visibleSenders = senders.filter((s) => visibleHeadIds.includes(s.member_id)).slice(0, 3);

  return (
    <View pointerEvents="box-none" style={st.wrap}>
      {visibleSenders.map((s, i) => (
        <ChatHead
          key={s.member_id}
          sender={s}
          index={i}
          onPress={() => {
            // Marca como lido e abre conversa
            router.push({ pathname: "/community/dm/[id]", params: { id: s.member_id } } as any);
            dismissHead(s.member_id);
          }}
          onDismiss={() => dismissHead(s.member_id)}
        />
      ))}
    </View>
  );
}

function ChatHead({
  sender, index, onPress, onDismiss,
}: { sender: RecentSender; index: number; onPress: () => void; onDismiss: () => void }) {
  // Animação de entrada (slide + bounce)
  const trans = useRef(new Animated.Value(80)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(trans, { toValue: 0, duration: 350, delay: index * 80, easing: Easing.out(Easing.back(1.4)), useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 280, delay: index * 80, useNativeDriver: true }),
    ]).start();
    // pulse contínuo na borda
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver: true }),
      ]),
    ).start();
  }, []);

  const tierColor = sender.tier === "diamond" ? "#7FD7E5" : sender.tier === "gold" ? "#D4AF37" : sender.tier === "silver" ? "#C5C5C5" : "#9AA0A6";
  const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
  const pulseOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] });

  return (
    <Animated.View style={[st.headWrap, { transform: [{ translateX: trans }], opacity }]}>
      <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={st.headTouch}>
        {/* Pulso animado */}
        <Animated.View
          pointerEvents="none"
          style={[
            st.pulse,
            { borderColor: tierColor, opacity: pulseOpacity, transform: [{ scale: pulseScale }] },
          ]}
        />
        {/* Avatar */}
        <View style={[st.avatarRing, { borderColor: tierColor, shadowColor: tierColor }]}>
          {sender.avatar_base64 ? (
            <Image source={{ uri: sender.avatar_base64 }} style={st.avatar} />
          ) : (
            <View style={[st.avatar, { backgroundColor: "#1A1A1A", alignItems: "center", justifyContent: "center" }]}>
              <Ionicons name="person" size={22} color="#666" />
            </View>
          )}
        </View>
        {/* Badge unread */}
        {sender.unread > 0 && (
          <View style={st.badge}>
            <Text style={st.badgeTxt}>{sender.unread > 9 ? "9+" : sender.unread}</Text>
          </View>
        )}
      </TouchableOpacity>
      {/* Botão X para descartar */}
      <TouchableOpacity onPress={onDismiss} style={st.dismissBtn} hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}>
        <Ionicons name="close" size={11} color="#999" />
      </TouchableOpacity>
    </Animated.View>
  );
}

const st = StyleSheet.create({
  wrap: {
    position: "absolute", right: 12, bottom: 96, // acima da bottom bar
    gap: 14, alignItems: "center",
    zIndex: 9999,
  },
  headWrap: {
    width: 60, height: 60, position: "relative",
  },
  headTouch: { width: "100%", height: "100%", alignItems: "center", justifyContent: "center" },
  pulse: {
    position: "absolute", width: 60, height: 60, borderRadius: 30,
    borderWidth: 2,
  },
  avatarRing: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "#0A0A0A",
    borderWidth: 2,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 6,
  },
  avatar: { width: 50, height: 50, borderRadius: 25 },
  badge: {
    position: "absolute", top: -2, left: -2,
    minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 10,
    backgroundColor: "#FF3B30",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1.5, borderColor: "#0A0A0A",
  },
  badgeTxt: { color: "#FFF", fontSize: 10, fontWeight: "900" },
  dismissBtn: {
    position: "absolute", top: -4, right: -4,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: "#1A1A1A",
    borderWidth: 1, borderColor: "#333",
    alignItems: "center", justifyContent: "center",
  },
});

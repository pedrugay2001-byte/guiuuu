import React from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useGate } from "../../src/gate";

const BG = "#050505";

type TierId = "diamond" | "gold" | "silver";

type TierCard = {
  id: TierId;
  title: string;
  kicker: string;
  access: string;
  image: string;
  gradient: readonly [string, string, string];
  bgGradient: readonly [string, string, string];
  borderColor: string;
  accentColor: string;
  icon: string;
};

// Paleta e imagens premium de cada nível.
// Fotos cinematográficas de academia — todas com homens de braços cruzados,
// variando apenas cor da camisa e porte físico para representar cada tier.
const TIERS: TierCard[] = [
  {
    id: "diamond",
    title: "Diamante",
    kicker: "Acesso Total",
    access: "Marketplace completo · Todas as categorias",
    image:
      "https://images.pexels.com/photos/31918891/pexels-photo-31918891.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    gradient: ["#EAF1F6", "#C5D1DA", "#4A5F74"],
    bgGradient: ["#0E1820", "#0A1016", "#05080B"],
    borderColor: "rgba(197,209,218,0.35)",
    accentColor: "#EAF1F6",
    icon: "diamond",
  },
  {
    id: "gold",
    title: "Gold",
    kicker: "Acesso Premium",
    access: "Catálogo selecionado · Ofertas exclusivas",
    image:
      "https://customer-assets.emergentagent.com/job_member-shop-2/artifacts/uib3txco_20d0bf6b-3315-4f93-bb5e-94095fddb867%20%281%29.png",
    gradient: ["#F4D47A", "#D4AF37", "#8C6F1E"],
    bgGradient: ["#1A1308", "#0B0906", "#050301"],
    borderColor: "rgba(212,175,55,0.35)",
    accentColor: "#F4D47A",
    icon: "star",
  },
  {
    id: "silver",
    title: "Silver",
    kicker: "Acesso Inicial",
    access: "Linha essencial · Produtos básicos",
    image:
      "https://customer-assets.emergentagent.com/job_member-shop-2/artifacts/54hcb9bu_iuuuuuuuuuuuuuuuuuu.png",
    gradient: ["#E8E8E8", "#B8B8B8", "#6F6F6F"],
    bgGradient: ["#141416", "#0A0A0A", "#050505"],
    borderColor: "rgba(184,184,184,0.35)",
    accentColor: "#E8E8E8",
    icon: "medal",
  },
];

// Hierarquia de acesso: Diamante > Gold > Silver
const TIER_RANK: Record<string, number> = { silver: 1, gold: 2, diamond: 3, black: 0 };
const canAccessTier = (userTier: string, targetTier: string): boolean => {
  return (TIER_RANK[userTier] ?? 0) >= (TIER_RANK[targetTier] ?? 99);
};

/**
 * Tela Marketplace — menu principal com os 3 níveis de acesso.
 *
 * Regra rígida: cada membro só pode entrar no marketplace do seu próprio tier.
 * Se tentar acessar outro tier, vê uma mensagem de exclusividade com direcionamento
 * ao suporte para upgrade.
 */
export default function CatalogMenu() {
  const router = useRouter();
  const { member } = useGate();
  const myTier = (member?.tier || "black").toLowerCase() as TierId | "black";

  const handlePress = (card: TierCard) => {
    // Black sem marketplace
    if (myTier === "black") {
      Alert.alert(
        "Acesso Exclusivo",
        `O Marketplace ${card.title} é reservado para membros Silver, Gold e Diamante.\n\nFaça upgrade do seu plano para liberar o acesso.`,
        [
          { text: "OK", style: "cancel" },
          { text: "Falar com suporte", onPress: () => router.push("/chat" as any) },
        ],
      );
      return;
    }
    // Hierarquia: Diamante acessa tudo, Gold acessa Gold+Silver, Silver só Silver
    if (!canAccessTier(myTier as string, card.id)) {
      Alert.alert(
        "Acesso Bloqueado",
        `O Marketplace ${card.title} é exclusivo para membros ${card.id.toUpperCase()} ou superior.\n\nSeu plano atual é BLACK ${myTier.toUpperCase()}.`,
        [
          { text: "OK", style: "cancel" },
          { text: "Falar com suporte", onPress: () => router.push("/chat" as any) },
        ],
      );
      return;
    }
    router.push(`/catalog/${card.id}` as any);
  };

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
        {/* HEADER elegante */}
        <View style={st.header}>
          <Text style={st.kicker}>BLACKSCLUB · MARKETPLACE</Text>
          <Text style={st.title}>Escolha seu nível de acesso</Text>
          <Text style={st.sub}>
            Cada tier desbloqueia um marketplace exclusivo, com produtos, descontos e benefícios específicos do seu plano.
          </Text>
        </View>

        {/* 3 CARDS PREMIUM */}
        <View style={st.cards}>
          {TIERS.map((card) => {
            const isMine = myTier === card.id;
            const hasAccess = canAccessTier(myTier as string, card.id);
            return (
              <TouchableOpacity
                key={card.id}
                style={[st.card, { borderColor: card.borderColor }]}
                activeOpacity={0.88}
                onPress={() => handlePress(card)}
                testID={`tier-card-${card.id}`}
              >
                <LinearGradient
                  colors={card.bgGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={st.cardInner}
                >
                  {/* Imagem à esquerda */}
                  <View style={st.cardImgWrap}>
                    <Image
                      source={{ uri: card.image }}
                      style={st.cardImg}
                      resizeMode="cover"
                    />
                    <LinearGradient
                      colors={["transparent", card.bgGradient[1] + "88", card.bgGradient[1]]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={StyleSheet.absoluteFillObject}
                    />
                  </View>

                  {/* Conteúdo à direita */}
                  <View style={st.cardContent}>
                    <View style={st.cardTop}>
                      <View
                        style={[
                          st.cardIconBadge,
                          { borderColor: card.accentColor + "66", backgroundColor: card.accentColor + "14" },
                        ]}
                      >
                        <MaterialCommunityIcons name={card.icon as any} size={11} color={card.accentColor} />
                        <Text style={[st.cardIconTxt, { color: card.accentColor }]}>{card.kicker.toUpperCase()}</Text>
                      </View>
                      {isMine && (
                        <View style={[st.myBadge, { borderColor: card.accentColor, backgroundColor: card.accentColor + "22" }]}>
                          <Ionicons name="checkmark-circle" size={10} color={card.accentColor} />
                          <Text style={[st.myBadgeTxt, { color: card.accentColor }]}>SEU PLANO</Text>
                        </View>
                      )}
                    </View>

                    <Text style={st.cardTitle}>Marketplace</Text>
                    <LinearGradient
                      colors={card.gradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={st.cardGradientTextWrap}
                    >
                      <Text style={[st.cardTierTitle, { color: "#0A0A0A" }]}>
                        {card.title.toUpperCase()}
                      </Text>
                    </LinearGradient>

                    <Text style={st.cardAccess} numberOfLines={2}>
                      {card.access}
                    </Text>

                    <View style={st.ctaRow}>
                      {hasAccess ? (
                        <LinearGradient
                          colors={card.gradient}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={st.cta}
                        >
                          <Text style={st.ctaTxt}>ACESSAR</Text>
                          <Ionicons name="arrow-forward" size={13} color="#0A0A0A" />
                        </LinearGradient>
                      ) : (
                        <View style={st.ctaLocked}>
                          <Ionicons name="lock-closed" size={11} color="#666" />
                          <Text style={st.ctaLockedTxt}>BLOQUEADO</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* FOOTER INFO */}
        <View style={st.footer}>
          <Ionicons name="information-circle-outline" size={13} color="#888" />
          <Text style={st.footerTxt}>
            Seu plano atual é <Text style={{ color: "#FFF", fontWeight: "900" }}>BLACK {myTier.toUpperCase()}</Text>.
            Fale com o suporte para fazer upgrade.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 22,
    alignItems: "flex-start",
  },
  kicker: {
    color: "#D4AF37",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 2.8,
  },
  title: {
    color: "#FFF",
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.5,
    marginTop: 6,
  },
  sub: {
    color: "#888",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 8,
    fontWeight: "500",
  },

  cards: {
    paddingHorizontal: 14,
    gap: 14,
  },

  card: {
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
  },
  cardInner: {
    flexDirection: "row",
    minHeight: 140,
  },
  cardImgWrap: {
    width: "42%",
    position: "relative",
    overflow: "hidden",
  },
  cardImg: {
    width: "100%",
    height: "100%",
  },
  cardContent: {
    flex: 1,
    padding: 14,
    justifyContent: "space-between",
    gap: 6,
  },

  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  cardIconBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
  },
  cardIconTxt: {
    fontSize: 8.5,
    fontWeight: "900",
    letterSpacing: 1.2,
  },

  myBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
  },
  myBadgeTxt: {
    fontSize: 8.5,
    fontWeight: "900",
    letterSpacing: 1.1,
  },

  cardTitle: {
    color: "#DDD",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    marginTop: 4,
  },
  cardGradientTextWrap: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    marginTop: 1,
  },
  cardTierTitle: {
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: 1,
  },
  cardAccess: {
    color: "#999",
    fontSize: 11,
    lineHeight: 15,
    marginTop: 2,
  },

  ctaRow: {
    marginTop: 6,
    flexDirection: "row",
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  ctaTxt: {
    color: "#0A0A0A",
    fontSize: 10.5,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  ctaLocked: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#111",
    borderWidth: 1,
    borderColor: "#222",
  },
  ctaLockedTxt: {
    color: "#666",
    fontSize: 10.5,
    fontWeight: "900",
    letterSpacing: 1.5,
  },

  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginHorizontal: 14,
    marginTop: 20,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#0B0B0B",
    borderWidth: 1,
    borderColor: "#1A1A1A",
  },
  footerTxt: {
    flex: 1,
    color: "#AAA",
    fontSize: 11,
    lineHeight: 15,
  },
});

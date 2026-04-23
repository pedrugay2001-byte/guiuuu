import { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Share, Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { api, BlxWallet } from "../../src/api";
import { useGate } from "../../src/gate";

export default function Receive() {
  const router = useRouter();
  const { member } = useGate();
  const [w, setW] = useState<BlxWallet | null>(null);

  useEffect(() => {
    if (!member) return;
    api.blxWallet(member.member_id).then(setW).catch(() => {});
  }, [member]);

  const copy = async () => {
    if (!w?.wallet_number) return;
    await Clipboard.setStringAsync(w.wallet_number);
    if (Platform.OS !== "web") Alert.alert("Copiado", "Número da carteira copiado.");
  };

  const share = async () => {
    if (!w?.wallet_number) return;
    try {
      await Share.share({
        message: `Para me enviar BLEX Token (BLX), use este número de carteira no BLACKSCLUB:\n\n${w.wallet_number}`,
      });
    } catch {}
  };

  if (!w) {
    return (
      <View style={{ flex: 1, backgroundColor: "#050505", justifyContent: "center" }}>
        <ActivityIndicator color="#D4AF37" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#050505" }}>
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        {/* Header */}
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} testID="blx-receive-back">
            <Ionicons name="chevron-back" size={22} color="#FFF" />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={styles.title}>RECEBER BLX</Text>
            <Text style={styles.sub}>Compartilhe sua carteira</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
          {/* Hero card */}
          <View style={styles.hero}>
            <View style={styles.heroLogo}>
              <MaterialCommunityIcons name="diamond-stone" size={30} color="#D4AF37" />
            </View>
            <Text style={styles.heroKicker}>CARTEIRA BLEX TOKEN</Text>
            <Text style={styles.heroName}>{(member?.nickname || member?.name || "").toUpperCase()}</Text>
            <View style={styles.walletBox}>
              <Text style={styles.walletNumber}>{w.wallet_number}</Text>
            </View>
            <Text style={styles.heroTip}>
              Envie este número para qualquer outro membro e receba BLX na hora.
            </Text>
          </View>

          {/* Ações */}
          <TouchableOpacity style={styles.primaryBtn} onPress={copy} testID="blx-receive-copy">
            <Ionicons name="copy-outline" size={18} color="#0A0A0A" />
            <Text style={styles.primaryBtnText}>COPIAR NÚMERO</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.ghostBtn} onPress={share} testID="blx-receive-share">
            <Ionicons name="share-social-outline" size={18} color="#FFF" />
            <Text style={styles.ghostBtnText}>COMPARTILHAR</Text>
          </TouchableOpacity>

          {/* Aviso */}
          <View style={styles.infoBox}>
            <Ionicons name="information-circle" size={14} color="#7FD7E5" />
            <Text style={styles.infoText}>
              Transferências BLX caem instantaneamente e são definitivas. Confirme que o remetente digitou o número correto.
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 12,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#141414",
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { color: "#FFF", fontSize: 13, fontWeight: "900", letterSpacing: 2 },
  sub: { color: "#8A8A8A", fontSize: 10, fontWeight: "700", letterSpacing: 1.5, marginTop: 2 },

  hero: {
    alignItems: "center", padding: 24, marginBottom: 20,
    backgroundColor: "#0E0E0E", borderRadius: 18,
    borderWidth: 1, borderColor: "rgba(212,175,55,0.25)",
  },
  heroLogo: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: "rgba(212,175,55,0.12)",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "rgba(212,175,55,0.4)",
    marginBottom: 16,
  },
  heroKicker: { color: "#D4AF37", fontSize: 10, fontWeight: "900", letterSpacing: 2.5 },
  heroName: { color: "#FFF", fontSize: 15, fontWeight: "800", letterSpacing: 1, marginTop: 6, textAlign: "center" },
  walletBox: {
    marginTop: 18, paddingHorizontal: 18, paddingVertical: 14,
    backgroundColor: "#050505", borderRadius: 10,
    borderWidth: 1, borderColor: "#1F1F1F",
  },
  walletNumber: { color: "#D4AF37", fontSize: 22, fontWeight: "900", letterSpacing: 4 },
  heroTip: { color: "#8A8A8A", fontSize: 11.5, lineHeight: 16, marginTop: 14, textAlign: "center" },

  primaryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    paddingVertical: 15, borderRadius: 10, backgroundColor: "#D4AF37",
  },
  primaryBtnText: { color: "#0A0A0A", fontSize: 12, fontWeight: "900", letterSpacing: 1.5 },
  ghostBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    paddingVertical: 15, borderRadius: 10, marginTop: 10,
    borderWidth: 1, borderColor: "#1F1F1F", backgroundColor: "#0A0A0A",
  },
  ghostBtnText: { color: "#FFF", fontSize: 12, fontWeight: "900", letterSpacing: 1.5 },

  infoBox: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    marginTop: 24, padding: 12, borderRadius: 10,
    backgroundColor: "rgba(127,215,229,0.08)",
    borderWidth: 1, borderColor: "rgba(127,215,229,0.25)",
  },
  infoText: { flex: 1, color: "#C8E8EE", fontSize: 11.5, lineHeight: 16 },
});

import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Modal } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "../icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { formatPYX } from "../pyx";

const GOLD_LIGHT = "#F4D47A";
const GOLD = "#D4AF37";
const GOLD_DARK = "#8C6F1E";

interface Props {
  visible: boolean;
  onClose: () => void;
  requiredCents: number;
  currentCents: number;
  missingCents: number;
  contextLabel?: string; // ex: "Carrinho", "Compra Diamante"
}

/**
 * Modal premium exibido quando o saldo PYX do membro é insuficiente para a compra.
 * Oferece CTA direto para falar com o SUPORTE, que é responsável por creditar PYX.
 */
export default function InsufficientBalanceModal({
  visible,
  onClose,
  requiredCents,
  currentCents,
  missingCents,
  contextLabel,
}: Props) {
  const router = useRouter();

  const handleSupport = () => {
    onClose();
    // Abre o chat com o suporte/financeiro (responsável por creditar PYX)
    router.push("/chat" as any);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.bg}>
        <View style={styles.card}>
          {/* Barra superior amarela */}
          <LinearGradient
            colors={[GOLD_LIGHT, GOLD, GOLD_DARK]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.topBar}
          />

          {/* Ícone central */}
          <View style={styles.iconWrap}>
            <LinearGradient
              colors={["rgba(255,107,107,0.2)", "rgba(255,107,107,0.05)"]}
              style={styles.iconCircle}
            >
              <MaterialCommunityIcons name="wallet-outline" size={28} color="#FF8A8A" />
            </LinearGradient>
          </View>

          <Text style={styles.kicker}>SALDO INSUFICIENTE</Text>
          <Text style={styles.title}>
            Seu saldo PYX não é suficiente para concluir esta compra.
          </Text>

          <View style={styles.infoBox}>
            {contextLabel ? (
              <View style={styles.row}>
                <Text style={styles.lbl}>Operação</Text>
                <Text style={styles.val}>{contextLabel}</Text>
              </View>
            ) : null}
            <View style={styles.row}>
              <Text style={styles.lbl}>Necessário</Text>
              <Text style={styles.val}>{formatPYX(requiredCents)} PYX</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.lbl}>Seu saldo</Text>
              <Text style={[styles.val, { color: "#4EE07F" }]}>
                {formatPYX(currentCents)} PYX
              </Text>
            </View>
            <View style={[styles.row, styles.rowMissing]}>
              <Text style={[styles.lbl, { color: "#FF8A8A" }]}>Faltam</Text>
              <Text style={[styles.val, { color: "#FF8A8A", fontSize: 17 }]}>
                {formatPYX(missingCents)} PYX
              </Text>
            </View>
          </View>

          <Text style={styles.note}>
            Para recarregar sua carteira PYX, fale com nosso suporte. Nossa equipe vai te
            ajudar com o depósito e a conversão para PYX.
          </Text>

          <TouchableOpacity
            style={styles.supportBtn}
            onPress={handleSupport}
            activeOpacity={0.85}
            testID="insufficient-support-btn"
          >
            <LinearGradient
              colors={[GOLD_LIGHT, GOLD, GOLD_DARK]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.supportInner}
            >
              <Ionicons name="headset" size={16} color="#0A0A0A" />
              <Text style={styles.supportTxt}>FALAR COM SUPORTE</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeTxt}>FECHAR</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.88)",
    alignItems: "center",
    justifyContent: "center",
    padding: 22,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#0B0B0B",
    borderRadius: 20,
    paddingHorizontal: 22,
    paddingTop: 0,
    paddingBottom: 18,
    borderWidth: 1,
    borderColor: "rgba(212,175,55,0.3)",
    overflow: "hidden",
  },
  topBar: {
    height: 3,
    marginHorizontal: -22,
    marginBottom: 18,
  },
  iconWrap: { alignItems: "center", marginBottom: 10 },
  iconCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,138,138,0.35)",
  },
  kicker: {
    color: "#FF8A8A",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 2.5,
    textAlign: "center",
    marginBottom: 6,
  },
  title: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "800",
    textAlign: "center",
    lineHeight: 21,
    marginBottom: 18,
  },
  infoBox: {
    backgroundColor: "#0A0A0A",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#1A1A1A",
    gap: 2,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 5,
  },
  rowMissing: {
    borderTopWidth: 1,
    borderTopColor: "#1F1F1F",
    paddingTop: 10,
    marginTop: 4,
  },
  lbl: {
    color: "#888",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  val: {
    color: "#FFF",
    fontSize: 13,
    fontWeight: "800",
  },
  note: {
    color: "#888",
    fontSize: 11.5,
    marginTop: 14,
    marginBottom: 16,
    textAlign: "center",
    lineHeight: 16,
    fontStyle: "italic",
  },
  supportBtn: { borderRadius: 12, overflow: "hidden" },
  supportInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
  },
  supportTxt: {
    color: "#0A0A0A",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  closeBtn: {
    marginTop: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  closeTxt: {
    color: "#666",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
});

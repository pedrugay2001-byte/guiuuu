import { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
  ActivityIndicator,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { api, Wallet as W, WalletTx, formatBRL } from "../../src/api";
import { useGate } from "../../src/gate";

export default function WalletScreen() {
  const router = useRouter();
  const { member } = useGate();
  const [w, setW] = useState<W | null>(null);
  const [txs, setTxs] = useState<WalletTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!member) return;
    try {
      const [wallet, list] = await Promise.all([api.getWallet(member.member_id), api.walletTxs(member.member_id)]);
      setW(wallet); setTxs(list);
    } finally { setLoading(false); setRefreshing(false); }
  }, [member]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const confirm = async (tx_id: string, title?: string) => {
    if (!member) return;
    try { await api.walletConfirm(tx_id, member.member_id); await load(); }
    catch (e: any) { alert(e.message); }
  };

  if (loading || !w) return <View style={{ flex: 1, backgroundColor: "#050505", justifyContent: "center" }}><ActivityIndicator color="#FFF" /></View>;

  const totalEscrow = w.escrow_out || 0;
  const incomingEscrow = w.escrow_in || 0;

  return (
    <View style={{ flex: 1, backgroundColor: "#050505" }}>
      <ScrollView refreshControl={<RefreshControl tintColor="#FFF" refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />} contentContainerStyle={{ paddingBottom: 30 }}>
        {/* Balance Hero */}
        <View style={styles.hero}>
          <Text style={styles.kick}>BLACK COINS · CARTEIRA</Text>
          <View style={styles.balanceRow}>
            <MaterialCommunityIcons name="diamond-stone" size={22} color="#D4AF37" />
            <Text style={styles.balance}>{Math.round(w.balance).toLocaleString("pt-BR")}</Text>
            <Text style={styles.balanceCoin}>BLACK</Text>
          </View>
          <Text style={styles.sub}>Moeda interna do clube · controlada pela administração</Text>

          <View style={styles.escrowRow}>
            <View style={[styles.escrowBox, { borderColor: "#F5C150" }]}>
              <Text style={[styles.eLbl, { color: "#F5C150" }]}>SAÍDA EM ESCROW</Text>
              <Text style={styles.eVal}>{Math.round(totalEscrow).toLocaleString("pt-BR")} BLACK</Text>
            </View>
            <View style={[styles.escrowBox, { borderColor: "#4EE07F" }]}>
              <Text style={[styles.eLbl, { color: "#4EE07F" }]}>A RECEBER</Text>
              <Text style={styles.eVal}>{Math.round(incomingEscrow).toLocaleString("pt-BR")} BLACK</Text>
            </View>
          </View>

          {/* Aviso: saldo é controlado por admin */}
          <View style={styles.infoBox}>
            <Ionicons name="shield-checkmark" size={16} color="#7FD7E5" />
            <Text style={styles.infoTxt}>
              Para adicionar saldo, entre em contato com o suporte. Pagamentos são validados manualmente.
            </Text>
          </View>

          <TouchableOpacity
            style={styles.supportBtn}
            onPress={() => router.push("/chat" as any)}
            activeOpacity={0.85}
            testID="wallet-contact-support"
          >
            <Ionicons name="headset" size={16} color="#000" />
            <Text style={styles.supportTxt}>FALAR COM SUPORTE</Text>
          </TouchableOpacity>
        </View>

        {/* Transactions */}
        <Text style={styles.sectionTitle}>HISTÓRICO</Text>
        {txs.length === 0 ? (
          <View style={{ alignItems: "center", marginTop: 30 }}>
            <Ionicons name="receipt-outline" size={36} color="#444" />
            <Text style={{ color: "#777", fontSize: 12, marginTop: 10 }}>Sem transações ainda.</Text>
          </View>
        ) : (
          txs.map((tx) => {
            const iAmBuyer = tx.from_id === member?.member_id;
            const iAmSeller = tx.to_id === member?.member_id;
            let icon: any = "swap-vertical";
            let color = "#AAA";
            let title = tx.note || tx.type.toUpperCase();
            if (tx.type === "topup") { icon = "add-circle"; color = "#4EE07F"; title = "Recarga via Pix"; }
            else if (tx.type === "withdraw") { icon = "arrow-down-circle"; color = "#F5C150"; title = "Saque Pix"; }
            else if (tx.type === "escrow") {
              if (iAmBuyer) { icon = "lock-closed"; color = tx.status === "settled" ? "#4EE07F" : tx.status === "refunded" ? "#AAA" : "#F5C150"; title = `Compra: ${tx.ad_title || "Anúncio"}`; }
              else if (iAmSeller) { icon = "cash"; color = tx.status === "settled" ? "#4EE07F" : "#F5C150"; title = `Venda: ${tx.ad_title || "Anúncio"}`; }
            }
            const sign = iAmBuyer ? "−" : tx.type === "withdraw" ? "−" : "+";
            return (
              <View key={tx.tx_id} style={styles.txRow}>
                <View style={[styles.txIcon, { backgroundColor: color + "22", borderColor: color }]}>
                  <Ionicons name={icon} size={16} color={color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.txTitle} numberOfLines={1}>{title}</Text>
                  <Text style={styles.txStatus}>
                    {tx.status === "escrow" ? "Aguardando entrega" : tx.status === "settled" ? "Liberado" : "Estornado"}
                    {" · "}{new Date(tx.created_at).toLocaleDateString("pt-BR")}
                  </Text>
                  {tx.status === "escrow" && iAmBuyer && (
                    <TouchableOpacity style={styles.confirmBtn} onPress={() => confirm(tx.tx_id)} testID={`confirm-${tx.tx_id}`}>
                      <Text style={styles.confirmTxt}>RECEBI · LIBERAR PAGAMENTO</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <Text style={[styles.txAmt, { color: iAmBuyer || tx.type === "withdraw" ? "#F87171" : "#4EE07F" }]}>{sign}{Math.round(tx.amount).toLocaleString("pt-BR")} BLACK</Text>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { padding: 20, backgroundColor: "#0A0A0A", borderBottomWidth: 1, borderBottomColor: "#151515" },
  kick: { color: "#D4AF37", fontSize: 10, fontWeight: "900", letterSpacing: 3 },
  balanceRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },
  balance: { color: "#FFF", fontSize: 32, fontWeight: "900" },
  sub: { color: "#888", fontSize: 11, marginTop: 6 },
  escrowRow: { flexDirection: "row", gap: 10, marginTop: 16 },
  escrowBox: { flex: 1, padding: 12, borderWidth: 1, borderRadius: 10, backgroundColor: "#0A0A0A" },
  eLbl: { fontSize: 9, fontWeight: "900", letterSpacing: 1.5 },
  eVal: { color: "#EEE", fontSize: 15, fontWeight: "800", marginTop: 4 },
  actionRow: { flexDirection: "row", gap: 10, marginTop: 16 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 13, borderRadius: 10 },
  actionBtnGhost: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 13, borderRadius: 10, borderWidth: 1, borderColor: "#333" },
  actionTxt: { color: "#FFF", fontSize: 11, fontWeight: "900", letterSpacing: 1.5 },
  balanceCoin: { color: "#D4AF37", fontSize: 14, fontWeight: "900", letterSpacing: 1.5, marginLeft: 4, marginTop: 6 },
  infoBox: {
    flexDirection: "row", alignItems: "flex-start", gap: 10, marginTop: 16,
    padding: 12, borderRadius: 10,
    backgroundColor: "rgba(127,215,229,0.08)",
    borderWidth: 1, borderColor: "rgba(127,215,229,0.25)",
  },
  infoTxt: { flex: 1, color: "#C8E8EE", fontSize: 11.5, lineHeight: 16, fontWeight: "500" },
  supportBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 13, borderRadius: 10, marginTop: 12,
    backgroundColor: "#D4AF37",
  },
  supportTxt: { color: "#000", fontSize: 11, fontWeight: "900", letterSpacing: 1.5 },

  sectionTitle: { color: "#888", fontSize: 10, fontWeight: "900", letterSpacing: 2.5, paddingHorizontal: 22, marginTop: 22, marginBottom: 10 },
  txRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#121212" },
  txIcon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  txTitle: { color: "#EEE", fontSize: 13, fontWeight: "700" },
  txStatus: { color: "#888", fontSize: 11, marginTop: 2 },
  txAmt: { fontSize: 13, fontWeight: "900" },
  confirmBtn: { marginTop: 8, alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 6, backgroundColor: "#4EE07F" },
  confirmTxt: { color: "#000", fontSize: 10, fontWeight: "900", letterSpacing: 1 },
});

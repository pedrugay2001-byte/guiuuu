import { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
  ActivityIndicator, Alert, Share, Platform,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { api, BlxWallet, BlxTx } from "../../src/api";
import { useGate } from "../../src/gate";
import { formatBLX, formatBLXShort } from "../../src/blx";
import { TIERS } from "../../src/theme";

export default function WalletScreen() {
  const router = useRouter();
  const { member } = useGate();
  const [w, setW] = useState<BlxWallet | null>(null);
  const [txs, setTxs] = useState<BlxTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hideBalance, setHideBalance] = useState(false);

  const load = useCallback(async () => {
    if (!member) return;
    try {
      const [wallet, list] = await Promise.all([
        api.blxWallet(member.member_id),
        api.blxTransactions(member.member_id, 6, 0),
      ]);
      setW(wallet);
      setTxs(list);
    } catch (e: any) {
      // silencioso — pode rolar no carregamento inicial
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [member]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const copyWallet = async () => {
    if (!w?.wallet_number) return;
    await Clipboard.setStringAsync(w.wallet_number);
    if (Platform.OS === "web") {
      // silencioso no web (o Alert pode ser bloqueado)
    } else {
      Alert.alert("Copiado", "Número da carteira copiado.");
    }
  };

  const shareWallet = async () => {
    if (!w?.wallet_number) return;
    try {
      await Share.share({
        message: `Minha carteira BLEX Token (BLX):\n${w.wallet_number}\n\nEnvie BLX pra mim direto pelo BLACKSCLUB.`,
      });
    } catch {}
  };

  if (loading || !w || !member) {
    return (
      <View style={{ flex: 1, backgroundColor: "#050505", justifyContent: "center" }}>
        <ActivityIndicator color="#D4AF37" />
      </View>
    );
  }

  const balance = formatBLX(w.balance_centavos);
  const tier = TIERS[member.tier] || TIERS.black;

  return (
    <View style={{ flex: 1, backgroundColor: "#050505" }}>
      <ScrollView
        refreshControl={
          <RefreshControl
            tintColor="#D4AF37"
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
          />
        }
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {/* Header profissional */}
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.bankName}>BANCO BLACKSCLUB</Text>
              <Text style={styles.bankTag}>BLEX TOKEN · BLX</Text>
            </View>
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={() => setHideBalance((v) => !v)}
              testID="blx-toggle-hide"
            >
              <Ionicons
                name={hideBalance ? "eye-off-outline" : "eye-outline"}
                size={18}
                color="#FFF"
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Cartão principal com saldo */}
        <View style={styles.card}>
          <View style={styles.cardTopRow}>
            <View style={styles.cardLogoBox}>
              <MaterialCommunityIcons name="diamond-stone" size={18} color="#0A0A0A" />
            </View>
            <Text style={styles.cardBrand}>BLEX TOKEN</Text>
            <View style={{ flex: 1 }} />
            <View style={[styles.cardTierPill, { borderColor: tier.color }]}>
              <Text style={[styles.cardTierText, { color: tier.color }]}>
                {tier.label.toUpperCase()}
              </Text>
            </View>
          </View>

          <Text style={styles.cardLbl}>SALDO DISPONÍVEL</Text>
          <View style={styles.balanceRow}>
            <Text style={styles.balanceValue}>
              {hideBalance ? "••••••" : balance}
            </Text>
            <Text style={styles.balanceUnit}>BLX</Text>
          </View>

          <View style={styles.walletNumberRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.walletNumberLbl}>NÚMERO DA CARTEIRA</Text>
              <Text style={styles.walletNumberValue} numberOfLines={1}>
                {w.wallet_number}
              </Text>
            </View>
            <TouchableOpacity style={styles.copyBtn} onPress={copyWallet} testID="blx-copy-wallet">
              <Ionicons name="copy-outline" size={15} color="#FFF" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.copyBtn} onPress={shareWallet} testID="blx-share-wallet">
              <Ionicons name="share-social-outline" size={15} color="#FFF" />
            </TouchableOpacity>
          </View>

          <View style={styles.cardHolderRow}>
            <Text style={styles.cardHolderLbl}>TITULAR</Text>
            <Text style={styles.cardHolderValue}>
              {(member.nickname || member.name).toUpperCase()}
            </Text>
          </View>
        </View>

        {/* Ações rápidas */}
        <View style={styles.actionsRow}>
          <ActionButton
            icon="arrow-up-circle"
            label="Enviar"
            onPress={() => router.push("/blx/send" as any)}
            testID="blx-action-send"
          />
          <ActionButton
            icon="arrow-down-circle"
            label="Receber"
            onPress={() => router.push("/blx/receive" as any)}
            testID="blx-action-receive"
          />
          <ActionButton
            icon="receipt-outline"
            label="Extrato"
            onPress={() => router.push("/blx/history" as any)}
            testID="blx-action-history"
          />
          <ActionButton
            icon="chatbubbles-outline"
            label="Suporte"
            onPress={() => router.push("/chat" as any)}
            testID="blx-action-support"
          />
        </View>

        {/* Marketplace escrow */}
        {(w.escrow_in_centavos > 0 || w.escrow_out_centavos > 0) && (
          <View style={styles.escrowBox}>
            <Text style={styles.sectionLabel}>COMPRAS · MARKETPLACE</Text>
            <View style={styles.escrowRow}>
              <View style={styles.escrowItem}>
                <Text style={styles.escrowLbl}>A RECEBER</Text>
                <Text style={[styles.escrowVal, { color: "#4EE07F" }]}>
                  +{formatBLXShort(w.escrow_in_centavos)} BLX
                </Text>
              </View>
              <View style={styles.escrowSep} />
              <View style={styles.escrowItem}>
                <Text style={styles.escrowLbl}>EM GARANTIA</Text>
                <Text style={[styles.escrowVal, { color: "#F5C150" }]}>
                  {formatBLXShort(w.escrow_out_centavos)} BLX
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Últimas transações */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionLabel}>ÚLTIMAS MOVIMENTAÇÕES</Text>
            <TouchableOpacity onPress={() => router.push("/blx/history" as any)}>
              <Text style={styles.seeAll}>VER TUDO</Text>
            </TouchableOpacity>
          </View>

          {txs.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="wallet-outline" size={32} color="#2E2E2E" />
              <Text style={styles.emptyTitle}>Carteira zerada</Text>
              <Text style={styles.emptyText}>
                Peça à administração para creditar BLX ou receba de outro membro.
              </Text>
            </View>
          ) : (
            txs.map((tx) => <TxRow key={tx.tx_id} tx={tx} me={member.member_id} />)
          )}
        </View>

        {/* Info rodapé */}
        <View style={styles.footerInfo}>
          <Ionicons name="shield-checkmark" size={13} color="#6B6B6B" />
          <Text style={styles.footerInfoText}>
            BLX é a moeda interna do clube. Transferências entre membros são instantâneas e definitivas.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function ActionButton({
  icon, label, onPress, testID,
}: { icon: any; label: string; onPress?: () => void; testID?: string }) {
  return (
    <TouchableOpacity style={styles.actionBtn} onPress={onPress} activeOpacity={0.8} testID={testID}>
      <View style={styles.actionIcon}>
        <Ionicons name={icon} size={22} color="#FFFFFF" />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function TxRow({ tx, me }: { tx: BlxTx; me: string }) {
  const isOut = tx.from_id === me;
  const isIn = tx.to_id === me;
  let icon: any = "swap-horizontal";
  let color = "#AAA";
  let title = tx.note || tx.type.toUpperCase();
  let counterpart = "";
  if (tx.type === "transfer") {
    if (isOut) {
      icon = "arrow-up-circle";
      color = "#F87171";
      title = "Transferência enviada";
      counterpart = tx.to_name ? `Para ${tx.to_name}` : (tx.to_wallet || "");
    } else {
      icon = "arrow-down-circle";
      color = "#4EE07F";
      title = "Transferência recebida";
      counterpart = tx.from_name ? `De ${tx.from_name}` : (tx.from_wallet || "");
    }
  } else if (tx.type === "topup") {
    icon = "add-circle";
    color = "#4EE07F";
    title = "Crédito recebido";
    counterpart = "Administração do clube";
  } else if (tx.type === "withdraw") {
    icon = "remove-circle";
    color = "#F5C150";
    title = "Débito";
    counterpart = "Administração do clube";
  } else if (tx.type === "escrow") {
    if (isOut) {
      icon = "lock-closed";
      color = tx.status === "settled" ? "#4EE07F" : tx.status === "refunded" ? "#AAA" : "#F5C150";
      title = `Compra: ${tx.ad_title || "Anúncio"}`;
    } else if (isIn) {
      icon = "cash";
      color = tx.status === "settled" ? "#4EE07F" : "#F5C150";
      title = `Venda: ${tx.ad_title || "Anúncio"}`;
    }
  }
  const sign = isOut ? "−" : "+";
  const date = new Date(tx.created_at);
  const dateStr = date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  return (
    <View style={styles.txRow}>
      <View style={[styles.txIcon, { backgroundColor: color + "22", borderColor: color + "55" }]}>
        <Ionicons name={icon} size={16} color={color} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.txTitle} numberOfLines={1}>{title}</Text>
        <Text style={styles.txSub} numberOfLines={1}>
          {counterpart ? `${counterpart} · ${dateStr}` : dateStr}
        </Text>
      </View>
      <Text style={[styles.txAmt, { color: isOut ? "#F87171" : "#4EE07F" }]}>
        {sign}{formatBLX(tx.amount_centavos)} BLX
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 12,
    backgroundColor: "#050505",
  },
  headerRow: { flexDirection: "row", alignItems: "center" },
  bankName: { color: "#D4AF37", fontSize: 13, fontWeight: "900", letterSpacing: 2 },
  bankTag: { color: "#D4AF37", fontSize: 10, fontWeight: "700", letterSpacing: 2.5, marginTop: 3 },
  eyeBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "#121212",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "#1F1F1F",
  },
  card: {
    marginHorizontal: 16, marginTop: 6, padding: 20,
    backgroundColor: "#0E0E0E",
    borderRadius: 18,
    borderWidth: 1, borderColor: "#1F1F1F",
  },
  cardTopRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 18 },
  cardLogoBox: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: "#FFFFFF",
    alignItems: "center", justifyContent: "center",
  },
  cardBrand: { color: "#D4AF37", fontSize: 11, fontWeight: "900", letterSpacing: 2 },
  cardTierPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  cardTierText: { fontSize: 8.5, fontWeight: "900", letterSpacing: 1.5 },

  cardLbl: { color: "#8A8A8A", fontSize: 10, fontWeight: "800", letterSpacing: 2.5 },
  balanceRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, marginTop: 6 },
  balanceValue: { color: "#FFF", fontSize: 38, fontWeight: "900", letterSpacing: -1 },
  balanceUnit: { color: "#D4AF37", fontSize: 14, fontWeight: "900", letterSpacing: 1.5, marginBottom: 9 },

  walletNumberRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    marginTop: 20, paddingTop: 16, borderTopWidth: 1, borderTopColor: "#1A1A1A",
  },
  walletNumberLbl: { color: "#6B6B6B", fontSize: 9, fontWeight: "800", letterSpacing: 2 },
  walletNumberValue: { color: "#FFF", fontSize: 16, fontWeight: "800", letterSpacing: 2, marginTop: 3 },
  copyBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: "#1A1A1A",
    borderWidth: 1, borderColor: "#2A2A2A",
    alignItems: "center", justifyContent: "center",
  },
  cardHolderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 14 },
  cardHolderLbl: { color: "#6B6B6B", fontSize: 9, fontWeight: "800", letterSpacing: 2 },
  cardHolderValue: { color: "#EEE", fontSize: 11.5, fontWeight: "800", letterSpacing: 1.2 },

  actionsRow: { flexDirection: "row", paddingHorizontal: 16, marginTop: 18, gap: 8 },
  actionBtn: {
    flex: 1, alignItems: "center", paddingVertical: 14,
    backgroundColor: "#0E0E0E", borderRadius: 12,
    borderWidth: 1, borderColor: "#1A1A1A",
  },
  actionIcon: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: "#1A1A1A",
    alignItems: "center", justifyContent: "center",
    marginBottom: 8,
  },
  actionLabel: { color: "#EEE", fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },

  escrowBox: {
    marginHorizontal: 16, marginTop: 18, padding: 14,
    backgroundColor: "#0E0E0E", borderRadius: 12,
    borderWidth: 1, borderColor: "#1A1A1A",
  },
  escrowRow: { flexDirection: "row", marginTop: 10, alignItems: "center" },
  escrowItem: { flex: 1 },
  escrowSep: { width: 1, alignSelf: "stretch", backgroundColor: "#1F1F1F", marginHorizontal: 10 },
  escrowLbl: { color: "#6B6B6B", fontSize: 9, fontWeight: "800", letterSpacing: 1.8 },
  escrowVal: { fontSize: 15, fontWeight: "900", marginTop: 4 },

  section: { marginTop: 22, paddingHorizontal: 16 },
  sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  sectionLabel: { color: "#8A8A8A", fontSize: 10, fontWeight: "900", letterSpacing: 2.5 },
  seeAll: { color: "#EEE", fontSize: 10, fontWeight: "900", letterSpacing: 1.8 },

  emptyBox: {
    alignItems: "center", paddingVertical: 30, gap: 8,
    backgroundColor: "#0A0A0A", borderRadius: 12,
    borderWidth: 1, borderColor: "#141414",
  },
  emptyTitle: { color: "#AAA", fontSize: 13, fontWeight: "700" },
  emptyText: { color: "#6B6B6B", fontSize: 11, textAlign: "center", paddingHorizontal: 30, lineHeight: 16 },

  txRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 12, paddingHorizontal: 12,
    backgroundColor: "#0A0A0A",
    borderRadius: 10, marginBottom: 6,
    borderWidth: 1, borderColor: "#121212",
  },
  txIcon: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1,
  },
  txTitle: { color: "#EEE", fontSize: 13, fontWeight: "700" },
  txSub: { color: "#777", fontSize: 11, marginTop: 2 },
  txAmt: { fontSize: 13, fontWeight: "900" },

  footerInfo: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    marginHorizontal: 16, marginTop: 20, padding: 12,
    backgroundColor: "#0A0A0A", borderRadius: 10,
    borderWidth: 1, borderColor: "#141414",
  },
  footerInfoText: { flex: 1, color: "#8A8A8A", fontSize: 11, lineHeight: 15 },
});

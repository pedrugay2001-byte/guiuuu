import { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
  ActivityIndicator, Alert, Share, Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Clipboard from "expo-clipboard";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "../../src/icons";
import { api, BlxWallet, BlxTx } from "../../src/api";
import { useGate } from "../../src/gate";
import { formatBLX, formatBLXShort } from "../../src/blx";
import { TIERS } from "../../src/theme";

// Paleta platinum/prata metálica — efeito azul-prateado premium (Diamond)
const GOLD_LIGHT = "#EAF1F6";   // reflexo prata
const GOLD = "#C5D1DA";         // prata-azulado base
const GOLD_DARK = "#8FA3B4";    // metálico médio
const GOLD_DEEP = "#2A3744";    // azul-aço profundo

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
                color={GOLD_LIGHT}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Cartão principal com saldo — gradiente dourado luxo */}
        <View style={styles.cardWrap}>
          {/* Glow externo dourado */}
          <LinearGradient
            colors={[GOLD_LIGHT, GOLD, GOLD_DARK]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.cardBorderGradient}
          >
            <LinearGradient
              colors={["#0F1418", "#0A0D10", "#050607"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.card}
            >
              {/* Textura sutil — diagonal gold shine */}
              <View style={styles.cardShineWrap} pointerEvents="none">
                <LinearGradient
                  colors={["transparent", "rgba(197,209,218,0.22)", "transparent"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.cardShine}
                />
              </View>

              <View style={styles.cardTopRow}>
                <LinearGradient
                  colors={[GOLD_LIGHT, GOLD, GOLD_DARK]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.cardLogoBox}
                >
                  <MaterialCommunityIcons name="diamond-stone" size={18} color="#0A0A0A" />
                </LinearGradient>
                <Text style={styles.cardBrand}>BLEX TOKEN</Text>
                <View style={{ flex: 1 }} />
                <View style={[styles.cardTierPill, { borderColor: GOLD }]}>
                  <Text style={[styles.cardTierText, { color: GOLD_LIGHT }]}>
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

              {/* Linha dourada divisória com fade */}
              <LinearGradient
                colors={["transparent", GOLD, "transparent"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.goldDivider}
              />

              <View style={styles.walletNumberRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.walletNumberLbl}>NÚMERO DA CARTEIRA</Text>
                  <Text style={styles.walletNumberValue} numberOfLines={1}>
                    {w.wallet_number}
                  </Text>
                </View>
                <TouchableOpacity style={styles.copyBtn} onPress={copyWallet} testID="blx-copy-wallet">
                  <Ionicons name="copy-outline" size={15} color={GOLD_LIGHT} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.copyBtn} onPress={shareWallet} testID="blx-share-wallet">
                  <Ionicons name="share-social-outline" size={15} color={GOLD_LIGHT} />
                </TouchableOpacity>
              </View>

              <View style={styles.cardHolderRow}>
                <Text style={styles.cardHolderLbl}>TITULAR</Text>
                <Text style={styles.cardHolderValue}>
                  {(member.nickname || member.name).toUpperCase()}
                </Text>
              </View>
            </LinearGradient>
          </LinearGradient>
        </View>

        {/* Ações rápidas — premium cards platinum */}
        <View style={styles.actionsRow}>
          <ActionButton
            icon="arrow-up"
            label="Enviar"
            sub="Transferir"
            onPress={() => router.push("/blx/send" as any)}
            testID="blx-action-send"
          />
          <ActionButton
            icon="arrow-down"
            label="Receber"
            sub="Receber BLX"
            onPress={() => router.push("/blx/receive" as any)}
            testID="blx-action-receive"
          />
          <ActionButton
            icon="receipt-outline"
            label="Extrato"
            sub="Histórico"
            onPress={() => router.push("/blx/history" as any)}
            testID="blx-action-history"
          />
        </View>

        {/* Ações premium — Adicionar BLX + Suporte */}
        <View style={styles.ctaRow}>
          <TouchableOpacity
            style={styles.ctaPrimary}
            onPress={() => router.push("/wallet/topup" as any)}
            activeOpacity={0.88}
            testID="blx-action-topup"
          >
            <LinearGradient
              colors={[GOLD_LIGHT, GOLD, GOLD_DARK]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.ctaInner}
            >
              <Ionicons name="add-circle" size={18} color="#0A0A0A" />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.ctaPrimaryLbl}>ADICIONAR BLX</Text>
                <Text style={styles.ctaPrimarySub}>Recarregue sua carteira</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#0A0A0A" />
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.ctaSecondary}
            onPress={() => router.push("/chat" as any)}
            activeOpacity={0.88}
            testID="blx-action-support"
          >
            <View style={styles.ctaSecondaryInner}>
              <Ionicons name="headset" size={18} color={GOLD_LIGHT} />
              <Text style={styles.ctaSecondaryLbl}>SUPORTE</Text>
            </View>
          </TouchableOpacity>
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
      </ScrollView>
    </View>
  );
}

function ActionButton({
  icon, label, sub, onPress, testID,
}: { icon: any; label: string; sub?: string; onPress?: () => void; testID?: string }) {
  return (
    <TouchableOpacity style={styles.actionBtn} onPress={onPress} activeOpacity={0.85} testID={testID}>
      {/* Borda dourada sutil via gradient */}
      <LinearGradient
        colors={[GOLD + "55", "transparent", GOLD_DARK + "33"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.actionBtnBorder}
      >
        <View style={styles.actionBtnInner}>
          <View style={styles.actionIcon}>
            <Ionicons name={icon} size={20} color={GOLD_LIGHT} />
          </View>
          <Text style={styles.actionLabel}>{label}</Text>
          {sub ? <Text style={styles.actionSub}>{sub}</Text> : null}
        </View>
      </LinearGradient>
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
  bankName: { color: GOLD_LIGHT, fontSize: 13, fontWeight: "900", letterSpacing: 2 },
  bankTag: { color: GOLD_DARK, fontSize: 10, fontWeight: "700", letterSpacing: 2.5, marginTop: 3 },
  eyeBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "#0E0B04",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: GOLD_DARK + "55",
  },

  cardWrap: {
    marginHorizontal: 16, marginTop: 6,
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  cardBorderGradient: {
    borderRadius: 20, padding: 1.5,
  },
  card: {
    padding: 20, borderRadius: 19,
    position: "relative", overflow: "hidden",
  },
  cardShineWrap: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    opacity: 0.6,
  },
  cardShine: {
    position: "absolute", top: -40, left: -80, right: -80, height: 120,
    transform: [{ rotate: "-18deg" }],
  },
  cardTopRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 18 },
  cardLogoBox: {
    width: 30, height: 30, borderRadius: 8,
    alignItems: "center", justifyContent: "center",
  },
  cardBrand: { color: GOLD_LIGHT, fontSize: 11, fontWeight: "900", letterSpacing: 2 },
  cardTierPill: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1,
    backgroundColor: "rgba(143,163,180,0.12)",
  },
  cardTierText: { fontSize: 8.5, fontWeight: "900", letterSpacing: 1.5 },

  cardLbl: { color: GOLD_DARK, fontSize: 10, fontWeight: "800", letterSpacing: 2.5 },
  balanceRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, marginTop: 6 },
  balanceValue: { color: "#FFF", fontSize: 40, fontWeight: "900", letterSpacing: -1.2 },
  balanceUnit: { color: GOLD_LIGHT, fontSize: 14, fontWeight: "900", letterSpacing: 1.5, marginBottom: 10 },

  goldDivider: {
    height: 1, marginTop: 18, marginBottom: 2,
  },

  walletNumberRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    marginTop: 14,
  },
  walletNumberLbl: { color: GOLD_DARK, fontSize: 9, fontWeight: "800", letterSpacing: 2 },
  walletNumberValue: { color: "#FFF", fontSize: 16, fontWeight: "800", letterSpacing: 2, marginTop: 3 },
  copyBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: "rgba(143,163,180,0.12)",
    borderWidth: 1, borderColor: GOLD_DARK + "55",
    alignItems: "center", justifyContent: "center",
  },
  cardHolderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 14 },
  cardHolderLbl: { color: GOLD_DARK, fontSize: 9, fontWeight: "800", letterSpacing: 2 },
  cardHolderValue: { color: "#E0E8EF", fontSize: 11.5, fontWeight: "800", letterSpacing: 1.2 },

  actionsRow: { flexDirection: "row", paddingHorizontal: 16, marginTop: 18, gap: 8 },
  actionBtn: { flex: 1 },
  actionBtnBorder: {
    borderRadius: 14, padding: 1,
  },
  actionBtnInner: {
    alignItems: "center", paddingVertical: 12, paddingHorizontal: 4,
    backgroundColor: "#0B0D10",
    borderRadius: 13,
  },
  actionIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(143,163,180,0.14)",
    borderWidth: 1, borderColor: GOLD_DARK + "55",
    alignItems: "center", justifyContent: "center",
    marginBottom: 8,
  },
  actionLabel: { color: "#E0E8EF", fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  actionSub: { color: GOLD_DARK, fontSize: 8.5, fontWeight: "700", marginTop: 2, letterSpacing: 0.3 },

  // CTA row — Adicionar BLX + Suporte
  ctaRow: { flexDirection: "row", paddingHorizontal: 16, marginTop: 14, gap: 10 },
  ctaPrimary: { flex: 2, borderRadius: 14, overflow: "hidden" },
  ctaInner: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 14, paddingVertical: 13,
  },
  ctaPrimaryLbl: { color: "#0A0A0A", fontSize: 11, fontWeight: "900", letterSpacing: 1.3 },
  ctaPrimarySub: { color: "rgba(10,10,10,0.7)", fontSize: 9.5, fontWeight: "700", marginTop: 1 },
  ctaSecondary: {
    flex: 1, borderRadius: 14,
    borderWidth: 1, borderColor: GOLD_DARK + "55",
    backgroundColor: "#0B0D10",
  },
  ctaSecondaryInner: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 13, paddingHorizontal: 8,
  },
  ctaSecondaryLbl: { color: GOLD_LIGHT, fontSize: 11, fontWeight: "900", letterSpacing: 1.3 },

  escrowBox: {
    marginHorizontal: 16, marginTop: 18, padding: 14,
    backgroundColor: "#0B0D10", borderRadius: 12,
    borderWidth: 1, borderColor: GOLD_DARK + "40",
  },
  escrowRow: { flexDirection: "row", marginTop: 10, alignItems: "center" },
  escrowItem: { flex: 1 },
  escrowSep: { width: 1, alignSelf: "stretch", backgroundColor: GOLD_DARK + "40", marginHorizontal: 10 },
  escrowLbl: { color: GOLD_DARK, fontSize: 9, fontWeight: "800", letterSpacing: 1.8 },
  escrowVal: { fontSize: 15, fontWeight: "900", marginTop: 4 },

  section: { marginTop: 22, paddingHorizontal: 16 },
  sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  sectionLabel: { color: GOLD_DARK, fontSize: 10, fontWeight: "900", letterSpacing: 2.5 },
  seeAll: { color: GOLD_LIGHT, fontSize: 10, fontWeight: "900", letterSpacing: 1.8 },

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
});

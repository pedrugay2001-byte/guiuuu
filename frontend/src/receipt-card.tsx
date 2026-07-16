/**
 * ETAPA 4 — Componente reutilizável de comprovante PYX.
 *
 * Renderiza um card premium com todos os dados da transferência.
 * Usado em:
 *  - Tela de sucesso após envio (`pyx/send.tsx`)
 *  - Tela dedicada de comprovante (`pyx/receipt/[txId].tsx`)
 *  - Bolhas de mensagem (DM chat) para preview inline
 *
 * O card é envolvido em <ViewShot> na tela de comprovante para capturar
 * como imagem e compartilhar.
 */

import { View, Text, StyleSheet, Image } from "react-native";
import { Ionicons } from "./icons";
import { PyxReceipt } from "./api";
import { formatPYX } from "./pyx";
import { TIERS } from "./theme";

type Variant = "full" | "compact";

export function ReceiptCard({
  receipt,
  variant = "full",
  perspective,
}: {
  receipt: PyxReceipt;
  variant?: Variant;
  perspective?: string; // member_id que está visualizando (destaca "Enviado" ou "Recebido")
}) {
  const isCompact = variant === "compact";
  const fromInfo = receipt.from_info || {};
  const toInfo = receipt.to_info || {};
  const isOut = perspective ? receipt.from_id === perspective : true;
  const direction = isOut ? "ENVIADO" : "RECEBIDO";
  const directionColor = isOut ? "#F87171" : "#4EE07F";
  const created = new Date(receipt.created_at);
  const dateStr = created.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const timeStr = created.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const statusLabel =
    receipt.status === "settled"
      ? "LIQUIDADO"
      : receipt.status === "refunded"
      ? "REEMBOLSADO"
      : receipt.status?.toUpperCase() || "OK";

  const fromTier = TIERS[(fromInfo.tier as any) || "black"] || TIERS.black;
  const toTier = TIERS[(toInfo.tier as any) || "black"] || TIERS.black;

  return (
    <View style={[styles.card, isCompact && styles.cardCompact]}>
      {/* HEADER */}
      <View style={styles.headerBar}>
        <View style={styles.brand}>
          <Ionicons name="diamond" size={13} color="#D4AF37" />
          <Text style={styles.brandTxt}>BLACKSCLUB</Text>
        </View>
        <View style={[styles.pill, { borderColor: directionColor + "88" }]}>
          <View style={[styles.dot, { backgroundColor: directionColor }]} />
          <Text style={[styles.pillTxt, { color: directionColor }]}>{direction}</Text>
        </View>
      </View>

      <Text style={styles.kicker}>COMPROVANTE DE TRANSFERÊNCIA PYX</Text>

      {/* AMOUNT */}
      <View style={styles.amountRow}>
        <Text style={styles.amountSign}>{isOut ? "−" : "+"}</Text>
        <Text style={styles.amount}>{formatPYX(receipt.amount_centavos)}</Text>
        <Text style={styles.amountUnit}>PYX</Text>
      </View>

      <View style={styles.line} />

      {/* PARTIES */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>DE</Text>
        <View style={styles.partyRow}>
          <View style={[styles.avatar, { borderColor: fromTier.color }]}>
            {fromInfo.avatar_base64 ? (
              <Image source={{ uri: fromInfo.avatar_base64 }} style={styles.avatarImg} />
            ) : (
              <Text style={styles.avatarTxt}>
                {(fromInfo.nickname || fromInfo.name || receipt.from_name || "?").charAt(0).toUpperCase()}
              </Text>
            )}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.partyName} numberOfLines={1}>
              {fromInfo.nickname || fromInfo.name || receipt.from_name || "—"}
            </Text>
            <Text style={styles.partyWallet}>{receipt.from_wallet || "—"}</Text>
          </View>
        </View>
      </View>

      <View style={styles.arrowWrap}>
        <View style={styles.arrowLine} />
        <View style={styles.arrowCircle}>
          <Ionicons name="arrow-down" size={12} color="#D4AF37" />
        </View>
        <View style={styles.arrowLine} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>PARA</Text>
        <View style={styles.partyRow}>
          <View style={[styles.avatar, { borderColor: toTier.color }]}>
            {toInfo.avatar_base64 ? (
              <Image source={{ uri: toInfo.avatar_base64 }} style={styles.avatarImg} />
            ) : (
              <Text style={styles.avatarTxt}>
                {(toInfo.nickname || toInfo.name || receipt.to_name || "?").charAt(0).toUpperCase()}
              </Text>
            )}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.partyName} numberOfLines={1}>
              {toInfo.nickname || toInfo.name || receipt.to_name || "—"}
            </Text>
            <Text style={styles.partyWallet}>{receipt.to_wallet || "—"}</Text>
          </View>
        </View>
      </View>

      {receipt.note ? (
        <View style={styles.noteBox}>
          <Ionicons name="chatbubble-ellipses" size={12} color="#D4AF37" />
          <Text style={styles.noteTxt} numberOfLines={4}>
            {receipt.note}
          </Text>
        </View>
      ) : null}

      <View style={styles.line} />

      {/* META */}
      <View style={styles.metaGrid}>
        <View style={styles.metaCol}>
          <Text style={styles.metaLbl}>DATA</Text>
          <Text style={styles.metaVal}>{dateStr}</Text>
        </View>
        <View style={styles.metaCol}>
          <Text style={styles.metaLbl}>HORA</Text>
          <Text style={styles.metaVal}>{timeStr}</Text>
        </View>
        <View style={styles.metaCol}>
          <Text style={styles.metaLbl}>STATUS</Text>
          <Text style={[styles.metaVal, { color: "#4EE07F" }]}>{statusLabel}</Text>
        </View>
      </View>

      <View style={styles.txIdBox}>
        <Text style={styles.txIdLbl}>ID DA TRANSAÇÃO</Text>
        <Text style={styles.txIdVal} selectable>
          {receipt.tx_id}
        </Text>
      </View>

      <Text style={styles.footer}>
        Este comprovante certifica uma operação PYX realizada dentro do BLACKSCLUB.
        Guarde-o em local seguro.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#0B0B0B",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(212,175,55,0.28)",
    padding: 20,
    gap: 4,
    // sombra dourada sutil (web + iOS)
    shadowColor: "#D4AF37",
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
  },
  cardCompact: {
    padding: 12,
    borderRadius: 12,
  },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 6 },
  brandTxt: {
    color: "#D4AF37",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 2,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  pillTxt: { fontSize: 10, fontWeight: "900", letterSpacing: 1.5 },
  kicker: {
    color: "#8A8A8A",
    fontSize: 9.5,
    fontWeight: "900",
    letterSpacing: 2,
    textAlign: "center",
    marginTop: 14,
    marginBottom: 8,
  },
  amountRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "center",
    gap: 6,
  },
  amountSign: { color: "#EEE", fontSize: 28, fontWeight: "900" },
  amount: {
    color: "#FFF",
    fontSize: 42,
    fontWeight: "900",
    letterSpacing: -1,
    fontVariant: ["tabular-nums"],
  },
  amountUnit: {
    color: "#C5D1DA",
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  line: {
    height: 1,
    backgroundColor: "#1A1A1A",
    marginVertical: 14,
  },
  section: { gap: 8 },
  sectionLabel: {
    color: "#8A8A8A",
    fontSize: 9.5,
    fontWeight: "900",
    letterSpacing: 2,
  },
  partyRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    backgroundColor: "#1A1A1A",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImg: { width: "100%", height: "100%" },
  avatarTxt: { color: "#FFF", fontSize: 15, fontWeight: "900" },
  partyName: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "800",
  },
  partyWallet: {
    color: "#C5D1DA",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    marginTop: 2,
  },
  arrowWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginVertical: 6,
    paddingHorizontal: 8,
  },
  arrowLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#1A1A1A",
  },
  arrowCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(212,175,55,0.10)",
    borderWidth: 1,
    borderColor: "rgba(212,175,55,0.40)",
    alignItems: "center",
    justifyContent: "center",
  },
  noteBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 12,
    padding: 10,
    borderRadius: 8,
    backgroundColor: "rgba(212,175,55,0.06)",
    borderWidth: 1,
    borderColor: "rgba(212,175,55,0.18)",
  },
  noteTxt: {
    flex: 1,
    color: "#E8C77A",
    fontSize: 12,
    lineHeight: 17,
    fontStyle: "italic",
  },
  metaGrid: {
    flexDirection: "row",
    gap: 8,
  },
  metaCol: { flex: 1, gap: 3 },
  metaLbl: {
    color: "#6B6B6B",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  metaVal: {
    color: "#EEE",
    fontSize: 12,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  txIdBox: {
    marginTop: 12,
    padding: 10,
    borderRadius: 8,
    backgroundColor: "#0E0E0E",
    borderWidth: 1,
    borderColor: "#1A1A1A",
  },
  txIdLbl: {
    color: "#6B6B6B",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  txIdVal: {
    color: "#C5D1DA",
    fontSize: 11.5,
    fontWeight: "700",
    marginTop: 4,
    fontFamily: "monospace" as any,
    letterSpacing: 0.4,
  },
  footer: {
    color: "#6B6B6B",
    fontSize: 10,
    lineHeight: 14,
    marginTop: 14,
    textAlign: "center",
    fontStyle: "italic",
  },
});

import { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Modal, Image, TextInput, Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import ViewShot, { captureRef } from "react-native-view-shot";
import { Ionicons } from "../../../src/icons";
import { api, PyxReceipt, PyxContact, DMThread } from "../../../src/api";
import { useGate } from "../../../src/gate";
import { ReceiptCard } from "../../../src/receipt-card";
import { formatPYX } from "../../../src/pyx";
import { shareReceiptImage, saveReceiptImage, shareToWhatsApp } from "../../../src/receipt-share";

export default function ReceiptScreen() {
  const router = useRouter();
  const { txId } = useLocalSearchParams<{ txId: string }>();
  const { member } = useGate();

  const [receipt, setReceipt] = useState<PyxReceipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [sharing, setSharing] = useState<null | "os" | "wpp" | "save" | "chat">(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // Chat picker (share to DM)
  const [chatOpen, setChatOpen] = useState(false);
  const [contacts, setContacts] = useState<
    { member_id: string; name: string; avatar_base64?: string | null; wallet_number?: string; is_online?: boolean }[]
  >([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [query, setQuery] = useState("");
  const debounceRef = useRef<any>(null);
  const [sendingToChat, setSendingToChat] = useState<string | null>(null);

  const viewShotRef = useRef<ViewShot>(null);

  const load = useCallback(async () => {
    if (!txId || !member) return;
    setLoading(true);
    setError(null);
    try {
      const r = await api.pyxReceipt(String(txId), member.member_id);
      setReceipt(r);
    } catch (e: any) {
      setError(e?.message || "Não foi possível carregar o comprovante");
    } finally {
      setLoading(false);
    }
  }, [txId, member]);

  useEffect(() => { load(); }, [load]);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 2500);
  };

  const capture = async (): Promise<string | null> => {
    try {
      const ref: any = viewShotRef.current;
      if (!ref) {
        showToast("Comprovante ainda não renderizado", false);
        return null;
      }
      // ViewShot v4 expõe .capture() no ref; fallback para captureRef.
      const uri: string | undefined =
        typeof ref.capture === "function"
          ? await ref.capture()
          : await captureRef(ref, { format: "png", quality: 1, result: "data-uri" });
      if (!uri || typeof uri !== "string") {
        showToast("Não foi possível gerar a imagem", false);
        return null;
      }
      // Alguns backends retornam base64 sem prefixo; normaliza para dataURI
      const dataUri = uri.startsWith("data:") ? uri : `data:image/png;base64,${uri}`;
      return dataUri;
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.warn("[receipt] capture failed:", e);
      showToast(e?.message || "Falha ao gerar imagem", false);
      return null;
    }
  };

  const filename = receipt ? `comprovante-pyx-${receipt.tx_id}.png` : "comprovante-pyx.png";

  const shareText = receipt
    ? [
        `Comprovante PYX — BLACKSCLUB`,
        `${receipt.status === "settled" ? "Liquidado" : receipt.status}`,
        ``,
        `Valor: ${formatPYX(receipt.amount_centavos)} PYX`,
        `De: ${receipt.from_name || receipt.from_wallet || "—"} (${receipt.from_wallet || "—"})`,
        `Para: ${receipt.to_name || receipt.to_wallet || "—"} (${receipt.to_wallet || "—"})`,
        `Data: ${new Date(receipt.created_at).toLocaleString("pt-BR")}`,
        `ID: ${receipt.tx_id}`,
      ].join("\n")
    : "";

  const doShareOS = async () => {
    if (!receipt) return;
    setSharing("os");
    const uri = await capture();
    if (uri) {
      const r = await shareReceiptImage(uri, filename, shareText);
      if (!r.ok && r.error) showToast(r.error, false);
      else if (r.ok) showToast("Comprovante compartilhado", true);
    }
    setSharing(null);
  };

  const doSaveImage = async () => {
    if (!receipt) return;
    setSharing("save");
    const uri = await capture();
    if (uri) {
      const r = await saveReceiptImage(uri, filename);
      if (r.ok) showToast(Platform.OS === "web" ? "Download iniciado" : "Salvo na galeria", true);
      else showToast(r.error || "Falha ao salvar", false);
    }
    setSharing(null);
  };

  const doWhatsApp = async () => {
    setSharing("wpp");
    const r = await shareToWhatsApp(shareText);
    if (!r.ok) showToast(r.error || "Falha ao abrir WhatsApp", false);
    setSharing(null);
  };

  // ==== Share to in-app chat ====
  const openChatPicker = async () => {
    setChatOpen(true);
    setQuery("");
    if (!member) return;
    setContactsLoading(true);
    try {
      const threads = await api.dmThreads(member.member_id);
      // Enriquecer com nomes
      const ids = threads.map((t: DMThread) => t.partner_id);
      if (ids.length === 0) { setContacts([]); return; }
      const members = await Promise.all(
        ids.map((id) => api.communityMember(id).catch(() => null)),
      );
      const list = members
        .filter((m) => m)
        .map((m: any) => ({
          member_id: m.member_id,
          name: m.nickname || m.name,
          avatar_base64: m.avatar_base64,
          wallet_number: m.wallet_number || "",
          is_online: m.is_online,
        }));
      setContacts(list);
    } catch {
      setContacts([]);
    } finally {
      setContactsLoading(false);
    }
  };

  // Busca com debounce quando digita algo
  useEffect(() => {
    if (!chatOpen) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 2) return;
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await api.pyxLookup(q);
        const filtered = r
          .filter((c) => c.member_id !== member?.member_id)
          .map((c: PyxContact) => ({
            member_id: c.member_id,
            name: c.nickname || c.name,
            avatar_base64: c.avatar_base64,
            wallet_number: c.wallet_number,
          }));
        setContacts(filtered);
      } catch { /* noop */ }
    }, 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, chatOpen, member]);

  const shareToDM = async (partnerId: string) => {
    if (!member || !receipt) return;
    setSendingToChat(partnerId);
    try {
      const note = receipt.note
        ? `Comprovante — ${formatPYX(receipt.amount_centavos)} PYX · "${receipt.note}"`
        : `Comprovante — ${formatPYX(receipt.amount_centavos)} PYX`;
      await api.dmSend(member.member_id, partnerId, note, { kind: "receipt", tx_id: receipt.tx_id });
      setChatOpen(false);
      showToast("Comprovante enviado no chat", true);
    } catch (e: any) {
      showToast(e?.message || "Falha ao enviar", false);
    } finally {
      setSendingToChat(null);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: "#050505", justifyContent: "center" }}>
        <ActivityIndicator color="#D4AF37" />
      </View>
    );
  }

  if (error || !receipt) {
    return (
      <View style={{ flex: 1, backgroundColor: "#050505" }}>
        <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
          <View style={styles.topBar}>
            <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
              <Ionicons name="chevron-back" size={22} color="#FFF" />
            </TouchableOpacity>
            <Text style={styles.title}>COMPROVANTE</Text>
            <View style={{ width: 40 }} />
          </View>
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={38} color="#F87171" />
            <Text style={styles.errorTxt}>{error || "Comprovante indisponível"}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={load} testID="receipt-retry">
              <Text style={styles.retryTxt}>TENTAR NOVAMENTE</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#050505" }}>
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} testID="receipt-back">
            <Ionicons name="chevron-back" size={22} color="#FFF" />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={styles.title}>COMPROVANTE</Text>
            <Text style={styles.sub}>{receipt.tx_id}</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          {/* Captura o card como imagem */}
          <ViewShot
            ref={viewShotRef}
            options={{ format: "png", quality: 1, result: "data-uri" }}
            style={{ backgroundColor: "#050505" }}
          >
            <ReceiptCard receipt={receipt} perspective={member?.member_id} />
          </ViewShot>

          {/* SHARE ACTIONS */}
          <Text style={styles.actionsTitle}>COMPARTILHAR</Text>
          <View style={styles.grid}>
            <ActionButton
              icon="chatbubbles"
              color="#7FD7E5"
              label="Chat interno"
              onPress={openChatPicker}
              busy={sharing === "chat"}
              testID="receipt-share-chat"
            />
            <ActionButton
              icon="logo-whatsapp"
              color="#1EBE5D"
              label="WhatsApp"
              onPress={doWhatsApp}
              busy={sharing === "wpp"}
              testID="receipt-share-whatsapp"
            />
            <ActionButton
              icon="share-social"
              color="#D4AF37"
              label={Platform.OS === "web" ? "Compartilhar" : "Compartilhar (OS)"}
              onPress={doShareOS}
              busy={sharing === "os"}
              testID="receipt-share-os"
            />
            <ActionButton
              icon={Platform.OS === "web" ? "download" : "images"}
              color="#C5D1DA"
              label={Platform.OS === "web" ? "Baixar imagem" : "Salvar na galeria"}
              onPress={doSaveImage}
              busy={sharing === "save"}
              testID="receipt-share-save"
            />
          </View>
        </ScrollView>

        {/* Toast simples */}
        {toast && (
          <View style={[styles.toast, { backgroundColor: toast.ok ? "#0F3320" : "#3B1414", borderColor: toast.ok ? "#4EE07F" : "#F87171" }]}>
            <Ionicons name={toast.ok ? "checkmark-circle" : "alert-circle"} size={16} color={toast.ok ? "#4EE07F" : "#F87171"} />
            <Text style={[styles.toastTxt, { color: toast.ok ? "#4EE07F" : "#F87171" }]}>{toast.msg}</Text>
          </View>
        )}
      </SafeAreaView>

      {/* MODAL: escolher contato para enviar no chat interno */}
      <Modal visible={chatOpen} animationType="slide" transparent onRequestClose={() => setChatOpen(false)}>
        <SafeAreaView style={styles.chatBackdrop} edges={["bottom"]}>
          <View style={styles.chatSheet}>
            <View style={styles.chatHeader}>
              <TouchableOpacity onPress={() => setChatOpen(false)}>
                <Ionicons name="close" size={22} color="#EEE" />
              </TouchableOpacity>
              <Text style={styles.chatTitle}>ENVIAR NO CHAT</Text>
              <View style={{ width: 22 }} />
            </View>
            <View style={styles.searchBox}>
              <Ionicons name="search" size={14} color="#8A8A8A" />
              <TextInput
                style={styles.searchInput}
                placeholder="Buscar membro por nome, carteira ou e-mail"
                placeholderTextColor="#6B6B6B"
                value={query}
                onChangeText={setQuery}
                autoCapitalize="none"
                testID="receipt-chat-search"
              />
            </View>

            {contactsLoading ? (
              <ActivityIndicator color="#D4AF37" style={{ marginTop: 30 }} />
            ) : contacts.length === 0 ? (
              <View style={{ alignItems: "center", padding: 30, gap: 8 }}>
                <Ionicons name="chatbubble-ellipses" size={30} color="#2E2E2E" />
                <Text style={{ color: "#888", fontSize: 12 }}>
                  {query.trim().length >= 2 ? "Nenhum contato encontrado" : "Digite ao menos 2 caracteres para buscar"}
                </Text>
              </View>
            ) : (
              <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 30 }}>
                {contacts.map((c) => (
                  <TouchableOpacity
                    key={c.member_id}
                    style={styles.contactRow}
                    onPress={() => shareToDM(c.member_id)}
                    disabled={!!sendingToChat}
                    testID={`receipt-share-to-${c.member_id}`}
                    activeOpacity={0.85}
                  >
                    <View style={styles.contactAv}>
                      {c.avatar_base64 ? (
                        <Image source={{ uri: c.avatar_base64 }} style={{ width: "100%", height: "100%" }} />
                      ) : (
                        <Text style={{ color: "#EEE", fontWeight: "900" }}>{c.name.charAt(0).toUpperCase()}</Text>
                      )}
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.contactName} numberOfLines={1}>{c.name}</Text>
                      {c.wallet_number ? <Text style={styles.contactWallet}>{c.wallet_number}</Text> : null}
                    </View>
                    {sendingToChat === c.member_id ? (
                      <ActivityIndicator color="#D4AF37" />
                    ) : (
                      <Ionicons name="send" size={16} color="#D4AF37" />
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

function ActionButton({
  icon, color, label, onPress, busy, testID,
}: {
  icon: any; color: string; label: string; onPress: () => void; busy?: boolean; testID?: string;
}) {
  return (
    <TouchableOpacity
      style={[styles.action, { borderColor: color + "44" }]}
      onPress={onPress}
      activeOpacity={0.85}
      disabled={busy}
      testID={testID}
    >
      <View style={[styles.actionIcon, { backgroundColor: color + "18", borderColor: color + "44" }]}>
        {busy ? <ActivityIndicator color={color} size="small" /> : <Ionicons name={icon} size={20} color={color} />}
      </View>
      <Text style={styles.actionTxt}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 12,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#141414",
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { color: "#FFF", fontSize: 13, fontWeight: "900", letterSpacing: 2 },
  sub: {
    color: "#8A8A8A", fontSize: 10, fontWeight: "700", letterSpacing: 1,
    marginTop: 2, fontFamily: "monospace" as any,
  },

  actionsTitle: {
    color: "#8A8A8A", fontSize: 10, fontWeight: "900", letterSpacing: 2,
    marginTop: 22, marginBottom: 10,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  action: {
    flexBasis: "48%",
    flexGrow: 1,
    minWidth: 140,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#0B0B0B",
    borderWidth: 1,
  },
  actionIcon: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1,
  },
  actionTxt: {
    color: "#EEE", fontSize: 12, fontWeight: "800", letterSpacing: 0.4, flex: 1,
  },

  errorBox: { padding: 24, alignItems: "center", gap: 12, marginTop: 30 },
  errorTxt: { color: "#F87171", fontSize: 13, textAlign: "center" },
  retryBtn: {
    marginTop: 8, paddingHorizontal: 24, paddingVertical: 12,
    backgroundColor: "#D4AF37", borderRadius: 10,
  },
  retryTxt: { color: "#0A0A0A", fontWeight: "900", letterSpacing: 1.5, fontSize: 11.5 },

  toast: {
    position: "absolute", left: 20, right: 20, bottom: 20,
    flexDirection: "row", alignItems: "center", gap: 10,
    padding: 12, borderRadius: 10, borderWidth: 1,
  },
  toastTxt: { fontSize: 12, fontWeight: "800", flex: 1 },

  // Modal chat picker
  chatBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  chatSheet: {
    backgroundColor: "#0B0B0B", borderTopLeftRadius: 16, borderTopRightRadius: 16,
    borderTopWidth: 1, borderColor: "#1F1F1F",
    maxHeight: "82%",
  },
  chatHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: 14, borderBottomWidth: 1, borderColor: "#1A1A1A",
  },
  chatTitle: { color: "#FFF", fontSize: 12, fontWeight: "900", letterSpacing: 2 },
  searchBox: {
    flexDirection: "row", alignItems: "center", gap: 10,
    marginHorizontal: 14, marginTop: 12,
    paddingHorizontal: 12, backgroundColor: "#0E0E0E",
    borderRadius: 10, borderWidth: 1, borderColor: "#1A1A1A",
  },
  searchInput: { flex: 1, color: "#FFF", paddingVertical: 12, fontSize: 13 },
  contactRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 12, backgroundColor: "#0E0E0E",
    borderRadius: 12, borderWidth: 1, borderColor: "#1A1A1A", marginBottom: 8,
  },
  contactAv: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "#1F1F1F", overflow: "hidden",
    alignItems: "center", justifyContent: "center",
  },
  contactName: { color: "#FFF", fontSize: 14, fontWeight: "800" },
  contactWallet: { color: "#C5D1DA", fontSize: 11, fontWeight: "700", letterSpacing: 1, marginTop: 2 },
});

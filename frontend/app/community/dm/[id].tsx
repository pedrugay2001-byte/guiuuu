import { useState, useEffect, useRef, useCallback } from "react";
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList,
  KeyboardAvoidingView, Platform, ActivityIndicator, Image, Alert, Pressable, Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "../../../src/icons";
import { api, CommunityMember, DMMessage } from "../../../src/api";
import { useGate } from "../../../src/gate";
import { TIERS } from "../../../src/theme";
import { pickCompressedImage } from "../../../src/imagepicker";
import { AudioRecorderButton, AudioPlayer } from "../../../src/audio";

const EMOJIS = ["🔥", "💪", "❤️", "🙌", "👊", "✨", "🏋️", "🥶", "😂", "😎", "🎉", "💀", "🍏", "🥊", "🦾", "☀️", "🌙", "💯", "👁️", "🥵"];

export default function DMChat() {
  const { id, msg } = useLocalSearchParams<{ id: string; msg?: string }>();
  const { member } = useGate();
  const router = useRouter();
  const [partner, setPartner] = useState<CommunityMember | null>(null);
  const [msgs, setMsgs] = useState<DMMessage[]>([]);
  const [text, setText] = useState(typeof msg === "string" ? msg : "");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [selectedMsg, setSelectedMsg] = useState<DMMessage | null>(null); // long-press seleção
  const [threadMenuOpen, setThreadMenuOpen] = useState(false);
  const [confirmThreadDelete, setConfirmThreadDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const listRef = useRef<FlatList>(null);

  const load = useCallback(async () => {
    if (!member || !id) return;
    try {
      const [p, m] = await Promise.all([api.communityMember(id), api.dmList(member.member_id, id)]);
      setPartner(p); setMsgs(m);
      api.dmMarkRead(member.member_id, id).catch(() => {});
    } finally { setLoading(false); }
  }, [member, id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (msgs.length) setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80); }, [msgs]);

  useEffect(() => {
    if (!member || !id) return;
    const t = setInterval(async () => {
      try {
        const m = await api.dmList(member.member_id, id);
        setMsgs(m);
        api.dmMarkRead(member.member_id, id).catch(() => {});
      } catch { /* noop */ }
    }, 10000);
    return () => clearInterval(t);
  }, [member, id]);

  const send = async (customText?: string) => {
    const payload = (customText || text).trim();
    if (!payload || !member || !id || sending) return;
    setSending(true); setText(""); setEmojiOpen(false);
    try {
      const m = await api.dmSend(member.member_id, id, payload);
      setMsgs(prev => [...prev, m]);
    } catch { /* noop */ }
    finally { setSending(false); }
  };

  const attachPhoto = async () => {
    const uri = await pickCompressedImage({ quality: 0.35 });
    if (uri) {
      const marker = `[IMG]${uri}[/IMG]`;
      await send(marker);
    }
  };

  const addEmoji = (e: string) => setText(prev => prev + e);

  // Apaga uma mensagem específica (só do próprio user)
  const doDeleteMessage = async (m: DMMessage) => {
    if (!member || !id) return;
    setBusy(true);
    try {
      await api.dmDeleteMessage(member.member_id, id, m.dm_id);
      setMsgs(prev => prev.filter(x => x.dm_id !== m.dm_id));
      setSelectedMsg(null);
    } catch (e: any) {
      Alert.alert("Erro", e?.message || "Não foi possível apagar a mensagem.");
    } finally { setBusy(false); }
  };

  // Abre o modal in-app de confirmação (Alert.alert com botões custom não funciona no react-native-web).
  const doDeleteThread = () => {
    setThreadMenuOpen(false);
    setConfirmThreadDelete(true);
  };

  const confirmDeleteThreadNow = async () => {
    if (!member || !id) return;
    setBusy(true);
    try {
      await api.dmDeleteThread(member.member_id, id);
      setConfirmThreadDelete(false);
      setMsgs([]);
      // Navigate back robustly (URL direto ou hard reload não tem histórico)
      if (router.canGoBack()) router.back();
      else router.replace("/community/messages");
    } catch (e: any) {
      Alert.alert("Erro", e?.message || "Não foi possível apagar a conversa.");
      setConfirmThreadDelete(false);
    } finally { setBusy(false); }
  };

  if (loading || !partner) return <View style={{ flex: 1, backgroundColor: "#050505", justifyContent: "center" }}><ActivityIndicator color="#FFF" /></View>;

  const tier = TIERS[partner.tier] || TIERS.silver;
  void tier;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, backgroundColor: "#050505" }}>
      <Stack.Screen options={{
        headerStyle: { backgroundColor: "#050505" }, headerTintColor: "#FFF",
        headerTitle: () => (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            {partner.avatar_base64 ? <Image source={{ uri: partner.avatar_base64 }} style={styles.headerAv} /> : (
              <View style={[styles.headerAv, { backgroundColor: "#2A2A2A", alignItems: "center", justifyContent: "center" }]}>
                <Text style={{ color: "#EEE", fontWeight: "800" }}>{partner.nickname.charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <View>
              <Text style={styles.headerName}>{partner.nickname}</Text>
              <Text style={[styles.headerOnline, { color: partner.is_online ? "#4EE07F" : "#888" }]}>{partner.is_online ? "Online agora" : "Offline"}</Text>
            </View>
          </View>
        ),
        headerRight: () => (
          <TouchableOpacity
            onPress={() => setThreadMenuOpen(true)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={{ paddingHorizontal: 8 }}
            testID="dm-thread-menu"
          >
            <Ionicons name="ellipsis-vertical" size={20} color="#EEE" />
          </TouchableOpacity>
        ),
      }} />
      <SafeAreaView style={{ flex: 1 }} edges={["bottom"]}>
        {msgs.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="chatbubble-ellipses-outline" size={44} color="#555" />
            <Text style={styles.emptyTxt}>Puxe conversa com {partner.nickname}!</Text>
            <Text style={styles.emptyHint}>Mande um emoji ou foto para quebrar o gelo.</Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={msgs}
            keyExtractor={(m, i) => m.dm_id || String(i)}
            contentContainerStyle={{ padding: 12 }}
            renderItem={({ item }) => {
              const mine = item.from_id === member?.member_id;
              const imgMatch = /\[IMG\](data:[^[]+)\[\/IMG\]/.exec(item.text);
              const audMatch = /\[AUD\](data:[^[]+)\[\/AUD\]/.exec(item.text);
              const imgUri = imgMatch?.[1];
              const audUri = audMatch?.[1];
              const cleanText = item.text
                .replace(/\[IMG\][^[]+\[\/IMG\]/, "")
                .replace(/\[AUD\][^[]+\[\/AUD\]/, "")
                .trim();
              return (
                <View style={[styles.row, mine ? styles.rowMe : styles.rowOther]}>
                  <Pressable
                    onLongPress={() => mine && setSelectedMsg(item)}
                    delayLongPress={400}
                    testID={`dm-msg-${item.dm_id}`}
                    style={({ pressed }) => [
                      styles.bubble,
                      mine ? styles.bubbleMe : styles.bubbleOther,
                      (imgUri || audUri) && { padding: 4 },
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    {imgUri && <Image source={{ uri: imgUri }} style={styles.attachImg} />}
                    {audUri && (
                      <AudioPlayer
                        src={audUri}
                        accent={mine ? "#000" : "#D4AF37"}
                        bgColor={mine ? "rgba(0,0,0,0.15)" : "#0E0E0E"}
                        textColor={mine ? "#000" : "#EEE"}
                        senderAvatar={mine ? (member as any)?.avatar_base64 : (partner as any)?.avatar_base64}
                        senderName={mine ? (member?.nickname || member?.name) : (partner?.nickname || partner?.name)}
                      />
                    )}
                    {cleanText ? <Text style={[styles.bubbleTxt, { color: mine ? "#000" : "#EEE", marginTop: (imgUri || audUri) ? 6 : 0, paddingHorizontal: (imgUri || audUri) ? 6 : 0, paddingBottom: (imgUri || audUri) ? 4 : 0 }]}>{cleanText}</Text> : null}
                  </Pressable>
                </View>
              );
            }}
          />
        )}

        {emojiOpen && (
          <View style={styles.emojiPanel}>
            {EMOJIS.map((e, i) => (
              <Pressable key={i} onPress={() => addEmoji(e)} style={styles.emojiBtn}>
                <Text style={styles.emojiTxt}>{e}</Text>
              </Pressable>
            ))}
          </View>
        )}

        <View style={styles.inputBar}>
          <TouchableOpacity style={styles.iconBtn} onPress={attachPhoto} testID="dm-photo"><Ionicons name="image" size={22} color="#D4AF37" /></TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={() => setEmojiOpen(v => !v)} testID="dm-emoji"><Ionicons name={emojiOpen ? "close" : "happy"} size={22} color="#D4AF37" /></TouchableOpacity>
          <AudioRecorderButton
            onRecorded={(a) => send(`[AUD]${a.base64}[/AUD]`)}
            testID="dm-audio"
          />
          <TextInput style={styles.input} value={text} onChangeText={setText} placeholder={`Mensagem para ${partner.nickname}...`} placeholderTextColor="#666" multiline />
          <TouchableOpacity style={[styles.sendBtn, (!text.trim() || sending) && { opacity: 0.4 }]} disabled={!text.trim() || sending} onPress={() => send()} testID="dm-send">
            <Ionicons name="send" size={16} color="#000" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* MODAL: Menu de opções da conversa (⋮ no header) */}
      <Modal visible={threadMenuOpen} transparent animationType="fade" onRequestClose={() => setThreadMenuOpen(false)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setThreadMenuOpen(false)}>
          <View style={styles.menuCard}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={doDeleteThread}
              disabled={busy}
              testID="dm-thread-delete"
            >
              <Ionicons name="trash" size={18} color="#F87171" />
              <Text style={[styles.menuItemTxt, { color: "#F87171" }]}>Apagar conversa</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* MODAL: Ações para uma mensagem selecionada (long-press) */}
      <Modal visible={!!selectedMsg} transparent animationType="fade" onRequestClose={() => setSelectedMsg(null)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setSelectedMsg(null)}>
          <View style={[styles.menuCard, { minWidth: 220 }]}>
            <View style={styles.menuHeader}>
              <Ionicons name="chatbubble-ellipses" size={18} color="#EEE" />
              <Text style={styles.menuHeaderTxt}>Ações da mensagem</Text>
            </View>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => selectedMsg && doDeleteMessage(selectedMsg)}
              disabled={busy}
              testID="dm-msg-delete"
            >
              <Ionicons name="trash" size={18} color="#F87171" />
              <Text style={[styles.menuItemTxt, { color: "#F87171" }]}>Apagar mensagem</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.menuItem, { borderTopWidth: 1, borderTopColor: "#1F1F1F" }]}
              onPress={() => setSelectedMsg(null)}
              disabled={busy}
            >
              <Ionicons name="close" size={18} color="#EEE" />
              <Text style={[styles.menuItemTxt, { color: "#EEE" }]}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
      {/* MODAL: Confirmação de apagar conversa completa */}
      <Modal visible={confirmThreadDelete} transparent animationType="fade" onRequestClose={() => !busy && setConfirmThreadDelete(false)}>
        <View style={styles.menuBackdrop}>
          <View style={[styles.menuCard, { minWidth: 280, padding: 18, gap: 12 }]}>
            <View style={{ alignItems: "center", gap: 8 }}>
              <Ionicons name="trash" size={44} color="#F87171" />
              <Text style={{ color: "#FFF", fontSize: 15, fontWeight: "900", textAlign: "center" }}>Apagar conversa?</Text>
              <Text style={{ color: "#AAA", fontSize: 12, textAlign: "center", lineHeight: 17 }}>
                Todas as mensagens desta conversa serão apagadas permanentemente para você e para o(a) outro(a) participante. Esta ação não pode ser desfeita.
              </Text>
            </View>
            <TouchableOpacity
              style={{ backgroundColor: "#F87171", paddingVertical: 12, borderRadius: 10, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8, opacity: busy ? 0.6 : 1 }}
              disabled={busy}
              onPress={confirmDeleteThreadNow}
              testID="dm-thread-delete-confirm"
            >
              {busy ? <ActivityIndicator color="#FFF" /> : (
                <>
                  <Ionicons name="trash" size={16} color="#FFF" />
                  <Text style={{ color: "#FFF", fontSize: 13, fontWeight: "900", letterSpacing: 0.5 }}>APAGAR TUDO</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={{ paddingVertical: 10, alignItems: "center" }}
              disabled={busy}
              onPress={() => setConfirmThreadDelete(false)}
            >
              <Text style={{ color: "#888", fontSize: 12, fontWeight: "800", letterSpacing: 0.3 }}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  headerAv: { width: 32, height: 32, borderRadius: 16 },
  headerName: { color: "#FFF", fontSize: 14, fontWeight: "800" },
  headerOnline: { fontSize: 10, fontWeight: "700" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 10 },
  emptyTxt: { color: "#DDD", fontSize: 14, fontWeight: "800" },
  emptyHint: { color: "#888", fontSize: 12 },
  row: { marginVertical: 3 },
  rowMe: { alignItems: "flex-end" },
  rowOther: { alignItems: "flex-start" },
  bubble: { maxWidth: "78%", padding: 10, borderRadius: 14 },
  bubbleMe: { backgroundColor: "#D4AF37", borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: "#1A1A1A", borderBottomLeftRadius: 4 },
  bubbleTxt: { fontSize: 14, lineHeight: 19 },
  attachImg: { width: 220, height: 220, borderRadius: 10, backgroundColor: "#111" },
  emojiPanel: { flexDirection: "row", flexWrap: "wrap", padding: 10, backgroundColor: "#0F0F0F", borderTopWidth: 1, borderTopColor: "#1A1A1A" },
  emojiBtn: { width: "10%", paddingVertical: 8, alignItems: "center" },
  emojiTxt: { fontSize: 22 },
  inputBar: { flexDirection: "row", alignItems: "flex-end", gap: 4, padding: 8, borderTopWidth: 1, borderTopColor: "#1A1A1A" },
  iconBtn: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  input: { flex: 1, backgroundColor: "#141414", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, color: "#EEE", fontSize: 14, maxHeight: 120, borderWidth: 1, borderColor: "#1F1F1F" },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#D4AF37", alignItems: "center", justifyContent: "center" },

  // Menu ⋮
  menuBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", alignItems: "center", padding: 24 },
  menuCard: { backgroundColor: "#0C0C0C", borderRadius: 12, borderWidth: 1, borderColor: "#1F1F1F", minWidth: 200, overflow: "hidden" },
  menuHeader: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderBottomWidth: 1, borderBottomColor: "#1F1F1F", backgroundColor: "#111" },
  menuHeaderTxt: { color: "#EEE", fontSize: 12, fontWeight: "900", letterSpacing: 0.5 },
  menuItem: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14 },
  menuItemTxt: { fontSize: 14, fontWeight: "800", letterSpacing: 0.3 },
});

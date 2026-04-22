import { useState, useEffect, useRef, useCallback } from "react";
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList,
  KeyboardAvoidingView, Platform, ActivityIndicator, Image, Alert, Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, CommunityMember, DMMessage } from "../../../src/api";
import { useGate } from "../../../src/gate";
import { TIERS } from "../../../src/theme";
import { pickCompressedImage } from "../../../src/imagepicker";

const EMOJIS = ["🔥", "💪", "❤️", "🙌", "👊", "✨", "🏋️", "🥶", "😂", "😎", "🎉", "💀", "🍏", "🥊", "🦾", "☀️", "🌙", "💯", "👁️", "🥵"];

export default function DMChat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { member } = useGate();
  const [partner, setPartner] = useState<CommunityMember | null>(null);
  const [msgs, setMsgs] = useState<DMMessage[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const listRef = useRef<FlatList>(null);

  const load = useCallback(async () => {
    if (!member || !id) return;
    try {
      const [p, m] = await Promise.all([api.communityMember(id), api.dmList(member.member_id, id)]);
      setPartner(p); setMsgs(m);
    } finally { setLoading(false); }
  }, [member, id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (msgs.length) setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80); }, [msgs]);

  useEffect(() => {
    if (!member || !id) return;
    const t = setInterval(async () => {
      try { const m = await api.dmList(member.member_id, id); setMsgs(m); } catch {}
    }, 5000);
    return () => clearInterval(t);
  }, [member, id]);

  const send = async (customText?: string) => {
    const payload = (customText || text).trim();
    if (!payload || !member || !id || sending) return;
    setSending(true); setText(""); setEmojiOpen(false);
    try {
      const m = await api.dmSend(member.member_id, id, payload);
      setMsgs(prev => [...prev, m]);
    } catch {}
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

  if (loading || !partner) return <View style={{ flex: 1, backgroundColor: "#050505", justifyContent: "center" }}><ActivityIndicator color="#FFF" /></View>;

  const tier = TIERS[partner.tier] || TIERS.silver;

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
              const imgMatch = /\[IMG\](data:[^\[]+)\[\/IMG\]/.exec(item.text);
              const imgUri = imgMatch?.[1];
              const cleanText = item.text.replace(/\[IMG\][^\[]+\[\/IMG\]/, "").trim();
              return (
                <View style={[styles.row, mine ? styles.rowMe : styles.rowOther]}>
                  <View style={[styles.bubble, mine ? styles.bubbleMe : styles.bubbleOther, imgUri && { padding: 4 }]}>
                    {imgUri && <Image source={{ uri: imgUri }} style={styles.attachImg} />}
                    {cleanText ? <Text style={[styles.bubbleTxt, { color: mine ? "#000" : "#EEE", marginTop: imgUri ? 6 : 0, paddingHorizontal: imgUri ? 6 : 0, paddingBottom: imgUri ? 4 : 0 }]}>{cleanText}</Text> : null}
                  </View>
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
          <TextInput style={styles.input} value={text} onChangeText={setText} placeholder={`Mensagem para ${partner.nickname}...`} placeholderTextColor="#666" multiline />
          <TouchableOpacity style={[styles.sendBtn, (!text.trim() || sending) && { opacity: 0.4 }]} disabled={!text.trim() || sending} onPress={() => send()} testID="dm-send">
            <Ionicons name="send" size={16} color="#000" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
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
});

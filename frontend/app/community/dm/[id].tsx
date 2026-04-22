import { useState, useEffect, useRef, useCallback } from "react";
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList,
  KeyboardAvoidingView, Platform, ActivityIndicator, Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, CommunityMember, DMMessage } from "../../../src/api";
import { useGate } from "../../../src/gate";
import { theme, TIERS } from "../../../src/theme";

export default function DMChat() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { member } = useGate();
  const [partner, setPartner] = useState<CommunityMember | null>(null);
  const [msgs, setMsgs] = useState<DMMessage[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
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

  // Poll every 5s for new messages
  useEffect(() => {
    if (!member || !id) return;
    const t = setInterval(async () => {
      try { const m = await api.dmList(member.member_id, id); setMsgs(m); } catch {}
    }, 5000);
    return () => clearInterval(t);
  }, [member, id]);

  const send = async () => {
    const t = text.trim();
    if (!t || !member || !id || sending) return;
    setSending(true); setText("");
    try {
      const m = await api.dmSend(member.member_id, id, t);
      setMsgs(prev => [...prev, m]);
    } catch {}
    finally { setSending(false); }
  };

  if (loading || !partner) {
    return <View style={{ flex: 1, backgroundColor: "#1A1A1A", justifyContent: "center" }}><ActivityIndicator color="#FFF" /></View>;
  }

  const tier = TIERS[partner.tier] || TIERS.black;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, backgroundColor: "#1A1A1A" }}>
      <Stack.Screen options={{
        headerStyle: { backgroundColor: "#1A1A1A" },
        headerTintColor: "#FFF",
        headerTitle: () => (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {partner.avatar_base64 ? (
              <Image source={{ uri: partner.avatar_base64 }} style={styles.headerAv} />
            ) : (
              <View style={[styles.headerAv, { backgroundColor: "#2A2A2A", alignItems: "center", justifyContent: "center" }]}>
                <Text style={{ color: "#EEE", fontWeight: "800" }}>{partner.nickname.charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <View>
              <Text style={styles.headerName}>{partner.nickname}</Text>
              <Text style={[styles.headerOnline, { color: partner.is_online ? "#4EE07F" : "#999" }]}>
                {partner.is_online ? "Online agora" : "Offline"}
              </Text>
            </View>
          </View>
        ),
      }} />
      <SafeAreaView style={{ flex: 1 }} edges={["bottom"]}>
        {msgs.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="chatbubble-ellipses-outline" size={48} color="#666" />
            <Text style={styles.emptyTxt}>Puxe conversa com {partner.nickname}!</Text>
            <Text style={styles.emptyHint}>Mande a primeira mensagem aqui.</Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={msgs}
            keyExtractor={(m, i) => m.dm_id || String(i)}
            contentContainerStyle={{ padding: 12 }}
            renderItem={({ item }) => {
              const mine = item.from_id === member?.member_id;
              return (
                <View style={[styles.row, mine ? styles.rowMe : styles.rowOther]}>
                  <View style={[styles.bubble, mine ? styles.bubbleMe : styles.bubbleOther]}>
                    <Text style={[styles.bubbleTxt, mine ? { color: "#000" } : { color: "#EEE" }]}>{item.text}</Text>
                  </View>
                </View>
              );
            }}
          />
        )}

        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder={`Mensagem para ${partner.nickname}...`}
            placeholderTextColor="#666"
            multiline
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!text.trim() || sending) && { opacity: 0.4 }]}
            disabled={!text.trim() || sending}
            onPress={send}
            testID="dm-send"
          >
            <Ionicons name="send" size={16} color="#000" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  headerAv: { width: 30, height: 30, borderRadius: 15 },
  headerName: { color: "#FFF", fontSize: 14, fontWeight: "800" },
  headerOnline: { fontSize: 10, fontWeight: "700" },

  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  emptyTxt: { color: "#DDD", fontSize: 14, fontWeight: "800", marginTop: 14 },
  emptyHint: { color: "#888", fontSize: 12, marginTop: 6 },

  row: { marginVertical: 3 },
  rowMe: { alignItems: "flex-end" },
  rowOther: { alignItems: "flex-start" },
  bubble: { maxWidth: "78%", padding: 10, borderRadius: 12 },
  bubbleMe: { backgroundColor: "#D4AF37" },
  bubbleOther: { backgroundColor: "#2A2A2A" },
  bubbleTxt: { fontSize: 14, lineHeight: 19 },

  inputBar: {
    flexDirection: "row", alignItems: "flex-end", gap: 6, padding: 8,
    borderTopWidth: 1, borderTopColor: "#222",
  },
  input: {
    flex: 1, backgroundColor: "#2A2A2A", borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 10,
    color: "#EEE", fontSize: 14, maxHeight: 120,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "#D4AF37", alignItems: "center", justifyContent: "center",
  },
});

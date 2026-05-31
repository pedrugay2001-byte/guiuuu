import { useState, useEffect, useCallback, useRef } from "react";
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList,
  KeyboardAvoidingView, Platform, ActivityIndicator, Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams } from "expo-router";
import { Ionicons } from "../../../src/icons";
import { api, Group, GroupMsg } from "../../../src/api";
import { useGate } from "../../../src/gate";

export default function GroupChat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { member } = useGate();
  const [group, setGroup] = useState<Group | null>(null);
  const [msgs, setMsgs] = useState<GroupMsg[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [groups, m] = await Promise.all([api.groupsList(), api.groupMessages(id)]);
      const g = groups.find(x => x.group_id === id) || null;
      setGroup(g); setMsgs(m);
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (msgs.length) setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80); }, [msgs]);

  // Poll new messages every 5s
  useEffect(() => {
    if (!id) return;
    const t = setInterval(async () => {
      try { const m = await api.groupMessages(id); setMsgs(m); } catch {}
    }, 5000);
    return () => clearInterval(t);
  }, [id]);

  const send = async () => {
    const t = text.trim();
    if (!t || !member || !id || sending) return;
    setSending(true); setText("");
    try {
      const msg = await api.groupSend(id, member.member_id, t);
      setMsgs(prev => [...prev, msg]);
    } catch {}
    finally { setSending(false); }
  };

  if (loading || !group) {
    return <View style={{ flex: 1, backgroundColor: "#1A1A1A", justifyContent: "center" }}><ActivityIndicator color="#FFF" /></View>;
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, backgroundColor: "#1A1A1A" }}>
      <Stack.Screen options={{
        headerStyle: { backgroundColor: "#1A1A1A" },
        headerTintColor: "#FFF",
        headerTitle: () => (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={[styles.gicon, { backgroundColor: group.color + "26", borderColor: group.color }]}>
              <Ionicons name={group.icon as any} size={16} color={group.color} />
            </View>
            <View>
              <Text style={styles.headerTitle}>{group.name}</Text>
              <Text style={styles.headerSub}>{group.members_count} participantes</Text>
            </View>
          </View>
        ),
      }} />
      <SafeAreaView style={{ flex: 1 }} edges={["bottom"]}>
        {msgs.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="chatbubbles-outline" size={48} color="#666" />
            <Text style={styles.emptyTxt}>Sem mensagens ainda.</Text>
            <Text style={styles.emptyHint}>Seja o primeiro a abrir a conversa em {group.name}.</Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={msgs}
            keyExtractor={(m, i) => m.gm_id || String(i)}
            contentContainerStyle={{ padding: 10 }}
            renderItem={({ item }) => {
              const mine = item.member_id === member?.member_id;
              return (
                <View style={[styles.row, mine ? styles.rowMe : styles.rowOther]}>
                  {!mine && (
                    <View style={styles.avatarWrap}>
                      {item.avatar_base64 ? (
                        <Image source={{ uri: item.avatar_base64 }} style={styles.avatar} />
                      ) : (
                        <View style={[styles.avatar, { alignItems: "center", justifyContent: "center", backgroundColor: "#333" }]}>
                          <Text style={{ color: "#DDD", fontSize: 10, fontWeight: "800" }}>{item.nickname.charAt(0).toUpperCase()}</Text>
                        </View>
                      )}
                    </View>
                  )}
                  <View style={{ maxWidth: "78%" }}>
                    {!mine && <Text style={[styles.senderName, { color: group.color }]}>{item.nickname}</Text>}
                    <View style={[styles.bubble, mine ? styles.bubbleMe : styles.bubbleOther]}>
                      <Text style={[styles.bubbleTxt, mine ? { color: "#000" } : { color: "#EEE" }]}>{item.text}</Text>
                    </View>
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
            placeholder={`Escrever em ${group.name}...`}
            placeholderTextColor="#666"
            multiline
          />
          <TouchableOpacity
            style={[styles.sendBtn, { backgroundColor: group.color }, (!text.trim() || sending) && { opacity: 0.45 }]}
            disabled={!text.trim() || sending}
            onPress={send}
            testID="group-send"
          >
            <Ionicons name="send" size={16} color="#000" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  gicon: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: "#EFEFEF", fontSize: 13, fontWeight: "800" },
  headerSub: { color: "#888", fontSize: 10 },

  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  emptyTxt: { color: "#DDD", fontSize: 14, fontWeight: "800", marginTop: 14 },
  emptyHint: { color: "#888", fontSize: 12, marginTop: 6, textAlign: "center" },

  row: { flexDirection: "row", gap: 6, marginVertical: 3 },
  rowMe: { justifyContent: "flex-end" },
  rowOther: { alignItems: "flex-end" },
  avatarWrap: {},
  avatar: { width: 26, height: 26, borderRadius: 13 },
  senderName: { fontSize: 10, fontWeight: "800", marginBottom: 2, letterSpacing: 0.5 },
  bubble: { padding: 10, borderRadius: 12 },
  bubbleMe: { backgroundColor: "#D4AF37", borderTopRightRadius: 4 },
  bubbleOther: { backgroundColor: "#2A2A2A", borderTopLeftRadius: 4 },
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
    alignItems: "center", justifyContent: "center",
  },
});

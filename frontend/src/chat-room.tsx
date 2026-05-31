import { useEffect, useRef, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList,
  KeyboardAvoidingView, Platform, ActivityIndicator, Image, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "./icons";
import { api, ChatMessage } from "./api";
import { theme } from "./theme";
import { pickImage, takePhoto, PickedAsset } from "./media";

type Mode = "member" | "support";

export default function ChatRoom({ mode }: { mode: Mode }) {
  const router = useRouter();
  const params = useLocalSearchParams<{ member_id?: string }>();
  const [memberId, setMemberId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [assets, setAssets] = useState<PickedAsset[]>([]);
  const [title, setTitle] = useState(mode === "support" ? "Conversa" : "Suporte BLACKSCLUB");
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    (async () => {
      let id: string | null = null;
      if (mode === "member") {
        const store = (await import("@react-native-async-storage/async-storage")).default;
        const gateRaw =
          (await store.getItem("blacksclub_member_v1")) ||
          (await store.getItem("farmaclube_member_v2"));
        if (gateRaw) {
          try { id = JSON.parse(gateRaw).member_id; } catch {}
        }
      } else {
        id = (params.member_id as string) || null;
      }
      setMemberId(id);
    })();
  }, [mode, params.member_id]);

  const load = useCallback(async () => {
    if (!memberId) return;
    try {
      const data = mode === "member"
        ? await api.chatMemberGet(memberId)
        : await api.chatSupportGet(memberId);
      setMessages(data);
      if (mode === "support" && data.length > 0) {
        setTitle(data[0].sender_name && data[0].sender === "member" ? data[0].sender_name : "Conversa");
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, [memberId, mode]);

  useEffect(() => { load(); }, [load]);

  // Poll every 3s
  useEffect(() => {
    if (!memberId) return;
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [memberId, load]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  const send = async () => {
    if ((!text.trim() && assets.length === 0) || !memberId) return;
    setSending(true);
    try {
      const atts = assets.map((a) => a.base64);
      if (mode === "member") await api.chatMemberSend(memberId, text.trim(), atts);
      else await api.chatSupportSend(memberId, text.trim(), atts);
      setText(""); setAssets([]);
      await load();
    } finally {
      setSending(false);
    }
  };

  const addImage = async () => {
    const a = await pickImage();
    if (a) setAssets((prev) => [...prev, a]);
  };
  const addPhoto = async () => {
    const a = await takePhoto();
    if (a) setAssets((prev) => [...prev, a]);
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.bg, justifyContent: "center" }}>
        <ActivityIndicator color={theme.colors.white} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
      keyboardVerticalOffset={80}
    >
      <Stack.Screen
        options={{
          title,
          headerBackTitle: "Voltar",
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => { if (router.canGoBack()) router.back(); else router.push("/(tabs)/home" as any); }}
              style={{ paddingHorizontal: 10, paddingVertical: 6, marginLeft: Platform.OS === "ios" ? 4 : 0 }}
              hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
              testID="chat-back"
            >
              <Ionicons name="chevron-back" size={26} color="#FFF" />
            </TouchableOpacity>
          ),
          headerRight: () => (
            <View style={styles.onlineRow}>
              <View style={styles.onlineDot} />
              <Text style={styles.onlineText}>online</Text>
            </View>
          ),
        }}
      />
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.message_id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const isMine =
            (mode === "member" && item.sender === "member") ||
            (mode === "support" && item.sender === "support");
          return (
            <View style={[styles.row, isMine ? styles.rowRight : styles.rowLeft]}>
              <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
                {!isMine && mode === "support" && (
                  <Text style={styles.senderLabel}>{item.sender_name}</Text>
                )}
                {item.attachments && item.attachments.length > 0 && (
                  <View style={styles.attGrid}>
                    {item.attachments.map((att, i) => (
                      <Image key={i} source={{ uri: att }} style={styles.attImg} resizeMode="cover" />
                    ))}
                  </View>
                )}
                {item.text ? (
                  <Text style={[styles.bubbleText, isMine && styles.bubbleTextMine]}>{item.text}</Text>
                ) : null}
                <Text style={[styles.timeText, isMine && styles.timeTextMine]}>
                  {new Date(item.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </Text>
              </View>
            </View>
          );
        }}
      />

      <SafeAreaView edges={["bottom"]} style={styles.inputBar}>
        {assets.length > 0 && (
          <View style={styles.preview}>
            {assets.map((a, i) => (
              <View key={i} style={styles.previewItem}>
                <Image source={{ uri: a.base64 }} style={styles.previewImg} />
                <TouchableOpacity
                  style={styles.previewRemove}
                  onPress={() => setAssets((prev) => prev.filter((_, idx) => idx !== i))}
                >
                  <Ionicons name="close" size={12} color={theme.colors.bg} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
        <View style={styles.inputRow}>
          <TouchableOpacity style={styles.attachIcon} onPress={addImage}>
            <Ionicons name="image" size={20} color={theme.colors.silver} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.attachIcon} onPress={addPhoto}>
            <Ionicons name="camera" size={20} color={theme.colors.silver} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.attachIcon} onPress={() => Alert.alert("Em breve", "Gravação de áudio será liberada na próxima atualização.")}>
            <Ionicons name="mic" size={20} color={theme.colors.textMuted} />
          </TouchableOpacity>
          <TextInput
            testID="chat-input"
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="Escrever mensagem..."
            placeholderTextColor={theme.colors.textMuted}
            multiline
          />
          <TouchableOpacity
            style={[styles.sendBtn, ((!text.trim() && assets.length === 0) || sending) && { opacity: 0.5 }]}
            onPress={send}
            disabled={(!text.trim() && assets.length === 0) || sending}
            testID="chat-send"
          >
            {sending ? (
              <ActivityIndicator color={theme.colors.bg} size="small" />
            ) : (
              <Ionicons name="send" size={18} color={theme.colors.bg} />
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  list: { padding: theme.spacing.md, gap: 8 },
  row: { flexDirection: "row", marginVertical: 3 },
  rowRight: { justifyContent: "flex-end" },
  rowLeft: { justifyContent: "flex-start" },
  bubble: {
    maxWidth: "82%", padding: 10, borderRadius: 10,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  bubbleTheirs: { backgroundColor: theme.colors.surface, borderTopLeftRadius: 2 },
  bubbleMine: {
    backgroundColor: theme.colors.white, borderColor: theme.colors.white, borderTopRightRadius: 2,
  },
  senderLabel: {
    color: theme.colors.silver, fontSize: 10, fontWeight: "700",
    letterSpacing: 1, marginBottom: 2,
  },
  bubbleText: { color: theme.colors.text, fontSize: 14, lineHeight: 20 },
  bubbleTextMine: { color: theme.colors.bg },
  timeText: { color: theme.colors.textMuted, fontSize: 10, marginTop: 4, alignSelf: "flex-end" },
  timeTextMine: { color: "rgba(0,0,0,0.55)" },
  inputBar: {
    padding: theme.spacing.sm,
    borderTopWidth: 1, borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.bg,
  },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: 6 },
  preview: { flexDirection: "row", gap: 6, paddingBottom: 6, paddingHorizontal: 4 },
  previewItem: { position: "relative" },
  previewImg: { width: 60, height: 60, borderRadius: 6, backgroundColor: theme.colors.surface },
  previewRemove: {
    position: "absolute", top: -4, right: -4,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: theme.colors.white, alignItems: "center", justifyContent: "center",
  },
  attachIcon: {
    width: 36, height: 44, alignItems: "center", justifyContent: "center",
  },
  attGrid: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginBottom: 6 },
  attImg: { width: 120, height: 120, borderRadius: 8, backgroundColor: theme.colors.surfaceElevated },
  input: {
    flex: 1, backgroundColor: theme.colors.surface,
    borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10,
    color: theme.colors.text, fontSize: 14, maxHeight: 100,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: theme.colors.white,
    alignItems: "center", justifyContent: "center",
  },
  onlineRow: { flexDirection: "row", alignItems: "center", gap: 6, marginRight: 8 },
  onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#4EE07F" },
  onlineText: { color: theme.colors.silver, fontSize: 11, fontWeight: "600" },
});

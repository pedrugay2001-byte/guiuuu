import { useState, useEffect, useRef, useCallback } from "react";
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../src/api";
import { useGate } from "../../src/gate";
import { theme } from "../../src/theme";

type Msg = { sender: "member" | "ai"; text: string; created_at?: string };
type Specialist = {
  id: string; name: string; title: string; tagline: string;
  description: string; color: string; avatar: string; starters: string[];
};

export default function SpecialistChat() {
  const router = useRouter();
  const { specialist: specialistId } = useLocalSearchParams<{ specialist: string }>();
  const { member } = useGate();

  const [specialist, setSpecialist] = useState<Specialist | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingInit, setLoadingInit] = useState(true);
  const listRef = useRef<FlatList>(null);

  const load = useCallback(async () => {
    if (!member || !specialistId) return;
    try {
      const [all, hist] = await Promise.all([
        api.aiSpecialists(),
        api.aiHistory(member.member_id, specialistId),
      ]);
      const s = all.find((x) => x.id === specialistId) || null;
      setSpecialist(s);
      setMessages(hist);
    } catch {}
    finally { setLoadingInit(false); }
  }, [member, specialistId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages]);

  const send = async (t?: string) => {
    const content = (t || text).trim();
    if (!content || !member || !specialist || sending) return;
    setText("");
    setMessages((prev) => [...prev, { sender: "member", text: content }]);
    setSending(true);
    try {
      const res = await api.aiChat(member.member_id, content, specialist.id);
      setMessages((prev) => [...prev, { sender: "ai", text: res.reply }]);
    } catch (e: any) {
      setMessages((prev) => [...prev, {
        sender: "ai",
        text: "(Não consegui responder agora. Tente novamente em alguns instantes.)",
      }]);
    } finally { setSending(false); }
  };

  const clear = () => {
    if (!member || !specialist) return;
    Alert.alert("Limpar conversa", `Apagar todo o histórico com ${specialist.name}?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Limpar", style: "destructive",
        onPress: async () => {
          try { await api.aiClear(member.member_id, specialist.id); setMessages([]); } catch {}
        },
      },
    ]);
  };

  const unsupported = () =>
    Alert.alert("Em breve", "Áudio (voz-para-texto) e análise de imagens/documentos serão liberados na próxima atualização.");

  const accent = specialist?.color || "#7FD7E5";

  if (loadingInit) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.bg, justifyContent: "center" }}>
        <Stack.Screen options={{ title: "" }} />
        <ActivityIndicator color={theme.colors.white} />
      </View>
    );
  }

  if (!specialist) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.bg, justifyContent: "center", alignItems: "center", padding: 24 }}>
        <Stack.Screen options={{ title: "BLACK AI" }} />
        <Text style={{ color: theme.colors.white, fontSize: 16, fontWeight: "700" }}>Especialista não encontrado.</Text>
        <TouchableOpacity style={{ marginTop: 16 }} onPress={() => router.back()}>
          <Text style={{ color: "#7FD7E5", fontSize: 13, fontWeight: "800" }}>VOLTAR</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
    >
      <Stack.Screen
        options={{
          headerStyle: { backgroundColor: theme.colors.bg },
          headerTintColor: theme.colors.white,
          headerTitle: () => (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{ position: "relative" }}>
                <Image source={{ uri: specialist.avatar }} style={styles.headerAvatar} />
                <View style={[styles.headerAvatarRing, { borderColor: accent }]} />
                <View style={[styles.headerOnlineDot, { backgroundColor: accent }]} />
              </View>
              <View>
                <Text style={styles.headerName}>{specialist.name}</Text>
                <Text style={[styles.headerTitle, { color: accent }]}>{specialist.title.toUpperCase()}</Text>
              </View>
            </View>
          ),
          headerRight: () => messages.length > 0 ? (
            <TouchableOpacity onPress={clear} style={{ marginRight: 14 }}>
              <Ionicons name="refresh" size={18} color={theme.colors.white} />
            </TouchableOpacity>
          ) : null,
        }}
      />
      <SafeAreaView style={{ flex: 1 }} edges={["bottom"]}>
        {messages.length === 0 ? (
          <View style={styles.empty}>
            <View style={[styles.emptyAvatarRing, { borderColor: accent }]}>
              <Image source={{ uri: specialist.avatar }} style={styles.emptyAvatar} />
            </View>
            <Text style={styles.emptyName}>{specialist.name}</Text>
            <Text style={[styles.emptyTitle, { color: accent }]}>{specialist.title.toUpperCase()}</Text>
            <Text style={styles.emptyTagline}>{specialist.tagline}</Text>
            <Text style={styles.emptyDesc}>{specialist.description}</Text>

            <Text style={styles.starterLabel}>COMEÇAR COM UMA DÚVIDA</Text>
            <View style={styles.starters}>
              {specialist.starters.map((s, i) => (
                <TouchableOpacity
                  key={i}
                  style={[styles.starter, { borderLeftColor: accent, borderLeftWidth: 2 }]}
                  onPress={() => send(s)}
                >
                  <Text style={styles.starterText}>{s}</Text>
                  <Ionicons name="arrow-forward" size={13} color={accent} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(_, i) => String(i)}
            contentContainerStyle={{ padding: theme.spacing.md, paddingBottom: 12 }}
            renderItem={({ item }) => {
              const isAi = item.sender === "ai";
              return (
                <View style={[styles.row, isAi ? styles.rowAi : styles.rowMe]}>
                  {isAi && (
                    <View style={[styles.aiAvatarWrap, { borderColor: accent }]}>
                      <Image source={{ uri: specialist.avatar }} style={styles.aiAvatar} />
                    </View>
                  )}
                  <View style={[
                    styles.bubble,
                    isAi
                      ? [styles.bubbleAi, { borderColor: theme.colors.border }]
                      : [styles.bubbleMe, { backgroundColor: theme.colors.white }],
                  ]}>
                    <Text style={[styles.bubbleText, isAi ? styles.bubbleTextAi : styles.bubbleTextMe]}>
                      {item.text}
                    </Text>
                  </View>
                </View>
              );
            }}
          />
        )}

        {sending && (
          <View style={styles.typing}>
            <View style={[styles.aiAvatarWrap, { borderColor: accent }]}>
              <Image source={{ uri: specialist.avatar }} style={styles.aiAvatar} />
            </View>
            <Text style={styles.typingText}>{specialist.name.split(" ").slice(-1)[0]} está digitando...</Text>
            <ActivityIndicator color={accent} size="small" />
          </View>
        )}

        <View style={styles.inputBar}>
          <TouchableOpacity style={styles.iconBtn} onPress={unsupported}>
            <Ionicons name="attach" size={20} color={theme.colors.textMuted} />
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder={`Pergunte a ${specialist.name.split(" ")[0]}...`}
            placeholderTextColor={theme.colors.textMuted}
            multiline
          />
          <TouchableOpacity style={styles.iconBtn} onPress={unsupported}>
            <Ionicons name="mic" size={20} color={theme.colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sendBtn, { backgroundColor: accent }, (!text.trim() || sending) && { opacity: 0.45 }]}
            onPress={() => send()}
            disabled={!text.trim() || sending}
          >
            <Ionicons name="send" size={16} color={theme.colors.bg} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  headerAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: theme.colors.surfaceElevated },
  headerAvatarRing: { ...StyleSheet.absoluteFillObject, borderRadius: 17, borderWidth: 1.5, opacity: 0.6 },
  headerOnlineDot: {
    position: "absolute", right: -1, bottom: -1,
    width: 9, height: 9, borderRadius: 4.5,
    borderWidth: 1.5, borderColor: theme.colors.bg,
  },
  headerName: { color: theme.colors.white, fontSize: 14, fontWeight: "800" },
  headerTitle: { fontSize: 9, fontWeight: "900", letterSpacing: 1.8, marginTop: 1 },

  empty: { flex: 1, padding: theme.spacing.lg, alignItems: "center" },
  emptyAvatarRing: {
    width: 96, height: 96, borderRadius: 48, borderWidth: 2, padding: 3,
    alignItems: "center", justifyContent: "center",
    marginTop: 20, marginBottom: 14,
  },
  emptyAvatar: { width: 86, height: 86, borderRadius: 43 },
  emptyName: { color: theme.colors.white, fontSize: 20, fontWeight: "900", letterSpacing: 0.3 },
  emptyTitle: { fontSize: 10, fontWeight: "900", letterSpacing: 2.5, marginTop: 4 },
  emptyTagline: { color: theme.colors.silver, fontSize: 13, marginTop: 10, fontWeight: "600" },
  emptyDesc: {
    color: theme.colors.textMuted, fontSize: 12, lineHeight: 18,
    textAlign: "center", marginTop: 8, marginBottom: 28, paddingHorizontal: 6,
  },
  starterLabel: {
    alignSelf: "flex-start",
    color: theme.colors.silver, fontSize: 10, fontWeight: "800", letterSpacing: 2, marginBottom: 10,
  },
  starters: { gap: 8, alignSelf: "stretch" },
  starter: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
    padding: 13, borderRadius: 10,
  },
  starterText: { color: theme.colors.text, fontSize: 13, flex: 1 },

  row: { flexDirection: "row", marginBottom: 10, gap: 8 },
  rowAi: { justifyContent: "flex-start", alignItems: "flex-end" },
  rowMe: { justifyContent: "flex-end" },
  aiAvatarWrap: {
    width: 28, height: 28, borderRadius: 14, borderWidth: 1.5,
    alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  aiAvatar: { width: 25, height: 25, borderRadius: 12.5 },
  bubble: { maxWidth: "78%", padding: 12, borderRadius: 14 },
  bubbleAi: { backgroundColor: theme.colors.surface, borderWidth: 1, borderTopLeftRadius: 4 },
  bubbleMe: { borderTopRightRadius: 4 },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  bubbleTextAi: { color: theme.colors.text },
  bubbleTextMe: { color: theme.colors.bg, fontWeight: "500" },

  typing: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 20, paddingVertical: 10,
  },
  typingText: { color: theme.colors.textMuted, fontSize: 12, flex: 1 },

  inputBar: {
    flexDirection: "row", alignItems: "flex-end", gap: 4, padding: theme.spacing.sm,
    borderTopWidth: 1, borderTopColor: theme.colors.border,
  },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  input: {
    flex: 1, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10,
    color: theme.colors.text, fontSize: 14, maxHeight: 120,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: "center", justifyContent: "center",
  },
});

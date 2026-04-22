import { useState, useEffect, useRef, useCallback } from "react";
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../src/api";
import { useGate } from "../src/gate";
import { theme } from "../src/theme";

type Msg = { sender: "member" | "ai"; text: string; created_at?: string };

const STARTERS = [
  "Qual a diferença entre Tirzepatida e Retatrutida?",
  "Como funciona o BPC-157?",
  "O que é HGH e para que serve?",
  "Whey isolado vale a pena para hipertrofia?",
];

export default function BlackAI() {
  const router = useRouter();
  const { member } = useGate();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);

  const load = useCallback(async () => {
    if (!member) return;
    try {
      const hist = await api.aiHistory(member.member_id);
      setMessages(hist);
    } catch {}
  }, [member]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100); }, [messages]);

  const send = async (t?: string) => {
    const content = (t || text).trim();
    if (!content || !member || sending) return;
    setText("");
    setMessages((prev) => [...prev, { sender: "member", text: content }]);
    setSending(true);
    try {
      const res = await api.aiChat(member.member_id, content);
      setMessages((prev) => [...prev, { sender: "ai", text: res.reply }]);
    } catch (e: any) {
      setMessages((prev) => [...prev, { sender: "ai", text: "(Não consegui responder agora. Tente novamente em alguns instantes.)" }]);
    } finally { setSending(false); }
  };

  const clear = () => {
    if (!member) return;
    Alert.alert("Limpar conversa", "Apagar todo o histórico com a BLACK AI?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Limpar", style: "destructive", onPress: async () => {
          try { await api.aiClear(member.member_id); setMessages([]); } catch {}
        } },
    ]);
  };

  const unsupported = () =>
    Alert.alert("Em breve", "Áudio (transcrição automática) e análise de imagens/documentos serão liberados na próxima atualização.");

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
    >
      <Stack.Screen
        options={{
          title: "BLACK AI",
          headerRight: () => messages.length > 0 ? (
            <TouchableOpacity onPress={clear} style={{ marginRight: 14 }}>
              <Ionicons name="refresh" size={20} color={theme.colors.white} />
            </TouchableOpacity>
          ) : null,
        }}
      />
      <SafeAreaView style={{ flex: 1 }} edges={["bottom"]}>
        {messages.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Ionicons name="sparkles" size={26} color="#7FD7E5" />
            </View>
            <Text style={styles.emptyKicker}>BLACK AI</Text>
            <Text style={styles.emptyTitle}>SUA ESPECIALISTA{"\n"}PRIVADA.</Text>
            <Text style={styles.emptySub}>
              Sou treinada para te orientar sobre emagrecedores, peptídeos, hormônios, musculacão, suplementação e performance. Linguagem técnica clara, nunca substituo avaliação médica.
            </Text>
            <Text style={styles.starterLabel}>COMEÇAR COM UMA DÚVIDA</Text>
            <View style={styles.starters}>
              {STARTERS.map((s, i) => (
                <TouchableOpacity key={i} style={styles.starter} onPress={() => send(s)}>
                  <Text style={styles.starterText}>{s}</Text>
                  <Ionicons name="arrow-forward" size={14} color={theme.colors.silver} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(_, i) => String(i)}
            contentContainerStyle={{ padding: theme.spacing.md, paddingBottom: 20 }}
            renderItem={({ item }) => {
              const isAi = item.sender === "ai";
              return (
                <View style={[styles.row, isAi ? styles.rowAi : styles.rowMe]}>
                  {isAi && (
                    <View style={styles.aiAvatar}><Ionicons name="sparkles" size={13} color="#7FD7E5" /></View>
                  )}
                  <View style={[styles.bubble, isAi ? styles.bubbleAi : styles.bubbleMe]}>
                    <Text style={[styles.bubbleText, isAi ? styles.bubbleTextAi : styles.bubbleTextMe]}>{item.text}</Text>
                  </View>
                </View>
              );
            }}
          />
        )}

        {sending && (
          <View style={styles.typing}>
            <View style={styles.aiAvatar}><Ionicons name="sparkles" size={13} color="#7FD7E5" /></View>
            <Text style={styles.typingText}>BLACK AI pensando...</Text>
            <ActivityIndicator color="#7FD7E5" size="small" />
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
            placeholder="Pergunte à BLACK AI..."
            placeholderTextColor={theme.colors.textMuted}
            multiline
          />
          <TouchableOpacity style={styles.iconBtn} onPress={unsupported}>
            <Ionicons name="mic" size={20} color={theme.colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sendBtn, (!text.trim() || sending) && { opacity: 0.5 }]}
            onPress={() => send()}
            disabled={!text.trim() || sending}
          >
            <Ionicons name="send" size={17} color={theme.colors.bg} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  empty: { flex: 1, padding: theme.spacing.lg, justifyContent: "center" },
  emptyIcon: {
    width: 60, height: 60, borderRadius: 30,
    borderWidth: 1, borderColor: "#7FD7E5",
    backgroundColor: "rgba(127,215,229,0.08)",
    alignItems: "center", justifyContent: "center", marginBottom: 16,
  },
  emptyKicker: { color: "#7FD7E5", fontSize: 11, fontWeight: "800", letterSpacing: 4 },
  emptyTitle: {
    color: theme.colors.white, fontSize: 34, fontWeight: "900",
    letterSpacing: -1.2, lineHeight: 36, marginTop: 6, textTransform: "uppercase",
  },
  emptySub: { color: theme.colors.textMuted, fontSize: 13, lineHeight: 20, marginTop: 10, marginBottom: 28 },
  starterLabel: { color: theme.colors.silver, fontSize: 10, fontWeight: "800", letterSpacing: 2, marginBottom: 10 },
  starters: { gap: 8 },
  starter: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
    padding: 14, borderRadius: 10,
  },
  starterText: { color: theme.colors.text, fontSize: 13, flex: 1 },
  row: { flexDirection: "row", marginBottom: 10, gap: 8 },
  rowAi: { justifyContent: "flex-start", alignItems: "flex-start" },
  rowMe: { justifyContent: "flex-end" },
  aiAvatar: {
    width: 26, height: 26, borderRadius: 13,
    borderWidth: 1, borderColor: "#7FD7E5",
    backgroundColor: "rgba(127,215,229,0.1)",
    alignItems: "center", justifyContent: "center", marginTop: 2,
  },
  bubble: { maxWidth: "80%", padding: 12, borderRadius: 14 },
  bubbleAi: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderTopLeftRadius: 4 },
  bubbleMe: { backgroundColor: theme.colors.white, borderTopRightRadius: 4 },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  bubbleTextAi: { color: theme.colors.text },
  bubbleTextMe: { color: theme.colors.bg },
  typing: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, paddingHorizontal: 20 },
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
    backgroundColor: theme.colors.white, alignItems: "center", justifyContent: "center",
  },
});

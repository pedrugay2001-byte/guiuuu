import { useState, useEffect, useRef, useCallback } from "react";
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Image, ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { api } from "../../src/api";
import { useGate } from "../../src/gate";
import { theme } from "../../src/theme";

type Msg = { sender: "member" | "ai"; text: string; created_at?: string; has_image?: boolean; image_preview?: string };
type Specialist = {
  id: string; name: string; title: string; tagline: string;
  description: string; color: string; avatar: string; starters: string[];
  topics?: { title: string; body: string }[];
};

function TypingBubble({ color }: { color: string }) {
  return (
    <View style={[styles.bubble, styles.bubbleAi, { borderColor: theme.colors.border, flexDirection: "row", gap: 4, alignItems: "center" }]}>
      <View style={[styles.typingDot, { backgroundColor: color }]} />
      <View style={[styles.typingDot, { backgroundColor: color, opacity: 0.7 }]} />
      <View style={[styles.typingDot, { backgroundColor: color, opacity: 0.4 }]} />
    </View>
  );
}

export default function SpecialistChat() {
  const router = useRouter();
  const { specialist: specialistId } = useLocalSearchParams<{ specialist: string }>();
  const { member } = useGate();

  const [specialist, setSpecialist] = useState<Specialist | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [typing, setTyping] = useState(false);
  const [loadingInit, setLoadingInit] = useState(true);
  const [tab, setTab] = useState<"chat" | "topics">("chat");
  const [pendingImage, setPendingImage] = useState<string | null>(null); // data-url
  const [listening, setListening] = useState(false);
  const listRef = useRef<FlatList>(null);
  const recognitionRef = useRef<any>(null);

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
    if (messages.length > 0 && tab === "chat") {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages, tab]);

  // Type-out the latest AI message progressively for a "typing" effect
  const typeOut = (fullText: string, onDone: () => void) => {
    setTyping(true);
    let i = 0;
    // start with an empty AI message we'll grow
    setMessages((prev) => [...prev, { sender: "ai", text: "" }]);
    const tick = () => {
      if (i >= fullText.length) {
        setTyping(false);
        onDone();
        return;
      }
      // add a small chunk each tick (2-4 chars) to look natural
      const chunk = fullText.slice(i, i + 3);
      i += 3;
      setMessages((prev) => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (last && last.sender === "ai") {
          copy[copy.length - 1] = { ...last, text: last.text + chunk };
        }
        return copy;
      });
      // variable speed
      setTimeout(tick, 16);
    };
    setTimeout(tick, 350);
  };

  const send = async (t?: string, image?: string | null) => {
    const content = (t ?? text).trim();
    const img = image !== undefined ? image : pendingImage;
    if ((!content && !img) || !member || !specialist || sending) return;
    setText("");
    setPendingImage(null);
    setMessages((prev) => [...prev, { sender: "member", text: content || "[imagem]", has_image: !!img, image_preview: img || undefined }]);
    setSending(true);
    try {
      const res = await api.aiChat(member.member_id, content || "", specialist.id, img || undefined);
      // Use typing effect
      typeOut(res.reply, () => {});
    } catch (e: any) {
      setMessages((prev) => [...prev, {
        sender: "ai",
        text: "(Não consegui responder agora. Tenta de novo em alguns instantes.)",
      }]);
    } finally { setSending(false); }
  };

  const pickImage = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permissão necessária", "Permita acesso à galeria.");
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images" as any],
        quality: 0.7,
        base64: true,
      });
      if (res.canceled || !res.assets || res.assets.length === 0) return;
      const a = res.assets[0];
      const b64 = a.base64 ? `data:image/jpeg;base64,${a.base64}` : a.uri;
      setPendingImage(b64);
    } catch (e: any) {
      Alert.alert("Erro", e.message || "Não foi possível selecionar a imagem");
    }
  };

  // Voice to text using Web Speech API when available (great on Chrome/desktop/mobile web)
  const toggleMic = () => {
    if (Platform.OS !== "web") {
      Alert.alert("Microfone em beta", "No app nativo a gravação de voz estará liberada na próxima atualização. Por enquanto, digite sua pergunta.");
      return;
    }
    // @ts-ignore window
    const SR = (typeof window !== "undefined") && ((window as any).webkitSpeechRecognition || (window as any).SpeechRecognition);
    if (!SR) {
      Alert.alert("Voz indisponível", "Seu navegador não suporta reconhecimento de voz. Tente no Chrome.");
      return;
    }
    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }
    const rec = new SR();
    rec.lang = "pt-BR";
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (ev: any) => {
      let finalText = "";
      for (let i = ev.resultIndex; i < ev.results.length; ++i) {
        finalText += ev.results[i][0].transcript;
      }
      setText((prev) => (prev ? prev + " " : "") + finalText.trim());
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  };

  const clear = () => {
    if (!member || !specialist) return;
    Alert.alert("Limpar conversa", `Apagar histórico com ${specialist.name.split(" ").slice(-1)[0]}?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Limpar", style: "destructive",
        onPress: async () => {
          try { await api.aiClear(member.member_id, specialist.id); setMessages([]); } catch {}
        },
      },
    ]);
  };

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

  const emptyChat = messages.length === 0;

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
          headerRight: () => messages.length > 0 && tab === "chat" ? (
            <TouchableOpacity onPress={clear} style={{ marginRight: 14 }}>
              <Ionicons name="refresh" size={18} color={theme.colors.white} />
            </TouchableOpacity>
          ) : null,
        }}
      />
      <SafeAreaView style={{ flex: 1 }} edges={["bottom"]}>
        {/* Inner tabs */}
        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tabBtn, tab === "chat" && { borderBottomColor: accent }]}
            onPress={() => setTab("chat")}
          >
            <Ionicons name="chatbubble-ellipses" size={14} color={tab === "chat" ? accent : theme.colors.textMuted} />
            <Text style={[styles.tabTxt, tab === "chat" && { color: accent }]}>CONVERSAR</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, tab === "topics" && { borderBottomColor: accent }]}
            onPress={() => setTab("topics")}
          >
            <Ionicons name="bulb" size={14} color={tab === "topics" ? accent : theme.colors.textMuted} />
            <Text style={[styles.tabTxt, tab === "topics" && { color: accent }]}>PERGUNTAS & CURIOSIDADES</Text>
          </TouchableOpacity>
        </View>

        {tab === "topics" ? (
          <ScrollView contentContainerStyle={{ padding: theme.spacing.md, paddingBottom: 40 }}>
            <View style={styles.introRow}>
              <View style={[styles.emptyAvatarRing, { borderColor: accent, width: 64, height: 64, borderRadius: 32, marginTop: 0, marginBottom: 0 }]}>
                <Image source={{ uri: specialist.avatar }} style={{ width: 56, height: 56, borderRadius: 28 }} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.emptyTitle, { color: accent, alignSelf: "flex-start" }]}>{specialist.title.toUpperCase()}</Text>
                <Text style={styles.emptyName}>{specialist.name}</Text>
                <Text style={styles.emptyTagline}>{specialist.tagline}</Text>
              </View>
            </View>

            <Text style={[styles.starterLabel, { marginTop: 16 }]}>CURIOSIDADES DE HOJE</Text>
            <View style={{ gap: 10 }}>
              {(specialist.topics || []).map((t, i) => (
                <View key={i} style={[styles.topicCard, { borderLeftColor: accent }]}>
                  <Text style={[styles.topicTitle, { color: accent }]}>{t.title}</Text>
                  <Text style={styles.topicBody}>{t.body}</Text>
                </View>
              ))}
            </View>

            <Text style={[styles.starterLabel, { marginTop: 22 }]}>PERGUNTAS COMUNS</Text>
            <View style={{ gap: 8 }}>
              {specialist.starters.map((s, i) => (
                <TouchableOpacity
                  key={i}
                  style={[styles.starter, { borderLeftColor: accent, borderLeftWidth: 2 }]}
                  onPress={() => { setTab("chat"); send(s); }}
                >
                  <Text style={styles.starterText}>{s}</Text>
                  <Ionicons name="arrow-forward" size={13} color={accent} />
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        ) : emptyChat ? (
          <ScrollView contentContainerStyle={styles.empty}>
            <View style={[styles.emptyAvatarRing, { borderColor: accent }]}>
              <Image source={{ uri: specialist.avatar }} style={styles.emptyAvatar} />
            </View>
            <Text style={styles.emptyName}>{specialist.name}</Text>
            <Text style={[styles.emptyTitle, { color: accent }]}>{specialist.title.toUpperCase()}</Text>
            <Text style={styles.emptyTagline}>{specialist.tagline}</Text>
            <Text style={styles.emptyDesc}>
              Mande sua dúvida natural, como se estivesse falando comigo pessoalmente. Pode enviar foto também, se ajudar.
            </Text>
            <TouchableOpacity
              style={[styles.seeTopics, { borderColor: accent }]}
              onPress={() => setTab("topics")}
            >
              <Ionicons name="bulb-outline" size={14} color={accent} />
              <Text style={[styles.seeTopicsTxt, { color: accent }]}>VER PERGUNTAS & CURIOSIDADES</Text>
            </TouchableOpacity>
          </ScrollView>
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
                    {item.image_preview && (
                      <Image source={{ uri: item.image_preview }} style={styles.msgImage} />
                    )}
                    {!!item.text && (
                      <Text style={[styles.bubbleText, isAi ? styles.bubbleTextAi : styles.bubbleTextMe]}>
                        {item.text}{isAi && typing && item === messages[messages.length - 1] ? "█" : ""}
                      </Text>
                    )}
                  </View>
                </View>
              );
            }}
          />
        )}

        {tab === "chat" && sending && !typing && (
          <View style={styles.typing}>
            <View style={[styles.aiAvatarWrap, { borderColor: accent }]}>
              <Image source={{ uri: specialist.avatar }} style={styles.aiAvatar} />
            </View>
            <Text style={styles.typingText}>{specialist.name.split(" ").slice(-1)[0]} está digitando...</Text>
            <ActivityIndicator color={accent} size="small" />
          </View>
        )}

        {tab === "chat" && pendingImage && (
          <View style={styles.pendingBar}>
            <Image source={{ uri: pendingImage }} style={styles.pendingImg} />
            <Text style={styles.pendingTxt}>Imagem pronta pra enviar</Text>
            <TouchableOpacity onPress={() => setPendingImage(null)} style={{ padding: 6 }}>
              <Ionicons name="close" size={18} color={theme.colors.white} />
            </TouchableOpacity>
          </View>
        )}

        {tab === "chat" && (
          <View style={styles.inputBar}>
            <TouchableOpacity style={styles.iconBtn} onPress={pickImage} testID="ai-attach">
              <Ionicons name="image" size={20} color={theme.colors.textMuted} />
            </TouchableOpacity>
            <TextInput
              style={styles.input}
              value={text}
              onChangeText={setText}
              placeholder={`Pergunte ao ${specialist.name.split(" ")[1] || specialist.name.split(" ")[0]}...`}
              placeholderTextColor={theme.colors.textMuted}
              multiline
            />
            <TouchableOpacity style={styles.iconBtn} onPress={toggleMic} testID="ai-mic">
              <Ionicons name={listening ? "mic" : "mic-outline"} size={20} color={listening ? "#FF4E4E" : theme.colors.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sendBtn, { backgroundColor: accent }, ((!text.trim() && !pendingImage) || sending) && { opacity: 0.45 }]}
              onPress={() => send()}
              disabled={(!text.trim() && !pendingImage) || sending}
              testID="ai-send"
            >
              <Ionicons name="send" size={16} color={theme.colors.bg} />
            </TouchableOpacity>
          </View>
        )}
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

  tabs: {
    flexDirection: "row",
    borderBottomWidth: 1, borderBottomColor: theme.colors.border,
  },
  tabBtn: {
    flex: 1,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    paddingVertical: 12,
    borderBottomWidth: 2, borderBottomColor: "transparent",
  },
  tabTxt: { color: theme.colors.textMuted, fontSize: 10, fontWeight: "900", letterSpacing: 1.5 },

  empty: { padding: theme.spacing.lg, alignItems: "center" },
  introRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  emptyAvatarRing: {
    width: 96, height: 96, borderRadius: 48, borderWidth: 2, padding: 3,
    alignItems: "center", justifyContent: "center",
    marginTop: 20, marginBottom: 14,
  },
  emptyAvatar: { width: 86, height: 86, borderRadius: 43 },
  emptyName: { color: theme.colors.white, fontSize: 20, fontWeight: "900", letterSpacing: 0.3, textAlign: "center" },
  emptyTitle: { fontSize: 10, fontWeight: "900", letterSpacing: 2.5, marginTop: 4, alignSelf: "center" },
  emptyTagline: { color: theme.colors.silver, fontSize: 13, marginTop: 10, fontWeight: "600", textAlign: "center" },
  emptyDesc: {
    color: theme.colors.textMuted, fontSize: 12, lineHeight: 18,
    textAlign: "center", marginTop: 10, marginBottom: 18, paddingHorizontal: 6,
  },
  seeTopics: {
    flexDirection: "row", gap: 6, alignItems: "center",
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 20, borderWidth: 1,
  },
  seeTopicsTxt: { fontSize: 11, fontWeight: "900", letterSpacing: 1.5 },

  topicCard: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1, borderColor: theme.colors.border,
    borderLeftWidth: 3,
    padding: 14, borderRadius: 10,
  },
  topicTitle: { fontSize: 12, fontWeight: "900", letterSpacing: 1 },
  topicBody: { color: theme.colors.text, fontSize: 13, lineHeight: 19, marginTop: 6 },

  starterLabel: {
    color: theme.colors.silver, fontSize: 10, fontWeight: "800", letterSpacing: 2, marginBottom: 10,
  },
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
  msgImage: { width: 200, height: 160, borderRadius: 10, marginBottom: 6 },

  typing: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 20, paddingVertical: 10,
  },
  typingText: { color: theme.colors.textMuted, fontSize: 12, flex: 1 },
  typingDot: { width: 7, height: 7, borderRadius: 3.5 },

  pendingBar: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: theme.colors.surfaceElevated,
    paddingVertical: 8, paddingHorizontal: 12,
    borderTopWidth: 1, borderTopColor: theme.colors.border,
  },
  pendingImg: { width: 40, height: 40, borderRadius: 6 },
  pendingTxt: { color: theme.colors.text, fontSize: 12, flex: 1 },

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

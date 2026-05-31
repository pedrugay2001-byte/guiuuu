import { useState } from "react";
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "../src/icons";
import { useCallback } from "react";
import { api } from "../src/api";
import { useGate } from "../src/gate";
import { theme } from "../src/theme";
import { pickImage, takePhoto, PickedAsset } from "../src/media";
import ScreenHeader from "../src/screen-header";

export default function QuoteScreen() {
  const router = useRouter();
  const { member } = useGate();
  const [description, setDescription] = useState("");
  const [budget, setBudget] = useState("");
  const [assets, setAssets] = useState<PickedAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [quotes, setQuotes] = useState<any[]>([]);

  const loadHistory = useCallback(async () => {
    if (!member) return;
    try { setQuotes(await api.memberQuotes(member.member_id)); } catch {}
  }, [member]);

  useFocusEffect(useCallback(() => { loadHistory(); }, [loadHistory]));

  const addImage = async () => {
    const a = await pickImage();
    if (a) setAssets((prev) => [...prev, a]);
  };
  const addPhoto = async () => {
    const a = await takePhoto();
    if (a) setAssets((prev) => [...prev, a]);
  };
  const removeAsset = (i: number) => setAssets((prev) => prev.filter((_, idx) => idx !== i));

  const submit = async () => {
    if (!member) return;
    if (description.trim().length < 10) {
      Alert.alert("Descrição curta", "Descreva o produto/serviço com mais detalhes.");
      return;
    }
    setLoading(true);
    try {
      await api.requestQuote({
        member_id: member.member_id,
        description: description.trim(),
        budget: budget.trim() || undefined,
        attachments: assets.map((a) => a.base64),
      });
      setDescription(""); setBudget(""); setAssets([]);
      await loadHistory();
      Alert.alert("Chamado aberto", "Acompanhe a resposta no chat de suporte.",
        [{ text: "Abrir chat", onPress: () => router.push("/chat") }, { text: "OK" }]);
    } catch (e: any) {
      Alert.alert("Erro", e.message || "Não foi possível enviar.");
    } finally { setLoading(false); }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Chamados" />
      <SafeAreaView style={{ flex: 1 }} edges={["bottom"]}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Text style={styles.kicker}>CURADORIA SOB DEMANDA</Text>
          <Text style={styles.title}>ABRIR NOVO{"\n"}CHAMADO.</Text>
          <Text style={styles.sub}>
            Descreva livremente o que você precisa. Anexe fotos se quiser. Nossa equipe retorna pelo chat.
          </Text>

          <View style={styles.field}>
            <Text style={styles.label}>SUA SOLICITAÇÃO</Text>
            <TextInput
              testID="quote-description"
              style={[styles.input, { minHeight: 140, textAlignVertical: "top" }]}
              value={description}
              onChangeText={setDescription}
              placeholder="Descreva o que você precisa..."
              placeholderTextColor={theme.colors.textMuted}
              multiline
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>ORÇAMENTO APROXIMADO (OPCIONAL)</Text>
            <TextInput
              testID="quote-budget"
              style={styles.input}
              value={budget}
              onChangeText={setBudget}
              placeholder="Ex: até R$ 2.000"
              placeholderTextColor={theme.colors.textMuted}
            />
          </View>

          <Text style={[styles.label, { marginTop: 4 }]}>ANEXOS</Text>
          <View style={styles.attachRow}>
            <TouchableOpacity style={styles.attachBtn} onPress={addPhoto}>
              <Ionicons name="camera" size={18} color={theme.colors.white} />
              <Text style={styles.attachTxt}>FOTO</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.attachBtn} onPress={addImage}>
              <Ionicons name="image" size={18} color={theme.colors.white} />
              <Text style={styles.attachTxt}>GALERIA</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.attachBtn, styles.attachBtnDisabled]} onPress={() =>
              Alert.alert("Em breve", "Vídeo (até 30s com compressão) e áudio serão liberados na próxima atualização.")
            }>
              <Ionicons name="videocam" size={18} color={theme.colors.textMuted} />
              <Text style={styles.attachTxtDisabled}>VÍDEO</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.attachBtn, styles.attachBtnDisabled]} onPress={() =>
              Alert.alert("Em breve", "Gravação de áudio será liberada na próxima atualização.")
            }>
              <Ionicons name="mic" size={18} color={theme.colors.textMuted} />
              <Text style={styles.attachTxtDisabled}>ÁUDIO</Text>
            </TouchableOpacity>
          </View>

          {assets.length > 0 && (
            <View style={styles.previewRow}>
              {assets.map((a, i) => (
                <View key={i} style={styles.previewItem}>
                  <Image source={{ uri: a.base64 }} style={styles.previewImg} />
                  <TouchableOpacity style={styles.removeAsset} onPress={() => removeAsset(i)}>
                    <Ionicons name="close" size={14} color={theme.colors.bg} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          <TouchableOpacity style={styles.primaryBtn} onPress={submit} disabled={loading} testID="quote-submit">
            {loading ? <ActivityIndicator color={theme.colors.bg} /> : (
              <>
                <Ionicons name="send" size={15} color={theme.colors.bg} />
                <Text style={styles.primaryBtnText}>ABRIR CHAMADO</Text>
              </>
            )}
          </TouchableOpacity>

          {quotes.length > 0 && (
            <>
              <Text style={[styles.kicker, { marginTop: 32 }]}>MEUS CHAMADOS</Text>
              <View style={{ gap: 10, marginTop: 10 }}>
                {quotes.map((q) => (
                  <TouchableOpacity key={q.quote_id} style={styles.qCard} onPress={() => router.push("/chat")}>
                    <View style={styles.qCardHead}>
                      <Text style={styles.qCardCode}>#{q.quote_id.slice(-6).toUpperCase()}</Text>
                      <View style={[styles.qStatus, q.status === "closed" ? styles.qClosed : styles.qOpen]}>
                        <Text style={[styles.qStatusTxt, q.status === "closed" && { color: theme.colors.textMuted }]}>
                          {q.status === "closed" ? "ENCERRADO" : "ABERTO"}
                        </Text>
                      </View>
                    </View>
                    <Text numberOfLines={2} style={styles.qDesc}>{q.description}</Text>
                    <Text style={styles.qDate}>{new Date(q.created_at).toLocaleDateString("pt-BR")}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: theme.spacing.lg, gap: theme.spacing.md, paddingBottom: 60 },
  kicker: { color: theme.colors.silver, fontSize: 11, fontWeight: "800", letterSpacing: 3 },
  title: {
    color: theme.colors.white, fontSize: 30, fontWeight: "900",
    letterSpacing: -1.2, lineHeight: 32, marginTop: 6, textTransform: "uppercase",
  },
  sub: { color: theme.colors.textMuted, fontSize: 13, lineHeight: 20, marginTop: 8, marginBottom: theme.spacing.md },
  field: { gap: 8 },
  label: { color: theme.colors.silver, fontSize: 10, fontWeight: "800", letterSpacing: 2 },
  input: {
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: 8, padding: 14, color: theme.colors.text, fontSize: 14,
  },
  attachRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  attachBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8,
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
  },
  attachBtnDisabled: { opacity: 0.55 },
  attachTxt: { color: theme.colors.white, fontSize: 11, fontWeight: "800", letterSpacing: 1.5 },
  attachTxtDisabled: { color: theme.colors.textMuted, fontSize: 11, fontWeight: "800", letterSpacing: 1.5 },
  previewRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  previewItem: { position: "relative" },
  previewImg: { width: 80, height: 80, borderRadius: 8, backgroundColor: theme.colors.surface },
  removeAsset: {
    position: "absolute", top: -6, right: -6,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: theme.colors.white, alignItems: "center", justifyContent: "center",
  },
  primaryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    backgroundColor: theme.colors.white, paddingVertical: 16, borderRadius: 8,
    marginTop: theme.spacing.md,
  },
  primaryBtnText: { color: theme.colors.bg, fontWeight: "900", fontSize: 13, letterSpacing: 1.5 },
  qCard: {
    padding: 12, backgroundColor: theme.colors.surface,
    borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8,
  },
  qCardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  qCardCode: { color: theme.colors.silver, fontSize: 11, fontWeight: "800", letterSpacing: 1.5 },
  qStatus: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  qOpen: { backgroundColor: "rgba(78, 224, 127, 0.15)" },
  qClosed: { backgroundColor: theme.colors.surfaceElevated },
  qStatusTxt: { color: "#4EE07F", fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  qDesc: { color: theme.colors.text, fontSize: 13, lineHeight: 19 },
  qDate: { color: theme.colors.textMuted, fontSize: 11, marginTop: 4 },
});

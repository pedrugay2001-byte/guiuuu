import { useState } from "react";
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, Image,
  ActivityIndicator,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { pickCompressedImage } from "../../src/imagepicker";
import { notify } from "../../src/alerts";
import { api } from "../../src/api";
import { useGate } from "../../src/gate";

export default function CreateStory() {
  const router = useRouter();
  const { member } = useGate();
  const [image, setImage] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);

  const pick = async () => {
    const uri = await pickCompressedImage({ aspect: [9, 16], quality: 0.35 });
    if (uri) setImage(uri);
  };

  const submit = async () => {
    if (!member) { notify("Faça login primeiro"); return; }
    if (!image && !text.trim()) { notify("Adicione uma foto ou texto"); return; }
    setLoading(true);
    try {
      await api.createStory(member.member_id, image || undefined, text || undefined);
      notify("Story publicado!", "Seu story fica visível por 24h.");
      router.back();
    } catch (e: any) {
      console.log("createStory error", e);
      notify("Erro ao publicar", e?.message || "Tente novamente com uma foto menor.");
    } finally { setLoading(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <Stack.Screen options={{ title: "Novo story", headerStyle: { backgroundColor: "#000" }, headerTintColor: "#FFF" }} />
      <View style={styles.canvas}>
        {image ? (
          <Image source={{ uri: image }} style={styles.bg} resizeMode="cover" />
        ) : (
          <TouchableOpacity style={styles.emptyBg} onPress={pick} testID="story-pick">
            <Ionicons name="image" size={48} color="#D4AF37" />
            <Text style={styles.emptyTxt}>TOQUE PARA ESCOLHER UMA FOTO</Text>
            <Text style={styles.emptySub}>Seu story fica 24h visível na comunidade</Text>
          </TouchableOpacity>
        )}
        {image && (
          <View style={styles.textOverlay}>
            <TextInput value={text} onChangeText={setText} placeholder="Adicione uma legenda" placeholderTextColor="rgba(255,255,255,0.7)" style={styles.textInput} multiline />
          </View>
        )}
      </View>
      <View style={styles.footer}>
        {image && (
          <TouchableOpacity onPress={pick} style={styles.footerBtn} testID="story-change">
            <Ionicons name="refresh" size={20} color="#FFF" />
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[styles.publish, (loading || !image) && { opacity: 0.5 }]} disabled={loading || !image} onPress={submit} testID="story-publish">
          {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.publishTxt}>PUBLICAR STORY</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: { flex: 1, backgroundColor: "#0A0A0A" },
  bg: { width: "100%", height: "100%" },
  emptyBg: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 24 },
  emptyTxt: { color: "#FFF", fontSize: 13, fontWeight: "900", letterSpacing: 2, marginTop: 8, textAlign: "center" },
  emptySub: { color: "#888", fontSize: 12, textAlign: "center", maxWidth: 280 },
  textOverlay: { position: "absolute", bottom: 80, left: 20, right: 20 },
  textInput: { color: "#FFF", fontSize: 20, fontWeight: "800", textShadowColor: "rgba(0,0,0,0.8)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 5 },
  footer: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, backgroundColor: "#000" },
  footerBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#222", alignItems: "center", justifyContent: "center" },
  publish: { flex: 1, backgroundColor: "#D4AF37", height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  publishTxt: { color: "#000", fontSize: 12, fontWeight: "900", letterSpacing: 2 },
});

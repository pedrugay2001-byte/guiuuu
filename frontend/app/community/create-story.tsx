import { useState } from "react";
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, Image, Alert,
  ActivityIndicator,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { pickCompressedImage } from "../../src/imagepicker";
import { api } from "../../src/api";
import { useGate } from "../../src/gate";

export default function CreateStory() {
  const router = useRouter();
  const { member } = useGate();
  const [image, setImage] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);

  const pick = async () => {
    const uri = await pickCompressedImage({ aspect: [9, 16], quality: 0.3 });
    if (uri) setImage(uri);
  };

  const submit = async () => {
    if (!member) return;
    if (!image && !text.trim()) { Alert.alert("Adicione uma foto ou texto"); return; }
    setLoading(true);
    try {
      await api.createStory(member.member_id, image || undefined, text || undefined);
      router.back();
    } catch (e: any) { Alert.alert("Erro", e.message); } finally { setLoading(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <Stack.Screen options={{ title: "Novo story", headerStyle: { backgroundColor: "#000" }, headerTintColor: "#FFF" }} />
      <View style={styles.canvas}>
        {image ? (
          <Image source={{ uri: image }} style={styles.bg} />
        ) : (
          <TouchableOpacity style={styles.emptyBg} onPress={pick} testID="story-pick">
            <Ionicons name="image" size={44} color="#555" />
            <Text style={styles.emptyTxt}>Toque para escolher uma foto</Text>
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
          <TouchableOpacity onPress={pick} style={styles.footerBtn}>
            <Ionicons name="refresh" size={20} color="#FFF" />
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[styles.publish, loading && { opacity: 0.5 }]} disabled={loading || !image} onPress={submit} testID="story-publish">
          {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.publishTxt}>PUBLICAR STORY</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: { flex: 1, backgroundColor: "#0A0A0A" },
  bg: { width: "100%", height: "100%" },
  emptyBg: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  emptyTxt: { color: "#777", fontSize: 13, fontWeight: "700" },
  textOverlay: { position: "absolute", bottom: 80, left: 20, right: 20 },
  textInput: { color: "#FFF", fontSize: 20, fontWeight: "800", textShadowColor: "rgba(0,0,0,0.8)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 5 },
  footer: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, backgroundColor: "#000" },
  footerBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#222", alignItems: "center", justifyContent: "center" },
  publish: { flex: 1, backgroundColor: "#D4AF37", height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  publishTxt: { color: "#000", fontSize: 12, fontWeight: "900", letterSpacing: 2 },
});

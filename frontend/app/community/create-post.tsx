import { useState } from "react";
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, Image, Alert, ActivityIndicator,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "../../src/icons";
import { api } from "../../src/api";
import { useGate } from "../../src/gate";
import { pickCompressedImage } from "../../src/imagepicker";

export default function CreatePost() {
  const router = useRouter();
  const { member } = useGate();
  const [text, setText] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const pick = async () => {
    const uri = await pickCompressedImage({ quality: 0.35 });
    if (uri) setImage(uri);
  };

  const submit = async () => {
    if (!member) return;
    if (!text.trim() && !image) { Alert.alert("Adicione texto ou foto"); return; }
    setLoading(true);
    try {
      await api.createPost(member.member_id, text, image || undefined);
      router.back();
    } catch (e: any) { Alert.alert("Erro", e.message); } finally { setLoading(false); }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, backgroundColor: "#050505" }}>
      <Stack.Screen options={{
        title: "Novo post", headerStyle: { backgroundColor: "#050505" }, headerTintColor: "#FFF",
        headerRight: () => (
          <TouchableOpacity onPress={submit} disabled={loading} style={{ paddingHorizontal: 12 }} testID="publish-post">
            {loading ? <ActivityIndicator color="#D4AF37" /> : <Text style={{ color: "#D4AF37", fontSize: 13, fontWeight: "900", letterSpacing: 1.5 }}>PUBLICAR</Text>}
          </TouchableOpacity>
        ),
      }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Fala com a galera BLACKSCLUB..."
          placeholderTextColor="#555"
          multiline
          autoFocus
        />
        {image && (
          <View style={{ marginTop: 12 }}>
            <Image source={{ uri: image }} style={styles.img} />
            <TouchableOpacity onPress={() => setImage(null)} style={styles.removeImg}>
              <Ionicons name="close" size={16} color="#FFF" />
            </TouchableOpacity>
          </View>
        )}
        <TouchableOpacity style={styles.photoBtn} onPress={pick} testID="post-photo">
          <Ionicons name="image" size={20} color="#D4AF37" />
          <Text style={styles.photoBtnTxt}>{image ? "Trocar foto" : "Adicionar foto"}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  input: { color: "#EEE", fontSize: 17, lineHeight: 24, minHeight: 160, textAlignVertical: "top" },
  img: { width: "100%", height: 260, borderRadius: 12, backgroundColor: "#111" },
  removeImg: { position: "absolute", top: 10, right: 10, width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.7)" },
  photoBtn: { flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start", marginTop: 20, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: "#D4AF37", backgroundColor: "rgba(212,175,55,0.08)" },
  photoBtnTxt: { color: "#D4AF37", fontSize: 12, fontWeight: "800", letterSpacing: 1 },
});

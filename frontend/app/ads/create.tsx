import { useState } from "react";
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, Image, Alert, ActivityIndicator,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../src/api";
import { useGate } from "../../src/gate";
import { pickCompressedImage } from "../../src/imagepicker";
import ScreenHeader from "../../src/screen-header";

const CATS = [
  { id: "emagrecedores", name: "Emagrecedores" },
  { id: "peptideos", name: "Peptídeos" },
  { id: "hormonios", name: "Hormônios" },
  { id: "pre_treinos", name: "Pré-treinos" },
  { id: "suplementos", name: "Suplementos" },
  { id: "outros", name: "Outros" },
];

export default function CreateAd() {
  const router = useRouter();
  const { member } = useGate();
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [price, setPrice] = useState("");
  const [cat, setCat] = useState("emagrecedores");
  const [stock, setStock] = useState("1");
  const [images, setImages] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  if (member?.tier !== "diamond") {
    return (
      <View style={{ flex: 1, backgroundColor: "#050505" }}>
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Anunciar" />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
          <Ionicons name="diamond" size={48} color="#7FD7E5" />
          <Text style={{ color: "#FFF", fontSize: 17, fontWeight: "900", marginTop: 14 }}>Exclusivo BLACK DIAMOND</Text>
          <Text style={{ color: "#999", fontSize: 13, textAlign: "center", marginTop: 8, lineHeight: 18 }}>
            Somente membros com plano BLACK DIAMOND podem anunciar no marketplace do clube.
          </Text>
          <TouchableOpacity onPress={() => router.push("/(tabs)/negocios")} style={{ marginTop: 20, backgroundColor: "#7FD7E5", paddingHorizontal: 18, paddingVertical: 12, borderRadius: 10 }}>
            <Text style={{ color: "#000", fontWeight: "900", letterSpacing: 1 }}>VER PLANOS</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const addImage = async () => {
    if (images.length >= 6) { Alert.alert("Limite", "Máximo 6 fotos."); return; }
    const uri = await pickCompressedImage({ quality: 0.4 });
    if (uri) setImages([...images, uri]);
  };

  const submit = async () => {
    if (!title.trim() || !desc.trim() || !price) { Alert.alert("Preencha", "Título, descrição e preço"); return; }
    const p = parseFloat(price.replace(",", "."));
    if (!p || p <= 0) { Alert.alert("Preço inválido"); return; }
    setSaving(true);
    try {
      await api.createAd({
        seller_id: member!.member_id,
        title: title.trim(), description: desc.trim(),
        price_full: p, category: cat, stock: parseInt(stock || "1", 10) || 1,
        images,
      });
      Alert.alert("Anúncio publicado!", "Seu anúncio já está visível no marketplace.", [{ text: "OK", onPress: () => router.replace("/ads") }]);
    } catch (e: any) { Alert.alert("Erro", e.message || "Falha"); }
    finally { setSaving(false); }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, backgroundColor: "#050505" }}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Novo Anúncio" />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={styles.lbl}>FOTOS ({images.length}/6)</Text>
        <ScrollView horizontal style={{ marginBottom: 16 }} showsHorizontalScrollIndicator={false}>
          {images.map((uri, i) => (
            <View key={i} style={styles.imgBox}>
              <Image source={{ uri }} style={styles.img} />
              <TouchableOpacity style={styles.rm} onPress={() => setImages(images.filter((_, x) => x !== i))}><Ionicons name="close" size={14} color="#FFF" /></TouchableOpacity>
            </View>
          ))}
          {images.length < 6 && (
            <TouchableOpacity style={styles.addImg} onPress={addImage} testID="ad-add-image">
              <Ionicons name="camera" size={24} color="#888" />
              <Text style={{ color: "#888", fontSize: 10, marginTop: 4, fontWeight: "700" }}>ADICIONAR</Text>
            </TouchableOpacity>
          )}
        </ScrollView>

        <Text style={styles.lbl}>TÍTULO</Text>
        <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Ex.: Ozempic 1mg lacrado" placeholderTextColor="#555" />

        <Text style={styles.lbl}>DESCRIÇÃO</Text>
        <TextInput style={[styles.input, { minHeight: 90, textAlignVertical: "top" }]} value={desc} onChangeText={setDesc} placeholder="Detalhes, validade, condição..." placeholderTextColor="#555" multiline />

        <Text style={styles.lbl}>CATEGORIA</Text>
        <View style={styles.catRow}>
          {CATS.map((c) => (
            <TouchableOpacity key={c.id} onPress={() => setCat(c.id)} style={[styles.catBtn, cat === c.id && styles.catBtnActive]}>
              <Text style={[styles.catTxt, cat === c.id && { color: "#000" }]}>{c.name}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.lbl}>PREÇO CHEIO (R$)</Text>
        <TextInput style={styles.input} value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder="Ex.: 850" placeholderTextColor="#555" />
        <Text style={styles.hint}>O app aplica automaticamente: Diamante −30%, Gold −15%, Silver sem desconto.</Text>

        <Text style={styles.lbl}>ESTOQUE</Text>
        <TextInput style={styles.input} value={stock} onChangeText={setStock} keyboardType="number-pad" placeholder="1" placeholderTextColor="#555" />

        <TouchableOpacity style={[styles.submit, saving && { opacity: 0.5 }]} disabled={saving} onPress={submit} testID="ad-submit">
          {saving ? <ActivityIndicator color="#000" /> : <Text style={styles.submitTxt}>PUBLICAR ANÚNCIO</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  lbl: { color: "#888", fontSize: 10, fontWeight: "900", letterSpacing: 2, marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: "#121212", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, color: "#EEE", fontSize: 14, borderWidth: 1, borderColor: "#1F1F1F" },
  hint: { color: "#666", fontSize: 11, marginTop: 6, lineHeight: 15 },
  catRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  catBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: "#222", backgroundColor: "#111" },
  catBtnActive: { backgroundColor: "#D4AF37", borderColor: "#D4AF37" },
  catTxt: { color: "#DDD", fontSize: 11, fontWeight: "700" },
  submit: { marginTop: 24, backgroundColor: "#D4AF37", padding: 15, borderRadius: 10, alignItems: "center" },
  submitTxt: { color: "#000", fontSize: 12, fontWeight: "900", letterSpacing: 2 },
  imgBox: { width: 90, height: 90, marginRight: 8, borderRadius: 8, overflow: "hidden", position: "relative" },
  img: { width: "100%", height: "100%" },
  rm: { position: "absolute", top: 4, right: 4, backgroundColor: "rgba(0,0,0,0.7)", width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  addImg: { width: 90, height: 90, borderRadius: 8, borderWidth: 1, borderColor: "#2A2A2A", borderStyle: "dashed", alignItems: "center", justifyContent: "center", backgroundColor: "#0A0A0A" },
});

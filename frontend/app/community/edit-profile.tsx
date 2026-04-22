import { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, Image, Alert, ActivityIndicator,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { pickCompressedImage } from "../../src/imagepicker";
import { notify } from "../../src/alerts";
import { api, CommunityMember } from "../../src/api";
import { useGate } from "../../src/gate";
import { TIERS } from "../../src/theme";

export default function EditProfile() {
  const router = useRouter();
  const { member, updateMember } = useGate();
  const [me, setMe] = useState<CommunityMember | null>(null);
  const [nickname, setNickname] = useState("");
  const [bio, setBio] = useState("");
  const [age, setAge] = useState("");
  const [profession, setProfession] = useState("");
  const [gym, setGym] = useState("");
  const [city, setCity] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!member) return;
      try {
        const [d, ph] = await Promise.all([api.communityMember(member.member_id), api.getPhotos(member.member_id)]);
        setMe(d);
        setNickname(d.nickname || "");
        setBio(d.bio || "");
        setAge(d.age ? String(d.age) : "");
        setProfession(d.profession || "");
        setGym(d.gym || "");
        setCity(d.city || "");
        setAvatar(d.avatar_base64 || null);
        setPhotos(ph.photos || []);
      } finally { setLoading(false); }
    })();
  }, [member]);

  const pickAvatar = async () => {
    const uri = await pickCompressedImage({ aspect: [1, 1], quality: 0.4 });
    if (uri) setAvatar(uri);
  };

  const addPhoto = async () => {
    if (photos.length >= 10) { notify("Limite", "Máximo de 10 fotos"); return; }
    const uri = await pickCompressedImage({ quality: 0.35 });
    if (uri) setPhotos([...photos, uri]);
  };

  const save = async () => {
    if (!member) return;
    setSaving(true);
    try {
      await api.updateProfile(member.member_id, {
        nickname: nickname.trim() || undefined, bio: bio.trim(),
        age: age ? parseInt(age, 10) : undefined,
        profession: profession.trim(), gym: gym.trim(), city: city.trim(),
        avatar_base64: avatar || undefined,
      });
      await api.updatePhotos(member.member_id, photos);
      // Update local gate cache so the avatar shows up immediately in Home + Member screens
      try { await updateMember({ avatar_base64: avatar, nickname: nickname.trim() || null } as any); } catch {}
      notify("Perfil salvo!", "Sua foto e dados foram atualizados.");
      router.back();
    } catch (e: any) {
      console.log("save profile error", e);
      notify("Erro ao salvar", e?.message || "Tente uma foto menor ou verifique sua conexão.");
    }
    finally { setSaving(false); }
  };

  if (loading || !me) return <View style={{ flex: 1, backgroundColor: "#050505", justifyContent: "center" }}><ActivityIndicator color="#FFF" /></View>;

  const tier = TIERS[me.tier] || TIERS.silver;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, backgroundColor: "#050505" }}>
      <Stack.Screen options={{ title: "Editar perfil", headerStyle: { backgroundColor: "#050505" }, headerTintColor: "#FFF" }} />
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <TouchableOpacity style={styles.avatarBtn} onPress={pickAvatar} testID="edit-avatar" activeOpacity={0.85}>
          <View style={[styles.avatarRing, { borderColor: tier.color }]}>
            {avatar ? <Image source={{ uri: avatar }} style={styles.avatar} /> : (
              <View style={[styles.avatar, { backgroundColor: "#2A2A2A", alignItems: "center", justifyContent: "center" }]}>
                <Ionicons name="camera" size={28} color="#888" />
              </View>
            )}
          </View>
          <Text style={styles.avatarHint}>{avatar ? "Tocar para trocar foto principal" : "Adicionar foto principal"}</Text>
        </TouchableOpacity>

        <Field label="APELIDO" value={nickname} onChangeText={setNickname} placeholder="Como você quer ser chamado" />
        <Field label="BIO" value={bio} onChangeText={setBio} placeholder="Fala um pouco de você..." multiline />
        <Field label="IDADE" value={age} onChangeText={setAge} placeholder="30" keyboardType="number-pad" />
        <Field label="PROFISSÃO" value={profession} onChangeText={setProfession} placeholder="Ex.: Empresário" />
        <Field label="ONDE MALHA" value={gym} onChangeText={setGym} placeholder="Ex.: Smart Fit Vila Nova" />
        <Field label="CIDADE" value={city} onChangeText={setCity} placeholder="Ex.: São Paulo - SP" />

        <Text style={styles.galLbl}>GALERIA ({photos.length}/10)</Text>
        <Text style={styles.galHint}>Adicione até 10 fotos para aparecer no seu perfil público.</Text>
        <View style={styles.galGrid}>
          {photos.map((p, i) => (
            <View key={i} style={styles.galItem}>
              <Image source={{ uri: p }} style={styles.galImg} />
              <TouchableOpacity style={styles.galRemove} onPress={() => setPhotos(photos.filter((_, x) => x !== i))}>
                <Ionicons name="close" size={14} color="#FFF" />
              </TouchableOpacity>
            </View>
          ))}
          {photos.length < 10 && (
            <TouchableOpacity style={styles.galAdd} onPress={addPhoto} testID="gallery-add">
              <Ionicons name="add" size={28} color="#D4AF37" />
              <Text style={{ color: "#D4AF37", fontSize: 10, fontWeight: "800" }}>ADICIONAR</Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity style={[styles.save, saving && { opacity: 0.55 }]} onPress={save} disabled={saving} testID="save-profile">
          {saving ? <ActivityIndicator color="#000" /> : <Text style={styles.saveTxt}>SALVAR PERFIL</Text>}
        </TouchableOpacity>

        <Text style={styles.priv}>Seu nome real, telefone e e-mail continuam privados. Só o que você escreve aqui é visível para outros membros.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, ...rest }: any) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput {...rest} style={[styles.input, rest.multiline && { minHeight: 80, textAlignVertical: "top" }]} placeholderTextColor="#666" />
    </View>
  );
}

const styles = StyleSheet.create({
  avatarBtn: { alignSelf: "center", marginBottom: 20 },
  avatarRing: { width: 140, height: 140, borderRadius: 70, borderWidth: 3, padding: 3 },
  avatar: { width: 128, height: 128, borderRadius: 64 },
  avatarHint: { color: "#999", fontSize: 11, textAlign: "center", marginTop: 8, fontWeight: "700", letterSpacing: 1 },
  field: { marginBottom: 14 },
  label: { color: "#888", fontSize: 10, fontWeight: "900", letterSpacing: 2, marginBottom: 6 },
  input: { backgroundColor: "#121212", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, color: "#EEE", fontSize: 14, borderWidth: 1, borderColor: "#1F1F1F" },
  galLbl: { color: "#D4AF37", fontSize: 10, fontWeight: "900", letterSpacing: 2, marginTop: 16, marginBottom: 4 },
  galHint: { color: "#888", fontSize: 11, marginBottom: 10 },
  galGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  galItem: { width: "31%", aspectRatio: 1, position: "relative" },
  galImg: { width: "100%", height: "100%", borderRadius: 8, backgroundColor: "#141414" },
  galRemove: { position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: "rgba(0,0,0,0.7)", alignItems: "center", justifyContent: "center" },
  galAdd: { width: "31%", aspectRatio: 1, borderRadius: 8, borderWidth: 1, borderColor: "#D4AF37", borderStyle: "dashed", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(212,175,55,0.04)", gap: 4 },
  save: { backgroundColor: "#D4AF37", padding: 15, borderRadius: 10, alignItems: "center", marginTop: 20 },
  saveTxt: { color: "#000", fontWeight: "900", fontSize: 12, letterSpacing: 2 },
  priv: { color: "#777", fontSize: 11, textAlign: "center", marginTop: 14, paddingHorizontal: 12, lineHeight: 15 },
});

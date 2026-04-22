import { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, Image, Alert, ActivityIndicator,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { api, CommunityMember } from "../../src/api";
import { useGate } from "../../src/gate";
import { TIERS } from "../../src/theme";

export default function EditProfile() {
  const router = useRouter();
  const { member } = useGate();
  const [me, setMe] = useState<CommunityMember | null>(null);
  const [nickname, setNickname] = useState("");
  const [bio, setBio] = useState("");
  const [age, setAge] = useState("");
  const [profession, setProfession] = useState("");
  const [gym, setGym] = useState("");
  const [city, setCity] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!member) return;
      try {
        const d = await api.communityMember(member.member_id);
        setMe(d);
        setNickname(d.nickname || "");
        setBio(d.bio || "");
        setAge(d.age ? String(d.age) : "");
        setProfession(d.profession || "");
        setGym(d.gym || "");
        setCity(d.city || "");
        setAvatar(d.avatar_base64 || null);
      } finally { setLoading(false); }
    })();
  }, [member]);

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert("Permissão necessária"); return; }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images" as any], quality: 0.65, base64: true, allowsEditing: true, aspect: [1, 1],
    });
    if (res.canceled || !res.assets?.length) return;
    const a = res.assets[0];
    if (a.base64) setAvatar(`data:image/jpeg;base64,${a.base64}`);
  };

  const save = async () => {
    if (!member) return;
    setSaving(true);
    try {
      await api.updateProfile(member.member_id, {
        nickname: nickname.trim() || undefined,
        bio: bio.trim(),
        age: age ? parseInt(age, 10) : undefined,
        profession: profession.trim(),
        gym: gym.trim(),
        city: city.trim(),
        avatar_base64: avatar || undefined,
      });
      Alert.alert("Perfil salvo", "Seu perfil público foi atualizado.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert("Erro", e.message || "Falha ao salvar");
    } finally { setSaving(false); }
  };

  if (loading || !me) return <View style={{ flex: 1, backgroundColor: "#1A1A1A", justifyContent: "center" }}><ActivityIndicator color="#FFF" /></View>;

  const tier = TIERS[me.tier] || TIERS.black;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, backgroundColor: "#1A1A1A" }}>
      <Stack.Screen options={{ title: "Editar perfil", headerStyle: { backgroundColor: "#1A1A1A" }, headerTintColor: "#FFF" }} />
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <TouchableOpacity style={styles.avatarBtn} onPress={pickImage} testID="edit-avatar" activeOpacity={0.85}>
          <View style={[styles.avatarRing, { borderColor: tier.color }]}>
            {avatar ? (
              <Image source={{ uri: avatar }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, { backgroundColor: "#2A2A2A", alignItems: "center", justifyContent: "center" }]}>
                <Ionicons name="camera" size={28} color="#888" />
              </View>
            )}
          </View>
          <Text style={styles.avatarHint}>{avatar ? "Tocar para trocar" : "Adicionar foto"}</Text>
        </TouchableOpacity>

        <Field label="APELIDO" value={nickname} onChangeText={setNickname} placeholder="Como você quer ser chamado" />
        <Field label="BIO" value={bio} onChangeText={setBio} placeholder="Fala um pouco de você..." multiline />
        <Field label="IDADE" value={age} onChangeText={setAge} placeholder="30" keyboardType="number-pad" />
        <Field label="PROFISSÃO" value={profession} onChangeText={setProfession} placeholder="Ex.: Empresário" />
        <Field label="ONDE MALHA" value={gym} onChangeText={setGym} placeholder="Ex.: Smart Fit Vila Nova" />
        <Field label="CIDADE" value={city} onChangeText={setCity} placeholder="Ex.: São Paulo - SP" />

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
      <TextInput
        {...rest}
        style={[styles.input, rest.multiline && { minHeight: 80, textAlignVertical: "top" }]}
        placeholderTextColor="#666"
      />
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
  input: {
    backgroundColor: "#2A2A2A", borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    color: "#EEE", fontSize: 14,
    borderWidth: 1, borderColor: "#333",
  },
  save: {
    backgroundColor: "#D4AF37", padding: 15, borderRadius: 10,
    alignItems: "center", marginTop: 16,
  },
  saveTxt: { color: "#000", fontWeight: "900", fontSize: 12, letterSpacing: 2 },
  priv: { color: "#777", fontSize: 11, textAlign: "center", marginTop: 14, paddingHorizontal: 12, lineHeight: 15 },
});

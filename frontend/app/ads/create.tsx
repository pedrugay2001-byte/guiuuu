import { useState, useMemo, useEffect } from "react";
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, Image, Alert, ActivityIndicator,
} from "react-native";
import { Stack, useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "../../src/api";
import { useGate } from "../../src/gate";
import { useAuth } from "../../src/auth";
import { pickCompressedImage } from "../../src/imagepicker";
import ScreenHeader from "../../src/screen-header";

const CATS = [
  { id: "metabolicos", name: "🔥 Emagrecedores" },
  { id: "performance", name: "💪 Força e Massa" },
  { id: "regeneracao", name: "🩹 Recuperação" },
  { id: "estetica",    name: "✨ Estética" },
  { id: "foco",        name: "🧠 Foco" },
  { id: "funcionais",  name: "⚡ Energia" },
];

// Tema visual de cada marketplace — aplicado ao card do anúncio
type AdTier = "diamond" | "gold" | "silver";
const TIER_THEME: Record<AdTier, { label: string; icon: string; color: string; accent: string; gradientTop: string }> = {
  diamond: { label: "Marketplace Diamante", icon: "diamond", color: "#C5D1DA", accent: "#EAF1F6", gradientTop: "#7FD7E5" },
  gold:    { label: "Marketplace Gold",     icon: "star",    color: "#D4AF37", accent: "#F4D47A", gradientTop: "#F4D47A" },
  silver:  { label: "Marketplace Silver",   icon: "medal",   color: "#B8B8B8", accent: "#E8E8E8", gradientTop: "#E8E8E8" },
};

export default function CreateAd() {
  const router = useRouter();
  const { member } = useGate();
  const { user } = useAuth();
  const { tier: tierParam, id: editId } = useLocalSearchParams<{ tier?: string; id?: string }>();
  const isEdit = !!editId;

  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [price, setPrice] = useState("");
  const [cat, setCat] = useState("metabolicos");
  const [stock, setStock] = useState("1");
  const [images, setImages] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadingAd, setLoadingAd] = useState(isEdit);
  // Tier do anúncio — Staff pode escolher; default vem da URL (?tier=) ou "diamond"
  const initialTier = (String(tierParam || "diamond").toLowerCase()) as AdTier;
  const [adTier, setAdTier] = useState<AdTier>(
    ["silver", "gold", "diamond"].includes(initialTier) ? initialTier : "diamond"
  );

  const theme = useMemo(() => TIER_THEME[adTier], [adTier]);

  // Pode publicar:
  //  - Staff JWT (admin/support/financeiro), OU
  //  - Membro com flag `can_post_ads` concedida pelo admin
  // (A validação completa fica no backend; aqui é só pra mostrar a UI)
  const isStaff = !!user && ["admin", "support", "financeiro"].includes((user.role || "") as string);
  const isMemberPublisher = !!member?.can_post_ads;
  // Em modo edição, o dono do anúncio pode editar mesmo sem publisher permission
  // (caso a permissão tenha sido revogada após a publicação).
  const [editAdSellerId, setEditAdSellerId] = useState<string | null>(null);
  const isEditOwner = isEdit && !!editAdSellerId && editAdSellerId === member?.member_id;
  const canPost = isStaff || isMemberPublisher || isEditOwner;

  // Modo EDIÇÃO — carrega dados do anúncio existente
  useEffect(() => {
    if (!isEdit || !editId) return;
    let cancelled = false;
    (async () => {
      try {
        const ad = await api.getAd(String(editId));
        if (cancelled) return;
        setEditAdSellerId(ad.seller_id || null);
        setTitle(ad.title || "");
        setDesc(ad.description || "");
        setPrice(String(ad.price_full ?? ""));
        setCat(ad.category || "metabolicos");
        setStock(String(ad.stock ?? 1));
        setImages(ad.images || []);
        if (ad.ad_tier && ["silver", "gold", "diamond"].includes(ad.ad_tier)) {
          setAdTier(ad.ad_tier as AdTier);
        }
      } catch (e: any) {
        Alert.alert("Erro", "Não foi possível carregar o anúncio.");
        router.back();
      } finally {
        if (!cancelled) setLoadingAd(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isEdit, editId]);

  if (!canPost) {
    return (
      <View style={{ flex: 1, backgroundColor: "#050505" }}>
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Anunciar" />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
          <Ionicons name="shield-checkmark" size={48} color="#7FD7E5" />
          <Text style={{ color: "#FFF", fontSize: 17, fontWeight: "900", marginTop: 14 }}>Marketplace Curado</Text>
          <Text style={{ color: "#999", fontSize: 13, textAlign: "center", marginTop: 8, lineHeight: 18 }}>
            Todos os anúncios do BlacksClub passam por curadoria oficial. Apenas a equipe autorizada do clube pode publicar.
          </Text>
          <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 20, backgroundColor: "#7FD7E5", paddingHorizontal: 18, paddingVertical: 12, borderRadius: 10 }}>
            <Text style={{ color: "#000", fontWeight: "900", letterSpacing: 1 }}>VOLTAR</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (loadingAd) {
    return (
      <View style={{ flex: 1, backgroundColor: "#050505", alignItems: "center", justifyContent: "center" }}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator color="#7FD7E5" />
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
      if (isEdit && editId) {
        await api.updateAd(String(editId), {
          seller_id: member!.member_id,
          title: title.trim(), description: desc.trim(),
          price_full: p, category: cat, stock: parseInt(stock || "1", 10) || 1,
          images, ad_tier: adTier,
        });
        Alert.alert("Anúncio atualizado!", "As alterações foram salvas.", [
          { text: "OK", onPress: () => router.back() },
        ]);
      } else {
        await api.createAd({
          seller_id: member!.member_id,
          title: title.trim(), description: desc.trim(),
          price_full: p, category: cat, stock: parseInt(stock || "1", 10) || 1,
          images,
          ad_tier: adTier,
        });
        Alert.alert(
          "Anúncio publicado!",
          `Seu anúncio já está visível no ${theme.label}.`,
          [{ text: "OK", onPress: () => router.replace(`/catalog/${adTier}` as any) }],
        );
      }
    } catch (e: any) { Alert.alert("Erro", e.message || "Falha"); }
    finally { setSaving(false); }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, backgroundColor: "#050505" }}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Novo Anúncio" />
      <ScrollView contentContainerStyle={{ padding: 16 }}>

        {/* SELETOR DE MARKETPLACE — tema aplicado */}
        <Text style={styles.lbl}>MARKETPLACE</Text>
        <View style={styles.tierRow}>
          {(["diamond", "gold", "silver"] as AdTier[]).map((t) => {
            const th = TIER_THEME[t];
            const active = adTier === t;
            return (
              <TouchableOpacity
                key={t}
                onPress={() => setAdTier(t)}
                activeOpacity={0.85}
                style={[
                  styles.tierChip,
                  active
                    ? { borderColor: th.color, backgroundColor: th.color + "1A" }
                    : { borderColor: "#222", backgroundColor: "#0A0A0A" },
                ]}
                testID={`tier-chip-${t}`}
              >
                <MaterialCommunityIcons name={th.icon as any} size={14} color={active ? th.accent : "#666"} />
                <Text style={[styles.tierChipTxt, active && { color: th.accent }]}>
                  {t.toUpperCase()}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.hint}>
          Como membro DIAMOND, você pode publicar em qualquer marketplace. O tema do card do seu anúncio segue a cor do tier escolhido.
        </Text>

        {/* PREVIEW do tema */}
        <View style={[styles.themePreview, { borderColor: theme.color + "55", backgroundColor: theme.color + "08" }]}>
          <View style={[styles.themeDot, { backgroundColor: theme.color }]} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.themeTitle, { color: theme.accent }]}>{theme.label.toUpperCase()}</Text>
            <Text style={styles.themeSub}>Seu anúncio aparecerá com essa paleta.</Text>
          </View>
          <Ionicons name="color-palette" size={16} color={theme.color} />
        </View>

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
          {CATS.map((c) => {
            const active = cat === c.id;
            return (
              <TouchableOpacity
                key={c.id}
                onPress={() => setCat(c.id)}
                style={[
                  styles.catBtn,
                  active && { backgroundColor: theme.color, borderColor: theme.color },
                ]}
              >
                <Text style={[styles.catTxt, active && { color: "#0A0A0A" }]}>{c.name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.lbl}>PREÇO CHEIO (R$)</Text>
        <TextInput style={styles.input} value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder="Ex.: 850" placeholderTextColor="#555" />
        <Text style={styles.hint}>O app aplica automaticamente: Diamante −30%, Gold −15%, Silver sem desconto.</Text>

        <Text style={styles.lbl}>ESTOQUE</Text>
        <TextInput style={styles.input} value={stock} onChangeText={setStock} keyboardType="number-pad" placeholder="1" placeholderTextColor="#555" />

        <TouchableOpacity
          style={[styles.submit, { backgroundColor: theme.color }, saving && { opacity: 0.5 }]}
          disabled={saving}
          onPress={submit}
          testID="ad-submit"
        >
          {saving ? <ActivityIndicator color="#000" /> : (
            <Text style={styles.submitTxt}>PUBLICAR NO {adTier.toUpperCase()}</Text>
          )}
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
  catTxt: { color: "#DDD", fontSize: 11, fontWeight: "700" },
  submit: { marginTop: 24, padding: 15, borderRadius: 10, alignItems: "center" },
  submitTxt: { color: "#000", fontSize: 12, fontWeight: "900", letterSpacing: 2 },
  imgBox: { width: 90, height: 90, marginRight: 8, borderRadius: 8, overflow: "hidden", position: "relative" },
  img: { width: "100%", height: "100%" },
  rm: { position: "absolute", top: 4, right: 4, backgroundColor: "rgba(0,0,0,0.7)", width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  addImg: { width: 90, height: 90, borderRadius: 8, borderWidth: 1, borderColor: "#2A2A2A", borderStyle: "dashed", alignItems: "center", justifyContent: "center", backgroundColor: "#0A0A0A" },

  // Seletor de tier
  tierRow: { flexDirection: "row", gap: 8 },
  tierChip: {
    flex: 1,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    paddingVertical: 10, paddingHorizontal: 6,
    borderRadius: 10, borderWidth: 1,
  },
  tierChipTxt: { color: "#888", fontSize: 11, fontWeight: "900", letterSpacing: 1.2 },

  // Preview do tema
  themePreview: {
    flexDirection: "row", alignItems: "center", gap: 10,
    marginTop: 10, paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 10, borderWidth: 1,
  },
  themeDot: { width: 10, height: 10, borderRadius: 5 },
  themeTitle: { fontSize: 11, fontWeight: "900", letterSpacing: 1.5 },
  themeSub: { color: "#888", fontSize: 10.5, fontWeight: "600", marginTop: 2 },
});

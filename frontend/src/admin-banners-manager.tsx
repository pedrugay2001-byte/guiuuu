import { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, Switch, Image, Platform,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "./icons";
import { api, HomeBanner, HomeBannerInput } from "./api";
import { theme } from "./theme";

const CATEGORIES: { id: "novidade" | "noticia" | "promocao"; label: string; color: string; icon: string }[] = [
  { id: "novidade", label: "Novidade",  color: "#4FD1C5", icon: "sparkles" },
  { id: "noticia",  label: "Notícia",   color: "#5BA8F0", icon: "newspaper-outline" },
  { id: "promocao", label: "Promoção",  color: "#E67A35", icon: "pricetag-outline" },
];

const emptyForm: HomeBannerInput = {
  title: "",
  subtitle: "",
  image_url: "",
  image_base64: "",
  cta_label: "",
  cta_route: "",
  accent_color: "#C89A3A",
  category: "novidade",
  active: true,
  order: 0,
};

export default function AdminBannersManager() {
  const [list, setList] = useState<HomeBanner[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<HomeBannerInput>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.adminListHomeBanners();
      setList(data || []);
    } catch (e: any) {
      Alert.alert("Erro ao carregar", e?.message || "Tente novamente");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
  };

  const startEdit = (b: HomeBanner) => {
    setForm({
      title: b.title || "",
      subtitle: b.subtitle || "",
      image_url: b.image_url || "",
      image_base64: b.image_base64 || "",
      cta_label: b.cta_label || "",
      cta_route: b.cta_route || "",
      accent_color: b.accent_color || "#C89A3A",
      category: (b.category as any) || "novidade",
      active: !!b.active,
      order: b.order || 0,
    });
    setEditingId(b.banner_id);
    setShowForm(true);
  };

  const pickImage = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permissão negada", "Conceda acesso à galeria para selecionar uma imagem.");
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.6,
        base64: true,
        aspect: [16, 9],
        allowsEditing: false,
      });
      if (res.canceled) return;
      const asset = res.assets[0];
      if (asset?.base64) {
        setUploading(true);
        setForm((f) => ({ ...f, image_base64: asset.base64 || "", image_url: "" }));
        setUploading(false);
      }
    } catch (e: any) {
      setUploading(false);
      Alert.alert("Erro ao selecionar", e?.message || "Tente novamente");
    }
  };

  const save = async () => {
    if (!form.title?.trim()) {
      Alert.alert("Título obrigatório", "Informe o título do banner.");
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await api.adminUpdateHomeBanner(editingId, form);
      } else {
        await api.adminCreateHomeBanner(form);
      }
      resetForm();
      await load();
    } catch (e: any) {
      Alert.alert("Erro ao salvar", e?.message || "Tente novamente");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (b: HomeBanner) => {
    try {
      await api.adminUpdateHomeBanner(b.banner_id, { active: !b.active });
      await load();
    } catch (e: any) {
      Alert.alert("Erro", e?.message || "Tente novamente");
    }
  };

  const remove = (b: HomeBanner) => {
    Alert.alert("Excluir banner", `Remover "${b.title}"?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Excluir", style: "destructive", onPress: async () => {
          try { await api.adminDeleteHomeBanner(b.banner_id); await load(); }
          catch (e: any) { Alert.alert("Erro", e?.message || "Tente novamente"); }
        } },
    ]);
  };

  const imgPreviewSrc = form.image_base64
    ? `data:image/jpeg;base64,${form.image_base64}`
    : form.image_url || null;

  return (
    <View>
      {/* Header da seção */}
      <View style={[styles.headerRow, { marginTop: 8 }]}>
        <View>
          <Text style={styles.kicker}>PAINEL ROTATIVO</Text>
          <Text style={styles.title}>BANNERS DA HOME</Text>
          <Text style={styles.sub}>
            Notícias, promoções e novidades exibidas no carrossel da Home. Troca automática a cada 10s.
          </Text>
        </View>
      </View>

      {!showForm ? (
        <TouchableOpacity style={styles.addBtn} onPress={() => { setForm(emptyForm); setEditingId(null); setShowForm(true); }}>
          <Ionicons name="add" size={16} color={theme.colors.bg} />
          <Text style={styles.addBtnText}>NOVO BANNER</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>{editingId ? "EDITAR BANNER" : "NOVO BANNER"}</Text>

          {/* Categoria */}
          <Text style={styles.label}>CATEGORIA</Text>
          <View style={styles.catRow}>
            {CATEGORIES.map((c) => {
              const active = form.category === c.id;
              return (
                <TouchableOpacity
                  key={c.id}
                  onPress={() => setForm((f) => ({ ...f, category: c.id }))}
                  style={[styles.catChip, active && { borderColor: c.color, backgroundColor: c.color + "22" }]}
                >
                  <Ionicons name={c.icon as any} size={12} color={c.color} />
                  <Text style={[styles.catChipTxt, active && { color: c.color }]}>{c.label.toUpperCase()}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Título */}
          <Text style={styles.label}>TÍTULO *</Text>
          <TextInput
            value={form.title}
            onChangeText={(v) => setForm((f) => ({ ...f, title: v }))}
            style={styles.input}
            placeholder="Ex: Nova coleção Diamante 2026"
            placeholderTextColor={theme.colors.textMuted}
          />

          {/* Subtítulo */}
          <Text style={styles.label}>SUBTÍTULO</Text>
          <TextInput
            value={form.subtitle}
            onChangeText={(v) => setForm((f) => ({ ...f, subtitle: v }))}
            style={[styles.input, { minHeight: 60 }]}
            placeholder="Descrição curta (opcional)"
            placeholderTextColor={theme.colors.textMuted}
            multiline
          />

          {/* Imagem */}
          <Text style={styles.label}>IMAGEM (16:9 recomendado)</Text>
          {imgPreviewSrc ? (
            <View style={styles.imgPreviewWrap}>
              <Image source={{ uri: imgPreviewSrc }} style={styles.imgPreview} resizeMode="cover" />
              <TouchableOpacity
                style={styles.imgRemove}
                onPress={() => setForm((f) => ({ ...f, image_base64: "", image_url: "" }))}
              >
                <Ionicons name="close-circle" size={22} color="#FFF" />
              </TouchableOpacity>
            </View>
          ) : null}
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity style={styles.secondaryBtn} onPress={pickImage} disabled={uploading}>
              {uploading ? <ActivityIndicator color={theme.colors.white} size="small" /> : (
                <>
                  <Ionicons name="image" size={14} color={theme.colors.white} />
                  <Text style={styles.secondaryBtnText}>SELECIONAR DA GALERIA</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
          <Text style={[styles.label, { marginTop: 8 }]}>OU URL DA IMAGEM</Text>
          <TextInput
            value={form.image_url}
            onChangeText={(v) => setForm((f) => ({ ...f, image_url: v, image_base64: "" }))}
            style={styles.input}
            placeholder="https://..."
            placeholderTextColor={theme.colors.textMuted}
            autoCapitalize="none"
          />

          {/* CTA */}
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>BOTÃO (LABEL)</Text>
              <TextInput
                value={form.cta_label}
                onChangeText={(v) => setForm((f) => ({ ...f, cta_label: v }))}
                style={styles.input}
                placeholder="Ex: VER MAIS"
                placeholderTextColor={theme.colors.textMuted}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>ROTA AO CLICAR</Text>
              <TextInput
                value={form.cta_route}
                onChangeText={(v) => setForm((f) => ({ ...f, cta_route: v }))}
                style={styles.input}
                placeholder="/catalog/niches"
                placeholderTextColor={theme.colors.textMuted}
                autoCapitalize="none"
              />
            </View>
          </View>

          {/* Cor de destaque + Ordem */}
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>COR DE DESTAQUE</Text>
              <TextInput
                value={form.accent_color}
                onChangeText={(v) => setForm((f) => ({ ...f, accent_color: v }))}
                style={styles.input}
                placeholder="#C89A3A"
                placeholderTextColor={theme.colors.textMuted}
                autoCapitalize="none"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>ORDEM</Text>
              <TextInput
                value={String(form.order ?? 0)}
                onChangeText={(v) => setForm((f) => ({ ...f, order: parseInt(v) || 0 }))}
                style={styles.input}
                placeholder="0"
                placeholderTextColor={theme.colors.textMuted}
                keyboardType="number-pad"
              />
            </View>
          </View>

          {/* Ativo */}
          <View style={styles.switchRow}>
            <Text style={styles.label}>ATIVO (visível na Home)</Text>
            <Switch
              value={!!form.active}
              onValueChange={(v) => setForm((f) => ({ ...f, active: v }))}
              trackColor={{ false: "#222", true: "#4FD1C5" }}
              thumbColor="#FFF"
            />
          </View>

          {/* Ações */}
          <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
            <TouchableOpacity style={[styles.secondaryBtn, { flex: 1 }]} onPress={resetForm} disabled={saving}>
              <Text style={styles.secondaryBtnText}>CANCELAR</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.primaryBtn, { flex: 1 }]} onPress={save} disabled={saving}>
              {saving ? <ActivityIndicator color={theme.colors.bg} /> : (
                <>
                  <Ionicons name="checkmark" size={14} color={theme.colors.bg} />
                  <Text style={styles.primaryBtnText}>{editingId ? "SALVAR" : "CRIAR"}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Listagem */}
      <View style={{ marginTop: 14 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={styles.kicker}>BANNERS CADASTRADOS</Text>
          <Text style={{ color: theme.colors.textMuted, fontSize: 11 }}>{list.length} total</Text>
        </View>

        {loading ? (
          <ActivityIndicator color={theme.colors.white} style={{ marginTop: 14 }} />
        ) : list.length === 0 ? (
          <Text style={{ color: theme.colors.textMuted, fontSize: 13, marginTop: 10 }}>
            Nenhum banner cadastrado ainda.
          </Text>
        ) : (
          <View style={{ gap: 8, marginTop: 10 }}>
            {list.map((b) => {
              const cat = CATEGORIES.find((c) => c.id === b.category) || CATEGORIES[0];
              const imgSrc = b.image_base64 ? `data:image/jpeg;base64,${b.image_base64}` : b.image_url;
              return (
                <View key={b.banner_id} style={[styles.row, !b.active && { opacity: 0.5 }]}>
                  {imgSrc ? (
                    <Image source={{ uri: imgSrc }} style={styles.rowThumb} resizeMode="cover" />
                  ) : (
                    <View style={[styles.rowThumb, { backgroundColor: "#111", alignItems: "center", justifyContent: "center" }]}>
                      <Ionicons name="image-outline" size={20} color="#444" />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <View style={[styles.rowCatBadge, { borderColor: cat.color + "AA" }]}>
                      <Ionicons name={cat.icon as any} size={9} color={cat.color} />
                      <Text style={[styles.rowCatTxt, { color: cat.color }]}>{cat.label.toUpperCase()}</Text>
                    </View>
                    <Text style={styles.rowName} numberOfLines={1}>{b.title}</Text>
                    {!!b.subtitle && (
                      <Text style={styles.rowMeta} numberOfLines={1}>{b.subtitle}</Text>
                    )}
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 4 }}>
                    <Switch
                      value={!!b.active}
                      onValueChange={() => toggleActive(b)}
                      trackColor={{ false: "#222", true: "#4FD1C5" }}
                      thumbColor="#FFF"
                    />
                    <View style={{ flexDirection: "row", gap: 4 }}>
                      <TouchableOpacity onPress={() => startEdit(b)} style={styles.rowBtn}>
                        <Ionicons name="create-outline" size={16} color="#5BA8F0" />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => remove(b)} style={styles.rowBtn}>
                        <Ionicons name="trash-outline" size={16} color={theme.colors.error} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { gap: 4 },
  kicker: { color: theme.colors.silver, fontSize: 11, fontWeight: "800", letterSpacing: 3 },
  title: {
    color: theme.colors.white, fontSize: 22, fontWeight: "900",
    letterSpacing: -0.4, marginTop: 4, textTransform: "uppercase",
  },
  sub: { color: theme.colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  addBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: theme.colors.white, paddingVertical: 12, borderRadius: 8,
    marginTop: 12,
  },
  addBtnText: { color: theme.colors.bg, fontWeight: "900", fontSize: 12, letterSpacing: 1 },
  formCard: {
    marginTop: 14, gap: 8,
    backgroundColor: theme.colors.surface,
    borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12,
    padding: 14,
  },
  formTitle: { color: "#C89A3A", fontSize: 12, fontWeight: "900", letterSpacing: 2, marginBottom: 4 },
  label: { color: theme.colors.silver, fontSize: 10, fontWeight: "800", letterSpacing: 1.5, marginTop: 6 },
  input: {
    backgroundColor: "#0B0D10",
    borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8,
    padding: 12, color: theme.colors.text, fontSize: 14, minHeight: 44,
  },
  catRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  catChip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 7, borderRadius: 6,
    borderWidth: 1, borderColor: theme.colors.border, backgroundColor: "#0B0D10",
  },
  catChipTxt: { color: theme.colors.textMuted, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  imgPreviewWrap: { width: "100%", aspectRatio: 16 / 9, borderRadius: 8, overflow: "hidden", position: "relative", marginTop: 4 },
  imgPreview: { width: "100%", height: "100%" },
  imgRemove: { position: "absolute", top: 6, right: 6, backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 12 },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 },
  primaryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: theme.colors.white, paddingVertical: 13, borderRadius: 8,
  },
  primaryBtnText: { color: theme.colors.bg, fontWeight: "900", fontSize: 12, letterSpacing: 1 },
  secondaryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: "#0B0D10", paddingVertical: 13, borderRadius: 8,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  secondaryBtnText: { color: theme.colors.white, fontWeight: "800", fontSize: 11, letterSpacing: 1 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 10,
    padding: 10, backgroundColor: theme.colors.surface,
    borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10,
  },
  rowThumb: { width: 70, height: 40, borderRadius: 6 },
  rowName: { color: theme.colors.white, fontSize: 13, fontWeight: "800", marginTop: 3 },
  rowMeta: { color: theme.colors.textMuted, fontSize: 11, marginTop: 1 },
  rowCatBadge: {
    flexDirection: "row", alignItems: "center", gap: 3, alignSelf: "flex-start",
    paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3, borderWidth: 1,
  },
  rowCatTxt: { fontSize: 8, fontWeight: "900", letterSpacing: 0.6 },
  rowBtn: { padding: 6 },
});

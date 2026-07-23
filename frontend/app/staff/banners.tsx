/**
 * Painel do Admin Master — gerenciamento dos banners da Home.
 *
 * Recursos:
 *  - Lista todos os banners (ativos + inativos), ordenados por `order`.
 *  - Adicionar novo banner: upload de imagem, título, subtítulo, CTA, categoria.
 *  - Editar: título/subtítulo/CTA/imagem/ordem/status ativo.
 *  - Ativar/desativar via switch inline.
 *  - Ordenar via botões ↑ ↓.
 *  - Deletar com confirmação.
 *
 * Não altera nada no aplicativo — só usa endpoints existentes `/api/admin/home-banners`.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Modal, Image, KeyboardAvoidingView, Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "../../src/icons";
import { api, HomeBanner, HomeBannerInput } from "../../src/api";
import { pickCompressedImage } from "../../src/imagepicker";
import { notify, confirm } from "../../src/alerts";
import { usePYXRate } from "../../src/pyx-rate";

const CATEGORIES = [
  { id: "novidade",  label: "NOVIDADE",  color: "#4FD1C5" },
  { id: "noticia",   label: "NOTÍCIA",   color: "#5BA8F0" },
  { id: "promocao",  label: "PROMOÇÃO",  color: "#E67A35" },
  { id: "evento",    label: "EVENTO",    color: "#A78BFA" },
  { id: "aviso",     label: "AVISO",     color: "#F5C150" },
  { id: "comunidade",label: "COMUNIDADE",color: "#4EE07F" },
  { id: "neutro",    label: "NEUTRO CLARO", color: "#C5C5C5" },
  { id: "escuro",    label: "NEUTRO ESCURO", color: "#5A5F66" },
];

/**
 * Paleta rica para "COR DE DESTAQUE" — organizada por família de cores.
 * Cada item tem `hex` (usado no accent_color) e `name` (tooltip visual).
 */
const ACCENT_PRESETS: { hex: string; name: string }[] = [
  // Dourados / prata (linha padrão BLACKSCLUB)
  { hex: "#F4D47A", name: "Dourado Claro" },
  { hex: "#D4AF37", name: "Dourado" },
  { hex: "#C89A3A", name: "Dourado Escuro" },
  { hex: "#F5C150", name: "Âmbar" },
  { hex: "#E5E7EB", name: "Prata" },

  // Cinzas (do mais claro ao mais escuro)
  { hex: "#F9FAFB", name: "Cinza Claríssimo" },
  { hex: "#B0B7BE", name: "Cinza Claro" },
  { hex: "#6B7280", name: "Cinza Médio" },
  { hex: "#4B5563", name: "Cinza Escuro" },
  { hex: "#1F2937", name: "Grafite" },

  // Verdes
  { hex: "#4EE07F", name: "Verde Neon" },
  { hex: "#10B981", name: "Verde Esmeralda" },

  // Vermelhos / Rosas
  { hex: "#F87171", name: "Vermelho Suave" },
  { hex: "#EF4444", name: "Vermelho" },
  { hex: "#EC4899", name: "Rosa" },

  // Azuis / Turquesa
  { hex: "#5BA8F0", name: "Azul Claro" },
  { hex: "#3B82F6", name: "Azul Real" },
  { hex: "#4FD1C5", name: "Turquesa" },
  { hex: "#06B6D4", name: "Ciano" },

  // Roxos
  { hex: "#A78BFA", name: "Lavanda" },
  { hex: "#8B5CF6", name: "Roxo" },

  // Laranjas
  { hex: "#F97316", name: "Laranja Vibrante" },
  { hex: "#E67A35", name: "Laranja Queimado" },

  // Neutros extremos
  { hex: "#0A0A0A", name: "Preto" },
  { hex: "#FFFFFF", name: "Branco" },
];

type EditorState = {
  open: boolean;
  banner: HomeBanner | null;   // null = criando
  title: string;
  subtitle: string;
  imageBase64: string;         // sem prefixo data:...
  imageUrl: string;
  ctaLabel: string;
  ctaRoute: string;
  category: string;
  hideCategory: boolean;
  accent: string;
  active: boolean;
  order: number;
  saving: boolean;
};

const emptyEditor = (): EditorState => ({
  open: false,
  banner: null,
  title: "",
  subtitle: "",
  imageBase64: "",
  imageUrl: "",
  ctaLabel: "",
  ctaRoute: "",
  category: "novidade",
  hideCategory: false,
  accent: "#C89A3A",
  active: true,
  order: 0,
  saving: false,
});

export default function AdminBannersScreen() {
  const router = useRouter();
  const [banners, setBanners] = useState<HomeBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState<EditorState>(emptyEditor());
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.adminListHomeBanners();
      setBanners(list);
    } catch (e: any) {
      notify("Erro ao carregar banners", e?.message || "Tente novamente");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    const maxOrder = banners.reduce((m, b) => Math.max(m, b.order), 0);
    setEditor({ ...emptyEditor(), open: true, order: maxOrder + 1 });
  };

  const openEdit = (b: HomeBanner) => {
    setEditor({
      open: true, banner: b,
      title: b.title, subtitle: b.subtitle || "",
      imageBase64: (b.image_base64 || "").replace(/^data:image\/[a-z]+;base64,/, ""),
      imageUrl: b.image_url || "",
      ctaLabel: b.cta_label || "",
      ctaRoute: b.cta_route || "",
      category: b.category || "novidade",
      hideCategory: b.hide_category === true,
      accent: b.accent_color || "#C89A3A",
      active: b.active !== false,
      order: b.order || 0,
      saving: false,
    });
  };

  const closeEditor = () => setEditor(emptyEditor());

  const pickImage = async () => {
    const b64 = await pickCompressedImage({ aspect: [16, 9], quality: 0.7 });
    if (b64) {
      // pickCompressedImage retorna com prefixo — vamos remover para armazenar apenas o base64 puro
      const raw = b64.replace(/^data:image\/[a-z]+;base64,/, "");
      setEditor((e) => ({ ...e, imageBase64: raw, imageUrl: "" }));
    }
  };

  const save = async () => {
    if (!editor.title.trim()) {
      notify("Título obrigatório", "Informe o título do banner");
      return;
    }
    setEditor((e) => ({ ...e, saving: true }));
    try {
      const payload: HomeBannerInput = {
        title: editor.title.trim(),
        subtitle: editor.subtitle.trim(),
        image_base64: editor.imageBase64,
        image_url: editor.imageUrl.trim(),
        cta_label: editor.ctaLabel.trim(),
        cta_route: editor.ctaRoute.trim(),
        category: editor.category,
        hide_category: editor.hideCategory,
        accent_color: editor.accent,
        active: editor.active,
        order: editor.order,
      };
      if (editor.banner) {
        await api.adminUpdateHomeBanner(editor.banner.banner_id, payload);
        notify("Banner atualizado");
      } else {
        await api.adminCreateHomeBanner(payload);
        notify("Banner criado");
      }
      closeEditor();
      await load();
    } catch (e: any) {
      notify("Falha ao salvar", e?.message || "Tente novamente");
    } finally {
      setEditor((e) => ({ ...e, saving: false }));
    }
  };

  const toggleActive = async (b: HomeBanner) => {
    setBusyId(b.banner_id);
    try {
      await api.adminUpdateHomeBanner(b.banner_id, { active: !b.active });
      await load();
    } catch (e: any) {
      notify("Falha", e?.message || "Tente novamente");
    } finally {
      setBusyId(null);
    }
  };

  const move = async (b: HomeBanner, dir: -1 | 1) => {
    const idx = banners.findIndex((x) => x.banner_id === b.banner_id);
    const neighbor = banners[idx + dir];
    if (!neighbor) return;
    setBusyId(b.banner_id);
    try {
      await Promise.all([
        api.adminUpdateHomeBanner(b.banner_id, { order: neighbor.order }),
        api.adminUpdateHomeBanner(neighbor.banner_id, { order: b.order }),
      ]);
      await load();
    } catch (e: any) {
      notify("Falha ao reordenar", e?.message || "Tente novamente");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (b: HomeBanner) => {
    const ok = await confirm(`Excluir "${b.title}"?`, "Esta ação não pode ser desfeita.");
    if (!ok) return;
    setBusyId(b.banner_id);
    try {
      await api.adminDeleteHomeBanner(b.banner_id);
      await load();
    } catch (e: any) {
      notify("Falha", e?.message || "Tente novamente");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#050505" }}>
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom", "left", "right"]}>
        <View style={s.topBar}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()} testID="banners-back">
            <Ionicons name="chevron-back" size={22} color="#FFF" />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={s.title}>BANNERS DA HOME</Text>
            <Text style={s.sub}>{banners.length} banner{banners.length === 1 ? "" : "s"}</Text>
          </View>
          <TouchableOpacity style={s.newBtn} onPress={openCreate} testID="banners-new">
            <Ionicons name="add" size={22} color="#0A0A0A" />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color="#D4AF37" />
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40 }}>
            {/* Painel Financeiro (hero) — imagem de fundo do banner principal da Home */}
            <FinanceHeroImageManager />

            {/* Título da seção de banners promocionais */}
            <Text style={s.sectionTitle}>BANNERS PROMOCIONAIS (CARROSSEL INFERIOR)</Text>

            {banners.length === 0 ? (
              <View style={s.emptyBox}>
                <Ionicons name="images-outline" size={40} color="#2E2E2E" />
                <Text style={s.emptyTxt}>Nenhum banner cadastrado</Text>
                <TouchableOpacity style={s.emptyCta} onPress={openCreate} testID="banners-empty-cta">
                  <Ionicons name="add" size={16} color="#0A0A0A" />
                  <Text style={s.emptyCtaTxt}>ADICIONAR PRIMEIRO BANNER</Text>
                </TouchableOpacity>
              </View>
            ) : (
              banners.map((b, idx) => (
                <BannerListItem
                  key={b.banner_id}
                  banner={b}
                  canUp={idx > 0}
                  canDown={idx < banners.length - 1}
                  busy={busyId === b.banner_id}
                  onEdit={() => openEdit(b)}
                  onToggle={() => toggleActive(b)}
                  onDelete={() => remove(b)}
                  onMoveUp={() => move(b, -1)}
                  onMoveDown={() => move(b, 1)}
                />
              ))
            )}
          </ScrollView>
        )}
      </SafeAreaView>

      {/* Editor Modal */}
      <BannerEditorModal
        state={editor}
        setState={setEditor}
        onClose={closeEditor}
        onSave={save}
        onPickImage={pickImage}
      />
    </View>
  );
}

/**
 * FinanceHeroImageManager — bloco do topo da tela admin para gerenciar
 * a imagem de fundo do PAINEL FINANCEIRO (hero) da home. É separado da
 * lista de banners promocionais porque só existe UMA imagem hero.
 */
function FinanceHeroImageManager() {
  const { rate, refresh } = usePYXRate();
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<null | "upload" | "url" | "reset">(null);
  const [urlInput, setUrlInput] = useState("");

  useEffect(() => {
    if (rate?.finance_hero_image_url) setUrlInput(rate.finance_hero_image_url);
  }, [rate?.finance_hero_image_url]);

  const currentPreview =
    (rate?.finance_hero_image_base64 && rate.finance_hero_image_base64) ||
    (rate?.finance_hero_image_url && rate.finance_hero_image_url) ||
    "";

  const upload = async () => {
    setBusy("upload");
    try {
      const b64 = await pickCompressedImage({ aspect: [16, 9], quality: 0.75 });
      if (!b64) { setBusy(null); return; }
      setSaving(true);
      await api.pyxFinanceHeroSet({ image_base64: b64, image_url: "" });
      await refresh();
      notify("Imagem atualizada", "O painel financeiro foi atualizado com sucesso.");
    } catch (e: any) {
      notify("Falha", e?.message || "Não foi possível salvar a imagem");
    } finally {
      setBusy(null);
      setSaving(false);
    }
  };

  const saveUrl = async () => {
    setBusy("url"); setSaving(true);
    try {
      await api.pyxFinanceHeroSet({ image_url: urlInput.trim(), image_base64: "" });
      await refresh();
      notify("URL salva", "Painel financeiro atualizado.");
    } catch (e: any) {
      notify("Falha", e?.message || "Tente novamente");
    } finally {
      setBusy(null); setSaving(false);
    }
  };

  const reset = async () => {
    const ok = await confirm("Voltar ao padrão?", "A imagem atual será removida e o SVG default premium voltará a ser exibido.");
    if (!ok) return;
    setBusy("reset"); setSaving(true);
    try {
      await api.pyxFinanceHeroSet({ image_base64: "", image_url: "" });
      setUrlInput("");
      await refresh();
      notify("Imagem removida", "Voltamos ao SVG padrão.");
    } catch (e: any) {
      notify("Falha", e?.message || "Tente novamente");
    } finally {
      setBusy(null); setSaving(false);
    }
  };

  return (
    <View style={s.heroBox}>
      <View style={s.heroHead}>
        <View style={s.heroKickerRow}>
          <Ionicons name="diamond" size={12} color="#D4AF37" />
          <Text style={s.heroKicker}>PAINEL FINANCEIRO — HERO</Text>
        </View>
        <Text style={s.heroSub}>Imagem de fundo do banner principal da home</Text>
      </View>

      {/* Preview 16:9 */}
      <View style={s.heroPreviewBox}>
        {currentPreview ? (
          <Image source={{ uri: currentPreview }} style={s.heroPreviewImg} resizeMode="cover" />
        ) : (
          <View style={s.heroPreviewEmpty}>
            <Ionicons name="images-outline" size={30} color="#4A4A4A" />
            <Text style={s.heroPreviewEmptyTxt}>Usando SVG default (verde + dourado)</Text>
          </View>
        )}
      </View>

      {/* Actions */}
      <View style={s.heroActions}>
        <TouchableOpacity
          style={[s.heroBtnPrimary, saving && { opacity: 0.6 }]}
          onPress={upload}
          disabled={saving}
          testID="hero-upload"
          activeOpacity={0.85}
        >
          {busy === "upload" ? (
            <ActivityIndicator color="#0A0A0A" size="small" />
          ) : (
            <>
              <Ionicons name="cloud-upload-outline" size={16} color="#0A0A0A" />
              <Text style={s.heroBtnPrimaryTxt}>ENVIAR IMAGEM</Text>
            </>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.heroBtnGhost, (saving || !currentPreview) && { opacity: 0.4 }]}
          onPress={reset}
          disabled={saving || !currentPreview}
          testID="hero-reset"
          activeOpacity={0.85}
        >
          {busy === "reset" ? (
            <ActivityIndicator color="#F87171" size="small" />
          ) : (
            <>
              <Ionicons name="refresh" size={16} color="#F87171" />
              <Text style={s.heroBtnGhostTxt}>PADRÃO</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* URL alternativa */}
      <Text style={s.heroLabel}>OU URL DA IMAGEM</Text>
      <View style={s.heroUrlRow}>
        <TextInput
          style={s.heroUrlInput}
          value={urlInput}
          onChangeText={setUrlInput}
          placeholder="https://exemplo.com/finance-hero.jpg"
          placeholderTextColor="#5A5A5A"
          autoCapitalize="none"
          testID="hero-url-input"
        />
        <TouchableOpacity
          style={[s.heroUrlBtn, (!urlInput.trim() || saving) && { opacity: 0.4 }]}
          onPress={saveUrl}
          disabled={!urlInput.trim() || saving}
          testID="hero-url-save"
        >
          {busy === "url" ? <ActivityIndicator color="#0A0A0A" size="small" /> : (
            <Ionicons name="checkmark" size={16} color="#0A0A0A" />
          )}
        </TouchableOpacity>
      </View>
      <Text style={s.heroHint}>Proporção recomendada: 16:9 · fundo escuro com detalhes dourados/verde</Text>
    </View>
  );
}

function BannerListItem({
  banner: b, canUp, canDown, busy, onEdit, onToggle, onDelete, onMoveUp, onMoveDown,
}: {
  banner: HomeBanner;
  canUp: boolean; canDown: boolean; busy: boolean;
  onEdit: () => void; onToggle: () => void; onDelete: () => void;
  onMoveUp: () => void; onMoveDown: () => void;
}) {
  const cat = CATEGORIES.find((c) => c.id === (b.category || "novidade")) || CATEGORIES[0];
  const preview = b.image_base64
    ? `data:image/jpeg;base64,${b.image_base64.replace(/^data:image\/[a-z]+;base64,/, "")}`
    : (b.image_url || "");
  return (
    <View style={s.item} testID={`banner-item-${b.banner_id}`}>
      <View style={s.itemThumb}>
        {preview ? (
          <Image source={{ uri: preview }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
        ) : (
          <Ionicons name="image-outline" size={26} color="#3A3A3A" />
        )}
        {!b.active && (
          <View style={s.thumbDim}>
            <Text style={s.thumbDimTxt}>INATIVO</Text>
          </View>
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={s.itemHead}>
          <View style={[s.catPill, { borderColor: cat.color + "80" }]}>
            <Text style={[s.catPillTxt, { color: cat.color }]}>{cat.label}</Text>
          </View>
          <Text style={s.itemOrder}>#{b.order}</Text>
        </View>
        <Text style={s.itemTitle} numberOfLines={1}>{b.title}</Text>
        {b.subtitle ? <Text style={s.itemSub} numberOfLines={2}>{b.subtitle}</Text> : null}
        <View style={s.itemActions}>
          <TouchableOpacity
            style={[s.itemBtn, !canUp && s.itemBtnDisabled]} onPress={onMoveUp} disabled={!canUp || busy}
            testID={`banner-up-${b.banner_id}`}
          >
            <Ionicons name="arrow-up" size={14} color={canUp ? "#EEE" : "#444"} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.itemBtn, !canDown && s.itemBtnDisabled]} onPress={onMoveDown} disabled={!canDown || busy}
            testID={`banner-down-${b.banner_id}`}
          >
            <Ionicons name="arrow-down" size={14} color={canDown ? "#EEE" : "#444"} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.itemBtn, { borderColor: b.active ? "#4EE07F55" : "#3A3A3A" }]}
            onPress={onToggle} disabled={busy}
            testID={`banner-toggle-${b.banner_id}`}
          >
            <Ionicons name={b.active ? "eye" : "eye-off"} size={14} color={b.active ? "#4EE07F" : "#8A8A8A"} />
            <Text style={[s.itemBtnTxt, { color: b.active ? "#4EE07F" : "#8A8A8A" }]}>
              {b.active ? "ATIVO" : "OFF"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.itemBtn} onPress={onEdit} disabled={busy} testID={`banner-edit-${b.banner_id}`}>
            <Ionicons name="pencil" size={13} color="#D4AF37" />
            <Text style={[s.itemBtnTxt, { color: "#D4AF37" }]}>EDITAR</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.itemBtn, { borderColor: "#F8717155" }]}
            onPress={onDelete} disabled={busy}
            testID={`banner-delete-${b.banner_id}`}
          >
            <Ionicons name="trash" size={13} color="#F87171" />
          </TouchableOpacity>
        </View>
      </View>
      {busy ? (
        <View style={s.busyOverlay}>
          <ActivityIndicator color="#D4AF37" />
        </View>
      ) : null}
    </View>
  );
}

function BannerEditorModal({
  state, setState, onClose, onSave, onPickImage,
}: {
  state: EditorState;
  setState: React.Dispatch<React.SetStateAction<EditorState>>;
  onClose: () => void;
  onSave: () => void;
  onPickImage: () => void;
}) {
  const preview = useMemo(() => {
    if (state.imageBase64) return `data:image/jpeg;base64,${state.imageBase64}`;
    if (state.imageUrl) return state.imageUrl;
    return null;
  }, [state.imageBase64, state.imageUrl]);

  return (
    <Modal visible={state.open} animationType="slide" transparent onRequestClose={onClose}>
      <SafeAreaView style={s.modalBackdrop} edges={["bottom"]}>
        <View style={s.modalSheet}>
          <View style={s.modalHead}>
            <TouchableOpacity onPress={onClose} testID="banner-editor-close">
              <Ionicons name="close" size={22} color="#EEE" />
            </TouchableOpacity>
            <Text style={s.modalTitle}>
              {state.banner ? "EDITAR BANNER" : "NOVO BANNER"}
            </Text>
            <TouchableOpacity
              style={[s.modalSave, (state.saving || !state.title.trim()) && { opacity: 0.5 }]}
              onPress={onSave}
              disabled={state.saving || !state.title.trim()}
              testID="banner-editor-save"
            >
              {state.saving ? <ActivityIndicator color="#0A0A0A" size="small" /> : (
                <>
                  <Ionicons name="checkmark" size={16} color="#0A0A0A" />
                  <Text style={s.modalSaveTxt}>SALVAR</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40 }}>
              {/* Imagem */}
              <Text style={s.label}>IMAGEM</Text>
              <TouchableOpacity
                style={s.imageBox}
                onPress={onPickImage}
                testID="banner-editor-pick-image"
                activeOpacity={0.85}
              >
                {preview ? (
                  <Image source={{ uri: preview }} style={s.imagePreview} resizeMode="cover" />
                ) : (
                  <View style={s.imageEmpty}>
                    <Ionicons name="cloud-upload-outline" size={40} color="#4A4A4A" />
                    <Text style={s.imageEmptyTxt}>Toque para enviar imagem (16:9)</Text>
                  </View>
                )}
                <View style={s.imageOverlay}>
                  <Ionicons name="camera" size={14} color="#FFF" />
                  <Text style={s.imageOverlayTxt}>Alterar imagem</Text>
                </View>
              </TouchableOpacity>
              <Text style={s.hint}>Recomendado: proporção 16:9, min 800×450px.</Text>

              {/* URL alternativa */}
              <Text style={s.label}>OU URL DA IMAGEM (opcional)</Text>
              <TextInput
                style={s.input}
                value={state.imageUrl}
                onChangeText={(t) => setState((e) => ({ ...e, imageUrl: t, imageBase64: t ? "" : e.imageBase64 }))}
                placeholder="https://exemplo.com/imagem.jpg"
                placeholderTextColor="#5A5A5A"
                autoCapitalize="none"
                testID="banner-editor-image-url"
              />

              {/* Título */}
              <Text style={s.label}>TÍTULO *</Text>
              <TextInput
                style={s.input}
                value={state.title}
                onChangeText={(t) => setState((e) => ({ ...e, title: t }))}
                placeholder="Ex.: Novidade — Chegou o PYX!"
                placeholderTextColor="#5A5A5A"
                maxLength={60}
                testID="banner-editor-title"
              />

              {/* Subtítulo */}
              <Text style={s.label}>SUBTÍTULO</Text>
              <TextInput
                style={[s.input, { minHeight: 60, textAlignVertical: "top" }]}
                value={state.subtitle}
                onChangeText={(t) => setState((e) => ({ ...e, subtitle: t }))}
                placeholder="Descrição curta (2 linhas)"
                placeholderTextColor="#5A5A5A"
                multiline
                maxLength={140}
                testID="banner-editor-subtitle"
              />

              {/* Categoria */}
              <Text style={s.label}>CATEGORIA</Text>
              <View style={s.row}>
                {CATEGORIES.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    style={[
                      s.catBtn,
                      state.category === c.id && { borderColor: c.color, backgroundColor: c.color + "18" },
                    ]}
                    onPress={() => setState((e) => ({ ...e, category: c.id }))}
                    testID={`banner-editor-cat-${c.id}`}
                  >
                    <Text style={[s.catBtnTxt, state.category === c.id && { color: c.color }]}>{c.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Ocultar nome da categoria */}
              <TouchableOpacity
                style={[s.hideCatRow, state.hideCategory && { borderColor: "#F5C15055" }]}
                onPress={() => setState((e) => ({ ...e, hideCategory: !e.hideCategory }))}
                testID="banner-editor-hide-category"
                activeOpacity={0.8}
              >
                <Ionicons
                  name={state.hideCategory ? "checkbox" : "square-outline"}
                  size={18}
                  color={state.hideCategory ? "#F5C150" : "#6B6B6B"}
                />
                <View style={{ flex: 1 }}>
                  <Text style={s.hideCatTitle}>Ocultar nome da categoria</Text>
                  <Text style={s.hideCatSub}>
                    O banner é exibido normalmente, mas sem o selo da categoria sobre a imagem.
                  </Text>
                </View>
              </TouchableOpacity>

              {/* CTA */}
              <Text style={s.label}>BOTÃO DE AÇÃO (opcional)</Text>
              <TextInput
                style={s.input}
                value={state.ctaLabel}
                onChangeText={(t) => setState((e) => ({ ...e, ctaLabel: t }))}
                placeholder="Texto do botão (ex.: Ver mais)"
                placeholderTextColor="#5A5A5A"
                maxLength={20}
                testID="banner-editor-cta-label"
              />
              <TextInput
                style={[s.input, { marginTop: 8 }]}
                value={state.ctaRoute}
                onChangeText={(t) => setState((e) => ({ ...e, ctaRoute: t }))}
                placeholder="Rota interna (ex.: /pyx/history)"
                placeholderTextColor="#5A5A5A"
                autoCapitalize="none"
                testID="banner-editor-cta-route"
              />

              {/* Accent color */}
              <Text style={s.label}>COR DE DESTAQUE</Text>
              <View style={s.row}>
                {ACCENT_PRESETS.map((c) => (
                  <TouchableOpacity
                    key={c.hex}
                    style={[
                      s.color, { backgroundColor: c.hex },
                      state.accent === c.hex && s.colorSelected,
                    ]}
                    onPress={() => setState((e) => ({ ...e, accent: c.hex }))}
                    testID={`banner-editor-color-${c.hex.replace("#", "")}`}
                    accessibilityLabel={c.name}
                  >
                    {state.accent === c.hex && (
                      <Ionicons
                        name="checkmark"
                        size={16}
                        color={isDarkHex(c.hex) ? "#FFF" : "#0A0A0A"}
                      />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
              {/* Nome da cor selecionada (feedback visual) */}
              <Text style={s.colorSelectedName}>
                {ACCENT_PRESETS.find((c) => c.hex === state.accent)?.name || state.accent}
              </Text>

              {/* Ordem + Ativo */}
              <View style={s.rowGap}>
                <View style={{ flex: 1 }}>
                  <Text style={s.label}>ORDEM</Text>
                  <TextInput
                    style={s.input}
                    value={String(state.order)}
                    onChangeText={(t) => setState((e) => ({ ...e, order: parseInt(t || "0", 10) || 0 }))}
                    keyboardType="number-pad"
                    testID="banner-editor-order"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.label}>STATUS</Text>
                  <TouchableOpacity
                    style={[
                      s.input,
                      {
                        flexDirection: "row", alignItems: "center", gap: 8,
                        borderColor: state.active ? "#4EE07F55" : "#3A3A3A",
                      },
                    ]}
                    onPress={() => setState((e) => ({ ...e, active: !e.active }))}
                    testID="banner-editor-active"
                  >
                    <Ionicons
                      name={state.active ? "eye" : "eye-off"}
                      size={16}
                      color={state.active ? "#4EE07F" : "#8A8A8A"}
                    />
                    <Text style={{ color: state.active ? "#4EE07F" : "#8A8A8A", fontSize: 13, fontWeight: "800" }}>
                      {state.active ? "ATIVO" : "INATIVO"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({
  topBar: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 12,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#141414",
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { color: "#FFF", fontSize: 13, fontWeight: "900", letterSpacing: 2 },
  sub: { color: "#8A8A8A", fontSize: 10.5, fontWeight: "700", letterSpacing: 1, marginTop: 2 },
  newBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "#F5C150",
  },

  emptyBox: { alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  emptyTxt: { color: "#6B6B6B", fontSize: 13 },
  emptyCta: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 18, paddingVertical: 12,
    backgroundColor: "#F5C150", borderRadius: 10,
  },
  emptyCtaTxt: { color: "#0A0A0A", fontSize: 11.5, fontWeight: "900", letterSpacing: 1.5 },
  hideCatRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    marginTop: 10, padding: 12,
    backgroundColor: "#0E0E0E", borderWidth: 1, borderColor: "#242424",
    borderRadius: 10,
  },
  hideCatTitle: { color: "#EDEDED", fontSize: 12.5, fontWeight: "800" },
  hideCatSub: { color: "#8A8A8A", fontSize: 11, marginTop: 2 },

  // Section title (BANNERS PROMOCIONAIS)
  sectionTitle: {
    color: "#8A8A8A", fontSize: 10, fontWeight: "900", letterSpacing: 2,
    marginTop: 26, marginBottom: 10,
  },

  // FinanceHeroImageManager
  heroBox: {
    padding: 14, borderRadius: 12,
    backgroundColor: "#0A0A0A",
    borderWidth: 1, borderColor: "rgba(212,175,55,0.30)",
    marginBottom: 6,
  },
  heroHead: { marginBottom: 12 },
  heroKickerRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  heroKicker: { color: "#D4AF37", fontSize: 10.5, fontWeight: "900", letterSpacing: 1.6 },
  heroSub: { color: "#7A7A7A", fontSize: 11.5, marginTop: 3 },
  heroPreviewBox: {
    width: "100%", aspectRatio: 16 / 9,
    borderRadius: 10, overflow: "hidden",
    borderWidth: 1, borderColor: "#1F1F1F",
    backgroundColor: "#0E0E0E",
  },
  heroPreviewImg: { width: "100%", height: "100%" },
  heroPreviewEmpty: {
    flex: 1, alignItems: "center", justifyContent: "center", gap: 8, padding: 12,
  },
  heroPreviewEmptyTxt: { color: "#7A7A7A", fontSize: 11.5, textAlign: "center" },
  heroActions: { flexDirection: "row", gap: 8, marginTop: 10 },
  heroBtnPrimary: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    paddingVertical: 12, borderRadius: 10,
    backgroundColor: "#F5C150",
  },
  heroBtnPrimaryTxt: { color: "#0A0A0A", fontSize: 11.5, fontWeight: "900", letterSpacing: 1.4 },
  heroBtnGhost: {
    paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    paddingVertical: 12, borderRadius: 10,
    backgroundColor: "#0E0E0E", borderWidth: 1, borderColor: "#3A1414",
  },
  heroBtnGhostTxt: { color: "#F87171", fontSize: 11, fontWeight: "900", letterSpacing: 1.4 },
  heroLabel: {
    color: "#8A8A8A", fontSize: 10, fontWeight: "900", letterSpacing: 1.6,
    marginTop: 14, marginBottom: 6,
  },
  heroUrlRow: { flexDirection: "row", gap: 8 },
  heroUrlInput: {
    flex: 1, color: "#FFF", fontSize: 13,
    paddingVertical: 10, paddingHorizontal: 12,
    backgroundColor: "#0E0E0E", borderRadius: 10,
    borderWidth: 1, borderColor: "#1A1A1A",
  },
  heroUrlBtn: {
    width: 46, alignItems: "center", justifyContent: "center",
    borderRadius: 10, backgroundColor: "#F5C150",
  },
  heroHint: { color: "#5A5A5A", fontSize: 10.5, marginTop: 6, fontStyle: "italic" },

  item: {
    flexDirection: "row", gap: 12,
    padding: 12, backgroundColor: "#0A0A0A",
    borderRadius: 12, borderWidth: 1, borderColor: "#171717",
    marginBottom: 10,
    position: "relative",
  },
  itemThumb: {
    width: 90, height: 60, borderRadius: 8, overflow: "hidden",
    backgroundColor: "#141414",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "#1F1F1F",
    position: "relative",
  },
  thumbDim: {
    ...StyleSheet.absoluteFillObject as any,
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center", justifyContent: "center",
  },
  thumbDimTxt: { color: "#EEE", fontSize: 9, fontWeight: "900", letterSpacing: 1.5 },
  itemHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  catPill: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4,
    borderWidth: 1, backgroundColor: "rgba(0,0,0,0.4)",
  },
  catPillTxt: { fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  itemOrder: { color: "#7A7A7A", fontSize: 10.5, fontWeight: "800", letterSpacing: 0.5 },
  itemTitle: { color: "#FFF", fontSize: 13.5, fontWeight: "800", marginTop: 4 },
  itemSub: { color: "#8A8A8A", fontSize: 11, marginTop: 2, lineHeight: 14 },
  itemActions: { flexDirection: "row", gap: 6, marginTop: 8, flexWrap: "wrap" },
  itemBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 8, paddingVertical: 5,
    backgroundColor: "#101010",
    borderRadius: 6, borderWidth: 1, borderColor: "#212121",
  },
  itemBtnDisabled: { opacity: 0.4 },
  itemBtnTxt: { fontSize: 9.5, fontWeight: "900", letterSpacing: 1 },
  busyOverlay: {
    ...StyleSheet.absoluteFillObject as any,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center", justifyContent: "center",
    borderRadius: 12,
  },

  // Modal
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "flex-end" },
  modalSheet: {
    backgroundColor: "#0A0A0A", borderTopLeftRadius: 18, borderTopRightRadius: 18,
    borderTopWidth: 1, borderColor: "#1F1F1F",
    maxHeight: "94%", flex: 1,
  },
  modalHead: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: 14, borderBottomWidth: 1, borderColor: "#1A1A1A",
  },
  modalTitle: { color: "#FFF", fontSize: 12.5, fontWeight: "900", letterSpacing: 2 },
  modalSave: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "#F5C150", paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 8,
  },
  modalSaveTxt: { color: "#0A0A0A", fontSize: 11, fontWeight: "900", letterSpacing: 1.4 },

  label: {
    color: "#8A8A8A", fontSize: 10, fontWeight: "900", letterSpacing: 1.6,
    marginTop: 16, marginBottom: 8,
  },
  hint: { color: "#5A5A5A", fontSize: 10.5, marginTop: 4, fontStyle: "italic" },
  input: {
    color: "#FFF", fontSize: 14,
    padding: 12, backgroundColor: "#0E0E0E",
    borderRadius: 10, borderWidth: 1, borderColor: "#1A1A1A",
  },
  imageBox: {
    width: "100%", aspectRatio: 16 / 9,
    borderRadius: 12, overflow: "hidden",
    borderWidth: 1, borderColor: "#1F1F1F",
    backgroundColor: "#0E0E0E",
    position: "relative",
  },
  imagePreview: { width: "100%", height: "100%" },
  imageEmpty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6 },
  imageEmptyTxt: { color: "#7A7A7A", fontSize: 11.5, fontWeight: "700" },
  imageOverlay: {
    position: "absolute", right: 8, bottom: 8,
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 6, backgroundColor: "rgba(0,0,0,0.7)",
  },
  imageOverlayTxt: { color: "#FFF", fontSize: 10.5, fontWeight: "800", letterSpacing: 0.6 },
  row: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  rowGap: { flexDirection: "row", gap: 12 },
  catBtn: {
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 8, borderWidth: 1, borderColor: "#2A2A2A",
    backgroundColor: "#0E0E0E",
  },
  catBtnTxt: { color: "#8A8A8A", fontSize: 10.5, fontWeight: "900", letterSpacing: 1.2 },
  color: {
    width: 30, height: 30, borderRadius: 15,
    borderWidth: 1, borderColor: "#1A1A1A",
    alignItems: "center", justifyContent: "center",
  },
  colorSelected: {
    borderColor: "#FFF",
    borderWidth: 2,
    // pequeno realce quando selecionado
    ...Platform.select({
      web: { boxShadow: "0 0 0 2px rgba(255,255,255,0.15)" } as any,
      default: {
        shadowColor: "#FFF",
        shadowOpacity: 0.35,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 0 },
      },
    }),
  },
  colorSelectedName: {
    color: "#B0B7BE",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
    marginTop: 8,
    marginBottom: 4,
  },
});

/**
 * Retorna true se o hex representa uma cor "escura" (luminância baixa).
 * Usado para escolher a cor do ícone de check (branco em fundo escuro,
 * preto em fundo claro) — garante contraste legível.
 */
function isDarkHex(hex: string): boolean {
  const h = hex.replace("#", "");
  if (h.length !== 6) return false;
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  // Fórmula de luminância percebida (Rec. 601)
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  return y < 140;
}

import { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Switch,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api, Category } from "../../src/api";
import { theme } from "../../src/theme";

export default function AdminEdit() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEdit = Boolean(id);

  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("emagrecedores");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [memberPrice, setMemberPrice] = useState("");
  const [imageUrl, setImageUrl] = useState("https://images.unsplash.com/photo-1700225195232-c55a4e9db6aa?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2MzR8MHwxfHNlYXJjaHwxfHxibGFjayUyMGx1eHVyeSUyMHN1cHBsZW1lbnQlMjBib3R0bGV8ZW58MHx8fHwxNzc2ODAyNTA3fDA&ixlib=rb-4.1.0&q=85");
  const [stock, setStock] = useState("10");
  const [featured, setFeatured] = useState(false);
  const [loading, setLoading] = useState(false);
  const [initLoading, setInitLoading] = useState(isEdit);

  useEffect(() => {
    api.categories().then(setCategories);
  }, []);

  useEffect(() => {
    if (!id) return;
    api
      .product(id)
      .then((p) => {
        setName(p.name);
        setCategory(p.category);
        setDescription(p.description);
        setPrice(String(p.price));
        setMemberPrice(String(p.member_price));
        setImageUrl(p.image_url);
        setStock(String(p.stock));
        setFeatured(p.featured);
      })
      .finally(() => setInitLoading(false));
  }, [id]);

  const submit = async () => {
    if (!name || !price || !memberPrice) {
      Alert.alert("Erro", "Preencha nome, preço e preço de membro");
      return;
    }
    setLoading(true);
    try {
      const body = {
        name,
        category,
        description,
        price: parseFloat(price),
        member_price: parseFloat(memberPrice),
        image_url: imageUrl,
        stock: parseInt(stock) || 0,
        featured,
      };
      if (isEdit && id) await api.updateProduct(id, body);
      else await api.createProduct(body);
      router.back();
    } catch (e: any) {
      Alert.alert("Erro", e.message);
    } finally {
      setLoading(false);
    }
  };

  if (initLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.bg, justifyContent: "center" }}>
        <ActivityIndicator color={theme.colors.white} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
    >
      <SafeAreaView style={{ flex: 1 }} edges={["bottom"]}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>{isEdit ? "Editar produto" : "Novo produto"}</Text>

          <Field label="Nome">
            <TextInput
              testID="admin-name"
              value={name} onChangeText={setName} style={styles.input}
              placeholder="Ex: Ozempic 1mg" placeholderTextColor={theme.colors.textMuted}
            />
          </Field>

          <Field label="Categoria">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {categories.map((c) => {
                const active = c.id === category;
                return (
                  <TouchableOpacity
                    key={c.id}
                    onPress={() => setCategory(c.id)}
                    style={[styles.pill, active && styles.pillActive]}
                    testID={`admin-cat-${c.id}`}
                  >
                    <Text style={[styles.pillText, active && styles.pillTextActive]}>{c.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Field>

          <Field label="Descrição">
            <TextInput
              testID="admin-description"
              value={description} onChangeText={setDescription}
              style={[styles.input, { height: 90, textAlignVertical: "top" }]}
              multiline
              placeholder="Descrição detalhada..." placeholderTextColor={theme.colors.textMuted}
            />
          </Field>

          <View style={styles.row}>
            <Field label="Preço tabela" style={{ flex: 1 }}>
              <TextInput
                testID="admin-price"
                value={price} onChangeText={setPrice} style={styles.input}
                keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={theme.colors.textMuted}
              />
            </Field>
            <Field label="Preço membro" style={{ flex: 1 }}>
              <TextInput
                testID="admin-member-price"
                value={memberPrice} onChangeText={setMemberPrice} style={styles.input}
                keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={theme.colors.textMuted}
              />
            </Field>
          </View>

          <Field label="Estoque">
            <TextInput
              testID="admin-stock"
              value={stock} onChangeText={setStock} style={styles.input}
              keyboardType="number-pad" placeholder="10" placeholderTextColor={theme.colors.textMuted}
            />
          </Field>

          <Field label="URL da imagem">
            <TextInput
              testID="admin-image"
              value={imageUrl} onChangeText={setImageUrl} style={styles.input}
              autoCapitalize="none" placeholder="https://..." placeholderTextColor={theme.colors.textMuted}
            />
          </Field>

          <View style={styles.featuredRow}>
            <Text style={styles.featuredLabel}>Em destaque na Home</Text>
            <Switch
              testID="admin-featured"
              value={featured} onValueChange={setFeatured}
              trackColor={{ true: theme.colors.silver, false: theme.colors.border }}
              thumbColor={featured ? theme.colors.white : "#444"}
            />
          </View>

          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={submit}
            disabled={loading}
            testID="admin-save"
          >
            {loading ? (
              <ActivityIndicator color={theme.colors.bg} />
            ) : (
              <Text style={styles.primaryBtnText}>{isEdit ? "SALVAR ALTERAÇÕES" : "CRIAR PRODUTO"}</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, children, style }: any) {
  return (
    <View style={[{ gap: 8 }, style]}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: theme.spacing.lg, gap: theme.spacing.md },
  title: { color: theme.colors.white, fontSize: 24, fontWeight: "800", letterSpacing: -0.5 },
  label: { color: theme.colors.silver, fontSize: 11, fontWeight: "700", letterSpacing: 1.5 },
  input: {
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: 4, padding: 14, color: theme.colors.text, fontSize: 14,
  },
  row: { flexDirection: "row", gap: 12 },
  pill: {
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 4, borderWidth: 1, borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  pillActive: { backgroundColor: theme.colors.white, borderColor: theme.colors.white },
  pillText: { color: theme.colors.textMuted, fontSize: 12, fontWeight: "700" },
  pillTextActive: { color: theme.colors.bg },
  featuredRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    padding: 14, backgroundColor: theme.colors.surface,
    borderWidth: 1, borderColor: theme.colors.border, borderRadius: 4,
  },
  featuredLabel: { color: theme.colors.text, fontSize: 14, fontWeight: "600" },
  primaryBtn: {
    backgroundColor: theme.colors.white, paddingVertical: 16,
    borderRadius: 4, alignItems: "center", marginTop: theme.spacing.md,
  },
  primaryBtnText: { color: theme.colors.bg, fontWeight: "800", fontSize: 13, letterSpacing: 1.5 },
});

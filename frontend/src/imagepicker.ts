import * as ImagePicker from "expo-image-picker";
import { Alert, Platform } from "react-native";

/**
 * Picks an image from the gallery with aggressive compression for reliable upload
 * through the Kubernetes ingress (default nginx body limit ~1MB).
 * Returns a data URL string or null if cancelled/denied.
 */
export async function pickCompressedImage(opts?: { aspect?: [number, number]; quality?: number }): Promise<string | null> {
  try {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permissão negada", "Ative o acesso às fotos nas configurações do app para continuar.");
      return null;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images" as any],
      quality: opts?.quality ?? 0.35,
      base64: true,
      allowsEditing: true,
      aspect: opts?.aspect,
    });
    if (result.canceled || !result.assets?.length) return null;
    const a = result.assets[0];
    if (!a.base64) { Alert.alert("Falha", "Não foi possível processar a imagem."); return null; }
    return `data:image/jpeg;base64,${a.base64}`;
  } catch (e: any) {
    console.log("pickCompressedImage error", e);
    Alert.alert("Erro", e?.message || "Falha ao carregar imagem.");
    return null;
  }
}

export async function takeCompressedPhoto(opts?: { quality?: number }): Promise<string | null> {
  try {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert("Permissão negada"); return null; }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images" as any],
      quality: opts?.quality ?? 0.35,
      base64: true,
    });
    if (result.canceled || !result.assets?.length) return null;
    const a = result.assets[0];
    if (!a.base64) return null;
    return `data:image/jpeg;base64,${a.base64}`;
  } catch (e: any) {
    console.log("takeCompressedPhoto error", e);
    return null;
  }
}

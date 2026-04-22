// Helper for picking images with automatic compression.
import * as ImagePicker from "expo-image-picker";
import { Alert, Platform } from "react-native";

export type PickedAsset = { uri: string; base64: string; type: "image" | "video" | "audio"; sizeKB: number };

export async function pickImage(): Promise<PickedAsset | null> {
  try {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permissão negada", "Libere acesso à galeria para anexar imagens.");
      return null;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.6,
      base64: true,
    });
    if (result.canceled) return null;
    const a = result.assets[0];
    const base64 = a.base64 ? `data:image/jpeg;base64,${a.base64}` : a.uri;
    const sizeKB = Math.round((a.base64?.length || 0) * 0.75 / 1024);
    return { uri: a.uri, base64, type: "image", sizeKB };
  } catch (e: any) {
    if (Platform.OS !== "web") Alert.alert("Erro", e.message);
    return null;
  }
}

export async function takePhoto(): Promise<PickedAsset | null> {
  try {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permissão negada", "Libere a câmera para tirar fotos.");
      return null;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.6,
      base64: true,
    });
    if (result.canceled) return null;
    const a = result.assets[0];
    const base64 = a.base64 ? `data:image/jpeg;base64,${a.base64}` : a.uri;
    const sizeKB = Math.round((a.base64?.length || 0) * 0.75 / 1024);
    return { uri: a.uri, base64, type: "image", sizeKB };
  } catch (e: any) {
    if (Platform.OS !== "web") Alert.alert("Erro", e.message);
    return null;
  }
}

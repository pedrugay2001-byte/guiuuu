import { Alert, Platform } from "react-native";

/**
 * Universal alert that works on web (uses window.alert) and mobile (uses Alert.alert).
 * On web, Alert.alert from react-native-web fails silently in some contexts.
 */
export function notify(title: string, message?: string) {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    try {
      window.alert(message ? `${title}\n\n${message}` : title);
      return;
    } catch {}
  }
  Alert.alert(title, message);
}

/**
 * Universal confirm dialog. Returns true if user confirms.
 */
export async function confirm(title: string, message?: string): Promise<boolean> {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    try {
      return window.confirm(message ? `${title}\n\n${message}` : title);
    } catch { return false; }
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: "Cancelar", style: "cancel", onPress: () => resolve(false) },
      { text: "Confirmar", onPress: () => resolve(true) },
    ]);
  });
}

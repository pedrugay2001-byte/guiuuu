import * as ImagePicker from "expo-image-picker";
import { Alert, Platform } from "react-native";
import { notify } from "./alerts";

/**
 * Picks an image from the gallery with aggressive compression for reliable upload
 * through the Kubernetes ingress (default nginx body limit ~1MB).
 * Returns a data URL string or null if cancelled/denied.
 *
 * Web fallback: uses an HTML file input because expo-image-picker has limited
 * support on web and sometimes returns empty base64.
 */
export async function pickCompressedImage(opts?: { aspect?: [number, number]; quality?: number }): Promise<string | null> {
  // On web, use a direct file input for reliable base64 capture.
  if (Platform.OS === "web" && typeof document !== "undefined") {
    return pickViaWebInput(opts?.quality ?? 0.5);
  }
  try {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      notify("Permissão negada", "Ative o acesso às fotos nas configurações do app.");
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
    if (!a.base64) {
      notify("Falha", "Não foi possível processar a imagem. Tente outra.");
      return null;
    }
    const uri = `data:image/jpeg;base64,${a.base64}`;
    if (uri.length > 1_300_000) {
      notify("Imagem muito grande", "Escolha uma foto menor (máx. ~1MB).");
      return null;
    }
    return uri;
  } catch (e: any) {
    console.log("pickCompressedImage error", e);
    notify("Erro ao carregar imagem", e?.message || "Tente novamente.");
    return null;
  }
}

export async function takeCompressedPhoto(opts?: { quality?: number }): Promise<string | null> {
  if (Platform.OS === "web") return pickViaWebInput(opts?.quality ?? 0.5, true);
  try {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { notify("Permissão de câmera negada"); return null; }
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
    notify("Erro", e?.message || "Falha ao abrir câmera.");
    return null;
  }
}

/**
 * Web-only: creates a hidden file input, lets the user pick an image,
 * then compresses via canvas and returns a JPEG data URL.
 */
function pickViaWebInput(quality: number, capture = false): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      if (capture) (input as any).capture = "environment";
      input.style.display = "none";
      input.onchange = async () => {
        try {
          const file = input.files?.[0];
          if (!file) return resolve(null);
          const dataUrl = await compressImageWeb(file, quality);
          resolve(dataUrl);
        } catch (e: any) {
          console.log("web pick error", e);
          notify("Erro", e?.message || "Não foi possível ler a imagem.");
          resolve(null);
        } finally {
          try { document.body.removeChild(input); } catch {}
        }
      };
      // If user cancels the dialog, onchange is not fired and we never resolve.
      // Attach a fallback to detect cancel after a focus event.
      const cleanup = () => {
        window.removeEventListener("focus", onFocus);
      };
      const onFocus = () => {
        setTimeout(() => {
          if (!input.files || input.files.length === 0) {
            cleanup();
            try { document.body.removeChild(input); } catch {}
            resolve(null);
          }
        }, 500);
      };
      window.addEventListener("focus", onFocus, { once: true });
      document.body.appendChild(input);
      input.click();
    } catch (e: any) {
      console.log("pickViaWebInput error", e);
      resolve(null);
    }
  });
}

async function compressImageWeb(file: File, quality: number): Promise<string | null> {
  return new Promise((resolve, reject) => {
    try {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Falha ao ler arquivo."));
      reader.onload = () => {
        const src = reader.result as string;
        const img = new Image();
        img.onload = () => {
          try {
            // Max edge 1280px to keep payload reasonable.
            const maxEdge = 1280;
            let w = img.width, h = img.height;
            if (w > maxEdge || h > maxEdge) {
              if (w >= h) { h = Math.round((h * maxEdge) / w); w = maxEdge; }
              else { w = Math.round((w * maxEdge) / h); h = maxEdge; }
            }
            const canvas = document.createElement("canvas");
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext("2d");
            if (!ctx) return reject(new Error("Canvas não suportado."));
            ctx.drawImage(img, 0, 0, w, h);
            // Quality mapping: 0.3 → 0.45 on web (visual parity)
            const q = Math.max(0.3, Math.min(0.9, quality + 0.1));
            const dataUrl = canvas.toDataURL("image/jpeg", q);
            if (dataUrl.length > 1_300_000) {
              // try lower quality
              const lower = canvas.toDataURL("image/jpeg", 0.35);
              if (lower.length > 1_300_000) {
                notify("Imagem muito grande", "Escolha uma foto menor.");
                return resolve(null);
              }
              return resolve(lower);
            }
            resolve(dataUrl);
          } catch (e: any) {
            reject(e);
          }
        };
        img.onerror = () => reject(new Error("Não foi possível carregar a imagem."));
        img.src = src;
      };
      reader.readAsDataURL(file);
    } catch (e) {
      reject(e);
    }
  });
}


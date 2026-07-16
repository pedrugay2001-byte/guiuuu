/**
 * ETAPA 4 — helpers de compartilhamento de comprovantes PYX.
 *
 * Estratégia cross-platform:
 *  - Web: usa `navigator.share` quando disponível (Web Share API);
 *         para download, converte dataURL em Blob e força download via <a>.
 *  - Native: usa `expo-sharing` + `expo-file-system`;
 *         para "salvar na galeria" usa `expo-media-library`.
 *
 * Todas as funções são async e nunca lançam — retornam { ok, error }.
 */

import { Platform, Linking } from "react-native";

export type ShareResult = { ok: boolean; error?: string };

const b64ToBlob = (b64: string, mime = "image/png") => {
  const parts = b64.split(",");
  const raw = parts.length > 1 ? parts[1] : parts[0];
  const bin = atob(raw);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
};

/** Faz download da imagem (ou compartilha via Web Share) no navegador. */
async function webDownload(dataUri: string, filename: string): Promise<ShareResult> {
  try {
    const blob = b64ToBlob(dataUri, "image/png");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Falha ao baixar" };
  }
}

async function webNativeShare(dataUri: string, filename: string, text: string): Promise<ShareResult> {
  try {
    const nav: any = (globalThis as any).navigator;
    if (!nav?.share) return { ok: false, error: "Compartilhamento não suportado neste navegador" };

    // Prefer share with file when supported (mobile browsers)
    if (nav.canShare) {
      const blob = b64ToBlob(dataUri, "image/png");
      const file = new File([blob], filename, { type: "image/png" });
      if (nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], title: "Comprovante PYX", text });
        return { ok: true };
      }
    }
    // Fallback: apenas texto
    await nav.share({ title: "Comprovante PYX", text });
    return { ok: true };
  } catch (e: any) {
    if (e?.name === "AbortError") return { ok: true }; // usuário cancelou
    return { ok: false, error: e?.message || "Falha no compartilhamento" };
  }
}

/** Compartilha a imagem via share sheet do OS (nativo) ou Web Share API (web). */
export async function shareReceiptImage(
  dataUri: string,
  filename: string,
  text: string,
): Promise<ShareResult> {
  if (Platform.OS === "web") {
    // Se Web Share API suportar arquivos, usa; senão baixa direto.
    const nav: any = (globalThis as any).navigator;
    if (nav?.share) return webNativeShare(dataUri, filename, text);
    return webDownload(dataUri, filename);
  }
  try {
    const Sharing = await import("expo-sharing");
    const FS = await import("expo-file-system");
    const available = await Sharing.isAvailableAsync();
    // Grava em arquivo temporário
    const path = `${FS.cacheDirectory}${filename}`;
    const base64 = dataUri.split(",")[1] || dataUri;
    await FS.writeAsStringAsync(path, base64, { encoding: FS.EncodingType.Base64 });
    if (!available) {
      return { ok: false, error: "Compartilhamento não disponível neste dispositivo" };
    }
    await Sharing.shareAsync(path, {
      mimeType: "image/png",
      dialogTitle: "Comprovante PYX",
      UTI: "public.png",
    });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Falha ao compartilhar" };
  }
}

/** Salva a imagem na galeria/downloads. */
export async function saveReceiptImage(
  dataUri: string,
  filename: string,
): Promise<ShareResult> {
  if (Platform.OS === "web") return webDownload(dataUri, filename);
  try {
    const FS = await import("expo-file-system");
    const Media = await import("expo-media-library");
    const perm = await Media.requestPermissionsAsync();
    if (!perm.granted) return { ok: false, error: "Permissão negada" };
    const path = `${FS.cacheDirectory}${filename}`;
    const base64 = dataUri.split(",")[1] || dataUri;
    await FS.writeAsStringAsync(path, base64, { encoding: FS.EncodingType.Base64 });
    await Media.saveToLibraryAsync(path);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Falha ao salvar" };
  }
}

/** Abre o WhatsApp com um texto pronto (deep-link universal). */
export async function shareToWhatsApp(text: string): Promise<ShareResult> {
  try {
    const encoded = encodeURIComponent(text);
    // No web, wa.me abre corretamente; no mobile, whatsapp:// abre o app instalado.
    const url =
      Platform.OS === "web"
        ? `https://wa.me/?text=${encoded}`
        : `whatsapp://send?text=${encoded}`;
    const can = await Linking.canOpenURL(url);
    if (!can && Platform.OS !== "web") {
      // fallback pro link universal
      await Linking.openURL(`https://wa.me/?text=${encoded}`);
      return { ok: true };
    }
    await Linking.openURL(url);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Falha ao abrir WhatsApp" };
  }
}

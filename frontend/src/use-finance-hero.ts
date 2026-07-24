/**
 * useFinanceHero — carrega a imagem do painel financeiro (hero) da home de forma
 * CACHEADA e desacoplada do poll de cotação (/pyx/rate).
 *
 * Antes, o base64 (~450KB) vinha embutido no /pyx/rate e era baixado a cada 30s,
 * travando a versão web. Agora a imagem é buscada UMA vez via /pyx/finance-hero e
 * cacheada (mem + AsyncStorage + localStorage), revalidando só quando a `version`
 * (finance_hero_updated_at) muda.
 */
import { useEffect, useState } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "./api";

const CACHE_KEY = "@bc:finance_hero";

type HeroCache = { version: string; base64: string; url: string };

let memCache: HeroCache | null = null;

function readSync(): HeroCache | null {
  if (memCache) return memCache;
  if (Platform.OS === "web" && typeof window !== "undefined") {
    try {
      const raw = window.localStorage?.getItem(CACHE_KEY);
      if (raw) {
        memCache = JSON.parse(raw) as HeroCache;
        return memCache;
      }
    } catch {
      /* noop */
    }
  }
  return null;
}

async function persist(next: HeroCache) {
  memCache = next;
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(next));
  } catch {
    /* noop */
  }
  if (Platform.OS === "web" && typeof window !== "undefined") {
    try {
      window.localStorage?.setItem(CACHE_KEY, JSON.stringify(next));
    } catch {
      /* noop */
    }
  }
}

/**
 * Retorna a URI de fundo do hero (base64 data-uri OU url), já cacheada.
 * @param version  finance_hero_updated_at vindo do /pyx/rate (invalida o cache)
 * @param urlFallback  finance_hero_image_url leve vindo do rate (usado enquanto carrega)
 */
export function useFinanceHero(version?: string, urlFallback?: string): string {
  const initial = readSync();
  const [bg, setBg] = useState<string>(
    initial?.base64 || initial?.url || urlFallback || "",
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      // hidrata do AsyncStorage no nativo (web já leu síncrono)
      if (!memCache && Platform.OS !== "web") {
        try {
          const raw = await AsyncStorage.getItem(CACHE_KEY);
          if (raw) memCache = JSON.parse(raw) as HeroCache;
        } catch {
          /* noop */
        }
      }
      const cached = memCache;
      const ver = version || "";
      // cache válido para a versão atual → usa direto, sem rede
      if (cached && cached.version === ver) {
        if (alive) setBg(cached.base64 || cached.url || urlFallback || "");
        return;
      }
      // versão mudou (ou sem cache) → busca a imagem uma única vez
      try {
        const h = await api.pyxFinanceHero();
        const next: HeroCache = {
          version: h.updated_at || ver,
          base64: h.image_base64 || "",
          url: h.image_url || "",
        };
        await persist(next);
        if (alive) setBg(next.base64 || next.url || urlFallback || "");
      } catch {
        if (alive && cached) setBg(cached.base64 || cached.url || urlFallback || "");
      }
    })();
    return () => {
      alive = false;
    };
  }, [version, urlFallback]);

  return bg;
}

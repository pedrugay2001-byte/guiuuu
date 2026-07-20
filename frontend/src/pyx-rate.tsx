/**
 * PYX Rate Provider — cache global reativo da cotação PYX/USD + imagem hero.
 *
 * Estratégia v2 (com cache):
 *  - Ao montar, HIDRATA do AsyncStorage instantaneamente (sem flicker de UI).
 *  - Em seguida, revalida em background via /api/pyx/rate.
 *  - Repete a cada REFRESH_MS (30s) + no foco.
 *  - Ao gravar rate, persiste em AsyncStorage.
 *  - Isso elimina o "banner antigo" que aparecia antes de a imagem custom carregar.
 */

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api, PyxRate } from "./api";

type Ctx = {
  rate: PyxRate | null;
  rateCentavos: number;
  loading: boolean;
  refresh: () => Promise<void>;
};

const REFRESH_MS = 30_000;
const CACHE_KEY = "@bc:pyx_rate";

/** Leitura SÍNCRONA do cache no web (localStorage) — evita flicker do banner na abertura. */
function getInitialRateSync(): PyxRate | null {
  if (Platform.OS !== "web" || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage?.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PyxRate;
  } catch { return null; }
}

const PYXRateContext = createContext<Ctx>({
  rate: null,
  rateCentavos: 500,
  loading: true,
  refresh: async () => {},
});

export function PYXRateProvider({ children }: { children: React.ReactNode }) {
  // Inicializa com cache SÍNCRONO — primeiro render já tem os dados na web
  const initial = getInitialRateSync();
  const [rate, setRate] = useState<PyxRate | null>(initial);
  const [loading, setLoading] = useState(!initial);
  const timerRef = useRef<any>(null);
  const hydratedRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const r = await api.pyxRate();
      setRate(r);
      // Persiste em AsyncStorage (async) E localStorage (sync) para instant boot no web
      try { await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(r)); } catch { /* noop */ }
      if (Platform.OS === "web" && typeof window !== "undefined") {
        try { window.localStorage?.setItem(CACHE_KEY, JSON.stringify(r)); } catch { /* noop */ }
      }
    } catch {
      // silencioso — mantém último valor
    } finally {
      setLoading(false);
    }
  }, []);

  // Hidratação assíncrona (nativo) + revalidação em background
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    (async () => {
      if (!initial && Platform.OS !== "web") {
        try {
          const raw = await AsyncStorage.getItem(CACHE_KEY);
          if (raw) {
            const cached = JSON.parse(raw) as PyxRate;
            setRate(cached);
            setLoading(false);
          }
        } catch { /* noop */ }
      }
      refresh();
    })();
  }, [refresh, initial]);

  // Polling + focus
  useEffect(() => {
    timerRef.current = setInterval(refresh, REFRESH_MS);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    let onVis: (() => void) | undefined;
    if (Platform.OS === "web" && typeof document !== "undefined") {
      onVis = () => { if (!document.hidden) refresh(); };
      document.addEventListener("visibilitychange", onVis);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      sub.remove();
      if (onVis && Platform.OS === "web" && typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVis);
      }
    };
  }, [refresh]);

  return (
    <PYXRateContext.Provider
      value={{
        rate,
        rateCentavos: rate?.pyx_per_usd_centavos || 500,
        loading,
        refresh,
      }}
    >
      {children}
    </PYXRateContext.Provider>
  );
}

export function usePYXRate(): Ctx {
  return useContext(PYXRateContext);
}

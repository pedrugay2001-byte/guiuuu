/**
 * PYX Rate Provider — cache global reativo da cotação PYX/USD.
 *
 * Estratégia:
 *  - No mount inicial busca /api/pyx/rate.
 *  - Repete a cada REFRESH_MS (default 30s).
 *  - Também revalida quando a janela/app volta ao foco.
 *  - Expõe `refresh()` para atualização imediata após o admin salvar novo valor.
 *
 * Uso:
 *   <PYXRateProvider>...</PYXRateProvider>  (uma vez no _layout raiz)
 *   const { rateCentavos, rate, refresh } = usePYXRate();
 */

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import { api, PyxRate } from "./api";

type Ctx = {
  rate: PyxRate | null;
  rateCentavos: number;   // conveniência p/ formatUSD
  loading: boolean;
  refresh: () => Promise<void>;
};

const REFRESH_MS = 30_000; // 30s (bem menor que qualquer sessão real de uso)

const PYXRateContext = createContext<Ctx>({
  rate: null,
  rateCentavos: 500,
  loading: true,
  refresh: async () => {},
});

export function PYXRateProvider({ children }: { children: React.ReactNode }) {
  const [rate, setRate] = useState<PyxRate | null>(null);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<any>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await api.pyxRate();
      setRate(r);
    } catch {
      // silencioso — mantém valor anterior/último válido
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    // polling
    timerRef.current = setInterval(refresh, REFRESH_MS);
    // foco (web + native)
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    // web: visibilitychange também
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

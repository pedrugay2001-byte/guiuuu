/**
 * Cache instantâneo para saldo do membro e cotação PYX/USx.
 *
 * Estratégia:
 *  - Cache em memória (Map) — leitura síncrona instantânea.
 *  - Persistência em AsyncStorage — sobrevive a reloads / navegação entre telas.
 *  - Provider (`WalletProvider`) hidrata memória na inicialização do app
 *    e revalida em background quando o membro logado muda.
 *  - Componentes usam `useCachedWallet(memberId)` que retorna o último valor
 *    conhecido IMEDIATAMENTE + revalida em background.
 *
 * Ganhos:
 *  - Zero flicker do banner financeiro na abertura do app.
 *  - Saldo aparece instantaneamente ao trocar de aba/tela.
 */

import React, { createContext, useCallback, useContext, useEffect, useRef, useSyncExternalStore } from "react";
import { AppState, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api, PyxWallet } from "./api";
import { useGate } from "./gate";

const WALLET_KEY = (memberId: string) => `@bc:wallet:${memberId}`;
const REFRESH_MS = 30_000;

/** Leitura SÍNCRONA da carteira (localStorage no web) — bootstrap sem flicker. */
function readWalletSync(memberId: string): PyxWallet | null {
  if (Platform.OS !== "web" || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage?.getItem(WALLET_KEY(memberId));
    if (!raw) return null;
    return JSON.parse(raw) as PyxWallet;
  } catch { return null; }
}

// ---- Store em memória (sincroniza cross-components via listeners) ----
type Slot = { wallet: PyxWallet | null; ready: boolean };
const store = new Map<string, Slot>();
const listeners = new Map<string, Set<() => void>>();
const hydrating = new Map<string, Promise<void>>();

function slot(memberId: string): Slot {
  if (!store.has(memberId)) {
    // Bootstrap síncrono no web — memória já tem o cache antes do primeiro render
    const cached = readWalletSync(memberId);
    store.set(memberId, { wallet: cached, ready: !!cached });
  }
  return store.get(memberId)!;
}
function emit(memberId: string) {
  listeners.get(memberId)?.forEach((l) => l());
}
function subscribe(memberId: string, cb: () => void) {
  if (!listeners.has(memberId)) listeners.set(memberId, new Set());
  listeners.get(memberId)!.add(cb);
  return () => { listeners.get(memberId)?.delete(cb); };
}

/** Lê do AsyncStorage → memória. Chamado uma única vez por member. */
async function hydrate(memberId: string) {
  if (hydrating.has(memberId)) return hydrating.get(memberId)!;
  const p = (async () => {
    try {
      const raw = await AsyncStorage.getItem(WALLET_KEY(memberId));
      if (raw) {
        const parsed = JSON.parse(raw) as PyxWallet;
        slot(memberId).wallet = parsed;
      }
    } catch { /* silencioso */ }
    slot(memberId).ready = true;
    emit(memberId);
  })();
  hydrating.set(memberId, p);
  return p;
}

/** Busca fresco no servidor e salva no cache (memória + storage). */
async function revalidate(memberId: string) {
  try {
    const w = await api.pyxWallet(memberId);
    slot(memberId).wallet = w;
    slot(memberId).ready = true;
    emit(memberId);
    try { await AsyncStorage.setItem(WALLET_KEY(memberId), JSON.stringify(w)); } catch { /* noop */ }
    if (Platform.OS === "web" && typeof window !== "undefined") {
      try { window.localStorage?.setItem(WALLET_KEY(memberId), JSON.stringify(w)); } catch { /* noop */ }
    }
  } catch { /* offline / erro — mantém o cache */ }
}

// ---- Context / Provider ----
type Ctx = {
  wallet: PyxWallet | null;
  balanceCentavos: number;
  ready: boolean;
  refresh: () => Promise<void>;
};

const WalletCtx = createContext<Ctx>({
  wallet: null,
  balanceCentavos: 0,
  ready: false,
  refresh: async () => {},
});

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const { member } = useGate();
  const memberId = member?.member_id;
  const timerRef = useRef<any>(null);

  // Hidrata + revalida quando o member muda
  useEffect(() => {
    if (!memberId) return;
    hydrate(memberId).then(() => revalidate(memberId));
    return () => {};
  }, [memberId]);

  // Polling + focus revalidation
  useEffect(() => {
    if (!memberId) return;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => revalidate(memberId), REFRESH_MS);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") revalidate(memberId);
    });
    let onVis: (() => void) | undefined;
    if (Platform.OS === "web" && typeof document !== "undefined") {
      onVis = () => { if (!document.hidden) revalidate(memberId); };
      document.addEventListener("visibilitychange", onVis);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      sub.remove();
      if (onVis && Platform.OS === "web" && typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVis);
      }
    };
  }, [memberId]);

  const refresh = useCallback(async () => {
    if (memberId) await revalidate(memberId);
  }, [memberId]);

  // Snapshot reativo via useSyncExternalStore — força re-render quando store emite
  useSyncExternalStore(
    (cb) => (memberId ? subscribe(memberId, cb) : () => {}),
    () => {
      if (!memberId) return "empty";
      const s = slot(memberId);
      return `${s.ready ? 1 : 0}|${s.wallet?.balance_centavos ?? "null"}|${s.wallet?.wallet_id ?? ""}`;
    },
    () => "empty",
  );
  const wallet = memberId ? slot(memberId).wallet : null;
  const ready = memberId ? slot(memberId).ready : false;

  return (
    <WalletCtx.Provider
      value={{
        wallet,
        balanceCentavos: wallet?.balance_centavos ?? 0,
        ready,
        refresh,
      }}
    >
      {children}
    </WalletCtx.Provider>
  );
}

/** Hook público para consumir o cache — instantâneo após primeira renderização. */
export function useCachedWallet(): Ctx {
  return useContext(WalletCtx);
}

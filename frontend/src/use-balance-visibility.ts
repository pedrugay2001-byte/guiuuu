/**
 * Hook GLOBAL (shared) para o estado "mostrar/ocultar saldo".
 *
 * Como funciona:
 *  - Mantém um store em memória por `memberId` + listeners para re-render.
 *  - Persiste em AsyncStorage para sobreviver a reloads.
 *  - Todos os componentes que usam `useBalanceVisibility(memberId)` recebem
 *    o mesmo valor de `hidden` — quando um toggle acontece, TODOS
 *    re-renderizam automaticamente (via useSyncExternalStore).
 */

import { useCallback, useEffect, useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

type Listener = () => void;

const BASE_KEY = "@bc:balance_hidden";
const storageKey = (memberId?: string) => (memberId ? `${BASE_KEY}:${memberId}` : BASE_KEY);

// Store por-memberId (evita interferência entre contas)
const state = new Map<string, { hidden: boolean; ready: boolean }>();
const listeners = new Map<string, Set<Listener>>();
const bootstrapping = new Map<string, Promise<void>>();

function slotKey(memberId?: string) {
  return memberId || "__default__";
}

function getSlot(memberId?: string) {
  const k = slotKey(memberId);
  if (!state.has(k)) state.set(k, { hidden: false, ready: false });
  return state.get(k)!;
}

function emit(memberId?: string) {
  const k = slotKey(memberId);
  listeners.get(k)?.forEach((l) => l());
}

async function bootstrap(memberId?: string) {
  const k = slotKey(memberId);
  if (bootstrapping.has(k)) return bootstrapping.get(k)!;
  const p = (async () => {
    try {
      const v = await AsyncStorage.getItem(storageKey(memberId));
      const slot = getSlot(memberId);
      slot.hidden = v === "1";
      slot.ready = true;
    } catch {
      const slot = getSlot(memberId);
      slot.ready = true;
    }
    emit(memberId);
  })();
  bootstrapping.set(k, p);
  return p;
}

function toggleGlobal(memberId?: string) {
  const slot = getSlot(memberId);
  slot.hidden = !slot.hidden;
  slot.ready = true;
  AsyncStorage.setItem(storageKey(memberId), slot.hidden ? "1" : "0").catch(() => {});
  emit(memberId);
}

function subscribe(memberId: string | undefined, fn: Listener) {
  const k = slotKey(memberId);
  if (!listeners.has(k)) listeners.set(k, new Set());
  listeners.get(k)!.add(fn);
  return () => { listeners.get(k)?.delete(fn); };
}

/** Hook público — compartilhado entre componentes. */
export function useBalanceVisibility(memberId?: string) {
  // Bootstrap uma única vez por memberId
  useEffect(() => { bootstrap(memberId); }, [memberId]);

  const snap = useSyncExternalStore(
    (cb) => subscribe(memberId, cb),
    () => {
      const s = getSlot(memberId);
      // Retorna string estável (JSON) pra o store detectar mudanças
      return `${s.ready ? 1 : 0}|${s.hidden ? 1 : 0}`;
    },
    () => "0|0",
  );

  // parse do snapshot
  const [readyChar, hiddenChar] = snap.split("|");
  const ready = readyChar === "1";
  const hidden = hiddenChar === "1";

  const toggle = useCallback(() => toggleGlobal(memberId), [memberId]);

  return { hidden, ready, toggle };
}

/** Mascara um valor formatado para dots quando `hidden` estiver ativo. */
export function maskAmount(str: string, hidden: boolean, dots = 4): string {
  if (!hidden) return str;
  const marker = "•".repeat(dots);
  return str.replace(/(US\$\s*)?[\d.,]+/, (_m, sign) => `${sign || ""}${marker}`);
}

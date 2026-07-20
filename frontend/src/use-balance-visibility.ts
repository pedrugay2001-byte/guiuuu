/**
 * Hook para o estado "mostrar/ocultar saldo" no estilo dos apps bancários.
 * Persistido em AsyncStorage por usuário para que a preferência sobreviva
 * a reloads. Chave global por padrão; opcionalmente por `memberId`.
 */

import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "@bc:balance_hidden";

export function useBalanceVisibility(memberId?: string) {
  const key = memberId ? `${KEY}:${memberId}` : KEY;
  const [hidden, setHidden] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(key)
      .then((v) => {
        if (!mounted) return;
        setHidden(v === "1");
        setReady(true);
      })
      .catch(() => setReady(true));
    return () => { mounted = false; };
  }, [key]);

  const toggle = useCallback(() => {
    setHidden((prev) => {
      const next = !prev;
      AsyncStorage.setItem(key, next ? "1" : "0").catch(() => {});
      return next;
    });
  }, [key]);

  return { hidden, ready, toggle };
}

/** Mascara um valor formatado (ex: "1.500 PYX") para dots quando ocultar estiver ativo. */
export function maskAmount(str: string, hidden: boolean, dots = 4): string {
  if (!hidden) return str;
  // preserva sufixos como " PYX", "$"; máscara só os dígitos
  const marker = "•".repeat(dots);
  // encontra bloco de dígitos (com separadores) no início ou logo após $
  return str.replace(/(\$)?[\d.,]+/, (_m, sign) => `${sign || ""}${marker}`);
}

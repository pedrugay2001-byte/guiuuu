import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { TierId } from "./theme";
import { api } from "./api";

const GATE_KEY = "blacksclub_member_v1";
// Legacy keys to migrate
const LEGACY_KEYS = ["farmaclube_member_v2", "farmaclube_member"];

export type MemberData = {
  member_id: string;
  member_number?: number;
  name: string;
  phone: string;
  neighborhood: string;
  city: string;
  state: string;
  invite_code: string;
  parent_code: string;
  parent_name: string | null;
  tier: TierId;
  nickname?: string | null;
  avatar_base64?: string | null;
};

type GateState = {
  member: MemberData | null | undefined;
  saveMember: (m: MemberData) => Promise<void>;
  updateMember: (patch: Partial<MemberData>) => Promise<void>;
  /** Revalida dados do membro contra o backend (atualiza avatar, nickname, tier, etc.) */
  refreshMember: () => Promise<void>;
  clear: () => Promise<void>;
};

const GateContext = createContext<GateState | null>(null);

export function GateProvider({ children }: { children: React.ReactNode }) {
  const [member, setMember] = useState<MemberData | null | undefined>(undefined);

  useEffect(() => {
    (async () => {
      let raw = await AsyncStorage.getItem(GATE_KEY);
      if (!raw) {
        for (const k of LEGACY_KEYS) {
          const old = await AsyncStorage.getItem(k);
          if (old) { await AsyncStorage.removeItem(k); break; }
        }
      }
      if (raw) {
        try {
          const cached = JSON.parse(raw);
          setMember(cached);
          // Após carregar do cache, revalida em background contra o backend
          // para pegar mudanças feitas via admin (role, avatar, tier...).
          if (cached?.member_id) {
            api.communityMember(cached.member_id)
              .then((fresh: any) => {
                if (!fresh) return;
                setMember((prev) => {
                  const merged = { ...prev, ...fresh } as MemberData;
                  AsyncStorage.setItem(GATE_KEY, JSON.stringify(merged)).catch(() => {});
                  return merged;
                });
              })
              .catch(() => {});
          }
          return;
        } catch {}
      }
      setMember(null);
    })();
  }, []);

  const saveMember = useCallback(async (m: MemberData) => {
    await AsyncStorage.setItem(GATE_KEY, JSON.stringify(m));
    setMember(m);
  }, []);

  const updateMember = useCallback(async (patch: Partial<MemberData>) => {
    setMember((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch } as MemberData;
      AsyncStorage.setItem(GATE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  // Throttle: ignora chamadas dentro de 20s
  const lastRefreshRef = useRef<number>(0);
  const refreshMember = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && now - lastRefreshRef.current < 20_000) return;
    lastRefreshRef.current = now;
    try {
      const cur = await AsyncStorage.getItem(GATE_KEY);
      if (!cur) return;
      const prev = JSON.parse(cur);
      if (!prev?.member_id) return;
      const fresh: any = await api.communityMember(prev.member_id);
      if (!fresh) return;
      const merged = { ...prev, ...fresh } as MemberData;
      await AsyncStorage.setItem(GATE_KEY, JSON.stringify(merged));
      setMember(merged);
    } catch { /* silencioso */ }
  }, []);

  const clear = useCallback(async () => {
    await AsyncStorage.removeItem(GATE_KEY);
    for (const k of LEGACY_KEYS) await AsyncStorage.removeItem(k);
    setMember(null);
  }, []);

  return (
    <GateContext.Provider value={{ member, saveMember, updateMember, refreshMember, clear }}>
      {children}
    </GateContext.Provider>
  );
}

export function useGate() {
  const ctx = useContext(GateContext);
  if (!ctx) throw new Error("useGate must be used within GateProvider");
  return ctx;
}

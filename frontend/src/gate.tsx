import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const GATE_KEY = "farmaclube_member_v2";

export type MemberData = {
  member_id: string;
  name: string;
  phone: string;
  address: string;
  invite_code: string;
  parent_code: string;
  parent_name: string | null;
};

type GateState = {
  member: MemberData | null | undefined; // undefined = loading
  saveMember: (m: MemberData) => Promise<void>;
  clear: () => Promise<void>;
};

const GateContext = createContext<GateState | null>(null);

export function GateProvider({ children }: { children: React.ReactNode }) {
  const [member, setMember] = useState<MemberData | null | undefined>(undefined);

  useEffect(() => {
    (async () => {
      const raw = await AsyncStorage.getItem(GATE_KEY);
      if (raw) {
        try {
          setMember(JSON.parse(raw));
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

  const clear = useCallback(async () => {
    await AsyncStorage.removeItem(GATE_KEY);
    setMember(null);
  }, []);

  return (
    <GateContext.Provider value={{ member, saveMember, clear }}>
      {children}
    </GateContext.Provider>
  );
}

export function useGate() {
  const ctx = useContext(GateContext);
  if (!ctx) throw new Error("useGate must be used within GateProvider");
  return ctx;
}

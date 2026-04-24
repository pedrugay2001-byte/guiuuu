import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { api } from "./api";
import { useGate } from "./gate";

export type RecentSender = {
  member_id: string;
  name: string;
  avatar_base64?: string | null;
  tier?: string;
  last_at: string;
  last_text: string;
  unread: number;
};

type Ctx = {
  unreadMessages: number;
  unreadNotifications: number;
  senders: RecentSender[];
  // Avatares "abertos" no overlay flutuante (lista de member_ids que o usuário não dispensou)
  visibleHeadIds: string[];
  dismissHead: (id: string) => void;
  refresh: () => Promise<void>;
};

const C = createContext<Ctx | null>(null);

const POLL_MS = 12_000; // 12s — mais ágil para chat heads aparecerem rapidamente

export function MessageInboxProvider({ children }: { children: React.ReactNode }) {
  const { member } = useGate();
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [senders, setSenders] = useState<RecentSender[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const knownAtRef = useRef<Map<string, string>>(new Map()); // member_id -> last_at já visto

  const refresh = useCallback(async () => {
    if (!member?.member_id) return;
    try {
      const [count, recent] = await Promise.all([
        api.notificationsCount(member.member_id).catch(() => ({ count: 0, messages: 0, notifications: 0 } as any)),
        api.recentSenders(member.member_id).catch(() => ({ senders: [] })),
      ]);
      setUnreadMessages(Number((count as any).messages ?? count.count ?? 0));
      setUnreadNotifications(Number((count as any).notifications ?? 0));
      setSenders(recent.senders || []);

      // Detecta novos remetentes: se o `last_at` mudou ou é novo → re-mostra (remove do dismissed)
      const updatedDismissed = new Set(dismissedIds);
      let changed = false;
      for (const s of recent.senders || []) {
        const prev = knownAtRef.current.get(s.member_id);
        if (prev !== s.last_at) {
          // Mensagem nova chegou desse remetente — reativa exibição mesmo se foi dismissed
          if (updatedDismissed.has(s.member_id)) {
            updatedDismissed.delete(s.member_id);
            changed = true;
          }
          knownAtRef.current.set(s.member_id, s.last_at);
        }
      }
      if (changed) setDismissedIds(updatedDismissed);
    } catch {}
  }, [member, dismissedIds]);

  useEffect(() => {
    if (!member?.member_id) {
      setSenders([]);
      setUnreadMessages(0);
      setUnreadNotifications(0);
      return;
    }
    refresh();
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
  }, [member?.member_id]);

  const dismissHead = useCallback((id: string) => {
    setDismissedIds((s) => new Set([...s, id]));
  }, []);

  const visibleHeadIds = senders
    .filter((s) => !dismissedIds.has(s.member_id))
    .slice(0, 3)
    .map((s) => s.member_id);

  return (
    <C.Provider
      value={{
        unreadMessages,
        unreadNotifications,
        senders,
        visibleHeadIds,
        dismissHead,
        refresh,
      }}
    >
      {children}
    </C.Provider>
  );
}

export function useMessageInbox(): Ctx {
  const ctx = useContext(C);
  if (!ctx) {
    // fallback seguro quando provider ainda não montado (ex: telas pré-login)
    return {
      unreadMessages: 0,
      unreadNotifications: 0,
      senders: [],
      visibleHeadIds: [],
      dismissHead: () => {},
      refresh: async () => {},
    };
  }
  return ctx;
}

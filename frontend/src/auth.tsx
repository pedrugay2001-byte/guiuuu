import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, getToken, setToken, User } from "./api";

type AuthState = {
  user: User | null | undefined; // undefined = loading
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Revalida o usuário atual contra o backend (útil após mudança de role). */
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    (async () => {
      const token = await getToken();
      if (!token) {
        setUser(null);
        return;
      }
      try {
        const me = await api.me();
        setUser(me);
      } catch {
        await setToken(null);
        setUser(null);
      }
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.login(email, password);
    await setToken(res.token);
    setUser(res.user);
  }, []);

  const register = useCallback(async (email: string, password: string, name: string) => {
    const res = await api.register(email, password, name);
    await setToken(res.token);
    setUser(res.user);
  }, []);

  const logout = useCallback(async () => {
    await setToken(null);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) { setUser(null); return; }
      const me = await api.me();
      setUser(me);
    } catch {
      // mantém estado atual em caso de erro transitório
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

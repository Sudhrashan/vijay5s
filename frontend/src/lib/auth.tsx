import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, tokenStore } from "../api/client";
import type { User } from "../api/types";

interface AuthCtx { user: User | null; ready: boolean; login: (emp: string, pw: string) => Promise<void>; logout: () => void; can: (...roles: User["role"][]) => boolean; }
const Ctx = createContext<AuthCtx>(null!);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!tokenStore.get()) { setReady(true); return; }
    api.get<User>("/auth/me").then(setUser).catch(() => tokenStore.clear()).finally(() => setReady(true));
  }, []);

  const logout = useCallback(() => { tokenStore.clear(); setUser(null); }, []);
  useEffect(() => {
    window.addEventListener("vijay5s:logout", logout);
    return () => window.removeEventListener("vijay5s:logout", logout);
  }, [logout]);

  const login = async (emp_id: string, password: string) => {
    const r = await api.post<{ token: string; user: User }>("/auth/login", { emp_id, password });
    tokenStore.set(r.token);
    setUser(r.user);
  };
  const can = (...roles: User["role"][]) => !!user && roles.includes(user.role);

  return <Ctx.Provider value={{ user, ready, login, logout, can }}>{children}</Ctx.Provider>;
}
export const useAuth = () => useContext(Ctx);

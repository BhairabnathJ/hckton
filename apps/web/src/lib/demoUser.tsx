/**
 * // MOCK: demo-user session. The chosen handle is sent as X-Demo-User on
 * every request and remembered in localStorage. Production replaces this with
 * real auth (architecture §7).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { User } from "@sidequest/shared";
import { api, setDemoHandle } from "./api";

const STORAGE_KEY = "sq.demoUser";
const CANDIDATES = (import.meta.env.VITE_DEMO_USERS ?? "maya,jordan,admin,ada,grace")
  .split(",")
  .map((h: string) => h.trim())
  .filter(Boolean);

interface DemoUserContextValue {
  /** Handles the API recognises, with their users. */
  users: User[];
  handle: string | null;
  me: User | null;
  /** True until the candidate users have been probed. */
  loading: boolean;
  /** Set when no candidate handle resolves (API down or no seed). */
  error: unknown;
  setHandle: (handle: string) => void;
  refreshMe: () => Promise<User | null>;
}

const DemoUserContext = createContext<DemoUserContextValue | null>(null);

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function DemoUserProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<User[]>([]);
  const [handle, setHandleState] = useState<string | null>(readStored);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>();

  const probe = useCallback(async () => {
    setLoading(true);
    const results = await Promise.allSettled(CANDIDATES.map((h: string) => api.me(h)));
    const found: User[] = [];
    let lastError: unknown;
    results.forEach((r) => {
      if (r.status === "fulfilled" && !found.some((u) => u.id === r.value.id)) found.push(r.value);
      if (r.status === "rejected") lastError = r.reason;
    });
    setUsers(found);
    setError(found.length ? undefined : lastError);
    setHandleState((cur) => (cur && found.some((u) => u.handle === cur) ? cur : found[0]?.handle ?? null));
    setLoading(false);
  }, []);

  useEffect(() => {
    void probe();
  }, [probe]);

  useEffect(() => {
    setDemoHandle(handle);
    try {
      if (handle) localStorage.setItem(STORAGE_KEY, handle);
    } catch {
      // storage unavailable; the switch still works for this tab
    }
  }, [handle]);

  const refreshMe = useCallback(async () => {
    if (!handle) return null;
    const fresh = await api.me(handle);
    setUsers((list) => list.map((u) => (u.id === fresh.id ? fresh : u)));
    return fresh;
  }, [handle]);

  const setHandle = useCallback((h: string) => {
    setDemoHandle(h);
    setHandleState(h);
  }, []);

  const value = useMemo<DemoUserContextValue>(
    () => ({
      users,
      handle,
      me: users.find((u) => u.handle === handle) ?? null,
      loading,
      error,
      setHandle,
      refreshMe,
    }),
    [users, handle, loading, error, setHandle, refreshMe],
  );

  return <DemoUserContext.Provider value={value}>{children}</DemoUserContext.Provider>;
}

export function useDemoUser(): DemoUserContextValue {
  const ctx = useContext(DemoUserContext);
  if (!ctx) throw new Error("useDemoUser must be used inside DemoUserProvider");
  return ctx;
}

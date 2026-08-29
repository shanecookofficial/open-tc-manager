"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";

import { useAsyncData } from "@/hooks/use-async-data";
import { getMe, logout as apiLogout } from "@/lib/api-client";
import type { User } from "@/lib/contracts";

type AuthContextValue = {
  user: User | null;
  isLoading: boolean;
  error: Error | undefined;
  refetch: () => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data, error, isLoading, refetch } = useAsyncData(
    async () => {
      try {
        return await getMe();
      } catch {
        return null;
      }
    },
    [],
  );

  const logout = useCallback(async () => {
    await apiLogout();
    window.location.href = "/login";
  }, []);

  const value = useMemo(
    () => ({
      user: data ?? null,
      isLoading,
      error,
      refetch,
      logout,
    }),
    [data, isLoading, error, refetch, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}

"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { useAuth } from "@/components/auth/auth-context";
import { canWriteCases } from "@/lib/auth/permissions";

export function WriteGuard({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && user && !canWriteCases(user.role)) {
      router.replace("/");
    }
  }, [isLoading, user, router]);

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }

  if (!user || !canWriteCases(user.role)) {
    return (
      <div className="mx-auto max-w-lg p-8 text-center">
        <h1 className="text-lg font-semibold">Forbidden</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You do not have permission to edit test cases.
        </p>
      </div>
    );
  }

  return children;
}

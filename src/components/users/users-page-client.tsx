"use client";

import { UsersAdminView } from "@/components/users/users-admin-view";
import { useAuth } from "@/components/auth/auth-context";
import { canManageUsers } from "@/lib/auth/permissions";

export function UsersPageClient() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="p-6 text-sm text-muted-foreground">Loading…</div>
    );
  }

  if (!user || !canManageUsers(user.role)) {
    return (
      <div className="mx-auto max-w-lg p-8 text-center">
        <h1 className="text-lg font-semibold">Forbidden</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You do not have permission to manage users.
        </p>
      </div>
    );
  }

  return <UsersAdminView />;
}

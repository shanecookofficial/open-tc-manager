"use client";

import Link from "next/link";

import { useAuth } from "@/components/auth/auth-context";
import { ProjectSwitcher } from "@/components/projects/project-switcher";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { canManageUsers, roleLabel } from "@/lib/auth/permissions";

type AppHeaderProps = {
  currentPrefix?: string;
};

export function AppHeader({ currentPrefix }: AppHeaderProps) {
  const { user, isLoading, logout } = useAuth();

  return (
    <header className="flex h-14 items-center gap-4 border-b px-4">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">
          OpenTCM — Open Test Case Manager
        </p>
      </div>
      <ProjectSwitcher currentPrefix={currentPrefix} />
      <div className="flex items-center gap-2">
        {isLoading ? (
          <span className="text-sm text-muted-foreground">…</span>
        ) : user ? (
          <>
            <span className="hidden text-sm sm:inline">{user.displayName}</span>
            <Badge variant="outline">{roleLabel(user.role)}</Badge>
            {canManageUsers(user.role) ? (
              <Button variant="ghost" size="sm" asChild>
                <Link href="/users">Users</Link>
              </Button>
            ) : null}
            <Button variant="outline" size="sm" onClick={() => logout()}>
              Log out
            </Button>
          </>
        ) : null}
      </div>
    </header>
  );
}

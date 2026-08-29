"use client";

import Link from "next/link";

import { useAuth } from "@/components/auth/auth-context";
import { ProjectSwitcher } from "@/components/projects/project-switcher";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { canManageUsers, roleLabel } from "@/lib/auth/permissions";

type AppHeaderProps = {
  currentPrefix?: string;
  /** Instance-level pages (Users) are not a project context. */
  showProjectSwitcher?: boolean;
};

export function AppHeader({
  currentPrefix,
  showProjectSwitcher = true,
}: AppHeaderProps) {
  const { user, isLoading, logout } = useAuth();

  return (
    <header className="flex h-14 items-center gap-4 border-b px-4">
      <div className="min-w-0 flex-1">
        <Link
          href="/"
          className="truncate text-sm font-semibold hover:underline"
        >
          OpenTCM — Open Test Case Manager
        </Link>
      </div>
      {showProjectSwitcher ? (
        <ProjectSwitcher currentPrefix={currentPrefix} />
      ) : null}
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

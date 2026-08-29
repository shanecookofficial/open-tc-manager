import { AppHeader } from "@/components/layout/app-header";
import { UsersPageClient } from "@/components/users/users-page-client";

export const dynamic = "force-dynamic";

export default function UsersPage() {
  return (
    <>
      <AppHeader />
      <UsersPageClient />
    </>
  );
}

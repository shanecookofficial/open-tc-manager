import { redirect } from "next/navigation";

import { SetupAdminForm } from "@/components/auth/setup-admin-form";
import { requirePageSession } from "@/lib/auth/require-page-session";

export const dynamic = "force-dynamic";

export default async function SetupAdminPage() {
  const { user } = await requirePageSession();
  if (!user.mustSetupAccount) {
    redirect("/");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            Create your admin account
          </h1>
          <p className="text-sm text-muted-foreground">
            Replace the temporary sign-in with the email and password you will
            use. The temporary account cannot be used after this.
          </p>
        </div>
        <SetupAdminForm />
      </div>
    </main>
  );
}

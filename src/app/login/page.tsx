import { Suspense } from "react";

import { LoginForm } from "@/components/auth/login-form";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="text-sm text-muted-foreground">
            OpenTCM — Open Test Case Manager
          </p>
        </div>
        <Suspense
          fallback={
            <p className="text-center text-sm text-muted-foreground">
              Loading sign-in…
            </p>
          }
        >
          <LoginForm />
        </Suspense>
        <p className="text-center text-xs text-muted-foreground">
          First sign-in uses the temporary Admin, then you create your own
          account. Local default:{" "}
          <code className="text-[11px]">admin@opentcm.io</code>.
        </p>
      </div>
    </main>
  );
}

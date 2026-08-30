import { redirect } from "next/navigation";

import { AuthProvider } from "@/components/auth/auth-context";
import { ProjectsProvider } from "@/components/projects/projects-context";
import { Toaster } from "@/components/ui/sonner";
import { requirePageSession } from "@/lib/auth/require-page-session";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { user } = await requirePageSession();
  if (user.mustSetupAccount) {
    redirect("/setup-admin");
  }

  return (
    <AuthProvider initialUser={user}>
      <ProjectsProvider>
        <div className="min-h-screen">
          {children}
          <Toaster richColors position="top-right" />
        </div>
      </ProjectsProvider>
    </AuthProvider>
  );
}

import { AuthProvider } from "@/components/auth/auth-context";
import { ProjectsProvider } from "@/components/projects/projects-context";
import { Toaster } from "@/components/ui/sonner";

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <AuthProvider>
      <ProjectsProvider>
        <div className="min-h-screen">
          {children}
          <Toaster richColors position="top-right" />
        </div>
      </ProjectsProvider>
    </AuthProvider>
  );
}

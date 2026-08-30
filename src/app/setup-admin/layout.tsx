import { AuthProvider } from "@/components/auth/auth-context";
import { Toaster } from "@/components/ui/sonner";

export default function SetupAdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <AuthProvider>
      {children}
      <Toaster richColors position="top-right" />
    </AuthProvider>
  );
}

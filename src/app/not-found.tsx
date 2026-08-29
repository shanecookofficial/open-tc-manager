import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        The test case or page you requested does not exist. It may have been
        permanently deleted, or the project prefix may have changed.
      </p>
      <Button asChild>
        <Link href="/">Go to home</Link>
      </Button>
    </main>
  );
}

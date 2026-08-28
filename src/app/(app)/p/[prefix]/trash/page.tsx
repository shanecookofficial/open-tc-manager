import Link from "next/link";
import { notFound } from "next/navigation";

import { AppHeader } from "@/components/layout/app-header";
import { Button } from "@/components/ui/button";
import { listProjects } from "@/lib/api/projects";

type TrashPageProps = {
  params: Promise<{ prefix: string }>;
};

export default async function TrashPage({ params }: TrashPageProps) {
  const { prefix } = await params;
  const { items } = await listProjects();
  const project = items.find(
    (item) => item.prefix.toUpperCase() === prefix.toUpperCase(),
  );

  if (!project) {
    notFound();
  }

  return (
    <>
      <AppHeader currentPrefix={project.prefix} />
      <main className="flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center gap-4 p-8">
        <h1 className="text-2xl font-semibold">Trash</h1>
        <p className="max-w-md text-center text-muted-foreground">
          Trash management is coming in the next milestone (M3-7). Trashed cases
          are preserved and can still be viewed by direct link.
        </p>
        <Button asChild variant="outline">
          <Link href={`/p/${project.prefix}`}>Back to repository</Link>
        </Button>
      </main>
    </>
  );
}

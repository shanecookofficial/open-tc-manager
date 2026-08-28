import { notFound } from "next/navigation";

import { AppHeader } from "@/components/layout/app-header";
import { TrashView } from "@/components/trash/trash-view";
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
      <TrashView project={project} />
    </>
  );
}

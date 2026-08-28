import { notFound } from "next/navigation";

import { AppHeader } from "@/components/layout/app-header";
import { RepositoryView } from "@/components/repository/repository-view";
import { listProjects } from "@/lib/api/projects";

type ProjectPageProps = {
  params: Promise<{ prefix: string }>;
};

export default async function ProjectPage({ params }: ProjectPageProps) {
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
      <RepositoryView project={project} />
    </>
  );
}

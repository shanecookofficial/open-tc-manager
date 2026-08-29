import { notFound } from "next/navigation";

import { CaseEditorForm } from "@/components/cases/case-editor-form";
import { WriteGuard } from "@/components/auth/write-guard";
import { AppHeader } from "@/components/layout/app-header";
import { listProjects } from "@/lib/api/projects";

type NewCasePageProps = {
  searchParams: Promise<{ project?: string; directory?: string }>;
};

export default async function NewCasePage({ searchParams }: NewCasePageProps) {
  const { project: projectIdParam, directory: directoryParam } =
    await searchParams;

  const projectId = Number(projectIdParam);
  if (!Number.isInteger(projectId) || projectId <= 0) {
    notFound();
  }

  const { items } = await listProjects();
  const project = items.find((item) => item.id === projectId);
  if (!project) {
    notFound();
  }

  let initialDirectoryId: number | null = null;
  if (directoryParam && directoryParam !== "root") {
    const parsed = Number(directoryParam);
    if (Number.isInteger(parsed) && parsed > 0) {
      initialDirectoryId = parsed;
    }
  }

  return (
    <>
      <AppHeader currentPrefix={project.prefix} />
      <WriteGuard>
        <CaseEditorForm
          mode="create"
          project={project}
          initialDirectoryId={initialDirectoryId}
        />
      </WriteGuard>
    </>
  );
}

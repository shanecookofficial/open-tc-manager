import { notFound } from "next/navigation";

import { CaseEditorForm } from "@/components/cases/case-editor-form";
import { AppHeader } from "@/components/layout/app-header";
import { listProjects } from "@/lib/api/projects";
import { getTestCaseByDisplayNumber } from "@/lib/api/test-cases";

type EditCasePageProps = {
  params: Promise<{ displayNumber: string }>;
};

export default async function EditCasePage({ params }: EditCasePageProps) {
  const { displayNumber } = await params;
  const decoded = decodeURIComponent(displayNumber);

  let testCase;
  try {
    testCase = await getTestCaseByDisplayNumber(decoded);
  } catch {
    notFound();
  }

  if (testCase.deletedAt) {
    notFound();
  }

  const { items } = await listProjects();
  const project = items.find((item) => item.id === testCase.projectId);
  if (!project) {
    notFound();
  }

  return (
    <>
      <AppHeader currentPrefix={project.prefix} />
      <CaseEditorForm mode="edit" project={project} testCase={testCase} />
    </>
  );
}

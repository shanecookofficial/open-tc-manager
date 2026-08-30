import { notFound } from "next/navigation";

import { CaseDetailPageClient } from "@/components/cases/case-detail-page-client";
import { AppHeader } from "@/components/layout/app-header";
import { getTestCaseByDisplayNumber } from "@/lib/api/test-cases";
import { listProjects } from "@/lib/api/projects";

type CaseDetailPageProps = {
  params: Promise<{ displayNumber: string }>;
};

export default async function CaseDetailPage({ params }: CaseDetailPageProps) {
  const { displayNumber } = await params;
  const decoded = decodeURIComponent(displayNumber);

  let testCase;
  try {
    testCase = await getTestCaseByDisplayNumber(decoded);
  } catch {
    notFound();
  }

  const { items: projects } = await listProjects();
  const project = projects.find((item) => item.id === testCase.projectId);
  if (!project) {
    notFound();
  }

  return (
    <>
      <AppHeader currentPrefix={project.prefix} />
      <CaseDetailPageClient testCase={testCase} project={project} />
    </>
  );
}

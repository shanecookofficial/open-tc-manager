"use client";

import { CaseDetailView } from "@/components/cases/case-detail-view";
import { useAuth } from "@/components/auth/auth-context";
import type { Project, TestCase } from "@/lib/contracts";

type CaseDetailPageClientProps = {
  testCase: TestCase;
  project: Project;
};

export function CaseDetailPageClient({
  testCase,
  project,
}: CaseDetailPageClientProps) {
  const { user } = useAuth();
  return (
    <CaseDetailView
      testCase={testCase}
      project={project}
      user={user ?? { role: "viewer" }}
    />
  );
}

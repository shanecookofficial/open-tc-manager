import { redirect } from "next/navigation";

import { ZeroProjectsOnboarding } from "@/components/projects/project-switcher";
import { listProjects } from "@/lib/api/projects";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { items } = await listProjects();

  if (items.length === 0) {
    return <ZeroProjectsOnboarding />;
  }

  redirect(`/p/${items[0]!.prefix}`);
}

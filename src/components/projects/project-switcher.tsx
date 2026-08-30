"use client";

import { ChevronDownIcon, FolderIcon, PencilIcon, PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ProjectCreateDialog } from "@/components/projects/project-create-dialog";
import { ProjectEditDialog } from "@/components/projects/project-edit-dialog";
import { useAuth } from "@/components/auth/auth-context";
import { useProjects } from "@/components/projects/projects-context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Project } from "@/lib/contracts";
import { canManageProjects } from "@/lib/auth/permissions";

type ProjectSwitcherProps = {
  currentPrefix?: string;
};

export function ProjectSwitcher({ currentPrefix }: ProjectSwitcherProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { projects, refetch } = useProjects();
  const canManage = user ? canManageProjects(user) : false;
  const [createOpen, setCreateOpen] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);

  const current =
    projects.find(
      (project) =>
        project.prefix.toUpperCase() === currentPrefix?.toUpperCase(),
    ) ?? projects[0];

  const navigateToProject = (project: Project) => {
    router.push(`/p/${project.prefix}`);
  };

  const handleCreated = (project: Project) => {
    void refetch();
    navigateToProject(project);
  };

  const handleUpdated = (project: Project) => {
    void refetch();
    if (currentPrefix?.toUpperCase() === project.prefix.toUpperCase()) {
      router.refresh();
    } else if (current?.id === project.id) {
      router.push(`/p/${project.prefix}`);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="min-w-[12rem] justify-between">
            <span className="flex items-center gap-2 truncate">
              <FolderIcon className="size-4 shrink-0" />
              <span className="truncate">
                {current ? current.name : "Select project"}
              </span>
            </span>
            <ChevronDownIcon className="size-4 shrink-0 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>Projects</DropdownMenuLabel>
          {projects.map((project) => (
            <DropdownMenuItem
              key={project.id}
              onSelect={() => navigateToProject(project)}
              className="justify-between"
            >
              <span>
                {project.name}{" "}
                <span className="font-mono text-xs text-muted-foreground">
                  ({project.prefix})
                </span>
              </span>
              {current?.id === project.id ? (
                <span className="text-xs text-muted-foreground">Current</span>
              ) : null}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          {canManage ? (
            <DropdownMenuItem onSelect={() => setCreateOpen(true)}>
              <PlusIcon />
              Create project…
            </DropdownMenuItem>
          ) : null}
          {canManage && current ? (
            <DropdownMenuItem onSelect={() => setEditProject(current)}>
              <PencilIcon />
              Edit current project…
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {canManage ? (
        <ProjectCreateDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreated={handleCreated}
        />
      ) : null}
      {canManage ? (
        <ProjectEditDialog
          project={editProject}
          open={editProject !== null}
          onOpenChange={(open) => {
            if (!open) setEditProject(null);
          }}
          onUpdated={handleUpdated}
        />
      ) : null}
    </>
  );
}

export function ZeroProjectsOnboarding() {
  const [createOpen, setCreateOpen] = useState(false);
  const { refetch } = useProjects();
  const router = useRouter();
  const { user } = useAuth();
  const canManage = user ? canManageProjects(user) : false;

  return (
    <main className="flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center gap-6 p-8">
      <div className="max-w-md space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          {canManage ? "Create your first project" : "No projects yet"}
        </h1>
        <p className="text-muted-foreground">
          {canManage
            ? "Projects organize test cases with their own directory tree and case-number prefix."
            : "Ask an Admin to create a project before you can browse test cases."}
        </p>
      </div>
      {canManage ? (
        <>
          <Button onClick={() => setCreateOpen(true)}>Create project</Button>
          <ProjectCreateDialog
            open={createOpen}
            onOpenChange={setCreateOpen}
            onCreated={(project) => {
              void refetch();
              router.push(`/p/${project.prefix}`);
            }}
          />
        </>
      ) : null}
    </main>
  );
}

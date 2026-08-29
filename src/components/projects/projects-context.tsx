"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";

import { useAsyncData } from "@/hooks/use-async-data";
import { listProjects } from "@/lib/api-client";
import type { Project } from "@/lib/contracts";

type ProjectsContextValue = {
  projects: Project[];
  isLoading: boolean;
  error: Error | undefined;
  refetch: () => void;
  getProjectByPrefix: (prefix: string) => Project | undefined;
};

const ProjectsContext = createContext<ProjectsContextValue | null>(null);

export function ProjectsProvider({ children }: { children: ReactNode }) {
  const { data, error, isLoading, refetch } = useAsyncData(
    () => listProjects().then((response) => response.items),
    [],
  );

  const projects = useMemo(() => data ?? [], [data]);

  const getProjectByPrefix = useCallback(
    (prefix: string) =>
      projects.find(
        (project) => project.prefix.toUpperCase() === prefix.toUpperCase(),
      ),
    [projects],
  );

  const value = useMemo(
    () => ({
      projects,
      isLoading,
      error,
      refetch,
      getProjectByPrefix,
    }),
    [projects, isLoading, error, refetch, getProjectByPrefix],
  );

  return (
    <ProjectsContext.Provider value={value}>{children}</ProjectsContext.Provider>
  );
}

export function useProjects() {
  const context = useContext(ProjectsContext);
  if (!context) {
    throw new Error("useProjects must be used within ProjectsProvider");
  }
  return context;
}

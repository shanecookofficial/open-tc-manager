"use client";

import { PlusIcon, SearchIcon } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

import {
  CaseList,
  PaginationControls,
} from "@/components/repository/case-list";
import {
  DirectorySidebar,
  directoryParamToSelection,
  directorySelectionToApiFilter,
  directorySelectionToParam,
  type DirectorySelection,
} from "@/components/repository/directory-tree";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAsyncData, useDebouncedValue } from "@/hooks/use-async-data";
import { getProjectTree, listTestCases } from "@/lib/api-client";
import type { Project } from "@/lib/contracts";

type RepositoryViewProps = {
  project: Project;
};

export function RepositoryView({ project }: RepositoryViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const directoryParam = searchParams.get("dir");
  const qParam = searchParams.get("q") ?? "";
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const pageSize = Number(searchParams.get("pageSize") ?? "50") || 50;

  const selection = directoryParamToSelection(directoryParam);
  const debouncedQ = useDebouncedValue(qParam, 300);

  const { data: tree, isLoading: treeLoading } = useAsyncData(
    () => getProjectTree(project.id),
    [project.id],
  );
  const treeReady = tree !== undefined;

  const directoryId = directorySelectionToApiFilter(selection);

  const { data: caseList, isLoading: listLoading } = useAsyncData(
    () =>
      listTestCases({
        projectId: project.id,
        directoryId,
        q: debouncedQ.trim() || undefined,
        page,
        pageSize,
      }),
    [project.id, directoryId, debouncedQ, page, pageSize],
  );

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null) {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      router.push(`/p/${project.prefix}?${params.toString()}`);
    },
    [router, project.prefix, searchParams],
  );

  const handleDirectorySelect = (next: DirectorySelection) => {
    updateParams({
      dir: directorySelectionToParam(next) ?? null,
      page: "1",
    });
  };

  const emptyState = useMemo(() => {
    if (debouncedQ.trim()) {
      return (
        <div className="text-center">
          <h2 className="text-lg font-medium">No matching test cases</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Try a different search term or clear the filter.
          </p>
        </div>
      );
    }
    if (selection.type === "directory") {
      return (
        <div className="text-center">
          <h2 className="text-lg font-medium">This folder is empty</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Create a test case or choose another folder.
          </p>
        </div>
      );
    }
    return (
      <div className="text-center">
        <h2 className="text-lg font-medium">No test cases yet</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Create your first test case to get started.
        </p>
      </div>
    );
  }, [debouncedQ, selection.type]);

  const newCaseHref = useMemo(() => {
    const params = new URLSearchParams();
    params.set("project", String(project.id));
    if (selection.type === "directory") {
      params.set("directory", String(selection.id));
    } else if (selection.type === "root") {
      params.set("directory", "root");
    }
    return `/cases/new?${params.toString()}`;
  }, [project.id, selection]);

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)]">
      {!treeReady && treeLoading ? (
        <aside className="w-64 shrink-0 border-r bg-muted/20 p-3">
          <div className="space-y-2">
            <div className="h-8 animate-pulse rounded bg-accent" />
            <div className="h-8 animate-pulse rounded bg-accent" />
            <div className="h-8 animate-pulse rounded bg-accent" />
          </div>
        </aside>
      ) : tree ? (
        <DirectorySidebar
          prefix={project.prefix}
          directories={tree.directories}
          allCount={tree.activeCaseCount}
          trashCount={tree.trashCount}
          selection={selection}
          onSelect={handleDirectorySelect}
        />
      ) : (
        <aside className="w-64 shrink-0 border-r bg-muted/20 p-3" />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
          <div className="relative min-w-[12rem] flex-1">
            <SearchIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={qParam}
              onChange={(event) =>
                updateParams({ q: event.target.value || null, page: "1" })
              }
              placeholder="Search by title or number…"
              className="pl-8"
              aria-label="Search test cases"
            />
          </div>
          <Button asChild>
            <Link href={newCaseHref}>
              <PlusIcon />
              New test case
            </Link>
          </Button>
        </div>

        <div className="flex-1 overflow-auto">
          <CaseList
            cases={caseList?.items ?? []}
            isLoading={listLoading}
            emptyState={emptyState}
          />
        </div>

        {caseList ? (
          <PaginationControls
            page={caseList.page}
            totalPages={caseList.totalPages}
            totalItems={caseList.totalItems}
            onPageChange={(nextPage) =>
              updateParams({ page: String(nextPage) })
            }
          />
        ) : null}
      </div>
    </div>
  );
}

"use client";

import { PlusIcon, SearchIcon } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { ManagedDirectorySidebar } from "@/components/directories/managed-directory-sidebar";
import { useAuth } from "@/components/auth/auth-context";
import {
  CaseList,
  PaginationControls,
} from "@/components/repository/case-list";
import {
  directoryParamToSelection,
  directorySelectionToApiFilter,
  directorySelectionToParam,
  directoryFilterKey,
  type DirectorySelection,
} from "@/components/repository/directory-tree";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAsyncData, useDebouncedValue } from "@/hooks/use-async-data";
import { useAsyncErrorToast } from "@/components/ui/async-error-toast";
import { ApiClientError, bulkTrash, getProjectTree, listTestCases, optionalBulkFilter } from "@/lib/api-client";
import {
  canBulkTrash,
  canManageDirectories,
  canWriteCases,
} from "@/lib/auth/permissions";
import type { BulkFilter, Project } from "@/lib/contracts";

type SelectionScope =
  | { type: "ids"; ids: Set<number>; filterKey: string }
  | { type: "all"; count: number; filterKey: string };

type RepositoryViewProps = {
  project: Project;
};

export function RepositoryView({ project }: RepositoryViewProps) {
  const router = useRouter();
  const { user } = useAuth();
  const userRole = user?.role ?? "viewer";
  const canWrite = canWriteCases(userRole);
  const canSelect = canBulkTrash(userRole);
  const canManageDirs = canManageDirectories(userRole);
  const searchParams = useSearchParams();

  const directoryParam = searchParams.get("dir");
  const qParam = searchParams.get("q") ?? "";
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const pageSize = Number(searchParams.get("pageSize") ?? "50") || 50;

  const selection = directoryParamToSelection(directoryParam);
  const debouncedQ = useDebouncedValue(qParam, 300);

  const [refreshKey, setRefreshKey] = useState(0);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedScope, setSelectedScope] = useState<SelectionScope | null>(null);
  const [confirmTrashOpen, setConfirmTrashOpen] = useState(false);
  const [isTrashing, setIsTrashing] = useState(false);

  const { data: tree, isLoading: treeLoading, error: treeError, refetch: refetchTree } = useAsyncData(
    () => getProjectTree(project.id),
    [project.id, refreshKey],
  );
  const treeReady = tree !== undefined;

  const directoryId = directorySelectionToApiFilter(selection);

  const currentFilter: BulkFilter = useMemo(() => {
    const filter: BulkFilter = {};
    if (directoryId !== undefined) {
      filter.directoryId = directoryId;
    }
    if (debouncedQ.trim()) {
      filter.q = debouncedQ.trim();
    }
    return filter;
  }, [directoryId, debouncedQ]);

  const { data: caseList, isLoading: listLoading, error: listError, refetch: refetchList } = useAsyncData(
    () =>
      listTestCases({
        projectId: project.id,
        directoryId,
        q: debouncedQ.trim() || undefined,
        page,
        pageSize,
      }),
    [project.id, directoryId, debouncedQ, page, pageSize, refreshKey],
  );

  useAsyncErrorToast({
    error: treeError,
    message: "Failed to load directory tree",
    onRetry: refetchTree,
  });
  useAsyncErrorToast({
    error: listError,
    message: "Failed to load test cases",
    onRetry: refetchList,
  });

  const handleMutated = () => {
    setRefreshKey((key) => key + 1);
  };

  const filterKey = directoryFilterKey(directoryId, debouncedQ);

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

  const activeScope =
    selectedScope?.filterKey === filterKey ? selectedScope : null;

  const selectedIds =
    activeScope?.type === "ids" ? activeScope.ids : new Set<number>();

  const selectedCount =
    activeScope?.type === "all"
      ? activeScope.count
      : activeScope?.type === "ids"
        ? activeScope.ids.size
        : 0;

  const hasActiveFilter =
    debouncedQ.trim().length > 0 ||
    selection.type === "directory" ||
    selection.type === "root";
  const visibleIds = caseList?.items.map((item) => item.id) ?? [];
  const showSelectAllMatching =
    caseList !== undefined &&
    caseList.totalItems > 0 &&
    (hasActiveFilter || caseList.totalItems > visibleIds.length);
  const pageAllSelected =
    visibleIds.length > 0 &&
    activeScope?.type === "ids" &&
    visibleIds.every((id) => activeScope.ids.has(id));
  const pageSomeSelected =
    activeScope?.type === "ids" &&
    visibleIds.some((id) => activeScope.ids.has(id));

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedScope(null);
  };

  const toggleCase = (id: number, checked: boolean) => {
    setSelectedScope((prev) => {
      const current = prev?.filterKey === filterKey ? prev : null;
      if (current?.type === "all") {
        const ids = new Set(
          (caseList?.items ?? [])
            .map((item) => item.id)
            .filter((itemId) => itemId !== id),
        );
        return ids.size > 0 ? { type: "ids", ids, filterKey } : null;
      }
      const ids = new Set(current?.type === "ids" ? current.ids : []);
      if (checked) ids.add(id);
      else ids.delete(id);
      return ids.size > 0 ? { type: "ids", ids, filterKey } : null;
    });
  };

  const togglePage = (checked: boolean) => {
    setSelectedScope((prev) => {
      const current = prev?.filterKey === filterKey ? prev : null;
      const ids = new Set(current?.type === "ids" ? current.ids : []);
      for (const id of visibleIds) {
        if (checked) ids.add(id);
        else ids.delete(id);
      }
      return ids.size > 0 ? { type: "ids", ids, filterKey } : null;
    });
  };

  const selectAllMatching = () => {
    if (!caseList) return;
    setSelectedScope({ type: "all", count: caseList.totalItems, filterKey });
  };

  const handleBulkTrash = async () => {
    if (!activeScope || selectedCount === 0) return;
    setIsTrashing(true);
    try {
      let result: { count: number };
      if (activeScope.type === "all") {
        result = await bulkTrash({
          projectId: project.id,
          all: true,
          ...optionalBulkFilter(currentFilter),
        });
      } else {
        result = await bulkTrash({
          projectId: project.id,
          ids: Array.from(activeScope.ids),
        });
      }
      toast.success(`Moved ${result.count} test case(s) to trash`);
      exitSelectionMode();
      handleMutated();
    } catch (error) {
      if (error instanceof ApiClientError) {
        toast.error(error.message);
      } else {
        toast.error("Bulk trash failed");
      }
      handleMutated();
      exitSelectionMode();
    } finally {
      setIsTrashing(false);
      setConfirmTrashOpen(false);
    }
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
        <ManagedDirectorySidebar
          prefix={project.prefix}
          tree={tree}
          selection={selection}
          onSelect={handleDirectorySelect}
          onMutated={handleMutated}
          manageMode={canManageDirs}
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
          {canSelect ? (
            <Button
              variant={selectionMode ? "secondary" : "outline"}
              onClick={() => {
                if (selectionMode) exitSelectionMode();
                else setSelectionMode(true);
              }}
            >
              {selectionMode ? "Cancel" : "Select cases"}
            </Button>
          ) : null}
          {!selectionMode && canWrite ? (
            <Button asChild>
              <Link href={newCaseHref}>
                <PlusIcon />
                New test case
              </Link>
            </Button>
          ) : null}
        </div>

        {selectionMode && canSelect && caseList && caseList.totalItems > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-4 py-2 text-sm">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-medium">{selectedCount} selected</span>
              {showSelectAllMatching ? (
                <Button
                  variant="link"
                  className="h-auto p-0"
                  onClick={selectAllMatching}
                >
                  Select all {caseList.totalItems} matching
                </Button>
              ) : null}
            </div>
            <Button
              variant="destructive"
              size="sm"
              disabled={selectedCount === 0}
              onClick={() => setConfirmTrashOpen(true)}
            >
              Move to trash
            </Button>
          </div>
        ) : null}

        <div className="flex-1 overflow-auto">
          <CaseList
            cases={caseList?.items ?? []}
            isLoading={listLoading}
            emptyState={emptyState}
            selectionMode={selectionMode}
            selectedIds={selectedIds}
            onToggleCase={toggleCase}
            onTogglePage={togglePage}
            pageAllSelected={pageAllSelected}
            pageSomeSelected={pageSomeSelected}
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

      <AlertDialog open={confirmTrashOpen} onOpenChange={setConfirmTrashOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move to trash?</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedCount} test case{selectedCount === 1 ? "" : "s"} will be
              moved to the project trash.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkTrash}
              disabled={isTrashing}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {isTrashing ? "Moving…" : `Move ${selectedCount} to trash`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

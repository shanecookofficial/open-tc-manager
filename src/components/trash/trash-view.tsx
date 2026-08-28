"use client";

import { SearchIcon } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  PaginationControls,
} from "@/components/repository/case-list";
import {
  directoryParamToSelection,
  directorySelectionToApiFilter,
  directorySelectionToParam,
  directoryFilterKey,
  DirectoryTree,
} from "@/components/repository/directory-tree";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TypedConfirmDialog } from "@/components/ui/typed-confirm-dialog";
import { useAsyncErrorToast } from "@/components/ui/async-error-toast";
import { useAsyncData, useDebouncedValue } from "@/hooks/use-async-data";
import {
  ApiClientError,
  bulkRestore,
  getProjectTree,
  listTrash,
  permanentlyDeleteTestCase,
  purgeTrash,
  restoreTestCase,
  optionalBulkFilter,
} from "@/lib/api-client";
import { formatDateTime } from "@/lib/format-date";
import type { BulkFilter, Project, TestCaseSummary } from "@/lib/contracts";

type TrashSelectionScope =
  | { type: "ids"; ids: Set<number>; filterKey: string }
  | { type: "all"; count: number; filterKey: string };

type TrashViewProps = {
  project: Project;
};

export function TrashView({ project }: TrashViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const directoryParam = searchParams.get("dir");
  const qParam = searchParams.get("q") ?? "";
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const pageSize = Number(searchParams.get("pageSize") ?? "50") || 50;

  const directorySelection = directoryParamToSelection(directoryParam);
  const debouncedQ = useDebouncedValue(qParam, 300);
  const directoryId = directorySelectionToApiFilter(directorySelection);

  const [refreshKey, setRefreshKey] = useState(0);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedScope, setSelectedScope] = useState<TrashSelectionScope | null>(
    null,
  );
  const [typedConfirm, setTypedConfirm] = useState<
    | { kind: "single"; testCase: TestCaseSummary }
    | { kind: "bulk"; count: number }
    | null
  >(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const { data: tree, error: treeError, refetch: refetchTree } = useAsyncData(
    () => getProjectTree(project.id),
    [project.id, refreshKey],
  );

  const currentFilter: BulkFilter = useMemo(() => {
    const filter: BulkFilter = {};
    if (directoryId !== undefined) filter.directoryId = directoryId;
    if (debouncedQ.trim()) filter.q = debouncedQ.trim();
    return filter;
  }, [directoryId, debouncedQ]);

  const { data: trashList, isLoading, error: listError, refetch } = useAsyncData(
    () =>
      listTrash({
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
    message: "Failed to load trash",
    onRetry: refetch,
  });

  const handleMutated = useCallback(() => {
    setRefreshKey((key) => key + 1);
  }, []);

  const filterKey = directoryFilterKey(directoryId, debouncedQ);

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null) params.delete(key);
        else params.set(key, value);
      }
      router.push(`/p/${project.prefix}/trash?${params.toString()}`);
    },
    [router, project.prefix, searchParams],
  );

  const activeScope =
    selectedScope?.filterKey === filterKey ? selectedScope : null;

  const selectedCount =
    activeScope?.type === "all"
      ? activeScope.count
      : activeScope?.type === "ids"
        ? activeScope.ids.size
        : 0;

  const selectedIds =
    activeScope?.type === "ids" ? activeScope.ids : new Set<number>();

  const hasActiveFilter =
    debouncedQ.trim().length > 0 ||
    directorySelection.type === "directory" ||
    directorySelection.type === "root";
  const visibleIds = trashList?.items.map((item) => item.id) ?? [];
  const showSelectAllMatching =
    trashList !== undefined &&
    trashList.totalItems > 0 &&
    (hasActiveFilter || trashList.totalItems > visibleIds.length);
  const pageAllSelected =
    visibleIds.length > 0 &&
    activeScope?.type === "ids" &&
    visibleIds.every((id) => activeScope.ids.has(id));
  const pageSomeSelected =
    activeScope?.type === "ids" &&
    visibleIds.some((id) => activeScope.ids.has(id));

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

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedScope(null);
  };

  const handleRestore = async (id: number, displayNumber: string, dirId: number | null) => {
    try {
      const restored = await restoreTestCase(id);
      const message =
        restored.directoryId === null && dirId === null
          ? `${displayNumber} restored to project root`
          : restored.directoryId === null
            ? `${displayNumber} restored to project root (original folder no longer exists)`
            : `${displayNumber} restored`;
      toast.success(message);
      handleMutated();
    } catch (error) {
      if (error instanceof ApiClientError) toast.error(error.message);
      else toast.error("Restore failed");
    }
  };

  const handleBulkRestore = async () => {
    if (!activeScope || selectedCount === 0) return;
    try {
      const result =
        activeScope.type === "all"
          ? await bulkRestore({
              projectId: project.id,
              all: true,
              ...optionalBulkFilter(currentFilter),
            })
          : await bulkRestore({
              projectId: project.id,
              ids: Array.from(activeScope.ids),
            });
      toast.success(`Restored ${result.count} test case(s)`);
      exitSelectionMode();
      handleMutated();
    } catch (error) {
      if (error instanceof ApiClientError) toast.error(error.message);
      else toast.error("Bulk restore failed");
    }
  };

  const handlePermanentDelete = async () => {
    if (!typedConfirm) return;
    setIsDeleting(true);
    try {
      if (typedConfirm.kind === "single") {
        await permanentlyDeleteTestCase(typedConfirm.testCase.id);
        toast.success(`${typedConfirm.testCase.displayNumber} permanently deleted`);
      } else {
        if (!activeScope || selectedCount === 0) return;
        const result =
          activeScope.type === "all"
            ? await purgeTrash(project.id, {
                all: true,
                ...optionalBulkFilter(currentFilter),
              })
            : await purgeTrash(project.id, {
                ids: Array.from(activeScope.ids),
              });
        toast.success(`Permanently deleted ${result.count} test case(s)`);
        exitSelectionMode();
      }
      setTypedConfirm(null);
      handleMutated();
    } catch (error) {
      if (error instanceof ApiClientError) toast.error(error.message);
      else toast.error("Permanent delete failed");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)]">
      <aside className="flex w-64 shrink-0 flex-col border-r bg-muted/20">
        <div className="border-b p-3">
          <Link
            href={`/p/${project.prefix}`}
            className="text-sm text-muted-foreground hover:text-foreground hover:underline"
          >
            ← Back to repository
          </Link>
          <h1 className="mt-2 text-lg font-semibold">Trash</h1>
          <p className="text-sm text-muted-foreground">
            {tree?.trashCount ?? 0} trashed case(s)
          </p>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {tree ? (
            <DirectoryTree
              directories={tree.directories}
              allCount={tree.trashCount}
              selection={directorySelection}
              onSelect={(next) =>
                updateParams({
                  dir: directorySelectionToParam(next) ?? null,
                  page: "1",
                })
              }
              rootLabel="All trashed cases"
              showNodeCounts={false}
            />
          ) : (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
          <div className="relative min-w-[12rem] flex-1">
            <SearchIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={qParam}
              onChange={(event) =>
                updateParams({ q: event.target.value || null, page: "1" })
              }
              placeholder="Search trash…"
              className="pl-8"
              aria-label="Search trash"
            />
          </div>
          <Button
            variant={selectionMode ? "secondary" : "outline"}
            onClick={() => {
              if (selectionMode) exitSelectionMode();
              else setSelectionMode(true);
            }}
          >
            {selectionMode ? "Cancel" : "Select cases"}
          </Button>
        </div>

        {selectionMode && trashList && trashList.totalItems > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-4 py-2 text-sm">
            <div className="flex items-center gap-3">
              <span className="font-medium">{selectedCount} selected</span>
              {showSelectAllMatching ? (
                <Button
                  variant="link"
                  className="h-auto p-0"
                  onClick={() =>
                    setSelectedScope({
                      type: "all",
                      count: trashList.totalItems,
                      filterKey,
                    })
                  }
                >
                  Select all {trashList.totalItems} matching
                </Button>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={selectedCount === 0}
                onClick={handleBulkRestore}
              >
                Restore
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={selectedCount === 0}
                data-testid="bulk-delete-permanently"
                onClick={() =>
                  setTypedConfirm({ kind: "bulk", count: selectedCount })
                }
              >
                Delete permanently
              </Button>
            </div>
          </div>
        ) : null}

        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : trashList && trashList.items.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  {selectionMode ? (
                    <TableHead className="w-10">
                      <Checkbox
                        checked={pageAllSelected}
                        aria-checked={
                          pageSomeSelected && !pageAllSelected
                            ? "mixed"
                            : pageAllSelected
                        }
                        onCheckedChange={(checked) =>
                          togglePage(checked === true)
                        }
                        aria-label="Select all on this page"
                      />
                    </TableHead>
                  ) : null}
                  <TableHead className="w-28">Number</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead className="w-44">Trashed at</TableHead>
                  <TableHead className="w-52 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trashList.items.map((testCase) => (
                  <TableRow key={testCase.id}>
                    {selectionMode ? (
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(testCase.id)}
                          onCheckedChange={(checked) => {
                            setSelectedScope((prev) => {
                              const current =
                                prev?.filterKey === filterKey ? prev : null;
                              if (current?.type === "all") {
                                const ids = new Set(
                                  (trashList?.items ?? [])
                                    .map((item) => item.id)
                                    .filter((itemId) => itemId !== testCase.id),
                                );
                                return ids.size > 0
                                  ? { type: "ids", ids, filterKey }
                                  : null;
                              }
                              const ids = new Set(
                                current?.type === "ids" ? current.ids : [],
                              );
                              if (checked) ids.add(testCase.id);
                              else ids.delete(testCase.id);
                              return ids.size > 0
                                ? { type: "ids", ids, filterKey }
                                : null;
                            });
                          }}
                          aria-label={`Select ${testCase.displayNumber}`}
                        />
                      </TableCell>
                    ) : null}
                    <TableCell className="font-mono text-sm">
                      {testCase.displayNumber}
                    </TableCell>
                    <TableCell className="max-w-md truncate">
                      {testCase.title}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {testCase.deletedAt
                        ? formatDateTime(testCase.deletedAt)
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            handleRestore(
                              testCase.id,
                              testCase.displayNumber,
                              testCase.directoryId,
                            )
                          }
                        >
                          Restore
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() =>
                            setTypedConfirm({ kind: "single", testCase })
                          }
                        >
                          Delete permanently
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="p-8 text-center">
              {debouncedQ.trim() || directorySelection.type !== "all" ? (
                <>
                  <h2 className="text-lg font-medium">No matching trashed cases</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Try a different search term or choose another folder.
                  </p>
                </>
              ) : (
                <>
                  <h2 className="text-lg font-medium">Trash is empty</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Deleted test cases will appear here.
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        {trashList ? (
          <PaginationControls
            page={trashList.page}
            totalPages={trashList.totalPages}
            totalItems={trashList.totalItems}
            onPageChange={(nextPage) =>
              updateParams({ page: String(nextPage) })
            }
          />
        ) : null}
      </div>

      <TypedConfirmDialog
        open={typedConfirm?.kind === "single"}
        onOpenChange={(open) => {
          if (!open) setTypedConfirm(null);
        }}
        title="Delete permanently?"
        description={`${typedConfirm?.kind === "single" ? typedConfirm.testCase.displayNumber : ""} will be permanently deleted. This cannot be undone.`}
        confirmLabel="Delete permanently"
        requiredText="DELETE"
        onConfirm={handlePermanentDelete}
        isSubmitting={isDeleting}
      />

      <TypedConfirmDialog
        open={typedConfirm?.kind === "bulk"}
        onOpenChange={(open) => {
          if (!open) setTypedConfirm(null);
        }}
        title="Delete permanently?"
        description={`${typedConfirm?.kind === "bulk" ? typedConfirm.count : 0} test case(s) will be permanently deleted. This cannot be undone.`}
        confirmLabel="Delete permanently"
        requiredText={
          typedConfirm?.kind === "bulk" ? String(typedConfirm.count) : ""
        }
        onConfirm={handlePermanentDelete}
        isSubmitting={isDeleting}
      />
    </div>
  );
}

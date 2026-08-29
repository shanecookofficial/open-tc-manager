"use client";

import {
  ChevronDownIcon,
  ChevronRightIcon,
  FolderIcon,
  MoreHorizontalIcon,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { TreeNode } from "@/lib/contracts";
import { collectCollapsedFromDepth, treeIndentPx } from "@/lib/tree-collapse";
import { filterExcludedNodes } from "@/lib/tree-utils";

export type DirectorySelection =
  | { type: "all" }
  | { type: "root" }
  | { type: "directory"; id: number };

export type DirectoryManageAction =
  | { type: "create"; parentId: number | null }
  | { type: "rename"; directory: TreeNode }
  | { type: "move"; directory: TreeNode }
  | { type: "delete"; directory: TreeNode };

type DirectoryTreeProps = {
  directories: TreeNode[];
  allCount: number;
  selection: DirectorySelection;
  onSelect: (selection: DirectorySelection) => void;
  placementMode?: boolean;
  manageMode?: boolean;
  onManageAction?: (action: DirectoryManageAction) => void;
  excludeIds?: Set<number>;
  /** Root row label. Defaults to "All test cases" (or "Project root" in placement mode). */
  rootLabel?: string;
  /** Per-folder counts come from the tree's activeCaseCount. Hide them when those numbers would mislead (trash view). */
  showNodeCounts?: boolean;
  /** Collapse folders at this depth and deeper on first render (keeps deep trees usable). */
  defaultCollapseDepth?: number;
};

function TreeNodeRow({
  node,
  depth,
  selection,
  onSelect,
  collapsed,
  onToggle,
  onKeyNavigate,
  manageMode,
  onManageAction,
  showNodeCounts,
}: {
  node: TreeNode;
  depth: number;
  selection: DirectorySelection;
  onSelect: (selection: DirectorySelection) => void;
  collapsed: Set<number>;
  onToggle: (id: number) => void;
  onKeyNavigate: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  manageMode?: boolean;
  onManageAction?: (action: DirectoryManageAction) => void;
  showNodeCounts: boolean;
}) {
  const hasChildren = node.children.length > 0;
  const isCollapsed = collapsed.has(node.id);
  const selected =
    selection.type === "directory" && selection.id === node.id;

  return (
    <div>
      <div
        className={cn(
          "group flex items-center gap-0.5 rounded-md hover:bg-accent",
          selected && "bg-accent",
        )}
        style={{ paddingLeft: `${treeIndentPx(depth)}px` }}
      >
        <button
          type="button"
          data-tree-item
          className="flex min-w-0 flex-1 items-center gap-1 py-1.5 pr-1 text-left text-sm"
          aria-current={selected ? "page" : undefined}
          onClick={() => onSelect({ type: "directory", id: node.id })}
          onKeyDown={onKeyNavigate}
        >
          {hasChildren ? (
            <span
              role="presentation"
              className="inline-flex size-5 shrink-0 items-center justify-center"
              onClick={(event) => {
                event.stopPropagation();
                onToggle(node.id);
              }}
            >
              {isCollapsed ? (
                <ChevronRightIcon className="size-3.5" />
              ) : (
                <ChevronDownIcon className="size-3.5" />
              )}
            </span>
          ) : (
            <span className="inline-block size-5 shrink-0" />
          )}
          <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className={cn("flex-1 truncate", selected && "font-medium")}>
            {node.name}
          </span>
          {showNodeCounts ? (
            <span className="text-xs text-muted-foreground tabular-nums">
              {node.activeCaseCount}
            </span>
          ) : null}
        </button>
        {manageMode && onManageAction ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="mr-1 shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100"
                aria-label={`Actions for ${node.name}`}
                onClick={(event) => event.stopPropagation()}
              >
                <MoreHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() =>
                  onManageAction({ type: "create", parentId: node.id })
                }
              >
                New subfolder…
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => onManageAction({ type: "rename", directory: node })}
              >
                Rename…
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => onManageAction({ type: "move", directory: node })}
              >
                Move…
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => onManageAction({ type: "delete", directory: node })}
              >
                Delete…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      {hasChildren && !isCollapsed
        ? node.children.map((child) => (
            <TreeNodeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              selection={selection}
              onSelect={onSelect}
              collapsed={collapsed}
              onToggle={onToggle}
              onKeyNavigate={onKeyNavigate}
              manageMode={manageMode}
              onManageAction={onManageAction}
              showNodeCounts={showNodeCounts}
            />
          ))
        : null}
    </div>
  );
}

export function DirectoryTree({
  directories,
  allCount,
  selection,
  onSelect,
  placementMode = false,
  manageMode = false,
  onManageAction,
  excludeIds,
  rootLabel,
  showNodeCounts = true,
  defaultCollapseDepth,
}: DirectoryTreeProps) {
  const visibleDirectories = filterExcludedNodes(directories, excludeIds);
  const [collapsed, setCollapsed] = useState<Set<number>>(() =>
    defaultCollapseDepth !== undefined
      ? collectCollapsedFromDepth(visibleDirectories, defaultCollapseDepth)
      : new Set(),
  );

  const toggleCollapsed = useCallback((id: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleKeyNavigate = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const items = Array.from(
      document.querySelectorAll<HTMLButtonElement>("[data-tree-item]"),
    );
    const index = items.indexOf(event.currentTarget);
    if (event.key === "ArrowDown" && index < items.length - 1) {
      event.preventDefault();
      items[index + 1]?.focus();
    } else if (event.key === "ArrowUp" && index > 0) {
      event.preventDefault();
      items[index - 1]?.focus();
    }
  };

  const rootSelected = placementMode
    ? selection.type === "root"
    : selection.type === "all";

  return (
    <nav aria-label="Directory tree" className="min-w-0 space-y-1 overflow-x-auto">
      <div
        className={cn(
          "group flex items-center gap-0.5 rounded-md hover:bg-accent",
          rootSelected && "bg-accent",
        )}
      >
        <button
          type="button"
          data-tree-item
          className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-sm"
          aria-current={rootSelected ? "page" : undefined}
          onClick={() =>
            onSelect(placementMode ? { type: "root" } : { type: "all" })
          }
          onKeyDown={handleKeyNavigate}
        >
          <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className={cn("flex-1 truncate", rootSelected && "font-medium")}>
            {rootLabel ?? (placementMode ? "Project root" : "All test cases")}
          </span>
          {!placementMode ? (
            <span className="text-xs text-muted-foreground tabular-nums">
              {allCount}
            </span>
          ) : null}
        </button>
        {manageMode && onManageAction ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="mr-1 shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100"
                aria-label="Actions for all test cases"
              >
                <MoreHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() =>
                  onManageAction({ type: "create", parentId: null })
                }
              >
                New folder…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>

      {visibleDirectories.map((node) => (
        <TreeNodeRow
          key={node.id}
          node={node}
          depth={0}
          selection={selection}
          onSelect={onSelect}
          collapsed={collapsed}
          onToggle={toggleCollapsed}
          onKeyNavigate={handleKeyNavigate}
          manageMode={manageMode}
          onManageAction={onManageAction}
          showNodeCounts={showNodeCounts}
        />
      ))}
    </nav>
  );
}

type DirectorySidebarProps = {
  prefix: string;
  directories: TreeNode[];
  allCount: number;
  trashCount: number;
  selection: DirectorySelection;
  onSelect: (selection: DirectorySelection) => void;
  manageMode?: boolean;
  onManageAction?: (action: DirectoryManageAction) => void;
};

export function DirectorySidebar({
  prefix,
  directories,
  allCount,
  trashCount,
  selection,
  onSelect,
  manageMode,
  onManageAction,
}: DirectorySidebarProps) {
  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r bg-muted/20">
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-3">
        <DirectoryTree
          directories={directories}
          allCount={allCount}
          selection={selection}
          onSelect={onSelect}
          manageMode={manageMode}
          onManageAction={onManageAction}
          defaultCollapseDepth={2}
        />
      </div>
      <div className="border-t p-3">
        <Link
          href={`/p/${prefix}/trash`}
          className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <span>Trash</span>
          <span className="tabular-nums" data-testid="trash-count">
            {trashCount}
          </span>
        </Link>
      </div>
    </aside>
  );
}

export function directorySelectionToParam(
  selection: DirectorySelection,
): string | undefined {
  if (selection.type === "all") return undefined;
  if (selection.type === "root") return "root";
  return String(selection.id);
}

export function directoryParamToSelection(
  param: string | null | undefined,
): DirectorySelection {
  if (!param) return { type: "all" };
  if (param === "root") return { type: "root" };
  const id = Number(param);
  if (Number.isInteger(id) && id > 0) {
    return { type: "directory", id };
  }
  return { type: "all" };
}

export function directorySelectionToApiFilter(
  selection: DirectorySelection,
): number | null | undefined {
  if (selection.type === "all") return undefined;
  if (selection.type === "root") return null;
  return selection.id;
}

/** Stable key for the list/trash filter so selection cannot outlive it. */
export function directoryFilterKey(
  directoryId: number | null | undefined,
  q: string,
): string {
  const dirPart =
    directoryId === undefined
      ? "all"
      : directoryId === null
        ? "root"
        : String(directoryId);
  return `${dirPart}:${q.trim()}`;
}

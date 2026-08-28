"use client";

import { ChevronDownIcon, ChevronRightIcon, FolderIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";

import { cn } from "@/lib/utils";
import type { TreeNode } from "@/lib/contracts";

export type DirectorySelection =
  | { type: "all" }
  | { type: "root" }
  | { type: "directory"; id: number };

type DirectoryTreeProps = {
  directories: TreeNode[];
  allCount: number;
  selection: DirectorySelection;
  onSelect: (selection: DirectorySelection) => void;
};

function TreeNodeButton({
  node,
  depth,
  selection,
  onSelect,
  collapsed,
  onToggle,
  onKeyNavigate,
}: {
  node: TreeNode;
  depth: number;
  selection: DirectorySelection;
  onSelect: (selection: DirectorySelection) => void;
  collapsed: Set<number>;
  onToggle: (id: number) => void;
  onKeyNavigate: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
}) {
  const hasChildren = node.children.length > 0;
  const isCollapsed = collapsed.has(node.id);
  const selected =
    selection.type === "directory" && selection.id === node.id;

  return (
    <div>
      <button
        type="button"
        data-tree-item
        className={cn(
          "flex w-full items-center gap-1 rounded-md py-1.5 pr-2 text-left text-sm hover:bg-accent",
          selected && "bg-accent font-medium",
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
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
        <span className="flex-1 truncate">{node.name}</span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {node.activeCaseCount}
        </span>
      </button>
      {hasChildren && !isCollapsed
        ? node.children.map((child) => (
            <TreeNodeButton
              key={child.id}
              node={child}
              depth={depth + 1}
              selection={selection}
              onSelect={onSelect}
              collapsed={collapsed}
              onToggle={onToggle}
              onKeyNavigate={onKeyNavigate}
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
}: DirectoryTreeProps) {
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

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

  const allSelected = selection.type === "all";

  return (
    <nav aria-label="Directory tree" className="space-y-1">
      <button
        type="button"
        data-tree-item
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent",
          allSelected && "bg-accent font-medium",
        )}
        aria-current={allSelected ? "page" : undefined}
        onClick={() => onSelect({ type: "all" })}
        onKeyDown={handleKeyNavigate}
      >
        <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate">All test cases</span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {allCount}
        </span>
      </button>

      {directories.map((node) => (
        <TreeNodeButton
          key={node.id}
          node={node}
          depth={0}
          selection={selection}
          onSelect={onSelect}
          collapsed={collapsed}
          onToggle={toggleCollapsed}
          onKeyNavigate={handleKeyNavigate}
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
};

export function DirectorySidebar({
  prefix,
  directories,
  allCount,
  trashCount,
  selection,
  onSelect,
}: DirectorySidebarProps) {
  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r bg-muted/20">
      <div className="flex-1 overflow-y-auto p-3">
        <DirectoryTree
          directories={directories}
          allCount={allCount}
          selection={selection}
          onSelect={onSelect}
        />
      </div>
      <div className="border-t p-3">
        <Link
          href={`/p/${prefix}/trash`}
          className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <span>Trash</span>
          <span className="tabular-nums">{trashCount}</span>
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

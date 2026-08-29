"use client";

import { useState } from "react";

import {
  DirectoryDialogs,
} from "@/components/directories/directory-dialogs";
import {
  DirectorySidebar,
  type DirectoryManageAction,
  type DirectorySelection,
} from "@/components/repository/directory-tree";
import type { ProjectTree } from "@/lib/contracts";

type ManagedDirectorySidebarProps = {
  prefix: string;
  tree: ProjectTree;
  selection: DirectorySelection;
  onSelect: (selection: DirectorySelection) => void;
  onMutated: () => void;
  manageMode?: boolean;
};

export function ManagedDirectorySidebar({
  prefix,
  tree,
  selection,
  onSelect,
  onMutated,
  manageMode = false,
}: ManagedDirectorySidebarProps) {
  const [manageAction, setManageAction] = useState<DirectoryManageAction | null>(
    null,
  );

  return (
    <>
      <DirectorySidebar
        prefix={prefix}
        directories={tree.directories}
        allCount={tree.activeCaseCount}
        trashCount={tree.trashCount}
        selection={selection}
        onSelect={onSelect}
        manageMode={manageMode}
        onManageAction={manageMode ? setManageAction : undefined}
      />
      <DirectoryDialogs
        projectId={tree.projectId}
        tree={tree}
        action={manageAction}
        onClose={() => setManageAction(null)}
        onSuccess={onMutated}
      />
    </>
  );
}

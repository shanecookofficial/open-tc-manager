"use client";

import { useState } from "react";
import { toast } from "sonner";

import {
  DirectoryTree,
  directorySelectionToApiFilter,
  type DirectorySelection,
} from "@/components/repository/directory-tree";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAsyncData } from "@/hooks/use-async-data";
import {
  ApiClientError,
  createDirectory,
  deleteDirectory,
  getProjectTree,
  parseValidationFieldPath,
  updateDirectory,
} from "@/lib/api-client";
import { createDirectoryBodySchema, nameSchema } from "@/lib/contracts";
import type {
  Directory,
  DirectoryDeleteMode,
  ProjectTree,
  TreeNode,
} from "@/lib/contracts";
import {
  collectSubtreeIdsFromTree,
  filterExcludedNodes,
  findTreeNode,
  recursiveActiveCaseCount,
} from "@/lib/tree-utils";

type DirectoryDialogsProps = {
  projectId: number;
  tree: ProjectTree | undefined;
  action:
    | { type: "create"; parentId: number | null }
    | { type: "rename"; directory: TreeNode }
    | { type: "move"; directory: TreeNode }
    | { type: "delete"; directory: TreeNode }
    | null;
  onClose: () => void;
  onSuccess: () => void;
};

export function DirectoryDialogs({
  projectId,
  tree,
  action,
  onClose,
  onSuccess,
}: DirectoryDialogsProps) {
  if (!action) return null;

  if (action.type === "create") {
    return (
      <CreateDirectoryDialog
        projectId={projectId}
        parentId={action.parentId}
        open
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        onSuccess={() => {
          onSuccess();
          onClose();
        }}
      />
    );
  }

  if (action.type === "rename") {
    return (
      <RenameDirectoryDialog
        directory={action.directory}
        open
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        onSuccess={() => {
          onSuccess();
          onClose();
        }}
      />
    );
  }

  if (action.type === "move") {
    return (
      <MoveDirectoryDialog
        projectId={projectId}
        tree={tree}
        directory={action.directory}
        open
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        onSuccess={() => {
          onSuccess();
          onClose();
        }}
      />
    );
  }

  return (
    <DeleteDirectoryDialog
      tree={tree}
      directory={action.directory}
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      onSuccess={() => {
        onSuccess();
        onClose();
      }}
    />
  );
}

export function CreateDirectoryDialog({
  projectId,
  parentId,
  open,
  onOpenChange,
  onSuccess,
}: {
  projectId: number;
  parentId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (created: Directory) => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    const parsed = createDirectoryBodySchema.safeParse({
      projectId,
      name,
      parentId: parentId ?? undefined,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid name");
      return;
    }

    setIsSubmitting(true);
    try {
      const created = await createDirectory(parsed.data);
      toast.success(`Folder "${created.name}" created`);
      setName("");
      onSuccess(created);
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.code === "SIBLING_NAME_TAKEN") {
          setError(err.message);
          return;
        }
        if (err.code === "VALIDATION_ERROR") {
          const { detail } = parseValidationFieldPath(err.message);
          setError(detail);
          return;
        }
        toast.error(err.message);
        return;
      }
      toast.error("Failed to create folder");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>New folder</DialogTitle>
            <DialogDescription>
              {parentId === null
                ? "Create a top-level folder in this project."
                : "Create a subfolder inside the selected directory."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="folder-name">Name</Label>
              <Input
                id="folder-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                aria-invalid={error ? true : undefined}
              />
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating…" : "Create folder"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RenameDirectoryDialog({
  directory,
  open,
  onOpenChange,
  onSuccess,
}: {
  directory: TreeNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const [name, setName] = useState(directory.name);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    const parsed = nameSchema.safeParse(name);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid name");
      return;
    }

    setIsSubmitting(true);
    try {
      const updated = await updateDirectory(directory.id, { name: parsed.data });
      toast.success(`Renamed to "${updated.name}"`);
      onSuccess();
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.code === "SIBLING_NAME_TAKEN") {
          setError(err.message);
          return;
        }
        if (err.code === "VALIDATION_ERROR") {
          const { detail } = parseValidationFieldPath(err.message);
          setError(detail);
          return;
        }
        toast.error(err.message);
        return;
      }
      toast.error("Failed to rename folder");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Rename folder</DialogTitle>
            <DialogDescription>
              Rename &ldquo;{directory.name}&rdquo;.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="rename-folder">Name</Label>
              <Input
                id="rename-folder"
                value={name}
                onChange={(event) => setName(event.target.value)}
                aria-invalid={error ? true : undefined}
              />
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MoveDirectoryDialog({
  projectId,
  tree,
  directory,
  open,
  onOpenChange,
  onSuccess,
}: {
  projectId: number;
  tree: ProjectTree | undefined;
  directory: TreeNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const excludeIds = new Set(
    tree ? collectSubtreeIdsFromTree(tree.directories, directory.id) : [directory.id],
  );
  const [selection, setSelection] = useState<DirectorySelection>({ type: "root" });
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: freshTree } = useAsyncData(
    () => getProjectTree(projectId),
    [projectId],
  );
  const displayTree = freshTree ?? tree;

  const handleMove = async () => {
    setError("");
    const parentId = directorySelectionToApiFilter(selection) ?? null;

    setIsSubmitting(true);
    try {
      await updateDirectory(directory.id, { parentId });
      toast.success(`Moved "${directory.name}"`);
      onSuccess();
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.code === "CYCLE_DETECTED" || err.code === "SIBLING_NAME_TAKEN") {
          setError(err.message);
          return;
        }
        toast.error(err.message);
        return;
      }
      toast.error("Failed to move folder");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Move folder</DialogTitle>
          <DialogDescription>
            Choose a new parent for &ldquo;{directory.name}&rdquo;.
          </DialogDescription>
        </DialogHeader>
        {displayTree ? (
          <div className="max-h-64 overflow-y-auto rounded-md border p-2">
            <DirectoryTree
              directories={filterExcludedNodes(
                displayTree.directories,
                excludeIds,
              )}
              allCount={displayTree.activeCaseCount}
              selection={selection}
              onSelect={setSelection}
              placementMode
              excludeIds={excludeIds}
            />
          </div>
        ) : (
          <div className="h-32 animate-pulse rounded-md bg-accent" />
        )}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleMove} disabled={isSubmitting}>
            {isSubmitting ? "Moving…" : "Move"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDirectoryDialog({
  tree,
  directory,
  open,
  onOpenChange,
  onSuccess,
}: {
  tree: ProjectTree | undefined;
  directory: TreeNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const node = tree ? findTreeNode(tree.directories, directory.id) ?? directory : directory;
  const activeInSubtree = recursiveActiveCaseCount(node);
  const hasActiveCases = activeInSubtree > 0;
  const [mode, setMode] = useState<DirectoryDeleteMode>("move_contents_to_parent");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleDelete = async () => {
    setError("");
    setIsSubmitting(true);
    try {
      const result = await deleteDirectory(
        directory.id,
        hasActiveCases ? mode : undefined,
      );
      if (result.mode === "trash_contents") {
        toast.success(
          `Deleted folder; ${result.trashedCaseCount} case(s) moved to trash`,
        );
      } else if (result.mode === "move_contents_to_parent") {
        toast.success(
          `Deleted folder; moved ${result.movedCaseCount} case(s) and ${result.movedDirectoryCount} subfolder(s)`,
        );
      } else {
        toast.success(`Deleted folder "${directory.name}"`);
      }
      onSuccess();
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (
          err.code === "DIRECTORY_NOT_EMPTY" ||
          err.code === "SIBLING_NAME_TAKEN"
        ) {
          setError(err.message);
          return;
        }
        toast.error(err.message);
        return;
      }
      toast.error("Failed to delete folder");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete folder</DialogTitle>
          <DialogDescription>
            {hasActiveCases
              ? `"${directory.name}" contains ${activeInSubtree} active test case(s). Choose what to do with them.`
              : `Delete "${directory.name}"? This cannot be undone.`}
          </DialogDescription>
        </DialogHeader>

        {hasActiveCases ? (
          <div className="space-y-3 py-2">
            <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3 has-checked:border-primary has-checked:bg-primary/5">
              <input
                type="radio"
                name="delete-mode"
                value="move_contents_to_parent"
                checked={mode === "move_contents_to_parent"}
                onChange={() => setMode("move_contents_to_parent")}
                className="mt-1"
              />
              <div>
                <p className="text-sm font-medium">Move contents to parent folder</p>
                <p className="text-xs text-muted-foreground">
                  Subfolders and cases move up one level, then this folder is
                  removed.
                </p>
              </div>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3 has-checked:border-primary has-checked:bg-primary/5">
              <input
                type="radio"
                name="delete-mode"
                value="trash_contents"
                checked={mode === "trash_contents"}
                onChange={() => setMode("trash_contents")}
                className="mt-1"
              />
              <div>
                <p className="text-sm font-medium">Move cases to trash</p>
                <p className="text-xs text-muted-foreground">
                  Active cases in this folder are soft-deleted; empty subfolders
                  are removed.
                </p>
              </div>
            </label>
          </div>
        ) : null}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Deleting…" : "Delete folder"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

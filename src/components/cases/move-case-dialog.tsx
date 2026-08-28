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
import { useAsyncData } from "@/hooks/use-async-data";
import { ApiClientError, getProjectTree, moveTestCase } from "@/lib/api-client";
import type { Project, TestCase } from "@/lib/contracts";

type MoveCaseDialogProps = {
  testCase: TestCase;
  project: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMoved: (testCase: TestCase) => void;
};

export function MoveCaseDialog({
  testCase,
  project,
  open,
  onOpenChange,
  onMoved,
}: MoveCaseDialogProps) {
  const [selection, setSelection] = useState<DirectorySelection>(
    testCase.directoryId === null
      ? { type: "root" }
      : { type: "directory", id: testCase.directoryId },
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: tree } = useAsyncData(
    () => getProjectTree(project.id),
    [project.id],
  );

  const handleMove = async () => {
    setIsSubmitting(true);
    try {
      const directoryId = directorySelectionToApiFilter(selection) ?? null;
      const updated = await moveTestCase(testCase.id, { directoryId });
      toast.success(`Moved ${updated.displayNumber}`);
      onMoved(updated);
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiClientError) {
        toast.error(error.message);
      } else {
        toast.error("Failed to move test case");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Move test case</DialogTitle>
          <DialogDescription>
            Choose a destination folder for {testCase.displayNumber}.
          </DialogDescription>
        </DialogHeader>
        {tree ? (
          <div className="max-h-64 overflow-y-auto rounded-md border p-2">
            <DirectoryTree
              directories={tree.directories}
              allCount={tree.activeCaseCount}
              selection={selection}
              onSelect={setSelection}
              placementMode
            />
          </div>
        ) : (
          <div className="h-32 animate-pulse rounded-md bg-accent" />
        )}
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

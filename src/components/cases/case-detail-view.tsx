"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { CaseBreadcrumb } from "@/components/cases/case-breadcrumb";
import { CaseHistoryPanel } from "@/components/cases/case-history-panel";
import { MoveCaseDialog } from "@/components/cases/move-case-dialog";
import { Markdown } from "@/components/markdown";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiClientError, deleteTestCase } from "@/lib/api-client";
import { canWriteCases } from "@/lib/auth/permissions";
import { formatDateTime } from "@/lib/format-date";
import type { Project, TestCase, UserRole } from "@/lib/contracts";

type CaseDetailViewProps = {
  testCase: TestCase;
  project: Project;
  userRole: UserRole;
};

export function CaseDetailView({ testCase, project, userRole }: CaseDetailViewProps) {
  const router = useRouter();
  const [moveOpen, setMoveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [currentCase, setCurrentCase] = useState(testCase);

  const canWrite = canWriteCases(userRole);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteTestCase(currentCase.id);
      toast.success(`${currentCase.displayNumber} moved to trash`);
      router.push(`/p/${project.prefix}`);
      router.refresh();
    } catch (error) {
      if (error instanceof ApiClientError) {
        toast.error(error.message);
      } else {
        toast.error("Failed to delete test case");
      }
    } finally {
      setIsDeleting(false);
      setDeleteOpen(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      {currentCase.deletedAt ? (
        <div
          role="status"
          className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
        >
          This test case is in the trash
          {currentCase.deletedAt
            ? ` (since ${formatDateTime(currentCase.deletedAt)})`
            : ""}
          .
        </div>
      ) : null}

      <CaseBreadcrumb
        project={project}
        directoryPath={currentCase.directoryPath}
      />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="font-mono">
              {currentCase.displayNumber}
            </Badge>
          </div>
          <h1 className="break-words text-2xl font-semibold tracking-tight" title={currentCase.title}>
            {currentCase.title}
          </h1>
        </div>
        {!currentCase.deletedAt && canWrite ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href={`/cases/${currentCase.displayNumber}/edit`}>
                Edit
              </Link>
            </Button>
            <Button variant="outline" onClick={() => setMoveOpen(true)}>
              Move
            </Button>
            <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
              Delete
            </Button>
          </div>
        ) : null}
      </div>

      <section aria-labelledby="description-heading">
        <h2 id="description-heading" className="mb-2 text-sm font-medium">
          Description
        </h2>
        {currentCase.description ? (
          <div className="rounded-md border bg-card p-4">
            <Markdown>{currentCase.description}</Markdown>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            No description provided.
          </p>
        )}
      </section>

      <section aria-labelledby="steps-heading">
        <h2 id="steps-heading" className="mb-2 text-sm font-medium">
          Steps ({currentCase.steps.length})
        </h2>
        {currentCase.steps.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No steps yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead className="min-w-[16rem]">Action</TableHead>
                <TableHead className="min-w-[16rem]">Expected result</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {currentCase.steps.map((step) => (
                <TableRow key={step.position}>
                  <TableCell className="align-top font-mono text-muted-foreground">
                    {step.position}
                  </TableCell>
                  <TableCell className="max-w-xl align-top whitespace-normal">
                    <Markdown>{step.action}</Markdown>
                  </TableCell>
                  <TableCell className="max-w-xl align-top whitespace-normal">
                    {step.expectedResult ? (
                      <Markdown>{step.expectedResult}</Markdown>
                    ) : (
                      <span className="text-sm text-muted-foreground italic">
                        —
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <CaseHistoryPanel
        testCase={currentCase}
        userRole={userRole}
        onReverted={setCurrentCase}
      />

      <MoveCaseDialog
        testCase={currentCase}
        project={project}
        open={moveOpen}
        onOpenChange={setMoveOpen}
        onMoved={setCurrentCase}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move to trash?</AlertDialogTitle>
            <AlertDialogDescription>
              {currentCase.displayNumber} will be moved to the project trash.
              You can restore it later from the trash view.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting…" : "Move to trash"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

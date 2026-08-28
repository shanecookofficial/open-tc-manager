"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatShortDate } from "@/lib/format-date";
import type { TestCaseSummary } from "@/lib/contracts";

type CaseListProps = {
  cases: TestCaseSummary[];
  isLoading: boolean;
  emptyState: React.ReactNode;
};

export function CaseList({ cases, isLoading, emptyState }: CaseListProps) {
  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (cases.length === 0) {
    return <div className="p-8">{emptyState}</div>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-28">Number</TableHead>
          <TableHead>Title</TableHead>
          <TableHead className="w-20 text-right">Steps</TableHead>
          <TableHead className="w-36 text-right">Updated</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {cases.map((testCase) => (
          <TableRow key={testCase.id}>
            <TableCell>
              <Link
                href={`/cases/${testCase.displayNumber}`}
                className="font-mono text-sm font-medium text-primary hover:underline"
              >
                {testCase.displayNumber}
              </Link>
            </TableCell>
            <TableCell className="max-w-md truncate">{testCase.title}</TableCell>
            <TableCell className="text-right tabular-nums">
              {testCase.stepCount}
            </TableCell>
            <TableCell className="text-right text-muted-foreground">
              {formatShortDate(testCase.updatedAt)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

type PaginationControlsProps = {
  page: number;
  totalPages: number;
  totalItems: number;
  onPageChange: (page: number) => void;
};

export function PaginationControls({
  page,
  totalPages,
  totalItems,
  onPageChange,
}: PaginationControlsProps) {
  if (totalItems === 0) return null;

  return (
    <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
      <span className="text-muted-foreground">
        Page {page} of {Math.max(totalPages, 1)}
      </span>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

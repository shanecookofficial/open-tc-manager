"use client";

import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";

import type { DirectoryPathSegment } from "@/lib/contracts";
import type { Project } from "@/lib/contracts";
import { truncateTitle } from "@/lib/format-title";

type CaseBreadcrumbProps = {
  project: Project;
  directoryPath: DirectoryPathSegment[];
};

export function CaseBreadcrumb({ project, directoryPath }: CaseBreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
      <ol className="flex flex-wrap items-center gap-1">
        <li>
          <Link
            href={`/p/${project.prefix}`}
            className="hover:text-foreground hover:underline"
          >
            {project.name}
          </Link>
        </li>
        {directoryPath.map((segment) => (
          <li key={segment.id} className="flex items-center gap-1">
            <ChevronRightIcon className="size-3.5 shrink-0" aria-hidden />
            <Link
              href={`/p/${project.prefix}?dir=${segment.id}`}
              className="max-w-[12rem] truncate hover:text-foreground hover:underline"
              title={segment.name}
            >
              {truncateTitle(segment.name, 40)}
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}

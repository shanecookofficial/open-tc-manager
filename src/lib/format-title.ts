import { TITLE_MAX } from "@/lib/contracts/shared";

/** Truncate for display in tables and toasts; full string stays in `title` attribute. */
export function truncateTitle(title: string, maxLength = 80): string {
  if (title.length <= maxLength) return title;
  return `${title.slice(0, maxLength - 1)}…`;
}

export { TITLE_MAX };

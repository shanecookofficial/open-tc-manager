import type { Paginated, PaginationQuery } from "@/lib/contracts";

export function paginationOffset(page: number, pageSize: number): number {
  return (page - 1) * pageSize;
}

export function paginationMeta(
  page: number,
  pageSize: number,
  totalItems: number,
): Omit<Paginated<never>, "items"> {
  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize);
  return { page, pageSize, totalItems, totalPages };
}

export function paginated<T>(
  query: PaginationQuery,
  totalItems: number,
  items: T[],
): Paginated<T> {
  return {
    ...paginationMeta(query.page, query.pageSize, totalItems),
    items,
  };
}

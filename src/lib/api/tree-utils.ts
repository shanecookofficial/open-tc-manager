export function collectSubtreeIds(
  dirs: { id: number; parentId: number | null }[],
  rootId: number,
): number[] {
  const byParent = new Map<number | null, number[]>();
  for (const dir of dirs) {
    const list = byParent.get(dir.parentId) ?? [];
    list.push(dir.id);
    byParent.set(dir.parentId, list);
  }
  const ids: number[] = [];
  const stack = [rootId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    ids.push(id);
    for (const child of byParent.get(id) ?? []) {
      stack.push(child);
    }
  }
  return ids;
}

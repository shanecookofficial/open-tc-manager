import type { TreeNode } from "@/lib/contracts";

/** Collect directory ids at or below `minDepth` for default collapsed state. */
export function collectCollapsedFromDepth(
  nodes: TreeNode[],
  minDepth: number,
  depth = 0,
): Set<number> {
  const collapsed = new Set<number>();
  for (const node of nodes) {
    if (depth >= minDepth) {
      collapsed.add(node.id);
    }
    if (node.children.length > 0) {
      for (const id of collectCollapsedFromDepth(node.children, minDepth, depth + 1)) {
        collapsed.add(id);
      }
    }
  }
  return collapsed;
}

/** Visual indent capped so 10+ levels do not blow out the sidebar. */
export function treeIndentPx(depth: number, maxDepth = 10): number {
  return Math.min(depth, maxDepth) * 12 + 4;
}

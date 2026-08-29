import type { TreeNode } from "@/lib/contracts";

export function flattenTreeNodes(nodes: TreeNode[]): TreeNode[] {
  const result: TreeNode[] = [];
  const walk = (list: TreeNode[]) => {
    for (const node of list) {
      result.push(node);
      walk(node.children);
    }
  };
  walk(nodes);
  return result;
}

export function collectSubtreeIdsFromTree(
  nodes: TreeNode[],
  rootId: number,
): number[] {
  const byId = new Map<number, TreeNode>();
  for (const node of flattenTreeNodes(nodes)) {
    byId.set(node.id, node);
  }

  const ids: number[] = [];
  const stack = [rootId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    ids.push(id);
    const node = byId.get(id);
    if (node) {
      for (const child of node.children) {
        stack.push(child.id);
      }
    }
  }
  return ids;
}

export function recursiveActiveCaseCount(node: TreeNode): number {
  return (
    node.activeCaseCount +
    node.children.reduce((sum, child) => sum + recursiveActiveCaseCount(child), 0)
  );
}

export function findTreeNode(
  nodes: TreeNode[],
  id: number,
): TreeNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findTreeNode(node.children, id);
    if (found) return found;
  }
  return undefined;
}

export function filterExcludedNodes(
  nodes: TreeNode[],
  excludeIds?: Set<number>,
): TreeNode[] {
  if (!excludeIds || excludeIds.size === 0) return nodes;
  return nodes
    .filter((node) => !excludeIds.has(node.id))
    .map((node) => ({
      ...node,
      children: filterExcludedNodes(node.children, excludeIds),
    }));
}

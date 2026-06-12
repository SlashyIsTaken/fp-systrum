import ELK from "elkjs/lib/elk.bundled.js";
import type { Graph, GraphNode } from "./graph-schema";

const elk = new ELK();

export const NODE_W = 220;
export const NODE_H = 96;

export interface Placement {
  x: number;
  y: number;
  width: number;
  height: number;
  isGroup: boolean;
}

/**
 * Lays the graph out with elk's layered algorithm, nesting service nodes inside
 * their domain group. Child coordinates come back relative to their group,
 * which is exactly what React Flow expects for nodes with a `parentId`.
 */
export async function layoutGraph(graph: Graph): Promise<Map<string, Placement>> {
  const groups = graph.nodes.filter((n) => n.kind === "domain");
  const groupIds = new Set(groups.map((g) => g.id));
  const children = graph.nodes.filter((n) => n.kind !== "domain");

  const byParent = new Map<string, GraphNode[]>();
  for (const n of children) {
    const key = n.parentId && groupIds.has(n.parentId) ? n.parentId : "__root";
    (byParent.get(key) ?? byParent.set(key, []).get(key)!).push(n);
  }

  const elkGroups = groups.map((g) => ({
    id: g.id,
    layoutOptions: { "elk.padding": "[top=56,left=20,bottom=20,right=20]" },
    children: (byParent.get(g.id) ?? []).map((n) => ({ id: n.id, width: NODE_W, height: NODE_H })),
  }));
  const rootless = (byParent.get("__root") ?? []).map((n) => ({
    id: n.id,
    width: NODE_W,
    height: NODE_H,
  }));

  const elkGraph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "elk.layered.spacing.nodeNodeBetweenLayers": "90",
      "elk.spacing.nodeNode": "50",
      "elk.padding": "[top=30,left=30,bottom=30,right=30]",
    },
    children: [...elkGroups, ...rootless],
    edges: graph.edges
      .filter((e) => e.source !== e.target)
      .map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
  };

  const res = await elk.layout(elkGraph as never);
  const out = new Map<string, Placement>();

  for (const child of (res as { children?: ElkNode[] }).children ?? []) {
    const isGroup = groupIds.has(child.id);
    out.set(child.id, {
      x: child.x ?? 0,
      y: child.y ?? 0,
      width: child.width ?? NODE_W,
      height: child.height ?? NODE_H,
      isGroup,
    });
    for (const gc of child.children ?? []) {
      out.set(gc.id, {
        x: gc.x ?? 0,
        y: gc.y ?? 0,
        width: gc.width ?? NODE_W,
        height: gc.height ?? NODE_H,
        isGroup: false,
      });
    }
  }
  return out;
}

interface ElkNode {
  id: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  children?: ElkNode[];
}

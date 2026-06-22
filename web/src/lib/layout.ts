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

export interface Point {
  x: number;
  y: number;
}

/** An edge's routed polyline in absolute (flow) coordinates, start → end. */
export interface EdgeRoute {
  points: Point[];
}

export interface LayoutResult {
  /** Node placements. Child coords are relative to their group (React Flow). */
  placements: Map<string, Placement>;
  /** elk-computed orthogonal edge routes, flattened to absolute coords. */
  routes: Map<string, EdgeRoute>;
}

/**
 * Lays the graph out with elk's layered algorithm, nesting service nodes inside
 * their domain group. Child coordinates come back relative to their group,
 * which is exactly what React Flow expects for nodes with a `parentId`.
 */
export async function layoutGraph(graph: Graph): Promise<LayoutResult> {
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
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.layered.spacing.nodeNodeBetweenLayers": "90",
      "elk.layered.spacing.edgeNodeBetweenLayers": "30",
      "elk.spacing.nodeNode": "50",
      "elk.spacing.edgeNode": "24",
      "elk.spacing.edgeEdge": "16",
      "elk.padding": "[top=30,left=30,bottom=30,right=30]",
    },
    children: [...elkGroups, ...rootless],
    edges: graph.edges
      .filter((e) => e.source !== e.target)
      .map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
  };

  const res = (await elk.layout(elkGraph as never)) as ElkNode;
  const placements = new Map<string, Placement>();
  const routes = new Map<string, EdgeRoute>();

  // Walk the laid-out tree, recording each node's absolute top-left (= the
  // content origin of any container) and its parent. elk lists every edge at
  // the root, but each edge's section coords are relative to the *least common
  // ancestor* of its endpoints — so we need these to flatten them.
  const ROOT = "__root";
  const absOrigin = new Map<string, Point>([[ROOT, { x: 0, y: 0 }]]);
  const parentOf = new Map<string, string>();
  const elkEdges: ElkEdge[] = [];

  const walk = (node: ElkNode, originX: number, originY: number, isRoot: boolean, parentId: string) => {
    const absX = originX + (isRoot ? 0 : node.x ?? 0);
    const absY = originY + (isRoot ? 0 : node.y ?? 0);
    if (!isRoot) {
      // React Flow wants child positions relative to the parent group, which is
      // exactly elk's node.x/node.y — store those untouched.
      placements.set(node.id, {
        x: node.x ?? 0,
        y: node.y ?? 0,
        width: node.width ?? NODE_W,
        height: node.height ?? NODE_H,
        isGroup: groupIds.has(node.id),
      });
      absOrigin.set(node.id, { x: absX, y: absY });
      parentOf.set(node.id, parentId);
    }
    elkEdges.push(...(node.edges ?? []));
    for (const child of node.children ?? []) {
      walk(child, absX, absY, false, isRoot ? ROOT : node.id);
    }
  };
  walk(res, 0, 0, true, ROOT);

  const ancestors = (id: string): string[] => {
    const chain: string[] = [];
    let cur = parentOf.get(id) ?? ROOT;
    while (cur !== ROOT) {
      chain.push(cur);
      cur = parentOf.get(cur) ?? ROOT;
    }
    chain.push(ROOT);
    return chain;
  };
  const lcaOrigin = (source: string, target: string): Point => {
    const tAnc = new Set(ancestors(target));
    for (const a of ancestors(source)) {
      if (tAnc.has(a)) return absOrigin.get(a) ?? { x: 0, y: 0 };
    }
    return { x: 0, y: 0 };
  };

  // edge id → endpoint container offset (the LCA's absolute origin).
  const offsetFor = new Map<string, Point>();
  for (const e of graph.edges) offsetFor.set(e.id, lcaOrigin(e.source, e.target));

  for (const edge of elkEdges) {
    const off = offsetFor.get(edge.id) ?? { x: 0, y: 0 };
    const points: Point[] = [];
    for (const s of edge.sections ?? []) {
      for (const p of [s.startPoint, ...(s.bendPoints ?? []), s.endPoint]) {
        if (p) points.push({ x: off.x + p.x, y: off.y + p.y });
      }
    }
    if (points.length >= 2) routes.set(edge.id, { points });
  }

  return { placements, routes };
}

interface ElkPoint {
  x: number;
  y: number;
}

interface ElkEdge {
  id: string;
  sections?: { startPoint: ElkPoint; endPoint: ElkPoint; bendPoints?: ElkPoint[] }[];
}

interface ElkNode {
  id: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  children?: ElkNode[];
  edges?: ElkEdge[];
}

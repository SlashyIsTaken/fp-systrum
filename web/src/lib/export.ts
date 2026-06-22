/**
 * Map export — PNG / SVG (rasterized from the live React Flow canvas) and
 * Mermaid (a dependency-free text serialization of the reconciled graph).
 */

import { toPng, toSvg } from "html-to-image";
import { getNodesBounds, getViewportForBounds, type ReactFlowInstance } from "@xyflow/react";

import { COLORS } from "./style";
import type { Graph, GraphNode } from "./graph-schema";

export type ExportFormat = "png" | "svg" | "mermaid";

// Target canvas for raster/vector export. 16:9 reads well in slide decks.
const IMG_WIDTH = 1920;
const IMG_HEIGHT = 1080;

function triggerDownload(href: string, filename: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.click();
}

/**
 * Capture the full graph (not just the visible viewport) by computing the
 * transform that fits every node into a fixed IMG_WIDTH×IMG_HEIGHT frame, then
 * snapshotting the `.react-flow__viewport` element with that transform applied.
 * This is xyflow's documented "download image" approach.
 */
async function captureImage(instance: ReactFlowInstance, format: "png" | "svg"): Promise<string> {
  const viewport = document.querySelector<HTMLElement>(".react-flow__viewport");
  if (!viewport) throw new Error("map canvas not ready");

  const bounds = getNodesBounds(instance.getNodes());
  const { x, y, zoom } = getViewportForBounds(bounds, IMG_WIDTH, IMG_HEIGHT, 0.2, 2, 0.12);

  const options = {
    backgroundColor: COLORS.canvas,
    width: IMG_WIDTH,
    height: IMG_HEIGHT,
    pixelRatio: 2,
    style: {
      width: `${IMG_WIDTH}px`,
      height: `${IMG_HEIGHT}px`,
      transform: `translate(${x}px, ${y}px) scale(${zoom})`,
    },
  };

  return format === "png" ? toPng(viewport, options) : toSvg(viewport, options);
}

export async function exportImage(instance: ReactFlowInstance, format: "png" | "svg"): Promise<void> {
  const dataUrl = await captureImage(instance, format);
  triggerDownload(dataUrl, `systrum-map.${format}`);
}

// Mermaid ids must be alphanumeric/underscore; keep a stable, collision-free map.
function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, "_");
}

function escapeLabel(text: string): string {
  // Mermaid node text is wrapped in quotes; escape embedded quotes.
  return text.replace(/"/g, "&quot;");
}

// Mermaid shape delimiters per node kind; label is always quoted between them.
const NODE_SHAPE: Partial<Record<GraphNode["kind"], [string, string]>> = {
  datastore: ['[("', '")]'], // cylinder
  queue: ['[/"', '"/]'], // parallelogram
  external: ['{{"', '"}}'], // hexagon
};

function nodeShape(node: GraphNode): string {
  const [open, close] = NODE_SHAPE[node.kind] ?? ['["', '"]'];
  return `${safeId(node.id)}${open}${escapeLabel(node.name)}${close}`;
}

/**
 * Serialize the reconciled graph to a Mermaid `flowchart` — domains become
 * subgraphs, edges carry their protocol/auth, and external systems read as
 * hexagons. Pure text; useful for READMEs and docs.
 */
export function toMermaid(graph: Graph): string {
  const nodes = graph.nodes.filter((n) => n.kind !== "domain");
  const domains = graph.nodes.filter((n) => n.kind === "domain");
  const domainName = new Map(domains.map((d) => [d.id, d.name]));

  const byParent = new Map<string, GraphNode[]>();
  const orphans: GraphNode[] = [];
  for (const n of nodes) {
    if (n.parentId && domainName.has(n.parentId)) {
      const bucket = byParent.get(n.parentId) ?? [];
      bucket.push(n);
      byParent.set(n.parentId, bucket);
    } else {
      orphans.push(n);
    }
  }

  const lines: string[] = ["flowchart LR"];

  for (const [parentId, members] of byParent) {
    lines.push(`  subgraph ${safeId(parentId)}["${escapeLabel(domainName.get(parentId) ?? parentId)}"]`);
    for (const n of members) lines.push(`    ${nodeShape(n)}`);
    lines.push("  end");
  }
  for (const n of orphans) lines.push(`  ${nodeShape(n)}`);

  lines.push("");
  for (const e of graph.edges) {
    if (e.source === e.target) continue;
    const label = [e.protocol, e.auth !== "none" ? e.auth : null].filter(Boolean).join(" · ");
    const arrow = e.confidence === "observed" ? "-->" : "-.->"; // dashed = not yet observed
    lines.push(`  ${safeId(e.source)} ${arrow}${label ? `|${label}|` : ""} ${safeId(e.target)}`);
  }

  return lines.join("\n");
}

export function exportMermaid(graph: Graph): void {
  const blob = new Blob([toMermaid(graph)], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, "systrum-map.mmd");
  // Revoke on next tick so the click-driven download has time to start.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

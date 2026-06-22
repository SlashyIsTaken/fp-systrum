"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  MarkerType,
  applyNodeChanges,
  type Edge,
  type Node,
  type NodeChange,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { connectLive, fetchGraph, rescan } from "@/lib/api";
import type { Graph, GraphEdge, GraphNode, GraphDiff, HealthStatus } from "@/lib/graph-schema";
import { layoutGraph, type EdgeRoute, type Placement, type Point } from "@/lib/layout";
import { COLORS, CONFIDENCE_DASH, HEALTH_COLOR } from "@/lib/style";
import { exportImage, exportMermaid, type ExportFormat } from "@/lib/export";
import ServiceNode from "./ServiceNode";
import GroupNode from "./GroupNode";
import RoutedEdge from "./RoutedEdge";
import OverlayControls, { type OverlayState } from "./OverlayControls";
import ActivityFeed, { type FeedEvent } from "./ActivityFeed";

const nodeTypes = { service: ServiceNode, group: GroupNode };
const edgeTypes = { routed: RoutedEdge };

const CONFIDENCE_COLOR: Record<string, string> = {
  observed: "#34D399",
  declared: "#46506a",
  annotated: COLORS.accent,
};

function edgeStyle(edge: GraphEdge, showConfidence: boolean) {
  return {
    stroke: showConfidence ? CONFIDENCE_COLOR[edge.confidence] ?? "#46506a" : "#46506a",
    strokeWidth: 1.6,
    strokeDasharray: showConfidence ? CONFIDENCE_DASH[edge.confidence] : undefined,
  };
}

// Edge ids are "<source>-><target>:<protocol>" — render the hop readably.
function prettyEdge(id: string): string {
  const [pair] = id.split(":");
  const [s, t] = pair.split("->");
  return t ? `${s} → ${t}` : id;
}

export default function MapCanvas() {
  const [graph, setGraph] = useState<Graph | null>(null);
  const [placements, setPlacements] = useState<Map<string, Placement>>(new Map());
  const [routes, setRoutes] = useState<Map<string, EdgeRoute>>(new Map());
  const [overlay, setOverlay] = useState<OverlayState>({ domain: true, confidence: true, health: false, traffic: false });
  const [rfNodes, setRfNodes] = useState<Node[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [present, setPresent] = useState(false);
  const [live, setLive] = useState(false);
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const rfRef = useRef<ReactFlowInstance | null>(null);
  const graphRef = useRef<Graph | null>(null);
  const rfNodesRef = useRef<Node[]>([]);

  useEffect(() => {
    graphRef.current = graph;
  }, [graph]);
  useEffect(() => {
    rfNodesRef.current = rfNodes;
  }, [rfNodes]);

  // Rebuild the canvas only when the *structure* changes (ids/parents), not on
  // every health/traffic tick — so live diffs don't reset node positions.
  const structureKey = useMemo(
    () => (graph ? graph.nodes.map((n) => `${n.id}:${n.parentId ?? ""}`).join("|") : ""),
    [graph],
  );

  const load = useCallback(async (g?: Graph) => {
    try {
      const next = g ?? (await fetchGraph());
      const { placements: places, routes: rts } = await layoutGraph(next);
      setGraph(next);
      setPlacements(places);
      setRoutes(rts);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Build React Flow nodes on structural / layout / overlay changes. Live
  // health ticks patch nodes in place instead (see onDiff), preserving layout.
  useEffect(() => {
    const g = graphRef.current;
    if (!g) return;
    const prevPos = new Map(rfNodesRef.current.map((n) => [n.id, n.position]));
    const groups: Node[] = [];
    const children: Node[] = [];

    for (const n of g.nodes) {
      const p = placements.get(n.id);
      if (!p) continue;
      if (n.kind === "domain") {
        groups.push({
          id: n.id,
          type: "group",
          position: prevPos.get(n.id) ?? { x: p.x, y: p.y },
          data: { label: n.name, color: (n.meta?.color as string) ?? undefined, tinted: overlay.domain },
          style: { width: p.width, height: p.height },
          selectable: false,
          draggable: true,
          zIndex: 0,
        });
      } else {
        const parentId = n.parentId && placements.get(n.parentId)?.isGroup ? n.parentId : undefined;
        children.push({
          id: n.id,
          type: "service",
          position: prevPos.get(n.id) ?? { x: p.x, y: p.y },
          parentId,
          extent: parentId ? "parent" : undefined,
          data: { node: n, showHealth: overlay.health },
          zIndex: 1,
        });
      }
    }
    setRfNodes([...groups, ...children]); // parents must precede children
  }, [structureKey, placements, overlay.domain, overlay.health]);

  const rfEdges: Edge[] = useMemo(() => {
    if (!graph) return [];
    // Absolute top-left of a node: child placements are group-relative, so add
    // the parent group's origin. RoutedEdge compares this against the live
    // position to know when a drag has invalidated elk's precomputed route.
    const absPos = (id: string): Point | undefined => {
      const p = placements.get(id);
      if (!p) return undefined;
      const parentId = graph.nodes.find((n) => n.id === id)?.parentId;
      const parent = parentId ? placements.get(parentId) : undefined;
      return parent?.isGroup ? { x: parent.x + p.x, y: parent.y + p.y } : { x: p.x, y: p.y };
    };
    return graph.edges
      .filter((e) => e.source !== e.target)
      .map((e) => {
        const style = edgeStyle(e, overlay.confidence);
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          type: "routed",
          style,
          markerEnd: { type: MarkerType.ArrowClosed, color: style.stroke, width: 14, height: 14 },
          data: {
            edge: e,
            points: routes.get(e.id)?.points,
            layoutSource: absPos(e.source),
            layoutTarget: absPos(e.target),
            trafficOn: overlay.traffic,
          },
        } as Edge;
      });
  }, [graph, placements, routes, overlay.confidence, overlay.traffic]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setRfNodes((nds) => applyNodeChanges(changes, nds)),
    [],
  );

  const onToggle = (key: keyof OverlayState) =>
    setOverlay((o) => ({ ...o, [key]: !o[key] }));

  const onRescan = async () => {
    setBusy(true);
    try {
      const g = await rescan();
      await load(g);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onExport = useCallback(
    async (format: ExportFormat) => {
      try {
        if (format === "mermaid") {
          if (graph) exportMermaid(graph);
        } else if (rfRef.current) {
          await exportImage(rfRef.current, format);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [graph],
  );

  const enterPresent = useCallback(() => {
    setPresent(true);
    void wrapperRef.current?.requestFullscreen?.().catch(() => {});
    // Let the chrome unmount before re-fitting the graph to the full frame.
    setTimeout(() => rfRef.current?.fitView({ padding: 0.1, duration: 300 }), 80);
  }, []);

  // Sync state when the user leaves fullscreen via Esc / browser UI.
  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement) setPresent(false);
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  // Apply a live diff: patch health/edges in place (no relayout) + feed events.
  const onDiff = useCallback(
    (diff: GraphDiff) => {
      // Topology changes are rare here; just reload + relayout if they happen.
      if (
        diff.nodesAdded.length || diff.nodesRemoved.length ||
        diff.edgesAdded.length || diff.edgesRemoved.length
      ) {
        void load();
        return;
      }

      const healthById = new Map<string, HealthStatus>();
      for (const c of diff.nodesChanged) {
        if (typeof c.after.health === "string") healthById.set(c.id, c.after.health as HealthStatus);
      }
      const edgeAfter = new Map(diff.edgesChanged.map((c) => [c.id, c.after]));

      setGraph((g) => {
        if (!g) return g;
        const nodes = healthById.size
          ? g.nodes.map((n) =>
              healthById.has(n.id)
                ? { ...n, health: { ...(n.health ?? {}), status: healthById.get(n.id)! } }
                : n,
            )
          : g.nodes;
        const edges = edgeAfter.size
          ? g.edges.map((e) => (edgeAfter.has(e.id) ? ({ ...e, ...edgeAfter.get(e.id) } as GraphEdge) : e))
          : g.edges;
        return { ...g, nodes, edges };
      });

      if (healthById.size) {
        setRfNodes((nds) =>
          nds.map((n) => {
            const status = healthById.get(n.id);
            if (!status || n.type !== "service") return n;
            const d = n.data as { node: GraphNode; showHealth?: boolean; dimmed?: boolean };
            return { ...n, data: { ...d, node: { ...d.node, health: { ...(d.node.health ?? {}), status } } } };
          }),
        );
      }

      const fresh: FeedEvent[] = [];
      for (const c of diff.nodesChanged) {
        const status = c.after.health as HealthStatus | undefined;
        if (status) fresh.push({ id: `${diff.at}:n:${c.id}`, at: diff.at, text: `${c.id} → ${status}`, color: HEALTH_COLOR[status] });
      }
      for (const c of diff.edgesChanged) {
        if (c.after.confidence) {
          fresh.push({ id: `${diff.at}:e:${c.id}`, at: diff.at, text: `${prettyEdge(c.id)} ${c.after.confidence}`, color: COLORS.accent });
        }
      }
      if (fresh.length) setEvents((ev) => [...fresh, ...ev].slice(0, 60));
    },
    [load],
  );

  // Open the live diff stream once.
  useEffect(() => connectLive(onDiff, setLive), [onDiff]);

  if (error) {
    return (
      <div style={{ display: "grid", placeItems: "center", height: "100%", padding: 24 }}>
        <div style={{ maxWidth: 460, textAlign: "center", color: COLORS.muted }}>
          <h2 style={{ color: COLORS.text }}>Can&apos;t reach the engine</h2>
          <p>{error}</p>
          <p style={{ fontSize: 13 }}>
            Make sure the engine is running (default <code className="mono">http://localhost:8000</code>) and
            <code className="mono"> NEXT_PUBLIC_API_BASE</code> points at it.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div ref={wrapperRef} style={{ width: "100%", height: "100%", position: "relative", background: COLORS.canvas }}>
      {graph && !present && (
        <OverlayControls
          state={overlay}
          onToggle={onToggle}
          onRescan={onRescan}
          onExport={onExport}
          onPresent={enterPresent}
          busy={busy}
          meta={{
            nodes: graph.nodes.filter((n) => n.kind !== "domain").length,
            edges: graph.edges.length,
            providers: graph.providers ?? [],
            generatedAt: graph.generatedAt,
          }}
        />
      )}
      {graph && !present && <ActivityFeed events={events} live={live} />}
      {present && (
        <button
          onClick={() => {
            if (document.fullscreenElement) void document.exitFullscreen?.();
            else setPresent(false);
          }}
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            zIndex: 10,
            padding: "8px 12px",
            borderRadius: 8,
            border: `1px solid ${COLORS.border}`,
            background: "rgba(15,18,27,0.92)",
            color: COLORS.text,
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          Exit ✕
        </button>
      )}
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onInit={(inst) => (rfRef.current = inst)}
        fitView
        minZoom={0.15}
        maxZoom={2}
        proOptions={{ hideAttribution: false }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#1A1F2B" />
        {!present && (
          <MiniMap
            pannable
            zoomable
            nodeColor={(n) => (n.type === "group" ? ((n.data?.color as string) ?? "#333") : "#2a3142")}
            maskColor="rgba(11,14,20,0.7)"
          />
        )}
        {!present && <Controls showInteractive={false} />}
      </ReactFlow>
    </div>
  );
}

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

import { fetchGraph, rescan } from "@/lib/api";
import type { Graph, GraphEdge } from "@/lib/graph-schema";
import { layoutGraph, type Placement } from "@/lib/layout";
import { COLORS, CONFIDENCE_DASH } from "@/lib/style";
import { exportImage, exportMermaid, type ExportFormat } from "@/lib/export";
import ServiceNode from "./ServiceNode";
import GroupNode from "./GroupNode";
import OverlayControls, { type OverlayState } from "./OverlayControls";

const nodeTypes = { service: ServiceNode, group: GroupNode };

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

export default function MapCanvas() {
  const [graph, setGraph] = useState<Graph | null>(null);
  const [placements, setPlacements] = useState<Map<string, Placement>>(new Map());
  const [overlay, setOverlay] = useState<OverlayState>({ domain: true, confidence: true, health: false });
  const [rfNodes, setRfNodes] = useState<Node[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [present, setPresent] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const rfRef = useRef<ReactFlowInstance | null>(null);

  const load = useCallback(async (g?: Graph) => {
    try {
      const next = g ?? (await fetchGraph());
      const places = await layoutGraph(next);
      setGraph(next);
      setPlacements(places);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Build React Flow nodes whenever graph / layout / domain-overlay change.
  useEffect(() => {
    if (!graph) return;
    const groups: Node[] = [];
    const children: Node[] = [];

    for (const n of graph.nodes) {
      const p = placements.get(n.id);
      if (!p) continue;
      if (n.kind === "domain") {
        groups.push({
          id: n.id,
          type: "group",
          position: { x: p.x, y: p.y },
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
          position: { x: p.x, y: p.y },
          parentId,
          extent: parentId ? "parent" : undefined,
          data: { node: n, showHealth: overlay.health },
          zIndex: 1,
        });
      }
    }
    setRfNodes([...groups, ...children]); // parents must precede children
  }, [graph, placements, overlay.domain, overlay.health]);

  const rfEdges: Edge[] = useMemo(() => {
    if (!graph) return [];
    return graph.edges
      .filter((e) => e.source !== e.target)
      .map((e) => {
        const style = edgeStyle(e, overlay.confidence);
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          style,
          markerEnd: { type: MarkerType.ArrowClosed, color: style.stroke, width: 14, height: 14 },
          data: { edge: e },
        } as Edge;
      });
  }, [graph, overlay.confidence]);

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

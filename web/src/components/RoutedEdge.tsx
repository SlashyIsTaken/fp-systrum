"use client";

import {
  BaseEdge,
  getSmoothStepPath,
  Position,
  useInternalNode,
  type EdgeProps,
} from "@xyflow/react";
import type { GraphEdge } from "@/lib/graph-schema";
import type { Point } from "@/lib/layout";

export interface RoutedEdgeData {
  edge: GraphEdge;
  /** elk-computed route in absolute coords; absent → smooth-step fallback. */
  points?: Point[];
  /** Absolute top-left of each endpoint at layout time, to detect drags. */
  layoutSource?: Point;
  layoutTarget?: Point;
  trafficOn?: boolean;
  [key: string]: unknown;
}

const EPS = 1; // px tolerance when deciding whether a node has been moved

function moved(absolute: { x: number; y: number } | undefined, layout?: Point): boolean {
  if (!absolute || !layout) return false;
  return Math.abs(absolute.x - layout.x) > EPS || Math.abs(absolute.y - layout.y) > EPS;
}

// Build an orthogonal path through the elk bend points, rounding the corners so
// the route reads as a clean circuit rather than hard 90° pixels.
function roundedPath(pts: Point[], r = 8): string {
  if (pts.length < 2) return "";
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p0 = pts[i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const d1 = Math.min(r, Math.hypot(p1.x - p0.x, p1.y - p0.y) / 2);
    const d2 = Math.min(r, Math.hypot(p2.x - p1.x, p2.y - p1.y) / 2);
    const u1 = unit(p1, p0);
    const u2 = unit(p1, p2);
    d += ` L ${p1.x + u1.x * d1} ${p1.y + u1.y * d1}`;
    d += ` Q ${p1.x} ${p1.y} ${p1.x + u2.x * d2} ${p1.y + u2.y * d2}`;
  }
  const last = pts[pts.length - 1];
  return `${d} L ${last.x} ${last.y}`;
}

function unit(from: Point, to: Point): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

export default function RoutedEdge({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  markerEnd,
  style,
  data,
}: EdgeProps) {
  const d = (data ?? {}) as RoutedEdgeData;
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);

  // Use elk's route unless an endpoint has been dragged off its layout spot —
  // then the precomputed polyline is stale, so fall back to a live smooth-step.
  const stale =
    moved(sourceNode?.internals.positionAbsolute, d.layoutSource) ||
    moved(targetNode?.internals.positionAbsolute, d.layoutTarget);

  let path: string;
  if (d.points && d.points.length >= 2 && !stale) {
    path = roundedPath(d.points);
  } else {
    [path] = getSmoothStepPath({
      sourceX,
      sourceY,
      sourcePosition: Position.Right,
      targetX,
      targetY,
      targetPosition: Position.Left,
      borderRadius: 8,
    });
  }

  const rpm = d.trafficOn ? d.edge.traffic?.requestsPerMin ?? 0 : 0;
  const active = rpm > 0;
  const stroke = (style?.stroke as string) ?? "#46506a";
  const baseWidth = (style?.strokeWidth as number) ?? 1.6;
  // With the traffic overlay on, thickness encodes req/min and idle edges fade.
  const width = d.trafficOn ? 1.2 + Math.min(rpm / 40, 6) : baseWidth;
  const edgeStyle = {
    ...style,
    strokeWidth: width,
    opacity: d.trafficOn && !active ? 0.18 : (style?.opacity as number) ?? 1,
  };

  // One or more particles drift along busy edges; busier ⇒ faster + more of them.
  const particles = active ? Math.min(3, 1 + Math.floor(rpm / 150)) : 0;
  const dur = Math.max(1.1, 5 - rpm / 90);

  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={edgeStyle} />
      {Array.from({ length: particles }).map((_, i) => (
        <circle key={i} r={2.4} fill={stroke} opacity={0.95}>
          <animateMotion
            dur={`${dur}s`}
            repeatCount="indefinite"
            path={path}
            begin={`${(dur / particles) * i}s`}
          />
        </circle>
      ))}
    </>
  );
}

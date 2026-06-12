"use client";

import { Handle, Position } from "@xyflow/react";
import type { GraphNode } from "@/lib/graph-schema";
import { COLORS, HEALTH_COLOR, techLabel } from "@/lib/style";

export interface ServiceNodeData {
  node: GraphNode;
  dimmed?: boolean;
}

const KIND_LABEL: Record<string, string> = {
  datastore: "datastore",
  queue: "queue",
  external: "external",
  device: "device",
};

export default function ServiceNode({ data }: { data: ServiceNodeData }) {
  const { node, dimmed } = data;
  const isExternal = node.kind === "external" || Boolean(node.meta?._stub);
  const health = node.health?.status ?? "unknown";
  const ports = (node.meta?.ports as string[] | undefined) ?? [];
  const firstPort = ports[0]?.split(":")[0];

  return (
    <div
      style={{
        width: 220,
        minHeight: 84,
        padding: "10px 12px",
        borderRadius: 12,
        background: isExternal ? "rgba(20,25,37,0.6)" : COLORS.surface,
        border: `1px ${isExternal ? "dashed" : "solid"} ${COLORS.border}`,
        boxShadow: "0 4px 14px rgba(0,0,0,0.35)",
        opacity: dimmed ? 0.28 : 1,
        transition: "opacity 160ms ease",
        color: COLORS.text,
        fontSize: 13,
      }}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            width: 9,
            height: 9,
            borderRadius: "50%",
            background: HEALTH_COLOR[health],
            boxShadow: `0 0 8px ${HEALTH_COLOR[health]}`,
            flex: "0 0 auto",
          }}
        />
        <span style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {node.name}
        </span>
      </div>

      <div style={{ marginTop: 4, color: COLORS.muted, fontSize: 11 }}>
        {[node.domain, node.layer].filter(Boolean).join(" · ") || KIND_LABEL[node.kind] || node.kind}
      </div>

      {node.tech && node.tech.length > 0 && (
        <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 4 }}>
          {node.tech.map((t) => (
            <span
              key={t}
              style={{
                fontSize: 10,
                padding: "1px 6px",
                borderRadius: 5,
                background: "#1c2230",
                color: COLORS.muted,
              }}
            >
              {techLabel(t)}
            </span>
          ))}
        </div>
      )}

      <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", color: COLORS.muted, fontSize: 10 }}>
        <span className="mono">{firstPort ? `:${firstPort}` : isExternal ? "external" : ""}</span>
        {node.internetFacing && <span style={{ color: COLORS.accent }}>internet-facing</span>}
      </div>

      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
}

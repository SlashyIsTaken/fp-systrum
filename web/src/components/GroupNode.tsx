"use client";

import { COLORS } from "@/lib/style";

export interface GroupNodeData {
  label: string;
  color?: string;
  tinted?: boolean;
}

export default function GroupNode({ data }: { data: GroupNodeData }) {
  const color = data.color ?? COLORS.muted;
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        borderRadius: 16,
        border: `1px solid ${color}55`,
        background: data.tinted ? `${color}14` : "rgba(255,255,255,0.015)",
        transition: "background 200ms ease",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 12,
          left: 16,
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: 0.4,
          textTransform: "uppercase",
          color,
        }}
      >
        {data.label}
      </div>
    </div>
  );
}

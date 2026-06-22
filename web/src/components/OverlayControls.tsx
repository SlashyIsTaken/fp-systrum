"use client";

import { COLORS, HEALTH_COLOR } from "@/lib/style";
import type { ExportFormat } from "@/lib/export";

export interface OverlayState {
  domain: boolean;
  confidence: boolean;
  health: boolean;
}

interface Props {
  state: OverlayState;
  onToggle: (key: keyof OverlayState) => void;
  meta: { nodes: number; edges: number; providers: string[]; generatedAt?: string };
  onRescan: () => void;
  onExport: (format: ExportFormat) => void;
  onPresent: () => void;
  busy?: boolean;
}

const Toggle = ({
  label,
  on,
  onClick,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      width: "100%",
      padding: "7px 10px",
      borderRadius: 8,
      border: `1px solid ${COLORS.border}`,
      background: on ? "#1c2230" : "transparent",
      color: on ? COLORS.text : COLORS.muted,
      cursor: "pointer",
      fontSize: 12,
      textAlign: "left",
    }}
  >
    <span
      style={{
        width: 28,
        height: 16,
        borderRadius: 8,
        background: on ? COLORS.accent : "#2a3142",
        position: "relative",
        flex: "0 0 auto",
        transition: "background 150ms ease",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: on ? 14 : 2,
          width: 12,
          height: 12,
          borderRadius: "50%",
          background: "#0b0e14",
          transition: "left 150ms ease",
        }}
      />
    </span>
    {label}
  </button>
);

export default function OverlayControls({
  state,
  onToggle,
  meta,
  onRescan,
  onExport,
  onPresent,
  busy,
}: Props) {
  return (
    <div
      style={{
        position: "absolute",
        top: 16,
        left: 16,
        zIndex: 10,
        width: 248,
        padding: 14,
        borderRadius: 14,
        background: "rgba(15,18,27,0.92)",
        border: `1px solid ${COLORS.border}`,
        backdropFilter: "blur(6px)",
        boxShadow: "0 8px 28px rgba(0,0,0,0.45)",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <span style={{ fontWeight: 700, fontSize: 15, color: COLORS.text }}>Systrum</span>
        <span style={{ fontSize: 10, color: COLORS.muted }}>map</span>
      </div>

      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontSize: 10, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>
          Overlays
        </div>
        <Toggle label="Domain districts" on={state.domain} onClick={() => onToggle("domain")} />
        <Toggle label="Confidence (config vs live)" on={state.confidence} onClick={() => onToggle("confidence")} />
        <Toggle label="Health" on={state.health} onClick={() => onToggle("health")} />
      </div>

      {state.confidence && (
        <div style={{ marginTop: 12, fontSize: 11, color: COLORS.muted, display: "flex", flexDirection: "column", gap: 5 }}>
          <LegendLine dash="" label="observed (live)" />
          <LegendLine dash="6 4" label="declared (config only)" />
          <LegendLine dash="1 5" label="annotated (by hand)" />
        </div>
      )}

      {state.health && (
        <div style={{ marginTop: 12, fontSize: 11, color: COLORS.muted, display: "flex", flexDirection: "column", gap: 5 }}>
          <DotLine color={HEALTH_COLOR.healthy} label="healthy" />
          <DotLine color={HEALTH_COLOR.degraded} label="degraded" />
          <DotLine color={HEALTH_COLOR.down} label="down" />
          <DotLine color={HEALTH_COLOR.unknown} label="unknown (no live data yet)" />
        </div>
      )}

      <div style={{ marginTop: 14, fontSize: 11, color: COLORS.muted }}>
        {meta.nodes} nodes · {meta.edges} edges
        <br />
        providers: {meta.providers.join(", ") || "—"}
      </div>

      <button
        onClick={onRescan}
        disabled={busy}
        style={{
          marginTop: 12,
          width: "100%",
          padding: "8px 10px",
          borderRadius: 8,
          border: `1px solid ${COLORS.accent}55`,
          background: busy ? "#1c2230" : `${COLORS.accent}1a`,
          color: COLORS.accent,
          cursor: busy ? "default" : "pointer",
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        {busy ? "Scanning…" : "Re-scan"}
      </button>

      <div style={{ marginTop: 14, fontSize: 10, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>
        Export
      </div>
      <div style={{ marginTop: 6, display: "flex", gap: 6 }}>
        <ActionButton label="PNG" onClick={() => onExport("png")} />
        <ActionButton label="SVG" onClick={() => onExport("svg")} />
        <ActionButton label="Mermaid" onClick={() => onExport("mermaid")} />
      </div>

      <button
        onClick={onPresent}
        style={{
          marginTop: 10,
          width: "100%",
          padding: "8px 10px",
          borderRadius: 8,
          border: `1px solid ${COLORS.border}`,
          background: "transparent",
          color: COLORS.text,
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        Present ⤢
      </button>
    </div>
  );
}

function ActionButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: "7px 0",
        borderRadius: 8,
        border: `1px solid ${COLORS.border}`,
        background: "transparent",
        color: COLORS.muted,
        cursor: "pointer",
        fontSize: 11,
        fontWeight: 600,
      }}
    >
      {label}
    </button>
  );
}

function DotLine({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span
        style={{
          width: 9,
          height: 9,
          borderRadius: "50%",
          background: color,
          boxShadow: `0 0 6px ${color}`,
          flex: "0 0 auto",
        }}
      />
      {label}
    </div>
  );
}

function LegendLine({ dash, label }: { dash: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <svg width="34" height="6">
        <line
          x1="0"
          y1="3"
          x2="34"
          y2="3"
          stroke={COLORS.muted}
          strokeWidth="2"
          strokeDasharray={dash || undefined}
        />
      </svg>
      {label}
    </div>
  );
}

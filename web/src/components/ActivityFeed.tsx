"use client";

import { COLORS } from "@/lib/style";

export interface FeedEvent {
  id: string;
  at: string;
  text: string;
  color: string;
}

export default function ActivityFeed({
  events,
  live,
}: {
  events: FeedEvent[];
  live: boolean;
}) {
  return (
    <div
      style={{
        position: "absolute",
        bottom: 16,
        right: 16,
        zIndex: 10,
        width: 280,
        maxHeight: "42vh",
        display: "flex",
        flexDirection: "column",
        borderRadius: 14,
        background: "rgba(15,18,27,0.92)",
        border: `1px solid ${COLORS.border}`,
        backdropFilter: "blur(6px)",
        boxShadow: "0 8px 28px rgba(0,0,0,0.45)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px",
          borderBottom: `1px solid ${COLORS.border}`,
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 13, color: COLORS.text }}>Activity</span>
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: COLORS.muted }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: live ? "#34D399" : "#6B7280",
              boxShadow: live ? "0 0 8px #34D399" : "none",
            }}
          />
          {live ? "live" : "offline"}
        </span>
      </div>

      <div style={{ overflowY: "auto", padding: "8px 6px" }}>
        {events.length === 0 ? (
          <div style={{ padding: "10px 8px", fontSize: 11, color: COLORS.muted }}>
            Watching for changes…
          </div>
        ) : (
          events.map((e) => (
            <div
              key={e.id}
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 8,
                padding: "5px 8px",
                fontSize: 11.5,
                color: COLORS.text,
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: e.color,
                  flex: "0 0 auto",
                  transform: "translateY(1px)",
                }}
              />
              <span style={{ flex: 1 }}>{e.text}</span>
              <span className="mono" style={{ fontSize: 9.5, color: COLORS.muted, flex: "0 0 auto" }}>
                {formatTime(e.at)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

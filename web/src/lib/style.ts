import type { AuthMechanism, Confidence, HealthStatus } from "./graph-schema";

export const COLORS = {
  canvas: "#0B0E14",
  surface: "#141925",
  border: "#222A3A",
  text: "#E6EAF2",
  muted: "#8A93A6",
  accent: "#3DD6D0",
};

export const HEALTH_COLOR: Record<HealthStatus, string> = {
  healthy: "#34D399",
  degraded: "#FBBF24",
  down: "#F87171",
  unknown: "#6B7280",
};

// Used by the Security overlay (Phase 3) and as edge tint hints today.
export const AUTH_COLOR: Record<AuthMechanism, string> = {
  mtls: "#34D399",
  jwt: "#3DD6D0",
  "bearer-token": "#3DD6D0",
  "api-key": "#60A5FA",
  "proxy-key": "#60A5FA",
  "device-id": "#60A5FA",
  oauth: "#60A5FA",
  basic: "#FBBF24",
  none: "#F87171",
};

export const CONFIDENCE_DASH: Record<Confidence, string | undefined> = {
  observed: undefined, // solid
  declared: "6 4", // dashed
  annotated: "1 5", // dotted
};

export function techLabel(tech: string): string {
  const map: Record<string, string> = {
    python: "Python",
    fastapi: "FastAPI",
    node: "Node",
    nextjs: "Next.js",
    react: "React",
    postgresql: "PostgreSQL",
    redis: "Redis",
    rabbitmq: "RabbitMQ",
  };
  return map[tech] ?? tech;
}

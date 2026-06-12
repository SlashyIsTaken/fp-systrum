import type { Graph } from "./graph-schema";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

export async function fetchGraph(): Promise<Graph> {
  const res = await fetch(`${API_BASE}/api/graph`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`engine returned ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as Graph;
}

export async function rescan(): Promise<Graph> {
  const res = await fetch(`${API_BASE}/api/scan`, { method: "POST", cache: "no-store" });
  if (!res.ok) throw new Error(`scan failed: ${res.status}`);
  return (await res.json()) as Graph;
}

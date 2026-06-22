import type { Graph, GraphDiff } from "./graph-schema";

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

/**
 * Open the live diff stream. Returns a disposer that closes the socket and stops
 * auto-reconnecting. `onStatus` reports connection state for the UI indicator.
 */
export function connectLive(
  onDiff: (diff: GraphDiff) => void,
  onStatus?: (connected: boolean) => void,
): () => void {
  const wsBase = API_BASE.replace(/^http/, "ws");
  let socket: WebSocket | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const open = () => {
    if (closed) return;
    socket = new WebSocket(`${wsBase}/ws`);
    socket.onopen = () => onStatus?.(true);
    socket.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg?.type === "diff" && msg.diff) onDiff(msg.diff as GraphDiff);
      } catch {
        /* ignore malformed frames */
      }
    };
    socket.onclose = () => {
      onStatus?.(false);
      if (!closed) retry = setTimeout(open, 2000); // auto-reconnect
    };
    socket.onerror = () => socket?.close();
  };
  open();

  return () => {
    closed = true;
    if (retry) clearTimeout(retry);
    socket?.close();
  };
}

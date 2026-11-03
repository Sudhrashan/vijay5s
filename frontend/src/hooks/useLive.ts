import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { tokenStore } from "../api/client";
import type { LiveEvent } from "../api/types";
import { useToast } from "../lib/toast";

export type LiveState = "connecting" | "live" | "offline";

// Which cached queries each server event makes stale. Pages refetch only what changed.
const INVALIDATES: Record<string, string[]> = {
  issue: ["issues", "dashboard", "reports", "zones", "meta"],
  audit: ["audits", "audit-responses", "dashboard", "reports", "meta"],
  allocation: ["audits", "dashboard"],
  user: ["users", "meta", "zones", "dashboard"],
  zone: ["zones", "meta", "dashboard"],
  settings: ["settings", "dashboard", "reports", "issues", "issue", "meta"],
};

function describe(e: LiveEvent): string | null {
  const d = e.data;
  switch (e.topic) {
    case "issue.created": return `${d.code} raised in ${d.zone} by ${d.by}`;
    case "issue.closed": return `${d.code} closed in ${d.zone} by ${d.by}`;
    case "issue.reopened": return `${d.code} reopened in ${d.zone}`;
    case "issue.escalated": return `${d.count} issue${d.count === 1 ? "" : "s"} escalated`;
    case "allocation.saved": return `Allocation saved — ${d.zones} zones assigned`;
    case "audit.changed": return d.action === "cycle" ? `${d.cycle} audit cycle created` : `${d.zone} audit ${d.action}`;
    default: return null;
  }
}

/** Holds one WebSocket open for the session, reconnecting with back-off. */
export function useLive(): LiveState {
  const qc = useQueryClient();
  const toast = useToast();
  const [state, setState] = useState<LiveState>("connecting");
  const retry = useRef(0);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let ping: number | undefined;
    let timer: number | undefined;
    let closed = false;

    const connect = () => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(tokenStore.get() ?? "")}`);
      setState("connecting");
      ws.onopen = () => {
        const reconnected = retry.current > 0;
        retry.current = 0; setState("live");
        ping = window.setInterval(() => ws?.readyState === 1 && ws.send("ping"), 25000);
        if (reconnected) qc.invalidateQueries(); // catch up on anything missed while offline
      };
      ws.onmessage = (m) => {
        const e: LiveEvent = JSON.parse(m.data);
        const keys = INVALIDATES[e.topic.split(".")[0]];
        keys?.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
        const text = describe(e);
        if (text) toast(text);
      };
      ws.onclose = (ev) => {
        window.clearInterval(ping);
        if (closed) return;
        setState("offline");
        if (ev.code === 4401) { window.dispatchEvent(new Event("vijay5s:logout")); return; }
        const wait = Math.min(15000, 1000 * 2 ** retry.current++);
        timer = window.setTimeout(connect, wait);
      };
    };
    connect();
    return () => { closed = true; window.clearInterval(ping); window.clearTimeout(timer); ws?.close(); };
  }, [qc, toast]);

  return state;
}

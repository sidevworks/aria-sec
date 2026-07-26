// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

// ════════════════════════════════════════════════════════════════════════
// PANEL 03 · VORTEX LOG SINK                  maps to panel id "live-logs"
// Agent 3 · Vortex & Gravitational UI Engineer
// ────────────────────────────────────────────────────────────────────────
// Live log events spiral into a gravitational sink. Inflow speed/density and
// color derive from real log volume + ERROR/WARN counts. Each particle is
// tinted by a real log line's level. HUD shows totals + a live line ticker.
// ════════════════════════════════════════════════════════════════════════
import { useEffect, useRef, useState } from "react";
import { CANVAS_STYLE, TAU, useCanvasAnimation } from "./useCanvasAnimation.js";
import { postureFromLogs } from "./panelData.js";
import { HudDock } from "./HudOverlay.jsx";

const LEVEL_RGB = {
  ERROR: [255, 61, 129],
  WARN: [255, 200, 87],
  INFO: [99, 245, 255],
  DEBUG: [120, 140, 170],
};
const TINT = { clean: [99, 245, 255], elevated: [255, 200, 87], breach: [255, 61, 129] };

const ARIA_API_BASE_LOG = (
  typeof import.meta !== "undefined"
    ? (import.meta.env?.VITE_ARIA_API_BASE || "")
    : ""
).replace(/\/$/, "");

function formatTs(ts) {
  if (!ts) return "";
  const d = new Date(typeof ts === "number" && ts < 1e12 ? ts * 1000 : ts);
  return isNaN(d) ? String(ts) : d.toISOString().slice(11, 19) + " UTC";
}

export default function VortexLogSink({ logs = [] }) {
  const [recentLogs, setRecentLogs] = useState([]);
  const [sseConnected, setSseConnected] = useState(false);
  const [pollAge, setPollAge] = useState(null); // seconds since last poll update (null = SSE live)
  const pollAgeTimer = useRef(null);
  const lastPollAt = useRef(null);

  useEffect(() => {
    const sseUrl = `${ARIA_API_BASE_LOG}/api/live/stream`;
    let es;
    let retryTimer;

    const connect = () => {
      es = new EventSource(sseUrl);
      es.onopen = () => {
        setSseConnected(true);
        setPollAge(null);
        if (pollAgeTimer.current) { clearInterval(pollAgeTimer.current); pollAgeTimer.current = null; }
      };
      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          const incoming = data?.snapshot?.panels?.["live-logs"]?.items
            || data?.snapshot?.logs
            || [];
          if (incoming.length > 0) {
            setRecentLogs(prev => {
              const merged = [...incoming, ...prev];
              return merged.slice(0, 200);
            });
          }
          lastPollAt.current = Date.now();
        } catch { /* ignore */ }
      };
      es.onerror = () => {
        setSseConnected(false);
        es.close();
        // Start polling age counter for fallback indicator
        lastPollAt.current = lastPollAt.current || Date.now();
        if (!pollAgeTimer.current) {
          pollAgeTimer.current = setInterval(() => {
            if (lastPollAt.current) {
              setPollAge(Math.round((Date.now() - lastPollAt.current) / 1000));
            }
          }, 1000);
        }
        retryTimer = setTimeout(connect, 5000);
      };
    };

    connect();
    return () => {
      es?.close();
      clearTimeout(retryTimer);
      if (pollAgeTimer.current) clearInterval(pollAgeTimer.current);
    };
  }, []);

  const allLogs = [...recentLogs, ...logs].slice(0, 200);
  const { state, intensity, total, errors, warns } = postureFromLogs(allLogs);
  const store = useRef(null);
  const N = Math.max(200, Math.min(1400, 200 + total * 6));

  const ref = useCanvasAnimation(
    (ctx, w, h) => {
      if (store.current == null || store.current.n !== N) {
        const p = new Float32Array(N * 3);
        for (let i = 0; i < N; i++) {
          p[i * 3] = Math.random() * TAU;
          p[i * 3 + 1] = 0.2 + Math.random() * 0.8;
          p[i * 3 + 2] = 0.4 + Math.random() * 0.6;
        }
        store.current = { p, n: N };
      }
      const { p } = store.current;
      const [r0, g0, b0] = TINT[state] || TINT.clean;
      const cx = w / 2;
      const cy = h / 2;
      const R = Math.min(w, h) * 0.44;
      const pull = 0.0016 + intensity * 0.004;
      const swirl = 0.01 + intensity * 0.03;

      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(3,3,7,0.22)";
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";

      const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 42);
      cg.addColorStop(0, `rgba(${r0},${g0},${b0},0.55)`);
      cg.addColorStop(1, "transparent");
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(cx, cy, 42, 0, TAU);
      ctx.fill();

      for (let i = 0; i < N; i++) {
        let a = p[i * 3];
        let rad = p[i * 3 + 1];
        const sp = p[i * 3 + 2];
        a += swirl * sp * (1 / (rad + 0.15));
        rad -= pull * sp * (1.2 - rad * 0.6);
        if (rad < 0.04) {
          rad = 1.0;
          a = Math.random() * TAU;
        }
        p[i * 3] = a;
        p[i * 3 + 1] = rad;
        // tint particle by a real log line's level (cycled)
        const lvl = allLogs.length ? allLogs[i % allLogs.length].level : null;
        const [cr, cgc, cb] = LEVEL_RGB[lvl] || [r0, g0, b0];
        const rr = rad * R;
        const x = cx + Math.cos(a) * rr;
        const y = cy + Math.sin(a) * rr * 0.62;
        const near = 1 - rad;
        ctx.fillStyle = `rgba(${cr},${cgc},${cb},${0.15 + near * 0.6})`;
        ctx.beginPath();
        ctx.arc(x, y, 0.6 + near * 1.8, 0, TAU);
        ctx.fill();
      }
    },
    [state, intensity, N],
  );

  const items = allLogs
    .slice(0, 6)
    .map((l) => `${formatTs(l.timestamp || l.ts) || l.level || "INFO"} ${(l.line || l.message || "").slice(0, 40)}`);

  const freshnessChip = sseConnected
    ? <span style={{ color: "#63f5ff", fontSize: 10, letterSpacing: 1 }}>● LIVE</span>
    : <span style={{ color: "#ffc857", fontSize: 10, letterSpacing: 1 }}>● {pollAge != null ? `${pollAge}s ago` : "polling"}</span>;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <canvas ref={ref} style={CANVAS_STYLE} aria-label="Vortex Log Sink" />
      <HudDock
        state={state}
        metrics={[
          { label: "Log events", value: total },
          { label: "Errors", value: errors, accent: errors ? "#ff3d81" : undefined },
          { label: "Warnings", value: warns, accent: warns ? "#ffc857" : undefined },
        ]}
        items={items}
        emptyText="— log stream idle —"
        extra={freshnessChip}
      />
    </div>
  );
}

// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

// ════════════════════════════════════════════════════════════════════════
// PANEL 06 · EVENT HORIZON TIMELINE           maps to panel id "threat-timeline"
// Agent 6 · Event Horizon Chronologist
// ────────────────────────────────────────────────────────────────────────
// Breach history as a black-hole accretion disk. One orbiting mote per LIVE
// timeline event; recent events orbit bright/outer, older redshift inward.
// Each mote is tinted by its real event severity/level. HUD shows totals + a
// most-recent-events ticker.
// ════════════════════════════════════════════════════════════════════════
import { useRef } from "react";
import { CANVAS_STYLE, TAU, useCanvasAnimation } from "./useCanvasAnimation.js";
import { postureFromEvents } from "./panelData.js";
import { HudDock } from "./HudOverlay.jsx";

const TINT = { clean: [99, 245, 255], elevated: [255, 200, 87], breach: [255, 61, 129] };
const SEV_RGB = {
  critical: [255, 61, 129],
  error: [255, 61, 129],
  high: [255, 140, 60],
  warn: [255, 200, 87],
  medium: [255, 200, 87],
  low: [99, 245, 255],
  info: [99, 245, 255],
};

export default function EventHorizonTimeline({ events = [] }) {
  const { state, intensity, total } = postureFromEvents(events);
  const store = useRef(null);
  const N = Math.max(120, Math.min(900, (events.length || 40) * 12));

  const ref = useCanvasAnimation(
    (ctx, w, h, t) => {
      if (store.current == null || store.current.n !== N) {
        const p = new Float32Array(N * 2);
        for (let i = 0; i < N; i++) {
          p[i * 2] = Math.random() * TAU;
          p[i * 2 + 1] = 0.3 + Math.random() * 0.7;
        }
        store.current = { p, n: N };
      }
      const { p } = store.current;
      const [r0, g0, b0] = TINT[state] || TINT.clean;
      const cx = w / 2;
      const cy = h / 2;
      const R = Math.min(w, h) * 0.44;
      const hor = Math.min(w, h) * 0.12;
      const spin = 0.3 + intensity * 0.9;

      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(3,3,7,0.30)";
      ctx.fillRect(0, 0, w, h);

      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = `rgba(${r0},${g0},${b0},0.5)`;
      ctx.lineWidth = 2;
      ctx.shadowColor = `rgb(${r0},${g0},${b0})`;
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.ellipse(cx, cy, hor * 1.25, hor * 1.25, 0, 0, TAU);
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.arc(cx, cy, hor, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = "lighter";

      for (let i = 0; i < N; i++) {
        const rad = p[i * 2 + 1];
        const a = p[i * 2] + t * spin * (0.4 / (rad + 0.2));
        const rr = hor * 1.1 + rad * R;
        const x = cx + Math.cos(a) * rr;
        const y = cy + Math.sin(a) * rr * 0.32;
        const near = 1 - rad;
        // tint by a real event's severity (cycled), then redshift inward
        const ev = events.length ? events[i % events.length] : null;
        const sev = String(ev?.severity || ev?.level || "").toLowerCase();
        const base = SEV_RGB[sev] || [r0, g0, b0];
        const rs = near; // redshift toward horizon
        const cr = Math.min(255, base[0] + (255 - base[0]) * rs * 0.4);
        const cgc = Math.max(0, base[1] * (1 - rs * 0.3));
        const cb = Math.max(0, base[2] * (1 - rs * 0.5));
        ctx.fillStyle = `rgba(${cr | 0},${cgc | 0},${cb | 0},${0.2 + near * 0.6})`;
        ctx.beginPath();
        ctx.arc(x, y, 0.6 + near * 1.6, 0, TAU);
        ctx.fill();
      }
    },
    [state, intensity, N],
  );

  const items = events
    .slice(-6)
    .reverse()
    .map((e) => `${e.time || e.ts || ""} ${(e.label || e.title || e.message || "event").slice(0, 36)}`.trim());

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <canvas ref={ref} style={CANVAS_STYLE} aria-label="Event Horizon Timeline" />
      <HudDock
        state={state}
        metrics={[{ label: "Timeline events", value: total }]}
        items={items}
        emptyText="— no events recorded —"
      />
    </div>
  );
}

// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

// ════════════════════════════════════════════════════════════════════════
// PANEL 00 · UNIFIED POSTURE CORE             maps to panel id "overview"
// ────────────────────────────────────────────────────────────────────────
// A distinct overview: concentric "system rings", one ARC per live source,
// filled proportionally to how many sources are live. A central pulse shows
// overall health. Review signals orbit as small motes. Replaces the generic
// radar fallback so Overview no longer looks like every other panel.
// ════════════════════════════════════════════════════════════════════════
import { useRef } from "react";
import { CANVAS_STYLE, TAU, useCanvasAnimation } from "./useCanvasAnimation.js";
import { postureFromSources } from "./panelData.js";
import { HudDock } from "./HudOverlay.jsx";

const TINT = { clean: [99, 245, 255], elevated: [255, 200, 87], breach: [255, 61, 129] };

export default function UnifiedPosture({ sources = [], reviewItems = [] }) {
  const { state, total, live } = postureFromSources(sources, []);
  const reviews = reviewItems.length;
  const store = useRef(null);

  const ref = useCanvasAnimation(
    (ctx, w, h, t) => {
      const n = Math.max(1, total || 9);
      if (store.current == null || store.current.n !== n) {
        store.current = {
          n,
          // pre-rolled angular jitter per source arc
          jitter: Array.from({ length: n }, () => Math.random() * 0.4),
        };
      }
      const { jitter } = store.current;
      const [r0, g0, b0] = TINT[state] || TINT.clean;
      const cx = w / 2;
      const cy = h / 2;
      const R = Math.min(w, h) * 0.4;

      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(3,3,7,0.3)";
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";

      // one arc segment per source, around a ring; lit if that source is live
      const gap = 0.06;
      const seg = TAU / n;
      for (let i = 0; i < n; i++) {
        const src = sources[i];
        const isLive = src ? src.status === "live" : i < live;
        const a0 = i * seg + gap + jitter[i] * 0.02;
        const a1 = (i + 1) * seg - gap;
        const col = isLive ? [r0, g0, b0] : [90, 110, 140];
        const pulse = isLive ? 0.55 + 0.45 * Math.sin(t * 2 + i * 0.5) : 0.25;
        ctx.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},${pulse})`;
        ctx.lineWidth = 7;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.arc(cx, cy, R, a0, a1);
        ctx.stroke();
        if (isLive) {
          ctx.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},0.12)`;
          ctx.lineWidth = 16;
          ctx.beginPath();
          ctx.arc(cx, cy, R, a0, a1);
          ctx.stroke();
        }
      }
      ctx.lineCap = "butt";

      // review-signal motes orbiting inside the ring
      for (let i = 0; i < reviews; i++) {
        const a = t * 0.5 + (i / Math.max(reviews, 1)) * TAU;
        const rr = R * 0.62;
        const x = cx + Math.cos(a) * rr;
        const y = cy + Math.sin(a) * rr;
        ctx.fillStyle = "rgba(255,200,87,0.9)";
        ctx.shadowColor = "#ffc857";
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, TAU);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // central posture pulse
      const breath = 1 + Math.sin(t * 1.6) * 0.06;
      const coreR = R * 0.28 * breath;
      const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
      cg.addColorStop(0, "rgba(255,255,255,0.95)");
      cg.addColorStop(0.45, `rgba(${r0},${g0},${b0},0.55)`);
      cg.addColorStop(1, "transparent");
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR, 0, TAU);
      ctx.fill();
    },
    [state, total, live, reviews],
  );

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <canvas ref={ref} style={CANVAS_STYLE} aria-label="Unified Posture Core" />
      <HudDock
        state={state}
        metrics={[
          { label: "Sources live", value: `${live}/${total}` },
          { label: "Review signals", value: reviews, accent: reviews ? "#ffc857" : undefined },
        ]}
        items={reviewItems.slice(0, 3).map((s) => String(s).slice(0, 44))}
        emptyText="all systems nominal"
      />
    </div>
  );
}

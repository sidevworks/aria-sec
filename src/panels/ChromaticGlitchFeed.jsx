// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

// ════════════════════════════════════════════════════════════════════════
// PANEL 09 · CHROMATIC GLITCH FEED            maps to panel id "incident-feed"
// ════════════════════════════════════════════════════════════════════════
import { useRef } from "react";
import { CANVAS_STYLE, TAU, useCanvasAnimation } from "./useCanvasAnimation.js";
import { postureFromIncidents } from "./panelData.js";
import { HudDock } from "./HudOverlay.jsx";

// Single primary accent: deep crimson. Severity modulates intensity only.
const A = [200, 16, 46];
const SEV_ALPHA = { critical: 1, high: 0.6, medium: 0.28, low: 0.12 };

export default function ChromaticGlitchFeed({ incidents = [] }) {
  const { state, intensity, counts, total } = postureFromIncidents(incidents);
  const rng = useRef(null);
  const ROWS = Math.max(6, Math.min(18, incidents.length || 10));

  const ref = useCanvasAnimation(
    (ctx, w, h, t) => {
      if (rng.current == null || rng.current.n !== ROWS) {
        rng.current = { n: ROWS, seeds: Array.from({ length: ROWS }, () => Math.random()) };
      }
      const { seeds } = rng.current;
      const [r0, g0, b0] = A;

      // ── Deep void base ───────────────────────────────────────────────
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(6,8,16,0.55)";
      ctx.fillRect(0, 0, w, h);

      // ── Subtle horizontal grid ────────────────────────────────────────
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = `rgba(${r0},${g0},${b0},0.025)`;
      ctx.lineWidth = 1;
      for (let i = 1; i < 8; i++) {
        const y = (h / 8) * i;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
      // Vertical grid lines (sparse)
      ctx.strokeStyle = `rgba(${r0},${g0},${b0},0.018)`;
      for (let i = 1; i < 6; i++) {
        const x = (w / 6) * i;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }

      // ── Incident signal traces ────────────────────────────────────────
      const rh = h / ROWS;
      for (let i = 0; i < ROWS; i++) {
        const cy = i * rh + rh * 0.5;
        const seed = seeds[i];
        const inc = incidents[i];
        const sev = String(inc?.severity || "").toLowerCase();
        const sa = SEV_ALPHA[sev] ?? Math.max(0.06, intensity * 0.4);

        const speed = 0.12 + seed * 0.35 + intensity * 0.25;
        const bw = (0.22 + 0.42 * (Math.sin(t * speed + seed * 10) * 0.5 + 0.5)) * w;
        const split = (0.8 + sa * 2.5) * (0.5 + 0.5 * Math.sin(t * 4.5 + seed * 14));
        const tear = sa > 0.8 && Math.sin(t * 10 + seed * 22) > 0.87
          ? (Math.random() - 0.5) * 6 : 0;

        const x0 = 14 + tear;
        const bh = Math.max(1.5, rh * 0.18);

        // R (primary) channel
        ctx.fillStyle = `rgba(${r0},${Math.floor(g0 * 0.2)},${Math.floor(b0 * 0.15)},${0.4 * sa})`;
        ctx.fillRect(x0 - split, cy - bh * 0.5, bw, bh);

        // Ghost channel (thin, offset right — RGB split echo)
        ctx.fillStyle = `rgba(20,40,80,${0.18 * sa})`;
        ctx.fillRect(x0 + split, cy - bh * 0.5, bw * 0.7, bh);

        // Bright pulse core for critical/high rows
        if (sa > 0.5) {
          const pulse = 0.4 + 0.6 * (Math.sin(t * 2.2 + seed * 5) * 0.5 + 0.5);
          ctx.fillStyle = `rgba(${r0},${g0},${b0},${0.55 * pulse * sa})`;
          ctx.fillRect(x0, cy - bh * 0.3, bw * 0.5, bh * 0.6);
        }
      }

      // ── Scanline texture ──────────────────────────────────────────────
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(0,0,0,0.1)";
      for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);

      // ── Slow scan sweep ───────────────────────────────────────────────
      ctx.globalCompositeOperation = "lighter";
      const sy = (t * 48) % (h + 80) - 40;
      const sg = ctx.createLinearGradient(0, sy - 28, 0, sy + 28);
      sg.addColorStop(0, "transparent");
      sg.addColorStop(0.5, `rgba(${r0},${g0},${b0},0.035)`);
      sg.addColorStop(1, "transparent");
      ctx.fillStyle = sg;
      ctx.fillRect(0, sy - 28, w, 56);

      // ── Breach edge vignette ──────────────────────────────────────────
      if (state === "breach") {
        ctx.globalCompositeOperation = "lighter";
        const fa = 0.05 + 0.05 * Math.sin(t * 6);
        const vg = ctx.createRadialGradient(w * 0.5, h * 0.5, h * 0.25, w * 0.5, h * 0.5, h * 0.85);
        vg.addColorStop(0, "transparent");
        vg.addColorStop(1, `rgba(${r0},${g0},${b0},${fa})`);
        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, w, h);
      }

      // ── HUD corner brackets ───────────────────────────────────────────
      ctx.globalCompositeOperation = "source-over";
      const ba = 0.3 + 0.08 * Math.sin(t * 0.9);
      ctx.strokeStyle = `rgba(${r0},${g0},${b0},${ba})`;
      ctx.lineWidth = 1.5;
      const bs = 18; const mg = 10;
      // TL
      ctx.beginPath(); ctx.moveTo(mg + bs, mg); ctx.lineTo(mg, mg); ctx.lineTo(mg, mg + bs); ctx.stroke();
      // TR
      ctx.beginPath(); ctx.moveTo(w - mg - bs, mg); ctx.lineTo(w - mg, mg); ctx.lineTo(w - mg, mg + bs); ctx.stroke();
      // BL
      ctx.beginPath(); ctx.moveTo(mg + bs, h - mg); ctx.lineTo(mg, h - mg); ctx.lineTo(mg, h - mg - bs); ctx.stroke();
      // BR
      ctx.beginPath(); ctx.moveTo(w - mg - bs, h - mg); ctx.lineTo(w - mg, h - mg); ctx.lineTo(w - mg, h - mg - bs); ctx.stroke();

      // ── Incident count arc (top-right quadrant) ───────────────────────
      const acx = w - 52, acy = 52, acR = 26;
      // Outer tick ring (rotating)
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * TAU + t * 0.25;
        const x1 = acx + Math.cos(a) * (acR + 5);
        const y1 = acy + Math.sin(a) * (acR + 5);
        const x2 = acx + Math.cos(a) * (acR + 8);
        const y2 = acy + Math.sin(a) * (acR + 8);
        ctx.strokeStyle = `rgba(${r0},${g0},${b0},${i % 4 === 0 ? 0.5 : 0.12})`;
        ctx.lineWidth = i % 4 === 0 ? 1.5 : 0.8;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      }
      // Background ring
      ctx.strokeStyle = `rgba(${r0},${g0},${b0},0.08)`;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(acx, acy, acR, 0, TAU); ctx.stroke();
      // Fill arc (progress = incident count / 10)
      if (total > 0) {
        ctx.strokeStyle = `rgba(${r0},${g0},${b0},0.65)`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(acx, acy, acR, -TAU * 0.25, -TAU * 0.25 + TAU * Math.min(1, total / 10));
        ctx.stroke();
      }
      // Cross-hairs
      ctx.strokeStyle = `rgba(${r0},${g0},${b0},0.2)`;
      ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(acx - acR * 0.4, acy); ctx.lineTo(acx + acR * 0.4, acy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(acx, acy - acR * 0.4); ctx.lineTo(acx, acy + acR * 0.4); ctx.stroke();

      // ── Status readout strip (bottom left above HUD dock) ────────────
      ctx.fillStyle = `rgba(${r0},${g0},${b0},0.18)`;
      ctx.fillRect(mg + 2, h - 36, 4, 18);
      ctx.fillStyle = `rgba(${r0},${g0},${b0},0.12)`;
      ctx.fillRect(mg + 8, h - 36, 4, 18);
      ctx.fillStyle = `rgba(${r0},${g0},${b0},0.08)`;
      ctx.fillRect(mg + 14, h - 36, 4, 18);
    },
    [state, intensity, ROWS, total],
  );

  const items = incidents
    .slice(0, 6)
    .map((i) => `${(i.severity || "").toUpperCase()} ${(i.title || i.id || "incident").slice(0, 34)}`);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <canvas ref={ref} style={CANVAS_STYLE} aria-label="Chromatic Glitch Feed" />
      <HudDock
        state={state}
        metrics={[
          { label: "Incidents", value: total },
          { label: "Critical", value: counts.critical, accent: counts.critical ? "#c8102e" : undefined },
          { label: "High", value: counts.high, accent: counts.high ? "rgba(200,16,46,0.65)" : undefined },
        ]}
        items={items}
        emptyText="— no open incidents —"
      />
    </div>
  );
}

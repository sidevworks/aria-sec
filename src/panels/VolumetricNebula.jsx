// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

// ════════════════════════════════════════════════════════════════════════
// PANEL 07 · VOLUMETRIC NEBULA                 maps to panel id "system-health"
// Agent 7 · Nebula Volumetric Designer
// ────────────────────────────────────────────────────────────────────────
// Ambient system health as volumetric gas. Density / turbulence / palette
// track REAL memory pressure + load. HUD surfaces memory %, load, and a
// process / disk leaders ticker.
// ════════════════════════════════════════════════════════════════════════
import { useRef } from "react";
import { CANVAS_STYLE, TAU, useCanvasAnimation } from "./useCanvasAnimation.js";
import { postureFromHealth } from "./panelData.js";
import { HudDock } from "./HudOverlay.jsx";

const PAL = {
  clean: [[124, 58, 237], [99, 245, 255]],
  elevated: [[255, 200, 87], [124, 58, 237]],
  breach: [[255, 61, 129], [255, 120, 40]],
};

export default function VolumetricNebula({ memoryPercent = 0, liveLoad = 0, processes = [], disks = [] }) {
  const { state, intensity, memoryPercent: mem, liveLoad: load } = postureFromHealth(memoryPercent, liveLoad);
  const cloud = useRef(null);
  // blob density scales with memory pressure
  const BLOBS = Math.max(14, Math.min(34, 14 + Math.round(mem / 4)));

  const ref = useCanvasAnimation(
    (ctx, w, h, t) => {
      if (cloud.current == null || cloud.current.n !== BLOBS) {
        cloud.current = {
          n: BLOBS,
          blobs: Array.from({ length: BLOBS }, () => ({
            x: Math.random(),
            y: Math.random(),
            r: 0.18 + Math.random() * 0.4,
            ph: Math.random() * TAU,
            c: Math.random(),
          })),
        };
      }
      const { blobs } = cloud.current;
      const [c1, c2] = PAL[state] || PAL.clean;
      const turb = 0.4 + intensity * 1.2;
      const D = Math.min(w, h);

      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(3,3,7,0.22)";
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";

      blobs.forEach((b) => {
        const nx = (((b.x + Math.sin(t * 0.05 * turb + b.ph) * 0.06) % 1) + 1) % 1;
        const ny = (((b.y + Math.cos(t * 0.04 * turb + b.ph) * 0.06) % 1) + 1) % 1;
        const px = nx * w;
        const py = ny * h;
        const rr = b.r * D * (0.8 + Math.sin(t * 0.6 + b.ph) * 0.2);
        const col = b.c < 0.5 ? c1 : c2;
        const g = ctx.createRadialGradient(px, py, 0, px, py, rr);
        g.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},${0.05 + intensity * 0.06})`);
        g.addColorStop(0.5, `rgba(${col[0]},${col[1]},${col[2]},0.02)`);
        g.addColorStop(1, "transparent");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(px, py, rr, 0, TAU);
        ctx.fill();
      });

      for (let i = 0; i < 50; i++) {
        const sx = (Math.sin(i * 12.9) * 0.5 + 0.5) * w;
        const sy = (Math.cos(i * 7.7) * 0.5 + 0.5) * h;
        ctx.fillStyle = `rgba(220,240,255,${0.05 + Math.sin(t + i) * 0.04})`;
        ctx.beginPath();
        ctx.arc(sx, sy, 0.7, 0, TAU);
        ctx.fill();
      }
    },
    [state, intensity, BLOBS],
  );

  const items = (processes.length ? processes : disks)
    .slice(0, 6)
    .map((p) => `${p.name || p.mount || p.label || "proc"} ${p.cpu ?? p.usage ?? p.percent ?? ""}`.trim());

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <canvas ref={ref} style={CANVAS_STYLE} aria-label="Volumetric Nebula" />
      <HudDock
        state={state}
        metrics={[
          { label: "Memory pressure", value: `${mem}%`, accent: mem >= 88 ? "#ff3d81" : mem >= 70 ? "#ffc857" : undefined },
          { label: "Load", value: load },
        ]}
        items={items}
        emptyText="— vitals nominal —"
      />
    </div>
  );
}

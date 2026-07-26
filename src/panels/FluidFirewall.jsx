// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

// ════════════════════════════════════════════════════════════════════════
// PANEL 01 · FLUID DYNAMICS FIREWALL          maps to panel id "network"
// Agent 1 · Fluid Dynamics Lead
// ────────────────────────────────────────────────────────────────────────
// Liquid security perimeter driven by LIVE network connections. Each active
// socket contributes a particle band; BLOCKED sockets rupture the membrane.
// Posture (viscosity / turbulence / color) derives from real connection data.
// HUD surfaces real socket / blocked / established counts + a remote-IP ticker.
// ════════════════════════════════════════════════════════════════════════
import { useRef } from "react";
import { CANVAS_STYLE, TAU, useCanvasAnimation } from "./useCanvasAnimation.js";
import { postureFromConnections } from "./panelData.js";
import { HudDock } from "./HudOverlay.jsx";

const STATES = {
  clean:    { hue: 186, damping: 0.94, turbulence: 0.18, glow: 0.9 },
  elevated: { hue: 40,  damping: 0.90, turbulence: 0.6,  glow: 1.15 },
  breach:   { hue: 12,  damping: 0.82, turbulence: 1.5,  glow: 1.7 },
};
const noise = (x, y) =>
  Math.sin(x * 1.7 + Math.cos(y * 0.9)) * Math.cos(y * 1.3 - Math.sin(x * 0.6));

export default function FluidFirewall({ connections = [] }) {
  const { state, intensity, total, blocked, established } = postureFromConnections(connections);
  const fluid = useRef(null);

  // particle count scales with real socket count (bounded for perf)
  const N = Math.max(400, Math.min(2200, 400 + total * 30));

  const ref = useCanvasAnimation(
    (ctx, w, h, t) => {
      if (fluid.current == null || fluid.current.n !== N) {
        const p = new Float32Array(N * 4);
        for (let i = 0; i < N; i++) {
          p[i * 4] = Math.random() * TAU;
          p[i * 4 + 1] = (Math.random() - 0.5) * 30;
        }
        fluid.current = { p, n: N, breachAngle: -0.6 };
      }
      const { p, breachAngle } = fluid.current;
      const cfg = STATES[state] || STATES.clean;
      const cx = w / 2;
      const cy = h / 2;
      const R = Math.min(w, h) * 0.32;
      const speed = 0.004 + intensity * 0.012;

      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(3,3,7,0.18)";
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";

      for (let i = 0; i < N; i++) {
        let a = p[i * 4];
        let r = p[i * 4 + 1];
        let va = p[i * 4 + 2];
        let vr = p[i * 4 + 3];
        const turb = noise(Math.cos(a) * 2 + t * 0.3, Math.sin(a) * 2) * cfg.turbulence;
        let breachForce = 0;
        if (state === "breach") {
          const d = Math.atan2(Math.sin(a - breachAngle), Math.cos(a - breachAngle));
          breachForce = Math.exp(-(d * d) * 6) * (6 + Math.sin(t * 8) * 3);
        }
        va += speed + turb * 0.002;
        vr += -r * 0.02 + turb * 1.2 + breachForce;
        va *= cfg.damping;
        vr *= cfg.damping;
        a += va;
        r += vr;
        p[i * 4] = a;
        p[i * 4 + 1] = r;
        p[i * 4 + 2] = va;
        p[i * 4 + 3] = vr;
        const rad = R + r;
        const x = cx + Math.cos(a) * rad;
        const y = cy + Math.sin(a) * rad;
        const heat = Math.min(1, Math.abs(vr) * 0.12 + cfg.glow * 0.2);
        ctx.fillStyle = `hsla(${cfg.hue - heat * 10}, 100%, ${55 + heat * 30}%, ${0.5 * cfg.glow})`;
        ctx.beginPath();
        ctx.arc(x, y, 1.1 + heat * 1.6, 0, TAU);
        ctx.fill();
      }
    },
    [state, intensity, N],
  );

  const remotes = connections
    .filter((c) => c.state === "BLOCKED" || c.state === "ESTABLISHED")
    .slice(0, 6)
    .map((c) => `${c.remote || c.local || "?"} ${c.state}`);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <canvas ref={ref} style={CANVAS_STYLE} aria-label="Fluid Dynamics Firewall" />
      <HudDock
        state={state}
        metrics={[
          { label: "Live sockets", value: total },
          { label: "Established", value: established, accent: "#63f5ff" },
          { label: "Blocked", value: blocked, accent: blocked ? "#ff3d81" : undefined },
        ]}
        items={remotes}
        emptyText="— no active sockets —"
      />
    </div>
  );
}

// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

// ════════════════════════════════════════════════════════════════════════
// PANEL 08 · PERIMETER DEFENSE RADAR          maps to panel id "threat-overview"
// Agent 8 · Dark Matter Anomalist (reimagined as a relatable defense radar)
// ────────────────────────────────────────────────────────────────────────
// A defended core sits inside a perimeter ring. A sweep arm rotates and
// detects incoming THREAT BLIPS approaching from outside. The live risk score
// drives how many blips spawn and how far they penetrate:
//   • LOW risk    → few blips, held outside the perimeter (calm cyan).
//   • HIGH risk   → many blips cross the ring toward the core; ring flares red
//                   at each breach point and the core shield cracks.
// The risk score literally reads as "how breached is the perimeter".
// ════════════════════════════════════════════════════════════════════════
import { useRef } from "react";
import { CANVAS_STYLE, TAU, useCanvasAnimation } from "./useCanvasAnimation.js";
import { postureFromRisk } from "./panelData.js";
import { HudDock } from "./HudOverlay.jsx";

const TINT = { clean: [99, 245, 255], elevated: [255, 200, 87], breach: [255, 61, 129] };

export default function PerimeterDefense({ riskScore = 0 }) {
  const { state, intensity, riskScore: risk } = postureFromRisk(riskScore);
  const store = useRef(null);
  // more threats as risk climbs; how deep they get also scales with risk
  const count = Math.max(5, Math.round(5 + intensity * 18));

  const ref = useCanvasAnimation(
    (ctx, w, h, t) => {
      if (store.current == null || store.current.n !== count) {
        store.current = {
          n: count,
          blips: Array.from({ length: count }, () => ({
            a: Math.random() * TAU,
            // start outside (1.0..1.6 of perimeter), approach inover time
            d: 1.05 + Math.random() * 0.6,
            speed: 0.02 + Math.random() * 0.05,
            seed: Math.random() * TAU,
          })),
        };
      }
      const { blips } = store.current;
      const [r0, g0, b0] = TINT[state] || TINT.clean;
      const cx = w / 2;
      const cy = h / 2;
      const R = Math.min(w, h) * 0.42; // perimeter radius
      const coreR = R * 0.22;
      // how far past the perimeter threats are allowed to push (0..1 of the gap)
      const penetration = intensity; // 0 calm → 1 fully breached

      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(3,3,7,0.32)";
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";

      // concentric range rings
      ctx.lineWidth = 1;
      [0.4, 0.7, 1.0].forEach((rr) => {
        ctx.strokeStyle = `rgba(${r0},${g0},${b0},${rr === 1 ? 0.4 : 0.12})`;
        ctx.beginPath();
        ctx.arc(cx, cy, R * rr, 0, TAU);
        ctx.stroke();
      });

      // sweep arm + trailing wedge
      const sweep = t * 0.9;
      for (let i = 0; i < 36; i++) {
        const a = sweep - i * 0.03;
        const al = (1 - i / 36) * 0.16;
        ctx.strokeStyle = `rgba(${r0},${g0},${b0},${al})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
        ctx.stroke();
      }
      ctx.strokeStyle = `rgba(${r0},${g0},${b0},0.85)`;
      ctx.lineWidth = 2;
      ctx.shadowColor = `rgb(${r0},${g0},${b0})`;
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(sweep) * R, cy + Math.sin(sweep) * R);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // threat blips
      let breaches = 0;
      blips.forEach((bl) => {
        // drift inward toward an allowed minimum distance set by penetration
        const minD = 1 - penetration * (1 - (coreR / R)); // 1.0 (calm) → ~coreR/R (breached)
        bl.d -= bl.speed * (0.4 + intensity) * 0.06;
        if (bl.d < minD) bl.d = 1.05 + Math.random() * 0.55; // repelled / respawn outside
        const rr = bl.d * R;
        const x = cx + Math.cos(bl.a) * rr;
        const y = cy + Math.sin(bl.a) * rr;
        const inside = bl.d < 1.0;
        if (inside) breaches++;
        // lit brighter when the sweep just passed
        const delta = (((sweep - bl.a) % TAU) + TAU) % TAU;
        const lit = delta < 0.5 ? 1 : 0.4;
        const col = inside ? [255, 61, 129] : [r0, g0, b0];
        const halo = ctx.createRadialGradient(x, y, 0, x, y, 10);
        halo.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},${0.9 * lit})`);
        halo.addColorStop(1, "transparent");
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(x, y, 10, 0, TAU);
        ctx.fill();
        ctx.fillStyle = `rgba(255,255,255,${0.7 * lit})`;
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, TAU);
        ctx.fill();

        // breach flare on the perimeter where an inside-blip crossed
        if (inside) {
          const bx = cx + Math.cos(bl.a) * R;
          const by = cy + Math.sin(bl.a) * R;
          const fl = ctx.createRadialGradient(bx, by, 0, bx, by, 16);
          fl.addColorStop(0, `rgba(255,61,129,${0.5 + 0.3 * Math.sin(t * 8 + bl.seed)})`);
          fl.addColorStop(1, "transparent");
          ctx.fillStyle = fl;
          ctx.beginPath();
          ctx.arc(bx, by, 16, 0, TAU);
          ctx.fill();
        }
      });

      // defended core — shield integrity drops with penetration
      const integrity = 1 - penetration;
      const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
      const coreCol = breaches > 0 ? [255, 61, 129] : [r0, g0, b0];
      cg.addColorStop(0, "rgba(255,255,255,0.95)");
      cg.addColorStop(0.5, `rgba(${coreCol[0]},${coreCol[1]},${coreCol[2]},${0.5 + integrity * 0.3})`);
      cg.addColorStop(1, "transparent");
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR, 0, TAU);
      ctx.fill();

      // shield ring around core — cracks (dashes) appear as integrity falls
      ctx.strokeStyle = `rgba(${coreCol[0]},${coreCol[1]},${coreCol[2]},0.8)`;
      ctx.lineWidth = 2.5;
      const segs = 28;
      for (let i = 0; i < segs; i++) {
        // when integrity is low, randomly skip segments → cracked shield
        if (Math.sin(i * 12.9 + Math.floor(t * 2)) * 0.5 + 0.5 > integrity + 0.15) continue;
        const a0 = (i / segs) * TAU;
        const a1 = a0 + (TAU / segs) * 0.7;
        ctx.beginPath();
        ctx.arc(cx, cy, coreR + 6, a0, a1);
        ctx.stroke();
      }
    },
    [state, intensity, count],
  );

  const breachedLabel = risk >= 70 ? "PERIMETER BREACHED" : risk >= 40 ? "INTRUSIONS DETECTED" : "PERIMETER SECURE";
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <canvas ref={ref} style={CANVAS_STYLE} aria-label="Perimeter Defense Radar" />
      <HudDock
        state={state}
        metrics={[
          { label: "Risk score", value: risk, accent: risk >= 70 ? "#ff3d81" : risk >= 40 ? "#ffc857" : undefined },
          { label: "Threats tracked", value: count },
        ]}
        items={[breachedLabel]}
      />
    </div>
  );
}

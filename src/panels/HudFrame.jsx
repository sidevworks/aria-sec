// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

// ════════════════════════════════════════════════════════════════════════
// COSMOS-UI · HudFrame — cosmic backdrop + HUD chrome for the functional panes
// (security-admin, identity-sessions, policy-change). The panes are real
// forms/tables, so we don't replace their data — we wrap them in a starship
// HUD shell. Each pane passes a `variant` so its backdrop is DATA-DRIVEN and
// visually distinct (not the same generic grid):
//   • shield   (security-admin)   → concentric shield arcs, denial sparks
//   • sessions (identity-sessions)→ horizontal session lanes, live packets
//   • policy   (policy-change)    → ascending policy ledger bars + diff ticks
// Backdrop is pointer-none so the content stays fully interactive.
// ════════════════════════════════════════════════════════════════════════
import { useCanvasAnimation, TAU } from "./useCanvasAnimation.js";

function hexRgb(hex) {
  const v = (hex || "#63f5ff").replace("#", "");
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}

function HudBackdrop({ accent, variant = "grid", data = {} }) {
  const [r, g, b] = hexRgb(accent);
  const ref = useCanvasAnimation(
    (ctx, w, h, t) => {
      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      const stroke = (a) => `rgba(${r},${g},${b},${a})`;

      if (variant === "shield") {
        // SECURITY ADMIN — concentric shield arcs around a guarded core; each
        // authz denial throws a red spark inward (an attempted breach repelled).
        const cx = w * 0.5;
        const cy = h * 0.5;
        const R = Math.min(w, h) * 0.5;
        for (let ring = 1; ring <= 4; ring++) {
          const rr = (R / 4) * ring;
          const segs = 22 + ring * 4;
          for (let i = 0; i < segs; i++) {
            const a0 = (i / segs) * TAU + t * 0.05 * (ring % 2 ? 1 : -1);
            const a1 = a0 + (TAU / segs) * 0.6;
            ctx.strokeStyle = stroke(0.04 + 0.02 * ring);
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(cx, cy, rr, a0, a1);
            ctx.stroke();
          }
        }
        const denials = data.denials || 0;
        for (let i = 0; i < Math.min(denials, 14); i++) {
          const a = (i / Math.max(denials, 1)) * TAU + t * 0.6;
          const prog = (t * 0.4 + i * 0.3) % 1;
          const rr = R * (1 - prog);
          const x = cx + Math.cos(a) * rr;
          const y = cy + Math.sin(a) * rr;
          ctx.fillStyle = `rgba(255,61,129,${(1 - prog) * 0.5})`;
          ctx.beginPath();
          ctx.arc(x, y, 1.6, 0, TAU);
          ctx.fill();
        }
      } else if (variant === "sessions") {
        // IDENTITY & SESSIONS — horizontal identity lanes; one packet travels
        // each lane, density = active session count.
        const lanes = Math.max(4, Math.min(10, data.sessions || 6));
        for (let i = 0; i < lanes; i++) {
          const y = (h / (lanes + 1)) * (i + 1);
          ctx.strokeStyle = stroke(0.05);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
          ctx.stroke();
          const f = (t * (0.12 + (i % 3) * 0.05) + i * 0.2) % 1;
          const x = f * w;
          const g2 = ctx.createRadialGradient(x, y, 0, x, y, 22);
          g2.addColorStop(0, stroke(0.5));
          g2.addColorStop(1, "transparent");
          ctx.fillStyle = g2;
          ctx.beginPath();
          ctx.arc(x, y, 22, 0, TAU);
          ctx.fill();
        }
      } else if (variant === "policy") {
        // POLICY CHANGE — an ascending ledger: vertical bars (policies) with a
        // scanning head; small ticks above = history entries.
        const bars = Math.max(6, Math.min(28, data.policies || 10));
        const bw = w / bars;
        for (let i = 0; i < bars; i++) {
          const x = i * bw + bw * 0.5;
          const hh = h * (0.2 + 0.5 * (Math.sin(i * 1.3 + t * 0.4) * 0.5 + 0.5));
          ctx.strokeStyle = stroke(0.06);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x, h);
          ctx.lineTo(x, h - hh);
          ctx.stroke();
          ctx.fillStyle = stroke(0.4);
          ctx.beginPath();
          ctx.arc(x, h - hh, 1.8, 0, TAU);
          ctx.fill();
        }
        const hist = Math.min(data.history || 0, 40);
        for (let i = 0; i < hist; i++) {
          const x = ((i / Math.max(hist, 1)) * w + t * 12) % w;
          ctx.fillStyle = stroke(0.18);
          ctx.fillRect(x, 8 + (i % 3) * 4, 5, 1.5);
        }
      } else {
        // default grid
        const horizon = h * 0.62;
        const drift = (t * 14) % 46;
        ctx.strokeStyle = stroke(0.05);
        ctx.lineWidth = 1;
        for (let i = 0; i < 18; i++) {
          const yy = horizon + Math.pow(i, 1.6) * 3 + drift;
          if (yy > h) continue;
          ctx.beginPath();
          ctx.moveTo(0, yy);
          ctx.lineTo(w, yy);
          ctx.stroke();
        }
      }

      // shared: scanline sweep + vignette
      ctx.globalCompositeOperation = "lighter";
      const sy = (t * 60) % (h + 120) - 60;
      const grad = ctx.createLinearGradient(0, sy - 40, 0, sy + 40);
      grad.addColorStop(0, "transparent");
      grad.addColorStop(0.5, stroke(0.05));
      grad.addColorStop(1, "transparent");
      ctx.fillStyle = grad;
      ctx.fillRect(0, sy - 40, w, 80);

      ctx.globalCompositeOperation = "source-over";
      const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.7);
      vg.addColorStop(0, "transparent");
      vg.addColorStop(1, "rgba(3,3,7,0.55)");
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, w, h);
    },
    [accent, variant, data.denials, data.sessions, data.policies, data.history],
  );
  return (
    <canvas
      ref={ref}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 0 }}
    />
  );
}

const cornerBase = { position: "absolute", width: 18, height: 18, pointerEvents: "none", zIndex: 2 };

export default function HudFrame({ accent = "#63f5ff", title, subtitle, metrics = [], variant = "grid", data = {}, children }) {
  const [r, g, b] = hexRgb(accent);
  const line = `rgba(${r},${g},${b},0.55)`;
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        minHeight: "100%",
        overflow: "hidden",
        borderRadius: 14,
        background: "rgba(6,8,18,0.35)",
      }}
    >
      <HudBackdrop accent={accent} variant={variant} data={data} />

      <span style={{ ...cornerBase, top: 8, left: 8, borderTop: `1px solid ${line}`, borderLeft: `1px solid ${line}` }} />
      <span style={{ ...cornerBase, top: 8, right: 8, borderTop: `1px solid ${line}`, borderRight: `1px solid ${line}` }} />
      <span style={{ ...cornerBase, bottom: 8, left: 8, borderBottom: `1px solid ${line}`, borderLeft: `1px solid ${line}` }} />
      <span style={{ ...cornerBase, bottom: 8, right: 8, borderBottom: `1px solid ${line}`, borderRight: `1px solid ${line}` }} />

      {(title || metrics.length) && (
        <div
          style={{
            position: "relative",
            zIndex: 2,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 16,
            padding: "16px 20px 12px",
            borderBottom: `1px solid rgba(${r},${g},${b},0.16)`,
            fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: accent,
                boxShadow: `0 0 12px ${accent}`,
                animation: "cx-pulse 1.4s ease-in-out infinite",
              }}
            />
            <div>
              {title && (
                <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.22em", color: accent, textShadow: `0 0 14px ${accent}66` }}>
                  {title}
                </div>
              )}
              {subtitle && (
                <div style={{ fontSize: 9.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(234,247,255,0.42)", marginTop: 3 }}>
                  {subtitle}
                </div>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: 22 }}>
            {metrics.map((m, i) => (
              <div key={i} style={{ textAlign: "right", lineHeight: 1 }}>
                <div style={{ fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(234,247,255,0.42)" }}>{m.label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4, color: m.accent || accent, textShadow: `0 0 12px ${(m.accent || accent)}55` }}>
                  {m.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ position: "relative", zIndex: 1 }}>{children}</div>
    </div>
  );
}

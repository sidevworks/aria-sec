// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

// ════════════════════════════════════════════════════════════════════════
// PANEL 05 · NEURAL NODE WEB                   maps to panel id "aria-center"
// Agent 5 · Neural Node Web Developer
// ────────────────────────────────────────────────────────────────────────
// Command-center constellation. One node per LIVE source; node color encodes
// real source status (live/blocked/idle). Signal rate scales with pending
// approvals. HUD shows live/total sources + pending approvals + source ticker.
// Agent 14 · added PENDING APPROVALS overlay (AC-001) with approve/deny actions.
// ════════════════════════════════════════════════════════════════════════
import { useEffect, useRef, useState } from "react";
import { CANVAS_STYLE, TAU, useCanvasAnimation } from "./useCanvasAnimation.js";
import { postureFromSources } from "./panelData.js";
import { HudDock } from "./HudOverlay.jsx";

const ARIA_API_BASE = (import.meta.env.VITE_ARIA_API_BASE || "").replace(/\/$/, "");
const AUTH_HEADERS = {
  "x-tenant-id": import.meta.env.VITE_ARIA_TENANT_ID || "tenant-local",
  "x-user-id": import.meta.env.VITE_ARIA_USER_ID || "admin",
  "x-role": import.meta.env.VITE_ARIA_ROLE || "owner",
};

const TINT = { clean: [99, 245, 255], elevated: [255, 200, 87], breach: [255, 61, 129] };
const STATUS_RGB = {
  live: [99, 245, 255],
  blocked: [255, 61, 129],
  idle: [120, 140, 170],
  pending: [255, 200, 87],
};

const RISK_COLOR = {
  critical: "#ff3d81",
  high: "#ffc857",
  medium: "#63f5ff",
  low: "#8b5cf6",
};

const BTN = {
  padding: "3px 8px",
  fontSize: 11,
  borderRadius: 3,
  border: "1px solid rgba(99,245,255,0.3)",
  background: "rgba(3,3,7,0.85)",
  color: "#63f5ff",
  cursor: "pointer",
  letterSpacing: "0.05em",
};

function timeLeft(expiresAt) {
  if (!expiresAt) return null;
  const diff = new Date(expiresAt) - Date.now();
  if (diff <= 0) return "Expired";
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "<1m left";
  return `${mins}m left`;
}

function ApprovalQueue() {
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState({});

  async function fetchQueue() {
    try {
      const res = await fetch(`${ARIA_API_BASE}/api/aria/approval/queue`, { headers: AUTH_HEADERS });
      if (res.ok) {
        const data = await res.json();
        // accept array directly or { items: [...] }
        setItems(Array.isArray(data) ? data : (data.items || data.queue || []));
      }
    } catch (_) {
      // silently retry on next interval
    }
  }

  useEffect(() => {
    fetchQueue();
    const id = setInterval(fetchQueue, 10000);
    return () => clearInterval(id);
  }, []);

  async function decide(id, decision) {
    if (busy[id]) return;
    setBusy((prev) => ({ ...prev, [id]: decision }));
    try {
      const res = await fetch(`${ARIA_API_BASE}/api/aria/approval/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...AUTH_HEADERS },
        body: JSON.stringify({ ids: [id], decision }),
      });
      if (res.ok) {
        setItems((prev) => prev.filter((item) => item.id !== id));
      }
    } catch (_) {
      // allow retry
    } finally {
      setBusy((prev) => { const n = { ...prev }; delete n[id]; return n; });
    }
  }

  return (
    <div
      style={{
        position: "absolute",
        bottom: 70,
        right: 10,
        width: 250,
        maxHeight: "55%",
        overflowY: "auto",
        background: "rgba(3,3,7,0.88)",
        border: "1px solid rgba(99,245,255,0.2)",
        borderRadius: 6,
        padding: "10px 12px",
        fontFamily: "ui-monospace,'SF Mono',Menlo,monospace",
        pointerEvents: "auto",
        zIndex: 20,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div
        style={{
          fontSize: 9,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "rgba(234,247,255,0.4)",
          paddingBottom: 4,
          borderBottom: "1px solid rgba(99,245,255,0.1)",
          flexShrink: 0,
        }}
      >
        Pending Approvals
        {items.length > 0 && (
          <span style={{ marginLeft: 8, color: "#ffc857" }}>{items.length}</span>
        )}
      </div>

      {items.length === 0 ? (
        <div
          style={{
            fontSize: 11,
            color: "rgba(99,245,255,0.4)",
            textAlign: "center",
            padding: "12px 0",
            animation: "pulse 2s ease-in-out infinite",
          }}
        >
          <style>{`@keyframes pulse{0%,100%{opacity:0.4}50%{opacity:0.85}}`}</style>
          No pending approvals
        </div>
      ) : (
        items.map((item) => {
          const riskLevel = String(item.risk_level || "medium").toLowerCase();
          const riskColor = RISK_COLOR[riskLevel] || RISK_COLOR.medium;
          const expiry = timeLeft(item.expires_at);
          return (
            <div
              key={item.id}
              style={{
                background: "rgba(255,255,255,0.03)",
                border: `1px solid ${riskColor}33`,
                borderLeft: `3px solid ${riskColor}`,
                borderRadius: 4,
                padding: "7px 9px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6, marginBottom: 3 }}>
                <span
                  style={{
                    fontSize: 9,
                    padding: "1px 5px",
                    borderRadius: 2,
                    background: `${riskColor}22`,
                    color: riskColor,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    flexShrink: 0,
                  }}
                >
                  {riskLevel}
                </span>
                {expiry && (
                  <span
                    style={{
                      fontSize: 9,
                      color: expiry === "Expired" ? "#ff3d81" : "rgba(234,247,255,0.35)",
                      marginLeft: "auto",
                    }}
                  >
                    {expiry}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11, color: "rgba(234,247,255,0.88)", lineHeight: 1.3, marginBottom: 3 }}>
                {(item.title || item.name || String(item.id)).slice(0, 50)}
              </div>
              {item.context && (
                <div style={{ fontSize: 9, color: "rgba(234,247,255,0.4)", marginBottom: 6, lineHeight: 1.4 }}>
                  {String(item.context).slice(0, 80)}
                </div>
              )}
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  style={{
                    ...BTN,
                    borderColor: "rgba(80,220,120,0.5)",
                    color: "#50dc78",
                    background: busy[item.id] === "approve" ? "rgba(80,220,120,0.18)" : "rgba(3,3,7,0.85)",
                    opacity: busy[item.id] ? 0.6 : 1,
                  }}
                  onClick={() => decide(item.id, "approve")}
                  disabled={!!busy[item.id]}
                >
                  {busy[item.id] === "approve" ? "..." : "APPROVE"}
                </button>
                <button
                  style={{
                    ...BTN,
                    borderColor: "rgba(255,61,129,0.4)",
                    color: "#ff3d81",
                    background: busy[item.id] === "deny" ? "rgba(255,61,129,0.18)" : "rgba(3,3,7,0.85)",
                    opacity: busy[item.id] ? 0.6 : 1,
                  }}
                  onClick={() => decide(item.id, "deny")}
                  disabled={!!busy[item.id]}
                >
                  {busy[item.id] === "deny" ? "..." : "DENY"}
                </button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

export default function NeuralNodeWeb({ sources = [], approvals = [] }) {
  const { state, intensity, total, live, pending } = postureFromSources(sources, approvals);
  const net = useRef(null);
  const count = Math.max(6, Math.min(40, sources.length || 18));

  const ref = useCanvasAnimation(
    (ctx, w, h, t) => {
      if (net.current == null || net.current.count !== count) {
        const nodes = Array.from({ length: count }, (_, i) => ({
          x: Math.random(),
          y: Math.random(),
          vx: Math.random() - 0.5,
          vy: Math.random() - 0.5,
          ph: Math.random() * TAU,
          status: sources[i]?.status || "idle",
        }));
        const edges = [];
        for (let i = 0; i < count; i++) {
          for (let j = i + 1; j < count; j++) {
            if (Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y) < 0.28)
              edges.push([i, j, Math.random()]);
          }
        }
        net.current = { nodes, edges, count };
      }
      const { nodes, edges } = net.current;
      const [r0, g0, b0] = TINT[state] || TINT.clean;

      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(3,3,7,0.28)";
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";

      nodes.forEach((n) => {
        n.x += n.vx * 0.0004;
        n.y += n.vy * 0.0004;
        if (n.x < 0.05 || n.x > 0.95) n.vx *= -1;
        if (n.y < 0.05 || n.y > 0.95) n.vy *= -1;
      });
      const px = (n) => n.x * w;
      const py = (n) => n.y * h;
      const signalSpeed = 0.2 + intensity * 0.9;

      edges.forEach(([i, j, seed]) => {
        const A = nodes[i];
        const B = nodes[j];
        ctx.strokeStyle = `rgba(${r0},${g0},${b0},0.12)`;
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(px(A), py(A));
        ctx.lineTo(px(B), py(B));
        ctx.stroke();
        const f = (t * signalSpeed + seed) % 1;
        ctx.fillStyle = `rgba(${r0},${g0},${b0},0.9)`;
        ctx.beginPath();
        ctx.arc(px(A) + (px(B) - px(A)) * f, py(A) + (py(B) - py(A)) * f, 1.6, 0, TAU);
        ctx.fill();
      });

      nodes.forEach((n) => {
        const pulse = 0.5 + Math.sin(t * 2 + n.ph) * 0.5;
        const x = px(n);
        const y = py(n);
        const rr = 3 + pulse * 3;
        const [cr, cgc, cb] = STATUS_RGB[n.status] || STATUS_RGB.idle;
        const halo = ctx.createRadialGradient(x, y, 0, x, y, rr * 3);
        halo.addColorStop(0, `rgba(${cr},${cgc},${cb},${0.5 + pulse * 0.4})`);
        halo.addColorStop(1, "transparent");
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(x, y, rr * 3, 0, TAU);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.beginPath();
        ctx.arc(x, y, rr * 0.5 + 1, 0, TAU);
        ctx.fill();
      });
    },
    [state, intensity, count],
  );

  const items = sources
    .slice(0, 6)
    .map((s) => `${s.name || s.label || s.id || "source"} ${(s.status || "idle").toUpperCase()}`);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <canvas ref={ref} style={CANVAS_STYLE} aria-label="Neural Node Web" />
      <ApprovalQueue />
      <HudDock
        state={state}
        metrics={[
          { label: "Sources live", value: `${live}/${total}` },
          { label: "Pending approvals", value: pending, accent: pending ? "#ffc857" : undefined },
        ]}
        items={items}
        emptyText="— no sources linked —"
      />
    </div>
  );
}

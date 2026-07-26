// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

// ════════════════════════════════════════════════════════════════════════
// PANEL 12 · TARGET-LOCK PERIMETER            maps to panel id "blocked-ips"
// Agent 12 · Micro-HUD Asset Generator
// ────────────────────────────────────────────────────────────────────────
// One hostile blip per REAL blocked socket / source; a sweeping reticle
// acquires them with target-lock brackets. Blip count = real blocked count.
// HUD shows blocked total + a blocked-remote ticker.
// Agent 14 · added UNBLOCK per-IP popover + bulk UNBLOCK SELECTED action.
// ════════════════════════════════════════════════════════════════════════
import { useRef, useState } from "react";
import { CANVAS_STYLE, TAU, useCanvasAnimation } from "./useCanvasAnimation.js";
import { postureFromBlocked } from "./panelData.js";
import { HudDock } from "./HudOverlay.jsx";

const ARIA_API_BASE = (import.meta.env.VITE_ARIA_API_BASE || "").replace(/\/$/, "");

const TINT = { clean: [99, 245, 255], elevated: [255, 200, 87], breach: [255, 61, 129] };

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

export default function TargetLockPerimeter({ sources = [], connections = [], blockedIps = [] }) {
  const { state, intensity, blocked } = postureFromBlocked(sources, connections);
  const blips = useRef(null);
  // at least a few decoy blips so the perimeter never looks dead
  const activeBlockedCount = Math.max(blocked || 0, blockedIps.length);
  const visualState = activeBlockedCount ? "breach" : state;
  const count = Math.max(3, Math.min(18, activeBlockedCount || 3));

  // Derive the list of blocked IPs/remotes from connections
  const blockedList = (blockedIps.length
    ? blockedIps.map((item) => item?.ip || item).filter(Boolean)
    : connections
    .filter((c) => c.state === "BLOCKED")
    .map((c) => c.remote || c.local || "?")
    .filter(Boolean));

  const [selected, setSelected] = useState(new Set());
  const [removed, setRemoved] = useState(new Set());
  const [popover, setPopover] = useState(null); // ip string or null
  const [busyIp, setBusyIp] = useState(null);
  const [busyBulk, setBusyBulk] = useState(false);

  const visibleList = blockedList.filter((ip) => !removed.has(ip));

  function toggleSelect(ip) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(ip)) next.delete(ip);
      else next.add(ip);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === visibleList.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(visibleList));
    }
  }

  async function unblockIp(ip) {
    if (busyIp) return;
    setBusyIp(ip);
    try {
      const res = await fetch(`${ARIA_API_BASE}/api/blocked-ips/${encodeURIComponent(ip)}/unblock`, { method: "POST" });
      if (res.ok) {
        setRemoved((prev) => new Set([...prev, ip]));
        setSelected((prev) => { const next = new Set(prev); next.delete(ip); return next; });
        setPopover(null);
      }
    } catch (_) {
      // silently allow retry
    } finally {
      setBusyIp(null);
    }
  }

  async function unblockSelected() {
    if (busyBulk || selected.size === 0) return;
    setBusyBulk(true);
    const ips = [...selected].filter((ip) => !removed.has(ip));
    try {
      const res = await fetch(`${ARIA_API_BASE}/api/blocked-ips/bulk-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unblock", ips }),
      });
      if (res.ok) {
        setRemoved((prev) => new Set([...prev, ...ips]));
        setSelected(new Set());
      }
    } catch (_) {
      // silently allow retry
    } finally {
      setBusyBulk(false);
    }
  }

  const ref = useCanvasAnimation(
    (ctx, w, h, t) => {
      if (blips.current == null || blips.current.length !== count) {
        blips.current = Array.from({ length: count }, () => ({
          a: Math.random() * TAU,
          r: 0.45 + Math.random() * 0.5,
          ph: Math.random() * TAU,
        }));
      }
      const b = blips.current;
      const [r0, g0, b0] = TINT[visualState] || TINT.clean;
      const cx = w / 2;
      const cy = h / 2;
      const R = Math.min(w, h) * 0.44;

      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(3,3,7,0.35)";
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";

      ctx.strokeStyle = `rgba(${r0},${g0},${b0},0.25)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.9, 0, TAU);
      ctx.stroke();

      const sweep = t * (0.4 + intensity);
      ctx.strokeStyle = `rgba(${r0},${g0},${b0},0.5)`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(sweep) * R * 0.9, cy + Math.sin(sweep) * R * 0.9);
      ctx.stroke();

      b.forEach((o) => {
        const x = cx + Math.cos(o.a) * o.r * R;
        const y = cy + Math.sin(o.a) * o.r * R;
        const delta = (((sweep - o.a) % TAU) + TAU) % TAU;
        const locked = delta < 0.6 || state === "breach";
        const s = 8 + Math.sin(t * 4 + o.ph) * 2;
        ctx.fillStyle = `rgba(${r0},${g0},${b0},0.9)`;
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, TAU);
        ctx.fill();
        if (locked) {
          ctx.strokeStyle = `rgba(${r0},${g0},${b0},0.9)`;
          ctx.lineWidth = 1.5;
          const k = 4;
          [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy]) => {
            ctx.beginPath();
            ctx.moveTo(x + sx * s, y + sy * s - sy * k);
            ctx.lineTo(x + sx * s, y + sy * s);
            ctx.lineTo(x + sx * s - sx * k, y + sy * s);
            ctx.stroke();
          });
        }
      });
    },
    [visualState, intensity, count],
  );

  const items = visibleList.length
    ? visibleList.slice(0, 6).map((ip) => `${ip} BLOCKED`)
    : connections
        .filter((c) => c.state === "BLOCKED")
        .slice(0, 6)
        .map((c) => `${c.remote || c.local || "?"} BLOCKED`);

  const allSelected = visibleList.length > 0 && selected.size === visibleList.length;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <canvas ref={ref} style={CANVAS_STYLE} aria-label="Target Lock Perimeter" />

      {/* IP list overlay — top-right quadrant */}
      {visibleList.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            width: 220,
            maxHeight: "55%",
            overflowY: "auto",
            background: "rgba(3,3,7,0.82)",
            border: "1px solid rgba(255,61,129,0.25)",
            borderRadius: 5,
            padding: "8px 10px",
            fontFamily: "ui-monospace,'SF Mono',Menlo,monospace",
            pointerEvents: "auto",
            zIndex: 10,
          }}
        >
          <div style={{ fontSize: 9, letterSpacing: "0.14em", color: "rgba(234,247,255,0.4)", marginBottom: 6, display: "flex", justifyContent: "space-between" }}>
            <span>BLOCKED IPS</span>
            <button
              style={{ ...BTN, fontSize: 9, padding: "1px 6px", borderColor: "rgba(255,61,129,0.4)", color: "#ff3d81" }}
              onClick={toggleAll}
            >
              {allSelected ? "DESELECT ALL" : "SELECT ALL"}
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {visibleList.map((ip) => (
              <div
                key={ip}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "3px 5px",
                  borderRadius: 3,
                  background: selected.has(ip) ? "rgba(255,61,129,0.12)" : "transparent",
                  border: selected.has(ip) ? "1px solid rgba(255,61,129,0.3)" : "1px solid transparent",
                  cursor: "pointer",
                }}
                onClick={() => toggleSelect(ip)}
              >
                <input
                  type="checkbox"
                  checked={selected.has(ip)}
                  onChange={() => toggleSelect(ip)}
                  onClick={(e) => e.stopPropagation()}
                  style={{ accentColor: "#ff3d81", cursor: "pointer" }}
                />
                <span style={{ fontSize: 10, color: "#ff3d81", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {ip}
                </span>
                <button
                  style={{ ...BTN, fontSize: 9, padding: "1px 6px", borderColor: "rgba(99,245,255,0.35)", flexShrink: 0 }}
                  onClick={(e) => { e.stopPropagation(); setPopover(ip); }}
                  title={`Unblock ${ip}`}
                >
                  ⊘
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Per-IP unblock popover */}
      {popover && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%,-50%)",
            background: "rgba(3,3,7,0.95)",
            border: "1px solid rgba(255,61,129,0.5)",
            borderRadius: 6,
            padding: "14px 18px",
            fontFamily: "ui-monospace,'SF Mono',Menlo,monospace",
            pointerEvents: "auto",
            zIndex: 30,
            minWidth: 220,
          }}
        >
          <div style={{ fontSize: 9, letterSpacing: "0.14em", color: "rgba(234,247,255,0.4)", marginBottom: 8 }}>UNBLOCK IP</div>
          <div style={{ fontSize: 12, color: "#ff3d81", marginBottom: 12 }}>{popover}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              style={{ ...BTN, borderColor: "rgba(99,245,255,0.4)", color: "#63f5ff", opacity: busyIp ? 0.5 : 1 }}
              onClick={() => unblockIp(popover)}
              disabled={!!busyIp}
            >
              {busyIp === popover ? "..." : "UNBLOCK"}
            </button>
            <button
              style={{ ...BTN, borderColor: "rgba(234,247,255,0.2)", color: "rgba(234,247,255,0.5)" }}
              onClick={() => setPopover(null)}
            >
              CANCEL
            </button>
          </div>
        </div>
      )}

      {/* Bulk actions dock */}
      {visibleList.length > 0 && (
        <div
          style={{
            position: "absolute",
            bottom: 70,
            left: 10,
            display: "flex",
            gap: 8,
            alignItems: "center",
            pointerEvents: "auto",
            zIndex: 10,
            fontFamily: "ui-monospace,'SF Mono',Menlo,monospace",
          }}
        >
          {selected.size > 0 && (
            <span style={{ fontSize: 10, color: "rgba(234,247,255,0.45)" }}>
              {selected.size} selected
            </span>
          )}
          <button
            style={{
              ...BTN,
              borderColor: selected.size > 0 ? "rgba(99,245,255,0.5)" : "rgba(99,245,255,0.15)",
              color: selected.size > 0 ? "#63f5ff" : "rgba(99,245,255,0.35)",
              opacity: busyBulk ? 0.5 : 1,
            }}
            onClick={unblockSelected}
            disabled={busyBulk || selected.size === 0}
          >
            {busyBulk ? "UNBLOCKING..." : "UNBLOCK SELECTED"}
          </button>
        </div>
      )}

      <HudDock
        state={visualState}
        metrics={[{ label: "Blocked threats", value: activeBlockedCount, accent: activeBlockedCount ? "#ff3d81" : undefined }]}
        items={items.length ? items : [activeBlockedCount ? "TARGETS LOCKED" : "PERIMETER CLEAR"]}
        emptyText="— no blocked sockets —"
      />
    </div>
  );
}

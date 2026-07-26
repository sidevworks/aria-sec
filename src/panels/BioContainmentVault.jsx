// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

// ════════════════════════════════════════════════════════════════════════
// PANEL 13 · BIO CONTAINMENT VAULT            maps to panel id "quarantine"
// Agent 13 · Bio-Digital Cyber Synthesizer
// ────────────────────────────────────────────────────────────────────────
// One bioluminescent cell per REAL quarantined file inside a hex containment
// field. Cell count + agitation scale with the quarantine load. HUD shows the
// file count + a quarantined-file ticker.
// Agent 14 · added RELEASE / DELETE per-file actions + bulk select controls.
// ════════════════════════════════════════════════════════════════════════
import { useRef, useState } from "react";
import { CANVAS_STYLE, TAU, useCanvasAnimation } from "./useCanvasAnimation.js";
import { postureFromFiles } from "./panelData.js";
import { HudDock } from "./HudOverlay.jsx";

const ARIA_API_BASE = (import.meta.env.VITE_ARIA_API_BASE || "").replace(/\/$/, "");

const TINT = { clean: [80, 255, 180], elevated: [255, 200, 87], breach: [255, 61, 129] };

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

const BTN_RELEASE = { ...BTN, border: "1px solid rgba(99,245,255,0.4)", color: "#63f5ff" };
const BTN_DELETE  = { ...BTN, border: "1px solid rgba(255,61,129,0.4)", color: "#ff3d81" };

function fileKey(file, index) {
  return file.id || file.sha256 || file.path || file.name || `file-${index}`;
}

function FileCard({ file, itemKey, onRemove }) {
  const [busyAction, setBusyAction] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const shortHash = file.sha256 ? file.sha256.slice(0, 8) : null;
  const label = (file.name || file.path || String(file.id || "artifact")).slice(0, 40);

  async function doRelease() {
    if (busyAction) return;
    setBusyAction("release");
    try {
      const res = await fetch(`${ARIA_API_BASE}/api/quarantine/${file.id}/release`, { method: "POST" });
      if (res.ok) onRemove(itemKey, "released");
    } catch (_) {
      // allow retry
    } finally {
      setBusyAction(null);
    }
  }

  async function doDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    if (busyAction) return;
    setBusyAction("delete");
    try {
      const res = await fetch(`${ARIA_API_BASE}/api/quarantine/${file.id}/delete`, { method: "POST" });
      if (res.ok) onRemove(itemKey, "deleted");
    } catch (_) {
      // allow retry
    } finally {
      setBusyAction(null);
      setConfirmDelete(false);
    }
  }

  return (
    <div
      style={{
        background: "rgba(3,3,7,0.80)",
        border: "1px solid rgba(80,255,180,0.2)",
        borderLeft: "3px solid rgba(80,255,180,0.6)",
        borderRadius: 4,
        padding: "6px 10px",
        fontFamily: "ui-monospace,'SF Mono',Menlo,monospace",
      }}
    >
      <div style={{ fontSize: 11, color: "rgba(234,247,255,0.9)", lineHeight: 1.3, marginBottom: 2 }}>{label}</div>
      <div style={{ display: "flex", gap: 10, fontSize: 9, color: "rgba(234,247,255,0.4)", flexWrap: "wrap", marginBottom: 5 }}>
        {shortHash && <span>SHA256: {shortHash}…</span>}
        {file.scan_result && <span style={{ color: "#ffc857" }}>{file.scan_result}</span>}
        {file.size && <span>{file.size}</span>}
      </div>
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
        <button
          style={{ ...BTN_RELEASE, opacity: busyAction === "release" ? 0.5 : 1 }}
          onClick={doRelease}
          disabled={!!busyAction}
        >
          {busyAction === "release" ? "..." : "RELEASE"}
        </button>
        <button
          style={{
            ...BTN_DELETE,
            opacity: busyAction === "delete" ? 0.5 : 1,
            background: confirmDelete ? "rgba(255,61,129,0.2)" : BTN_DELETE.background,
          }}
          onClick={doDelete}
          disabled={!!busyAction}
          title={confirmDelete ? "Press again to confirm permanent deletion" : "Delete this file permanently"}
        >
          {busyAction === "delete" ? "..." : confirmDelete ? "CONFIRM DELETE" : "DELETE"}
        </button>
        {confirmDelete && !busyAction && (
          <button
            style={{ ...BTN, border: "1px solid rgba(234,247,255,0.2)", color: "rgba(234,247,255,0.45)", fontSize: 10 }}
            onClick={() => setConfirmDelete(false)}
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

export default function BioContainmentVault({ files = [] }) {
  const { state, intensity, total } = postureFromFiles(files);
  const bio = useRef(null);
  const CELLS = Math.max(3, Math.min(28, files.length || 6));

  const [removed, setRemoved] = useState({});   // id → "released"|"deleted"
  const [selected, setSelected] = useState(new Set());
  const [busyBulk, setBusyBulk] = useState(null);

  function handleRemove(id) {
    setRemoved((prev) => ({ ...prev, [id]: true }));
    setSelected((prev) => { const n = new Set(prev); n.delete(id); return n; });
  }

  const visibleFiles = files
    .map((file, index) => ({ file, key: fileKey(file, index) }))
    .filter((item) => !removed[item.key]);

  function toggleSelect(id) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function toggleAll() {
    const ids = visibleFiles.map((item) => item.key);
    if (selected.size === ids.length) setSelected(new Set());
    else setSelected(new Set(ids));
  }

  async function bulkAction(action) {
    if (busyBulk || selected.size === 0) return;
    setBusyBulk(action);
    const ids = [...selected].filter((id) => !removed[id]);
    try {
      const res = await fetch(`${ARIA_API_BASE}/api/quarantine/bulk-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ids }),
      });
      if (res.ok) {
        setRemoved((prev) => {
          const n = { ...prev };
          ids.forEach((id) => (n[id] = true));
          return n;
        });
        setSelected(new Set());
      }
    } catch (_) {
      // allow retry
    } finally {
      setBusyBulk(null);
    }
  }

  const ref = useCanvasAnimation(
    (ctx, w, h, t) => {
      if (bio.current == null || bio.current.n !== CELLS) {
        bio.current = {
          n: CELLS,
          cells: Array.from({ length: CELLS }, () => ({
            x: 0.2 + Math.random() * 0.6,
            y: 0.2 + Math.random() * 0.6,
            r: 0.03 + Math.random() * 0.04,
            ph: Math.random() * TAU,
            vx: Math.random() - 0.5,
            vy: Math.random() - 0.5,
          })),
        };
      }
      const { cells } = bio.current;
      const [r0, g0, b0] = TINT[state] || TINT.clean;
      const agit = 0.2 + intensity * 1.5;
      const D = Math.min(w, h);
      const cx = w / 2;
      const cy = h / 2;
      const HR = D * 0.42;

      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(3,3,7,0.25)";
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";

      const flick = state === "breach" ? Math.abs(Math.sin(t * 9)) : Math.abs(Math.sin(t * 3));
      ctx.strokeStyle = `rgba(${r0},${g0},${b0},${0.18 + 0.18 * flick})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i <= 6; i++) {
        const a = (i / 6) * TAU + Math.PI / 6;
        const x = cx + Math.cos(a) * HR;
        const y = cy + Math.sin(a) * HR;
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.stroke();

      cells.forEach((c) => {
        c.x += c.vx * 0.0006 * agit;
        c.y += c.vy * 0.0006 * agit;
        if (c.x < 0.15 || c.x > 0.85) c.vx *= -1;
        if (c.y < 0.15 || c.y > 0.85) c.vy *= -1;
        const x = c.x * w;
        const y = c.y * h;
        const pulse = 0.5 + Math.sin(t * (1.5 + agit) + c.ph) * 0.5;
        const rr = c.r * D * (0.8 + pulse * 0.4);
        const g = ctx.createRadialGradient(x, y, 0, x, y, rr * 2.2);
        g.addColorStop(0, `rgba(${r0},${g0},${b0},${0.6 * pulse + 0.2})`);
        g.addColorStop(0.6, `rgba(${r0},${g0},${b0},0.08)`);
        g.addColorStop(1, "transparent");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, rr * 2.2, 0, TAU);
        ctx.fill();
        ctx.fillStyle = `rgba(255,255,255,${0.4 + pulse * 0.4})`;
        ctx.beginPath();
        ctx.arc(x, y, rr * 0.35, 0, TAU);
        ctx.fill();
      });
    },
    [state, intensity, CELLS],
  );

  const items = files
    .slice(0, 6)
    .map((f) => `${(f.name || f.path || "artifact").slice(0, 34)}${f.size ? ` · ${f.size}` : ""}`);

  const allSelected = visibleFiles.length > 0 && selected.size === visibleFiles.length;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", display: "flex" }}>
      {/* Left: file list content panel */}
      {visibleFiles.length > 0 && (
        <div
          style={{
            width: 250,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            gap: 6,
            padding: "10px 8px",
            overflowY: "auto",
            background: "rgba(3,3,7,0.72)",
            borderRight: "1px solid rgba(80,255,180,0.1)",
            fontFamily: "ui-monospace,'SF Mono',Menlo,monospace",
          }}
        >
          {/* select-all header */}
          <div style={{ display: "flex", alignItems: "center", gap: 7, paddingBottom: 2 }}>
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              style={{ accentColor: "#63f5ff", cursor: "pointer" }}
            />
            <span style={{ fontSize: 9, color: "rgba(234,247,255,0.35)", letterSpacing: "0.12em" }}>SELECT ALL</span>
          </div>

          {/* file cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minHeight: 0, overflowY: "auto" }}>
            {visibleFiles.map(({ file: f, key }) => {
              return (
              <div key={key} style={{ display: "flex", alignItems: "flex-start", gap: 5 }}>
                <input
                  type="checkbox"
                  checked={selected.has(key)}
                  onChange={() => toggleSelect(key)}
                  style={{ marginTop: 8, accentColor: "#63f5ff", cursor: "pointer", flexShrink: 0 }}
                />
                <div style={{ flex: 1 }}>
                  <FileCard file={f} itemKey={key} onRemove={handleRemove} />
                </div>
              </div>
              );
            })}
          </div>

          {/* bulk action row */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", paddingTop: 4, borderTop: "1px solid rgba(80,255,180,0.08)" }}>
            {selected.size > 0 && (
              <span style={{ width: "100%", fontSize: 10, color: "rgba(234,247,255,0.45)" }}>{selected.size} selected</span>
            )}
            <button
              style={{
                ...BTN_RELEASE,
                opacity: busyBulk === "release" ? 0.5 : selected.size === 0 ? 0.3 : 1,
                color: selected.size > 0 ? "#63f5ff" : "rgba(99,245,255,0.35)",
                border: selected.size > 0 ? "1px solid rgba(99,245,255,0.4)" : "1px solid rgba(99,245,255,0.15)",
              }}
              onClick={() => bulkAction("release")}
              disabled={!selected.size || !!busyBulk}
            >
              {busyBulk === "release" ? "..." : "BULK RELEASE"}
            </button>
            <button
              style={{
                ...BTN_DELETE,
                opacity: busyBulk === "delete" ? 0.5 : selected.size === 0 ? 0.3 : 1,
                color: selected.size > 0 ? "#ff3d81" : "rgba(255,61,129,0.35)",
                border: selected.size > 0 ? "1px solid rgba(255,61,129,0.4)" : "1px solid rgba(255,61,129,0.15)",
              }}
              onClick={() => bulkAction("delete")}
              disabled={!selected.size || !!busyBulk}
            >
              {busyBulk === "delete" ? "..." : "BULK DELETE"}
            </button>
          </div>
        </div>
      )}

      {/* Right: canvas visualization */}
      <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
        <canvas ref={ref} style={CANVAS_STYLE} aria-label="Bio Containment Vault" />
        <HudDock
          state={state}
          metrics={[{ label: "Quarantined", value: total, accent: total ? "#ffc857" : undefined }]}
          items={items.length ? items : [total ? "CONTAINED" : "VAULT EMPTY"]}
          emptyText="— vault empty —"
        />
      </div>
    </div>
  );
}

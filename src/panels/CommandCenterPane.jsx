// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCanvasAnimation } from "./useCanvasAnimation.js";
import PanelNarrateControls from "./PanelNarrateControls.jsx";
import EvidenceDrawer from "./shared/EvidenceDrawer.jsx";
import { DEMO_BUILD } from "../ariaBuildFlags.js";

// ─── Design tokens — Black / Blue / White only ───────────────────────────────
const C = {
  accent:  "#0ea5e9",
  aRgb:    "14,165,233",
  cyan:    "#0ea5e9",
  blue:    "#3b82f6",
  purple:  "#a855f7",
  green:   "#22c55e",
  amber:   "#f59e0b",
  teal:    "#14b8a6",
  red:     "#ef4444",
  text:    "rgba(255,255,255,0.92)",
  sub:     "rgba(255,255,255,0.55)",
  muted:   "rgba(255,255,255,0.35)",
  faint:   "rgba(255,255,255,0.08)",
  card:    "rgba(12,12,12,0.98)",
  bg:      "#000000",
};

const SEV = {
  critical: "#ff3d81",
  high:     "#ff8c42",
  medium:   "#ffc857",
  low:      "#63f5ff",
  info:     "#007acc",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const hex2rgb = (hex) => {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `${r},${g},${b}`;
};
const rgba = (hex, a) => `rgba(${hex2rgb(hex)},${a})`;
const now12 = () => new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"});
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const getApiBase = () => {
  const configured = (import.meta.env.VITE_ARIA_API_BASE || "").replace(/\/$/, "");
  if (configured) return configured;
  if (typeof window !== "undefined" && window.location?.protocol === "app:") return "http://127.0.0.1:5000";
  return "";
};
const apiUrl = (path) => `${getApiBase()}${path}`;
const makeDemoScanResult = ({ depth, targetType, folderPath, customIp }) => {
  const target =
    targetType === "folder" ? `Folder path ${folderPath.trim() || "~"}` :
    targetType === "network-discovery" ? "Network devices" :
    targetType === "custom-ip" ? (customIp.trim() || "custom target") :
    "Local host";

  const findingsByTarget = {
    "local-host": [
      { severity: "high", summary: "Demo host exposed an administrative service on port 22", source: "demo-fallback" },
      { severity: "medium", summary: "Unsigned local service detected during demo scan", source: "demo-fallback" },
    ],
    folder: [
      { severity: "medium", summary: "Writable automation files found in the scanned folder", source: "demo-fallback" },
      { severity: "low", summary: "Demo scan flagged a permissive config file pattern", source: "demo-fallback" },
    ],
    "network-discovery": [
      { severity: "high", summary: "Unmanaged device discovered on the local subnet", source: "demo-fallback" },
      { severity: "medium", summary: "Secondary host responded with an unexpected open service", source: "demo-fallback" },
    ],
    "custom-ip": [
      { severity: "high", summary: "Target exposes an administrative interface", source: "demo-fallback" },
      { severity: "medium", summary: "TLS certificate mismatch observed on the target host", source: "demo-fallback" },
    ],
  };

  const devices = targetType === "network-discovery"
    ? [
        { ip: "10.0.0.11", mac: "AA:BB:CC:10:00:11", role: "this-host", source: "demo" },
        { ip: "10.0.0.22", mac: "AA:BB:CC:10:00:22", role: "workstation", source: "demo" },
        { ip: "10.0.0.33", mac: "AA:BB:CC:10:00:33", role: "iot", source: "demo" },
      ]
    : targetType === "custom-ip"
      ? [{ ip: customIp.trim() || "192.168.1.1", mac: "local", role: "target", source: "demo" }]
      : [{ ip: "127.0.0.1", mac: "local", role: "this-host", source: "demo" }];

  const stats = {
    files_scanned: depth === "deep" ? 1248 : depth === "standard" ? 684 : 182,
    dirs_scanned: depth === "deep" ? 132 : depth === "standard" ? 61 : 18,
    devices_found: devices.length,
  };

  return {
    id: `demo-${targetType}-${Date.now()}`,
    target,
    depth,
    started_at: new Date().toISOString(),
    duration_ms: depth === "deep" ? 1880 : depth === "standard" ? 1260 : 740,
    findings: findingsByTarget[targetType] || findingsByTarget["local-host"],
    devices,
    stats,
    source: "demo-fallback",
  };
};
// Deterministic 0..1 hash from a string — used to place real findings on the
// radar WITHOUT Math.random (honest, stable position per finding).
const hash01 = (str = "") => {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
};
const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);

// Accumulate a REAL rolling history of a live value (sampled every `ms`).
// No fabrication: it repeats the latest real reading until the next poll.
function useLiveHistory(value, { len = 32, ms = 1500 } = {}) {
  const [hist, setHist] = useState(() => Array(len).fill(num(value)));
  const vRef = useRef(num(value));
  useEffect(() => { vRef.current = num(value); }, [value]);
  useEffect(() => {
    const id = setInterval(() => setHist((h) => [...h.slice(1), vRef.current]), ms);
    return () => clearInterval(id);
  }, [ms]);
  return hist;
}

// ─── Background HUD canvas ────────────────────────────────────────────────────
function useBgCanvas() {
  const draw = useCallback((ctx, w, h, t) => {
    ctx.clearRect(0, 0, w, h);
    // VS Code-style fine grid — muted dark lines
    ctx.strokeStyle = "rgba(0,122,204,0.06)";
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 52) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke(); }
    for (let y = 0; y < h; y += 52) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }
    // Slow scan sweep — VS Code blue
    const sy = (t * 28) % (h + 80) - 40;
    const g = ctx.createLinearGradient(0, sy, 0, sy + 80);
    g.addColorStop(0,"rgba(0,122,204,0)");
    g.addColorStop(0.5,"rgba(0,122,204,0.05)");
    g.addColorStop(1,"rgba(0,122,204,0)");
    ctx.fillStyle = g; ctx.fillRect(0, sy, w, 80);
    // Scanlines
    ctx.fillStyle = "rgba(0,0,0,0.06)";
    for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
    // Vignette
    const vg = ctx.createRadialGradient(w/2,h/2,h*0.22,w/2,h/2,h*0.95);
    vg.addColorStop(0,"rgba(0,0,0,0)");
    vg.addColorStop(1,"rgba(0,0,0,0.5)");
    ctx.fillStyle = vg; ctx.fillRect(0,0,w,h);
  }, []);
  return useCanvasAnimation(draw, []);
}

// ─── Radar scan canvas — HONEST: blips derived from REAL findings ─────────────
function RadarCanvas({ scanning, progress, findings }) {
  const draw = useCallback((ctx, w, h, t) => {
    const cx = w/2, cy = h/2, R = Math.min(w,h)*0.42;
    ctx.clearRect(0,0,w,h);

    // Rings
    [1, 0.67, 0.33].forEach((frac) => {
      const r = R * frac;
      ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2);
      ctx.strokeStyle = `rgba(0,122,204,0.20)`; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.30)"; ctx.font = "9px ui-monospace,monospace";
      ctx.fillText(frac === 1 ? "OUTER" : frac === 0.67 ? "MID" : "CORE", cx + r + 4, cy);
    });

    // Cross-hairs
    ctx.strokeStyle = "rgba(0,122,204,0.15)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx-R-10,cy); ctx.lineTo(cx+R+10,cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx,cy-R-10); ctx.lineTo(cx,cy+R+10); ctx.stroke();

    // Sweep arm while scanning
    if (scanning || (progress > 0 && progress < 100)) {
      const angle = (t * 1.8) % (Math.PI * 2);
      ctx.save();
      ctx.translate(cx,cy);
      const arc = ctx.createRadialGradient(0,0,0,0,0,R);
      arc.addColorStop(0,"rgba(0,122,204,0.0)");
      arc.addColorStop(1,"rgba(0,122,204,0.18)");
      ctx.fillStyle = arc;
      ctx.beginPath(); ctx.moveTo(0,0); ctx.arc(0,0,R,angle-1.2,angle); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(0,122,204,0.85)"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(Math.cos(angle)*R, Math.sin(angle)*R); ctx.stroke();
      ctx.restore();
    }

    // Blips — one per REAL finding, positioned by a stable hash of its identity.
    // Severity drives radius (critical = closer to core) so the picture is honest.
    const sevRadius = { critical: 0.30, high: 0.52, medium: 0.72, low: 0.9, info: 0.85 };
    (findings || []).forEach((f, i) => {
      const key = (f.summary || "") + (f.source || "") + i;
      const a = hash01(key) * Math.PI * 2;
      const sev = String(f.severity || "low").toLowerCase();
      const rr = R * (sevRadius[sev] ?? 0.8);
      const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
      const color = SEV[sev] || C.cyan;
      const pulse = 1 + 0.18 * Math.sin(t * 3 + i);
      const size = (sev === "critical" ? 5 : sev === "high" ? 4 : 3) * pulse;
      ctx.beginPath(); ctx.arc(cx+x, cy+y, size, 0, Math.PI*2);
      ctx.fillStyle = rgba(color, 0.75); ctx.fill();
      ctx.strokeStyle = rgba(color, 0.95); ctx.lineWidth = 1; ctx.stroke();
      const gl = ctx.createRadialGradient(cx+x,cy+y,0,cx+x,cy+y,size*3);
      gl.addColorStop(0, rgba(color, 0.35)); gl.addColorStop(1,"rgba(0,0,0,0)");
      ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(cx+x,cy+y,size*3,0,Math.PI*2); ctx.fill();
    });

    // Centre pip
    const cp = ctx.createRadialGradient(cx,cy,0,cx,cy,9);
    cp.addColorStop(0,"rgba(0,122,204,0.95)"); cp.addColorStop(1,"rgba(0,122,204,0)");
    ctx.fillStyle = cp; ctx.beginPath(); ctx.arc(cx,cy,9,0,Math.PI*2); ctx.fill();

    // Progress arc
    if (progress > 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, R+6, -Math.PI/2, -Math.PI/2 + (progress/100)*Math.PI*2);
      ctx.strokeStyle = rgba(C.blue, 0.7); ctx.lineWidth = 2; ctx.stroke();
    }
  }, [scanning, progress, findings]);
  return useCanvasAnimation(draw, [scanning, progress, findings]);
}

// ─── Mini sparkline canvas ────────────────────────────────────────────────────
function Sparkline({ values = [], color = C.cyan, w = 80, h = 28 }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const el = canvasRef.current; if (!el) return;
    const ctx = el.getContext("2d"); if (!ctx) return;
    ctx.clearRect(0,0,w,h);
    if (values.length < 2) return;
    const mn = Math.min(...values), mx = Math.max(...values), range = mx-mn || 1;
    const pts = values.map((v,i) => [i/(values.length-1)*w, h - ((v-mn)/range)*(h-4)-2]);
    const g = ctx.createLinearGradient(0,0,0,h);
    g.addColorStop(0, rgba(color, 0.3)); g.addColorStop(1, rgba(color, 0));
    ctx.beginPath(); ctx.moveTo(pts[0][0], h);
    pts.forEach(([x,y]) => ctx.lineTo(x,y));
    ctx.lineTo(pts[pts.length-1][0], h); ctx.closePath();
    ctx.fillStyle = g; ctx.fill();
    ctx.beginPath(); pts.forEach(([x,y],i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y));
    ctx.strokeStyle = rgba(color, 0.85); ctx.lineWidth = 1.5; ctx.stroke();
    // leading dot
    const [lx, ly] = pts[pts.length-1];
    ctx.beginPath(); ctx.arc(lx, ly, 1.8, 0, Math.PI*2); ctx.fillStyle = color; ctx.fill();
  }, [values, color, w, h]);
  return <canvas ref={canvasRef} width={w} height={h} style={{ display:"block" }} />;
}

// ─── Radial gauge (real value 0..max) ─────────────────────────────────────────
function Gauge({ value = 0, max = 100, color = C.cyan, label, size = 92 }) {
  const r = size/2 - 7;
  const frac = clamp(value / (max || 1), 0, 1);
  const circ = 2 * Math.PI * r;
  return (
    <div style={{ position:"relative", width:size, height:size }}>
      <svg width={size} height={size} style={{ transform:"rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(0,122,204,0.12)" strokeWidth={6} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={6}
          strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ*(1-frac)}
          style={{ filter:`drop-shadow(0 0 6px ${rgba(color,0.7)})`, transition:"stroke-dashoffset 0.8s ease" }} />
      </svg>
      <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
        <span style={{ fontSize:22, fontWeight:800, color, fontFamily:"ui-monospace,monospace", lineHeight:1 }}>{value}</span>
        {label && <span style={{ fontSize:7.5, color:C.muted, letterSpacing:"0.18em", marginTop:2, textTransform:"uppercase" }}>{label}</span>}
      </div>
    </div>
  );
}

// ─── Live metric tile ─────────────────────────────────────────────────────────
function MetricBlock({ label, value, sub, spark, alert }) {
  return (
    <div style={{
      position: "relative",
      background: "#1e1e1e",
      border: `1px solid ${alert ? rgba(C.red,0.45) : "rgba(0,122,204,0.20)"}`,
      borderLeft: alert ? `2px solid ${C.red}` : `2px solid rgba(0,122,204,0.45)`,
      borderRadius: 3, padding: "10px 14px",
      overflow: "hidden",
    }}>
      <div style={{ fontSize:9, letterSpacing:"0.2em", textTransform:"uppercase", color: C.muted, marginBottom:4 }}>{label}</div>
      <div style={{ fontSize:22, fontWeight:700, color: alert ? C.accent : C.text, fontFamily:"ui-monospace,monospace", lineHeight:1, letterSpacing:"-0.02em" }}>{value}</div>
      {sub && <div style={{ fontSize:10, color: C.sub, marginTop:3 }}>{sub}</div>}
      {spark && <div style={{ position:"absolute", bottom:4, right:6, opacity:0.45 }}><Sparkline values={spark} color={alert ? C.accent : "rgba(255,255,255,0.35)"} /></div>}
    </div>
  );
}

// ─── Section heading ──────────────────────────────────────────────────────────
function SectionHead({ label, right, color = C.cyan }) {
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
        <div style={{ width:2, height:12, background: color, borderRadius:1, boxShadow:`0 0 6px ${color}` }} />
        <span style={{ fontSize:9, letterSpacing:"0.22em", textTransform:"uppercase", color: rgba(color,0.8) }}>{label}</span>
      </div>
      {right != null && <span style={{ fontSize:9, color: C.muted, letterSpacing:"0.1em" }}>{right}</span>}
    </div>
  );
}

// ─── Glass card ───────────────────────────────────────────────────────────────
function GlassCard({ children, style, glow }) {
  return (
    <div style={{
      position: "relative",
      background: "rgba(14,14,14,0.97)",
      border: "1px solid rgba(0,122,204,0.22)",
      borderRadius: 4,
      boxShadow: glow
        ? "0 0 18px rgba(0,122,204,0.12), 0 4px 20px rgba(0,0,0,0.6)"
        : "0 2px 10px rgba(0,0,0,0.5)",
      overflow: "hidden",
      ...style,
    }}>
      <span style={{ position:"absolute", top:5, left:5, width:10, height:10, borderTop:"1px solid rgba(0,122,204,0.45)", borderLeft:"1px solid rgba(0,122,204,0.45)", pointerEvents:"none", zIndex:1 }} />
      <span style={{ position:"absolute", bottom:5, right:5, width:10, height:10, borderBottom:"1px solid rgba(0,122,204,0.28)", borderRight:"1px solid rgba(0,122,204,0.28)", pointerEvents:"none", zIndex:1 }} />
      {children}
    </div>
  );
}

// ─── Severity badge ───────────────────────────────────────────────────────────
function SevBadge({ sev }) {
  const isCrit = sev === "critical" || sev === "high";
  const c = isCrit ? C.accent : C.sub;
  return <span style={{
    fontSize:8, fontWeight:700, letterSpacing:"0.14em", textTransform:"uppercase",
    padding:"2px 6px", borderRadius:2,
    background: isCrit ? rgba(C.red,0.10) : "rgba(255,255,255,0.04)",
    color: c,
    border: `1px solid ${isCrit ? rgba(C.red,0.32) : "rgba(255,255,255,0.08)"}`,
  }}>{sev}</span>;
}

// ─── Status dot ───────────────────────────────────────────────────────────────
function Dot({ on, color = C.green }) {
  return <span style={{ width:6, height:6, borderRadius:"50%", flexShrink:0,
    background: on ? color : rgba(C.red,0.7), boxShadow: on ? `0 0 6px ${color}` : "none" }} />;
}

// ══════════════════════════════════════════════════════════════════════════════
// MONITOR TAB — every panel's live telemetry in one real-time HUD grid
// ══════════════════════════════════════════════════════════════════════════════

// Compact monitor card shell
function MonCard({ title, accent = C.cyan, right, children, span = 1, onOpen }) {
  return (
    <GlassCard accent={accent} style={{ padding:13, gridColumn:`span ${span}`, display:"flex", flexDirection:"column", minHeight:0 }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:9 }}>
        <div style={{ display:"flex", alignItems:"center", gap:7 }}>
          <div style={{ width:2, height:11, background:accent, borderRadius:1, boxShadow:`0 0 6px ${accent}` }} />
          <span style={{ fontSize:8.5, letterSpacing:"0.2em", textTransform:"uppercase", color:rgba(accent,0.85) }}>{title}</span>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          {right != null && <span style={{ fontSize:9, color:C.muted, fontFamily:"ui-monospace,monospace" }}>{right}</span>}
          {onOpen && (
            <button type="button" onClick={onOpen} title="Open panel"
              style={{ fontSize:8, letterSpacing:"0.1em", color:"rgba(255,255,255,0.50)", background:"transparent",
                border:"1px solid rgba(255,255,255,0.08)", borderRadius:5, padding:"2px 6px", cursor:"pointer" }}>OPEN ↗</button>
          )}
        </div>
      </div>
      <div style={{ flex:1, minHeight:0 }}>{children}</div>
    </GlassCard>
  );
}

// Big number + label
function Stat({ value, label, color = C.cyan, sub }) {
  return (
    <div>
      <div style={{ fontSize:26, fontWeight:800, color, fontFamily:"ui-monospace,monospace", lineHeight:1, letterSpacing:"-0.02em" }}>{value}</div>
      <div style={{ fontSize:8.5, color:C.muted, letterSpacing:"0.14em", textTransform:"uppercase", marginTop:4 }}>{label}</div>
      {sub && <div style={{ fontSize:10, color:C.sub, marginTop:2 }}>{sub}</div>}
    </div>
  );
}

// Horizontal bar list (vectors etc.)
function BarList({ items, color = C.cyan, max }) {
  const top = (items || []).slice(0, 5);
  const mx = max || Math.max(1, ...top.map((i) => num(i.value)));
  if (!top.length) return <Empty label="No data" />;
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
      {top.map((it, i) => {
        const v = num(it.value);
        const c = it.color || color;
        return (
          <div key={i}>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, marginBottom:2 }}>
              <span style={{ color:C.sub, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:"75%" }}>{it.label}</span>
              <span style={{ color:c, fontFamily:"ui-monospace,monospace" }}>{it.display ?? v}</span>
            </div>
            <div style={{ height:4, background:"rgba(0,122,204,0.08)", borderRadius:2, overflow:"hidden" }}>
              <div style={{ height:"100%", width:`${clamp(v/mx*100,2,100)}%`, borderRadius:2,
                background:`linear-gradient(90deg, ${rgba(C.blue,0.35)}, ${typeof c === 'string' && c.startsWith('rgba') ? c : c})`, boxShadow:"none" }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Scrolling line list
function LineList({ lines, color = C.cyan, render }) {
  if (!lines || lines.length === 0) return <Empty label="No events" />;
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:3, overflowY:"auto", maxHeight:"100%" }}>
      {lines.slice(0, 8).map((l, i) => render ? render(l, i) : (
        <div key={i} style={{ fontSize:10, color:C.text, lineHeight:1.4, padding:"3px 0",
          borderBottom:`1px solid rgba(0,122,204,0.07)`, display:"flex", gap:7 }}>
          <span style={{ color:rgba(color,0.4), flexShrink:0, fontFamily:"ui-monospace,monospace" }}>›</span>
          <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{typeof l === "string" ? l : (l.message || l.title || l.label || JSON.stringify(l))}</span>
        </div>
      ))}
    </div>
  );
}

function Empty({ label }) {
  return <div style={{ fontSize:10, color:C.muted, fontStyle:"italic", padding:"6px 0" }}>{label}</div>;
}

const tabSurface = (_accent = C.blue, mode = "grid") => ({
  position: "relative",
  border: `1px solid rgba(0,122,204,0.18)`,
  borderRadius: 4,
  padding: 10,
  minHeight: 0,
  background:
    mode === "scan"
      ? `radial-gradient(circle at 25% 28%, rgba(0,122,204,0.08), transparent 32%), linear-gradient(135deg, #0a0a0a, #0e0e0e)`
      : mode === "ops"
      ? `linear-gradient(90deg, rgba(0,122,204,0.07), transparent 38%), #0a0a0a`
      : mode === "archive"
      ? `linear-gradient(180deg, rgba(0,122,204,0.06), #0e0e0e), radial-gradient(circle at 80% 12%, rgba(0,122,204,0.08), transparent 30%)`
      : mode === "diagnostic"
      ? `linear-gradient(135deg, rgba(0,122,204,0.08), #0a0a0a), repeating-linear-gradient(90deg, rgba(0,122,204,0.04) 0 1px, transparent 1px 64px)`
      : `radial-gradient(circle at 15% 10%, rgba(0,122,204,0.10), transparent 32%), #0a0a0a`,
  boxShadow: `inset 0 1px 0 rgba(0,122,204,0.10), 0 8px 32px rgba(0,0,0,0.5)`,
});

const riskTier = (score = 0, threatLevel = "") => {
  const level = String(threatLevel || "").toUpperCase();
  if (level === "CRITICAL" || score >= 80) return { label: "Critical", color: C.red, sla: "15 min", posture: "Breach exposure" };
  if (level === "HIGH" || score >= 60) return { label: "High", color: C.amber, sla: "1 hr", posture: "Elevated exposure" };
  if (score >= 35) return { label: "Medium", color: C.cyan, sla: "4 hr", posture: "Watch posture" };
  return { label: "Low", color: C.green, sla: "24 hr", posture: "Controlled posture" };
};

const shortText = (value, fallback = "No detail available") => {
  if (value == null) return fallback;
  if (typeof value === "string") return value;
  return value.title || value.summary || value.message || value.reason || value.label || fallback;
};

const decisionItems = ({ approvals, reviewItems, liveIncidents, riskScore, memoryPercent, aiSpmSummary, sources }) => {
  const items = [];
  (approvals || []).slice(0, 4).forEach((item, index) => {
    items.push({
      id: item.id || `approval-${index}`,
      title: shortText(item.reason || item.action, "Approval required"),
      type: "Approval",
      severity: item.risk || "medium",
      confidence: 91,
      impact: "Governed response pending",
      cost: "Medium friction",
      action: String(item.action || "run_scan").replace(/_/g, " "),
      command: item.action ? String(item.action).replace(/_/g, " ") : "Run approved local scan",
      approvalId: item.id,
      approval: true,
    });
  });
  (liveIncidents || []).slice(0, 3).forEach((incident, index) => {
    items.push({
      id: incident.id || `incident-${index}`,
      title: shortText(incident.title || incident.summary, "Investigate active incident"),
      type: "Incident",
      severity: incident.severity || "high",
      confidence: String(incident.severity).toLowerCase() === "critical" ? 88 : 76,
      impact: "Active operational risk",
      cost: "Containment may disrupt endpoint",
      action: "Open investigation",
      command: "Generate executive incident report",
    });
  });
  (reviewItems || []).slice(0, 3).forEach((item, index) => {
    items.push({
      id: `review-${index}`,
      title: shortText(item, "Review telemetry threshold"),
      type: "Review",
      severity: riskScore >= 70 ? "high" : "medium",
      confidence: memoryPercent >= 82 ? 82 : 68,
      impact: memoryPercent >= 82 ? "System availability pressure" : "Analyst review required",
      cost: "Low operational cost",
      action: "Triage finding",
      command: "Inspect live review items",
    });
  });
  const aiFindings = num(aiSpmSummary?.finding_count ?? aiSpmSummary?.findings ?? 0);
  if (aiFindings > 0) {
    items.push({
      id: "ai-spm-decision",
      title: `${aiFindings} AI exposure finding${aiFindings === 1 ? "" : "s"} require review`,
      type: "AI-SPM",
      severity: aiSpmSummary?.critical_count ? "critical" : "high",
      confidence: 86,
      impact: "AI asset exposure path may exist",
      cost: "Repository and cloud checks",
      action: "Inspect AI exposure",
      command: "Inspect AI exposure findings",
    });
  }
  if ((sources || []).some((source) => source.status !== "live")) {
    items.push({
      id: "coverage-gap",
      title: "Telemetry coverage gap limits autonomous confidence",
      type: "Coverage",
      severity: "medium",
      confidence: 94,
      impact: "Reduced detection assurance",
      cost: "Connector configuration",
      action: "Restore source coverage",
      command: "Refresh live telemetry",
    });
  }
  return items.slice(0, 8);
};

function ConfidencePill({ value = 0, color = C.cyan }) {
  return (
    <span style={{
      display:"inline-flex", alignItems:"center", gap:5,
      padding:"3px 7px", borderRadius:999,
      border:`1px solid ${rgba(color,0.28)}`,
      background:rgba(color,0.08),
      color,
      fontSize:9,
      letterSpacing:"0.08em",
      fontFamily:"ui-monospace,monospace",
      whiteSpace:"nowrap",
    }}>
      {value}% confidence
    </span>
  );
}

function CommandPanel({ title, right, accent = C.cyan, children, style }) {
  return (
    <GlassCard style={{ padding:14, minHeight:0, ...style }}>
      <SectionHead label={title} color={accent} right={right} />
      {children}
    </GlassCard>
  );
}

function DecisionRow({ item, active, onSelect, onRun, onApprove, onDeny }) {
  const sev = String(item.severity || "medium").toLowerCase();
  const color = SEV[sev] || C.cyan;
  return (
    <button type="button" onClick={onSelect} style={{
      width:"100%", textAlign:"left", cursor:"pointer",
      padding:"10px 12px", borderRadius:9,
      border:`1px solid ${active ? rgba(color,0.55) : "rgba(0,122,204,0.18)"}`,
      borderLeft:`3px solid ${color}`,
      background: active ? `linear-gradient(90deg, ${rgba(color,0.16)}, rgba(5,12,28,0.96))` : "#131313",
      boxShadow: active ? `0 0 24px ${rgba(color,0.10)}` : "none",
      color:C.text,
      display:"flex", flexDirection:"column", gap:8,
    }}>
      <div style={{ display:"flex", justifyContent:"space-between", gap:10 }}>
        <div style={{ minWidth:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
            <SevBadge sev={sev} />
            <span style={{ fontSize:9, color:C.muted, letterSpacing:"0.12em", textTransform:"uppercase" }}>{item.type}</span>
          </div>
          <div style={{ fontSize:12, lineHeight:1.35, color:C.text }}>{item.title}</div>
        </div>
        <ConfidencePill value={item.confidence} color={color} />
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, fontSize:10, color:C.sub }}>
        <span>Impact: <strong style={{ color:C.text, fontWeight:600 }}>{item.impact}</strong></span>
        <span>Cost: <strong style={{ color:C.text, fontWeight:600 }}>{item.cost}</strong></span>
      </div>
      {active && (
        <div style={{ display:"flex", gap:7, flexWrap:"wrap" }}>
          <button type="button" onClick={(event) => { event.stopPropagation(); onRun?.(); }} style={{ ...actionBtn(C.cyan), padding:"6px 10px" }}>
            Execute Recommendation
          </button>
          {item.approval && (
            <>
              <button type="button" onClick={(event) => { event.stopPropagation(); onApprove?.(); }} style={{ ...actionBtn(C.green), padding:"6px 10px" }}>
                Approve
              </button>
              <button type="button" onClick={(event) => { event.stopPropagation(); onDeny?.(); }} style={{ ...actionBtn(C.red), padding:"6px 10px" }}>
                Deny
              </button>
            </>
          )}
        </div>
      )}
    </button>
  );
}

function AttackPath({ riskScore, aiSpmSummary, sources, selectedDecision }) {
  const aiFindings = num(aiSpmSummary?.finding_count ?? aiSpmSummary?.findings ?? 0);
  const cloudLive = (sources || []).some((source) => /aws|cloud|azure/i.test(source.id || source.name || "") && source.status === "live");
  const repoLive = (sources || []).some((source) => /github|repo/i.test(source.id || source.name || "") && source.status === "live");
  const stages = [
    { label:"Signal", value:selectedDecision?.type || "Telemetry", state:"observed" },
    { label:"Entity", value:selectedDecision?.title?.split(".")[0]?.slice(0,32) || "Local host", state:"linked" },
    { label:"Access Path", value: repoLive ? "GitHub / code asset" : "Endpoint surface", state: repoLive ? "available" : "partial" },
    { label:"Cloud Pivot", value: cloudLive ? "Cloud connector live" : "Connector gap", state: cloudLive ? "available" : "blocked" },
    { label:"Impact", value: riskScore >= 70 || aiFindings ? "Business risk" : "Monitor", state:riskScore >= 70 || aiFindings ? "critical" : "watch" },
  ];
  return (
    <div style={{ display:"grid", gridTemplateColumns:"repeat(5, minmax(0, 1fr))", gap:8 }}>
      {stages.map((stage, index) => {
        const color = stage.state === "critical" ? C.red : stage.state === "blocked" ? C.amber : stage.state === "watch" ? C.green : C.cyan;
        return (
          <div key={stage.label} style={{ position:"relative", minHeight:86, padding:"10px 9px", borderRadius:9, border:`1px solid ${rgba(color,0.26)}`, background:`linear-gradient(160deg, ${rgba(color,0.10)}, rgba(4,10,24,0.94))` }}>
            {index < stages.length - 1 && <div style={{ position:"absolute", top:"50%", right:-8, width:8, height:1, background:rgba(C.cyan,0.35) }} />}
            <div style={{ fontSize:8, color:rgba(color,0.85), letterSpacing:"0.16em", textTransform:"uppercase", marginBottom:8 }}>{stage.label}</div>
            <div style={{ fontSize:11, color:C.text, lineHeight:1.35, paddingBottom:18 }}>{stage.value}</div>
            <div style={{ position:"absolute", left:9, bottom:8, fontSize:8, color:C.muted, letterSpacing:"0.1em", textTransform:"uppercase" }}>{stage.state}</div>
          </div>
        );
      })}
    </div>
  );
}

function EvidenceChain({ selectedDecision, sources, logs, connections, processes }) {
  const evidence = [
    { source:"Decision signal", detail:selectedDecision?.title || "No active decision selected", confidence:selectedDecision?.confidence || 0 },
    { source:"Telemetry fabric", detail:`${(sources||[]).filter(s=>s.status==="live").length}/${(sources||[]).length} live sources`, confidence:(sources||[]).length ? Math.round(((sources||[]).filter(s=>s.status==="live").length / (sources||[]).length) * 100) : 0 },
    { source:"Network context", detail:`${(connections||[]).length} active socket records`, confidence:(connections||[]).length ? 78 : 35 },
    { source:"Host context", detail:`${(processes||[]).length} process records sampled`, confidence:(processes||[]).length ? 82 : 40 },
    { source:"Recent stream", detail:shortText((logs||[])[0], "No live event sampled yet"), confidence:(logs||[]).length ? 71 : 20 },
  ];
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
      {evidence.map((item, index) => {
        const color = item.confidence >= 80 ? C.green : item.confidence >= 55 ? C.cyan : C.amber;
        return (
          <div key={item.source} style={{ display:"grid", gridTemplateColumns:"20px 118px 1fr auto", gap:9, alignItems:"center", padding:"8px 9px", borderRadius:8, border:"1px solid rgba(0,122,204,0.12)", background:"#131313" }}>
            <span style={{ width:16, height:16, borderRadius:"50%", border:`1px solid ${rgba(color,0.55)}`, color, display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, fontFamily:"ui-monospace,monospace" }}>{index + 1}</span>
            <span style={{ fontSize:9, color:C.muted, letterSpacing:"0.12em", textTransform:"uppercase" }}>{item.source}</span>
            <span style={{ fontSize:10, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{item.detail}</span>
            <ConfidencePill value={item.confidence} color={color} />
          </div>
        );
      })}
    </div>
  );
}

function AutonomyMatrix({ executeAriaCommand, selectedDecision }) {
  const actions = [
    { mode:"Observe", label:"Refresh live telemetry", command:"Refresh live telemetry", risk:"None", allowed:true },
    { mode:"Recommend", label:"Generate investigation brief", command:"Generate a live intelligence briefing covering all active threats, incidents, and system status", risk:"None", allowed:true },
    { mode:"Approval", label:selectedDecision?.approval ? selectedDecision.action : "Run approved local scan", command:selectedDecision?.command || "Run a quick scan", risk:"Medium", allowed:true },
    { mode:"Contain", label:"Contain suspicious threats", command:"Contain suspicious threats", risk:"High", allowed:false },
  ];
  return (
    <div style={{ display:"grid", gridTemplateColumns:"repeat(2, minmax(0, 1fr))", gap:8 }}>
      {actions.map((action) => {
        const color = action.allowed ? (action.risk === "High" ? C.amber : C.cyan) : C.muted;
        return (
          <button key={action.mode} type="button" disabled={!action.allowed} onClick={() => executeAriaCommand?.(action.command)}
            style={{ cursor:action.allowed ? "pointer" : "not-allowed", opacity:action.allowed ? 1 : 0.55, minHeight:82, padding:"10px", borderRadius:9, border:`1px solid ${rgba(color,0.24)}`, background:`linear-gradient(160deg, ${rgba(color,0.10)}, rgba(4,10,24,0.94))`, textAlign:"left", color:C.text }}>
            <div style={{ fontSize:8, color, letterSpacing:"0.16em", textTransform:"uppercase", marginBottom:8 }}>{action.mode}</div>
            <div style={{ fontSize:11, lineHeight:1.35, marginBottom:8 }}>{action.label}</div>
            <div style={{ fontSize:8, color:C.muted, letterSpacing:"0.1em", textTransform:"uppercase" }}>{action.allowed ? `${action.risk} action cost` : "Guardrail locked"}</div>
          </button>
        );
      })}
    </div>
  );
}

function LoopStageRail({ loop }) {
  const timeline = loop?.timeline || [];
  if (!timeline.length) {
    return (
      <div style={{ padding:"10px 12px", borderRadius:8, border:"1px solid rgba(0,122,204,0.16)", background:"#111" }}>
        <div style={{ fontSize:8, color:C.muted, letterSpacing:"0.16em", textTransform:"uppercase", marginBottom:6 }}>Incident loop</div>
        <div style={{ fontSize:11, color:C.sub, lineHeight:1.45 }}>No ARIA decision loop exists yet. Run the orchestrator or connect a source to create the first evidence-backed decision.</div>
      </div>
    );
  }
  const colorFor = (status) => {
    if (status === "complete" || status === "ready" || status === "not_required") return C.green;
    if (status === "pending" || status === "partial") return C.amber;
    return C.red;
  };
  return (
    <div style={{ display:"grid", gridTemplateColumns:"repeat(4, minmax(0, 1fr))", gap:7 }}>
      {timeline.slice(0, 8).map((stage) => {
        const color = colorFor(stage.status);
        return (
          <div key={stage.stage} style={{
            minHeight:66, padding:"8px 9px", borderRadius:8,
            border:`1px solid ${rgba(color,0.28)}`,
            background:`linear-gradient(160deg, ${rgba(color,0.10)}, #111)`,
          }}>
            <div style={{ fontSize:8, color, letterSpacing:"0.13em", textTransform:"uppercase", marginBottom:6 }}>{String(stage.status || "unknown").replace(/_/g, " ")}</div>
            <div style={{ fontSize:10.5, color:C.text, lineHeight:1.25, marginBottom:5 }}>{stage.label}</div>
            <div style={{ fontSize:9, color:C.sub, lineHeight:1.3, overflow:"hidden", display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical" }}>{stage.detail || "Awaiting data"}</div>
          </div>
        );
      })}
    </div>
  );
}

function GuidedIncidentLoop({ loop, selectedDecision, onApprove, onDeny, executeAriaCommand, onOpenEvidence }) {
  const signal = loop?.signal?.observation || selectedDecision?.title || "No active signal selected";
  const action = loop?.recommended_action;
  const evidenceCount = loop?.counts?.evidence || 0;
  const approvalId = action?.approval_id || loop?.approval?.id || selectedDecision?.approvalId || null;
  const trust = loop?.trust;
  const honesty = loop?.honesty?.message || "Loop state is assembled from local cockpit data.";
  const actionLabel = action?.verb ? String(action.verb).replace(/_/g, " ") : selectedDecision?.action || "Stage safest action";

  return (
    <CommandPanel
      title="Guided Incident Loop"
      accent={loop?.status === "active" ? C.cyan : C.amber}
      right={loop?.status === "active" ? `${loop.completion_pct || 0}% complete` : "waiting for first decision"}
      style={{ flex:"0 0 auto" }}
    >
      <div style={{ display:"grid", gridTemplateColumns:"1.2fr 0.8fr", gap:12, marginBottom:12 }}>
        <div>
          <div style={{ fontSize:8, color:C.muted, letterSpacing:"0.16em", textTransform:"uppercase", marginBottom:5 }}>Signal to decision</div>
          <div style={{ fontSize:14, color:C.text, fontWeight:800, lineHeight:1.35, marginBottom:7 }}>{signal}</div>
          <div style={{ fontSize:11, color:C.sub, lineHeight:1.45 }}>{honesty}</div>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:7 }}>
          <MetricBlock label="Evidence" value={evidenceCount} sub="ledger records" />
          <MetricBlock label="Blast" value={loop?.blast_radius?.level || selectedDecision?.severity || "unknown"} sub="scope estimate" alert={["high","critical"].includes(loop?.blast_radius?.level)} />
          <MetricBlock label="Approval" value={approvalId ? "pending" : action?.approval_state || "clear"} sub={approvalId || "governed"} alert={Boolean(approvalId)} />
          <MetricBlock label="Trust" value={trust ? `${trust.trust_pct}%` : "n/a"} sub={trust?.capability || "unavailable"} />
        </div>
      </div>
      <LoopStageRail loop={loop} />
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginTop:12 }}>
        <button type="button" onClick={() => executeAriaCommand?.(actionLabel)} style={{ ...actionBtn(C.cyan), padding:"7px 11px" }}>
          Stage Safest Action
        </button>
        <button type="button" onClick={onOpenEvidence} style={{ ...actionBtn(C.blue), padding:"7px 11px" }}>
          Open Evidence
        </button>
        {approvalId && (
          <>
            <button type="button" onClick={() => onApprove?.(approvalId, "approve")} style={{ ...actionBtn(C.green), padding:"7px 11px" }}>
              Approve
            </button>
            <button type="button" onClick={() => onDeny?.(approvalId, "deny")} style={{ ...actionBtn(C.red), padding:"7px 11px" }}>
              Deny
            </button>
          </>
        )}
      </div>
    </CommandPanel>
  );
}

function evidenceFromOperationalLoop(loop) {
  if (!loop) return null;
  const firstEvidence = loop.evidence?.[0] || {};
  const action = loop.recommended_action || {};
  return {
    source: firstEvidence.source || action.target?.system || "ARIA decision ledger",
    timestamp: firstEvidence.timestamp || loop.signal?.created_at || loop.generated_at,
    affectedEntities: [
      ...(Array.isArray(firstEvidence.affected_entities) ? firstEvidence.affected_entities : []),
      loop.blast_radius?.affected_scope,
      action.target,
    ].filter(Boolean),
    relatedFindings: [
      ...(Array.isArray(loop.signal?.trigger?.ref_ids) ? loop.signal.trigger.ref_ids : []),
      ...(Array.isArray(loop.explanation?.memory_references) ? loop.explanation.memory_references : []),
    ],
    timeline: loop.timeline || [],
    blastRadius: loop.blast_radius?.level,
    confidence: loop.signal?.confidence,
    policyControls: firstEvidence.policy_controls || ["Human approval before governed action", loop.trust?.mode ? `Capability mode: ${loop.trust.mode}` : null].filter(Boolean),
    recommendedAction: action.verb ? `${String(action.verb).replace(/_/g, " ")}${action.target?.resource ? `: ${action.target.resource}` : ""}` : null,
    approvalState: action.approval_state || loop.approval?.status || "not linked",
    auditTrail: loop.audit_trail || firstEvidence.audit_trail || [],
  };
}

function ExecutiveRisk({ riskScore, threatLevel, decisions, sources, memoryPercent, aiSpmSummary }) {
  const tier = riskTier(riskScore, threatLevel);
  const live = (sources||[]).filter(s=>s.status==="live").length;
  const total = (sources||[]).length || 1;
  const coverage = Math.round((live / total) * 100);
  const aiExposure = num(aiSpmSummary?.finding_count ?? aiSpmSummary?.findings ?? 0);
  const metrics = [
    { label:"Business Exposure", value:tier.posture, color:tier.color },
    { label:"Decision SLA", value:tier.sla, color:tier.color },
    { label:"Coverage", value:`${coverage}%`, color:coverage >= 80 ? C.green : C.amber },
    { label:"AI Exposure", value:aiExposure, color:aiExposure ? C.amber : C.green },
    { label:"Availability", value:memoryPercent >= 82 ? "Pressure" : "Stable", color:memoryPercent >= 82 ? C.amber : C.green },
    { label:"Queue", value:`${decisions.length} decisions`, color:decisions.length ? C.cyan : C.green },
  ];
  return (
    <div style={{ display:"grid", gridTemplateColumns:"repeat(2, 1fr)", gap:8 }}>
      {metrics.map((metric) => (
        <div key={metric.label} style={{ padding:"9px 10px", borderRadius:8, border:`1px solid ${rgba(metric.color,0.22)}`, background:rgba(metric.color,0.07) }}>
          <div style={{ fontSize:8, color:C.muted, letterSpacing:"0.13em", textTransform:"uppercase", marginBottom:5 }}>{metric.label}</div>
          <div style={{ fontSize:14, color:metric.color, fontWeight:800, fontFamily:"ui-monospace,monospace" }}>{metric.value}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Hypothesis hook — polls /api/hypotheses every 8s ─────────────────────────
function useHypotheses() {
  const [hypotheses, setHypotheses] = useState([]);
  const [autoFeed, setAutoFeed]     = useState([]);

  useEffect(() => {
    let live = true;
    async function poll() {
      try {
        const r = await fetch(apiUrl("/api/hypotheses?limit=20"));
        if (!r.ok) return;
        const data = await r.json();
        const all = data.hypotheses || [];
        setHypotheses(all.filter(h => h.status === "proposed" || h.status === "approved" || h.status === "executing"));
        setAutoFeed(all.filter(h => ["verified","failed"].includes(h.status)).slice(0, 5));
      } catch { /* network not ready */ }
    }
    poll();
    const id = setInterval(() => { if (live) poll(); }, 8000);
    return () => { live = false; clearInterval(id); };
  }, []);

  const approve = async (id, _reason) => {
    await fetch(apiUrl(`/api/hypotheses/${id}/approve`), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ approver: "operator" }) });
  };
  const deny = async (id, reason) => {
    await fetch(apiUrl(`/api/hypotheses/${id}/deny`), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: reason || "dismissed", approver: "operator" }) });
  };

  return { hypotheses, autoFeed, approve, deny };
}

// ─── Deny reason picker ────────────────────────────────────────────────────────
const DENY_REASONS = ["false positive", "known/expected", "too risky", "other"];

function DenyModal({ onConfirm, onCancel }) {
  const [selected, setSelected] = useState("false positive");
  return (
    <div style={{ position:"fixed", inset:0, zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(0,0,0,0.82)" }}
         onClick={onCancel}>
      <div style={{ padding:24, borderRadius:14, background:"#1e1e1e", border:`1px solid rgba(0,122,204,0.5)`, minWidth:280, boxShadow:"0 8px 40px rgba(0,0,0,0.6)" }}
           onClick={e => e.stopPropagation()}>
        <div style={{ fontSize:11, color:"#007acc", letterSpacing:"0.14em", textTransform:"uppercase", marginBottom:14 }}>Deny Reason</div>
        <div style={{ display:"flex", flexDirection:"column", gap:7, marginBottom:16 }}>
          {DENY_REASONS.map(r => (
            <button key={r} type="button" onClick={() => setSelected(r)} style={{
              padding:"7px 12px", borderRadius:7, textAlign:"left", fontSize:12,
              border:`1px solid ${selected===r ? "rgba(0,122,204,0.5)" : "rgba(0,122,204,0.22)"}`,
              background: selected===r ? "rgba(0,122,204,0.5)" : "transparent",
              color: selected===r ? "#007acc" : "rgba(255,255,255,0.70)", cursor:"pointer",
            }}>{r}</button>
          ))}
        </div>
        <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
          <button type="button" onClick={onCancel} style={{ ...actionBtn(C.muted), fontSize:11, padding:"6px 14px" }}>Cancel</button>
          <button type="button" onClick={() => onConfirm(selected)} style={{ ...actionBtn(C.red), fontSize:11, padding:"6px 14px" }}>Deny</button>
        </div>
      </div>
    </div>
  );
}

// ─── Hypothesis card ───────────────────────────────────────────────────────────
function HypothesisCard({ hyp, onApprove, onDeny }) {
  const [expanded, setExpanded] = useState(false);
  const [inFlight, setInFlight] = useState(null);
  const [showDeny, setShowDeny] = useState(false);
  const sev = hyp.severity || "medium";
  const color = SEV[sev] || C.amber;
  const confPct = Math.round((hyp.confidence || 0) * 100);
  const statusColor = hyp.status === "verified" ? C.green : hyp.status === "failed" ? C.red : hyp.status === "executing" ? C.blue : color;

  const handleApprove = async () => {
    setInFlight("approve");
    try { await onApprove(hyp.id); } finally { setInFlight(null); }
  };
  const handleDeny = async (reason) => {
    setShowDeny(false);
    setInFlight("deny");
    try { await onDeny(hyp.id, reason); } finally { setInFlight(null); }
  };

  return (
    <>
      {showDeny && <DenyModal onConfirm={handleDeny} onCancel={() => setShowDeny(false)} />}
      <div style={{
        borderRadius:10, border:`1px solid ${rgba(color, 0.35)}`, borderLeft:`3px solid ${color}`,
        background:`linear-gradient(100deg, ${rgba(color,0.10)}, #111111)`,
        padding:"11px 13px", display:"flex", flexDirection:"column", gap:8,
      }}>
        {/* Header row */}
        <div style={{ display:"flex", alignItems:"flex-start", gap:8 }}>
          <SevBadge sev={sev} />
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:9, color:C.muted, letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:3 }}>
              {hyp.ruleName || "Correlation rule"} · {new Date(hyp.createdAt).toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" })}
            </div>
            <div style={{ fontSize:12, color:C.text, lineHeight:1.35 }}>{hyp.hypothesis}</div>
          </div>
          <ConfidencePill value={confPct} color={color} />
        </div>

        {/* Confidence bar */}
        <div style={{ height:3, borderRadius:999, background:"rgba(0,122,204,0.12)", overflow:"hidden" }}>
          <div style={{ height:"100%", width:`${confPct}%`, background:`linear-gradient(90deg, ${rgba(color,0.4)}, ${color})`, borderRadius:999, transition:"width 0.5s ease" }} />
        </div>

        {/* Evidence summary */}
        <div style={{ fontSize:10, color:C.sub }}>
          <span style={{ color:C.muted }}>Evidence: </span>
          <span style={{ color:C.text }}>{hyp.evidence?.length || 0} signal{hyp.evidence?.length !== 1 ? "s" : ""}</span>
          {hyp.mappedControls?.length > 0 && (
            <span style={{ marginLeft:10, color:C.muted }}>Controls: {hyp.mappedControls.join(", ")}</span>
          )}
        </div>

        {/* Proposed actions */}
        {hyp.proposedActions?.length > 0 && (
          <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
            {hyp.proposedActions.map(a => (
              <span key={a.actionId} style={{
                padding:"2px 7px", borderRadius:999, fontSize:9,
                border:`1px solid ${a.riskTier === "critical" ? rgba(C.red,0.4) : a.riskTier === "medium" ? rgba(C.amber,0.4) : rgba(C.cyan,0.3)}`,
                color: a.riskTier === "critical" ? C.red : a.riskTier === "medium" ? C.amber : C.cyan,
                background:"rgba(5,12,28,0.6)",
                textTransform:"uppercase", letterSpacing:"0.1em",
              }}>
                {a.actionId} <span style={{ opacity:0.6 }}>{a.riskTier}</span>
              </span>
            ))}
          </div>
        )}

        {/* Expandable evidence detail */}
        {expanded && hyp.evidence?.length > 0 && (
          <div style={{ borderTop:"1px solid rgba(0,122,204,0.12)", paddingTop:8, display:"flex", flexDirection:"column", gap:4 }}>
            {hyp.evidence.map((ev, i) => (
              <div key={i} style={{ fontSize:10, color:C.sub, display:"flex", gap:6 }}>
                <span style={{ color:C.muted, minWidth:90, flexShrink:0 }}>{ev.source}</span>
                <span>{ev.observation}</span>
              </div>
            ))}
          </div>
        )}

        {/* Status / Action row */}
        <div style={{ display:"flex", alignItems:"center", gap:7, flexWrap:"wrap" }}>
          <span style={{ fontSize:9, padding:"2px 7px", borderRadius:999, border:`1px solid ${rgba(statusColor,0.4)}`, color:statusColor, textTransform:"uppercase", letterSpacing:"0.1em" }}>
            {hyp.status}
          </span>
          <button type="button" onClick={() => setExpanded(e => !e)} style={{ ...actionBtn(C.muted), fontSize:9, padding:"3px 8px" }}>
            {expanded ? "Hide evidence" : "Show evidence"}
          </button>
          {hyp.status === "proposed" && (
            <>
              <button type="button" disabled={!!inFlight} onClick={handleApprove}
                style={{ ...actionBtn(C.green), fontSize:9, padding:"3px 10px", opacity: inFlight ? 0.5 : 1 }}>
                {inFlight === "approve" ? "Approving…" : "Approve"}
              </button>
              <button type="button" disabled={!!inFlight} onClick={() => setShowDeny(true)}
                style={{ ...actionBtn(C.red), fontSize:9, padding:"3px 10px", opacity: inFlight ? 0.5 : 1 }}>
                {inFlight === "deny" ? "Denying…" : "Deny"}
              </button>
            </>
          )}
          {hyp.status === "verified" && (
            <span style={{ fontSize:9, color:C.green }}>✓ Verified</span>
          )}
          {hyp.status === "failed" && (
            <span style={{ fontSize:9, color:C.red }}>⚠ Verification failed</span>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Auto-action feed (low-tier executed silently) ─────────────────────────────
function AutoActionFeed({ items }) {
  if (!items?.length) return null;
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:4, marginTop:4 }}>
      <div style={{ fontSize:8, color:C.muted, letterSpacing:"0.14em", textTransform:"uppercase", marginBottom:2 }}>ARIA auto-acted</div>
      {items.map(h => (
        <div key={h.id} style={{ fontSize:10, color:C.sub, padding:"4px 8px", borderRadius:6, background:"#111111", border:"1px solid rgba(0,122,204,0.12)", cursor:"pointer" }}>
          <span style={{ color: h.status === "verified" ? C.green : C.red, marginRight:5 }}>{h.status === "verified" ? "✓" : "⚠"}</span>
          {h.hypothesis?.slice(0, 80)}{h.hypothesis?.length > 80 ? "…" : ""}
        </div>
      ))}
    </div>
  );
}

function CommandFabricTab({
  riskScore, threatLevel, memoryPercent, sources, approvals, reviewItems, liveIncidents,
  aiSpmSummary, logs, connections, processes, executeAriaCommand, onResolveApproval, operationalLoop, onOpenEvidence,
}) {
  const { hypotheses, autoFeed, approve, deny } = useHypotheses();
  const decisions = useMemo(() => decisionItems({ approvals, reviewItems, liveIncidents, riskScore, memoryPercent, aiSpmSummary, sources }), [approvals, reviewItems, liveIncidents, riskScore, memoryPercent, aiSpmSummary, sources]);
  const [selectedId, setSelectedId] = useState(null);
  const selected = decisions.find((item) => item.id === selectedId) || decisions[0] || null;
  useEffect(() => {
    if (selectedId && decisions.some((item) => item.id === selectedId)) return;
    setSelectedId(decisions[0]?.id || null);
  }, [decisions, selectedId]);
  const tier = riskTier(riskScore, threatLevel);

  return (
    <div style={{ ...tabSurface(C.cyan, "command"), display:"grid", gridTemplateColumns:"370px 1fr 340px", gridTemplateRows:"1fr", gap:12, minHeight:"calc(100vh - 200px)", overflow:"visible" }}>
      <CommandPanel title="Decision Queue" accent={(hypotheses.length || decisions.length) ? C.cyan : C.green} right={`${hypotheses.length + decisions.length} active`} style={{ display:"flex", flexDirection:"column" }}>
        <div style={{ display:"flex", flexDirection:"column", gap:8, overflowY:"auto", minHeight:0, flex:1, paddingRight:3 }}>
          {/* ARIA reasoning hypotheses — real autonomous decisions */}
          {hypotheses.length > 0 && (
            <>
              <div style={{ fontSize:8, color:C.cyan, letterSpacing:"0.14em", textTransform:"uppercase", marginBottom:2 }}>
                ARIA hypotheses — {hypotheses.length} pending
              </div>
              {hypotheses.map(h => (
                <HypothesisCard key={h.id} hyp={h} onApprove={approve} onDeny={deny} />
              ))}
              {decisions.length > 0 && <div style={{ height:1, background:"rgba(0,122,204,0.12)", margin:"4px 0" }} />}
            </>
          )}
          {/* Legacy decision items */}
          {decisions.length === 0 && hypotheses.length === 0
            ? <Empty label="Decision queue clear" />
            : decisions.map((item) => (
              <DecisionRow key={item.id} item={item} active={selected?.id === item.id} onSelect={() => setSelectedId(item.id)}
                onRun={() => executeAriaCommand?.(item.command)}
                onApprove={() => item.approvalId && onResolveApproval?.(item.approvalId, "approve")}
                onDeny={() => item.approvalId && onResolveApproval?.(item.approvalId, "deny")}
              />
            ))
          }
          <AutoActionFeed items={autoFeed} />
        </div>
      </CommandPanel>

      <div style={{ display:"flex", flexDirection:"column", gap:12, minHeight:0, overflow:"hidden" }}>
        <GuidedIncidentLoop
          loop={operationalLoop}
          selectedDecision={selected}
          executeAriaCommand={executeAriaCommand}
          onApprove={onResolveApproval}
          onDeny={onResolveApproval}
          onOpenEvidence={onOpenEvidence}
        />

        <CommandPanel title="Incident Workbench" accent={tier.color} right={selected ? selected.type : "No active case"} style={{ flex:"0 0 auto" }}>
          <div style={{ display:"grid", gridTemplateColumns:"1.1fr 0.9fr", gap:14, alignItems:"stretch" }}>
            <div>
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                <SevBadge sev={String(selected?.severity || tier.label).toLowerCase()} />
                <ConfidencePill value={selected?.confidence || 0} color={tier.color} />
              </div>
              <div style={{ fontSize:19, color:C.text, fontWeight:800, lineHeight:1.25, marginBottom:8 }}>{selected?.title || "No active incident selected"}</div>
              <div style={{ fontSize:12, color:C.sub, lineHeight:1.55 }}>
                Aria has converted telemetry into an operator decision with evidence, blast-radius context, governance, and an auditable action path.
              </div>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
              <MetricBlock label="RISK" value={riskScore} sub={tier.posture} alert={riskScore >= 70} />
              <MetricBlock label="SLA" value={tier.sla} sub="Decision target" alert={riskScore >= 80} />
              <MetricBlock label="MEMORY" value={`${memoryPercent}%`} sub={memoryPercent >= 82 ? "Availability pressure" : "Stable"} alert={memoryPercent >= 82} />
              <MetricBlock label="SOURCES" value={`${(sources||[]).filter(s=>s.status==="live").length}/${(sources||[]).length}`} sub="Live coverage" />
            </div>
          </div>
        </CommandPanel>

        <CommandPanel title="Attack Path Simulation" accent={C.blue} right="modelled path" style={{ flex:"0 0 auto" }}>
          <AttackPath riskScore={riskScore} aiSpmSummary={aiSpmSummary} sources={sources} selectedDecision={selected} />
        </CommandPanel>

        <CommandPanel title="Evidence Chain" accent={C.cyan} right="explainable AI" style={{ flex:1, overflow:"hidden", display:"flex", flexDirection:"column" }}>
          <div style={{ overflowY:"auto", minHeight:0, flex:1 }}>
            <EvidenceChain selectedDecision={selected} sources={sources} logs={logs} connections={connections} processes={processes} />
          </div>
        </CommandPanel>
      </div>

      <div style={{ display:"flex", flexDirection:"column", gap:12, minHeight:0, overflowY:"auto" }}>
        <CommandPanel title="Autonomy Guardrails" accent={C.teal} right="controlled execution">
          <AutonomyMatrix executeAriaCommand={executeAriaCommand} selectedDecision={selected} />
        </CommandPanel>
        <CommandPanel title="Executive Risk" accent={C.blue} right="board-ready">
          <ExecutiveRisk riskScore={riskScore} threatLevel={threatLevel} decisions={decisions} sources={sources} memoryPercent={memoryPercent} aiSpmSummary={aiSpmSummary} />
        </CommandPanel>
        <CommandPanel title="Outcome Metrics" accent={C.green} right="risk reduction" style={{ flex:1 }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
            {[
              ["MTTT", decisions.length ? "< 1m" : "0m", "triage target"],
              ["Auto-ready", decisions.filter((d) => !d.approval).length, "low-friction actions"],
              ["Approval", decisions.filter((d) => d.approval).length, "human gated"],
              ["Coverage", `${(sources||[]).filter(s=>s.status==="live").length}/${(sources||[]).length}`, "source fabric"],
            ].map(([label, value, sub]) => (
              <div key={label} style={{ padding:"10px", borderRadius:8, background:"rgba(0,122,204,0.08)", border:"1px solid rgba(0,122,204,0.18)" }}>
                <div style={{ fontSize:8, color:C.muted, letterSpacing:"0.14em", textTransform:"uppercase" }}>{label}</div>
                <div style={{ fontSize:18, color:C.cyan, fontWeight:800, fontFamily:"ui-monospace,monospace", marginTop:4 }}>{value}</div>
                <div style={{ fontSize:9, color:C.sub, marginTop:2 }}>{sub}</div>
              </div>
            ))}
          </div>
        </CommandPanel>
      </div>
    </div>
  );
}

function MonitorTab({
  riskScore, threatLevel, vectors, incidents, liveIncidents, connections,
  memoryPercent, load, disks, processes, topCpuProcesses,
  logs, blockedIps, files, aiSpmSummary, sources, timeline, reviewItems,
  approvals, incidentCount24h, openDrawer, executeAriaCommand,
}) {
  const riskHist = useLiveHistory(riskScore);
  const memHist  = useLiveHistory(memoryPercent);

  const riskColor = riskScore >= 70 ? C.red : riskScore >= 40 ? C.amber : C.green;
  const memColor  = memoryPercent >= 82 ? C.red : memoryPercent >= 70 ? C.amber : C.green;
  const tc = threatLevel === "CRITICAL" ? C.red : threatLevel === "HIGH" ? C.amber : threatLevel === "MEDIUM" ? C.cyan : C.green;

  const incs = (incidents?.length ? incidents : liveIncidents) || [];
  const critInc = incs.filter((i) => String(i.severity).toLowerCase() === "critical").length;
  const liveSrc = (sources || []).filter((s) => s.status === "live").length;

  // Connection state breakdown (real)
  const connStates = useMemo(() => {
    const m = {};
    (connections || []).forEach((c) => { const s = c.state || "UNKNOWN"; m[s] = (m[s]||0)+1; });
    return Object.entries(m).map(([label, value]) => ({ label, value })).sort((a,b)=>b.value-a.value);
  }, [connections]);
  const blockedConns = (connections || []).filter((c) => c.state === "BLOCKED").length;

  const vectorItems = (vectors || []).map((v) => ({ label: v.label, value: num(v.score), display: num(v.score) }));
  const cpuItems = (topCpuProcesses?.length ? topCpuProcesses : processes || []).slice(0,5)
    .map((p) => ({ label: p.name || p.comm || p.command || "proc", value: num(p.cpu ?? p.cpu_percent), display: `${num(p.cpu ?? p.cpu_percent).toFixed(1)}%` }));
  const diskItems = (disks || []).slice(0,4)
    .map((d) => ({ label: d.mount || d.filesystem || d.name || "disk", value: num(d.use_percent ?? d.percent ?? d.used_percent), display: `${num(d.use_percent ?? d.percent ?? d.used_percent)}%`,
      color: num(d.use_percent ?? d.percent ?? d.used_percent) >= 85 ? C.red : C.blue }));

  const od  = (type, title, accent) => openDrawer?.({ type, title, accent });
  const run = (cmd) => executeAriaCommand?.(cmd);

  return (
    <div style={{ ...tabSurface(C.blue, "grid"), display:"flex", flexDirection:"column", gap:10, height:"100%", overflowY:"auto", paddingRight:10 }}>

      {/* ── Narrative action bar ── */}
      <div style={{
        display:"flex", alignItems:"center", justifyContent:"space-between",
        padding:"10px 14px", borderRadius:10, flexShrink:0,
        background:"linear-gradient(90deg,rgba(0,122,204,0.12),#0e0e0e)",
        border:"1px solid rgba(0,122,204,0.40)",
        boxShadow:"0 0 24px rgba(0,122,204,0.12)",
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:7, height:7, borderRadius:"50%", background:C.cyan, boxShadow:"0 0 8px rgba(0,122,204,0.95)", animation:"ccPulse 1.8s infinite" }} />
          <span style={{ fontSize:10, color:C.sub, letterSpacing:"0.12em" }}>
            ARIA INTELLIGENCE · <span style={{ color: riskScore>=70?C.red:riskScore>=40?C.amber:C.green, fontWeight:700 }}>{threatLevel}</span>
          </span>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          {[
            { label:"▶ BRIEF ME",      cmd:"Generate a live intelligence briefing covering all active threats, incidents, and system status", accent:C.cyan, glow:"99,245,255" },
            { label:"REPORT",          cmd:"Generate executive incident report", accent:"#ffffff", glow:"255,255,255" },
            { label:"CONTAIN THREATS", cmd:"Contain suspicious threats", accent:C.red, glow:"0,122,204" },
          ].map(({ label, cmd, accent, glow }) => (
            <button key={label} type="button" onClick={() => run(cmd)} style={{
              padding:"6px 14px", borderRadius:7, fontSize:9, fontWeight:700,
              letterSpacing:"0.14em", textTransform:"uppercase", cursor:"pointer",
              border:`1px solid rgba(${glow},0.55)`,
              background:`rgba(${glow},0.14)`,
              color:accent,
              boxShadow:`0 0 10px rgba(${glow},0.12)`,
              whiteSpace:"nowrap",
            }}>{label}</button>
          ))}
        </div>
      </div>

      {/* ── Main grid ── */}
      <div style={{
        display:"grid",
        gridTemplateColumns:"repeat(4, 1fr)",
        gridAutoRows:"minmax(150px, auto)",
        gap:11, flex:1,
      }}>
      {/* Threat posture — hero */}
      <MonCard title="Threat Posture" accent={tc} span={1} onOpen={() => od("threat-posture","THREAT POSTURE",tc)}
        right={threatLevel}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <Gauge value={num(riskScore)} max={100} color={riskColor} label="Risk" />
          <div style={{ flex:1 }}>
            <div style={{ fontSize:13, fontWeight:800, color:tc, letterSpacing:"0.08em" }}>{threatLevel || "UNKNOWN"}</div>
            <div style={{ fontSize:9, color:C.sub, marginTop:3 }}>{riskScore >= 70 ? "Breach posture" : riskScore >= 40 ? "Elevated" : "Nominal"}</div>
            <div style={{ marginTop:8 }}><Sparkline values={riskHist} color={riskColor} w={120} h={26} /></div>
          </div>
        </div>
      </MonCard>

      {/* Threat vectors */}
      <MonCard title="Threat Vectors" accent={C.amber} onOpen={() => od("threat-vectors","THREAT VECTORS",C.amber)} right={`${vectorItems.length}`}>
        <BarList items={vectorItems} color={C.amber} max={100} />
      </MonCard>

      {/* Incidents */}
      <MonCard title="Incident Feed" accent={critInc ? C.red : C.cyan} onOpen={() => od("incident-feed","INCIDENT FEED",C.red)}
        right={`${incs.length} active`}>
        <div style={{ display:"flex", gap:14, marginBottom:8 }}>
          <Stat value={incs.length} label="Open" color={incs.length ? C.amber : C.green} />
          <Stat value={critInc} label="Critical" color={critInc ? C.red : C.green} />
          <Stat value={num(incidentCount24h)} label="24h" color={C.blue} />
        </div>
        <LineList lines={incs} color={C.red} render={(inc, i) => {
          const sev = String(inc.severity||"medium").toLowerCase(); const c = SEV[sev]||C.cyan;
          return (
            <div key={i} style={{ display:"flex", gap:7, alignItems:"center", fontSize:10, padding:"2px 0" }}>
              <Dot on color={c} />
              <span style={{ color:c, fontFamily:"ui-monospace,monospace", flexShrink:0 }}>{inc.id}</span>
              <span style={{ color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{inc.title}</span>
            </div>
          );
        }} />
      </MonCard>

      {/* System health */}
      <MonCard title="System Health" accent={memColor} onOpen={() => od("system-health","SYSTEM HEALTH",memColor)} right={`load ${num(load).toFixed(2)}`}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <Gauge value={num(memoryPercent)} max={100} color={memColor} label="Mem %" />
          <div style={{ flex:1 }}>
            <div style={{ fontSize:10, color:C.sub }}>Load avg <span style={{ color:C.text, fontFamily:"ui-monospace,monospace" }}>{num(load).toFixed(2)}</span></div>
            <div style={{ fontSize:10, color:C.sub, marginTop:3 }}>Procs <span style={{ color:C.text, fontFamily:"ui-monospace,monospace" }}>{(processes||[]).length}</span></div>
            <div style={{ marginTop:8 }}><Sparkline values={memHist} color={memColor} w={120} h={26} /></div>
          </div>
        </div>
      </MonCard>

      {/* Network */}
      <MonCard title="Network Sockets" accent={C.blue} onOpen={() => od("network","NETWORK SOCKETS",C.blue)} right={`${(connections||[]).length} conns`}>
        <div style={{ display:"flex", gap:14, marginBottom:8 }}>
          <Stat value={(connections||[]).length} label="Total" color={C.blue} />
          <Stat value={blockedConns} label="Blocked" color={blockedConns ? C.red : C.green} />
        </div>
        <BarList items={connStates} color={C.blue} />
      </MonCard>

      {/* Top CPU processes */}
      <MonCard title="Top Processes" accent={C.purple} onOpen={() => od("system-health","SYSTEM HEALTH",C.purple)} right="cpu %">
        <BarList items={cpuItems} color={C.purple} max={100} />
      </MonCard>

      {/* Disks */}
      <MonCard title="Disk Health" accent={C.blue} onOpen={() => od("system-health","DISK HEALTH",C.blue)} right={`${(disks||[]).length} vol`}>
        <BarList items={diskItems} color={C.blue} max={100} />
      </MonCard>

      {/* Telemetry sources */}
      <MonCard title="Telemetry Sources" accent={liveSrc === (sources||[]).length ? C.green : C.amber}
        onOpen={() => od("sources","TELEMETRY SOURCES", liveSrc===(sources||[]).length?C.green:C.amber)}
        right={`${liveSrc}/${(sources||[]).length} live`}>
        <div style={{ display:"flex", flexDirection:"column", gap:4, overflowY:"auto", maxHeight:"100%" }}>
          {(sources||[]).length === 0 ? <Empty label="No sources" /> : (sources||[]).map((s,i) => {
            const live = s.status === "live";
            return (
              <div key={s.id||i} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", fontSize:10, padding:"2px 0" }}>
                <span style={{ display:"flex", alignItems:"center", gap:7, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                  <Dot on={live} color={C.green} />{s.id || s.name || "source"}
                </span>
                <span style={{ fontSize:8, color: live?C.green:rgba(C.red,0.7), textTransform:"uppercase", letterSpacing:"0.08em" }}>{s.status}</span>
              </div>
            );
          })}
        </div>
      </MonCard>

      {/* Live logs */}
      <MonCard title="Live Logs" accent={C.cyan} span={2} onOpen={() => od("logs","LIVE LOG STREAM",C.cyan)} right="● stream">
        <LineList lines={logs} color={C.cyan} render={(l,i) => {
          const msg = typeof l === "string" ? l : (l.message || l.summary || l.title || "");
          const ts = (l && l.time) || (l && l.ts) || null;
          return (
            <div key={i} style={{ display:"flex", gap:8, fontSize:10, padding:"2px 0", borderBottom:`1px solid rgba(0,122,204,0.07)` }}>
              <span style={{ color:rgba(C.cyan,0.4), flexShrink:0, fontFamily:"ui-monospace,monospace" }}>{ts ? new Date(ts).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"}) : "--:--:--"}</span>
              <span style={{ color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{msg}</span>
            </div>
          );
        }} />
      </MonCard>

      {/* Defense: blocked + quarantine + AI-SPM */}
      <MonCard title="Active Defense" accent={C.green} onOpen={() => od("defense","ACTIVE DEFENSE",C.green)}>
        <div style={{ display:"flex", gap:14, flexWrap:"wrap" }}>
          <Stat value={(blockedIps||[]).length} label="Blocked IPs" color={(blockedIps||[]).length?C.amber:C.green} />
          <Stat value={(files||[]).length} label="Quarantine" color={(files||[]).length?C.amber:C.green} />
        </div>
      </MonCard>

      {/* AI-SPM */}
      <MonCard title="AI-SPM Exposure" accent={C.green} onOpen={() => od("ai-spm","AI-SPM EXPOSURE","#007acc")}
        right={aiSpmSummary?.mode || ""}>
        <div style={{ display:"flex", gap:14, flexWrap:"wrap" }}>
          <Stat value={num(aiSpmSummary?.finding_count ?? aiSpmSummary?.findings ?? (aiSpmSummary?.findings_list||[]).length)} label="Findings" color={C.amber} />
          <Stat value={num(aiSpmSummary?.asset_count ?? aiSpmSummary?.assets ?? (aiSpmSummary?.asset_list||[]).length)} label="Assets" color={C.green} />
          <Stat value={num(aiSpmSummary?.secret_count ?? aiSpmSummary?.secrets)} label="Secrets" color={C.red} />
        </div>
      </MonCard>

      {/* Review queue / approvals */}
      <MonCard title="Review & Approvals" accent={C.amber} span={2}
        onOpen={() => od("review","REVIEW & APPROVALS",C.amber)}
        right={`${(reviewItems||[]).length} review · ${(approvals||[]).length} approve`}>
        <div style={{ display:"flex", gap:18, height:"100%" }}>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:8, color:C.muted, letterSpacing:"0.14em", marginBottom:5, textTransform:"uppercase" }}>Review items</div>
            <LineList lines={reviewItems} color={C.amber} />
          </div>
          <div style={{ flex:1, minWidth:0, borderLeft:`1px solid rgba(0,122,204,0.12)`, paddingLeft:16 }}>
            <div style={{ fontSize:8, color:C.muted, letterSpacing:"0.14em", marginBottom:5, textTransform:"uppercase" }}>Pending approvals</div>
            {(approvals||[]).length === 0 ? <Empty label="Queue clear" /> :
              <LineList lines={(approvals||[]).map((a)=>a.reason || a.action)} color={C.red} />}
          </div>
        </div>
      </MonCard>

      {/* Timeline */}
      <MonCard title="Threat Timeline" accent={C.purple} span={2} onOpen={() => od("timeline","THREAT TIMELINE",C.purple)} right={`${(timeline||[]).length} events`}>
        <LineList lines={timeline} color={C.purple} render={(e,i) => {
          const sev = String(e.severity||"info").toLowerCase(); const c = SEV[sev]||C.purple;
          const ts = e.time || e.ts || e.timestamp;
          return (
            <div key={i} style={{ display:"flex", gap:8, fontSize:10, padding:"2px 0", alignItems:"center" }}>
              <Dot on color={c} />
              <span style={{ color:"rgba(0,122,204,0.6)", flexShrink:0, fontFamily:"ui-monospace,monospace", fontSize:9 }}>{ts ? new Date(ts).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}) : ""}</span>
              <span style={{ color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{e.label || e.title || e.message || e.summary}</span>
            </div>
          );
        }} />
      </MonCard>
      </div>{/* end main grid */}
    </div>
  );
}

// ─── Scan target types ────────────────────────────────────────────────────────
const SCAN_TARGETS = [
  { id: "local-host",        label: "Local Host",      icon: "⬡", desc: "This machine — auth, services, ports",        endpoint: "stream" },
  { id: "folder",            label: "Folder / Path",   icon: "◫", desc: "Filesystem — secrets, permissions, scripts",  endpoint: "folder" },
  { id: "network-discovery", label: "Network Devices", icon: "◎", desc: "Discover every device on the subnet",          endpoint: "network-discovery" },
  { id: "custom-ip",         label: "Custom Target",   icon: "◈", desc: "Specific IP address or hostname",             endpoint: "stream" },
];

// ─── Scan History + Auto Scan sub-panel ──────────────────────────────────────
const AUTO_INTERVALS = [
  { label: "15 min",  ms: 15 * 60 * 1000 },
  { label: "1 hour",  ms: 60 * 60 * 1000 },
  { label: "6 hours", ms: 6 * 60 * 60 * 1000 },
  { label: "12 hours",ms: 12 * 60 * 60 * 1000 },
  { label: "Daily",   ms: 24 * 60 * 60 * 1000 },
  { label: "Weekly",  ms: 7 * 24 * 60 * 60 * 1000 },
];

function HistoryAutoPanel({ onViewScan, refreshTick }) {
  const [history, setHistory]       = useState([]);
  const [schedule, setSchedule]     = useState(null);
  const [autoOn, setAutoOn]         = useState(false);
  const [autoInterval, setAutoInterval] = useState(AUTO_INTERVALS[1].ms);
  const [autoTarget, setAutoTarget] = useState("local-host");
  const [autoDepth, setAutoDepth]   = useState("standard");
  const [autoFolder, setAutoFolder] = useState("~");
  const [saving, setSaving]         = useState(false);
  const [deleting, setDeleting]     = useState(null);
  const [viewMode, setViewMode]     = useState("history"); // "history" | "auto"

  const loadHistory = useCallback(async () => {
    try {
      const r = await fetch(apiUrl("/api/scan/history"));
      if (r.ok) { const d = await r.json(); setHistory(d.scans || []); }
    } catch (_) { /* history remains at the last known snapshot */ }
  }, []);

  const loadSchedule = useCallback(async () => {
    try {
      const r = await fetch(apiUrl("/api/scan/schedule"));
      if (r.ok) {
        const d = await r.json();
        setSchedule(d.schedule);
        if (d.schedule) {
          setAutoOn(d.schedule.enabled);
          setAutoInterval(d.schedule.interval_ms || AUTO_INTERVALS[1].ms);
          setAutoTarget(d.schedule.targetType || "local-host");
          setAutoDepth(d.schedule.depth || "standard");
          setAutoFolder(d.schedule.folderPath || "~");
        }
      }
    } catch (_) { /* schedule remains at the last known snapshot */ }
  }, []);

  useEffect(() => { loadHistory(); loadSchedule(); }, [loadHistory, loadSchedule, refreshTick]);

  const deleteScan = useCallback(async (id) => {
    setDeleting(id);
    try {
      await fetch(apiUrl(`/api/scan/record?id=${id}`), { method: "DELETE" });
      setHistory(h => h.filter(s => s.id !== id));
    } catch (_) { /* deletion is best-effort and can be retried */ }
    setDeleting(null);
  }, []);

  const saveSchedule = useCallback(async () => {
    setSaving(true);
    try {
      const r = await fetch(apiUrl("/api/scan/schedule"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: autoOn,
          interval_ms: autoInterval,
          targetType: autoTarget,
          depth: autoDepth,
          folderPath: autoTarget === "folder" ? autoFolder : null,
        }),
      });
      if (r.ok) { const d = await r.json(); setSchedule(d.schedule); }
    } catch (_) { /* save failure leaves the draft intact for retry */ }
    setSaving(false);
  }, [autoOn, autoInterval, autoTarget, autoDepth, autoFolder]);

  const disableSchedule = useCallback(async () => {
    try {
      await fetch(apiUrl("/api/scan/schedule"), { method: "DELETE" });
      setSchedule(null); setAutoOn(false);
    } catch (_) { /* disable failure leaves the current schedule visible */ }
  }, []);

  const dl = (url, fname) => { const a=document.createElement("a"); a.href=url; a.download=fname; a.click(); };

  return (
    <GlassCard accent={C.blue} style={{ padding:16, gridColumn:"1 / -1" }}>
      {/* Tab toggle */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
        <div style={{ display:"flex", gap:0, borderRadius:7, overflow:"hidden", border:`1px solid rgba(0,122,204,0.25)` }}>
          {[["history","◧ SCAN HISTORY"],["auto","⏱ AUTO SCAN"]].map(([id,label]) => (
            <button key={id} type="button" onClick={() => setViewMode(id)}
              style={{
                padding:"6px 16px", fontSize:9, letterSpacing:"0.14em", cursor:"pointer",
                background: viewMode===id ? rgba(C.blue,0.25) : "transparent",
                color: viewMode===id ? C.cyan : C.muted,
                border:"none", borderRight: id==="history" ? `1px solid rgba(0,122,204,0.25)` : "none",
                fontWeight: viewMode===id ? 700 : 400,
              }}>{label}</button>
          ))}
        </div>
        {viewMode === "history" && (
          <button type="button" onClick={loadHistory}
            style={{ ...actionBtn(C.cyan), fontSize:9, padding:"5px 10px" }}>↺ REFRESH</button>
        )}
        {viewMode === "auto" && schedule && (
          <div style={{ fontSize:9, color: schedule.enabled ? "rgba(0,200,120,0.9)" : C.muted, letterSpacing:"0.1em" }}>
            {schedule.enabled ? `● ACTIVE — every ${AUTO_INTERVALS.find(i=>i.ms===schedule.interval_ms)?.label||"custom"}` : "○ DISABLED"}
          </div>
        )}
      </div>

      {/* ── HISTORY VIEW ── */}
      {viewMode === "history" && (
        <div>
          {history.length === 0 ? (
            <div style={{ textAlign:"center", padding:"32px 0", color:C.muted, fontSize:11 }}>
              No scan history yet. Run a scan to see records here.
            </div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:6, maxHeight:320, overflowY:"auto" }}>
              {history.map(s => {
                const critC = s.critical_count || 0, highC = s.high_count || 0;
                const ts = s.started_at ? new Date(s.started_at) : null;
                const typeIcon = s.scan_type === "filesystem" ? "◫" : s.scan_type === "network-discovery" ? "◎" : "⬡";
                return (
                  <div key={s.id} style={{
                    display:"grid", gridTemplateColumns:"auto 1fr auto", gap:12, alignItems:"center",
                    padding:"10px 12px", borderRadius:8,
                    background: s.auto ? "rgba(0,122,204,0.04)" : "rgba(255,255,255,0.02)",
                    border:`1px solid ${critC > 0 ? "rgba(255,64,64,0.2)" : highC > 0 ? "rgba(255,200,87,0.15)" : "rgba(0,122,204,0.12)"}`,
                  }}>
                    {/* Left: type + meta */}
                    <div style={{ display:"flex", flexDirection:"column", gap:3, minWidth:120 }}>
                      <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                        <span style={{ fontSize:14, color:C.blue }}>{typeIcon}</span>
                        <span style={{ fontSize:9, color:C.muted, fontFamily:"ui-monospace,monospace", letterSpacing:"0.08em" }}>
                          {s.depth?.toUpperCase()}
                        </span>
                        {s.auto && <span style={{ fontSize:8, color:rgba(C.cyan,0.7), letterSpacing:"0.1em", background:rgba(C.blue,0.12), padding:"1px 5px", borderRadius:3 }}>AUTO</span>}
                      </div>
                      <div style={{ fontSize:9, color:C.sub, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:200 }}>
                        {s.target}
                      </div>
                      <div style={{ fontSize:9, color:C.muted, fontFamily:"ui-monospace,monospace" }}>
                        {ts ? ts.toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}) : "—"}
                        {" · "}{s.finding_count ?? 0} finding{(s.finding_count ?? 0) !== 1 ? "s" : ""}
                        {s.duration_ms ? ` · ${(s.duration_ms/1000).toFixed(1)}s` : ""}
                      </div>
                    </div>

                    {/* Middle: severity pills */}
                    <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                      {critC > 0 && <span style={{ fontSize:9, color:"#ff4040", background:"rgba(255,64,64,0.1)", padding:"2px 7px", borderRadius:4, border:"1px solid rgba(255,64,64,0.2)" }}>● {critC} CRIT</span>}
                      {highC > 0 && <span style={{ fontSize:9, color:"#ffc857", background:"rgba(255,200,87,0.08)", padding:"2px 7px", borderRadius:4, border:"1px solid rgba(255,200,87,0.2)" }}>● {highC} HIGH</span>}
                      {critC === 0 && highC === 0 && <span style={{ fontSize:9, color:C.muted }}>Clean</span>}
                    </div>

                    {/* Right: actions */}
                    <div style={{ display:"flex", gap:5 }}>
                      <button type="button" onClick={() => onViewScan?.(s.id)}
                        style={{ ...actionBtn(C.cyan), fontSize:8, padding:"4px 8px" }}>VIEW</button>
                      <button type="button" onClick={() => dl(apiUrl(`/api/scan/export?id=${s.id}`), `aria-scan-${s.id}.json`)}
                        style={{ ...actionBtn(C.blue), fontSize:8, padding:"4px 8px" }}>JSON</button>
                      <button type="button" onClick={() => dl(apiUrl(`/api/scan/audit-doc?id=${s.id}`), `aria-scan-${s.id}-audit.md`)}
                        style={{ ...actionBtn(C.purple), fontSize:8, padding:"4px 8px" }}>AUDIT</button>
                      <button type="button" onClick={() => deleteScan(s.id)} disabled={deleting === s.id}
                        style={{ ...actionBtn(C.red), fontSize:8, padding:"4px 8px", opacity: deleting===s.id ? 0.5 : 1 }}>
                        {deleting === s.id ? "…" : "DEL"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── AUTO SCAN VIEW ── */}
      {viewMode === "auto" && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
          {/* Config column */}
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {/* Enable toggle */}
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 12px", borderRadius:8, background:"rgba(0,122,204,0.05)", border:"1px solid rgba(0,122,204,0.15)" }}>
              <div>
                <div style={{ fontSize:11, color:C.text, fontWeight:700 }}>Auto Scan</div>
                <div style={{ fontSize:9, color:C.muted, marginTop:2 }}>Run scans automatically on a schedule</div>
              </div>
              <button type="button" onClick={() => setAutoOn(v => !v)}
                style={{
                  width:40, height:22, borderRadius:11, border:"none", cursor:"pointer",
                  background: autoOn ? rgba(C.cyan,0.8) : "rgba(255,255,255,0.12)",
                  position:"relative", transition:"background 0.2s",
                }}>
                <div style={{
                  position:"absolute", top:3, width:16, height:16, borderRadius:"50%", background:"#fff",
                  left: autoOn ? "calc(100% - 19px)" : 3, transition:"left 0.2s",
                }} />
              </button>
            </div>

            {/* Interval */}
            <div>
              <div style={{ fontSize:9, color:C.muted, letterSpacing:"0.14em", textTransform:"uppercase", marginBottom:6 }}>INTERVAL</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:4 }}>
                {AUTO_INTERVALS.map(iv => (
                  <button key={iv.ms} type="button" onClick={() => setAutoInterval(iv.ms)}
                    style={{
                      padding:"6px 0", borderRadius:6, fontSize:9, cursor:"pointer", letterSpacing:"0.06em",
                      border:`1px solid ${autoInterval===iv.ms ? rgba(C.blue,0.7) : rgba(C.blue,0.15)}`,
                      background: autoInterval===iv.ms ? rgba(C.blue,0.18) : "transparent",
                      color: autoInterval===iv.ms ? C.cyan : C.sub,
                    }}>{iv.label}</button>
                ))}
              </div>
            </div>

            {/* Target */}
            <div>
              <div style={{ fontSize:9, color:C.muted, letterSpacing:"0.14em", textTransform:"uppercase", marginBottom:6 }}>TARGET</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:4 }}>
                {SCAN_TARGETS.map(t => (
                  <button key={t.id} type="button" onClick={() => setAutoTarget(t.id)}
                    style={{
                      padding:"7px 8px", borderRadius:7, fontSize:9, cursor:"pointer", textAlign:"left",
                      border:`1px solid ${autoTarget===t.id ? rgba(C.blue,0.6) : rgba(C.blue,0.12)}`,
                      background: autoTarget===t.id ? rgba(C.blue,0.14) : "transparent",
                      color: autoTarget===t.id ? C.text : C.sub,
                    }}>
                    <span style={{ marginRight:5 }}>{t.icon}</span>{t.label}
                  </button>
                ))}
              </div>
              {autoTarget === "folder" && (
                <input value={autoFolder} onChange={e => setAutoFolder(e.target.value)}
                  placeholder="Path to scan (e.g. ~ or /Users/you)"
                  style={{ marginTop:6, width:"100%", boxSizing:"border-box", background:"#0a0a0a", color:C.text, border:`1px solid ${rgba(C.blue,0.25)}`, borderRadius:6, padding:"6px 10px", fontSize:10, fontFamily:"ui-monospace,monospace", outline:"none" }} />
              )}
            </div>

            {/* Depth */}
            <div>
              <div style={{ fontSize:9, color:C.muted, letterSpacing:"0.14em", textTransform:"uppercase", marginBottom:6 }}>DEPTH</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:4 }}>
                {["quick","standard","deep"].map(d => (
                  <button key={d} type="button" onClick={() => setAutoDepth(d)}
                    style={{
                      padding:"6px 0", borderRadius:6, fontSize:9, cursor:"pointer", textTransform:"uppercase",
                      border:`1px solid ${autoDepth===d ? rgba(C.blue,0.7) : rgba(C.blue,0.15)}`,
                      background: autoDepth===d ? rgba(C.blue,0.18) : "transparent",
                      color: autoDepth===d ? C.cyan : C.sub,
                    }}>{d}</button>
                ))}
              </div>
            </div>

            {/* Save / Disable buttons */}
            <div style={{ display:"flex", gap:8 }}>
              <button type="button" onClick={saveSchedule} disabled={saving}
                style={{
                  flex:1, padding:"10px 0", borderRadius:8, fontSize:10, fontWeight:700, letterSpacing:"0.14em",
                  cursor: saving ? "not-allowed" : "pointer",
                  background: autoOn ? rgba(C.cyan,0.18) : rgba(C.muted,0.1),
                  border:`1px solid ${autoOn ? rgba(C.cyan,0.45) : rgba(C.muted,0.2)}`,
                  color: autoOn ? C.cyan : C.muted,
                }}>
                {saving ? "SAVING…" : autoOn ? "SAVE SCHEDULE" : "SAVE (DISABLED)"}
              </button>
              {schedule && (
                <button type="button" onClick={disableSchedule}
                  style={{ padding:"10px 14px", borderRadius:8, fontSize:10, cursor:"pointer", border:"1px solid rgba(255,80,80,0.3)", background:"rgba(255,80,80,0.06)", color:"rgba(255,100,100,0.8)" }}>
                  CLEAR
                </button>
              )}
            </div>
          </div>

          {/* Status column */}
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            <div style={{ fontSize:9, color:C.muted, letterSpacing:"0.14em", textTransform:"uppercase", marginBottom:2 }}>SCHEDULE STATUS</div>
            {schedule ? (
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                <div style={{ padding:"12px 14px", borderRadius:8, background: schedule.enabled ? "rgba(0,200,120,0.05)" : "rgba(255,255,255,0.02)", border:`1px solid ${schedule.enabled ? "rgba(0,200,120,0.2)" : "rgba(255,255,255,0.08)"}` }}>
                  <div style={{ fontSize:11, fontWeight:700, color: schedule.enabled ? "rgba(0,200,120,0.9)" : C.muted, marginBottom:8 }}>
                    {schedule.enabled ? "● ACTIVE" : "○ DISABLED"}
                  </div>
                  {[
                    ["Interval",   AUTO_INTERVALS.find(i=>i.ms===schedule.interval_ms)?.label || `${(schedule.interval_ms/60000).toFixed(0)} min`],
                    ["Target",     SCAN_TARGETS.find(t=>t.id===schedule.targetType)?.label || schedule.targetType],
                    ["Depth",      schedule.depth],
                    ["Created",    schedule.created_at ? new Date(schedule.created_at).toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}) : "—"],
                    ["Last run",   schedule.last_run   ? new Date(schedule.last_run).toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}) : "Not yet"],
                    ["Next run",   schedule.next_run   ? new Date(schedule.next_run).toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}) : "—"],
                  ].map(([k,v]) => (
                    <div key={k} style={{ display:"flex", justifyContent:"space-between", fontSize:9, marginBottom:4 }}>
                      <span style={{ color:C.muted }}>{k}</span>
                      <span style={{ color:C.text, fontFamily:"ui-monospace,monospace", textTransform:"capitalize" }}>{v}</span>
                    </div>
                  ))}
                  {schedule.last_scan_id && (
                    <div style={{ marginTop:8 }}>
                      <button type="button"
                        onClick={() => { const a=document.createElement("a"); a.href=apiUrl(`/api/scan/audit-doc?id=${schedule.last_scan_id}`); a.download=`auto-scan-${schedule.last_scan_id}-audit.md`; a.click(); }}
                        style={{ ...actionBtn(C.muted), fontSize:8, padding:"4px 10px", width:"100%" }}>
                        ↓ LAST AUDIT REPORT
                      </button>
                    </div>
                  )}
                </div>

                <div style={{ padding:"10px 12px", borderRadius:8, background:"rgba(0,122,204,0.04)", border:"1px solid rgba(0,122,204,0.12)" }}>
                  <div style={{ fontSize:9, color:C.muted, marginBottom:6 }}>Auto-scan reports save to:</div>
                  <div style={{ fontSize:9, color:rgba(C.blue,0.8), fontFamily:"ui-monospace,monospace", wordBreak:"break-all" }}>
                    local persistence / scan-records
                  </div>
                  <div style={{ fontSize:9, color:C.muted, marginTop:4 }}>Each run creates a .json record + audit .md report.</div>
                </div>
              </div>
            ) : (
              <div style={{ padding:"24px 16px", textAlign:"center", color:C.muted, fontSize:10, borderRadius:8, border:"1px dashed rgba(0,122,204,0.15)" }}>
                No schedule configured.<br/>
                <span style={{ fontSize:9 }}>Enable auto scan and save to create one.</span>
              </div>
            )}
          </div>
        </div>
      )}
    </GlassCard>
  );
}

// ─── Live scan panel ──────────────────────────────────────────────────────────
function ScanEngineTab({ executeAriaCommand: _executeAriaCommand, onScanComplete, autoStartSignal = 0 }) {
  const [state, setState] = useState("idle");
  const [depth, setDepth] = useState("standard");
  const [phases, setPhases] = useState([]);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [curPhase, setCurPhase] = useState("");
  const [scanId, setScanId] = useState("");
  const [targetType, setTargetType] = useState("local-host");
  const [folderPath, setFolderPath] = useState("");
  const [customIp, setCustomIp] = useState("");
  const [scanStats, setScanStats] = useState(null);
  const [devices, setDevices] = useState([]);
  const [historyTick, setHistoryTick] = useState(0);
  const esRef = useRef(null);
  const streamRef = useRef(null);

  const buildEndpointUrl = useCallback(() => {
    const tgt = SCAN_TARGETS.find(t => t.id === targetType);
    const ep = tgt?.endpoint || "stream";
    if (ep === "folder") {
      const p = folderPath.trim() || "~";
      return apiUrl(`/api/scan/folder?depth=${depth}&path=${encodeURIComponent(p)}`);
    }
    if (ep === "network-discovery") return apiUrl(`/api/scan/network-discovery?depth=${depth}`);
    const host = targetType === "custom-ip" ? (customIp.trim() || "local-host") : "local-host";
    return apiUrl(`/api/scan/stream?depth=${depth}&target=${encodeURIComponent(host)}`);
  }, [targetType, depth, folderPath, customIp]);

  const startScan = useCallback(() => {
    esRef.current?.close();
    setPhases([]); setProgress(0); setResult(null); setCurPhase(""); setState("scanning");
    setScanStats(null); setDevices([]);
    const url = buildEndpointUrl();
    const es = new EventSource(url);
    esRef.current = es;
    es.addEventListener("scan_start", e => { const d=JSON.parse(e.data); setScanId(d.id); setCurPhase("Initialising scan engine…"); });
    es.addEventListener("scan_phase", e => {
      const d = JSON.parse(e.data);
      setCurPhase(d.message); setProgress(d.progress||0);
      if (d.stats) setScanStats(d.stats);
      if (d.devices_found != null) setScanStats(s => ({ ...s, devices_found: d.devices_found }));
      setPhases(p => [...p, { phase:d.phase, message:d.message, ts:d.ts }]);
      if (streamRef.current) streamRef.current.scrollTop = streamRef.current.scrollHeight;
    });
    es.addEventListener("scan_complete", e => {
      const d = JSON.parse(e.data);
      setResult(d); setState("done"); setProgress(100); setCurPhase("Scan complete");
      if (d.devices) setDevices(d.devices);
      if (d.stats) setScanStats(d.stats);
      es.close(); onScanComplete?.();
      setHistoryTick(t => t + 1);
    });
    es.onerror = () => {
      es.close();
      if (DEMO_BUILD) {
        const demo = makeDemoScanResult({ depth, targetType, folderPath, customIp });
        setResult(demo);
        setState("done");
        setProgress(100);
        setCurPhase("Demo scan complete");
        setPhases([
          { phase:"init", message:"Demo scan engine initialised", ts:demo.started_at },
          { phase:"collect", message:"Demo findings loaded from bundled data", ts:demo.started_at },
          { phase:"complete", message:"Demo scan complete", ts:new Date(Date.now() + 700).toISOString() },
        ]);
        setScanId(demo.id);
        setDevices(demo.devices || []);
        setScanStats(demo.stats || null);
        onScanComplete?.();
        setHistoryTick(t => t + 1);
        return;
      }
      setState("error");
      setCurPhase("Local scan service unavailable");
    };
  }, [buildEndpointUrl, onScanComplete, depth, targetType, folderPath, customIp]);

  useEffect(() => {
    if (!autoStartSignal || state === "scanning") return;
    startScan();
  }, [autoStartSignal, startScan, state]);

  useEffect(() => () => esRef.current?.close(), []);

  const findings = result?.findings || [];
  // Don't count the "no threats" fallback finding in severity totals
  const realFindings = findings.filter(f => f.severity !== "info" && !(f.source === "scan-engine" && f.severity === "low"));
  const critCount = realFindings.filter(f=>f.severity==="critical").length;
  const highCount = realFindings.filter(f=>f.severity==="high").length;
  const medCount  = realFindings.filter(f=>f.severity==="medium").length;
  const lowCount  = realFindings.filter(f=>f.severity==="low").length;

  const findingsRef = useRef(null);
  // Auto-scroll to findings when scan completes and there are real findings
  useEffect(() => {
    if (state === "done" && findings.length > 0 && findingsRef.current) {
      setTimeout(() => findingsRef.current?.scrollIntoView({ behavior:"smooth", block:"start" }), 300);
    }
  }, [state, findings.length]);

  const dl = (url, fname) => { const a=document.createElement("a"); a.href=url; a.download=fname; a.click(); };
  const activeTgt = SCAN_TARGETS.find(t => t.id === targetType) || SCAN_TARGETS[0];

  return (
    <div style={{ ...tabSurface(C.blue, "scan"), display:"grid", gridTemplateColumns:"1fr 1fr", gridTemplateRows:"auto auto 1fr", gap:12, minHeight:"100%" }}>

      {/* ── Full-width: Scan Target Selector ── */}
      <GlassCard accent={C.blue} style={{ padding:14, gridColumn:"1 / -1" }}>
        <SectionHead label="SCAN TARGET" color={C.blue}
          right={state==="scanning" ? <span style={{ color:C.cyan, fontSize:9, letterSpacing:"0.14em" }}>● SCANNING ACTIVE</span> : null} />
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, marginBottom: (targetType === "folder" || targetType === "custom-ip") ? 10 : 0 }}>
          {SCAN_TARGETS.map(t => {
            const active = targetType === t.id;
            return (
              <button key={t.id} type="button"
                onClick={() => state !== "scanning" && setTargetType(t.id)}
                disabled={state === "scanning"}
                style={{
                  padding:"12px 10px", borderRadius:9, cursor: state==="scanning"?"not-allowed":"pointer",
                  textAlign:"left", position:"relative", overflow:"hidden",
                  background: active ? `linear-gradient(145deg, rgba(0,122,204,0.18), rgba(0,122,204,0.06))` : "rgba(255,255,255,0.02)",
                  border: `1px solid ${active ? rgba(C.blue, 0.7) : rgba(C.blue, 0.14)}`,
                  boxShadow: active ? `0 0 16px rgba(0,122,204,0.15), inset 0 1px 0 rgba(0,122,204,0.12)` : "none",
                  transition:"all 0.18s",
                }}>
                {active && <div style={{ position:"absolute", top:0, left:0, right:0, height:2,
                  background:"linear-gradient(90deg,rgba(0,122,204,0.9),rgba(0,122,204,0.1))" }} />}
                <div style={{ fontSize:18, marginBottom:5, color: active ? C.blue : C.muted }}>{t.icon}</div>
                <div style={{ fontSize:11, fontWeight:700, color: active ? C.text : C.sub, marginBottom:3 }}>{t.label}</div>
                <div style={{ fontSize:9, color: active ? rgba(C.blue,0.7) : C.muted, lineHeight:1.4 }}>{t.desc}</div>
              </button>
            );
          })}
        </div>

        {/* Dynamic input for folder/custom-ip */}
        {targetType === "folder" && (
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <span style={{ fontSize:10, color:C.muted, flexShrink:0, fontFamily:"ui-monospace,monospace" }}>PATH</span>
            <input value={folderPath} onChange={e => setFolderPath(e.target.value)}
              disabled={state === "scanning"}
              placeholder="e.g. /Users/you/Documents  or  ~/Desktop  or  /"
              style={{
                flex:1, background:"#0a0a0a", color:C.text, border:`1px solid ${rgba(C.blue,0.3)}`,
                borderRadius:7, padding:"7px 11px", fontSize:11, fontFamily:"ui-monospace,monospace",
                outline:"none", boxSizing:"border-box",
              }} />
            <button type="button"
              onClick={() => { setFolderPath("~"); }}
              disabled={state === "scanning"}
              style={{ ...actionBtn(C.blue), fontSize:9, padding:"6px 10px" }}>HOME</button>
            <button type="button"
              onClick={() => { setFolderPath("/"); }}
              disabled={state === "scanning"}
              style={{ ...actionBtn(C.teal), fontSize:9, padding:"6px 10px" }}>ROOT</button>
          </div>
        )}
        {targetType === "custom-ip" && (
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <span style={{ fontSize:10, color:C.muted, flexShrink:0, fontFamily:"ui-monospace,monospace" }}>TARGET</span>
            <input value={customIp} onChange={e => setCustomIp(e.target.value)}
              disabled={state === "scanning"}
              placeholder="e.g. 192.168.1.1  or  hostname.local  or  10.0.0.0/24"
              style={{
                flex:1, background:"#0a0a0a", color:C.text, border:`1px solid ${rgba(C.blue,0.3)}`,
                borderRadius:7, padding:"7px 11px", fontSize:11, fontFamily:"ui-monospace,monospace",
                outline:"none", boxSizing:"border-box",
              }} />
          </div>
        )}
      </GlassCard>

      {/* ── Left: Radar ── */}
      <GlassCard accent={C.cyan} style={{ padding:16, display:"flex", flexDirection:"column" }}>
        <SectionHead label="THREAT SURFACE RADAR" color={C.cyan}
          right={state === "scanning" ? `${progress}% COMPLETE` : state === "done" ? `${findings.length} FINDINGS PLOTTED` : "STANDBY"} />
        <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", minHeight:200 }}>
          <RadarCanvasWrapper scanning={state==="scanning"} progress={progress} findings={findings} />
        </div>
        {/* Stats bar */}
        {scanStats && (
          <div style={{ display:"flex", gap:10, marginBottom:8, flexWrap:"wrap" }}>
            {scanStats.files_scanned != null && (
              <div style={{ fontSize:9, color:C.muted, fontFamily:"ui-monospace,monospace" }}>
                <span style={{ color:C.text }}>{scanStats.files_scanned.toLocaleString()}</span> files
              </div>
            )}
            {scanStats.dirs_scanned != null && (
              <div style={{ fontSize:9, color:C.muted, fontFamily:"ui-monospace,monospace" }}>
                <span style={{ color:C.text }}>{scanStats.dirs_scanned.toLocaleString()}</span> dirs
              </div>
            )}
            {scanStats.devices_found != null && (
              <div style={{ fontSize:9, color:C.muted, fontFamily:"ui-monospace,monospace" }}>
                <span style={{ color:C.cyan }}>{scanStats.devices_found}</span> devices
              </div>
            )}
          </div>
        )}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:6 }}>
          {[
            { label:"CRITICAL", val:critCount, c:C.red },
            { label:"HIGH",     val:highCount, c:C.amber },
            { label:"MEDIUM",   val:medCount,  c:C.cyan },
            { label:"LOW",      val:lowCount,  c:C.green },
          ].map(m => (
            <div key={m.label} style={{ textAlign:"center", background: rgba(m.c,0.06), borderRadius:6, padding:"6px 4px", border:`1px solid ${rgba(m.c,0.18)}` }}>
              <div style={{ fontSize:18, fontWeight:700, color:m.c, fontFamily:"ui-monospace,monospace" }}>{m.val}</div>
              <div style={{ fontSize:8, color: rgba(m.c,0.65), letterSpacing:"0.14em" }}>{m.label}</div>
            </div>
          ))}
        </div>
      </GlassCard>

      {/* ── Right: Control ── */}
      <GlassCard accent={C.blue} style={{ padding:16, display:"flex", flexDirection:"column", gap:10 }}>
        <SectionHead label="SCAN CONTROL" color={C.blue}
          right={<span style={{ fontSize:9, color:C.muted, fontFamily:"ui-monospace,monospace" }}>{scanId ? scanId.slice(-8).toUpperCase() : activeTgt.label.toUpperCase()}</span>} />

        {/* Depth selector */}
        <div>
          <div style={{ fontSize:9, color:C.muted, letterSpacing:"0.14em", textTransform:"uppercase", marginBottom:6 }}>SCAN DEPTH</div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:4 }}>
            {["quick","standard","deep"].map(d => (
              <button key={d} type="button" onClick={() => state!=="scanning" && setDepth(d)}
                style={{
                  padding:"7px 0", borderRadius:7, fontSize:10, letterSpacing:"0.1em",
                  textTransform:"uppercase", cursor: state==="scanning"?"not-allowed":"pointer",
                  border: `1px solid ${depth===d ? rgba(C.blue,0.7) : rgba(C.blue,0.18)}`,
                  background: depth===d ? rgba(C.blue,0.2) : "transparent",
                  color: depth===d ? C.blue : C.sub,
                  transition:"all 0.15s",
                }}>{d}</button>
            ))}
          </div>
        </div>

        {/* Progress bar */}
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
            <span style={{ fontSize:10, color: state==="scanning" ? C.cyan : C.muted, fontFamily:"ui-monospace,monospace", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:"80%" }}>
              {curPhase || "READY TO INITIATE"}
            </span>
            <span style={{ fontSize:10, color: C.sub, flexShrink:0 }}>{progress}%</span>
          </div>
          <div style={{ height:5, background:"rgba(0,122,204,0.08)", borderRadius:2, overflow:"hidden" }}>
            <div style={{
              height:"100%", borderRadius:2, width:`${progress}%`,
              background: state==="done"
                ? `linear-gradient(90deg, rgba(0,200,120,0.7), rgba(0,200,120,0.9))`
                : `linear-gradient(90deg, ${rgba(C.blue,0.58)}, ${rgba(C.cyan,0.88)})`,
              transition:"width 0.5s ease",
            }} />
          </div>
        </div>

        {/* Initiate button */}
        <button type="button" onClick={state==="scanning" ? undefined : startScan}
          disabled={state==="scanning"}
          style={{
            padding:"13px 0", borderRadius:9, fontSize:11, fontWeight:800,
            letterSpacing:"0.18em", textTransform:"uppercase",
            cursor: state==="scanning" ? "not-allowed" : "pointer",
            background: state==="scanning"
              ? `linear-gradient(135deg, rgba(0,122,204,0.04), rgba(0,122,204,0.04))`
              : `linear-gradient(135deg, rgba(0,122,204,0.3), rgba(0,180,255,0.15))`,
            border:`1px solid ${state==="scanning" ? rgba(C.cyan,0.12) : rgba(C.cyan,0.55)}`,
            color: state==="scanning" ? rgba(C.cyan,0.35) : C.cyan,
            boxShadow: state==="scanning" ? "none" : `0 0 28px rgba(0,122,204,0.22), inset 0 1px 0 rgba(0,180,255,0.15)`,
            transition:"all 0.2s",
          }}>
          {state==="scanning" ? "● SCANNING…" : state==="done" ? `↺ RE-SCAN ${activeTgt.label.toUpperCase()}` : `▶ SCAN ${activeTgt.label.toUpperCase()}`}
        </button>

        {/* Live stream terminal */}
        <div style={{ flex:1, display:"flex", flexDirection:"column", minHeight:0 }}>
          <div style={{ fontSize:9, color:C.muted, letterSpacing:"0.14em", textTransform:"uppercase", marginBottom:5 }}>
            SCAN STREAM
            {state==="scanning" && <span style={{ marginLeft:8, color:C.cyan }}>● LIVE</span>}
          </div>
          <div ref={streamRef} style={{
            flex:1, overflowY:"auto", minHeight:80, maxHeight:200,
            background:"#060606", borderRadius:7,
            border:`1px solid rgba(0,122,204,0.10)`,
            padding:"8px 10px", display:"flex", flexDirection:"column", gap:3,
            fontFamily:"ui-monospace,monospace",
          }}>
            {phases.length === 0 && state !== "error" && (
              <span style={{ color:C.muted, fontSize:10, fontStyle:"italic" }}>Awaiting scan initialisation…</span>
            )}
            {phases.map((p,i) => (
              <div key={i} style={{ display:"flex", gap:8, fontSize:10, lineHeight:1.5 }}>
                <span style={{ color: rgba(C.cyan,0.35), flexShrink:0, fontSize:9 }}>
                  {p.ts ? new Date(p.ts).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"}) : "--:--:--"}
                </span>
                <span style={{ color: rgba(C.blue,0.75), flexShrink:0, minWidth:70, textTransform:"uppercase", letterSpacing:"0.06em", fontSize:9 }}>[{p.phase}]</span>
                <span style={{ color:C.text }}>{p.message}</span>
              </div>
            ))}
            {state === "error" && <span style={{ color:"#ff6060", fontSize:10 }}>✗ {curPhase}</span>}
            {state === "done" && <span style={{ color:"rgba(0,200,120,0.9)", fontSize:10 }}>✓ Complete · {findings.length} finding{findings.length !== 1 ? "s" : ""}</span>}
          </div>
        </div>

        {/* Network devices table */}
        {devices.length > 0 && (
          <div style={{ marginTop:4 }}>
            <div style={{ fontSize:9, color:C.muted, letterSpacing:"0.14em", textTransform:"uppercase", marginBottom:5 }}>
              DISCOVERED DEVICES ({devices.length})
            </div>
            <div style={{ maxHeight:120, overflowY:"auto", display:"flex", flexDirection:"column", gap:3 }}>
              {devices.map((d,i) => (
                <div key={i} style={{ display:"flex", gap:10, fontSize:9, padding:"4px 8px", borderRadius:5,
                  background:"rgba(0,122,204,0.05)", border:"1px solid rgba(0,122,204,0.10)", fontFamily:"ui-monospace,monospace" }}>
                  <span style={{ color:C.cyan, minWidth:100 }}>{d.ip}</span>
                  <span style={{ color:C.muted, minWidth:120 }}>{d.mac !== "local" ? d.mac : "—"}</span>
                  <span style={{ color: d.role === "this-host" ? C.blue : C.sub }}>{d.role || d.source}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </GlassCard>

      {/* ── Bottom: Findings ── */}
      {result ? (
        <div ref={findingsRef} style={{ gridColumn:"1 / -1", scrollMarginTop:12 }}><GlassCard accent={C.purple} style={{ padding:16 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
            <SectionHead label="SCAN FINDINGS" color={C.purple}
              right={`${result.duration_ms}ms · ${result.target} · ${result.depth} depth`} />
            <div style={{ display:"flex", gap:8 }}>
              <button type="button" onClick={() => dl(apiUrl(`/api/scan/export?id=${result.id}`), `aria-scan-${result.id}.json`)}
                style={actionBtn(C.cyan)}>↓ EXPORT JSON</button>
              <button type="button" onClick={() => dl(apiUrl(`/api/scan/audit-doc?id=${result.id}`), `aria-scan-${result.id}-audit.md`)}
                style={actionBtn(C.purple)}>↓ AUDIT REPORT</button>
            </div>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:5, maxHeight:260, overflowY:"auto" }}>
            {findings.map((f,i) => (
              <div key={i} style={{
                display:"grid", gridTemplateColumns:"auto 1fr auto",
                gap:10, alignItems:"start",
                padding:"9px 12px", borderRadius:8,
                background: rgba(SEV[f.severity]||C.muted, 0.04),
                border:`1px solid ${rgba(SEV[f.severity]||C.muted, 0.18)}`,
              }}>
                <SevBadge sev={f.severity} />
                <div>
                  <div style={{ fontSize:12, color:C.text, lineHeight:1.4, wordBreak:"break-all" }}>{f.summary}</div>
                  {f.path && <div style={{ fontSize:9, color:rgba(C.blue,0.6), marginTop:2, fontFamily:"ui-monospace,monospace", wordBreak:"break-all" }}>{f.path}</div>}
                  {!f.path && f.source && <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>Source: {f.source}</div>}
                </div>
                <div style={{ fontSize:9, color:C.muted, textAlign:"right", whiteSpace:"nowrap" }}>
                  {new Date(result.started_at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}
                </div>
              </div>
            ))}
          </div>
        </GlassCard></div>
      ) : null}

      {/* ── History + Auto Scan — always visible below ── */}
      <HistoryAutoPanel
        refreshTick={historyTick}
        onViewScan={async (id) => {
          try {
            const r = await fetch(apiUrl(`/api/scan/export?id=${id}`));
            if (r.ok) { const d = await r.json(); setResult(d); setState("done"); setProgress(100); setCurPhase("Loaded from history"); if (d.devices) setDevices(d.devices); if (d.stats) setScanStats(d.stats); }
          } catch (_) { /* a failed history read leaves the current scan visible */ }
        }}
      />
    </div>
  );
}

// Wrapper keeps RadarCanvas stable (avoids re-creating canvas on parent re-render)
function RadarCanvasWrapper({ scanning, progress, findings }) {
  const ref = RadarCanvas({ scanning, progress, findings });
  return <canvas ref={ref} style={{ width:"260px", height:"260px", display:"block" }} />;
}

// ─── Operations tab ───────────────────────────────────────────────────────────
const CMD_PALETTE = [
  { cat:"Detect & Scan", accent:C.blue, glow:"0,122,204", cmds:[
    { label:"Quick perimeter scan",   cmd:"Run a quick scan" },
    { label:"Standard host sweep",    cmd:"Run a standard perimeter scan" },
    { label:"Deep threat analysis",   cmd:"Run a deep scan" },
  ]},
  { cat:"Respond & Contain", accent:C.red, glow:"0,122,204", cmds:[
    { label:"Contain suspicious threats", cmd:"Contain suspicious threats" },
    { label:"Isolate affected endpoint",  cmd:"Isolate threat on affected endpoint" },
    { label:"Quarantine flagged files",   cmd:"Quarantine flagged files" },
  ]},
  { cat:"Report & Analyze", accent:"#ffffff", glow:"255,255,255", cmds:[
    { label:"Executive incident report",  cmd:"Generate executive incident report" },
    { label:"Technical incident report",  cmd:"Generate technical incident report" },
    { label:"Intelligence briefing",      cmd:"Generate a live intelligence briefing covering all active threats, incidents, and system status" },
    { label:"Inspect live review items",  cmd:"Inspect live review items" },
  ]},
  { cat:"AI-SPM", accent:C.cyan, glow:"0,122,204", cmds:[
    { label:"AI-SPM exposure scan",   cmd:"Run AI-SPM scan" },
    { label:"AI attack narrative",    cmd:"Generate AI-SPM narrative" },
    { label:"AI asset inventory",     cmd:"Show AI-SPM inventory" },
  ]},
  { cat:"Navigate", accent:C.muted, glow:"255,255,255", cmds:[
    { label:"AI-SPM panel",           cmd:"AI-SPM" },
    { label:"Blocked IPs",            cmd:"Blocked IPs" },
    { label:"Threat Timeline",        cmd:"Threat Timeline" },
    { label:"Live Logs",              cmd:"Live Logs" },
    { label:"Incident Feed",          cmd:"Incident Feed" },
  ]},
];

function CommandPalette({ input, anchorRef, onSelect, visible }) {
  const q = (input || "").toLowerCase().trim();
  const allCmds = CMD_PALETTE.flatMap(g => g.cmds.map(c => ({ ...c, cat: g.cat, accent: g.accent })));
  const filtered = q
    ? allCmds.filter(c => c.label.toLowerCase().includes(q) || c.cmd.toLowerCase().includes(q) || c.cat.toLowerCase().includes(q))
    : null;

  const [pos, setPos] = useState({ top: 0, left: 0, width: 400 });
  const [, setMounted] = useState(false);
  useEffect(() => {
    if (visible) {
      setMounted(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setMounted(true)));
    }
  }, [visible]);

  useEffect(() => {
    const el = anchorRef?.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setPos({ top: r.bottom + 6, left: r.left, width: r.width });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => { window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); };
  }, [anchorRef]);

  return (
    <div style={{
      position:"fixed", top: pos.top, left: pos.left, width: pos.width, zIndex:99999,
      background:"#111111", border:`1px solid rgba(0,122,204,0.45)`,
      borderRadius:10, boxShadow:"0 12px 40px rgba(0,0,0,0.75)",
      maxHeight:380, overflowY:"auto",
      opacity: visible ? 1 : 0,
      transform: visible ? "translateY(0) scaleY(1)" : "translateY(-6px) scaleY(0.97)",
      transformOrigin: "top center",
      transition: "opacity 0.18s ease, transform 0.18s ease",
      pointerEvents: visible ? "auto" : "none",
    }}>
      {/* header */}
      <div style={{ padding:"8px 14px 6px", borderBottom:"1px solid rgba(0,122,204,0.12)", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <span style={{ fontSize:8, color:rgba(C.cyan,0.7), letterSpacing:"0.2em", textTransform:"uppercase" }}>Available Commands</span>
        <span style={{ fontSize:8, color:C.muted }}>↵ to run · Esc to close</span>
      </div>

      {filtered ? (
        filtered.length === 0
          ? <div style={{ padding:"12px 14px", fontSize:10, color:C.muted }}>No matching commands</div>
          : filtered.map(c => (
              <button key={c.cmd} type="button" onMouseDown={e => { e.preventDefault(); onSelect(c.cmd); }}
                style={{ display:"flex", alignItems:"center", gap:10, width:"100%", textAlign:"left",
                  padding:"9px 14px", background:"transparent", border:"none", cursor:"pointer", color:C.text,
                  borderBottom:"1px solid rgba(0,122,204,0.07)" }}>
                <span style={{ fontSize:8, color:rgba(c.accent,0.85), letterSpacing:"0.12em", textTransform:"uppercase", minWidth:80, flexShrink:0 }}>{c.cat}</span>
                <span style={{ fontSize:11, flex:1 }}>{c.label}</span>
                <span style={{ fontSize:9, color:C.muted, fontFamily:"ui-monospace,monospace", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:180 }}>{c.cmd}</span>
              </button>
            ))
      ) : (
        CMD_PALETTE.map(group => (
          <div key={group.cat}>
            <div style={{ padding:"6px 14px 3px", fontSize:8, color:rgba(group.accent,0.7), letterSpacing:"0.18em", textTransform:"uppercase", background:"rgba(0,122,204,0.04)" }}>
              {group.cat}
            </div>
            {group.cmds.map(c => (
              <button key={c.cmd} type="button" onMouseDown={e => { e.preventDefault(); onSelect(c.cmd); }}
                style={{ display:"flex", alignItems:"center", gap:10, width:"100%", textAlign:"left",
                  padding:"8px 14px", background:"transparent", border:"none", borderBottom:"1px solid rgba(0,122,204,0.06)", cursor:"pointer", color:C.text }}>
                <span style={{ fontSize:11, flex:1 }}>{c.label}</span>
                <span style={{ fontSize:9, color:C.muted, fontFamily:"ui-monospace,monospace", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:220 }}>{c.cmd}</span>
              </button>
            ))}
          </div>
        ))
      )}
    </div>
  );
}

function OperationsTab({ ariaInput, setAriaInput, executeAriaCommand, processCommand, panelOptions, liveFeed, focusCommandSignal = 0 }) {
  const feedRef = useRef(null);
  const inputRef = useRef(null);
  const [showPalette, setShowPalette] = useState(false);
  useEffect(() => { if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight; }, [liveFeed]);
  useEffect(() => {
    if (!focusCommandSignal) return;
    inputRef.current?.focus();
    setShowPalette(true);
  }, [focusCommandSignal]);

  const runCmd = (cmd) => {
    executeAriaCommand?.(cmd);
    setAriaInput?.("");
    setShowPalette(false);
  };

  return (
    <div style={{ ...tabSurface(C.teal, "ops"), display:"grid", gridTemplateColumns:"1fr 320px", gap:12, height:"100%" }}>
      <div style={{ display:"flex", flexDirection:"column", gap:12 }}>

        {/* Command input */}
        <GlassCard accent={C.cyan} style={{ padding:16 }}>
          <SectionHead label="COMMAND INTERFACE" color={C.cyan} />
          <div style={{ display:"flex", gap:8 }}>
            <div style={{ flex:1, position:"relative" }}>
              <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", color:rgba(C.cyan,0.5), fontSize:12, fontFamily:"ui-monospace,monospace", pointerEvents:"none" }}>$</span>
              <input ref={inputRef} value={ariaInput} onChange={e=>setAriaInput?.(e.target.value)}
                onFocus={() => setShowPalette(true)}
                onBlur={() => setShowPalette(false)}
                onKeyDown={e=>{
                  if(e.key==="Enter"&&ariaInput?.trim()){ runCmd(ariaInput.trim()); }
                  if(e.key==="Escape") setShowPalette(false);
                }}
                placeholder="Enter Aria command… (click for options)"
                style={{
                  width:"100%", boxSizing:"border-box",
                  background:"#111111", color:C.text,
                  border:`1px solid ${showPalette ? rgba(C.cyan,0.55) : rgba(C.cyan,0.28)}`, borderRadius:8,
                  padding:"10px 12px 10px 26px", fontSize:12,
                  fontFamily:"ui-monospace,monospace", outline:"none",
                  boxShadow: showPalette ? `0 0 0 2px rgba(0,122,204,0.18), inset 0 1px 0 ${rgba(C.cyan,0.05)}` : `inset 0 1px 0 ${rgba(C.cyan,0.05)}`,
                  transition:"border-color 0.15s, box-shadow 0.15s",
                }} />
              <CommandPalette input={ariaInput} anchorRef={inputRef} onSelect={runCmd} visible={showPalette} />
            </div>
            <button type="button"
              onClick={() => { if(ariaInput?.trim()){ runCmd(ariaInput.trim()); }}}
              style={actionBtn(C.cyan)}>EXECUTE</button>
          </div>
        </GlassCard>

        {/* Action grid */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, flex:1 }}>
          {[
            { cat:"Detect & Scan",    accent:C.blue, glow:"0,122,204", actions:[
              { label:"Quick perimeter scan",  cmd:"Run a quick scan" },
              { label:"Standard host sweep",   cmd:"Run a standard perimeter scan" },
              { label:"Deep threat analysis",  cmd:"Run a deep scan" },
            ]},
            { cat:"Respond & Contain", accent:C.red, glow:"0,122,204", actions:[
              { label:"Contain suspicious threats", cmd:"Contain suspicious threats" },
              { label:"Isolate affected endpoint",  cmd:"Isolate threat on affected endpoint" },
              { label:"Quarantine flagged files",   cmd:"Quarantine flagged files" },
            ]},
            { cat:"Report & Analyze",  accent:"#ffffff", glow:"255,255,255", actions:[
              { label:"Executive incident report",  cmd:"Generate executive incident report" },
              { label:"Technical incident report",  cmd:"Generate technical incident report" },
              { label:"Inspect live review items",  cmd:"Inspect live review items" },
            ]},
            { cat:"AI-SPM",            accent:"#007acc", glow:"0,122,204", actions:[
              { label:"AI-SPM exposure scan",    cmd:"Run AI-SPM scan" },
              { label:"AI attack narrative",     cmd:"Generate AI-SPM narrative" },
              { label:"AI asset inventory",      cmd:"Show AI-SPM inventory" },
            ]},
          ].map(({ cat, accent, glow, actions }) => (
            <GlassCard key={cat} accent={accent} style={{ padding:14 }}>
              <SectionHead label={cat} color={accent} />
              <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                {actions.map(({ label, cmd }) => (
                  <button key={label} type="button" onClick={() => executeAriaCommand?.(cmd)}
                    style={{
                      padding:"9px 12px", borderRadius:7, fontSize:11, cursor:"pointer", textAlign:"left",
                      background: `rgba(${glow},0.07)`,
                      border: `1px solid rgba(${glow},0.22)`,
                      borderLeft: `2px solid rgba(${glow},0.8)`,
                      color:C.text, transition:"all 0.15s",
                      display:"flex", alignItems:"center", gap:9,
                    }}>
                    <span style={{ color:accent, fontSize:8, flexShrink:0, filter:`drop-shadow(0 0 4px rgba(${glow},0.7))` }}>▶</span>
                    {label}
                  </button>
                ))}
              </div>
            </GlassCard>
          ))}
        </div>

        {/* Nav chips */}
        <GlassCard accent={C.accent} style={{ padding:12 }}>
          <SectionHead label="NAVIGATE TO PANEL" color={C.accent} />
          <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
            {["AI-SPM","Blocked IPs","Threat Timeline","CPU Trends","Critical Filter",
              "Live Logs","Network","Quarantine","Threat Vectors","Incident Feed"].map(cmd => (
              <button key={cmd} type="button" onClick={() => processCommand?.(cmd)}
                style={{
                  padding:"4px 10px", borderRadius:99, fontSize:10, cursor:"pointer",
                  border:`1px solid ${rgba(C.blue,0.35)}`, background:rgba(C.blue,0.10), color:C.sub,
                }}>
                {cmd}
              </button>
            ))}
          </div>
        </GlassCard>
      </div>

      {/* Right: live feed */}
      <GlassCard accent={C.cyan} style={{ padding:14, display:"flex", flexDirection:"column" }}>
        <SectionHead label="ARIA LIVE STREAM" color={C.cyan} right="● LIVE" />
        <div ref={feedRef} style={{ flex:1, overflowY:"auto", display:"flex", flexDirection:"column", gap:4 }}>
          {liveFeed.length === 0 ? (
            <div style={{ fontSize:10, color:C.muted, fontStyle:"italic" }}>Waiting for events…</div>
          ) : liveFeed.map((line,i) => (
            <div key={i} style={{
              fontSize:11, color:C.text, padding:"6px 10px", borderRadius:6,
              background:"rgba(0,122,204,0.05)", border:`1px solid rgba(0,122,204,0.10)`,
              lineHeight:1.5,
            }}>
              <span style={{ color:rgba(C.cyan,0.4), fontSize:9, marginRight:8 }}>{now12()}</span>
              {line}
            </div>
          ))}
        </div>
        {panelOptions?.length > 0 && (
          <div style={{ marginTop:10 }}>
            <div style={{ fontSize:9, color:C.muted, letterSpacing:"0.14em", marginBottom:6 }}>QUICK ACTIONS</div>
            <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
              {panelOptions.slice(0,4).map(opt => (
                <button key={opt} type="button" onClick={() => executeAriaCommand?.(opt)}
                  style={{ padding:"6px 10px", borderRadius:7, fontSize:10, cursor:"pointer", textAlign:"left",
                    border:`1px solid ${rgba(C.amber,0.22)}`, background: rgba(C.amber,0.06), color:C.text }}>
                  ▶ {opt}
                </button>
              ))}
            </div>
          </div>
        )}
      </GlassCard>
    </div>
  );
}

// ─── Intelligence tab ─────────────────────────────────────────────────────────
function IntelligenceTab({ authzDenialRows, authzDenialsLoading, liveFeed, liveIncidents = [], reviewItems = [], scanHistoryTrigger }) {
  const [scans, setScans] = useState([]);
  const [histLoading, setHistLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const feedRef = useRef(null);

  useEffect(() => { if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight; }, [liveFeed]);

  const loadHistory = useCallback(async () => {
    setHistLoading(true);
    try {
      const r = await fetch(apiUrl("/api/scan/history"));
      const d = await r.json();
      setScans(d.scans || []);
    } catch { setScans([]); }
    finally { setHistLoading(false); }
  }, []);

  // Fetch-on-mount + on scan completion. Async load is the intended use here.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadHistory(); }, [loadHistory, scanHistoryTrigger]);

  const dl = (id, ext, name) => { const a=document.createElement("a"); a.href=apiUrl(`/api/scan/${ext}?id=${id}`); a.download=name; a.click(); };

  return (
    <div style={{ ...tabSurface(C.cyan, "archive"), display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, height:"100%" }}>

      {/* Scan history */}
      <GlassCard accent={C.purple} style={{ padding:16, display:"flex", flexDirection:"column" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
          <SectionHead label="SCAN RECORDS" color={C.purple} right={`${scans.length} ON DISK`} />
          <button type="button" onClick={loadHistory} style={{ ...actionBtn(C.purple), fontSize:9, padding:"3px 8px" }}>↻</button>
        </div>
        {histLoading ? (
          <div style={{ fontSize:11, color:C.muted }}>Loading…</div>
        ) : scans.length === 0 ? (
          <div style={{ fontSize:11, color:C.muted, fontStyle:"italic", marginTop:8 }}>No records — run a scan first.</div>
        ) : (
          <div style={{ flex:1, overflowY:"auto", display:"flex", flexDirection:"column", gap:5 }}>
            {scans.map(s => {
              const hasCrit = s.critical_count > 0, sel = selected===s.id;
              const color = hasCrit ? C.red : s.high_count > 0 ? C.amber : C.green;
              return (
                <div key={s.id} onClick={() => setSelected(sel?null:s.id)}
                  style={{
                    padding:"9px 12px", borderRadius:8, cursor:"pointer",
                    border:`1px solid ${rgba(C.purple,sel?0.4:0.15)}`,
                    background: sel ? rgba(C.purple,0.1) : rgba(C.purple,0.04),
                    transition:"all 0.15s",
                  }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div>
                      <div style={{ fontSize:11, color:C.text, fontFamily:"ui-monospace,monospace" }}>
                        {s.depth?.toUpperCase()} · {s.target}
                      </div>
                      <div style={{ fontSize:9, color:C.muted, marginTop:2 }}>
                        {s.started_at ? new Date(s.started_at).toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}) : "—"}
                        {s.duration_ms ? ` · ${s.duration_ms}ms` : ""}
                      </div>
                    </div>
                    <div style={{ textAlign:"right" }}>
                      <div style={{ fontSize:14, fontWeight:700, color, fontFamily:"ui-monospace,monospace" }}>{s.finding_count}</div>
                      <div style={{ fontSize:8, color:rgba(color,0.6) }}>FINDINGS</div>
                    </div>
                  </div>
                  {sel && (
                    <div style={{ marginTop:8, display:"flex", gap:6 }}>
                      <button type="button" onClick={e=>{e.stopPropagation();dl(s.id,"export",`aria-scan-${s.id}.json`);}} style={actionBtn(C.cyan)}>↓ JSON</button>
                      <button type="button" onClick={e=>{e.stopPropagation();dl(s.id,"audit-doc",`aria-scan-${s.id}-audit.md`);}} style={actionBtn(C.purple)}>↓ AUDIT</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </GlassCard>

      {/* Active findings + incidents + live feed */}
      <div style={{ display:"flex", flexDirection:"column", gap:12 }}>

        {/* Active findings (review items) */}
        {reviewItems.length > 0 && (
          <GlassCard accent={C.amber} style={{ padding:16, flex:"0 0 auto" }}>
            <SectionHead label="ACTIVE FINDINGS" color={C.amber} right={`${reviewItems.length} OPEN`} />
            <div style={{ display:"flex", flexDirection:"column", gap:6, maxHeight:150, overflowY:"auto" }}>
              {reviewItems.map((item, i) => (
                <div key={i} style={{ display:"flex", gap:8, alignItems:"flex-start", fontSize:11, color:C.text, lineHeight:1.4 }}>
                  <span style={{ color:C.amber, flexShrink:0 }}>›</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </GlassCard>
        )}

        {/* AuthZ denials */}
        <GlassCard accent={C.red} style={{ padding:16, flex:"0 0 auto" }}>
          <SectionHead label="AUTHZ DENIALS FEED" color={C.red} right="LIVE" />
          {authzDenialsLoading ? (
            <div style={{ fontSize:11, color:C.muted }}>Loading…</div>
          ) : authzDenialRows?.length === 0 ? (
            <div style={{ fontSize:11, color:C.muted, fontStyle:"italic" }}>No recent auth denials.</div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:5, maxHeight:140, overflowY:"auto" }}>
              {authzDenialRows.map(item => (
                <div key={item.id} style={{
                  padding:"7px 10px", borderRadius:7, fontSize:11,
                  background: rgba(C.red,0.05), border:`1px solid ${rgba(C.red,0.2)}`,
                  display:"grid", gridTemplateColumns:"auto auto 1fr", gap:10, alignItems:"center",
                }}>
                  <SevBadge sev="critical" />
                  <span style={{ color:rgba(C.red,0.85), fontFamily:"ui-monospace,monospace", fontSize:10 }}>{item.actor}</span>
                  <span style={{ color:C.sub, fontSize:10, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{item.reason}</span>
                </div>
              ))}
            </div>
          )}
        </GlassCard>

        {/* Event stream with incidents */}
        <GlassCard accent={C.cyan} style={{ padding:16, flex:1, display:"flex", flexDirection:"column", minHeight:160 }}>
          <SectionHead label="INTELLIGENCE STREAM" color={C.cyan} right="● LIVE" />
          <div ref={feedRef} style={{ flex:1, overflowY:"auto", display:"flex", flexDirection:"column", gap:4 }}>
            {liveIncidents.slice(0,3).map((inc, i) => {
              const sev = String(inc.severity||"medium").toLowerCase();
              const c = SEV[sev] || C.cyan;
              return (
                <div key={`inc-${i}`} style={{ padding:"8px 10px", borderRadius:7, border:`1px solid ${rgba(c,0.3)}`, background: rgba(c,0.06) }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                    <span style={{ fontSize:9, color:c, letterSpacing:"0.1em", textTransform:"uppercase", fontWeight:700 }}>{inc.id} · {sev}</span>
                    <span style={{ fontSize:9, color:C.muted }}>{inc.status}</span>
                  </div>
                  <div style={{ fontSize:11, color:C.text, lineHeight:1.4 }}>{inc.title}</div>
                </div>
              );
            })}
            {liveFeed.length===0 && liveIncidents.length===0 ? <div style={{ fontSize:10, color:C.muted }}>Waiting for events…</div>
              : liveFeed.map((line,i) => (
              <div key={i} style={{
                display:"flex", gap:8, fontSize:10, padding:"4px 0",
                borderBottom:`1px solid rgba(0,122,204,0.07)`,
              }}>
                <span style={{ color:rgba(C.cyan,0.35), flexShrink:0 }}>{now12()}</span>
                <span style={{ color:C.text }}>{line}</span>
              </div>
            ))}
          </div>
        </GlassCard>
      </div>
    </div>
  );
}

// ─── System tab ───────────────────────────────────────────────────────────────
function SystemTab({ adminTenantRows, adminRoleRows, tenantContextLoading, sources, connections, incidents, approvals, riskScore }) {
  const liveConns = connections.length;
  const blockedConns = connections.filter(c=>c.state==="BLOCKED").length;
  const critInc = incidents.filter(i=>String(i.severity).toLowerCase()==="critical").length;
  const liveSrc = sources.filter(s=>s.status==="live").length;
  const riskColor = riskScore > 70 ? C.red : riskScore > 40 ? C.amber : C.green;

  // HONEST history: rolling samples of the REAL risk score (no random jitter).
  const riskHist = useLiveHistory(riskScore, { len: 20, ms: 2000 });

  return (
    <div style={{ ...tabSurface(C.blue, "diagnostic"), display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gridTemplateRows:"auto auto 1fr", gap:12, height:"100%" }}>

      {/* Top metric row */}
      <MetricBlock label="RISK SCORE" value={riskScore} sub={riskScore>70?"CRITICAL POSTURE":riskScore>40?"ELEVATED":"NOMINAL"} color={riskColor} alert={riskScore>70} spark={riskHist} />
      <MetricBlock label="LIVE SOURCES" value={`${liveSrc}/${sources.length}`} sub={`${sources.length - liveSrc} offline`} color={liveSrc===sources.length?C.green:C.amber} />
      <MetricBlock label="ACTIVE INCIDENTS" value={incidents.length} sub={`${critInc} critical`} color={critInc>0?C.red:C.amber} alert={critInc>0} />
      <MetricBlock label="CONNECTIONS" value={liveConns} sub={`${blockedConns} blocked`} color={C.blue} />
      <MetricBlock label="PENDING APPROVALS" value={approvals.length} sub={approvals.length?"Action required":"Queue clear"} color={approvals.length?C.amber:C.green} alert={approvals.length>0} />
      <MetricBlock label="POSTURE" value={riskScore>70?"BREACH":riskScore>40?"ELEVATED":"CLEAN"} sub={`Risk index ${riskScore}`} color={riskColor} />

      {/* Tenant */}
      <GlassCard accent={C.purple} style={{ padding:16 }}>
        <SectionHead label="TENANT CONTEXT" color={C.purple} />
        {tenantContextLoading ? (
          <div style={{ fontSize:11, color:C.muted }}>Loading context…</div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {(adminTenantRows||[]).map(({ label, value }) => (
              <div key={label} style={{ display:"grid", gridTemplateColumns:"90px 1fr", gap:8, fontSize:11 }}>
                <span style={{ color:C.muted, textTransform:"uppercase", letterSpacing:"0.1em", fontSize:9 }}>{label}</span>
                <span style={{ color:C.text, fontFamily:"ui-monospace,monospace", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{value}</span>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      {/* Roles */}
      <GlassCard accent={C.purple} style={{ padding:16, display:"flex", flexDirection:"column", minHeight:0 }}>
        <SectionHead label="ROLE MATRIX" color={C.purple} />
        <div style={{ display:"flex", flexDirection:"column", gap:8, overflowY:"auto", flex:1, minHeight:0, paddingRight:3 }}>
          {(adminRoleRows||[]).map((item,i) => (
            <div key={i} style={{ padding:"7px 10px", borderRadius:7, background: rgba(C.purple,0.06), border:`1px solid ${rgba(C.purple,0.15)}` }}>
              <div style={{ fontSize:10, fontWeight:600, color:C.purple }}>{item.role}</div>
              <div style={{ fontSize:11, color:C.text, marginTop:2 }}>{item.permission}</div>
              <div style={{ fontSize:9, color:C.muted, textTransform:"uppercase", letterSpacing:"0.1em", marginTop:2 }}>{item.status}</div>
            </div>
          ))}
        </div>
      </GlassCard>

      {/* Sources */}
      <GlassCard accent={C.blue} style={{ padding:16, gridRow:"span 1" }}>
        <SectionHead label="TELEMETRY SOURCES" color={C.blue} right={`${liveSrc}/${sources.length} LIVE`} />
        <div style={{ display:"flex", flexDirection:"column", gap:5, maxHeight:200, overflowY:"auto" }}>
          {sources.length === 0 ? (
            <div style={{ fontSize:11, color:C.muted }}>No sources available.</div>
          ) : sources.map((s, i) => {
            const live = s.status === "live";
            return (
              <div key={s.id||i} style={{ display:"grid", gridTemplateColumns:"1fr auto", gap:8, alignItems:"center", padding:"5px 0", borderBottom:`1px solid rgba(0,122,204,0.07)` }}>
                <div>
                  <div style={{ fontSize:11, color:C.text }}>{s.id || s.name || "Unknown"}</div>
                  {s.type && <div style={{ fontSize:9, color:C.muted }}>{s.type}</div>}
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                  <Dot on={live} color={C.green} />
                  <span style={{ fontSize:9, color: live?C.green:rgba(C.red,0.7), textTransform:"uppercase", letterSpacing:"0.08em" }}>{s.status||"unknown"}</span>
                </div>
              </div>
            );
          })}
        </div>
      </GlassCard>
    </div>
  );
}

// ─── Action button style ──────────────────────────────────────────────────────
const actionBtn = (accent=C.cyan) => ({
  padding:"6px 14px", borderRadius:7, fontSize:9, fontWeight:700,
  letterSpacing:"0.12em", textTransform:"uppercase", cursor:"pointer",
  border:`1px solid ${rgba(accent,0.45)}`,
  background: rgba(accent,0.12), color: accent,
  whiteSpace:"nowrap",
});

// ─── Top status bar ───────────────────────────────────────────────────────────
function useCriticalSiren(active) {
  const ctxRef = useRef(null);
  const playingRef = useRef(false);

  const stop = useCallback(() => {
    if (!playingRef.current) return;
    playingRef.current = false;
    try { ctxRef.current?.close(); } catch(_) { /* already closed */ }
    ctxRef.current = null;
  }, []);

  const start = useCallback(() => {
    if (playingRef.current) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = 880;
      gain.gain.value = 0.15;
      osc.connect(gain); gain.connect(ctx.destination);
      const sweep = () => {
        if (!playingRef.current) return;
        osc.frequency.setTargetAtTime(1200, ctx.currentTime, 0.15);
        setTimeout(() => { if (playingRef.current) { osc.frequency.setTargetAtTime(700, ctx.currentTime, 0.15); setTimeout(sweep, 600); } }, 600);
      };
      osc.start();
      playingRef.current = true;
      ctxRef.current = ctx;
      sweep();
    } catch(_) { /* audio is optional and must not break the command center */ }
  }, []);

  useEffect(() => { if (active) { start(); } else { stop(); } return stop; }, [active, start, stop]);
}

function TopBar({ agentStatus, riskScore, threatLevel, sources, reviewItems, approvals, memoryPercent, onClose }) {
  const [tick, setTick] = useState(now12());
  const [acked, setAcked] = useState(false);
  const prevThreat = useRef(threatLevel);
  useEffect(() => {
    if (threatLevel === 'CRITICAL' && prevThreat.current !== 'CRITICAL') setAcked(false);
    prevThreat.current = threatLevel;
  }, [threatLevel]);
  useEffect(() => { const id=setInterval(()=>setTick(now12()),1000); return ()=>clearInterval(id); },[]);

  const isCritical = threatLevel === 'CRITICAL' && !acked;
  useCriticalSiren(isCritical);

  const liveSrc = (sources||[]).filter(s=>s.status==="live").length;
  const rc      = riskScore >= 70 ? C.red : riskScore >= 40 ? C.amber : C.green;
  const tc      = threatLevel==="CRITICAL" ? C.red : threatLevel==="HIGH" ? C.amber : threatLevel==="MEDIUM" ? C.cyan : C.green;
  const mc      = memoryPercent >= 82 ? C.red : memoryPercent >= 70 ? C.amber : C.green;
  const nApprov = (approvals||[]).length;
  const nReview = (reviewItems||[]).length;

  const metric = (label, value, color, blink=false) => (
    <div style={{ flex:1, textAlign:"center", padding:"0 12px", borderRight:`1px solid rgba(255,255,255,0.15)` }}>
      <div style={{ fontSize:9, letterSpacing:"0.14em", color:"rgba(255,255,255,0.65)", marginBottom:3, textTransform:"uppercase" }}>{label}</div>
      <div style={{
        fontSize:19, fontWeight:800, color:"#ffffff", fontFamily:"ui-monospace,monospace", lineHeight:1,
        animation: blink ? "ccBlink 1.4s ease-in-out infinite" : "none",
        textShadow: blink ? "0 0 10px rgba(255,255,255,0.5)" : "none",
      }}>{value}</div>
    </div>
  );

  return (
    <div style={{
      display:"flex", alignItems:"center",
      padding:"0 20px",
      height:64, flexShrink:0,
      background: isCritical ? undefined : `#007acc`,
      borderBottom: isCritical ? '2px solid #ff2222' : `1px solid rgba(0,0,0,0.35)`,
      position:"relative", zIndex:2,
      animation: isCritical ? 'criticalFlash 0.7s ease-in-out infinite' : 'none',
    }}>
      {/* Brand */}
      <div style={{ display:"flex", alignItems:"center", gap:12, marginRight:20, paddingRight:18, borderRight:`1px solid rgba(255,255,255,0.18)`, flexShrink:0 }}>
        <div style={{ position:"relative" }}>
          <div style={{
            width:10, height:10, borderRadius:"50%",
            background: agentStatus==="offline" ? "#ffffff" : "#ffffff",
            boxShadow: agentStatus==="offline" ? "none" : `0 0 10px rgba(255,255,255,0.7)`,
            animation: agentStatus!=="offline" ? "ccPulse 2s ease-in-out infinite" : "none",
          }} />
        </div>
        <div>
          <div style={{ fontSize:11, fontWeight:800, letterSpacing:"0.26em", color:"#ffffff", textTransform:"uppercase" }}>
            ARIA COMMAND FABRIC
          </div>
          <div style={{ fontSize:8, color:"rgba(255,255,255,0.72)", letterSpacing:"0.18em", marginTop:1 }}>
            AI SOC OPERATING SYSTEM · {agentStatus.toUpperCase()}
          </div>
        </div>
      </div>

      {/* Metrics strip */}
      <div style={{ display:"flex", alignItems:"center", flex:1, height:"100%" }}>
        {metric("THREAT", threatLevel || "UNKNOWN", tc, threatLevel==="CRITICAL")}
        {metric("RISK SCORE", riskScore, rc, riskScore>=70)}
        {metric("REVIEW ITEMS", nReview, nReview?"#ffffff":C.green)}
        {metric("APPROVALS", nApprov, nApprov?"#ffffff":C.green, nApprov>0)}
        {metric("LIVE SOURCES", `${liveSrc}/${(sources||[]).length}`, liveSrc<(sources||[]).length ? "#ffffff" : C.green)}
        {metric("MEMORY", `${memoryPercent}%`, mc, memoryPercent>=82)}
      </div>

      {/* Clock + close */}
      <div style={{ display:"flex", alignItems:"center", gap:10, paddingLeft:20, borderLeft:`1px solid rgba(255,255,255,0.18)` }}>
        {isCritical && (
          <button type="button" onClick={() => setAcked(true)}
            style={{
              padding:"5px 11px", borderRadius:3, cursor:"pointer",
              border:`1px solid rgba(255,255,255,0.7)`, background:"rgba(0,0,0,0.4)",
              color:"#ffffff", fontSize:9, fontWeight:800, letterSpacing:"0.14em",
              textTransform:"uppercase", whiteSpace:"nowrap", flexShrink:0,
            }}>⚠ ACKNOWLEDGE</button>
        )}
        <div style={{ textAlign:"right" }}>
          <div style={{ fontSize:16, fontWeight:700, fontFamily:"ui-monospace,monospace", color:"#ffffff", letterSpacing:"0.08em" }}>{tick}</div>
          <div style={{ fontSize:8, color:"rgba(255,255,255,0.62)", letterSpacing:"0.12em" }}>{new Date().toLocaleDateString([],{year:"numeric",month:"short",day:"numeric"}).toUpperCase()}</div>
        </div>
        <button type="button" onClick={onClose}
          style={{
            width:30, height:30, borderRadius:3, cursor:"pointer",
            border:`1px solid rgba(255,255,255,0.3)`, background:"rgba(0,0,0,0.2)",
            color:"rgba(255,255,255,0.85)", fontSize:14, display:"flex", alignItems:"center", justifyContent:"center",
          }}>✕</button>
      </div>
    </div>
  );
}

// ─── Tab bar — VS Code style ──────────────────────────────────────────────────
function TabBar({ active, onChange }) {
  const tabs = [
    { id:"command", label:"● Command Fabric" },
    { id:"monitor", label:"● Live Monitor" },
    { id:"scan",    label:"● Evidence Scan" },
    { id:"ops",     label:"● Autonomy" },
    { id:"intel",   label:"● Evidence" },
    { id:"system",  label:"● Diagnostics" },
  ];
  return (
    <div style={{
      display:"flex", alignItems:"stretch",
      background:"#252526",
      borderBottom:`1px solid #007acc`,
      flexShrink:0, height:38,
    }}>
      {tabs.map((tab) => {
        const isActive = active === tab.id;
        return (
          <button key={tab.id} type="button" onClick={() => onChange(tab.id)}
            style={{
              padding:"0 18px", fontSize:11, letterSpacing:"0.06em",
              cursor:"pointer",
              border:"none",
              borderRight:`1px solid #3e3e42`,
              borderTop:`2px solid ${isActive ? "#007acc" : "transparent"}`,
              background:isActive ? "#1e1e1e" : "transparent",
              color:isActive ? "#ffffff" : "#969696",
              display:"flex", alignItems:"center", gap:6,
              transition:"background 0.12s, color 0.12s",
              whiteSpace:"nowrap",
              fontFamily:"ui-sans-serif,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
            }}>
            <span style={{
              fontSize:6, color: isActive ? "#007acc" : "#555",
              marginRight:2,
            }}>■</span>
            {tab.label.replace("● ","")}
          </button>
        );
      })}
    </div>
  );
}

// ─── Alert ribbon (approvals + confirm flow) ──────────────────────────────────
function AlertRibbon({ approvalQueue, onResolveApproval, panelPhase, pendingTask, onConfirm, onCancelConfirm, currentTask }) {
  // Local state: track items that were resolved so we can show a confirmation flash
  // before they disappear from the parent queue.
  const [localItems, setLocalItems] = useState([]);
  const prevQueueRef = useRef([]);
  const [evidenceItem, setEvidenceItem] = useState(null);

  useEffect(() => {
    const incoming = approvalQueue || [];
    const incomingIds = new Set(incoming.map(i => i.id));
    setLocalItems(prev => {
      // Build next: keep confirming items (parent already removed them), merge updated data
      const kept = prev.filter(i => i._state === "confirming" || incomingIds.has(i.id))
        .map(i => incomingIds.has(i.id) && i._state !== "confirming"
          ? { ...i, ...incoming.find(q => q.id === i.id) }
          : i);
      // Append genuinely new items
      const keptIds = new Set(kept.map(i => i.id));
      for (const item of incoming) {
        if (!keptIds.has(item.id)) kept.push({ ...item, _state: "pending" });
      }
      return kept;
    });
    prevQueueRef.current = incoming;
  }, [approvalQueue]);

  const handleResolve = useCallback((id, decision) => {
    setLocalItems(prev => prev.map(i => i.id === id ? { ...i, _state:"confirming", _decision:decision } : i));
    onResolveApproval?.(id, decision);
    setTimeout(() => setLocalItems(prev => prev.filter(i => i.id !== id)), 2200);
  }, [onResolveApproval]);

  const hasApprovals = localItems.length > 0;
  const isConfirm = panelPhase === "confirm" && pendingTask;
  const isActing = (panelPhase === "acting" || panelPhase === "complete") && currentTask;
  if (!hasApprovals && !isConfirm && !isActing) return null;

  return (
    <div style={{ flexShrink:0, display:"flex", flexDirection:"column" }}>
      {/* Approval queue */}
      {hasApprovals && localItems.slice(0,2).map(item => {
        const confirmed = item._state === "confirming";
        const approved  = item._decision === "approve";
        const confirmColor = approved ? "rgba(0,122,204,0.6)" : C.red;
        return (
        <div key={item.id} style={{
          display:"flex", alignItems:"center", gap:14,
          padding:"10px 20px",
          background: confirmed
            ? (approved ? "rgba(0,122,204,0.5)" : "rgba(0,122,204,0.2)")
            : rgba(C.amber,0.10),
          borderBottom:`1px solid ${rgba(C.amber,0.28)}`,
          transition:"background 0.3s ease",
        }}>
          {confirmed ? (
            <>
              <div style={{ display:"flex", alignItems:"center", gap:10, flex:1 }}>
                <span style={{ fontSize:18 }}>{approved ? "✓" : "✗"}</span>
                <span style={{ fontSize:12, fontWeight:700, color:confirmColor, letterSpacing:"0.08em" }}>
                  {approved ? "APPROVED" : "DENIED"} — {item.reason}
                </span>
              </div>
              <div style={{ width:8, height:8, borderRadius:"50%", background:confirmColor, boxShadow:`0 0 8px ${confirmColor}`, animation:"ccPulse 1s infinite" }} />
            </>
          ) : (
            <>
              <div style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
                <span style={{ fontSize:14 }}>⚠</span>
                <span style={{ fontSize:9, fontWeight:800, letterSpacing:"0.18em", color:C.red, textTransform:"uppercase" }}>Approval Required</span>
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <span style={{ fontSize:12, color:C.text }}>{item.reason}</span>
                <span style={{ fontSize:10, color:rgba(C.red,0.8), marginLeft:10, letterSpacing:"0.08em", textTransform:"uppercase" }}>
                  {String(item.action||"").replace(/_/g," ")} · {item.risk} risk
                </span>
              </div>
              <div style={{ display:"flex", gap:8, flexShrink:0 }}>
                <button type="button" onClick={() => setEvidenceItem(item)}
                  style={{ ...actionBtn(C.blue), padding:"7px 12px" }}>Open Evidence</button>
                <button type="button" onClick={() => handleResolve(item.id, "approve")}
                  style={{ ...actionBtn("rgba(0,122,204,0.6)"), padding:"7px 18px", background:"rgba(30,160,60,0.85)", border:"1px solid rgba(50,200,80,0.8)", color:"#fff", }}>APPROVE</button>
                <button type="button" onClick={() => handleResolve(item.id, "deny")}
                  style={{ ...actionBtn(C.red), padding:"7px 18px", background:"rgba(200,30,30,0.85)", border:"1px solid rgba(220,50,50,0.8)", color:"#fff" }}>DENY</button>
              </div>
            </>
          )}
        </div>
        );
      })}

      {/* Confirm flow */}
      {isConfirm && (
        <div style={{
          display:"flex", alignItems:"center", gap:14, padding:"10px 20px",
          background:`linear-gradient(90deg, ${rgba(C.amber,0.14)}, ${rgba(C.amber,0.04)})`,
          borderBottom:`1px solid ${rgba(C.amber,0.28)}`,
        }}>
          <span style={{ fontSize:9, fontWeight:800, letterSpacing:"0.18em", color:C.amber, textTransform:"uppercase", flexShrink:0 }}>Confirm Action</span>
          <span style={{ flex:1, fontSize:12, color:C.text, minWidth:0 }}>{pendingTask}</span>
          <div style={{ display:"flex", gap:8, flexShrink:0 }}>
            <button type="button" onClick={onConfirm} style={{ ...actionBtn(C.cyan), padding:"7px 18px" }}>Confirm</button>
            <button type="button" onClick={onCancelConfirm} style={{ ...actionBtn(C.red), padding:"7px 18px" }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Active operation */}
      {isActing && (
        <div style={{
          display:"flex", alignItems:"center", gap:12, padding:"9px 20px",
          background: rgba(C.cyan,0.05), borderBottom:`1px solid ${rgba(C.cyan,0.18)}`,
        }}>
          <div style={{ width:7, height:7, borderRadius:"50%", background: panelPhase==="acting"?C.amber:C.green, boxShadow:`0 0 8px ${panelPhase==="acting"?C.amber:C.green}`, animation:"ccPulse 1.2s infinite" }} />
          <span style={{ flex:1, fontSize:12, color:C.text }}>{currentTask}</span>
          <span style={{ fontSize:9, color: panelPhase==="acting"?C.amber:C.green, letterSpacing:"0.14em", textTransform:"uppercase" }}>{panelPhase==="acting"?"Running":"Complete"}</span>
        </div>
      )}
      <EvidenceDrawer
        open={!!evidenceItem}
        evidence={evidenceFromApprovalItem(evidenceItem)}
        title="Approval Evidence"
        subtitle="Decision proof record"
        accent={C.blue}
        onClose={() => setEvidenceItem(null)}
      />
    </div>
  );
}

function evidenceFromApprovalItem(item) {
  if (!item) return null;
  return {
    source: item.source || "ARIA approval queue",
    timestamp: item.created_at || item.timestamp,
    affectedEntities: [item.target, item.entity].filter(Boolean),
    relatedFindings: [],
    timeline: [],
    blastRadius: item.risk,
    confidence: item.confidence,
    policyControls: [],
    recommendedAction: String(item.action || "").replace(/_/g, " ") || item.reason,
    approvalState: "Pending human approval",
    auditTrail: [],
  };
}

// ─── Slide-over panel drawer ──────────────────────────────────────────────────
function PanelDrawer({ open, title, accent = C.cyan, onClose, children }) {
  return (
    <div style={{
      position:"absolute", top:0, right:0, bottom:0,
      width: open ? "clamp(360px, 44%, 620px)" : 0,
      overflow:"hidden",
      transition:"width 0.32s cubic-bezier(0.22,1,0.36,1)",
      zIndex:20,
      pointerEvents: open ? "all" : "none",
    }}>
      <div style={{
        width:"clamp(360px, 44%, 620px)",
        height:"100%",
        background:"#1e1e1e",
        borderLeft:`1px solid ${rgba(accent,0.3)}`,
        boxShadow:`-12px 0 48px rgba(0,0,0,0.7), inset 1px 0 0 ${rgba(accent,0.08)}`,
        backdropFilter:"blur(20px)",
        display:"flex", flexDirection:"column",
        overflow:"hidden",
      }}>
        {/* Drawer header */}
        <div style={{
          display:"flex", alignItems:"center", justifyContent:"space-between",
          padding:"12px 18px",
          borderBottom:`1px solid rgba(212,212,212,0.08)`,
          background:`linear-gradient(90deg, ${rgba(accent,0.08)}, transparent)`,
          flexShrink:0,
        }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ width:3, height:14, background:accent, borderRadius:2, boxShadow:`0 0 8px ${accent}` }} />
            <span style={{ fontSize:9, letterSpacing:"0.22em", textTransform:"uppercase", color:rgba(accent,0.9), fontWeight:700 }}>{title}</span>
          </div>
          <button type="button" onClick={onClose}
            style={{ width:26, height:26, borderRadius:6, border:`1px solid rgba(255,255,255,0.10)`,
              background:"rgba(212,212,212,0.04)", color:"rgba(255,255,255,0.55)", fontSize:13, cursor:"pointer",
              display:"flex", alignItems:"center", justifyContent:"center", lineHeight:1 }}>✕</button>
        </div>
        {/* Drawer body */}
        <div style={{ flex:1, overflowY:"auto", padding:"16px 18px" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

// ─── Drawer content panels ─────────────────────────────────────────────────────
// Reusable action strip for drawer panels
function DrawerActions({ actions, run }) {
  if (!actions?.length) return null;
  return (
    <div style={{
      marginTop:20, paddingTop:14,
      borderTop:"1px solid rgba(212,212,212,0.08)",
      display:"flex", flexDirection:"column", gap:7,
    }}>
      <div style={{ fontSize:8, color:C.muted, letterSpacing:"0.2em", textTransform:"uppercase", marginBottom:2 }}>ACTIONS</div>
      {actions.map(({ label, cmd, accent=C.cyan, glow="99,245,255" }) => (
        <button key={label} type="button" onClick={() => run?.(cmd)}
          style={{
            padding:"11px 14px", borderRadius:8, cursor:"pointer", textAlign:"left",
            background:`linear-gradient(90deg,rgba(${glow},0.10),#111111)`,
            border:`1px solid rgba(${glow},0.40)`,
            borderLeft:`2px solid rgba(${glow},0.85)`,
            color:C.text, fontSize:11, fontWeight:600,
            display:"flex", alignItems:"center", gap:10,
            transition:"all 0.15s",
            boxShadow:`0 0 12px rgba(${glow},0.06)`,
          }}>
          <span style={{ color:accent, fontSize:9, filter:`drop-shadow(0 0 4px rgba(${glow},0.7))` }}>▶</span>
          {label}
        </button>
      ))}
    </div>
  );
}

function downloadTextReport(filename, lines) {
  const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function reportHeader(title) {
  const now = new Date();
  return [
    "=".repeat(72),
    `ARIA GUARDIAN — ${title}`,
    `Generated: ${now.toLocaleString()}`,
    "=".repeat(72),
    "",
  ];
}

function evidenceFromAiSpmFinding(finding, aiSpmSummary) {
  const f = typeof finding === "string" ? { summary: finding } : (finding || {});
  return {
    source: f.source || f.provider || aiSpmSummary?.mode || "AI-SPM scanner",
    timestamp: f.detected_at || f.timestamp || f.created_at,
    affectedEntities: [f.asset, f.resource, f.target].filter(Boolean),
    relatedFindings: [],
    timeline: [],
    blastRadius: f.impact || f.scope,
    confidence: f.confidence ?? f.severity,
    policyControls: [],
    recommendedAction: f.recommendation || f.remediation,
    approvalState: f.status,
    auditTrail: [],
  };
}

function AiSpmDrawerBody({ aiSpmSummary }) {
  const [openIndex, setOpenIndex] = useState(null);
  const findings = aiSpmSummary?.findings_list || [];
  return (
    <div>
      <div style={{ display:"flex", gap:16, marginBottom:20, flexWrap:"wrap" }}>
        <Stat value={Number(aiSpmSummary?.finding_count??aiSpmSummary?.findings??findings.length??0)} label="Findings" color={C.amber} />
        <Stat value={Number(aiSpmSummary?.asset_count??aiSpmSummary?.assets??(aiSpmSummary?.asset_list||[]).length??0)} label="Assets" color={C.green} />
        <Stat value={Number(aiSpmSummary?.secret_count??aiSpmSummary?.secrets??0)} label="Secrets" color={C.red} />
      </div>
      {aiSpmSummary?.mode && <div style={{ fontSize:10, color:C.sub, marginBottom:10 }}>Mode: <span style={{ color:C.text, fontFamily:"ui-monospace,monospace" }}>{aiSpmSummary.mode}</span></div>}
      {findings.map((f,i) => (
        <div key={i} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8, padding:"8px 10px", borderRadius:7, border:`1px solid ${rgba(C.teal,0.24)}`, background:rgba(C.teal,0.06), marginBottom:6 }}>
          <span style={{ fontSize:11, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{typeof f==="string"?f:(f.summary||f.title||JSON.stringify(f))}</span>
          <button type="button" onClick={() => setOpenIndex(i)} style={{ ...actionBtn(C.teal), padding:"4px 9px", fontSize:9, flexShrink:0 }}>Open Evidence</button>
        </div>
      ))}
      {findings.length === 0 && <Empty label="No AI-SPM details available" />}
      <EvidenceDrawer
        open={openIndex !== null}
        evidence={openIndex !== null ? evidenceFromAiSpmFinding(findings[openIndex], aiSpmSummary) : null}
        title="AI-SPM Finding Evidence"
        subtitle="Decision proof record"
        accent={C.teal}
        onClose={() => setOpenIndex(null)}
      />
    </div>
  );
}

function DrawerContent({ type, riskScore, threatLevel, vectors, incidents, liveIncidents,
  connections, memoryPercent, load, disks, processes, topCpuProcesses, logs, blockedIps,
  files, aiSpmSummary, sources, timeline, reviewItems, approvals, incidentCount24h,
  onResolve, executeAriaCommand }) {

  const incs  = (incidents?.length ? incidents : liveIncidents) || [];
  const cpuPs = (topCpuProcesses?.length ? topCpuProcesses : processes || []);
  const riskColor = riskScore >= 70 ? C.red : riskScore >= 40 ? C.amber : C.green;
  const memColor  = memoryPercent >= 82 ? C.red : memoryPercent >= 70 ? C.amber : C.green;
  const riskHist  = useLiveHistory(riskScore);
  const memHist   = useLiveHistory(memoryPercent);

  const Section = ({ label, children }) => (
    <div style={{ marginBottom:20 }}>
      <div style={{ fontSize:8, letterSpacing:"0.2em", color:C.muted, textTransform:"uppercase", marginBottom:8, display:"flex", alignItems:"center", gap:7 }}>
        <div style={{ width:16, height:1, background:"rgba(255,255,255,0.16)" }} />{label}
      </div>
      {children}
    </div>
  );

  if (type === "threat-posture") return (
    <div>
      <Section label="Risk Posture">
        <div style={{ display:"flex", alignItems:"center", gap:18, marginBottom:12 }}>
          <div style={{ position:"relative", flexShrink:0 }}>
            <Gauge value={riskScore} max={100} color={riskColor} label="Risk" size={120} />
            {riskScore >= 70 && <div style={{ position:"absolute", inset:-4, borderRadius:"50%", border:`1px solid ${rgba(C.red,0.3)}`, animation:"ccPulse 2s ease-in-out infinite", pointerEvents:"none" }} />}
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:22, fontWeight:800, color: riskColor, letterSpacing:"0.06em", marginBottom:4 }}>{threatLevel}</div>
            <div style={{ fontSize:10, color:C.sub }}>{riskScore >= 70 ? "Breach posture — immediate action required" : riskScore >= 40 ? "Elevated — monitor closely" : "Nominal operations"}</div>
            <div style={{ marginTop:10 }}><Sparkline values={riskHist} color={riskColor} w={200} h={36} /></div>
          </div>
        </div>
      </Section>
      <Section label={`Active Incidents (${incs.length})`}>
        {incs.length === 0 ? <Empty label="No incidents" /> : incs.map((inc, i) => {
          const sev = String(inc.severity||"medium").toLowerCase();
          const c = SEV[sev] || C.sub;
          return (
            <div key={i} style={{ padding:"9px 11px 9px 14px", borderRadius:8,
              border:`1px solid ${rgba(c,0.25)}`, background:rgba(c,0.05), marginBottom:6,
              borderLeft:`3px solid ${c}` }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                <SevBadge sev={sev} />
                <span style={{ fontSize:9, color:C.muted }}>{inc.status}</span>
              </div>
              <div style={{ fontSize:11, color:C.text, lineHeight:1.4 }}>{inc.title}</div>
            </div>
          );
        })}
      </Section>
      <DrawerActions run={(cmd) => {
        if (cmd === "Generate a live intelligence briefing covering all active threats, incidents, and system status") {
          const ts = new Date().toISOString().replace(/[:.]/g,"-").slice(0,19);
          const lines = [
            ...reportHeader("THREAT INTELLIGENCE BRIEFING"),
            `Risk Score  : ${riskScore}/100`,
            `Threat Level: ${threatLevel}`,
            "",
            "─".repeat(72),
            `ACTIVE INCIDENTS (${incs.length})`,
            "─".repeat(72),
            ...(incs.length === 0 ? ["  None"] : incs.map(i => `  [${String(i.severity||"medium").toUpperCase()}] ${i.title||i.id} — ${i.status||""}`)),
            "",
            "=".repeat(72),
            "END OF REPORT — ARIA Guardian Security Platform",
            "=".repeat(72),
          ];
          downloadTextReport(`aria-threat-briefing-${ts}.txt`, lines); return;
        }
        executeAriaCommand?.(cmd);
      }} actions={[
        { label:"Run deep threat scan", cmd:"Run a deep scan" },
        { label:"Generate threat briefing", cmd:"Generate a live intelligence briefing covering all active threats, incidents, and system status" },
        { label:"Escalate — contain active threats", cmd:"Contain suspicious threats", accent:"#007acc", glow:"0,122,204" },
      ]} />
    </div>
  );

  if (type === "threat-vectors") return (
    <div>
      <Section label={`All Threat Vectors (${(vectors||[]).length})`}>
        {(vectors||[]).length === 0 ? <Empty label="No vectors" /> : (vectors||[]).map((v, i) => {
          const score = Number(v.score||0);
          const c = score >= 80 ? C.red : score >= 50 ? C.amber : C.cyan;
          return (
            <div key={i} style={{ marginBottom:10 }}>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, marginBottom:3 }}>
                <span style={{ color:C.text }}>{v.label}</span>
                <span style={{ color:c, fontFamily:"ui-monospace,monospace", fontWeight:700 }}>{score}</span>
              </div>
              <div style={{ height:6, background:"rgba(255,255,255,0.04)", borderRadius:3 }}>
                <div style={{ height:"100%", width:`${clamp(score,2,100)}%`, background:`linear-gradient(90deg,${rgba(c,0.5)},${c})`, borderRadius:3, transition:"width 0.6s ease" }} />
              </div>
            </div>
          );
        })}
      </Section>
      <DrawerActions run={(cmd) => {
        if (cmd === "Generate threat vectors analysis report") {
          const ts = new Date().toISOString().replace(/[:.]/g,"-").slice(0,19);
          const sorted = [...(vectors||[])].sort((a,b) => Number(b.score||0)-Number(a.score||0));
          const lines = [
            ...reportHeader("THREAT VECTOR ANALYSIS REPORT"),
            `Total vectors: ${sorted.length}`,
            "",
            "─".repeat(72),
            "VECTORS (sorted by score)",
            "─".repeat(72),
            ...sorted.map(v => {
              const score = Number(v.score||0);
              const sev = score >= 80 ? "CRITICAL" : score >= 50 ? "HIGH" : score >= 30 ? "MEDIUM" : "LOW";
              return `  ${String(score).padStart(3)}  [${sev.padEnd(8)}]  ${v.label||v.name||"unknown"}`;
            }),
            "",
            "=".repeat(72),
            "END OF REPORT — ARIA Guardian Security Platform",
            "=".repeat(72),
          ];
          downloadTextReport(`aria-vector-report-${ts}.txt`, lines); return;
        }
        executeAriaCommand?.(cmd);
      }} actions={[
        { label:"Run deep threat analysis",    cmd:"Run a deep scan" },
        { label:"Generate vector report",      cmd:"Generate threat vectors analysis report" },
        { label:"Contain top threat vector",   cmd:"Contain suspicious threats", accent:"#007acc", glow:"0,122,204" },
      ]} />
    </div>
  );

  if (type === "incident-feed") return (
    <div>
      <div style={{ display:"flex", gap:16, marginBottom:18 }}>
        <Stat value={incs.length} label="Open" color={incs.length ? C.amber : C.green} />
        <Stat value={incs.filter(i=>String(i.severity).toLowerCase()==="critical").length} label="Critical" color={C.red} />
        <Stat value={incidentCount24h||0} label="24h" color={C.sub} />
      </div>
      {incs.length === 0 ? <Empty label="No active incidents" /> : incs.map((inc, i) => {
        const sev = String(inc.severity||"medium").toLowerCase();
        const c = SEV[sev] || C.cyan;
        return (
          <div key={i} style={{ padding:"10px 12px 10px 14px", borderRadius:9,
            border:`1px solid ${rgba(c,0.28)}`, background:rgba(c,0.06), marginBottom:8,
            borderLeft:`3px solid ${c}` }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:5 }}>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                <SevBadge sev={sev} />
                <span style={{ fontSize:10, color:c, fontFamily:"ui-monospace,monospace" }}>{inc.id}</span>
              </div>
              <span style={{ fontSize:9, color:C.muted }}>{inc.status}</span>
            </div>
            <div style={{ fontSize:12, color:C.text, lineHeight:1.4 }}>{inc.title}</div>
            {inc.description && <div style={{ fontSize:10, color:C.sub, marginTop:4 }}>{inc.description}</div>}
          </div>
        );
      })}
      <DrawerActions run={(cmd) => {
        if (cmd === "Generate executive incident report") {
          const ts = new Date().toISOString().replace(/[:.]/g,"-").slice(0,19);
          const critical = incs.filter(i=>String(i.severity).toLowerCase()==="critical");
          const lines = [
            ...reportHeader("EXECUTIVE INCIDENT REPORT"),
            `Total open incidents : ${incs.length}`,
            `Critical             : ${critical.length}`,
            `Incidents in 24h     : ${incidentCount24h||0}`,
            "",
            "─".repeat(72),
            "INCIDENT DETAILS",
            "─".repeat(72),
            ...(incs.length === 0 ? ["  No active incidents"] : incs.flatMap(i => [
              `  ID       : ${i.id||"—"}`,
              `  Severity : ${String(i.severity||"medium").toUpperCase()}`,
              `  Status   : ${i.status||"—"}`,
              `  Title    : ${i.title||"—"}`,
              ...(i.description ? [`  Detail   : ${i.description}`] : []),
              "",
            ])),
            "=".repeat(72),
            "END OF REPORT — ARIA Guardian Security Platform",
            "=".repeat(72),
          ];
          downloadTextReport(`aria-incident-report-${ts}.txt`, lines); return;
        }
        executeAriaCommand?.(cmd);
      }} actions={[
        { label:"Generate incident report", cmd:"Generate executive incident report" },
        { label:"Contain all active threats", cmd:"Contain suspicious threats", accent:"#007acc", glow:"0,122,204" },
        { label:"Isolate affected endpoint",  cmd:"Isolate threat on affected endpoint", accent:"#007acc", glow:"0,122,204" },
      ]} />
    </div>
  );

  if (type === "system-health") return (
    <div>
      <Section label="Memory & Load">
        <div style={{ display:"flex", gap:16, marginBottom:14 }}>
          <div style={{ position:"relative", flexShrink:0 }}>
            <Gauge value={memoryPercent} max={100} color={memColor} label="Mem %" size={100} />
            {memoryPercent >= 82 && <div style={{ position:"absolute", inset:-3, borderRadius:"50%", border:`1px solid ${rgba(C.amber,0.42)}`, animation:"ccPulse 1.5s ease-in-out infinite", pointerEvents:"none" }} />}
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:10, color:C.sub, marginBottom:4 }}>Load average <span style={{ color: Number(load)>3?C.red:Number(load)>1.5?C.amber:C.text, fontFamily:"ui-monospace,monospace", fontWeight:700 }}>{Number(load||0).toFixed(2)}</span></div>
            <Sparkline values={memHist} color={memColor} w={200} h={40} />
          </div>
        </div>
      </Section>
      <Section label={`Top Processes (${cpuPs.length})`}>
        {cpuPs.slice(0,12).map((p,i) => {
          const cpu = Number(p.cpu ?? p.cpu_percent ?? 0);
          const c = cpu > 50 ? C.red : cpu > 20 ? C.amber : C.sub;
          return (
            <div key={i} style={{ display:"flex", alignItems:"center", gap:10, fontSize:10, padding:"4px 0", borderBottom:`1px solid rgba(212,212,212,0.04)` }}>
              <span style={{ color:C.muted, fontFamily:"ui-monospace,monospace", minWidth:20, textAlign:"right" }}>{i+1}</span>
              <span style={{ flex:1, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{p.name||p.comm||p.command||"proc"}</span>
              <span style={{ color:c, fontFamily:"ui-monospace,monospace", minWidth:52, textAlign:"right" }}>{cpu.toFixed(1)}%</span>
            </div>
          );
        })}
      </Section>
      <Section label={`Disks (${(disks||[]).length})`}>
        {(disks||[]).map((d,i) => {
          const pct = Number(d.use_percent??d.percent??d.used_percent??0);
          const c = pct >= 85 ? C.red : pct >= 70 ? C.amber : C.green;
          return (
            <div key={i} style={{ marginBottom:8 }}>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, marginBottom:3 }}>
                <span style={{ color:C.sub }}>{d.mount||d.filesystem||d.name}</span>
                <span style={{ color:c, fontFamily:"ui-monospace,monospace" }}>{pct}%</span>
              </div>
              <div style={{ height:5, background:"rgba(255,255,255,0.04)", borderRadius:3 }}>
                <div style={{ height:"100%", width:`${clamp(pct,1,100)}%`, background:c, borderRadius:3 }} />
              </div>
            </div>
          );
        })}
      </Section>
      <DrawerActions run={(cmd) => {
        if (cmd === "Generate technical incident report") {
          const ts = new Date().toISOString().replace(/[:.]/g,"-").slice(0,19);
          const lines = [
            ...reportHeader("SYSTEM HEALTH REPORT"),
            `Memory Usage : ${memoryPercent}%`,
            `Load Average : ${Number(load||0).toFixed(2)}`,
            "",
            "─".repeat(72),
            `TOP PROCESSES (${cpuPs.length})`,
            "─".repeat(72),
            ...cpuPs.slice(0,20).map((p,i) => {
              const cpu = Number(p.cpu??p.cpu_percent??0);
              return `  ${String(i+1).padStart(2)}.  ${(p.name||p.comm||p.command||"proc").padEnd(30)}  CPU: ${cpu.toFixed(1)}%`;
            }),
            "",
            "─".repeat(72),
            `DISK USAGE (${(disks||[]).length} volumes)`,
            "─".repeat(72),
            ...(disks||[]).map(d => {
              const pct = Number(d.use_percent??d.percent??d.used_percent??0);
              return `  ${(d.mount||d.filesystem||d.name||"?").padEnd(20)}  ${pct}% used`;
            }),
            "",
            "=".repeat(72),
            "END OF REPORT — ARIA Guardian Security Platform",
            "=".repeat(72),
          ];
          downloadTextReport(`aria-system-health-${ts}.txt`, lines); return;
        }
        if (cmd === "Show top CPU processes and analyze load") {
          const ts = new Date().toISOString().replace(/[:.]/g,"-").slice(0,19);
          const lines = [
            ...reportHeader("CPU PROCESS ANALYSIS"),
            `Load Average : ${Number(load||0).toFixed(2)}`,
            "",
            "─".repeat(72),
            "PROCESSES SORTED BY CPU",
            "─".repeat(72),
            ...[...cpuPs].sort((a,b)=>Number(b.cpu??b.cpu_percent??0)-Number(a.cpu??a.cpu_percent??0))
              .slice(0,30).map((p,i) => {
                const cpu = Number(p.cpu??p.cpu_percent??0);
                const flag = cpu > 50 ? " ◀ HIGH" : cpu > 20 ? " ◀ ELEVATED" : "";
                return `  ${String(i+1).padStart(2)}.  ${(p.name||p.comm||p.command||"proc").padEnd(30)}  ${cpu.toFixed(1)}%${flag}`;
              }),
            "",
            "=".repeat(72),
            "END OF REPORT — ARIA Guardian Security Platform",
            "=".repeat(72),
          ];
          downloadTextReport(`aria-cpu-analysis-${ts}.txt`, lines); return;
        }
        executeAriaCommand?.(cmd);
      }} actions={[
        { label:"Generate system health report", cmd:"Generate technical incident report" },
        { label:"Analyze high-CPU processes",    cmd:"Show top CPU processes and analyze load" },
      ]} />
    </div>
  );

  if (type === "network") return (
    <div>
      <div style={{ display:"flex", gap:16, marginBottom:18 }}>
        <Stat value={(connections||[]).length} label="Total" color={C.blue} />
        <Stat value={(connections||[]).filter(c=>c.state==="BLOCKED").length} label="Blocked" color={C.red} />
        <Stat value={(connections||[]).filter(c=>c.state==="ESTABLISHED").length} label="Established" color={C.green} />
      </div>
      <div style={{ maxHeight:380, overflowY:"auto" }}>
        {(connections||[]).slice(0,40).map((c,i) => {
          const stateColor = { ESTABLISHED:"rgba(0,122,204,0.5)", BLOCKED:C.red, LISTENING:"rgba(255,255,255,0.5)", TIME_WAIT:C.amber }[c.state] || C.sub;
          return (
            <div key={i} style={{ display:"grid", gridTemplateColumns:"1fr auto", gap:8, fontSize:10, padding:"5px 0", borderBottom:`1px solid rgba(212,212,212,0.04)` }}>
              <span style={{ color:C.sub, fontFamily:"ui-monospace,monospace", overflow:"hidden", textOverflow:"ellipsis" }}>{c.remote||c.address||c.peer||`conn-${i}`}</span>
              <span style={{ color:stateColor, fontFamily:"ui-monospace,monospace", fontSize:9, letterSpacing:"0.06em" }}>{c.state}</span>
            </div>
          );
        })}
      </div>
      <DrawerActions run={(cmd) => {
        if (cmd === "Export network connections report") {
          const ts = new Date().toISOString().replace(/[:.]/g,"-").slice(0,19);
          const conns = connections||[];
          const lines = [
            ...reportHeader("NETWORK CONNECTION REPORT"),
            `Total connections  : ${conns.length}`,
            `Established        : ${conns.filter(c=>c.state==="ESTABLISHED").length}`,
            `Blocked            : ${conns.filter(c=>c.state==="BLOCKED").length}`,
            `Listening          : ${conns.filter(c=>c.state==="LISTENING").length}`,
            "",
            "─".repeat(72),
            "ALL CONNECTIONS",
            "─".repeat(72),
            ...conns.map((c,i) => {
              const addr = c.remote||c.address||c.peer||`conn-${i}`;
              return `  ${String(i+1).padStart(3)}.  ${addr.padEnd(40)}  ${c.state||""}`;
            }),
            "",
            "=".repeat(72),
            "END OF REPORT — ARIA Guardian Security Platform",
            "=".repeat(72),
          ];
          downloadTextReport(`aria-network-connections-${ts}.txt`, lines); return;
        }
        executeAriaCommand?.(cmd);
      }} actions={[
        { label:"Block suspicious connections",  cmd:"Block suspicious network connections" },
        { label:"Export network connection list", cmd:"Export network connections report" },
        { label:"Isolate affected endpoint",      cmd:"Isolate threat on affected endpoint", accent:"#007acc", glow:"0,122,204" },
      ]} />
    </div>
  );

  if (type === "logs") {
    const parsedLogs = (logs||[]).map((l,i) => {
      const msg   = typeof l === "string" ? l : (l.message||l.summary||l.title||"");
      const ts    = (l&&l.time)||(l&&l.ts)||null;
      const level = typeof l === "object" ? (l.level||l.severity||"info").toUpperCase() : "INFO";
      return { index: i, ts, level, msg };
    });

    const downloadLogReport = (analyzeErrors) => {
      const now = new Date();
      const ts  = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const filename = analyzeErrors ? `aria-error-analysis-${ts}.txt` : `aria-live-logs-${ts}.txt`;

      let lines = [];
      lines.push("=".repeat(72));
      lines.push(analyzeErrors ? "ARIA GUARDIAN — ERROR PATTERN ANALYSIS REPORT" : "ARIA GUARDIAN — LIVE LOG EXPORT");
      lines.push(`Generated: ${now.toLocaleString()}`);
      lines.push(`Total entries: ${parsedLogs.length}`);
      lines.push("=".repeat(72));
      lines.push("");

      if (analyzeErrors) {
        const errors = parsedLogs.filter(l => l.level === "ERROR");
        const warns  = parsedLogs.filter(l => l.level === "WARN");
        lines.push(`SUMMARY`);
        lines.push(`  Total logs   : ${parsedLogs.length}`);
        lines.push(`  Errors       : ${errors.length}`);
        lines.push(`  Warnings     : ${warns.length}`);
        lines.push(`  Info/Other   : ${parsedLogs.length - errors.length - warns.length}`);
        lines.push("");
        if (errors.length > 0) {
          lines.push("─".repeat(72));
          lines.push("ERRORS");
          lines.push("─".repeat(72));
          errors.forEach(l => {
            const t = l.ts ? new Date(l.ts).toLocaleTimeString() : "--:--:--";
            lines.push(`  [${t}] ${l.msg}`);
          });
          lines.push("");
        }
        if (warns.length > 0) {
          lines.push("─".repeat(72));
          lines.push("WARNINGS");
          lines.push("─".repeat(72));
          warns.forEach(l => {
            const t = l.ts ? new Date(l.ts).toLocaleTimeString() : "--:--:--";
            lines.push(`  [${t}] ${l.msg}`);
          });
          lines.push("");
        }
        lines.push("─".repeat(72));
        lines.push("ALL ENTRIES");
        lines.push("─".repeat(72));
      }

      parsedLogs.forEach(l => {
        const t = l.ts ? new Date(l.ts).toLocaleTimeString() : "--:--:--";
        lines.push(`[${t}] ${l.level.padEnd(5)} ${l.msg}`);
      });

      lines.push("");
      lines.push("=".repeat(72));
      lines.push("END OF REPORT — ARIA Guardian Security Platform");
      lines.push("=".repeat(72));

      const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    };

    return (
      <div>
        <div style={{ display:"flex", flexDirection:"column", gap:4, maxHeight:400, overflowY:"auto" }}>
          {parsedLogs.length === 0 ? <Empty label="No logs yet" /> : parsedLogs.map(({ index, ts, level, msg }) => {
            const lc = { ERROR:C.red, WARN:C.amber, INFO:C.cyan, DEBUG:C.sub }[level] || C.sub;
            return (
              <div key={index} style={{ display:"flex", gap:8, fontSize:10, padding:"5px 0", borderBottom:`1px solid rgba(212,212,212,0.04)` }}>
                <span style={{ color:rgba(C.cyan,0.45), flexShrink:0, fontFamily:"ui-monospace,monospace", fontSize:9 }}>{ts ? new Date(ts).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"}) : "--:--:--"}</span>
                <span style={{ color:lc, flexShrink:0, fontSize:9, letterSpacing:"0.06em", minWidth:36 }}>{level}</span>
                <span style={{ color:C.text, lineHeight:1.4 }}>{msg}</span>
              </div>
            );
          })}
        </div>
        <DrawerActions run={(cmd) => {
          if (cmd === "Export and analyze live log stream") { downloadLogReport(false); return; }
          if (cmd === "Analyze error patterns in live logs") { downloadLogReport(true); return; }
          executeAriaCommand?.(cmd);
        }} actions={[
          { label:"Export live logs",          cmd:"Export and analyze live log stream" },
          { label:"Analyze error patterns",    cmd:"Analyze error patterns in live logs" },
        ]} />
      </div>
    );
  }

  if (type === "defense") return (
    <div>
      <Section label={`Blocked IPs (${(blockedIps||[]).length})`}>
        {(blockedIps||[]).length === 0 ? <Empty label="None blocked" /> : (blockedIps||[]).map((ip,i) => (
          <div key={i} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", fontSize:10, padding:"5px 0", borderBottom:`1px solid rgba(212,212,212,0.04)` }}>
            <span style={{ color:C.text, fontFamily:"ui-monospace,monospace" }}>{typeof ip==="string" ? ip : (ip.ip||ip.address||JSON.stringify(ip))}</span>
            <SevBadge sev="high" />
          </div>
        ))}
      </Section>
      <Section label={`Quarantine (${(files||[]).length})`}>
        {(files||[]).length === 0 ? <Empty label="Quarantine empty" /> : (files||[]).map((f,i) => (
          <div key={i} style={{ fontSize:10, color:C.sub, padding:"4px 0", borderBottom:`1px solid rgba(212,212,212,0.04)` }}>
            {typeof f==="string" ? f : (f.path||f.name||f.file||JSON.stringify(f))}
          </div>
        ))}
      </Section>
      <DrawerActions run={(cmd) => {
        if (cmd === "Generate technical incident report") {
          const ts = new Date().toISOString().replace(/[:.]/g,"-").slice(0,19);
          const ips = blockedIps||[];
          const qfiles = files||[];
          const lines = [
            ...reportHeader("ACTIVE DEFENSE REPORT"),
            `Blocked IPs      : ${ips.length}`,
            `Quarantined files: ${qfiles.length}`,
            "",
            "─".repeat(72),
            "BLOCKED IPs",
            "─".repeat(72),
            ...(ips.length === 0 ? ["  None"] : ips.map(ip => `  ${typeof ip==="string" ? ip : (ip.ip||ip.address||JSON.stringify(ip))}`)),
            "",
            "─".repeat(72),
            "QUARANTINE",
            "─".repeat(72),
            ...(qfiles.length === 0 ? ["  Empty"] : qfiles.map(f => `  ${typeof f==="string" ? f : (f.path||f.name||f.file||JSON.stringify(f))}`)),
            "",
            "=".repeat(72),
            "END OF REPORT — ARIA Guardian Security Platform",
            "=".repeat(72),
          ];
          downloadTextReport(`aria-defense-report-${ts}.txt`, lines); return;
        }
        executeAriaCommand?.(cmd);
      }} actions={[
        { label:"Block all suspicious IPs",    cmd:"Block suspicious network connections", accent:"#007acc", glow:"0,122,204" },
        { label:"Quarantine flagged files",     cmd:"Quarantine flagged files" },
        { label:"Generate defense report",      cmd:"Generate technical incident report" },
      ]} />
    </div>
  );

  if (type === "ai-spm") return (
    <AiSpmDrawerBody aiSpmSummary={aiSpmSummary} />
  );

  if (type === "sources") return (
    <div>
      <div style={{ fontSize:10, color:C.sub, marginBottom:14 }}>{(sources||[]).filter(s=>s.status==="live").length} of {(sources||[]).length} sources live</div>
      {(sources||[]).map((s,i) => {
        const live = s.status === "live";
        return (
          <div key={s.id||i} style={{ display:"grid", gridTemplateColumns:"auto 1fr auto auto", gap:10, alignItems:"center", padding:"8px 0", borderBottom:`1px solid rgba(212,212,212,0.04)` }}>
            <Dot on={live} color={C.green} />
            <div>
              <div style={{ fontSize:11, color:C.text }}>{s.id||s.name||"source"}</div>
              {s.type && <div style={{ fontSize:9, color:C.muted }}>{s.type}</div>}
            </div>
            <span style={{ fontSize:9, color:live?"rgba(0,122,204,0.6)":rgba(C.red,0.7), textTransform:"uppercase", letterSpacing:"0.08em" }}>{s.status||"unknown"}</span>
          </div>
        );
      })}
    </div>
  );

  if (type === "review") return (
    <div>
      <Section label={`Review Items (${(reviewItems||[]).length})`}>
        {(reviewItems||[]).length === 0 ? <Empty label="Nothing to review" /> : (reviewItems||[]).map((item,i) => (
          <div key={i} style={{ display:"flex", gap:8, fontSize:11, padding:"6px 0", borderBottom:`1px solid rgba(212,212,212,0.04)`, color:C.text }}>
            <span style={{ color:C.amber }}>›</span>{item}
          </div>
        ))}
      </Section>
      <Section label={`Pending Approvals (${(approvals||[]).length})`}>
        {(approvals||[]).length === 0 ? <Empty label="Queue clear" /> : (approvals||[]).map((a,i) => (
          <div key={i} style={{ padding:"9px 12px", borderRadius:8, border:`1px solid ${rgba(C.amber,0.28)}`, background:rgba(C.amber,0.07), marginBottom:8 }}>
            <div style={{ fontSize:11, color:C.text, marginBottom:6 }}>{a.reason||a.action}</div>
            <div style={{ display:"flex", gap:8 }}>
              <button type="button" onClick={() => onResolve?.(a.id,"approve")} style={{ ...actionBtn("rgba(0,122,204,0.6)"), flex:1, textAlign:"center", background:"rgba(30,160,60,0.85)", border:"1px solid rgba(50,200,80,0.8)", color:"#fff", }}>APPROVE</button>
              <button type="button" onClick={() => onResolve?.(a.id,"deny")}    style={{ ...actionBtn(C.red), flex:1, textAlign:"center", background:"rgba(200,30,30,0.85)", border:"1px solid rgba(220,50,50,0.8)", color:"#fff" }}>DENY</button>
            </div>
          </div>
        ))}
      </Section>
    </div>
  );

  if (type === "timeline") return (
    <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
      {(timeline||[]).length === 0 ? <Empty label="No timeline events" /> : (timeline||[]).map((e,i) => {
        const sev = String(e.severity||"info").toLowerCase();
        const c = SEV[sev] || C.purple;
        const ts = e.time||e.ts||e.timestamp;
        return (
          <div key={i} style={{ display:"flex", gap:10, padding:"8px 10px", borderRadius:8, border:`1px solid ${rgba(c,0.2)}`, background:rgba(c,0.05) }}>
            <Dot on color={c} />
            <div style={{ flex:1 }}>
              {ts && <div style={{ fontSize:9, color:C.muted, marginBottom:2, fontFamily:"ui-monospace,monospace" }}>{new Date(ts).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"})}</div>}
              <div style={{ fontSize:11, color:C.text, lineHeight:1.4 }}>{e.label||e.title||e.message||e.summary}</div>
            </div>
            <SevBadge sev={sev} />
          </div>
        );
      })}
      <DrawerActions run={(cmd) => {
        const events = timeline||[];
        const ts = new Date().toISOString().replace(/[:.]/g,"-").slice(0,19);
        if (cmd === "Export threat timeline report") {
          const lines = [
            ...reportHeader("THREAT TIMELINE EXPORT"),
            `Total events: ${events.length}`,
            "",
            "─".repeat(72),
            "TIMELINE",
            "─".repeat(72),
            ...(events.length === 0 ? ["  No events"] : events.map(e => {
              const t = (e.time||e.ts||e.timestamp) ? new Date(e.time||e.ts||e.timestamp).toLocaleString() : "—";
              const sev = String(e.severity||"info").toUpperCase();
              return `  [${t}]  [${sev.padEnd(8)}]  ${e.label||e.title||e.message||e.summary||""}`;
            })),
            "",
            "=".repeat(72),
            "END OF REPORT — ARIA Guardian Security Platform",
            "=".repeat(72),
          ];
          downloadTextReport(`aria-timeline-${ts}.txt`, lines); return;
        }
        if (cmd === "Generate AI attack narrative") {
          const lines = [
            ...reportHeader("ATTACK NARRATIVE REPORT"),
            `Events analysed: ${events.length}`,
            "",
            "─".repeat(72),
            "CHRONOLOGICAL ATTACK NARRATIVE",
            "─".repeat(72),
            ...(events.length === 0 ? ["  No timeline events to narrate."] : events.map((e,i) => {
              const t = (e.time||e.ts||e.timestamp) ? new Date(e.time||e.ts||e.timestamp).toLocaleString() : "unknown time";
              const label = e.label||e.title||e.message||e.summary||"event";
              const sev = String(e.severity||"info").toLowerCase();
              return `  ${String(i+1).padStart(2)}. At ${t}, a ${sev}-severity event was recorded: "${label}"`;
            })),
            "",
            "─".repeat(72),
            "SUMMARY",
            "─".repeat(72),
            `  Total events    : ${events.length}`,
            `  Critical events : ${events.filter(e=>String(e.severity).toLowerCase()==="critical").length}`,
            `  High events     : ${events.filter(e=>String(e.severity).toLowerCase()==="high").length}`,
            "",
            "=".repeat(72),
            "END OF REPORT — ARIA Guardian Security Platform",
            "=".repeat(72),
          ];
          downloadTextReport(`aria-attack-narrative-${ts}.txt`, lines); return;
        }
        executeAriaCommand?.(cmd);
      }} actions={[
        { label:"Export timeline",            cmd:"Export threat timeline report" },
        { label:"Generate incident narrative", cmd:"Generate AI attack narrative" },
      ]} />
    </div>
  );

  return <Empty label={`No expanded view for "${type}"`} />;
}

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function CommandCenterPane({
  liveFeed = [], panelOptions = [],
  executeAriaCommand, processCommand,
  ariaInput, setAriaInput,
  agentStatus = "offline",
  adminTenantRows = [], adminRoleRows = [],
  authzDenialRows = [],
  tenantContextLoading = false, authzDenialsLoading = false,
  sources = [], approvals = [],
  riskScore = 0, connections = [], incidents = [],
  // Console parity props
  threatLevel = "UNKNOWN", memoryPercent = 0,
  reviewItems = [], approvalQueue = [], onResolveApproval,
  liveIncidents = [],
  panelPhase = "monitoring", pendingTask = "", currentTask = "",
  onConfirmTask, onCancelConfirm,
  onClose,
  // Live monitor props (full telemetry surface)
  vectors = [], timeline = [], logs = [], processes = [],
  topCpuProcesses = [], disks = [],
  files = [], blockedIps = [], aiSpmSummary = {},
  load = 0, incidentCount24h = 0,
  operationalLoop = null,
}) {
  const bgRef = useBgCanvas();
  const [tab, setTab] = useState("command");
  const [demoScanSignal, setDemoScanSignal] = useState(0);
  const [demoCommandFocusSignal, setDemoCommandFocusSignal] = useState(0);
  const [scanTick, setScanTick] = useState(0);
  const [drawer, setDrawer] = useState(null); // { type, title, accent } | null
  const [evidenceDrawerOpen, setEvidenceDrawerOpen] = useState(false);

  const onScanComplete = useCallback(() => setScanTick(t => t+1), []);
  const effApprovals = approvalQueue.length ? approvalQueue : approvals;
  const openDrawer  = useCallback((info) => setDrawer(info), []);
  const closeDrawer = useCallback(() => setDrawer(null), []);
  const operationalEvidence = useMemo(() => evidenceFromOperationalLoop(operationalLoop), [operationalLoop]);

  useEffect(() => {
    const onDemoAction = (event) => {
      const detail = event?.detail || {};
      if (detail.tab) setTab(detail.tab);
      if (detail.runScan) setDemoScanSignal((value) => value + 1);
      if (detail.focusCommand) setDemoCommandFocusSignal((value) => value + 1);
    };
    window.addEventListener("aria:command-center-demo", onDemoAction);
    return () => window.removeEventListener("aria:command-center-demo", onDemoAction);
  }, []);

  return (
    <div style={{ position:"absolute", inset:0, background:"#000000", display:"flex", flexDirection:"column", overflow:"hidden", fontFamily:"'Inter', ui-sans-serif, system-ui, sans-serif" }}>
      {/* BG canvas */}
      <canvas ref={bgRef} style={{ position:"absolute", inset:0, width:"100%", height:"100%", pointerEvents:"none", zIndex:0 }} />

      {/* Content stack */}
      <div style={{ position:"relative", zIndex:1, display:"flex", flexDirection:"column", height:"100%" }}>
        <TopBar agentStatus={agentStatus} riskScore={riskScore} threatLevel={threatLevel}
          sources={sources} reviewItems={reviewItems} approvals={effApprovals} memoryPercent={memoryPercent} onClose={onClose} />
        <TabBar active={tab} onChange={setTab} />
        <div style={{ display:"flex", alignItems:"center", justifyContent:"flex-end", padding:"6px 16px", borderBottom:"1px solid rgba(255,255,255,0.04)", flexShrink:0, background:"#0e0e0e" }}>
          <PanelNarrateControls
            panelId="aria-center"
            panelData={{ riskScore, threatLevel, activeSources: (sources||[]).filter(s=>s.status==="live").length, incidentCount: (incidents||[]).length }}
          />
        </div>

        <AlertRibbon approvalQueue={effApprovals} onResolveApproval={onResolveApproval}
          panelPhase={panelPhase} pendingTask={pendingTask} currentTask={currentTask}
          onConfirm={onConfirmTask} onCancelConfirm={onCancelConfirm} />

        {/* Main content + slide-over drawer */}
        <div style={{ flex:1, overflow:"hidden", position:"relative", display:"flex" }}>
          <div style={{ flex:1, overflow:"auto", padding:"14px 16px", transition:"margin-right 0.32s cubic-bezier(0.22,1,0.36,1)" }}>
            {tab === "command" && (
              <CommandFabricTab
                riskScore={riskScore}
                threatLevel={threatLevel}
                memoryPercent={memoryPercent}
                sources={sources}
                approvals={effApprovals}
                reviewItems={reviewItems}
                liveIncidents={liveIncidents}
                aiSpmSummary={aiSpmSummary}
                logs={logs}
                connections={connections}
                processes={processes}
                executeAriaCommand={executeAriaCommand}
                onResolveApproval={onResolveApproval}
                operationalLoop={operationalLoop}
                onOpenEvidence={() => setEvidenceDrawerOpen(true)}
              />
            )}
            {tab === "monitor" && (
              <MonitorTab
                riskScore={riskScore} threatLevel={threatLevel} vectors={vectors}
                incidents={incidents} liveIncidents={liveIncidents} connections={connections}
                memoryPercent={memoryPercent} load={load} disks={disks} processes={processes}
                topCpuProcesses={topCpuProcesses}
                logs={logs} blockedIps={blockedIps} files={files} aiSpmSummary={aiSpmSummary}
                sources={sources} timeline={timeline} reviewItems={reviewItems}
                approvals={effApprovals} incidentCount24h={incidentCount24h}
                processCommand={processCommand} openDrawer={openDrawer} executeAriaCommand={executeAriaCommand}
              />
            )}
            {tab === "scan"  && <ScanEngineTab executeAriaCommand={executeAriaCommand} onScanComplete={onScanComplete} autoStartSignal={demoScanSignal} />}
            {tab === "ops"   && <OperationsTab ariaInput={ariaInput} setAriaInput={setAriaInput} executeAriaCommand={executeAriaCommand} processCommand={processCommand} panelOptions={panelOptions} liveFeed={liveFeed} focusCommandSignal={demoCommandFocusSignal} />}
            {tab === "intel" && <IntelligenceTab authzDenialRows={authzDenialRows} authzDenialsLoading={authzDenialsLoading} liveFeed={liveFeed} liveIncidents={liveIncidents} reviewItems={reviewItems} scanHistoryTrigger={scanTick} />}
            {tab === "system"&& <SystemTab adminTenantRows={adminTenantRows} adminRoleRows={adminRoleRows} tenantContextLoading={tenantContextLoading} sources={sources} connections={connections} incidents={incidents} approvals={effApprovals} riskScore={riskScore} />}
          </div>

          {/* Slide-over drawer — overlays the content area */}
          <PanelDrawer open={!!drawer} title={drawer?.title || ""} accent={drawer?.accent || C.cyan} onClose={closeDrawer}>
            {drawer && (
              <DrawerContent
                type={drawer.type}
                riskScore={riskScore} threatLevel={threatLevel} vectors={vectors}
                incidents={incidents} liveIncidents={liveIncidents} connections={connections}
                memoryPercent={memoryPercent} load={load} disks={disks} processes={processes}
                topCpuProcesses={topCpuProcesses}
                logs={logs} blockedIps={blockedIps} files={files} aiSpmSummary={aiSpmSummary}
                sources={sources} timeline={timeline} reviewItems={reviewItems}
                approvals={effApprovals} incidentCount24h={incidentCount24h}
                onResolve={onResolveApproval} executeAriaCommand={executeAriaCommand}
              />
            )}
          </PanelDrawer>
          <EvidenceDrawer
            open={evidenceDrawerOpen}
            evidence={operationalEvidence}
            title="Guided Incident Evidence"
            subtitle="Decision proof record"
            accent={C.cyan}
            onClose={() => setEvidenceDrawerOpen(false)}
          />
        </div>
      </div>

      <style>{`
        @keyframes ccPulse  { 0%,100%{opacity:1;} 50%{opacity:0.4;} }
        @keyframes ccBlink  { 0%,100%{opacity:1;} 50%{opacity:0.3;} }
        @keyframes criticalFlash { 0%,100%{background:#cc1111;} 50%{background:#8b0000;} }
        ::-webkit-scrollbar { width:3px; height:3px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:rgba(0,122,204,0.35); border-radius:2px; }
        button:hover { filter: brightness(1.15); }
      `}</style>
    </div>
  );
}

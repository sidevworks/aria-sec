// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

// ════════════════════════════════════════════════════════════════════════════
// IDENTITY SECTOR · Policy Gate Visualiser
// Visualises real-time access requests as particles streaming from user →
// resource, intercepted at a glowing hexagonal ARIA gate in the centre.
// ════════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useRef, useCallback } from "react";
import { ariaFetch } from "../ariaFetch.js";

// ─── Hex geometry helpers ────────────────────────────────────────────────────
function hexPoints(cx, cy, r) {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 180) * (60 * i - 30);
    return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
  }).join(" ");
}

// ─── Result → visual token mapping ───────────────────────────────────────────
const RESULT_COLOR = {
  allow:   "var(--cx-cyan)",
  block:   "var(--cx-breach)",
  step_up: "var(--cx-amber)",
};

const RESULT_LABEL = {
  allow:   "ALLOW",
  block:   "BLOCK",
  step_up: "STEP-UP",
};

const BADGE_STYLE = {
  allow: {
    background: "var(--cx-cyan)",
    color: "var(--cx-void)",
  },
  block: {
    background: "var(--cx-breach)",
    color: "var(--cx-text)",
  },
  step_up: {
    background: "var(--cx-amber)",
    color: "var(--cx-void)",
  },
};

// ─── Particle component ───────────────────────────────────────────────────────
// SVG width is split into 3 equal zones: left (users), center (gate), right (resources).
// Particles animate within a defined lane using CSS keyframes.
const PARTICLE_LANES = 5;
const SVG_W = 600;
const SVG_H = 140;
const GATE_CX = SVG_W / 2;
const GATE_CY = SVG_H / 2;
const HEX_R = 32;

function Particle({ event, lane, startedAt }) {
  const result = event?.result ?? "allow";
  const color = RESULT_COLOR[result] ?? RESULT_COLOR.allow;
  const laneY = 28 + (lane / (PARTICLE_LANES - 1)) * (SVG_H - 56);
  const duration = result === "block" ? 1.4 : result === "step_up" ? 2.2 : 1.8;
  const animId = `pgv-particle-${lane}-${startedAt}`;

  // For "block": stop near center (gate), fade. translateX target is ~0% (center - left).
  // For "step_up": pause near center, then continue.
  // For "allow": flow all the way through.

  let styleInner;
  if (result === "allow") {
    styleInner = {
      animation: `id-particle-flow ${duration}s var(--cx-ease-cosmic) infinite`,
    };
  } else if (result === "block") {
    styleInner = {
      animation: `pgv-block-flow ${duration}s var(--cx-ease-cosmic) infinite`,
    };
  } else {
    // step_up
    styleInner = {
      animation: `pgv-stepup-flow ${duration}s var(--cx-ease-cosmic) infinite`,
    };
  }

  const blockIcon = result === "block" ? (
    <text
      x={GATE_CX}
      y={laneY - 8}
      textAnchor="middle"
      fontSize="10"
      fill="var(--cx-breach)"
      style={{ fontFamily: "monospace", opacity: 0.9 }}
    >✗</text>
  ) : null;

  const stepLabel = result === "step_up" ? (
    <text
      x={GATE_CX}
      y={laneY - 8}
      textAnchor="middle"
      fontSize="9"
      fill="var(--cx-amber)"
      style={{ fontFamily: "monospace", opacity: 0.85 }}
    >MFA?</text>
  ) : null;

  return (
    <g>
      {blockIcon}
      {stepLabel}
      <circle
        key={animId}
        r={3}
        fill={color}
        cx={0}
        cy={laneY}
        style={{
          filter: `drop-shadow(0 0 4px ${color})`,
          transformOrigin: `${GATE_CX}px ${laneY}px`,
          ...styleInner,
        }}
      />
    </g>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function PolicyGateVisualiser() {
  const [events, setEvents] = useState([]);
  const [dataMode, setDataMode] = useState(null);
  const [error, setError] = useState(null);
  const pollRef = useRef(null);
  const mountedRef = useRef(true);

  const fetchData = useCallback(async () => {
    const result = await ariaFetch("GET", "/api/identity/access-events");
    if (!mountedRef.current) return;
    if (result?.error) {
      setError(result.error);
      return;
    }
    if (result?.data) {
      setDataMode(result.data.dataMode ?? null);
      setEvents(result.data.events ?? []);
      setError(null);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchData();
    pollRef.current = setInterval(fetchData, 15_000);
    return () => {
      mountedRef.current = false;
      clearInterval(pollRef.current);
    };
  }, [fetchData]);

  // Pick up to PARTICLE_LANES recent events to drive particles
  const particleEvents = events.slice(0, PARTICLE_LANES);

  // Last 5 events for the events panel
  const recentEvents = events.slice(0, 5);

  const hexPts = hexPoints(GATE_CX, GATE_CY, HEX_R);

  // Flow path arrows (left side → gate, gate → right side)
  const arrowY = GATE_CY;

  return (
    <div style={styles.root} className="cx-panel">
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.title} className="cx-readout">Policy Gate Visualiser</span>
        {dataMode === "sample" && (
          <span style={styles.sampleBadge} className="cx-readout">SAMPLE DATA</span>
        )}
      </div>

      {/* SVG Scene */}
      <div style={styles.sceneWrap}>
        <svg
          width="100%"
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          style={styles.svg}
          aria-label="Policy gate particle stream"
        >
          {/* ── Dashed flow lanes ── */}
          {Array.from({ length: PARTICLE_LANES }, (_, i) => {
            const ly = 28 + (i / (PARTICLE_LANES - 1)) * (SVG_H - 56);
            return (
              <line
                key={i}
                x1={30} y1={ly}
                x2={SVG_W - 30} y2={ly}
                stroke="var(--cx-panel-line)"
                strokeWidth={0.5}
                strokeDasharray="4 6"
              />
            );
          })}

          {/* ── Arrow guides ── */}
          {/* Left → Gate */}
          <line
            x1={30} y1={arrowY}
            x2={GATE_CX - HEX_R - 6} y2={arrowY}
            stroke="var(--cx-panel-line)"
            strokeWidth={1}
            markerEnd="url(#pgv-arrowhead)"
          />
          {/* Gate → Right */}
          <line
            x1={GATE_CX + HEX_R + 6} y1={arrowY}
            x2={SVG_W - 30} y2={arrowY}
            stroke="var(--cx-panel-line)"
            strokeWidth={1}
            markerEnd="url(#pgv-arrowhead)"
          />

          {/* ── Defs ── */}
          <defs>
            <marker id="pgv-arrowhead" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M0,0 L0,6 L6,3 z" fill="var(--cx-panel-line)" />
            </marker>
          </defs>

          {/* ── Particles ── */}
          {particleEvents.map((ev, i) => (
            <Particle
              key={ev.id ?? i}
              event={ev}
              lane={i}
              startedAt={ev.timestamp ?? i}
            />
          ))}

          {/* ── Hexagonal Gate ── */}
          <polygon
            points={hexPts}
            fill="var(--cx-panel-bg)"
            stroke="var(--cx-cyan)"
            strokeWidth={1.5}
            style={{
              filter: "drop-shadow(0 0 10px var(--cx-cyan))",
              animation: "id-galaxy-breathe 4s ease-in-out infinite",
              transformOrigin: `${GATE_CX}px ${GATE_CY}px`,
            }}
          />

          {/* ── POLICY GATE label ── */}
          <text
            x={GATE_CX}
            y={GATE_CY - HEX_R - 6}
            textAnchor="middle"
            fontSize="8"
            fill="var(--cx-cyan)"
            style={{ fontFamily: "ui-monospace, SF Mono, Menlo, monospace", letterSpacing: "0.14em" }}
          >
            POLICY GATE
          </text>

          {/* ── ARIA logo text inside hex ── */}
          <text
            x={GATE_CX}
            y={GATE_CY + 4}
            textAnchor="middle"
            fontSize="9"
            fill="var(--cx-cyan)"
            style={{ fontFamily: "ui-monospace, SF Mono, Menlo, monospace", fontWeight: 700, opacity: 0.8 }}
          >
            ARIA
          </text>

          {/* ── Side labels ── */}
          <text x={22} y={GATE_CY + 4} textAnchor="middle" fontSize="9" fill="var(--cx-text-dim)"
            style={{ fontFamily: "ui-monospace, SF Mono, Menlo, monospace", writingMode: "vertical-lr" }}>
            USERS
          </text>
          <text x={SVG_W - 22} y={GATE_CY + 4} textAnchor="middle" fontSize="9" fill="var(--cx-text-dim)"
            style={{ fontFamily: "ui-monospace, SF Mono, Menlo, monospace", writingMode: "vertical-lr" }}>
            RESOURCES
          </text>
        </svg>

        {/* ── Keyframe styles injected via <style> ── */}
        <style>{`
          @keyframes pgv-block-flow {
            0%   { transform: translateX(-50vw); opacity: 0; }
            10%  { opacity: 1; }
            50%  { transform: translateX(0px);   opacity: 1; }
            70%  { transform: translateX(0px);   opacity: 0.6; }
            100% { transform: translateX(0px);   opacity: 0; }
          }
          @keyframes pgv-stepup-flow {
            0%   { transform: translateX(-50vw); opacity: 0; }
            10%  { opacity: 1; }
            45%  { transform: translateX(0px);   opacity: 1; }
            65%  { transform: translateX(0px);   opacity: 1; }
            100% { transform: translateX(50vw);  opacity: 0; }
          }
        `}</style>
      </div>

      {/* ── Events Panel ── */}
      <div style={styles.eventsPanel}>
        <div style={styles.eventsPanelTitle} className="cx-readout">Recent Access Events</div>
        {error && (
          <div style={styles.errorRow} className="cx-readout" data-state="breach">
            {error}
          </div>
        )}
        {!error && recentEvents.length === 0 && (
          <div style={styles.emptyRow} className="cx-readout">Awaiting events…</div>
        )}
        {recentEvents.map((ev, i) => (
          <div key={ev.id ?? i} style={styles.eventRow}>
            <span style={styles.eventTime}>{formatTime(ev.timestamp)}</span>
            <span style={styles.eventUser}>{ev.userName ?? ev.userId ?? "—"}</span>
            <span style={styles.eventArrow}>→</span>
            <span style={styles.eventResource}>{ev.resourceName ?? ev.resourceId ?? "—"}</span>
            <span
              style={{
                ...styles.badge,
                ...BADGE_STYLE[ev.result] ?? BADGE_STYLE.allow,
              }}
            >
              {RESULT_LABEL[ev.result] ?? ev.result?.toUpperCase() ?? "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatTime(iso) {
  if (!iso) return "--:--";
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  } catch {
    return iso.slice(11, 19) || "--:--";
  }
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = {
  root: {
    width: "100%",
    minHeight: "300px",
    display: "flex",
    flexDirection: "column",
    gap: "0",
    padding: "14px 16px",
    boxSizing: "border-box",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "10px",
    flexShrink: 0,
  },
  title: {
    fontSize: "11px",
    letterSpacing: "0.16em",
    color: "var(--cx-text-dim)",
    fontFamily: "ui-monospace, SF Mono, Menlo, monospace",
    textTransform: "uppercase",
  },
  sampleBadge: {
    fontSize: "10px",
    letterSpacing: "0.12em",
    color: "var(--cx-amber)",
    fontFamily: "ui-monospace, SF Mono, Menlo, monospace",
    textTransform: "uppercase",
    border: "1px solid var(--cx-amber)",
    borderRadius: "3px",
    padding: "1px 6px",
  },
  sceneWrap: {
    position: "relative",
    flexShrink: 0,
    borderBottom: "1px solid var(--cx-panel-line)",
    marginBottom: "10px",
  },
  svg: {
    display: "block",
    width: "100%",
    height: "140px",
    overflow: "visible",
  },
  eventsPanel: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: "3px",
  },
  eventsPanelTitle: {
    fontSize: "10px",
    letterSpacing: "0.14em",
    color: "var(--cx-text-dim)",
    fontFamily: "ui-monospace, SF Mono, Menlo, monospace",
    textTransform: "uppercase",
    marginBottom: "5px",
  },
  eventRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "3px 0",
    borderBottom: "1px solid var(--cx-panel-line)",
    fontFamily: "ui-monospace, SF Mono, Menlo, monospace",
    fontSize: "11px",
    color: "var(--cx-text)",
  },
  eventTime: {
    color: "var(--cx-text-dim)",
    minWidth: "68px",
    flexShrink: 0,
    fontSize: "10px",
  },
  eventUser: {
    color: "var(--cx-cyan)",
    minWidth: "90px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    flexShrink: 0,
  },
  eventArrow: {
    color: "var(--cx-text-dim)",
    flexShrink: 0,
  },
  eventResource: {
    color: "var(--cx-text)",
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  badge: {
    fontSize: "9px",
    letterSpacing: "0.1em",
    padding: "1px 6px",
    borderRadius: "3px",
    fontFamily: "ui-monospace, SF Mono, Menlo, monospace",
    fontWeight: 700,
    flexShrink: 0,
    textTransform: "uppercase",
  },
  errorRow: {
    fontSize: "11px",
    padding: "4px 0",
  },
  emptyRow: {
    fontSize: "11px",
    color: "var(--cx-text-dim)",
    fontFamily: "ui-monospace, SF Mono, Menlo, monospace",
    padding: "4px 0",
  },
};

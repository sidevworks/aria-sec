// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

// ════════════════════════════════════════════════════════════════════════════
// ARIA-SEC · Privilege Drift Timeline
// SVG timeline — privilege level over time, dots by level + action
// ════════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import { ariaFetch } from "../ariaFetch.js";

// ─── Constants ─────────────────────────────────────────────────────────────

const LEVELS = ["standard", "elevated", "admin"];

const LEVEL_CONFIG = {
  standard: { dotRadius: 4,  color: "var(--cx-text-dim)",    y: 120 },
  elevated: { dotRadius: 6,  color: "var(--cx-amber)",        y: 70  },
  admin:    { dotRadius: 9,  color: "var(--cx-breach)",       y: 20  },
};

const SVG_W      = 520;
const SVG_H      = 160;
const AXIS_X     = 54;   // left margin for level labels
const AXIS_RIGHT = 500;
const TIMELINE_W = AXIS_RIGHT - AXIS_X;

// Map ISO timestamp → relative X position within [AXIS_X, AXIS_RIGHT]
function positionEvents(events) {
  if (!events || events.length === 0) return [];

  const now   = Date.now();
  // Show last 30 days
  const minT  = now - 30 * 24 * 60 * 60 * 1000;
  const maxT  = now;
  const range = maxT - minT || 1;

  return events.map((ev, i) => {
    const t  = new Date(ev.timestamp).getTime();
    const xn = Math.max(0, Math.min(1, (t - minT) / range));
    return { ...ev, x: AXIS_X + xn * TIMELINE_W, _idx: i };
  });
}

function relativeTimeLabel(isoString) {
  const ms    = Date.now() - new Date(isoString).getTime();
  const days  = Math.round(ms / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "1d ago";
  return `${days}d ago`;
}

function hasDrift(events) {
  return events.some(
    e => e.active && (e.level === "elevated" || e.level === "admin")
  );
}

export default function PrivilegeDriftTimeline({ userId, userName }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    setError(null);

    ariaFetch("GET", `/api/identity/privilege-timeline/${userId}`).then(res => {
      if (res.error) {
        setError(res.error);
        setData(null);
      } else {
        setData(res.data);
      }
      setLoading(false);
    });
  }, [userId]);

  const events    = data?.events ?? [];
  const positioned = positionEvents(events);
  const driftAlert = hasDrift(events);

  return (
    <div style={panelStyle}>
      {/* Header */}
      <div style={headerRowStyle}>
        <span style={titleStyle}>
          PRIVILEGE TIMELINE
        </span>
        {userName && (
          <span style={subTitleStyle}>{userName}</span>
        )}
      </div>

      {/* Drift warning banner */}
      {driftAlert && (
        <div style={driftBannerStyle}>
          <span style={driftDotStyle} />
          PRIVILEGE DRIFT DETECTED — ACTIVE ELEVATED/ADMIN GRANTS
        </div>
      )}

      {loading && (
        <div style={placeholderStyle}>
          <div style={loadingBarStyle} />
        </div>
      )}

      {!loading && error && (
        <div style={placeholderStyle}>
          <span style={{ color: "var(--cx-breach)", fontSize: 10, letterSpacing: "0.12em" }}>
            FETCH ERROR · {error}
          </span>
        </div>
      )}

      {!loading && !error && events.length === 0 && (
        <div style={placeholderStyle}>
          <span style={{ color: "var(--cx-text-dim)", fontSize: 11, letterSpacing: "0.14em" }}>
            NO PRIVILEGE HISTORY
          </span>
        </div>
      )}

      {!loading && events.length > 0 && (
        <svg
          width="100%"
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          style={{ display: "block", overflow: "visible" }}
          aria-label="Privilege drift timeline"
        >
          {/* Y-axis level labels */}
          {LEVELS.map(lvl => {
            const cfg = LEVEL_CONFIG[lvl];
            return (
              <text
                key={lvl}
                x={AXIS_X - 8}
                y={cfg.y}
                textAnchor="end"
                dominantBaseline="middle"
                fill={cfg.color}
                fontSize={8}
                fontFamily="ui-monospace, 'SF Mono', Menlo, monospace"
                fontWeight={600}
                letterSpacing="0.12em"
              >
                {lvl.toUpperCase()}
              </text>
            );
          })}

          {/* Horizontal level grid lines */}
          {LEVELS.map(lvl => {
            const cfg = LEVEL_CONFIG[lvl];
            return (
              <line
                key={`grid-${lvl}`}
                x1={AXIS_X} y1={cfg.y}
                x2={AXIS_RIGHT} y2={cfg.y}
                stroke="var(--cx-panel-line)"
                strokeWidth={0.5}
                strokeDasharray="2 4"
              />
            );
          })}

          {/* Connecting lines between consecutive events */}
          {positioned.map((ev, i) => {
            if (i === 0) return null;
            const prev = positioned[i - 1];
            const cfg  = LEVEL_CONFIG[ev.level];
            const pcfg = LEVEL_CONFIG[prev.level];
            return (
              <line
                key={`line-${i}`}
                x1={prev.x} y1={pcfg.y}
                x2={ev.x}   y2={cfg.y}
                stroke="var(--cx-panel-line)"
                strokeWidth={1}
              />
            );
          })}

          {/* Event dots */}
          {positioned.map((ev) => {
            const cfg      = LEVEL_CONFIG[ev.level] ?? LEVEL_CONFIG.standard;
            const isFilled = ev.action === "grant";
            const isActive = ev.active;

            return (
              <g key={ev._idx}>
                {/* Active glow halo */}
                {isActive && (
                  <circle
                    cx={ev.x} cy={cfg.y}
                    r={cfg.dotRadius + 5}
                    fill={cfg.color}
                    opacity={0.18}
                    style={{ animation: "cx-pulse 1.4s ease-in-out infinite" }}
                  />
                )}

                {/* Dot — filled = grant, hollow = revoke */}
                <circle
                  cx={ev.x} cy={cfg.y}
                  r={cfg.dotRadius}
                  fill={isFilled ? cfg.color : "var(--cx-void)"}
                  stroke={cfg.color}
                  strokeWidth={isFilled ? 0 : 2}
                  style={{
                    filter: ev.level === "admin"
                      ? `drop-shadow(0 0 4px ${cfg.color})`
                      : undefined,
                  }}
                />

                {/* Timestamp label under dot (every other, to avoid clutter) */}
                {ev._idx % 2 === 0 && (
                  <text
                    x={ev.x}
                    y={SVG_H - 6}
                    textAnchor="middle"
                    fill="var(--cx-text-dim)"
                    fontSize={7}
                    fontFamily="ui-monospace, 'SF Mono', Menlo, monospace"
                    letterSpacing="0.1em"
                  >
                    {relativeTimeLabel(ev.timestamp)}
                  </text>
                )}
              </g>
            );
          })}

          {/* X-axis reference labels: 30d ago, 14d, Today */}
          {[
            { label: "30d ago", xFrac: 0 },
            { label: "14d ago", xFrac: 0.533 },
            { label: "Today",   xFrac: 1 },
          ].map(({ label, xFrac }) => (
            <text
              key={label}
              x={AXIS_X + xFrac * TIMELINE_W}
              y={SVG_H - 6}
              textAnchor={xFrac === 0 ? "start" : xFrac === 1 ? "end" : "middle"}
              fill="var(--cx-text-dim)"
              fontSize={7}
              fontFamily="ui-monospace, 'SF Mono', Menlo, monospace"
              letterSpacing="0.1em"
              opacity={0.55}
            >
              {label}
            </text>
          ))}

          {/* X baseline */}
          <line
            x1={AXIS_X} y1={SVG_H - 14}
            x2={AXIS_RIGHT} y2={SVG_H - 14}
            stroke="var(--cx-panel-line)"
            strokeWidth={0.5}
          />
        </svg>
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const panelStyle = {
  width:          "100%",
  display:        "flex",
  flexDirection:  "column",
  gap:            8,
};

const headerRowStyle = {
  display:        "flex",
  alignItems:     "baseline",
  gap:            10,
};

const titleStyle = {
  fontSize:       10,
  fontFamily:     "ui-monospace, 'SF Mono', Menlo, monospace",
  fontWeight:     700,
  letterSpacing:  "0.18em",
  color:          "var(--cx-text-dim)",
  textTransform:  "uppercase",
};

const subTitleStyle = {
  fontSize:       10,
  fontFamily:     "ui-monospace, 'SF Mono', Menlo, monospace",
  color:          "var(--cx-text)",
  letterSpacing:  "0.1em",
};

const driftBannerStyle = {
  display:        "flex",
  alignItems:     "center",
  gap:            6,
  padding:        "5px 10px",
  background:     "rgba(255,200,87,0.1)",
  border:         "1px solid var(--cx-amber)",
  borderRadius:   4,
  fontSize:       9,
  fontFamily:     "ui-monospace, 'SF Mono', Menlo, monospace",
  fontWeight:     700,
  letterSpacing:  "0.16em",
  color:          "var(--cx-amber)",
};

const driftDotStyle = {
  display:        "inline-block",
  width:          6,
  height:         6,
  borderRadius:   "50%",
  background:     "var(--cx-amber)",
  animation:      "cx-pulse 1.4s ease-in-out infinite",
  flexShrink:     0,
};

const placeholderStyle = {
  height:         120,
  display:        "flex",
  alignItems:     "center",
  justifyContent: "center",
};

const loadingBarStyle = {
  width:          120,
  height:         3,
  borderRadius:   2,
  background:     "var(--cx-panel-line)",
  animation:      "cx-pulse 1.4s ease-in-out infinite",
};

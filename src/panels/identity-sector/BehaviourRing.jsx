// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

// ════════════════════════════════════════════════════════════════════════════
// ARIA-SEC · UEBA Behaviour Ring
// Per-user baseline ring — deviations distort the SVG stroke
// ════════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import { ariaFetch } from "../ariaFetch.js";

const SEVERITY_COLOR = {
  low:    "var(--id-risk-nominal)",
  medium: "var(--id-risk-elevated)",
  high:   "var(--id-risk-warning)",
};

function getRingConfig(status, anomalyScore) {
  if (status === "learning") {
    return {
      stroke:        "var(--cx-amber)",
      dashArray:     "4 3",
      dashOffset:    null,
      animation:     null,
      label:         "LEARNING",
      labelColor:    "var(--cx-amber)",
    };
  }

  const s = anomalyScore ?? 0;
  if (s <= 25) {
    return {
      stroke:        "var(--id-risk-nominal)",
      dashArray:     null,
      dashOffset:    null,
      animation:     null,
      label:         null,
      labelColor:    "var(--id-risk-nominal)",
    };
  }
  if (s <= 50) {
    return {
      stroke:        "var(--id-risk-elevated)",
      dashArray:     "18 2 22 3 15 2",
      dashOffset:    null,
      animation:     null,
      label:         null,
      labelColor:    "var(--id-risk-elevated)",
    };
  }
  if (s <= 75) {
    return {
      stroke:        "var(--id-risk-warning)",
      dashArray:     "12 6 8 4 14 8",
      dashOffset:    null,
      animation:     "id-ring-distort 2s linear infinite",
      label:         null,
      labelColor:    "var(--id-risk-warning)",
    };
  }
  // critical 76–100
  return {
    stroke:        "var(--cx-breach)",
    dashArray:     "6 4 3 6 4 3 8 5",
    dashOffset:    null,
    animation:     "id-ring-distort 0.8s linear infinite",
    label:         null,
    labelColor:    "var(--cx-breach)",
  };
}

function scoreColor(score, status) {
  if (status === "learning") return "var(--cx-amber)";
  const s = score ?? 0;
  if (s <= 25) return "var(--id-risk-nominal)";
  if (s <= 50) return "var(--id-risk-elevated)";
  if (s <= 75) return "var(--id-risk-warning)";
  return "var(--cx-breach)";
}

export default function BehaviourRing({ userId, userName, compact = false }) {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(null);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    setError(null);

    ariaFetch("GET", `/api/identity/behaviour/${userId}`).then(res => {
      if (res.error) {
        // Graceful fallback — show placeholder data so ring renders in all states
        setError(res.error);
        setData(null);
      } else {
        setData(res.data);
      }
      setLoading(false);
    });
  }, [userId]);

  const radius    = compact ? 40 : 70;
  const strokeW   = compact ? 4  : 6;
  const svgSize   = (radius + strokeW + 2) * 2;
  const cx        = svgSize / 2;
  const cy        = svgSize / 2;

  const status       = data?.status ?? "learning";
  const anomalyScore = data?.anomalyScore ?? 0;
  const deviations   = data?.recentDeviations ?? [];

  const cfg = getRingConfig(status, anomalyScore);

  if (loading) {
    return (
      <div style={wrapStyle(compact)}>
        <div style={loadingDotStyle} />
        {!compact && (
          <span style={{ color: "var(--cx-text-dim)", fontSize: 10, letterSpacing: "0.15em" }}>
            LOADING…
          </span>
        )}
      </div>
    );
  }

  return (
    <div style={wrapStyle(compact)}>
      <svg
        width={svgSize}
        height={svgSize}
        viewBox={`0 0 ${svgSize} ${svgSize}`}
        style={{ display: "block" }}
      >
        {/* Track ring */}
        <circle
          cx={cx} cy={cy} r={radius}
          fill="none"
          stroke="var(--cx-panel-line)"
          strokeWidth={strokeW}
        />
        {/* Status ring */}
        <circle
          cx={cx} cy={cy} r={radius}
          fill="none"
          stroke={cfg.stroke}
          strokeWidth={strokeW}
          strokeLinecap="round"
          strokeDasharray={cfg.dashArray || undefined}
          style={{
            animation:    cfg.animation || undefined,
            filter:       status !== "learning" && anomalyScore > 50
              ? `drop-shadow(0 0 4px ${cfg.stroke})`
              : undefined,
            transformOrigin: `${cx}px ${cy}px`,
          }}
        />

        {/* Center label — learning */}
        {cfg.label && (
          <text
            x={cx} y={cy + 4}
            textAnchor="middle"
            dominantBaseline="middle"
            fill={cfg.labelColor}
            fontSize={compact ? 8 : 10}
            fontFamily="ui-monospace, 'SF Mono', Menlo, monospace"
            fontWeight="700"
            letterSpacing="0.12em"
          >
            {cfg.label}
          </text>
        )}

        {/* Center score — established */}
        {status === "established" && (
          <>
            <text
              x={cx} y={compact ? cy : cy - 6}
              textAnchor="middle"
              dominantBaseline="middle"
              fill={scoreColor(anomalyScore, status)}
              fontSize={compact ? 14 : 22}
              fontFamily="ui-monospace, 'SF Mono', Menlo, monospace"
              fontWeight="700"
            >
              {anomalyScore}
            </text>
            {!compact && (
              <text
                x={cx} y={cy + 16}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="var(--cx-text-dim)"
                fontSize={8}
                fontFamily="ui-monospace, 'SF Mono', Menlo, monospace"
                letterSpacing="0.18em"
              >
                ANOMALY
              </text>
            )}
          </>
        )}
      </svg>

      {/* User name */}
      {!compact && (
        <div style={nameStyle}>
          {userName || userId}
        </div>
      )}

      {/* Deviations chips — full mode only */}
      {!compact && deviations.length > 0 && (
        <div style={deviationsWrapStyle}>
          {deviations.slice(0, 6).map((dev, i) => (
            <span
              key={i}
              style={{
                ...chipStyle,
                color:       SEVERITY_COLOR[dev.severity] || "var(--cx-text-dim)",
                borderColor: SEVERITY_COLOR[dev.severity] || "var(--cx-panel-line)",
              }}
            >
              {dev.type.replace(/_/g, " ")}
              <span style={{ opacity: 0.65, marginLeft: 4, fontSize: 9 }}>
                {dev.severity}
              </span>
            </span>
          ))}
        </div>
      )}

      {error && !data && !compact && (
        <div style={errorStyle}>FETCH ERROR · {error}</div>
      )}
    </div>
  );
}

// ─── Style helpers ────────────────────────────────────────────────────────────

function wrapStyle(compact) {
  return {
    display:        "flex",
    flexDirection:  "column",
    alignItems:     "center",
    gap:            compact ? 0 : 8,
    width:          "fit-content",
  };
}

const loadingDotStyle = {
  width:           12,
  height:          12,
  borderRadius:    "50%",
  background:      "var(--cx-panel-line)",
  animation:       "cx-pulse 1.4s ease-in-out infinite",
};

const nameStyle = {
  fontSize:        11,
  fontFamily:      "ui-monospace, 'SF Mono', Menlo, monospace",
  fontWeight:      600,
  letterSpacing:   "0.14em",
  textTransform:   "uppercase",
  color:           "var(--cx-text)",
  maxWidth:        160,
  overflow:        "hidden",
  textOverflow:    "ellipsis",
  whiteSpace:      "nowrap",
};

const deviationsWrapStyle = {
  display:         "flex",
  flexWrap:        "wrap",
  gap:             4,
  justifyContent:  "center",
  maxWidth:        200,
};

const chipStyle = {
  display:        "inline-flex",
  alignItems:     "center",
  fontSize:       9,
  fontFamily:     "ui-monospace, 'SF Mono', Menlo, monospace",
  fontWeight:     600,
  letterSpacing:  "0.14em",
  textTransform:  "uppercase",
  padding:        "2px 6px",
  borderRadius:   3,
  border:         "1px solid",
  background:     "rgba(0,0,0,0.3)",
};

const errorStyle = {
  fontSize:       9,
  color:          "var(--cx-breach)",
  fontFamily:     "ui-monospace, 'SF Mono', Menlo, monospace",
  letterSpacing:  "0.12em",
  marginTop:      4,
};

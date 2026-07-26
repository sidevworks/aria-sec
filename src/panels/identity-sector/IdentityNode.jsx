// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

// IdentityNode.jsx — glowing star node for the Identity Sector constellation
// Each identity is rendered as a multi-layer star with nebula halo, risk glow,
// and animated pulse. Cosmos tokens only.

import { useId } from "react";
import { RISK_BANDS } from "./identityContract.js";

export default function IdentityNode({ user, x, y, selected = false, onClick }) {
  const uid = useId().replace(/:/g, "");

  const { riskScore = 0, riskBand = "nominal", isAdmin = false, accountEnabled = true } = user;

  const baseR    = 11 + (riskScore / 100) * 10;
  const isBreach = riskScore >= 76;
  const isWarn   = riskScore >= 51;
  const strokeColor = RISK_BANDS[riskBand]?.cssToken ?? "var(--id-risk-nominal)";

  const gradId   = `ing-${uid}`;
  const halogId  = `inh-${uid}`;
  const filterId = `inf-${uid}`;

  const glowSD = isBreach ? 9 : isWarn ? 7 : 5;
  const glowOp = isBreach ? 0.9 : 0.7;

  return (
    <g
      transform={`translate(${x},${y})`}
      onClick={onClick}
      style={{ cursor: "pointer" }}
      role="button"
      data-identity-demo-name={user.name}
      aria-label={`${user.name} — risk ${riskScore}`}
    >
      <defs>
        <radialGradient id={gradId} cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="rgba(255,255,255,0.95)" />
          <stop offset="30%"  stopColor={strokeColor} stopOpacity="0.85" />
          <stop offset="100%" stopColor={strokeColor} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={halogId} cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor={strokeColor} stopOpacity="0.22" />
          <stop offset="100%" stopColor={strokeColor} stopOpacity="0" />
        </radialGradient>
        <filter id={filterId} x="-80%" y="-80%" width="260%" height="260%">
          <feDropShadow dx="0" dy="0" stdDeviation={glowSD}
            floodColor={strokeColor} floodOpacity={glowOp} />
          {isBreach && (
            <feDropShadow dx="0" dy="0" stdDeviation="18"
              floodColor={strokeColor} floodOpacity="0.35" />
          )}
        </filter>
      </defs>

      {/* Invisible hit target */}
      <circle r={baseR + 20} fill="transparent" pointerEvents="all" />

      {/* Wide ambient halo */}
      <circle r={baseR * 2.6} fill={`url(#${halogId})`}
        opacity={selected ? 1 : 0.7} style={{ pointerEvents: "none" }} />

      {/* Breach outer pulse ring */}
      {isBreach && (
        <circle r={baseR + 10} fill="none" stroke={strokeColor}
          strokeWidth="1" strokeOpacity="0.5"
          style={{ animation: "id-critical-pulse 1.4s ease-in-out infinite",
            transformBox: "fill-box", transformOrigin: "center" }} />
      )}

      {/* Admin dashed ring */}
      {isAdmin && (
        <circle r={baseR + 6} fill="none" stroke={strokeColor}
          strokeWidth="1" strokeDasharray="3 3" strokeOpacity="0.65" />
      )}

      {/* Selected ring */}
      {selected && (
        <circle r={baseR + 4} fill="none" stroke={strokeColor}
          strokeWidth="1.8" strokeOpacity="0.9" strokeDasharray="4 3"
          style={{ animation: "id-galaxy-breathe 2s ease-in-out infinite",
            transformBox: "fill-box", transformOrigin: "center" }} />
      )}

      {/* Main star body */}
      <circle r={baseR} fill={`url(#${gradId})`}
        stroke={strokeColor} strokeWidth={selected ? 1.8 : 1}
        strokeOpacity={selected ? 1 : 0.8}
        filter={`url(#${filterId})`}
        style={{ pointerEvents: "none" }} />

      {/* Specular highlight */}
      <ellipse cx={-baseR * 0.22} cy={-baseR * 0.25}
        rx={baseR * 0.3} ry={baseR * 0.18}
        fill="rgba(255,255,255,0.18)" style={{ pointerEvents: "none" }} />

      {/* Disabled overlay */}
      {!accountEnabled && (
        <circle r={baseR} fill="rgba(3,3,15,0.55)" style={{ pointerEvents: "none" }} />
      )}

      {/* Label */}
      <text y={baseR + 14} textAnchor="middle" fill={strokeColor}
        style={{
          font: `500 9.5px ui-monospace, "SF Mono", Menlo, monospace`,
          letterSpacing: "0.10em", textTransform: "uppercase",
          pointerEvents: "none", opacity: 0.85,
        }}
      >
        {user.name}
      </text>
    </g>
  );
}

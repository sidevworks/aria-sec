// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

// ════════════════════════════════════════════════════════════════════════════
// SecurityGalaxyMap — Identity Sector centrepiece
// Full-width SVG galaxy map of department risk posture.
// Props: onSelectGalaxy, selectedGalaxyId
// ════════════════════════════════════════════════════════════════════════════
import { useEffect, useLayoutEffect, useRef, useMemo, useCallback, useState } from "react";
import { useIdentityGalaxies } from "./useIdentityGalaxies.js";
import { computeGalaxyPositions } from "./galaxyLayout.js";
import DepartmentGalaxy from "./DepartmentGalaxy.jsx";

// ─── Deterministic star field (seeded so it's stable across re-renders) ───────
const STAR_COUNT = 80;
function buildStars(seed = 42) {
  const stars = [];
  let s = seed;
  const rng = () => { s = (s * 16807 + 0) % 2147483647; return (s - 1) / 2147483646; };
  for (let i = 0; i < STAR_COUNT; i++) {
    stars.push({
      cx:      rng(),  // fractional 0..1, scaled by viewBox in render
      cy:      rng(),
      opacity: 0.2 + rng() * 0.6,
      r:       0.5 + rng() * 0.6,
    });
  }
  return stars;
}
const STARS = buildStars(42);

// ─── Proximity threshold for connecting lines ─────────────────────────────────
const CONNECT_DIST = 380;

/**
 * @param {{
 *   onSelectGalaxy: (galaxy: import("./identityContract.js").DepartmentGalaxy) => void,
 *   selectedGalaxyId: string | null,
 * }} props
 */
export default function SecurityGalaxyMap({ onSelectGalaxy, selectedGalaxyId, additionalGalaxies = [], sourceMode = "all" }) {
  const { galaxies: directoryGalaxies, dataMode, loading, error } = useIdentityGalaxies();
  // Merge directory (Azure AD) galaxies with externally-supplied galaxies
  // (e.g. network-derived). Both render side-by-side on the same map.
  const galaxies = useMemo(
    () => {
      const identity = (directoryGalaxies || []).filter((galaxy) => galaxy.sourceType !== "network");
      const network = (additionalGalaxies || []).filter((galaxy) => galaxy.sourceType === "network");
      if (sourceMode === "azuread") return identity;
      if (sourceMode === "network") return network;
      return [...identity, ...network];
    },
    [directoryGalaxies, additionalGalaxies, sourceMode],
  );

  const containerRef = useRef(null);
  const [dims, setDims] = useState({ width: 900, height: 600 });

  // ── Responsive resize observer (useLayoutEffect = fires before paint) ───
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    // Read initial size immediately — avoids one render cycle with wrong dims
    const { width, height } = el.getBoundingClientRect();
    if (width > 10 && height > 10) setDims({ width, height });

    const ro = new ResizeObserver(entries => {
      const { width: w, height: h } = entries[0].contentRect;
      if (w > 10 && h > 10) setDims({ width: w, height: h });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const svgWidth = Math.max(360, Math.floor(dims.width));
  const svgHeight = Math.max(320, Math.floor(dims.height));
  const centerX = svgWidth / 2;
  const centerY = svgHeight / 2;

  // ── Layout computation ──────────────────────────────────────────────────
  // Use the same dimensions as the SVG viewBox. This keeps single-source
  // filters, such as Network-only, visually centered instead of drifting into
  // the initial top-left measurement state.
  const positions = useMemo(() => {
    const computed = computeGalaxyPositions(galaxies, svgWidth, svgHeight);
    if (galaxies.length !== 1 || !computed[0]) return computed;

    const radius = Math.max(
      computed[0].radius,
      Math.min(svgWidth, svgHeight) * 0.115,
    );
    return [{
      ...computed[0],
      x: centerX,
      y: centerY,
      radius,
    }];
  }, [galaxies, svgWidth, svgHeight, centerX, centerY]);

  // Map id → position for quick lookup
  const posMap = useMemo(() => {
    const m = new Map();
    positions.forEach(p => m.set(p.id, p));
    return m;
  }, [positions]);

  // ── ARIA threshold event ────────────────────────────────────────────────
  useEffect(() => {
    galaxies.forEach(g => {
      if (g.riskScore >= 75) {
        window.dispatchEvent(
          new CustomEvent("aria:identity:threshold", { detail: { galaxy: g } }),
        );
      }
    });
  }, [galaxies]);

  // ── Click handler ───────────────────────────────────────────────────────
  const handleClick = useCallback(
    galaxy => {
      onSelectGalaxy?.(galaxy);
    },
    [onSelectGalaxy],
  );

  // ── Connecting lines between nearby galaxies ────────────────────────────
  const lines = useMemo(() => {
    const result = [];
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const a = positions[i];
        const b = positions[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < CONNECT_DIST) {
          result.push({ key: `${a.id}-${b.id}`, x1: a.x, y1: a.y, x2: b.x, y2: b.y, dist });
        }
      }
    }
    return result;
  }, [positions]);

  // ─────────────────────────────────────────────────────────────────────────
  // Render states
  // ─────────────────────────────────────────────────────────────────────────

  // ─────────────────────────────────────────────────────────────────────────
  // Single render path — always the same outer div so ResizeObserver stays
  // attached through loading → data transitions.
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div ref={containerRef} style={containerStyle}>
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid meet"
        style={{ background: "var(--cx-void)", display: "block", width: "100%", height: "100%" }}
        aria-label="Security Galaxy Map — department risk posture"
      >
        {/* ── Starfield ──────────────────────────────────────────────────── */}
        <g aria-hidden="true">
          {STARS.map((s, i) => (
            <circle
              key={i}
              cx={s.cx * svgWidth}
              cy={s.cy * svgHeight}
              r={s.r}
              fill="white"
              opacity={s.opacity}
            />
          ))}
        </g>

        {/* ── Loading skeleton ───────────────────────────────────────────── */}
        {loading && (
          <g>
            {[
              { cx: 0.30, cy: 0.40, r: 42 },
              { cx: 0.55, cy: 0.55, r: 38 },
              { cx: 0.70, cy: 0.35, r: 34 },
              { cx: 0.45, cy: 0.65, r: 30 },
              { cx: 0.20, cy: 0.60, r: 32 },
            ].map((s, i) => (
              <circle
                key={i}
                cx={s.cx * svgWidth}
                cy={s.cy * svgHeight}
                r={s.r}
                fill="var(--cx-panel-line)"
                style={{
                  animation: `id-galaxy-breathe ${1.2 + i * 0.3}s ease-in-out infinite`,
                  transformBox: "fill-box",
                  transformOrigin: "center",
                }}
              />
            ))}
            <text
              x={svgWidth / 2}
              y={svgHeight / 2 + 80}
              textAnchor="middle"
              fill="var(--cx-text-dim)"
              style={{ font: "600 11px ui-monospace, 'SF Mono', Menlo, monospace", letterSpacing: "0.18em" }}
            >
              SCANNING IDENTITY FABRIC…
            </text>
          </g>
        )}

        {/* ── Error state ────────────────────────────────────────────────── */}
        {!loading && error && (
          <text
            x={svgWidth / 2}
            y={svgHeight / 2}
            textAnchor="middle"
            fill="var(--cx-breach)"
            style={{ font: "700 13px ui-monospace, 'SF Mono', Menlo, monospace", letterSpacing: "0.18em" }}
          >
            IDENTITY FEED ERROR — {error}
          </text>
        )}

        {/* ── Connecting lines ───────────────────────────────────────────── */}
        {!loading && !error && (
          <g aria-hidden="true">
            {lines.map(l => (
              <line
                key={l.key}
                x1={l.x1} y1={l.y1}
                x2={l.x2} y2={l.y2}
                stroke="var(--cx-panel-line)"
                strokeOpacity={0.3}
                strokeWidth="0.8"
              />
            ))}
          </g>
        )}

        {/* ── Empty state ───────────────────────────────────────────────── */}
        {!loading && !error && galaxies.length === 0 && (
          <g aria-label="No identity galaxy data available">
            <circle
              cx={centerX}
              cy={centerY - 16}
              r={52}
              fill="none"
              stroke="var(--cx-panel-line)"
              strokeOpacity="0.45"
              strokeWidth="1"
              strokeDasharray="4 7"
            />
            <text
              x={centerX}
              y={centerY - 6}
              textAnchor="middle"
              fill="var(--cx-cyan)"
              style={{ font: "700 12px ui-monospace, 'SF Mono', Menlo, monospace", letterSpacing: "0.2em" }}
            >
              NO GALAXIES IN THIS SOURCE
            </text>
            <text
              x={centerX}
              y={centerY + 18}
              textAnchor="middle"
              fill="var(--cx-text-dim)"
              style={{ font: "600 10px ui-monospace, 'SF Mono', Menlo, monospace", letterSpacing: "0.12em" }}
            >
              SWITCH SOURCE OR RUN NETWORK DISCOVERY
            </text>
          </g>
        )}

        {/* ── Department galaxies ────────────────────────────────────────── */}
        {!loading && !error && galaxies.map(g => {
          const pos = posMap.get(g.id);
          if (!pos) return null;
          return (
            <DepartmentGalaxy
              key={g.id}
              galaxy={g}
              x={pos.x}
              y={pos.y}
              radius={pos.radius}
              selected={selectedGalaxyId === g.id}
              onClick={() => handleClick(g)}
            />
          );
        })}

        {/* ── Sample data banner ─────────────────────────────────────────── */}
        {dataMode === "sample" && !loading && (
          <g aria-label="Sample data warning">
            <rect
              x={svgWidth - 220}
              y={12}
              width={208}
              height={28}
              rx={6}
              fill="var(--cx-amber)"
              fillOpacity="0.18"
              stroke="var(--cx-amber)"
              strokeOpacity="0.5"
              strokeWidth="1"
            />
            <text
              x={svgWidth - 116}
              y={30}
              textAnchor="middle"
              fill="var(--cx-amber)"
              style={{
                font:          "700 10px ui-monospace, 'SF Mono', Menlo, monospace",
                letterSpacing: "0.16em",
                textTransform: "uppercase",
              }}
            >
              DATA MODE: SAMPLE DATA
            </text>
          </g>
        )}

        {/* ── HUD corner label ───────────────────────────────────────────── */}
        <text
          x={16}
          y={22}
          fill="var(--cx-text-dim)"
          style={{
            font:          "600 10px ui-monospace, 'SF Mono', Menlo, monospace",
            letterSpacing: "0.18em",
            textTransform: "uppercase",
          }}
        >
          IDENTITY · GALAXY MAP
        </text>
        <text
          x={16}
          y={38}
          fill="var(--cx-text-dim)"
          style={{
            font:          "500 9px ui-monospace, 'SF Mono', Menlo, monospace",
            letterSpacing: "0.14em",
            opacity:       0.55,
          }}
        >
          {loading ? "SCANNING…" : `${galaxies.length} DEPARTMENT${galaxies.length !== 1 ? "S" : ""}`}
        </text>
      </svg>
    </div>
  );
}

const containerStyle = {
  position: "relative",
  width:    "100%",
  height:   "100%",
  minWidth: 0,
  minHeight: 420,
  flex:     "1 1 auto",
  overflow: "hidden",
  background: "var(--cx-void)",
};

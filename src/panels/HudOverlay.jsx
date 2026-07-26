// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

// ════════════════════════════════════════════════════════════════════════
// COSMOS-UI · HUD overlay (Agent 10 · Quantum Vector Typographer)
// A single BOTTOM dock rendered above each panel's canvas. It deliberately
// lives only along the bottom edge so it never collides with the stage chrome
// (HolographicStage already owns the top-right hero number + the top-left
// COMMAND GRID pill). Left side = compact metric chips; right side = scrolling
// record ticker. Non-interactive (pointerEvents:none).
// ════════════════════════════════════════════════════════════════════════
const STATE_COLOR = { clean: "#63f5ff", elevated: "#ffc857", breach: "#ff3d81" };

const wrap = {
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
  fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
  color: "#eaf7ff",
};

/**
 * HudDock — the only overlay panels should use.
 * @param metrics  [{ label, value, accent? }]  compact chips (bottom-left)
 * @param items    string[]                      record ticker (bottom-right)
 * @param state    clean|elevated|breach         tint
 */
export function HudDock({ metrics = [], items = [], state = "clean", emptyText = "— no live records —" }) {
  const tint = STATE_COLOR[state] || STATE_COLOR.clean;
  const list = items.length ? items : [emptyText];
  return (
    <div style={wrap}>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 18,
          padding: "26px 18px 14px",
          background: "linear-gradient(0deg, rgba(3,3,7,0.82) 12%, rgba(3,3,7,0.4) 60%, transparent)",
        }}
      >
        {/* metric chips */}
        <div style={{ display: "flex", gap: 18, flexShrink: 0 }}>
          {metrics.map((m, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
              <span style={{ fontSize: 8.5, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(234,247,255,0.45)" }}>
                {m.label}
              </span>
              <span
                style={{
                  fontSize: 19,
                  fontWeight: 700,
                  marginTop: 4,
                  color: m.accent || tint,
                  textShadow: `0 0 12px ${(m.accent || tint)}55`,
                }}
              >
                {m.value}
              </span>
            </div>
          ))}
        </div>

        {/* record ticker */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "flex-end",
            gap: 14,
            fontSize: 10,
            color: "rgba(234,247,255,0.66)",
            maxWidth: "62%",
          }}
        >
          {list.slice(0, 5).map((s, i) => (
            <span key={i} style={{ whiteSpace: "nowrap" }}>
              <span style={{ color: tint }}>▸ </span>
              {s}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import { useEffect, useState } from "react";
import { ariaFetch } from "./ariaFetch.js";

const MODES = [
  {
    id: "cloud",
    label: "CLOUD",
    model: "claude-opus-4-8",
    accent: "#a78bfa",
    desc: "Claude Opus 4.8",
  },
  {
    id: "gemini",
    label: "GEMINI",
    model: "gemini-2.5-flash",
    accent: "#4285f4",
    desc: "Gemini 2.5 Flash",
  },
  {
    id: "local",
    label: "LOCAL",
    model: "local-engine",
    accent: "#2dd4bf",
    desc: "On-prem engine",
  },
  {
    id: "hybrid",
    label: "HYBRID",
    model: "hybrid-engine",
    accent: "#63f5ff",
    desc: "Cloud + local",
  },
];

// Reflects what is actually configured and reachable rather than a static label.
// The local engine is whatever model the operator has loaded, so its name is only
// knowable at runtime — and an engine with no key or no running server reads as
// offline instead of silently pretending to be live.
function useEngineStatus() {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await ariaFetch("GET", "/api/model/status");
        if (!cancelled) setStatus(data);
      } catch {
        if (!cancelled) setStatus(null);
      }
    };
    load();
    const timer = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return status;
}

function describeMode(m, status) {
  const entry = status?.[m.id];
  if (!entry) return { desc: m.desc, available: null };
  if (m.id === "local") {
    return {
      desc: entry.available ? entry.model : entry.error ? "No engine reachable" : m.desc,
      available: Boolean(entry.available),
    };
  }
  if (m.id === "hybrid") {
    const legs = [entry.cloud_leg, entry.local_leg].filter(Boolean).length;
    return {
      desc: entry.available ? (legs === 2 ? "Cloud + local" : "One leg only") : "No engine available",
      available: Boolean(entry.available),
    };
  }
  return { desc: entry.available ? m.desc : `${m.desc} — no key`, available: Boolean(entry.available) };
}

export default function ModelSelector({ mode, onChange, vertical = false }) {
  const [hovered, setHovered] = useState(null);
  const status = useEngineStatus();
  const active = MODES.find((m) => m.id === mode) || MODES[0];
  const activeOffline = describeMode(active, status).available === false;

  if (vertical) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 2,
          padding: "6px",
          borderRadius: 6,
          background: "rgba(4, 8, 18, 0.62)",
          border: `1px solid ${active.accent}28`,
          backdropFilter: "blur(18px)",
          pointerEvents: "auto",
          userSelect: "none",
          width: "100%",
        }}
      >
        <div
          style={{
            fontSize: 9,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "rgba(140,170,200,0.45)",
            fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
            paddingBottom: 2,
            paddingLeft: 2,
          }}
        >
          Intelligence Mode
        </div>
        {MODES.map((m) => {
          const isActive = m.id === mode;
          const isHovered = hovered === m.id;
          const { desc, available } = describeMode(m, status);
          const offline = available === false;
          return (
            <button
              key={m.id}
              onClick={() => onChange(m.id)}
              onMouseEnter={() => setHovered(m.id)}
              onMouseLeave={() => setHovered(null)}
              title={offline ? status?.[m.id]?.error || `${m.label} engine is not available` : undefined}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 8px",
                borderRadius: 4,
                border: isActive ? `1px solid ${m.accent}40` : "1px solid transparent",
                cursor: "pointer",
                transition: "all 0.18s ease",
                opacity: offline && !isActive ? 0.45 : 1,
                background: isActive
                  ? `linear-gradient(135deg, ${m.accent}18, ${m.accent}08)`
                  : isHovered
                  ? "rgba(255,255,255,0.04)"
                  : "transparent",
                boxShadow: isActive ? `0 0 10px ${m.accent}20` : "none",
                width: "100%",
                textAlign: "left",
              }}
            >
              <div
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  background: offline
                    ? "rgba(140,170,200,0.18)"
                    : isActive
                    ? m.accent
                    : "rgba(140,170,200,0.2)",
                  boxShadow: isActive && !offline ? `0 0 6px ${m.accent}` : "none",
                  flexShrink: 0,
                  transition: "all 0.18s ease",
                  animation: isActive && !offline ? "modelPulse 2.4s ease-in-out infinite" : "none",
                }}
              />
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 800,
                    letterSpacing: "0.2em",
                    color: isActive ? m.accent : "rgba(180,210,240,0.45)",
                    transition: "color 0.18s ease",
                    fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
                    textShadow: isActive ? `0 0 8px ${m.accent}80` : "none",
                  }}
                >
                  {m.label}
                </span>
                <span
                  style={{
                    fontSize: 8,
                    letterSpacing: "0.06em",
                    color: isActive ? `${m.accent}cc` : "rgba(140,170,200,0.28)",
                    transition: "color 0.18s ease",
                    fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
                    whiteSpace: "nowrap",
                  }}
                >
                  {desc}
                </span>
              </div>
            </button>
          );
        })}
        <style>{`
          @keyframes modelPulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.45; transform: scale(0.75); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 2,
        padding: "4px 6px",
        borderRadius: 999,
        background: "rgba(4, 6, 18, 0.82)",
        border: `1px solid ${active.accent}28`,
        backdropFilter: "blur(18px)",
        boxShadow: `0 2px 20px rgba(0,0,0,0.45), 0 0 0 1px ${active.accent}12`,
        pointerEvents: "auto",
        userSelect: "none",
      }}
    >
      {MODES.map((m) => {
        const isActive = m.id === mode;
        const isHovered = hovered === m.id;
        const { desc, available } = describeMode(m, status);
        const offline = available === false;
        return (
          <button
            key={m.id}
            onClick={() => onChange(m.id)}
            onMouseEnter={() => setHovered(m.id)}
            onMouseLeave={() => setHovered(null)}
            title={offline ? status?.[m.id]?.error || `${m.label} engine is not available` : undefined}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 1,
              padding: "4px 12px",
              borderRadius: 999,
              border: "none",
              cursor: "pointer",
              transition: "all 0.18s ease",
              opacity: offline && !isActive ? 0.45 : 1,
              background: isActive
                ? `linear-gradient(135deg, ${m.accent}22, ${m.accent}10)`
                : isHovered
                ? "rgba(255,255,255,0.05)"
                : "transparent",
              boxShadow: isActive ? `0 0 12px ${m.accent}30, inset 0 0 0 1px ${m.accent}40` : "none",
            }}
          >
            <span
              style={{
                fontSize: 9,
                fontWeight: 800,
                letterSpacing: "0.2em",
                color: isActive ? m.accent : "rgba(180,210,240,0.45)",
                transition: "color 0.18s ease",
                fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
                textShadow: isActive ? `0 0 8px ${m.accent}80` : "none",
              }}
            >
              {m.label}
            </span>
            <span
              style={{
                fontSize: 8,
                letterSpacing: "0.06em",
                color: isActive ? `${m.accent}cc` : "rgba(140,170,200,0.28)",
                transition: "color 0.18s ease",
                fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
                whiteSpace: "nowrap",
              }}
            >
              {desc}
            </span>
          </button>
        );
      })}

      {/* Live indicator dot — dark when the selected engine cannot answer */}
      <div
        style={{
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: activeOffline ? "rgba(140,170,200,0.18)" : active.accent,
          boxShadow: activeOffline ? "none" : `0 0 6px ${active.accent}`,
          marginLeft: 4,
          flexShrink: 0,
          animation: activeOffline ? "none" : "modelPulse 2.4s ease-in-out infinite",
        }}
      />
      <style>{`
        @keyframes modelPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.45; transform: scale(0.75); }
        }
      `}</style>
    </div>
  );
}

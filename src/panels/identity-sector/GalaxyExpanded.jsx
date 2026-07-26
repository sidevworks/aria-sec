// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

// GalaxyExpanded.jsx — expanded department view with DOM-based user grid
// Each user is a real <button> with data-identity-demo-name for reliable demo clicks.

import React, { useEffect, useRef, useState } from "react";
import { ariaFetch } from "../ariaFetch.js";
import { RISK_BANDS, riskBand as getRiskBand } from "./identityContract.js";

const BAND_COLORS = {
  nominal:  { border: "rgba(56,189,248,0.5)",  glow: "rgba(56,189,248,0.25)",  text: "#38bdf8", bg: "rgba(56,189,248,0.08)"  },
  elevated: { border: "rgba(255,200,87,0.5)",  glow: "rgba(255,200,87,0.25)",  text: "#ffc857", bg: "rgba(255,200,87,0.08)"  },
  warning:  { border: "rgba(239,68,68,0.55)",  glow: "rgba(239,68,68,0.25)",   text: "#ef4444", bg: "rgba(239,68,68,0.08)"   },
  critical: { border: "rgba(255,61,129,0.65)", glow: "rgba(255,61,129,0.3)",   text: "#ff3d81", bg: "rgba(255,61,129,0.10)"  },
};

function UserCard({ user, selected, onClick }) {
  const band  = getRiskBand(user.riskScore ?? 0);
  const color = BAND_COLORS[band] || BAND_COLORS.nominal;
  const [hov, setHov] = useState(false);

  return (
    <button
      data-identity-demo-name={user.name}
      aria-label={`${user.name} — risk ${user.riskScore ?? 0}`}
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        padding: "14px 10px 10px",
        borderRadius: 12,
        border: `1px solid ${selected ? color.text : hov ? color.border : "rgba(255,255,255,0.08)"}`,
        background: selected ? color.bg : hov ? "rgba(255,255,255,0.04)" : "rgba(6,8,20,0.6)",
        boxShadow: selected ? `0 0 18px ${color.glow}` : hov ? `0 0 10px ${color.glow}` : "none",
        cursor: "pointer",
        transition: "all 0.18s ease",
        minWidth: 90,
        flex: "1 1 90px",
        maxWidth: 120,
      }}
    >
      {/* Avatar orb */}
      <div style={{
        width: 42, height: 42, borderRadius: "50%",
        background: `radial-gradient(circle at 35% 35%, rgba(255,255,255,0.9), ${color.text}88)`,
        border: `1.5px solid ${color.text}`,
        boxShadow: `0 0 12px ${color.glow}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
        animation: band === "critical" || band === "warning" ? "id-critical-pulse 1.6s ease-in-out infinite" : "none",
        transformBox: "fill-box",
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--cx-void)", letterSpacing: 0 }}>
          {(user.name || "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
        </span>
      </div>

      {/* Name */}
      <span style={{
        fontSize: 9.5,
        fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
        color: selected ? color.text : "rgba(220,240,255,0.85)",
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        textAlign: "center",
        lineHeight: 1.3,
        wordBreak: "break-word",
      }}>
        {user.name}
      </span>

      {/* Risk badge */}
      <div style={{
        padding: "2px 7px",
        borderRadius: 99,
        background: color.bg,
        border: `1px solid ${color.border}`,
        fontSize: 9,
        fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
        color: color.text,
        letterSpacing: "0.1em",
        fontWeight: 700,
      }}>
        {band.toUpperCase()} · {user.riskScore ?? 0}
      </div>

      {/* Admin badge */}
      {user.isAdmin && (
        <div style={{
          position: "absolute", top: 6, right: 6,
          fontSize: 8, fontWeight: 700, letterSpacing: "0.1em",
          color: "#ffc857", background: "rgba(255,200,87,0.12)",
          border: "1px solid rgba(255,200,87,0.35)",
          borderRadius: 4, padding: "1px 5px",
          fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
        }}>
          ADM
        </div>
      )}

      {/* Selected pulse ring */}
      {selected && (
        <div style={{
          position: "absolute", inset: -3, borderRadius: 14,
          border: `1.5px solid ${color.text}`,
          opacity: 0.6,
          animation: "id-galaxy-breathe 2s ease-in-out infinite",
          pointerEvents: "none",
        }} />
      )}
    </button>
  );
}

export default function GalaxyExpanded({ galaxy, onSelectUser, onClose, demoSelectUserName, demoRequestId, onDemoSelectComplete }) {
  const [users, setUsers]       = useState([]);
  const [dataMode, setDataMode] = useState("live");
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const handledDemoRequestRef = useRef(null);

  useEffect(() => {
    if (!galaxy?.id) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    const embeddedUsers = Array.isArray(galaxy.users) ? galaxy.users : [];
    const source = galaxy.sourceType || galaxy.source;
    if (embeddedUsers.length || source === "network") {
      setUsers(embeddedUsers.map((u) => ({
        ...u,
        dataMode: u.dataMode || galaxy.dataMode || (source === "sample" ? "sample" : "live"),
        sourceType: u.sourceType || source,
      })));
      setDataMode(galaxy.dataMode || (source === "sample" ? "sample" : "live"));
      setLoading(false);
      return () => { cancelled = true; };
    }

    ariaFetch("GET", `/api/identity/galaxies/${encodeURIComponent(galaxy.id)}/users`).then((result) => {
      if (cancelled) return;
      if (result.error) { setError(result.error); setLoading(false); return; }
      setUsers(result.data?.users ?? []);
      setDataMode(result.data?.dataMode ?? "sample");
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [galaxy?.id, galaxy?.source, galaxy?.sourceType, galaxy?.users]);

  // Demo: auto-select user by name once users load
  useEffect(() => {
    if (!demoRequestId || handledDemoRequestRef.current === demoRequestId) return;
    if (loading) return;
    if (error) {
      handledDemoRequestRef.current = demoRequestId;
      onDemoSelectComplete?.(demoRequestId, "error");
      return;
    }

    const needle = String(demoSelectUserName || "").trim().toLowerCase();
    const user = users.find((u) => String(u.name || "").trim().toLowerCase() === needle)
      || users.find((u) => String(u.name || "").toLowerCase().includes(needle))
      || null;

    handledDemoRequestRef.current = demoRequestId;
    if (user) {
      handleSelectUser(user);
      onDemoSelectComplete?.(demoRequestId, "ok");
    } else {
      onDemoSelectComplete?.(demoRequestId, "missing-user");
    }
  }, [demoRequestId, demoSelectUserName, error, loading, users]);

  function handleSelectUser(user) {
    setSelectedUserId(user.id);
    onSelectUser?.(user);
  }

  const riskBandVal = galaxy?.riskBand ?? "nominal";
  const riskLabel   = RISK_BANDS[riskBandVal]?.label ?? "Nominal";
  const riskColor   = RISK_BANDS[riskBandVal]?.cssToken ?? "var(--id-risk-nominal)";
  const totalAnomalies = users.reduce((s, u) => s + (u.anomalies?.length ?? 0), 0);
  const adminCount     = users.filter(u => u.isAdmin).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", minHeight: 400, position: "relative", overflow: "hidden" }}>

      {/* Top bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: "1px solid var(--cx-panel-line)", flexShrink: 0 }}>
        <span style={{ fontSize: 13, color: "var(--cx-text)", letterSpacing: "0.14em", flexGrow: 1, fontFamily: 'ui-monospace,"SF Mono",Menlo,monospace', textTransform: "uppercase" }}>
          {galaxy?.name ?? "Department"}
        </span>
        <span style={{ color: riskColor, border: `1px solid ${riskColor}`, padding: "2px 8px", borderRadius: 4, fontSize: 10, fontFamily: 'ui-monospace,"SF Mono",Menlo,monospace', letterSpacing: "0.12em" }}>
          {riskLabel} · {galaxy?.riskScore ?? 0}
        </span>
        <span style={{ fontSize: 10, color: "var(--cx-text-dim)", fontFamily: 'ui-monospace,"SF Mono",Menlo,monospace', whiteSpace: "nowrap" }}>
          <span style={{ color: "var(--cx-amber)" }}>⚠ {totalAnomalies}</span>
          {"  "}
          <span style={{ color: "var(--cx-flare)" }}>{adminCount} admin{adminCount !== 1 ? "s" : ""}</span>
        </span>
        <button
          onClick={onClose}
          style={{ background: "none", border: "1px solid var(--cx-panel-line)", color: "var(--cx-text-dim)", borderRadius: 4, cursor: "pointer", padding: "3px 10px", fontSize: 12, fontFamily: 'ui-monospace,"SF Mono",Menlo,monospace' }}
        >✕</button>
      </div>

      {/* User grid */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px" }}>
        {loading && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 120, color: "var(--cx-text-dim)", fontSize: 11, fontFamily: 'ui-monospace,"SF Mono",Menlo,monospace', letterSpacing: "0.2em" }}>
            SCANNING IDENTITIES…
          </div>
        )}

        {!loading && error && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 120, color: "var(--cx-breach)", fontSize: 11, fontFamily: 'ui-monospace,"SF Mono",Menlo,monospace', letterSpacing: "0.15em" }}>
            ERROR · {error}
          </div>
        )}

        {!loading && !error && users.length === 0 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 120, color: "var(--cx-text-dim)", fontSize: 11, fontFamily: 'ui-monospace,"SF Mono",Menlo,monospace', letterSpacing: "0.15em" }}>
            NO USERS FOUND
          </div>
        )}

        {!loading && !error && users.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
            {[...users]
              .sort((a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0))
              .map((user) => (
                <UserCard
                  key={user.id}
                  user={user}
                  selected={user.id === selectedUserId}
                  onClick={() => handleSelectUser(user)}
                />
              ))}
          </div>
        )}
      </div>

      {/* Sample data banner */}
      {dataMode === "sample" && !loading && (
        <div style={{ textAlign: "center", padding: "6px", borderTop: "1px solid var(--cx-panel-line)", flexShrink: 0 }}>
          <span style={{ color: "var(--cx-amber)", fontSize: 10, letterSpacing: "0.22em", fontFamily: 'ui-monospace,"SF Mono",Menlo,monospace' }}>
            SAMPLE DATA — NOT LIVE
          </span>
        </div>
      )}
    </div>
  );
}

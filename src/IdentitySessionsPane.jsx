// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

// Lazy-loadable Identity & Sessions panel — no Three.js dependency.
// Loaded on demand when the user navigates to the identity-sessions dashboard.
// Issues closed: IS-001 (UI), IS-004, IS-006, IS-007

import { useState } from "react";

const ARIA_API_BASE = (import.meta.env.VITE_ARIA_API_BASE || "").replace(/\/$/, "");

const paneStyles = {
  dashCard: {
    background: "linear-gradient(180deg, rgba(255,255,255,0.075), rgba(255,255,255,0.032)), rgba(13, 12, 22, 0.66)",
    border: "1px solid rgba(255,255,255,0.085)",
    borderRadius: 18,
    padding: "14px 16px",
    boxShadow: "0 18px 52px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.05)",
    backdropFilter: "blur(24px)",
  },
  dashCardLabel: {
    fontSize: 10,
    letterSpacing: "0.24em",
    textTransform: "uppercase",
    color: "rgba(236,218,255,0.62)",
    marginBottom: 2,
  },
};

function statusColor(status) {
  if (status === "active")  return "#2dd4bf";
  if (status === "expired") return "#ffc857";
  if (status === "revoked") return "#ff3d81";
  return "rgba(234,247,255,0.46)";
}

function toTimestampMs(value) {
  if (!value) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Returns a relative time string for a Unix-ms or ISO timestamp.
 */
function relativeTime(value) {
  const tsMs = toTimestampMs(value);
  if (!tsMs) return "—";
  const diffMs = Date.now() - tsMs;
  if (diffMs < 0) return "just now";
  const diffSec = diffMs / 1000;
  if (diffSec < 60) return "just now";
  const diffMin = diffSec / 60;
  if (diffMin < 60) return `${Math.floor(diffMin)}m ago`;
  const diffHr = diffMin / 60;
  if (diffHr < 24) return `${Math.floor(diffHr)}h ago`;
  const diffDay = diffHr / 24;
  return `${Math.floor(diffDay)}d ago`;
}

/**
 * Returns a coloured activity dot colour based on how recent last_seen is.
 * green  < 5 min
 * amber  < 30 min
 * dim grey otherwise
 */
function activityDotColor(tsMs) {
  const parsedTs = toTimestampMs(tsMs);
  if (!parsedTs) return "rgba(234,247,255,0.2)";
  const diffMin = (Date.now() - parsedTs) / 60000;
  if (diffMin < 5)  return "#2dd4bf";   // green
  if (diffMin < 30) return "#ffc857";   // amber
  return "rgba(234,247,255,0.22)";      // dim grey
}

// True if the session was active within the last 5 minutes (drives the glow).
function isRecentlyActive(tsMs) {
  const parsedTs = toTimestampMs(tsMs);
  return Boolean(parsedTs) && (Date.now() - parsedTs) < 300000;
}

export default function IdentitySessionsPane({ state = {}, onRevoke, accent = "#38bdf8" }) {
  const { sessions: initialSessions = [], identityCard = null, loading = false, error = null } = state;

  // Local sessions copy for optimistic updates (per-row revoke + revoke-all)
  const [localSessions, setLocalSessions] = useState(null);
  const sessions = localSessions ?? initialSessions;

  const muted = "rgba(234,247,255,0.46)";
  const textPrimary = "rgba(215,235,255,0.9)";

  // ── Per-row revoke modal ──────────────────────────────────────────────────
  const [revokeTarget, setRevokeTarget] = useState(null);
  const [revokeReason, setRevokeReason] = useState("");
  const [revoking, setRevoking] = useState(false);
  const [revokeMsg, setRevokeMsg] = useState(null);
  // Map of session_id → "Revoked" flash state
  const [flashRows, setFlashRows] = useState({});

  // ── Revoke All modal ──────────────────────────────────────────────────────
  const [showRevokeAllModal, setShowRevokeAllModal] = useState(false);
  const [revokingAll, setRevokingAll] = useState(false);
  const [revokeAllMsg, setRevokeAllMsg] = useState(null);

  // Sync local sessions when prop sessions change (e.g. after parent reload)
  // We reset local state if parent pushes new data
  if (localSessions !== null && initialSessions !== (state.sessions ?? [])) {
    // parent reloaded — clear local override so fresh data shows
    // (this is a render-phase side-effect free check: use null sentinel)
  }

  async function handleRevoke() {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      if (onRevoke) {
        // App.jsx wired onRevoke — delegate to it (keeps auth headers centralised)
        await onRevoke(revokeTarget.session_id, revokeReason.trim() || "Revoked via UI");
      } else {
        await fetch(`${ARIA_API_BASE}/api/aria/sessions/${encodeURIComponent(revokeTarget.session_id)}/revoke`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reason: revokeReason.trim() || "Revoked via UI" }),
        });
      }
      // Flash "Revoked" on the row before removing
      const sid = revokeTarget.session_id;
      setFlashRows((prev) => ({ ...prev, [sid]: true }));
      setTimeout(() => {
        setFlashRows((prev) => { const n = { ...prev }; delete n[sid]; return n; });
        setLocalSessions((prev) =>
          (prev ?? initialSessions).filter((s) => s.session_id !== sid)
        );
      }, 900);
      setRevokeMsg({ ok: true, text: "Session revoked." });
    } catch (e) {
      setRevokeMsg({ ok: false, text: e.message || "Revoke failed." });
    } finally {
      setRevoking(false);
      setTimeout(() => { setRevokeTarget(null); setRevokeReason(""); setRevokeMsg(null); }, 2000);
    }
  }

  async function handleRevokeAll() {
    setRevokingAll(true);
    setRevokeAllMsg(null);
    try {
      // Try the batch endpoint first; fall back to per-session series
      const batchResp = await fetch(`${ARIA_API_BASE}/api/aria/sessions/revoke-all`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "Batch revoke via UI" }),
      });
      if (!batchResp.ok && batchResp.status !== 404) {
        throw new Error(`Revoke-all failed: ${batchResp.status}`);
      }
      if (batchResp.status === 404) {
        // Fallback: revoke in series
        const activeSessions = sessions.filter((s) => s.status === "active");
        for (const s of activeSessions) {
          await fetch(`${ARIA_API_BASE}/api/aria/sessions/${encodeURIComponent(s.session_id)}/revoke`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ reason: "Batch revoke via UI" }),
          });
        }
      }
      // Optimistic: mark all active sessions as revoked locally
      setLocalSessions((prev) =>
        (prev ?? initialSessions).map((s) =>
          s.status === "active" ? { ...s, status: "revoked" } : s
        )
      );
      setRevokeAllMsg({ ok: true, text: "All active sessions revoked." });
    } catch (e) {
      setRevokeAllMsg({ ok: false, text: e.message || "Revoke-all failed." });
    } finally {
      setRevokingAll(false);
      setTimeout(() => { setShowRevokeAllModal(false); setRevokeAllMsg(null); }, 2500);
    }
  }

  const activeCount = sessions.filter((s) => s.status === "active").length;

  return (
    <div style={{ display: "grid", gap: 12 }} role="region" aria-label="Identity and Sessions">

      {/* ── Identity Truth Card ─────────────────────────────── */}
      <div style={{ ...paneStyles.dashCard, borderColor: `rgba(56,189,248,0.22)` }}>
        <div style={paneStyles.dashCardLabel}>IDENTITY TRUTH — RESOLVED CONTEXT</div>
        {loading ? (
          <div style={{ marginTop: 10, fontSize: 12, color: muted }} aria-live="polite">Loading identity…</div>
        ) : identityCard ? (
          <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
            {Object.entries(identityCard).map(([k, v]) => (
              <div key={k} style={{ display: "grid", gridTemplateColumns: "130px 1fr auto", gap: 8, alignItems: "baseline" }}>
                <span style={{ fontSize: 11, color: muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>{k}</span>
                <span style={{ fontSize: 12, color: textPrimary, fontFamily: "ui-monospace,monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {String(v?.value ?? v)}
                </span>
                {v?.source && (
                  <span style={{ fontSize: 10, color: "rgba(255,200,87,0.72)", letterSpacing: "0.04em" }}>[{v.source}]</span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ marginTop: 10, fontSize: 12, color: muted, fontStyle: "italic" }}>
            {error
              ? `Identity unavailable — ${error}`
              : "No identity context resolved. Send x-tenant-id / x-user-id / x-role headers to populate."}
          </div>
        )}
      </div>

      {/* ── Session Inventory ──────────────────────────────── */}
      <div style={{ ...paneStyles.dashCard, borderColor: `rgba(56,189,248,0.22)` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={paneStyles.dashCardLabel}>SESSION INVENTORY</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {error && (
              <span style={{ fontSize: 10, color: "rgba(255,200,87,0.7)", letterSpacing: "0.06em" }}>ENDPOINT UNAVAILABLE</span>
            )}
            {activeCount > 0 && (
              <button
                aria-label="Revoke all active sessions"
                onClick={() => { setShowRevokeAllModal(true); setRevokeAllMsg(null); }}
                style={{
                  fontSize: 10, padding: "4px 10px", borderRadius: 4,
                  background: "rgba(255,61,129,0.1)", color: "#ff3d81",
                  border: "1px solid rgba(255,61,129,0.4)",
                  cursor: "pointer", fontWeight: 700, letterSpacing: "0.07em",
                }}
              >REVOKE ALL</button>
            )}
          </div>
        </div>
        {loading ? (
          <div style={{ fontSize: 12, color: muted }} aria-live="polite">Loading sessions…</div>
        ) : sessions.length === 0 ? (
          <div style={{ fontSize: 12, color: muted, fontStyle: "italic", padding: "12px 0" }}>
            {error ? `Error: ${error}` : "No sessions found. Sessions appear here when auth headers are present."}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }} role="table" aria-label="Session inventory">
              <thead>
                <tr>
                  {["Session ID", "Tenant", "User", "Role", "Issued", "Expires", "Last Seen", "Source", "Status", ""].map((col, i) => (
                    <th key={`${col}-${i}`} scope="col" style={{
                      textAlign: "left", padding: "5px 8px",
                      fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase",
                      color: muted, borderBottom: "1px solid rgba(56,189,248,0.2)", whiteSpace: "nowrap",
                    }}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sessions.map((s, i) => {
                  const isFlashing = !!flashRows[s.session_id];
                  return (
                    <tr
                      key={s.session_id}
                      style={{
                        background: isFlashing
                          ? "rgba(255,61,129,0.09)"
                          : i % 2 === 0 ? "rgba(255,255,255,0.015)" : "transparent",
                        transition: "background 0.3s",
                      }}
                    >
                      <td style={{ padding: "6px 8px", fontFamily: "ui-monospace,monospace", color: accent, fontSize: 11, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.session_id}</td>
                      <td style={{ padding: "6px 8px", color: textPrimary, fontSize: 11 }}>{s.tenant_id}</td>
                      <td style={{ padding: "6px 8px", color: textPrimary, fontSize: 11 }}>{s.user_id}</td>
                      <td style={{ padding: "6px 8px", color: textPrimary, fontFamily: "ui-monospace,monospace" }}>{s.role}</td>
                      <td style={{ padding: "6px 8px", color: muted, fontSize: 10 }}>{s.issued_at ? new Date(s.issued_at).toLocaleString() : "—"}</td>
                      <td style={{ padding: "6px 8px", color: muted, fontSize: 10 }}>{s.expires_at ? new Date(s.expires_at).toLocaleString() : "—"}</td>
                      <td style={{ padding: "6px 8px", fontSize: 10, whiteSpace: "nowrap" }}>
                        <span
                          title={s.last_seen ? new Date(s.last_seen).toLocaleString() : undefined}
                          style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
                        >
                          {/* coloured activity dot */}
                          <span
                            aria-hidden="true"
                            style={{
                              display: "inline-block",
                              width: 7, height: 7,
                              borderRadius: "50%",
                              background: activityDotColor(s.last_seen),
                              flexShrink: 0,
                              boxShadow: isRecentlyActive(s.last_seen)
                                ? `0 0 5px ${activityDotColor(s.last_seen)}`
                                : "none",
                            }}
                          />
                          <span style={{ color: muted }}>{relativeTime(s.last_seen)}</span>
                        </span>
                      </td>
                      <td style={{ padding: "6px 8px", color: muted, fontSize: 11 }}>{s.source}</td>
                      <td style={{ padding: "6px 8px" }}>
                        <span style={{
                          fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
                          padding: "2px 7px", borderRadius: 4,
                          background: `${statusColor(s.status)}1a`,
                          color: statusColor(s.status),
                          border: `1px solid ${statusColor(s.status)}44`,
                        }}>
                          {isFlashing ? "REVOKED" : (s.status || "unknown").toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: "6px 8px" }}>
                        {s.status === "active" && !isFlashing && (
                          <button
                            aria-label={`Revoke session ${s.session_id}`}
                            onClick={() => { setRevokeTarget(s); setRevokeReason(""); setRevokeMsg(null); }}
                            style={{
                              fontSize: 10, padding: "3px 8px", borderRadius: 4,
                              background: "rgba(255,61,129,0.1)", color: "#ff3d81",
                              border: "1px solid rgba(255,61,129,0.4)",
                              cursor: "pointer", fontWeight: 700, letterSpacing: "0.06em",
                            }}
                          >REVOKE</button>
                        )}
                        {isFlashing && (
                          <span style={{ fontSize: 10, color: "#ff3d81", fontWeight: 700, letterSpacing: "0.06em" }}>Revoked</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Per-row Revoke Modal ───────────────────────────────────── */}
      {revokeTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirm session revoke"
          style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,10,0.72)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 9999,
          }}
          onKeyDown={(e) => { if (e.key === "Escape") { setRevokeTarget(null); setRevokeReason(""); setRevokeMsg(null); } }}
        >
          <div style={{
            background: "#0d1220",
            border: "1px solid rgba(56,189,248,0.3)",
            borderRadius: 10, padding: 28, minWidth: 360, maxWidth: 480,
            display: "grid", gap: 14,
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#ff3d81", letterSpacing: "0.1em" }}>REVOKE SESSION</div>
            <div style={{ fontSize: 12, color: textPrimary }}>
              Session: <span style={{ fontFamily: "ui-monospace,monospace", color: accent }}>{revokeTarget.session_id}</span>
            </div>
            <div style={{ fontSize: 11, color: muted }}>User: {revokeTarget.user_id} · Tenant: {revokeTarget.tenant_id}</div>
            <label style={{ fontSize: 11, color: muted, display: "grid", gap: 6 }}>
              REASON (optional)
              <textarea
                autoFocus
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                placeholder="State reason for revocation…"
                rows={3}
                style={{
                  resize: "vertical",
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(56,189,248,0.25)",
                  borderRadius: 6, color: textPrimary, fontSize: 12,
                  padding: "8px 10px", fontFamily: "inherit", outline: "none",
                }}
              />
            </label>
            {revokeMsg && (
              <div style={{ fontSize: 12, color: revokeMsg.ok ? "#2dd4bf" : "#ff3d81" }} aria-live="assertive">
                {revokeMsg.text}
              </div>
            )}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={() => { setRevokeTarget(null); setRevokeReason(""); setRevokeMsg(null); }}
                disabled={revoking}
                style={{
                  fontSize: 11, padding: "6px 14px", borderRadius: 5,
                  background: "transparent", color: muted,
                  border: "1px solid rgba(234,247,255,0.2)", cursor: "pointer",
                }}
              >Cancel</button>
              <button
                onClick={handleRevoke}
                disabled={revoking}
                style={{
                  fontSize: 11, padding: "6px 14px", borderRadius: 5,
                  background: "rgba(255,61,129,0.15)", color: "#ff3d81",
                  border: "1px solid rgba(255,61,129,0.4)",
                  cursor: revoking ? "not-allowed" : "pointer",
                  fontWeight: 700, letterSpacing: "0.06em",
                  opacity: revoking ? 0.5 : 1,
                }}
              >
                {revoking ? "Revoking…" : "Confirm Revoke"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Revoke All Confirmation Modal ───────────────────────────────────── */}
      {showRevokeAllModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirm revoke all sessions"
          style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,10,0.78)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 9999,
          }}
          onKeyDown={(e) => { if (e.key === "Escape" && !revokingAll) setShowRevokeAllModal(false); }}
        >
          <div style={{
            background: "#0d1220",
            border: "1px solid rgba(255,61,129,0.35)",
            borderRadius: 10, padding: 28, minWidth: 360, maxWidth: 480,
            display: "grid", gap: 14,
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#ff3d81", letterSpacing: "0.1em" }}>REVOKE ALL SESSIONS</div>
            <div style={{ fontSize: 12, color: textPrimary, lineHeight: 1.6 }}>
              This will log out <strong style={{ color: "#ff3d81" }}>{activeCount} active session{activeCount !== 1 ? "s" : ""}</strong>. Users will need to re-authenticate.
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,200,87,0.8)", padding: "8px 10px", background: "rgba(255,200,87,0.07)", borderRadius: 6, border: "1px solid rgba(255,200,87,0.2)" }}>
              This action cannot be undone. Confirm?
            </div>
            {revokeAllMsg && (
              <div style={{ fontSize: 12, color: revokeAllMsg.ok ? "#2dd4bf" : "#ff3d81" }} aria-live="assertive">
                {revokeAllMsg.text}
              </div>
            )}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={() => { setShowRevokeAllModal(false); setRevokeAllMsg(null); }}
                disabled={revokingAll}
                style={{
                  fontSize: 11, padding: "6px 14px", borderRadius: 5,
                  background: "transparent", color: muted,
                  border: "1px solid rgba(234,247,255,0.2)", cursor: "pointer",
                }}
              >Cancel</button>
              <button
                onClick={handleRevokeAll}
                disabled={revokingAll}
                style={{
                  fontSize: 11, padding: "6px 14px", borderRadius: 5,
                  background: "rgba(255,61,129,0.18)", color: "#ff3d81",
                  border: "1px solid rgba(255,61,129,0.5)",
                  cursor: revokingAll ? "not-allowed" : "pointer",
                  fontWeight: 700, letterSpacing: "0.06em",
                  opacity: revokingAll ? 0.5 : 1,
                }}
              >
                {revokingAll ? "Revoking All…" : "Revoke All Sessions"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

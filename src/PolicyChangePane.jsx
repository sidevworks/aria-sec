// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import { useCallback, useEffect, useRef, useState } from "react";

// ── Design tokens (matches existing ARIA visual language) ─────────────────────
const C = {
  bg:       "#0a0d1a",
  surface:  "#0d1224",
  border:   "rgba(99,245,255,0.13)",
  borderHi: "rgba(99,245,255,0.28)",
  text:     "rgba(234,247,255,0.9)",
  textSub:  "rgba(234,247,255,0.52)",
  textMuted:"rgba(234,247,255,0.32)",
  accent:   "#63f5ff",
  green:    "#4ade80",
  yellow:   "#fbbf24",
  red:      "#f87171",
  purple:   "#a78bfa",
};

const RISK_THEME = {
  high:   { color: C.red,    bg: "rgba(248,113,113,0.12)",  border: "rgba(248,113,113,0.3)"  },
  medium: { color: C.yellow, bg: "rgba(251,191,36,0.10)",   border: "rgba(251,191,36,0.28)"  },
  low:    { color: C.green,  bg: "rgba(74,222,128,0.08)",   border: "rgba(74,222,128,0.22)"  },
};

function riskTheme(risk) { return RISK_THEME[risk] || RISK_THEME.low; }

function ts(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

// ── Confirm/Reason Modal ──────────────────────────────────────────────────────

function ConfirmModal({ preview, onConfirm, onCancel }) {
  const [reason, setReason] = useState("");
  const [err, setErr]       = useState("");
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const theme = riskTheme(preview?.risk);

  function submit(e) {
    e.preventDefault();
    if (!reason.trim()) { setErr("Reason is required."); return; }
    onConfirm(reason.trim());
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={onCancel}>
      <div style={{
        background: C.surface, border: `1px solid ${C.border}`,
        borderRadius: 12, padding: 28, width: 460, maxWidth: "94vw",
        boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
      }} onClick={(e) => e.stopPropagation()}>

        {/* Risk banner */}
        <div style={{
          background: theme.bg, border: `1px solid ${theme.border}`,
          borderRadius: 6, padding: "6px 14px", marginBottom: 18,
          fontSize: 12, fontWeight: 700, color: theme.color, letterSpacing: "0.05em",
        }}>
          ⚠ {preview?.risk?.toUpperCase()} RISK — policy change requires justification
        </div>

        <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 8 }}>
          Apply Policy Change
        </div>
        <div style={{ fontSize: 13, color: C.textSub, marginBottom: 16, lineHeight: 1.55 }}>
          Policy <code style={{ color: C.accent }}>{preview?.policy_id}</code> will be updated.
          {preview?.diff?.length ? (
            <span> Changes: {preview.diff.map((d) => d.field).join(", ")}.</span>
          ) : null}
        </div>

        {/* Diff summary */}
        {preview?.capabilities_touched && (
          preview.capabilities_touched.added.length > 0 || preview.capabilities_touched.removed.length > 0
        ) && (
          <div style={{
            background: C.bg, border: `1px solid ${C.border}`,
            borderRadius: 7, padding: "10px 14px", marginBottom: 16, fontSize: 12,
          }}>
            {preview.capabilities_touched.added.length > 0 && (
              <div style={{ marginBottom: 4 }}>
                <span style={{ color: C.green }}>+ Added: </span>
                <span style={{ color: C.textSub }}>{preview.capabilities_touched.added.join(", ")}</span>
              </div>
            )}
            {preview.capabilities_touched.removed.length > 0 && (
              <div>
                <span style={{ color: C.red }}>− Removed: </span>
                <span style={{ color: C.textSub }}>{preview.capabilities_touched.removed.join(", ")}</span>
              </div>
            )}
          </div>
        )}

        <form onSubmit={submit}>
          <label style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Reason (required)
          </label>
          <textarea
            ref={inputRef}
            value={reason}
            onChange={(e) => { setReason(e.target.value); setErr(""); }}
            placeholder="Describe the business justification for this change…"
            rows={3}
            style={{
              width: "100%", boxSizing: "border-box", marginTop: 6,
              background: C.bg, border: `1px solid ${err ? C.red : C.border}`,
              borderRadius: 7, color: C.text, fontSize: 13, padding: "10px 12px",
              resize: "vertical", outline: "none", fontFamily: "inherit",
              marginBottom: err ? 6 : 18,
            }}
          />
          {err && <div style={{ fontSize: 12, color: C.red, marginBottom: 14 }}>{err}</div>}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button type="button" onClick={onCancel} style={{
              background: "transparent", border: `1px solid ${C.border}`,
              color: C.textSub, padding: "8px 18px", borderRadius: 7,
              fontSize: 13, cursor: "pointer",
            }}>Cancel</button>
            <button type="submit" style={{
              background: theme.bg, border: `1px solid ${theme.border}`,
              color: theme.color, padding: "8px 20px", borderRadius: 7,
              fontSize: 13, fontWeight: 700, cursor: "pointer",
            }}>Apply Change</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Policy Editor (inline proposed edit form) ─────────────────────────────────

const ALL_CAPS = ["read", "write", "delete", "manage_users", "manage_policies"];

function PolicyEditor({ policy, onPreview, onCancel, loading }) {
  const [caps, setCaps] = useState(new Set(policy?.capabilities || []));
  const [enabled, setEnabled] = useState(policy?.enabled ?? true);
  const [name, setName] = useState(policy?.name || "");

  function toggleCap(c) {
    setCaps((prev) => {
      const next = new Set(prev);
      next.has(c) ? next.delete(c) : next.add(c);
      return next;
    });
  }

  function submit(e) {
    e.preventDefault();
    onPreview({
      name: name.trim() || policy?.name,
      capabilities: [...caps],
      enabled,
    });
  }

  return (
    <form onSubmit={submit} style={{
      background: C.bg, border: `1px solid ${C.borderHi}`,
      borderRadius: 9, padding: "16px 18px", marginTop: 12,
    }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: C.accent, marginBottom: 14, letterSpacing: "0.06em" }}>
        EDIT POLICY
      </div>

      <label style={{ fontSize: 11, color: C.textMuted, letterSpacing: "0.07em", textTransform: "uppercase" }}>Name</label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={{
          display: "block", width: "100%", boxSizing: "border-box",
          background: C.surface, border: `1px solid ${C.border}`,
          borderRadius: 6, color: C.text, fontSize: 13, padding: "7px 10px",
          outline: "none", marginTop: 4, marginBottom: 14, fontFamily: "inherit",
        }}
      />

      <div style={{ fontSize: 11, color: C.textMuted, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 8 }}>
        Capabilities
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        {ALL_CAPS.map((c) => {
          const active = caps.has(c);
          const isHighRisk = ["manage_policies", "manage_users", "delete"].includes(c);
          return (
            <button
              key={c}
              type="button"
              onClick={() => toggleCap(c)}
              style={{
                padding: "4px 12px", borderRadius: 99, fontSize: 12, fontWeight: 600,
                cursor: "pointer", transition: "all 0.15s",
                background: active ? (isHighRisk ? "rgba(248,113,113,0.18)" : "rgba(99,245,255,0.14)") : "transparent",
                border: `1px solid ${active ? (isHighRisk ? C.red : C.accent) : C.border}`,
                color: active ? (isHighRisk ? C.red : C.accent) : C.textMuted,
              }}
            >
              {c}
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <input
          type="checkbox"
          id="pol-enabled"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          style={{ accentColor: C.accent, width: 15, height: 15 }}
        />
        <label htmlFor="pol-enabled" style={{ fontSize: 13, color: C.textSub, cursor: "pointer" }}>
          Policy enabled
        </label>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" onClick={onCancel} style={{
          background: "transparent", border: `1px solid ${C.border}`,
          color: C.textMuted, padding: "7px 16px", borderRadius: 7,
          fontSize: 12, cursor: "pointer",
        }}>Cancel</button>
        <button type="submit" disabled={loading} style={{
          background: "rgba(99,245,255,0.12)", border: `1px solid ${C.accent}`,
          color: C.accent, padding: "7px 16px", borderRadius: 7,
          fontSize: 12, fontWeight: 600, cursor: "pointer",
        }}>
          {loading ? "Previewing…" : "Preview Change"}
        </button>
      </div>
    </form>
  );
}

// ── Policy Row ────────────────────────────────────────────────────────────────

function PolicyRow({ policy, accent, onEdit }) {
  const riskColor = policy.enabled ? C.green : C.textMuted;
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 8, padding: "12px 16px", marginBottom: 8,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 4 }}>
            {policy.name}
            <span style={{
              marginLeft: 8, fontSize: 10, fontWeight: 700, padding: "2px 7px",
              borderRadius: 99, background: policy.enabled ? "rgba(74,222,128,0.12)" : "rgba(255,255,255,0.06)",
              color: riskColor, textTransform: "uppercase", letterSpacing: "0.06em",
            }}>
              {policy.enabled ? "enabled" : "disabled"}
            </span>
          </div>
          <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 8, fontFamily: "monospace" }}>
            {policy.id} · {policy.role || "—"} · {policy.tenant_id}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {(policy.capabilities || []).map((c) => {
              const isHigh = ["manage_policies", "manage_users", "delete"].includes(c);
              return (
                <span key={c} style={{
                  fontSize: 11, padding: "2px 8px", borderRadius: 99,
                  background: isHigh ? "rgba(248,113,113,0.12)" : "rgba(99,245,255,0.08)",
                  color: isHigh ? C.red : C.accent,
                  border: `1px solid ${isHigh ? "rgba(248,113,113,0.2)" : "rgba(99,245,255,0.15)"}`,
                }}>
                  {c}
                </span>
              );
            })}
          </div>
        </div>
        <button
          onClick={() => onEdit(policy)}
          style={{
            background: "rgba(99,245,255,0.07)", border: `1px solid ${C.border}`,
            color: accent || C.accent, padding: "5px 12px", borderRadius: 6,
            fontSize: 12, cursor: "pointer", fontWeight: 600, flexShrink: 0,
          }}
        >
          Edit
        </button>
      </div>
    </div>
  );
}

// ── Policy History ────────────────────────────────────────────────────────────

function PolicyHistory({ history }) {
  if (!history?.length) return (
    <div style={{ padding: "24px 0", textAlign: "center", fontSize: 13, color: C.textMuted }}>
      No policy changes recorded.
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {history.map((h) => {
        const theme = riskTheme(h.risk);
        return (
          <div key={h.id} style={{
            background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: 7, padding: "10px 14px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 99,
                background: theme.bg, color: theme.color, textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}>{h.risk}</span>
              <span style={{ fontSize: 12, fontFamily: "monospace", color: C.textSub }}>{h.policy_id}</span>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 11, color: C.textMuted }}>{ts(h.timestamp)}</span>
            </div>
            <div style={{ fontSize: 12, color: C.textMuted }}>
              <span style={{ color: C.textSub }}>{h.actor}</span>
              {h.reason && <span> · "{h.reason}"</span>}
            </div>
            {h.diff?.length > 0 && (
              <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 5 }}>
                {h.diff.map((d) => (
                  <span key={d.field} style={{
                    fontSize: 10, padding: "2px 7px", borderRadius: 4,
                    background: "rgba(99,245,255,0.07)", color: C.accent,
                    border: "1px solid rgba(99,245,255,0.12)", fontFamily: "monospace",
                  }}>{d.field}</span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main PolicyChangePane ─────────────────────────────────────────────────────

const ARIA_BASE = typeof window !== "undefined"
  ? (import.meta.env?.VITE_SECUREBOT_API_BASE || "http://localhost:5000")
  : "http://localhost:5000";

export default function PolicyChangePane({ state = {}, onRefresh, accent = "#63f5ff", appAuthHeaders = null }) {
  const { policies = [], history = [], loading = false, error = null } = state;
  const [tab, setTab]             = useState("policies");
  const [editingPolicy, setEditing] = useState(null);
  const [previewData, setPreview] = useState(null);
  const [modal, setModal]         = useState(false);
  const [busy, setBusy]           = useState(false);
  const [toast, setToast]         = useState(null);

  function showToast(msg, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  // Use app-level identity headers when provided (wired via App.jsx buildAuthHeaders).
  // Fall back to safe read-only defaults so the component is usable standalone.
  const authHeaders = useCallback(() => ({
    "Content-Type": "application/json",
    ...(appAuthHeaders || {}),
  }), [appAuthHeaders]);

  async function handlePreview(proposed) {
    if (!editingPolicy) return;
    setBusy(true);
    try {
      const r = await fetch(`${ARIA_BASE}/api/aria/policy/preview`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ policy_id: editingPolicy.id, proposed }),
      });
      const d = await r.json();
      if (!r.ok) { showToast(d.error || "Preview failed", false); return; }
      setPreview({ ...d, _proposed: proposed });
      setModal(true);
    } catch (e) {
      showToast(`Preview error: ${e.message}`, false);
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm(reason) {
    if (!previewData || !editingPolicy) return;
    setModal(false);
    setBusy(true);
    try {
      const r = await fetch(`${ARIA_BASE}/api/aria/policy/apply`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          policy_id: editingPolicy.id,
          proposed: previewData._proposed,
          reason,
        }),
      });
      const d = await r.json();
      if (!r.ok) { showToast(d.error || "Apply failed", false); return; }
      showToast(`Policy updated — risk: ${d.history_entry?.risk || "low"}`, true);
      setEditing(null);
      setPreview(null);
      onRefresh?.();
    } catch (e) {
      showToast(`Apply error: ${e.message}`, false);
    } finally {
      setBusy(false);
    }
  }

  const TAB_STYLE = (active) => ({
    padding: "5px 14px", borderRadius: 6, fontSize: 13, cursor: "pointer", border: "none",
    background: active ? "rgba(99,245,255,0.12)" : "transparent",
    color: active ? accent : "rgba(234,247,255,0.42)",
    fontWeight: active ? 700 : 400,
  });

  return (
    <div style={{ color: C.text, minHeight: 200 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", marginBottom: 18, gap: 12 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Policy Changes</div>
          <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
            RBAC policy inventory · change preview · auditable apply
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={onRefresh} disabled={loading || busy} style={{
          background: "transparent", border: `1px solid ${C.border}`,
          color: C.textMuted, padding: "5px 12px", borderRadius: 6,
          fontSize: 12, cursor: "pointer",
        }}>
          {loading ? "Loading…" : "↻ Refresh"}
        </button>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: `1px solid ${C.border}`, paddingBottom: 8 }}>
        <button style={TAB_STYLE(tab === "policies")} onClick={() => setTab("policies")}>Policies</button>
        <button style={TAB_STYLE(tab === "history")}  onClick={() => setTab("history")}>Change History</button>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)",
          borderRadius: 7, padding: "10px 14px", color: C.red, fontSize: 13, marginBottom: 16,
        }}>
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ padding: "32px 0", textAlign: "center", fontSize: 13, color: C.textMuted }}>
          Loading policies…
        </div>
      )}

      {/* Policies tab */}
      {!loading && tab === "policies" && (
        <div>
          {policies.length === 0 && !error && (
            <div style={{ padding: "32px 0", textAlign: "center", fontSize: 13, color: C.textMuted }}>
              No policies found.
            </div>
          )}
          {policies.map((p) => (
            <div key={p.id}>
              <PolicyRow
                policy={p}
                accent={accent}
                onEdit={(pol) => { setEditing(pol); setPreview(null); }}
              />
              {editingPolicy?.id === p.id && (
                <PolicyEditor
                  policy={p}
                  onPreview={handlePreview}
                  onCancel={() => { setEditing(null); setPreview(null); }}
                  loading={busy}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* History tab */}
      {!loading && tab === "history" && <PolicyHistory history={history} />}

      {/* Confirm modal */}
      {modal && previewData && (
        <ConfirmModal
          preview={previewData}
          onConfirm={handleConfirm}
          onCancel={() => setModal(false)}
        />
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 2000,
          background: toast.ok ? "rgba(74,222,128,0.15)" : "rgba(248,113,113,0.15)",
          border: `1px solid ${toast.ok ? C.green : C.red}`,
          color: toast.ok ? C.green : C.red,
          padding: "10px 18px", borderRadius: 8,
          fontSize: 13, fontWeight: 600,
          boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
        }}>
          {toast.ok ? "✓ " : "✗ "}{toast.msg}
        </div>
      )}
    </div>
  );
}

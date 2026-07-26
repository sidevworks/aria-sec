// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

// Lazy-loadable security admin panel — no Three.js dependency.
// Loaded on demand when the user navigates to the security-admin dashboard.
import { useEffect, useMemo, useState } from "react";

const ROLE_MATRIX = [
  { role: "owner",   aria_read: true,  aria_write: true,  spm_read: true,  spm_write: true  },
  { role: "admin",   aria_read: true,  aria_write: true,  spm_read: true,  spm_write: true  },
  { role: "analyst", aria_read: true,  aria_write: true,  spm_read: true,  spm_write: true,
    note: "autonomy write restricted" },
  { role: "viewer",  aria_read: true,  aria_write: false, spm_read: true,  spm_write: false },
];

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
  feedLine: {
    fontSize: 12,
    lineHeight: 1.3,
    color: "rgba(220, 237, 255, 0.88)",
    padding: "6px 8px",
    borderRadius: 8,
    border: "1px solid rgba(140, 178, 255, 0.18)",
    background: "rgba(15, 26, 50, 0.45)",
  },
};

function PermBadge({ allowed }) {
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 7px",
      borderRadius: 4,
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: "0.06em",
      background: allowed ? "rgba(45,212,191,0.14)" : "rgba(255,61,129,0.12)",
      color: allowed ? "#2dd4bf" : "#ff3d81",
      border: `1px solid ${allowed ? "rgba(45,212,191,0.28)" : "rgba(255,61,129,0.24)"}`,
    }}>
      {allowed ? "ALLOW" : "DENY"}
    </span>
  );
}

const POLICY_SCOPES = [
  { value: "aria", label: "Aria" },
  { value: "spm", label: "AI-SPM" },
];

const POLICY_ACTIONS = [
  { value: "read", label: "Read" },
  { value: "write", label: "Write" },
];

function bucketStatusMeta(rawStatus) {
  const status = String(rawStatus || "").toLowerCase();
  if (status === "live" || status === "ok") return { label: "LIVE", color: "#2dd4bf" };
  if (status === "degraded" || status === "limited") return { label: "DEGRADED", color: "#ffc857" };
  if (status === "blocked" || status === "exceeded") return { label: "BLOCKED", color: "#ff3d81" };
  return { label: "UNAVAILABLE", color: "rgba(203,223,255,0.72)" };
}

function policyRiskLabel({ role, action, nextAllowed }) {
  if (role === "owner" && action === "write" && !nextAllowed) return "critical";
  if ((role === "admin" || role === "analyst") && action === "write") return "high";
  if (!nextAllowed) return "medium";
  return "low";
}

export default function SecurityAdminPane({ securityAdminState, accent = "#a78bfa" }) {
  const {
    tenantContext = null,
    authDenials = [],
    quotaStatus = null,
    loading = false,
    dataUnavailable = false,
  } = securityAdminState;

  const acc = accent;
  const muted = "rgba(234,247,255,0.46)";
  const textPrimary = "rgba(215,235,255,0.9)";
  const actionEndpoints = securityAdminState?.actionEndpoints || {};
  const policyApplyEndpoint = actionEndpoints.policy_update || actionEndpoints.rbac_policy_update || "/api/aria/config/security";
  const policyApplyMethod = String(actionEndpoints.policy_update_method || "POST").toUpperCase();
  const sessionsEndpoint = actionEndpoints.sessions_list || actionEndpoints.identity_sessions_list || "/api/aria/sessions";
  const sessionsMethod = String(actionEndpoints.sessions_list_method || "GET").toUpperCase();
  const complianceEndpoint = actionEndpoints.compliance_status || "/api/aria/compliance/status";
  const sessionRevokeTemplate = actionEndpoints.session_revoke_template || "/api/aria/sessions/:id/revoke";
  const sessionForceReauthTemplate = actionEndpoints.session_force_reauth_template || "/api/aria/sessions/:id/force-reauth";
  const requestHeaders = securityAdminState?.authHeaders || {};

  const [draft, setDraft] = useState({
    role: "analyst",
    scope: "aria",
    action: "write",
    nextAllowed: false,
    reason: "",
  });
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [acknowledgedRisk, setAcknowledgedRisk] = useState(false);
  const [flowStatus, setFlowStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sessionState, setSessionState] = useState({
    loading: false,
    error: "",
    items: [],
  });
  const [sessionActionState, setSessionActionState] = useState({ busyId: "", message: "" });
  const [showAllAuditEvents, setShowAllAuditEvents] = useState(false);
  const [groupAuditEvents, setGroupAuditEvents] = useState(true);

  const tenantRows = tenantContext ? [
    { label: "tenant_id", value: tenantContext.tenant_id },
    { label: "user_id",   value: tenantContext.user_id },
    { label: "role",      value: tenantContext.role },
    { label: "authz mode", value: tenantContext.authz_mode },
  ] : [
    { label: "tenant_id",  value: "tenant-local", note: "local default" },
    { label: "user_id",    value: "user-local",   note: "local default" },
    { label: "role",       value: "owner",        note: "local default" },
    { label: "authz mode", value: "bypass (ARIA_AUTHZ_ALLOW_LOCAL_BYPASS)", note: "local default" },
  ];

  const policyRows = useMemo(() => {
    const matrix = Array.isArray(securityAdminState?.policyMatrix) && securityAdminState.policyMatrix.length
      ? securityAdminState.policyMatrix
      : ROLE_MATRIX;
    return matrix;
  }, [securityAdminState?.policyMatrix]);

  const fieldKey = `${draft.scope}_${draft.action}`;
  const activeRow = policyRows.find((row) => row.role === draft.role);
  const currentAllowed = Boolean(activeRow?.[fieldKey]);
  const risk = policyRiskLabel({ role: draft.role, action: draft.action, nextAllowed: draft.nextAllowed });

  const deltaPreview = {
    role: draft.role,
    permission: `${draft.scope}.${draft.action}`,
    from: currentAllowed ? "allow" : "deny",
    to: draft.nextAllowed ? "allow" : "deny",
    risk,
    reason: draft.reason.trim(),
  };

  const resetFlow = (message = "") => {
    setPreviewOpen(false);
    setConfirmOpen(false);
    setAcknowledgedRisk(false);
    setSubmitting(false);
    setFlowStatus(message);
  };

  const openPreview = () => {
    setPreviewOpen(true);
    setConfirmOpen(false);
    setAcknowledgedRisk(false);
    setFlowStatus("Policy delta preview ready. Review and continue to confirmation.");
  };

  const confirmPolicyApply = async () => {
    if (!acknowledgedRisk) {
      setFlowStatus("Confirm risk acknowledgment before applying.");
      return;
    }
    setSubmitting(true);
    setFlowStatus("Applying policy update...");
    try {
      const payload = { delta: deltaPreview, tenant_context: tenantContext || null };
      const action = securityAdminState?.actions?.applyPolicyChange;
      if (typeof action === "function") {
        await action(payload);
        setFlowStatus("Policy update request submitted.");
      } else if (policyApplyEndpoint) {
        const response = await fetch(policyApplyEndpoint, {
          method: policyApplyMethod,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.error || `Endpoint rejected request (${response.status}).`);
        setFlowStatus("Policy update request submitted.");
      } else {
        setFlowStatus("Preview complete. Apply endpoint is not wired yet.");
      }
      setConfirmOpen(false);
    } catch (err) {
      setFlowStatus(`Apply failed: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const parseSessionItems = (payload) => {
      if (Array.isArray(payload?.sessions)) return payload.sessions;
      if (Array.isArray(payload?.items)) return payload.items;
      if (Array.isArray(payload?.data?.sessions)) return payload.data.sessions;
      return [];
    };

    const loadSessions = async () => {
      if (!cancelled) {
        setSessionState({ loading: true, error: "", items: [] });
      }

      try {
        const response = await fetch(sessionsEndpoint, { method: sessionsMethod, headers: requestHeaders });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data?.error || `Session endpoint rejected (${response.status}).`);
        }
        const items = parseSessionItems(data);
        if (!cancelled) {
          setSessionState({ loading: false, error: "", items });
        }
      } catch (err) {
        if (!cancelled) {
          setSessionState({ loading: false, error: err.message || "Unable to load sessions.", items: [] });
        }
      }
    };

    void loadSessions();
    return () => { cancelled = true; };
  }, [requestHeaders, sessionsEndpoint, sessionsMethod]);

  const runSessionAction = async (sessionId, action) => {
    const template = action === "revoke" ? sessionRevokeTemplate : sessionForceReauthTemplate;
    const endpoint = template.replace(":id", encodeURIComponent(sessionId));
    setSessionActionState({ busyId: `${action}:${sessionId}`, message: `${action === "revoke" ? "Revoking" : "Forcing re-auth"} session...` });
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...requestHeaders },
        body: JSON.stringify({ reason: "security-admin-triage" }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || `Action failed (${response.status}).`);
      }
      setSessionActionState({ busyId: "", message: action === "revoke" ? "Session revoked." : "Force re-auth request submitted." });
      setSessionState((prev) => ({
        ...prev,
        items: prev.items.map((item) => {
          const sid = item.id || item.session_id;
          if (sid !== sessionId) return item;
          if (action === "revoke") {
            return { ...item, status: "revoked" };
          }
          return { ...item, status: "reauth_required" };
        }),
      }));
    } catch (err) {
      setSessionActionState({ busyId: "", message: `Session action unavailable: ${err.message}` });
    }
  };

  const filteredAuthDenials = useMemo(() => {
    const events = Array.isArray(authDenials) ? authDenials : [];
    if (showAllAuditEvents) return events;
    return events.filter((event) => event?.event_type !== "authz.missing_context");
  }, [authDenials, showAllAuditEvents]);

  const groupedAuthDenials = useMemo(() => {
    if (!groupAuditEvents) return filteredAuthDenials;
    const map = new Map();
    for (const event of filteredAuthDenials) {
      const eventType = event?.event_type || "authz.denied";
      const apiPath = event?.context?.api_path || "unknown-path";
      const reason = event?.context?.reason || "unspecified reason";
      const actor = event?.actor || "unknown";
      const key = `${eventType}__${apiPath}__${reason}__${actor}`;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { ...event, _count: 1, _lastSeen: event?.timestamp || null });
      } else {
        existing._count += 1;
        const incomingTs = event?.timestamp ? new Date(event.timestamp).getTime() : 0;
        const existingTs = existing._lastSeen ? new Date(existing._lastSeen).getTime() : 0;
        if (incomingTs >= existingTs) {
          existing._lastSeen = event?.timestamp || existing._lastSeen;
          existing.timestamp = event?.timestamp || existing.timestamp;
        }
      }
    }
    return Array.from(map.values());
  }, [filteredAuthDenials, groupAuditEvents]);

  return (
    <div style={{ display: "grid", gap: 12 }}>

      {/* ── 1 · Tenant Context ─────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ ...paneStyles.dashCard, borderColor: `rgba(167,139,250,0.22)` }}>
          <div style={paneStyles.dashCardLabel}>TENANT CONTEXT</div>
          {loading ? (
            <div style={{ marginTop: 10, fontSize: 12, color: muted }}>Loading context…</div>
          ) : (
            <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
              {tenantRows.map(({ label, value, note }) => (
                <div key={label} style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 8, alignItems: "baseline" }}>
                  <span style={{ fontSize: 11, color: muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</span>
                  <span style={{ fontSize: 12, color: textPrimary, fontFamily: "ui-monospace,monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {value}
                    {note && (
                      <span style={{ marginLeft: 6, fontSize: 10, color: "rgba(255,200,87,0.72)", letterSpacing: "0.04em" }}>
                        [{note}]
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── 2 · Quota / Rate Guard Status ──────────────────────── */}
        <div style={{ ...paneStyles.dashCard, borderColor: `rgba(167,139,250,0.22)` }}>
          <div style={paneStyles.dashCardLabel}>QUOTA / RATE GUARD STATUS</div>
          {quotaStatus ? (
            <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
              {quotaStatus.buckets.map((bucket) => {
                const statusMeta = bucketStatusMeta(bucket.status);
                return (
                  <div key={bucket.name} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 6, alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: textPrimary, fontFamily: "ui-monospace,monospace" }}>{bucket.name}</span>
                    <span style={{
                      fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
                      padding: "2px 7px", borderRadius: 4,
                      background: `${statusMeta.color}1a`, color: statusMeta.color,
                      border: `1px solid ${statusMeta.color}44`,
                    }}>
                      {statusMeta.label}
                      {bucket.retry_after ? ` · ${bucket.retry_after}s` : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
              {[
                { name: "aria bucket", status: "ok" },
                { name: "ai-spm heavy bucket", status: "ok" },
              ].map((bucket) => (
                <div key={bucket.name} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: textPrimary, fontFamily: "ui-monospace,monospace" }}>{bucket.name}</span>
                  <span style={{
                    fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
                    padding: "2px 7px", borderRadius: 4,
                    background: "rgba(45,212,191,0.1)", color: "#2dd4bf",
                    border: "1px solid rgba(45,212,191,0.28)",
                  }}>OK</span>
                </div>
              ))}
              <div style={{ marginTop: 4, fontSize: 11, color: muted, fontStyle: "italic" }}>
                Live quota data unavailable — no quota endpoint active yet.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── 3 · Role Matrix ────────────────────────────────────── */}
      <div style={{ ...paneStyles.dashCard, borderColor: `rgba(167,139,250,0.22)` }}>
        <div style={paneStyles.dashCardLabel}>ROLE PERMISSION MATRIX</div>
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                {["Role", "Aria · Read", "Aria · Write", "AI-SPM · Read", "AI-SPM · Write", "Notes"].map((col) => (
                  <th key={col} style={{
                    textAlign: "left", padding: "5px 10px",
                    fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase",
                    color: muted, borderBottom: "1px solid rgba(167,139,250,0.2)", whiteSpace: "nowrap",
                  }}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROLE_MATRIX.map(({ role, aria_read, aria_write, spm_read, spm_write, note }, idx) => (
                <tr key={role} style={{ background: idx % 2 === 0 ? "rgba(255,255,255,0.015)" : "transparent" }}>
                  <td style={{ padding: "7px 10px", color: acc, fontFamily: "ui-monospace,monospace", fontWeight: 700, fontSize: 12 }}>{role}</td>
                  <td style={{ padding: "7px 10px", textAlign: "center" }}><PermBadge allowed={aria_read} /></td>
                  <td style={{ padding: "7px 10px", textAlign: "center" }}><PermBadge allowed={aria_write} /></td>
                  <td style={{ padding: "7px 10px", textAlign: "center" }}><PermBadge allowed={spm_read} /></td>
                  <td style={{ padding: "7px 10px", textAlign: "center" }}><PermBadge allowed={spm_write} /></td>
                  <td style={{ padding: "7px 10px", fontSize: 11, color: note ? "rgba(255,200,87,0.72)" : muted }}>{note || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 3.5 · RBAC Policy Preview + Confirm ─────────────────── */}
      <div style={{ ...paneStyles.dashCard, borderColor: `rgba(167,139,250,0.22)` }}>
        <div style={paneStyles.dashCardLabel}>RBAC POLICY CHANGE PREVIEW</div>
        <div className="secAdminPolicyGrid" style={{ display: "grid", gap: 10, marginTop: 10 }}>
          <div className="secAdminPolicyInputGrid" style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 10, color: muted, letterSpacing: "0.08em", textTransform: "uppercase" }}>Role</span>
              <select className="secAdminControl" aria-label="Role" value={draft.role} onChange={(e) => setDraft((curr) => ({ ...curr, role: e.target.value }))} style={styles.controlSelect}>
                {policyRows.map((row) => <option key={row.role} value={row.role}>{row.role}</option>)}
              </select>
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 10, color: muted, letterSpacing: "0.08em", textTransform: "uppercase" }}>Scope</span>
              <select className="secAdminControl" aria-label="Scope" value={draft.scope} onChange={(e) => setDraft((curr) => ({ ...curr, scope: e.target.value }))} style={styles.controlSelect}>
                {POLICY_SCOPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 10, color: muted, letterSpacing: "0.08em", textTransform: "uppercase" }}>Action</span>
              <select className="secAdminControl" aria-label="Action" value={draft.action} onChange={(e) => setDraft((curr) => ({ ...curr, action: e.target.value }))} style={styles.controlSelect}>
                {POLICY_ACTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 10, color: muted, letterSpacing: "0.08em", textTransform: "uppercase" }}>New State</span>
              <select className="secAdminControl" aria-label="New state" value={draft.nextAllowed ? "allow" : "deny"} onChange={(e) => setDraft((curr) => ({ ...curr, nextAllowed: e.target.value === "allow" }))} style={styles.controlSelect}>
                <option value="allow">Allow</option>
                <option value="deny">Deny</option>
              </select>
            </label>
          </div>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 10, color: muted, letterSpacing: "0.08em", textTransform: "uppercase" }}>Change Reason</span>
            <input
              className="secAdminControl"
              aria-label="Policy change reason"
              value={draft.reason}
              onChange={(e) => setDraft((curr) => ({ ...curr, reason: e.target.value }))}
              placeholder="Add a reason for audit traceability"
              style={styles.controlInput}
            />
          </label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button type="button" onClick={openPreview} style={styles.primaryButton}>Preview Delta</button>
            <button type="button" onClick={() => resetFlow("Policy change canceled.")} style={styles.ghostButton}>Cancel</button>
          </div>
          {previewOpen && (
            <div style={{ ...paneStyles.feedLine, borderColor: "rgba(167,139,250,0.35)", background: "rgba(110,88,210,0.12)" }}>
              <div style={{ display: "grid", gap: 4 }}>
                <strong style={{ fontSize: 12, color: "#d9c8ff" }}>Delta Preview</strong>
                <span style={{ fontSize: 11, color: textPrimary }}>{deltaPreview.role} · {deltaPreview.permission}: <b>{deltaPreview.from.toUpperCase()}</b> → <b>{deltaPreview.to.toUpperCase()}</b></span>
                <span style={{ fontSize: 11, color: muted }}>Risk: <b style={{ color: risk === "critical" ? "#ff3d81" : risk === "high" ? "#ffc857" : risk === "medium" ? "#9fe7ff" : "#2dd4bf" }}>{risk.toUpperCase()}</b></span>
                <span style={{ fontSize: 10, color: muted }}>
                  Apply route: {policyApplyEndpoint} ({policyApplyMethod})
                </span>
              </div>
              <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8 }}>
                <button type="button" onClick={() => { setConfirmOpen(true); setFlowStatus("Awaiting explicit confirmation."); }} style={styles.primaryButton}>Continue To Confirm</button>
                <button type="button" onClick={() => resetFlow("Preview dismissed.")} style={styles.ghostButton}>Dismiss</button>
              </div>
            </div>
          )}
          {confirmOpen && (
            <div style={{ ...paneStyles.feedLine, borderColor: "rgba(255,200,87,0.35)", background: "rgba(255,200,87,0.09)" }}>
              <div style={{ fontSize: 11, color: "rgba(255,223,173,0.94)" }}>
                Confirm RBAC update with <strong>{risk.toUpperCase()}</strong> risk impact.
              </div>
              <label style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "flex-start", fontSize: 11, color: textPrimary }}>
                <input type="checkbox" checked={acknowledgedRisk} onChange={(e) => setAcknowledgedRisk(e.target.checked)} />
                I understand this change affects authorization behavior and should be audited.
              </label>
              <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8 }}>
                <button type="button" onClick={() => void confirmPolicyApply()} disabled={submitting} style={styles.primaryButton}>
                  {submitting ? "Applying..." : "Confirm & Apply"}
                </button>
                <button type="button" onClick={() => resetFlow("Confirmation canceled.")} style={styles.ghostButton}>Cancel</button>
              </div>
            </div>
          )}
          <div aria-live="polite" style={{ fontSize: 11, color: flowStatus.includes("failed") ? "#ff9ab4" : muted }}>
            {flowStatus || "No pending policy change."}
          </div>
        </div>
      </div>

      {/* ── 4 · Identity & Sessions ─────────────────────────────── */}
      <div style={{ ...paneStyles.dashCard, borderColor: `rgba(167,139,250,0.22)` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 8 }}>
          <div style={paneStyles.dashCardLabel}>IDENTITY & SESSIONS</div>
          <span style={{ fontSize: 10, color: muted, letterSpacing: "0.06em" }}>
            LIVE · {sessionsMethod}
          </span>
        </div>
        {sessionState.loading ? (
          <div style={{ ...paneStyles.feedLine, color: muted }}>Loading sessions...</div>
        ) : sessionState.error ? (
          <div style={{ ...paneStyles.feedLine, borderColor: "rgba(255,61,129,0.24)", background: "rgba(255,61,129,0.08)", color: "rgba(255,173,193,0.94)" }}>
            Unavailable ({sessionsEndpoint}): {sessionState.error}
          </div>
        ) : sessionState.items.length === 0 ? (
          <div style={{ ...paneStyles.feedLine, color: muted }}>
            No active sessions returned from {sessionsEndpoint}.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 6, maxHeight: 220, overflowY: "auto" }}>
            {sessionState.items.map((session, idx) => {
              const sid = session.id || session.session_id || `session-${idx}`;
              const actor = session.user_id || session.actor || session.principal || "unknown";
              const tenant = session.tenant_id || session.tenant || "n/a";
              const role = session.role || session.effective_role || "n/a";
              const statusMeta = bucketStatusMeta(session.status || session.state || "unavailable");
              const seenAt = session.last_seen_at || session.updated_at || session.created_at || "";

              return (
                <div key={sid} style={{ ...paneStyles.feedLine, display: "grid", gap: 6 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 11, color: textPrimary, fontFamily: "ui-monospace,monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {sid}
                    </span>
                    <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 4, background: `${statusMeta.color}1a`, border: `1px solid ${statusMeta.color}44`, color: statusMeta.color }}>
                      {statusMeta.label}
                    </span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 8, fontSize: 11, color: muted }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>user: {actor}</span>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>tenant: {tenant}</span>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>role: {role}</span>
                  </div>
                  {seenAt && (
                    <div style={{ fontSize: 10, color: "rgba(255,200,87,0.76)" }}>
                      last seen: {new Date(seenAt).toLocaleString()}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      type="button"
                      style={styles.ghostButton}
                      disabled={sessionActionState.busyId === `revoke:${sid}`}
                      onClick={() => void runSessionAction(sid, "revoke")}
                    >
                      {sessionActionState.busyId === `revoke:${sid}` ? "Revoking..." : "Revoke"}
                    </button>
                    <button
                      type="button"
                      style={styles.ghostButton}
                      disabled={sessionActionState.busyId === `force-reauth:${sid}`}
                      onClick={() => void runSessionAction(sid, "force-reauth")}
                    >
                      {sessionActionState.busyId === `force-reauth:${sid}` ? "Submitting..." : "Force Re-auth"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div aria-live="polite" style={{ marginTop: 8, fontSize: 11, color: muted }}>
          {sessionActionState.message}
        </div>
      </div>

      {/* ── 4.5 · Compliance ─────────────────────────────── */}
      <div style={{ ...paneStyles.dashCard, borderColor: `rgba(167,139,250,0.22)` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 8 }}>
          <div style={paneStyles.dashCardLabel}>COMPLIANCE STATUS</div>
          <span style={{ fontSize: 10, color: muted, letterSpacing: "0.06em" }}>LIVE · GET</span>
        </div>
        {loading ? (
          <div style={{ ...paneStyles.feedLine, color: muted }}>Loading compliance status...</div>
        ) : securityAdminState?.complianceStatus?.state === "available" ? (
          <div style={{ ...paneStyles.feedLine, color: textPrimary, fontFamily: "ui-monospace,monospace" }}>
            {JSON.stringify(securityAdminState.complianceStatus.data)}
          </div>
        ) : securityAdminState?.complianceStatus?.state === "unavailable" ? (
          <div style={{ ...paneStyles.feedLine, color: muted }}>
            Unavailable ({complianceEndpoint}, status {securityAdminState?.complianceStatus?.statusCode ?? "n/a"}).
          </div>
        ) : (
          <div style={{ ...paneStyles.feedLine, borderColor: "rgba(255,61,129,0.24)", background: "rgba(255,61,129,0.08)", color: "rgba(255,173,193,0.94)" }}>
            Unavailable ({complianceEndpoint}, status {securityAdminState?.complianceStatus?.statusCode ?? "n/a"}).
          </div>
        )}
      </div>

      {/* ── 5 · AuthZ Denials Feed ──────────────────────────────── */}
      <div style={{ ...paneStyles.dashCard, borderColor: `rgba(167,139,250,0.22)` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={paneStyles.dashCardLabel}>AUTHZ DENIALS — AUDIT FEED</div>
          <span style={{ fontSize: 10, color: muted, letterSpacing: "0.06em" }}>LIVE · GET</span>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            className="secAdminControl"
            style={{
              ...styles.ghostButton,
              borderColor: showAllAuditEvents ? "rgba(167,139,250,0.55)" : "rgba(170,194,233,0.25)",
              background: showAllAuditEvents ? "rgba(167,139,250,0.2)" : "rgba(10, 16, 33, 0.7)",
            }}
            onClick={() => setShowAllAuditEvents((value) => !value)}
          >
            {showAllAuditEvents ? "Hide Missing-Context Noise" : "Show All Events"}
          </button>
          <button
            type="button"
            className="secAdminControl"
            style={{
              ...styles.ghostButton,
              borderColor: groupAuditEvents ? "rgba(167,139,250,0.55)" : "rgba(170,194,233,0.25)",
              background: groupAuditEvents ? "rgba(167,139,250,0.2)" : "rgba(10, 16, 33, 0.7)",
            }}
            onClick={() => setGroupAuditEvents((value) => !value)}
          >
            {groupAuditEvents ? "Grouped View" : "Raw Timeline"}
          </button>
        </div>
        {loading ? (
          <div style={{ fontSize: 12, color: muted }}>Loading audit events…</div>
        ) : filteredAuthDenials.length === 0 ? (
          <div style={{ fontSize: 12, color: muted, fontStyle: "italic" }}>
            {dataUnavailable
              ? "Unavailable (/api/aria/audit-events?status=denied&limit=40)."
              : showAllAuditEvents
              ? "No denied events in the recent audit log."
              : "No high-signal denied events after filtering missing-context noise."}
          </div>
        ) : (
          <div style={{ display: "grid", gap: 6, maxHeight: 220, overflowY: "auto" }}>
            {groupedAuthDenials.map((event, idx) => (
              <div key={event.id || idx} style={{
                ...paneStyles.feedLine,
                borderColor: "rgba(255,61,129,0.22)",
                background: "rgba(255,61,129,0.06)",
                display: "grid",
                gridTemplateColumns: "90px 70px 1fr",
                gap: 8,
                alignItems: "start",
                animation: "secAdminFadeIn 0.3s ease",
              }}>
                <span style={{ fontSize: 10, color: muted, fontFamily: "ui-monospace,monospace", whiteSpace: "nowrap" }}>
                  {event.timestamp ? new Date(event.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—"}
                </span>
                <span style={{ fontSize: 10, color: "#ff3d81", fontFamily: "ui-monospace,monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {event.actor || "unknown"}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: "rgba(255,140,160,0.9)", fontFamily: "ui-monospace,monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {event.event_type || "authz.denied"}
                  </div>
                  {event._count > 1 && (
                    <div style={{ fontSize: 10, color: "rgba(167,139,250,0.9)", marginTop: 2 }}>
                      occurrences: {event._count}
                    </div>
                  )}
                  {event.context?.api_path && (
                    <div style={{ fontSize: 10, color: muted, marginTop: 2 }}>{event.context.api_path}</div>
                  )}
                  {event.context?.reason && (
                    <div style={{ fontSize: 10, color: "rgba(255,200,87,0.7)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {event.context.reason}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`
        @keyframes secAdminFadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
        .secAdminControl:focus-visible {
          outline: 2px solid rgba(167,139,250,0.85);
          outline-offset: 2px;
        }
        @media (max-width: 900px) {
          .secAdminPolicyInputGrid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }
        }
        @media (max-width: 640px) {
          .secAdminPolicyInputGrid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}

const styles = {
  controlSelect: {
    width: "100%",
    border: "1px solid rgba(167,139,250,0.26)",
    borderRadius: 8,
    background: "rgba(8, 11, 24, 0.9)",
    color: "rgba(225,241,255,0.94)",
    padding: "8px 10px",
    fontSize: 12,
    fontFamily: "ui-monospace,monospace",
  },
  controlInput: {
    width: "100%",
    border: "1px solid rgba(167,139,250,0.26)",
    borderRadius: 8,
    background: "rgba(8, 11, 24, 0.9)",
    color: "rgba(225,241,255,0.94)",
    padding: "9px 10px",
    fontSize: 12,
  },
  primaryButton: {
    border: "1px solid rgba(167,139,250,0.5)",
    borderRadius: 8,
    background: "rgba(167,139,250,0.18)",
    color: "rgba(240,228,255,0.96)",
    padding: "7px 12px",
    fontSize: 11,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    cursor: "pointer",
  },
  ghostButton: {
    border: "1px solid rgba(170,194,233,0.25)",
    borderRadius: 8,
    background: "rgba(10, 16, 33, 0.7)",
    color: "rgba(215,235,255,0.85)",
    padding: "7px 12px",
    fontSize: 11,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    cursor: "pointer",
  },
};

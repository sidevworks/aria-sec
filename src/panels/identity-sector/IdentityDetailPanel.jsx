// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

// ════════════════════════════════════════════════════════════════════════════
// IDENTITY SECTOR · IdentityDetailPanel
// Per-entity enterprise HUD — behaviour baseline, privilege timeline,
// anomalies, operator action console.
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from "react";
import { ariaFetch } from "../ariaFetch.js";
import { RISK_BANDS, riskBand } from "./identityContract.js";
import PanelNarrateControls from "../PanelNarrateControls.jsx";
import { EvidenceDrawer } from "../shared/index.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function relativeTime(isoString) {
  if (!isoString) return "unknown";
  const delta = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(delta / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function sourceLabel(user) {
  const st = user.sourceType || user.source || "";
  const dm = user.dataMode || "";
  if (dm === "sample" || st === "sample") return { text: "SAMPLE DATA", live: false, type: "sample" };
  if (st === "network") return { text: "LIVE · Network", live: true, type: "network" };
  if (st === "azuread" || st === "live" || dm === "live") return { text: "LIVE · Azure AD", live: true, type: "azuread" };
  return { text: "UNAVAILABLE", live: false, type: "unknown" };
}

// ─── Risk Score Ring (SVG) ────────────────────────────────────────────────────

function RiskRing({ score, band, size = 72 }) {
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  return (
    <div className="id-dp-ring-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--cx-panel-line)" strokeWidth={5} />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none"
          stroke={RISK_BANDS[band]?.cssToken ?? "var(--cx-text-dim)"}
          strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          style={{ transition: "stroke-dasharray 600ms var(--cx-ease-cosmic)" }}
        />
      </svg>
      <span className="id-dp-ring-score" style={{ color: RISK_BANDS[band]?.cssToken ?? "var(--cx-text-dim)" }}>
        {score}
      </span>
    </div>
  );
}

// ─── Enterprise Detail Row ────────────────────────────────────────────────────

function DetailRow({ label, value, mono = false, dim = false }) {
  if (!value && value !== 0) return null;
  return (
    <div className="id-dp-detail-row">
      <span className="id-dp-detail-label">{label}</span>
      <span
        className={`id-dp-detail-value${mono ? " id-dp-detail-value--mono" : ""}${dim ? " id-dp-detail-value--dim" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

function networkEntity(user, inspectEvidence) {
  return inspectEvidence?.evidence?.entity || user || {};
}

function deviceConfidence(entity, user) {
  let score = 30;
  if (entity.mac || user.mac) score += 20;
  if (entity.vendor || user.vendor) score += 20;
  if (entity.hostname || user.hostname || (user.name && !String(user.name).startsWith("Unknown-"))) score += 15;
  if ((entity.scanMethod || []).some((method) => ["arp", "mdns", "rdns", "ping"].includes(method))) score += 10;
  if ((entity.openPorts || user.openPorts || []).length > 0) score += 5;
  if (score >= 80) return { label: "High", score, tone: "good" };
  if (score >= 55) return { label: "Medium", score, tone: "warn" };
  return { label: "Low", score, tone: "risk" };
}

function serviceName(port) {
  return ({
    22: "SSH",
    23: "Telnet",
    53: "DNS",
    80: "HTTP",
    443: "HTTPS",
    445: "SMB",
    3389: "RDP",
    5900: "VNC",
    8080: "HTTP-Alt",
    8443: "HTTPS-Alt",
    9100: "Print",
  })[Number(port)] || "Service";
}

function statusToneClass(tone) {
  return tone === "good"
    ? "id-dp-chip--known"
    : tone === "warn"
    ? "id-dp-chip--watch"
    : "id-dp-chip--anomaly";
}

// ─── Enterprise HUD Section ───────────────────────────────────────────────────

function EnterpriseHUD({ user, inspectEvidence }) {
  const st = user.sourceType || user.source || "";
  const isInspectNetDevice = inspectEvidence?.evidence?.entity_type === "network_device";
  const isNetworkDevice = st === "network" || isInspectNetDevice;

  const entityData = (isNetworkDevice && inspectEvidence?.evidence?.entity) ? inspectEvidence.evidence.entity : (inspectEvidence?.evidence?.entity ?? user);
  const behaviour  = inspectEvidence?.evidence?.behaviour ?? null;

  const hostname = entityData.hostname || user.hostname;
  const ip = entityData.ip || user.ip || user.ipAddress || entityData.ipAddress || entityData.upn;
  const mac = entityData.mac || user.mac;
  const vendor = entityData.vendor || user.vendor;
  const subnet = entityData.subnet || user.subnet;
  const openPorts = entityData.openPorts || user.openPorts;
  const firstSeen = entityData.firstSeen || behaviour?.firstSeen || user.createdAt;
  const lastSeen = entityData.lastSeen || user.lastSeen;
  const scanMethod = entityData.scanMethod;

  return (
    <div className="id-dp-section">
      <div className="id-dp-section-title cx-readout">
        {isNetworkDevice ? "Device Details" : "Identity Details"}
      </div>
      <div className="id-dp-detail-grid">
        {!isNetworkDevice && <DetailRow label="UPN / Email" value={user.upn} mono />}
        {isNetworkDevice && <DetailRow label="Hostname" value={hostname} mono />}
        <DetailRow label="IP Address" value={ip} mono />
        {isNetworkDevice && <DetailRow label="MAC" value={mac} mono />}
        {isNetworkDevice && <DetailRow label="Vendor" value={vendor} />}
        <DetailRow label="Subnet" value={subnet} mono />
        <DetailRow label="Department" value={entityData.department || user.department || user.dept} />
        <DetailRow label="First Seen" value={firstSeen ? relativeTime(firstSeen) : null} />
        <DetailRow label="Last Seen" value={lastSeen ? relativeTime(lastSeen) : null} />
        {Array.isArray(openPorts) && openPorts.length > 0 && (
          <DetailRow label="Open Ports" value={openPorts.join(", ")} mono />
        )}
        {isNetworkDevice && Array.isArray(scanMethod) && scanMethod.length > 0 && (
          <DetailRow label="Scan Method" value={scanMethod.join(", ")} />
        )}
        {entityData.exposure && <DetailRow label="Exposure" value={entityData.exposure} />}
      </div>
      {behaviour && (
        <div className="id-dp-detail-row">
          <span className="id-dp-detail-label">Observations</span>
          <span className="id-dp-detail-value id-dp-detail-value--mono">{behaviour.seenCount ?? "—"}</span>
        </div>
      )}
    </div>
  );
}

// ─── Behaviour Section ────────────────────────────────────────────────────────

const SEVERITY_COLOR = {
  low:    "var(--cx-cyan)",
  medium: "var(--cx-amber)",
  high:   "var(--cx-breach)",
};

function BehaviourSection({ behaviour }) {
  if (!behaviour) {
    return (
      <div className="id-dp-section">
        <div className="id-dp-section-title cx-readout">Behaviour</div>
        <div className="id-dp-loading cx-readout">LOADING…</div>
      </div>
    );
  }

  if (behaviour.status === "not_applicable") {
    return (
      <div className="id-dp-section">
        <div className="id-dp-section-title cx-readout">Behaviour</div>
        <div className="id-dp-no-events cx-readout">Behaviour baselines require an identity provider connection</div>
      </div>
    );
  }

  const pct = Math.round((behaviour.learningProgress ?? 0) * 100);

  return (
    <div className="id-dp-section">
      <div className="id-dp-section-title cx-readout">
        Behaviour
        {behaviour.dataMode === "sample" && (
          <span className="id-dp-data-badge id-dp-data-badge--sample">SAMPLE</span>
        )}
      </div>

      {(behaviour.status === "learning" || behaviour.status === "insufficient_data") && (
        <div className="id-dp-learning">
          <span className="id-dp-learning-label cx-readout" data-state="elevated">
            {behaviour.status === "insufficient_data"
              ? `INSUFFICIENT DATA — ${pct}% complete`
              : `BASELINE LEARNING — ${pct}% complete`}
          </span>
          <div className="id-dp-learning-bar-track">
            <div className="id-dp-learning-bar-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {behaviour.status === "established" && (
        <div className="id-dp-established">
          <div className="id-dp-established-header">
            <AnomalyRing score={behaviour.anomalyScore ?? 0} />
            <span className="id-dp-anomaly-label">Anomaly Score</span>
          </div>
          {behaviour.recentDeviations?.length > 0 ? (
            <ul className="id-dp-deviations">
              {behaviour.recentDeviations.map((dev, i) => (
                <li key={i} className="id-dp-deviation">
                  <span
                    className="id-dp-dev-severity"
                    style={{ color: SEVERITY_COLOR[dev.severity] ?? "var(--cx-text)" }}
                  >
                    {dev.severity?.toUpperCase()}
                  </span>
                  <span className="id-dp-dev-type">{dev.type ?? dev.detail}</span>
                  <span className="id-dp-dev-time">{relativeTime(dev.timestamp)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="id-dp-no-deviations cx-readout">No recent deviations</div>
          )}
        </div>
      )}

      {behaviour.status === "degraded" && (
        <div className="id-dp-established">
          <div className="id-dp-established-header">
            <AnomalyRing score={behaviour.anomalyScore ?? 0} />
            <span className="id-dp-anomaly-label" style={{ color: "var(--cx-breach)" }}>DEGRADED BASELINE</span>
          </div>
          {behaviour.recentDeviations?.length > 0 && (
            <ul className="id-dp-deviations">
              {behaviour.recentDeviations.slice(0, 5).map((dev, i) => (
                <li key={i} className="id-dp-deviation">
                  <span
                    className="id-dp-dev-severity"
                    style={{ color: SEVERITY_COLOR[dev.severity] ?? "var(--cx-text)" }}
                  >
                    {dev.severity?.toUpperCase()}
                  </span>
                  <span className="id-dp-dev-type">{dev.type ?? dev.detail}</span>
                  <span className="id-dp-dev-time">{relativeTime(dev.timestamp)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function AnomalyRing({ score }) {
  const r = 14;
  const circ = 2 * Math.PI * r;
  const dash = (Math.max(0, Math.min(100, score)) / 100) * circ;
  const band = riskBand(score);
  return (
    <div className="id-dp-anomaly-ring">
      <svg width={36} height={36} viewBox="0 0 36 36" style={{ transform: "rotate(-90deg)" }}>
        <circle cx={18} cy={18} r={r} fill="none" stroke="var(--cx-panel-line)" strokeWidth={4} />
        <circle
          cx={18} cy={18} r={r}
          fill="none"
          stroke={RISK_BANDS[band]?.cssToken ?? "var(--cx-text-dim)"}
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
        />
      </svg>
      <span className="id-dp-anomaly-score" style={{ color: RISK_BANDS[band]?.cssToken ?? "var(--cx-text-dim)" }}>
        {score}
      </span>
    </div>
  );
}

// ─── Privilege Timeline Section ───────────────────────────────────────────────

const LEVEL_COLOR = {
  standard: "var(--cx-cyan)",
  elevated: "var(--cx-amber)",
  admin:    "var(--id-risk-warning)",
};

function PrivilegeTimelineSection({ timeline }) {
  if (!timeline) {
    return (
      <div className="id-dp-section">
        <div className="id-dp-section-title cx-readout">Privilege Timeline</div>
        <div className="id-dp-loading cx-readout">LOADING…</div>
      </div>
    );
  }
  if (timeline.not_applicable) {
    return (
      <div className="id-dp-section">
        <div className="id-dp-section-title cx-readout">Privilege Timeline</div>
        <div className="id-dp-no-events cx-readout">Not applicable for network devices</div>
      </div>
    );
  }
  const events = timeline.events ?? [];
  return (
    <div className="id-dp-section">
      <div className="id-dp-section-title cx-readout">Privilege Timeline</div>
      {events.length === 0 ? (
        <div className="id-dp-no-events cx-readout">No privilege history available</div>
      ) : (
        <div className="id-dp-timeline">
          <div className="id-dp-timeline-line" />
          {events.map((ev, i) => (
            <div key={i} className="id-dp-timeline-event" title={`${ev.role} · ${ev.action} · ${relativeTime(ev.timestamp)}`}>
              <span
                className={`id-dp-timeline-dot${ev.action === "revoke" ? " id-dp-timeline-dot--hollow" : ""}`}
                style={{
                  border: `2px solid ${LEVEL_COLOR[ev.level] ?? "var(--cx-cyan)"}`,
                  background: ev.action === "grant" ? (LEVEL_COLOR[ev.level] ?? "var(--cx-cyan)") : "transparent",
                }}
              />
              <div className="id-dp-timeline-label">
                <span className="id-dp-tl-role">{ev.role}</span>
                <span className="id-dp-tl-action" style={{ color: ev.action === "grant" ? "var(--cx-cyan)" : "var(--cx-breach)" }}>
                  {ev.action}
                </span>
                <span className="id-dp-tl-time">{relativeTime(ev.timestamp)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Risk Reasons Section ─────────────────────────────────────────────────────

const RISK_SEVERITY_COLOR = {
  low:    "var(--cx-cyan)",
  medium: "var(--cx-amber)",
  high:   "var(--cx-breach)",
};

function RiskReasonsSection({ riskReasons }) {
  if (!riskReasons || riskReasons.length === 0) return null;
  return (
    <div className="id-dp-section">
      <div className="id-dp-section-title cx-readout">Risk Assessment</div>
      <ul className="id-dp-risk-reasons">
        {riskReasons.map((reason, i) => {
          const isObject = typeof reason === "object" && reason !== null;
          const text = isObject ? reason.text : reason;
          const severity = isObject ? reason.severity : null;
          return (
            <li key={i} className="id-dp-risk-reason">
              {severity && (
                <span
                  className="id-dp-risk-bullet"
                  style={{ background: RISK_SEVERITY_COLOR[severity] ?? "var(--cx-text-dim)" }}
                />
              )}
              <span className="id-dp-risk-text">{text}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─── Anomalies Section ────────────────────────────────────────────────────────

function AnomaliesSection({ anomalies }) {
  if (!anomalies || anomalies.length === 0) return null;
  return (
    <div className="id-dp-section">
      <div className="id-dp-section-title cx-readout">Recent Anomalies</div>
      <ul className="id-dp-anomaly-list">
        {anomalies.map((a, i) => <li key={i} className="id-dp-anomaly-tag">{a}</li>)}
      </ul>
    </div>
  );
}

// ─── Network Device Investigation ────────────────────────────────────────────

function NetworkDeviceInvestigation({ user, inspectEvidence }) {
  const entity = networkEntity(user, inspectEvidence);
  const confidence = deviceConfidence(entity, user);
  const ports = entity.openPorts || user.openPorts || [];
  const methods = entity.scanMethod || [];
  const exposures = entity.exposures || [];
  const inspectedAt = inspectEvidence?.evidence?.inspected_at;
  const firstSeen = entity.firstSeen || user.firstSeen;
  const lastSeen = entity.lastSeen || user.lastSeen;
  const hostname = entity.hostname || user.hostname || (user.name?.startsWith("Unknown-") ? null : user.name);
  const vendor = entity.vendor || user.vendor;
  const role = entity.role || (ports.includes(9100) ? "printer" : ports.some((p) => [22, 80, 443, 8080, 8443].includes(Number(p))) ? "server/service" : "unknown");

  const recommended = [
    vendor ? "Verify asset owner and department assignment" : "Resolve vendor or mark as unmanaged device",
    hostname ? "Compare hostname with CMDB or identity inventory" : "Resolve hostname through DNS/mDNS or label manually",
    ports.length ? "Review exposed services before proposing containment" : "Keep on watchlist until next scan confirms behaviour",
  ];

  return (
    <>
      <div className="id-dp-section">
        <div className="id-dp-section-title cx-readout">Device Classification</div>
        <div className="id-dp-classification-grid">
          <div className="id-dp-signal-card">
            <span className="id-dp-signal-label">Confidence</span>
            <strong className={`id-dp-signal-value ${statusToneClass(confidence.tone)}`}>{confidence.label}</strong>
            <em>{Math.min(100, confidence.score)}% evidence quality</em>
          </div>
          <div className="id-dp-signal-card">
            <span className="id-dp-signal-label">Role Guess</span>
            <strong className="id-dp-signal-value">{role}</strong>
            <em>{vendor || "vendor unresolved"}</em>
          </div>
          <div className="id-dp-signal-card">
            <span className="id-dp-signal-label">Freshness</span>
            <strong className="id-dp-signal-value">{lastSeen ? relativeTime(lastSeen) : "unknown"}</strong>
            <em>{inspectedAt ? `inspected ${relativeTime(inspectedAt)}` : "not deeply inspected"}</em>
          </div>
        </div>
      </div>

      <div className="id-dp-section">
        <div className="id-dp-section-title cx-readout">Exposure Profile</div>
        {ports.length ? (
          <div className="id-dp-port-grid">
            {ports.map((port) => {
              const risky = [22, 23, 445, 3389, 5900].includes(Number(port));
              return (
                <div key={port} className={`id-dp-port-card${risky ? " id-dp-port-card--risk" : ""}`}>
                  <strong>{port}</strong>
                  <span>{serviceName(port)}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="id-dp-no-events cx-readout">No open services observed in the latest scan</div>
        )}
        {exposures.length ? (
          <ul className="id-dp-evidence-list">
            {exposures.slice(0, 5).map((exposure, index) => (
              <li key={`${exposure.port || exposure.label}-${index}`}>
                <span>{exposure.label || serviceName(exposure.port)}</span>
                <em>{exposure.risk ? `risk ${exposure.risk}` : "observed"}</em>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="id-dp-section">
        <div className="id-dp-section-title cx-readout">Discovery Evidence</div>
        <div className="id-dp-evidence-grid">
          <DetailRow label="Hostname" value={hostname || "unresolved"} mono dim={!hostname} />
          <DetailRow label="Vendor" value={vendor || "unresolved"} dim={!vendor} />
          <DetailRow label="First Seen" value={firstSeen ? relativeTime(firstSeen) : "unknown"} />
          <DetailRow label="Last Seen" value={lastSeen ? relativeTime(lastSeen) : "unknown"} />
          <DetailRow label="Signals" value={methods.length ? methods.join(", ") : "network observation"} />
        </div>
      </div>

      <div className="id-dp-section">
        <div className="id-dp-section-title cx-readout">Recommended Next Actions</div>
        <ul className="id-dp-evidence-list">
          {recommended.map((item) => (
            <li key={item}>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

// ─── Action Console ───────────────────────────────────────────────────────────

const ACTION_META = {
  inspect_deep:     { label: "Inspect Deep",    tone: "primary",  requiresReason: false },
  create_case_note: { label: "Case Note",       tone: "neutral",  requiresReason: true  },
  watchlist:        { label: "Watchlist",       tone: "warning",  requiresReason: true  },
  mark_trusted:     { label: "Mark Trusted",    tone: "positive", requiresReason: true  },
  block_proposal:   { label: "Block (Proposal)",tone: "danger",   requiresReason: true  },
  isolate_proposal: { label: "Isolate (Proposal)", tone: "danger", requiresReason: true },
};

function ActionConsole({ user, onInspectResult }) {
  const [pendingAction, setPendingAction]   = useState(null);
  const [reasonInput, setReasonInput]       = useState("");
  const [actionStatus, setActionStatus]     = useState(null);
  const [actionLoading, setActionLoading]   = useState(false);
  const reasonRef = useRef(null);

  const executeAction = useCallback(async (action) => {
    const meta = ACTION_META[action];
    if (!meta) return;

    if (meta.requiresReason && !pendingAction) {
      setPendingAction(action);
      setReasonInput("");
      setTimeout(() => reasonRef.current?.focus(), 50);
      return;
    }

    const reason = (meta.requiresReason ? reasonInput : "").trim() || "Operator requested";
    setActionLoading(true);
    setActionStatus(null);

    if (action === "inspect_deep") {
      const res = await ariaFetch("GET", `/api/identity/entities/${encodeURIComponent(user.id)}/inspect`);
      setActionLoading(false);
      if (res.error) {
        setActionStatus({ ok: false, message: res.error });
      } else {
        setActionStatus({ ok: true, mode: res.data?.enforcement_mode, message: "Inspection complete" });
        if (typeof onInspectResult === "function") onInspectResult(res.data);
      }
      setPendingAction(null);
      return;
    }

    const res = await ariaFetch("POST", `/api/identity/entities/${encodeURIComponent(user.id)}/action`, {
      action,
      reason,
      requested_by: "operator",
    });
    setActionLoading(false);
    setPendingAction(null);
    setReasonInput("");

    if (res.error) {
      if (res.status === 403) {
        setActionStatus({ ok: false, message: "PERMISSION DENIED — insufficient role for identity response actions" });
      } else {
        setActionStatus({ ok: false, message: res.error });
      }
      return;
    }

    const d = res.data;
    let message;
    if (d?.enforcement_mode === "proposal_only") {
      message = `PROPOSAL ONLY — ${action} proposal created (pending approval)`;
    } else if (d?.enforcement_mode === "connector_available") {
      message = `CONNECTOR AVAILABLE — ${action} proposal created (approval required before enforcement)`;
    } else if (d?.status === "proposal_created") {
      message = `Proposal created for ${action}`;
    } else {
      message = `${action} — ${d?.status ?? "submitted"}`;
    }
    setActionStatus({ ok: true, mode: d?.enforcement_mode, message });
  }, [user, pendingAction, reasonInput, onInspectResult]);

  const cancelPending = () => {
    setPendingAction(null);
    setReasonInput("");
  };

  const riskScore = user.riskScore ?? 0;
  const visibleActions = ["inspect_deep", "create_case_note", "watchlist", "mark_trusted"];
  if (riskScore >= 51) visibleActions.push("block_proposal");
  if (riskScore >= 76) visibleActions.push("isolate_proposal");

  return (
    <div className="id-dp-section id-dp-action-console">
      <div className="id-dp-section-title cx-readout">Response Actions</div>

      <div className="id-dp-action-buttons">
        {visibleActions.map(action => {
          const meta = ACTION_META[action];
          const isRunning = actionLoading && pendingAction === action;
          return (
            <button
              key={action}
              className={`id-dp-action-btn id-dp-action-btn--${meta.tone}`}
              onClick={() => executeAction(action)}
              disabled={actionLoading}
              title={action}
            >
              {isRunning ? "…" : meta.label}
            </button>
          );
        })}
      </div>

      {pendingAction && ACTION_META[pendingAction]?.requiresReason && (
        <div className="id-dp-reason-box">
          <span className="id-dp-reason-label cx-readout">
            Reason for {ACTION_META[pendingAction]?.label}
          </span>
          <textarea
            ref={reasonRef}
            className="id-dp-reason-input"
            value={reasonInput}
            onChange={e => setReasonInput(e.target.value)}
            placeholder="Required for audit trail…"
            rows={2}
          />
          <div className="id-dp-reason-actions">
            <button
              className="id-dp-reason-confirm"
              onClick={() => executeAction(pendingAction)}
              disabled={!reasonInput.trim() || actionLoading}
            >
              {actionLoading ? "Submitting…" : "Submit"}
            </button>
            <button className="id-dp-reason-cancel" onClick={cancelPending}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {actionStatus && (
        <div
          className="id-dp-action-result cx-readout"
          style={{ color: actionStatus.ok ? "var(--cx-cyan)" : "var(--cx-breach)" }}
        >
          {actionStatus.message}
        </div>
      )}
    </div>
  );
}

// ─── Evidence Drawer Mapping ──────────────────────────────────────────────────

function evidenceFromIdentity(user, behaviour, timeline, inspectEvidence) {
  if (!user) return null;
  const entity = inspectEvidence?.evidence?.entity || {};
  const riskReasons = inspectEvidence?.evidence?.riskReasons || entity.riskReasons || user.riskReasons || [];
  const recommended = [
    entity.vendor ? "Verify asset owner and department assignment" : null,
    entity.hostname ? "Compare hostname with CMDB or identity inventory" : null,
  ].filter(Boolean);
  return {
    source: user.sourceType || user.source || "Identity provider",
    timestamp: inspectEvidence?.evidence?.inspected_at || user.lastSeen,
    affectedEntities: [
      { title: user.name || user.hostname || user.id, detail: user.upn || user.ip, meta: user.department || user.dept },
    ],
    relatedFindings: riskReasons,
    timeline: Array.isArray(timeline?.events) ? timeline.events.map((ev) => ({
      title: `${ev.role || ""} ${ev.action || ""}`.trim(),
      time: ev.timestamp,
    })) : [],
    blastRadius: user.isAdmin || user.isPrivileged ? "Privileged identity" : "Standard identity",
    confidence: behaviour?.anomalyScore,
    policyControls: [],
    recommendedAction: recommended.join("; ") || undefined,
    approvalState: user.accountEnabled === false ? "Disabled" : "Active",
    auditTrail: (user.anomalies || []).map((a) => ({ title: a })),
  };
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function IdentityDetailPanel({ user, onClose }) {
  const [behaviour, setBehaviour]           = useState(null);
  const [timeline, setTimeline]             = useState(null);
  const [fetchError, setFetchError]         = useState(null);
  const [inspectEvidence, setInspectEvidence] = useState(null);
  const [evidenceOpen, setEvidenceOpen]     = useState(false);

  useEffect(() => {
    if (!user) {
      setBehaviour(null);
      setTimeline(null);
      setFetchError(null);
      setInspectEvidence(null);
      return;
    }

    setBehaviour(null);
    setTimeline(null);
    setFetchError(null);
    setInspectEvidence(null);

    let cancelled = false;

    const isNetworkDevice = (user.sourceType || user.source || "") === "network";

    if (isNetworkDevice) {
      setBehaviour({
        status: "not_applicable",
        dataMode: user.dataMode || "live",
        message: "Behaviour baselines are not applicable for network devices",
      });
      setTimeline({ events: [], not_applicable: true });
      ariaFetch("GET", `/api/identity/entities/${encodeURIComponent(user.id)}/inspect`).then((res) => {
        if (cancelled) return;
        if (res.error) setFetchError(res.error);
        else setInspectEvidence(res.data);
      });
    } else {
      Promise.all([
        ariaFetch("GET", `/api/identity/behaviour/${encodeURIComponent(user.id)}`),
        ariaFetch("GET", `/api/identity/privilege-timeline/${encodeURIComponent(user.id)}`),
      ]).then(([bRes, tRes]) => {
        if (cancelled) return;
        if (bRes.error) setFetchError(bRes.error);
        else setBehaviour(bRes.data);
        if (!tRes.error) setTimeline(tRes.data);
      });
    }

    return () => { cancelled = true; };
  }, [user?.id]);

  if (!user) {
    return (
      <div className="cx-panel id-dp-panel id-dp-panel--empty">
        <div className="id-dp-placeholder">
          <span className="cx-readout">Select an identity to inspect</span>
        </div>
        <style>{DP_STYLES}</style>
      </div>
    );
  }

  const band   = user.riskBand ?? riskBand(user.riskScore ?? 0);
  const src    = sourceLabel(user);
  const isNet  = (user.sourceType || user.source || "") === "network";

  return (
    <div className="cx-panel id-dp-panel">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="id-dp-header">
        <div className="id-dp-header-left">
          <span className="id-dp-name">{user.name ?? user.hostname ?? user.id}</span>
          {!isNet && <span className="id-dp-upn">{user.upn}</span>}
          {isNet && user.ip && <span className="id-dp-upn">{user.ip}</span>}

          <div className="id-dp-chips">
            {user.isAdmin && <span className="id-dp-chip id-dp-chip--admin">ADMIN</span>}
            {user.isPrivileged && <span className="id-dp-chip id-dp-chip--admin">PRIVILEGED</span>}
            {!user.accountEnabled && <span className="id-dp-chip id-dp-chip--disabled">DISABLED</span>}
            {user.anomalies?.length > 0 && <span className="id-dp-chip id-dp-chip--anomaly">ANOMALY</span>}
            {isNet && <span className="id-dp-chip id-dp-chip--network">NETWORK DEVICE</span>}
            {/* Data mode badge */}
            <span
              className="id-dp-chip"
              style={{ color: src.live ? "var(--cx-cyan)" : "var(--cx-amber)", border: `1px solid ${src.live ? "var(--cx-cyan)" : "var(--cx-amber)"}` }}
            >
              {src.text}
            </span>
          </div>
        </div>

        <div className="id-dp-header-right">
          <RiskRing score={user.riskScore ?? 0} band={band} />
        </div>

        <button className="id-dp-close" onClick={onClose} aria-label="Close">✕</button>
      </div>

      {/* ── Fetch error ────────────────────────────────────────────────────── */}
      {fetchError && (
        <div className="id-dp-fetch-error cx-readout" data-state="breach">
          DATA ERROR · {fetchError}
        </div>
      )}

      {/* ── Body sections ──────────────────────────────────────────────────── */}
      <div className="id-dp-body">
        <EnterpriseHUD user={user} inspectEvidence={inspectEvidence} />
        <PanelNarrateControls
          panelId="identity-galaxy"
          panelData={{ riskScore: user.riskScore ?? 0, anomalyCount: user.anomalies?.length ?? 0, department: user.department || user.dept, topAnomaly: user.anomalies?.[0] }}
          localOnly={true}
          style={{ marginLeft: "auto" }}
        />
        <RiskReasonsSection
          riskReasons={inspectEvidence?.evidence?.riskReasons || inspectEvidence?.evidence?.entity?.riskReasons || user.riskReasons}
        />
        <div className="id-dp-section">
          <button
            type="button"
            className="id-dp-action-btn id-dp-action-btn--primary"
            onClick={() => setEvidenceOpen(true)}
          >
            Open Evidence
          </button>
        </div>
        {isNet ? (
          <NetworkDeviceInvestigation user={user} inspectEvidence={inspectEvidence} />
        ) : (
          <>
            <BehaviourSection behaviour={behaviour} />
            <PrivilegeTimelineSection timeline={timeline} />
          </>
        )}
        <AnomaliesSection anomalies={user.anomalies} />
        <ActionConsole user={user} onInspectResult={setInspectEvidence} />
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <div className="id-dp-footer">
        <span className="id-dp-source cx-readout" style={{ color: src.live ? "var(--cx-cyan)" : "var(--cx-amber)" }}>
          {src.text}
        </span>
        {user.lastSeen && (
          <span className="id-dp-lastseen">Last seen {relativeTime(user.lastSeen)}</span>
        )}
      </div>

      <EvidenceDrawer
        open={evidenceOpen}
        evidence={evidenceFromIdentity(user, behaviour, timeline, inspectEvidence)}
        title="Identity Evidence"
        subtitle="Decision proof record"
        accent="var(--cx-cyan, #63f5ff)"
        onClose={() => setEvidenceOpen(false)}
      />

      <style>{DP_STYLES}</style>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const DP_STYLES = `
  .id-dp-panel {
    padding: 14px 18px 12px;
    min-width: 320px;
    max-width: 440px;
    max-height: calc(100vh - 190px);
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
    position: relative;
    overflow: hidden;
  }
  .id-dp-panel--empty {
    min-height: 120px;
    align-items: center;
    justify-content: center;
  }
  .id-dp-placeholder { opacity: 0.4; text-align: center; }

  /* Header */
  .id-dp-header {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding-right: 28px;
    flex-shrink: 0;
  }
  .id-dp-header-left {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  .id-dp-name {
    font: 700 18px/1.2 ui-sans-serif, system-ui, sans-serif;
    color: var(--cx-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .id-dp-upn {
    font: 400 12px/1.2 ui-monospace, "SF Mono", Menlo, monospace;
    color: var(--cx-text-dim);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .id-dp-chips { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px; }
  .id-dp-chip {
    font: 700 9px/1 ui-monospace, "SF Mono", Menlo, monospace;
    letter-spacing: 0.1em;
    padding: 2px 6px;
    border-radius: 4px;
    text-transform: uppercase;
    border: 1px solid;
  }
  .id-dp-chip--admin    { color: var(--cx-amber);  border-color: var(--cx-amber); }
  .id-dp-chip--disabled { color: var(--cx-breach); border-color: var(--cx-breach); }
  .id-dp-chip--anomaly  { color: var(--cx-breach); border-color: var(--cx-breach); }
  .id-dp-chip--network  { color: var(--cx-cyan);   border-color: var(--cx-cyan); }
  .id-dp-chip--known    { color: #4ade80;          border-color: #4ade80; }
  .id-dp-chip--watch    { color: var(--cx-amber);  border-color: var(--cx-amber); }

  /* Risk ring */
  .id-dp-ring-wrap { position: relative; flex-shrink: 0; }
  .id-dp-ring-score {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font: 700 16px/1 ui-monospace, "SF Mono", Menlo, monospace;
  }

  /* Close button */
  .id-dp-close {
    position: absolute;
    top: 12px;
    right: 14px;
    background: none;
    border: none;
    color: var(--cx-text-dim);
    font-size: 14px;
    cursor: pointer;
    padding: 2px 4px;
    border-radius: 4px;
    transition: color var(--cx-dur-micro) var(--cx-ease-cosmic);
    line-height: 1;
  }
  .id-dp-close:hover { color: var(--cx-text); }

  /* Fetch error */
  .id-dp-fetch-error {
    padding: 6px 10px;
    border-radius: 6px;
    border: 1px solid var(--cx-breach);
    background: rgba(255, 61, 129, 0.08);
    font-size: 10px;
  }

  /* Body / sections */
  .id-dp-body {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 12px;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    padding-right: 6px;
    scrollbar-width: thin;
    scrollbar-color: rgba(99,245,255,0.36) transparent;
  }
  .id-dp-body::-webkit-scrollbar { width: 6px; }
  .id-dp-body::-webkit-scrollbar-track { background: transparent; }
  .id-dp-body::-webkit-scrollbar-thumb {
    background: rgba(99,245,255,0.26);
    border-radius: 999px;
  }
  .id-dp-section { display: flex; flex-direction: column; gap: 8px; }
  .id-dp-section-title {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--cx-text-dim);
    padding-bottom: 4px;
    border-bottom: 1px solid var(--cx-panel-line);
  }
  .id-dp-loading { color: var(--cx-text-dim); opacity: 0.4; font-size: 10px; }
  .id-dp-no-events,
  .id-dp-no-deviations { color: var(--cx-text-dim); opacity: 0.5; font-size: 10px; }

  /* Data mode badge inline in section title */
  .id-dp-data-badge {
    font: 700 8px/1 ui-monospace, "SF Mono", Menlo, monospace;
    letter-spacing: 0.1em;
    padding: 1px 5px;
    border-radius: 3px;
    border: 1px solid;
  }
  .id-dp-data-badge--sample { color: var(--cx-amber); border-color: var(--cx-amber); }
  .id-dp-data-badge--live   { color: var(--cx-cyan);  border-color: var(--cx-cyan); }

  /* Enterprise detail grid */
  .id-dp-detail-grid { display: flex; flex-direction: column; gap: 4px; }
  .id-dp-detail-row {
    display: flex;
    align-items: baseline;
    gap: 8px;
    font-size: 11px;
  }
  .id-dp-detail-label {
    font: 600 9px/1.4 ui-monospace, "SF Mono", Menlo, monospace;
    color: var(--cx-text-dim);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    min-width: 80px;
    flex-shrink: 0;
  }
  .id-dp-detail-value { color: var(--cx-text); }
  .id-dp-detail-value--mono { font-family: ui-monospace, "SF Mono", Menlo, monospace; }
  .id-dp-detail-value--dim  { color: var(--cx-text-dim); }

  /* Behaviour — learning */
  .id-dp-learning { display: flex; flex-direction: column; gap: 6px; }
  .id-dp-learning-label { font-size: 11px; }
  .id-dp-learning-bar-track {
    height: 4px;
    background: var(--cx-panel-line);
    border-radius: 2px;
    overflow: hidden;
  }
  .id-dp-learning-bar-fill {
    height: 100%;
    background: var(--cx-amber);
    border-radius: 2px;
    transition: width 600ms var(--cx-ease-cosmic);
  }

  /* Behaviour — established */
  .id-dp-established { display: flex; flex-direction: column; gap: 8px; }
  .id-dp-established-header { display: flex; align-items: center; gap: 10px; }
  .id-dp-anomaly-ring { position: relative; width: 36px; height: 36px; flex-shrink: 0; }
  .id-dp-anomaly-score {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font: 700 10px/1 ui-monospace, "SF Mono", Menlo, monospace;
  }
  .id-dp-anomaly-label {
    font: 600 11px/1 ui-monospace, "SF Mono", Menlo, monospace;
    color: var(--cx-text-dim);
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }
  .id-dp-deviations {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .id-dp-deviation { display: flex; align-items: center; gap: 8px; font-size: 11px; }
  .id-dp-dev-severity {
    font: 700 9px/1 ui-monospace, "SF Mono", Menlo, monospace;
    letter-spacing: 0.08em;
    width: 44px;
    flex-shrink: 0;
  }
  .id-dp-dev-type { flex: 1; color: var(--cx-text); }
  .id-dp-dev-time { color: var(--cx-text-dim); font-size: 10px; flex-shrink: 0; }

  /* Privilege timeline */
  .id-dp-timeline {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-left: 20px;
  }
  .id-dp-timeline-line {
    position: absolute;
    left: 6px;
    top: 6px;
    bottom: 6px;
    width: 1px;
    background: var(--cx-panel-line);
  }
  .id-dp-timeline-event { display: flex; align-items: flex-start; gap: 10px; position: relative; }
  .id-dp-timeline-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 2px solid;
    flex-shrink: 0;
    margin-top: 1px;
    position: absolute;
    left: -18px;
  }
  .id-dp-timeline-label { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .id-dp-tl-role { font: 600 11px/1.4 ui-sans-serif, system-ui, sans-serif; color: var(--cx-text); }
  .id-dp-tl-action {
    font: 600 9px/1 ui-monospace, "SF Mono", Menlo, monospace;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .id-dp-tl-time { color: var(--cx-text-dim); font-size: 10px; }

  /* Risk reasons */
  .id-dp-risk-reasons {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .id-dp-risk-reason {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    font: 400 11px/1.4 ui-monospace, "SF Mono", Menlo, monospace;
    color: var(--cx-text);
    padding: 3px 0 3px 10px;
    border-left: 2px solid var(--cx-amber);
  }
  .id-dp-risk-bullet {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
    margin-top: 5px;
  }
  .id-dp-risk-text { flex: 1; }

  /* Anomaly tags */
  .id-dp-anomaly-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .id-dp-anomaly-tag {
    font: 600 10px/1.4 ui-monospace, "SF Mono", Menlo, monospace;
    padding: 2px 8px;
    border-radius: 4px;
    border: 1px solid var(--cx-breach);
    color: var(--cx-breach);
    background: rgba(255, 61, 129, 0.07);
  }

  /* Network device investigation */
  .id-dp-classification-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 7px;
  }
  .id-dp-signal-card {
    min-width: 0;
    padding: 8px 9px;
    border-radius: 6px;
    border: 1px solid var(--cx-panel-line);
    background: rgba(8, 14, 28, 0.5);
  }
  .id-dp-signal-label {
    display: block;
    font: 700 8px/1 ui-monospace, "SF Mono", Menlo, monospace;
    letter-spacing: 0.12em;
    color: var(--cx-text-dim);
    text-transform: uppercase;
    margin-bottom: 6px;
  }
  .id-dp-signal-value {
    display: block;
    font: 700 12px/1.2 ui-sans-serif, system-ui, sans-serif;
    color: var(--cx-text);
    text-transform: uppercase;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .id-dp-signal-card em {
    display: block;
    margin-top: 5px;
    font: 400 9px/1.25 ui-monospace, "SF Mono", Menlo, monospace;
    color: var(--cx-text-dim);
    font-style: normal;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .id-dp-port-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 6px;
  }
  .id-dp-port-card {
    min-width: 0;
    padding: 7px 8px;
    border-radius: 5px;
    border: 1px solid rgba(99, 245, 255, 0.18);
    background: rgba(99, 245, 255, 0.045);
  }
  .id-dp-port-card--risk {
    border-color: rgba(255, 61, 129, 0.34);
    background: rgba(255, 61, 129, 0.06);
  }
  .id-dp-port-card strong {
    display: block;
    font: 800 13px/1 ui-monospace, "SF Mono", Menlo, monospace;
    color: var(--cx-text);
  }
  .id-dp-port-card span {
    display: block;
    margin-top: 5px;
    font: 700 8px/1 ui-monospace, "SF Mono", Menlo, monospace;
    color: var(--cx-text-dim);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .id-dp-evidence-grid { display: flex; flex-direction: column; gap: 4px; }
  .id-dp-evidence-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .id-dp-evidence-list li {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 5px;
    border: 1px solid rgba(99, 245, 255, 0.11);
    background: rgba(8, 14, 28, 0.36);
    color: var(--cx-text);
    font: 500 11px/1.35 ui-sans-serif, system-ui, sans-serif;
  }
  .id-dp-evidence-list em {
    flex-shrink: 0;
    color: var(--cx-text-dim);
    font: 700 9px/1 ui-monospace, "SF Mono", Menlo, monospace;
    font-style: normal;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  /* Action console */
  .id-dp-action-console { gap: 10px; }
  .id-dp-action-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .id-dp-action-btn {
    font: 600 9px/1 ui-monospace, "SF Mono", Menlo, monospace;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    padding: 4px 10px;
    border-radius: 4px;
    border: 1px solid;
    background: transparent;
    cursor: pointer;
    transition: opacity 150ms ease;
  }
  .id-dp-action-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .id-dp-action-btn--primary  { color: var(--cx-cyan);   border-color: var(--cx-cyan); }
  .id-dp-action-btn--neutral  { color: var(--cx-text-dim); border-color: var(--cx-panel-line); }
  .id-dp-action-btn--warning  { color: var(--cx-amber);  border-color: var(--cx-amber); }
  .id-dp-action-btn--positive { color: #4ade80;           border-color: #4ade80; }
  .id-dp-action-btn--danger   { color: var(--cx-breach); border-color: var(--cx-breach); }
  .id-dp-action-btn:hover:not(:disabled) { opacity: 0.75; }

  /* Reason box */
  .id-dp-reason-box {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px;
    border: 1px solid var(--cx-amber);
    border-radius: 6px;
    background: rgba(245, 158, 11, 0.05);
  }
  .id-dp-reason-label { font-size: 10px; color: var(--cx-amber); }
  .id-dp-reason-input {
    background: rgba(255,255,255,0.05);
    border: 1px solid var(--cx-panel-line);
    border-radius: 4px;
    color: var(--cx-text);
    font: 400 11px/1.4 ui-monospace, "SF Mono", Menlo, monospace;
    padding: 6px 8px;
    resize: vertical;
    width: 100%;
    box-sizing: border-box;
  }
  .id-dp-reason-input:focus { outline: 1px solid var(--cx-amber); }
  .id-dp-reason-actions { display: flex; gap: 8px; }
  .id-dp-reason-confirm {
    font: 700 9px/1 ui-monospace, "SF Mono", Menlo, monospace;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    padding: 4px 12px;
    border-radius: 4px;
    border: 1px solid var(--cx-cyan);
    background: transparent;
    color: var(--cx-cyan);
    cursor: pointer;
  }
  .id-dp-reason-confirm:disabled { opacity: 0.4; cursor: not-allowed; }
  .id-dp-reason-cancel {
    font: 700 9px/1 ui-monospace, "SF Mono", Menlo, monospace;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    padding: 4px 12px;
    border-radius: 4px;
    border: 1px solid var(--cx-panel-line);
    background: transparent;
    color: var(--cx-text-dim);
    cursor: pointer;
  }

  /* Action result */
  .id-dp-action-result {
    font-size: 10px;
    padding: 4px 0;
    word-break: break-word;
  }

  /* Footer */
  .id-dp-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 8px;
    border-top: 1px solid var(--cx-panel-line);
    gap: 8px;
    flex-shrink: 0;
  }
  .id-dp-source { font-size: 10px; }
  .id-dp-lastseen {
    font: 400 10px/1 ui-monospace, "SF Mono", Menlo, monospace;
    color: var(--cx-text-dim);
  }
`;

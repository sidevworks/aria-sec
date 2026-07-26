// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import { useEffect, useMemo, useState } from "react";
import { ariaFetch } from "./panels/ariaFetch.js";

const ACCENT = "#2dd4bf";
const CYAN = "#63f5ff";
const GOLD = "#ffc857";
const RED = "#ff3d81";
const PURPLE = "#a78bfa";
const MODES = ["approval", "assisted", "auto", "full_auto"];
const MODE_LABEL = { approval: "Approval", assisted: "Assisted", auto: "Auto", full_auto: "Full Auto" };
const MODE_COPY = {
  approval: "ARIA recommends. Platform requires human approval before action.",
  assisted: "ARIA can prepare the action. Platform waits for operator release.",
  auto: "ARIA may execute standard actions inside policy guardrails.",
  full_auto: "ARIA can execute this capability continuously while the platform audits.",
};
const MODE_COLOR = { approval: PURPLE, assisted: GOLD, auto: CYAN, full_auto: ACCENT };

const S = {
  panel: { color: "#e8f0ff", fontSize: 13 },
  card: {
    background: "linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.03)),rgba(8,10,20,0.72)",
    border: "1px solid rgba(255,255,255,0.085)",
    borderRadius: 8,
    padding: 16,
    boxShadow: "0 18px 52px rgba(0,0,0,0.28),inset 0 1px 0 rgba(255,255,255,0.05)",
    backdropFilter: "blur(24px)",
  },
  label: {
    fontSize: 10,
    letterSpacing: "0.22em",
    textTransform: "uppercase",
    color: "rgba(236,245,255,0.56)",
  },
  mono: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" },
};

function fmtCapability(value = "") {
  return String(value).replace(/_/g, " ");
}

function fmtTime(value) {
  if (!value) return "No timestamp";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 19).replace("T", " ");
  return d.toLocaleString([], { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function Pill({ children, color = CYAN }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", minHeight: 22, padding: "2px 8px",
      borderRadius: 4, border: `1px solid ${color}44`, background: `${color}18`,
      color, fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase",
      whiteSpace: "nowrap",
    }}>
      {children}
    </span>
  );
}

function Metric({ label, value, color = CYAN, detail }) {
  return (
    <div style={{ ...S.card, padding: 12, minHeight: 84 }}>
      <div style={S.label}>{label}</div>
      <div style={{ marginTop: 8, color, fontSize: 26, fontWeight: 850, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {detail && <div style={{ marginTop: 4, fontSize: 11, color: "rgba(220,235,255,0.52)", lineHeight: 1.35 }}>{detail}</div>}
    </div>
  );
}

function StageStrip({ mode, nextMode, ready }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 5 }}>
      {MODES.map((m) => {
        const current = mode === m;
        const next = nextMode === m;
        const color = MODE_COLOR[m];
        return (
          <div key={m} style={{
            minHeight: 44, borderRadius: 6, border: `1px solid ${current ? color : next && ready ? `${color}88` : "rgba(255,255,255,0.09)"}`,
            background: current ? `${color}24` : next && ready ? `${color}12` : "rgba(255,255,255,0.035)",
            color: current ? color : next ? `${color}cc` : "rgba(225,240,255,0.38)",
            display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 2,
            textAlign: "center", padding: "6px 4px",
          }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase" }}>{MODE_LABEL[m]}</span>
            <span style={{ fontSize: 8, letterSpacing: "0.1em", textTransform: "uppercase", opacity: 0.82 }}>
              {current ? "Current" : next && ready ? "Eligible" : "Rung"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Gate({ label, ok, value }) {
  return (
    <div style={{
      border: `1px solid ${ok ? `${ACCENT}44` : `${GOLD}44`}`,
      background: ok ? `${ACCENT}10` : `${GOLD}10`,
      borderRadius: 6,
      padding: "8px 10px",
      minWidth: 0,
    }}>
      <div style={{ ...S.label, letterSpacing: "0.14em", color: ok ? ACCENT : GOLD }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: 11, color: "rgba(226,240,255,0.72)", lineHeight: 1.35 }}>{value}</div>
    </div>
  );
}

function OutcomeBars({ recent = [] }) {
  const slots = Array.from({ length: 20 }, (_, i) => recent[Math.max(0, recent.length - 20) + i] || null);
  return (
    <div style={{ display: "flex", alignItems: "end", gap: 3, height: 26 }}>
      {slots.map((item, index) => {
        const color = item?.outcome === "success" ? ACCENT : item?.outcome === "override" ? GOLD : item?.outcome === "failure" ? RED : "rgba(255,255,255,0.08)";
        const height = item?.outcome === "success" ? 24 : item?.outcome === "override" ? 18 : item?.outcome === "failure" ? 12 : 6;
        return <div key={`${item?.at || "empty"}-${index}`} title={item ? `${item.outcome} at ${item.at || "unknown"}` : "No event"} style={{ flex: 1, height, borderRadius: 2, background: color, opacity: item ? 1 : 0.55 }} />;
      })}
    </div>
  );
}

function ReasonBox({ capability, action, targetMode, onCancel, onSubmit, busy, error }) {
  const [reason, setReason] = useState("");
  const color = action === "promote" ? ACCENT : RED;
  return (
    <div style={{ marginTop: 12, borderRadius: 8, border: `1px solid ${color}44`, background: "rgba(0,0,0,0.28)", padding: 12 }}>
      <div style={{ ...S.label, color }}>
        {action === "promote" ? "Promote" : "Demote"} {fmtCapability(capability)} {targetMode ? `to ${MODE_LABEL[targetMode]}` : ""}
      </div>
      <div style={{ marginTop: 6, fontSize: 11, lineHeight: 1.45, color: "rgba(226,240,255,0.62)" }}>
        This reason is recorded in the audit ledger. ARIA can recommend readiness, but only the platform and its operators govern autonomy.
      </div>
      <input
        autoFocus
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel();
          if (event.key === "Enter" && !busy) onSubmit(reason);
        }}
        placeholder="Required governance reason"
        style={{
          width: "100%", marginTop: 10, borderRadius: 6, border: "1px solid rgba(255,255,255,0.14)",
          background: "rgba(0,0,0,0.36)", color: "rgba(232,245,255,0.94)", padding: "8px 10px",
          outline: "none", fontSize: 12,
        }}
      />
      {error && <div style={{ marginTop: 7, color: RED, fontSize: 11 }}>{error}</div>}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
        <button type="button" onClick={onCancel} style={buttonStyle("rgba(225,240,255,0.52)")}>Cancel</button>
        <button type="button" onClick={() => onSubmit(reason)} disabled={busy} style={buttonStyle(color, true)}>
          {busy ? "Working" : "Confirm"}
        </button>
      </div>
    </div>
  );
}

function buttonStyle(color = CYAN, filled = false) {
  return {
    border: `1px solid ${color}66`,
    background: filled ? `${color}22` : "rgba(255,255,255,0.035)",
    color,
    borderRadius: 6,
    padding: "7px 11px",
    cursor: "pointer",
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  };
}

function CapabilityCard({ item, pendingCount, auditEvents, activeReason, setActiveReason, onGovern, busy, actionError }) {
  const threshold = item.thresholds;
  const canDemote = item.mode !== "approval";
  const canPromote = Boolean(item.next_mode);
  const currentModeCopy = MODE_COPY[item.mode] || MODE_COPY.approval;
  const lastFailure = [...(item.recent || [])].reverse().find((r) => r.outcome === "failure");
  const lastOverride = [...(item.recent || [])].reverse().find((r) => r.outcome === "override");

  return (
    <div style={{ ...S.card, display: "grid", gridTemplateColumns: "minmax(280px,1.15fr) minmax(260px,0.85fr)", gap: 16 }}>
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 850, textTransform: "capitalize", color: "rgba(236,248,255,0.96)" }}>{fmtCapability(item.capability)}</div>
            <div style={{ marginTop: 5, color: "rgba(220,235,255,0.58)", fontSize: 12, lineHeight: 1.45 }}>{currentModeCopy}</div>
          </div>
          <Pill color={MODE_COLOR[item.mode]}>{MODE_LABEL[item.mode]}</Pill>
        </div>

        <div style={{ marginTop: 14 }}>
          <StageStrip mode={item.mode} nextMode={item.next_mode} ready={item.ready_to_promote} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 8, marginTop: 14 }}>
          <Metric label="Trust" value={`${item.trust_pct ?? 0}%`} color={item.trust_pct >= 90 ? ACCENT : item.trust_pct >= 70 ? GOLD : RED} detail={`${item.samples || 0} samples`} />
          <Metric label="Success" value={item.successes || 0} color={ACCENT} detail="accepted outcomes" />
          <Metric label="Failure" value={item.failures || 0} color={item.failures ? RED : "rgba(220,235,255,0.72)"} detail={lastFailure ? fmtTime(lastFailure.at) : "none recent"} />
          <Metric label="Overrides" value={item.overrides || 0} color={item.overrides ? GOLD : "rgba(220,235,255,0.72)"} detail={lastOverride ? fmtTime(lastOverride.at) : "none recent"} />
        </div>

        {threshold && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8, marginTop: 12 }}>
            <Gate label="Trust Gate" ok={item.gates?.trust_ok} value={`${item.trust_pct ?? 0}% / ${Math.round(threshold.min_trust * 100)}% required`} />
            <Gate label="Sample Gate" ok={item.gates?.samples_ok} value={`${item.samples || 0} / ${threshold.min_samples} outcomes`} />
            <Gate label="Override Gate" ok={item.gates?.overrides_ok} value={`${item.overrides || 0} / ${threshold.max_overrides} max`} />
          </div>
        )}

        <div style={{ marginTop: 12, padding: 10, borderRadius: 6, background: item.ready_to_promote ? `${ACCENT}12` : "rgba(255,255,255,0.04)", border: `1px solid ${item.ready_to_promote ? `${ACCENT}55` : "rgba(255,255,255,0.08)"}` }}>
          <div style={{ ...S.label, color: item.ready_to_promote ? ACCENT : GOLD }}>Promotion / Demotion Criteria</div>
          <div style={{ marginTop: 5, color: "rgba(225,240,255,0.72)", fontSize: 12, lineHeight: 1.45 }}>
            {item.next_mode == null
              ? "Highest rung reached. Demotion remains available if the platform needs stricter governance."
              : item.ready_to_promote
                ? `Eligible for operator promotion to ${MODE_LABEL[item.next_mode]}. ARIA recommends based on evidence; platform governance still decides.`
                : item.blocking_reason || "Promotion gates are still being evaluated."}
          </div>
          <div style={{ marginTop: 5, color: "rgba(225,240,255,0.48)", fontSize: 11, lineHeight: 1.4 }}>
            Any failure or override-limit breach can roll a non-approval capability back one rung as a platform safety control.
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <div style={{ ...S.label, marginBottom: 6 }}>Recent Successes / Failures / Overrides</div>
          <OutcomeBars recent={item.recent || []} />
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
          {canPromote && (
            <button
              type="button"
              disabled={!item.ready_to_promote || busy}
              onClick={() => setActiveReason({ capability: item.capability, action: "promote", targetMode: item.next_mode })}
              style={buttonStyle(item.ready_to_promote ? ACCENT : "rgba(225,240,255,0.26)", item.ready_to_promote)}
            >
              Promote to {MODE_LABEL[item.next_mode]}
            </button>
          )}
          {canDemote && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setActiveReason({ capability: item.capability, action: "demote", targetMode: MODES[Math.max(0, MODES.indexOf(item.mode) - 1)] })}
              style={buttonStyle(RED)}
            >
              Demote one rung
            </button>
          )}
        </div>

        {activeReason?.capability === item.capability && (
          <ReasonBox
            capability={item.capability}
            action={activeReason.action}
            targetMode={activeReason.targetMode}
            busy={busy}
            error={actionError}
            onCancel={() => setActiveReason(null)}
            onSubmit={(reason) => onGovern(item.capability, activeReason.action, reason)}
          />
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.035)", padding: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
            <div style={S.label}>Pending Approvals</div>
            <Pill color={pendingCount ? GOLD : ACCENT}>{pendingCount}</Pill>
          </div>
          <div style={{ marginTop: 7, color: "rgba(225,240,255,0.62)", fontSize: 12, lineHeight: 1.45 }}>
            {pendingCount
              ? `${pendingCount} pending operator decision${pendingCount === 1 ? "" : "s"} currently keep this capability governed.`
              : "No pending approvals mapped to this capability."}
          </div>
        </div>

        <div style={{ borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.035)", padding: 12, minHeight: 170 }}>
          <div style={S.label}>Audit History</div>
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
            {auditEvents.length === 0 && <div style={{ color: "rgba(225,240,255,0.46)", fontSize: 12 }}>No trust audit events yet.</div>}
            {auditEvents.slice(0, 5).map((event, index) => (
              <div key={`${event.timestamp}-${event.event_type}-${index}`} style={{ borderLeft: `2px solid ${event.event_type?.includes("promoted") ? ACCENT : event.event_type?.includes("demoted") ? RED : CYAN}`, paddingLeft: 9 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ color: "rgba(235,248,255,0.86)", fontSize: 12, fontWeight: 750 }}>{event.event_type?.replace(/^aria\.trust\./, "") || "audit"}</span>
                  <span style={{ color: "rgba(225,240,255,0.36)", fontSize: 10, ...S.mono }}>{fmtTime(event.timestamp)}</span>
                </div>
                <div style={{ marginTop: 3, color: "rgba(225,240,255,0.52)", fontSize: 11, lineHeight: 1.35 }}>
                  {event.context?.from && event.context?.to ? `${MODE_LABEL[event.context.from] || event.context.from} to ${MODE_LABEL[event.context.to] || event.context.to}. ` : ""}
                  {event.reason || event.context?.reason || event.context?.outcome || "No reason recorded."}
                </div>
                <div style={{ marginTop: 2, color: "rgba(225,240,255,0.34)", fontSize: 10 }}>Actor: {event.actor || "system"}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function PendingApprovals({ approvals }) {
  return (
    <div style={{ ...S.card, borderColor: `${GOLD}33` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <div style={S.label}>Pending Approvals</div>
        <span style={{ color: GOLD, fontSize: 12, fontWeight: 800 }}>{approvals.length} open</span>
      </div>
      <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
        {approvals.length === 0 && <div style={{ color: "rgba(225,240,255,0.5)", fontSize: 12 }}>No pending approvals. ARIA can still recommend, but platform policy decides what may execute.</div>}
        {approvals.slice(0, 6).map((approval) => (
          <div key={approval.id || `${approval.function_name}-${approval.created_at}`} style={{ borderRadius: 6, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.035)", padding: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <div style={{ color: "rgba(235,248,255,0.86)", fontWeight: 750, fontSize: 12 }}>{approval.function_name || approval.action || "Approval request"}</div>
              <Pill color={GOLD}>{approval.status || "pending"}</Pill>
            </div>
            <div style={{ marginTop: 4, color: "rgba(225,240,255,0.5)", fontSize: 11, lineHeight: 1.4 }}>
              {approval.reason || approval.justification || approval.summary || "Awaiting human governance decision."}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TrustLadderControlCentre({ accent = ACCENT }) {
  const [trust, setTrust] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const [auditEvents, setAuditEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeReason, setActiveReason] = useState(null);
  const [busyAction, setBusyAction] = useState(null);
  const [actionError, setActionError] = useState(null);

  const load = async () => {
    setError(null);
    const [trustRes, approvalRes, auditRes] = await Promise.all([
      ariaFetch("GET", "/api/aria/trust"),
      ariaFetch("GET", "/api/aria/approval/queue?status=pending"),
      ariaFetch("GET", "/api/aria/audit-events?limit=80"),
    ]);

    if (trustRes.error) setError(trustRes.error);
    setTrust(trustRes.data?.trust || []);
    setApprovals(approvalRes.data?.approvals || []);
    setAuditEvents((auditRes.data?.events || []).filter((event) => String(event.event_type || "").startsWith("aria.trust.")));
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const pendingByCapability = useMemo(() => {
    const counts = new Map();
    for (const approval of approvals) {
      const raw = `${approval.capability || approval.function_name || approval.action || approval.reason || ""}`.toLowerCase();
      for (const item of trust) {
        const cap = item.capability;
        const words = cap.split("_");
        if (raw.includes(cap) || words.some((word) => word.length > 4 && raw.includes(word))) {
          counts.set(cap, (counts.get(cap) || 0) + 1);
        }
      }
    }
    return counts;
  }, [approvals, trust]);

  const auditByCapability = useMemo(() => {
    const grouped = new Map();
    for (const event of auditEvents) {
      const cap = event.context?.capability;
      if (!cap) continue;
      grouped.set(cap, [...(grouped.get(cap) || []), event]);
    }
    return grouped;
  }, [auditEvents]);

  const totals = useMemo(() => {
    const samples = trust.reduce((sum, item) => sum + (item.samples || 0), 0);
    const avgTrust = trust.length ? Math.round(trust.reduce((sum, item) => sum + (item.trust_pct || 0), 0) / trust.length) : 0;
    const ready = trust.filter((item) => item.ready_to_promote).length;
    const overrides = trust.reduce((sum, item) => sum + (item.overrides || 0), 0);
    return { samples, avgTrust, ready, overrides };
  }, [trust]);

  const govern = async (capability, action, reason) => {
    const trimmed = String(reason || "").trim();
    if (trimmed.length < 4) {
      setActionError("A reason of at least 4 characters is required.");
      return;
    }
    setBusyAction(`${capability}:${action}`);
    setActionError(null);
    const res = await ariaFetch("POST", `/api/aria/trust/${capability}/${action}`, { reason: trimmed });
    setBusyAction(null);
    if (res.error || res.data?.error) {
      setActionError(res.data?.error || res.error);
      return;
    }
    setActiveReason(null);
    await load();
  };

  return (
    <div style={S.panel}>
      <div style={{ ...S.card, borderColor: `${accent}55`, background: `${accent}0a`, marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
          <div style={{ maxWidth: 760 }}>
            <div style={{ ...S.label, color: accent }}>Trust Ladder Control Centre</div>
            <div style={{ marginTop: 7, fontSize: 22, fontWeight: 900, color: "rgba(240,250,255,0.96)" }}>
              Governed autonomy by capability
            </div>
            <div style={{ marginTop: 8, color: "rgba(225,240,255,0.64)", fontSize: 12, lineHeight: 1.55 }}>
              ARIA recommends readiness from observed outcomes. The platform governs every autonomy rung, records human overrides, and requires an operator reason for manual promotion or demotion.
            </div>
          </div>
          <button type="button" onClick={() => { setLoading(true); void load(); }} style={buttonStyle(accent, true)}>
            Refresh
          </button>
        </div>
        {error && <div style={{ marginTop: 10, color: RED, fontSize: 12 }}>Unable to load trust data: {error}</div>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 10, marginBottom: 12 }}>
        <Metric label="Average Trust" value={`${totals.avgTrust}%`} color={totals.avgTrust >= 85 ? ACCENT : GOLD} detail="across governed capabilities" />
        <Metric label="Promotion Ready" value={totals.ready} color={totals.ready ? ACCENT : "rgba(220,235,255,0.72)"} detail="operator action still required" />
        <Metric label="Pending Approvals" value={approvals.length} color={approvals.length ? GOLD : ACCENT} detail="human-governed queue" />
        <Metric label="Overrides" value={totals.overrides} color={totals.overrides ? GOLD : "rgba(220,235,255,0.72)"} detail={`${totals.samples} total outcomes`} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: 12 }}>
        {loading && <div style={{ ...S.card, color: "rgba(225,240,255,0.56)" }}>Loading trust ladder...</div>}
        {!loading && trust.map((item) => (
          <CapabilityCard
            key={item.capability}
            item={item}
            pendingCount={pendingByCapability.get(item.capability) || 0}
            auditEvents={auditByCapability.get(item.capability) || []}
            activeReason={activeReason}
            setActiveReason={(next) => { setActionError(null); setActiveReason(next); }}
            onGovern={govern}
            busy={Boolean(busyAction)}
            actionError={activeReason?.capability === item.capability ? actionError : null}
          />
        ))}
      </div>

      <div style={{ marginTop: 12 }}>
        <PendingApprovals approvals={approvals} />
      </div>
    </div>
  );
}

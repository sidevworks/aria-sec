// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import { useEffect, useRef, useState } from "react";
import { ariaFetch } from "./panels/ariaFetch.js";
import { EvidenceDrawer } from "./panels/shared/index.js";

const ACCENT = "#ff3d81";
const CYAN = "#63f5ff";
const GOLD = "#ffc857";

const S = {
  card: {
    background: "linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.03)),rgba(13,12,22,0.66)",
    border: "1px solid rgba(255,255,255,0.085)",
    borderRadius: 16,
    padding: "14px 16px",
    boxShadow: "0 18px 52px rgba(0,0,0,0.28),inset 0 1px 0 rgba(255,255,255,0.05)",
    backdropFilter: "blur(24px)",
    marginBottom: 10,
  },
  label: {
    fontSize: 10,
    letterSpacing: "0.24em",
    textTransform: "uppercase",
    color: "rgba(236,218,255,0.55)",
    marginBottom: 6,
  },
  mono: { fontFamily: "monospace", fontSize: 11 },
};

function Pill({ text, color = CYAN, bg }) {
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: 4,
      fontSize: 10, fontWeight: 700, letterSpacing: "0.07em",
      color, background: bg || `${color}1a`, border: `1px solid ${color}44`,
    }}>{text}</span>
  );
}

function ConfidenceBar({ value }) {
  const color = value >= 80 ? "#2dd4bf" : value >= 55 ? GOLD : ACCENT;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 6, borderRadius: 3, background: "rgba(255,255,255,0.08)" }}>
        <div style={{ height: "100%", borderRadius: 3, background: color, width: `${value}%`, transition: "width 0.6s" }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color, minWidth: 32, textAlign: "right" }}>{value}%</span>
    </div>
  );
}

function BlastBadge({ level }) {
  const map = { low: "#2dd4bf", medium: GOLD, high: ACCENT, critical: "#ff1a1a" };
  return <Pill text={level?.toUpperCase() || "UNKNOWN"} color={map[level] || CYAN} />;
}

function ModeBadge({ mode }) {
  const map = { approval: "#a78bfa", assisted: GOLD, auto: CYAN, full_auto: "#2dd4bf" };
  return <Pill text={mode?.toUpperCase() || "APPROVAL"} color={map[mode] || "#a78bfa"} />;
}

function AttackPathViz({ path }) {
  if (!path || !path.nodes?.length) return null;
  const nodes = path.nodes;
  const breakSet = new Set(path.recommended_break_points || []);

  return (
    <div style={{ ...S.card, borderColor: `${ACCENT}33` }}>
      <div style={S.label}>ATTACK PATH — {path.combined_severity?.toUpperCase()}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 0, overflowX: "auto", paddingBottom: 4 }}>
        {nodes.map((node, i) => {
          const isBreak = breakSet.has(node.id);
          const sevColor = { critical: "#ff1a1a", high: ACCENT, medium: GOLD, low: CYAN, info: "#a78bfa" }[node.severity] || CYAN;
          return (
            <div key={node.id} style={{ display: "flex", alignItems: "center" }}>
              <div style={{
                display: "flex", flexDirection: "column", alignItems: "center",
                minWidth: 90, maxWidth: 110,
              }}>
                <div style={{
                  padding: "5px 8px", borderRadius: 8, fontSize: 10, textAlign: "center", lineHeight: 1.3,
                  background: isBreak ? `${CYAN}1a` : "rgba(255,255,255,0.05)",
                  border: `1px solid ${isBreak ? CYAN : sevColor}55`,
                  color: isBreak ? CYAN : "rgba(220,235,255,0.82)",
                  position: "relative",
                }}>
                  {isBreak && (
                    <div style={{ position: "absolute", top: -7, left: "50%", transform: "translateX(-50%)", fontSize: 8, color: CYAN, letterSpacing: "0.1em" }}>✂ BREAK</div>
                  )}
                  <div style={{ fontSize: 8, color: sevColor, letterSpacing: "0.1em", marginBottom: 2 }}>{node.severity?.toUpperCase()}</div>
                  {node.label}
                </div>
              </div>
              {i < nodes.length - 1 && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 32, flexShrink: 0 }}>
                  <div style={{ fontSize: 8, color: "rgba(255,255,255,0.3)", letterSpacing: "0.06em", marginBottom: 1, whiteSpace: "nowrap" }}>
                    {path.edges?.[i]?.relationship?.replace(/_/g, " ") || "→"}
                  </div>
                  <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 14 }}>→</div>
                </div>
              )}
            </div>
          );
        })}
        <div style={{ marginLeft: 12, paddingLeft: 12, borderLeft: `1px solid rgba(255,255,255,0.1)`, minWidth: 100 }}>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", letterSpacing: "0.12em", marginBottom: 3 }}>TERMINAL</div>
          <div style={{ fontSize: 11, color: ACCENT, fontWeight: 600 }}>{path.terminal_asset}</div>
          <div style={{ marginTop: 6 }}><BlastBadge level={path.combined_severity} /></div>
        </div>
      </div>
      <div style={{ marginTop: 8, fontSize: 11, color: "rgba(200,220,255,0.6)", lineHeight: 1.45 }}>{path.narrative}</div>
    </div>
  );
}

function DecisionCard({ decision }) {
  if (!decision) return null;
  const action = decision.recommended_action;
  const fallback = decision.fallback_action;
  return (
    <div style={{ ...S.card, borderColor: `${ACCENT}44` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={S.label}>LATEST DECISION</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <BlastBadge level={decision.blast_radius} />
          <ModeBadge mode={decision.autonomy_required} />
          {decision.requires_human_approval && <Pill text="NEEDS APPROVAL" color={GOLD} />}
        </div>
      </div>
      <div style={{ fontSize: 14, color: "rgba(230,245,255,0.92)", lineHeight: 1.6, marginBottom: 12, fontStyle: "italic", borderLeft: `2px solid ${ACCENT}`, paddingLeft: 10 }}>
        {decision.narration}
      </div>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>CONFIDENCE</div>
        <ConfidenceBar value={decision.confidence} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
        <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "9px 12px", border: "1px solid rgba(255,255,255,0.07)" }}>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.38)", letterSpacing: "0.12em", marginBottom: 4 }}>OBSERVATION</div>
          <div style={{ fontSize: 11, color: "rgba(215,235,255,0.82)", lineHeight: 1.5 }}>{decision.observation}</div>
        </div>
        <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "9px 12px", border: "1px solid rgba(255,255,255,0.07)" }}>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.38)", letterSpacing: "0.12em", marginBottom: 4 }}>EXPECTED OUTCOME</div>
          <div style={{ fontSize: 11, color: "rgba(215,235,255,0.82)", lineHeight: 1.5 }}>{decision.expected_outcome || "—"}</div>
        </div>
      </div>
      {action && (
        <div style={{ background: `${CYAN}0d`, borderRadius: 10, padding: "9px 12px", border: `1px solid ${CYAN}22`, marginBottom: 6 }}>
          <div style={{ fontSize: 9, color: CYAN, letterSpacing: "0.12em", marginBottom: 3 }}>RECOMMENDED ACTION</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <Pill text={action.verb?.replace(/_/g, " ").toUpperCase() || "—"} color={CYAN} />
            {action.target?.system && <span style={{ fontSize: 11, color: "rgba(200,230,255,0.7)" }}>{action.target.system}{action.target.resource ? ` / ${action.target.resource}` : ""}</span>}
            {action.reversible != null && <Pill text={action.reversible ? "REVERSIBLE" : "IRREVERSIBLE"} color={action.reversible ? "#2dd4bf" : ACCENT} />}
          </div>
        </div>
      )}
      {fallback && (
        <div style={{ fontSize: 10, color: "rgba(200,200,255,0.45)", marginTop: 4 }}>
          Fallback: <span style={{ color: "rgba(200,200,255,0.65)" }}>{fallback.verb?.replace(/_/g, " ")} — {fallback.rationale}</span>
        </div>
      )}
      <div style={{ marginTop: 8, fontSize: 10, color: "rgba(255,255,255,0.28)", ...S.mono }}>
        {decision.decision_id} · {decision.created_at?.slice(0, 19).replace("T", " ")}
      </div>
    </div>
  );
}

const MODES_ORDER = ["approval", "assisted", "auto", "full_auto"];
const MODE_COLOR = { approval: "#a78bfa", assisted: GOLD, auto: CYAN, full_auto: "#2dd4bf" };
const MODE_LABEL = { approval: "Approval", assisted: "Assisted", auto: "Auto", full_auto: "Full Auto" };

function StageStrip({ mode, nextMode, ready }) {
  return (
    <div style={{ display: "flex", gap: 4, width: "100%" }}>
      {MODES_ORDER.map(m => {
        const isCurrent = m === mode;
        const isNext = m === nextMode;
        const color = MODE_COLOR[m];
        const bg = isCurrent ? `${color}33` : isNext && ready ? `${color}1a` : "rgba(255,255,255,0.04)";
        const border = isCurrent ? color : isNext && ready ? `${color}88` : "rgba(255,255,255,0.08)";
        const textColor = isCurrent ? color : isNext ? `${color}cc` : "rgba(255,255,255,0.35)";
        return (
          <div key={m} style={{
            flex: 1, padding: "5px 0", textAlign: "center", borderRadius: 6,
            background: bg, border: `1px solid ${border}`,
            fontSize: 9.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
            color: textColor, transition: "all 0.3s",
          }}>
            {MODE_LABEL[m]}
            {isCurrent && <div style={{ fontSize: 7, opacity: 0.7, marginTop: 1, letterSpacing: "0.12em" }}>● CURRENT</div>}
            {isNext && ready && !isCurrent && <div style={{ fontSize: 7, opacity: 0.85, marginTop: 1, letterSpacing: "0.12em" }}>READY ↗</div>}
          </div>
        );
      })}
    </div>
  );
}

function GateMeter({ label, value, target, ok, suffix = "", invert = false }) {
  // invert: lower-is-better (overrides). Bar fills the "remaining headroom".
  const pct = invert
    ? Math.max(0, Math.min(100, Math.round((1 - value / Math.max(target + 1, 1)) * 100)))
    : Math.max(0, Math.min(100, target > 0 ? Math.round((value / target) * 100) : 0));
  const color = ok ? "#2dd4bf" : pct >= 70 ? GOLD : ACCENT;
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "rgba(255,255,255,0.5)", letterSpacing: "0.08em", marginBottom: 3 }}>
        <span>{label}</span>
        <span style={{ color: ok ? "#2dd4bf" : "rgba(255,255,255,0.7)", ...S.mono }}>
          {invert ? `${value}/${target}` : `${value}${suffix} / ${target}${suffix}`}
        </span>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, transition: "width 0.5s, background 0.3s" }} />
      </div>
    </div>
  );
}

function Sparkline({ recent }) {
  // 20 right-anchored slots so the most recent sample is always rightmost.
  const offset = 20 - recent.length;
  const slots = Array.from({ length: 20 }, (_, i) => recent[i - offset] || null);
  const colorOf = (r) => {
    if (!r) return "rgba(255,255,255,0.08)";
    if (r.outcome === "success") return "#2dd4bf";
    if (r.outcome === "override") return GOLD;
    return ACCENT;
  };
  return (
    <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 14 }}>
      {slots.map((r, i) => (
        <div key={i} style={{
          flex: 1, height: r ? (r.outcome === "success" ? 12 : r.outcome === "override" ? 9 : 6) : 4,
          background: colorOf(r), borderRadius: 1, transition: "all 0.3s",
          opacity: r ? 1 : 0.5,
        }} />
      ))}
    </div>
  );
}

function CapabilityRow({ t, onPromote, onDemote, busyAction }) {
  const [reasonOpen, setReasonOpen] = useState(null); // 'promote' | 'demote' | null
  const [reason, setReason] = useState("");
  const [err, setErr] = useState(null);

  const submit = async () => {
    if (reason.trim().length < 4) { setErr("A reason of at least 4 characters is required."); return; }
    setErr(null);
    const fn = reasonOpen === "promote" ? onPromote : onDemote;
    const res = await fn(t.capability, reason.trim());
    if (res?.error) { setErr(res.error); return; }
    setReasonOpen(null);
    setReason("");
  };

  const canDemote = t.mode !== "approval";
  const promoteBusy = busyAction === `${t.capability}:promote`;
  const demoteBusy = busyAction === `${t.capability}:demote`;

  return (
    <div style={{ padding: "12px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 12, color: "rgba(225,240,255,0.92)", textTransform: "capitalize", letterSpacing: "0.04em" }}>
          {t.capability.replace(/_/g, " ")}
        </div>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", ...S.mono }}>
          {t.successes}✓ {t.failures}✗ {t.overrides}↩ · trust {t.trust_pct}%
        </div>
      </div>

      <div style={{ marginBottom: 10 }}>
        <StageStrip mode={t.mode} nextMode={t.next_mode} ready={t.ready_to_promote} />
      </div>

      {t.thresholds && (
        <div style={{ display: "flex", gap: 12, marginBottom: 8 }}>
          <GateMeter label="Trust" value={Math.round(t.trust * 100)} target={Math.round(t.thresholds.min_trust * 100)} ok={t.gates.trust_ok} suffix="%" />
          <GateMeter label="Samples" value={t.samples} target={t.thresholds.min_samples} ok={t.gates.samples_ok} />
          <GateMeter label="Overrides" value={t.overrides} target={t.thresholds.max_overrides} ok={t.gates.overrides_ok} invert />
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Sparkline recent={t.recent || []} />
          <div style={{ fontSize: 10, marginTop: 5, color: t.ready_to_promote ? "#2dd4bf" : t.next_mode ? "rgba(255,200,87,0.85)" : "rgba(45,212,191,0.85)", lineHeight: 1.4 }}>
            {t.next_mode == null
              ? `At highest stage — fully autonomous for ${t.capability.replace(/_/g, " ")}.`
              : t.ready_to_promote
                ? `Ready to promote to ${MODE_LABEL[t.next_mode]}.`
                : t.blocking_reason}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
          {t.next_mode && (
            <button
              onClick={() => { setReasonOpen("promote"); setReason(""); setErr(null); }}
              disabled={!t.ready_to_promote || promoteBusy}
              style={{
                padding: "6px 12px", borderRadius: 6, fontSize: 10, letterSpacing: "0.1em", fontWeight: 700,
                border: `1px solid ${t.ready_to_promote ? "#2dd4bf" : "rgba(255,255,255,0.1)"}`,
                background: t.ready_to_promote ? "#2dd4bf22" : "rgba(255,255,255,0.03)",
                color: t.ready_to_promote ? "#2dd4bf" : "rgba(255,255,255,0.3)",
                cursor: t.ready_to_promote && !promoteBusy ? "pointer" : "default",
                whiteSpace: "nowrap",
              }}
            >
              {promoteBusy ? "…" : `PROMOTE → ${MODE_LABEL[t.next_mode].toUpperCase()}`}
            </button>
          )}
          {canDemote && (
            <button
              onClick={() => { setReasonOpen("demote"); setReason(""); setErr(null); }}
              disabled={demoteBusy}
              style={{
                padding: "5px 12px", borderRadius: 6, fontSize: 9, letterSpacing: "0.1em", fontWeight: 600,
                border: `1px solid ${ACCENT}55`, background: "transparent", color: `${ACCENT}cc`,
                cursor: demoteBusy ? "default" : "pointer", whiteSpace: "nowrap",
              }}
            >
              {demoteBusy ? "…" : "ROLL BACK"}
            </button>
          )}
        </div>
      </div>

      {reasonOpen && (
        <div style={{ marginTop: 10, padding: 10, background: "rgba(0,0,0,0.35)", borderRadius: 8, border: `1px solid ${reasonOpen === "promote" ? "#2dd4bf44" : `${ACCENT}44`}` }}>
          <div style={{ fontSize: 10, letterSpacing: "0.12em", color: "rgba(255,255,255,0.6)", marginBottom: 6 }}>
            {reasonOpen === "promote"
              ? `REASON — Promote ${t.capability.replace(/_/g, " ")} to ${MODE_LABEL[t.next_mode]}`
              : `REASON — Roll ${t.capability.replace(/_/g, " ")} back from ${MODE_LABEL[t.mode]}`}
          </div>
          <input
            autoFocus
            value={reason}
            onChange={e => setReason(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") submit(); if (e.key === "Escape") setReasonOpen(null); }}
            placeholder="e.g. 14 clean weeks, 98% accuracy on Q2 incidents"
            style={{
              width: "100%", boxSizing: "border-box", background: "rgba(0,0,0,0.4)",
              border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, padding: "7px 10px",
              fontSize: 11, color: "rgba(220,240,255,0.92)", outline: "none",
            }}
          />
          {err && <div style={{ marginTop: 6, fontSize: 10, color: ACCENT }}>{err}</div>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 8 }}>
            <button
              onClick={() => { setReasonOpen(null); setErr(null); }}
              style={{
                padding: "5px 12px", borderRadius: 5, fontSize: 10, fontWeight: 600,
                border: "1px solid rgba(255,255,255,0.12)", background: "transparent",
                color: "rgba(255,255,255,0.6)", cursor: "pointer", letterSpacing: "0.08em",
              }}
            >CANCEL</button>
            <button
              onClick={submit}
              style={{
                padding: "5px 14px", borderRadius: 5, fontSize: 10, fontWeight: 700,
                border: `1px solid ${reasonOpen === "promote" ? "#2dd4bf" : ACCENT}`,
                background: reasonOpen === "promote" ? "#2dd4bf22" : `${ACCENT}22`,
                color: reasonOpen === "promote" ? "#2dd4bf" : ACCENT,
                cursor: "pointer", letterSpacing: "0.1em",
              }}
            >CONFIRM</button>
          </div>
        </div>
      )}
    </div>
  );
}

function TrustStrip({ trust, onPromote, onDemote, busyAction }) {
  return (
    <div style={{ ...S.card, borderColor: `${GOLD}33` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <div style={S.label}>TRUST & AUTONOMY</div>
        <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.35)", letterSpacing: "0.06em" }}>
          Promotions are operator-elected. Failures auto-demote.
        </div>
      </div>
      {trust.map(t => (
        <CapabilityRow key={t.capability} t={t} onPromote={onPromote} onDemote={onDemote} busyAction={busyAction} />
      ))}
    </div>
  );
}

function OperationalLoopCard({ loop }) {
  if (!loop) return null;
  const timeline = Array.isArray(loop.timeline) ? loop.timeline : [];
  const action = loop.recommended_action;
  const trust = loop.trust;
  const statusColor = loop.status === "active" ? CYAN : GOLD;
  return (
    <div style={{ ...S.card, borderColor: `${statusColor}33` }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 10 }}>
        <div>
          <div style={S.label}>GUIDED INCIDENT LOOP</div>
          <div style={{ fontSize: 14, color: "rgba(230,245,255,0.92)", lineHeight: 1.45 }}>
            {loop.signal?.observation || loop.honesty?.message || "No active ARIA decision loop yet."}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <Pill text={String(loop.current_stage || "signal").replace(/_/g, " ").toUpperCase()} color={statusColor} />
          <Pill text={`${loop.completion_pct || 0}% COMPLETE`} color={loop.completion_pct >= 80 ? "#2dd4bf" : GOLD} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8, marginBottom: 10 }}>
        {[
          ["Evidence", loop.counts?.evidence ?? loop.evidence?.length ?? 0, "ledger records"],
          ["Blast Radius", loop.blast_radius?.level || "unknown", "affected scope"],
          ["Approval", action?.approval_state || loop.approval?.status || "clear", action?.approval_id || "governed"],
          ["Trust", trust ? `${trust.trust_pct}%` : "n/a", trust?.capability || "unavailable"],
        ].map(([label, value, sub]) => (
          <div key={label} style={{ padding: "9px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.035)" }}>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.38)", letterSpacing: "0.12em", marginBottom: 4, textTransform: "uppercase" }}>{label}</div>
            <div style={{ fontSize: 13, color: "rgba(230,245,255,0.9)", fontWeight: 800, lineHeight: 1.2 }}>{value}</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.32)", marginTop: 3 }}>{sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {timeline.slice(0, 8).map((stage) => {
          const color = stage.status === "complete" || stage.status === "ready" || stage.status === "not_required"
            ? "#2dd4bf"
            : stage.status === "pending" || stage.status === "partial"
              ? GOLD
              : ACCENT;
          return (
            <div key={stage.stage} style={{ display: "grid", gridTemplateColumns: "150px 90px 1fr", gap: 8, alignItems: "center", fontSize: 10.5 }}>
              <span style={{ color: "rgba(220,235,255,0.72)" }}>{stage.label}</span>
              <span style={{ color, letterSpacing: "0.08em", textTransform: "uppercase" }}>{stage.status}</span>
              <span style={{ color: "rgba(200,220,255,0.48)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{stage.detail || "Awaiting data"}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function evidenceFromDecision(decision) {
  if (!decision) return null;
  const action = decision.recommended_action;
  const fallback = decision.fallback_action;
  return {
    source: action?.target?.system || decision.decision_id || "ARIA decision ledger",
    timestamp: decision.created_at,
    affectedEntities: [action?.target].filter(Boolean),
    relatedFindings: Array.isArray(decision.memory_references) ? decision.memory_references : [],
    timeline: [],
    blastRadius: decision.blast_radius,
    confidence: decision.confidence,
    policyControls: fallback ? [{ title: fallback.verb?.replace(/_/g, " "), detail: fallback.rationale }] : [],
    recommendedAction: action ? `${action.verb?.replace(/_/g, " ") || ""}${action.target?.system ? ` — ${action.target.system}` : ""}` : decision.narration,
    approvalState: decision.requires_human_approval ? "Pending human approval" : "Auto-governed",
    auditTrail: [{ title: "Decision recorded", meta: decision.created_at }],
  };
}

function LedgerRow({ decision }) {
  const [open, setOpen] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  return (
    <div style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "7px 0" }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", gap: 8 }}
      >
        <div style={{ display: "flex", gap: 6, alignItems: "center", minWidth: 0 }}>
          <BlastBadge level={decision.blast_radius} />
          <span style={{ fontSize: 11, color: "rgba(215,235,255,0.75)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {decision.narration?.slice(0, 80) || decision.observation?.slice(0, 80)}…
          </span>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", ...S.mono }}>{decision.confidence}%</span>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", ...S.mono }}>{decision.created_at?.slice(11, 19)}</span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setEvidenceOpen(true); }}
            style={{
              fontSize: 9, padding: "3px 8px", borderRadius: 4,
              background: `${CYAN}1a`, color: CYAN, border: `1px solid ${CYAN}44`,
              cursor: "pointer", fontWeight: 700, letterSpacing: "0.06em", whiteSpace: "nowrap",
            }}
          >Open Evidence</button>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{open ? "▲" : "▼"}</span>
        </div>
      </div>
      {open && (
        <pre style={{ margin: "8px 0 0", padding: 10, borderRadius: 8, background: "rgba(0,0,0,0.35)", fontSize: 10, color: "rgba(200,225,255,0.7)", overflow: "auto", maxHeight: 200, ...S.mono }}>
          {JSON.stringify(decision, null, 2)}
        </pre>
      )}
      <EvidenceDrawer
        open={evidenceOpen}
        evidence={evidenceFromDecision(decision)}
        title="Decision Ledger Evidence"
        subtitle="Decision proof record"
        accent={CYAN}
        onClose={() => setEvidenceOpen(false)}
      />
    </div>
  );
}

export default function DecisionEnginePane({ accent = ACCENT, operationalLoop = null }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [command, setCommand] = useState("");
  const [decision, setDecision] = useState(null);
  const [attackPaths, setAttackPaths] = useState([]);
  const [trust, setTrust] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [loop, setLoop] = useState(operationalLoop);
  const [busyAction, setBusyAction] = useState(null);
  const inputRef = useRef(null);

  const loadStatic = async () => {
    const [trustRes, ledgerRes, loopRes] = await Promise.all([
      ariaFetch("GET", "/api/aria/trust"),
      ariaFetch("GET", "/api/aria/decisions?limit=10"),
      ariaFetch("GET", "/api/aria/operational-loop?limit=20"),
    ]);
    if (trustRes.data?.trust) setTrust(trustRes.data.trust);
    if (ledgerRes.data?.decisions) setLedger(ledgerRes.data.decisions);
    if (loopRes.data?.loop) setLoop(loopRes.data.loop);
  };

  const handlePromote = async (capability, reason) => {
    setBusyAction(`${capability}:promote`);
    const res = await ariaFetch("POST", `/api/aria/trust/${capability}/promote`, { reason });
    setBusyAction(null);
    if (res.error || res.data?.error) return { error: res.data?.error || res.error };
    await loadStatic();
    return { ok: true };
  };

  const handleDemote = async (capability, reason) => {
    setBusyAction(`${capability}:demote`);
    const res = await ariaFetch("POST", `/api/aria/trust/${capability}/demote`, { reason });
    setBusyAction(null);
    if (res.error || res.data?.error) return { error: res.data?.error || res.error };
    await loadStatic();
    return { ok: true };
  };

  useEffect(() => { void loadStatic(); }, []);
  useEffect(() => { if (operationalLoop) setLoop(operationalLoop); }, [operationalLoop]);

  const runOrchestrate = async () => {
    setLoading(true);
    setError(null);
    const res = await ariaFetch("POST", "/api/aria/orchestrate", { command: command.trim() || undefined });
    setLoading(false);
    if (res.error) {
      setError(res.error === "TIMEOUT" ? "Request timed out — the orchestrator may be processing a large finding set." : `Error: ${res.error}`);
      return;
    }
    if (res.data?.decision) setDecision(res.data.decision);
    if (res.data?.attack_paths) setAttackPaths(res.data.attack_paths);
    void loadStatic();
  };

  return (
    <div style={{ color: "#e8f0ff", fontSize: 13 }}>
      {/* ── Header ── */}
      <div style={{ ...S.card, borderColor: `${accent}55`, background: `${accent}0a` }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input
            ref={inputRef}
            value={command}
            onChange={e => setCommand(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !loading && runOrchestrate()}
            placeholder="Optional context for ARIA (e.g. 'focus on Bedrock exposure') — leave blank to analyze all findings"
            style={{
              flex: 1, background: "rgba(0,0,0,0.35)", border: `1px solid ${accent}44`,
              borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "rgba(220,240,255,0.9)",
              outline: "none",
            }}
          />
          <button
            onClick={runOrchestrate}
            disabled={loading}
            style={{
              padding: "8px 18px", borderRadius: 8, border: `1px solid ${accent}`,
              background: loading ? "rgba(255,61,129,0.08)" : `${accent}22`,
              color: loading ? "rgba(255,61,129,0.5)" : accent,
              fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", cursor: loading ? "default" : "pointer",
              whiteSpace: "nowrap", transition: "all 0.2s",
            }}
          >
            {loading ? "ANALYZING…" : "RUN ORCHESTRATOR"}
          </button>
        </div>
        {error && <div style={{ marginTop: 8, fontSize: 11, color: ACCENT }}>{error}</div>}
        <div style={{ marginTop: 6, fontSize: 10, color: "rgba(255,255,255,0.3)" }}>
          ARIA Decision Engine — correlates findings → attack paths → structured decision with confidence, memory recall, and evidence trail
        </div>
      </div>

      {/* ── Latest Decision ── */}
      {decision && <DecisionCard decision={decision} />}
      {!decision && ledger.length > 0 && <DecisionCard decision={ledger[0]} />}

      {/* ── Attack Path ── */}
      {attackPaths.length > 0 && <AttackPathViz path={attackPaths[0]} />}

      <OperationalLoopCard loop={loop} />

      {/* ── Trust & Autonomy ── */}
      {trust.length > 0 && <TrustStrip trust={trust} onPromote={handlePromote} onDemote={handleDemote} busyAction={busyAction} />}

      {/* ── Decision Ledger ── */}
      {ledger.length > 0 && (
        <div style={{ ...S.card, borderColor: "rgba(255,255,255,0.06)" }}>
          <div style={S.label}>DECISION LEDGER — LAST {ledger.length}</div>
          {ledger.map(d => <LedgerRow key={d.decision_id} decision={d} />)}
        </div>
      )}

      {/* ── Empty state ── */}
      {!decision && ledger.length === 0 && !loading && (
        <div style={{ ...S.card, textAlign: "center", padding: "32px 20px" }}>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 8 }}>No decisions yet</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>
            Connect GitHub or AWS first (AI-SPM), then run the orchestrator to generate your first Decision object.
          </div>
        </div>
      )}
    </div>
  );
}

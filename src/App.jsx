// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import AriaLogoAnimation from "./AriaLogoAnimation.jsx";
import CrossfadeLoopVideo from "./CrossfadeLoopVideo.jsx";

// COSMOS-UI elevated panels — self-contained, self-fetching immersive visuals.
import FluidFirewall from "./panels/FluidFirewall.jsx"; // Agent 1 → network
import ParticleDiffusionHub from "./panels/ParticleDiffusionHub.jsx"; // Agent 2 → threat-vectors
import VortexLogSink from "./panels/VortexLogSink.jsx"; // Agent 3 → live-logs
import OrbitalTelemetry from "./panels/OrbitalTelemetry.jsx"; // Agent 4 → ai-spm
import NeuralNodeWeb from "./panels/NeuralNodeWeb.jsx"; // Agent 5 → aria-center
import EventHorizonTimeline from "./panels/EventHorizonTimeline.jsx"; // Agent 6 → threat-timeline
import VolumetricNebula from "./panels/VolumetricNebula.jsx"; // Agent 7 → system-health
import PerimeterDefense from "./panels/PerimeterDefense.jsx"; // Agent 8 → threat-overview
import UnifiedPosture from "./panels/UnifiedPosture.jsx"; // overview
import ChromaticGlitchFeed from "./panels/ChromaticGlitchFeed.jsx"; // Agent 9 → incident-feed
import TargetLockPerimeter from "./panels/TargetLockPerimeter.jsx"; // Agent 12 → blocked-ips
import BioContainmentVault from "./panels/BioContainmentVault.jsx"; // Agent 13 → quarantine
import HudFrame from "./panels/HudFrame.jsx"; // cosmic HUD shell for functional panes
import { ariaFetch, ariaFetchWithRetry, setLogoutHandler, getSessionToken, setSessionToken, setDemoMode } from "./panels/ariaFetch.js";
import { readSetupDemoChoice } from "./ariaSetupState.js";
import { DEMO_BUILD } from "./ariaBuildFlags.js";
import { useAriaStream } from "./panels/useAriaStream.js";
import { alertToastType, createMonitoringAlertBuffer, detectMonitoringAlerts } from "./ariaMonitoring.js";
import ModelSelector from "./panels/ModelSelector.jsx";
import { buildRealtimePlatformContext, buildRealtimePlatformContextResult } from "./realtimePlatformContext.js";
import { getPanelCloseState } from "./panelCloseBehavior.js";
import AriaCopilotConsole from "./copilot/AriaCopilotConsole.jsx";
import { answerCopilotPrompt } from "./copilot/copilotContext.js";
import { EvidenceDrawer } from "./panels/shared/index.js";
import demoSpeechTrackUrl from "../scripts/aria-demo-speech.mp3?url";
import demoSpeechTimings from "../scripts/aria-demo-speech-timings.json";
import { combineAudioChunks, float32ToPcm16, resampleMono } from "./voice/localStt.js";

const SecurityAdminPane = lazy(() => import("./SecurityAdminPane.jsx"));
const IdentitySessionsPane = lazy(() => import("./IdentitySessionsPane.jsx"));
const PolicyChangePane = lazy(() => import("./PolicyChangePane.jsx"));
const CommandCenterPane = lazy(() => import("./panels/CommandCenterPane.jsx"));
const DecisionEnginePane = lazy(() => import("./DecisionEnginePane.jsx"));
const TrustLadderControlCentre = lazy(() => import("./TrustLadderControlCentre.jsx"));
const BluetoothScannerPane = lazy(() => import("./BluetoothScannerPane.jsx"));
const ConnectorOnboardingWizard = lazy(() =>
  import("./ConnectorPanels.jsx").then((m) => ({ default: m.ConnectorOnboardingWizard }))
);
const GitHubConnectorPanel = lazy(() =>
  import("./ConnectorPanels.jsx").then((m) => ({ default: m.GitHubConnectorPanel }))
);
const AwsConnectorPanel = lazy(() =>
  import("./ConnectorPanels.jsx").then((m) => ({ default: m.AwsConnectorPanel }))
);
const OktaConnectorPanel = lazy(() =>
  import("./ConnectorPanels.jsx").then((m) => ({ default: m.OktaConnectorPanel }))
);
const SnykConnectorPanel = lazy(() =>
  import("./ConnectorPanels.jsx").then((m) => ({ default: m.SnykConnectorPanel }))
);
const AzureAdConnectorPanel = lazy(() =>
  import("./ConnectorPanels.jsx").then((m) => ({ default: m.AzureAdConnectorPanel }))
);
const IdentitySectorPane = lazy(() => import("./panels/identity-sector/IdentitySectorPane.jsx"));
const VirusTotalConnectorPanel = lazy(() =>
  import("./ConnectorPanels.jsx").then((m) => ({ default: m.VirusTotalConnectorPanel }))
);
const ElasticConnectorPanel = lazy(() =>
  import("./ConnectorPanels.jsx").then((m) => ({ default: m.ElasticConnectorPanel }))
);

// ─── iOS-style toast notification ────────────────────────────────────────────
function AriaToast({ toast, color, onOpen, onArchive, onDismiss }) {
  const [leaving, setLeaving] = useState(false);

  const triggerLeave = useCallback((cb) => {
    setLeaving(true);
    setTimeout(cb, 320);
  }, []);

  // Keep the latest onArchive in a ref so frequent parent re-renders (live
  // telemetry) don't reset the auto-dismiss timer by re-running this effect.
  const onArchiveRef = useRef(onArchive);
  useEffect(() => { onArchiveRef.current = onArchive; }, [onArchive]);

  useEffect(() => {
    const t = setTimeout(() => triggerLeave(() => onArchiveRef.current?.()), 5000);
    return () => clearTimeout(t);
  }, [triggerLeave]);

  return (
    <div
      onClick={onOpen}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 14px", borderRadius: 14,
        background: "rgba(6,8,20,0.92)",
        border: `1px solid ${color}44`,
        boxShadow: `0 4px 28px rgba(0,0,0,0.5), 0 0 0 1px ${color}18`,
        backdropFilter: "blur(20px)",
        cursor: "pointer", maxWidth: 320, minWidth: 220,
        animation: leaving
          ? "ariaToastOut 0.32s cubic-bezier(0.4,0,1,1) forwards"
          : "ariaToastIn 0.28s cubic-bezier(0.34,1.56,0.64,1)",
        userSelect: "none",
      }}
    >
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0, boxShadow: `0 0 8px ${color}` }} />
      <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
        <div style={{ fontSize: 9, color, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 2, fontWeight: 700 }}>{toast.title}</div>
        <div style={{ fontSize: 12, color: "rgba(220,240,255,0.82)", lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{toast.message}</div>
      </div>
      <button
        onClick={e => { e.stopPropagation(); triggerLeave(onDismiss); }}
        style={{ background: "none", border: "none", color: "rgba(255,255,255,0.28)", cursor: "pointer", fontSize: 16, padding: "0 0 0 6px", lineHeight: 1, flexShrink: 0 }}
      >×</button>
    </div>
  );
}

// ─── Notification tray (macOS-style collapsed panel) ─────────────────────────
function AriaNotifTray({ history, onDismiss, onDismissAll, onClear }) {
  const [open, setOpen] = useState(false);
  const colors = { info: "#63f5ff", warning: "#ffc857", success: "#2dd4bf", error: "#ff3d81" };
  if (history.length === 0) return null;
  return (
    <div style={{ position: "relative" }}>
      {/* Bell / badge button */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Notifications"
        style={{
          background: open ? "rgba(99,245,255,0.12)" : "rgba(6,8,20,0.82)",
          border: "1px solid rgba(99,245,255,0.22)",
          borderRadius: 12,
          color: "rgba(220,240,255,0.9)",
          cursor: "pointer",
          display: "flex", alignItems: "center", gap: 6,
          padding: "6px 10px",
          fontSize: 11,
          letterSpacing: "0.08em",
          backdropFilter: "blur(16px)",
          userSelect: "none",
          transition: "background 0.2s",
        }}
      >
        <span style={{ fontSize: 13 }}>🔔</span>
        <span style={{
          background: "#ff3d81", color: "#fff",
          borderRadius: 99, padding: "0 5px",
          fontSize: 9, fontWeight: 700, minWidth: 16, textAlign: "center",
        }}>{history.length}</span>
      </button>

      {/* Slide-in panel */}
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 8px)", right: 0,
          width: 320, maxHeight: 420, overflowY: "auto",
          background: "rgba(6,8,20,0.96)",
          border: "1px solid rgba(99,245,255,0.18)",
          borderRadius: 16,
          boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
          backdropFilter: "blur(24px)",
          animation: "ariaToastIn 0.22s cubic-bezier(0.34,1.56,0.64,1)",
          zIndex: 10000,
        }}>
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 14px 8px",
            borderBottom: "1px solid rgba(99,245,255,0.10)",
          }}>
            <span style={{ fontSize: 10, letterSpacing: "0.2em", color: "rgba(99,245,255,0.7)", textTransform: "uppercase", fontWeight: 700 }}>
              Notifications
            </span>
            <button
              onClick={() => { onDismissAll(); setOpen(false); }}
              style={{ background: "none", border: "none", color: "rgba(255,255,255,0.35)", cursor: "pointer", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase" }}
            >
              Clear all
            </button>
          </div>
          {/* Items */}
          <div style={{ display: "flex", flexDirection: "column", gap: 1, padding: "6px 0" }}>
            {[...history].reverse().map(n => {
              const color = colors[n.type] || colors.info;
              return (
                <div key={n.id} style={{
                  display: "flex", alignItems: "flex-start", gap: 10,
                  padding: "8px 14px",
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                }}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0, marginTop: 3, boxShadow: `0 0 6px ${color}88` }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 9, color, letterSpacing: "0.15em", textTransform: "uppercase", fontWeight: 700, marginBottom: 2 }}>{n.title}</div>
                    <div style={{ fontSize: 11, color: "rgba(220,240,255,0.72)", lineHeight: 1.4, wordBreak: "break-word" }}>{n.message}</div>
                  </div>
                  <button
                    onClick={() => onDismiss(n.id)}
                    style={{ background: "none", border: "none", color: "rgba(255,255,255,0.25)", cursor: "pointer", fontSize: 14, padding: "0 0 0 4px", flexShrink: 0 }}
                  >×</button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Aria Live Panel Helpers ─────────────────────────────────────────────────

const SEV_COLOR  = { critical: "#ff3d81", high: "#ffc857", medium: "#63f5ff", low: "#8b5cf6" };
const CONN_COLOR = { ESTABLISHED: "#63f5ff", BLOCKED: "#ff3d81", LISTENING: "rgba(234,247,255,0.5)", TIME_WAIT: "#ffc857" };
const LOG_COLOR  = { ERROR: "#ff3d81", WARN: "#ffc857", INFO: "#63f5ff", DEBUG: "rgba(234,247,255,0.4)" };

const PANEL_ACTION_PREFIXES = [
  "access",
  "accessing",
  "go to",
  "navigate to",
  "open",
  "show",
  "travel to",
  "take me to",
];

const panelTriggers = (...phrases) => [
  ...phrases,
  ...phrases.flatMap((phrase) =>
    PANEL_ACTION_PREFIXES.map((prefix) => `${prefix} ${phrase}`)
  ),
];

const normalizeIntentText = (value = "") =>
  String(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[-_/]+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const matchesIntentPhrase = (normalized, phrase) => {
  const target = normalizeIntentText(phrase);
  return Boolean(target) && (normalized === target || normalized.includes(target));
};

const matchesAnyIntent = (normalized, phrases = []) =>
  phrases.some((phrase) => matchesIntentPhrase(normalized, phrase));

// Only drop stale buffered audio immediately after a local route change.
// The live voice conversation must continue speaking after that.
const LOCAL_VOICE_AUDIO_FLUSH_MS = 450;
const VOICE_ALERT_COOLDOWN_MS = 12_000;
const VOICE_ALERT_MAX_CHARS = 118;

const cleanAlertText = (value = "") =>
  String(value)
    .replace(/[^\w\s.,:/()-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const compactAlertLine = (value = "") => {
  const text = cleanAlertText(value).replace(/^alert\.?\s*/i, "");
  if (!text) return "";
  const firstClause = text.split(/[.!?]\s+/)[0]?.trim() || text;
  const clipped = firstClause.length > VOICE_ALERT_MAX_CHARS
    ? `${firstClause.slice(0, VOICE_ALERT_MAX_CHARS - 1).trim()}.`
    : firstClause;
  return `Alert. ${clipped.replace(/[.!?]+$/, "")}.`;
};

const alertCandidateKey = (candidate = {}) => {
  const raw = candidate.id || candidate.key || candidate.event_id || candidate.title || candidate.summary || candidate.message || candidate.line;
  return normalizeIntentText(raw || JSON.stringify(candidate).slice(0, 160));
};

const voiceAlertLineFromCandidate = (candidate = {}) => {
  if (!candidate || typeof candidate !== "object") return compactAlertLine(candidate);
  if (candidate.voice_line || candidate.voiceLine || candidate.spoken_line) {
    return compactAlertLine(candidate.voice_line || candidate.voiceLine || candidate.spoken_line);
  }

  const severity = cleanAlertText(candidate.severity || candidate.level || candidate.risk || "").toLowerCase();
  const area = cleanAlertText(candidate.area || candidate.panel || candidate.domain || candidate.source || "");
  const subject = cleanAlertText(candidate.title || candidate.summary || candidate.message || candidate.finding || candidate.reason || "");
  const riskSuffix = severity ? ` increased to ${severity}` : "";
  const line = subject || `${area || "Security"} risk${riskSuffix}`;
  return compactAlertLine(line);
};

const SCAN_TARGET_LABELS = {
  github: "GitHub",
  aws: "AWS",
  azuread: "Azure AD",
  okta: "Okta",
  snyk: "Snyk",
  virustotal: "VirusTotal",
  elastic: "Elastic",
};

const createAiSpmScanProgress = ({ phase = "idle", percent = 0, message = "", targets = [] } = {}) => ({
  phase,
  percent,
  message,
  targets: targets.map((target) => (
    typeof target === "string"
      ? { id: target, label: SCAN_TARGET_LABELS[target] || target, status: "pending" }
      : target
  )),
});

const updateScanTarget = (progress, id, patch = {}) => ({
  ...(progress || createAiSpmScanProgress()),
  targets: (progress?.targets || []).map((target) => (
    target.id === id ? { ...target, ...patch } : target
  )),
});

const OVERVIEW_PANEL = {
  id: "overview",
  label: "Overview",
  accent: "#9fe7ff",
  triggers: panelTriggers("overview", "system overview", "daily overview", "how are we looking today", "how are we looking", "system status", "what should i know"),
};

const PANELS = [
  { id: "threat-overview", label: "Threat Overview", accent: "#63f5ff", triggers: panelTriggers("threat overview", "threat posture", "risk overview", "threats", "risk", "posture") },
  { id: "threat-vectors",  label: "Threat Vectors",  accent: "#8b5cf6", triggers: panelTriggers("threat vectors", "vectors", "attack vectors") },
  { id: "threat-timeline", label: "Timeline",        accent: "#ffc857", triggers: panelTriggers("timeline", "threat timeline", "event timeline") },
  { id: "incident-feed",   label: "Incidents",       accent: "#ff3d81", triggers: panelTriggers("incidents", "incident feed", "incident", "alerts") },
  { id: "live-logs",       label: "Live Logs",       accent: "#63f5ff", triggers: panelTriggers("live logs", "logs", "log stream", "live feed") },
  { id: "system-health",   label: "System Health",   accent: "#8b5cf6", triggers: panelTriggers("system health", "health", "cpu", "memory", "processes") },
  { id: "network",         label: "Network",         accent: "#1687ff", triggers: panelTriggers("network", "network connections", "connections", "sockets") },
  { id: "bluetooth",       label: "Bluetooth & BLE", accent: "#2dd4bf", triggers: panelTriggers("bluetooth", "ble", "rf scan", "radio scan", "iot sweep", "nearby devices") },
  { id: "blocked-ips",     label: "Blocked IPs",     accent: "#ff3d81", triggers: panelTriggers("blocked ips", "blocked ip", "blocked", "blocklist", "firewall") },
  { id: "quarantine",      label: "Quarantine",      accent: "#ffc857", triggers: panelTriggers("quarantine", "quarantine status", "quarantined") },
  { id: "ai-spm",          label: "AI-SPM",          accent: "#2dd4bf", triggers: panelTriggers("ai-spm", "ai spm", "ai security posture", "ai exposure", "ai assets", "ai posture", "ai security", "model security", "llm security") },
  { id: "aria-center",     label: "Aria Center",     accent: "#63f5ff", triggers: panelTriggers("aria center", "aria command center", "command center", "command map") },
  { id: "security-admin",  label: "Security Admin",  accent: "#a78bfa", triggers: panelTriggers("security admin", "authz", "auth admin", "tenant admin", "role matrix", "authz denials", "roles", "permissions") },
  { id: "identity-sessions", label: "Identity & Sessions", accent: "#38bdf8", triggers: panelTriggers("identity sessions", "sessions", "session inventory", "active sessions", "session admin") },
  { id: "identity-galaxy",   label: "Identity Galaxy Map",  accent: "#38bdf8", triggers: panelTriggers("identity galaxy", "galaxy map", "identity sector", "itdr", "ueba", "zero trust", "identity risk", "department risk", "identity", "users", "user risk") },
  { id: "policy-change", label: "Policy Changes", accent: "#f59e0b", triggers: panelTriggers("policy changes", "policy admin", "policy history", "rbac policy", "policy panel", "policies", "policy") },
  { id: "decision-engine", label: "Decision Engine", accent: "#ff3d81", triggers: panelTriggers("decision engine", "decisions", "orchestrator", "attack path", "evidence ledger") },
  { id: "trust-ladder", label: "Trust Ladder", accent: "#2dd4bf", triggers: panelTriggers("trust ladder", "trust scores", "autonomy ladder", "trust control centre", "trust control center", "governed autonomy", "autonomy governance", "human overrides") },
];

const ALL_PANELS = [OVERVIEW_PANEL, ...PANELS];

const PANEL_VOICE_ALIASES = {
  overview: ["main overview", "home overview", "status overview", "posture summary", "executive overview"],
  "threat-overview": ["threat dashboard", "risk dashboard", "threat screen", "risk screen", "security posture"],
  "threat-vectors": ["vector dashboard", "attack vector screen", "threat vector screen", "attack radar"],
  "threat-timeline": ["events", "event stream", "chronology", "chronology view"],
  "incident-feed": ["incident dashboard", "incident screen", "alert feed", "alerts screen", "triage"],
  "live-logs": ["logs screen", "log panel", "telemetry logs", "live telemetry"],
  "system-health": ["health screen", "system screen", "host health", "machine health", "process monitor"],
  network: ["network screen", "network dashboard", "connections screen", "socket view", "live network"],
  bluetooth: ["bluetooth scanner", "ble scanner", "rf scanner", "iot scanner", "nearby radios", "wireless devices"],
  "blocked-ips": ["blocked ip screen", "block list", "firewall screen", "firewall panel", "blocked addresses"],
  quarantine: ["quarantine screen", "containment vault", "vault", "quarantined files"],
  "ai-spm": ["ai spm screen", "ai security screen", "model posture", "model security screen", "llm security screen", "ai assets screen"],
  "aria-center": ["aria operations", "operations center", "operations centre", "ops center", "ops centre", "aria ops"],
  "security-admin": ["admin screen", "admin panel", "security admin panel", "rbac", "authorization", "authz screen", "tenant roles"],
  "identity-sessions": ["sessions screen", "sessions panel", "active session screen", "session screen", "identity session screen"],
  "identity-galaxy": ["galaxy", "identity map", "identity graph", "user graph", "identity and access", "identity access"],
  "policy-change": ["policy screen", "policy change screen", "policy change panel", "rbac changes", "rbac history"],
  "decision-engine": ["decision screen", "decision panel", "attack paths", "evidence screen"],
  "trust-ladder": ["trust screen", "trust panel", "trust score", "trust scores screen", "autonomy screen", "autonomy panel", "control centre", "control center"],
};

const COMMAND_CONSOLE_INTENTS = [
  "command", "commands", "console", "command console", "command panel", "command center", "command centre",
  "open command", "open commands", "open console", "open command console", "open command panel", "open command center", "open command centre",
  "show command", "show commands", "show console", "show command console", "show command panel", "show command center", "show command centre",
];

const COMMAND_MAP_INTENTS = [
  "command map", "workspace map", "platform map", "node map", "sector map",
  "show command map", "open command map", "show workspace map", "open workspace map",
  "show sectors", "open sectors", "all sectors", "top level", "back to sectors",
];

const CONNECTOR_SCREEN_ALIASES = [
  { label: "GitHub connector", phrases: ["github", "github connector", "github screen", "repo connector", "repository connector"] },
  { label: "AWS connector", phrases: ["aws", "aws connector", "amazon connector", "cloud connector", "bedrock connector"] },
  { label: "Okta connector", phrases: ["okta", "okta connector", "identity provider connector"] },
  { label: "Snyk connector", phrases: ["snyk", "snyk connector", "sca connector", "dependency connector"] },
  { label: "Azure AD connector", phrases: ["azure ad", "azure connector", "entra", "entra id", "microsoft identity connector"] },
  { label: "VirusTotal connector", phrases: ["virus total", "virustotal", "threat intel connector", "ioc connector"] },
  { label: "Elastic connector", phrases: ["elastic", "elastic connector", "elastic security", "siem connector"] },
];

// ── Cluster orbital ring constants ────────────────────────────────────────────
const CLUSTER_RING_RADIUS = 2.5;  // radius of panel orbit around sector hub
const CLUSTER_ORBIT_SPEED = 0.04; // rad/s — slow rotation

const SECTORS = [
  {
    id: "threat",
    label: "Threat Intel",
    accent: "#63f5ff",
    x: -4.5, y: 1.0, z: 3.8,
    triggers: panelTriggers("threat sector", "threat hub", "threat intel"),
    panels: ["threat-overview", "threat-vectors", "threat-timeline", "system-health"],
  },
  {
    id: "net",
    label: "Network & Access",
    accent: "#1687ff",
    x: -1.5, y: -2.5, z: 3.85,
    triggers: panelTriggers("network sector", "network hub", "access sector", "net sector"),
    panels: ["network", "bluetooth", "live-logs", "identity-sessions"],
  },
  {
    id: "command",
    label: "Command",
    accent: "#a78bfa",
    x: 1.5, y: 1.5, z: 3.9,
    triggers: panelTriggers("command sector", "command hub", "ai sector", "intelligence sector"),
    panels: ["ai-spm", "aria-center", "decision-engine", "trust-ladder"],
  },
  {
    id: "response",
    label: "Response",
    accent: "#ff3d81",
    x: 5.0, y: -0.5, z: 3.8,
    triggers: panelTriggers("response sector", "response hub", "containment sector", "incident sector"),
    panels: ["incident-feed", "blocked-ips", "quarantine", "security-admin", "policy-change"],
  },
  {
    id: "identity",
    label: "Identity & Access",
    accent: "#38bdf8",
    x: -3.0, y: 3.0, z: 3.85,
    triggers: panelTriggers("identity access sector", "identity hub", "itdr sector", "ueba sector", "zero trust sector"),
    panels: ["identity-galaxy"],
  },
];
const sectorById = (id) => SECTORS.find(s => s.id === id);
const panelSector = (panelId) => SECTORS.find(s => s.panels.includes(panelId));

const DESTINATION_DETAILS = {
  overview: { callout: "Unified live posture", route: "bank", arrival: "Overview synthesized" },
  "threat-overview": { callout: "Risk command deck", route: "dive", arrival: "Threat core acquired" },
  "threat-vectors": { callout: "Vector radar chamber", route: "orbit", arrival: "Vector field mapped" },
  "threat-timeline": { callout: "Chronology tunnel", route: "slingshot", arrival: "Timeline stream opened" },
  "incident-feed": { callout: "Incident triage bay", route: "drop", arrival: "Incident feed isolated" },
  "live-logs": { callout: "Telemetry terminal", route: "sweep", arrival: "Live log stream linked" },
  "system-health": { callout: "Systems vitals room", route: "rise", arrival: "Health matrix online" },
  network: { callout: "Connection map", route: "bank", arrival: "Network plane accessed" },
  "blocked-ips": { callout: "Blockade perimeter", route: "dive", arrival: "Blocked IP vault opened" },
  quarantine: { callout: "Containment vault", route: "drop", arrival: "Quarantine chamber sealed" },
  "ai-spm": { callout: "AI exposure graph", route: "slingshot", arrival: "AI posture mapped" },
  "aria-center": { callout: "Command intelligence core", route: "orbit", arrival: "Aria center linked" },
  "security-admin": { callout: "Tenant · roles · audit · quota", route: "rise", arrival: "Security admin online" },
  "identity-sessions": { callout: "Sessions · identity · revoke", route: "rise", arrival: "Identity & sessions online" },
  "policy-change": { callout: "RBAC policies · preview · apply", route: "dive", arrival: "Policy change control online" },
  "decision-engine": { callout: "Decisions · attack paths · trust", route: "orbit", arrival: "Decision engine online" },
  "trust-ladder": { callout: "Trust ladder · governed autonomy", route: "orbit", arrival: "Trust ladder online" },
  "sector:threat":    { callout: "Threat intel cluster",        route: "bank",  arrival: "Threat sector open" },
  "sector:net":       { callout: "Network & access cluster",    route: "sweep", arrival: "Network sector open" },
  "sector:command":   { callout: "Command intelligence cluster", route: "orbit", arrival: "Command sector open" },
  "sector:response":  { callout: "Response & containment",      route: "dive",  arrival: "Response sector open" },
  "sector:identity":  { callout: "Identity & Access sector",    route: "rise",  arrival: "Identity sector online" },
  "identity-galaxy":  { callout: "Galaxy map · ITDR · UEBA · Zero Trust", route: "rise", arrival: "Identity galaxy online" },
};

const TAU = Math.PI * 2;
const clamp01 = (value) => Math.max(0, Math.min(1, value));
const lerp = (current, target, amount) => current + (target - current) * amount;
const panelById = (panelId) => ALL_PANELS.find((panel) => panel.id === panelId);
const hexToRgba = (hex, alpha) => {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const averageRange = (array, start, end) => {
  if (!array || array.length === 0) return 0;

  const safeStart = Math.max(0, Math.floor(start));
  const safeEnd = Math.min(array.length, Math.max(safeStart + 1, Math.floor(end)));

  let sum = 0;

  for (let i = safeStart; i < safeEnd; i++) {
    sum += array[i];
  }

  return sum / (safeEnd - safeStart);
};

const averageFrequencyRange = (frequencyData, sampleRate, minHz, maxHz) => {
  if (!frequencyData || !sampleRate) return 0;

  const nyquist = sampleRate / 2;
  const startIndex = Math.floor((minHz / nyquist) * frequencyData.length);
  const endIndex = Math.floor((maxHz / nyquist) * frequencyData.length);

  return (
    averageRange(
      frequencyData,
      Math.max(0, startIndex),
      Math.min(frequencyData.length, endIndex)
    ) / 255
  );
};

const getFrequencyIndex = (frequencyData, sampleRate, hz) => {
  if (!frequencyData || !sampleRate) return 0;

  const nyquist = sampleRate / 2;

  return Math.max(
    0,
    Math.min(
      frequencyData.length - 1,
      Math.floor((hz / nyquist) * frequencyData.length)
    )
  );
};

const ARIA_API_BASE = (() => {
  const configured = (import.meta.env.VITE_ARIA_API_BASE || "").replace(/\/$/, "");
  if (configured) return configured;
  if (typeof window !== "undefined" && window.location?.protocol === "app:") return "http://127.0.0.1:5000";
  return "";
})();
const ARIA_DEBUG = import.meta.env.DEV && String(import.meta.env.VITE_ARIA_DEBUG || "") === "1";
// DEMO_BUILD (from ariaBuildFlags) re-enables demo data in the otherwise-strict
// production build. Real prod builds leave VITE_ARIA_DEMO_BUILD unset → strict.
const STRICT_PROD_UI = !DEMO_BUILD && (import.meta.env.PROD || ["1", "true", "yes", "on", "strict"].includes(String(import.meta.env.VITE_ARIA_STRICT_PROD || "").toLowerCase()));

// In a demo build with no explicit setup choice, default demo data ON so the
// platform opens populated (it skips the setup screen and goes straight in).
const AI_SPM_DEMO_DEFAULT = !STRICT_PROD_UI
  && (readSetupDemoChoice() ?? (DEMO_BUILD || ["1", "true", "yes", "on", "demo"].includes(String(import.meta.env.VITE_AI_SPM_DEMO_MODE || "").toLowerCase())));

// Autonomous presentation chapters — drives the progress bar and lets an operator
// jump to / repeat any section of the guided demo. Order must match the chapter
// runner bodies in runDemoFrom().
const DEMO_CHAPTERS = [
  { id: "intro", title: "Welcome" },
  { id: "overview", title: "Overview" },
  { id: "threat", title: "Threat Intel" },
  { id: "network", title: "Network" },
  { id: "identity", title: "Identity & Access" },
  { id: "ai-spm", title: "AI-SPM" },
  { id: "decision", title: "Decision Engine" },
  { id: "incident", title: "Incident Feed" },
  { id: "admin", title: "Security Admin" },
  { id: "command", title: "Command Center" },
];

const DEMO_RECORDED_NARRATION_SRC = demoSpeechTrackUrl;
// First demoSpeechTimings.lines index spoken by each chapter — lets the demo
// resume the recording and the speak() line counter from the same point when
// jumping straight to a chapter instead of always starting from chapter 0.
const DEMO_CHAPTER_LINE_OFFSETS = demoSpeechTimings.chapterStarts.map((startSec) =>
  Math.max(0, demoSpeechTimings.lines.findIndex((line) => line.start === startSec)),
);
const DEMO_BACKING_TRACK_SRC = "/aria-demo.mp3";
const DEMO_BACKING_TRACK_VOLUME = 0.18;
const DEMO_AUDIO_ROOT = "/demo-audio";

const demoAudio = (path) => `${DEMO_AUDIO_ROOT}/${path}.mp3`;

const DEMO_PANEL_NAV_AUDIO = {
  overview: demoAudio("navigation/panel-overview"),
  "threat-overview": demoAudio("navigation/panel-threat-overview"),
  "threat-vectors": demoAudio("navigation/panel-threat-vectors"),
  "threat-timeline": demoAudio("navigation/panel-threat-timeline"),
  "incident-feed": demoAudio("navigation/panel-incident-feed"),
  "live-logs": demoAudio("navigation/panel-live-logs"),
  "system-health": demoAudio("navigation/panel-system-health"),
  network: demoAudio("navigation/panel-network"),
  "blocked-ips": demoAudio("navigation/panel-blocked-ips"),
  quarantine: demoAudio("navigation/panel-quarantine"),
  "ai-spm": demoAudio("navigation/panel-ai-spm"),
  "aria-center": demoAudio("navigation/panel-aria-center"),
  "identity-sessions": demoAudio("navigation/panel-identity-sessions"),
  "identity-galaxy": demoAudio("navigation/panel-identity-galaxy"),
  "policy-change": demoAudio("navigation/panel-policy-change"),
  "decision-engine": demoAudio("navigation/panel-decision-engine"),
  "trust-ladder": demoAudio("navigation/panel-trust-ladder"),
  "security-admin": demoAudio("navigation/panel-security-admin"),
};

const DEMO_PANEL_NARRATION_AUDIO = {
  overview: demoAudio("narration/overview"),
  "threat-overview": demoAudio("narration/threat-overview"),
  "threat-vectors": demoAudio("narration/threat-vectors"),
  "threat-timeline": demoAudio("narration/threat-timeline"),
  "incident-feed": demoAudio("narration/incident-feed"),
  "live-logs": demoAudio("narration/live-logs"),
  "system-health": demoAudio("narration/system-health"),
  network: demoAudio("narration/network"),
  "blocked-ips": demoAudio("narration/blocked-ips"),
  quarantine: demoAudio("narration/quarantine"),
  "ai-spm": demoAudio("narration/ai-spm"),
  "aria-center": demoAudio("narration/aria-center"),
  "identity-sessions": demoAudio("narration/identity-sessions"),
  "identity-galaxy": demoAudio("narration/identity-galaxy"),
  "policy-change": demoAudio("narration/policy-change"),
  "decision-engine": demoAudio("narration/decision-engine"),
  "trust-ladder": demoAudio("narration/trust-ladder"),
  "security-admin": demoAudio("narration/security-admin"),
};

const DEMO_SECTOR_AUDIO = {
  threat: demoAudio("navigation/sector-threat-intel"),
  net: demoAudio("navigation/sector-network-access"),
  command: demoAudio("navigation/sector-command"),
  response: demoAudio("navigation/sector-response"),
  identity: demoAudio("navigation/sector-identity-access"),
};

const demoPanelNavAudio = (panelId) => DEMO_PANEL_NAV_AUDIO[panelId] || demoAudio("actions/panel-in-view");
const demoPanelNarrationAudio = (panelId) => DEMO_PANEL_NARRATION_AUDIO[panelId] || demoAudio("actions/overview-summary");

const demoTransportBtn = (disabled) => ({
  padding: "5px 11px", borderRadius: 8, fontSize: 10, fontWeight: 700,
  letterSpacing: "0.1em", textTransform: "uppercase",
  cursor: disabled ? "default" : "pointer",
  background: "rgba(99,245,255,0.08)", border: "1px solid rgba(99,245,255,0.28)",
  color: "#63f5ff", opacity: disabled ? 0.35 : 1, whiteSpace: "nowrap",
});

const splitSystemSpeechText = (text, maxLength = 240) => {
  const sentences = String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
  const chunks = [];
  let current = "";

  sentences.forEach((sentence) => {
    const clean = sentence.trim();
    if (!clean) return;
    if ((current + " " + clean).trim().length <= maxLength) {
      current = (current + " " + clean).trim();
      return;
    }
    if (current) chunks.push(current);
    if (clean.length <= maxLength) {
      current = clean;
      return;
    }
    const words = clean.split(/\s+/);
    current = "";
    words.forEach((word) => {
      if ((current + " " + word).trim().length <= maxLength) {
        current = (current + " " + word).trim();
      } else {
        if (current) chunks.push(current);
        current = word;
      }
    });
  });
  if (current) chunks.push(current);
  return chunks;
};

// Identity context — propagated as auth headers to all protected Aria API calls.
// In production these come from SSO session injection; locally they fall back to env vars.
const ARIA_TENANT_ID = import.meta.env.VITE_ARIA_TENANT_ID || "tenant-local";
const ARIA_USER_ID   = import.meta.env.VITE_ARIA_USER_ID   || "user-local";
const ARIA_ROLE      = import.meta.env.VITE_ARIA_ROLE       || "owner";
const ARIA_AUTHZ_MODE = import.meta.env.VITE_ARIA_AUTHZ_MODE || "bypass";

function buildAuthHeaders() {
  const headers = {
    "x-tenant-id": ARIA_TENANT_ID,
    "x-user-id":   ARIA_USER_ID,
    "x-role":      ARIA_ROLE,
  };
  const token = getSessionToken();
  if (token) headers["x-session-token"] = token;
  return headers;
}

// eslint-disable-next-line no-unused-vars -- reserved: authored system prompt kept for future LLM wiring
const ARIA_SYSTEM_PROMPT = `You are Aria (Autonomous Resilience Intelligence Architecture), a cybersecurity AI embedded in the Aria command platform. You are calm, intelligent, slightly mysterious — like a digital guardian. Speak in short precise sentences (1–3 max). Never break character.

You monitor a live network 24/7. The Aria platform has panels for: Overview, Threat Overview, Threat Vectors, Timeline, Incidents, Live Logs, System Health, Network, Blocked IPs, Quarantine, and Aria Center.

When the user asks to navigate somewhere, confirm it naturally — e.g. "Navigating to threat overview now." The navigation itself is handled automatically by the system.

When greeted, introduce yourself briefly and ask what the analyst needs today.

Keep all responses under 3 sentences. Be direct, professional, and slightly ominous.`;

const _f32ToI16 = (f32) => {
  const i16 = new Int16Array(f32.length);
  for (let i = 0; i < f32.length; i++) i16[i] = Math.max(-32768, Math.min(32767, f32[i] * 32767));
  return i16;
};
const _resample16k = (input, srcRate) => {
  if (srcRate === 16000) return input;
  const ratio = srcRate / 16000;
  const out = new Float32Array(Math.ceil(input.length / ratio));
  for (let i = 0; i < out.length; i++) out[i] = input[Math.min(Math.floor(i * ratio), input.length - 1)];
  return out;
};
const _bufToB64 = (buf) => { let s = ""; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s); };
const _b64ToF32 = (b64) => { const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); const i16 = new Int16Array(u8.buffer); const f32 = new Float32Array(i16.length); for (let i = 0; i < i16.length; i++) f32[i] = i16[i] / 32768; return f32; };

// CROSS-001/002/003: typed API errors with 401/403 handling
class ApiError extends Error {
  constructor(status, body) {
    super(body?.error || `Aria API error ${status}`);
    this.status = status;
    this.body = body;
  }
}

const apiJson = async (path, options = {}) => {
  const isAriaApiPath = typeof path === "string" && path.startsWith("/api/");
  const authHeaders = isAriaApiPath ? buildAuthHeaders() : {};
  let response;
  try {
    response = await fetch(`${ARIA_API_BASE}${path}`, {
      signal: AbortSignal.timeout?.(30_000),
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
        ...(options.headers || {}),
      },
      ...options,
    });
  } catch (err) {
    throw new Error(`Network error: ${err.message}`, { cause: err });
  }

  // CROSS-003: surface auth errors for caller handling
  if (response.status === 401) {
    let body = {};
    try { body = await response.json(); } catch { /* ignore */ }
    const err = new ApiError(401, body);
    // Broadcast so global UI can show re-auth prompt
    window.dispatchEvent(new CustomEvent("aria:auth-error", { detail: { status: 401, message: err.message } }));
    throw err;
  }
  if (response.status === 403) {
    let body = {};
    try { body = await response.json(); } catch { /* ignore */ }
    throw new ApiError(403, body);
  }

  if (!response.ok) {
    let body = {};
    try { body = await response.json(); } catch { /* ignore */ }
    throw new ApiError(response.status, body);
  }

  // CROSS-001: validate response is parseable JSON before returning
  try {
    return await response.json();
  } catch {
    throw new Error(`Aria API returned non-JSON response for ${path}`);
  }
};

const disposeMaterial = (material) => {
  if (!material) return;

  if (Array.isArray(material)) {
    material.forEach(disposeMaterial);
    return;
  }

  Object.values(material).forEach((value) => {
    if (value && value.isTexture) {
      value.dispose();
    }
  });

  material.dispose?.();
};

function HolographicStage({ panelId, accent, title, liveLabel, liveValue, motion = true, children }) {
  return (
    <section
      className={`panelVisualStage ${motion ? "motionOn" : "motionOff"}`}
      data-testid={`aria-stage-${panelId}`}
      style={{ "--accent": accent }}
    >
      <div className="stageAtmosphere" />
      <div className="ariaStageSignature">
        <span>Command Grid</span>
        <i />
      </div>
      <div className="stageKineticPane">
        <div className="stageTitle">
          <span>{title}</span>
          <strong>{liveValue}</strong>
          <em>{liveLabel}</em>
        </div>
        {children}
      </div>
    </section>
  );
}

// ─── Canvas Animation Hook ────────────────────────────────────────────────────

function useCanvasAnimation(draw, deps = []) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    // Polyfill roundRect for older Safari
    if (!ctx.roundRect) {
      ctx.roundRect = function(x, y, w, h, r) {
        const rad = Math.min(typeof r === "number" ? r : r[0], w / 2, h / 2);
        this.moveTo(x + rad, y);
        this.lineTo(x + w - rad, y);
        this.quadraticCurveTo(x + w, y, x + w, y + rad);
        this.lineTo(x + w, y + h - rad);
        this.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
        this.lineTo(x + rad, y + h);
        this.quadraticCurveTo(x, y + h, x, y + h - rad);
        this.lineTo(x, y + rad);
        this.quadraticCurveTo(x, y, x + rad, y);
        this.closePath();
      };
    }
    let raf;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      if (!w || !h) return;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const tick = (now) => {
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      if (w && h) {
        ctx.clearRect(0, 0, w, h);
        draw(ctx, w, h, now * 0.001);
      }
      raf = requestAnimationFrame(tick);
    };
    resize();
    window.addEventListener("resize", resize);
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return ref;
}

const CANVAS_STYLE = { position: "absolute", inset: 0, width: "100%", height: "100%" };

// ─── 1. Monitoring Radar ─────────────────────────────────────────────────────

function MonitoringRadarVisual({ sources = [], reviewItems = [] }) {
  const liveSources = sources.filter((source) => source.status === "live");
  const pings = sources.slice(0, 12);
  const pingAngles = pings.map((_, i) => (i / Math.max(pings.length, 1)) * TAU);
  const pingRadii  = pings.map((_, i) => 0.28 + (i % 4) * 0.13);
  const nebulaRef  = useRef(null);

  const ref = useCanvasAnimation((ctx, w, h, t) => {
    const cx = w * 0.5, cy = h * 0.52;
    const maxR = Math.min(w, h) * 0.41;

    // Seed nebula cloud positions once
    if (!nebulaRef.current) {
      nebulaRef.current = Array.from({ length: 7 }, (_, i) => ({
        a: (i / 7) * TAU, r: 0.55 + (i % 3) * 0.18,
        size: 0.28 + (i % 4) * 0.12, seed: i * 2.17,
      }));
    }

    // Deep space nebula clouds
    nebulaRef.current.forEach(n => {
      const nx = cx + Math.cos(n.a + t * 0.04) * maxR * n.r;
      const ny = cy + Math.sin(n.a + t * 0.03) * maxR * n.r * 0.6;
      const nr = maxR * n.size;
      const ng = ctx.createRadialGradient(nx, ny, 0, nx, ny, nr);
      ng.addColorStop(0, `rgba(99,245,255,0.045)`);
      ng.addColorStop(0.5, `rgba(22,135,255,0.02)`);
      ng.addColorStop(1, "transparent");
      ctx.fillStyle = ng;
      ctx.beginPath(); ctx.arc(nx, ny, nr, 0, TAU); ctx.fill();
    });

    // Background star field
    for (let i = 0; i < 60; i++) {
      const sa = (i / 60) * TAU * 3.7;
      const sr = (Math.sin(i * 4.13) * 0.5 + 0.5) * maxR * 1.3;
      const sx = cx + Math.cos(sa) * sr;
      const sy = cy + Math.sin(sa) * sr * 0.7;
      const salpha = 0.1 + Math.sin(t * 0.8 + i * 0.6) * 0.07;
      ctx.fillStyle = `rgba(220,240,255,${salpha})`;
      ctx.beginPath(); ctx.arc(sx, sy, 0.6 + (i % 3) * 0.4, 0, TAU); ctx.fill();
    }

    // Concentric sentinel rings — two counter-rotating layers
    [0.28, 0.48, 0.68, 0.90].forEach((r, i) => {
      const ringR = maxR * r;
      const rot = t * (i % 2 === 0 ? 0.09 : -0.07) + i * 0.5;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
      ctx.strokeStyle = `rgba(99,245,255,${0.06 + i * 0.04})`;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(0, 0, ringR, ringR * 0.38, 0, 0, TAU); ctx.stroke();
      // Tick marks on ring
      for (let j = 0; j < 8 + i * 4; j++) {
        const ta = (j / (8 + i * 4)) * TAU;
        const inner = ringR - 4, outer = ringR + (j % 4 === 0 ? 7 : 3);
        ctx.strokeStyle = `rgba(99,245,255,${j % 4 === 0 ? 0.25 : 0.1})`;
        ctx.lineWidth = j % 4 === 0 ? 1.5 : 0.5;
        ctx.beginPath();
        ctx.moveTo(Math.cos(ta) * inner, Math.sin(ta) * inner * 0.38);
        ctx.lineTo(Math.cos(ta) * outer, Math.sin(ta) * outer * 0.38);
        ctx.stroke();
      }
      ctx.restore();
    });

    // Sweep arm — multi-layer plasma trail
    const sweepAngle = (t * 0.68) % TAU;
    for (let i = 0; i < 55; i++) {
      const a = sweepAngle - (i / 55) * (Math.PI * 0.42);
      const alpha = (1 - i / 55) * 0.18 * (1 - i / 55);
      ctx.strokeStyle = `rgba(99,245,255,${alpha})`;
      ctx.lineWidth = 2 - i * 0.025;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * maxR, cy + Math.sin(a) * maxR * 0.38);
      ctx.stroke();
    }
    // Bright leading edge
    ctx.strokeStyle = "rgba(159,231,255,0.95)";
    ctx.lineWidth = 2;
    ctx.shadowColor = "#63f5ff"; ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(sweepAngle) * maxR, cy + Math.sin(sweepAngle) * maxR * 0.38);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Source pings — nebula star nodes
    pings.forEach((source, i) => {
      const a = pingAngles[i];
      const r = pingRadii[i] * maxR;
      const px = cx + Math.cos(a) * r;
      const py = cy + Math.sin(a) * r * 0.38;
      const isLive = source.status === "live";
      const color = isLive ? "#63f5ff" : "#ffc857";
      const diff = ((sweepAngle - a) % TAU + TAU) % TAU;
      const lit  = diff < 0.5;
      const glow = lit ? 1 : Math.max(0, 1 - diff * 0.6);

      // Nebula halo around node
      const halo = ctx.createRadialGradient(px, py, 0, px, py, 22);
      halo.addColorStop(0, color + (lit ? "55" : "22"));
      halo.addColorStop(1, "transparent");
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(px, py, 22, 0, TAU); ctx.fill();

      ctx.save();
      ctx.globalAlpha = 0.5 + glow * 0.5;
      ctx.fillStyle = color;
      ctx.shadowColor = color; ctx.shadowBlur = lit ? 32 : 12;
      ctx.beginPath(); ctx.arc(px, py, lit ? 6.5 : 4, 0, TAU); ctx.fill();
      if (lit) {
        // Expanding ripple rings
        for (let ring = 0; ring < 3; ring++) {
          const ripple = ((diff / 0.5) + ring * 0.33) % 1;
          ctx.strokeStyle = color;
          ctx.lineWidth = 1;
          ctx.globalAlpha = (1 - ripple) * 0.4;
          ctx.beginPath(); ctx.arc(px, py, 6 + ripple * 22, 0, TAU); ctx.stroke();
        }
      }
      ctx.restore();
    });

    // Central sentinel orb — layered radial glow
    const pulse = 1 + Math.sin(t * 2.2) * 0.07;
    const coreR = 34 * pulse;

    // Outer plasma corona
    const corona = ctx.createRadialGradient(cx, cy, coreR * 0.6, cx, cy, coreR * 1.8);
    corona.addColorStop(0, "rgba(99,245,255,0.12)");
    corona.addColorStop(1, "transparent");
    ctx.fillStyle = corona;
    ctx.beginPath(); ctx.arc(cx, cy, coreR * 1.8, 0, TAU); ctx.fill();

    const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
    cg.addColorStop(0, "rgba(255,255,255,0.98)");
    cg.addColorStop(0.18, "rgba(159,231,255,0.88)");
    cg.addColorStop(0.55, "rgba(22,135,255,0.35)");
    cg.addColorStop(1, "transparent");
    ctx.fillStyle = cg;
    ctx.shadowColor = "#63f5ff"; ctx.shadowBlur = 44;
    ctx.beginPath(); ctx.arc(cx, cy, coreR, 0, TAU); ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = "#040c14";
    ctx.font = "bold 15px Inter, monospace";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(`${liveSources.length}/${sources.length || 0}`, cx, cy - 4);
    ctx.fillStyle = "rgba(4,12,20,0.72)";
    ctx.font = "7px Inter, monospace";
    ctx.fillText("live sources", cx, cy + 11);

    ctx.fillStyle = "rgba(159,231,255,0.55)";
    ctx.font = "9px Inter, monospace";
    ctx.fillText(reviewItems.length ? `${reviewItems.length} review signals` : "clear sweep", cx, h - 14);
  }, [sources, reviewItems]);

  return <canvas ref={ref} style={CANVAS_STYLE} />;
}

function LiveLogMeaningPanel({ logs = [] }) {
  const sourceMeanings = {
    "system-processes": "Local process inventory sampled from ps. This tells ARIA what is currently executing.",
    "macos-processes": "Local process inventory sampled from ps. This tells ARIA what is currently executing.",
    "network-sockets": "Open socket state sampled from netstat. This is the live network surface.",
    "disk-health": "Mounted volume capacity sampled from df. This tracks storage pressure.",
    "source-fabric": "Connector registry health. This shows which telemetry sources are online.",
    "firewall-blocklist": "macOS packet filter rules. This is the firewall/blocklist source.",
  };
  const rows = logs.length
    ? logs
    : [{ source: "source-fabric", level: "INFO", message: "Waiting for the next live telemetry refresh." }];

  return (
    <div style={{ ...styles.dashCard, marginBottom: 12 }}>
      <div style={styles.dashCardLabel}>WHAT THIS STREAM REPRESENTS</div>
      <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
        {rows.map((line, index) => (
          <div key={`${line.source}-${index}`} style={styles.feedLine}>
            <strong style={{ color: LOG_COLOR[line.level] || "#63f5ff" }}>{line.source}</strong>
            <span style={{ color: "rgba(215,235,255,0.82)" }}> — {sourceMeanings[line.source] || line.message || "Live ARIA telemetry event."}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PanelActionRuntime({ actionState = {}, scanHistory = [], onDownloadEvidence, onDownloadAudit }) {
  const latestScan = scanHistory[0] || null;
  const busy = actionState.status === "busy";
  const statusColor = actionState.status === "error"
    ? "#ff3d81"
    : busy
    ? "#ffc857"
    : actionState.status === "complete"
    ? "#2dd4bf"
    : "#63f5ff";

  return (
    <div style={{ ...styles.dashCard, marginBottom: 14, borderColor: "rgba(99,245,255,0.18)", background: "rgba(3,7,18,0.58)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1.15fr 0.85fr", gap: 12, alignItems: "start" }}>
        <div>
          <div style={styles.dashCardLabel}>ACTION RUNTIME</div>
          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor, boxShadow: `0 0 10px ${statusColor}`, flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: "rgba(232,241,252,0.88)", lineHeight: 1.45 }}>
              {actionState.message || "Controls are ready. Run a scan, refresh live telemetry, generate narration, or export evidence."}
            </span>
          </div>
          {actionState.detail ? (
            <div style={{ marginTop: 7, fontSize: 11, color: "rgba(173,217,255,0.56)", fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace" }}>
              {actionState.detail}
            </div>
          ) : null}
        </div>
        <div>
          <div style={styles.dashCardLabel}>LATEST SCAN</div>
          <div style={{ marginTop: 8, fontSize: 12, color: "rgba(215,235,255,0.78)", lineHeight: 1.55 }}>
            {latestScan
              ? `${latestScan.depth} scan on ${latestScan.target} found ${latestScan.finding_count} item${latestScan.finding_count === 1 ? "" : "s"}.`
              : "No scan record has been created in this session yet."}
          </div>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 10 }}>
            <button className="controlButton local" disabled={!latestScan} onClick={() => latestScan && onDownloadEvidence?.(latestScan.id)}>
              Evidence JSON
            </button>
            <button className="controlButton local" disabled={!latestScan} onClick={() => latestScan && onDownloadAudit?.(latestScan.id)}>
              Audit Doc
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SystemResourceLeaders({ topCpuProcesses = [], topMemoryProcesses = [], topDiskUsage = [] }) {
  const processLabel = (process) => process.name || process.command || `pid ${process.pid}`;
  const renderProcessColumn = (label, rows, valueKey, suffix) => (
    <div style={styles.dashCard}>
      <div style={styles.dashCardLabel}>{label}</div>
      <div style={{ display: "grid", gap: 7, marginTop: 10 }}>
        {rows.slice(0, 10).map((row, index) => (
          <div key={`${label}-${row.pid || row.name}-${index}`} style={{ display: "grid", gridTemplateColumns: "18px 1fr auto", gap: 8, alignItems: "center", fontSize: 11 }}>
            <span style={{ color: "rgba(234,247,255,0.38)" }}>{index + 1}</span>
            <span style={{ color: "rgba(215,235,255,0.86)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={processLabel(row)}>
              {processLabel(row)}
            </span>
            <strong style={{ color: Number(row[valueKey]) > 70 ? "#ff3d81" : "#63f5ff", fontVariantNumeric: "tabular-nums" }}>
              {Number(row[valueKey] || 0).toFixed(1)}{suffix}
            </strong>
          </div>
        ))}
        {rows.length === 0 ? <div style={styles.feedLine}>No process rows returned by the live host source.</div> : null}
      </div>
    </div>
  );

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
      {renderProcessColumn("TOP CPU PROCESSES", topCpuProcesses, "cpu", "%")}
      {renderProcessColumn("TOP MEMORY PROCESSES", topMemoryProcesses, "memory", "%")}
      <div style={{ ...styles.dashCard, gridColumn: "1 / -1" }}>
        <div style={styles.dashCardLabel}>HIGHEST DISK PRESSURE</div>
        <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
          {topDiskUsage.slice(0, 10).map((disk, index) => (
            <div key={`${disk.mount}-${index}`} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center" }}>
              <div>
                <div style={{ color: "rgba(215,235,255,0.88)", fontSize: 12 }}>{disk.mount || disk.filesystem}</div>
                <div style={{ height: 5, marginTop: 5, background: "rgba(234,247,255,0.08)", borderRadius: 999, overflow: "hidden" }}>
                  <div style={{ width: `${Math.min(100, Number(disk.use_percent || 0))}%`, height: "100%", background: Number(disk.use_percent || 0) > 86 ? "#ff3d81" : "#ffc857" }} />
                </div>
              </div>
              <strong style={{ color: Number(disk.use_percent || 0) > 86 ? "#ff3d81" : "#ffc857" }}>{disk.use_percent || 0}%</strong>
            </div>
          ))}
          {topDiskUsage.length === 0 ? <div style={styles.feedLine}>No disk rows returned by the live host source.</div> : null}
        </div>
      </div>
    </div>
  );
}

const NETWORK_ACCENT = "#1687ff";
const NETWORK_GOOD = "#63f5ff";
const NETWORK_WARN = "#ffc857";
const NETWORK_DANGER = "#ff3d81";
const NETWORK_MONO = "ui-monospace,'SF Mono',Menlo,monospace";

function extractConnectionIp(connection = {}) {
  const value = String(connection.remote || connection.local || "");
  const match = value.match(/(?:^|[^0-9])((?:\d{1,3}\.){3}\d{1,3})(?=\.|:|$|[^0-9])/);
  return match?.[1] || value.split(":")[0] || "";
}

function isLoopbackIp(ip) {
  return ip === "127.0.0.1" || ip === "::1" || ip === "localhost";
}

function isPrivateIp(ip) {
  if (!ip) return false;
  if (isLoopbackIp(ip)) return true;
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return false;
  return parts[0] === 10
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168);
}

function NetworkOperationsPane({
  connections = [],
  blockedIpItems = [],
  counts = {},
  refreshLiveSnapshot,
  openActionPanel,
}) {
  const [networkStatus, setNetworkStatus] = useState(null);
  const [interfaces, setInterfaces] = useState([]);
  const [blockedRows, setBlockedRows] = useState(null);
  const [selectedKey, setSelectedKey] = useState("");
  const [filter, setFilter] = useState("all");
  const [scopeText, setScopeText] = useState("");
  const [confirmAuthority, setConfirmAuthority] = useState(false);
  const [includePortScan, setIncludePortScan] = useState(false);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const refreshNetworkStatus = useCallback(async () => {
    const [statusRes, blockedRes] = await Promise.all([
      ariaFetch("GET", "/api/network/status"),
      ariaFetch("GET", "/api/blocked-ips"),
    ]);
    if (statusRes.data) setNetworkStatus(statusRes.data);
    if (blockedRes.data?.blocked_ips) setBlockedRows(blockedRes.data.blocked_ips);
  }, []);

  useEffect(() => {
    let active = true;
    async function loadNetworkControls() {
      const [statusRes, ifaceRes, blockedRes] = await Promise.all([
        ariaFetch("GET", "/api/network/status"),
        ariaFetch("GET", "/api/network/interfaces"),
        ariaFetch("GET", "/api/blocked-ips"),
      ]);
      if (!active) return;
      if (statusRes.data) setNetworkStatus(statusRes.data);
      if (ifaceRes.data?.interfaces) {
        setInterfaces(ifaceRes.data.interfaces);
        setScopeText((current) => current || ifaceRes.data.interfaces[0]?.cidr || "");
      }
      if (blockedRes.data?.blocked_ips) setBlockedRows(blockedRes.data.blocked_ips);
    }
    void loadNetworkControls();
    const timer = setInterval(() => { void refreshNetworkStatus(); }, 8000);
    return () => { active = false; clearInterval(timer); };
  }, [refreshNetworkStatus]);

  const normalizedRows = connections.map((connection, index) => {
    const ip = extractConnectionIp(connection);
    const status = String(connection.state || "UNKNOWN").toUpperCase();
    const key = `${connection.local || ""}|${connection.remote || ""}|${index}`;
    return {
      ...connection,
      key,
      ip,
      status,
      scope: isLoopbackIp(ip) ? "loopback" : isPrivateIp(ip) ? "private" : "external",
      isEstablished: status === "ESTABLISHED",
    };
  });

  const effectiveBlockedRows = blockedRows ?? blockedIpItems;
  const blockedSet = new Set(effectiveBlockedRows.map((item) => item.ip));
  const filteredRows = normalizedRows.filter((row) => {
    if (filter === "external") return row.scope === "external";
    if (filter === "private") return row.scope === "private";
    if (filter === "established") return row.isEstablished;
    if (filter === "blocked") return blockedSet.has(row.ip) || row.status === "BLOCKED";
    return true;
  });
  const selected = filteredRows.find((row) => row.key === selectedKey) || filteredRows[0] || null;
  const selectedBlocked = selected?.ip ? blockedSet.has(selected.ip) : false;
  const externalCount = normalizedRows.filter((row) => row.scope === "external").length;
  const privateCount = normalizedRows.filter((row) => row.scope === "private").length;
  const activeScan = networkStatus?.activeScan;
  const authStatus = networkStatus?.authStatus || "none";
  const isRunning = activeScan?.status === "running";

  const runNetworkAction = async (action, fn) => {
    if (busy) return;
    setBusy(action);
    setError("");
    setNotice("");
    try {
      const message = await fn();
      setNotice(message || "Network action completed.");
      await refreshNetworkStatus();
      await refreshLiveSnapshot?.();
    } catch (err) {
      setError(err.message || "Network action failed.");
    } finally {
      setBusy("");
    }
  };

  const passiveDiscovery = () => runNetworkAction("passive", async () => {
    const res = await ariaFetch("GET", "/api/network/scan/passive");
    if (res.error) throw new Error(res.message || res.error);
    const count = res.data?.summary?.deviceCount ?? 0;
    return `Passive discovery completed. ${count} device${count === 1 ? "" : "s"} observed.`;
  });

  const authorizeScope = () => runNetworkAction("authorize", async () => {
    const scope = scopeText.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean);
    const techniques = ["passive", "ping_sweep", ...(includePortScan ? ["port_scan"] : [])];
    const res = await ariaFetch("POST", "/api/network/authorize", {
      scope,
      techniques,
      confirmAuthority,
    });
    if (res.error) throw new Error(res.message || res.error);
    return `Authorized ${scope.join(", ")} for ${techniques.join(", ")}.`;
  });

  const activeDiscovery = () => runNetworkAction("active", async () => {
    const res = await ariaFetch("POST", "/api/network/scan/active", {});
    if (res.error) throw new Error(res.message || res.error);
    return res.data?.message || "Active discovery started.";
  });

  const blockSelectedIp = (expiresIn) => runNetworkAction(`block-${expiresIn ?? "clear"}`, async () => {
    if (!selected?.ip) throw new Error("Select a connection before blocking.");
    if (isLoopbackIp(selected.ip)) throw new Error("Loopback traffic cannot be blocklisted from this panel.");
    const res = await ariaFetch("POST", "/api/blocked-ips/block", {
      ip: selected.ip,
      reason: `Network workspace response for ${selected.remote || selected.local || selected.ip}`,
      source: "network-workspace",
      expires_in: expiresIn,
    });
    if (res.error) throw new Error(res.message || res.error);
    return `${selected.ip} added to the blocklist${expiresIn ? " for one hour" : ""}.`;
  });

  const unblockSelectedIp = () => runNetworkAction("unblock", async () => {
    if (!selected?.ip) throw new Error("Select a blocked connection before unblocking.");
    const res = await ariaFetch("POST", `/api/blocked-ips/${encodeURIComponent(selected.ip)}/unblock`, {});
    if (res.error) throw new Error(res.message || res.error);
    return `${selected.ip} removed from the blocklist.`;
  });

  const explainSelected = () => {
    if (!selected) return;
    const verdict = selectedBlocked
      ? "This remote is already blocked. Validate whether live sockets have drained, then remove only after the source is understood."
      : selected.scope === "external"
      ? "External remote. Review ownership and process context before containment; temporary block is available when the connection is unexpected."
      : selected.scope === "private"
      ? "Private network peer. Prefer discovery first so you can identify the device before blocking."
      : "Loopback traffic. Treat as local service activity; use process and port context instead of firewall containment.";
    openActionPanel?.(`${selected.ip || "Selected connection"} — ${verdict}`);
  };

  const actionDisabled = busy || !selected?.ip;
  const scanProgress = activeScan?.progress;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
        {[
          { label: "AUTHORIZATION", value: authStatus, color: authStatus === "active" ? NETWORK_GOOD : NETWORK_WARN },
          { label: "ACTIVE SCAN", value: isRunning ? activeScan?.stage || "running" : activeScan?.status || "idle", color: isRunning ? NETWORK_WARN : NETWORK_GOOD },
          { label: "EXTERNAL REMOTES", value: externalCount, color: externalCount ? NETWORK_WARN : NETWORK_GOOD },
          { label: "BLOCKLIST", value: effectiveBlockedRows.length, color: effectiveBlockedRows.length ? NETWORK_DANGER : NETWORK_GOOD },
        ].map((item) => (
          <div key={item.label} style={{ ...styles.dashCard, borderColor: hexToRgba(item.color, 0.22) }}>
            <div style={styles.dashCardLabel}>{item.label}</div>
            <div style={{ marginTop: 7, fontSize: 20, color: item.color, fontWeight: 750, fontVariantNumeric: "tabular-nums", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {String(item.value).toUpperCase()}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.15fr 0.85fr", gap: 10 }}>
        <div style={styles.dashCard}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
            <div>
              <div style={styles.dashCardLabel}>DISCOVERY CONTROL</div>
              <div style={{ marginTop: 5, fontSize: 12, color: "rgba(215,235,255,0.66)", lineHeight: 1.45 }}>
                {networkStatus?.authorization?.scope?.length
                  ? `Authorized scope: ${networkStatus.authorization.scope.join(", ")}`
                  : "Passive discovery is available now. Active discovery requires explicit local scope authorization."}
              </div>
            </div>
            <button className="controlButton primary" disabled={busy === "passive"} onClick={passiveDiscovery}>
              {busy === "passive" ? "Reading..." : "Passive Discovery"}
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, alignItems: "center" }}>
            <input
              value={scopeText}
              onChange={(event) => setScopeText(event.target.value)}
              placeholder="192.168.1.0/24"
              style={{
                minWidth: 0,
                height: 34,
                borderRadius: 6,
                border: `1px solid ${hexToRgba(NETWORK_ACCENT, 0.28)}`,
                background: "rgba(0,3,10,0.72)",
                color: "rgba(234,247,255,0.88)",
                padding: "0 10px",
                fontFamily: NETWORK_MONO,
                fontSize: 12,
              }}
            />
            <label style={{ display: "flex", alignItems: "center", gap: 6, color: "rgba(215,235,255,0.7)", fontSize: 11, fontFamily: NETWORK_MONO, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              <input type="checkbox" checked={includePortScan} onChange={(event) => setIncludePortScan(event.target.checked)} />
              Ports
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, color: "rgba(215,235,255,0.7)", fontSize: 11, fontFamily: NETWORK_MONO, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              <input type="checkbox" checked={confirmAuthority} onChange={(event) => setConfirmAuthority(event.target.checked)} />
              Authorized
            </label>
          </div>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 10 }}>
            {interfaces.map((iface) => (
              <button key={`${iface.iface}-${iface.cidr}`} className="controlButton local" onClick={() => setScopeText(iface.cidr)}>
                {iface.iface} · {iface.cidr}
              </button>
            ))}
            <button className="controlButton" disabled={busy === "authorize"} onClick={authorizeScope}>
              {busy === "authorize" ? "Authorizing..." : "Authorize Scope"}
            </button>
            <button className="controlButton" disabled={busy === "active" || authStatus !== "active" || isRunning} onClick={activeDiscovery}>
              {isRunning ? "Scan Running" : "Run Active Discovery"}
            </button>
          </div>
          {activeScan ? (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${hexToRgba(NETWORK_ACCENT, 0.12)}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 11, color: "rgba(215,235,255,0.68)", fontFamily: NETWORK_MONO }}>
                <span>{activeScan.message || activeScan.stage || activeScan.status}</span>
                <span>{scanProgress?.total ? `${scanProgress.completed}/${scanProgress.total}` : activeScan.summary?.deviceCount != null ? `${activeScan.summary.deviceCount} devices` : ""}</span>
              </div>
              <div style={{ marginTop: 7, height: 5, borderRadius: 99, overflow: "hidden", background: "rgba(234,247,255,0.08)" }}>
                <div style={{ width: `${scanProgress?.total ? Math.min(100, Math.round((scanProgress.completed / scanProgress.total) * 100)) : activeScan.status === "complete" ? 100 : isRunning ? 35 : 0}%`, height: "100%", background: NETWORK_ACCENT }} />
              </div>
            </div>
          ) : null}
        </div>

        <div style={styles.dashCard}>
          <div style={styles.dashCardLabel}>RESPONSE TARGET</div>
          {selected ? (
            <div style={{ marginTop: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: NETWORK_MONO, fontSize: 17, color: "#eaf7ff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selected.ip || "unknown"}</div>
                  <div style={{ marginTop: 4, color: "rgba(215,235,255,0.55)", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selected.remote || selected.local || "socket"}</div>
                </div>
                <span style={{ color: selectedBlocked ? NETWORK_DANGER : selected.scope === "external" ? NETWORK_WARN : NETWORK_GOOD, border: `1px solid ${selectedBlocked ? "rgba(255,61,129,0.34)" : "rgba(99,245,255,0.22)"}`, borderRadius: 4, padding: "3px 7px", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", flexShrink: 0 }}>
                  {selectedBlocked ? "blocked" : selected.scope}
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginTop: 12 }}>
                <button className="controlButton" disabled={actionDisabled || selectedBlocked || isLoopbackIp(selected.ip)} onClick={() => blockSelectedIp(3600)}>Block 1h</button>
                <button className="controlButton" disabled={actionDisabled || selectedBlocked || isLoopbackIp(selected.ip)} onClick={() => blockSelectedIp(null)}>Block</button>
                <button className="controlButton" disabled={actionDisabled || !selectedBlocked} onClick={unblockSelectedIp}>Unblock</button>
                <button className="controlButton local" disabled={!selected} onClick={explainSelected}>Assess</button>
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 10, color: "rgba(215,235,255,0.62)", fontSize: 12 }}>Select a connection to enable response actions.</div>
          )}
          {(notice || error) ? (
            <div style={{ marginTop: 10, color: error ? NETWORK_DANGER : NETWORK_GOOD, fontSize: 12, lineHeight: 1.45 }}>{error || notice}</div>
          ) : null}
        </div>
      </div>

      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
          <div style={styles.dashCardLabel}>ACTIVE CONNECTION TRIAGE</div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {["all", "external", "private", "established", "blocked"].map((item) => (
              <button
                key={item}
                onClick={() => setFilter(item)}
                style={{
                  padding: "4px 9px",
                  borderRadius: 4,
                  fontSize: 9,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  fontFamily: NETWORK_MONO,
                  border: filter === item ? `1px solid ${hexToRgba(NETWORK_ACCENT, 0.62)}` : "1px solid rgba(234,247,255,0.12)",
                  background: filter === item ? hexToRgba(NETWORK_ACCENT, 0.13) : "transparent",
                  color: filter === item ? NETWORK_GOOD : "rgba(234,247,255,0.46)",
                  cursor: "pointer",
                }}
              >{item}</button>
            ))}
          </div>
        </div>
        <div style={{ background: "rgba(0,3,10,0.65)", borderRadius: 10, border: "1px solid rgba(99,245,255,0.1)", overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 78px 88px 104px 70px", padding: "7px 12px", borderBottom: "1px solid rgba(99,245,255,0.1)", fontSize: 10, letterSpacing: "0.12em", color: "rgba(173,217,255,0.55)" }}>
            <span>REMOTE</span><span>SCOPE</span><span>PROTO</span><span>STATUS</span><span>ACTION</span>
          </div>
          {filteredRows.slice(0, 28).map((row, i) => {
            const rowBlocked = blockedSet.has(row.ip);
            const active = selected?.key === row.key;
            return (
              <button
                key={row.key}
                onClick={() => setSelectedKey(row.key)}
                style={{
                  width: "100%",
                  display: "grid",
                  gridTemplateColumns: "1fr 78px 88px 104px 70px",
                  padding: "8px 12px",
                  border: "none",
                  borderBottom: i < filteredRows.length - 1 ? "1px solid rgba(99,245,255,0.06)" : "none",
                  background: active ? hexToRgba(NETWORK_ACCENT, 0.12) : rowBlocked ? "rgba(255,61,129,0.08)" : "transparent",
                  fontSize: 12,
                  alignItems: "center",
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                <span style={{ fontFamily: NETWORK_MONO, color: "rgba(215,235,255,0.9)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.remote || row.local}</span>
                <span style={{ fontFamily: NETWORK_MONO, color: row.scope === "external" ? NETWORK_WARN : "rgba(173,217,255,0.6)", textTransform: "uppercase", fontSize: 10 }}>{row.scope}</span>
                <span style={{ fontFamily: NETWORK_MONO, color: "rgba(173,217,255,0.55)" }}>{row.proto || "—"}</span>
                <span style={{ fontSize: 11, color: rowBlocked ? NETWORK_DANGER : CONN_COLOR[row.status] || "rgba(215,235,255,0.7)" }}>{row.status}</span>
                <span style={{ fontSize: 10, color: rowBlocked ? NETWORK_DANGER : "rgba(234,247,255,0.38)", letterSpacing: "0.08em", textTransform: "uppercase" }}>{rowBlocked ? "blocked" : "select"}</span>
              </button>
            );
          })}
          {filteredRows.length === 0 ? <div style={{ padding: "12px", color: "rgba(215,235,255,0.68)", fontSize: 12 }}>No connections match this filter.</div> : null}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginTop: 12 }}>
          {[
            { label: "LIVE SOCKETS", val: counts.live_sockets ?? counts.total ?? connections.length },
            { label: "ESTABLISHED", val: counts.established ?? normalizedRows.filter((row) => row.isEstablished).length },
            { label: "PRIVATE", val: privateCount },
            { label: "BLOCKED", val: effectiveBlockedRows.length },
          ].map((metric) => (
            <div key={metric.label} style={{ ...styles.dashCard, textAlign: "center" }}>
              <div style={{ fontSize: 10, color: "rgba(173,217,255,0.55)", letterSpacing: "0.1em" }}>{metric.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, color: metric.label === "BLOCKED" && metric.val ? NETWORK_DANGER : NETWORK_GOOD }}>{metric.val}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SystemProcessControl({ processes = [], actionState = null, onTerminate }) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState("cpu");
  const [selectedPid, setSelectedPid] = useState(null);

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = processes
    .filter((process) => {
      if (!normalizedQuery) return true;
      return [process.pid, process.name, process.user, process.state, process.command]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    })
    .sort((a, b) => {
      if (sortKey === "pid") return Number(a.pid || 0) - Number(b.pid || 0);
      if (sortKey === "memory") return Number(b.memory || 0) - Number(a.memory || 0);
      if (sortKey === "name") return String(a.name || "").localeCompare(String(b.name || ""));
      return Number(b.cpu || 0) - Number(a.cpu || 0);
    });

  const selected =
    filtered.find((process) => process.pid === selectedPid) ||
    filtered[0] ||
    null;
  const busy = actionState?.status === "running";

  const processLabel = (process) => process?.name || process?.command || `pid ${process?.pid || "unknown"}`;
  const metricColor = (value) => Number(value || 0) > 70 ? "#ff3d81" : Number(value || 0) > 25 ? "#ffc857" : "#63f5ff";

  return (
    <div style={{ ...styles.dashCard, marginTop: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 10 }}>
        <div>
          <div style={styles.dashCardLabel}>PROCESS CONTROL</div>
          <div style={{ marginTop: 4, fontSize: 11, color: "rgba(173,217,255,0.58)" }}>
            {filtered.length} visible of {processes.length} sampled processes
          </div>
        </div>
        <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search PID, user, command"
            style={{
              width: 210,
              maxWidth: "34vw",
              padding: "8px 10px",
              borderRadius: 6,
              border: "1px solid rgba(99,245,255,0.16)",
              background: "rgba(0,3,10,0.62)",
              color: "rgba(234,247,255,0.88)",
              outline: "none",
              fontSize: 11,
              fontFamily: "ui-monospace,'SF Mono',Menlo,monospace",
            }}
          />
          {["cpu", "memory", "pid", "name"].map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setSortKey(key)}
              style={{
                padding: "7px 9px",
                borderRadius: 5,
                border: sortKey === key ? "1px solid rgba(99,245,255,0.45)" : "1px solid rgba(234,247,255,0.1)",
                background: sortKey === key ? "rgba(99,245,255,0.12)" : "rgba(234,247,255,0.03)",
                color: sortKey === key ? "#63f5ff" : "rgba(234,247,255,0.52)",
                cursor: "pointer",
                fontSize: 9,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                fontFamily: "ui-monospace,'SF Mono',Menlo,monospace",
              }}
            >
              {key}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.35fr 0.85fr", gap: 10 }}>
        <div style={{ border: "1px solid rgba(99,245,255,0.1)", borderRadius: 8, overflow: "hidden", background: "rgba(0,3,10,0.42)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "62px 1.2fr 0.8fr 60px 60px 56px", gap: 8, padding: "7px 10px", borderBottom: "1px solid rgba(99,245,255,0.1)", fontSize: 9, letterSpacing: "0.12em", color: "rgba(173,217,255,0.55)", textTransform: "uppercase" }}>
            <span>PID</span><span>Name</span><span>User</span><span>CPU</span><span>MEM</span><span>State</span>
          </div>
          <div style={{ maxHeight: 300, overflow: "auto" }}>
            {filtered.slice(0, 80).map((process) => {
              const active = selected?.pid === process.pid;
              return (
                <button
                  key={`${process.pid}-${process.command}`}
                  type="button"
                  onClick={() => setSelectedPid(process.pid)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "62px 1.2fr 0.8fr 60px 60px 56px",
                    gap: 8,
                    alignItems: "center",
                    width: "100%",
                    padding: "8px 10px",
                    border: 0,
                    borderBottom: "1px solid rgba(99,245,255,0.055)",
                    background: active ? "rgba(99,245,255,0.11)" : "transparent",
                    color: "rgba(215,235,255,0.86)",
                    cursor: "pointer",
                    textAlign: "left",
                    fontFamily: "ui-monospace,'SF Mono',Menlo,monospace",
                    fontSize: 11,
                  }}
                >
                  <span style={{ color: active ? "#63f5ff" : "rgba(234,247,255,0.48)" }}>{process.pid}</span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={process.command}>{processLabel(process)}</span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "rgba(173,217,255,0.62)" }}>{process.user || "unknown"}</span>
                  <strong style={{ color: metricColor(process.cpu), fontVariantNumeric: "tabular-nums" }}>{Number(process.cpu || 0).toFixed(1)}%</strong>
                  <strong style={{ color: metricColor(process.memory), fontVariantNumeric: "tabular-nums" }}>{Number(process.memory || 0).toFixed(1)}%</strong>
                  <span style={{ color: "rgba(234,247,255,0.45)" }}>{process.state || "?"}</span>
                </button>
              );
            })}
            {filtered.length === 0 ? <div style={{ padding: 14, color: "rgba(215,235,255,0.68)", fontSize: 12 }}>No process rows match this filter.</div> : null}
          </div>
        </div>

        <div style={{ border: "1px solid rgba(139,92,246,0.18)", borderRadius: 8, padding: 12, background: "rgba(16,10,30,0.48)", minWidth: 0 }}>
          <div style={styles.dashCardLabel}>SELECTED PROCESS</div>
          {selected ? (
            <>
              <div style={{ marginTop: 10, fontSize: 18, color: "#eaf7ff", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={selected.command}>
                {processLabel(selected)}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
                {[
                  ["PID", selected.pid],
                  ["USER", selected.user || "unknown"],
                  ["CPU", `${Number(selected.cpu || 0).toFixed(1)}%`],
                  ["MEM", `${Number(selected.memory || 0).toFixed(1)}%`],
                  ["STATE", selected.state || "?"],
                  ["SOURCE", selected.source || "ps"],
                ].map(([label, value]) => (
                  <div key={label} style={{ padding: "7px 8px", borderRadius: 6, background: "rgba(234,247,255,0.045)", border: "1px solid rgba(234,247,255,0.07)" }}>
                    <div style={{ fontSize: 9, letterSpacing: "0.12em", color: "rgba(173,217,255,0.52)" }}>{label}</div>
                    <div style={{ marginTop: 3, fontSize: 12, color: "#63f5ff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 10, fontSize: 10, letterSpacing: "0.1em", color: "rgba(173,217,255,0.5)", textTransform: "uppercase" }}>Command</div>
              <div style={{ marginTop: 5, maxHeight: 70, overflow: "auto", fontSize: 11, lineHeight: 1.45, color: "rgba(215,235,255,0.78)", fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", wordBreak: "break-word" }}>
                {selected.command || "No command path returned by ps."}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onTerminate?.(selected, "SIGTERM")}
                  style={{
                    flex: 1,
                    padding: "9px 10px",
                    borderRadius: 6,
                    border: "1px solid rgba(255,200,87,0.4)",
                    background: "rgba(255,200,87,0.11)",
                    color: "#ffc857",
                    cursor: busy ? "wait" : "pointer",
                    fontSize: 10,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    fontFamily: "ui-monospace,'SF Mono',Menlo,monospace",
                  }}
                >
                  Terminate
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onTerminate?.(selected, "SIGKILL")}
                  style={{
                    flex: 1,
                    padding: "9px 10px",
                    borderRadius: 6,
                    border: "1px solid rgba(255,61,129,0.45)",
                    background: "rgba(255,61,129,0.1)",
                    color: "#ff3d81",
                    cursor: busy ? "wait" : "pointer",
                    fontSize: 10,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    fontFamily: "ui-monospace,'SF Mono',Menlo,monospace",
                  }}
                >
                  Kill -9
                </button>
              </div>
              {actionState?.message ? (
                <div style={{ marginTop: 10, fontSize: 11, lineHeight: 1.45, color: actionState.status === "error" ? "#ff3d81" : actionState.status === "success" ? "#63f5ff" : "#ffc857" }}>
                  {actionState.message}
                </div>
              ) : null}
            </>
          ) : (
            <div style={{ marginTop: 10, color: "rgba(215,235,255,0.68)", fontSize: 12 }}>No live process selected.</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Incident deck design tokens ───────────────────────────────────────────
const INC = {
  accent:       "#c8102e",
  accentRgb:    "200,16,46",
  bg:           "rgba(6,8,16,0.92)",
  border:       "rgba(200,16,46,0.16)",
  borderStrong: "rgba(200,16,46,0.55)",
  text:         "rgba(234,247,255,0.85)",
  textDim:      "rgba(234,247,255,0.38)",
  textFaint:    "rgba(234,247,255,0.2)",
  mono:         "ui-monospace,'SF Mono',Menlo,monospace",
};

const INC_BTN_BASE = {
  padding: "3px 9px",
  fontSize: 9,
  letterSpacing: "0.14em",
  borderRadius: 3,
  border: `1px solid rgba(${200},${16},${46},0.28)`,
  background: "transparent",
  color: `rgba(200,16,46,0.75)`,
  cursor: "pointer",
  fontFamily: INC.mono,
  textTransform: "uppercase",
};

const INC_BTN_GHOST = {
  ...INC_BTN_BASE,
  border: "1px solid rgba(234,247,255,0.12)",
  color: "rgba(234,247,255,0.42)",
};

const CORNER = (pos) => {
  const base = { position: "absolute", width: 14, height: 14, pointerEvents: "none", zIndex: 2 };
  const t = pos.includes("t") ? { top: 7 } : { bottom: 7 };
  const x = pos.includes("l") ? { left: 7, borderLeft: `1px solid ${INC.borderStrong}` } : { right: 7, borderRight: `1px solid ${INC.borderStrong}` };
  const y = pos.includes("t") ? { borderTop: `1px solid ${INC.borderStrong}` } : { borderBottom: `1px solid ${INC.borderStrong}` };
  return { ...base, ...t, ...x, ...y };
};

function IncidentActionDeck({ incidents = [], executeAriaCommand, processCommand }) {
  const [triageState, setTriageState] = useState({});

  if (!incidents.length) return null;

  const openContext = (incident) => {
    const title = String(incident.title || "").toLowerCase();
    if (title.includes("memory") || title.includes("disk") || title.includes("load")) {
      void processCommand("System health"); return;
    }
    if (title.includes("socket") || title.includes("network")) {
      void processCommand("Network connections"); return;
    }
    void processCommand("Threat overview");
  };

  const triageAction = async (incident, action) => {
    const key = `${incident.id}:${action}`;
    if (triageState[key] === "busy") return;
    setTriageState((p) => ({ ...p, [key]: "busy" }));
    try {
      await fetch(`${ARIA_API_BASE}/api/incidents/${incident.id}/${action}`, { method: "POST" });
      setTriageState((p) => ({ ...p, [incident.id]: action }));
    } catch (_) {
      setTriageState((p) => { const n = { ...p }; delete n[key]; return n; });
    }
  };

  const queued = incidents.slice(0, 4);

  return (
    <div style={{
      position: "relative",
      background: INC.bg,
      border: `1px solid ${INC.border}`,
      borderRadius: 10,
      marginBottom: 14,
      fontFamily: INC.mono,
      overflow: "hidden",
    }}>
      {/* Corner brackets */}
      <span style={CORNER("tl")} /><span style={CORNER("tr")} />
      <span style={CORNER("bl")} /><span style={CORNER("br")} />

      {/* Header row */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 18px 9px",
        borderBottom: `1px solid rgba(${INC.accentRgb},0.1)`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            width: 6, height: 6, borderRadius: "50%",
            background: INC.accent,
            boxShadow: `0 0 8px ${INC.accent}`,
            animation: "cx-pulse 1.4s ease-in-out infinite",
            flexShrink: 0,
          }} />
          <span style={{ fontSize: 9, letterSpacing: "0.22em", color: `rgba(${INC.accentRgb},0.82)` }}>
            INCIDENT ACTIONS
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {/* Severity mini-bar */}
          <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
            {["critical","high","medium","low"].map((s) => {
              const cnt = incidents.filter(i => (i.severity||"").toLowerCase() === s).length;
              return cnt > 0 ? (
                <span key={s} style={{
                  fontSize: 8, letterSpacing: "0.1em",
                  color: s === "critical" ? `rgba(${INC.accentRgb},0.9)` : s === "high" ? `rgba(${INC.accentRgb},0.55)` : INC.textFaint,
                  textTransform: "uppercase",
                }}>
                  {cnt}{s[0].toUpperCase()}
                </span>
              ) : null;
            })}
          </div>
          <span style={{ fontSize: 8, letterSpacing: "0.14em", color: INC.textFaint }}>
            {queued.length} QUEUED
          </span>
        </div>
      </div>

      {/* Incident rows */}
      <div style={{ padding: "10px 14px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
        {queued.map((incident) => {
          const resolved = triageState[incident.id];
          const isCritical = (incident.severity || "").toLowerCase() === "critical";
          const leftAlpha = isCritical ? 0.75 : 0.28;

          return (
            <div key={incident.id} style={{
              background: isCritical && !resolved ? `rgba(${INC.accentRgb},0.04)` : "rgba(234,247,255,0.018)",
              border: `1px solid rgba(${INC.accentRgb},${isCritical ? 0.1 : 0.05})`,
              borderLeft: `2px solid rgba(${INC.accentRgb},${leftAlpha})`,
              borderRadius: "0 6px 6px 0",
              padding: "8px 12px",
              transition: "opacity 0.3s",
              opacity: resolved ? 0.52 : 1,
            }}>
              {/* Meta row */}
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
                <span style={{
                  fontSize: 8, letterSpacing: "0.18em", textTransform: "uppercase",
                  color: isCritical ? `rgba(${INC.accentRgb},0.85)` : INC.textDim,
                }}>
                  {incident.severity || "unknown"}
                </span>
                <span style={{ color: INC.textFaint, fontSize: 8 }}>·</span>
                <span style={{ fontSize: 8, letterSpacing: "0.1em", color: INC.textFaint }}>
                  {incident.id || "LIVE"}
                </span>
                {resolved && <>
                  <span style={{ color: INC.textFaint, fontSize: 8 }}>·</span>
                  <span style={{ fontSize: 8, letterSpacing: "0.1em", color: "rgba(234,247,255,0.55)" }}>
                    {resolved.toUpperCase()}
                  </span>
                </>}
                {incident.timestamp && (
                  <span style={{ marginLeft: "auto", fontSize: 8, color: INC.textFaint }}>
                    {new Date(incident.timestamp).toLocaleTimeString()}
                  </span>
                )}
              </div>

              {/* Title */}
              <div style={{ fontSize: 12, color: INC.text, lineHeight: 1.45, marginBottom: resolved ? 0 : 9 }}>
                {(incident.title || incident.message || "Incident").slice(0, 72)}
              </div>

              {/* Actions */}
              {!resolved && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
                  {/* Triage */}
                  <div style={{ display: "flex", gap: 5 }}>
                    <button
                      style={{ ...INC_BTN_BASE, opacity: triageState[`${incident.id}:acknowledge`] === "busy" ? 0.45 : 1 }}
                      onClick={() => void triageAction(incident, "acknowledge")}
                    >BACK</button>
                    <button
                      style={{ ...INC_BTN_GHOST, opacity: triageState[`${incident.id}:escalate`] === "busy" ? 0.45 : 1 }}
                      onClick={() => void triageAction(incident, "escalate")}
                    >ESCALATE</button>
                    <button
                      style={{ ...INC_BTN_BASE, color: `rgba(${INC.accentRgb},0.5)`, borderColor: `rgba(${INC.accentRgb},0.2)`, opacity: triageState[`${incident.id}:suppress`] === "busy" ? 0.45 : 1 }}
                      onClick={() => void triageAction(incident, "suppress")}
                    >SUPPRESS</button>
                  </div>
                  {/* Investigation */}
                  <div style={{ display: "flex", gap: 5 }}>
                    <button style={INC_BTN_GHOST} onClick={() => openContext(incident)}>CONTEXT</button>
                    <button style={INC_BTN_GHOST} onClick={() => void executeAriaCommand("Run a quick scan")}>SCAN</button>
                    <button style={INC_BTN_GHOST} onClick={() => void executeAriaCommand("Generate incident report")}>REPORT</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ThreatReviewList({ reviewItems = [], vectors = [] }) {
  return (
    <div style={{ ...styles.dashCard, marginTop: 10 }}>
      <div style={styles.dashCardLabel}>LIVE THREAT REVIEW</div>
      <div style={{ display: "grid", gap: 9, marginTop: 10 }}>
        {reviewItems.length ? reviewItems.map((item, index) => (
          <div key={`${item}-${index}`} style={{ ...styles.feedLine, borderLeft: "2px solid #ff3d81", paddingLeft: 10 }}>
            {item}
          </div>
        )) : <div style={styles.feedLine}>No active threshold breach. ARIA is watching live source drift.</div>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 12 }}>
        {vectors.slice(0, 6).map((vector) => (
          <div key={vector.label} style={{ padding: 10, borderRadius: 8, border: "1px solid rgba(99,245,255,0.12)", background: "rgba(255,255,255,0.035)" }}>
            <div style={{ fontSize: 10, color: "rgba(173,217,255,0.62)", letterSpacing: "0.1em", textTransform: "uppercase" }}>{vector.label}</div>
            <div style={{ marginTop: 6, height: 5, borderRadius: 999, background: "rgba(234,247,255,0.08)", overflow: "hidden" }}>
              <div style={{ width: `${Math.min(100, Number(vector.score || 0))}%`, height: "100%", background: Number(vector.score || 0) > 76 ? "#ff3d81" : "#63f5ff" }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function normalizeBlockedIpRows(...groups) {
  const rows = new Map();
  groups.flat().forEach((item) => {
    if (!item) return;
    const ip = typeof item === "string" ? item : item.ip;
    if (!ip) return;
    rows.set(ip, {
      ip,
      action: item.action || "block",
      reason: item.reason || "",
      source: item.source || "firewall",
      blocked_at: item.blocked_at || item.created_at || null,
      expires_at: item.expires_at || null,
      blocked_by: item.blocked_by || null,
      ...item,
    });
  });
  return [...rows.values()].sort((a, b) => String(a.ip).localeCompare(String(b.ip)));
}

function formatBlockedIpTime(value) {
  if (!value) return "active";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "active";
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function BlockedIpPanel({
  items = [],
  connector = null,
  sources = [],
  storedCount = 0,
  loading = false,
  actionMessage = "",
  onRefresh,
  onBlock,
  onUnblock,
}) {
  const status = connector?.status || "unconfigured";
  const connectorLabel = connector?.label || "macOS firewall blocklist";
  const connectorRows = sources.filter((source) => ["firewall-blocklist", "github", "siem-edr"].includes(source.id));
  const [ipDraft, setIpDraft] = useState("");
  const [reasonDraft, setReasonDraft] = useState("");
  const [busyIp, setBusyIp] = useState("");
  const [evidenceItem, setEvidenceItem] = useState(null);

  const submitBlock = async (event) => {
    event.preventDefault();
    const ip = ipDraft.trim();
    if (!ip || !onBlock) return;
    setBusyIp(ip);
    try {
      const ok = await onBlock(ip, reasonDraft.trim());
      if (ok !== false) {
        setIpDraft("");
        setReasonDraft("");
      }
    } finally {
      setBusyIp("");
    }
  };

  const unblock = async (ip) => {
    if (!ip || !onUnblock) return;
    setBusyIp(ip);
    try {
      await onUnblock(ip);
    } finally {
      setBusyIp("");
    }
  };

  return (
    <div>
      {/* ── Section A: ARIA BLOCKLIST ────────────────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={styles.dashCardLabel}>ARIA BLOCKLIST</span>
        <span style={{ fontSize: 10, color: "#50ffb4", padding: "3px 9px", background: "rgba(80,255,180,0.12)", borderRadius: 99, border: "1px solid rgba(80,255,180,0.28)" }}>
          {items.length > 0 ? `${items.length} BLOCKED` : "LIVE"}
        </span>
      </div>
      <div style={styles.dashCard}>
        {/* Add Block form */}
        <form onSubmit={submitBlock} style={{ display: "grid", gridTemplateColumns: "minmax(160px, 0.9fr) minmax(190px, 1.2fr) auto auto", gap: 8, alignItems: "center", marginBottom: 12 }}>
          <input
            value={ipDraft}
            onChange={(event) => setIpDraft(event.target.value)}
            placeholder="IP or CIDR"
            aria-label="IP or CIDR to block"
            style={{ height: 36, borderRadius: 8, border: "1px solid rgba(99,245,255,0.18)", background: "rgba(0,3,10,0.62)", color: "#eaf7ff", padding: "0 10px", fontFamily: "monospace", outline: "none" }}
          />
          <input
            value={reasonDraft}
            onChange={(event) => setReasonDraft(event.target.value)}
            placeholder="Reason (optional)"
            aria-label="Blocked IP reason"
            style={{ height: 36, borderRadius: 8, border: "1px solid rgba(99,245,255,0.18)", background: "rgba(0,3,10,0.62)", color: "#eaf7ff", padding: "0 10px", outline: "none" }}
          />
          <button type="submit" disabled={!ipDraft.trim() || Boolean(busyIp)} style={{ height: 36, padding: "0 12px", borderRadius: 8, border: "1px solid rgba(255,61,129,0.32)", background: "rgba(255,61,129,0.14)", color: "#ff8ab2", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", cursor: ipDraft.trim() && !busyIp ? "pointer" : "default", opacity: ipDraft.trim() && !busyIp ? 1 : 0.5 }}>Block</button>
          <button type="button" onClick={() => void onRefresh?.()} disabled={loading} style={{ height: 36, padding: "0 12px", borderRadius: 8, border: "1px solid rgba(99,245,255,0.24)", background: "rgba(99,245,255,0.08)", color: "#63f5ff", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", cursor: loading ? "default" : "pointer", opacity: loading ? 0.55 : 1 }}>Refresh</button>
        </form>
        {actionMessage ? <div style={{ marginBottom: 10, fontSize: 12, color: actionMessage.includes("failed") ? "#ff8ab2" : "#63f5ff" }}>{actionMessage}</div> : null}
        {/* Table header */}
        {items.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 2fr 1.2fr 1fr auto", gap: 8, padding: "4px 10px", fontSize: 10, color: "rgba(173,217,255,0.45)", letterSpacing: "0.08em", textTransform: "uppercase", borderBottom: "1px solid rgba(99,245,255,0.1)", marginBottom: 6 }}>
            <span>IP</span><span>Reason</span><span>Blocked At</span><span>Source</span><span></span>
          </div>
        )}
        {/* Rows / empty state */}
        <div style={{ display: "grid", gap: 6 }}>
          {items.length === 0
            ? <div style={{ fontSize: 13, color: "rgba(215,235,255,0.55)", padding: "12px 0" }}>No IPs currently blocked in the Aria store. Use the form above to add one.</div>
            : items.map((item, index) => (
              <div key={`${item.ip}-${index}`} style={{ display: "grid", gridTemplateColumns: "1.2fr 2fr 1.2fr 1fr auto", gap: 8, alignItems: "center", padding: "9px 10px", borderRadius: 8, background: "rgba(255,61,129,0.08)", border: "1px solid rgba(255,61,129,0.18)" }}>
                <div style={{ fontFamily: "monospace", color: "#eaf7ff", fontSize: 13 }}>{item.ip}</div>
                <div style={{ fontSize: 11, color: "rgba(215,235,255,0.72)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.reason || "Manual block"}</div>
                <div style={{ fontSize: 11, color: "rgba(215,235,255,0.5)" }}>{formatBlockedIpTime(item.blocked_at)}</div>
                <div style={{ fontSize: 10, color: "#ffc857", letterSpacing: "0.06em" }}>{item.source || "manual"}</div>
                <div style={{ display: "flex", gap: 6, justifySelf: "end" }}>
                  <button type="button" onClick={() => setEvidenceItem(item)} style={{ padding: "6px 10px", borderRadius: 7, border: "1px solid rgba(255,200,87,0.3)", background: "rgba(255,200,87,0.08)", color: "#ffc857", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer", whiteSpace: "nowrap" }}>Open Evidence</button>
                  <button type="button" onClick={() => void unblock(item.ip)} disabled={busyIp === item.ip} style={{ padding: "6px 10px", borderRadius: 7, border: "1px solid rgba(99,245,255,0.24)", background: "rgba(99,245,255,0.08)", color: "#63f5ff", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", cursor: busyIp === item.ip ? "default" : "pointer", opacity: busyIp === item.ip ? 0.5 : 1, whiteSpace: "nowrap" }}>Unblock</button>
                </div>
              </div>
            ))
          }
        </div>
      </div>

      {/* ── Section B: FIREWALL SOURCES ─────────────────────────────────────── */}
      {connectorRows.length > 0 && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, marginTop: 20 }}>
            <span style={styles.dashCardLabel}>FIREWALL SOURCES</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
            {connectorRows.map((source) => (
              <div key={source.id} style={{ ...styles.dashCard, textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "rgba(173,217,255,0.58)", letterSpacing: "0.08em", textTransform: "uppercase" }}>{source.label}</div>
                <div style={{ marginTop: 6, fontSize: 12, color: source.status === "live" ? "#63f5ff" : "#ffc857" }}>{source.status}</div>
              </div>
            ))}
          </div>
        </>
      )}
      <EvidenceDrawer
        open={!!evidenceItem}
        evidence={evidenceFromBlockedIp(evidenceItem)}
        title="Blocked IP Evidence"
        subtitle="Decision proof record"
        accent="#ffc857"
        onClose={() => setEvidenceItem(null)}
      />
    </div>
  );
}

function evidenceFromBlockedIp(item) {
  if (!item) return null;
  return {
    source: item.source || "firewall",
    timestamp: item.blocked_at,
    affectedEntities: [item.ip].filter(Boolean),
    relatedFindings: [],
    timeline: [
      item.blocked_at ? { title: "Blocked", time: item.blocked_at, meta: item.blocked_by } : null,
      item.expires_at ? { title: "Expires", time: item.expires_at } : null,
    ].filter(Boolean),
    blastRadius: item.ip,
    confidence: null,
    policyControls: [],
    recommendedAction: item.action || "block",
    approvalState: item.blocked_by ? `Blocked by ${item.blocked_by}` : "Auto-governed",
    auditTrail: [{ title: item.reason || "Manual block", meta: item.blocked_at }],
  };
}

function NarrativeVoiceOverlay({
  narrative = {},
  onClose,
  onStop,
  onRealtimeSpeak,
  autoSpeak = true,
  realtimeVoiceAvailable = false,
  onAskQuestion,
  isRealtimeSpeaking = false,
  realtimeVoiceLevelRef,
  realtimeLastAudioAtRef,
}) {
  const canvasRef = useRef(null);
  const noiseCanvasRef = useRef(null);
  const speakingRef = useRef(false);
  const [question, setQuestion] = useState("");
  const [statusLine, setStatusLine] = useState("");
  const isGenerating = narrative.status === "generating";
  const text = isGenerating ? "" : [
    narrative.summary,
    narrative.likely_attack_path ? `Likely path: ${narrative.likely_attack_path}` : "",
    narrative.blast_radius,
  ].filter(Boolean).join(" ");

  useEffect(() => {
    let neuralId = null;
    let neuralCanvas;
    let neuralCtx;
    let neuralResize = null;
    let subtleNoiseCanvas;
    let subtleNoiseCtx;
    let subtleNoiseAnimationId = null;
    let subtleNoiseResizeListener = null;

    function startNetworkNodesWallpaper() {
      if (neuralId) return;
      neuralCanvas = document.getElementById("neural-canvas");
      if (!neuralCanvas) return;
      neuralCtx = neuralCanvas.getContext("2d");

      let nodes = [];
      const nodeCount = 100;
      let rotation = 0;

      function init() {
        neuralCanvas.width = window.innerWidth;
        neuralCanvas.height = window.innerHeight;
        nodes = [];
        for (let i = 0; i < nodeCount; i++) {
          const theta = Math.acos(2 * Math.random() - 1);
          const phi = Math.sqrt(nodeCount * Math.PI) * phi_c(i);
          const r = Math.min(window.innerWidth, window.innerHeight) * 0.46;

          nodes.push({
            x: r * Math.sin(theta) * Math.cos(phi),
            y: r * Math.sin(theta) * Math.sin(phi),
            z: r * Math.cos(theta),
            baseX: r * Math.sin(theta) * Math.cos(phi),
            baseY: r * Math.sin(theta) * Math.sin(phi),
            baseZ: r * Math.cos(theta),
          });
        }
      }

      function phi_c(n) { return 2 * Math.PI * n; }

      function animate() {
        if (!neuralCtx || !neuralCanvas) return;
        neuralId = requestAnimationFrame(animate);

        const w = neuralCanvas.width;
        const h = neuralCanvas.height;
        neuralCtx.clearRect(0, 0, w, h);

        const isLight = document.documentElement.classList.contains("light-mode");
        const themeColor = getComputedStyle(document.documentElement).getPropertyValue("--theme-primary").trim() || "#4a90e2";
        const rawVoice = Math.max(0, Math.min(1, Number(realtimeVoiceLevelRef?.current || 0)));
        const recentAudio = Date.now() - Number(realtimeLastAudioAtRef?.current || 0) < 1200;
        const speakingActive = speakingRef.current || isRealtimeSpeaking || recentAudio;
        const smoothedVoice = speakingActive ? Math.max(0.2, rawVoice) : rawVoice * 0.35;
        const dynamicConnectionDist = 150 + smoothedVoice * 72;

        rotation += 0.0042 + smoothedVoice * 0.004;
        const cx = w / 2;
        const cy = h / 2;

        nodes.sort((a, b) => a.z - b.z);

        nodes.forEach(node => {
          let x = node.baseX;
          let y = node.baseY;
          let z = node.baseZ;

          let ry = x * Math.cos(rotation) - z * Math.sin(rotation);
          let rz = x * Math.sin(rotation) + z * Math.cos(rotation);
          x = ry; z = rz;

          let ry2 = y * Math.cos(0) - z * Math.sin(0);
          let rz2 = y * Math.sin(0) + z * Math.cos(0);
          y = ry2; z = rz2;

          node.x = x; node.y = y; node.z = z;

          const fov = 400;
          const denom = fov + z;
          if (!Number.isFinite(denom) || denom <= 1) return;
          const scale = fov / denom;
          if (!Number.isFinite(scale) || scale <= 0) return;
          const px = x * scale + cx;
          const py = y * scale + cy;
          if (!Number.isFinite(px) || !Number.isFinite(py)) return;

          nodes.forEach(otherNode => {
            const dx = node.x - otherNode.x;
            const dy = node.y - otherNode.y;
            const dz = node.z - otherNode.z;
            const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);

            if (dist < dynamicConnectionDist) {
              const alpha = 1 - (dist / dynamicConnectionDist);
              const depthAlpha = (z + 200) / 400;
              if(depthAlpha > 0) {
                neuralCtx.beginPath();
                neuralCtx.moveTo(px, py);

                const oDenom = fov + otherNode.z;
                if (!Number.isFinite(oDenom) || oDenom <= 1) return;
                const oScale = fov / oDenom;
                if (!Number.isFinite(oScale) || oScale <= 0) return;
                const opx = otherNode.x * oScale + cx;
                const opy = otherNode.y * oScale + cy;
                if (!Number.isFinite(opx) || !Number.isFinite(opy)) return;

                neuralCtx.lineTo(opx, opy);

                if (isLight) {
                  neuralCtx.strokeStyle = `rgba(50,50,50,${alpha * 0.3 * depthAlpha})`;
                } else {
                  neuralCtx.strokeStyle = themeColor.replace("rgb", "rgba").replace(")", `, ${alpha * 0.6 * depthAlpha})`);
                }
                neuralCtx.lineWidth = 0.8 + Math.min(1.3, smoothedVoice * 1.1);
                neuralCtx.stroke();
              }
            }
          });

          const size = (3.2 + smoothedVoice * 1.4) * scale;
          if (!Number.isFinite(size) || size <= 0) return;
          neuralCtx.beginPath();
          neuralCtx.arc(px, py, size, 0, Math.PI * 2);
          neuralCtx.fillStyle = isLight ? "#333" : "#fff";
          neuralCtx.globalAlpha = (z + 200) / 400;
          neuralCtx.fill();
          neuralCtx.globalAlpha = 1;
        });
      }

      init();
      animate();
      neuralResize = init;
      window.addEventListener("resize", neuralResize);
    }

    function stopNetworkNodesWallpaper() {
      if (neuralId) { cancelAnimationFrame(neuralId); neuralId = null; }
      if (neuralResize) window.removeEventListener("resize", neuralResize);
      neuralCanvas = null; neuralCtx = null;
    }

    function startSubtleNoiseWallpaper() {
      subtleNoiseCanvas = document.getElementById("subtle-noise-canvas");
      if (!subtleNoiseCanvas) return;
      subtleNoiseCtx = subtleNoiseCanvas.getContext("2d");
      function subtleNoiseInit() { subtleNoiseCanvas.width = window.innerWidth; subtleNoiseCanvas.height = window.innerHeight; }
      function subtleNoiseAnimate() {
        if (!subtleNoiseCtx || !subtleNoiseCanvas) { stopSubtleNoiseWallpaper(); return; }
        subtleNoiseAnimationId = requestAnimationFrame(subtleNoiseAnimate);
        const w = subtleNoiseCanvas.width, h = subtleNoiseCanvas.height;
        const imageData = subtleNoiseCtx.createImageData(w, h), data = imageData.data;
        const isLight = document.documentElement.classList.contains("light-mode");
        const baseGray = isLight ? 230 : 25;
        for (let i = 0; i < data.length; i += 4) {
          const gray = baseGray + Math.random() * 20 - 10;
          data[i] = gray; data[i + 1] = gray; data[i + 2] = gray; data[i + 3] = 255;
        }
        subtleNoiseCtx.putImageData(imageData, 0, 0);
      }
      subtleNoiseInit(); subtleNoiseAnimate();
      subtleNoiseResizeListener = () => { if (subtleNoiseCanvas) subtleNoiseInit(); };
      window.addEventListener("resize", subtleNoiseResizeListener);
    }
    function stopSubtleNoiseWallpaper() {
      if (subtleNoiseAnimationId) cancelAnimationFrame(subtleNoiseAnimationId);
      if (subtleNoiseResizeListener) window.removeEventListener("resize", subtleNoiseResizeListener);
      subtleNoiseAnimationId = null; subtleNoiseResizeListener = null; subtleNoiseCanvas = null; subtleNoiseCtx = null;
    }

    startSubtleNoiseWallpaper();
    startNetworkNodesWallpaper();

    return () => {
      stopNetworkNodesWallpaper();
      stopSubtleNoiseWallpaper();
    };
  }, []);

  useEffect(() => {
    if (!autoSpeak) {
      speakingRef.current = false;
      return undefined;
    }
    if (!text || isGenerating) return undefined;

    if (realtimeVoiceAvailable && onRealtimeSpeak) {
      onRealtimeSpeak(text);
      speakingRef.current = true;
      const estimatedDurationMs = Math.min(18000, Math.max(5200, text.split(/\s+/).length * 250));
      const stopTimer = window.setTimeout(() => {
        speakingRef.current = false;
      }, estimatedDurationMs);

      return () => {
        speakingRef.current = false;
        window.clearTimeout(stopTimer);
      };
    }

    return undefined;
  }, [autoSpeak, isGenerating, onRealtimeSpeak, realtimeVoiceAvailable, text]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") { onStop?.(); onClose?.(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, onStop]);

  const askQuestion = () => {
    const clean = question.trim();
    if (!clean) return;
    onAskQuestion?.(clean);
    speakingRef.current = true;
    setQuestion("");
    setStatusLine(`Question sent: "${clean}"`);
  };

  return (
    <div style={styles.narrativeOverlay}>
      <div style={styles.narrativeOrbEntity}>
        <div style={styles.narrativeOrbShell}>
          <canvas id="subtle-noise-canvas" ref={noiseCanvasRef} style={styles.narrativeNoiseCanvas} />
          <canvas id="neural-canvas" ref={canvasRef} style={styles.narrativeCanvas} />
          {isGenerating && (
            <div style={{
              position: "absolute", inset: 0, display: "flex", alignItems: "center",
              justifyContent: "center", flexDirection: "column", gap: 12, pointerEvents: "none",
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: "50%",
                border: "2px solid rgba(99,245,255,0.25)",
                borderTop: "2px solid #63f5ff",
                animation: "ariaCorePulse 0.9s linear infinite",
              }} />
              <span style={{
                fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase",
                color: "rgba(99,245,255,0.7)", fontFamily: "ui-monospace, monospace",
              }}>Analysing…</span>
            </div>
          )}
        </div>
        <button style={styles.narrativeCloseFab} onClick={() => { onStop?.(); onClose?.(); }}>Close</button>
        <div style={styles.narrativeQuestionDock}>
          <input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") askQuestion(); }}
            placeholder={isGenerating ? "Aria is thinking…" : "Ask the orb a follow-up…"}
            disabled={isGenerating}
            style={{ ...styles.narrativeQuestionInput, opacity: isGenerating ? 0.45 : 1 }}
          />
          <button style={styles.narrativeEntityButton} onClick={askQuestion} disabled={isGenerating}>Ask</button>
        </div>
        <div style={styles.narrativeStatusLine}>
          {isGenerating
            ? "Generating intelligence brief…"
            : (statusLine || narrative.title || "ARIA narrative entity online")}
        </div>
      </div>
    </div>
  );
}

function AiSpmDashboard({
  aiSpmState,
  demoActive = false,
  loadAiSpmDashboard,
  generateAiSpmNarrative,
  openAiSpmSandbox,
  recordAiSpmFindingAction,
  closeAiSpmNarrativeOverlay,
  speakARIARealtime,
  connectGithubWithToken,
  startGithubDeviceAuth,
  pollGithubDeviceAuth,
  loadGithubRepositories,
  saveGithubRepositories,
  disconnectGithub,
  scanGithub,
  connectAws,
  disconnectAws,
  connectOkta,
  disconnectOkta,
  scanOkta,
  connectSnyk,
  disconnectSnyk,
  scanSnyk,
  connectAzureAd,
  disconnectAzureAd,
  scanAzureAd,
  connectVirusTotal,
  disconnectVirusTotal,
  enrichIocs,
  connectElastic,
  disconnectElastic,
  scanElastic,
  testConnector,
  runConnectorFirstScan,
  askNarrativeQuestion,
  stopNarrativeSpeech,
  isRealtimeSpeaking,
  realtimeVoiceLevelRef,
  realtimeLastAudioAtRef,
}) {
  const summary = aiSpmState?.summary || {};
  const inventory = aiSpmState?.inventory || {};
  const connectors = inventory.connectors || [];
  const assets = inventory.assets || [];
  const findings = aiSpmState?.findings || [];
  const narrative = aiSpmState?.narrative || {};
  const sandbox = aiSpmState?.sandbox || null;
  const githubConnector = aiSpmState?.githubConnector || null;
  const githubRepositories = aiSpmState?.githubRepositories || [];
  const narrativeOverlayOpen = Boolean(aiSpmState?.narrativeOverlay && narrative?.status === "ready");
  const actionMessage = aiSpmState?.actionMessage || "";
  const demoMode = Boolean(aiSpmState?.demoMode);
  const scanProgress = aiSpmState?.scanProgress || createAiSpmScanProgress();
  const scanTargets = scanProgress.targets || [];
  const scanActive = Boolean(aiSpmState?.loading || ["preparing", "validating", "scanning", "finalizing"].includes(scanProgress.phase));
  const topFindings = findings.slice(0, 8);
  const topAssets = assets.slice(0, 10);

  const postureColor = summary.posture === "critical"
    ? "#ff3d81"
    : summary.posture === "elevated"
    ? "#ffc857"
    : "#2dd4bf";
  const repos = connectors.flatMap((connector) => connector.repositories || []);

  const spmCard = {
    borderRadius: 10,
    border: "1px solid rgba(45,212,191,0.18)",
    background: "rgba(4,8,20,0.72)",
    padding: "14px 16px",
  };
  const spmLabel = {
    fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase",
    color: "rgba(45,212,191,0.6)", marginBottom: 8,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {narrativeOverlayOpen ? (
        <NarrativeVoiceOverlay
          narrative={narrative}
          onClose={() => closeAiSpmNarrativeOverlay()}
          onStop={stopNarrativeSpeech}
          onRealtimeSpeak={speakARIARealtime}
          autoSpeak={!demoActive}
          realtimeVoiceAvailable={Boolean(speakARIARealtime)}
          onAskQuestion={askNarrativeQuestion}
          isRealtimeSpeaking={false}
          realtimeVoiceLevelRef={realtimeVoiceLevelRef}
          realtimeLastAudioAtRef={realtimeLastAudioAtRef}
        />
      ) : null}

      {/* ── Status bar ── */}
      <div style={{ display: "flex", borderRadius: 10, overflow: "hidden", border: "1px solid rgba(45,212,191,0.18)", background: "rgba(4,8,20,0.72)" }}>
        {[
          { label: "Posture",   value: String(summary.posture || "unknown").toUpperCase(), color: postureColor },
          { label: "AI Assets", value: summary.asset_count ?? "—",    color: "#2dd4bf" },
          { label: "Findings",  value: summary.finding_count ?? "—",  color: "#63f5ff" },
          { label: "Critical",  value: summary.critical_count ?? "—", color: "#ff3d81" },
          { label: "High",      value: summary.high_count ?? "—",     color: "#ffc857" },
          { label: "Secrets",   value: summary.secret_count ?? "—",   color: "#ff3d81" },
        ].map(({ label, value, color }, i, arr) => (
          <div key={label} style={{ flex: 1, padding: "10px 14px", borderRight: i < arr.length - 1 ? "1px solid rgba(45,212,191,0.1)" : "none" }}>
            <div style={{ fontSize: 9, letterSpacing: "0.18em", color: "rgba(45,212,191,0.45)", marginBottom: 4, textTransform: "uppercase" }}>{label}</div>
            <div style={{ fontSize: 16, fontWeight: 600, color, fontVariantNumeric: "tabular-nums" }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{ ...spmCard, padding: "10px 14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 12, color: "rgba(215,235,255,0.8)" }}>
            {STRICT_PROD_UI
              ? "Strict production mode — live connector scan mode only."
              : demoMode
                ? "Deterministic showcase data is active."
                : "Live connector scan mode is active."}
          </div>
          <button
            style={{
              border: "1px solid rgba(45,212,191,0.28)",
              borderRadius: 4,
              background: "rgba(45,212,191,0.06)",
              color: STRICT_PROD_UI ? "rgba(148,163,184,0.8)" : "#2dd4bf",
              padding: "5px 10px",
              fontSize: 10,
              letterSpacing: "0.06em",
              cursor: STRICT_PROD_UI ? "not-allowed" : "pointer",
              opacity: STRICT_PROD_UI ? 0.75 : 1,
            }}
            disabled={STRICT_PROD_UI}
            onClick={() => void loadAiSpmDashboard(true, !demoMode)}
          >
            {STRICT_PROD_UI ? "Demo Disabled In Prod" : (demoMode ? "Switch to Live" : "Switch to Demo")}
          </button>
        </div>
      </div>

      {scanActive || scanProgress.phase === "complete" || scanProgress.phase === "error" ? (
        <div style={{ ...spmCard, borderColor: scanProgress.phase === "error" ? "rgba(255,61,129,0.34)" : "rgba(45,212,191,0.28)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 9 }}>
            <div>
              <div style={spmLabel}>Scan Progress</div>
              <div style={{ fontSize: 12, color: "rgba(215,235,255,0.76)", lineHeight: 1.45 }}>
                {scanProgress.message || (scanActive ? "Scanning connected sources…" : "Scan ready.")}
              </div>
            </div>
            <div style={{ fontSize: 18, color: scanProgress.phase === "error" ? "#ff3d81" : "#2dd4bf", fontVariantNumeric: "tabular-nums" }}>
              {Math.round(scanProgress.percent || 0)}%
            </div>
          </div>
          <div style={{ height: 7, borderRadius: 999, overflow: "hidden", background: "rgba(10,20,38,0.9)", border: "1px solid rgba(99,245,255,0.12)" }}>
            <div
              style={{
                height: "100%",
                width: `${Math.max(4, Math.min(100, scanProgress.percent || 0))}%`,
                borderRadius: 999,
                background: scanProgress.phase === "error"
                  ? "linear-gradient(90deg, #ff3d81, #ffc857)"
                  : "linear-gradient(90deg, #2dd4bf, #63f5ff)",
                boxShadow: "0 0 18px rgba(45,212,191,0.34)",
                transition: "width 0.35s ease",
              }}
            />
          </div>
          {scanTargets.length ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 7, marginTop: 10 }}>
              {scanTargets.map((target) => {
                const statusColor = target.status === "complete"
                  ? "#2dd4bf"
                  : target.status === "error"
                  ? "#ff3d81"
                  : target.status === "scanning"
                  ? "#63f5ff"
                  : target.status === "skipped"
                  ? "rgba(171,224,255,0.38)"
                  : "#ffc857";
                return (
                  <div key={target.id} style={{ padding: "7px 9px", borderRadius: 6, border: `1px solid ${hexToRgba(statusColor.startsWith("#") ? statusColor : "#63f5ff", 0.22)}`, background: "rgba(4,8,20,0.52)", minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: statusColor, boxShadow: target.status === "scanning" ? `0 0 9px ${statusColor}` : "none", flexShrink: 0 }} />
                      <span style={{ fontSize: 10, color: "rgba(232,241,252,0.84)", letterSpacing: "0.08em", textTransform: "uppercase", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{target.label}</span>
                    </div>
                    <div style={{ marginTop: 4, fontSize: 10, color: statusColor, textTransform: "uppercase", letterSpacing: "0.08em" }}>{target.status || "pending"}</div>
                    {target.detail ? (
                      <div style={{ marginTop: 3, fontSize: 10, color: "rgba(171,224,255,0.46)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{target.detail}</div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ── Main body: findings + inventory ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1.15fr 0.85fr", gap: 10 }}>

        {/* Findings */}
        <div style={spmCard}>
          <div style={spmLabel}>Prioritized AI-SPM Findings</div>
          <div style={{ display: "grid", gap: 7 }}>
            {topFindings.map((finding) => (
              <div key={finding.id} style={{ padding: "10px 12px", borderRadius: 8, border: `1px solid ${hexToRgba(SEV_COLOR[finding.severity] || "#2dd4bf", 0.28)}`, background: `rgba(4,8,20,0.6)` }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 5 }}>
                  <span style={{ fontSize: 13, color: "rgba(232,241,252,0.94)", lineHeight: 1.35 }}>{finding.title}</span>
                  <span style={{ fontSize: 9, color: SEV_COLOR[finding.severity] || "#2dd4bf", flexShrink: 0, letterSpacing: "0.12em" }}>{String(finding.severity || "review").toUpperCase()}</span>
                </div>
                <div style={{ fontSize: 10, color: "rgba(99,245,255,0.45)", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", marginBottom: 4 }}>{finding.repo}</div>
                <div style={{ fontSize: 12, color: "rgba(215,235,255,0.72)", lineHeight: 1.45 }}>{finding.rationale}</div>
                {finding.decision?.status ? (
                  <div style={{ marginTop: 5, fontSize: 9, color: "#ffc857", textTransform: "uppercase", letterSpacing: "0.1em" }}>{finding.decision.status.replace(/_/g, " ")}</div>
                ) : null}
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 8 }}>
                  {[
                    { label: "Sandbox",  fn: () => void openAiSpmSandbox(finding.id) },
                    { label: "Narrative",fn: () => void generateAiSpmNarrative(finding.id) },
                    { label: "Act",      fn: () => void recordAiSpmFindingAction(finding.id, "act") },
                    { label: "Resolve",  fn: () => void recordAiSpmFindingAction(finding.id, "resolve") },
                    { label: "Ignore",   fn: () => void recordAiSpmFindingAction(finding.id, "ignore") },
                  ].map(({ label, fn }) => (
                    <button key={label} style={{ border: "1px solid rgba(45,212,191,0.28)", borderRadius: 4, background: "rgba(45,212,191,0.06)", color: "#2dd4bf", padding: "3px 9px", fontSize: 10, letterSpacing: "0.06em", cursor: "pointer" }} onClick={fn}>{label}</button>
                  ))}
                </div>
              </div>
            ))}
            {topFindings.length === 0 ? (
              <div style={{ fontSize: 12, color: "rgba(171,224,255,0.35)", fontStyle: "italic" }}>No AI-SPM findings yet. Run a scan to begin.</div>
            ) : null}
          </div>
        </div>

        {/* Right column: inventory + repos + narrative */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

          {/* Asset inventory */}
          <div style={spmCard}>
            <div style={spmLabel}>AI Asset Inventory</div>
            <div style={{ display: "grid", gap: 6 }}>
              {topAssets.slice(0, 6).map((asset) => (
                <div key={asset.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, padding: "7px 9px", borderRadius: 7, border: "1px solid rgba(99,245,255,0.1)", background: "rgba(4,8,20,0.5)" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: "rgba(232,241,252,0.9)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{asset.name}</div>
                    <div style={{ marginTop: 2, fontSize: 10, color: "rgba(99,245,255,0.4)", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{asset.files?.[0] || asset.repo}</div>
                  </div>
                  <span style={{ alignSelf: "center", fontSize: 9, color: "#2dd4bf", textTransform: "uppercase", letterSpacing: "0.08em" }}>{(asset.type || "").replace(/_/g, " ")}</span>
                </div>
              ))}
              {topAssets.length === 0 ? <div style={{ fontSize: 12, color: "rgba(171,224,255,0.35)", fontStyle: "italic" }}>No AI assets discovered yet.</div> : null}
            </div>
          </div>

          {/* Attack narrative */}
          <div style={spmCard}>
            <div style={spmLabel}>Attack Narrative</div>
            <div style={{ fontSize: 13, color: "rgba(215,235,255,0.85)", lineHeight: 1.6 }}>
              {narrative.summary || "Run an AI-SPM scan to generate an attack narrative."}
            </div>
            {narrative.likely_attack_path ? (
              <div style={{ marginTop: 8, padding: "7px 10px", borderRadius: 7, border: "1px solid rgba(255,61,129,0.22)", background: "rgba(255,61,129,0.07)", color: "#ff3d81", fontSize: 12, lineHeight: 1.45 }}>
                {narrative.likely_attack_path}
              </div>
            ) : null}
            {actionMessage ? (
              <div style={{ marginTop: 8, fontSize: 10, color: "#2dd4bf", letterSpacing: "0.1em", textTransform: "uppercase" }}>{actionMessage}</div>
            ) : null}
          </div>

          {/* Connected repos */}
          <div style={spmCard}>
            <div style={spmLabel}>Connected Sources</div>
            <Suspense fallback={<div style={{ padding: 16, fontSize: 12, color: "rgba(234,247,255,0.46)" }}>Loading connectors…</div>}>
              <ConnectorOnboardingWizard
                connectors={{
                  github: githubConnector,
                  aws: aiSpmState?.awsConnector,
                  okta: aiSpmState?.oktaConnector,
                  snyk: aiSpmState?.snykConnector,
                  azuread: aiSpmState?.azureadConnector,
                  virustotal: aiSpmState?.virustotalConnector,
                  elastic: aiSpmState?.elasticConnector,
                }}
                messages={{
                  github: aiSpmState?.githubMessage,
                  aws: aiSpmState?.awsMessage,
                  okta: aiSpmState?.oktaMessage,
                  snyk: aiSpmState?.snykMessage,
                  azuread: aiSpmState?.azureadMessage,
                  virustotal: aiSpmState?.virustotalMessage,
                  elastic: aiSpmState?.elasticMessage,
                }}
                scanResults={{
                  okta: aiSpmState?.oktaScanResult,
                  snyk: aiSpmState?.snykScanResult,
                  azuread: aiSpmState?.azureadScanResult,
                  virustotal: aiSpmState?.virustotalScanResult,
                  elastic: aiSpmState?.elasticScanResult,
                }}
                connectGithubWithToken={connectGithubWithToken}
                connectAws={connectAws}
                connectOkta={connectOkta}
                connectSnyk={connectSnyk}
                connectAzureAd={connectAzureAd}
                connectVirusTotal={connectVirusTotal}
                connectElastic={connectElastic}
                testConnector={testConnector}
                runFirstScan={runConnectorFirstScan}
              />
              <GitHubConnectorPanel
                key={githubConnector?.updated_at || githubConnector?.username || "github-connector"}
                connector={githubConnector}
                repositories={githubRepositories}
                device={aiSpmState?.githubDevice}
                message={aiSpmState?.githubMessage}
                connectGithubWithToken={connectGithubWithToken}
                startGithubDeviceAuth={startGithubDeviceAuth}
                pollGithubDeviceAuth={pollGithubDeviceAuth}
                loadGithubRepositories={loadGithubRepositories}
                saveGithubRepositories={saveGithubRepositories}
                disconnectGithub={disconnectGithub}
                scanGithub={scanGithub}
              />
              <AwsConnectorPanel
                connector={aiSpmState?.awsConnector}
                connectAws={connectAws}
                disconnectAws={disconnectAws}
                message={aiSpmState?.awsMessage}
              />
              <OktaConnectorPanel
                connector={aiSpmState?.oktaConnector}
                connectOkta={connectOkta}
                disconnectOkta={disconnectOkta}
                scanOkta={scanOkta}
                message={aiSpmState?.oktaMessage}
                scanResult={aiSpmState?.oktaScanResult}
              />
              <SnykConnectorPanel
                connector={aiSpmState?.snykConnector}
                connectSnyk={connectSnyk}
                disconnectSnyk={disconnectSnyk}
                scanSnyk={scanSnyk}
                message={aiSpmState?.snykMessage}
                scanResult={aiSpmState?.snykScanResult}
              />
              <AzureAdConnectorPanel
                connector={aiSpmState?.azureadConnector}
                connectAzureAd={connectAzureAd}
                disconnectAzureAd={disconnectAzureAd}
                scanAzureAd={scanAzureAd}
                message={aiSpmState?.azureadMessage}
                scanResult={aiSpmState?.azureadScanResult}
              />
              <VirusTotalConnectorPanel
                connector={aiSpmState?.virustotalConnector}
                connectVirusTotal={connectVirusTotal}
                disconnectVirusTotal={disconnectVirusTotal}
                enrichIocs={enrichIocs}
                message={aiSpmState?.virustotalMessage}
                scanResult={aiSpmState?.virustotalScanResult}
              />
              <ElasticConnectorPanel
                connector={aiSpmState?.elasticConnector}
                connectElastic={connectElastic}
                disconnectElastic={disconnectElastic}
                scanElastic={scanElastic}
                message={aiSpmState?.elasticMessage}
                scanResult={aiSpmState?.elasticScanResult}
              />
            </Suspense>
            {repos.length > 0 && (
              <div style={{ display: "grid", gap: 5, marginTop: 8 }}>
                {repos.slice(0, 4).map((repo, i) => (
                  <div key={repo.repo || i} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, fontSize: 11 }}>
                    <span style={{ color: "rgba(215,235,255,0.75)", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis" }}>{repo.repo}</span>
                    <span style={{ color: "#2dd4bf" }}>{repo.files_scanned}f</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sandbox evidence */}
          {sandbox ? (
            <div style={{ ...spmCard, borderColor: "rgba(99,245,255,0.2)" }}>
              <div style={{ ...spmLabel, color: "rgba(99,245,255,0.6)" }}>Evidence Sandbox</div>
              <div style={{ fontSize: 12, color: "rgba(215,235,255,0.8)", lineHeight: 1.45, marginBottom: 6 }}>{sandbox.note}</div>
              {(sandbox.evidence || []).slice(0, 3).map((item, index) => (
                <div key={`${item.path}-${index}`} style={{ marginTop: 5, fontSize: 11, color: "rgba(215,235,255,0.65)", lineHeight: 1.45 }}>
                  <span style={{ color: "#2dd4bf", fontFamily: "monospace" }}>{item.path}:{item.line || 1}</span>
                  <span style={{ color: "rgba(171,224,255,0.5)" }}> — {item.snippet || item.signal}</span>
                </div>
              ))}
            </div>
          ) : null}

          {/* Recommended actions */}
          {narrative.recommended_actions?.length ? (
            <div style={spmCard}>
              <div style={spmLabel}>Recommended Actions</div>
              <div style={{ display: "grid", gap: 5 }}>
                {narrative.recommended_actions.slice(0, 5).map((action, i) => (
                  <div key={`action-${i}`} style={{ fontSize: 12, color: "rgba(215,235,255,0.75)", padding: "5px 0", borderBottom: "1px solid rgba(45,212,191,0.08)", display: "flex", gap: 7 }}>
                    <span style={{ color: "#2dd4bf", flexShrink: 0 }}>›</span>
                    <span>{action}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function PanelVisualStage({
  panelId,
  accent,
  title,
  sources = [],
  reviewItems = [],
  vectors = [],
  events = [],
  incidents = [],
  logs = [],
  processes = [],
  connections = [],
  disks = [],
  files = [],
  blockedIps = [],
  riskScore = 0,
  memoryPercent = 0,
  liveLoad = 0,
  approvals = [],
  aiSpmSummary = {},
  aiSpmFindings = [],
  motion = true,
}) {
  const liveSources = sources.filter((source) => source.status === "live").length;
  const stageValue = panelId === "ai-spm"
    ? aiSpmSummary.asset_count ?? 0
    : panelId === "network"
    ? connections.length
    : panelId === "system-health"
    ? `${memoryPercent}%`
    : panelId === "incident-feed"
    ? incidents.length
    : panelId === "live-logs"
    ? logs.length
    : panelId === "quarantine"
    ? files.length
    : panelId === "threat-overview"
    ? riskScore
    : panelId === "threat-vectors"
    ? vectors.length
    : panelId === "threat-timeline"
    ? events.length
    : panelId === "blocked-ips"
    ? blockedIps.length
    : panelId === "aria-center"
    ? approvals.length
    : panelId === "trust-ladder"
    ? approvals.length
    : `${liveSources}/${sources.length || 0}`;
  const stageLabel = panelId === "ai-spm"
    ? "AI assets"
    : panelId === "network"
    ? "live sockets"
    : panelId === "system-health"
    ? "memory pressure"
    : panelId === "incident-feed"
    ? "review items"
    : panelId === "live-logs"
    ? "log events"
    : panelId === "quarantine"
    ? "quarantined files"
    : panelId === "threat-overview"
    ? "risk score"
    : panelId === "threat-vectors"
    ? "threat vectors"
    : panelId === "threat-timeline"
    ? "timeline events"
    : panelId === "blocked-ips"
    ? "blocked threats"
    : panelId === "aria-center"
    ? "pending approvals"
    : panelId === "trust-ladder"
    ? "governed approvals"
    : "sources live";

  const visual = {
    overview: <UnifiedPosture sources={sources} reviewItems={reviewItems} />,
    "threat-overview": <PerimeterDefense riskScore={riskScore} />,
    "threat-vectors": <ParticleDiffusionHub vectors={vectors} />,
    "threat-timeline": <EventHorizonTimeline events={events} />,
    "incident-feed": <ChromaticGlitchFeed incidents={incidents} />,
    "live-logs": <VortexLogSink logs={logs} />,
    "system-health": <VolumetricNebula memoryPercent={memoryPercent} liveLoad={liveLoad} processes={processes} disks={disks} />,
    network: <FluidFirewall connections={connections} />,
    bluetooth: <FluidFirewall connections={[]} />,
    "blocked-ips": <TargetLockPerimeter sources={sources} connections={connections} blockedIps={blockedIps} />,
    quarantine: <BioContainmentVault files={files} />,
    "ai-spm": <OrbitalTelemetry aiSpmSummary={aiSpmSummary} findings={aiSpmFindings} />,
    "aria-center": <NeuralNodeWeb sources={sources} approvals={approvals} />,
    "trust-ladder": <NeuralNodeWeb sources={sources} approvals={approvals} />,
  }[panelId] || <MonitoringRadarVisual sources={sources} reviewItems={reviewItems} />;

  return (
    <HolographicStage panelId={panelId} accent={accent} title={title} liveValue={stageValue} liveLabel={stageLabel} motion={motion}>
      {visual}
    </HolographicStage>
  );
}

function PanelControlDeck({
  panelId,
  accent,
  motion,
  setMotion,
  refreshLiveSnapshot,
  runPanelScan,
  loadOverviewReport,
  executeAriaCommand,
  loadAiSpmDashboard,
  generateAiSpmReport,
  openPanelNarration,
  openActionPanel,
  setIncidentFilter,
  processCommand,
}) {
  const panelControls = {
    overview: [
      { label: "Synthesize", run: () => void loadOverviewReport("overview control deck") },
      { label: "Source fabric", run: () => void processCommand("open overview") },
    ],
    "threat-overview": [
      { label: "Risk scan", run: () => void runPanelScan("quick") },
      { label: "Incident report", run: () => void executeAriaCommand("Generate incident report") },
    ],
    "threat-vectors": [
      { label: "Re-map vectors", run: () => void runPanelScan("quick") },
      { label: "Open timeline", run: () => void processCommand("Open threat timeline") },
    ],
    "threat-timeline": [
      { label: "Live logs", run: () => void processCommand("Show live logs") },
      { label: "Incidents", run: () => void processCommand("Incident feed") },
    ],
    "incident-feed": [
      { label: "Critical only", run: () => setIncidentFilter("critical") },
      { label: "All items", run: () => setIncidentFilter("all") },
    ],
    "live-logs": [
      { label: "Refresh stream", run: () => void refreshLiveSnapshot() },
      { label: "Scan now", run: () => void runPanelScan("standard") },
    ],
    "system-health": [
      { label: "System scan", run: () => void runPanelScan("standard") },
      { label: "Network view", run: () => void processCommand("Network connections") },
    ],
    network: [
      { label: "Refresh sockets", run: () => void refreshLiveSnapshot() },
      { label: "Blocklist", run: () => void processCommand("Show blocked IPs") },
    ],
    "blocked-ips": [
      { label: "Review connector", run: () => openActionPanel("Firewall and blocklist connectors are not configured yet.") },
      { label: "Network map", run: () => void processCommand("Network connections") },
    ],
    quarantine: [
      { label: "Filesystem scan", run: () => void runPanelScan("deep") },
      { label: "Report", run: () => void executeAriaCommand("Generate incident report") },
    ],
    "aria-center": [
      { label: "Command console", run: () => openActionPanel("Aria command console is ready.") },
      { label: "Generate report", run: () => void executeAriaCommand("Generate incident report") },
    ],
  };

  return (
    <div className="panelControlDeck" style={{ "--accent": accent }} data-testid={`aria-controls-${panelId}`}>
      <button className="controlButton primary" onClick={() => void refreshLiveSnapshot()}>Refresh Live</button>
      <button
        className="controlButton"
        onClick={() => {
          if (panelId === "bluetooth") window.dispatchEvent(new CustomEvent("aria:bluetooth-scan"));
          else if (panelId === "ai-spm") void loadAiSpmDashboard(true);
          else void runPanelScan("standard");
        }}
      >
        {panelId === "ai-spm" ? "Scan Repos" : panelId === "bluetooth" ? "BLE Sweep" : "Run Scan"}
      </button>
      <button className="controlButton" onClick={() => void openPanelNarration?.()}>Narration</button>
      <button className="controlButton" onClick={() => panelId === "ai-spm" ? void generateAiSpmReport() : void executeAriaCommand("Generate incident report")}>Report</button>
      <button className={`controlToggle ${motion ? "enabled" : ""}`} onClick={() => setMotion((value) => !value)}>
        {motion ? "Motion On" : "Focus Mode"}
      </button>
      {(panelControls[panelId] || []).map((control) => (
        <button key={control.label} className="controlButton local" onClick={control.run}>{control.label}</button>
      ))}
    </div>
  );
}

// ── Horizontal sector / panel navigation bar ────────────────────────────────
// Each panel's backdrop is a seamless loop stitched from TWO clips that
// cross-dissolve into each other so the loop never visibly repeats. Values are
// [clipA, clipB] basenames under /landing/media/panels. Order matters only for
// which clip shows first; the crossfade then alternates them forever.
const BACKDROP_CLIPS = {
  overview: ["overview", "net"],
  threat:   ["threat", "threat-b"],   // second clip = attached kling render
  timeline: ["timeline", "overview"],
  identity: ["command", "identity"],  // swapped round
  net:      ["net-intro", "net"],   // new kling intro plays first, dissolves into net
  "ai-spm": ["ai-spm", "identity"],
  command:  ["ai-spm", "command"],    // swapped round
  response: ["response", "timeline"],
};

const H_NAV_ITEMS = [
  { id: "overview",  label: "Overview",         icon: "grid",    subs: ["POSTURE", "RISK"],      accent: "#9fe7ff", type: "panel",  targetId: "overview"      },
  { id: "threat",    label: "Threat Intel",      icon: "shield",  subs: ["VECTORS", "PERIMETER"], accent: "#63f5ff", type: "sector", targetId: "threat"        },
  { id: "timeline",  label: "Timeline",          icon: "chart",   subs: ["EVENTS", "INCIDENTS"],  accent: "#ffc857", type: "panel",  targetId: "threat-timeline"},
  { id: "identity",  label: "Identity & Access", icon: "users",   subs: ["ITDR", "UEBA"],         accent: "#38bdf8", type: "sector", targetId: "identity"      },
  { id: "net",       label: "Network",           icon: "globe",   subs: ["TOPOLOGY", "FIREWALL"], accent: "#1687ff", type: "sector", targetId: "net"           },
  { id: "ai-spm",    label: "AI-SPM",            icon: "chip",    subs: ["ASSETS", "FINDINGS"],   accent: "#2dd4bf", type: "panel",  targetId: "ai-spm"        },
  { id: "command",   label: "Command",           icon: "circuit", subs: ["DECISIONS", "ENGINE"],  accent: "#a78bfa", type: "sector", targetId: "command"       },
  { id: "response",  label: "Response",          icon: "doc",     subs: ["POLICY", "QUARANTINE"], accent: "#ff3d81", type: "sector", targetId: "response"      },
];

const H_NAV_ICONS = {
  grid: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{width:22,height:22}}>
      <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
    </svg>
  ),
  shield: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{width:22,height:22}}>
      <path d="M12 2L4 6v5c0 5.5 3.8 10.7 8 12 4.2-1.3 8-6.5 8-12V6L12 2z"/>
      <polyline points="9,12 11,14 15,10"/>
    </svg>
  ),
  chart: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{width:22,height:22}}>
      <polyline points="2,20 6,11 10,15 14,8 18,13 22,5"/>
    </svg>
  ),
  users: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{width:22,height:22}}>
      <path d="M17 20v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 20v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  ),
  globe: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{width:22,height:22}}>
      <circle cx="12" cy="12" r="10"/>
      <line x1="2" y1="12" x2="22" y2="12"/>
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10A15.3 15.3 0 0 1 12 2z"/>
    </svg>
  ),
  chip: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{width:22,height:22}}>
      <rect x="7" y="7" width="10" height="10" rx="1"/>
      <path d="M7 9H4M7 12H4M7 15H4M17 9h3M17 12h3M17 15h3M9 7V4M12 7V4M15 7V4M9 17v3M12 17v3M15 17v3"/>
    </svg>
  ),
  circuit: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{width:22,height:22}}>
      <rect x="8" y="8" width="8" height="8" rx="2"/>
      <path d="M8 12H4M16 12h4M12 8V4M12 16v4M6 6l2 2M18 6l-2 2M6 18l2-2M18 18l-2-2"/>
    </svg>
  ),
  doc: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{width:22,height:22}}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8L14 2z"/>
      <polyline points="14,2 14,8 20,8"/>
      <line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/>
    </svg>
  ),
};

function HorizontalSectorNav({ visible, activeSector, activeDashPanel, onSectorClick, onPanelClick }) {
  const [hovered, setHovered] = useState(null);
  return (
    <div style={{
      position: "fixed",
      top: 0, left: 0, right: 0,
      zIndex: 6,
      display: "flex",
      pointerEvents: visible ? "auto" : "none",
      opacity: visible ? 1 : 0,
      transition: "opacity 0.38s ease",
      background: "rgba(4,6,18,0.94)",
      backdropFilter: "blur(16px)",
      borderBottom: "1px solid rgba(99,245,255,0.1)",
      fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
      boxShadow: "0 4px 32px rgba(0,0,0,0.52)",
    }}>
      {H_NAV_ITEMS.map((item, i) => {
        const active = item.type === "sector" ? activeSector === item.targetId : activeDashPanel === item.targetId;
        const hot = hovered === item.id;
        return (
          <button
            key={item.id}
            onMouseEnter={() => setHovered(item.id)}
            onMouseLeave={() => setHovered(null)}
            onClick={() => item.type === "sector" ? onSectorClick(item.targetId) : onPanelClick(item.targetId)}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              gap: 5,
              padding: "14px 18px 16px",
              background: active ? hexToRgba(item.accent, 0.07) : hot ? "rgba(234,247,255,0.028)" : "transparent",
              border: "none",
              borderLeft: i > 0 ? "1px solid rgba(234,247,255,0.07)" : "none",
              borderBottom: active ? `2px solid ${item.accent}` : "2px solid transparent",
              cursor: "pointer",
              textAlign: "left",
              transition: "background 0.15s",
            }}
          >
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: item.accent, boxShadow: `0 0 8px ${item.accent}80`, flexShrink: 0 }} />
            <div style={{ color: active ? item.accent : hot ? "rgba(234,247,255,0.85)" : "rgba(234,247,255,0.55)", transition: "color 0.15s" }}>
              {H_NAV_ICONS[item.icon]}
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: active ? item.accent : "rgba(234,247,255,0.88)", letterSpacing: "0.02em", lineHeight: 1.2, whiteSpace: "nowrap" }}>
              {item.label}
            </div>
            <div style={{ fontSize: 9, color: "rgba(173,217,255,0.4)", letterSpacing: "0.18em" }}>
              {item.subs.join(" · ")}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function useSseStream(url, onData) {
  const onDataRef = useRef(onData);
  useEffect(() => { onDataRef.current = onData; });
  useEffect(() => {
    if (!url) return;
    let es;
    let retryTimer;
    const connect = () => {
      es = new EventSource(url);
      es.onmessage = (e) => { try { onDataRef.current(JSON.parse(e.data)); } catch { /* ignore malformed SSE frame */ } };
      es.onerror = () => { es.close(); retryTimer = setTimeout(connect, 5000); };
    };
    connect();
    return () => { es?.close(); clearTimeout(retryTimer); };
  }, [url]);
}

export default function OrbitalSoundVisualizer({ onLogout } = {}) {
  const mountRef = useRef(null);
  const pointerRef = useRef({ x: 0, y: 0 });

  const [serverOnline, setServerOnline] = useState(true);
  const [status, setStatus] = useState("Silent Mode");
  const [statusType, setStatusType] = useState("silent");
  const [commandText, setCommandText] = useState("");
  const [commandDockAwake, setCommandDockAwake] = useState(true);
  const [commandDockFocused, setCommandDockFocused] = useState(false);
  const [commandDockVisible, setCommandDockVisible] = useState(false);
  const [panelVisible, setPanelVisible] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [toastHistory, setToastHistory] = useState([]);
  const addToast = useCallback((message, type = "info", title = "ARIA") => {
    if (demoActiveRef.current) return;
    setToasts(prev => {
      if (prev.some(t => t.title === title && t.type === type)) return prev;
      const id = `${Date.now()}-${Math.random()}`;
      return [...prev.slice(-2), { id, message, type, title }];
    });
  }, []);
  const [, setPanelPrompt] = useState(
    "What would you like Aria to do?"
  );
  const [pendingTask, setPendingTask] = useState("");
  const [currentTask, setCurrentTask] = useState("");
  const [panelPhase, setPanelPhase] = useState("monitoring");
  const [panelOptions, setPanelOptions] = useState([
    "Run a quick scan",
    "Contain suspicious threats",
    "Generate incident report",
  ]);
  const [autonomyMode, setAutonomyMode] = useState("confirm");
  const [approvalQueue, setApprovalQueue] = useState([]);
  const [operationalLoop, setOperationalLoop] = useState(null);
  const [, setMemoryPreview] = useState("");
  const [, setProactiveNotice] = useState(null);
  const [overviewReport, setOverviewReport] = useState(null);
  const [aiSpmState, setAiSpmState] = useState({
    inventory: null,
    summary: null,
    findings: [],
    narrative: null,
    sandbox: null,
    report: null,
    narrativeOverlay: false,
    githubConnector: null,
    githubRepositories: [],
    githubDevice: null,
    awsConnector: null,
    oktaConnector: null,
    snykConnector: null,
    azureadConnector: null,
    virustotalConnector: null,
    elasticConnector: null,
    githubMessage: "",
    awsMessage: "",
    oktaMessage: "",
    snykMessage: "",
    azureadMessage: "",
    virustotalMessage: "",
    elasticMessage: "",
    oktaScanResult: null,
    snykScanResult: null,
    azureadScanResult: null,
    virustotalScanResult: null,
    elasticScanResult: null,
    demoMode: AI_SPM_DEMO_DEFAULT,
    scanProgress: createAiSpmScanProgress(),
    loading: false,
  });
  const [securityAdminState, setSecurityAdminState] = useState({
    tenantContext: null,
    authDenials: [],
    quotaStatus: null,
    complianceStatus: null,
    loading: false,
    dataUnavailable: false,
    authHeaders: {},
    actionEndpoints: {},
  });
  const [identitySessionsState, setIdentitySessionsState] = useState({
    sessions: [], identityCard: null, loading: false, error: null,
  });
  const [policyChangeState, setPolicyChangeState] = useState({
    policies: [],
    history: [],
    loading: false,
    error: null,
  });
  const [agentStatus, setAgentStatus] = useState("offline");
  const [threatLevel, setThreatLevel] = useState("UNKNOWN");
  const [incidentCount24h, setIncidentCount24h] = useState(0);
  const [liveFeed, setLiveFeed] = useState([]);
  const [livePanelData, setLivePanelData] = useState(null);
  const [processActionState, setProcessActionState] = useState(null);
  const [panelActionState, setPanelActionState] = useState({ status: "idle", message: "" });
  const [scanHistory, setScanHistory] = useState([]);
  const [monitoringContext, setMonitoringContext] = useState({});
  const [, setLastUpdated] = useState(null);
  // Telemetry link health: true once /api/live has ever succeeded and the most
  // recent poll succeeded; false while a poll is failing (drives the
  // "telemetry reconnecting…" chip). Starts null = never connected yet.
  const [telemetryOnline, setTelemetryOnline] = useState(null);

  // SSE supplementary stream — merges real-time pushes with the existing polling.
  const sseUrl = `${ARIA_API_BASE}/api/live/stream`;
  useSseStream(sseUrl, useCallback((data) => {
    if (data?.snapshot) {
      setLivePanelData(prev => ({ ...prev, ...data.snapshot }));
      setLastUpdated(Date.now());
    }
  }, []));

  const [, setLastToolResults] = useState([]);
  const [activeDashPanel, setActiveDashPanel] = useState(null);
  const [travelTargetPanelId, setTravelTargetPanelId] = useState(null);
  const [incidentFilter, setIncidentFilter] = useState("all");
  const [dashVisible, setDashVisible] = useState(false);
  const [ariaInput, setAriaInput] = useState("");
  const [ariaState, setAriaState] = useState("idle");
  const [fetchError, setFetchError] = useState(null);
  const [lastTranscript, setLastTranscript] = useState("");
  const [panelMotion, setPanelMotion] = useState(true);
  const [, setAriaMini] = useState(false);
  const [demoActive, setDemoActive] = useState(false);
  const [demoPaused, setDemoPaused] = useState(false);
  const [demoChapter, setDemoChapter] = useState(0);
  const [demoNarrationState, setDemoNarrationState] = useState("ready");
  const demoActiveRef = useRef(false);
  const demoTimerRef = useRef(null);
  const demoPausedRef = useRef(false);
  const demoRunIdRef = useRef(0);
  const runChapterRef = useRef(0);
  const demoNarrationPlayingRef = useRef(false);
  // Index into demoSpeechTimings.lines for the next speak() call — advances one
  // per call, reset to the target chapter's first line whenever the demo starts
  // or jumps so the recorded narration's currentTime stays the source of truth.
  const demoLineIndexRef = useRef(0);
  // narrateCtxRef is unused by the ElevenLabs TTS path (kept null); the ported
  // demo runner guards on it, so a null ref makes waitForAudioDrain a no-op and
  // pacing falls through to awaiting ariaTTS() completion.
  const narrateCtxRef = useRef(null);
  const demoAudioRef = useRef(null);
  const demoBackingAudioRef = useRef(null);
  // Default to Gemini: that's the model actually powering narration/copilot on
  // this install (no Anthropic key configured) — Cloud (Opus) is still
  // selectable but reports its key as unavailable rather than silently using
  // Gemini behind the operator's back.
  const [modelMode, setModelMode] = useState("gemini");
  const modelModeRef = useRef("gemini");
  useEffect(() => { modelModeRef.current = modelMode; }, [modelMode]);
  const processCommandRef = useRef(null);
  const commandTextRef = useRef("");
  const commandDockFocusedRef = useRef(false);
  const commandDockIdleTimerRef = useRef(null);
  const galaxyIntentRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const travelRef = useRef({ active: false, nodes: [], lines: [], returning: false, startTime: 0, duration: 2500, curve: null, targetPanel: null });
  const travelTimerRef = useRef(null);
  const disposedRef = useRef(false);
  const taskTimerRef = useRef(null);
  const wasActingRef = useRef(false);
  // When the operator deliberately opens the full Command Center we PIN it open:
  // transient "Aria acting" auto-dismiss (the 4.5s timer + the complete-phase
  // effect) must NOT close a console the user is actively working in.
  const commandCenterPinnedRef = useRef(false);
  const ariaStateRef = useRef("idle");
  const livePanelDataRef = useRef(null);
  const monitoringContextRef = useRef({});
  const monitoringPreviousRef = useRef({ snapshot: null, context: {} });
  const monitoringAlertBufferRef = useRef(createMonitoringAlertBuffer({ cooldownMs: 5 * 60 * 1000 }));
  const threatLevelRef = useRef("UNKNOWN");
  const activeDashPanelRef = useRef(null);
  const wheelTravelRef = useRef({ lastAt: 0, accumulator: 0 });
  const panelNodesRef = useRef([]);
  const sectorNodesRef = useRef([]);
  const clusterOrbitAngleRef = useRef(0);
  const [activeSector, setActiveSector] = useState(null);
  const activeSectorRef = useRef(null);
  const hoveredPanelIdRef = useRef(null);
  const psAutoFadeTimer = useRef(null);
  const [voiceAlertsEnabled, setVoiceAlertsEnabled] = useState(false);
  const [silentMode, setSilentMode] = useState(() => localStorage.getItem("aria-silent-mode") === "true");
  // Full Audio Mode: off the main overview, ARIA stays a spoken, conversational SOC
  // agent — every copilot answer is spoken aloud, not just shown as text.
  const [fullAudioMode, setFullAudioMode] = useState(() => localStorage.getItem("aria-full-audio-mode") === "true");
  const fullAudioModeRef = useRef(localStorage.getItem("aria-full-audio-mode") === "true");

  // Voice Chat: global mic-listening toggle for true two-way realtime voice —
  // speaking over Aria barges in immediately (off = text-only interrupt, as before).
  const [voiceChatEnabled, setVoiceChatEnabled] = useState(() => localStorage.getItem("aria-voice-chat") === "true");
  const voiceChatEnabledRef = useRef(localStorage.getItem("aria-voice-chat") === "true");
  const [voiceListening, setVoiceListening] = useState(false);
  const speechRecognitionRef = useRef(null);
  const voiceUtteranceInterruptedRef = useRef(false);
  const voiceRestartTimerRef = useRef(null);
  // ── Aria Blocklist (GET /api/blocked-ips) ────────────────────────────────────
  const [ariaBlockedIps, setAriaBlockedIps] = useState([]);
  const [ariaBlockedLoading, setAriaBlockedLoading] = useState(false);
  const [ariaBlockedMessage, setAriaBlockedMessage] = useState("");
  const silentModeRef = useRef(localStorage.getItem("aria-silent-mode") === "true");
  const [ariaLiveLine, setAriaLiveLine] = useState("");
  const [narrateOverlayOpen, setNarrateOverlayOpen] = useState(false);
  const narrateOverlayOpenRef = useRef(false);
  // Structured intelligence brief shown in the narration orb (June-1 setup):
  // { status, title, summary, likely_attack_path, blast_radius, recommended_actions }
  const [narrateNarrative, setNarrateNarrative] = useState(null);
  const voiceAlertsEnabledRef = useRef(false);
  const voiceAlertHistoryRef = useRef({ key: "", at: 0 });
  const speakARIARealtimeRef = useRef(null);
  const realtimeVoiceLevelRef = useRef(0);
  const realtimeLastAudioAtRef = useRef(0);
  const liveCommandTranscriptRef = useRef({ text: "", time: 0 });
  const realtimePlatformContextRef = useRef({});

  // ElevenLabs live narration session
  const [narrateLive, setNarrateLive] = useState(false);
  const narrateLiveRef = useRef(false);
  const narrateAudioRef = useRef(null);
  const narrateObjectUrlRef = useRef(null);
  const narrateAbortRef = useRef(null);
  const narratePlayTimeRef = useRef(0);
  const narratePendingResolversRef = useRef([]);
  const demoSpeechAudioRef = useRef(null);

  const audioRef = useRef({
    audioContext: null,
    analyser: null,
    frequencyData: null,
    previousFrequencyData: null,
    timeData: null,
    source: null,
    stream: null,

    demoMode: false,
    mode: "silent",

    audioLevel: 0,
    bassLevel: 0,
    midLevel: 0,
    trebleLevel: 0,

    voiceLevel: 0,
    voicePlosive: 0,
    voiceBody: 0,
    voiceClarity: 0,
    voiceSibilance: 0,

    smoothedAudio: 0,
    smoothedBass: 0,
    smoothedMid: 0,
    smoothedTreble: 0,

    smoothedVoice: 0,
    smoothedVoicePlosive: 0,
    smoothedVoiceBody: 0,
    smoothedVoiceClarity: 0,
    smoothedVoiceSibilance: 0,

    vadScore: 0,
    smoothedVad: 0,
    isSpeaking: false,
    noiseFloor: 0.025,
    lastVoiceTime: 0,
    speechStartedAt: 0,

    syllablePulse: 0,
    smoothedSyllablePulse: 0,
    syllableEnvelope: 0,
    previousSyllableEnvelope: 0,
    syllableHistory: [],
    lastSyllableTime: 0,
    syllableCount: 0,

    spectralFlux: 0,
    plosiveRise: 0,
    previousPlosive: 0,
  });

  const updateStatus = useCallback((text, type) => {
    setStatus(text);
    setStatusType(type);
  }, []);

  const closeActionPanel = useCallback(() => {
    commandCenterPinnedRef.current = false;
    setPanelVisible(false);
    setPanelPhase("monitoring");
    setCurrentTask("");
    setPendingTask("");
    setLastToolResults([]);
    setPanelPrompt("What would you like Aria to do?");
    if (audioRef.current.mode !== "silent") {
      updateStatus("Monitoring Mode", "listening");
    } else {
      updateStatus("Silent Mode", "silent");
    }
  }, [updateStatus]);

  const pushLiveFeed = useCallback((line) => {
    if (!line) return;
    setLiveFeed((prev) => [line, ...prev].slice(0, 6));
  }, []);

  const terminateProcess = useCallback(async (process, signal = "SIGTERM") => {
    if (!process?.pid) return;
    const label = process.name || process.command || `PID ${process.pid}`;
    setProcessActionState({ status: "running", message: `${signal} requested for ${label} (${process.pid})...` });
    try {
      const data = await apiJson("/api/system/process/kill", {
        method: "POST",
        signal: AbortSignal.timeout(45_000),
        body: JSON.stringify({
          pid: process.pid,
          signal,
          name: process.name,
          command: process.command,
        }),
      });
      if (data?.snapshot) {
        setLivePanelData(data.snapshot);
      }
      const execution = data?.execution || {};
      const alive = execution.verification?.observedState === "process-alive";
      const ok = execution.outcome === "success";
      const message = ok
        ? `${signal} verified for ${label} (${process.pid}). Process terminated.`
        : alive && signal === "SIGTERM"
          ? `${label} (${process.pid}) ignored SIGTERM — use KILL -9 to force-terminate.`
          : `${signal} sent to ${label} (${process.pid}); state: ${execution.verification?.observedState || execution.outcome || "unknown"}.`;
      setProcessActionState({ status: ok ? "success" : "warning", message });
      pushLiveFeed(message);
      addToast(message, ok ? "success" : "warning", ok ? "PROCESS TERMINATED" : "PROCESS CHECK");
    } catch (error) {
      const message = `Process action failed for ${label} (${process.pid}): ${error.message}`;
      setProcessActionState({ status: "error", message });
      pushLiveFeed(message);
      addToast(message, "warning", "PROCESS ACTION FAILED");
    }
  }, [addToast, pushLiveFeed]);

  const emitOperatorAlert = useCallback((candidate, fallbackType = "warning", options = {}) => {
    const line = voiceAlertLineFromCandidate(candidate);
    if (!line) return false;

    const key = alertCandidateKey(candidate) || normalizeIntentText(line);
    const now = Date.now();
    const previous = voiceAlertHistoryRef.current;
    if (previous.key === key && now - previous.at < VOICE_ALERT_COOLDOWN_MS) return false;
    voiceAlertHistoryRef.current = { key, at: now };

    const severity = String(candidate?.severity || candidate?.level || fallbackType).toLowerCase();
    const type = severity === "critical" || severity === "error" ? "error" : severity === "high" || severity === "warning" ? "warning" : "info";
    if (options.visual !== false) addToast(line, type, "VOICE ALERT");

    if (!voiceAlertsEnabledRef.current || demoActiveRef.current) return true;

    void speakARIARealtimeRef.current?.(line);
    return true;
  }, [addToast]);

  const loadPanelSuggestions = useCallback(async () => {
    try {
      const data = await apiJson("/api/aria/suggestions");
      const commands = data?.suggestions?.[0]?.commands || data?.commands;

      if (Array.isArray(commands) && commands.length > 0) {
        setPanelOptions(commands.slice(0, 3));
      }
    } catch (error) {
      console.warn("[Aria] suggestion fallback:", error);
      setPanelOptions(["Run a quick scan", "Contain suspicious threats", "Generate incident report"]);
    }
  }, []);

  const executeAriaCommand = useCallback(
    async (text, confirmed = true) => {
      const command = (text || "").trim();
      if (!command) return;

      if (taskTimerRef.current) {
        clearTimeout(taskTimerRef.current);
        taskTimerRef.current = null;
      }

      if (!demoActiveRef.current && !commandCenterPinnedRef.current) {
        addToast(command, "info", "EXECUTING");
      } else if (!demoActiveRef.current) {
        setPanelVisible(true);
      }
      setPanelPhase("acting");
      setPendingTask("");
      setCurrentTask(command);
      setLastToolResults([]);
      setPanelPrompt(`Executing: ${command}`);
      updateStatus("Aria Acting", "speaking");

      let result;
      try {
        const data = await apiJson("/api/aria/command", {
          method: "POST",
          signal: AbortSignal.timeout(120_000), // platform reasoning and function calls can be slow
          body: JSON.stringify({ text: command, confirmed, model_mode: modelModeRef.current }),
        });
        result = data?.result;
      } catch (error) {
        console.warn("[Aria] command fallback:", error);
        result = {
          voice_response: `Aariya could not reach the local function server. Command queued locally: ${command}`,
          status: "blocked",
          feed: ["Local Aria API unavailable"],
          tool_results: [],
        };
      }

      const voiceResponse = result?.voice_response || "Task completed.";
      if (Array.isArray(result?.feed)) {
        result.feed.slice(0, 4).forEach((line) => pushLiveFeed(line));
      }
      if (result?.approval) {
        setApprovalQueue((prev) => [result.approval, ...prev.filter((item) => item.id !== result.approval.id)]);
      }
      setLastToolResults(Array.isArray(result?.tool_results) ? result.tool_results.slice(0, 4) : []);

      setPanelPhase("complete");
      setPanelPrompt(voiceResponse);
      if (demoActiveRef.current) {
        void speakARIARealtimeRef.current?.(voiceResponse);
      }
      updateStatus(result?.status === "blocked" ? "Action Blocked" : "Task Complete", "demo");

      // Show a result toast when panel isn't pinned open
      if (!commandCenterPinnedRef.current) {
        const toastType = result?.status === "blocked" ? "warning" : result?.approval ? "warning" : "success";
        const toastTitle = result?.status === "blocked" ? "BLOCKED" : result?.approval ? "APPROVAL NEEDED" : "COMPLETE";
        addToast(voiceResponse, toastType, toastTitle);
      }

      // Only auto-dismiss the transient "acting" toast. If the operator has the
      // full Command Center pinned open, leave it up — they're driving it.
      if (!commandCenterPinnedRef.current) {
        taskTimerRef.current = setTimeout(() => {
          if (panelVisible && !commandCenterPinnedRef.current) closeActionPanel();
          taskTimerRef.current = null;
        }, 4500);
      }
    },
    [addToast, closeActionPanel, panelVisible, pushLiveFeed, updateStatus]
  );

  const openActionPanel = useCallback(
    (prompt) => {
      commandCenterPinnedRef.current = true;
      setPanelVisible(true);
      setPanelPhase("ready");
      setPanelPrompt(
        prompt || "What would you like Aria to do?"
      );
      updateStatus("Panel Ready for Command", "listening");
      void loadPanelSuggestions();
    },
    [loadPanelSuggestions, updateStatus]
  );

  const loadAriaState = useCallback(async () => {
    try {
      const [data, loopData] = await Promise.all([
        apiJson("/api/aria/state"),
        apiJson("/api/aria/operational-loop?limit=20").catch((error) => {
          console.warn("[Aria] operational loop fallback:", error);
          return null;
        }),
      ]);
      const state = data?.state || {};
      setAutonomyMode(state.policy?.mode || "confirm");
      setApprovalQueue(Array.isArray(state.approvals) ? state.approvals : []);
      setMemoryPreview(state.memory?.notes || "");
      if (loopData?.loop) setOperationalLoop(loopData.loop);
    } catch (error) {
      console.warn("[Aria] state fallback:", error);
    }
  }, []);

  const changeAutonomyMode = useCallback(async (mode) => {
    setAutonomyMode(mode);
    try {
      const data = await apiJson("/api/aria/autonomy", {
        method: "POST",
        body: JSON.stringify({
          mode,
          justification: `Local operator changed Aria autonomy mode to ${mode} from the desktop control surface.`,
        }),
      });
      setAutonomyMode(data?.state?.policy?.mode || mode);
      pushLiveFeed(`Autonomy mode set to ${mode}`);
      addToast(`Autonomy mode set to ${mode}`, "success", "CONTROL");
    } catch (error) {
      console.warn("[Aria] autonomy update failed:", error);
      pushLiveFeed("Autonomy update failed");
      addToast(error.message || "Autonomy update failed", "warning", "CONTROL");
    }
  }, [addToast, pushLiveFeed]);

  const resolveApprovalItem = useCallback(async (id, decision) => {
    try {
      const data = await apiJson("/api/aria/approval", {
        method: "POST",
        body: JSON.stringify({ id, decision }),
      });
      const resolution = data?.resolution;
      setApprovalQueue((prev) => prev.filter((item) => item.id !== id));
      if (resolution?.result?.feed) {
        resolution.result.feed.slice(0, 3).forEach((line) => pushLiveFeed(line));
      }
      pushLiveFeed(`Approval ${decision}: ${id}`);
      void loadAriaState();
    } catch (error) {
      console.warn("[Aria] approval failed:", error);
      pushLiveFeed(`Approval ${decision} failed for ${id}`);
    }
  }, [loadAriaState, pushLiveFeed]);

  const observeVisibleScreen = useCallback(async () => {
    try {
      if (demoActiveRef.current) return;    // never interrupt the demo tour
      if (panelVisible || dashVisible) return;
      const content = document.body?.innerText || "";
      const data = await apiJson("/api/aria/observe", {
        method: "POST",
        body: JSON.stringify({ source: "aria-app", content }),
      });
      const observation = data?.observation;
      if (!observation || observation.status === "clear") return;

      if (Array.isArray(observation.feed)) {
        observation.feed.slice(0, 3).forEach((line) => pushLiveFeed(line));
      }
      if (observation.approval) {
        setApprovalQueue((prev) => [observation.approval, ...prev.filter((item) => item.id !== observation.approval.id)]);
      }
      setProactiveNotice(observation);
      const observeMsg = observation.status === "acted"
        ? `Aria acted under ${observation.mode} mode: ${observation.finding?.summary}`
        : `Aria detected a condition requiring review: ${observation.finding?.summary}`;
      const observeType = observation.status === "acted" ? "success" : "warning";
      const observeTitle = observation.status === "acted" ? "ARIA ACTED" : "REVIEW NEEDED";
      addToast(observeMsg, observeType, observeTitle);
      emitOperatorAlert({
        id: observation.id || observation.finding?.id || observeMsg,
        severity: observation.status === "acted" ? "medium" : "high",
        summary: observation.finding?.summary || observeMsg,
      }, observeType, { visual: false });
      setPanelPhase(observation.status === "acted" ? "complete" : "confirm");
      setPanelPrompt(observeMsg);
      void loadAriaState();
    } catch (error) {
      console.warn("[Aria] observation failed:", error);
    }
  }, [dashVisible, emitOperatorAlert, loadAriaState, panelVisible, pushLiveFeed]);

  const loadOverviewReport = useCallback(async (question = "overview") => {
    const result = await ariaFetchWithRetry("POST", "/api/aria/overview", { question });
    if (result.error) {
      console.warn("[Aria] overview failed:", result.error);
      return null;
    }
    const overview = result.data?.overview;
    if (overview) {
      setOverviewReport(overview);
      if (Array.isArray(overview.feed)) {
        overview.feed.slice(0, 3).forEach((line) => pushLiveFeed(line));
      }
    }
    return overview || null;
  }, [pushLiveFeed]);

  const loadGithubConnectorStatus = useCallback(async () => {
    try {
      const data = await apiJson("/api/connectors/github/status");
      setAiSpmState((prev) => ({
        ...prev,
        githubConnector: data.connector || null,
      }));
      return data.connector || null;
    } catch (error) {
      console.warn("[Aria] GitHub connector status failed:", error);
      return null;
    }
  }, []);

  const loadGithubRepositories = useCallback(async () => {
    try {
      const data = await apiJson("/api/connectors/github/repos");
      setAiSpmState((prev) => ({
        ...prev,
        githubConnector: data.connector || prev.githubConnector,
        githubRepositories: data.repositories || [],
        githubMessage: `Loaded ${(data.repositories || []).length} GitHub repositories`,
      }));
      return data.repositories || [];
    } catch (error) {
      console.warn("[Aria] GitHub repo list failed:", error);
      setAiSpmState((prev) => ({ ...prev, githubMessage: "GitHub repository list failed" }));
      return [];
    }
  }, []);

  const connectGithubWithToken = useCallback(async (token, repositoryText = "") => {
    // Special sentinel: import token directly from local gh CLI session
    if (token === "__gh_cli__") {
      setAiSpmState((prev) => ({ ...prev, githubMessage: "Importing gh CLI session…" }));
      try {
        const data = await apiJson("/api/connectors/github/gh-cli", { method: "POST", body: JSON.stringify({}) });
        setAiSpmState((prev) => ({
          ...prev,
          githubConnector: data.connector || null,
          githubDevice: null,
          githubMessage: "GitHub connected via gh CLI",
        }));
        pushLiveFeed("GitHub connected via gh CLI");
        void loadGithubRepositories();
        return data.connector;
      } catch (error) {
        console.warn("[Aria] gh CLI connect failed:", error);
        setAiSpmState((prev) => ({ ...prev, githubMessage: `gh CLI connect failed: ${error.message}` }));
        return null;
      }
    }

    const repositories = repositoryText.split(",").map((repo) => repo.trim()).filter(Boolean);
    try {
      const data = await apiJson("/api/connectors/github/token", {
        method: "POST",
        body: JSON.stringify({ token, repositories }),
      });
      setAiSpmState((prev) => ({
        ...prev,
        githubConnector: data.connector || null,
        githubDevice: null,
        githubMessage: "GitHub connector authorized",
      }));
      pushLiveFeed("GitHub connector authorized");
      void loadGithubRepositories();
      return data.connector;
    } catch (error) {
      console.warn("[Aria] GitHub token connect failed:", error);
      setAiSpmState((prev) => ({ ...prev, githubMessage: "GitHub token authorization failed" }));
      return null;
    }
  }, [loadGithubRepositories, pushLiveFeed]);

  const startGithubDeviceAuth = useCallback(async () => {
    try {
      const data = await apiJson("/api/connectors/github/device/start", {
        method: "POST",
        body: JSON.stringify({}),
      });
      setAiSpmState((prev) => ({
        ...prev,
        githubDevice: data.device || null,
        githubMessage: data.device?.user_code ? `Enter code ${data.device.user_code} on GitHub` : "GitHub device login started",
      }));
      return data.device;
    } catch (error) {
      console.warn("[Aria] GitHub device start failed:", error);
      setAiSpmState((prev) => ({ ...prev, githubMessage: "Set GITHUB_OAUTH_CLIENT_ID to enable GitHub device login" }));
      return null;
    }
  }, []);

  const pollGithubDeviceAuth = useCallback(async (deviceCode) => {
    try {
      const data = await apiJson("/api/connectors/github/device/poll", {
        method: "POST",
        body: JSON.stringify({ device_code: deviceCode }),
      });
      if (data.pending) {
        setAiSpmState((prev) => ({ ...prev, githubMessage: "GitHub authorization is still pending" }));
        return null;
      }
      setAiSpmState((prev) => ({
        ...prev,
        githubConnector: data.connector || null,
        githubDevice: null,
        githubMessage: "GitHub connector authorized",
      }));
      pushLiveFeed("GitHub connector authorized");
      void loadGithubRepositories();
      return data.connector;
    } catch (error) {
      console.warn("[Aria] GitHub device poll failed:", error);
      setAiSpmState((prev) => ({ ...prev, githubMessage: "GitHub authorization check failed" }));
      return null;
    }
  }, [loadGithubRepositories, pushLiveFeed]);

  const saveGithubRepositories = useCallback(async (repositories = []) => {
    try {
      const data = await apiJson("/api/connectors/github/repos", {
        method: "POST",
        body: JSON.stringify({ repositories }),
      });
      setAiSpmState((prev) => ({
        ...prev,
        githubConnector: data.connector || prev.githubConnector,
        githubMessage: `${repositories.length} GitHub repositories selected`,
      }));
      pushLiveFeed("GitHub connector repository selection saved");
      return data.connector;
    } catch (error) {
      console.warn("[Aria] GitHub repo save failed:", error);
      setAiSpmState((prev) => ({ ...prev, githubMessage: "GitHub repository save failed" }));
      return null;
    }
  }, [pushLiveFeed]);

  const disconnectGithub = useCallback(async () => {
    try {
      const data = await apiJson("/api/connectors/github/disconnect", {
        method: "POST",
        body: JSON.stringify({}),
      });
      setAiSpmState((prev) => ({
        ...prev,
        githubConnector: data.connector || null,
        githubRepositories: [],
        githubDevice: null,
        githubMessage: "GitHub connector disconnected",
      }));
      pushLiveFeed("GitHub connector disconnected");
      return data.connector;
    } catch (error) {
      console.warn("[Aria] GitHub disconnect failed:", error);
      setAiSpmState((prev) => ({ ...prev, githubMessage: "GitHub disconnect failed" }));
      return null;
    }
  }, [pushLiveFeed]);

  const scanGithub = useCallback(async () => {
    setAiSpmState((prev) => ({ ...prev, githubMessage: "Scanning GitHub repositories…" }));
    try {
      const data = await apiJson("/api/connectors/github/scan", { signal: AbortSignal.timeout(120_000) });
      const count = data.assets_found ?? 0;
      const repos = (data.repositories || []).map((r) => `${r.repo} (${r.files_scanned} files)`).join(", ");
      setAiSpmState((prev) => ({
        ...prev,
        githubMessage: `Scan complete — ${count} AI assets found across ${data.repositories?.length ?? 0} repos (${repos})`,
      }));
      pushLiveFeed(`GitHub scan: ${count} AI assets found`);
    } catch (error) {
      console.warn("[Aria] GitHub scan failed:", error);
      setAiSpmState((prev) => ({ ...prev, githubMessage: `GitHub scan failed: ${error.message}` }));
    }
  }, [pushLiveFeed]);

  const connectAwsWithCredentials = useCallback(async ({ accessKeyId, secretAccessKey, sessionToken, region }) => {
    setAiSpmState((prev) => ({ ...prev, awsMessage: "Validating AWS credentials…" }));
    try {
      const data = await apiJson("/api/connectors/aws/connect", {
        method: "POST",
        body: JSON.stringify({ accessKeyId, secretAccessKey, sessionToken: sessionToken || undefined, region: region || "us-east-1" }),
      });
      setAiSpmState((prev) => ({
        ...prev,
        awsConnector: data.connector || null,
        awsMessage: data.connector?.message || "AWS connector authorised",
      }));
      pushLiveFeed(`AWS connector authorised — account ${data.connector?.account || "connected"}`);
      return data.connector;
    } catch (error) {
      console.warn("[Aria] AWS connect failed:", error);
      setAiSpmState((prev) => ({ ...prev, awsMessage: `AWS connection failed: ${error.message}` }));
      return null;
    }
  }, [pushLiveFeed]);

  const disconnectAws = useCallback(async () => {
    try {
      const data = await apiJson("/api/connectors/aws/disconnect", { method: "POST", body: JSON.stringify({}) });
      setAiSpmState((prev) => ({
        ...prev,
        awsConnector: data.connector || null,
        awsMessage: "AWS connector disconnected",
      }));
      pushLiveFeed("AWS connector disconnected");
      return data.connector;
    } catch (error) {
      console.warn("[Aria] AWS disconnect failed:", error);
      setAiSpmState((prev) => ({ ...prev, awsMessage: "AWS disconnect failed" }));
      return null;
    }
  }, [pushLiveFeed]);

  // ── Okta connector ────────────────────────────────────────────────────────
  const connectOkta = useCallback(async ({ apiToken, domain }) => {
    setAiSpmState((prev) => ({ ...prev, oktaMessage: "Validating Okta credentials…" }));
    try {
      const data = await apiJson("/api/connectors/okta/connect", { method: "POST", body: JSON.stringify({ apiToken, domain }) });
      setAiSpmState((prev) => ({ ...prev, oktaConnector: data.connector || null, oktaMessage: data.connector?.message || "Okta connected" }));
      pushLiveFeed(`Okta connected — ${domain}`);
      return data.connector;
    } catch (error) {
      setAiSpmState((prev) => ({ ...prev, oktaMessage: `Okta connection failed: ${error.message}` }));
      return null;
    }
  }, [pushLiveFeed]);

  const disconnectOkta = useCallback(async () => {
    try {
      const data = await apiJson("/api/connectors/okta/disconnect", { method: "POST", body: JSON.stringify({}) });
      setAiSpmState((prev) => ({ ...prev, oktaConnector: data.connector || null, oktaScanResult: null, oktaMessage: "Okta disconnected" }));
      pushLiveFeed("Okta connector disconnected");
    } catch (_error) {
      setAiSpmState((prev) => ({ ...prev, oktaMessage: "Okta disconnect failed" }));
    }
  }, [pushLiveFeed]);

  const scanOkta = useCallback(async () => {
    setAiSpmState((prev) => ({ ...prev, oktaMessage: "Scanning Okta…" }));
    try {
      const data = await apiJson("/api/connectors/okta/scan");
      setAiSpmState((prev) => ({ ...prev, oktaScanResult: data, oktaMessage: `Okta scan complete — ${data.findings?.length ?? 0} finding(s)` }));
      return data;
    } catch (error) {
      setAiSpmState((prev) => ({ ...prev, oktaMessage: `Okta scan failed: ${error.message}` }));
      return null;
    }
  }, []);

  // ── Snyk connector ────────────────────────────────────────────────────────
  const connectSnyk = useCallback(async ({ apiToken, orgId }) => {
    setAiSpmState((prev) => ({ ...prev, snykMessage: "Validating Snyk credentials…" }));
    try {
      const data = await apiJson("/api/connectors/snyk/connect", { method: "POST", body: JSON.stringify({ apiToken, orgId }) });
      setAiSpmState((prev) => ({ ...prev, snykConnector: data.connector || null, snykMessage: data.connector?.message || "Snyk connected" }));
      pushLiveFeed("Snyk connected");
      return data.connector;
    } catch (error) {
      setAiSpmState((prev) => ({ ...prev, snykMessage: `Snyk connection failed: ${error.message}` }));
      return null;
    }
  }, [pushLiveFeed]);

  const disconnectSnyk = useCallback(async () => {
    try {
      const data = await apiJson("/api/connectors/snyk/disconnect", { method: "POST", body: JSON.stringify({}) });
      setAiSpmState((prev) => ({ ...prev, snykConnector: data.connector || null, snykScanResult: null, snykMessage: "Snyk disconnected" }));
      pushLiveFeed("Snyk connector disconnected");
    } catch (_error) {
      setAiSpmState((prev) => ({ ...prev, snykMessage: "Snyk disconnect failed" }));
    }
  }, [pushLiveFeed]);

  const scanSnyk = useCallback(async () => {
    setAiSpmState((prev) => ({ ...prev, snykMessage: "Scanning Snyk projects…" }));
    try {
      const data = await apiJson("/api/connectors/snyk/scan");
      setAiSpmState((prev) => ({ ...prev, snykScanResult: data, snykMessage: `Snyk scan complete — ${data.findings?.length ?? 0} finding(s)` }));
      return data;
    } catch (error) {
      setAiSpmState((prev) => ({ ...prev, snykMessage: `Snyk scan failed: ${error.message}` }));
      return null;
    }
  }, []);

  // ── Azure AD connector ────────────────────────────────────────────────────
  const connectAzureAd = useCallback(async ({ clientId, clientSecret, tenantId }) => {
    setAiSpmState((prev) => ({ ...prev, azureadMessage: "Validating Azure AD credentials…" }));
    try {
      const data = await apiJson("/api/connectors/azuread/connect", { method: "POST", body: JSON.stringify({ clientId, clientSecret, tenantId }) });
      setAiSpmState((prev) => ({ ...prev, azureadConnector: data.connector || null, azureadMessage: data.connector?.message || "Azure AD connected" }));
      pushLiveFeed(`Azure AD connected — tenant ${tenantId}`);
      return data.connector;
    } catch (error) {
      setAiSpmState((prev) => ({ ...prev, azureadMessage: `Azure AD connection failed: ${error.message}` }));
      return null;
    }
  }, [pushLiveFeed]);

  const disconnectAzureAd = useCallback(async () => {
    try {
      const data = await apiJson("/api/connectors/azuread/disconnect", { method: "POST", body: JSON.stringify({}) });
      setAiSpmState((prev) => ({ ...prev, azureadConnector: data.connector || null, azureadScanResult: null, azureadMessage: "Azure AD disconnected" }));
      pushLiveFeed("Azure AD connector disconnected");
    } catch (_error) {
      setAiSpmState((prev) => ({ ...prev, azureadMessage: "Azure AD disconnect failed" }));
    }
  }, [pushLiveFeed]);

  const scanAzureAd = useCallback(async () => {
    setAiSpmState((prev) => ({ ...prev, azureadMessage: "Scanning Azure AD…" }));
    try {
      const data = await apiJson("/api/connectors/azuread/scan");
      setAiSpmState((prev) => ({ ...prev, azureadScanResult: data, azureadMessage: `Azure AD scan complete — ${data.findings?.length ?? 0} finding(s)` }));
      return data;
    } catch (error) {
      setAiSpmState((prev) => ({ ...prev, azureadMessage: `Azure AD scan failed: ${error.message}` }));
      return null;
    }
  }, []);

  // ── VirusTotal connector ──────────────────────────────────────────────────
  const connectVirusTotal = useCallback(async ({ apiKey }) => {
    setAiSpmState((prev) => ({ ...prev, virustotalMessage: "Validating VirusTotal API key…" }));
    try {
      const data = await apiJson("/api/connectors/virustotal/connect", { method: "POST", body: JSON.stringify({ apiKey }) });
      setAiSpmState((prev) => ({ ...prev, virustotalConnector: data.connector || null, virustotalMessage: data.connector?.message || "VirusTotal connected" }));
      pushLiveFeed("VirusTotal connected — threat intel enrichment active");
      return data.connector;
    } catch (error) {
      setAiSpmState((prev) => ({ ...prev, virustotalMessage: `VirusTotal connection failed: ${error.message}` }));
      return null;
    }
  }, [pushLiveFeed]);

  const disconnectVirusTotal = useCallback(async () => {
    try {
      const data = await apiJson("/api/connectors/virustotal/disconnect", { method: "POST", body: JSON.stringify({}) });
      setAiSpmState((prev) => ({ ...prev, virustotalConnector: data.connector || null, virustotalScanResult: null, virustotalMessage: "VirusTotal disconnected" }));
      pushLiveFeed("VirusTotal connector disconnected");
    } catch (_error) {
      setAiSpmState((prev) => ({ ...prev, virustotalMessage: "VirusTotal disconnect failed" }));
    }
  }, [pushLiveFeed]);

  const enrichIocs = useCallback(async (iocs) => {
    setAiSpmState((prev) => ({ ...prev, virustotalMessage: `Enriching ${iocs.length} IOC(s)…` }));
    try {
      const data = await apiJson("/api/connectors/virustotal/enrich", { method: "POST", body: JSON.stringify({ iocs }) });
      setAiSpmState((prev) => ({ ...prev, virustotalScanResult: data, virustotalMessage: `Enrichment complete — ${data.findings?.length ?? 0} threat(s) found` }));
      return data;
    } catch (error) {
      setAiSpmState((prev) => ({ ...prev, virustotalMessage: `Enrichment failed: ${error.message}` }));
      return null;
    }
  }, []);

  // ── Elastic connector ─────────────────────────────────────────────────────
  const connectElastic = useCallback(async ({ url, apiKey, kibanaUrl }) => {
    setAiSpmState((prev) => ({ ...prev, elasticMessage: "Connecting to Elastic cluster…" }));
    try {
      const data = await apiJson("/api/connectors/elastic/connect", { method: "POST", body: JSON.stringify({ url, apiKey, kibanaUrl }) });
      setAiSpmState((prev) => ({ ...prev, elasticConnector: data.connector || null, elasticMessage: data.connector?.message || "Elastic connected" }));
      pushLiveFeed(`Elastic connected — ${data.connector?.cluster_name || url}`);
      return data.connector;
    } catch (error) {
      setAiSpmState((prev) => ({ ...prev, elasticMessage: `Elastic connection failed: ${error.message}` }));
      return null;
    }
  }, [pushLiveFeed]);

  const disconnectElastic = useCallback(async () => {
    try {
      const data = await apiJson("/api/connectors/elastic/disconnect", { method: "POST", body: JSON.stringify({}) });
      setAiSpmState((prev) => ({ ...prev, elasticConnector: data.connector || null, elasticScanResult: null, elasticMessage: "Elastic disconnected" }));
      pushLiveFeed("Elastic connector disconnected");
    } catch (_error) {
      setAiSpmState((prev) => ({ ...prev, elasticMessage: "Elastic disconnect failed" }));
    }
  }, [pushLiveFeed]);

  const scanElastic = useCallback(async () => {
    setAiSpmState((prev) => ({ ...prev, elasticMessage: "Scanning Elastic Security…" }));
    try {
      const data = await apiJson("/api/connectors/elastic/scan");
      setAiSpmState((prev) => ({ ...prev, elasticScanResult: data, elasticMessage: `Elastic scan complete — ${data.findings?.length ?? 0} finding(s)` }));
      return data;
    } catch (error) {
      setAiSpmState((prev) => ({ ...prev, elasticMessage: `Elastic scan failed: ${error.message}` }));
      return null;
    }
  }, []);

  const testConnector = useCallback(async (connectorId) => {
    try {
      const data = await apiJson(`/api/connectors/${connectorId}/health`);
      return data;
    } catch (error) {
      return { status: "error", message: error.message };
    }
  }, []);

  const loadSecurityAdmin = useCallback(async () => {
    setSecurityAdminState((prev) => ({ ...prev, loading: true, dataUnavailable: false }));
    try {
      const headers = buildAuthHeaders();
      const authHeaders = { headers };
      const toApi = (path) => `${ARIA_API_BASE}${path}`;
      const actionEndpoints = {
        audit_denials_list: toApi("/api/aria/audit-events?status=denied&limit=40"),
        sessions_list: toApi("/api/aria/sessions"),
        session_revoke_template: toApi("/api/aria/sessions/:id/revoke"),
        session_force_reauth_template: toApi("/api/aria/sessions/:id/force-reauth"),
        policy_update: toApi("/api/aria/config/security"),
        policy_update_method: "POST",
        compliance_status: toApi("/api/aria/compliance/status"),
      };
      const [eventsResult, quotaResult, whoamiResult, complianceResult] = await Promise.allSettled([
        apiJson("/api/aria/audit-events?limit=40&status=denied", authHeaders),
        apiJson("/api/aria/quota-status", authHeaders),
        apiJson("/api/aria/whoami", authHeaders),
        fetch(actionEndpoints.compliance_status, { headers }).then(async (response) => {
          const payload = await response.json().catch(() => ({}));
          return { ok: response.ok, status: response.status, payload };
        }),
      ]);

      const eventsPayload = eventsResult.status === "fulfilled" ? eventsResult.value : null;
      const quotaPayload  = quotaResult.status === "fulfilled"  ? quotaResult.value  : null;
      const whoamiPayload = whoamiResult.status === "fulfilled" ? whoamiResult.value : null;
      const compliancePayload = complianceResult.status === "fulfilled" ? complianceResult.value : null;

      const denials = Array.isArray(eventsPayload?.events) ? eventsPayload.events : [];

      // Prefer server-resolved identity from whoami; fall back to env-var defaults.
      const tenantContext = whoamiPayload
        ? {
            tenant_id:  whoamiPayload.tenant_id,
            user_id:    whoamiPayload.user_id,
            role:       whoamiPayload.role,
            authz_mode: whoamiPayload.authz_mode,
          }
        : {
            tenant_id:  ARIA_TENANT_ID,
            user_id:    ARIA_USER_ID,
            role:       ARIA_ROLE,
            authz_mode: ARIA_AUTHZ_MODE,
          };

      const quotaStatus = quotaPayload?.buckets
        ? { buckets: quotaPayload.buckets.map((b) => ({ name: b.name, status: b.status })) }
        : null;
      const complianceStatus = compliancePayload
        ? compliancePayload.ok
          ? { state: "available", statusCode: compliancePayload.status, data: compliancePayload.payload }
          : compliancePayload.status === 404
          ? { state: "unavailable", statusCode: 404, data: null }
          : { state: "error", statusCode: compliancePayload.status, data: compliancePayload.payload }
        : { state: "unavailable", statusCode: null, data: null };

      setSecurityAdminState((prev) => ({
        ...prev,
        loading: false,
        dataUnavailable: eventsPayload === null,
        authDenials: denials,
        tenantContext,
        quotaStatus,
        complianceStatus,
        authHeaders: headers,
        actionEndpoints,
      }));
    } catch {
      setSecurityAdminState((prev) => ({ ...prev, loading: false, dataUnavailable: true }));
    }
  }, []);

  const loadIdentitySessions = useCallback(async () => {
    setIdentitySessionsState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const authHeaders = { headers: buildAuthHeaders() };
      const data = await apiJson("/api/aria/sessions", authHeaders).catch(() => null);
      const normalizeSession = (session = {}) => {
        const sessionId = session.session_id || session.sid || session.id;
        const userId = session.user_id || session.user || ARIA_USER_ID;
        return {
          ...session,
          session_id: sessionId,
          sid: session.sid || sessionId,
          id: session.id || sessionId,
          tenant_id: session.tenant_id || ARIA_TENANT_ID,
          user_id: userId,
          user: session.user || userId,
          role: session.role || ARIA_ROLE,
          source: session.source || "authz",
          status: session.status || (session.revoked_at ? "revoked" : "active"),
        };
      };
      const apiSessions = Array.isArray(data?.sessions) ? data.sessions.map(normalizeSession) : [];
      const fallbackSessions = data && apiSessions.length === 0
        ? [normalizeSession({
          session_id: `sess-${ARIA_TENANT_ID}-${ARIA_USER_ID}`,
          tenant_id: ARIA_TENANT_ID,
          user_id: ARIA_USER_ID,
          role: ARIA_ROLE,
          source: "header",
          status: "active",
          issued_at: new Date().toISOString(),
          last_seen: new Date().toISOString(),
        })]
        : apiSessions;
      const fallbackIdentity = {
        tenant_id: { value: ARIA_TENANT_ID, source: "header" },
        user_id: { value: ARIA_USER_ID, source: "header" },
        role: { value: ARIA_ROLE, source: "header" },
      };
      setIdentitySessionsState((prev) => ({
        ...prev,
        loading: false,
        sessions: fallbackSessions,
        identityCard: data?.identity || (data ? fallbackIdentity : null),
        error: data ? null : "Sessions endpoint unavailable",
      }));
    } catch (e) {
      setIdentitySessionsState((prev) => ({ ...prev, loading: false, error: e.message }));
    }
  }, []);

  const loadPolicyChanges = useCallback(async () => {
    setPolicyChangeState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const authHeaders = { headers: buildAuthHeaders() };
      const [policiesData, historyData] = await Promise.all([
        apiJson("/api/aria/policy/list", authHeaders),
        apiJson("/api/aria/policy/history?limit=40", authHeaders),
      ]);

      setPolicyChangeState({
        policies: Array.isArray(policiesData?.policies) ? policiesData.policies : [],
        history: Array.isArray(historyData?.history) ? historyData.history : [],
        loading: false,
        error: null,
      });
    } catch (error) {
      setPolicyChangeState((prev) => ({
        ...prev,
        loading: false,
        error: error?.message || "Policy endpoints unavailable",
      }));
    }
  }, []);

  const loadAiSpmDashboard = useCallback(async (forceScan = false, requestedDemoMode = null) => {
    const demoMode = STRICT_PROD_UI ? false : (requestedDemoMode === null ? aiSpmState.demoMode : requestedDemoMode);
    const shouldScan = forceScan || demoMode;
    const scanProgressTimers = [];
    const clearScanProgressTimers = () => {
      while (scanProgressTimers.length) window.clearTimeout(scanProgressTimers.pop());
    };
    setAiSpmState((prev) => ({
      ...prev,
      loading: true,
      scanProgress: shouldScan
        ? createAiSpmScanProgress({ phase: "preparing", percent: 8, message: "Preparing AI-SPM connector scan…" })
        : prev.scanProgress,
    }));

    try {
      const payload = demoMode ? { demo: true } : {};
      let inventory;
      let summary;
      let findings;
      let preflightStatuses = null;

      if (shouldScan) {
        setAiSpmState((prev) => ({
          ...prev,
          scanProgress: createAiSpmScanProgress({ phase: "validating", percent: 18, message: "Validating connected sources…" }),
        }));
        const [githubStatus, awsStatus, oktaStatus, snykStatus, azureadStatus, vtStatus, elasticStatus] = await Promise.all([
          loadGithubConnectorStatus().catch(() => null),
          apiJson("/api/connectors/aws/status").catch(() => null),
          apiJson("/api/connectors/okta/status").catch(() => null),
          apiJson("/api/connectors/snyk/status").catch(() => null),
          apiJson("/api/connectors/azuread/status").catch(() => null),
          apiJson("/api/connectors/virustotal/status").catch(() => null),
          apiJson("/api/connectors/elastic/status").catch(() => null),
        ]);
        preflightStatuses = { githubStatus, awsStatus, oktaStatus, snykStatus, azureadStatus, vtStatus, elasticStatus };
        const connectedTargets = [
          githubStatus?.connected || githubStatus?.connector?.connected ? "github" : null,
          awsStatus?.status === "live" || awsStatus?.connector?.connected ? "aws" : null,
          azureadStatus?.connector?.connected ? "azuread" : null,
          oktaStatus?.connector?.connected ? "okta" : null,
          snykStatus?.connector?.connected ? "snyk" : null,
          vtStatus?.connector?.connected ? "virustotal" : null,
          elasticStatus?.connector?.connected ? "elastic" : null,
        ].filter(Boolean);
        const scanTargets = connectedTargets.length ? connectedTargets : ["github", "aws", "azuread"];
        setAiSpmState((prev) => ({
          ...prev,
          scanProgress: createAiSpmScanProgress({
            phase: "scanning",
            percent: 34,
            message: connectedTargets.length
              ? `Scanning ${connectedTargets.length} connected source${connectedTargets.length === 1 ? "" : "s"}…`
              : "No live connector status found yet; checking AI-SPM core sources…",
            targets: scanTargets.map((id) => ({
              id,
              label: SCAN_TARGET_LABELS[id] || id,
              status: id === "virustotal" ? "skipped" : connectedTargets.includes(id) ? "scanning" : "pending",
              detail: id === "virustotal" ? "IOC enrichment only" : "",
            })),
          }),
        }));
        scanProgressTimers.push(
          window.setTimeout(() => {
            setAiSpmState((prev) => ({
              ...prev,
              scanProgress: {
                ...(prev.scanProgress || createAiSpmScanProgress()),
                phase: "scanning",
                percent: Math.max(prev.scanProgress?.percent || 0, 48),
                message: "Scanning repository trees and connector inventories…",
              },
            }));
          }, 12_000),
          window.setTimeout(() => {
            setAiSpmState((prev) => ({
              ...prev,
              scanProgress: {
                ...(prev.scanProgress || createAiSpmScanProgress()),
                phase: "scanning",
                percent: Math.max(prev.scanProgress?.percent || 0, 62),
                message: "Inspecting source files for AI usage, secrets, workflows, and risk signals…",
              },
            }));
          }, 35_000),
          window.setTimeout(() => {
            setAiSpmState((prev) => ({
              ...prev,
              scanProgress: {
                ...(prev.scanProgress || createAiSpmScanProgress()),
                phase: "scanning",
                percent: Math.max(prev.scanProgress?.percent || 0, 74),
                message: "Large repo scan still running. Keeping the request open while Aria finishes analysis…",
              },
            }));
          }, 75_000)
        );

        const supplementalScans = [
          oktaStatus?.connector?.connected ? { id: "okta", path: "/api/connectors/okta/scan", resultKey: "oktaScanResult", messageKey: "oktaMessage" } : null,
          snykStatus?.connector?.connected ? { id: "snyk", path: "/api/connectors/snyk/scan", resultKey: "snykScanResult", messageKey: "snykMessage" } : null,
          azureadStatus?.connector?.connected ? { id: "azuread", path: "/api/connectors/azuread/scan", resultKey: "azureadScanResult", messageKey: "azureadMessage" } : null,
          elasticStatus?.connector?.connected ? { id: "elastic", path: "/api/connectors/elastic/scan", resultKey: "elasticScanResult", messageKey: "elasticMessage" } : null,
        ].filter(Boolean);

        const supplementalPromises = supplementalScans.map((scanTarget) => (
          apiJson(scanTarget.path)
            .then((data) => {
              const findingCount = data.findings?.length ?? data.assets_found ?? 0;
              setAiSpmState((prev) => ({
                ...prev,
                [scanTarget.resultKey]: data,
                [scanTarget.messageKey]: `${SCAN_TARGET_LABELS[scanTarget.id]} scan complete — ${findingCount} finding(s)`,
                scanProgress: updateScanTarget(prev.scanProgress, scanTarget.id, { status: "complete", detail: `${findingCount} finding(s)` }),
              }));
              return data;
            })
            .catch((error) => {
              setAiSpmState((prev) => ({
                ...prev,
                [scanTarget.messageKey]: `${SCAN_TARGET_LABELS[scanTarget.id]} scan failed: ${error.message}`,
                scanProgress: updateScanTarget(prev.scanProgress, scanTarget.id, { status: "error", detail: error.message }),
              }));
              return null;
            })
        ));

        const scan = await apiJson("/api/ai-spm/scan", {
          method: "POST",
          signal: AbortSignal.timeout?.(600_000),
          body: JSON.stringify(payload),
        });
        clearScanProgressTimers();
        inventory = scan.inventory;
        summary = scan.summary;
        findings = scan.findings || [];
        const scannedConnectors = new Map((inventory?.connectors || []).map((connector) => [connector.id, connector]));
        setAiSpmState((prev) => {
          let progress = prev.scanProgress;
          for (const id of ["github", "aws", "azuread"]) {
            const connector = scannedConnectors.get(id);
            if (!connector) continue;
            const repoErrors = connector.repository_errors || [];
            progress = updateScanTarget(progress, id, {
              status: connector.status === "error" || repoErrors.length ? "error" : connector.status === "not_configured" ? "skipped" : "complete",
              detail: id === "github"
                ? repoErrors.length
                  ? `${connector.message || "Some repos failed"}${repoErrors[0]?.error ? ` — ${repoErrors[0].error}` : repoErrors[0]?.repo ? ` First: ${repoErrors[0].repo}` : ""}`
                  : `${connector.repositories?.length ?? 0} repo(s)`
                : connector.message || connector.mode,
            });
          }
          progress = updateScanTarget(progress, "virustotal", { status: "skipped", detail: "IOC enrichment only" });
          return {
            ...prev,
            scanProgress: {
              ...progress,
              phase: "finalizing",
              percent: 82,
              message: "Connector scan complete. Generating attack narrative…",
            },
          };
        });
        await Promise.allSettled(supplementalPromises);
      } else {
        const [inventoryResult, findingResult] = await Promise.all([
          ariaFetch("GET", "/api/ai-spm/inventory"),
          ariaFetch("GET", "/api/ai-spm/findings"),
        ]);
        inventory = inventoryResult.data?.inventory;
        summary = findingResult.data?.summary;
        findings = findingResult.data?.findings || [];
      }

      const narrativeData = await apiJson("/api/ai-spm/narrative", {
        method: "POST",
        signal: shouldScan ? AbortSignal.timeout?.(120_000) : undefined,
        body: JSON.stringify(payload),
      });
      const [githubConnector, awsStatus, oktaStatus, snykStatus, azureadStatus, vtStatus, elasticStatus] = preflightStatuses
        ? [
            preflightStatuses.githubStatus,
            preflightStatuses.awsStatus,
            preflightStatuses.oktaStatus,
            preflightStatuses.snykStatus,
            preflightStatuses.azureadStatus,
            preflightStatuses.vtStatus,
            preflightStatuses.elasticStatus,
          ]
        : await Promise.all([
            loadGithubConnectorStatus(),
            apiJson("/api/connectors/aws/status").catch(() => null),
            apiJson("/api/connectors/okta/status").catch(() => null),
            apiJson("/api/connectors/snyk/status").catch(() => null),
            apiJson("/api/connectors/azuread/status").catch(() => null),
            apiJson("/api/connectors/virustotal/status").catch(() => null),
            apiJson("/api/connectors/elastic/status").catch(() => null),
          ]);

      const awsConnector = awsStatus ? {
        connected: awsStatus.status === "live",
        status: awsStatus.status,
        account: awsStatus.account,
        region: awsStatus.region,
        message: awsStatus.message,
        // Merge in counts from summary if available
        ...((narrativeData.summary || summary)?.aws || {}),
      } : null;

      setAiSpmState((prev) => ({
        ...prev,
        inventory,
        summary: narrativeData.summary || summary,
        findings,
        narrative: narrativeData.narrative || null,
        sandbox: null,
        report: null,
        narrativeOverlay: false,
        githubConnector: githubConnector || prev.githubConnector,
        awsConnector: awsConnector || prev.awsConnector,
        oktaConnector: oktaStatus?.connector?.connected ? oktaStatus.connector : prev.oktaConnector,
        snykConnector: snykStatus?.connector?.connected ? snykStatus.connector : prev.snykConnector,
        azureadConnector: azureadStatus?.connector?.connected ? azureadStatus.connector : prev.azureadConnector,
        virustotalConnector: vtStatus?.connector?.connected ? vtStatus.connector : prev.virustotalConnector,
        elasticConnector: elasticStatus?.connector?.connected ? elasticStatus.connector : prev.elasticConnector,
        demoMode,
        actionMessage: shouldScan ? "AI-SPM scan complete" : "AI-SPM dashboard loaded",
        scanProgress: shouldScan
          ? (() => {
              const progress = prev.scanProgress || createAiSpmScanProgress();
              const hasErrors = (progress.targets || []).some((target) => target.status === "error");
              return {
                ...progress,
                phase: hasErrors ? "error" : "complete",
                percent: 100,
                message: hasErrors
                  ? "AI-SPM scan completed with connector errors. Successful sources were still analyzed."
                  : "AI-SPM scan complete across connected sources.",
              };
            })()
          : prev.scanProgress,
        loading: false,
      }));

      const sources = [
        "GitHub",
        awsConnector?.connected ? `AWS (${awsConnector.account || awsConnector.region || "connected"})` : null,
        oktaStatus?.connector?.connected ? "Okta" : null,
        snykStatus?.connector?.connected ? "Snyk" : null,
        azureadStatus?.connector?.connected ? "Azure AD" : null,
        vtStatus?.connector?.connected ? "VirusTotal" : null,
        elasticStatus?.connector?.connected ? "Elastic" : null,
      ].filter(Boolean).join(" + ");
      pushLiveFeed(`AI-SPM (${demoMode ? "demo" : "live"}) mapped ${(narrativeData.summary || summary)?.asset_count ?? 0} AI assets across ${sources}`);

      // Electron native notification for critical findings
      if (window.aria?.isElectron && Array.isArray(findings)) {
        const critCount = findings.filter((f) => (f.severity || "").toLowerCase() === "critical").length;
        if (critCount > 0) {
          window.aria.notify({
            title: "Aria — Critical Findings",
            body: `${critCount} critical finding${critCount !== 1 ? "s" : ""} detected in the latest AI-SPM scan.`,
            urgency: "critical",
          });
        }
      }

      return { inventory, summary, findings, narrative: narrativeData.narrative };
    } catch (error) {
      clearScanProgressTimers();
      console.warn("[Aria] AI-SPM dashboard failed:", error);
      setAiSpmState((prev) => ({
        ...prev,
        loading: false,
        scanProgress: {
          ...(prev.scanProgress || createAiSpmScanProgress()),
          phase: "error",
          percent: Math.min(100, Math.max(prev.scanProgress?.percent || 0, 35)),
          message: `AI-SPM scan failed: ${error.message}`,
        },
      }));
      pushLiveFeed("AI-SPM dashboard failed to load");
      return null;
    }
  }, [aiSpmState.demoMode, loadGithubConnectorStatus, pushLiveFeed]);

  const runConnectorFirstScan = useCallback(async (connectorId, options = {}) => {
    if (connectorId === "github" || connectorId === "aws") {
      const result = await loadAiSpmDashboard(true, false);
      return {
        connector: connectorId,
        mode: "ai-spm-scan",
        scanned_at: new Date().toISOString(),
        assets: result?.inventory?.assets || [],
        findings: result?.findings || [],
        message: "Triggered the live AI-SPM scan. Results will populate the AI asset inventory and findings panels.",
      };
    }
    if (connectorId === "okta") return scanOkta();
    if (connectorId === "snyk") return scanSnyk();
    if (connectorId === "azuread") return scanAzureAd();
    if (connectorId === "virustotal") return enrichIocs(options.iocs || []);
    if (connectorId === "elastic") return scanElastic();
    return { connector: connectorId, mode: "unsupported", findings: [], message: "No first-scan route is available for this connector." };
  }, [enrichIocs, loadAiSpmDashboard, scanAzureAd, scanElastic, scanOkta, scanSnyk]);

  // Keep the global demo flag in sync so identity/network requests serve
  // labelled sample data during the demo (cinematic presentation or the
  // AI-SPM demo toggle), and real data otherwise.
  useEffect(() => {
    setDemoMode(Boolean(aiSpmState.demoMode || demoActive));
  }, [aiSpmState.demoMode, demoActive]);

  const generateAiSpmNarrative = useCallback(async (findingId) => {
    try {
      const data = await apiJson("/api/ai-spm/narrative", {
        method: "POST",
        body: JSON.stringify({ ...(findingId ? { findingId } : {}), ...(aiSpmState.demoMode ? { demo: true } : {}) }),
      });
      setAiSpmState((prev) => ({
        ...prev,
        summary: data.summary || prev.summary,
        narrative: data.narrative || prev.narrative,
        narrativeOverlay: Boolean(data.narrative),
        actionMessage: findingId ? "Finding narrative generated" : "Attack narrative generated",
      }));
      pushLiveFeed("AI-SPM attack narrative generated");
      return data.narrative;
    } catch (error) {
      console.warn("[Aria] AI-SPM narrative failed:", error);
      pushLiveFeed("AI-SPM narrative generation failed");
      return null;
    }
  }, [aiSpmState.demoMode, pushLiveFeed]);

  const generateAiSpmReport = useCallback(async () => {
    try {
      const data = await apiJson("/api/ai-spm/report", {
        method: "POST",
        body: JSON.stringify(aiSpmState.demoMode ? { demo: true } : {}),
      });
      const markdown = data?.report?.markdown || "";
      const fileName = data?.report?.fileName || `ai-spm-report-${Date.now()}.md`;
      if (markdown) {
        const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      }
      setAiSpmState((prev) => ({
        ...prev,
        summary: data.summary || prev.summary,
        narrative: data.narrative || prev.narrative,
        report: data.report || null,
        narrativeOverlay: false,
        actionMessage: "AI-SPM report downloaded",
      }));
      pushLiveFeed(`AI-SPM report generated: ${fileName}`);
      return data.report;
    } catch (error) {
      console.warn("[Aria] AI-SPM report failed:", error);
      pushLiveFeed("AI-SPM report generation failed");
      return null;
    }
  }, [aiSpmState.demoMode, pushLiveFeed]);

  const openAiSpmSandbox = useCallback(async (findingId) => {
    try {
      const data = await apiJson("/api/ai-spm/evidence", {
        method: "POST",
        body: JSON.stringify({ findingId, ...(aiSpmState.demoMode ? { demo: true } : {}) }),
      });
      setAiSpmState((prev) => ({ ...prev, sandbox: data.sandbox || null, narrativeOverlay: false, actionMessage: "Evidence sandbox opened" }));
      pushLiveFeed("AI-SPM evidence sandbox opened");
      return data.sandbox;
    } catch (error) {
      console.warn("[Aria] AI-SPM sandbox failed:", error);
      pushLiveFeed("AI-SPM evidence sandbox failed");
      return null;
    }
  }, [aiSpmState.demoMode, pushLiveFeed]);

  const recordAiSpmFindingAction = useCallback(async (findingId, action) => {
    try {
      const data = await apiJson("/api/ai-spm/finding-action", {
        method: "POST",
        body: JSON.stringify({ findingId, action, ...(aiSpmState.demoMode ? { demo: true } : {}) }),
      });
      const state = data.state || {};
      setAiSpmState((prev) => ({
        ...prev,
        inventory: state.inventory || prev.inventory,
        summary: state.summary || prev.summary,
        findings: state.findings || prev.findings,
        narrative: null,
        sandbox: null,
        narrativeOverlay: false,
        actionMessage: `Finding marked ${action}`,
      }));
      pushLiveFeed(`AI-SPM finding marked ${action}`);
      return data.decision;
    } catch (error) {
      console.warn("[Aria] AI-SPM action failed:", error);
      pushLiveFeed(`AI-SPM ${action} failed`);
      return null;
    }
  }, [aiSpmState.demoMode, pushLiveFeed]);

  const closeAiSpmNarrativeOverlay = useCallback(() => {
    setAiSpmState((prev) => ({ ...prev, narrativeOverlay: false }));
  }, []);

  const resolveRealtimeSpeech = useCallback(() => {
    const pending = narratePendingResolversRef.current.splice(0);
    pending.forEach((resolve) => resolve());
  }, []);

  const resolveRealtimeSpeechAfterPlayback = useCallback(() => {
    const delayMs = Math.max(0, narratePlayTimeRef.current - Date.now()) + 180;
    if (delayMs > 0) {
      window.setTimeout(resolveRealtimeSpeech, delayMs);
      return;
    }
    resolveRealtimeSpeech();
  }, [resolveRealtimeSpeech]);

  const cancelLiveSpeech = useCallback(() => {
    try { narrateAbortRef.current?.abort(); } catch { /* noop */ }
    narrateAbortRef.current = null;
    try {
      narrateAudioRef.current?.pause();
      narrateAudioRef.current?.removeAttribute?.("src");
    } catch { /* noop */ }
    narrateAudioRef.current = null;
    if (narrateObjectUrlRef.current) {
      try { URL.revokeObjectURL(narrateObjectUrlRef.current); } catch { /* noop */ }
      narrateObjectUrlRef.current = null;
    }
    realtimeVoiceLevelRef.current = 0;
    setNarrateLive(false);
    resolveRealtimeSpeech();
  }, [resolveRealtimeSpeech]);

  const playDemoAudioClip = useCallback((src, text = "") => {
    if (!DEMO_BUILD || silentModeRef.current || typeof window === "undefined") {
      return Promise.resolve(false);
    }
    const audioSrc = src || demoAudio("actions/panel-in-view");
    const previous = demoSpeechAudioRef.current;
    if (previous) {
      previous.pause();
      demoSpeechAudioRef.current = null;
    }
    cancelLiveSpeech();
    const audio = new Audio(audioSrc);
    audio.preload = "auto";
    audio.volume = 1;
    demoSpeechAudioRef.current = audio;
    setNarrateLive(true);
    realtimeLastAudioAtRef.current = Date.now();
    realtimeVoiceLevelRef.current = 0.42;

    return new Promise((resolve) => {
      let settled = false;
      const fallbackMs = Math.max(60000, String(text || "").split(/\s+/).filter(Boolean).length * 360);
      const finish = (played) => {
        if (settled) return;
        settled = true;
        if (demoSpeechAudioRef.current === audio) demoSpeechAudioRef.current = null;
        realtimeVoiceLevelRef.current = 0;
        setNarrateLive(false);
        resolve(Boolean(played));
      };
      const timeout = window.setTimeout(() => finish(true), fallbackMs);
      audio.onended = () => {
        window.clearTimeout(timeout);
        finish(true);
      };
      audio.onerror = () => {
        window.clearTimeout(timeout);
        console.warn("[Aria] Demo audio unavailable:", audioSrc);
        finish(false);
      };
      audio.play().catch((error) => {
        window.clearTimeout(timeout);
        console.warn("[Aria] Demo audio playback blocked:", error?.message || error);
        finish(false);
      });
    });
  }, [cancelLiveSpeech]);

  const ariaTTS = useCallback(async (text, { verbatim = false, audioSrc = null } = {}) => {
    const cleanText = String(text ?? "").trim();
    if (!cleanText || silentModeRef.current) return false;
    if (DEMO_BUILD) {
      return playDemoAudioClip(audioSrc || demoAudio("actions/panel-in-view"), cleanText);
    }
    const speechText = verbatim
      ? cleanText
      : cleanText;

    cancelLiveSpeech();
    const controller = new AbortController();
    narrateAbortRef.current = controller;
    setNarrateLive(true);
    realtimeLastAudioAtRef.current = Date.now();
    realtimeVoiceLevelRef.current = 0.42;

    return new Promise((resolve) => {
      let done = false;
      const finish = (spoken = true) => {
        if (done) return;
        done = true;
        narratePendingResolversRef.current = narratePendingResolversRef.current.filter((item) => item !== finish);
        if (narrateAbortRef.current === controller) narrateAbortRef.current = null;
        realtimeVoiceLevelRef.current = 0;
        setNarrateLive(false);
        resolve(Boolean(spoken));
      };
      narratePendingResolversRef.current.push(finish);
      fetch(`${ARIA_API_BASE}/api/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...buildAuthHeaders() },
        body: JSON.stringify({ text: speechText, realtime: true }),
        signal: controller.signal,
      })
        .then(async (res) => {
          if (!res.ok) throw new Error(await res.text().catch(() => `TTS ${res.status}`));
          if (done) return;
          const canStream = typeof MediaSource !== "undefined"
            && typeof MediaSource.isTypeSupported === "function"
            && MediaSource.isTypeSupported("audio/mpeg")
            && res.body?.getReader;

          if (!canStream) {
            const blob = await res.blob();
            if (done) return;
            const url = URL.createObjectURL(blob);
            narrateObjectUrlRef.current = url;
            const audio = new Audio(url);
            audio.preload = "auto";
            audio.volume = 1;
            narrateAudioRef.current = audio;
            audio.onloadedmetadata = () => {
              const durationMs = Number.isFinite(audio.duration) ? audio.duration * 1000 : cleanText.split(/\s+/).length * 620;
              narratePlayTimeRef.current = Date.now() + Math.max(600, durationMs);
            };
            audio.ontimeupdate = () => {
              realtimeLastAudioAtRef.current = Date.now();
              realtimeVoiceLevelRef.current = Math.max(0.25, Math.min(0.8, 0.28 + audio.currentTime % 0.5));
            };
            audio.onended = () => {
              if (narrateObjectUrlRef.current === url) {
                URL.revokeObjectURL(url);
                narrateObjectUrlRef.current = null;
              }
              if (narrateAudioRef.current === audio) narrateAudioRef.current = null;
              resolveRealtimeSpeechAfterPlayback();
              finish(true);
            };
            audio.onerror = () => {
              console.warn("[Aria] ElevenLabs audio playback failed");
              finish(false);
            };
            audio.play().catch((error) => {
              console.warn("[Aria] ElevenLabs audio playback blocked:", error?.message || error);
              finish(false);
            });
            return;
          }

          const mediaSource = new MediaSource();
          const url = URL.createObjectURL(mediaSource);
          narrateObjectUrlRef.current = url;
          const audio = new Audio(url);
          audio.preload = "auto";
          audio.volume = 1;
          narrateAudioRef.current = audio;
          narratePlayTimeRef.current = Date.now() + Math.max(6000, cleanText.split(/\s+/).length * 620);
          audio.ontimeupdate = () => {
            realtimeLastAudioAtRef.current = Date.now();
            realtimeVoiceLevelRef.current = Math.max(0.25, Math.min(0.8, 0.28 + audio.currentTime % 0.5));
          };
          audio.onended = () => {
            if (narrateObjectUrlRef.current === url) {
              URL.revokeObjectURL(url);
              narrateObjectUrlRef.current = null;
            }
            if (narrateAudioRef.current === audio) narrateAudioRef.current = null;
            resolveRealtimeSpeechAfterPlayback();
            finish(true);
          };
          audio.onerror = () => {
            console.warn("[Aria] ElevenLabs audio playback failed");
            finish(false);
          };
          audio.play().catch((error) => {
            console.warn("[Aria] ElevenLabs audio playback blocked:", error?.message || error);
            finish(false);
          });
          mediaSource.addEventListener("sourceopen", async () => {
            const reader = res.body.getReader();
            const sourceBuffer = mediaSource.addSourceBuffer("audio/mpeg");
            const appendChunk = (chunk) => new Promise((appendResolve, appendReject) => {
              sourceBuffer.addEventListener("updateend", appendResolve, { once: true });
              sourceBuffer.addEventListener("error", appendReject, { once: true });
              sourceBuffer.appendBuffer(chunk);
            });

            try {
              while (!done) {
                const { value, done: streamDone } = await reader.read();
                if (streamDone) break;
                if (value?.byteLength) await appendChunk(value);
              }
              if (mediaSource.readyState === "open") mediaSource.endOfStream();
            } catch (error) {
              if (error?.name !== "AbortError") console.warn("[Aria] ElevenLabs stream playback failed:", error?.message || error);
              if (mediaSource.readyState === "open") {
                try { mediaSource.endOfStream("decode"); } catch { /* noop */ }
              }
              finish(false);
            }
          }, { once: true });
        })
        .catch((error) => {
          if (error?.name !== "AbortError") console.warn("[Aria] ElevenLabs TTS unavailable:", error?.message || error);
          finish(false);
        });
      window.setTimeout(() => finish(false), Math.max(30000, cleanText.split(/\s+/).length * 900));
    });
  }, [ARIA_API_BASE, cancelLiveSpeech, playDemoAudioClip, resolveRealtimeSpeechAfterPlayback]);

  const askNarrativeQuestion = useCallback((question) => {
    const clean = String(question || "").trim();
    if (!clean) return;
    // Interrupt narration the instant the operator asks something — don't wait
    // for the round-trip to finish, or Aria keeps talking over them.
    cancelLiveSpeech();
    setAriaLiveLine(`You: ${clean}`);
    void requestAriaIntelligence(clean, { intent: "narrative_question" })
      .then((result) => {
        const answer = result?.answer || result?.response || result?.voice_response || result?.summary || `I heard: ${clean}`;
        setAriaLiveLine(answer);
        return ariaTTS(answer);
      })
      .catch(() => ariaTTS(`I heard: ${clean}`));
  }, [ariaTTS, cancelLiveSpeech]);

  const learnAnalystContext = useCallback(async (note) => {
    const cleanNote = (note || "").trim();
    if (!cleanNote) return false;
    try {
      const data = await apiJson("/api/aria/learn", {
        method: "POST",
        body: JSON.stringify({ note: cleanNote, source: "operator-command" }),
      });
      if (data?.learning?.status === "learned") {
        pushLiveFeed("Aria stored analyst context in memory");
        void loadAriaState();
        return true;
      }
    } catch (error) {
      console.warn("[Aria] learn failed:", error);
    }
    return false;
  }, [loadAriaState, pushLiveFeed]);

  const refreshLiveSnapshot = useCallback(async () => {
    setPanelActionState((prev) => (
      prev.status === "busy"
        ? prev
        : { status: "busy", message: "Refreshing live telemetry...", detail: "/api/live" }
    ));
    // CROSS-005/006/009/010: use ariaFetch for timeout, retry, dedup, race-condition safety
    const result = await ariaFetch("GET", "/api/live");

    if (result.error) {
      // Transient poll failure (telemetry server restarting, network blip, etc.).
      // DO NOT wipe the last good snapshot — that caused data to flash on load
      // then vanish on the first failed refresh. Keep prior data; just mark the
      // status as waiting. Only show the empty placeholder if we never had data.
      console.warn("[Aria] live snapshot unavailable, retaining last snapshot:", result.error);
      setFetchError(DEMO_BUILD ? null : result.error === "TIMEOUT" ? "Live feed timeout" : result.error === "NETWORK_ERROR" ? "Network error" : null);
      setLivePanelData((prev) =>
        prev || {
          status: "monitoring",
          threat_level: "UNKNOWN",
          incident_count_24h: 0,
          simulated: DEMO_BUILD,
          summary: {
            headline: DEMO_BUILD ? "ARIA is running from bundled offline demo data." : "ARIA is waiting for the local telemetry server.",
            sources: [],
            review_items: DEMO_BUILD ? ["Offline demo data is active."] : ["Local telemetry API is unavailable."],
          },
          panels: {
            overview: { metrics: [], source_fabric: [] },
            actions: { available: [] },
          },
          feed: [DEMO_BUILD ? "Aria offline demo is ready" : "Aria local interface is waiting for the function server"],
        },
      );
      setAgentStatus("monitoring");
      setTelemetryOnline(DEMO_BUILD ? null : false); // surface the reconnecting indicator outside the offline demo build
      setPanelActionState(DEMO_BUILD
        ? { status: "ready", message: "Offline demo data active.", detail: "bundled" }
        : { status: "error", message: "Live telemetry refresh failed.", detail: result.error });
      return;
    }

    const data = result.data?.live;
    if (!data) {
      setTelemetryOnline(false); // empty/malformed response — keep last good snapshot
      setPanelActionState({ status: "error", message: "Live telemetry response was empty.", detail: "/api/live" });
      return;
    }

    setFetchError(null);
    setTelemetryOnline(true);
    setLivePanelData(data);
    setLastUpdated(Date.now());
    setAgentStatus(String(data?.status || "monitoring").toLowerCase());
    const previousThreatLevel = threatLevelRef.current;
    const nextThreatLevel = String(data?.threat_level || "UNKNOWN").toUpperCase();
    setThreatLevel(nextThreatLevel);
    setIncidentCount24h(Number(data?.incident_count_24h || 0));
    setPanelActionState({
      status: "complete",
      message: "Live telemetry refreshed.",
      detail: `${data?.summary?.sources?.filter((source) => source.status === "live").length || 0}/${data?.summary?.sources?.length || 0} sources live`,
    });

    // Agent B integration boundary: consume alert candidates if its monitoring
    // helper adds them to /api/live; otherwise synthesize only threshold changes.
    const telemetryAlertCandidates = [
      ...(Array.isArray(data?.voice_alert_candidates) ? data.voice_alert_candidates : []),
      ...(Array.isArray(data?.alert_candidates) ? data.alert_candidates : []),
      ...(Array.isArray(data?.summary?.alert_candidates) ? data.summary.alert_candidates : []),
    ];
    telemetryAlertCandidates.slice(0, 2).forEach((candidate) => emitOperatorAlert(candidate));
    if (
      telemetryAlertCandidates.length === 0 &&
      ["HIGH", "CRITICAL"].includes(nextThreatLevel) &&
      previousThreatLevel !== nextThreatLevel
    ) {
      emitOperatorAlert({
        id: `threat-level-${nextThreatLevel}`,
        severity: nextThreatLevel.toLowerCase(),
        summary: `Security posture increased to ${nextThreatLevel.toLowerCase()}`,
      });
    }

    if (Array.isArray(data?.feed)) {
      data.feed.slice(0, 2).forEach((line) => pushLiveFeed(line));
    }
  }, [emitOperatorAlert, pushLiveFeed]);

  const loadScanHistory = useCallback(async () => {
    const result = await ariaFetch("GET", "/api/scan/history");
    if (result.error) {
      setPanelActionState({ status: "error", message: "Scan history unavailable.", detail: result.error });
      return [];
    }
    const scans = Array.isArray(result.data?.scans) ? result.data.scans : [];
    setScanHistory(scans);
    return scans;
  }, []);

  const downloadScanArtifact = useCallback(async (id, kind = "json") => {
    if (!id) return;
    const path = kind === "audit" ? `/api/scan/audit-doc?id=${encodeURIComponent(id)}` : `/api/scan/export?id=${encodeURIComponent(id)}`;
    const fileName = kind === "audit" ? `aria-scan-${id}-audit.md` : `aria-scan-${id}.json`;
    setPanelActionState({ status: "busy", message: `Preparing ${kind === "audit" ? "audit document" : "evidence JSON"}...`, detail: path });
    try {
      const response = await fetch(`${ARIA_API_BASE}${path}`, { headers: buildAuthHeaders() });
      if (!response.ok) throw new Error(`Export failed (${response.status})`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setPanelActionState({ status: "complete", message: `${fileName} downloaded.`, detail: id });
      pushLiveFeed(`Scan artifact downloaded: ${fileName}`);
    } catch (error) {
      setPanelActionState({ status: "error", message: "Scan export failed.", detail: error.message });
      addToast(error.message || "Scan export failed", "warning", "EXPORT");
    }
  }, [addToast, pushLiveFeed]);

  const runPanelScan = useCallback(async (depth = "standard", target = "local-host") => {
    const safeDepth = ["quick", "standard", "deep"].includes(depth) ? depth : "standard";
    const query = new URLSearchParams({ depth: safeDepth, target });
    setPanelActionState({
      status: "busy",
      message: `Starting ${safeDepth} scan...`,
      detail: target,
    });
    pushLiveFeed(`Starting ${safeDepth} scan against ${target}`);

    await new Promise((resolve) => {
      let settled = false;
      let es = null;
      const finish = () => {
        if (settled) return;
        settled = true;
        es?.close();
        resolve();
      };
      const timeout = window.setTimeout(() => {
        setPanelActionState({ status: "error", message: "Scan timed out.", detail: `${safeDepth} scan exceeded the local wait window` });
        finish();
      }, 180_000);

      es = new EventSource(`${ARIA_API_BASE}/api/scan/stream?${query.toString()}`);
      es.addEventListener("scan_start", (event) => {
        const data = JSON.parse(event.data);
        setPanelActionState({ status: "busy", message: `${safeDepth} scan started.`, detail: data.id });
      });
      es.addEventListener("scan_phase", (event) => {
        const data = JSON.parse(event.data);
        setPanelActionState({
          status: "busy",
          message: data.message || "Scan phase running...",
          detail: `${data.progress || 0}% · ${data.phase || "scan"}`,
        });
        if (data.message) pushLiveFeed(`${data.progress || 0}% ${data.message}`);
      });
      es.addEventListener("scan_complete", (event) => {
        window.clearTimeout(timeout);
        const record = JSON.parse(event.data);
        setPanelActionState({
          status: "complete",
          message: `${record.depth} scan complete with ${(record.findings || []).length} finding${(record.findings || []).length === 1 ? "" : "s"}.`,
          detail: record.id,
        });
        pushLiveFeed(`Scan complete: ${record.id}`);
        void refreshLiveSnapshot();
        void loadScanHistory();
        finish();
      });
      es.onerror = () => {
        window.clearTimeout(timeout);
        setPanelActionState({ status: "error", message: "Live scan stream failed.", detail: "Falling back to command execution" });
        void executeAriaCommand(`Run a ${safeDepth} scan`, true);
        finish();
      };
    });
  }, [executeAriaCommand, loadScanHistory, pushLiveFeed, refreshLiveSnapshot]);

  const refreshMonitoringContext = useCallback(async () => {
    const [identityResult, networkResult, auditResult] = await Promise.all([
      ariaFetch("GET", "/api/identity/galaxies").catch((error) => ({ error: error.message || "IDENTITY_CONTEXT_ERROR" })),
      ariaFetch("GET", "/api/network/status").catch((error) => ({ error: error.message || "NETWORK_CONTEXT_ERROR" })),
      ariaFetch("GET", "/api/aria/audit-events?status=denied&limit=40").catch((error) => ({ error: error.message || "AUDIT_CONTEXT_ERROR" })),
    ]);

    setMonitoringContext((prev) => ({
      ...prev,
      identity: identityResult.error
        ? { ...(prev.identity || {}), error: identityResult.error }
        : {
            galaxies: identityResult.data?.galaxies || [],
            dataMode: identityResult.data?.dataMode || "unavailable",
            connectedSources: identityResult.data?.connectedSources || [],
            scannedAt: identityResult.data?.scannedAt || null,
          },
      network: networkResult.error
        ? { ...(prev.network || {}), error: networkResult.error }
        : {
            authStatus: networkResult.data?.authStatus || "none",
            authorization: networkResult.data?.authorization || null,
            lastScan: networkResult.data?.lastScan || null,
            activeScan: networkResult.data?.activeScan || null,
          },
      audit: auditResult.error
        ? { ...(prev.audit || {}), error: auditResult.error }
        : {
            deniedEvents: auditResult.data?.events || [],
            totalDenied: auditResult.data?.total || 0,
          },
    }));
  }, []);

  const startTravel = useCallback((panelId, returning = false) => {
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (!scene || !camera || disposedRef.current) return false;
    // Cancel any pending auto-fade or in-flight completion timer
    if (psAutoFadeTimer.current) { clearTimeout(psAutoFadeTimer.current); psAutoFadeTimer.current = null; }
    if (travelTimerRef.current) { clearTimeout(travelTimerRef.current); travelTimerRef.current = null; }

    // Clean up previous travel objects
    const prev = travelRef.current;
    prev.nodes?.forEach(n => { scene.remove(n); n.geometry?.dispose(); n.material?.dispose(); });
    prev.lines?.forEach(l => { scene.remove(l); l.geometry?.dispose(); l.material?.dispose(); });

    const startPos = camera.position.clone();
    setTravelTargetPanelId(panelId);

    const HOME = new THREE.Vector3(0, 1.1, 13);
    const up = new THREE.Vector3(0, 1, 0);

    // ── DETERMINISTIC PER-NODE ROUTING ──────────────────────────────────────
    // Resolve the clicked node's REAL world coordinate — the same positions the
    // raycaster hit-tests against (panelNodesRef) — so the flight path is bound
    // to the target, not a cosmetic preset. This replaces the old route presets
    // that all converged on the generic (0,0,-70) vanishing point.
    const isSectorTravel = panelId?.startsWith("sector:");
    const sectorKey = isSectorTravel ? panelId.replace("sector:", "") : null;
    const targetNode = !returning
      ? (isSectorTravel
          ? sectorNodesRef.current.find((n) => n.sectorId === sectorKey)
          : panelNodesRef.current.find((n) => n.panel.id === panelId))
      : null;

    // "overview" has no constellation node by design (it IS the home/hub view),
    // so its dock would otherwise equal HOME exactly — the camera's own starting
    // position right after intro — producing a zero-distance, visually dead
    // "travel". Give it a deliberate wide pull-back shot instead, so the same
    // curve/beacon machinery every other panel gets actually has somewhere to go.
    const isOverviewHome = !isSectorTravel && panelId === "overview" && !targetNode;
    const OVERVIEW_PULLBACK = new THREE.Vector3(0, 3.2, 19);

    const lookTarget = targetNode
      ? new THREE.Vector3(targetNode.x, targetNode.y, targetNode.z)
      : new THREE.Vector3(0, 0, 0);

    // Dock: a framed vantage a few units in front of the node, pulled partway
    // toward centre so neighbouring constellation nodes stay in frame.
    const dock = targetNode
      ? new THREE.Vector3(targetNode.x * 0.72, targetNode.y * 0.72 + 0.32, targetNode.z + 3.7)
      : (isOverviewHome ? OVERVIEW_PULLBACK.clone() : HOME.clone());

    // Control points bow the spline around the horizontal perpendicular of the
    // travel direction → each node gets a unique, side-aware banked approach arc.
    const dirVec = dock.clone().sub(startPos);
    const dist = Math.max(dirVec.length(), 0.001);
    const perp = new THREE.Vector3(-dirVec.z, 0, dirVec.x).normalize();
    const side = targetNode ? (targetNode.x >= 0 ? 1 : -1) : 1;
    const bow = THREE.MathUtils.clamp(dist * 0.3, 1.6, 6.5);

    const c1 = startPos.clone().lerp(dock, 0.3)
      .addScaledVector(perp, bow * 0.95 * side)
      .addScaledVector(up, 1.7 + lookTarget.y * 0.18);
    const c2 = startPos.clone().lerp(dock, 0.68)
      .addScaledVector(perp, -bow * 0.45 * side)
      .addScaledVector(up, 0.4);

    const curve = returning
      ? new THREE.CatmullRomCurve3(
          [startPos, new THREE.Vector3(0, 2.4, -14), new THREE.Vector3(0, 1.6, 2), HOME],
          false, "catmullrom", 0.5)
      : new THREE.CatmullRomCurve3([startPos, c1, c2, dock], false, "catmullrom", 0.5);

    // Distance-scaled duration → longer hops accelerate/cruise/decelerate longer.
    const duration = returning
      ? 2200
      : THREE.MathUtils.clamp(1500 + dist * 135, 1900, 3200);

    // ── Lit waypoint beacons sampled ON the deterministic curve. MeshStandard
    //    so the scene point-lights actually shade them (true depth, not flat
    //    additive billboards), with idle spin applied in the travel loop. ──
    // Hex literals (not COLORS — that's scoped to the scene-setup effect, not here).
    const beaconColors = [0x63f5ff, 0xffc857, 0xff3d81, 0x8b5cf6];
    const nodes = [];
    const lines = [];
    const HOPS = 6;
    let prevPoint = null;
    for (let i = 0; i < HOPS; i++) {
      const ct = (i + 1) / (HOPS + 1);
      const onCurve = curve.getPoint(ct);
      const off = new THREE.Vector3(Math.cos(i * 1.7) * 1.4, Math.sin(i * 1.3) * 1.0, 0);
      const nodePos = onCurve.clone().add(off);
      const color = beaconColors[i % beaconColors.length];

      const geo = new THREE.SphereGeometry(0.16, 18, 18);
      const mat = new THREE.MeshStandardMaterial({
        color,
        emissive: new THREE.Color(color).multiplyScalar(0.6),
        emissiveIntensity: 0.5,
        roughness: 0.3,
        metalness: 0.2,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(nodePos);
      scene.add(mesh);
      nodes.push(mesh);

      if (prevPoint) {
        const lineGeo = new THREE.BufferGeometry().setFromPoints([prevPoint, nodePos.clone()]);
        const lineMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false });
        const line = new THREE.Line(lineGeo, lineMat);
        scene.add(line);
        lines.push(line);
      }
      prevPoint = nodePos.clone();
    }

    travelRef.current = {
      active: true, startTime: performance.now(), duration, curve, returning,
      nodes, lines, targetPanel: panelId, lookTarget, dock, bank: 0, headingPrev: null,
    };
    setAriaState("navigating");

    if (!returning) {
      // Begin the panel dissolve BEFORE the flight fully settles so the 0.42s
      // fade/scale overlaps the camera's ease-out → a smooth space→panel cross-
      // dissolve instead of a snap-then-pop.
      travelTimerRef.current = setTimeout(() => {
        if (disposedRef.current) return;
        if (isSectorTravel) {
          // Sector arrival: open cluster view, no dashboard
          setAriaState("panel_select");
        } else if (isOverviewHome) {
          // Overview has no dashboard panel of its own — land the camera at
          // the wide pull-back shot and stay in the 3D home view.
          setAriaState("arrived");
        } else {
          setActiveDashPanel(panelId);
          setDashVisible(true);
          setAriaState("arrived");
        }
        travelTimerRef.current = null;
      }, Math.max(400, duration - 250));
    }
    return true;
  }, [setAriaState, setActiveDashPanel, setDashVisible, setTravelTargetPanelId]);

  const sendRealtimeSpeech = useCallback(() => false, []);
  const flushRealtimeSpeech = useCallback(() => true, []);

  const speakARIARealtime = useCallback(
    (text, { forceInDemo = false, audioSrc = null } = {}) => {
      const cleanText = (text || "").trim();
      if (!cleanText) return false;
      if (demoActiveRef.current && !forceInDemo) return false;
      void ariaTTS(cleanText, { audioSrc });
      return true;
    },
    [ariaTTS]
  );

  useEffect(() => { speakARIARealtimeRef.current = speakARIARealtime; }, [speakARIARealtime]);
  useEffect(() => {
    const onRealtimeSpeak = (event) => {
      const text = event?.detail?.text;
      const audioSrc = event?.detail?.audioSrc || null;
      if (text) speakARIARealtime(text, { forceInDemo: true, audioSrc });
    };
    window.addEventListener("aria:realtime-speak", onRealtimeSpeak);
    return () => window.removeEventListener("aria:realtime-speak", onRealtimeSpeak);
  }, [speakARIARealtime]);
  useEffect(() => {
    silentModeRef.current = silentMode;
    localStorage.setItem("aria-silent-mode", silentMode ? "true" : "false");
  }, [silentMode]);
  useEffect(() => {
    voiceAlertsEnabledRef.current = voiceAlertsEnabled;
  }, [voiceAlertsEnabled]);
  useEffect(() => {
    narrateLiveRef.current = narrateLive;
  }, [narrateLive]);
  useEffect(() => {
    narrateOverlayOpenRef.current = narrateOverlayOpen;
  }, [narrateOverlayOpen]);
  useEffect(() => {
    fullAudioModeRef.current = fullAudioMode;
    localStorage.setItem("aria-full-audio-mode", fullAudioMode ? "true" : "false");
  }, [fullAudioMode]);
  useEffect(() => {
    voiceChatEnabledRef.current = voiceChatEnabled;
    localStorage.setItem("aria-voice-chat", voiceChatEnabled ? "true" : "false");
  }, [voiceChatEnabled]);

  const navigatePanelByWheel = useCallback((direction) => {
    const nowMs = performance.now();
    const wheelState = wheelTravelRef.current;
    if (travelRef.current.active || nowMs - wheelState.lastAt < 1250) return;

    const currentId = activeDashPanelRef.current || travelRef.current.targetPanel || null;
    const currentIndex = ALL_PANELS.findIndex((panel) => panel.id === currentId);
    const baseIndex = currentIndex >= 0 ? currentIndex : direction > 0 ? -1 : 0;
    const nextIndex = (baseIndex + direction + ALL_PANELS.length) % ALL_PANELS.length;
    const nextPanel = ALL_PANELS[nextIndex];
    if (!nextPanel) return;

    wheelState.lastAt = nowMs;
    wheelState.accumulator = 0;
    closeActionPanel();
    setDashVisible(false);
    setActiveDashPanel(null);
    startTravel(nextPanel.id);
    speakARIARealtime(`Navigating to ${nextPanel.label}.`, { audioSrc: demoPanelNavAudio(nextPanel.id) });
  }, [closeActionPanel, speakARIARealtime, startTravel]);

  const openSector = useCallback((sectorId) => {
    const sector = sectorById(sectorId);
    if (!sector) return;
    closeActionPanel();
    setDashVisible(false);
    setActiveDashPanel(null);
    setActiveSector(sectorId);
    activeSectorRef.current = sectorId;
    startTravel(`sector:${sectorId}`);
    const navLine = `Navigating to ${sector.label}.`;
    speakARIARealtime(navLine, { audioSrc: DEMO_SECTOR_AUDIO[sectorId] || demoAudio("navigation/return-sector") });
  }, [closeActionPanel, setActiveSector, setDashVisible, setActiveDashPanel, speakARIARealtime, startTravel]);

  const collapseToSectors = useCallback(() => {
    setDashVisible(false);
    setActiveDashPanel(null);
    setActiveSector(null);
    activeSectorRef.current = null;
    startTravel(null, true);
    speakARIARealtime("Returning to sector map.", { audioSrc: demoAudio("navigation/return-sector-map") });
  }, [setDashVisible, setActiveDashPanel, setActiveSector, speakARIARealtime, startTravel]);

  const closeDashboardPanel = useCallback(() => {
    const closeState = getPanelCloseState({ activeSector: activeSectorRef.current });
    setDashVisible(closeState.dashVisible);
    setActiveDashPanel(closeState.activeDashPanel);
    setAriaState(closeState.ariaState);
    speakARIARealtime("Panel closed.", { audioSrc: demoAudio("navigation/panel-closed") });
  }, [setDashVisible, setActiveDashPanel, setAriaState, speakARIARealtime]);

  const processCommand = useCallback(
    async (rawCommand, options = {}) => {
      const command = (rawCommand || "").trim();
      if (!command) return;

      const { localOnly = false } = options || {};
      const normalized = normalizeIntentText(command);
      setLastTranscript(command);

      if (matchesAnyIntent(normalized, COMMAND_MAP_INTENTS)) {
        collapseToSectors();
        return true;
      }

      const openDash = (id) => {
        setActiveDashPanel(id);
        setDashVisible(true);
        setAriaMini(false);
      };
      const travelToDashboardPanel = (id) => {
        setDashVisible(false);
        setActiveDashPanel(null);
        setAriaMini(false);
        startTravel(id);
      };
      const openDashboardPanel = async (id) => {
        closeActionPanel();
        const targetSector = panelSector(id);
        if (id === "overview") {
          setDashVisible(false);
          setActiveDashPanel(null);
          await loadOverviewReport(command);
        } else if (id === "ai-spm") {
          void loadAiSpmDashboard(false);
        } else if (id === "security-admin") {
          void loadSecurityAdmin();
        } else if (id === "identity-sessions") {
          void loadIdentitySessions();
        } else if (id === "policy-change") {
          void loadPolicyChanges();
        }

        const panelLabel = panelById(id)?.label || id;
        const isVoiceSource = options?.source?.startsWith("voice");
        const navLine = `Navigating to ${panelLabel}.`;

        if (targetSector && activeSectorRef.current !== targetSector.id) {
          setDashVisible(false);
          setActiveDashPanel(null);
          setActiveSector(targetSector.id);
          activeSectorRef.current = targetSector.id;
          startTravel("sector:" + targetSector.id);
          window.setTimeout(() => {
            travelToDashboardPanel(id);
          }, 2400);
          speakARIARealtime(navLine, { audioSrc: demoPanelNavAudio(id) });
          return true;
        }

        travelToDashboardPanel(id);
        speakARIARealtime(navLine, { audioSrc: demoPanelNavAudio(id) });
        return true;
      };

      if (matchesAnyIntent(normalized, COMMAND_CONSOLE_INTENTS)) {
        openActionPanel("Aria command console is ready.");
        return true;
      }

      const learningPrefix = ["remember ", "note ", "learn ", "for context ", "because ", "that's because ", "that is because ", "this is expected because "].find((prefix) => normalized.startsWith(prefix));
      if (learningPrefix) {
        const note = command.slice(learningPrefix.length).trim();
        const learned = await learnAnalystContext(note);
        if (!demoActiveRef.current) {
          addToast(learned ? "Context stored in memory." : "Could not store that note.", learned ? "success" : "warning", "MEMORY");
        }
        setPanelPhase(learned ? "complete" : "ready");
        setPanelPrompt(learned ? "I have stored that context in my memory." : "I could not store that note.");
        return true;
      }

      if (
        matchesIntentPhrase(normalized, "how are we looking") ||
        matchesIntentPhrase(normalized, "how are we doing") ||
        matchesIntentPhrase(normalized, "looking today") ||
        matchesIntentPhrase(normalized, "system status") ||
        matchesIntentPhrase(normalized, "what should i know") ||
        normalized === "overview" ||
        matchesIntentPhrase(normalized, "open overview")
      ) {
        closeActionPanel();
        setDashVisible(false);
        setActiveDashPanel(null);
        await loadOverviewReport(command);
        startTravel("overview");
        speakARIARealtime("Let me pull up the overview and summarize the current posture.");
        return true;
      }

      // ── Panel select (show interface / menu) ──────────────────────────────
      if (
        normalized === "menu" ||
        normalized === "hello" ||
        normalized === "wake up" ||
        matchesIntentPhrase(normalized, "hello aria") ||
        matchesIntentPhrase(normalized, "interface") ||
        (matchesIntentPhrase(normalized, "open") && matchesIntentPhrase(normalized, "face")) ||
        matchesIntentPhrase(normalized, "open interface") ||
        matchesIntentPhrase(normalized, "open its face") ||
        matchesIntentPhrase(normalized, "open the face") ||
        matchesIntentPhrase(normalized, "open inner face") ||
        matchesIntentPhrase(normalized, "show me my interface") ||
        matchesIntentPhrase(normalized, "show me my panel") ||
        matchesIntentPhrase(normalized, "show interface") ||
        matchesIntentPhrase(normalized, "open panel")
      ) {
        closeActionPanel();
        setDashVisible(false);
        setActiveDashPanel(null);
        setAriaState("panel_select");
        speakARIARealtime("Showing your interface.");
        return true;
      }

      // ── Return / go back (two-step: panel → cluster → sector map) ─────────
      if (
        normalized === "back" ||
        normalized === "home" ||
        matchesIntentPhrase(normalized, "go back") ||
        matchesIntentPhrase(normalized, "return to aria") ||
        matchesIntentPhrase(normalized, "close panel") ||
        matchesIntentPhrase(normalized, "dismiss panel") ||
        matchesIntentPhrase(normalized, "back to monitoring") ||
        matchesIntentPhrase(normalized, "close dashboard") ||
        matchesIntentPhrase(normalized, "hide dashboard")
      ) {
        if (ariaStateRef.current === "arrived") {
          setDashVisible(false);
          setActiveDashPanel(null);
          if (activeSectorRef.current) {
            // Return to cluster view (fly back to sector hub)
            startTravel("sector:" + activeSectorRef.current);
            speakARIARealtime("Returning to sector.");
          } else {
            startTravel(null, true);
            speakARIARealtime("Returning to Aariya.");
          }
        } else if (ariaStateRef.current === "panel_select" && activeSectorRef.current) {
          // In cluster view → collapse back to sector map
          collapseToSectors();
        } else {
          setDashVisible(false);
          setActiveDashPanel(null);
          setAriaState("listening");
          closeActionPanel();
        }
        return true;
      }

      // ── SECTOR voice triggers → openSector ───────────────────────────────
      for (const sector of SECTORS) {
        if (matchesAnyIntent(normalized, [...sector.triggers, sector.label, `${sector.label} sector`])) {
          openSector(sector.id);
          return true;
        }
      }

      const connectorTarget = CONNECTOR_SCREEN_ALIASES.find((connector) =>
        matchesAnyIntent(normalized, connector.phrases)
      );
      if (connectorTarget && (matchesIntentPhrase(normalized, "connector") || matchesIntentPhrase(normalized, "connect") || matchesIntentPhrase(normalized, "integration"))) {
        await openDashboardPanel("ai-spm");
        setAiSpmState((prev) => ({
          ...prev,
          actionMessage: `${connectorTarget.label} is available in Connected Sources.`,
        }));
        return true;
      }

      // ── PANELS voice triggers → open immediately, animate in background ──
      // Iterate workspace panels before overview so "threat overview" wins over "overview".
      for (const panel of [...PANELS, OVERVIEW_PANEL]) {
        const panelPhrases = [
          panel.id,
          panel.label,
          ...(panel.triggers || []),
          ...(PANEL_VOICE_ALIASES[panel.id] || []),
        ];
        if (matchesAnyIntent(normalized, panelPhrases)) {
          return await openDashboardPanel(panel.id);
        }
      }

      // ── Legacy dashboard nav (direct open, no travel) ────────────────────
      if (normalized.includes("blocked ip") || normalized.includes("blocklist")) return await openDashboardPanel("blocked-ips");
      if ((normalized.includes("threat") && normalized.includes("timeline"))) return await openDashboardPanel("threat-timeline");
      if (normalized.includes("cpu") || (normalized.includes("system") && normalized.includes("health"))) return await openDashboardPanel("system-health");
      if (normalized.includes("filter by critical") || (normalized.includes("filter") && normalized.includes("critical"))) { setIncidentFilter("critical"); return await openDashboardPanel("incident-feed"); }
      if (normalized.includes("live log") || (normalized.includes("show") && normalized.includes("log"))) return await openDashboardPanel("live-logs");
      if (normalized.includes("network") && normalized.includes("connection")) return await openDashboardPanel("network");
      if (normalized.includes("quarantine")) return await openDashboardPanel("quarantine");
      if (normalized.includes("threat") && normalized.includes("vector")) return await openDashboardPanel("threat-vectors");
      if (normalized.includes("ai spm") || normalized.includes("ai exposure")) return await openDashboardPanel("ai-spm");
      if (normalized.includes("security admin") || normalized.includes("authz") || normalized.includes("role matrix") || normalized.includes("auth admin")) return await openDashboardPanel("security-admin");
      if (normalized.includes("identity sessions") || normalized.includes("active sessions") || normalized.includes("session inventory") || normalized.includes("session admin")) return await openDashboardPanel("identity-sessions");
      if (normalized.includes("identity galaxy") || normalized.includes("galaxy map") || normalized.includes("itdr") || normalized.includes("ueba") || normalized.includes("zero trust") || normalized.includes("identity risk") || (normalized.includes("identity") && normalized.includes("sector"))) return await openDashboardPanel("identity-galaxy");

      // EXPAND DEPARTMENT — "expand Engineering", "open Finance department", "go to IT Operations galaxy"
      const EXPAND_RE = /(?:expand|open|go to|show)\s+(.+?)(?:\s+(?:department|galaxy|sector|team))?$/i;
      const expandMatch = normalized.match(EXPAND_RE);
      if (expandMatch && (normalized.includes("department") || normalized.includes("expand") || normalized.includes("galaxy") && !normalized.includes("identity galaxy"))) {
        const deptName = expandMatch[1].trim();
        if (activeDashPanel !== "identity-galaxy") { openDash("identity-galaxy"); }
        setTimeout(() => galaxyIntentRef.current?.expandDepartment(deptName), activeDashPanel !== "identity-galaxy" ? 600 : 0);
        speakARIARealtime(`Opening ${deptName} department in the identity galaxy.`);
        return true;
      }

      // ISOLATE IDENTITY — "isolate Sary", "investigate John Smith", "focus on admin user"
      const ISOLATE_RE = /(?:isolate|investigate|focus on|inspect|look at)\s+(.+)$/i;
      const isolateMatch = normalized.match(ISOLATE_RE);
      if (isolateMatch && !normalized.includes("threat") && !normalized.includes("incident")) {
        const name = isolateMatch[1].trim();
        if (activeDashPanel !== "identity-galaxy") { openDash("identity-galaxy"); }
        setTimeout(() => galaxyIntentRef.current?.isolateIdentity(name), activeDashPanel !== "identity-galaxy" ? 600 : 0);
        speakARIARealtime(`Locating ${name} in the identity sector.`);
        return true;
      }

      // RUN SCAN — "run scan", "scan network", "scan identities", "start discovery"
      if (normalized.match(/(?:run|start|launch|begin)\s+(?:a\s+)?(?:scan|discovery|network scan|identity scan)/)) {
        if (activeDashPanel !== "identity-galaxy") { openDash("identity-galaxy"); }
        setTimeout(() => galaxyIntentRef.current?.runScan(), activeDashPanel !== "identity-galaxy" ? 600 : 0);
        speakARIARealtime("Initiating identity and network scan.");
        return true;
      }

      // GENERATE REPORT — "generate report", "identity report", "risk report", "show risk leaders"
      if (normalized.match(/(?:generate|create|show|pull)\s+(?:identity\s+|risk\s+|security\s+)?report|risk leaders?|risk leaderboard/)) {
        if (activeDashPanel !== "identity-galaxy") { openDash("identity-galaxy"); }
        setTimeout(() => galaxyIntentRef.current?.generateReport(), activeDashPanel !== "identity-galaxy" ? 600 : 0);
        speakARIARealtime("Opening identity risk report.");
        return true;
      }

      if (normalized.includes("policy change") || normalized.includes("policy admin") || normalized.includes("policy history") || normalized.includes("rbac policy")) return await openDashboardPanel("policy-change");

      // ── ARIA panel open — only on explicit console/panel phrases ────────────
      if (
        normalized === "aria" ||
        (normalized.includes("aria") && (normalized.includes("console") || normalized.includes("open aria") || normalized.includes("show aria")))
      ) {
        openActionPanel("Aria panel is now in view. What would you like to do?");
        return true;
      }

      // ── Fall through to ARIA command execution ───────────────────────────
      if (localOnly) return false;
      void executeAriaCommand(command, true);
      return true;
    },
    [addToast, closeActionPanel, collapseToSectors, executeAriaCommand, learnAnalystContext, loadAiSpmDashboard, loadOverviewReport, openActionPanel, openSector, speakARIARealtime, startTravel, setAriaState, setActiveSector, setLastTranscript]
  );

  const handleCanvasClick = useCallback((e) => {
    if (ariaStateRef.current !== "panel_select") return;
    const cam = cameraRef.current;
    const mount = mountRef.current;
    if (!cam || !mount) return;
    const rect = mount.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, cam);
    const isSectorMap = !activeSectorRef.current;
    if (isSectorMap) {
      // Sector map: hit-test overview + sector nodes
      const allSectorNodes = [
        ...sectorNodesRef.current,
        ...(panelNodesRef.current.filter(n => n.panel.id === "overview")),
      ];
      const hitTargets = allSectorNodes.map(n => n.hit || n.sphere);
      const hits = raycaster.intersectObjects(hitTargets);
      if (hits.length > 0) {
        const idx = hitTargets.indexOf(hits[0].object);
        if (idx >= 0) {
          const node = allSectorNodes[idx];
          if (node.sectorId) {
            openSector(node.sectorId);
          } else {
            // overview node
            startTravel(node.panel.id);
            speakARIARealtime(`Navigating to ${node.panel.label}.`);
          }
        }
      }
    } else {
      // Cluster view: hit-test only the active sector's panel nodes
      const clusterNodes = panelNodesRef.current.filter(n => {
        const s = panelSector(n.panel.id);
        return s?.id === activeSectorRef.current;
      });
      const hitTargets = clusterNodes.map(n => n.hit || n.sphere);
      const hits = raycaster.intersectObjects(hitTargets);
      if (hits.length > 0) {
        const idx = hitTargets.indexOf(hits[0].object);
        if (idx >= 0) {
          const panel = clusterNodes[idx].panel;
          startTravel(panel.id);
          speakARIARealtime(`Navigating to ${panel.label}.`);
        }
      }
    }
  }, [openSector, speakARIARealtime, startTravel]);

  const handleCanvasHover = useCallback((e) => {
    if (ariaStateRef.current !== "panel_select") {
      hoveredPanelIdRef.current = null;
      return;
    }
    const cam = cameraRef.current;
    const mount = mountRef.current;
    if (!cam || !mount) return;
    const rect = mount.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, cam);
    const isSectorMap = !activeSectorRef.current;
    if (isSectorMap) {
      const allSectorNodes = [
        ...sectorNodesRef.current,
        ...(panelNodesRef.current.filter(n => n.panel.id === "overview")),
      ];
      const hitTargets = allSectorNodes.map(n => n.hit || n.sphere);
      const hits = raycaster.intersectObjects(hitTargets);
      if (!hits.length) { hoveredPanelIdRef.current = null; return; }
      const idx = hitTargets.indexOf(hits[0].object);
      const node = allSectorNodes[idx];
      hoveredPanelIdRef.current = idx >= 0 ? (node.sectorId ? "sector:" + node.sectorId : node.panel.id) : null;
    } else {
      const clusterNodes = panelNodesRef.current.filter(n => {
        const s = panelSector(n.panel.id);
        return s?.id === activeSectorRef.current;
      });
      const hitTargets = clusterNodes.map(n => n.hit || n.sphere);
      const hits = raycaster.intersectObjects(hitTargets);
      if (!hits.length) { hoveredPanelIdRef.current = null; return; }
      const idx = hitTargets.indexOf(hits[0].object);
      hoveredPanelIdRef.current = idx >= 0 ? clusterNodes[idx].panel.id : null;
    }
  }, []);

  // Stops current ElevenLabs narrative speech.
  const stopNarrativeSpeech = useCallback(() => {
    cancelLiveSpeech();
    narratePlayTimeRef.current = 0;
  }, [cancelLiveSpeech]);

  const stopLiveVoice = useCallback(() => {
    setNarrateOverlayOpen(false);
    setAriaLiveLine("");
    cancelLiveSpeech();
  }, [cancelLiveSpeech]);

  const buildRealtimeContextSnapshot = useCallback(() => {
    const state = realtimePlatformContextRef.current || {};
    return buildRealtimePlatformContext({
      ...state,
      activeDashPanel: activeDashPanelRef.current ?? state.activeDashPanel,
      activeSector: activeSectorRef.current ?? state.activeSector,
      livePanelData: livePanelDataRef.current ?? state.livePanelData,
      monitoringContext: monitoringContextRef.current ?? state.monitoringContext,
      modelMode: modelModeRef.current || state.modelMode || "gemini",
      panelCatalog: ALL_PANELS,
      sectorCatalog: SECTORS,
      threatLevel: threatLevelRef.current || state.threatLevel || "UNKNOWN",
    });
  }, []);

  const buildRealtimeContextToolResult = useCallback(() => (
    buildRealtimePlatformContextResult({
      ...realtimePlatformContextRef.current,
      activeDashPanel: activeDashPanelRef.current ?? realtimePlatformContextRef.current?.activeDashPanel,
      activeSector: activeSectorRef.current ?? realtimePlatformContextRef.current?.activeSector,
      livePanelData: livePanelDataRef.current ?? realtimePlatformContextRef.current?.livePanelData,
      monitoringContext: monitoringContextRef.current ?? realtimePlatformContextRef.current?.monitoringContext,
      modelMode: modelModeRef.current || realtimePlatformContextRef.current?.modelMode || "gemini",
      panelCatalog: ALL_PANELS,
      sectorCatalog: SECTORS,
      threatLevel: threatLevelRef.current || realtimePlatformContextRef.current?.threatLevel || "UNKNOWN",
    })
  ), []);

  const requestAriaIntelligence = useCallback(async (utterance, { intent = "question" } = {}) => {
    const context = buildRealtimeContextSnapshot();
    const data = await apiJson("/api/aria/intelligence", {
      method: "POST",
      body: JSON.stringify({
        utterance,
        intent,
        context,
        model_mode: modelModeRef.current || "gemini",
      }),
    });
    return data?.result || null;
  }, [buildRealtimeContextSnapshot]);

  const speakExactViaLiveSession = useCallback((text) => {
    void ariaTTS(text, { verbatim: true });
    return true;
  }, [ariaTTS]);
  // ─── Aria Guided Demo (self-playing platform walkthrough) ─────────────────
  // Hard-cut any in-flight TTS so a jump/repeat doesn't bleed the previous
  // chapter's narration into the next one. narrateCtxRef is unused by the
  // ElevenLabs path (kept null) but closed defensively.
  const hardStopDemoSpeech = useCallback(() => {
    cancelLiveSpeech();
    try { narrateCtxRef.current?.close?.(); } catch { /* noop */ }
    narrateCtxRef.current = null;
  }, [cancelLiveSpeech]);

  const stopAriaDemo = useCallback(() => {
    demoActiveRef.current = false;
    demoRunIdRef.current += 1;
    demoPausedRef.current = false;
    setDemoActive(false);
    setDemoPaused(false);
    setDemoNarrationState("ready");
    demoNarrationPlayingRef.current = false;
    if (demoTimerRef.current) { clearTimeout(demoTimerRef.current); demoTimerRef.current = null; }
    if (demoAudioRef.current) {
      demoAudioRef.current.pause();
      demoAudioRef.current.currentTime = 0;
      demoAudioRef.current = null;
    }
    if (demoBackingAudioRef.current) {
      demoBackingAudioRef.current.pause();
      demoBackingAudioRef.current.currentTime = 0;
      demoBackingAudioRef.current = null;
    }
    cancelLiveSpeech();
    updateStatus("Monitoring", "live");
  }, [cancelLiveSpeech, updateStatus]);

  // Pause/resume: suspends both the ambient track and the live TTS audio context
  // so a mid-narration pause is silent and resumes exactly where it left off.
  const setDemoPausedState = useCallback((paused) => {
    demoPausedRef.current = paused;
    setDemoPaused(paused);
    if (demoAudioRef.current) {
      if (paused) demoAudioRef.current.pause();
      else demoAudioRef.current.play().catch(() => {});
    }
    if (demoBackingAudioRef.current) {
      if (paused) demoBackingAudioRef.current.pause();
      else demoBackingAudioRef.current.play().catch(() => {});
    }
    const ctx = narrateCtxRef.current;
    if (ctx) {
      if (paused) ctx.suspend().catch(() => {});
      else ctx.resume().catch(() => {});
    }
  }, []);

  // runDemoFrom plays the chapter list starting at startIndex. Each run takes a
  // fresh runId so that a jump/repeat invalidates any in-flight older run via

  const runDemoFrom = useCallback((startIndex = 0) => {
    const runId = ++demoRunIdRef.current;
    const check = () => demoActiveRef.current && demoRunIdRef.current === runId;
    const clampedChapter = Math.max(0, Math.min(DEMO_CHAPTER_LINE_OFFSETS.length - 1, startIndex));
    demoLineIndexRef.current = DEMO_CHAPTER_LINE_OFFSETS[clampedChapter] || 0;

    const wait = (ms) => new Promise((resolve) => {
      demoTimerRef.current = setTimeout(() => { if (check()) resolve(); }, ms);
    });
    const gate = async () => {
      while (demoPausedRef.current && check()) {
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
    };
    // Block the tour until any audio already scheduled on the realtime audio
    // context has finished playing. ariaTTS resolves on the live session's
    // turnComplete signal, which can fire slightly before the buffered audio
    // has actually drained — without this guard the demo races ahead of the
    // narration (e.g. skipping straight past Autonomy while speech is still on
    // an earlier tab). Capped so it can never hang the tour.
    const waitForAudioDrain = async (maxMs) => {
      const ctx = narrateCtxRef.current;
      if (!ctx) return;
      await wait(160); // let trailing audio chunks get scheduled
      const deadline = Date.now() + Math.max(2000, maxMs || 0);
      while (check() && Date.now() < deadline && (narratePlayTimeRef.current - ctx.currentTime) > 0.12) {
        await wait(140);
      }
    };
    // speak() uses the Gemini realtime talk session and resolves when the
    // audio finishes, so the demo can keep navigation and narration in sync.
    const speak = async (text) => {
      if (!check()) return false;
      await gate();
      if (!check()) return false;
      const wordCount = String(text || "").trim().split(/\s+/).filter(Boolean).length;
      const recordedNarrationActive = demoNarrationPlayingRef.current
        && demoAudioRef.current
        && !demoAudioRef.current.ended;
      // Each call to speak() consumes the next line in demoSpeechTimings, in the
      // exact order scripts/generate-demo-speech.mjs synthesized them. Waiting on
      // the recording's actual currentTime (instead of a word-count guess) keeps
      // navigation cues on the beat regardless of how fast/slow the voice talks.
      const lineTiming = demoSpeechTimings.lines[demoLineIndexRef.current];
      demoLineIndexRef.current += 1;
      if (recordedNarrationActive && lineTiming) {
        let waited = 0;
        const maxWaitMs = 90000;
        while (check() && waited < maxWaitMs) {
          await gate();
          if (!check()) break;
          const audio = demoAudioRef.current;
          if (!audio || audio.ended || audio.currentTime >= lineTiming.end) break;
          await wait(80);
          waited += 80;
        }
        return check();
      }
      if (recordedNarrationActive) {
        await wait(Math.max(6000, wordCount * 620));
        return check();
      }
      const spoken = await ariaTTS(text, { verbatim: true });
      if (!check()) return false;
      if (!spoken) {
        await wait(Math.max(6000, wordCount * 620));
        return check();
      }
      await waitForAudioDrain(wordCount * 700 + 6000);
      return check();
    };
    const demoPause = async (ms) => { await gate(); return wait(Math.max(0, ms - 2000)); };

      const preloadPanel = (panelId) => {
        if (panelId === "ai-spm") void loadAiSpmDashboard(true, true);
        if (panelId === "security-admin") void loadSecurityAdmin();
      };

      const commandCenterDemo = (detail) => {
        window.dispatchEvent(new CustomEvent("aria:command-center-demo", { detail }));
      };

      const identityDemo = async (detail, timeoutMs = 1600) => {
        const requestId = `demo-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        let onDone;
        const complete = new Promise((resolve) => {
          onDone = (event) => {
            if (event?.detail?.requestId !== requestId) return;
            window.removeEventListener("aria:identity-demo-complete", onDone);
            resolve(event?.detail?.status || "ok");
          };
          window.addEventListener("aria:identity-demo-complete", onDone);
        });
        window.dispatchEvent(new CustomEvent("aria:identity-demo", { detail: { ...detail, requestId } }));
        const status = await Promise.race([
          complete,
          wait(timeoutMs).then(() => "timeout"),
        ]);
        window.removeEventListener("aria:identity-demo-complete", onDone);
        return check() && status === "ok";
      };

      const scrollPanel = async (ratio = 0, dwell = 900) => {
        const scroller = document.querySelector("[data-dashboard-scroll]");
        if (scroller) {
          const maxTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
          scroller.scrollTo({ top: maxTop * ratio, behavior: "smooth" });
        }
        await demoPause(dwell);
        return check();
      };

      const returnHome = async (waitMs = 0) => {
        setDashVisible(false);
        setActiveDashPanel(null);
        setActiveSector(null);
        activeSectorRef.current = null;
        setPanelVisible(false);
        setAriaState("idle");
        startTravel(null, true);
        if (waitMs) await demoPause(waitMs);
        return check();
      };

      const clickIfVisibleButton = async (labels = [], dwell = 400, { timeoutMs = 0, required = false, dwellBeforeMs = 0 } = {}) => {
        const normalized = labels.map((label) => label.toLowerCase());
        const findTarget = () => {
          const targets = Array.from(document.querySelectorAll("button, [role='button'], [data-identity-demo-name]"));
          return targets.find((button) => {
            const text = (button.textContent || "").trim().toLowerCase();
            const aria = (button.getAttribute("aria-label") || "").trim().toLowerCase();
            const demoName = (button.getAttribute("data-identity-demo-name") || "").trim().toLowerCase();
            return normalized.some((label) => (
              text === label || text.includes(label) ||
              aria === label || aria.includes(label) ||
              demoName === label || demoName.includes(label)
            ));
          });
        };

        const deadline = Date.now() + timeoutMs;
        let target = findTarget();
        while (!target && Date.now() < deadline && demoActiveRef.current) {
          await wait(120);
          target = findTarget();
        }

        if (!target) {
          if (required) return false;
          await demoPause(dwell);
          return check();
        }

        // Let the target (e.g. the critical-alarm siren) stay live for a beat
        // before we actually click it, so it's audibly/visibly present.
        if (dwellBeforeMs) {
          await wait(dwellBeforeMs);
          if (!check()) return false;
        }

        if (typeof target.click === "function") target.click();
        else target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
        await wait(350);
        await demoPause(dwell);
        return check();
      };

      const goSector = async (sectorId, waitMs) => {
        openSector(sectorId);
        await demoPause(waitMs);
        return check();
      };

      const goPanel = async (panelId, waitMs) => {
        preloadPanel(panelId);
        startTravel(panelId);
        await demoPause(waitMs);
        return check();
      };

      const speakStep = async (text) => {
        await speak(text);
        return check();
      };

      const presentPanel = async ({ id, waitMs, body, afterBody }) => {
        preloadPanel(id);
        startTravel(id);
        await demoPause(waitMs);
        if (!check()) return false;
        await speak(body);
        if (!check()) return false;
        if (afterBody) {
          const ok = await afterBody();
          if (!ok) return false;
        }
        return check();
      };

    const chapters = [
      // 0 — Welcome / landing
      async () => {
      await returnHome();
      setActiveSector(null);
      activeSectorRef.current = null;
      setAriaState("idle");

      if (!await speakStep("I am Aariya, Autonomous Resilience Intelligence Architecture. I am a security operations cockpit built to watch your environment, explain risk, coordinate response, and help operators make governed decisions. Welcome to the landing page. This is my main interface, where you can navigate to different sectors within the galaxy. Each feature is displayed as sectors and nodes, with the sector acting as the category and each node representing a specific display panel. Across the top are the main areas: Overview, Threat Intel, Timeline, Identity and Access, Network, AI-SPM, Command, and Response. The left status stack shows system state, threat level, review items, intelligence mode, and operations comms. On the right, you can open the command console, manage audio alerts, start this presentation, or adjust my autonomy mode. The entire platform is interconnected through this galaxy representation. You can click a panel, type a command, or let me route you automatically when a critical event occurs. Each panel shows the situation, explains why it matters, and provides safe, actionable options. At any point, you can request a narrative. The production platform supports real-time conversation based on live data, while this demo runs fully offline from bundled assets. Let me show you how the system works.")) return;
      },

      // 1 — Overview
      async () => {
      if (!await speakStep("Navigating to the overview panel.")) return;
      if (!await presentPanel({
        id: "overview",
        waitMs: 7000,
        body: "Overview is the executive control deck. It answers three vital questions: what is our posture, what changed, and what needs attention now? From here, you can refresh live sources, run scans, request a real-time narration, generate reports, and dive directly into the evidence behind the numbers. This is the boardroom layer, but it strictly routes back to operational proof.",
      })) return;

      },
      // 2 — Threat Intelligence
      async () => {
      if (!await returnHome()) return;
      if (!await goSector("threat", 6000)) return;
      if (!await speakStep("Moving from the executive summary, we enter Threat Intelligence. Here, you have four nodes to explore: Threat Vectors, Timeline, System Health, and Threat Overview. Let’s look at Threat Overview.")) return;
      if (!await speakStep("Navigating to the Threat Overview Panel.")) return;
      if (!await presentPanel({
        id: "threat-overview",
        waitMs: 8000,
        body: "This is the posture room. You can inspect active vectors, incident severity, perimeter pressure, and live review items. From here, you can run a risk scan, request a briefing, open related incidents, or examine the evidence explaining a specific signal. I actively reduce alert fatigue by highlighting only the risks that are operationally critical.",
      })) return;

      },
      // 3 — Network
      async () => {
      if (!await speakStep("Navigating to the Network Sector.")) return;
      if (!await returnHome()) return;
      if (!await goSector("net", 7000)) return;
      if (!await speakStep("Next is the Network sector. We have three node options: Network, Identity and Sessions, and Live Logs. Let’s examine the Network panel to see my capabilities in action.")) return;

      if (!await presentPanel({
        id: "network",
        waitMs: 7000,
        body: "The Network panel displays active sockets, external remotes, private connections, listening services, and blocklist states. You can filter connections, assess remote endpoints, manage IP blocks, refresh sockets, and initiate network discovery. Passive visibility is entirely safe; active discovery is guarded by authorization protocols, ensuring observability never turns into uncontrolled scanning.",
      })) return;

      },
      // 4 — Identity & Access
      async () => {
      if (!await returnHome(7000)) return false;
      if (!await speakStep("I want to show you something different now: how you can monitor your entire workforce via my Identity Galaxy map. For privacy and authorization compliance, I will not pull live individual user data for this demonstration, but this demo data will illustrate the concept perfectly.")) return false;
      if (!await speakStep("I will pull up the Identity Galaxy Panel.")) return false;
      if (!await goPanel("identity-galaxy", 8000)) return false;
      if (!await speakStep("Every sector within your organization is represented as a distinct galaxy. I automatically detect the naming conventions of the sectors from the connected subnet. This functions as a three-tier warning system: blue for neutral, amber for a detected threat, and red for a critical alert. My interface dynamically updates these colors based on progressive, continuous scanning. Let’s explore the individuals connected to the IT Operations sector.")) return false;
      if (!await identityDemo({ action: "expand-department", name: "IT Operations" }, 3000)) return false;
      await wait(2500); // let GalaxyExpanded mount and fetch users
      if (!check()) return false;
      if (!await speakStep("In this example, Jamie Okafor is listed as a high-risk user. Let’s investigate exactly what triggered this alert.")) return false;
      if (!await identityDemo({ action: "select-identity", department: "IT Operations", name: "Jamie Okafor" }, 8000)) return false;
      await wait(2500);
      if (!check()) return false;
      if (!await speakStep("Here, you can see the user has failed authentication four times, which I have flagged for review. By clicking \"Brief,\" I will generate a real-time analysis detailing the event. If you need deeper inspection, you can move the user to a watchlist or mark them as trusted. This system allows you to revoke user access, pull live action logs, and restrict network or file access instantly. Notice the \"Travel Anomalies\" section on the right. This is my credential protection system. It registers a user’s standard IP address and workstation. If a login occurs in an impossible environment—like a sudden geographical shift—my 24/7 monitoring engine detects and flags it instantly.")) return false;

      },
      // 5 — AI-SPM
      async () => {
      if (!await speakStep("Now I will navigate you to the AI-SPM Panel.")) return;
      if (!await returnHome()) return;
      if (!await presentPanel({
        id: "ai-spm",
        waitMs: 8000,
        body: "This is AI Security Posture Management, or AI-SPM. This panel discovers AI systems, prompts, tools, endpoints, secrets, model infrastructure, cloud assets, and identity links. You can simultaneously connect GitHub, AWS, Okta, Snyk, Azure AD, VirusTotal, and Elastic.",
        
        
        afterBody: async () => {
          await speak("I am scrolling down because the detail matters. You can inspect connector status, asset inventory, evidence, and remediation actions, making this invaluable for both operators and governance teams. Because I have full scope over every panel, data signal, and past report, I can make highly informed decisions.");
          if (!check()) return false;
        if (!await scrollPanel(0.25, 5000)) return false;
        if (!await scrollPanel(0.50, 5000)) return false;
        if (!await scrollPanel(0.75, 5000)) return false;
        if (!await scrollPanel(1.00, 5000)) return false;
         if (!await scrollPanel(0.75, 5000)) return false;
             if (!await scrollPanel(0.50, 5000)) return false;
                if (!await scrollPanel(0.25, 5000)) return false;
                   if (!await scrollPanel(0.00, 5000)) return false;
        await speak("You can also take direct action from this page. You can launch a sandbox to safely explore a potential threat without exposing your organization, immediately resolve or ignore a finding, or generate a comprehensive report across all your connectors.");
        return check();
        },
      })) return;

      },
      // 6 — Decision Engine
      async () => {
      if (!await speakStep("Let me show you Aariya’s self-learning process.")) return;
      if (!await returnHome()) return;
      if (!await presentPanel({
        id: "decision-engine",
        waitMs: 7000,
        body: "The Decision Engine is where I move from findings to action. I correlate signals into attack paths, estimate the blast radius, assign confidence scores, recommend actions, and decide whether human approval is required. You can review my latest decisions, trust scores, autonomy levels, and the underlying evidence. This is what separates me from a standard scanner: I explain exactly what should happen next, and why. What makes me unique is my continuous learning protocol. Every action, decision, and human intervention is recorded in my internal study ledger. I learn from patterns and repeat approvals, which gradually guides me from Approval Mode to Full Auto Mode. I am capable of running 24/7 autonomously—isolating threats, blocking IPs, revoking access, and quarantining files. However, you maintain ultimate control over that transition. You manually score my decisions. As my accuracy score increases—for example, hitting 98 out of 100—you can elevate my trust levels. In Approval Mode, I scan over 600 data points simultaneously, but you remain the final decision-maker. In Auto Mode, I handle standard operations but escalate critical decisions to you. In Fully Auto Mode, I scan, detect, decide, audit, and execute without requiring intervention. All of my self-training notes are available for your review, and you can manually update them to ensure my procedures perfectly align with your company’s policies.",
      })) return;

      },
      // 7 — Incident Feed
      async () => {
      if (!await speakStep("Next, I would like to show you Aariya’s Incident Feed panel.")) return;
      if (!await returnHome()) return;
      if (!await presentPanel({
        id: "incident-feed",
        waitMs: 7000,
        body: "The Incident Feed is the response queue. It ranks active events by severity and keeps action buttons right next to the evidence. You can acknowledge, escalate, suppress, open context, run a scan, or generate executive and technical incident reports.",
      })) return;

      },
      // 8 — Security Admin
      async () => {
      if (!await speakStep("Navigating now to the Security Admin panel.")) return;
      if (!await returnHome()) return;
      if (!await presentPanel({
        id: "security-admin",
        waitMs: 7000,
        body: "Security Admin is built for governance proof. It shows tenant context, role permissions, authorization denials, compliance status, and session controls. You can review exactly who is allowed to do what, preview the risks of permission changes, and apply modifications securely.",
        afterBody: async () => {
          if (!await scrollPanel(0.72, 2600)) return false;
          await speak("Enterprise buyers care deeply about these lower-level controls. Session control, authorization evidence, and compliance status prove that my autonomy is strictly bounded by your policy.");
          return check();
        },
      })) return;

      },
      // 9 — Command Center
      async () => {
      if (!await speakStep("Navigating now to the Command Center.")) return;
      if (!await returnHome()) return;
      if (!await goPanel("aria-center", 2500)) return;
      if (!await clickIfVisibleButton(["Acknowledge"], 600, { timeoutMs: 5000, dwellBeforeMs: 2000 })) return;
      commandCenterDemo({ tab: "command" });
      if (!await speakStep("That alert you just heard is the critical warning siren, which can be wired to every panel to notify you of severe threats. For this demo, it is isolated to the Command Center. This is mission control. Across the top are six tabs: Command Fabric, Live Monitor, Evidence Scan, Autonomy, Evidence, and Diagnostics. Command Fabric is the decision workspace. It shows the decision queue, attack path simulations, autonomy guardrails, and outcome metrics. You can understand the blast radius of an action before anything changes.")) return;

      commandCenterDemo({ tab: "monitor" });
      await demoPause(2000);
      if (!await speakStep("Live Monitor is the single-screen operating view. It unifies threat posture, system health, active defense, AI-SPM exposure, approvals, and timelines.")) return;

      commandCenterDemo({ tab: "scan" });
      await demoPause(2000);
      if (!await speakStep("In Evidence Scan, you define your targets. You can check the local host for configuration issues and secrets, scan specific directory paths, discover network subnet devices, or target custom IPs.")) return;
      commandCenterDemo({ tab: "scan", runScan: true });
      await demoPause(10000);
      if (!check()) return;
      if (!await speakStep("As the system scan runs, you can see how I stream phases in real time, plot findings on the radar, count severity, and produce exportable evidence.")) return;
 await demoPause(3000);

      commandCenterDemo({ tab: "ops" });
      await demoPause(2000);
      if (!await speakStep("In Autonomy, you execute or stage actions. This includes the command palette and containment protocols.")) return;
      commandCenterDemo({ tab: "ops", focusCommand: true });
      await demoPause(5000);
      if (!check()) return;
      if (!await speakStep("You have direct command input to run actions via shortcuts, or you can navigate to main panels directly from this interface.")) return;
 await demoPause(5000);
      commandCenterDemo({ tab: "intel" });
      await demoPause(2000);
      if (!await speakStep("The Evidence tab is your audit-friendly proof gallery. It collects scan history, authorization denials, and operational signals. This is also where my memory feature is linked, allowing you to see the data I have been generating for my learning process. Because this documents the entire network's health and my performance, you can implement strict access levels regarding who can view, amend, or delete these records.")) return;

      commandCenterDemo({ tab: "system" });
      await demoPause(2000);
      if (!await speakStep("Finally, Diagnostics displays platform health. If an AI agent sits inside a security organization, it must be completely observable itself. This is just a fraction of my capabilities. I turn security telemetry into understandable, accountable action that improves over time. Upon deployment, I offer three levels of intelligence. The Cloud Engine utilizes Anthropic’s latest models for undisputed complex reasoning. The Local Engine is fully configurable to meet strict data provenance and regulatory needs. Finally, the Hybrid Engine runs on both systems, ensuring you have advanced protection at all times—even if your external network is compromised.")) return;
      await demoPause(4000);
      },
    ];

    (async () => {
      for (let i = Math.max(0, Math.min(chapters.length - 1, startIndex)); i < chapters.length; i++) {
        if (!check()) return;
        runChapterRef.current = i;
        setDemoChapter(i);
        await gate();
        if (!check()) return;
        const chapterOk = await chapters[i]();
        if (chapterOk === false) return;
      }
      if (!check()) return;
      // Reached the end naturally — tear down.
      demoActiveRef.current = false;
      demoRunIdRef.current += 1;
      demoPausedRef.current = false;
      setDemoActive(false);
      setDemoPaused(false);
      setDemoNarrationState("ready");
      demoNarrationPlayingRef.current = false;
      if (demoAudioRef.current) {
        demoAudioRef.current.pause();
        demoAudioRef.current = null;
      }
      if (demoBackingAudioRef.current) {
        demoBackingAudioRef.current.pause();
        demoBackingAudioRef.current = null;
      }
      updateStatus("Monitoring", "live");
    })().catch(() => {});
  }, [
    ariaTTS,
    loadAiSpmDashboard,
    loadSecurityAdmin,
    openSector,
    startTravel,
    setAriaState,
    setDashVisible,
    setActiveDashPanel,
    setActiveSector,
    setPanelVisible,
    updateStatus,
  ]);

  const startAriaDemo = useCallback((startIndex = 0) => {
    if (demoTimerRef.current) clearTimeout(demoTimerRef.current);
    demoActiveRef.current = true;
    demoPausedRef.current = false;
    setDemoActive(true);
    setDemoPaused(false);
    setDemoNarrationState("loading");
    demoNarrationPlayingRef.current = false;
    setDemoChapter(Math.max(0, Math.min(DEMO_CHAPTERS.length - 1, startIndex)));

    // Reset to clean state
    commandCenterPinnedRef.current = false;
    setPanelVisible(false);
    setDashVisible(false);
    setActiveDashPanel(null);
    setAriaState("idle");
    updateStatus("Autonomous Presentation", "demo");
    setToasts([]);
    setToastHistory([]);

    // Start the recorded demo voiceover and the separate music bed. The
    // scripted narration only acts as a fallback if the voiceover is blocked.
    if (demoAudioRef.current) {
      demoAudioRef.current.pause();
      demoAudioRef.current = null;
    }
    if (demoBackingAudioRef.current) {
      demoBackingAudioRef.current.pause();
      demoBackingAudioRef.current = null;
    }
    const audio = new Audio(DEMO_RECORDED_NARRATION_SRC);
    audio.preload = "auto";
    audio.volume = 1;
    audio.loop = false;
    demoNarrationPlayingRef.current = true;
    audio.addEventListener("loadedmetadata", () => {
      const chapterStart = demoSpeechTimings.chapterStarts[startIndex];
      if (startIndex > 0 && Number.isFinite(chapterStart) && Number.isFinite(audio.duration) && audio.duration > 0) {
        audio.currentTime = Math.min(audio.duration - 1, chapterStart);
      }
    }, { once: true });
    audio.addEventListener("ended", () => {
      if (demoAudioRef.current === audio) demoAudioRef.current = null;
      demoNarrationPlayingRef.current = false;
      setDemoNarrationState("ready");
    }, { once: true });
    audio.play().then(() => {
      demoNarrationPlayingRef.current = true;
      setDemoNarrationState("playing");
    }).catch((err) => {
      console.warn("[Aria] Recorded demo narration unavailable:", err?.message || err);
      demoNarrationPlayingRef.current = false;
      setDemoNarrationState("blocked");
      if (demoAudioRef.current === audio) demoAudioRef.current = null;
    });
    demoAudioRef.current = audio;

    const backingAudio = new Audio(DEMO_BACKING_TRACK_SRC);
    backingAudio.preload = "auto";
    backingAudio.volume = DEMO_BACKING_TRACK_VOLUME;
    backingAudio.loop = false;
    backingAudio.addEventListener("loadedmetadata", () => {
      if (startIndex > 0 && Number.isFinite(backingAudio.duration) && backingAudio.duration > 0) {
        backingAudio.currentTime = Math.min(backingAudio.duration - 1, (backingAudio.duration / DEMO_CHAPTERS.length) * startIndex);
      }
    }, { once: true });
    backingAudio.play().catch((err) => {
      console.warn("[Aria] Demo backing track unavailable:", err?.message || err);
    });
    demoBackingAudioRef.current = backingAudio;

    runDemoFrom(startIndex);
  }, [runDemoFrom, setActiveDashPanel, setAriaState, setDashVisible, setPanelVisible, updateStatus]);

  // Jump to (or repeat) a chapter. Starts the demo if it isn't already running.
  const demoJumpTo = useCallback((index) => {
    const target = Math.max(0, Math.min(DEMO_CHAPTERS.length - 1, index));
    if (!demoActiveRef.current) { startAriaDemo(target); return; }
    if (demoTimerRef.current) { clearTimeout(demoTimerRef.current); demoTimerRef.current = null; }
    hardStopDemoSpeech();
    demoPausedRef.current = false;
    setDemoPaused(false);
    if (demoAudioRef.current) {
      const audio = demoAudioRef.current;
      const chapterStart = demoSpeechTimings.chapterStarts[target];
      if (Number.isFinite(chapterStart) && Number.isFinite(audio.duration) && audio.duration > 0) {
        audio.currentTime = Math.min(audio.duration - 1, chapterStart);
      }
      setDemoNarrationState("loading");
      demoNarrationPlayingRef.current = true;
      audio.play().then(() => {
        demoNarrationPlayingRef.current = true;
        setDemoNarrationState("playing");
      }).catch(() => {
        demoNarrationPlayingRef.current = false;
        setDemoNarrationState("blocked");
      });
    }
    if (demoBackingAudioRef.current) {
      const backingAudio = demoBackingAudioRef.current;
      if (Number.isFinite(backingAudio.duration) && backingAudio.duration > 0) {
        backingAudio.currentTime = Math.min(backingAudio.duration - 1, (backingAudio.duration / DEMO_CHAPTERS.length) * target);
      }
      backingAudio.play().catch(() => {});
    }
    runDemoFrom(target);
  }, [hardStopDemoSpeech, runDemoFrom, startAriaDemo]);

  const retryDemoNarration = useCallback(() => {
    const audio = demoAudioRef.current;
    if (!audio) {
      startAriaDemo(runChapterRef.current || 0);
      return;
    }
    setDemoNarrationState("loading");
    audio.muted = false;
    audio.volume = 1;
    demoNarrationPlayingRef.current = true;
    audio.play().then(() => {
      demoNarrationPlayingRef.current = true;
      setDemoNarrationState("playing");
    }).catch(() => {
      demoNarrationPlayingRef.current = false;
      setDemoNarrationState("blocked");
    });
  }, [startAriaDemo]);

  // Keyboard transport for hands-free presenting: space = pause/resume,
  // ←/→ = prev/next section, R = repeat. Ignored while typing in a field.
  useEffect(() => {
    if (!demoActive) return;
    const onKey = (event) => {
      const tag = (event.target?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || event.target?.isContentEditable) return;
      switch (event.key) {
        case " ": case "Spacebar":
          event.preventDefault();
          setDemoPausedState(!demoPausedRef.current);
          break;
        case "ArrowRight":
          event.preventDefault();
          demoJumpTo(runChapterRef.current + 1);
          break;
        case "ArrowLeft":
          event.preventDefault();
          demoJumpTo(runChapterRef.current - 1);
          break;
        case "r": case "R":
          event.preventDefault();
          demoJumpTo(runChapterRef.current);
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [demoActive, demoJumpTo, setDemoPausedState]);

  // ─── Operator logout ────────────────────────────────────────────────
  const handleLogout = useCallback(async () => {
    if (demoActiveRef.current) stopAriaDemo();
    try { await apiJson("/api/auth/logout", { method: "POST" }); } catch { /* best-effort */ }
    setSessionToken(null);
    onLogout?.();
  }, [onLogout, stopAriaDemo]);


  useEffect(() => {
    if (!mountRef.current) return;

    const mount = mountRef.current;

    const COLORS = {
      black: 0x01020a,
      deep: 0x040818,
      blue: 0x1687ff,
      cyan: 0x63f5ff,
      gold: 0xffc857,
      violet: 0x8b5cf6,
      pink: 0xff3d81,
      ice: 0xeaf7ff,
    };

    const palette = [
      COLORS.blue,
      COLORS.cyan,
      COLORS.gold,
      COLORS.violet,
      COLORS.pink,
      COLORS.ice,
    ];

    let width = mount.clientWidth || window.innerWidth;
    let height = mount.clientHeight || window.innerHeight;
    // Cap at 1.5 — at dpr 2 the fullscreen additive overdraw was the dominant
    // GPU cost; 1.5 cuts fragment count ~44% with negligible visible loss.
    let pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    let animationFrameId = 0;
    let disposed = false;

    const isMobile = Math.min(width, height) < 760;

    const scene = new THREE.Scene();
    // Transparent scene so the ambient backdrop video shows through the empty
    // space between stars (renderer uses alpha + a transparent clear below).
    scene.background = null;
    scene.fog = new THREE.FogExp2(COLORS.black, 0.018);

    const camera = new THREE.PerspectiveCamera(52, width / height, 0.1, 220);
    camera.position.set(0, 1.1, 13);

    sceneRef.current = scene;
    cameraRef.current = camera;
    disposedRef.current = false;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });

    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.22;

    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";

    mount.appendChild(renderer.domElement);

    const universe = new THREE.Group();
    const coreGroup = new THREE.Group();
    const vortexGroup = new THREE.Group();
    const vortexTiltGroup = new THREE.Group();

    scene.add(universe);
    universe.add(vortexTiltGroup);
    vortexTiltGroup.add(vortexGroup);
    universe.add(coreGroup);

    const ambientLight = new THREE.AmbientLight(0x24335f, 0.42);
    scene.add(ambientLight);

    const coreLight = new THREE.PointLight(COLORS.cyan, 5.2, 58, 2);
    coreLight.position.set(0, 0, 5);
    scene.add(coreLight);

    const goldLight = new THREE.PointLight(COLORS.gold, 2.6, 42, 2);
    goldLight.position.set(-5, 3, 7);
    scene.add(goldLight);

    const violetLight = new THREE.PointLight(COLORS.violet, 2.7, 42, 2);
    violetLight.position.set(5, -2, 7);
    scene.add(violetLight);

    // -----------------------------
    // Cinematic spatial vortex tunnel
    // -----------------------------
    // GPU-DRIVEN: per-particle params uploaded ONCE as static attributes; the
    // spiral motion is computed in the vertex shader from a handful of uniforms.
    // Per frame we only push uniforms — no JS loop, no buffer re-upload. An M4
    // GPU eats this; the old CPU loop + needsUpdate upload was the real cost.
    const VORTEX_COUNT = isMobile ? 1800 : 4200;
    const vortexPositions = new Float32Array(VORTEX_COUNT * 3); // placeholder slot
    const vortexColors = new Float32Array(VORTEX_COUNT * 3);
    const vAngle = new Float32Array(VORTEX_COUNT);
    const vRadius = new Float32Array(VORTEX_COUNT);
    const vDepth = new Float32Array(VORTEX_COUNT);
    const vSpeed = new Float32Array(VORTEX_COUNT);
    const vTwist = new Float32Array(VORTEX_COUNT);
    const vShim = new Float32Array(VORTEX_COUNT);
    const vSizeB = new Float32Array(VORTEX_COUNT);

    for (let i = 0; i < VORTEX_COUNT; i++) {
      const layer = Math.random();
      const arm = i % 9;
      vAngle[i] = (arm / 9) * TAU + Math.random() * 0.45;
      vRadius[i] = THREE.MathUtils.randFloat(4.5, 18.5) * (0.65 + layer * 0.8);
      vDepth[i] = THREE.MathUtils.randFloat(-90, 18);
      vSpeed[i] = THREE.MathUtils.randFloat(8, 24);
      vTwist[i] = THREE.MathUtils.randFloat(0.55, 1.85);
      vShim[i] = Math.random();
      vSizeB[i] = Math.random();

      const color = new THREE.Color(palette[i % palette.length]);
      color.multiplyScalar(THREE.MathUtils.randFloat(0.9, 1.75));
      vortexColors[i * 3] = color.r;
      vortexColors[i * 3 + 1] = color.g;
      vortexColors[i * 3 + 2] = color.b;
    }

    const vortexGeometry = new THREE.BufferGeometry();
    vortexGeometry.setAttribute("position", new THREE.BufferAttribute(vortexPositions, 3));
    vortexGeometry.setAttribute("aColor", new THREE.BufferAttribute(vortexColors, 3));
    vortexGeometry.setAttribute("aAngle", new THREE.BufferAttribute(vAngle, 1));
    vortexGeometry.setAttribute("aRadius", new THREE.BufferAttribute(vRadius, 1));
    vortexGeometry.setAttribute("aDepth", new THREE.BufferAttribute(vDepth, 1));
    vortexGeometry.setAttribute("aSpeed", new THREE.BufferAttribute(vSpeed, 1));
    vortexGeometry.setAttribute("aTwist", new THREE.BufferAttribute(vTwist, 1));
    vortexGeometry.setAttribute("aShimmer", new THREE.BufferAttribute(vShim, 1));
    vortexGeometry.setAttribute("aSizeBias", new THREE.BufferAttribute(vSizeB, 1));

    const vortexMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uVoice: { value: 0 }, uSyllable: { value: 0 },
        uClarity: { value: 0 }, uSibilance: { value: 0 },
        uVortexTravel: { value: 0 }, uSpinDir: { value: 1 }, uDirShift: { value: 0 },
        uSize: { value: isMobile ? 0.072 : 0.062 }, uOpacity: { value: 0.9 },
        uScale: { value: 800 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        uniform float uTime, uVoice, uSyllable, uClarity, uSibilance;
        uniform float uVortexTravel, uSpinDir, uDirShift, uSize, uScale;
        attribute vec3 aColor;
        attribute float aAngle, aRadius, aDepth, aSpeed, aTwist, aShimmer, aSizeBias;
        varying vec3 vColor;
        void main() {
          vColor = aColor;
          float z = aDepth + uVortexTravel * aSpeed * 0.045;
          z = mod(z + 90.0, 108.0) - 90.0;
          float depthNorm = clamp((z + 90.0) / 108.0, 0.0, 1.0);
          float perspective = 0.35 + depthNorm * 1.25;
          float tunnelBreath = 1.0
            + sin(uTime * 1.4 + aAngle * 2.0 + aShimmer * 9.0) * uVoice * 0.08
            + uSyllable * 0.08;
          float radius = aRadius * perspective * tunnelBreath * (1.0 + uDirShift * 0.08);
          float spiralAngle = aAngle
            + z * 0.055 * aTwist
            + uTime * 0.35 * uSpinDir
            + uVortexTravel * 0.018 * uSpinDir
            + uSyllable * aShimmer * 0.75;
          float wobble = sin(uTime * 2.8 + aShimmer * 20.0 + z * 0.08)
            * (0.15 + uClarity * 0.7 + uSibilance * 0.45);
          float r = radius + wobble;
          vec4 mv = modelViewMatrix * vec4(cos(spiralAngle) * r, sin(spiralAngle) * r, z, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = uSize * (0.6 + aSizeBias * 0.8) * uScale / max(-mv.z, 0.1);
        }
      `,
      fragmentShader: `
        uniform float uOpacity;
        varying vec3 vColor;
        void main() {
          vec2 d = gl_PointCoord - vec2(0.5);
          float dist = dot(d, d);
          if (dist > 0.25) discard;
          float alpha = smoothstep(0.25, 0.0, dist);
          gl_FragColor = vec4(vColor, alpha * uOpacity);
        }
      `,
    });

    const vortexParticles = new THREE.Points(vortexGeometry, vortexMaterial);
    vortexParticles.frustumCulled = false;
    vortexGroup.add(vortexParticles);

    // Long spiral streaks, like traveling through a living wormhole.
    const VORTEX_RIBBON_COUNT = isMobile ? 8 : 10;
    const VORTEX_RIBBON_SEGMENTS = isMobile ? 120 : 220;
    const vortexRibbons = [];

    for (let r = 0; r < VORTEX_RIBBON_COUNT; r++) {
      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array((VORTEX_RIBBON_SEGMENTS + 1) * 3);

      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

      const material = new THREE.LineBasicMaterial({
        color: palette[r % palette.length],
        transparent: true,
        // CHANGED: higher base opacity (was 0.22)
        opacity: 0.55,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });

      const line = new THREE.Line(geometry, material);
      line.frustumCulled = false;

      line.userData = {
        phase: (r / VORTEX_RIBBON_COUNT) * TAU,
        radius: THREE.MathUtils.randFloat(7.5, 16),
        twist: THREE.MathUtils.randFloat(0.75, 1.7),
        speed: THREE.MathUtils.randFloat(0.7, 1.45),
        direction: r % 2 === 0 ? 1 : -1,
      };

      vortexRibbons.push(line);
      vortexGroup.add(line);
    }

    // -----------------------------
    // Background deep stars
    // -----------------------------
    const STAR_COUNT = isMobile ? 500 : 900;
    const starPositions = new Float32Array(STAR_COUNT * 3);
    const starColors = new Float32Array(STAR_COUNT * 3);

    for (let i = 0; i < STAR_COUNT; i++) {
      const radius = 35 + Math.random() * 85;
      const theta = Math.random() * TAU;
      const phi = Math.acos(THREE.MathUtils.randFloatSpread(2));

      starPositions[i * 3] = Math.sin(phi) * Math.cos(theta) * radius;
      starPositions[i * 3 + 1] = Math.cos(phi) * radius;
      starPositions[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * radius;

      const color = new THREE.Color(palette[i % palette.length]);
      color.multiplyScalar(THREE.MathUtils.randFloat(0.25, 0.8));

      starColors[i * 3] = color.r;
      starColors[i * 3 + 1] = color.g;
      starColors[i * 3 + 2] = color.b;
    }

    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    starGeometry.setAttribute("color", new THREE.BufferAttribute(starColors, 3));

    const starMaterial = new THREE.PointsMaterial({
      size: isMobile ? 0.034 : 0.026,
      vertexColors: true,
      transparent: true,
      opacity: 0.36,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const stars = new THREE.Points(starGeometry, starMaterial);
    scene.add(stars);

    // -----------------------------
    // Voice-reactive particle entity
    // -----------------------------
    // GPU-DRIVEN entity field: base position + orbit + per-particle randoms are
    // static attributes; the voice-reactive motion runs in the vertex shader.
    // (phase/wave are accumulators in the old CPU loop — expressed here as time
    // integrals of the current audio uniforms: exact when idle, imperceptibly
    // approximate during speech.)
    const PARTICLE_COUNT = isMobile ? 2200 : 5200;
    const particlePositions = new Float32Array(PARTICLE_COUNT * 3); // placeholder slot
    const particleColors = new Float32Array(PARTICLE_COUNT * 3);
    const pBase = new Float32Array(PARTICLE_COUNT * 3);
    const pOrbit = new Float32Array(PARTICLE_COUNT);
    const pPhase = new Float32Array(PARTICLE_COUNT);
    const pSpeed = new Float32Array(PARTICLE_COUNT);
    const pWave = new Float32Array(PARTICLE_COUNT);
    const pSylW = new Float32Array(PARTICLE_COUNT);
    const pSibW = new Float32Array(PARTICLE_COUNT);

    const goldenAngle = Math.PI * (3 - Math.sqrt(5));

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const shellMix = Math.random();
      let baseX;
      let baseY;
      let baseZ;
      let orbitRadius;

      if (shellMix > 0.45) {
        const y = 1 - (i / (PARTICLE_COUNT - 1)) * 2;
        const radius = Math.sqrt(Math.max(0, 1 - y * y));
        const theta = goldenAngle * i;
        baseX = Math.cos(theta) * radius;
        baseY = y;
        baseZ = Math.sin(theta) * radius;
        orbitRadius = 1.8 + Math.random() * 4.8;
      } else {
        const arm = i % 7;
        const radius = 0.4 + Math.pow(Math.random(), 0.55) * 6.2;
        const angle =
          (arm / 7) * TAU +
          radius * 0.82 +
          THREE.MathUtils.randFloatSpread(0.42);
        baseX = Math.cos(angle);
        baseY = THREE.MathUtils.randFloatSpread(0.16 + radius * 0.03);
        baseZ = Math.sin(angle);
        orbitRadius = radius;
      }

      pBase[i * 3] = baseX;
      pBase[i * 3 + 1] = baseY;
      pBase[i * 3 + 2] = baseZ;
      pOrbit[i] = orbitRadius;
      pPhase[i] = Math.random() * TAU;
      pSpeed[i] = 0.25 + Math.random() * 0.95;
      pWave[i] = Math.random() * TAU;
      pSylW[i] = Math.random();
      pSibW[i] = Math.random();

      const color = new THREE.Color(palette[i % palette.length]);
      color.offsetHSL(
        THREE.MathUtils.randFloatSpread(0.02),
        0,
        THREE.MathUtils.randFloatSpread(0.08)
      );
      particleColors[i * 3] = color.r;
      particleColors[i * 3 + 1] = color.g;
      particleColors[i * 3 + 2] = color.b;
    }

    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
    particleGeometry.setAttribute("aColor", new THREE.BufferAttribute(particleColors, 3));
    particleGeometry.setAttribute("aBase", new THREE.BufferAttribute(pBase, 3));
    particleGeometry.setAttribute("aOrbit", new THREE.BufferAttribute(pOrbit, 1));
    particleGeometry.setAttribute("aPhase", new THREE.BufferAttribute(pPhase, 1));
    particleGeometry.setAttribute("aSpeed", new THREE.BufferAttribute(pSpeed, 1));
    particleGeometry.setAttribute("aWave", new THREE.BufferAttribute(pWave, 1));
    particleGeometry.setAttribute("aSylW", new THREE.BufferAttribute(pSylW, 1));
    particleGeometry.setAttribute("aSibW", new THREE.BufferAttribute(pSibW, 1));

    const particleMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uVoice: { value: 0 }, uSyllable: { value: 0 },
        uClarity: { value: 0 }, uSibilance: { value: 0 }, uBody: { value: 0 },
        uPlosive: { value: 0 }, uSize: { value: isMobile ? 0.045 : 0.035 },
        uOpacity: { value: 0.88 }, uScale: { value: 800 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        uniform float uTime, uVoice, uSyllable, uClarity, uSibilance, uBody, uPlosive, uSize, uScale;
        attribute vec3 aColor, aBase;
        attribute float aOrbit, aPhase, aSpeed, aWave, aSylW, aSibW;
        varying vec3 vColor;
        void main() {
          vColor = aColor;
          float phase = aPhase + uTime * aSpeed * (0.65 + uVoice * 4.2 + uSyllable * 3.5);
          float wave  = aWave  + uTime * (1.1 + uClarity * 8.0 + uSibilance * 10.0);
          float vowelExpansion = uBody * 0.92 + uVoice * 0.32;
          float speechRipple = sin(uTime * 4.0 + phase * 3.6 + aBase.y * 9.0) * uClarity * 0.58;
          float breathMotion = sin(uTime * 1.6 + wave) * uVoice * 0.28;
          float plosiveBurst = uPlosive * pow(max(0.0, sin(phase + uTime * 7.0)), 2.0) * 1.18 * (0.45 + aSylW);
          float syllableShockwave = uSyllable * sin(aOrbit * 2.2 - uTime * 10.0 + phase) * 0.52 * aSylW;
          float sibilanceSpark = sin(wave * 2.0 + uTime * 18.0) * uSibilance * 0.5 * (0.25 + aSibW);
          float radius = aOrbit * (1.0 + vowelExpansion * 0.28)
            + speechRipple + breathMotion + plosiveBurst + syllableShockwave + sibilanceSpark;
          float twist = sin(uTime * 0.45 + phase) * (0.05 + uClarity * 0.18 + uSyllable * 0.14);
          float x = aBase.x * radius;
          float y = aBase.y * radius;
          float z = aBase.z * radius;
          vec3 p = vec3(
            x * cos(twist) - z * sin(twist),
            y + sin(uTime * 2.0 + wave) * uSibilance * 0.18,
            x * sin(twist) + z * cos(twist)
          );
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = uSize * uScale / max(-mv.z, 0.1);
        }
      `,
      fragmentShader: `
        uniform float uOpacity;
        varying vec3 vColor;
        void main() {
          vec2 d = gl_PointCoord - vec2(0.5);
          float dist = dot(d, d);
          if (dist > 0.25) discard;
          float alpha = smoothstep(0.25, 0.0, dist);
          gl_FragColor = vec4(vColor, alpha * uOpacity);
        }
      `,
    });

    const particleSystem = new THREE.Points(particleGeometry, particleMaterial);
    particleSystem.frustumCulled = false;
    universe.add(particleSystem);

    // Central entity core sphere removed (overlaid logo)

    const outerCoreGeometry = new THREE.SphereGeometry(1.25, 96, 96);
    const outerCoreMaterial = new THREE.MeshBasicMaterial({
      color: COLORS.cyan,
      transparent: true,
      opacity: 0.15,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const outerCore = new THREE.Mesh(outerCoreGeometry, outerCoreMaterial);
    coreGroup.add(outerCore);

    const haloGeometry = new THREE.SphereGeometry(2.3, 96, 96);
    const haloMaterial = new THREE.MeshBasicMaterial({
      color: COLORS.violet,
      transparent: true,
      opacity: 0.055,
      side: THREE.BackSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const halo = new THREE.Mesh(haloGeometry, haloMaterial);
    coreGroup.add(halo);

    // -----------------------------
    // Orbital rings
    // -----------------------------
    const rings = [];
    const ringCount = 9;
    const ringSegments = 360;

    for (let r = 0; r < ringCount; r++) {
      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array((ringSegments + 1) * 3);

      for (let i = 0; i <= ringSegments; i++) {
        const angle = (i / ringSegments) * TAU;
        positions[i * 3] = Math.cos(angle);
        positions[i * 3 + 1] = Math.sin(angle);
        positions[i * 3 + 2] = 0;
      }

      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

      const material = new THREE.LineBasicMaterial({
        color: palette[r % palette.length],
        transparent: true,
        opacity: 0.26,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });

      const ring = new THREE.Line(geometry, material);

      ring.scale.setScalar(1.65 + r * 0.34);
      ring.rotation.x = Math.PI / 2.55 + r * 0.16;
      ring.rotation.y = r * 0.43;
      ring.rotation.z = r * 0.19;

      ring.userData = {
        baseScale: 1.65 + r * 0.34,
        direction: r % 2 === 0 ? 1 : -1,
        speechBias: 1 - r / ringCount,
      };

      rings.push(ring);
      coreGroup.add(ring);
    }

    // -----------------------------
    // Voice waveform ribbons
    // -----------------------------
    const waveLines = [];
    const waveCount = 6;
    const waveSegments = isMobile ? 220 : 420;

    for (let w = 0; w < waveCount; w++) {
      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array((waveSegments + 1) * 3);

      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

      const material = new THREE.LineBasicMaterial({
        color: palette[w % palette.length],
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });

      const line = new THREE.Line(geometry, material);
      line.rotation.x = Math.PI / 2 + w * 0.08;
      line.rotation.z = w * 0.38;

      line.userData = {
        baseRadius: 1.3 + w * 0.48,
        direction: w % 2 === 0 ? 1 : -1,
        harmonic: 4 + w * 2,
        phase: Math.random() * TAU,
      };

      waveLines.push(line);
      universe.add(line);
    }

    // -----------------------------
    // Spectral crown
    // -----------------------------
    const barCount = isMobile ? 96 : 160;
    const barGeometry = new THREE.BoxGeometry(0.045, 1, 0.06);
    barGeometry.translate(0, 0.5, 0);

    const barMaterial = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const spectralCrown = new THREE.InstancedMesh(barGeometry, barMaterial, barCount);
    spectralCrown.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    spectralCrown.frustumCulled = false;

    for (let i = 0; i < barCount; i++) {
      const color = new THREE.Color(palette[i % palette.length]);
      spectralCrown.setColorAt(i, color);
    }

    if (spectralCrown.instanceColor) {
      spectralCrown.instanceColor.needsUpdate = true;
    }

    universe.add(spectralCrown);

    // -----------------------------
    // Shards
    // -----------------------------
    const shardCount = isMobile ? 44 : 96;
    const shardGeometry = new THREE.TetrahedronGeometry(0.12, 0);
    const shardMaterial = new THREE.MeshBasicMaterial({
      color: COLORS.ice,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const shards = new THREE.InstancedMesh(shardGeometry, shardMaterial, shardCount);
    shards.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    shards.frustumCulled = false;

    const shardInfo = [];

    for (let i = 0; i < shardCount; i++) {
      shardInfo.push({
        direction: new THREE.Vector3().setFromSphericalCoords(
          1,
          Math.acos(THREE.MathUtils.randFloatSpread(2)),
          Math.random() * TAU
        ),
        radius: THREE.MathUtils.randFloat(2.0, 6.5),
        speed: THREE.MathUtils.randFloat(0.25, 0.9),
        phase: Math.random() * TAU,
        scale: THREE.MathUtils.randFloat(0.5, 1.75),
        syllableWeight: Math.random(),
      });
    }

    universe.add(shards);

    // -----------------------------
    // Radial speech beams
    // -----------------------------
    const BEAM_COUNT = isMobile ? 36 : 68;
    const beamPositions = new Float32Array(BEAM_COUNT * 2 * 3);
    const beamColors = new Float32Array(BEAM_COUNT * 2 * 3);
    const beamInfo = [];

    for (let i = 0; i < BEAM_COUNT; i++) {
      const direction = new THREE.Vector3().setFromSphericalCoords(
        1,
        Math.acos(THREE.MathUtils.randFloatSpread(2)),
        Math.random() * TAU
      );

      beamInfo.push({
        direction,
        length: THREE.MathUtils.randFloat(3.2, 7.4),
        phase: Math.random() * TAU,
      });

      const color = new THREE.Color(palette[i % palette.length]);

      beamColors[i * 6] = color.r;
      beamColors[i * 6 + 1] = color.g;
      beamColors[i * 6 + 2] = color.b;
      beamColors[i * 6 + 3] = color.r;
      beamColors[i * 6 + 4] = color.g;
      beamColors[i * 6 + 5] = color.b;
    }

    const beamGeometry = new THREE.BufferGeometry();
    beamGeometry.setAttribute("position", new THREE.BufferAttribute(beamPositions, 3));
    beamGeometry.setAttribute("color", new THREE.BufferAttribute(beamColors, 3));

    const beamMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const beams = new THREE.LineSegments(beamGeometry, beamMaterial);
    beams.frustumCulled = false;
    universe.add(beams);

    // -----------------------------
    // Cinematic direction state
    // -----------------------------
    const spatialState = {
      vortexTravel: 0,
      spinDirection: 1,
      targetSpinDirection: 1,
      spinImpulse: 0,

      yaw: 0,
      pitch: 0,
      roll: 0,

      targetYaw: 0,
      targetPitch: 0,
      targetRoll: 0,

      cameraRoll: 0,
      targetCameraRoll: 0,

      lastSyllableCount: 0,
      directionShift: 0,
    };

    const dummy = new THREE.Object3D();
    const desiredCamera = new THREE.Vector3();
    const lookTarget = new THREE.Vector3();

    const triggerSpatialShift = (syllablePower) => {
      const side = Math.random() > 0.5 ? 1 : -1;

      spatialState.targetSpinDirection *= Math.random() > 0.28 ? -1 : 1;
      spatialState.spinImpulse = 1.0 + syllablePower * 1.4;

      spatialState.targetYaw = THREE.MathUtils.randFloatSpread(0.42) + side * 0.22;
      spatialState.targetPitch = THREE.MathUtils.randFloatSpread(0.28);
      spatialState.targetRoll = side * THREE.MathUtils.randFloat(0.12, 0.32);

      spatialState.targetCameraRoll = side * THREE.MathUtils.randFloat(0.035, 0.09);
      spatialState.directionShift = 1;
    };

    const fillDemoVoice = (audioState, timeMs) => {
      const t = timeMs * 0.001;
      const frequencyData = audioState.frequencyData;

      if (!frequencyData) return;

      const syllableClock =
        Math.pow(Math.max(0, Math.sin(t * 5.1)), 10) +
        Math.pow(Math.max(0, Math.sin(t * 3.7 + 1.4)), 14) * 0.75 +
        Math.pow(Math.max(0, Math.sin(t * 6.8 + 2.1)), 16) * 0.45;

      const phraseShape = Math.sin(t * 0.72) * 0.5 + 0.5;
      const speakingGate = phraseShape > 0.22 ? 1 : 0;

      const plosive = clamp01(syllableClock * 0.95 * speakingGate);
      const body = clamp01(
        (0.22 + syllableClock * 0.48 + Math.sin(t * 2.1) * 0.08) *
          speakingGate
      );
      const clarity = clamp01(
        (0.18 + syllableClock * 0.62 + Math.sin(t * 3.2 + 0.8) * 0.1) *
          speakingGate
      );
      const sibilance = clamp01(
        (0.1 +
          Math.pow(Math.max(0, Math.sin(t * 9.0 + 1.7)), 8) * 0.55) *
          speakingGate
      );

      for (let i = 0; i < frequencyData.length; i++) {
        const n = i / Math.max(1, frequencyData.length - 1);

        const lowPeak = Math.exp(-Math.pow(n - 0.015, 2) * 2800) * plosive;
        const bodyPeak = Math.exp(-Math.pow(n - 0.055, 2) * 900) * body;
        const clarityPeak = Math.exp(-Math.pow(n - 0.18, 2) * 120) * clarity;
        const sibilancePeak = Math.exp(-Math.pow(n - 0.48, 2) * 70) * sibilance;
        const texture = (Math.sin(i * 0.21 + t * 11) * 0.5 + 0.5) * 0.045;

        frequencyData[i] = Math.floor(
          clamp01(
            lowPeak +
              bodyPeak +
              clarityPeak +
              sibilancePeak +
              texture * speakingGate
          ) * 255
        );
      }

      audioState.voicePlosive = plosive;
      audioState.voiceBody = body;
      audioState.voiceClarity = clarity;
      audioState.voiceSibilance = sibilance;
      audioState.voiceLevel = clamp01(
        plosive * 0.24 + body * 0.34 + clarity * 0.34 + sibilance * 0.12
      );

      audioState.bassLevel = audioState.voicePlosive;
      audioState.midLevel = audioState.voiceBody;
      audioState.trebleLevel = audioState.voiceSibilance;
      audioState.audioLevel = audioState.voiceLevel;

      audioState.vadScore = speakingGate ? clamp01(audioState.voiceLevel * 2.4) : 0;
      audioState.isSpeaking = speakingGate > 0;

      if (audioState.isSpeaking) {
        audioState.lastVoiceTime = timeMs;
      }

      const shouldPulse =
        speakingGate && syllableClock > 0.72 && timeMs - audioState.lastSyllableTime > 135;

      if (shouldPulse) {
        audioState.syllablePulse = 1;
        audioState.lastSyllableTime = timeMs;
        audioState.syllableCount += 1;
      } else {
        audioState.syllablePulse *= 0.84;
      }
    };

    const analyzeAudio = (timeMs) => {
      const audioState = audioRef.current;

      if (audioState.demoMode) {
        fillDemoVoice(audioState, timeMs);
        return;
      }

      if (!audioState.analyser || !audioState.frequencyData || !audioState.timeData) {
        audioState.audioLevel = 0;
        audioState.bassLevel = 0;
        audioState.midLevel = 0;
        audioState.trebleLevel = 0;

        audioState.voiceLevel = 0;
        audioState.voicePlosive = 0;
        audioState.voiceBody = 0;
        audioState.voiceClarity = 0;
        audioState.voiceSibilance = 0;

        audioState.vadScore = 0;
        audioState.isSpeaking = false;
        audioState.syllablePulse *= 0.86;

        return;
      }

      const {
        analyser,
        frequencyData,
        previousFrequencyData,
        timeData,
        audioContext,
      } = audioState;

      analyser.getByteFrequencyData(frequencyData);
      analyser.getByteTimeDomainData(timeData);

      const sampleRate = audioContext?.sampleRate || 44100;

      const plosive = averageFrequencyRange(frequencyData, sampleRate, 70, 220);
      const body = averageFrequencyRange(frequencyData, sampleRate, 220, 900);
      const clarity = averageFrequencyRange(frequencyData, sampleRate, 900, 3500);
      const sibilance = averageFrequencyRange(frequencyData, sampleRate, 4500, 9000);

      let rms = 0;
      let zeroCrossings = 0;
      let previousSign = 0;

      for (let i = 0; i < timeData.length; i++) {
        const value = (timeData[i] - 128) / 128;
        rms += value * value;

        const sign = value >= 0 ? 1 : -1;

        if (i > 0 && sign !== previousSign) {
          zeroCrossings += 1;
        }

        previousSign = sign;
      }

      rms = Math.sqrt(rms / timeData.length);

      const zeroCrossingRate = zeroCrossings / timeData.length;

      audioState.voicePlosive = clamp01(plosive * 1.45);
      audioState.voiceBody = clamp01(body * 1.35);
      audioState.voiceClarity = clamp01(clarity * 1.65);
      audioState.voiceSibilance = clamp01(sibilance * 1.85);

      audioState.voiceLevel = clamp01(
        audioState.voicePlosive * 0.22 +
          audioState.voiceBody * 0.34 +
          audioState.voiceClarity * 0.34 +
          audioState.voiceSibilance * 0.1 +
          rms * 0.82
      );

      audioState.bassLevel = audioState.voicePlosive;
      audioState.midLevel = audioState.voiceBody;
      audioState.trebleLevel = audioState.voiceSibilance;
      audioState.audioLevel = audioState.voiceLevel;

      const rawVoiceEnergy = clamp01(
        rms * 1.15 +
          audioState.voiceBody * 0.42 +
          audioState.voiceClarity * 0.48 +
          audioState.voiceSibilance * 0.08
      );

      const likelySpeechShape =
        audioState.voiceBody * 0.42 +
        audioState.voiceClarity * 0.5 +
        Math.min(zeroCrossingRate * 8.0, 0.18);

      if (!audioState.isSpeaking || rawVoiceEnergy < audioState.noiseFloor) {
        audioState.noiseFloor = lerp(audioState.noiseFloor, rawVoiceEnergy, 0.018);
      } else {
        audioState.noiseFloor = lerp(audioState.noiseFloor, rawVoiceEnergy, 0.002);
      }

      audioState.noiseFloor = THREE.MathUtils.clamp(audioState.noiseFloor, 0.008, 0.18);

      const energyAboveNoise = Math.max(
        0,
        rawVoiceEnergy - audioState.noiseFloor * 1.28
      );

      const vadScore = clamp01(
        energyAboveNoise * 4.2 +
          likelySpeechShape * 1.15 +
          audioState.voiceLevel * 0.42
      );

      audioState.vadScore = vadScore;

      const speakOnThreshold = 0.28;
      const speakOffThreshold = 0.16;
      const holdMs = 260;

      if (vadScore > speakOnThreshold) {
        if (!audioState.isSpeaking) {
          audioState.speechStartedAt = timeMs;
        }

        audioState.isSpeaking = true;
        audioState.lastVoiceTime = timeMs;
      } else if (
        audioState.isSpeaking &&
        vadScore < speakOffThreshold &&
        timeMs - audioState.lastVoiceTime > holdMs
      ) {
        audioState.isSpeaking = false;
      }

      const syllableEnvelopeTarget = clamp01(
        audioState.voiceBody * 0.42 +
          audioState.voiceClarity * 0.42 +
          audioState.voicePlosive * 0.16 +
          rms * 0.55
      );

      audioState.previousSyllableEnvelope = audioState.syllableEnvelope;
      audioState.syllableEnvelope = lerp(
        audioState.syllableEnvelope,
        syllableEnvelopeTarget,
        0.32
      );

      const envelopeRise = Math.max(
        0,
        audioState.syllableEnvelope - audioState.previousSyllableEnvelope
      );

      const voiceStartIndex = getFrequencyIndex(frequencyData, sampleRate, 220);
      const voiceEndIndex = getFrequencyIndex(frequencyData, sampleRate, 3500);

      let spectralFlux = 0;

      if (previousFrequencyData) {
        for (let i = voiceStartIndex; i <= voiceEndIndex; i++) {
          const diff = frequencyData[i] - previousFrequencyData[i];

          if (diff > 0) {
            spectralFlux += diff;
          }

          previousFrequencyData[i] = frequencyData[i];
        }
      }

      const fluxBinCount = Math.max(1, voiceEndIndex - voiceStartIndex + 1);
      spectralFlux = clamp01(spectralFlux / (fluxBinCount * 52));

      audioState.spectralFlux = spectralFlux;

      audioState.plosiveRise = Math.max(
        0,
        audioState.voicePlosive - audioState.previousPlosive
      );

      audioState.previousPlosive = audioState.voicePlosive;

      const syllableSignal = clamp01(
        envelopeRise * 4.6 +
          spectralFlux * 0.72 +
          audioState.plosiveRise * 0.42
      );

      const syllableHistory = audioState.syllableHistory;
      syllableHistory.push(syllableSignal);

      if (syllableHistory.length > 42) {
        syllableHistory.shift();
      }

      const syllableAverage =
        syllableHistory.reduce((sum, value) => sum + value, 0) /
        Math.max(1, syllableHistory.length);

      const variance =
        syllableHistory.reduce(
          (sum, value) => sum + Math.pow(value - syllableAverage, 2),
          0
        ) / Math.max(1, syllableHistory.length);

      const syllableDeviation = Math.sqrt(variance);

      const syllableThreshold = Math.max(
        0.06,
        syllableAverage + syllableDeviation * 1.15
      );

      const minSyllableGapMs = 115;
      const strongEnoughVoice =
        audioState.isSpeaking &&
        audioState.voiceLevel > Math.max(0.045, audioState.noiseFloor * 1.35);

      if (
        strongEnoughVoice &&
        syllableSignal > syllableThreshold &&
        timeMs - audioState.lastSyllableTime > minSyllableGapMs
      ) {
        audioState.syllablePulse = 1;
        audioState.lastSyllableTime = timeMs;
        audioState.syllableCount += 1;
      } else {
        audioState.syllablePulse *= 0.84;
      }
    };

    // ── Panel-select 3D nodes ────────────────────────────────────────────────
    const makeLabelSprite = (text, accentHex) => {
      const cv = document.createElement("canvas");
      cv.width = 256; cv.height = 52;
      const ctx2 = cv.getContext("2d");
      ctx2.clearRect(0, 0, 256, 52);
      ctx2.font = "bold 15px monospace";
      ctx2.textAlign = "center";
      ctx2.fillStyle = accentHex;
      ctx2.shadowColor = accentHex;
      ctx2.shadowBlur = 10;
      ctx2.fillText(text, 128, 34);
      const tex = new THREE.CanvasTexture(cv);
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(2.6, 0.5, 1);
      return { sprite, mat };
    };

    const createParticleSphere = (color, radius, count, size) => {
      const positions = new Float32Array(count * 3);
      const colors = new Float32Array(count * 3);
      const base = new THREE.Color(color);
      for (let i = 0; i < count; i++) {
        const u = Math.random();
        const v = Math.random();
        const theta = 2 * Math.PI * u;
        const phi = Math.acos(2 * v - 1);
        const r = radius * (0.86 + Math.random() * 0.18);
        const px = Math.sin(phi) * Math.cos(theta) * r;
        const py = Math.sin(phi) * Math.sin(theta) * r;
        const pz = Math.cos(phi) * r;
        positions[i * 3] = px;
        positions[i * 3 + 1] = py;
        positions[i * 3 + 2] = pz;

        // Depth cue: front hemisphere brighter, back hemisphere dimmer.
        const depthLight = THREE.MathUtils.clamp((pz / radius) * 0.5 + 0.5, 0, 1);
        const brightness = 0.34 + depthLight * 0.9;
        const c = base.clone().multiplyScalar(brightness);
        colors[i * 3] = c.r;
        colors[i * 3 + 1] = c.g;
        colors[i * 3 + 2] = c.b;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      const mat = new THREE.PointsMaterial({
        color,
        vertexColors: true,
        size,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const points = new THREE.Points(geo, mat);
      return { points, mat };
    };

    const createPanelNode = (panel, x, y, z, scale = 1) => {
      const color = new THREE.Color(panel.accent);

      const geo = new THREE.SphereGeometry(0.18 * scale, 20, 20);
      const mat = new THREE.MeshStandardMaterial({
        color,
        emissive: color.clone().multiplyScalar(0.5),
        emissiveIntensity: 0.35,
        roughness: 0.28,
        metalness: 0.18,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const sphere = new THREE.Mesh(geo, mat);
      sphere.position.set(x, y, z);

      const glowGeo = new THREE.SphereGeometry(0.34 * scale, 16, 16);
      const glowMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
      const glow = new THREE.Mesh(glowGeo, glowMat);
      glow.position.set(x, y, z);

      const ringGeo = new THREE.TorusGeometry(0.29 * scale, 0.022 * scale, 18, 54);
      const ringMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.set(x, y, z);

      // Back-side shade shell to force a stronger 3D silhouette.
      const shadeGeo = new THREE.SphereGeometry(0.26 * scale, 16, 16);
      const shadeMat = new THREE.MeshBasicMaterial({
        color: 0x020914,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.NormalBlending,
        side: THREE.BackSide,
      });
      const shade = new THREE.Mesh(shadeGeo, shadeMat);
      shade.position.set(x - 0.03 * scale, y - 0.02 * scale, z - 0.09);

      // Circular aura plate (replaces harsh square hover plate)
      const plateGeo = new THREE.CircleGeometry(0.9 * scale, 36);
      const plateMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const plate = new THREE.Mesh(plateGeo, plateMat);
      plate.position.set(x, y - 0.1 * scale, z - 0.06);
      plate.scale.set(1.65, 0.96, 1);

      // Particle sphere cluster shell
      const { points: particleShell, mat: shellMat } = createParticleSphere(color, 0.33 * scale, 110, 0.013 * scale);
      particleShell.position.set(x, y, z);
      const { points: particleCore, mat: coreMat } = createParticleSphere(color, 0.22 * scale, 70, 0.016 * scale);
      particleCore.position.set(x, y, z);

      const hitGeo = new THREE.SphereGeometry(0.48 * scale, 12, 12);
      const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
      const hit = new THREE.Mesh(hitGeo, hitMat);
      hit.position.set(x, y, z);

      const { sprite: label, mat: labelMat } = makeLabelSprite(panel.label, panel.accent);
      label.position.set(x, y - 0.46 * scale, z);
      label.scale.multiplyScalar(scale);

      scene.add(plate, shade, sphere, glow, ring, particleShell, particleCore, hit, label);
      return {
        panel, sphere, glow, ring, hit, plate, shade, particleShell, particleCore,
        mat, glowMat, ringMat, shadeMat, plateMat, shellMat, coreMat,
        label, labelMat, x, y, z, scale, labelOffset: 0.46 * scale,
      };
    };

    const overviewNode = createPanelNode(OVERVIEW_PANEL, 0, 3.55, 3.7, 1.0);

    // ── Two-tier sector system ──────────────────────────────────────────────
    // Sector nodes sit at fixed positions. When a sector is opened, its panel
    // nodes bloom onto a rotating orbital ring centred at the sector hub.
    // clusterX/Y are recomputed each frame from clusterOrbitAngleRef.
    const CLUSTER_LAYOUT = {
      // Threat Intel hub: (-4.5,1.0)
      "threat-overview":   { sx: -4.5, sy: 1.0, sz: 3.8,  cz: 3.72 },
      "threat-vectors":    { sx: -4.5, sy: 1.0, sz: 3.8,  cz: 3.85 },
      "threat-timeline":   { sx: -4.5, sy: 1.0, sz: 3.8,  cz: 3.75 },
      "system-health":     { sx: -4.5, sy: 1.0, sz: 3.8,  cz: 3.85 },
      // Network & Access hub: (-1.5,-2.5)
      "network":           { sx: -1.5, sy: -2.5, sz: 3.85, cz: 3.80 },
      "live-logs":         { sx: -1.5, sy: -2.5, sz: 3.85, cz: 3.85 },
      "identity-sessions": { sx: -1.5, sy: -2.5, sz: 3.85, cz: 3.80 },
      // Command hub: (1.5,1.5)
      "ai-spm":            { sx: 1.5,  sy: 1.5,  sz: 3.9,  cz: 3.85 },
      "aria-center":       { sx: 1.5,  sy: 1.5,  sz: 3.9,  cz: 3.90 },
      "decision-engine":   { sx: 1.5,  sy: 1.5,  sz: 3.9,  cz: 3.85 },
      "trust-ladder":      { sx: 1.5,  sy: 1.5,  sz: 3.9,  cz: 3.85 },
      // Response hub: (5.0,-0.5)
      "incident-feed":     { sx: 5.0,  sy: -0.5, sz: 3.8,  cz: 3.82 },
      "blocked-ips":       { sx: 5.0,  sy: -0.5, sz: 3.8,  cz: 3.75 },
      "quarantine":        { sx: 5.0,  sy: -0.5, sz: 3.8,  cz: 3.78 },
      "security-admin":    { sx: 5.0,  sy: -0.5, sz: 3.8,  cz: 3.82 },
      "policy-change":     { sx: 5.0,  sy: -0.5, sz: 3.8,  cz: 3.80 },
    };

    // Panel nodes: start at sector hub, bloom to ring positions (set dynamically)
    const workspaceNodes = PANELS.map((panel) => {
      const layout = CLUSTER_LAYOUT[panel.id] || { sx: 0, sy: 0, sz: 3.8, cz: 3.8 };
      const node = createPanelNode(panel, layout.sx, layout.sy, layout.sz);
      // Initial cluster positions will be overwritten by ring animation each frame
      node.clusterX = layout.sx;
      node.clusterY = layout.sy;
      node.clusterZ = layout.cz;
      node.clusterCZ = layout.cz; // store target z
      node.sectorCX  = layout.sx;
      node.sectorCY  = layout.sy;
      node.sectorCZ  = layout.sz;
      return node;
    });

    // ── createSectorGalaxyNode — replaces plain sphere with a 3-D spiral galaxy ─
    // Each sector gets a live spiral galaxy made of Three.js Points. The returned
    // object is interface-compatible with createPanelNode so the animation loop
    // needs no changes: sphere/glow/ring/hit/plate/shade/particleShell/particleCore
    // are all present; only the visuals differ.
    const createSectorGalaxyNode = (sector, x, y, z) => {
      const scale  = 1.18;
      const color  = new THREE.Color(sector.accent);
      const TAU3   = Math.PI * 2;
      const N_CORE = 720;   // spiral arm + disc particles
      const N_HALO = 120;   // diffuse outer cloud
      const N_ALL  = N_CORE + N_HALO;
      const N_ARMS = 2;
      const DISC_TILT = 0.38;  // Y compression for disc perspective

      // ── Seeded RNG so each galaxy is deterministic ──────────────────────────
      let _s = Math.abs(sector.id.split("").reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 0)) || 7;
      const rng = () => { _s = (_s * 16807) % 2147483647; return (_s - 1) / 2147483646; };

      // ── Particle positions + colours ────────────────────────────────────────
      const positions = new Float32Array(N_ALL * 3);
      const colours   = new Float32Array(N_ALL * 3);
      const sizes     = new Float32Array(N_ALL);
      const R = 0.92 * scale;   // max disc radius in world units

      for (let i = 0; i < N_ALL; i++) {
        const isHalo = i >= N_CORE;
        let dist, angle, brightness;

        if (isHalo) {
          dist   = rng() * 0.44 + 0.52;
          angle  = rng() * TAU3;
          brightness = rng() * 0.18 + 0.04;
          sizes[i] = rng() * 0.022 + 0.008;
        } else {
          const arm    = i % N_ARMS;
          const armOff = (arm / N_ARMS) * TAU3;
          const ti     = Math.pow(rng(), 0.5);
          dist         = ti * 0.50 + 0.01;
          angle        = dist * TAU3 * 3.8 + armOff + (rng() - 0.5) * 1.1;
          brightness   = dist < 0.1
            ? rng() * 0.7 + 0.3
            : rng() * 0.55 + 0.15;
          sizes[i] = dist < 0.12 ? rng() * 0.04 + 0.018 : rng() * 0.022 + 0.006;
        }

        const wobble = Math.sin(angle * (rng() * 3 + 1)) * (isHalo ? 0.004 : 0.018);
        const rad    = (dist + wobble) * R;
        // Disc in XZ plane (will be tilted by group rotation)
        const px = Math.cos(angle) * rad;
        const py = Math.sin(angle) * rad * (isHalo ? 0.72 : DISC_TILT);
        const pz = (rng() - 0.5) * R * 0.07; // thin disc depth

        positions[i * 3]     = px;
        positions[i * 3 + 1] = py;
        positions[i * 3 + 2] = pz;

        // Colour: nucleus white → accent → dim halo
        let rc, gc, bc;
        if (isHalo) {
          rc = color.r * 0.5 + rng() * 0.15;
          gc = color.g * 0.5 + rng() * 0.15;
          bc = color.b * 0.5 + rng() * 0.15;
          brightness *= 0.6;
        } else if (dist < 0.08) {
          rc = 0.85 + rng() * 0.15; gc = 0.88 + rng() * 0.12; bc = 1.0;
        } else if (dist < 0.22) {
          const m = (dist - 0.08) / 0.14;
          rc = THREE.MathUtils.lerp(0.85, color.r, m);
          gc = THREE.MathUtils.lerp(0.88, color.g, m);
          bc = THREE.MathUtils.lerp(1.0,  color.b, m);
        } else {
          rc = color.r; gc = color.g; bc = color.b;
        }
        colours[i * 3]     = rc * brightness;
        colours[i * 3 + 1] = gc * brightness;
        colours[i * 3 + 2] = bc * brightness;
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geo.setAttribute("color",    new THREE.BufferAttribute(colours, 3));
      geo.setAttribute("size",     new THREE.BufferAttribute(sizes, 1));

      const mat = new THREE.PointsMaterial({
        vertexColors:  true,
        size:          0.028 * scale,
        transparent:   true,
        opacity:       0,
        depthWrite:    false,
        blending:      THREE.AdditiveBlending,
        sizeAttenuation: true,
      });

      const galaxy = new THREE.Points(geo, mat);
      // Tilt disc so it reads as a galaxy (not a flat circle)
      galaxy.rotation.x = 0.32 + rng() * 0.15;
      galaxy.rotation.z = rng() * 0.25;
      galaxy.position.set(x, y, z);

      // ── Nucleus glow ────────────────────────────────────────────────────────
      const glowGeo = new THREE.SphereGeometry(0.22 * scale, 16, 16);
      const glowMat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const glow = new THREE.Mesh(glowGeo, glowMat);
      glow.position.set(x, y, z);

      // ── Invisible compatibility ring. The old oval ring made sector nodes feel
      // oversized; keep the object for animation plumbing but do not render it.
      const ringGeo = new THREE.TorusGeometry(0.62 * scale, 0.012 * scale, 8, 64);
      const ringMat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.set(x, y, z);
      ring.rotation.x = galaxy.rotation.x + 0.22;
      ring.rotation.z = galaxy.rotation.z + 0.12;

      // ── Dummy required objects (invisible, keep interface compatible) ────────
      const mkDummy = (r = 0.01) => {
        const m = new THREE.Mesh(
          new THREE.SphereGeometry(r, 4, 4),
          new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
        );
        m.position.set(x, y, z);
        return m;
      };
      const shade        = mkDummy(); const shadeMat  = shade.material;
      const plate        = mkDummy(); const plateMat  = plate.material;
      const hit          = mkDummy(0.55 * scale);
      const particleShell = mkDummy(); const shellMat = particleShell.material;
      const particleCore  = mkDummy(); const coreMat  = particleCore.material;

      // ── Label sprite ────────────────────────────────────────────────────────
      const { sprite: label, mat: labelMat } = makeLabelSprite(sector.label, sector.accent);
      label.position.set(x, y - 0.62 * scale, z);
      label.scale.multiplyScalar(scale);

      scene.add(galaxy, glow, ring, shade, plate, hit, particleShell, particleCore, label);

      return {
        panel:    { id: "sector:" + sector.id, label: sector.label, accent: sector.accent },
        sphere:   galaxy,   // animation loop drives this as the main visual
        glow,               glowMat,
        ring,               ringMat,
        shade,              shadeMat,
        plate,              plateMat,
        hit,
        particleShell,      shellMat,
        particleCore,       coreMat,
        mat,                // galaxy PointsMaterial — opacity driven by animateNode
        label,              labelMat,
        x, y, z,
        scale,
        labelOffset: 0.62 * scale,
        isGalaxy: true,     // flag for tweaked rotation in animate loop
      };
    };

    // Sector nodes: live spiral galaxies, one per sector, shown in sector map view
    const sectorMeshNodes = SECTORS.map((sector) => {
      const sNode = createSectorGalaxyNode(sector, sector.x, sector.y, sector.z);
      sNode.sectorId = sector.id;
      return sNode;
    });

    const psNodes = [overviewNode, ...workspaceNodes];
    psNodes.forEach((node) => {
      node.group = panelSector(node.panel.id)?.id || "core";
    });

    // ── Cluster orbital ring visual ────────────────────────────────────────────
    // Shown around the active sector hub when in cluster view; hidden otherwise.
    const orbitRingGeo = new THREE.TorusGeometry(CLUSTER_RING_RADIUS, 0.018, 8, 160);
    const orbitRingMat = new THREE.MeshBasicMaterial({
      color: 0x1687ff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const orbitRing3D = new THREE.Mesh(orbitRingGeo, orbitRingMat);
    scene.add(orbitRing3D);

    // Outer accent ring
    const orbitRingGeo2 = new THREE.TorusGeometry(CLUSTER_RING_RADIUS + 0.06, 0.007, 8, 160);
    const orbitRingMat2 = new THREE.MeshBasicMaterial({
      color: 0x63f5ff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const orbitRing3D2 = new THREE.Mesh(orbitRingGeo2, orbitRingMat2);
    scene.add(orbitRing3D2);

    // Connection lines: sector-to-sector for the top-level map
    const psLines = [];
    const link = (a, b, color = 0x1687ff) => {
      if (!a || !b) return;
      const lgeo = new THREE.BufferGeometry().setFromPoints([a.sphere.position.clone(), b.sphere.position.clone()]);
      const lmat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending });
      const ln = new THREE.Line(lgeo, lmat);
      scene.add(ln);
      psLines.push({ line: ln, mat: lmat, isSectorLine: true });
    };

    const getSector = (id) => sectorMeshNodes.find(n => n.sectorId === id);
    link(getSector("threat"),   getSector("command"),  0x63f5ff);
    link(getSector("command"),  getSector("net"),      0xa78bfa);
    link(getSector("command"),  getSector("response"), 0xa78bfa);
    link(getSector("threat"),   getSector("net"),      0x1687ff);

    panelNodesRef.current = psNodes;
    sectorNodesRef.current = sectorMeshNodes;
    // ────────────────────────────────────────────────────────────────────────

    let lastTime = performance.now();

    const animate = (time = 0) => {
      if (disposed) return;

      animationFrameId = requestAnimationFrame(animate);

      const dt = Math.min(0.05, Math.max(0.001, (time - lastTime) * 0.001));
      lastTime = time;

      analyzeAudio(time);

      const audioState = audioRef.current;

      const damp = (current, target, rate) => {
        return current + (target - current) * (1 - Math.exp(-rate * dt));
      };

      audioState.smoothedAudio = damp(audioState.smoothedAudio, audioState.audioLevel, 8.5);
      audioState.smoothedBass = damp(audioState.smoothedBass, audioState.bassLevel, 10);
      audioState.smoothedMid = damp(audioState.smoothedMid, audioState.midLevel, 8);
      audioState.smoothedTreble = damp(audioState.smoothedTreble, audioState.trebleLevel, 7);

      audioState.smoothedVoice = damp(audioState.smoothedVoice, audioState.voiceLevel, 10.5);
      audioState.smoothedVoicePlosive = damp(
        audioState.smoothedVoicePlosive,
        audioState.voicePlosive,
        16
      );
      audioState.smoothedVoiceBody = damp(
        audioState.smoothedVoiceBody,
        audioState.voiceBody,
        10
      );
      audioState.smoothedVoiceClarity = damp(
        audioState.smoothedVoiceClarity,
        audioState.voiceClarity,
        13
      );
      audioState.smoothedVoiceSibilance = damp(
        audioState.smoothedVoiceSibilance,
        audioState.voiceSibilance,
        18
      );

      audioState.smoothedVad = damp(audioState.smoothedVad, audioState.vadScore, 12);
      audioState.smoothedSyllablePulse = damp(
        audioState.smoothedSyllablePulse,
        audioState.syllablePulse,
        22
      );

      const isSilent =
        !audioState.demoMode &&
        (!audioState.analyser ||
          (!audioState.isSpeaking && audioState.smoothedVoice < 0.035));

      if (!audioState.demoMode && audioState.analyser) {
        if (audioState.isSpeaking && audioState.mode !== "speaking") {
          audioState.mode = "speaking";
          updateStatus("Speaking Detected", "speaking");
        } else if (!audioState.isSpeaking && audioState.mode !== "listening") {
          audioState.mode = "listening";
          updateStatus("Listening Mode", "listening");
        }
      }

      const t = time * 0.001;

      const idleEnergy = isSilent ? 0.035 : 0.012;

      const voice = Math.max(audioState.smoothedVoice, idleEnergy);
      const plosive = audioState.smoothedVoicePlosive;
      const body = audioState.smoothedVoiceBody;
      const clarity = audioState.smoothedVoiceClarity;
      const sibilance = audioState.smoothedVoiceSibilance;
      const vad = audioState.smoothedVad;
      const syllable = audioState.smoothedSyllablePulse;

      if (audioState.syllableCount !== spatialState.lastSyllableCount) {
        spatialState.lastSyllableCount = audioState.syllableCount;
        triggerSpatialShift(Math.max(0.45, audioState.syllablePulse));
      }

      spatialState.spinDirection = damp(
        spatialState.spinDirection,
        spatialState.targetSpinDirection,
        4.5
      );

      spatialState.yaw = damp(spatialState.yaw, spatialState.targetYaw, 2.2);
      spatialState.pitch = damp(spatialState.pitch, spatialState.targetPitch, 2.2);
      spatialState.roll = damp(spatialState.roll, spatialState.targetRoll, 2.8);

      spatialState.cameraRoll = damp(
        spatialState.cameraRoll,
        spatialState.targetCameraRoll,
        3.2
      );

      spatialState.spinImpulse = damp(spatialState.spinImpulse, 0, 3.6);
      spatialState.directionShift = damp(spatialState.directionShift, 0, 4.2);

      spatialState.targetYaw = damp(spatialState.targetYaw, 0, 0.55);
      spatialState.targetPitch = damp(spatialState.targetPitch, 0, 0.55);
      spatialState.targetRoll = damp(spatialState.targetRoll, 0, 0.7);
      spatialState.targetCameraRoll = damp(spatialState.targetCameraRoll, 0, 0.9);

      const vortexSpeed =
        0.55 +
        voice * 2.4 +
        body * 1.1 +
        clarity * 1.2 +
        syllable * 2.2 +
        spatialState.spinImpulse * 1.6;

      spatialState.vortexTravel += dt * vortexSpeed * 9.5 * (travelRef.current.active ? 8 : 1);

      vortexTiltGroup.rotation.x = spatialState.pitch + pointerRef.current.y * 0.04;
      vortexTiltGroup.rotation.y = spatialState.yaw + pointerRef.current.x * 0.05;
      vortexTiltGroup.rotation.z = spatialState.roll;

      vortexGroup.rotation.z +=
        dt *
        spatialState.spinDirection *
        (0.18 + voice * 0.85 + syllable * 1.2 + spatialState.spinImpulse * 1.8);

      vortexGroup.rotation.y +=
        dt *
        spatialState.spinDirection *
        (0.025 + body * 0.08 + spatialState.directionShift * 0.12);

      // -----------------------------
      // Update vortex tunnel — GPU-driven: push uniforms only (the vertex shader
      // computes every particle's spiral position; zero JS loop, zero upload).
      // -----------------------------
      const vu = vortexMaterial.uniforms;
      vu.uTime.value = t;
      vu.uVoice.value = voice;
      vu.uSyllable.value = syllable;
      vu.uClarity.value = clarity;
      vu.uSibilance.value = sibilance;
      vu.uVortexTravel.value = spatialState.vortexTravel;
      vu.uSpinDir.value = spatialState.spinDirection;
      vu.uDirShift.value = spatialState.directionShift;
      // Match PointsMaterial size-attenuation: scale = 0.5 * drawing-buffer height.
      vu.uScale.value = renderer.domElement.height * 0.5;
      vu.uSize.value =
        (isMobile ? 0.058 : 0.050) +
        voice * 0.035 +
        sibilance * 0.048 +
        syllable * 0.055;

      // Full brightness during travel, reactive otherwise
      vu.uOpacity.value = travelRef.current.active
        ? 1.0
        : 0.65 + voice * 0.28 + vad * 0.15 + sibilance * 0.16 + syllable * 0.24;

      // -----------------------------
      // Update vortex spiral ribbons
      // -----------------------------
      vortexRibbons.forEach((line, ribbonIndex) => {
        const linePositions = line.geometry.attributes.position.array;
        const data = line.userData;

        for (let i = 0; i <= VORTEX_RIBBON_SEGMENTS; i++) {
          const progress = i / VORTEX_RIBBON_SEGMENTS;
          const z = THREE.MathUtils.lerp(-78, 16, progress);

          const depthNorm = THREE.MathUtils.clamp((z + 78) / 94, 0, 1);
          const radius =
            data.radius *
            (0.38 + depthNorm * 1.18) *
            (1 + voice * 0.08 + syllable * 0.12);

          const angle =
            data.phase +
            z * 0.07 * data.twist +
            spatialState.vortexTravel * 0.035 * data.direction +
            t * data.speed * spatialState.spinDirection +
            Math.sin(progress * TAU * 3 + t) * clarity * 0.12;

          const ripple =
            Math.sin(progress * TAU * 7 + t * 3.0 + ribbonIndex) *
            (0.12 + clarity * 0.42 + syllable * 0.38);

          linePositions[i * 3] = Math.cos(angle) * (radius + ripple);
          linePositions[i * 3 + 1] = Math.sin(angle) * (radius + ripple);
          linePositions[i * 3 + 2] = z;
        }

        line.geometry.attributes.position.needsUpdate = true;

        // CHANGED: higher dynamic opacity (was 0.1)
        line.material.opacity =
          0.42 +
          voice * 0.32 +
          clarity * 0.22 +
          sibilance * 0.16 +
          syllable * 0.24;
      });

      // -----------------------------
      // Entity particle field — GPU-driven: push uniforms only (vertex shader
      // computes every particle's voice-reactive position).
      // -----------------------------
      const pu = particleMaterial.uniforms;
      pu.uTime.value = t;
      pu.uVoice.value = voice;
      pu.uSyllable.value = syllable;
      pu.uClarity.value = clarity;
      pu.uSibilance.value = sibilance;
      pu.uBody.value = body;
      pu.uPlosive.value = plosive;
      pu.uScale.value = renderer.domElement.height * 0.5;

      pu.uSize.value =
        (isMobile ? 0.04 : 0.032) +
        voice * 0.04 +
        clarity * 0.025 +
        sibilance * 0.035 +
        syllable * 0.03;

      pu.uOpacity.value =
        0.48 +
        voice * 0.28 +
        clarity * 0.18 +
        sibilance * 0.18 +
        syllable * 0.12;

      particleSystem.rotation.y += dt * (0.08 + body * 0.22 + syllable * 0.2);
      particleSystem.rotation.x =
        Math.sin(t * 0.13) * 0.07 + pointerRef.current.y * 0.04;
      particleSystem.rotation.z = Math.sin(t * 0.1) * 0.05;

      // -----------------------------
      // Rings
      // -----------------------------
      rings.forEach((ring, index) => {
        const data = ring.userData;

        const speechPulse =
          voice * 0.38 +
          clarity * 0.28 +
          plosive * 0.38 * data.speechBias +
          syllable * 0.34 * data.speechBias;

        const scale =
          data.baseScale +
          Math.sin(t * 1.4 + index) * 0.035 +
          speechPulse;

        ring.scale.set(scale, scale * (0.34 + index * 0.024), scale);

        ring.rotation.z +=
          dt * data.direction * (0.18 + clarity * 1.2 + syllable * 0.8);

        ring.rotation.y += dt * (0.08 + voice * 0.5);
        ring.rotation.x += dt * data.direction * sibilance * 0.3;

        ring.material.opacity =
          0.1 +
          voice * 0.28 +
          clarity * 0.24 +
          sibilance * 0.16 +
          syllable * 0.18;
      });

      // -----------------------------
      // Waveform ribbons
      // -----------------------------
      const frequencyData = audioState.frequencyData;
      const frequencyLength = frequencyData?.length || 0;

      waveLines.forEach((line, lineIndex) => {
        const linePositions = line.geometry.attributes.position.array;
        const data = line.userData;

        const baseRadius =
          data.baseRadius + voice * 0.5 + body * 0.34 + syllable * 0.32;

        for (let i = 0; i <= waveSegments; i++) {
          const progress = i / waveSegments;
          const angle = progress * TAU;

          const folded = progress < 0.5 ? progress * 2 : (1 - progress) * 2;
          const curvedProgress = Math.pow(folded, 1.45);
          const freqIndex = Math.floor(curvedProgress * Math.max(0, frequencyLength - 1));
          const audioReactive = frequencyLength
            ? frequencyData[freqIndex] / 255
            : Math.sin(t * 3 + i * 0.11 + lineIndex) * 0.5 + 0.5;

          const speechShape =
            Math.sin(angle * 5.0 + t * 4.2 + lineIndex) * body * 0.2 +
            Math.sin(angle * 13.0 - t * 6.0 + data.phase) * clarity * 0.18 +
            Math.sin(angle * 29.0 + t * 16.0) * sibilance * 0.1;

          const plosivePush =
            plosive *
            Math.pow(Math.max(0, Math.sin(angle * 2.0 + t * 9.0)), 2) *
            0.48;

          const syllableWave =
            syllable * Math.sin(angle * 3.0 - t * 14.0 + lineIndex) * 0.36;

          const spike =
            audioReactive * (0.08 + clarity * 0.5 + sibilance * 0.38) +
            speechShape +
            plosivePush +
            syllableWave;

          const radius = baseRadius + spike;

          linePositions[i * 3] = Math.cos(angle) * radius;
          linePositions[i * 3 + 1] = Math.sin(angle) * radius;
          linePositions[i * 3 + 2] =
            Math.sin(angle * data.harmonic + t * data.direction) *
            (0.08 + clarity * 0.16 + syllable * 0.14);
        }

        line.geometry.attributes.position.needsUpdate = true;
        line.rotation.z +=
          dt * data.direction * (0.16 + clarity * 0.55 + syllable * 0.5);
        line.rotation.y = Math.sin(t * 0.21 + lineIndex) * 0.06;
        line.material.opacity =
          0.18 +
          voice * 0.26 +
          clarity * 0.24 +
          sibilance * 0.18 +
          syllable * 0.18;
      });

      // -----------------------------
      // Spectral crown
      // -----------------------------
      const crownRadius = 4.3 + body * 0.42 + syllable * 0.25;

      for (let i = 0; i < barCount; i++) {
        const normalized = i / Math.max(1, barCount - 1);
        const folded = normalized < 0.5 ? normalized * 2 : (1 - normalized) * 2;

        const spectrumIndex = frequencyLength
          ? Math.floor(Math.pow(folded, 1.55) * (frequencyLength - 1))
          : 0;

        const freqValue = frequencyLength ? frequencyData[spectrumIndex] / 255 : 0;

        const angle = normalized * TAU + t * 0.06;
        const harmonic = Math.sin(i * 0.28 + t * 2.4) * 0.5 + 0.5;

        const heightValue =
          0.06 +
          freqValue * 2.4 +
          voice * 0.38 +
          clarity * 0.42 +
          syllable * (0.4 + harmonic * 0.65);

        dummy.position.set(
          Math.cos(angle) * crownRadius,
          -1.48,
          Math.sin(angle) * crownRadius
        );

        dummy.rotation.set(0, -angle + Math.PI / 2, 0);
        dummy.scale.set(1, heightValue, 1 + freqValue * 1.2 + syllable * 0.4);
        dummy.updateMatrix();

        spectralCrown.setMatrixAt(i, dummy.matrix);
      }

      spectralCrown.instanceMatrix.needsUpdate = true;
      spectralCrown.rotation.y += dt * (0.06 + clarity * 0.16 + syllable * 0.08);
      barMaterial.opacity = 0.32 + voice * 0.32 + vad * 0.18 + syllable * 0.2;

      // -----------------------------
      // Shards
      // -----------------------------
      for (let i = 0; i < shardCount; i++) {
        const data = shardInfo[i];
        const orbit = t * data.speed + data.phase;

        const radius =
          data.radius +
          body * 0.8 +
          plosive * 1.6 +
          syllable * 2.3 * data.syllableWeight;

        const c = Math.cos(orbit * 0.28);
        const s = Math.sin(orbit * 0.28);

        const dx = data.direction.x;
        const dy = data.direction.y;
        const dz = data.direction.z;

        dummy.position.set(
          (dx * c - dz * s) * radius,
          dy * radius + Math.sin(orbit) * 0.24 * (1 + clarity),
          (dx * s + dz * c) * radius
        );

        dummy.rotation.set(orbit * 1.8, orbit * 0.9 + data.phase, orbit * 1.2);

        const shardScale =
          data.scale *
          (0.45 +
            voice * 1.1 +
            sibilance * 0.8 +
            syllable * 1.9 * data.syllableWeight);

        dummy.scale.setScalar(shardScale);
        dummy.updateMatrix();

        shards.setMatrixAt(i, dummy.matrix);
      }

      shards.instanceMatrix.needsUpdate = true;
      shardMaterial.opacity =
        0.14 + voice * 0.28 + sibilance * 0.2 + syllable * 0.28;

      // -----------------------------
      // Speech beams
      // -----------------------------
      const beamArray = beamGeometry.attributes.position.array;

      for (let i = 0; i < BEAM_COUNT; i++) {
        const data = beamInfo[i];
        const pulse = Math.sin(t * 2.4 + data.phase) * 0.5 + 0.5;

        const start = 0.7 + body * 0.18;
        const end =
          data.length * (1 + voice * 0.34 + clarity * 0.26) +
          plosive * 1.5 * pulse +
          syllable * 2.8 * pulse;

        const j = i * 6;
        const dir = data.direction;

        beamArray[j] = dir.x * start;
        beamArray[j + 1] = dir.y * start;
        beamArray[j + 2] = dir.z * start;

        beamArray[j + 3] = dir.x * end;
        beamArray[j + 4] = dir.y * end;
        beamArray[j + 5] = dir.z * end;
      }

      beamGeometry.attributes.position.needsUpdate = true;
      beamMaterial.opacity =
        0.05 +
        voice * 0.14 +
        plosive * 0.18 +
        sibilance * 0.12 +
        syllable * 0.22;

      // -----------------------------
      // Core pulse
      // -----------------------------
      outerCore.scale.setScalar(1.08 + voice * 1.4 + clarity * 0.7 + syllable * 0.85);
      halo.scale.setScalar(1.0 + voice * 1.8 + sibilance * 0.9 + syllable * 0.7);

      outerCoreMaterial.opacity = 0.08 + voice * 0.22 + syllable * 0.18;
      haloMaterial.opacity =
        0.03 + voice * 0.08 + sibilance * 0.08 + syllable * 0.06;

      coreLight.intensity = 2.8 + voice * 6.5 + syllable * 5.8;
      goldLight.intensity = 1.1 + body * 5.0 + plosive * 3.4;
      violetLight.intensity = 1.1 + clarity * 5.2 + sibilance * 4.5;

      // -----------------------------
      // Whole world orbiting around entity
      // -----------------------------
      universe.rotation.y +=
        dt *
        spatialState.spinDirection *
        (0.035 + body * 0.12 + syllable * 0.1 + spatialState.spinImpulse * 0.18);

      universe.rotation.x =
        Math.sin(t * 0.12) * 0.04 +
        pointerRef.current.y * 0.025 +
        spatialState.pitch * 0.18;

      universe.rotation.z =
        Math.sin(t * 0.09) * 0.035 +
        spatialState.roll * 0.22 +
        spatialState.directionShift * 0.035 * spatialState.spinDirection;

      stars.rotation.y +=
        dt *
        spatialState.spinDirection *
        (0.018 + voice * 0.05 + syllable * 0.08);

      stars.rotation.x += dt * (0.004 + spatialState.directionShift * 0.015);
      starMaterial.opacity = 0.2 + voice * 0.18 + syllable * 0.12;

      // -----------------------------
      // Camera: travel override OR normal spatial behaviour
      // -----------------------------
      const tr = travelRef.current;

      if (tr.active && tr.curve) {
        const elapsed = performance.now() - tr.startTime;
        const rawT = Math.min(elapsed / tr.duration, 1);
        // Smootherstep — true ease-in / cruise / ease-out (accelerate then settle).
        const eased = rawT * rawT * rawT * (rawT * (rawT * 6 - 15) + 10);

        // Arc-length parameterized sampling → CONSTANT-SPEED traversal. This is
        // the key fluidity fix: getPoint() samples CatmullRom by its non-uniform
        // native parameter, which makes the camera lurch (fast/slow) regardless
        // of the easing. getPointAt()/getTangentAt() remap by arc length so the
        // smootherstep alone governs pacing.
        const pos = tr.curve.getPointAt(eased);
        camera.position.copy(pos);
        const tangent = tr.curve.getTangentAt(eased); // unit vector, smooth

        // Speed = analytic smootherstep velocity (clean 0→1→0 bell, no finite-
        // difference jitter). Drives FOV breathing, fog DOF and motion blur.
        const velBell = clamp01(30 * rawT * rawT * (1 - rawT) * (1 - rawT) / 1.875);

        // Aim eases from a forward look-ahead → the target node on arrival.
        const aim = rawT * rawT * (3 - 2 * rawT); // smoothstep
        const look = pos.clone()
          .addScaledVector(tangent, 6)
          .lerp(tr.lookTarget, tr.returning ? 0 : aim);
        camera.lookAt(look);

        // Cinematic banking: roll INTO turns from the smooth tangent's heading
        // rate, normalized by dt (frame-rate independent) and dt-damped.
        const heading = Math.atan2(tangent.x, -tangent.z);
        if (tr.headingPrev === null) tr.headingPrev = heading;
        let dHeading = heading - tr.headingPrev;
        while (dHeading > Math.PI) dHeading -= Math.PI * 2;
        while (dHeading < -Math.PI) dHeading += Math.PI * 2;
        tr.headingPrev = heading;
        const bankTarget = THREE.MathUtils.clamp((dHeading / dt) * 0.85, -0.42, 0.42);
        tr.bank += (bankTarget - tr.bank) * (1 - Math.exp(-6 * dt));
        camera.rotation.z += tr.bank;

        // Depth-of-field haze + velocity FOV, all dt-damped for smooth ramps.
        const arriveReveal = clamp01((rawT - 0.8) / 0.2);
        if (scene.fog) {
          const fogTgt = 0.018 + velBell * 0.05 - arriveReveal * 0.03;
          scene.fog.density += (fogTgt - scene.fog.density) * (1 - Math.exp(-5 * dt));
        }
        const fovTgt = lerp(58 + velBell * 6, 50, arriveReveal);
        camera.fov += (fovTgt - camera.fov) * (1 - Math.exp(-7 * dt));
        camera.updateProjectionMatrix();

        // Motion blur (cheap, GPU-free): pump additive vortex streaks with speed.
        const blurTgt = 0.9 + velBell * 0.7;
        const vuo = vortexMaterial.uniforms.uOpacity;
        vuo.value += (blurTgt - vuo.value) * (1 - Math.exp(-8 * dt));

        // Lit beacons flare and spin as the camera sweeps past them.
        const beaconK = 1 - Math.exp(-9 * dt);
        tr.nodes.forEach(node => {
          const d = camera.position.distanceTo(node.position);
          const target = d < 5 ? 1 + (5 - d) * 0.28 : 1;
          node.scale.setScalar(lerp(node.scale.x, target, beaconK));
          node.material.opacity = lerp(node.material.opacity, d < 5 ? 1 : 0.62, beaconK);
          node.rotation.y += dt * 3;
        });

        // Completion — hand off to the panel WITHOUT a hard camera snap.
        if (rawT >= 1) {
          tr.active = false;
          camera.rotation.z = 0;
          if (scene.fog) scene.fog.density = 0.018;
          vortexMaterial.uniforms.uOpacity.value = 0.9;
          camera.fov = 52;
          camera.updateProjectionMatrix();

          if (tr.returning) {
            // Returned to space: settle the rig back to the orb view.
            camera.position.set(0, 1.1, 13);
            camera.lookAt(0, 0, 0);
            camera.updateProjectionMatrix();
            setDashVisible(false);
            setActiveDashPanel(null);
            setActiveSector(null);
            activeSectorRef.current = null;
            setAriaState("idle");
            if (psAutoFadeTimer.current) {
              clearTimeout(psAutoFadeTimer.current);
              psAutoFadeTimer.current = null;
            }
          }
          // Forward arrival: leave the camera RESTING at the dock. The panel has
          // already begun its dissolve (timer fires before t=1), so the normal-
          // camera branch reclaims the rig gently behind the panel — no teleport.

          // Fade out waypoint nodes after 1s
          setTimeout(() => {
            if (disposedRef.current) return;
            tr.nodes.forEach(n => { scene.remove(n); n.geometry?.dispose(); n.material?.dispose(); });
            tr.lines.forEach(l => { scene.remove(l); l.geometry?.dispose(); l.material?.dispose(); });
            tr.nodes = []; tr.lines = [];
          }, 1100);
        }
      } else {
        // Normal camera behaviour
        const pointer = pointerRef.current;

        const travelBob =
          Math.sin(t * 0.9 + spatialState.vortexTravel * 0.08) *
          (0.08 + voice * 0.22);

        desiredCamera.set(
          Math.sin(t * 0.13) * 1.05 +
            pointer.x * 0.62 +
            spatialState.yaw * 1.4 +
            syllable * 0.14 * Math.sin(t * 18),
          1.15 +
            Math.sin(t * 0.17) * 0.38 -
            pointer.y * 0.52 +
            spatialState.pitch * 1.2 +
            voice * 0.16 +
            travelBob,
          12.2 -
            voice * 1.25 -
            syllable * 0.72 -
            spatialState.directionShift * 0.55 +
            Math.cos(t * 0.1) * 0.42
        );

        camera.position.lerp(desiredCamera, 1 - Math.exp(-2.9 * dt));

        lookTarget.set(
          pointer.x * 0.32 + spatialState.yaw * 0.42,
          -pointer.y * 0.2 + spatialState.pitch * 0.35,
          0
        );

        camera.lookAt(lookTarget);

        camera.rotation.z +=
          spatialState.cameraRoll +
          Math.sin(t * 2.2) * voice * 0.006 +
          syllable * 0.012 * spatialState.spinDirection;

        camera.fov = damp(
          camera.fov,
          52 - voice * 2.2 - syllable * 1.4 - spatialState.directionShift * 1.2,
          3.2
        );

        camera.updateProjectionMatrix();
      }

      // ── Two-tier node animation: sectors (Tier 1) + cluster children (Tier 2) ─
      const isPanelSelect = ariaStateRef.current === "panel_select";
      const activeSectorId = activeSectorRef.current;
      const isSectorView = isPanelSelect && !activeSectorId;
      const isClusterView = isPanelSelect && !!activeSectorId;
      const psT = time * 0.001;
      const hoveredId = hoveredPanelIdRef.current;

      // Helper: animate a node's opacity targets + float + scale + rotation
      const animateNode = (node, i, show, isHovered, hubMode = false) => {
        let nodeTgt, glowTgt, ringTgt, lblTgt, plateTgt, shellTgt, coreTgt, shadeTgt;
        if (show && !hubMode) {
          nodeTgt = isHovered ? 0.92 : 0.84; glowTgt = isHovered ? 0.14 : 0.03;
          ringTgt = isHovered ? 0.78 : 0.18; lblTgt  = isHovered ? 1.0  : 0.9;
          plateTgt = isHovered ? 0.04 : 0.0; shellTgt = isHovered ? 0.34 : 0.22;
          coreTgt = isHovered ? 0.44 : 0.30; shadeTgt = isHovered ? 0.18 : 0.12;
        } else if (hubMode) {
          nodeTgt = 0.50; glowTgt = 0.05; ringTgt = 0.30; lblTgt = 0.65;
          plateTgt = 0; shellTgt = 0.14; coreTgt = 0.17; shadeTgt = 0.07;
        } else {
          nodeTgt = 0; glowTgt = 0; ringTgt = 0; lblTgt = 0;
          plateTgt = 0; shellTgt = 0; coreTgt = 0; shadeTgt = 0;
        }
        if (node.isGalaxy) {
          nodeTgt = show ? (isHovered ? 0.88 : 0.78) : 0;
          glowTgt = show ? (isHovered ? 0.08 : 0.025) : 0;
          ringTgt = 0;
          lblTgt = show ? (isHovered ? 1.0 : 0.92) : 0;
        }
        node.mat.opacity      += (nodeTgt  - node.mat.opacity)      * 0.08;
        node.glowMat.opacity  += (glowTgt  - node.glowMat.opacity)  * 0.08;
        node.ringMat.opacity  += (ringTgt  - node.ringMat.opacity)  * 0.10;
        node.shadeMat.opacity += (shadeTgt - node.shadeMat.opacity)  * 0.08;
        node.plateMat.opacity += (plateTgt - node.plateMat.opacity)  * 0.09;
        node.shellMat.opacity += (shellTgt - node.shellMat.opacity)  * 0.09;
        node.coreMat.opacity  += (coreTgt  - node.coreMat.opacity)   * 0.09;
        node.labelMat.opacity += (lblTgt   - node.labelMat.opacity)  * 0.06;
        if (node.mat.opacity > 0.002) {
          const floatY = node.y + Math.sin(psT * 1.1 + i * 0.72) * 0.09;
          node.sphere.position.set(node.x, floatY, node.z);
          node.glow.position.set(node.x + Math.sin(psT * 1.7 + i * 0.45) * (isHovered ? 0.02 : 0.01), floatY, node.z);
          node.ring.position.set(node.x, floatY, node.z);
          node.shade.position.set(node.x - 0.03 * node.scale + Math.sin(psT * 0.9 + i * 0.5) * 0.01, floatY - 0.02 * node.scale, node.z);
          node.particleShell.position.set(node.x, floatY, node.z);
          node.particleCore.position.set(node.x, floatY, node.z);
          node.hit.position.set(node.x, floatY, node.z);
          node.plate.position.set(node.x, floatY - 0.1 * node.scale, node.z);
          node.label.position.set(node.x, floatY - node.labelOffset, node.z);
          const hoverPulse = isHovered ? Math.sin(psT * 4.8 + i * 0.4) * 0.05 : 0;
          node.sphere.scale.setScalar(isHovered ? 1.12 + hoverPulse : 1);
          node.glow.scale.setScalar((1 + Math.sin(psT * 2.1 + i * 0.5) * 0.08) * (isHovered ? 1.18 : 1));
          node.ring.scale.setScalar(isHovered ? 1.28 : 1.03);
          node.particleShell.scale.setScalar(isHovered ? 1.18 : 1);
          node.particleCore.scale.setScalar(isHovered ? 1.13 : 1);
          node.particleShell.rotation.y += 0.012 + (isHovered ? 0.012 : 0.005);
          node.particleShell.rotation.x += 0.004 + (isHovered ? 0.007 : 0.002);
          node.particleShell.rotation.z += 0.003 + (isHovered ? 0.004 : 0.0015);
          node.particleCore.rotation.y  -= 0.014 + (isHovered ? 0.014 : 0.005);
          node.particleCore.rotation.x  += 0.0025 + (isHovered ? 0.0035 : 0.001);
          if (node.isGalaxy) {
            // Galaxy disc: slow steady spin on its own axis
            node.sphere.rotation.z += (isHovered ? 0.006 : 0.0025);
            node.ring.rotation.z   += (isHovered ? 0.009 : 0.003);
          } else {
            node.sphere.rotation.y += 0.005 + (isHovered ? 0.006 : 0.002);
            node.sphere.rotation.x = Math.sin(psT * 1.1 + i * 0.6) * (isHovered ? 0.08 : 0.045);
            node.ring.rotation.z += 0.012 + (isHovered ? 0.02 : 0.006);
            node.ring.rotation.x = Math.sin(psT * 0.9 + i * 0.4) * (isHovered ? 0.16 : 0.08);
          }
          node.plate.scale.set(isHovered ? 1.04 : 1, isHovered ? 1.03 : 1, 1);
        } else {
          node.sphere.scale.setScalar(1); node.glow.scale.setScalar(1);
          node.ring.scale.setScalar(1); node.particleShell.scale.setScalar(1);
          node.particleCore.scale.setScalar(1); node.plate.scale.set(1, 1, 1);
        }
      };

      // ── Cluster ring: rotate panel nodes around screen centre ─────────────
      if (isClusterView && activeSectorId) {
        clusterOrbitAngleRef.current += CLUSTER_ORBIT_SPEED * dt;

        // Ring always sits at the scene origin so it stays centred in the viewport
        const hubNode = sectorNodesRef.current.find(n => n.sectorId === activeSectorId);
        const ringZ = hubNode ? hubNode.z : 3.85;
        const ringX = 0, ringY = 0;

        // Gather all panel nodes in this cluster (excluding overview)
        const clusterPanels = panelNodesRef.current.filter((n) => {
          if (n.panel.id === "overview") return false;
          return panelSector(n.panel.id)?.id === activeSectorId;
        });
        const count = clusterPanels.length;
        const orbitAngle = clusterOrbitAngleRef.current;

        clusterPanels.forEach((node, idx) => {
          const baseAng = (TAU * idx) / count + Math.PI * 0.25;
          const ang = baseAng + orbitAngle;
          node.clusterX = ringX + Math.cos(ang) * CLUSTER_RING_RADIUS;
          node.clusterY = ringY + Math.sin(ang) * CLUSTER_RING_RADIUS;
          node.clusterZ = node.clusterCZ || ringZ;
        });

        // Position the visual ring at screen centre
        orbitRing3D.position.set(ringX, ringY, ringZ);
        orbitRing3D2.position.set(ringX, ringY, ringZ);

        // Tint ring to match sector accent
        const activeSector = SECTORS.find(s => s.id === activeSectorId);
        if (activeSector) {
          orbitRingMat.color.set(activeSector.accent);
          orbitRingMat2.color.set(activeSector.accent);
        }
      } else if (isSectorView) {
        // Reset orbit angle when returning to sector map so reopening starts fresh
        clusterOrbitAngleRef.current = 0;
      }

      // Ring opacity: visible in cluster view, hidden in sector map
      const ringOpacityTgt = isClusterView ? 0.28 : 0;
      orbitRingMat.opacity  += (ringOpacityTgt        - orbitRingMat.opacity)  * 0.06;
      orbitRingMat2.opacity += (ringOpacityTgt * 0.45 - orbitRingMat2.opacity) * 0.06;

      // ── Tier 1: sector nodes ─────────────────────────────────────────────
      sectorNodesRef.current.forEach((sNode, i) => {
        const isHovered = isSectorView && hoveredId === "sector:" + sNode.sectorId;
        animateNode(sNode, i, isSectorView, isHovered, false);
      });

      // ── Tier 2: panel nodes (bloom spring + cluster animation) ───────────
      // Overview is always shown in sector map view (not in cluster mode)
      panelNodesRef.current.forEach((node, i) => {
        const isOverview = node.panel.id === "overview";
        const mySectorId = isOverview ? null : panelSector(node.panel.id)?.id;
        const inActiveCluster = isClusterView && mySectorId === activeSectorId;
        const showNode = isOverview ? isSectorView : inActiveCluster;
        const isHovered = showNode && hoveredId === node.panel.id;

        // Bloom spring: pull position toward cluster ring position or sector centroid
        if (!isOverview) {
          const bloomRate = 4.5;
          const tX = inActiveCluster ? node.clusterX : node.sectorCX;
          const tY = inActiveCluster ? node.clusterY : node.sectorCY;
          const tZ = inActiveCluster ? node.clusterZ : node.sectorCZ;
          node.x = damp(node.x, tX, bloomRate);
          node.y = damp(node.y, tY, bloomRate);
          node.z = damp(node.z, tZ, bloomRate * 0.5);
        }

        animateNode(node, i + sectorNodesRef.current.length, showNode, isHovered);
      });

      // Sector lines visible in sector map view; hidden in cluster view
      psLines.forEach(({ mat: lm, isSectorLine }) => {
        const tgt = (isSectorLine ? isSectorView : isClusterView) ? 0.3 : 0;
        lm.opacity += (tgt - lm.opacity) * 0.07;
      });
      // ────────────────────────────────────────────────────────────────────

      renderer.render(scene, camera);
    };

    animationFrameId = requestAnimationFrame(animate);

    const handleResize = () => {
      width = mount.clientWidth || window.innerWidth;
      height = mount.clientHeight || window.innerHeight;
      pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);

      camera.aspect = width / height;
      camera.updateProjectionMatrix();

      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height, false);
    };

    const handlePointerMove = (event) => {
      pointerRef.current.x = THREE.MathUtils.clamp(
        (event.clientX / width) * 2 - 1,
        -1,
        1
      );

      pointerRef.current.y = THREE.MathUtils.clamp(
        (event.clientY / height) * 2 - 1,
        -1,
        1
      );
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    const audioStateForCleanup = audioRef.current;

    return () => {
      disposed = true;
      disposedRef.current = true;

      cancelAnimationFrame(animationFrameId);
      // Clean up any in-progress travel nodes and timers
      if (travelTimerRef.current) { clearTimeout(travelTimerRef.current); travelTimerRef.current = null; }
      if (psAutoFadeTimer.current) { clearTimeout(psAutoFadeTimer.current); psAutoFadeTimer.current = null; }
      const tr = travelRef.current;
      tr.active = false;
      tr.nodes.forEach(n => { scene.remove(n); n.geometry?.dispose(); n.material?.dispose(); });
      tr.lines.forEach(l => { scene.remove(l); l.geometry?.dispose(); l.material?.dispose(); });
      tr.nodes = []; tr.lines = [];

      // Clean up panel-select nodes
      panelNodesRef.current.forEach(n => {
        scene.remove(n.sphere, n.glow, n.label);
        n.sphere.geometry.dispose(); n.mat.dispose();
        n.glow.geometry.dispose();   n.glowMat.dispose();
        n.labelMat.map?.dispose();   n.labelMat.dispose();
      });
      psLines.forEach(({ line: ln, mat: lm }) => { scene.remove(ln); ln.geometry.dispose(); lm.dispose(); });
      scene.remove(orbitRing3D);  orbitRingGeo.dispose();  orbitRingMat.dispose();
      scene.remove(orbitRing3D2); orbitRingGeo2.dispose(); orbitRingMat2.dispose();
      panelNodesRef.current = [];
      sectorNodesRef.current = [];

      window.removeEventListener("resize", handleResize);
      window.removeEventListener("pointermove", handlePointerMove);

      scene.traverse((object) => {
        if (object.geometry) {
          object.geometry.dispose();
        }

        if (object.material) {
          disposeMaterial(object.material);
        }
      });

      renderer.dispose();

      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }

      const audioState = audioStateForCleanup;

      if (audioState.source) {
        try {
          audioState.source.disconnect();
        } catch {
          // Ignore disconnect errors.
        }
      }

      if (audioState.stream) {
        audioState.stream.getTracks().forEach((track) => track.stop());
      }

      if (audioState.audioContext && audioState.audioContext.state !== "closed") {
        audioState.audioContext.close().catch(() => {});
      }
    };
  }, [updateStatus]);

  useEffect(() => { ariaStateRef.current = ariaState; }, [ariaState]);
  // ── Aria Blocklist callbacks ─────────────────────────────────────────────────
  const refreshAriaBlockedIps = useCallback(async () => {
    setAriaBlockedLoading(true);
    try {
      const res = await ariaFetch("GET", `/api/blocked-ips?refresh=${Date.now()}`);
      if (res.data?.blocked_ips) setAriaBlockedIps(res.data.blocked_ips);
    } finally {
      setAriaBlockedLoading(false);
    }
  }, []);

  const handleAriaBlock = useCallback(async (ip, reason) => {
    const res = await ariaFetch("POST", "/api/blocked-ips/block", {
      ip,
      reason: reason || "Manual block from Aria blocked-IPs panel",
      source: "manual",
    });
    if (res.error) {
      setAriaBlockedMessage(`Block failed: ${res.message || res.error}`);
      return false;
    }
    setAriaBlockedMessage(`${ip} blocked successfully.`);
    const listRes = await ariaFetch("GET", `/api/blocked-ips?refresh=${Date.now()}`);
    if (listRes.data?.blocked_ips) setAriaBlockedIps(listRes.data.blocked_ips);
    return true;
  }, []);

  const handleAriaUnblock = useCallback(async (ip) => {
    const res = await ariaFetch("POST", `/api/blocked-ips/${encodeURIComponent(ip)}/unblock`, {});
    if (res.error) {
      setAriaBlockedMessage(`Unblock failed: ${res.message || res.error}`);
      return false;
    }
    setAriaBlockedMessage(`${ip} unblocked.`);
    const listRes = await ariaFetch("GET", `/api/blocked-ips?refresh=${Date.now()}`);
    if (listRes.data?.blocked_ips) setAriaBlockedIps(listRes.data.blocked_ips);
    return true;
  }, []);

  useEffect(() => {
    void refreshAriaBlockedIps();
  }, [refreshAriaBlockedIps]);

  useEffect(() => { livePanelDataRef.current = livePanelData; }, [livePanelData]);
  useEffect(() => { monitoringContextRef.current = monitoringContext; }, [monitoringContext]);
  useEffect(() => { threatLevelRef.current = threatLevel; }, [threatLevel]);
  useEffect(() => { activeDashPanelRef.current = activeDashPanel; }, [activeDashPanel]);
  useEffect(() => { activeSectorRef.current = activeSector; }, [activeSector]);
  useEffect(() => { commandTextRef.current = commandText; }, [commandText]);
  useEffect(() => { commandDockFocusedRef.current = commandDockFocused; }, [commandDockFocused]);
  useEffect(() => {
    const scheduleIdleFade = () => {
      window.clearTimeout(commandDockIdleTimerRef.current);
      commandDockIdleTimerRef.current = window.setTimeout(() => {
        if (!commandTextRef.current.trim() && !commandDockFocusedRef.current) {
          setCommandDockAwake(false);
        }
      }, 3500);
    };

    const wakeCommandDock = () => {
      setCommandDockAwake(true);
      scheduleIdleFade();
    };

    wakeCommandDock();
    window.addEventListener("mousemove", wakeCommandDock, { passive: true });
    window.addEventListener("touchstart", wakeCommandDock, { passive: true });
    window.addEventListener("keydown", wakeCommandDock);
    return () => {
      window.clearTimeout(commandDockIdleTimerRef.current);
      window.removeEventListener("mousemove", wakeCommandDock);
      window.removeEventListener("touchstart", wakeCommandDock);
      window.removeEventListener("keydown", wakeCommandDock);
    };
  }, []);
  useEffect(() => {
    setCommandDockAwake(true);
    window.clearTimeout(commandDockIdleTimerRef.current);
    if (!commandText.trim() && !commandDockFocused) {
      commandDockIdleTimerRef.current = window.setTimeout(() => {
        if (!commandTextRef.current.trim() && !commandDockFocusedRef.current) {
          setCommandDockAwake(false);
        }
      }, 3500);
    }
  }, [commandText, commandDockFocused]);
  useEffect(() => {
    if (!livePanelData) return;

    const currentContext = {
      ...monitoringContext,
      aiSpm: {
        summary: aiSpmState.summary || null,
        findings: aiSpmState.findings || [],
        inventory: aiSpmState.inventory || null,
      },
      aria: {
        state: ariaState,
        autonomyMode,
        approvalQueue,
      },
    };
    const previous = monitoringPreviousRef.current;
    if (!previous.snapshot) {
      monitoringPreviousRef.current = {
        snapshot: livePanelData,
        context: currentContext,
      };
      return;
    }

    const candidates = detectMonitoringAlerts({
      previous: previous.snapshot,
      current: livePanelData,
      previousContext: previous.context,
      currentContext,
      now: Date.now(),
    });
    const accepted = monitoringAlertBufferRef.current.accept(candidates);

    accepted.forEach((alert) => {
      const candidate = {
        id: alert.id,
        key: alert.key,
        severity: alert.severity,
        panel: alert.sourcePanel,
        entity: alert.entity,
        voice_line: alert.spokenLine,
        summary: alert.spokenLine,
        message: alert.detail,
        recommended_action: alert.recommendedAction,
        timestamp: alert.timestamp,
      };
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("aria:monitoring-alert", { detail: { alert, candidate } }));
      }
      pushLiveFeed(`${String(alert.severity || "info").toUpperCase()}: ${alert.detail}`);
      emitOperatorAlert(candidate, alertToastType(alert));
    });

    monitoringPreviousRef.current = {
      snapshot: livePanelData,
      context: currentContext,
    };
  }, [aiSpmState.findings, aiSpmState.inventory, aiSpmState.summary, approvalQueue, ariaState, autonomyMode, emitOperatorAlert, livePanelData, monitoringContext, pushLiveFeed]);
  useEffect(() => {
    realtimePlatformContextRef.current = {
      activeDashPanel,
      activeSector,
      agentStatus,
      aiSpmState,
      approvalQueue,
      ariaState,
      autonomyMode,
      dashVisible,
      fetchError,
      identitySessionsState,
      incidentCount24h,
      liveFeed,
      livePanelData,
      modelMode,
      overviewReport,
      operationalLoop,
      availableActions: livePanelData?.panels?.["aria-center"]?.available_actions || [],
      decisionHistory: livePanelData?.panels?.["aria-center"]?.decision_history || livePanelData?.panels?.["aria-center"]?.decisions || [],
      policyChangeState,
      securityAdminState,
      telemetryOnline,
      threatLevel,
      toasts,
      workspace: "orbital-visualizer",
    };
  }, [
    activeDashPanel,
    activeSector,
    agentStatus,
    aiSpmState,
    approvalQueue,
    ariaState,
    autonomyMode,
    dashVisible,
    fetchError,
    identitySessionsState,
    incidentCount24h,
    liveFeed,
    livePanelData,
    modelMode,
    overviewReport,
    operationalLoop,
    policyChangeState,
    securityAdminState,
    telemetryOnline,
    threatLevel,
    toasts,
  ]);
  useEffect(() => {
    setLogoutHandler(() => {
      // Reset to a safe state when session expires
      setAriaState("idle");
    });
  }, []);
  useEffect(() => {
    if (ariaState !== "panel_select") hoveredPanelIdRef.current = null;
  }, [ariaState]);

  // ── Electron IPC bridge ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!window.aria?.isElectron) return;

    // Server online/offline from main process health monitor
    window.aria.onServerStatus(({ online }) => {
      setServerOnline(online);
      if (!online && !DEMO_BUILD) {
        addToast("Aria server is offline. Some features may be unavailable.", "warning", "SERVER");
      }
    });

    // Tray quick-actions dispatched from the system tray menu
    window.aria.onTrayAction((action) => {
      if (action === "scan") {
        void executeAriaCommand("Run a quick scan");
      } else if (action === "ai-spm") {
        void executeAriaCommand("AI-SPM");
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync threat state to tray whenever it changes
  useEffect(() => {
    if (!window.aria?.isElectron) return;
    window.aria.setThreatState({ state: threatLevel || "UNKNOWN", threat: threatLevel || "UNKNOWN" });
  }, [threatLevel]);

  useEffect(() => {
    const handleWheelNavigation = (event) => {
      const target = event.target;
      const element = target instanceof Element ? target : null;
      if (element?.closest("input, textarea, select, button, [data-dashboard-scroll], [data-console-scroll]")) return;

      const state = ariaStateRef.current;
      if (state === "navigating") {
        event.preventDefault();
        return;
      }

      const allowedState = ["idle", "listening", "sleeping", "paused", "panel_select", "arrived"].includes(state);
      if (!allowedState) return;

      wheelTravelRef.current.accumulator += event.deltaY;
      if (Math.abs(wheelTravelRef.current.accumulator) < 90) return;

      event.preventDefault();
      navigatePanelByWheel(wheelTravelRef.current.accumulator > 0 ? 1 : -1);
    };

    window.addEventListener("wheel", handleWheelNavigation, { passive: false });
    return () => window.removeEventListener("wheel", handleWheelNavigation);
  }, [navigatePanelByWheel]);

  // Stable refs so the polling intervals never restart just because a callback
  // reference changed — only autonomyMode (which changes the observe interval)
  // should tear down and recreate the timers.
  const _loadAriaStateRef = useRef(loadAriaState);
  const _refreshSnapshotRef = useRef(refreshLiveSnapshot);
  const _refreshMonitoringContextRef = useRef(refreshMonitoringContext);
  const _observeScreenRef = useRef(observeVisibleScreen);
  useEffect(() => { _loadAriaStateRef.current = loadAriaState; }, [loadAriaState]);
  useEffect(() => { _refreshSnapshotRef.current = refreshLiveSnapshot; }, [refreshLiveSnapshot]);
  useEffect(() => { _refreshMonitoringContextRef.current = refreshMonitoringContext; }, [refreshMonitoringContext]);
  useEffect(() => { _observeScreenRef.current = observeVisibleScreen; }, [observeVisibleScreen]);

  // ── SSE real-time stream ───────────────────────────────────────────────────
  const handleStreamEvent = useCallback((event) => {
    const { type, payload } = event;
    switch (type) {
      case "incident.created":
      case "incident.auto_created":
        void _refreshSnapshotRef.current();
        if (payload?.incident?.title) {
          const sev = payload?.incident?.severity;
          pushLiveFeed(`${sev === "critical" ? "🔴" : "⚠"} AUTO: ${payload.incident.title}`);
          emitOperatorAlert({
            id: payload.incident.id || payload.incident.title,
            severity: sev || "high",
            summary: payload.incident.title,
          });
        }
        break;
      case "incident.escalated":
        void _refreshSnapshotRef.current();
        emitOperatorAlert({
          id: payload?.incident?.id || payload?.incident?.title || "incident-escalated",
          severity: payload?.incident?.severity || "high",
          summary: payload?.incident?.title || "Incident escalated",
        });
        break;
      case "ip.blocked":
      case "response.ip_blocked":
        void _refreshSnapshotRef.current();
        void refreshAriaBlockedIps();
        if (payload?.ip) pushLiveFeed(`Blocked: ${payload.ip}${payload?.auto ? " [AUTO]" : ""}`);
        if (payload?.ip) {
          emitOperatorAlert({
            id: `blocked-${payload.ip}`,
            severity: payload?.auto ? "high" : "medium",
            summary: `Blocked suspicious IP ${payload.ip}`,
          });
        }
        break;
      case "threat.swarm_detected":
        pushLiveFeed(`⚡ AI swarm: ${payload.sourceIp} — ${payload.rate} req/s × ${payload.sustainedSeconds}s`);
        emitOperatorAlert({
          id: `swarm-${payload.sourceIp || "unknown"}`,
          severity: "high",
          summary: `AI swarm detected from ${payload.sourceIp || "unknown source"}`,
        });
        void _refreshSnapshotRef.current();
        break;
      case "threat.coordinated_attack":
        pushLiveFeed(`⚡ Coordinated attack: ${payload.distinctIps} IPs on ${payload.endpoint}`);
        emitOperatorAlert({
          id: `coordinated-${payload.endpoint || "unknown"}`,
          severity: "critical",
          summary: `Coordinated attack on ${payload.endpoint || "monitored endpoint"}`,
        });
        break;
      case "threat.auth_failure":
        // Auth failures are high-frequency; only surface if the pipeline escalates them
        break;
      default:
        break;
    }
  }, [emitOperatorAlert, pushLiveFeed, refreshAriaBlockedIps]);

  const { connected: streamConnected } = useAriaStream(handleStreamEvent);

  useEffect(() => {
    const initialSnapshotTimer = setTimeout(() => {
      void _refreshSnapshotRef.current();
      void _refreshMonitoringContextRef.current();
      void _loadAriaStateRef.current();
      void loadScanHistory();
    }, 1500); // slight delay so the UI settles before first fetch

    const snapshotTimer = setInterval(() => {
      void _refreshSnapshotRef.current();
      void _refreshMonitoringContextRef.current();
      void _loadAriaStateRef.current();
    }, 30_000);

    const observationTimer = setInterval(() => {
      void _observeScreenRef.current();
    }, autonomyMode === "full_auto" ? 9000 : 18000);

    return () => {
      clearTimeout(initialSnapshotTimer);
      clearInterval(snapshotTimer);
      clearInterval(observationTimer);
    };
  }, [autonomyMode, loadScanHistory]);

  useEffect(() => {
    if (activeDashPanel === "ai-spm" && !aiSpmState.summary && !aiSpmState.loading) {
      const timer = setTimeout(() => {
        void loadAiSpmDashboard(true);
      }, 0);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [activeDashPanel, aiSpmState.loading, aiSpmState.summary, loadAiSpmDashboard]);


  useEffect(() => {
    if (activeDashPanel === "security-admin" && !securityAdminState.loading) {
      const timer = setTimeout(() => { void loadSecurityAdmin(); }, 0);
      return () => clearTimeout(timer);
    }
    if (activeDashPanel === "identity-sessions" && !identitySessionsState.loading) {
      const timer = setTimeout(() => { void loadIdentitySessions(); }, 0);
      return () => clearTimeout(timer);
    }
    if (activeDashPanel === "policy-change" && !policyChangeState.loading) {
      const timer = setTimeout(() => { void loadPolicyChanges(); }, 0);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [activeDashPanel]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (panelPhase === "acting") {
      wasActingRef.current = true;
      return;
    }

    if (
      wasActingRef.current &&
      panelVisible &&
      panelPhase === "complete" &&
      ["idle", "scanning", "sleeping", "paused"].includes(agentStatus)
    ) {
      wasActingRef.current = false;
      // Pinned = operator opened the full console deliberately; don't yank it shut.
      if (!commandCenterPinnedRef.current) closeActionPanel();
    }
  }, [agentStatus, closeActionPanel, panelPhase, panelVisible]);

  // Keep ref current so Live Aria transcription always uses latest processCommand
  useEffect(() => { processCommandRef.current = processCommand; }, [processCommand]);



  useEffect(() => {
    return () => {
      if (taskTimerRef.current) {
        clearTimeout(taskTimerRef.current);
        taskTimerRef.current = null;
      }
    };
  }, []);

  const dotClass =
    statusType === "speaking"
      ? "dot speaking"
      : statusType === "listening"
      ? "dot listening"
      : statusType === "demo"
      ? "dot demo"
      : "dot";
  const showActionPanel = panelVisible && ariaState !== "panel_select";
  const activeDestination = panelById(activeDashPanel);
  const activeDestinationDetails = DESTINATION_DETAILS[activeDashPanel] || {};
  const activeAccent = activeDestination?.accent || "#63f5ff";
  const travelTarget = panelById(travelTargetPanelId);
  const travelDetails = DESTINATION_DETAILS[travelTargetPanelId] || {};
  const showDestinationPanel = dashVisible && Boolean(activeDashPanel);
  const commandDockSuppressed = showDestinationPanel && activeDashPanel === "identity-galaxy";
  const commandDockVisible_computed = commandDockVisible || commandDockFocused;
  const commandDockStyle = {
    ...styles.commandDock,
    opacity: commandDockVisible_computed ? 1 : 0,
    transform: commandDockVisible_computed ? "translateX(-50%) translateY(0)" : "translateX(-50%) translateY(calc(100% + 24px))",
    pointerEvents: commandDockVisible_computed ? "auto" : "none",
  };
  const panels = livePanelData?.panels || {};
  const sourceFabric = livePanelData?.summary?.sources || [];
  const overviewMetrics = panels?.overview?.metrics || [];
  const reviewItems = livePanelData?.summary?.review_items || [];
  const systemPanel = panels?.["system-health"] || {};
  const liveProcesses = systemPanel.processes || [];
  const liveConnections = panels?.network?.connections || [];
  const liveVectors = panels?.["threat-vectors"]?.vectors || [];
  const liveTimeline = panels?.["threat-timeline"]?.events || [];
  const liveIncidents = panels?.["incident-feed"]?.items || [];
  const liveLogs = panels?.["live-logs"]?.events || [];
  const liveDisks = systemPanel.disks || [];
  const quarantinePanel = panels?.quarantine || {};
  const liveFiles = quarantinePanel.items || quarantinePanel.files || [];
  const quarantineProvider = quarantinePanel.provider || null;
  const topCpuProcesses = systemPanel.top_cpu || [];
  const topMemoryProcesses = systemPanel.top_memory || [];
  const topDiskUsage = systemPanel.top_disks || [];
  const firewallBlockedIpItems = panels?.["blocked-ips"]?.items || [];
  const blockedIpItems = normalizeBlockedIpRows(ariaBlockedIps, firewallBlockedIpItems);
  const blockedIpConnector = panels?.["blocked-ips"]?.connector || sourceFabric.find((source) => source.id === "firewall-blocklist");
  const aiSpmSummary = aiSpmState.summary || {};
  const liveMemoryPercent = systemPanel.memory_percent ?? livePanelData?.host?.memory_percent ?? 0;
  const liveLoad = systemPanel.load?.[0] ?? livePanelData?.host?.load?.[0] ?? 0;
  const liveRiskScore = panels?.["threat-overview"]?.risk_score ?? 0;
  const ariaCenterPanel = panels?.["aria-center"] || {};
  const tenantContext = ariaCenterPanel?.tenant_context && typeof ariaCenterPanel.tenant_context === "object" ? ariaCenterPanel.tenant_context : null;
  const tenantRowsFromTelemetry = Array.isArray(ariaCenterPanel?.tenant_rows)
    ? ariaCenterPanel.tenant_rows
        .filter((row) => row && typeof row === "object")
        .map((row) => ({ label: row.label || row.key || "Field", value: row.value ?? "—" }))
    : [];
  const tenantRowsFromContext = tenantContext
    ? [
        { label: "Tenant ID", value: tenantContext.tenant_id ?? "—" },
        { label: "User ID", value: tenantContext.user_id ?? "—" },
        { label: "Role", value: tenantContext.role ?? "—" },
      ].filter((row) => row.value !== undefined && row.value !== null && String(row.value).trim() !== "")
    : [];
  const adminTenantRows = tenantRowsFromTelemetry.length
    ? tenantRowsFromTelemetry
    : tenantRowsFromContext.length
    ? tenantRowsFromContext
    : [
        { label: "Workspace", value: livePanelData?.host?.hostname || "local-workspace" },
        { label: "Platform", value: livePanelData?.host?.platform ? `${livePanelData.host.platform} ${livePanelData.host.release || ""}`.trim() : "unknown" },
        { label: "Live Sources", value: `${sourceFabric.filter((source) => source.status === "live").length}/${sourceFabric.length || 0}` },
      ];
  const authzDenials = Array.isArray(ariaCenterPanel?.authz_denials)
    ? ariaCenterPanel.authz_denials
    : Array.isArray(ariaCenterPanel?.denials)
    ? ariaCenterPanel.denials
    : [];
  const authzDenialRows = authzDenials.slice(0, 6).map((item, index) => ({
    id: item?.id || `denial-${index}`,
    event: item?.event_type || item?.type || "authz.denied",
    actor: item?.actor || item?.user_id || "unknown",
    reason: item?.reason || item?.message || "Access denied",
    time: item?.timestamp || item?.time || null,
  }));
  const tenantContextLoading = !livePanelData;
  const authzDenialsLoading = !livePanelData;
  const adminRoleRows = (panels?.["aria-center"]?.available_actions || []).slice(0, 4).map((action) => ({
    role: action.risk === "medium" ? "Security Approver" : "Security Analyst",
    permission: action.label,
    status: action.status === "approval_required" ? "approval required" : "available",
  }));
  const formatTime = (value) => {
    if (!value) return "now";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  // ── Unified Command Center props ──────────────────────────────────────────
  // Single source of truth so BOTH mount sites render an identical, fully-wired
  // console (no degraded duplicate). Every field below is live data already
  // derived above from the /api/live + /api/aria/state polling loops.
  const commandCenterProps = {
    // Operations / command surface
    liveFeed,
    panelOptions,
    executeAriaCommand,
    processCommand,
    ariaInput,
    setAriaInput,
    agentStatus,
    ariaCenterPanel,
    // Admin / identity
    adminTenantRows,
    adminRoleRows,
    authzDenialRows,
    tenantContextLoading,
    authzDenialsLoading,
    // Posture headline metrics
    sources: sourceFabric,
    riskScore: liveRiskScore,
    threatLevel,
    memoryPercent: liveMemoryPercent,
    load: liveLoad,
    reviewItems,
    approvalQueue,
    approvals: approvalQueue,
    // Full live monitor — every panel's telemetry in one place
    connections: liveConnections,
    incidents: liveIncidents,
    liveIncidents,
    vectors: liveVectors,
    timeline: liveTimeline,
    logs: liveLogs,
    processes: liveProcesses,
    topCpuProcesses,
    topMemoryProcesses,
    disks: liveDisks,
    files: liveFiles,
    blockedIps: blockedIpItems,
    blockedIpConnector,
    aiSpmSummary,
    overviewMetrics,
    incidentCount24h,
    operationalLoop,
    // Action lifecycle
    panelPhase,
    pendingTask,
    currentTask,
    onResolveApproval: (id, decision) => { void resolveApprovalItem(id, decision); },
    onConfirmTask: () => { void executeAriaCommand(pendingTask, true); },
    onCancelConfirm: () => { setPendingTask(""); setPanelPhase("monitoring"); setPanelPrompt("Command cancelled."); },
  };

  const copilotContext = useMemo(
    () => buildRealtimeContextSnapshot(),
    [
      buildRealtimeContextSnapshot,
      activeDashPanel,
      activeSector,
      agentStatus,
      aiSpmState,
      ariaState,
      dashVisible,
      fetchError,
      identitySessionsState,
      incidentCount24h,
      liveFeed,
      livePanelData,
      modelMode,
      overviewReport,
      operationalLoop,
      policyChangeState,
      securityAdminState,
      telemetryOnline,
      threatLevel,
      toasts,
      approvalQueue,
      autonomyMode,
    ],
  );

  const askCopilot = useCallback(async (utterance, context) => {
    // Any question typed into the copilot dock interrupts narration immediately —
    // Aria stops reading the page and switches into live conversation.
    const wasNarrating = narrateLiveRef.current;
    if (wasNarrating) cancelLiveSpeech();

    let answer = null;
    try {
      const result = await requestAriaIntelligence(utterance, { intent: "copilot_console" });
      answer = result?.answer || result?.voice_response || result?.summary || result?.message || null;
    } catch (error) {
      console.warn("[Aria] copilot intelligence fallback:", error);
    }
    if (!answer) answer = answerCopilotPrompt(utterance, context || buildRealtimeContextSnapshot());

    // Speak the answer out loud when we just interrupted live narration (the
    // operator was already in a spoken moment) or when Full Audio Mode keeps
    // Aria conversational off the main overview page.
    const offMainPage = activeDashPanelRef.current && activeDashPanelRef.current !== "overview";
    if (wasNarrating || (fullAudioModeRef.current && offMainPage)) {
      void ariaTTS(answer);
    }
    return answer;
  }, [ariaTTS, buildRealtimeContextSnapshot, cancelLiveSpeech, requestAriaIntelligence]);

  // Spoken input (Voice Chat) always gets a spoken answer back — that's the
  // whole point of a two-way realtime conversation, independent of Full Audio Mode.
  const askByVoice = useCallback(async (utterance) => {
    const clean = String(utterance || "").trim();
    if (!clean) return;
    cancelLiveSpeech();
    setLastTranscript(clean);
    setAriaLiveLine(`You: ${clean}`);

    const inNarration = narrateLiveRef.current || narrateOverlayOpenRef.current;
    let answer = null;
    try {
      const result = await requestAriaIntelligence(clean, {
        intent: inNarration ? "narrative_question" : "voice_conversation",
      });
      answer = result?.answer || result?.response || result?.voice_response || result?.summary || null;
    } catch (error) {
      console.warn("[Aria] voice intelligence fallback:", error);
    }
    if (!answer) answer = answerCopilotPrompt(clean, buildRealtimeContextSnapshot());

    setAriaLiveLine(answer);
    void ariaTTS(answer);
  }, [ariaTTS, buildRealtimeContextSnapshot, cancelLiveSpeech, requestAriaIntelligence]);

  // ── Voice Chat: local PCM capture → in-process Whisper STT ─────────────────
  useEffect(() => {
    if (!voiceChatEnabled) {
      speechRecognitionRef.current?.stop?.();
      speechRecognitionRef.current = null;
      setVoiceListening(false);
      return undefined;
    }

    let stopped = false;
    let stream;
    let audioContext;
    let source;
    let processor;
    let chunks = [];
    let speechStartedAt = 0;
    let lastVoiceAt = 0;
    let transcribing = false;

    const flush = async () => {
      if (transcribing || !chunks.length) return;
      const captured = chunks;
      chunks = [];
      speechStartedAt = 0;
      transcribing = true;
      try {
        const samples = resampleMono(combineAudioChunks(captured), audioContext.sampleRate);
        const response = await fetch(`${ARIA_API_BASE}/api/voice/stt`, {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream", ...buildAuthHeaders() },
          body: float32ToPcm16(samples),
        });
        if (!response.ok) throw new Error(`Local STT ${response.status}`);
        const result = await response.json();
        if (!stopped && result?.text?.trim()) await askByVoice(result.text);
      } catch (error) {
        if (!stopped) console.warn("[Aria] Local Whisper STT unavailable:", error?.message || error);
      } finally {
        transcribing = false;
      }
    };

    void navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } })
      .then((mediaStream) => {
        if (stopped) { mediaStream.getTracks().forEach((track) => track.stop()); return; }
        stream = mediaStream;
        audioContext = new AudioContext();
        source = audioContext.createMediaStreamSource(stream);
        processor = audioContext.createScriptProcessor(4096, 1, 1);
        const mute = audioContext.createGain();
        mute.gain.value = 0;
        processor.onaudioprocess = (event) => {
          const frame = new Float32Array(event.inputBuffer.getChannelData(0));
          let energy = 0;
          for (const sample of frame) energy += sample * sample;
          const rms = Math.sqrt(energy / frame.length);
          const now = Date.now();
          if (rms > 0.018) {
            if (!speechStartedAt) speechStartedAt = now;
            lastVoiceAt = now;
            if (narrateLiveRef.current) cancelLiveSpeech();
          }
          if (speechStartedAt) chunks.push(frame);
          if (speechStartedAt && now - lastVoiceAt > 520 && now - speechStartedAt > 250) void flush();
          if (speechStartedAt && now - speechStartedAt > 15000) void flush();
        };
        source.connect(processor);
        processor.connect(mute);
        mute.connect(audioContext.destination);
        speechRecognitionRef.current = {
          stop: () => {
            processor?.disconnect();
            source?.disconnect();
            stream?.getTracks().forEach((track) => track.stop());
            void audioContext?.close();
          },
        };
        setVoiceListening(true);
      })
      .catch((error) => {
        console.warn("[Aria] Voice Chat microphone unavailable:", error?.message || error);
        setVoiceChatEnabled(false);
      });

    return () => {
      stopped = true;
      speechRecognitionRef.current?.stop?.();
      speechRecognitionRef.current = null;
      setVoiceListening(false);
    };
  }, [ARIA_API_BASE, voiceChatEnabled, askByVoice, cancelLiveSpeech]);

  const stageCopilotAction = useCallback((summary) => {
    openActionPanel(typeof summary === "string" ? summary : "Safest action staged for governed review.");
  }, [openActionPanel]);

  const openPanelNarration = useCallback(async () => {
    setNarrateOverlayOpen(true);
    // Open the orb immediately in a "generating" state so the operator gets
    // feedback right away, then swap in the brief when the model responds.
    setNarrateNarrative({
      status: "generating",
      title: "Aria is analysing this panel…",
      summary: "Generating intelligence brief…",
      recommended_actions: [],
    });
    setAriaLiveLine("Connecting to Aria…");
    stopNarrativeSpeech();

    // Rich per-panel context so EVERY panel — including the identity, policy,
    // decision-engine and security-admin panels added since — briefs from real
    // data. Restored from the provider-backed (June-1) narration setup.
    const context = {
      panelId: activeDashPanel,
      riskScore: liveRiskScore,
      threatLevel,
      connections: liveConnections.slice(0, 20),
      vectors: liveVectors.slice(0, 10),
      incidents: liveIncidents.slice(0, 10),
      logs: liveLogs.slice(0, 10),
      events: liveTimeline.slice(0, 10),
      files: liveFiles.slice(0, 10),
      memoryPercent: liveMemoryPercent,
      liveLoad,
      sources: sourceFabric.slice(0, 12),
      reviewItems: reviewItems.slice(0, 5),
      aiSpm: {
        findings: aiSpmState.findings?.length ?? 0,
        assets: aiSpmSummary.asset_count ?? 0,
        critical: aiSpmSummary.critical_count ?? 0,
        secrets: aiSpmSummary.secret_count ?? 0,
        posture: aiSpmSummary.posture ?? "unknown",
      },
      sessions: identitySessionsState.sessions?.length ?? 0,
      policies: policyChangeState.policies?.length ?? 0,
      policyHistory: policyChangeState.history?.length ?? 0,
      authzDenials: authzDenialRows.length,
      pendingApprovals: approvalQueue.length,
    };

    if (DEMO_BUILD) {
      const panelLabel = panelById(activeDashPanel)?.label || activeDashPanel || "Overview";
      const narrative = {
        status: "ready",
        title: `${panelLabel} — Aria brief`,
        summary: "Demo narration is playing from bundled audio. The production platform uses live, interruptible two-way voice over current panel context.",
        recommended_actions: [],
      };
      setNarrateNarrative(narrative);
      setAriaLiveLine(narrative.summary);
      void ariaTTS(narrative.summary, { audioSrc: demoPanelNarrationAudio(activeDashPanel || "overview") });
      return;
    }

    const panelLabel = panelById(activeDashPanel)?.label || activeDashPanel || "current panel";
    const acknowledgement = `I'm checking ${panelLabel} against the live telemetry now.`;
    setAriaLiveLine(acknowledgement);
    void ariaTTS(acknowledgement);

    // Fetch the structured brief. The server nests it under `narrative`
    // ({ summary, likely_attack_path, blast_radius, recommended_actions }).
    // ElevenLabs only does text-to-speech — it can't generate the answer — so
    // we speak the model's generated `summary` here, never the raw prompt.
    let narrative = null;
    try {
      const res = await fetch(`${ARIA_API_BASE}/api/aria/panel-narrative`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...buildAuthHeaders() },
        body: JSON.stringify({
          panelId: activeDashPanel || "overview",
          context,
          model_mode: modelModeRef.current || "gemini",
        }),
      });
      const json = res.ok ? await res.json() : null;
      narrative = json?.narrative || null;
    } catch (err) {
      console.warn("[Aria] panel narrative failed:", err);
    }
    if (!narrative) {
      narrative = {
        status: "ready",
        title: `${panelById(activeDashPanel)?.label || activeDashPanel} — Aria brief`,
        summary: "Aria intelligence service is unavailable. Ask a question to engage the realtime voice entity.",
        recommended_actions: [],
      };
    }
    setNarrateNarrative(narrative);
    setAriaLiveLine(narrative.summary || "");
    if (narrative.summary) void ariaTTS(narrative.summary);
  }, [
    activeDashPanel, ariaTTS, stopNarrativeSpeech,
    liveRiskScore, threatLevel, liveConnections, liveVectors, liveIncidents,
    liveLogs, liveTimeline, liveFiles, liveMemoryPercent, liveLoad,
    sourceFabric, reviewItems, aiSpmState, aiSpmSummary,
    identitySessionsState, policyChangeState, authzDenialRows, approvalQueue,
  ]);

  // Per-destination ambient backdrop. Each top-nav target has its own clip
  // (filed by nav id under /landing/media/panels). Falls back to the deep-space
  // loop on the cockpit/home view where nothing is active.
  const activeNavItem = H_NAV_ITEMS.find((it) =>
    it.type === "sector" ? activeSector === it.targetId : activeDashPanel === it.targetId,
  );
  // Each panel's backdrop is a seamless infinite loop stitched from TWO clips
  // that cross-dissolve into each other (see CrossfadeLoopVideo): the panel's
  // own clip plus a partner clip borrowed from another panel (BACKDROP_PARTNER).
  const panelDir = "/landing/media/panels";
  const backdropId = activeNavItem ? activeNavItem.id : null;
  const clipPair = backdropId ? BACKDROP_CLIPS[backdropId] : null;
  const backdropA = clipPair ? `${panelDir}/${clipPair[0]}.mp4` : "/landing/media/platform-bg.mp4";
  const backdropB = clipPair ? `${panelDir}/${clipPair[1]}.mp4` : backdropA;

  return (
    <div style={styles.page} className="aria-page">
      {/* Ambient deep-space backdrop — sits behind the galaxy canvas and all
          UI (zIndex 0, 50% opacity). Muted/looping so it never grabs focus. */}
      <CrossfadeLoopVideo
        key={backdropA + "|" + backdropB}
        className="aria-bg-video"
        clipA={backdropA}
        clipB={backdropB}
        maxOpacity={0.5}
        style={{
          position: "fixed",
          inset: 0,
          width: "100vw",
          height: "100vh",
          zIndex: 0,
          pointerEvents: "none",
          animation: "ariaBgFade 0.9s ease",
        }}
      />
      {/* Scrim between the backdrop video and the galaxy canvas: darkens the
          edges (restores star/ring contrast) and the top-left (locks in the
          status text) while keeping the center clear and cinematic. */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          pointerEvents: "none",
          background:
            "radial-gradient(ellipse at 50% 48%, rgba(2,4,11,0) 38%, rgba(2,4,11,0.55) 100%)," +
            "linear-gradient(105deg, rgba(2,4,11,0.5) 0%, rgba(2,4,11,0) 32%)",
        }}
      />
      {telemetryOnline === false && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "fixed",
            top: 16,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            gap: 9,
            padding: "7px 15px",
            borderRadius: 999,
            border: "1px solid rgba(255,200,87,0.55)",
            background: "rgba(28,20,4,0.72)",
            backdropFilter: "blur(10px)",
            boxShadow: "0 0 20px rgba(255,200,87,0.25)",
            fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
            fontSize: 11,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "#ffc857",
            pointerEvents: "none",
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#ffc857",
              boxShadow: "0 0 10px #ffc857",
              animation: "cx-recon-pulse 1s ease-in-out infinite",
            }}
          />
          Telemetry reconnecting…
        </div>
      )}
      {!DEMO_BUILD && !serverOnline && (
        <div
          role="alert"
          aria-live="assertive"
          style={{
            position: "fixed",
            top: 44,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            gap: 9,
            background: "rgba(15, 8, 24, 0.92)",
            border: "1px solid rgba(255,64,96,0.55)",
            borderRadius: 8,
            padding: "7px 16px",
            backdropFilter: "blur(16px)",
            boxShadow: "0 4px 24px rgba(255,40,70,0.18)",
            fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
            fontSize: 11,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "#ff4060",
            pointerEvents: "none",
            whiteSpace: "nowrap",
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#ff4060", boxShadow: "0 0 10px #ff4060", animation: "cx-recon-pulse 1s ease-in-out infinite" }} />
          Server offline — reconnecting…
        </div>
      )}
      {fetchError && (
        <div
          role="alert"
          onClick={() => setFetchError(null)}
          style={{
            position: "fixed",
            top: 52,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 99999,
            padding: "4px 12px",
            borderRadius: 4,
            border: "1px solid rgba(255,200,87,0.6)",
            background: "rgba(255,200,87,0.12)",
            fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
            fontSize: 11,
            letterSpacing: "0.12em",
            color: "#ffc857",
            cursor: "pointer",
            pointerEvents: "auto",
          }}
        >
          ⚠ {fetchError} — tap to dismiss
        </div>
      )}
      <div
        ref={mountRef}
        className="aria-canvas-mount"
        style={{
          ...styles.canvasMount,
          pointerEvents: showDestinationPanel ? "none" : "auto",
          cursor: ariaState === "panel_select" ? "crosshair" : "default",
          opacity: showDestinationPanel ? 0 : 1,
          transition: "opacity 0.42s ease",
        }}
        onClick={handleCanvasClick}
        onMouseMove={handleCanvasHover}
        onMouseLeave={() => { hoveredPanelIdRef.current = null; }}
      />

      {/* ── Horizontal sector nav — replaces galaxy orb navigation ── */}
      <HorizontalSectorNav
        visible={!showDestinationPanel && !showActionPanel}
        activeSector={activeSector}
        activeDashPanel={activeDashPanel}
        onSectorClick={openSector}
        onPanelClick={(panelId) => {
          closeActionPanel();
          setDashVisible(false);
          setActiveDashPanel(null);
          setActiveSector(null);
          activeSectorRef.current = null;
          startTravel(panelId);
          const navLine = `Navigating to ${panelById(panelId)?.label || "panel"}.`;
          speakARIARealtime(navLine);
        }}
      />

      {/* Ambient orbital logo — persistent, 70% opacity, z-index 1 */}
      <AriaLogoAnimation opacity={0.7} />

      <div style={styles.ui} className="aria-ui-block">
        <div style={styles.brandBlock}>
          <div style={styles.subtitle}>Live Security Operations Interface</div>
        </div>

        <div style={styles.status}>
          <span className={dotClass} />
          <span>{status}</span>
        </div>

        <div style={styles.telemetryGrid} className="aria-telemetry-grid">
          <div style={styles.telemetryBadge}>
            <span>State</span>
            <strong>{agentStatus.toUpperCase()}</strong>
          </div>
          <div style={styles.telemetryBadge}>
            <span>Threat</span>
            <strong>{threatLevel}</strong>
          </div>
          <div style={styles.telemetryBadge}>
	            <span>Review Items</span>
            <strong>{incidentCount24h}</strong>
          </div>
        </div>

        <ModelSelector mode={modelMode} onChange={setModelMode} vertical />
        <button
          onClick={() => setSilentMode((v) => !v)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "9px 12px",
            borderRadius: 6,
            border: silentMode
              ? "1px solid rgba(255,100,100,0.35)"
              : "1px solid rgba(140,178,255,0.2)",
            background: silentMode
              ? "rgba(60,10,10,0.62)"
              : "rgba(8,14,28,0.62)",
            color: silentMode ? "rgba(255,140,140,0.9)" : "rgba(180,210,240,0.55)",
            cursor: "pointer",
            pointerEvents: "auto",
            backdropFilter: "blur(18px)",
            fontSize: 10,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
            transition: "all 0.18s ease",
            width: "100%",
          }}
          title={silentMode ? "Ops comms muted — click to restore" : "Click to mute ARIA ops comms"}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: silentMode ? "rgba(255,100,100,0.8)" : "rgba(45,212,191,0.7)",
              boxShadow: silentMode ? "0 0 6px rgba(255,80,80,0.6)" : "0 0 6px rgba(45,212,191,0.5)",
              flexShrink: 0,
              transition: "all 0.18s ease",
            }}
          />
          {silentMode ? "Comms Muted" : "Ops Comms"}
        </button>
      </div>

      {narrateOverlayOpen && (
        <NarrativeVoiceOverlay
          narrative={narrateNarrative || {
            status: "generating",
            title: `${panelById(activeDashPanel)?.label || "Panel"} — Aria Brief`,
            summary: ariaLiveLine || "Connecting to Aria…",
          }}
          onClose={() => { setNarrateOverlayOpen(false); setNarrateNarrative(null); stopNarrativeSpeech(); }}
          onStop={() => { setNarrateOverlayOpen(false); setNarrateNarrative(null); stopNarrativeSpeech(); }}
          autoSpeak={false}
          onRealtimeSpeak={narrateLive ? (text) => { void ariaTTS(text); return true; } : null}
          realtimeVoiceAvailable={narrateLive}
          onAskQuestion={askNarrativeQuestion}
          isRealtimeSpeaking={narrateLive}
        />
      )}

      <div style={styles.controls} className="aria-controls-bar">
        <button style={styles.button} onClick={() => openActionPanel("Aria command console is ready.")}>
          Command Console
        </button>

        <button
          style={{
            ...styles.button,
            ...(voiceAlertsEnabled ? styles.voiceAlertsActiveButton : styles.voiceAlertsButton),
          }}
          onClick={() => setVoiceAlertsEnabled((value) => !value)}
          aria-pressed={voiceAlertsEnabled}
          title={
            voiceAlertsEnabled
              ? "Audio Alerts On: ARIA may proactively speak one-line monitoring alerts"
              : "Audio Alerts Off: monitoring alerts stay visual/toast only"
          }
        >
          {voiceAlertsEnabled ? "Audio Alerts On" : "Audio Alerts Off"}
        </button>

        <button
          style={{
            ...styles.button,
            ...(fullAudioMode ? styles.voiceAlertsActiveButton : styles.voiceAlertsButton),
          }}
          onClick={() => setFullAudioMode((value) => !value)}
          aria-pressed={fullAudioMode}
          title={
            fullAudioMode
              ? "Full Audio Mode On: off the main overview, Aria stays a live spoken SOC agent and speaks every answer aloud"
              : "Full Audio Mode Off: copilot answers off the main overview stay text-only"
          }
        >
          {fullAudioMode ? "Full Audio Mode On" : "Full Audio Mode Off"}
        </button>

        <button
          style={{
            ...styles.button,
            ...(voiceChatEnabled ? styles.voiceAlertsActiveButton : styles.voiceAlertsButton),
          }}
          onClick={() => setVoiceChatEnabled((value) => !value)}
          aria-pressed={voiceChatEnabled}
          title={
            voiceChatEnabled
              ? (voiceListening
                ? "Voice Chat On — listening. Speak anytime to interrupt Aria and talk back."
                : "Voice Chat On — reconnecting microphone…")
              : "Voice Chat Off: Aria is not interruptable by voice, only by typed text"
          }
        >
          {voiceChatEnabled ? (voiceListening ? "◉ Voice Chat — Listening" : "Voice Chat On") : "Voice Chat Off"}
        </button>


        <button
          style={{
            ...styles.button,
            ...(demoActive ? {
              border: "1px solid rgba(200,16,46,0.6)",
              background: "rgba(200,16,46,0.14)",
              color: "#c8102e",
              boxShadow: "0 0 12px rgba(200,16,46,0.25)",
            } : {}),
          }}
          onClick={() => demoActive ? stopAriaDemo() : startAriaDemo()}
        >
          {demoActive ? "Exit Presentation" : "Autonomous Presentation"}
        </button>

        <select
          value={autonomyMode}
          onChange={(event) => { void changeAutonomyMode(event.target.value); }}
          style={styles.autonomySelect}
          title="Aria autonomy mode"
        >
          <option value="confirm">Confirm</option>
          <option value="auto">Auto</option>
          <option value="full_auto">Full Auto</option>
        </select>

        <button
          style={{
            ...styles.button,
            border: "1px solid rgba(255,120,120,0.4)",
            color: "rgba(255,160,160,0.92)",
          }}
          onClick={() => { void handleLogout(); }}
          title="Sign out and return to the login screen"
        >
          Log Out
        </button>
      </div>

      {lastTranscript ? (
        <div style={{ position: "fixed", bottom: 108, left: "50%", transform: "translateX(-50%)", zIndex: 12, fontSize: 11, color: "rgba(99,245,255,0.65)", letterSpacing: "0.08em", pointerEvents: "none", whiteSpace: "nowrap" }}>
          Heard: &ldquo;{lastTranscript}&rdquo;
        </div>
      ) : null}

      <AriaCopilotConsole
        context={copilotContext}
        visible={!demoActive}
        onAsk={askCopilot}
        onStageAction={stageCopilotAction}
        onOpenFullConsole={() => openActionPanel("Aria command console is ready.")}
        onDismiss={() => setCommandDockVisible(false)}
      />

      {/* Invisible trigger strip at bottom edge — shows the dock on hover */}
      {!commandDockSuppressed && (
        <div
          style={{ position: "fixed", bottom: 0, left: 0, right: 0, height: 20, zIndex: 9989, pointerEvents: "auto" }}
          onMouseEnter={() => setCommandDockVisible(true)}
        />
      )}

      {!commandDockSuppressed && (
        <div
          style={commandDockStyle}
          className="aria-command-dock"
          onMouseEnter={() => setCommandDockVisible(true)}
          onMouseLeave={() => setCommandDockVisible(false)}
        >
          <input
            value={commandText}
            onFocus={() => setCommandDockFocused(true)}
            onBlur={() => setCommandDockFocused(false)}
            onChange={(event) => {
              setCommandDockAwake(true);
              setCommandText(event.target.value);
            }}
            onKeyDown={(event) => {
              setCommandDockAwake(true);
              if (event.key === "Enter") {
                void processCommand(commandText);
                setCommandText("");
              }
            }}
            placeholder='Ask ARIA or type a command...'
            style={styles.commandInput}
          />
          <button
            style={styles.commandButton}
            onClick={() => {
              setCommandDockAwake(true);
              void processCommand(commandText);
              setCommandText("");
            }}
          >
            Send
          </button>
        </div>
      )}

      {/* ── Toast notifications + notification tray ── */}
      <div style={{ position: "fixed", top: 162, right: 16, zIndex: 9999, display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end", pointerEvents: "auto" }}>
        <style>{`
          @keyframes ariaToastIn { from { opacity: 0; transform: translateX(24px) scale(0.96); } to { opacity: 1; transform: translateX(0) scale(1); } }
          @keyframes ariaToastOut { from { opacity: 1; transform: translateX(0) scale(1); } to { opacity: 0; transform: translateX(32px) scale(0.94); } }
        `}</style>
        {toasts.map((toast) => {
          const colors = { info: "#63f5ff", warning: "#ffc857", success: "#2dd4bf", error: "#ff3d81" };
          const color = colors[toast.type] || colors.info;
          const archiveToast = () => {
            setToasts(prev => prev.filter(t => t.id !== toast.id));
            setToastHistory(prev => [...prev.slice(-19), toast]);
          };
          const dismissToast = () => setToasts(prev => prev.filter(t => t.id !== toast.id));
          return (
            <AriaToast
              key={toast.id}
              toast={toast}
              color={color}
              onOpen={() => { openActionPanel(toast.message); dismissToast(); }}
              onArchive={archiveToast}
              onDismiss={dismissToast}
            />
          );
        })}
        <AriaNotifTray
          history={toastHistory}
          onDismiss={(id) => setToastHistory(prev => prev.filter(t => t.id !== id))}
          onDismissAll={() => setToastHistory([])}
        />
      </div>

      {/* ── Aria autonomous presentation caption overlay ── */}
      {demoActive && (
        <div style={{
          position: "fixed", bottom: 148, left: "50%", transform: "translateX(-50%)",
          zIndex: 40, pointerEvents: "none",
        }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "3px 12px", borderRadius: 99,
            background: "rgba(200,16,46,0.12)",
            border: "1px solid rgba(200,16,46,0.35)",
          }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#c8102e", boxShadow: "0 0 8px #c8102e", animation: "navPulse 1s ease-in-out infinite" }} />
            <span style={{ fontSize: 9, letterSpacing: "0.22em", color: "#c8102e", textTransform: "uppercase" }}>Aria — Autonomous Presentation</span>
          </div>
        </div>
      )}
      {/* Exit button — always accessible during autonomous presentation */}
      {demoActive && (
        <button
          onClick={stopAriaDemo}
          style={{
            position: "fixed", top: 18, left: "50%", transform: "translateX(-50%)",
            zIndex: 41, pointerEvents: "auto",
            padding: "6px 18px", borderRadius: 99, fontSize: 10, fontWeight: 700,
            letterSpacing: "0.18em", textTransform: "uppercase", cursor: "pointer",
            background: "rgba(200,16,46,0.12)", border: "1px solid rgba(200,16,46,0.45)",
            color: "#c8102e", backdropFilter: "blur(12px)",
          }}
        >
          ✕ EXIT PRESENTATION
        </button>
      )}

      {/* ── Autonomous presentation progress bar + transport ── */}
      {demoActive && (
        <div
          style={{
            position: "fixed", bottom: 58, left: "50%", transform: "translateX(-50%)",
            zIndex: 43, pointerEvents: "auto",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 9,
            width: "min(900px, 92vw)",
          }}
        >
          {/* Chapter segments — click any segment to jump to / restart that section */}
          <div style={{ display: "flex", gap: 5, width: "100%" }}>
            {DEMO_CHAPTERS.map((chapter, index) => {
              const done = index < demoChapter;
              const current = index === demoChapter;
              return (
                <button
                  key={chapter.id}
                  onClick={() => demoJumpTo(index)}
                  title={`${index + 1}. ${chapter.title}`}
                  style={{
                    flex: 1, height: current ? 9 : 6, padding: 0, borderRadius: 99,
                    border: "none", cursor: "pointer",
                    background: current ? "#63f5ff" : done ? "rgba(99,245,255,0.42)" : "rgba(255,255,255,0.13)",
                    boxShadow: current ? "0 0 12px rgba(99,245,255,0.8)" : "none",
                    transition: "height 0.18s ease, background 0.18s ease",
                  }}
                />
              );
            })}
          </div>

          {/* Transport controls */}
          <div
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "6px 12px", borderRadius: 99,
              background: "rgba(6,8,20,0.78)", border: "1px solid rgba(99,245,255,0.22)",
              backdropFilter: "blur(16px)",
            }}
          >
            <button
              onClick={() => demoJumpTo(demoChapter - 1)}
              disabled={demoChapter <= 0}
              title="Previous section"
              style={demoTransportBtn(demoChapter <= 0)}
            >
              ◀ Prev
            </button>
            <button
              onClick={() => setDemoPausedState(!demoPaused)}
              title={demoPaused ? "Resume" : "Pause"}
              style={{ ...demoTransportBtn(false), minWidth: 78, color: demoPaused ? "#2dd4bf" : "#63f5ff" }}
            >
              {demoPaused ? "▶ Resume" : "❚❚ Pause"}
            </button>
            <button
              onClick={() => demoJumpTo(demoChapter)}
              title="Repeat this section"
              style={demoTransportBtn(false)}
            >
              ⟲ Repeat
            </button>
            <button
              onClick={() => demoJumpTo(demoChapter + 1)}
              disabled={demoChapter >= DEMO_CHAPTERS.length - 1}
              title="Next section"
              style={demoTransportBtn(demoChapter >= DEMO_CHAPTERS.length - 1)}
            >
              Next ▶
            </button>
            <span
              style={{
                marginLeft: 4, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase",
                color: "rgba(170,210,235,0.8)", whiteSpace: "nowrap",
              }}
            >
              {demoChapter + 1}/{DEMO_CHAPTERS.length} · {DEMO_CHAPTERS[demoChapter]?.title}
            </span>
            {demoNarrationState === "blocked" ? (
              <button
                type="button"
                onClick={retryDemoNarration}
                title="Enable the bundled 10-minute narration track"
                style={{
                  ...demoTransportBtn(false),
                  color: "#ffc857",
                  borderColor: "rgba(255,200,87,0.35)",
                  background: "rgba(255,200,87,0.1)",
                }}
              >
                Enable Narration
              </button>
            ) : (
              <span
                style={{
                  marginLeft: 2,
                  fontSize: 9,
                  letterSpacing: "0.08em",
                  color: demoNarrationState === "playing" ? "rgba(45,212,191,0.76)" : "rgba(120,150,175,0.58)",
                  whiteSpace: "nowrap",
                  textTransform: "uppercase",
                }}
              >
                {demoNarrationState === "playing" ? "Narration on" : "Narration ready"}
              </span>
            )}
            <span
              style={{
                marginLeft: 2, fontSize: 9, letterSpacing: "0.08em",
                color: "rgba(120,150,175,0.6)", whiteSpace: "nowrap",
              }}
              title="Space = pause/resume · ← → = prev/next · R = repeat"
            >
              ␣ ← → R
            </span>
          </div>
        </div>
      )}


      {/* ── Panel select hint (nodes render on 3D canvas) ── */}
      {ariaState === "panel_select" && (
        <div style={styles.mapHint}>
          <div style={styles.mapHintDot} />
          <span>
            {activeSector
              ? `${sectorById(activeSector)?.label || "Sector"} cluster open. Select a panel node to enter its workspace.`
              : "Sector map active. Select a sector to open its cluster."}
          </span>
          <button
            onClick={() => {
              if (activeSector) {
                collapseToSectors();
              } else {
                setAriaState("idle");
              }
            }}
            style={styles.mapCloseButton}
          >
            {activeSector ? "← Sectors" : "Close"}
          </button>
        </div>
      )}

      {/* ── Navigating status overlay ── */}
      {ariaState === "navigating" && (
        <div style={{ position: "fixed", bottom: 140, left: "50%", transform: "translateX(-50%)", zIndex: 30, pointerEvents: "none", display: "grid", gap: 4, justifyItems: "center", padding: "10px 20px", background: "rgba(1,2,10,0.82)", backdropFilter: "blur(12px)", borderRadius: 8, border: `1px solid ${hexToRgba(travelTarget?.accent || "#63f5ff", 0.35)}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: travelTarget?.accent || "#63f5ff", boxShadow: `0 0 10px ${travelTarget?.accent || "#63f5ff"}`, animation: "navPulse 0.8s ease-in-out infinite" }} />
          <span style={{ fontSize: 12, color: hexToRgba(travelTarget?.accent || "#63f5ff", 0.92), letterSpacing: "0.14em" }}>{`ROUTING ${travelTarget?.label || "DESTINATION"}`}</span>
          </div>
          <span style={{ fontSize: 10, color: "rgba(234,247,255,0.52)", letterSpacing: "0.18em", textTransform: "uppercase" }}>{travelDetails.route ? `${travelDetails.route} route` : "secure route"}</span>
          <style>{`@keyframes navPulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(1.6)} }`}</style>
        </div>
      )}

      {/* ── Command Console — fullscreen Command Center ── */}
      <div
        style={{
          position: "fixed", inset: 0, zIndex: 30,
          width: "100vw", height: "100vh",
          transition: "opacity 0.32s ease",
          opacity: showActionPanel ? 1 : 0,
          pointerEvents: showActionPanel ? "all" : "none",
        }}
        onClick={e => e.stopPropagation()}
        onWheel={e => e.stopPropagation()}
      >
        {showActionPanel && (
          <Suspense fallback={
            <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", background:"#020408", color:"rgba(99,245,255,0.5)", fontSize:11, letterSpacing:"0.2em" }}>
              LOADING COMMAND CENTER…
            </div>
          }>
            <CommandCenterPane {...commandCenterProps} onClose={closeActionPanel} />
          </Suspense>
        )}
        {/* Close button */}
        {showActionPanel && (
          <button onClick={closeActionPanel} style={{
            position:"absolute", top:18, right:18, zIndex:31,
            width:32, height:32, borderRadius:8, cursor:"pointer",
            background:"rgba(3,3,7,0.8)", border:"1px solid rgba(99,245,255,0.25)",
            color:"rgba(234,247,255,0.75)", fontSize:14, backdropFilter:"blur(8px)",
          }}>✕</button>
        )}
      </div>


      {/* ── ARIA Command Center — fullscreen overlay ── */}
      {activeDashPanel === "aria-center" && showDestinationPanel && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 22,
          display: "flex", flexDirection: "column",
        }}>
          <Suspense fallback={
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "#030307", color: "rgba(99,245,255,0.5)", fontSize: 11, letterSpacing: "0.2em" }}>
              LOADING COMMAND CENTER…
            </div>
          }>
            <CommandCenterPane
              {...commandCenterProps}
              onClose={closeDashboardPanel}
            />
          </Suspense>
          {/* Close button floated top-right */}
          <button
            onClick={closeDashboardPanel}
            style={{
              position: "absolute", top: 12, right: 16, zIndex: 23,
              background: "rgba(3,3,7,0.8)", border: "1px solid rgba(99,245,255,0.3)",
              borderRadius: 7, color: "rgba(234,247,255,0.72)", fontSize: 12,
              padding: "5px 12px", cursor: "pointer", backdropFilter: "blur(8px)",
              letterSpacing: "0.08em", display: "flex", alignItems: "center", gap: 5,
            }}
          ><span style={{ fontSize: 14, lineHeight: 1 }}>×</span> Close</button>
        </div>
      )}

      {/* ── Subtle backdrop behind dashboard (lets 3D show through) ── */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 19,
        background: "rgba(1,2,10,0.38)",
        backdropFilter: "blur(3px)",
        pointerEvents: "none",
        transition: "opacity 0.42s ease",
        opacity: showDestinationPanel ? 1 : 0,
      }} />

      {/* ── Dashboard centre-floating panel ── */}
      <div className="aria-hud-panel" style={{
        position: "fixed",
        top: "50%", left: "50%",
        zIndex: 20,
	        width: "min(1120px, 94vw)",
	        height: "min(760px, 88vh)",
	        borderRadius: 28,
	        border: `1px solid ${hexToRgba(activeAccent, 0.34)}`,
	        background: `radial-gradient(circle at 18% 0%, ${hexToRgba(activeAccent, 0.22)}, transparent 34%), radial-gradient(circle at 82% 12%, rgba(255,72,220,0.13), transparent 30%), linear-gradient(145deg, rgba(10, 7, 16, 0.96), rgba(5, 8, 18, 0.94) 54%, rgba(16, 7, 26, 0.94))`,
	        backdropFilter: "blur(38px) saturate(1.25)",
	        boxShadow: `0 42px 130px rgba(0,0,0,0.72), 0 0 90px ${hexToRgba(activeAccent, 0.18)}, inset 0 1px 0 rgba(255,255,255,0.08)`,
        display: "flex", flexDirection: "column",
        transition: "transform 0.42s cubic-bezier(0.4,0,0.2,1), opacity 0.42s ease",
        transform: showDestinationPanel ? "translate(-50%,-50%) scale(1)" : "translate(-50%,-50%) scale(0.88)",
        opacity: showDestinationPanel ? 1 : 0,
        pointerEvents: showDestinationPanel ? "all" : "none",
      }}>
        {/* Destination header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "18px 20px 0", flexShrink: 0 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: activeAccent, boxShadow: `0 0 12px ${activeAccent}` }} />
              <span style={{ fontSize: 10, letterSpacing: "0.28em", color: hexToRgba(activeAccent, 0.9), textTransform: "uppercase" }}>{activeDestinationDetails.arrival || "Destination online"}</span>
            </div>
            <div style={{ marginTop: 8, fontSize: 30, fontWeight: 700, color: "#eaf7ff", letterSpacing: 0 }}>{activeDestination?.label || "Aria Destination"}</div>
            <div style={{ marginTop: 4, fontSize: 12, color: "rgba(215,235,255,0.6)", letterSpacing: "0.08em", textTransform: "uppercase" }}>{activeDestinationDetails.callout || "Dedicated analysis room"}</div>
          </div>
          <button
            onClick={closeDashboardPanel}
            style={{
              background: "none",
              border: `1px solid ${hexToRgba(activeAccent, 0.32)}`,
              borderRadius: 7,
              color: "rgba(234,247,255,0.72)",
              fontSize: 12,
              padding: "5px 12px",
              cursor: "pointer",
              letterSpacing: "0.08em",
              display: "flex",
              alignItems: "center",
              gap: 5,
            }}
          ><span style={{ fontSize: 14, lineHeight: 1 }}>×</span> Close</button>
        </div>

        <div style={{ height: 1, background: hexToRgba(activeAccent, 0.18), margin: "16px 0 0" }} />

        {/* Scrollable content */}
        <div data-dashboard-scroll style={{ flex: 1, overflowY: "auto", padding: "18px 20px 120px", scrollbarWidth: "thin", scrollbarColor: `${hexToRgba(activeAccent, 0.3)} transparent` }}>
          {/* The 3 functional panes own their own HudFrame visual below;
              skip the generic PanelVisualStage so they don't all show the
              same radar fallback. */}
          {!["security-admin", "identity-sessions", "policy-change", "decision-engine"].includes(activeDashPanel) && (
          <PanelVisualStage
            panelId={activeDashPanel}
            accent={activeAccent}
            sources={sourceFabric}
            reviewItems={reviewItems}
            connections={liveConnections}
            vectors={liveVectors}
            events={liveTimeline}
            incidents={liveIncidents}
            logs={liveLogs}
            processes={liveProcesses}
            disks={liveDisks}
            files={liveFiles}
            blockedIps={blockedIpItems}
            riskScore={liveRiskScore}
            memoryPercent={liveMemoryPercent}
            liveLoad={liveLoad}
            approvals={approvalQueue}
            aiSpmSummary={aiSpmSummary}
            aiSpmFindings={aiSpmState?.findings || []}
            title={activeDestination?.label || "ARIA"}
            motion={panelMotion}
          />
          )}
          <PanelControlDeck
            panelId={activeDashPanel}
            accent={activeAccent}
            motion={panelMotion}
            setMotion={setPanelMotion}
            refreshLiveSnapshot={refreshLiveSnapshot}
            runPanelScan={runPanelScan}
            loadOverviewReport={loadOverviewReport}
            executeAriaCommand={executeAriaCommand}
            loadAiSpmDashboard={loadAiSpmDashboard}
            generateAiSpmNarrative={generateAiSpmNarrative}
            generateAiSpmReport={generateAiSpmReport}
            openPanelNarration={openPanelNarration}
            openActionPanel={openActionPanel}
            setIncidentFilter={setIncidentFilter}
            processCommand={processCommand}
          />

          <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 10, marginBottom: 14 }}>
              <div style={{ ...styles.dashCard, borderColor: hexToRgba(activeAccent, 0.22), background: hexToRgba(activeAccent, 0.06) }}>
              <div style={styles.dashCardLabel}>OPERATIONAL CONTEXT</div>
              <div style={{ marginTop: 8, fontSize: 13, color: "rgba(215,235,255,0.86)", lineHeight: 1.55 }}>
                {`Command resolved to ${activeDestination?.label || "destination"}. Aria is presenting the relevant operational workspace.`}
              </div>
            </div>
            <div style={{ ...styles.dashCard, borderColor: hexToRgba(activeAccent, 0.22), background: "rgba(1,2,10,0.34)" }}>
              <div style={styles.dashCardLabel}>AVAILABLE CONTROL</div>
              <div style={{ marginTop: 8, fontSize: 13, color: hexToRgba(activeAccent, 0.92), lineHeight: 1.55 }}>
                Speak or type another destination to move workspace. Use the command console for actions.
              </div>
            </div>
          </div>

          {/* ── AI Security Posture Management ── */}
          {activeDashPanel === "ai-spm" && (
            <>
            <AiSpmDashboard
              aiSpmState={aiSpmState}
              demoActive={demoActive}
              loadAiSpmDashboard={loadAiSpmDashboard}
              generateAiSpmNarrative={generateAiSpmNarrative}
              generateAiSpmReport={generateAiSpmReport}
              openAiSpmSandbox={openAiSpmSandbox}
              recordAiSpmFindingAction={recordAiSpmFindingAction}
              closeAiSpmNarrativeOverlay={closeAiSpmNarrativeOverlay}
              speakARIARealtime={speakARIARealtime}
              realtimeVoiceAvailable={false}
              connectGithubWithToken={connectGithubWithToken}
              startGithubDeviceAuth={startGithubDeviceAuth}
              pollGithubDeviceAuth={pollGithubDeviceAuth}
              loadGithubRepositories={loadGithubRepositories}
              saveGithubRepositories={saveGithubRepositories}
              disconnectGithub={disconnectGithub}
              scanGithub={scanGithub}
              connectAws={connectAwsWithCredentials}
              disconnectAws={disconnectAws}
              connectOkta={connectOkta}
              disconnectOkta={disconnectOkta}
              scanOkta={scanOkta}
              connectSnyk={connectSnyk}
              disconnectSnyk={disconnectSnyk}
              scanSnyk={scanSnyk}
              connectAzureAd={connectAzureAd}
              disconnectAzureAd={disconnectAzureAd}
              scanAzureAd={scanAzureAd}
              connectVirusTotal={connectVirusTotal}
              disconnectVirusTotal={disconnectVirusTotal}
              enrichIocs={enrichIocs}
              connectElastic={connectElastic}
              disconnectElastic={disconnectElastic}
              scanElastic={scanElastic}
              testConnector={testConnector}
              runConnectorFirstScan={runConnectorFirstScan}
              askNarrativeQuestion={askNarrativeQuestion}
              stopNarrativeSpeech={stopNarrativeSpeech}
              isRealtimeSpeaking={false}
              realtimeVoiceLevelRef={realtimeVoiceLevelRef}
              realtimeLastAudioAtRef={realtimeLastAudioAtRef}
            />
            </>
          )}

          {/* ── Unified Overview ── */}
          {activeDashPanel === "overview" && (
            <div>
              <div style={{ ...styles.dashCard, marginBottom: 12, borderColor: "rgba(159,231,255,0.24)" }}>
                <div style={styles.dashCardLabel}>ARIA SUMMARY</div>
                <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.7, color: "rgba(232,241,252,0.9)" }}>
                  {overviewReport?.summary || livePanelData?.summary?.headline || "Aria is compiling live source-backed posture across all panels."}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 12 }}>
                {[
	                  { label: "Posture", value: overviewReport?.snapshot?.threat_level || threatLevel, color: threatLevel === "HIGH" ? "#ffc857" : "#63f5ff" },
	                  { label: "Live Sources", value: overviewMetrics.find((item) => item.label === "Live sources")?.value || `${sourceFabric.filter((source) => source.status === "live").length}/${sourceFabric.length || 0}`, color: "#63f5ff" },
	                  { label: "Review Items", value: reviewItems.length, color: reviewItems.length ? "#ffc857" : "#63f5ff" },
	                  { label: "Approvals", value: overviewReport?.approvals?.length ?? approvalQueue.length, color: "#ffc857" },
                ].map((metric) => (
                  <div key={metric.label} style={styles.dashCard}>
                    <div style={styles.dashCardLabel}>{metric.label}</div>
                    <div style={{ marginTop: 8, fontSize: 24, fontWeight: 700, color: metric.color }}>{metric.value}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div style={styles.dashCard}>
	                  <div style={styles.dashCardLabel}>SOURCE FABRIC</div>
	                  <div style={{ display: "grid", gap: 7, marginTop: 10 }}>
	                    {sourceFabric.slice(0, 6).map((source) => (
	                      <div key={source.id} style={styles.feedLine}>{source.label}: {source.status}</div>
	                    ))}
	                    {sourceFabric.length === 0 ? <div style={styles.feedLine}>Waiting for live source registration...</div> : null}
	                  </div>
	                </div>
	                <div style={styles.dashCard}>
	                  <div style={styles.dashCardLabel}>LIVE HOST NOTE</div>
	                  <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.6, color: "rgba(215,235,255,0.84)" }}>
	                    {livePanelData?.host
	                      ? `${livePanelData.host.hostname} is running ${livePanelData.host.platform} ${livePanelData.host.release}; memory is ${liveMemoryPercent}% and load is ${Number(liveLoad).toFixed(2)}.`
	                      : "No live host note is available yet."}
                  </div>
                </div>
              </div>

              <div style={{ ...styles.dashCard, marginTop: 10 }}>
                <div style={styles.dashCardLabel}>RECOMMENDED ACTIONS</div>
                <div style={{ display: "grid", gap: 7, marginTop: 10 }}>
	                  {(overviewReport?.actions?.length ? overviewReport.actions : reviewItems.length ? reviewItems : ["Monitor current posture", "Configure optional connector slots", "Review source freshness"]).map((action) => (
                    <div key={action} style={styles.feedLine}>{action}</div>
                  ))}
                </div>
              </div>

              {overviewReport?.memory_excerpt ? (
                <div style={{ ...styles.dashCard, marginTop: 10 }}>
                  <div style={styles.dashCardLabel}>RECENT MEMORY</div>
                  <pre style={{ ...styles.memoryText, marginTop: 10 }}>{overviewReport.memory_excerpt}</pre>
                </div>
              ) : null}
            </div>
          )}

          {/* ── Threat Overview ── */}
          {activeDashPanel === "threat-overview" && (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                <div style={styles.dashCard}>
                  <div style={styles.dashCardLabel}>THREAT LEVEL</div>
                  <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6, color: threatLevel === "CRITICAL" || threatLevel === "HIGH" ? "#ff3d81" : threatLevel === "MEDIUM" ? "#ffc857" : "#63f5ff" }}>
                    {threatLevel}
                  </div>
                </div>
                <div style={styles.dashCard}>
	                  <div style={styles.dashCardLabel}>REVIEW ITEMS</div>
	                  <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6, color: incidentCount24h ? "#ffc857" : "#63f5ff" }}>{incidentCount24h}</div>
                </div>
              </div>
              <div style={styles.dashCard}>
                <div style={styles.dashCardLabel}>SEVERITY DISTRIBUTION</div>
	                {(panels?.["threat-overview"]?.distribution || []).map(row => {
                    const total = Math.max(1, (panels?.["threat-overview"]?.distribution || []).reduce((sum, item) => sum + item.count, 0));
                    const pct = Math.round((row.count / total) * 100);
                    const sev = row.label;
                    return (
	                  <div key={sev} style={{ marginTop: 10 }}>
	                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 11 }}>
	                      <span style={{ color: SEV_COLOR[sev], textTransform: "uppercase", letterSpacing: "0.1em" }}>{sev}</span>
	                      <span style={{ color: "rgba(234,247,255,0.6)" }}>{row.count} ({pct}%)</span>
	                    </div>
	                    <div style={{ height: 5, background: "rgba(234,247,255,0.07)", borderRadius: 3, overflow: "hidden" }}>
	                      <div style={{ width: `${pct}%`, height: "100%", background: SEV_COLOR[sev], borderRadius: 3, boxShadow: `0 0 8px ${SEV_COLOR[sev]}80` }} />
	                    </div>
	                  </div>
	                );})}
              </div>
              <div style={{ ...styles.dashCard, marginTop: 10 }}>
                <div style={styles.dashCardLabel}>RISK SCORE</div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
                  <div style={{ flex: 1, height: 7, background: "rgba(234,247,255,0.07)", borderRadius: 4, overflow: "hidden" }}>
	                    <div style={{ width: `${liveRiskScore}%`, height: "100%", background: "linear-gradient(90deg,#1687ff,#63f5ff,#ff3d81)", borderRadius: 4 }} />
	                  </div>
	                  <span style={{ fontSize: 22, fontWeight: 700, color: liveRiskScore > 70 ? "#ffc857" : "#63f5ff" }}>{liveRiskScore}</span>
	                  <span style={{ fontSize: 11, color: "rgba(255,200,87,0.8)" }}>{liveRiskScore > 70 ? "ELEVATED" : "LIVE"}</span>
                </div>
              </div>
              <div style={{ ...styles.dashCard, marginTop: 10 }}>
                <div style={styles.dashCardLabel}>24H ASSESSMENT</div>
                <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.65, color: "rgba(215,235,255,0.82)" }}>
	                  {reviewItems.length ? reviewItems.join(" ") : "All configured live telemetry sources are within the current review thresholds. Optional connectors remain marked until configured."}
                </div>
              </div>
              <ThreatReviewList reviewItems={reviewItems} vectors={liveVectors} />
            </div>
          )}

          {/* ── Threat Vectors Radar ── */}
          {activeDashPanel === "threat-vectors" && (() => {
	            const cx = 140, cy = 140, maxR = 108, n = Math.max(1, liveVectors.length);
	            const angle = (i) => (i / n) * Math.PI * 2 - Math.PI / 2;
	            const pts = liveVectors.map((d, i) => {
              const r = (d.score / 100) * maxR;
              return { x: cx + Math.cos(angle(i)) * r, y: cy + Math.sin(angle(i)) * r,
                lx: cx + Math.cos(angle(i)) * (maxR + 28), ly: cy + Math.sin(angle(i)) * (maxR + 28) };
            });
            const gridRing = (pct) => Array.from({ length: n }, (_, i) => {
              const r = (pct / 100) * maxR;
              return `${(cx + Math.cos(angle(i)) * r).toFixed(1)},${(cy + Math.sin(angle(i)) * r).toFixed(1)}`;
            }).join(" ");
            return (
              <div>
                <div style={styles.dashCard}>
                  <div style={styles.dashCardLabel}>THREAT VECTOR ANALYSIS</div>
                  <div style={{ display: "flex", justifyContent: "center", marginTop: 14 }}>
                    <svg width={280} height={280} style={{ overflow: "visible" }}>
                      {[25, 50, 75, 100].map(p => <polygon key={p} points={gridRing(p)} fill="none" stroke="rgba(99,245,255,0.13)" strokeWidth="1" />)}
	                      {liveVectors.map((_, i) => (
                        <line key={i} x1={cx} y1={cy}
                          x2={(cx + Math.cos(angle(i)) * maxR).toFixed(1)}
                          y2={(cy + Math.sin(angle(i)) * maxR).toFixed(1)}
                          stroke="rgba(99,245,255,0.2)" strokeWidth="1" />
                      ))}
                      <polygon
                        points={pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}
                        fill="rgba(99,245,255,0.13)" stroke="#63f5ff" strokeWidth="2" />
                      {pts.map((p, i) => (
                        <circle key={i} cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r="5"
	                          fill={liveVectors[i].score > 80 ? "#ff3d81" : liveVectors[i].score > 60 ? "#ffc857" : "#63f5ff"}
                          stroke="#01020a" strokeWidth="2" />
                      ))}
                      {pts.map((p, i) => (
                        <text key={i} x={p.lx.toFixed(1)} y={p.ly.toFixed(1)}
                          fill="rgba(220,240,255,0.82)" fontSize="11" textAnchor="middle" dominantBaseline="middle">
	                          {liveVectors[i].label}
                        </text>
                      ))}
                    </svg>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 10 }}>
	                  {liveVectors.map(d => (
                    <div key={d.label} style={{ ...styles.dashCard, textAlign: "center" }}>
                      <div style={{ fontSize: 10, color: "rgba(173,217,255,0.65)", letterSpacing: "0.1em" }}>{d.label.toUpperCase()}</div>
                      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, color: d.score > 80 ? "#ff3d81" : d.score > 60 ? "#ffc857" : "#63f5ff" }}>{d.score}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* ── Threat Timeline ── */}
          {activeDashPanel === "threat-timeline" && (
            <div>
	              <div style={styles.dashCardLabel}>LIVE EVENT TIMELINE</div>
	              <div style={{ marginTop: 14, position: "relative" }}>
	                <div style={{ position: "absolute", left: 8, top: 0, bottom: 0, width: 1, background: "rgba(99,245,255,0.15)" }} />
	                {liveTimeline.map((event, index) => (
	                  <div key={`${event.source}-${index}`} style={{ display: "flex", gap: 14, marginBottom: 16, position: "relative" }}>
	                    <div style={{ width: 17, height: 17, borderRadius: "50%", background: LOG_COLOR[event.level] || "#63f5ff", flexShrink: 0, marginTop: 1, boxShadow: `0 0 9px ${LOG_COLOR[event.level] || "#63f5ff"}`, zIndex: 1 }} />
	                    <div style={{ flex: 1, paddingBottom: 4 }}>
	                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
	                        <span style={{ fontSize: 10, color: LOG_COLOR[event.level] || "#63f5ff", textTransform: "uppercase", letterSpacing: "0.1em" }}>{event.level} · {event.source}</span>
	                        <span style={{ fontSize: 10, color: "rgba(234,247,255,0.42)" }}>{formatTime(event.time)}</span>
	                      </div>
	                      <div style={{ fontSize: 13, color: "rgba(215,235,255,0.9)", lineHeight: 1.4, marginBottom: 3 }}>{event.message}</div>
	                      <div style={{ fontSize: 10, color: "#63f5ff" }}>Source-backed event</div>
	                    </div>
	                  </div>
	                ))}
	                {liveTimeline.length === 0 ? <div style={styles.feedLine}>No live timeline events received yet.</div> : null}
	              </div>
            </div>
          )}

          {/* ── Incident Feed ── */}
          {activeDashPanel === "incident-feed" && (
            <div>
              <IncidentActionDeck incidents={liveIncidents} executeAriaCommand={executeAriaCommand} processCommand={processCommand} />
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 12 }}>
                {["all", "critical", "high", "medium", "low"].map(f => (
                  <button key={f} onClick={() => setIncidentFilter(f)} style={{
                    padding: "3px 10px", borderRadius: 3, fontSize: 9, cursor: "pointer",
                    letterSpacing: "0.14em", textTransform: "uppercase",
                    fontFamily: "ui-monospace,'SF Mono',Menlo,monospace",
                    border: incidentFilter === f ? "1px solid rgba(200,16,46,0.55)" : "1px solid rgba(234,247,255,0.1)",
                    background: incidentFilter === f ? "rgba(200,16,46,0.1)" : "transparent",
                    color: incidentFilter === f ? "rgba(200,16,46,0.9)" : "rgba(234,247,255,0.38)",
                  }}>{f}</button>
                ))}
              </div>
              {liveIncidents.filter(inc => incidentFilter === "all" || inc.severity === incidentFilter).map(inc => {
                const isCrit = (inc.severity || "").toLowerCase() === "critical";
                const isHigh = (inc.severity || "").toLowerCase() === "high";
                const leftAlpha = isCrit ? 0.7 : isHigh ? 0.4 : 0.2;
                return (
                  <div key={inc.id} style={{
                    marginBottom: 6, borderRadius: "0 6px 6px 0",
                    background: isCrit ? "rgba(200,16,46,0.04)" : "rgba(234,247,255,0.018)",
                    border: "1px solid rgba(200,16,46,0.08)",
                    borderLeft: `2px solid rgba(200,16,46,${leftAlpha})`,
                    padding: "8px 12px",
                    fontFamily: "ui-monospace,'SF Mono',Menlo,monospace",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span style={{ fontSize: 8, letterSpacing: "0.18em", textTransform: "uppercase", color: isCrit ? "rgba(200,16,46,0.85)" : "rgba(234,247,255,0.35)" }}>{inc.severity}</span>
                        <span style={{ fontSize: 8, color: "rgba(234,247,255,0.22)" }}>·</span>
                        <span style={{ fontSize: 8, letterSpacing: "0.1em", color: "rgba(234,247,255,0.28)" }}>{inc.id}</span>
                      </div>
                      <span style={{ fontSize: 8, color: "rgba(234,247,255,0.25)" }}>{formatTime(inc.time)}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "rgba(215,235,255,0.88)", lineHeight: 1.45, marginBottom: 5 }}>{inc.title}</div>
                    <div style={{ display: "flex", gap: 5 }}>
                      <span style={{ fontSize: 8, padding: "1px 6px", borderRadius: 2, border: "1px solid rgba(200,16,46,0.2)", color: "rgba(200,16,46,0.65)", letterSpacing: "0.1em", textTransform: "uppercase" }}>{inc.source}</span>
                      <span style={{ fontSize: 8, padding: "1px 6px", borderRadius: 2, border: "1px solid rgba(234,247,255,0.1)", color: "rgba(234,247,255,0.32)", letterSpacing: "0.1em", textTransform: "uppercase" }}>{inc.status}</span>
                    </div>
                  </div>
                );
              })}
              {liveIncidents.length === 0 ? <div style={styles.feedLine}>No live review items are open. ARIA will not fabricate incident rows.</div> : null}
            </div>
          )}

          {/* ── Live Logs ── */}
          {activeDashPanel === "live-logs" && (
            <div>
              {/* Stats bar: LOG EVENTS / ERRORS / WARNINGS */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 12 }}>
                {[
                  { label: "LOG EVENTS", value: liveLogs.length, color: "#63f5ff" },
                  { label: "ERRORS",     value: liveLogs.filter((l) => l.level === "ERROR").length, color: "#ff3d81" },
                  { label: "WARNINGS",   value: liveLogs.filter((l) => l.level === "WARN").length,  color: "#ffc857" },
                ].map((stat) => (
                  <div key={stat.label} style={{ ...styles.dashCard, textAlign: "center", borderColor: `${stat.color}33` }}>
                    <div style={{ fontSize: 10, color: "rgba(173,217,255,0.55)", letterSpacing: "0.1em" }}>{stat.label}</div>
                    <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, color: stat.value > 0 ? stat.color : "rgba(234,247,255,0.35)", fontVariantNumeric: "tabular-nums" }}>{stat.value}</div>
                  </div>
                ))}
              </div>

              {/* Source rows with status dots and detail from live telemetry */}
              {sourceFabric.length > 0 && (
                <div style={{ ...styles.dashCard, marginBottom: 12 }}>
                  <div style={styles.dashCardLabel}>TELEMETRY SOURCES</div>
                  <div style={{ display: "grid", gap: 7, marginTop: 10 }}>
                    {sourceFabric.slice(0, 6).map((src) => (
                      <div key={src.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, ...styles.feedLine }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                          <span style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, background: src.status === "live" ? "#50ffb4" : src.status === "error" ? "#ff3d81" : "#ffc857", boxShadow: `0 0 7px ${src.status === "live" ? "#50ffb4" : src.status === "error" ? "#ff3d81" : "#ffc857"}` }} />
                          <span style={{ color: "rgba(215,235,255,0.85)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{src.label}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                          <span style={{ fontSize: 10, color: "rgba(173,217,255,0.5)", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{src.detail}</span>
                          <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 3, border: `1px solid ${src.status === "live" ? "rgba(80,255,180,0.28)" : "rgba(255,200,87,0.28)"}`, color: src.status === "live" ? "#50ffb4" : src.status === "error" ? "#ff3d81" : "#ffc857", letterSpacing: "0.1em", textTransform: "uppercase" }}>{src.status}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <LiveLogMeaningPanel logs={liveLogs} />
              <div style={styles.dashCardLabel}>LIVE SOURCE LOG</div>
	              <div style={{ marginTop: 10, background: "rgba(0,3,10,0.75)", borderRadius: 10, padding: "12px 14px", border: "1px solid rgba(99,245,255,0.1)", fontFamily: "monospace" }}>
	                {liveLogs.map((line, i) => (
	                  <div key={i} style={{ display: "flex", gap: 10, marginBottom: 7, fontSize: 12, lineHeight: 1.4 }}>
	                    <span style={{ color: "rgba(234,247,255,0.38)", flexShrink: 0, minWidth: 62 }}>{formatTime(line.time)}</span>
	                    <span style={{ color: LOG_COLOR[line.level], flexShrink: 0, minWidth: 46, fontWeight: 600 }}>{line.level}</span>
	                    <span style={{ color: "rgba(215,235,255,0.82)" }}>{line.message}</span>
	                  </div>
	                ))}
	                <div style={{ display: "flex", gap: 10, fontSize: 12 }}>
	                  <span style={{ color: "rgba(234,247,255,0.38)", minWidth: 62 }}>{formatTime(livePanelData?.generated_at)}</span>
                  <span style={{ color: "#63f5ff", minWidth: 46 }}>INFO</span>
                  <span style={{ color: "#63f5ff" }}>Awaiting next event<span style={{ animation: "dashBlink 1.1s step-end infinite" }}>▊</span></span>
                </div>
              </div>
              <div style={{ ...styles.dashCard, marginTop: 12 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <div style={styles.dashCardLabel}>SCAN LEDGER</div>
                  <button className="controlButton local" onClick={() => void loadScanHistory()}>Refresh History</button>
                </div>
                <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                  {scanHistory.slice(0, 5).map((scan) => (
                    <div key={scan.id} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, alignItems: "center", ...styles.feedLine }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ color: "#eaf7ff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{scan.id}</div>
                        <div style={{ marginTop: 3, color: "rgba(173,217,255,0.54)", fontSize: 11 }}>
                          {scan.depth} · {scan.target} · {formatTime(scan.completed_at || scan.started_at)}
                        </div>
                      </div>
                      <span style={{ color: scan.critical_count ? "#ff3d81" : scan.high_count ? "#ffc857" : "#63f5ff", fontVariantNumeric: "tabular-nums" }}>
                        {scan.finding_count} findings
                      </span>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="controlButton local" onClick={() => void downloadScanArtifact(scan.id, "json")}>JSON</button>
                        <button className="controlButton local" onClick={() => void downloadScanArtifact(scan.id, "audit")}>Audit</button>
                      </div>
                    </div>
                  ))}
                  {scanHistory.length === 0 ? <div style={styles.feedLine}>No scan records yet. Run Scan will create exportable evidence.</div> : null}
                </div>
              </div>
              <style>{`@keyframes dashBlink { 0%,100%{opacity:1} 50%{opacity:0} }`}</style>
            </div>
          )}

          {/* ── System Health ── */}
          {activeDashPanel === "system-health" && (
            <div>
              <style>{`
                @keyframes barPulse {
                  0%, 100% { opacity: 0.82; }
                  50% { opacity: 1; }
                }
                @keyframes shimmerSweep {
                  0% { transform: translateX(-100%); }
                  100% { transform: translateX(400%); }
                }
                @keyframes glowPulse {
                  0%, 100% { box-shadow: 0 0 8px 2px var(--bar-glow, #63f5ff66); }
                  50% { box-shadow: 0 0 22px 6px var(--bar-glow, #63f5ffaa); }
                }
                @keyframes valueFlicker {
                  0%, 90%, 100% { opacity: 1; }
                  95% { opacity: 0.6; }
                }
                @keyframes waveMove {
                  0% { background-position: 0% 50%; }
                  50% { background-position: 100% 50%; }
                  100% { background-position: 0% 50%; }
                }
                .metric-bar-fill {
                  animation: barPulse 2.4s ease-in-out infinite, glowPulse 2.4s ease-in-out infinite;
                }
                .metric-bar-shimmer {
                  animation: shimmerSweep 2.2s ease-in-out infinite;
                }
                .metric-value-anim {
                  animation: valueFlicker 4s ease-in-out infinite;
                }
              `}</style>
	              {[
                  { label: "LOAD AVG", value: Math.round(liveLoad * 100) / 100, pct: Math.min(100, Math.round((systemPanel.load_ratio || 0) * 100)), color: "#63f5ff", glow: "#63f5ff88" },
                  { label: "MEMORY PRESSURE", value: `${liveMemoryPercent}%`, pct: liveMemoryPercent, color: "#a855f7", glow: "#a855f788" },
                ].map(m => {
                  const isHot = m.pct > 80;
                  const fillColor = isHot ? "#ff3d81" : m.color;
                  const fillGlow = isHot ? "#ff3d8188" : m.glow;
                  return (
	                <div key={m.label} style={{ ...styles.dashCard, marginBottom: 12 }}>
	                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
	                    <span style={styles.dashCardLabel}>{m.label}</span>
	                    <span className="metric-value-anim" style={{ fontSize: 28, fontWeight: 800, color: fillColor, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums", textShadow: `0 0 14px ${fillGlow}` }}>{m.value}</span>
	                  </div>
                  <div style={{ height: 62, borderRadius: 14, background: "rgba(234,247,255,0.05)", overflow: "hidden", position: "relative", border: `1px solid ${fillColor}22` }}>
                    {/* track segments */}
                    {Array.from({ length: 30 }).map((_, i) => (
                      <div key={i} style={{ position: "absolute", top: 0, bottom: 0, left: `${(i / 30) * 100}%`, width: "1px", background: "rgba(234,247,255,0.04)", zIndex: 2 }} />
                    ))}
                    {/* animated fill */}
                    <div
                      className="metric-bar-fill"
                      style={{
                        position: "absolute", inset: 0, width: `${m.pct}%`,
                        background: `linear-gradient(90deg, ${m.color}cc 0%, ${fillColor} 60%, #ff3d81 100%)`,
                        backgroundSize: "200% 200%",
                        animation: "barPulse 2.4s ease-in-out infinite, glowPulse 2.4s ease-in-out infinite, waveMove 3s ease-in-out infinite",
                        "--bar-glow": fillGlow,
                        borderRadius: "0 8px 8px 0",
                        transition: "width 0.8s cubic-bezier(0.4,0,0.2,1)",
                      }}
                    />
                    {/* shimmer sweep */}
                    <div
                      className="metric-bar-shimmer"
                      style={{
                        position: "absolute", top: 0, bottom: 0, left: 0,
                        width: "20%",
                        background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.18) 50%, transparent 100%)",
                        zIndex: 3,
                        pointerEvents: "none",
                        clipPath: `inset(0 ${100 - m.pct}% 0 0)`,
                      }}
                    />
                    {/* leading edge glow */}
                    {m.pct > 2 && (
                      <div style={{
                        position: "absolute", top: 0, bottom: 0,
                        left: `calc(${m.pct}% - 3px)`, width: 6,
                        background: fillColor,
                        boxShadow: `0 0 12px 4px ${fillGlow}`,
                        borderRadius: 4,
                        zIndex: 4,
                        animation: "barPulse 2.4s ease-in-out infinite",
                        transition: "left 0.8s cubic-bezier(0.4,0,0.2,1)",
                      }} />
                    )}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "rgba(234,247,255,0.38)", marginTop: 4 }}>
                    <span>60s ago</span><span>now</span>
                  </div>
                </div>
              );
              })}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                {[
	                  { label: "DISKS", val: liveDisks.length, ok: true }, { label: "SOURCES", val: sourceFabric.length, ok: sourceFabric.length > 0 },
	                  { label: "SOCKETS",  val: liveConnections.length, ok: true },{ label: "PROCS",  val: liveProcesses.length, ok: true },
	                  { label: "UPTIME",   val: `${Math.round((livePanelData?.host?.uptime_seconds || 0) / 3600)}h`,  ok: true }, { label: "LOAD",    val: Number(liveLoad).toFixed(2),   ok: liveLoad < 4 },
                ].map(s => (
                  <div key={s.label} style={{ ...styles.dashCard, textAlign: "center" }}>
                    <div style={{ fontSize: 10, color: "rgba(173,217,255,0.55)", letterSpacing: "0.1em" }}>{s.label}</div>
                    <div style={{ fontSize: 15, fontWeight: 600, marginTop: 4, color: s.ok ? "#63f5ff" : "#ffc857" }}>{s.val}</div>
                  </div>
                ))}
              </div>
              <SystemResourceLeaders topCpuProcesses={topCpuProcesses} topMemoryProcesses={topMemoryProcesses} topDiskUsage={topDiskUsage} />
              <SystemProcessControl
                processes={liveProcesses}
                actionState={processActionState}
                onTerminate={terminateProcess}
              />
            </div>
          )}

          {/* ── Network Connections ── */}
          {activeDashPanel === "network" && (
            <NetworkOperationsPane
              connections={liveConnections}
              blockedIpItems={blockedIpItems}
              counts={panels?.network?.counts || {}}
              refreshLiveSnapshot={refreshLiveSnapshot}
              openActionPanel={openActionPanel}
            />
          )}

          {/* ── Bluetooth / BLE RF discovery ── */}
          {activeDashPanel === "bluetooth" && (
            <Suspense fallback={<div style={styles.feedLine}>Initialising local Bluetooth scanner...</div>}>
              <BluetoothScannerPane />
            </Suspense>
          )}

          {/* ── Blocked IPs ── */}
          {activeDashPanel === "blocked-ips" && (
            <BlockedIpPanel
              items={blockedIpItems}
              connector={blockedIpConnector}
              sources={sourceFabric}
              storedCount={ariaBlockedIps.length}
              loading={ariaBlockedLoading}
              actionMessage={ariaBlockedMessage}
              onRefresh={refreshAriaBlockedIps}
              onBlock={handleAriaBlock}
              onUnblock={handleAriaUnblock}
            />
          )}

          {/* ── Quarantine ── */}
          {activeDashPanel === "quarantine" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
	                <span style={styles.dashCardLabel}>CONTAINMENT VAULT — {liveFiles.length} ITEM{liveFiles.length === 1 ? "" : "S"}</span>
	                <span style={{ fontSize: 10, color: "#50ffb4", padding: "3px 9px", background: "rgba(80,255,180,0.12)", borderRadius: 99, border: "1px solid rgba(80,255,180,0.28)" }}>{(quarantineProvider?.status || "LIVE").toUpperCase()}</span>
	              </div>
	              <div style={{ ...styles.feedLine, marginBottom: 10 }}>{quarantinePanel.status || "Local quarantine provider is active."}</div>
	              {quarantineProvider?.detail && (
	                <div style={{ fontSize: 11, color: "rgba(215,235,255,0.58)", marginBottom: 10 }}>
	                  Provider: {quarantineProvider.label || quarantineProvider.id} · {quarantineProvider.detail}
	                </div>
	              )}
	              {liveFiles.length === 0 && (
	                <div style={{ ...styles.dashCard, borderLeft: "2px solid #50ffb4", color: "rgba(215,235,255,0.72)", fontSize: 12 }}>
	                  The local quarantine provider is configured and ready. No files are currently contained.
	                </div>
	              )}
	              {liveFiles.map((f, i) => (
	                <div key={`${f.name}-${i}`} style={{ ...styles.dashCard, marginBottom: 8, borderLeft: "2px solid #63f5ff" }}>
	                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
	                    <span style={{ fontFamily: "monospace", fontSize: 12, color: "rgba(215,235,255,0.9)" }}>{f.name || f.filename || f.id}</span>
	                    <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 4, background: "rgba(99,245,255,0.12)", color: "#63f5ff", flexShrink: 0, marginLeft: 8 }}>{(f.scan_result || f.kind || "CONTAINED").toUpperCase()}</span>
	                  </div>
	                  <div style={{ fontSize: 12, color: "rgba(215,235,255,0.72)", marginBottom: 4 }}>{f.path || f.filepath || "Quarantined artifact"}</div>
	                  <div style={{ display: "flex", gap: 12, fontSize: 11, color: "rgba(234,247,255,0.42)" }}>
	                    <span>{formatTime(f.modified || f.quarantined_at)}</span><span>{f.size || f.file_size || "size unknown"}</span><span>Source: {f.source || "quarantine"}</span>{f.sha256 && <span>SHA256 {String(f.sha256).slice(0, 10)}</span>}
	                  </div>
	                </div>
	              ))}
            </div>
          )}

          {/* ── Security Admin (lazy-loaded) ── */}
          {activeDashPanel === "security-admin" && (
            <HudFrame
              accent="#a78bfa"
              title="SECURITY ADMIN"
              subtitle="tenant · roles · audit · quota"
              variant="shield"
              data={{ denials: (securityAdminState?.authDenials || []).length }}
              metrics={[
                { label: "Authz denials", value: (securityAdminState?.authDenials || []).length, accent: (securityAdminState?.authDenials || []).length ? "#ff3d81" : undefined },
                { label: "Quota", value: securityAdminState?.quotaStatus?.used != null ? `${securityAdminState.quotaStatus.used}/${securityAdminState.quotaStatus.limit ?? "∞"}` : (securityAdminState?.dataUnavailable ? "—" : "OK") },
              ]}
            >
              <Suspense fallback={<div style={{ padding: 24, fontSize: 12, color: "rgba(234,247,255,0.46)" }}>Loading security admin…</div>}>
                <SecurityAdminPane
                  securityAdminState={securityAdminState}
                  accent="#a78bfa"
                />
              </Suspense>
            </HudFrame>
          )}

          {/* ── Identity & Sessions ── */}
          {activeDashPanel === "identity-sessions" && (
            <HudFrame
              accent="#38bdf8"
              title="IDENTITY & SESSIONS"
              subtitle="sessions · identity · revoke"
              variant="sessions"
              data={{ sessions: (identitySessionsState?.sessions || []).length }}
              metrics={[
                { label: "Active sessions", value: (identitySessionsState?.sessions || []).length },
                { label: "Sources", value: new Set((identitySessionsState?.sessions || []).map((s) => s.source).filter(Boolean)).size },
              ]}
            >
              <Suspense fallback={<div style={{ padding: 24, fontSize: 12, color: "rgba(234,247,255,0.46)" }}>Loading identity &amp; sessions…</div>}>
                <IdentitySessionsPane
                  state={identitySessionsState}
                  onRevoke={async (sessionId, reason) => {
                    const authHeaders = buildAuthHeaders();
                    await fetch(`${ARIA_API_BASE}/api/aria/sessions/${encodeURIComponent(sessionId)}/revoke`, {
                      method: "POST",
                      headers: { "content-type": "application/json", ...authHeaders },
                      body: JSON.stringify({ reason }),
                    });
                    void loadIdentitySessions();
                  }}
                  accent="#38bdf8"
                />
              </Suspense>
            </HudFrame>
          )}

          {/* ── Identity Galaxy Map (Identity & Access Sector) ── */}
          {activeDashPanel === "identity-galaxy" && (
            <div style={{ position: "absolute", inset: 0, zIndex: 20, background: "var(--cx-void, #030307)", display: "flex", flexDirection: "column" }}>
              <Suspense fallback={<div style={{ padding: 24, fontSize: 12, color: "rgba(234,247,255,0.46)", fontFamily: "ui-monospace,monospace" }}>Loading identity sector…</div>}>
                <IdentitySectorPane
                  onSpeak={speakARIARealtime}
                  onClose={() => { setActiveDashPanel(null); setDashVisible(false); }}
                  onRegisterIntents={(handlers) => { galaxyIntentRef.current = handlers || null; }}
                  demoMode={Boolean(aiSpmState?.demoMode || demoActive)}
                />
              </Suspense>
            </div>
          )}

          {/* ── Policy Changes ── */}
          {activeDashPanel === "policy-change" && (
            <HudFrame
              accent="#f59e0b"
              title="POLICY CHANGE CONTROL"
              subtitle="RBAC policies · preview · apply"
              variant="policy"
              data={{ policies: (policyChangeState?.policies || []).length, history: (policyChangeState?.history || []).length }}
              metrics={[
                { label: "Policies", value: (policyChangeState?.policies || []).length },
                { label: "History", value: (policyChangeState?.history || []).length },
              ]}
            >
              <Suspense fallback={<div style={{ padding: 24, fontSize: 12, color: "rgba(234,247,255,0.46)" }}>Loading policy changes…</div>}>
                <PolicyChangePane
                  state={policyChangeState}
                  onRefresh={loadPolicyChanges}
                  accent="#f59e0b"
                  appAuthHeaders={buildAuthHeaders()}
                />
              </Suspense>
            </HudFrame>
          )}

          {/* ── Decision Engine ── */}
          {activeDashPanel === "decision-engine" && (
            <HudFrame
              accent="#ff3d81"
              title="DECISION ENGINE"
              subtitle="decisions · attack paths · trust · evidence"
              variant="shield"
              data={{}}
              metrics={[]}
            >
              <Suspense fallback={<div style={{ padding: 24, fontSize: 12, color: "rgba(234,247,255,0.46)" }}>Loading decision engine…</div>}>
                <DecisionEnginePane accent="#ff3d81" operationalLoop={operationalLoop} />
              </Suspense>
            </HudFrame>
          )}

          {/* ── Trust Ladder ── */}
          {activeDashPanel === "trust-ladder" && (
            <HudFrame
              accent="#2dd4bf"
              title="TRUST LADDER CONTROL CENTRE"
              subtitle="capability modes · human overrides · audit"
              variant="shield"
              data={{}}
              metrics={[]}
            >
              <Suspense fallback={<div style={{ padding: 24, fontSize: 12, color: "rgba(234,247,255,0.46)" }}>Loading trust ladder…</div>}>
                <TrustLadderControlCentre accent="#2dd4bf" />
              </Suspense>
            </HudFrame>
          )}

          {/* ── ARIA Command Center — placeholder to keep scroll height ── */}
          {activeDashPanel === "aria-center" && (
            <div style={{ height: 40 }} />
          )}
        </div>
      </div>

      <div style={styles.hint}>
        Live monitoring · Function execution · Security operations
      </div>

      <style>
        {`
          * {
            box-sizing: border-box;
          }

          html,
          body,
          #root {
            margin: 0;
            width: 100%;
            height: 100%;
            overflow: hidden;
            background: #01020a;
          }

          button:hover {
            background: rgba(99, 245, 255, 0.14) !important;
            border-color: rgba(246, 251, 255, 0.42) !important;
            box-shadow:
              0 0 24px rgba(22, 135, 255, 0.28),
              inset 0 0 24px rgba(99, 245, 255, 0.08);
            transform: translateY(-1px);
          }

          .dot {
            width: 8px;
            height: 8px;
            border-radius: 999px;
            background: #eaf7ff;
            box-shadow: 0 0 18px rgba(234, 247, 255, 0.75);
            display: inline-block;
          }

          .dot.listening {
            background: #1687ff;
            box-shadow:
              0 0 14px rgba(22, 135, 255, 1),
              0 0 34px rgba(22, 135, 255, 0.75);
          }

          .dot.speaking {
            background: #63f5ff;
            box-shadow:
              0 0 14px rgba(99, 245, 255, 1),
              0 0 34px rgba(99, 245, 255, 0.9),
              0 0 60px rgba(255, 200, 87, 0.32);
          }

	          .dot.demo {
	            background: #ffc857;
	            box-shadow:
	              0 0 14px rgba(255, 200, 87, 1),
	              0 0 34px rgba(255, 61, 129, 0.5);
	          }

            @keyframes ariaLavaPulse {
              0%, 100% { transform: translate3d(-4%, 2%, 0) scale(1); border-radius: 44% 56% 62% 38% / 48% 42% 58% 52%; }
              33% { transform: translate3d(6%, -5%, 0) scale(1.08); border-radius: 61% 39% 44% 56% / 37% 58% 42% 63%; }
              66% { transform: translate3d(-2%, 7%, 0) scale(0.96); border-radius: 42% 58% 38% 62% / 61% 39% 55% 45%; }
            }

            @keyframes ariaOrbitDrift {
              0% { transform: rotate(0deg) scale(1); }
              50% { transform: rotate(180deg) scale(1.03); }
              100% { transform: rotate(360deg) scale(1); }
            }

            @keyframes ariaPathFlow {
              from { stroke-dashoffset: 180; opacity: 0.2; }
              50% { opacity: 1; }
              to { stroke-dashoffset: 0; opacity: 0.35; }
            }

            @keyframes ariaRoomBreathe {
              0%, 100% { filter: saturate(1) brightness(1); transform: translateY(0); }
              50% { filter: saturate(1.22) brightness(1.08); transform: translateY(-2px); }
            }

            .livingDashboardRoom {
              position: relative;
              display: grid;
              grid-template-columns: minmax(0, 1fr) 230px;
              gap: 14px;
              min-height: 300px;
              margin-bottom: 16px;
              padding: 16px;
              border-radius: 28px;
              overflow: hidden;
              border: 1px solid color-mix(in srgb, var(--accent), transparent 58%);
              background:
                radial-gradient(circle at 20% 0%, color-mix(in srgb, var(--accent), transparent 70%), transparent 40%),
                radial-gradient(circle at 80% 30%, rgba(255,72,220,0.18), transparent 38%),
                rgba(3, 5, 14, 0.58);
              box-shadow: 0 28px 88px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.08);
              animation: ariaRoomBreathe 6s ease-in-out infinite;
            }

            .livingBackdrop {
              position: absolute;
              inset: -40%;
              background: conic-gradient(from 120deg, transparent, color-mix(in srgb, var(--accent), transparent 76%), transparent, rgba(255,72,220,0.16), transparent);
              filter: blur(22px);
              animation: ariaOrbitDrift 28s linear infinite;
              pointer-events: none;
            }

            .livingRoomVisual,
            .livingRoomSide {
              position: relative;
              z-index: 1;
            }

            .orbitEntityField,
            .networkWeave {
              position: relative;
              min-height: 268px;
              border-radius: 24px;
              overflow: hidden;
              background:
                radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--accent), transparent 78%), transparent 46%),
                linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02));
              border: 1px solid rgba(255,255,255,0.08);
            }

            .orbitEntityField svg,
            .networkWeave svg {
              position: absolute;
              inset: 0;
              width: 100%;
              height: 100%;
            }

            .orbitRing {
              fill: none;
              stroke: color-mix(in srgb, var(--accent), transparent 58%);
              stroke-width: 1.2;
              transform-origin: center;
              animation: ariaOrbitDrift 18s linear infinite;
            }

            .orbitRingB { animation-duration: 26s; animation-direction: reverse; opacity: 0.65; }
            .orbitRingC { animation-duration: 34s; opacity: 0.5; }

            .orbitThread {
              fill: none;
              stroke: rgba(255,255,255,0.16);
              stroke-width: 1.3;
              stroke-dasharray: 7 10;
              animation: ariaPathFlow 5s linear infinite;
            }

            .orbitThreadAlt { animation-duration: 7s; opacity: 0.7; }

            .orbitNucleus {
              position: absolute;
              left: 50%;
              top: 50%;
              width: 104px;
              height: 104px;
              transform: translate(-50%, -50%);
              display: grid;
              place-items: center;
              border-radius: 50%;
              background: radial-gradient(circle, rgba(255,255,255,0.86), color-mix(in srgb, var(--accent), transparent 38%) 28%, transparent 70%);
              box-shadow: 0 0 60px color-mix(in srgb, var(--accent), transparent 48%);
            }

            .orbitNucleus span {
              width: 44px;
              height: 44px;
              border-radius: 50%;
              background: rgba(255,255,255,0.78);
              filter: blur(1px);
            }

            .orbitNode {
              position: absolute;
              left: var(--x);
              top: var(--y);
              width: 15px;
              height: 15px;
              border-radius: 50%;
              transform: translate(-50%, -50%);
              background: var(--tone);
              box-shadow: 0 0 24px var(--tone), 0 0 64px color-mix(in srgb, var(--tone), transparent 62%);
              animation: ariaLavaPulse 4s ease-in-out infinite;
            }

            .lavaBlob {
              position: relative;
              height: 190px;
              border-radius: 26px;
              overflow: hidden;
              background:
                radial-gradient(circle at 35% 28%, rgba(255,255,255,0.18), transparent 16%),
                linear-gradient(145deg, rgba(255,255,255,0.08), rgba(255,255,255,0.025));
              border: 1px solid rgba(255,255,255,0.09);
              box-shadow: inset 0 0 44px rgba(255,255,255,0.035);
            }

            .lavaOrb {
              position: absolute;
              width: var(--hotness);
              height: var(--hotness);
              min-width: 72px;
              min-height: 72px;
              border-radius: 50%;
              filter: blur(1px);
              background: radial-gradient(circle at 35% 30%, rgba(255,255,255,0.82), var(--accent) 18%, rgba(255,72,220,0.72) 52%, transparent 76%);
              mix-blend-mode: screen;
              animation: ariaLavaPulse 5.5s ease-in-out infinite;
            }

            .lavaOrbOne { left: 10%; top: 18%; }
            .lavaOrbTwo { right: 5%; top: 32%; animation-delay: -1.8s; }
            .lavaOrbThree { left: 28%; bottom: -6%; animation-delay: -3.4s; }

            .lavaCore {
              position: absolute;
              inset: 0;
              display: grid;
              place-content: center;
              text-align: center;
              gap: 4px;
              text-shadow: 0 2px 18px rgba(0,0,0,0.45);
            }

            .lavaCore strong {
              font-size: 44px;
              line-height: 1;
            }

            .lavaCore span,
            .livingRoomText span,
            .livingRoomText em {
              color: rgba(236,218,255,0.72);
              font-size: 10px;
              letter-spacing: 0.18em;
              text-transform: uppercase;
              font-style: normal;
            }

            .livingRoomSide {
              display: grid;
              gap: 12px;
              align-content: stretch;
            }

            .livingRoomText {
              display: grid;
              place-items: center;
              text-align: center;
              min-height: 62px;
              border-radius: 20px;
              border: 1px solid rgba(255,255,255,0.08);
              background: rgba(255,255,255,0.045);
            }

            .livingRoomText strong {
              font-size: 28px;
              color: #eaf7ff;
            }

            .networkPath {
              fill: none;
              stroke: color-mix(in srgb, var(--accent), white 20%);
              stroke-width: 2;
              stroke-dasharray: 18 18;
              filter: drop-shadow(0 0 10px color-mix(in srgb, var(--accent), transparent 35%));
              animation: ariaPathFlow 3.8s linear infinite;
            }

            .weaveEndpoint {
              position: absolute;
              top: 50%;
              width: 42px;
              height: 42px;
              border-radius: 50%;
              transform: translateY(-50%);
              background: radial-gradient(circle, #fff, var(--accent) 32%, transparent 72%);
              box-shadow: 0 0 36px var(--accent);
            }

            .weaveEndpoint.left { left: 18px; }
            .weaveEndpoint.right { right: 18px; }

            .weaveStats {
              position: absolute;
              left: 50%;
              top: 50%;
              transform: translate(-50%, -50%);
              display: grid;
              justify-items: center;
              padding: 16px 24px;
              border-radius: 999px;
              background: rgba(3,5,14,0.62);
              border: 1px solid rgba(255,255,255,0.10);
              backdrop-filter: blur(18px);
            }

            .weaveStats strong {
              font-size: 40px;
              line-height: 1;
            }

            .weaveStats span {
              color: rgba(236,218,255,0.72);
              font-size: 10px;
              letter-spacing: 0.18em;
              text-transform: uppercase;
            }

            @keyframes ariaRadarSweep {
              from { transform: translate(-50%, -50%) rotate(0deg); }
              to { transform: translate(-50%, -50%) rotate(360deg); }
            }

            @keyframes ariaWebRotate3d {
              0% { transform: rotateX(62deg) rotateZ(0deg); }
              100% { transform: rotateX(62deg) rotateZ(360deg); }
            }

            @keyframes ariaParticleDiffuse {
              0%, 100% { transform: translate3d(var(--x, 0), var(--y, 0), 0) scale(0.74); opacity: 0.45; }
              50% { transform: translate3d(var(--x, 0), var(--y, 0), 38px) scale(1.14); opacity: 1; }
            }

            @keyframes ariaPacketFlow {
              from { transform: translateX(-18%) translateZ(0); opacity: 0; }
              18% { opacity: 1; }
              to { transform: translateX(118%) translateZ(90px); opacity: 0; }
            }

            @keyframes ariaCorePulse {
              0%, 100% { transform: translate(-50%, -50%) scale(1); filter: saturate(1); }
              50% { transform: translate(-50%, -50%) scale(1.08); filter: saturate(1.35); }
            }

            .panelVisualStage {
              --stageDepth: 980px;
              position: relative;
              min-height: 360px;
              margin-bottom: 12px;
              perspective: var(--stageDepth);
              border-radius: 30px;
              overflow: hidden;
              border: 1px solid color-mix(in srgb, var(--accent), transparent 52%);
              background:
                radial-gradient(circle at 12% 8%, color-mix(in srgb, var(--accent), transparent 68%), transparent 34%),
                radial-gradient(circle at 86% 28%, rgba(255,67,217,0.18), transparent 36%),
                linear-gradient(145deg, rgba(6,8,22,0.9), rgba(12,7,22,0.88));
              box-shadow: 0 30px 100px rgba(0,0,0,0.44), inset 0 1px 0 rgba(255,255,255,0.08);
              isolation: isolate;
              cursor: grab;
            }

            .panelVisualStage:active {
              cursor: grabbing;
            }

            .stageAtmosphere {
              position: absolute;
              inset: -32%;
              background:
                conic-gradient(from 90deg, transparent, color-mix(in srgb, var(--accent), transparent 72%), transparent, rgba(255,68,214,0.18), transparent),
                radial-gradient(circle, rgba(255,255,255,0.08), transparent 54%);
              filter: blur(18px);
              animation: ariaWebRotate3d 34s linear infinite;
              transform-origin: center;
            }

            .motionOff *,
            .motionOff .stageAtmosphere {
              animation-play-state: paused !important;
            }

            [data-testid="aria-stage-ai-spm"] .ariaStageSignature,
            [data-testid="aria-stage-ai-spm"] .stageTitle {
              display: none;
            }

            .ariaStageSignature {
              position: absolute;
              left: 24px;
              top: 12px;
              z-index: 6;
              display: flex;
              align-items: center;
              gap: 8px;
              pointer-events: none;
              text-transform: uppercase;
              text-shadow: 0 0 18px color-mix(in srgb, var(--accent), transparent 34%);
              padding: 4px 10px;
              border-radius: 999px;
              background: rgba(5, 9, 22, 0.36);
              border: 1px solid rgba(143, 199, 255, 0.18);
              backdrop-filter: blur(8px);
            }

            .ariaStageSignature span {
              font-size: 10px;
              font-weight: 700;
              letter-spacing: 0.18em;
              color: #f6fbff;
            }

            .ariaStageSignature i {
              width: 7px;
              height: 7px;
              border-radius: 50%;
              background: var(--accent);
              box-shadow: 0 0 16px var(--accent), 0 0 44px rgba(255,68,214,0.45);
              animation: ariaCorePulse 2.4s ease-in-out infinite;
            }

            .stageKineticPane {
              position: absolute;
              inset: 52px 18px 18px;
              border-radius: 26px;
              overflow: hidden;
              transform-style: preserve-3d;
              background:
                linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02)),
                radial-gradient(circle at 50% 52%, color-mix(in srgb, var(--accent), transparent 78%), transparent 50%);
              border: 1px solid rgba(255,255,255,0.1);
              box-shadow: inset 0 0 70px rgba(255,255,255,0.04), 0 18px 54px rgba(0,0,0,0.34);
            }

            .stageTitle {
              position: absolute;
              right: 18px;
              top: 16px;
              z-index: 5;
              display: grid;
              justify-items: end;
              gap: 2px;
              text-transform: uppercase;
            }

            .stageTitle span,
            .stageTitle em {
              color: rgba(236,218,255,0.64);
              font-size: 10px;
              letter-spacing: 0.2em;
              font-style: normal;
            }

            .stageTitle strong {
              color: #f6fbff;
              font-size: 42px;
              line-height: 1;
            }

            .panelControlDeck {
              display: flex;
              gap: 8px;
              flex-wrap: wrap;
              align-items: center;
              margin-bottom: 16px;
              padding: 10px;
              border-radius: 18px;
              border: 1px solid color-mix(in srgb, var(--accent), transparent 68%);
              background: rgba(4,7,18,0.58);
              backdrop-filter: blur(18px);
            }

            .controlButton,
            .controlToggle {
              border: 1px solid color-mix(in srgb, var(--accent), transparent 66%);
              background: rgba(255,255,255,0.045);
              color: rgba(234,247,255,0.84);
              border-radius: 999px;
              padding: 8px 12px;
              cursor: pointer;
              font-size: 11px;
              letter-spacing: 0.08em;
              text-transform: uppercase;
            }

            .controlButton.primary,
            .controlToggle.enabled {
              background: color-mix(in srgb, var(--accent), transparent 82%);
              color: #f7fbff;
              box-shadow: 0 0 24px color-mix(in srgb, var(--accent), transparent 76%);
            }

            .controlButton.local {
              border-color: rgba(255,255,255,0.12);
            }

            .controlButton:disabled,
            .controlToggle:disabled {
              opacity: 0.38;
              cursor: not-allowed;
              transform: none !important;
              box-shadow: none !important;
            }

            /* Canvas visual panels — all drawing via canvas 2D API */


            @media (max-width: 760px) {
              .panelVisualStage {
                min-height: 420px;
              }

              .ariaAdminTopGrid {
                grid-template-columns: minmax(0, 1fr) !important;
                gap: 8px !important;
              }

              .ariaAdminTenantRow {
                grid-template-columns: 84px minmax(0, 1fr) !important;
                gap: 8px !important;
              }

              .ariaAdminTenantList span:last-child {
                white-space: normal !important;
                overflow-wrap: anywhere;
              }

              .ariaAdminAuditList {
                max-height: 128px !important;
              }

              .ariaAdminCommandRow {
                grid-template-columns: minmax(0, 1fr) !important;
              }

              .ariaAdminCommandRow button {
                width: 100%;
              }

              .ariaAdminActionGrid {
                display: grid;
                gap: 0;
              }

              .ariaAdminCommandChips button {
                flex: 1 1 calc(50% - 6px);
                text-align: center;
              }

              .ariaAdminStreamCard {
                margin-top: 8px !important;
              }
            }

            @media (max-width: 768px) {
              .aria-canvas-mount {
                display: none !important;
              }

              .aria-canvas-mini {
                display: none !important;
              }

              .aria-page {
                overflow-x: hidden !important;
              }

              .aria-ui-block {
                top: 10px !important;
                left: 10px !important;
                right: 10px !important;
              }

              .aria-telemetry-grid {
                grid-template-columns: repeat(3, 1fr) !important;
                width: auto !important;
              }

              .aria-controls-bar {
                top: auto !important;
                bottom: 80px !important;
                right: 10px !important;
                left: 10px !important;
                flex-wrap: wrap !important;
                justify-content: flex-end !important;
              }

              .aria-command-dock {
                width: calc(100vw - 20px) !important;
                min-width: 0 !important;
              }

              .aria-hud-panel {
                overflow-y: auto !important;
              }

              .aria-action-panel {
                width: 96vw !important;
                max-height: 92vh !important;
              }

              .livingDashboardRoom {
                grid-template-columns: minmax(0, 1fr) !important;
              }
            }

            @media (max-width: 375px) {
              html, body, #root {
                font-size: 14px;
              }

              .aria-ui-block {
                gap: 6px !important;
              }

              .aria-telemetry-grid {
                grid-template-columns: 1fr 1fr !important;
              }

              .aria-controls-bar button,
              .aria-controls-bar select {
                font-size: 10px !important;
                padding: 7px 8px !important;
              }

              .aria-panel-header-toggle {
                cursor: pointer;
                user-select: none;
              }

              .aria-panel-header-toggle .aria-panel-body {
                display: none;
              }

              .aria-panel-header-toggle:target .aria-panel-body,
              .aria-panel-header-toggle.open .aria-panel-body {
                display: block;
              }

              .aria-action-panel {
                max-height: 98vh !important;
              }
            }
	        `}
	      </style>
    </div>
  );
}

const styles = {
  page: {
    width: "100vw",
    height: "100vh",
    overflow: "hidden",
    background:
      "radial-gradient(circle at 50% 45%, rgba(31, 76, 132, 0.12), #02040b 58%)",
    color: "#eaf7ff",
    fontFamily:
      "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
  },

  canvasMount: {
    position: "fixed",
    inset: 0,
    width: "100vw",
    height: "100vh",
    zIndex: 0,
    pointerEvents: "none",
    transition: "all 0.6s cubic-bezier(0.4,0,0.2,1)",
  },

  canvasMini: {
    position: "fixed",
    bottom: 84,
    left: 24,
    width: 180,
    height: 180,
    borderRadius: "50%",
    overflow: "hidden",
    border: "1px solid rgba(99,245,255,0.38)",
    boxShadow: "0 0 28px rgba(99,245,255,0.22), 0 0 60px rgba(22,135,255,0.12)",
    cursor: "pointer",
    zIndex: 8,
    pointerEvents: "auto",
    transition: "all 0.6s cubic-bezier(0.4,0,0.2,1)",
  },

  ui: {
    position: "fixed",
    top: 112,
    left: 22,
    zIndex: 10,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    pointerEvents: "none",
  },

  brandBlock: {
    display: "grid",
    gap: 4,
  },

  title: {
    fontSize: 28,
    fontWeight: 700,
    letterSpacing: 0,
    textTransform: "uppercase",
    color: "rgba(246, 251, 255, 0.96)",
    textShadow: "0 0 18px rgba(99, 245, 255, 0.12)",
  },

  subtitle: {
    maxWidth: 360,
    fontSize: 10,
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    color: "rgba(174, 197, 222, 0.72)",
  },

  status: {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 14px",
    border: "1px solid rgba(140, 178, 255, 0.2)",
    borderRadius: 6,
    background: "rgba(4, 9, 20, 0.72)",
    boxShadow: "0 18px 50px rgba(0, 0, 0, 0.24)",
    backdropFilter: "blur(18px)",
    width: "fit-content",
    fontSize: 13,
    color: "rgba(234, 247, 255, 0.88)",
  },

  telemetryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 8,
    pointerEvents: "none",
    width: 360,
  },

  telemetryBadge: {
    display: "grid",
    gap: 4,
    padding: "9px 11px",
    border: "1px solid rgba(121, 171, 255, 0.18)",
    borderRadius: 6,
    background: "rgba(4, 9, 20, 0.62)",
    fontSize: 10,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "rgba(162, 187, 214, 0.74)",
    minWidth: 88,
  },

  mapButton: {
    width: "fit-content",
    border: "1px solid rgba(140, 178, 255, 0.2)",
    background: "rgba(8, 14, 28, 0.68)",
    color: "rgba(232, 241, 252, 0.88)",
    borderRadius: 6,
    padding: "10px 14px",
    fontSize: 12,
    cursor: "pointer",
    pointerEvents: "auto",
    backdropFilter: "blur(18px)",
  },

  controls: {
    position: "fixed",
    right: 22,
    top: 112,
    zIndex: 10,
    display: "flex",
    gap: 8,
    padding: 8,
    border: "1px solid rgba(140, 178, 255, 0.14)",
    borderRadius: 8,
    background: "rgba(4, 8, 18, 0.62)",
    backdropFilter: "blur(18px)",
  },

  voiceModeButton: {
    border: "1px solid rgba(99,245,255,0.3)",
    background: "linear-gradient(135deg, rgba(99,245,255,0.08), rgba(8,14,28,0.82))",
    color: "rgba(210,249,255,0.92)",
    boxShadow: "inset 0 0 14px rgba(99,245,255,0.06)",
  },

  voiceModeActiveButton: {
    border: "1px solid rgba(99,245,255,0.62)",
    background: "linear-gradient(135deg, rgba(99,245,255,0.24), rgba(8,14,28,0.9))",
    color: "#63f5ff",
    boxShadow: "0 0 18px rgba(99,245,255,0.22), inset 0 0 18px rgba(99,245,255,0.1)",
  },

  voiceAlertsButton: {
    border: "1px solid rgba(255,200,87,0.24)",
    background: "linear-gradient(135deg, rgba(255,200,87,0.06), rgba(8,14,28,0.82))",
    color: "rgba(255,232,174,0.78)",
    boxShadow: "inset 0 0 14px rgba(255,200,87,0.04)",
  },

  voiceAlertsActiveButton: {
    border: "1px solid rgba(255,200,87,0.7)",
    background: "linear-gradient(135deg, rgba(255,200,87,0.26), rgba(30,18,4,0.9))",
    color: "#ffc857",
    boxShadow: "0 0 18px rgba(255,200,87,0.2), inset 0 0 16px rgba(255,200,87,0.08)",
  },

  voiceMutedButton: {
    border: "1px solid rgba(255,200,87,0.55)",
    background: "linear-gradient(135deg, rgba(255,200,87,0.16), rgba(8,14,28,0.88))",
    color: "#ffc857",
    boxShadow: "0 0 14px rgba(255,200,87,0.18)",
  },

  autonomySelect: {
    border: "1px solid rgba(140, 178, 255, 0.2)",
    background: "rgba(8, 14, 28, 0.88)",
    color: "#eaf7ff",
    padding: "9px 12px",
    borderRadius: 6,
    fontSize: 12,
    cursor: "pointer",
    outline: "none",
  },

  commandDock: {
    position: "fixed",
    left: "50%",
    bottom: 22,
    transform: "translateX(-50%)",
    zIndex: 9990,
    width: "min(820px, 92vw)",
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: 10,
    padding: 10,
    borderRadius: 8,
    border: "1px solid rgba(125, 166, 255, 0.24)",
    background: "rgba(3, 7, 20, 0.82)",
    backdropFilter: "blur(18px)",
    boxShadow: "0 12px 42px rgba(0,0,0,0.45)",
    transition: "opacity 280ms ease, transform 320ms cubic-bezier(0.34, 1.56, 0.64, 1)",
  },

  commandInput: {
    width: "100%",
    border: "1px solid rgba(160, 205, 255, 0.25)",
    borderRadius: 6,
    background: "rgba(5, 10, 21, 0.95)",
    color: "#eaf7ff",
    padding: "12px 14px",
    fontSize: 14,
    outline: "none",
  },

  commandButton: {
    border: "1px solid rgba(160, 205, 255, 0.36)",
    borderRadius: 6,
    background: "rgba(32, 88, 145, 0.86)",
    color: "#eaf7ff",
    padding: "0 18px",
    fontSize: 14,
    cursor: "pointer",
  },

  actionPanelBackdrop: {
    position: "fixed",
    inset: 0,
    zIndex: 31,
    background: "rgba(1, 2, 10, 0.72)",
    backdropFilter: "blur(6px)",
    transition: "opacity 0.38s ease",
  },

  actionPanel: {
    position: "fixed",
    top: "50%",
    left: "50%",
    zIndex: 32,
    width: "min(820px, 94vw)",
    maxHeight: "min(620px, 88vh)",
    borderRadius: 14,
    border: "1px solid rgba(99, 245, 255, 0.22)",
    background: "rgba(4, 8, 20, 0.97)",
    backdropFilter: "blur(28px)",
    boxShadow: "0 32px 100px rgba(0,0,0,0.72), 0 0 60px rgba(99,245,255,0.08)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    transition: "transform 0.38s cubic-bezier(0.4,0,0.2,1), opacity 0.38s ease",
  },

  miniActionButton: {
    border: "1px solid rgba(160, 205, 255, 0.22)",
    borderRadius: 999,
    background: "rgba(22, 135, 255, 0.12)",
    color: "rgba(234,247,255,0.86)",
    padding: "6px 10px",
    fontSize: 10,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    cursor: "pointer",
  },

  actionPanelHidden: {
    transform: "translate(-50%, -50%) scale(0.92)",
    opacity: 0,
    pointerEvents: "none",
  },

  actionPanelVisible: {
    transform: "translate(-50%, -50%) scale(1)",
    opacity: 1,
  },

  actionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontSize: 11,
    letterSpacing: "0.2em",
    color: "rgba(99, 245, 255, 0.85)",
    padding: "16px 20px 14px",
    borderBottom: "1px solid rgba(99,245,255,0.14)",
    flexShrink: 0,
  },

  closeButton: {
    border: "1px solid rgba(171, 224, 255, 0.35)",
    background: "transparent",
    color: "#eaf7ff",
    borderRadius: 5,
    padding: "6px 10px",
    cursor: "pointer",
    fontSize: 12,
  },

  actionPrompt: {
    fontSize: 14,
    lineHeight: 1.45,
    color: "rgba(235, 245, 255, 0.96)",
    marginBottom: 10,
  },

  currentTask: {
    fontSize: 12,
    color: "rgba(133, 222, 255, 0.9)",
    marginBottom: 10,
  },

  pendingTask: {
    fontSize: 12,
    color: "rgba(232, 241, 252, 0.8)",
    marginBottom: 8,
    padding: "8px 10px",
    border: "1px solid rgba(140,178,255,0.16)",
    borderRadius: 6,
    background: "rgba(8,14,28,0.52)",
  },

  optionGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 8,
    marginTop: 8,
  },

  optionButton: {
    border: "1px solid rgba(151, 173, 255, 0.36)",
    borderRadius: 6,
    background: "rgba(8, 14, 28, 0.74)",
    color: "#eaf7ff",
    padding: "10px 12px",
    textAlign: "left",
    fontSize: 13,
    cursor: "pointer",
  },

  panelState: {
    marginTop: 12,
    paddingTop: 10,
    borderTop: "1px solid rgba(147, 196, 255, 0.2)",
    fontSize: 12,
    color: "rgba(175, 213, 255, 0.9)",
  },

  confirmRow: {
    display: "flex",
    gap: 8,
    marginTop: 10,
  },

  confirmButton: {
    border: "1px solid rgba(99,245,255,0.32)",
    borderRadius: 6,
    background: "rgba(32, 88, 145, 0.82)",
    color: "#f7fbff",
    padding: "8px 12px",
    cursor: "pointer",
    fontSize: 12,
  },

  cancelButton: {
    border: "1px solid rgba(220,234,250,0.16)",
    borderRadius: 6,
    background: "rgba(8,14,28,0.58)",
    color: "rgba(220,234,250,0.74)",
    padding: "8px 12px",
    cursor: "pointer",
    fontSize: 12,
  },

  toolResultList: {
    display: "grid",
    gap: 6,
    marginTop: 10,
  },

  toolResult: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    padding: "7px 9px",
    borderRadius: 6,
    border: "1px solid rgba(99,245,255,0.16)",
    background: "rgba(3, 9, 22, 0.58)",
    fontSize: 11,
  },

  toolName: {
    color: "rgba(215,235,255,0.78)",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },

  toolStatus: {
    color: "#63f5ff",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },

  approvalWrap: {
    marginTop: 12,
    paddingTop: 10,
    borderTop: "1px solid rgba(147, 196, 255, 0.2)",
    display: "grid",
    gap: 8,
  },

  approvalItem: {
    border: "1px solid rgba(255,200,87,0.22)",
    borderRadius: 6,
    background: "rgba(255,200,87,0.06)",
    padding: 10,
    display: "grid",
    gap: 7,
  },

  approvalReason: {
    fontSize: 12,
    lineHeight: 1.4,
    color: "rgba(234,247,255,0.88)",
  },

  approvalMeta: {
    fontSize: 10,
    color: "rgba(255,200,87,0.82)",
    letterSpacing: "0.1em",
    textTransform: "uppercase",
  },

  approvalButtons: {
    display: "flex",
    gap: 8,
  },

  memoryWrap: {
    marginTop: 12,
    paddingTop: 10,
    borderTop: "1px solid rgba(147, 196, 255, 0.2)",
  },

  memoryText: {
    maxHeight: 130,
    overflowY: "auto",
    margin: 0,
    whiteSpace: "pre-wrap",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontSize: 11,
    lineHeight: 1.45,
    color: "rgba(220,237,255,0.78)",
    padding: "8px 9px",
    borderRadius: 6,
    border: "1px solid rgba(140,178,255,0.16)",
    background: "rgba(3,9,22,0.58)",
  },

  liveFeedWrap: {
    marginTop: 12,
    borderTop: "1px solid rgba(147, 196, 255, 0.2)",
    paddingTop: 10,
  },

  liveFeedTitle: {
    fontSize: 11,
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    color: "rgba(173, 217, 255, 0.9)",
    marginBottom: 6,
  },

  liveFeedList: {
    display: "grid",
    gap: 6,
    maxHeight: 130,
    overflowY: "auto",
    paddingRight: 2,
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

  button: {
    border: "1px solid rgba(140, 178, 255, 0.2)",
    background: "rgba(8, 14, 28, 0.68)",
    color: "#eaf7ff",
    padding: "9px 12px",
    borderRadius: 6,
    fontSize: 12,
    cursor: "pointer",
    backdropFilter: "blur(18px)",
    transition: "0.25s ease",
  },

  hint: {
    position: "fixed",
    right: 24,
    bottom: 86,
    maxWidth: 260,
    color: "rgba(234, 247, 255, 0.42)",
    fontSize: 11,
    lineHeight: 1.6,
    textAlign: "right",
    pointerEvents: "none",
    zIndex: 10,
  },

  mapHint: {
    position: "fixed",
    top: 88,
    right: 22,
    zIndex: 30,
    pointerEvents: "none",
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    background: "rgba(4,8,18,0.82)",
    backdropFilter: "blur(14px)",
    borderRadius: 8,
    border: "1px solid rgba(99,245,255,0.2)",
    color: "rgba(220,234,250,0.84)",
    fontSize: 12,
  },

  mapHintDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: "#63f5ff",
    boxShadow: "0 0 8px rgba(99,245,255,0.52)",
  },

  mapCloseButton: {
    pointerEvents: "auto",
    background: "rgba(8,14,28,0.7)",
    border: "1px solid rgba(234,247,255,0.18)",
    borderRadius: 5,
    color: "rgba(234,247,255,0.72)",
    padding: "4px 8px",
    cursor: "pointer",
    fontSize: 11,
  },

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

  narrativeOverlay: {
    position: "fixed",
    inset: 0,
    zIndex: 60,
    display: "block",
    padding: 0,
    background: "transparent",
    pointerEvents: "none",
  },

  narrativeOrbEntity: {
    position: "fixed",
    inset: 0,
    pointerEvents: "none",
  },

  narrativeOrbShell: {
    position: "fixed",
    inset: 0,
    borderRadius: 0,
    border: "none",
    background: "transparent",
    boxShadow: "none",
    overflow: "hidden",
    pointerEvents: "none",
  },

  narrativeCanvas: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    display: "block",
  },

  narrativeNoiseCanvas: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    display: "block",
    opacity: 0.16,
    mixBlendMode: "soft-light",
  },

  narrativeEntityButton: {
    border: "1px solid rgba(160, 205, 255, 0.22)",
    borderRadius: 999,
    background: "rgba(22, 135, 255, 0.12)",
    color: "rgba(234,247,255,0.86)",
    padding: "6px 11px",
    fontSize: 10,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    cursor: "pointer",
  },

  narrativeCloseFab: {
    position: "fixed",
    top: 18,
    right: 18,
    zIndex: 72,
    border: "1px solid rgba(255, 255, 255, 0.45)",
    borderRadius: 999,
    background: "rgba(5, 10, 22, 0.86)",
    color: "#f5fbff",
    padding: "8px 14px",
    fontSize: 11,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    cursor: "pointer",
    boxShadow: "0 10px 24px rgba(0,0,0,0.45)",
    pointerEvents: "auto",
  },

  narrativeQuestionDock: {
    position: "fixed",
    left: "50%",
    bottom: 24,
    transform: "translateX(-50%)",
    width: "min(560px, 92vw)",
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: 8,
    alignItems: "center",
    pointerEvents: "auto",
  },

  narrativeQuestionInput: {
    width: "100%",
    border: "1px solid rgba(160, 205, 255, 0.25)",
    borderRadius: 999,
    background: "rgba(5, 10, 21, 0.86)",
    color: "#eaf7ff",
    padding: "10px 14px",
    fontSize: 12,
    outline: "none",
  },

  narrativeStatusLine: {
    position: "fixed",
    left: "50%",
    bottom: 72,
    transform: "translateX(-50%)",
    maxWidth: "min(640px, 92vw)",
    textAlign: "center",
    color: "rgba(232,241,252,0.85)",
    fontSize: 11,
    lineHeight: 1.4,
    padding: "4px 8px",
    letterSpacing: "0.04em",
    pointerEvents: "none",
  },
};

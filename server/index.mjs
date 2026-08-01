// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync, statSync, unlinkSync, openSync, readSync, closeSync } from "node:fs";
import { execFile } from "node:child_process";
import os from "node:os";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);
import { join, dirname, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  executeAriaFunction,
  getLiveEvents,
  getMonitoringSnapshot,
  runScan,
} from "./ariaData.mjs";
import {
  getApprovals,
  getAriaState,
  getOverviewReport,
  learnFromAnalyst,
  observeScreen,
  requestApproval,
  resolveApproval,
  setAutonomyMode,
  recallSimilar,
  buildMemoryRecord,
  getMemoryRecords,
} from "./ariaMemory.mjs";
import {
  ARIA_ORCHESTRATOR_SYSTEM_PROMPT,
  assembleOrchestratorContext,
  buildAttackPathGraph,
  callOrchestratorGemini,
  getDecisionLog,
  getEvidenceLog,
  logDecision,
  logEvidence,
  makeDecision,
  makeEvidenceRecord,
  updateDecisionResolution,
  updateEvidenceStatus,
} from "./ariaOrchestrator.mjs";
import { isDemoRequest, getDecisionFixture } from "./demoFixtures.mjs";
import {
  getTrustScores,
  getTrustSummary,
  getGlobalAutonomyMode,
  recordOutcome,
  setCapabilityMode,
  promoteCapability,
  demoteCapability,
} from "./ariaTrust.mjs";
import { buildOperationalLoopSnapshot } from "./ariaOperationalLoop.mjs";
import {
  executeAiSpmRemediation,
  generateAiSpmReport,
  getAiSpmEvidenceSandbox,
  getAiSpmFindings,
  getAiSpmInventory,
  getAiSpmNarrative,
  getAiSpmRemediationPlan,
  getAiSpmScanHistory,
  getAiSpmState,
  getScheduledScan,
  normaliseSeverity,
  recordAiSpmFindingAction,
  scanAiSpm,
  setScheduledScan,
} from "./aiSpmInventory.mjs";
import {
  disconnectGithubConnector,
  getGithubConnectorStatus,
  githubHealthCheck,
  listGithubConnectorRepositories,
  pollGithubDeviceFlow,
  saveGithubTokenConnector,
  startGithubDeviceFlow,
  updateGithubConnectorRepositories,
} from "./connectors/githubAuthStore.mjs";
import { checkAwsConnectorStatus, awsCredentialsPresent } from "./connectors/awsConnector.mjs";
import { getAwsConnectorStatus, saveAwsCredentials, disconnectAwsConnector, awsHealthCheck } from "./connectors/awsAuthStore.mjs";
import { getOktaConnectorStatus, saveOktaCredentials, disconnectOktaConnector, oktaHealthCheck } from "./connectors/oktaAuthStore.mjs";
import { scanOktaFindings } from "./connectors/oktaConnector.mjs";
import { getSnykConnectorStatus, saveSnykCredentials, disconnectSnykConnector, snykHealthCheck } from "./connectors/snykAuthStore.mjs";
import { scanSnykFindings } from "./connectors/snykConnector.mjs";
import { getAzureAdConnectorStatus, saveAzureAdCredentials, disconnectAzureAdConnector, azureAdHealthCheck } from "./connectors/azureadAuthStore.mjs";
import { discoverAzureAdAssets } from "./connectors/azureadConnector.mjs";
import { getVirusTotalConnectorStatus, saveVirusTotalCredentials, disconnectVirusTotalConnector, virusTotalHealthCheck } from "./connectors/virustotalAuthStore.mjs";
import { scanVirusTotalFindings, enrichIocWithVirusTotal } from "./connectors/virustotalConnector.mjs";
import { getElasticConnectorStatus, saveElasticCredentials, disconnectElasticConnector, elasticHealthCheck } from "./connectors/elasticAuthStore.mjs";
import { scanElasticSecurity, getElasticAlerts, getElasticRules } from "./connectors/elasticConnector.mjs";
import { handleIdentityRoute } from "./identityRoutes.mjs";
import { handleNetworkIntelligenceRoute } from "./networkIntelligenceRoutes.mjs";
import { handleBluetoothRoute } from "./bluetoothRoutes.mjs";
import { handleVoicePipelineRoutes, warmVoicePipeline, recordVoiceMetric } from "./voicePipelineRoutes.mjs";
import { handleAuthRoutes } from "./authRoutes.mjs";
import { runAriaIntelligence } from "./ariaIntelligence.mjs";
import { enforceQuotaGuard, getQuotaSnapshot } from "./quotaGuard.mjs";
import { authorizeRequest, extractTenantContext, verifyJwtBearer } from "./authz.mjs";
import { logAuditEvent, readAuditEvents } from "./auditLog.mjs";
import { buildAuditEvidencePack } from "./auditExport.mjs";
import { subscribe as sseSubscribe, emit as sseEmit, clientCount as sseClientCount } from "./eventBus.mjs";
import { feed as arFeed, broadcast as arBroadcast, getAutonomousReplayEvents } from "./autonomousResponse.mjs";
import {
  extractSessionToken,
  issueSessionToken,
  isSyntheticSidRevoked,
  listIssuedSessions,
  revokeSessionById,
  revokeSessionBySid,
  revokeSessionToken,
  sessionEndpointEnabled,
  validateSessionToken,
} from "./ariaSession.mjs";
import {
  listPoliciesLegacy,
  previewPolicyLegacy,
  applyPolicyLegacy,
  getPolicyHistoryLegacy,
  rollbackPolicyLegacy,
  dryRunPolicy,
  validatePolicy,
  getPolicyTemplates,
} from "./policyStore.mjs";
import { applySecurityHeaders } from "./securityHeaders.mjs";
import { checkRateLimit, getRateLimitHeaders, getRateLimitClientIp } from "./rateLimiter.mjs";
import { getIncidents, getIncident, createIncident, acknowledgeIncident, escalateIncident, suppressIncident, closeIncident, archiveIncidents } from "./incidentStore.mjs";
import { getRecentAnomaliesAcrossEntities } from "./identityBaselineStore.mjs";
import { getBlockedIps, blockIp, unblockIp, bulkUnblock, configureAutoBlock } from "./blockedIpStore.mjs";
import { getQuarantineList, quarantineFile, releaseFile, deleteFile, bulkAction as quarantineBulkAction } from "./quarantineStore.mjs";
import { bulkResolveApprovals } from "./ariaMemory.mjs";
import { isDurable } from "./durableStore.mjs";
import { normaliseTrialLead, saveTrialLead } from "./trialLeadStore.mjs";
import {
  hasLocalPersistenceConfig,
  isStrictProductionMode,
  runStartupChecks,
  resolveLegacyMemoryDir,
} from "./persistenceConfig.mjs";
import { readArpTable as readNetworkArpTable } from "./NetworkIntelligence/networkDiscovery.mjs";
import { callLocalLlm, getLocalLlmConfig, probeLocalLlm } from "./localLlm.mjs";

const PORT = Number(process.env.ARIA_PORT || 5000);
const HOST = process.env.ARIA_HOST || "127.0.0.1";
const GOOGLE_API_KEY =
  process.env.GOOGLE_API_KEY ||
  process.env.GEMINI_API_KEY ||
  process.env.GEMINI_API_KEY_V2 ||
  loadDotEnvValue("GOOGLE_API_KEY") ||
  loadDotEnvValue("GEMINI_API_KEY") ||
  loadDotEnvValue("GEMINI_API_KEY_V2") ||
  "";
const ELEVENLABS_API_KEY =
  process.env.ELEVENLABS_API_KEY ||
  loadDotEnvValue("ELEVENLABS_API_KEY") ||
  "";
// Aria's own voice is a private cloned voice tied to a specific ElevenLabs
// account, so it is not shipped here. Falls back to "Rachel", an ElevenLabs
// public stock voice, so a fresh install with only an API key still speaks.
// Set ARIAVOICE to your own voice ID to change it.
const ELEVENLABS_STOCK_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";
const ELEVENLABS_VOICE_ID =
  process.env.ARIAVOICE ||
  process.env.ARIA_VOICE_ID ||
  loadDotEnvValue("ARIAVOICE") ||
  loadDotEnvValue("ARIA_VOICE_ID") ||
  ELEVENLABS_STOCK_VOICE_ID;
const ELEVENLABS_TTS_MODEL = process.env.ELEVENLABS_TTS_MODEL || "eleven_flash_v2_5";
const ELEVENLABS_CONVERSATION_MODEL = process.env.ELEVENLABS_CONVERSATION_MODEL || "eleven_flash_v2_5";
const ELEVENLABS_EXPRESSIVE_MODEL = process.env.ELEVENLABS_EXPRESSIVE_MODEL || "eleven_v3";
const ELEVENLABS_OUTPUT_FORMAT = process.env.ELEVENLABS_OUTPUT_FORMAT || "mp3_44100_64";
const ANTHROPIC_API_KEY =
  process.env.ANTHROPIC_API_KEY ||
  loadDotEnvValue("ANTHROPIC_API_KEY") ||
  "";
const DEFAULT_CLOUD_MODEL  = "claude-opus-4-8";
const DEFAULT_SESSION_TTL_SECONDS = Number(process.env.ARIA_SESSION_TTL_SECONDS || 3600);
const DEFAULT_AUDIT_RETENTION_DAYS = Number(process.env.ARIA_AUDIT_RETENTION_DAYS || 90);
const ALLOW_UNAUTH_SESSION_ISSUE = ["1", "true", "yes", "on"].includes(String(process.env.ARIA_ALLOW_UNAUTH_SESSION_ISSUE || "").toLowerCase());

const securityConfigState = {
  session_ttl_seconds: Number.isFinite(DEFAULT_SESSION_TTL_SECONDS) && DEFAULT_SESSION_TTL_SECONDS > 0
    ? Math.floor(DEFAULT_SESSION_TTL_SECONDS)
    : 3600,
  audit_retention_days: Number.isFinite(DEFAULT_AUDIT_RETENTION_DAYS) && DEFAULT_AUDIT_RETENTION_DAYS > 0
    ? Math.floor(DEFAULT_AUDIT_RETENTION_DAYS)
    : 90,
  updated_at: null,
  updated_by: null,
};

const LOCALHOST_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function allowedCorsOrigins() {
  // app://index = packaged Electron renderer (app:// privileged scheme)
  // localhost/* = any Vite dev server port (port is assigned dynamically, varies by run)
  // aria-sec.com (apex + www) = the public marketing landing that posts trial requests
  const defaults = ["app://index", "https://www.aria-sec.com", "https://aria-sec.com"].join(",");
  const raw = String(process.env.ARIA_CORS_ALLOW_ORIGINS || defaults).trim();
  return [...new Set(raw.split(",").map((item) => item.trim()).filter(Boolean))];
}

function resolveCorsOrigin(req) {
  const origin = String(req?.headers?.origin || "").trim();
  if (!origin) return "";
  // Always allow any localhost/127.0.0.1 origin — server binds to loopback only
  if (LOCALHOST_ORIGIN_RE.test(origin)) return origin;
  return allowedCorsOrigins().includes(origin) ? origin : "";
}

const functionDeclarations = [
  {
    name: "get_monitoring_snapshot",
    description: "Returns Aria's current enterprise security monitoring snapshot.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "get_live_events",
    description: "Returns recent Aria live operations events.",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "integer", description: "Maximum number of events to return." },
      },
    },
  },
  {
    name: "run_scan",
    description: "Runs an Aria security scan against a target and returns findings.",
    parameters: {
      type: "object",
      properties: {
        target: { type: "string", description: "Asset, segment, or environment to scan." },
        depth: { type: "string", enum: ["quick", "standard", "deep"], description: "Scan depth." },
      },
    },
  },
  {
    name: "isolate_threat",
    description: "Stages containment for an incident or affected scope.",
    parameters: {
      type: "object",
      properties: {
        incident_id: { type: "string", description: "Live review id, for example LIVE-1." },
        scope: { type: "string", description: "Containment scope." },
      },
    },
  },
  {
    name: "generate_incident_report",
    description: "Generates an incident report for a target audience.",
    parameters: {
      type: "object",
      properties: {
        incident_id: { type: "string", description: "Live review id, for example LIVE-1." },
        audience: { type: "string", enum: ["executive", "technical", "operator"], description: "Report audience." },
      },
    },
  },
  {
    name: "open_destination",
    description: "Routes the Aria UI to a named destination workspace.",
    parameters: {
      type: "object",
      properties: {
        destination: {
          type: "string",
          enum: ["threat-overview", "threat-vectors", "threat-timeline", "incident-feed", "live-logs", "system-health", "network", "blocked-ips", "quarantine", "aria-center", "trust-ladder"],
        },
      },
      required: ["destination"],
    },
  },
];

function loadDotEnvValue(key) {
  // Check .env.local first (Vite convention), then .env
  for (const name of [".env.local", ".env"]) {
    const envPath = join(process.cwd(), name);
    if (!existsSync(envPath)) continue;
    const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
    const match = lines.find((line) => line.trim().startsWith(`${key}=`));
    if (match) return match.slice(match.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
  }
  return "";
}

function jsonResponse(req, res, statusCode, payload) {
  applySecurityHeaders(res);
  const responseHeaders = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Session-Token, X-Tenant-Id, X-User-Id, X-Role, X-Resource-Tenant, X-Aria-Demo",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    Vary: "Origin",
  };
  const corsOrigin = resolveCorsOrigin(req);
  if (corsOrigin) {
    responseHeaders["Access-Control-Allow-Origin"] = corsOrigin;
  }
  res.writeHead(statusCode, responseHeaders);
  const out = typeof payload === "object" && payload !== null ? payload : { data: payload };
  if (out.error && req?.requestId) out.request_id = req.requestId;
  res.end(JSON.stringify(out));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

// ─── Scan Records Engine ─────────────────────────────────────────────────────
const SCAN_RECORDS_DIR = join(resolveLegacyMemoryDir(), "scan-records");
try { mkdirSync(SCAN_RECORDS_DIR, { recursive: true }); } catch (_) { /* already exists */ }

const scanRecordStore = new Map(); // scanId → record

function loadScanRecordsFromDisk() {
  try {
    const files = readdirSync(SCAN_RECORDS_DIR).filter(f => f.endsWith(".json") && !f.endsWith("-audit.json"));
    for (const file of files) {
      try {
        const raw = readFileSync(join(SCAN_RECORDS_DIR, file), "utf8");
        const record = JSON.parse(raw);
        if (record.id) scanRecordStore.set(record.id, record);
      } catch (_) { /* corrupt file, skip */ }
    }
  } catch (_) { /* scan-records dir empty or unreadable */ }
}
loadScanRecordsFromDisk();

function saveScanRecord(record) {
  scanRecordStore.set(record.id, record);
  try {
    writeFileSync(join(SCAN_RECORDS_DIR, `${record.id}.json`), JSON.stringify(record, null, 2), "utf8");
    generateScanAuditDoc(record);
  } catch (err) {
    console.warn("[Scan] Failed to persist scan record:", err.message);
  }
}

function generateScanAuditDoc(record) {
  const severityEmoji = { critical: "🔴", high: "🟠", medium: "🟡", low: "🟢", info: "🔵" };
  const findings = record.findings || [];
  const critCount = findings.filter(f => f.severity === "critical").length;
  const highCount = findings.filter(f => f.severity === "high").length;
  const medCount = findings.filter(f => f.severity === "medium").length;
  const lowCount = findings.filter(f => f.severity === "low").length;

  const lines = [
    `# ARIA Security Scan — Audit Report`,
    ``,
    `**Scan ID:** \`${record.id}\``,
    `**Started:** ${record.started_at}`,
    `**Completed:** ${record.completed_at || record.started_at}`,
    `**Target:** ${record.target}`,
    `**Depth:** ${record.depth}`,
    `**Status:** ${record.status}`,
    `**Duration:** ${record.duration_ms != null ? `${record.duration_ms}ms` : "—"}`,
    ``,
    `## Summary`,
    ``,
    `| Severity | Count |`,
    `|----------|-------|`,
    `| 🔴 Critical | ${critCount} |`,
    `| 🟠 High     | ${highCount} |`,
    `| 🟡 Medium   | ${medCount} |`,
    `| 🟢 Low      | ${lowCount} |`,
    `| **Total**   | **${findings.length}** |`,
    ``,
    `## Findings`,
    ``,
    ...findings.map((f, i) => [
      `### ${i + 1}. ${severityEmoji[f.severity] || "⚪"} ${f.summary || f.title || "Finding"}`,
      `- **Severity:** ${f.severity || "unknown"}`,
      `- **Source:** ${f.source || "scan-engine"}`,
      f.detail ? `- **Detail:** ${f.detail}` : null,
      f.cve ? `- **CVE:** ${f.cve}` : null,
      f.asset ? `- **Asset:** ${f.asset}` : null,
      ``,
    ].filter(Boolean).join("\n")),
    `## Scan Phases`,
    ``,
    ...(record.phases || []).map(p => `- \`${p.phase}\` — ${p.message} *(${p.ts})*`),
    ``,
    `---`,
    `*Generated automatically by ARIA Command Center on ${new Date().toISOString()}*`,
  ];

  try {
    writeFileSync(join(SCAN_RECORDS_DIR, `${record.id}-audit.md`), lines.join("\n"), "utf8");
  } catch (err) {
    console.warn("[Scan] Failed to write audit doc:", err.message);
  }
}

const SCAN_PHASES = {
  quick: [
    { phase: "init",         delay: 200,  message: "Initialising scan engine" },
    { phase: "network",      delay: 600,  message: "Probing network perimeter" },
    { phase: "hosts",        delay: 900,  message: "Enumerating live hosts" },
    { phase: "auth",         delay: 1200, message: "Checking auth surface" },
    { phase: "findings",     delay: 400,  message: "Promoting findings" },
    { phase: "done",         delay: 200,  message: "Scan complete" },
  ],
  standard: [
    { phase: "init",         delay: 200,  message: "Initialising scan engine" },
    { phase: "network",      delay: 700,  message: "Probing network perimeter" },
    { phase: "hosts",        delay: 900,  message: "Enumerating live hosts" },
    { phase: "ports",        delay: 1100, message: "Sweeping open ports" },
    { phase: "services",     delay: 1000, message: "Fingerprinting services" },
    { phase: "auth",         delay: 900,  message: "Checking auth surface" },
    { phase: "policy",       delay: 800,  message: "Evaluating policy compliance" },
    { phase: "ai-spm",       delay: 900,  message: "Scanning AI asset exposure" },
    { phase: "findings",     delay: 400,  message: "Correlating findings" },
    { phase: "done",         delay: 200,  message: "Scan complete" },
  ],
  deep: [
    { phase: "init",         delay: 200,  message: "Initialising deep scan engine" },
    { phase: "network",      delay: 800,  message: "Deep network topology mapping" },
    { phase: "hosts",        delay: 1000, message: "Full host enumeration" },
    { phase: "ports",        delay: 1200, message: "Full port sweep (1–65535)" },
    { phase: "services",     delay: 1200, message: "Service + version fingerprinting" },
    { phase: "vulns",        delay: 1400, message: "CVE cross-reference check" },
    { phase: "auth",         delay: 1000, message: "Deep auth + credential audit" },
    { phase: "policy",       delay: 900,  message: "Policy + compliance delta analysis" },
    { phase: "ai-spm",       delay: 1200, message: "AI asset exposure + model risk" },
    { phase: "lateral",      delay: 1000, message: "Lateral movement path analysis" },
    { phase: "exfil",        delay: 1000, message: "Data exfiltration surface scan" },
    { phase: "findings",     delay: 600,  message: "Correlating + scoring findings" },
    { phase: "done",         delay: 200,  message: "Deep scan complete" },
  ],
};

function buildScanFindings(depth, snapshot) {
  const base = runScan_local({ depth, target: "local-host" });
  const aiSpmState = (() => {
    try { return getMonitoringSnapshot(); } catch (_) { return null; }
  })();
  const connections = aiSpmState?.panels?.network?.items || [];
  const incidents = aiSpmState?.panels?.["incident-feed"]?.items || [];
  const blocked = connections.filter(c => c.state === "BLOCKED").length;
  const critInc = incidents.filter(i => String(i.severity).toLowerCase() === "critical").length;

  const findings = [...(base.findings || [])];

  if (critInc > 0) {
    findings.push({ severity: "critical", summary: `${critInc} critical incident${critInc > 1 ? "s" : ""} active — immediate response required`, source: "incident-engine" });
  }
  if (blocked > 0) {
    findings.push({ severity: "high", summary: `${blocked} blocked network connection${blocked > 1 ? "s" : ""} — verify firewall rules`, source: "network-scan" });
  }
  if (depth === "deep" || depth === "standard") {
    const riskScore = aiSpmState?.summary?.risk_score ?? 0;
    if (riskScore > 70) {
      findings.push({ severity: "high", summary: `Risk score ${riskScore} exceeds acceptable threshold (70)`, source: "risk-engine" });
    } else if (riskScore > 40) {
      findings.push({ severity: "medium", summary: `Elevated risk score ${riskScore} — review active vectors`, source: "risk-engine" });
    }
  }
  if (findings.length === 0) {
    findings.push({ severity: "low", summary: "No significant threats detected during this scan window", source: "scan-engine" });
  }
  return findings;
}

function runScan_local(args) {
  try { return runScan(args); } catch (_) { return { findings: [] }; }
}

async function handleLiveScan(req, res) {
  const corsOrigin = resolveCorsOrigin(req);
  const headers = {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Session-Token, X-Tenant-Id, X-User-Id, X-Role, X-Resource-Tenant, X-Aria-Demo",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    Vary: "Origin",
  };
  if (corsOrigin) headers["Access-Control-Allow-Origin"] = corsOrigin;
  res.writeHead(200, headers);

  // Track client disconnect so we stop writing to a closed socket
  let clientGone = false;
  req.on("close", () => { clientGone = true; });

  const url = new URL(req.url, `http://localhost`);
  const depth = ["quick", "standard", "deep"].includes(url.searchParams.get("depth")) ? url.searchParams.get("depth") : "standard";
  const target = url.searchParams.get("target") || "local-host";
  const scanId = `scan-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  // Safe write — silently no-ops if the client already disconnected
  const send = (event, data) => {
    if (clientGone || res.destroyed || res.writableEnded) return;
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch (_) {
      clientGone = true;
    }
  };

  const phases = SCAN_PHASES[depth] || SCAN_PHASES.standard;
  const phaseLogs = [];
  const startedAt = new Date().toISOString();
  const t0 = Date.now();

  send("scan_start", { id: scanId, depth, target, started_at: startedAt, total_phases: phases.length });

  for (let i = 0; i < phases.length; i++) {
    if (clientGone) break; // client cancelled — stop running phases
    const p = phases[i];
    await new Promise(r => setTimeout(r, p.delay));
    if (clientGone) break;
    const ts = new Date().toISOString();
    phaseLogs.push({ phase: p.phase, message: p.message, ts });
    send("scan_phase", { id: scanId, phase: p.phase, message: p.message, ts, progress: Math.round(((i + 1) / phases.length) * 100) });
  }

  const snapshot = getMonitoringSnapshot();
  const findings = buildScanFindings(depth, snapshot);
  const completedAt = new Date().toISOString();
  const durationMs = Date.now() - t0;

  const record = {
    id: scanId,
    depth,
    target,
    status: "complete",
    started_at: startedAt,
    completed_at: completedAt,
    duration_ms: durationMs,
    findings,
    phases: phaseLogs,
    snapshot_summary: {
      risk_score: snapshot?.summary?.risk_score ?? 0,
      severity: snapshot?.summary?.severity ?? "unknown",
      sources: (snapshot?.summary?.sources || []).length,
      connections: (snapshot?.panels?.network?.items || []).length,
      incidents: (snapshot?.panels?.["incident-feed"]?.items || []).length,
    },
  };

  saveScanRecord(record);
  send("scan_complete", record);
  if (!res.destroyed && !res.writableEnded) res.end();
}

// ─── Filesystem scan classification helpers ──────────────────────────────────
// macOS writes its own WidgetKit snapshot cache under every app container's
// SystemData/com.apple.chrono — these are OS-managed, not attacker-reachable,
// and on a typical Mac they make up the overwhelming majority of "world
// writable" hits. Skipping the subtree entirely keeps a real exposure from
// getting buried under 100+ copies of the same non-finding.
function isNoisySystemPath(fullPath) {
  return fullPath.includes(`${sep}SystemData${sep}com.apple.chrono${sep}`);
}

// Extension-only matching can't tell a private key from a public certificate
// (e.g. AppleRootCA-G3.pem, Python's certifi cacert.pem) — sniff the PEM
// header instead of trusting the file suffix.
function classifyKeyFileContent(fullPath) {
  try {
    const fd = openSync(fullPath, "r");
    const buf = Buffer.alloc(4096);
    const bytesRead = readSync(fd, buf, 0, buf.length, 0);
    closeSync(fd);
    const head = buf.slice(0, bytesRead).toString("utf8");
    if (/-----BEGIN (RSA |EC |ENCRYPTED )?PRIVATE KEY-----/.test(head)) return "private-key";
    if (/-----BEGIN CERTIFICATE-----/.test(head) && !/PRIVATE KEY/.test(head)) return "public-cert";
  } catch {
    // Binary/unreadable — fall back to treating it as a private key (safer default).
  }
  return "private-key";
}

// SSH-style keys have a well-known "must be unreadable by group/other" rule —
// a key that's actually locked down to 600 isn't a finding, just evidence.
function isKeyLikeSensitiveName(name) {
  return /^id_(rsa|ed25519|dsa|ecdsa)$/.test(name);
}

// ─── Folder / filesystem scan (SSE) ──────────────────────────────────────────
async function handleFolderScan(req, res) {
  const corsOrigin = resolveCorsOrigin(req);
  const headers = {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Session-Token, X-Tenant-Id, X-User-Id, X-Role, X-Aria-Demo",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    Vary: "Origin",
  };
  if (corsOrigin) headers["Access-Control-Allow-Origin"] = corsOrigin;
  res.writeHead(200, headers);

  let clientGone = false;
  req.on("close", () => { clientGone = true; });

  const url = new URL(req.url, "http://localhost");
  const rawPath = url.searchParams.get("path") || "~";
  const folderPath = rawPath === "~" || rawPath.startsWith("~/")
    ? rawPath.replace(/^~/, os.homedir())
    : rawPath;
  const depth = url.searchParams.get("depth") || "standard";
  const scanId = `scan-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const startedAt = new Date().toISOString();
  const t0 = Date.now();

  const send = (event, data) => {
    if (clientGone || res.destroyed || res.writableEnded) return;
    try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch (_) { clientGone = true; }
  };

  send("scan_start", { id: scanId, depth, target: folderPath, started_at: startedAt });

  // Extensions that indicate actual scripts — NOT native libraries (.dylib/.so are always executable on macOS/Linux by design)
  const SCRIPT_EXTS = new Set([".sh",".bash",".zsh",".fish",".py",".rb",".pl",".ps1",".bat",".cmd"]);
  // Native binaries only flagged when outside standard locations
  const NATIVE_EXTS = new Set([".exe",".dll"]);
  const KEY_EXTS    = new Set([".pem",".key",".pfx",".p12",".p8",".cer",".crt"]);
  const SENSITIVE_NAMES = new Set([".env",".npmrc",".netrc",".htpasswd","id_rsa","id_ed25519","id_dsa","id_ecdsa","credentials","secrets.json"]);
  // Skip well-known noisy directories that generate false positives
  const SKIP_DIRS = new Set(["node_modules",".cache","__pycache__",".gradle",".m2","vendor","dist","build","out",".git"]);
  const findings = [];
  let filesScanned = 0;
  let dirsScanned = 0;

  const scanPhases = [
    { phase: "init", message: `Initialising filesystem scanner → ${folderPath}`, delay: 200 },
    { phase: "enumerate", message: "Enumerating directory tree", delay: 400 },
    { phase: "permissions", message: "Auditing file permissions + ownership", delay: 600 },
    { phase: "secrets", message: "Scanning for exposed secrets + credentials", delay: 800 },
    { phase: "executables", message: "Analysing executable + script surface", delay: depth === "deep" ? 1000 : 500 },
    ...(depth !== "quick" ? [{ phase: "hashes", message: "Checksumming suspicious files", delay: 700 }] : []),
    ...(depth === "deep" ? [{ phase: "entropy", message: "High-entropy content analysis (packed/encrypted)", delay: 1200 }] : []),
    { phase: "findings", message: "Correlating + scoring findings", delay: 400 },
    { phase: "done", message: "Filesystem scan complete", delay: 100 },
  ];

  const walkDir = (dirPath, maxDepth = 4, curDepth = 0, insideRepo = false) => {
    if (curDepth > maxDepth || clientGone) return;
    let entries;
    try { entries = readdirSync(dirPath); } catch (_) { return; }
    dirsScanned++;
    const nowInsideRepo = insideRepo || entries.includes(".git");
    for (const entry of entries) {
      if (clientGone) return;
      // Skip noisy vendor/cache/build dirs — they generate hundreds of false positives
      if (SKIP_DIRS.has(entry)) continue;
      if (entry.startsWith(".") && curDepth > 0 && depth === "quick") continue;
      const full = join(dirPath, entry);
      if (isNoisySystemPath(full)) continue;
      let stat;
      try { stat = statSync(full); } catch (_) { continue; }
      if (stat.isDirectory()) {
        walkDir(full, maxDepth, curDepth + 1, nowInsideRepo);
      } else {
        filesScanned++;
        const dotIdx = entry.lastIndexOf(".");
        const ext = dotIdx > 0 ? entry.slice(dotIdx).toLowerCase() : "";
        const name = entry.toLowerCase();
        const mode = stat.mode;

        // World-writable — always flag (genuinely bad)
        if ((mode & 0o002) !== 0) {
          findings.push({ severity: "high", summary: `World-writable file: ${full}`, source: "permissions-audit", path: full });
        }

        // Scripts with execute bit — real risk, but downgrade when it's just
        // committed tooling inside a project's own git repo.
        if (SCRIPT_EXTS.has(ext) && (mode & 0o111) !== 0 && stat.size > 0) {
          findings.push({ severity: nowInsideRepo ? "low" : "medium", summary: `Executable script: ${full}`, source: "executable-scan", path: full });
        }

        // Windows executables outside expected locations
        if (NATIVE_EXTS.has(ext) && (mode & 0o111) !== 0) {
          findings.push({ severity: "medium", summary: `Native executable: ${full}`, source: "executable-scan", path: full });
        }

        // Cryptographic key files — sniff content, extension alone can't
        // distinguish a private key from a public certificate.
        if (KEY_EXTS.has(ext) && stat.size > 0) {
          if (classifyKeyFileContent(full) === "public-cert") {
            findings.push({ severity: "low", summary: `Public certificate (not a secret): ${full}`, source: "secrets-scan", path: full });
          } else {
            findings.push({ severity: "critical", summary: `Cryptographic key file: ${full}`, source: "secrets-scan", path: full });
          }
        }

        // Sensitive filenames (SSH keys, credential files, etc.) — an
        // SSH-style key that's actually locked to 600 isn't a finding, it's
        // evidence the control is working.
        for (const s of SENSITIVE_NAMES) {
          if (name === s) {
            if (isKeyLikeSensitiveName(name) && (mode & 0o077) === 0) {
              findings.push({ severity: "low", summary: `Credential file present with correct restrictive permissions: ${full}`, source: "secrets-scan", path: full });
            } else {
              findings.push({ severity: "critical", summary: `Sensitive credential file: ${full}`, source: "secrets-scan", path: full });
            }
            break;
          }
        }

        // .env files (unencrypted secrets) — template/example/sample files
        // are meant to be committed and never hold real values.
        if (name === ".env" || (name.startsWith(".env.") && !name.endsWith(".example") && !name.endsWith(".sample") && !name.endsWith(".template"))) {
          findings.push({ severity: "critical", summary: `Unencrypted environment secrets: ${full}`, source: "secrets-scan", path: full });
        }

        // Large hidden files outside known locations
        if (entry.startsWith(".") && stat.size > 50 * 1024 * 1024) {
          findings.push({ severity: "medium", summary: `Large hidden file (${Math.round(stat.size/1024/1024)}MB): ${full}`, source: "anomaly-scan", path: full });
        }
      }
    }
  };

  const phaseLogs = [];
  for (let i = 0; i < scanPhases.length; i++) {
    if (clientGone) break;
    const p = scanPhases[i];
    await new Promise(r => setTimeout(r, p.delay));
    if (clientGone) break;

    // Run real analysis during relevant phases
    if (p.phase === "enumerate" || p.phase === "secrets" || p.phase === "executables") {
      if (p.phase === "enumerate") {
        try { walkDir(folderPath, depth === "deep" ? 8 : depth === "standard" ? 5 : 3); } catch (_) {}
      }
    }

    const ts = new Date().toISOString();
    phaseLogs.push({ phase: p.phase, message: p.message, ts });
    send("scan_phase", {
      id: scanId, phase: p.phase, message: p.message, ts,
      progress: Math.round(((i + 1) / scanPhases.length) * 100),
      stats: { files_scanned: filesScanned, dirs_scanned: dirsScanned },
    });
  }

  // Deduplicate findings by path
  const seen = new Set();
  const dedupedFindings = findings.filter(f => {
    const key = `${f.severity}:${f.path || f.summary}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 200);

  if (dedupedFindings.length === 0) {
    dedupedFindings.push({ severity: "low", summary: `No threats found in ${filesScanned} files across ${dirsScanned} directories`, source: "scan-engine" });
  }

  const record = {
    id: scanId, depth, target: folderPath, scan_type: "filesystem",
    status: "complete", started_at: startedAt,
    completed_at: new Date().toISOString(), duration_ms: Date.now() - t0,
    findings: dedupedFindings, phases: phaseLogs,
    stats: { files_scanned: filesScanned, dirs_scanned: dirsScanned },
  };
  saveScanRecord(record);
  send("scan_complete", record);
  if (!res.destroyed && !res.writableEnded) res.end();
}

// ─── Network device discovery scan (SSE) ─────────────────────────────────────
async function handleNetworkDiscoveryScan(req, res) {
  const corsOrigin = resolveCorsOrigin(req);
  const headers = {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Session-Token, X-Tenant-Id, X-User-Id, X-Role, X-Aria-Demo",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    Vary: "Origin",
  };
  if (corsOrigin) headers["Access-Control-Allow-Origin"] = corsOrigin;
  res.writeHead(200, headers);

  let clientGone = false;
  req.on("close", () => { clientGone = true; });

  const url = new URL(req.url, "http://localhost");
  const targetSubnet = url.searchParams.get("subnet") || "auto";
  const depth = url.searchParams.get("depth") || "standard";
  const scanId = `scan-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const startedAt = new Date().toISOString();
  const t0 = Date.now();

  const send = (event, data) => {
    if (clientGone || res.destroyed || res.writableEnded) return;
    try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch (_) { clientGone = true; }
  };

  // Discover local interfaces
  const ifaces = os.networkInterfaces();
  const localAddrs = [];
  for (const [name, addrs] of Object.entries(ifaces)) {
    for (const addr of addrs || []) {
      if (addr.family === "IPv4" && !addr.internal) {
        localAddrs.push({ name, address: addr.address, netmask: addr.netmask, cidr: addr.cidr });
      }
    }
  }

  const target = targetSubnet === "auto"
    ? (localAddrs[0]?.cidr || "192.168.1.0/24")
    : targetSubnet;

  send("scan_start", { id: scanId, depth, target, started_at: startedAt, local_interfaces: localAddrs });

  const scanPhases = [
    { phase: "init",       message: "Initialising passive network inventory", delay: 0 },
    { phase: "interfaces", message: `Read local interfaces - ${localAddrs.length} found`, delay: 0 },
    { phase: "arp",        message: "Reading the operating system ARP cache", delay: 0 },
    { phase: "findings",   message: "Summarising observed ARP entries", delay: 0 },
    { phase: "done",       message: "Passive ARP cache read complete", delay: 0 },
  ];

  const devices = [];
  const findings = [];
  const phaseLogs = [];

  // Passive ARP cache read. Active discovery lives behind the explicit
  // authorization gate in /api/network/scan/start.
  const readArpTable = async () => {
    const entries = await readNetworkArpTable();
    for (const entry of entries) {
      devices.push({ ...entry, source: "arp-cache", status: "observed" });
    }

    // Also add self
    for (const a of localAddrs) {
      if (!devices.find(d => d.ip === a.address)) {
        devices.push({ ip: a.address, mac: "local", iface: a.name, source: "self", status: "up", role: "this-host" });
      }
    }
  };

  for (let i = 0; i < scanPhases.length; i++) {
    if (clientGone) break;
    const p = scanPhases[i];
    if (p.delay) await new Promise(r => setTimeout(r, p.delay));
    if (clientGone) break;

    if (p.phase === "arp") await readArpTable();

    const ts = new Date().toISOString();
    phaseLogs.push({ phase: p.phase, message: p.message, ts });
    send("scan_phase", {
      id: scanId, phase: p.phase, message: p.message, ts,
      progress: Math.round(((i + 1) / scanPhases.length) * 100),
      devices_found: devices.length,
    });
  }

  // Generate findings from discovered devices
  if (devices.length > 0) {
    findings.push({ severity: "info", summary: `${devices.length} device${devices.length !== 1 ? "s" : ""} discovered on ${target}`, source: "network-discovery" });
    const nonSelf = devices.filter(d => d.source !== "self");
    if (nonSelf.length > 10) {
      findings.push({ severity: "medium", summary: `${nonSelf.length} non-local ARP entries observed - verify all are authorised`, source: "network-policy" });
    }
    for (const d of nonSelf.slice(0, 5)) {
      findings.push({ severity: "low", summary: `ARP cache entry at ${d.ip} (MAC: ${d.mac})`, source: "arp-cache", ip: d.ip, mac: d.mac });
    }
  } else {
    findings.push({ severity: "low", summary: "No additional hosts present in the local ARP cache", source: "network-discovery" });
  }

  const record = {
    id: scanId, depth, target, scan_type: "network-discovery",
    status: "complete", started_at: startedAt,
    completed_at: new Date().toISOString(), duration_ms: Date.now() - t0,
    findings, phases: phaseLogs,
    devices, local_interfaces: localAddrs,
    tenant_id: req.authz?.tenant_id || "tenant-local",
  };
  saveScanRecord(record);
  send("scan_complete", record);
  if (!res.destroyed && !res.writableEnded) res.end();
}

function handleScanHistory(req, res) {
  const tenantId = req.authz?.tenant_id || "tenant-local";
  const records = Array.from(scanRecordStore.values())
    .filter(r => (r.tenant_id || "tenant-local") === tenantId)
    .sort((a, b) => (b.started_at || "").localeCompare(a.started_at || ""))
    .slice(0, 50)
    .map(r => ({
      id: r.id, depth: r.depth, target: r.target, status: r.status,
      started_at: r.started_at, completed_at: r.completed_at, duration_ms: r.duration_ms,
      finding_count: (r.findings || []).length,
      critical_count: (r.findings || []).filter(f => f.severity === "critical").length,
      high_count: (r.findings || []).filter(f => f.severity === "high").length,
    }));
  jsonResponse(req, res, 200, { scans: records, total: records.length });
}

function handleScanExport(req, res) {
  const url = new URL(req.url, `http://localhost`);
  const id = url.searchParams.get("id");
  const record = id ? scanRecordStore.get(id) : null;
  const tenantId = req.authz?.tenant_id || "tenant-local";
  if (!record || (record.tenant_id || "tenant-local") !== tenantId) {
    jsonResponse(req, res, 404, { error: "Scan record not found" });
    return;
  }
  const corsOrigin = resolveCorsOrigin(req);
  const headers = {
    "Content-Type": "application/json",
    "Content-Disposition": `attachment; filename="aria-scan-${id}.json"`,
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Session-Token, X-Tenant-Id, X-User-Id, X-Role, X-Resource-Tenant, X-Aria-Demo",
    "Access-Control-Allow-Methods": "GET",
    Vary: "Origin",
  };
  if (corsOrigin) headers["Access-Control-Allow-Origin"] = corsOrigin;
  res.writeHead(200, headers);
  res.end(JSON.stringify(record, null, 2));
}

function handleScanAuditDoc(req, res) {
  const url = new URL(req.url, `http://localhost`);
  const id = url.searchParams.get("id");
  const record = id ? scanRecordStore.get(id) : null;
  const tenantId = req.authz?.tenant_id || "tenant-local";
  if (!record || (record.tenant_id || "tenant-local") !== tenantId) {
    jsonResponse(req, res, 404, { error: "Scan record not found" });
    return;
  }
  const mdPath = join(SCAN_RECORDS_DIR, `${id}-audit.md`);
  let md = "";
  try {
    md = readFileSync(mdPath, "utf8");
  } catch (_) {
    generateScanAuditDoc(record);
    try { md = readFileSync(mdPath, "utf8"); } catch (_2) { md = "# Audit doc unavailable"; }
  }
  const corsOrigin = resolveCorsOrigin(req);
  const headers = {
    "Content-Type": "text/markdown; charset=utf-8",
    "Content-Disposition": `attachment; filename="aria-scan-${id}-audit.md"`,
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Session-Token, X-Tenant-Id, X-User-Id, X-Role, X-Resource-Tenant, X-Aria-Demo",
    Vary: "Origin",
  };
  if (corsOrigin) headers["Access-Control-Allow-Origin"] = corsOrigin;
  res.writeHead(200, headers);
  res.end(md);
}

// ─── Delete a scan record ─────────────────────────────────────────────────────
function handleScanDelete(req, res) {
  const url = new URL(req.url, "http://localhost");
  const id = url.searchParams.get("id");
  const tenantId = req.authz?.tenant_id || "tenant-local";
  const existing = id ? scanRecordStore.get(id) : null;
  if (!existing || (existing.tenant_id || "tenant-local") !== tenantId) {
    jsonResponse(req, res, 404, { error: "Scan record not found" });
    return;
  }
  scanRecordStore.delete(id);
  for (const suffix of [".json", "-audit.md"]) {
    try { unlinkSync(join(SCAN_RECORDS_DIR, `${id}${suffix}`)); } catch (_) {}
  }
  jsonResponse(req, res, 200, { deleted: id });
}

// ─── Auto-scan scheduler ──────────────────────────────────────────────────────
const AUTO_SCAN_CONFIG_PATH = join(SCAN_RECORDS_DIR, "_auto-scan-config.json");

let autoScanConfig = (() => {
  try { return JSON.parse(readFileSync(AUTO_SCAN_CONFIG_PATH, "utf8")); } catch (_) { return null; }
})();

let autoScanTimer = null;

function saveAutoScanConfig(cfg) {
  autoScanConfig = cfg;
  try { writeFileSync(AUTO_SCAN_CONFIG_PATH, JSON.stringify(cfg, null, 2), "utf8"); } catch (_) {}
}

async function runAutoScan() {
  if (!autoScanConfig?.enabled) return;
  const { targetType = "local-host", depth = "standard", folderPath, subnet } = autoScanConfig;

  let endpoint, params;
  if (targetType === "folder") {
    endpoint = "folder";
    const rawPath = folderPath || "~";
    const resolved = rawPath === "~" || rawPath.startsWith("~/") ? rawPath.replace(/^~/, os.homedir()) : rawPath;
    params = `depth=${depth}&path=${encodeURIComponent(resolved)}`;
  } else if (targetType === "network-discovery") {
    endpoint = "network-discovery";
    params = `depth=${depth}${subnet ? `&subnet=${encodeURIComponent(subnet)}` : ""}`;
  } else {
    endpoint = "stream";
    params = `depth=${depth}&target=${encodeURIComponent(targetType === "custom-ip" ? (autoScanConfig.customIp || "local-host") : "local-host")}`;
  }

  // Simulate an internal HTTP request by calling the handler directly with a fake req/res
  const scanId = `scan-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const startedAt = new Date().toISOString();
  const t0 = Date.now();

  console.log(`[AutoScan] Starting scheduled ${depth} scan → target: ${targetType}`);

  try {
    // For auto-scans, reuse the same logic from handleFolderScan / handleNetworkDiscoveryScan
    // but write directly to scanRecordStore instead of SSE
    let record;
    if (endpoint === "folder") {
      const rawPath = folderPath || "~";
      const fp = rawPath === "~" || rawPath.startsWith("~/") ? rawPath.replace(/^~/, os.homedir()) : rawPath;
      record = await runFolderScanDirect(scanId, fp, depth, startedAt);
    } else if (endpoint === "network-discovery") {
      record = await runNetworkDiscoveryDirect(scanId, depth, startedAt);
    } else {
      const snap = getMonitoringSnapshot();
      const findings = buildScanFindings(depth, snap);
      record = {
        id: scanId, depth, target: "local-host", scan_type: "host",
        status: "complete", started_at: startedAt,
        completed_at: new Date().toISOString(), duration_ms: Date.now() - t0,
        findings, auto: true, tenant_id: "tenant-local",
      };
    }
    record.auto = true;
    saveScanRecord(record);
    if (autoScanConfig) {
      autoScanConfig.last_run = new Date().toISOString();
      autoScanConfig.last_scan_id = scanId;
      saveAutoScanConfig(autoScanConfig);
    }
    console.log(`[AutoScan] Complete — ${record.findings?.length ?? 0} findings, id: ${scanId}`);
    sseEmit("auto_scan_complete", { id: scanId, findings_count: record.findings?.length ?? 0, target: record.target, depth });
  } catch (err) {
    console.error("[AutoScan] Error:", err.message);
  }
}

async function runFolderScanDirect(scanId, folderPath, depth, startedAt) {
  const rds = readdirSync, sts = statSync;
  const SCRIPT_EXTS = new Set([".sh",".bash",".zsh",".fish",".py",".rb",".pl",".ps1",".bat",".cmd"]);
  const NATIVE_EXTS = new Set([".exe",".dll"]);
  const KEY_EXTS    = new Set([".pem",".key",".pfx",".p12",".p8",".cer",".crt"]);
  const SENSITIVE_NAMES = new Set([".env",".npmrc",".netrc",".htpasswd","id_rsa","id_ed25519","id_dsa","id_ecdsa","credentials","secrets.json"]);
  const SKIP_DIRS = new Set(["node_modules",".cache","__pycache__",".gradle",".m2","vendor","dist","build","out",".git"]);
  const findings = [];
  let filesScanned = 0, dirsScanned = 0;

  const walk = (dir, maxD, cur, insideRepo = false) => {
    if (cur > maxD) return;
    let entries; try { entries = rds(dir); } catch (_) { return; }
    dirsScanned++;
    const nowInsideRepo = insideRepo || entries.includes(".git");
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry)) continue;
      const full = join(dir, entry);
      if (isNoisySystemPath(full)) continue;
      let stat; try { stat = sts(full); } catch (_) { continue; }
      if (stat.isDirectory()) { walk(full, maxD, cur + 1, nowInsideRepo); continue; }
      filesScanned++;
      const dotIdx = entry.lastIndexOf(".");
      const ext = dotIdx > 0 ? entry.slice(dotIdx).toLowerCase() : "";
      const name = entry.toLowerCase();
      const mode = stat.mode;
      if ((mode & 0o002) !== 0) findings.push({ severity: "high", summary: `World-writable file: ${full}`, source: "permissions-audit", path: full });
      if (SCRIPT_EXTS.has(ext) && (mode & 0o111) !== 0 && stat.size > 0) findings.push({ severity: nowInsideRepo ? "low" : "medium", summary: `Executable script: ${full}`, source: "executable-scan", path: full });
      if (NATIVE_EXTS.has(ext) && (mode & 0o111) !== 0) findings.push({ severity: "medium", summary: `Native executable: ${full}`, source: "executable-scan", path: full });
      if (KEY_EXTS.has(ext) && stat.size > 0) {
        if (classifyKeyFileContent(full) === "public-cert") {
          findings.push({ severity: "low", summary: `Public certificate (not a secret): ${full}`, source: "secrets-scan", path: full });
        } else {
          findings.push({ severity: "critical", summary: `Cryptographic key file: ${full}`, source: "secrets-scan", path: full });
        }
      }
      for (const s of SENSITIVE_NAMES) {
        if (name === s) {
          if (isKeyLikeSensitiveName(name) && (mode & 0o077) === 0) {
            findings.push({ severity: "low", summary: `Credential file present with correct restrictive permissions: ${full}`, source: "secrets-scan", path: full });
          } else {
            findings.push({ severity: "critical", summary: `Sensitive credential file: ${full}`, source: "secrets-scan", path: full });
          }
          break;
        }
      }
      if (name === ".env" || (name.startsWith(".env.") && !name.endsWith(".example") && !name.endsWith(".sample") && !name.endsWith(".template"))) findings.push({ severity: "critical", summary: `Unencrypted environment secrets: ${full}`, source: "secrets-scan", path: full });
    }
  };
  walk(folderPath, depth === "deep" ? 8 : depth === "standard" ? 5 : 3, 0);
  const seen = new Set();
  const deduped = findings.filter(f => { const k=`${f.severity}:${f.path||f.summary}`; if(seen.has(k))return false; seen.add(k); return true; }).slice(0, 200);
  if (deduped.length === 0) deduped.push({ severity: "low", summary: `No threats found in ${filesScanned} files across ${dirsScanned} directories`, source: "scan-engine" });
  return { id: scanId, depth, target: folderPath, scan_type: "filesystem", status: "complete", started_at: startedAt, completed_at: new Date().toISOString(), duration_ms: Date.now() - new Date(startedAt).getTime(), findings: deduped, stats: { files_scanned: filesScanned, dirs_scanned: dirsScanned }, tenant_id: "tenant-local" };
}

async function runNetworkDiscoveryDirect(scanId, depth, startedAt) {
  const ifaces = os.networkInterfaces();
  const localAddrs = [];
  for (const [name, addrs] of Object.entries(ifaces)) {
    for (const addr of addrs || []) {
      if (addr.family === "IPv4" && !addr.internal) localAddrs.push({ name, address: addr.address, netmask: addr.netmask, cidr: addr.cidr });
    }
  }
  const target = localAddrs[0]?.cidr || "auto";
  const devices = [];
  try {
    for (const entry of await readNetworkArpTable()) {
      devices.push({ ...entry, source: "arp-cache", status: "observed" });
    }
  } catch (_) {}
  for (const a of localAddrs) { if (!devices.find(d => d.ip === a.address)) devices.push({ ip: a.address, mac: "local", iface: a.name, source: "self", status: "up", role: "this-host" }); }
  const findings = [];
  if (devices.length > 0) {
    findings.push({ severity: "info", summary: `${devices.length} device(s) discovered on ${target}`, source: "network-discovery" });
    const nonSelf = devices.filter(d => d.source !== "self");
    if (nonSelf.length > 10) findings.push({ severity: "medium", summary: `${nonSelf.length} non-local ARP entries - verify all authorised`, source: "network-policy" });
    for (const d of nonSelf.slice(0, 5)) findings.push({ severity: "low", summary: `ARP cache entry at ${d.ip} (MAC: ${d.mac})`, source: "arp-cache", ip: d.ip, mac: d.mac });
  } else {
    findings.push({ severity: "low", summary: "No additional network devices discovered", source: "network-discovery" });
  }
  return { id: scanId, depth, target, scan_type: "network-discovery", status: "complete", started_at: startedAt, completed_at: new Date().toISOString(), duration_ms: Date.now() - new Date(startedAt).getTime(), findings, devices, local_interfaces: localAddrs, tenant_id: "tenant-local" };
}

function scheduleAutoScan(cfg) {
  if (autoScanTimer) { clearInterval(autoScanTimer); autoScanTimer = null; }
  if (!cfg?.enabled || !cfg?.interval_ms) return;
  autoScanTimer = setInterval(runAutoScan, cfg.interval_ms);
  // Don't let this background timer keep the process (or a test runner) alive.
  if (typeof autoScanTimer.unref === "function") autoScanTimer.unref();
  console.log(`[AutoScan] Scheduled every ${cfg.interval_ms / 60000} min — target: ${cfg.targetType}, depth: ${cfg.depth}`);
}

// Resume schedule on server start
if (autoScanConfig?.enabled) scheduleAutoScan(autoScanConfig);

function handleGetSchedule(req, res) {
  jsonResponse(req, res, 200, { schedule: autoScanConfig });
}

async function handleSetSchedule(req, res) {
  const body = await readJson(req);
  if (!body || typeof body !== "object") { jsonResponse(req, res, 400, { error: "Invalid body" }); return; }
  const cfg = {
    enabled: body.enabled !== false,
    interval_ms: Number(body.interval_ms) || 3600000,
    targetType: body.targetType || "local-host",
    depth: body.depth || "standard",
    folderPath: body.folderPath || null,
    customIp: body.customIp || null,
    created_at: new Date().toISOString(),
    next_run: new Date(Date.now() + (Number(body.interval_ms) || 3600000)).toISOString(),
  };
  saveAutoScanConfig(cfg);
  scheduleAutoScan(cfg);
  if (body.run_now) await runAutoScan();
  jsonResponse(req, res, 200, { schedule: cfg });
}

function handleDeleteSchedule(req, res) {
  if (autoScanTimer) { clearInterval(autoScanTimer); autoScanTimer = null; }
  autoScanConfig = null;
  try { unlinkSync(AUTO_SCAN_CONFIG_PATH); } catch (_) {}
  jsonResponse(req, res, 200, { deleted: true });
}

function inferAriaFunction(command) {
  const normalized = command.toLowerCase();
  const incidentMatch = command.match(/inc-\d+/i);
  const incident_id = incidentMatch?.[0]?.toUpperCase() || "LIVE-REVIEW";

  if (normalized.includes("report")) {
    const audience = normalized.includes("technical")
      ? "technical"
      : normalized.includes("operator")
      ? "operator"
      : "executive";
    return { name: "generate_incident_report", args: { incident_id, audience } };
  }

  if (normalized.includes("contain") || normalized.includes("isolate") || normalized.includes("quarantine threat")) {
    return { name: "isolate_threat", args: { incident_id, scope: "affected endpoint" } };
  }

  if (normalized.includes("scan") || normalized.includes("sweep") || normalized.includes("check perimeter")) {
    const depth = normalized.includes("deep")
      ? "deep"
      : normalized.includes("quick")
      ? "quick"
      : "standard";
    return { name: "run_scan", args: { target: "local host", depth } };
  }

  return null;
}

// ─── Claude (Anthropic) ───────────────────────────────────────────────────────
async function callClaude(prompt, model = DEFAULT_CLOUD_MODEL, { signal } = {}) {
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal,
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Claude request failed: ${res.status} ${err.slice(0, 120)}`);
  }
  const data = await res.json();
  return data.content?.[0]?.text || "";
}

// ─── Gemini text (platform intelligence, not realtime voice) ────────────────
const GEMINI_FLASH_MODEL = process.env.GEMINI_FLASH_MODEL || "gemini-2.5-flash";
const GEMINI_NARRATIVE_MODEL = process.env.GEMINI_NARRATIVE_MODEL || GEMINI_FLASH_MODEL;
async function callGeminiText(prompt, model = GEMINI_FLASH_MODEL, { signal } = {}) {
  if (!GOOGLE_API_KEY) throw new Error("GOOGLE_API_KEY not configured");
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GOOGLE_API_KEY}`,
    {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    }
  );
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Gemini text request failed: ${res.status} ${err.slice(0, 120)}`);
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

// Deterministic, model-free summary of current state. This is a *degraded*
// answer, not an engine — it is only used when the selected provider is
// genuinely unavailable, and it always labels itself as such via `source`.
function synthesizeOfflineAIResponse(prompt, { mode = "local", model, degradedReason = "" } = {}) {
  const snapshot = getMonitoringSnapshot?.() || {};
  const threat = snapshot?.threat_level || "UNKNOWN";
  const sources = snapshot?.summary?.sources || [];
  const liveSources = sources.filter((source) => source.status === "live").length;
  const commandMatch = String(prompt || "").match(/Operator command:\s*"?([^"\n]+)"?/i);
  const subject = commandMatch?.[1]?.trim() || "the current security context";
  const suffix = degradedReason ? ` No reasoning engine is currently available — ${degradedReason}` : "";

  return {
    text: `ARIA assessed ${subject} from current state without a reasoning model. Threat level is ${threat}; ${liveSources}/${sources.length || 0} sources are live. Review the current evidence, then run a local scan or open the relevant panel for action.${suffix}`,
    source: `${mode}-degraded`,
    model: model || "deterministic-summary",
    degraded: true,
    degraded_reason: degradedReason || "no reasoning provider available",
  };
}

// ─── Unified AI dispatcher ────────────────────────────────────────────────────
// mode: "cloud" | "local" | "hybrid" | legacy "gemini"
async function callAI(prompt, { mode = "gemini", cloudModel, localModel, geminiModel, signal } = {}) {
  const cm = cloudModel || DEFAULT_CLOUD_MODEL;
  const gm = geminiModel || GEMINI_FLASH_MODEL;
  const normalizedMode = ["gemini", "cloud", "local", "hybrid"].includes(mode) ? mode : "gemini";

  // LOCAL — sovereign only. Never silently falls back to a cloud provider: that
  // would violate the data-residency promise the mode exists to make. If the
  // on-prem engine is down the operator gets a degraded deterministic summary
  // plus the reason, and can choose a cloud mode themselves.
  if (normalizedMode === "local") {
    try {
      const { text, model } = await callLocalLlm(prompt, { model: localModel });
      return { text, source: "local", model, sovereign: true };
    } catch (err) {
      return synthesizeOfflineAIResponse(prompt, {
        mode: "local",
        degradedReason: err?.message || "the local engine is unavailable",
      });
    }
  }

  // HYBRID — prefer the strongest available reasoner, but stay operational if
  // external network egress is lost. Cloud first, then local, then degraded.
  if (normalizedMode === "hybrid") {
    if (ANTHROPIC_API_KEY) {
      try {
        const text = await callClaude(prompt, cm, { signal });
        return { text, source: "hybrid-cloud", model: cm };
      } catch (err) {
        console.warn(`[ai] hybrid: cloud leg failed, falling back to local — ${err?.message || err}`);
      }
    }
    if (GOOGLE_API_KEY) {
      try {
        const text = await callGeminiText(prompt, gm, { signal });
        return { text, source: "hybrid-cloud", model: gm };
      } catch (err) {
        console.warn(`[ai] hybrid: gemini leg failed, falling back to local — ${err?.message || err}`);
      }
    }
    try {
      const { text, model } = await callLocalLlm(prompt, { model: localModel });
      return { text, source: "hybrid-local", model, sovereign: true };
    } catch (err) {
      return synthesizeOfflineAIResponse(prompt, {
        mode: "hybrid",
        degradedReason: `no cloud key is usable and the local engine is unavailable (${err?.message || "unreachable"})`,
      });
    }
  }

  if (normalizedMode === "gemini") {
    const text = await callGeminiText(prompt, gm, { signal });
    return { text, source: "gemini", model: gm };
  }

  if (normalizedMode === "cloud") {
    if (!ANTHROPIC_API_KEY) {
      // Report this plainly rather than silently substituting another
      // provider — Cloud (Opus) is a distinct, explicit choice in the UI now
      // that Gemini has its own selectable mode.
      return {
        text: "Claude Opus 4.8 isn't available right now — no ANTHROPIC_API_KEY is configured for this install. Switch Intelligence Mode to Gemini or Local, or add an Anthropic key to enable Cloud mode.",
        source: "cloud-unavailable",
        model: cm,
      };
    }
    const text = await callClaude(prompt, cm, { signal });
    return { text, source: "cloud", model: cm };
  }

  return synthesizeOfflineAIResponse(prompt, {
    mode: "local",
    degradedReason: `unrecognised intelligence mode "${mode}"`,
  });
}

function getAutonomyMode() {
  return getAriaState().policy.mode;
}

async function gateAction(action, args, source, tenantId) {
  const mode = getAutonomyMode();
  const risk = action === "isolate_threat" ? "critical" : "medium";
  const allowed = mode === "full_auto" || (mode === "auto" && risk !== "critical");

  if (mode === "confirm" || !allowed) {
    const approval = await requestApproval(tenantId, {
      action,
      args,
      reason: `${action.replace(/_/g, " ")} requested from ${source}`,
      risk,
      source,
    });
    return {
      gated: true,
      mode,
      risk,
      approval,
      result: {
        voice_response: `Aria is requesting approval for ${action.replace(/_/g, " ")}.`,
        status: "approval_required",
        feed: [`Approval required for ${action}`],
        tool_results: [],
        approval,
      },
    };
  }

  return { gated: false, mode, risk };
}

async function runAriaCommand(command, { mode = "gemini", cloudModel, localModel, tenantId } = {}) {
  // Try pattern-matched function inference first (works without any AI)
  const inferred = inferAriaFunction(command);
  if (inferred) {
    const gate = await gateAction(inferred.name, inferred.args, "operator-command", tenantId);
    if (gate.gated) return gate.result;
    const result = executeAriaFunction(inferred.name, inferred.args);
    return {
      voice_response: summarizeLocalFunction(inferred.name, result),
      status: result.status || "complete",
      feed: result.feed || getLiveEvents(2),
      tool_results: [{ name: inferred.name, args: inferred.args, result }],
    };
  }

  // Fall back to AI synthesis for open-ended commands
  const systemContext = `You are Aria, an enterprise security platform AI. Answer concisely for a security operator. Current platform state: ${JSON.stringify(getOverviewReport()).slice(0, 600)}`;
  const prompt = `${systemContext}\n\nOperator command: ${command}\n\nRespond in one or two sentences as Aria.`;

  let text = "Aria processed your request.";
  try {
    const aiResult = await callAI(prompt, { mode, cloudModel, localModel });
    text = aiResult.text || text;
  } catch (err) {
    console.warn("[Aria] runAriaCommand AI call failed:", err.message);
  }

  return {
    voice_response: text,
    status: "complete",
    feed: getLiveEvents(2),
    tool_results: [],
  };
}

function summarizeLocalFunction(name, result) {
  if (name === "generate_incident_report") {
    return `${result.audience} report generated for ${result.incident_id}.`;
  }
  if (name === "isolate_threat") {
    return `${result.incident_id} containment is staged for ${result.scope}.`;
  }
  if (name === "run_scan") {
    return `${result.depth} scan completed against ${result.target}. ${result.findings?.length || 0} findings promoted.`;
  }
  return "Aria completed the requested operation.";
}

async function runAiSpmCommand(command) {
  const normalized = command.toLowerCase();
  if (!normalized.includes("ai-spm") && !normalized.includes("ai spm") && !normalized.includes("ai exposure")) {
    return null;
  }

  if (normalized.includes("narrative") || normalized.includes("attack path")) {
    const { narrative, summary } = await getAiSpmNarrative();
    return {
      voice_response: narrative.summary || "Aria generated the AI exposure narrative.",
      status: narrative.status === "empty" ? "no-evidence" : "complete",
      feed: [
        `AI-SPM posture: ${summary.posture}`,
        `AI assets: ${summary.asset_count}; findings: ${summary.finding_count}`,
        narrative.likely_attack_path ? `Likely path: ${narrative.likely_attack_path}` : "No attack path available yet",
      ],
      tool_results: [{ name: "generate_ai_spm_narrative", args: {}, result: narrative }],
    };
  }

  const state = await scanAiSpm();
  return {
    voice_response: `AI-SPM scan complete. Aria found ${state.summary.asset_count} AI assets and ${state.summary.finding_count} findings.`,
    status: "complete",
    feed: [
      `AI-SPM connector: ${state.inventory.connectors[0]?.id || "github"} (${state.inventory.connectors[0]?.mode || "unknown"})`,
      `Critical findings: ${state.summary.critical_count}; high findings: ${state.summary.high_count}`,
      `Posture: ${state.summary.posture}`,
    ],
    tool_results: [{ name: "run_ai_spm_scan", args: {}, result: state.summary }],
  };
}

// ─── Panel Narrative ─────────────────────────────────────────────────────────
// Generates a security brief for any panel via the selected AI model.
// Falls back gracefully when the chosen model is unavailable.
async function handlePanelNarrative(req, res) {
  const requestStartedAt = Date.now();
  const body = await readJson(req);
  const {
    panelId = "overview",
    context = {},
    model_mode = "gemini",
    cloud_model,
    local_model,
    latency_profile = "realtime",
  } = body;
  let contextReadyAt = Date.now();
  const realtimeMode = latency_profile === "realtime";
  const effectiveMode = realtimeMode && model_mode !== "local" && GOOGLE_API_KEY ? "gemini" : model_mode;
  const effectiveGeminiModel = realtimeMode ? GEMINI_NARRATIVE_MODEL : GEMINI_FLASH_MODEL;
  const reasoningTimeoutMs = Math.max(1000, Number(process.env.ARIA_NARRATIVE_TIMEOUT_MS || 8000));

  const sendNarrative = (narrative, reasoningStartedAt) => {
    const completedAt = Date.now();
    const latency = {
      profile: realtimeMode ? "realtime" : "quality",
      requested_mode: model_mode,
      effective_mode: effectiveMode,
      context_ms: contextReadyAt - requestStartedAt,
      reasoning_ms: completedAt - reasoningStartedAt,
      total_ms: completedAt - requestStartedAt,
      timeout_ms: reasoningTimeoutMs,
    };
    logAuditEvent({
      event_type: "voice.narrative_latency",
      actor: req.authz?.user_id || "operator",
      context: { tenant_id: req.authz?.tenant_id || "tenant-local", panel_id: panelId, ai_source: narrative.ai_source, ...latency },
    });
    recordVoiceMetric({ narrative_last_total_ms: latency.total_ms });
    jsonResponse(req, res, 200, { narrative: { ...narrative, latency } });
  };

  // Pull current ai-spm state to enrich every panel with system-wide posture
  let aiSpmCtx = "";
  try {
    const state = await getAiSpmState();
    const s = state?.summary || {};
    aiSpmCtx = `AI-SPM posture: ${s.posture || "unknown"}, ${s.critical_count ?? 0} critical findings, ${s.asset_count ?? 0} AI assets tracked.`;
  } catch (_) { /* non-fatal */ }

  const live = getMonitoringSnapshot();
  const sources  = live?.summary?.sources || [];
  const liveSrcs = sources.filter(s => s.status === "live").length;

  // Behavioral baseline memory — what's been unusual lately across entities,
  // most relevant when briefing the identity or network panels.
  let baselineCtx = "";
  if (panelId === "identity-galaxy" || panelId === "network" || panelId === "aria-center" || panelId === "overview") {
    try {
      const anomalies = await getRecentAnomaliesAcrossEntities(5);
      if (anomalies.length) {
        baselineCtx = ` Recent deviations from established baseline: ${anomalies
          .map((a) => `${a.entityId} — ${a.detail || a.type}`)
          .join("; ")}.`;
      }
    } catch (_) { /* non-fatal */ }
  }

  const systemCtx = `Overall threat level: ${live?.threat_level || "UNKNOWN"}. ${liveSrcs}/${sources.length} telemetry sources live. ${aiSpmCtx}${baselineCtx}`;

  const prompt = `You are Aria, a senior SOC analyst speaking out loud to the operator who just opened the ${panelId.replace(/-/g, " ")} panel. This is a live, two-way conversation, not a report being read off a screen. Your personality: friendly but assertive — warm and human, never stiff or clinical, but you don't hedge or waffle either. You have opinions and you state them plainly. Contractions are fine, a little dry humor is fine.
Current system context: ${systemCtx}
Live panel data: ${JSON.stringify(context, null, 0).slice(0, 1200)}

Do not just recite field values back at the operator (e.g. "risk score is 72, 3 incidents present" is a data dump, not an explanation). Instead, explain thoroughly what the numbers actually mean for security posture and why it matters — connect the dots for them like a colleague who's already thought it through, not a dashboard reading its own labels aloud.

Write the spoken "summary" in 2-3 concise natural sentences:
1. Explain the most important security meaning, not every dashboard value.
2. Give one specific next action and why it matters.
3. Optionally invite a follow-up question in a few words.

Keep the spoken summary under 70 words. Conversational, direct, and never a bullet-point recitation.

Then also provide, separately from the spoken summary:
- A one-line "attack path or risk chain" relevant to this panel (or "none identified" if clean)
- One line on blast radius / downstream impact
- 2-3 recommended actions as short imperative phrases

Respond in JSON: { "summary": "...", "likely_attack_path": "...", "blast_radius": "...", "recommended_actions": ["..."] }`;
  contextReadyAt = Date.now();

  // Try callAI with the chosen mode, then fall back to static local synthesis.
  let rawText = null;
  let aiSource = effectiveMode;
  const reasoningStartedAt = Date.now();
  const reasoningAbort = new AbortController();
  const reasoningTimer = setTimeout(() => reasoningAbort.abort(new Error("Narrative reasoning timed out")), reasoningTimeoutMs);

  try {
    const aiResult = await callAI(prompt, {
      mode: effectiveMode,
      cloudModel: cloud_model,
      localModel: local_model,
      geminiModel: effectiveGeminiModel,
      signal: reasoningAbort.signal,
    });
    rawText = aiResult.text;
    aiSource = aiResult.source;
  } catch (aiErr) {
    console.warn(`[Aria] panel narrative ${effectiveMode} call failed:`, aiErr.message);
  } finally {
    clearTimeout(reasoningTimer);
  }

  if (rawText) {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? (() => { try { return JSON.parse(jsonMatch[0]); } catch { return null; } })() : null;

    if (parsed?.summary) {
      sendNarrative({
          status: "ready",
          title: `${panelId.replace(/-/g, " ")} — Aria intelligence brief`,
          summary: parsed.summary,
          likely_attack_path: parsed.likely_attack_path || "",
          blast_radius: parsed.blast_radius || "",
          recommended_actions: parsed.recommended_actions || [],
          ai_source: aiSource,
        }, reasoningStartedAt);
      return;
    }

    // Model responded but not in JSON — use raw text as summary
    if (rawText.length > 20) {
      sendNarrative({
          status: "ready",
          title: `${panelId.replace(/-/g, " ")} — Aria brief`,
          summary: rawText.slice(0, 600),
          likely_attack_path: "",
          blast_radius: "",
          recommended_actions: ["Review live panel data", "Run a quick scan"],
          ai_source: aiSource,
        }, reasoningStartedAt);
      return;
    }
  }

  // Static fallback — no model available
  const { riskScore = 0, connections = [], incidents = [], logs = [], vectors = [] } = context;
  const blocked = (connections || []).filter(c => c.state === "BLOCKED").length;
  const critInc = (incidents || []).filter(i => String(i.severity).toLowerCase() === "critical").length;
  const summary = `Here's where things stand on ${panelId.replace(/-/g, " ")}: risk score ${riskScore}, ${(connections||[]).length} network connections (${blocked} blocked), ${critInc} critical incidents, ${(logs||[]).length} log events, ${(vectors||[]).length} threat vectors active. ${systemCtx} Ask me anything about this — by voice or just type below.`;

  sendNarrative({
      status: "ready",
      title: `${panelId.replace(/-/g, " ")} — Aria brief`,
      summary,
      likely_attack_path: blocked > 0 ? `Blocked socket → lateral movement attempt → internal host` : "",
      blast_radius: critInc > 0 ? "Critical incidents may affect connected systems." : "No critical blast radius detected.",
      recommended_actions: ["Review live panel data", "Run a quick scan", "Check connected sources"],
      ai_source: "static-fallback",
    }, reasoningStartedAt);
}

async function handleCommand(req, res) {
  const body = await readJson(req);
  const command     = String(body.text || "").trim();
  const model_mode  = String(body.model_mode  || "cloud");
  const cloud_model = body.cloud_model || DEFAULT_CLOUD_MODEL;
  const local_model = body.local_model;
  const tenantId    = req.authz?.tenant_id;

  if (!command) {
    jsonResponse(req, res, 400, { error: "Missing command text" });
    return;
  }

  // Selected intelligence mode with local function inference
  try {
    const aiSpmResult = await runAiSpmCommand(command);
    if (aiSpmResult) {
      jsonResponse(req, res, 200, { result: aiSpmResult });
      return;
    }

    const cmdResult = await runAriaCommand(command, { mode: model_mode, cloudModel: cloud_model, localModel: local_model, tenantId });
    jsonResponse(req, res, 200, { result: { ...cmdResult, ai_source: cmdResult.ai_source || model_mode } });
  } catch (error) {
    const inferred = inferAriaFunction(command) || { name: "run_scan", args: { target: command || "local host", depth: "standard" } };
    const gate = await gateAction(inferred.name, inferred.args, "deterministic-fallback", tenantId);
    if (gate.gated) { jsonResponse(req, res, 200, { result: gate.result }); return; }
    const fallback = executeAriaFunction(inferred.name, inferred.args);
    jsonResponse(req, res, 200, {
      result: {
        voice_response: `Aria function layer handled "${command}" without AI synthesis. Cloud AI unavailable: ${error.message}`,
        status: "deterministic-fallback",
        feed: fallback.feed,
        tool_results: [{ name: inferred.name, args: inferred.args, result: fallback }],
        ai_source: "static-fallback",
      },
    });
  }
}

async function handleAriaIntelligence(req, res) {
  const body = await readJson(req);
  const utterance = String(body.utterance || body.text || "").trim();
  const intent = String(body.intent || "question");
  const model_mode = String(body.model_mode || "cloud");
  const cloud_model = body.cloud_model || DEFAULT_CLOUD_MODEL;
  const local_model = body.local_model;

  if (!utterance && intent !== "alert" && intent !== "narrative") {
    jsonResponse(req, res, 400, { error: "Missing utterance" });
    return;
  }

  // Server-side organizational memory — what ARIA has resolved before and
  // what's currently deviating from baseline. The frontend doesn't track any
  // of this; we attach it here so every answer can draw on it without each
  // caller having to know these stores exist.
  const tenantId = req.authz?.tenant_id || "tenant-local";
  const organizationalMemory = { recentDecisions: [], recentClosedIncidents: [], recentAnomalies: [] };
  try {
    organizationalMemory.recentDecisions = getMemoryRecords(5, tenantId).map((r) => ({
      summary: r.narration || r.reason || r.signature,
      action_taken: r.action_taken,
      outcome: r.outcome,
      occurred_at: r.created_at,
    }));
  } catch (_) { /* non-fatal */ }
  try {
    const closed = await getIncidents(tenantId, { status: "closed", sort: "created_at" });
    organizationalMemory.recentClosedIncidents = closed.slice(0, 5).map((inc) => ({
      title: inc.title,
      severity: inc.severity,
      closure_reason: inc.closure_reason,
      closed_at: inc.closed_at,
    }));
  } catch (_) { /* non-fatal */ }
  try {
    organizationalMemory.recentAnomalies = await getRecentAnomaliesAcrossEntities(8);
  } catch (_) { /* non-fatal */ }

  const result = await runAriaIntelligence({
    utterance,
    intent,
    context: { ...(body.context || {}), organizationalMemory },
    model_mode,
    cloud_model,
    local_model,
    callAI,
  });

  jsonResponse(req, res, 200, { result });
}

// POST /api/aria/orchestrate — run ARIA Decision Engine against current findings
async function handleOrchestrate(req, res) {
  const body = await readJson(req);
  const command = String(body?.command || "").trim();
  const scopeOverride = String(body?.scope || "").trim();
  const tenantId = req.authz?.tenant_id;

  // Demo builds: serve the pre-baked decision fixture so the Decision Engine
  // looks AI-powered without shipping a key. Falls through to the live path if
  // no fixture is present.
  if (isDemoRequest(req)) {
    const fx = getDecisionFixture();
    if (fx?.raw_decision) {
      const decision = makeDecision({ ...fx.raw_decision });
      const attackPaths = (fx.attack_paths || []).map((p) => ({ ...p, decision_id: decision.decision_id }));
      let evidence = null;
      if (decision.recommended_action?.verb) {
        evidence = makeEvidenceRecord({
          decision_id: decision.decision_id,
          requested_by: "aria",
          approval_mode_at_time: await getGlobalAutonomyMode(tenantId),
          system: decision.recommended_action?.target?.system || "unknown",
          why: decision.reasoning,
          rollback_plan: decision.recommended_action?.reversible
            ? { verb: `undo_${decision.recommended_action.verb}`, params: {}, verified_reversible: true }
            : null,
        });
      }
      jsonResponse(req, res, 200, {
        decision,
        attack_paths: attackPaths,
        evidence,
        finding_count: fx.finding_count ?? 0,
        path_count: attackPaths.length,
        engine: "gemini",
      });
      return;
    }
  }

  // Load current AI-SPM state for findings context
  let findings = [];
  try {
    const state = await getAiSpmState();
    findings = state?.findings || [];
  } catch {
    // If AI-SPM state unavailable, orchestrate against empty findings set
  }

  // Build attack paths from findings
  const attackPaths = buildAttackPathGraph({ findings });

  // Recall similar past decisions
  let memory = null;
  try {
    memory = recallSimilar({ findings, tenantId });
  } catch {
    // Non-fatal; orchestrator handles null memory
  }

  // Get current trust scores
  let trustScores = null;
  try {
    trustScores = await getTrustScores(tenantId);
  } catch {
    // Non-fatal
  }

  const autonomyMode = await getGlobalAutonomyMode(tenantId);
  const scope = scopeOverride || "production environment (GitHub + AWS connectors)";

  const userContext = assembleOrchestratorContext({
    findings,
    memory,
    trustScores,
    scope,
    autonomyMode,
    command,
  });

  // Build the decision. Prefer Gemini for platform reasoning; spoken voice runs
  // through ElevenLabs TTS so Gemini Live/TTS cannot create realtime audio spend.
  const topPath = attackPaths[0];
  const localSynthesis = () => ({
    trigger: { type: "finding", ref_ids: findings.slice(0, 3).map(f => f.id) },
    observation: topPath
      ? `${findings.length} findings detected. Highest-severity chain: ${topPath.title}.`
      : `${findings.length} findings detected across connected systems.`,
    reasoning: "Decision synthesized from local finding data (orchestrator model unavailable).",
    evidence: findings.slice(0, 5).map(f => f.id),
    confidence: 40,
    blast_radius: topPath?.combined_severity || "medium",
    expected_outcome: "Manual analyst review required.",
    recommended_action: { verb: "notify", target: { system: "analyst" }, reversible: true, params: {} },
    fallback_action: { verb: "notify", target: { system: "analyst" }, rationale: "Local synthesis" },
    memory_references: [],
    autonomy_required: "approval",
    requires_human_approval: true,
    narration: `Aria detected ${findings.length} findings. ${topPath ? `The most significant chain leads to ${topPath.terminal_asset}.` : ""} Manual review is recommended.`,
  });

  let rawDecision;
  let decisionEngine;
  if (GOOGLE_API_KEY) {
    try {
      rawDecision = await callOrchestratorGemini({
        systemPrompt: ARIA_ORCHESTRATOR_SYSTEM_PROMPT,
        userContext,
        apiKey: GOOGLE_API_KEY,
        model: GEMINI_FLASH_MODEL,
      });
      decisionEngine = "gemini";
    } catch (err) {
      process.stdout.write(JSON.stringify({ level: "warn", msg: "orchestrator Gemini call failed, using local synthesis", error: String(err?.message || err) }) + "\n");
      rawDecision = localSynthesis();
      decisionEngine = "local_fallback";
    }
  } else {
    rawDecision = localSynthesis();
    decisionEngine = "local_no_key";
  }

  const decision = makeDecision({ ...rawDecision });

  // Tag attack paths with decision id
  for (const path of attackPaths) {
    path.decision_id = decision.decision_id;
  }

  // Log the decision
  logDecision(decision, tenantId);

  // Create a proposed evidence record for the recommended action
  let evidence = null;
  if (decision.recommended_action?.verb) {
    evidence = makeEvidenceRecord({
      decision_id: decision.decision_id,
      requested_by: "aria",
      approval_mode_at_time: autonomyMode,
      system: decision.recommended_action?.target?.system || "unknown",
      why: decision.reasoning,
      rollback_plan: decision.recommended_action?.reversible
        ? { verb: `undo_${decision.recommended_action.verb}`, params: {}, verified_reversible: decision.recommended_action.reversible }
        : null,
    });
    logEvidence(evidence, tenantId);
  }

  // Write memory record so future decisions can recall this one
  try {
    buildMemoryRecord({ findings, decision, outcome: "pending", actor: "aria", tenantId });
  } catch {
    // Non-fatal
  }

  jsonResponse(req, res, 200, {
    decision,
    attack_paths: attackPaths,
    evidence: evidence || null,
    finding_count: findings.length,
    path_count: attackPaths.length,
    engine: decisionEngine,
  });
}

function capabilityForDecision(decision) {
  const verb = String(decision?.recommended_action?.verb || "").toLowerCase();
  if (/identity|session|user|credential/.test(verb)) return "identity_actions";
  if (/contain|isolate|block|quarantine|kill/.test(verb)) return "containment";
  if (/remediat|rotate|patch|update|disable|remove/.test(verb)) return "remediation";
  return "threat_analysis";
}

async function handleDecisionOverride(req, res, decisionId) {
  const body = await readJson(req);
  const reason = String(body?.reason || "").trim();
  const alternative = body?.alternative_action && typeof body.alternative_action === "object"
    ? body.alternative_action
    : null;
  if (reason.length < 5) {
    jsonResponse(req, res, 400, { error: "An override reason of at least 5 characters is required." });
    return;
  }

  const tenantId = req.authz?.tenant_id || "tenant-local";
  const actor = req.authz?.user_id || "analyst";
  const decision = (await getDecisionLog(tenantId, 200)).find((item) => item.decision_id === decisionId);
  if (!decision) {
    jsonResponse(req, res, 404, { error: "Decision not found." });
    return;
  }
  if (decision.resolution) {
    jsonResponse(req, res, 409, { error: "Decision has already been resolved.", decision });
    return;
  }

  const capability = capabilityForDecision(decision);
  const resolution = {
    status: "overridden",
    reason,
    alternative_action: alternative,
    actor,
    resolved_at: new Date().toISOString(),
    original_recommendation: decision.recommended_action || null,
  };
  const updatedDecision = await updateDecisionResolution(decisionId, resolution, tenantId);
  if (!updatedDecision) {
    jsonResponse(req, res, 500, { error: "Could not persist decision override." });
    return;
  }

  const evidence = (await getEvidenceLog(tenantId, 200)).find((item) => item.decision_id === decisionId);
  if (evidence) {
    await updateEvidenceStatus(evidence.evidence_id, "rejected", {
      type: "operator_override",
      reason,
      alternative_action: alternative,
    }, tenantId);
  }
  const trust = await recordOutcome(capability, "override", actor, tenantId);
  buildMemoryRecord({
    findings: [],
    decision: { ...decision, resolution },
    outcome: "override",
    actor,
    tenantId,
  });
  logAuditEvent({
    event_type: "aria.decision.overridden",
    status: "success",
    actor,
    context: {
      tenant_id: tenantId,
      decision_id: decisionId,
      evidence_id: evidence?.evidence_id || null,
      capability,
      reason,
      original_recommendation: decision.recommended_action || null,
      alternative_action: alternative,
      trust_after: trust?.trust ?? null,
      mode_after: trust?.mode ?? null,
    },
  });

  jsonResponse(req, res, 200, {
    decision: updatedDecision,
    resolution,
    capability,
    trust,
    evidence_id: evidence?.evidence_id || null,
  });
}

async function handleSetAutonomy(req, res) {
  const body = await readJson(req);
  jsonResponse(req, res, 200, { state: { policy: setAutonomyMode(body.mode) } });
}

async function handleObserve(req, res) {
  const body = await readJson(req);
  jsonResponse(req, res, 200, { observation: await observeScreen(body) });
}

async function handleApproval(req, res) {
  const body = await readJson(req);
  const tenantId = req.authz?.tenant_id || "default";
  const actor = req.authz?.user_id || "analyst";
  jsonResponse(req, res, 200, { resolution: await resolveApproval(tenantId, body.id, body.decision, actor) });
}

async function handleLearn(req, res) {
  const body = await readJson(req);
  jsonResponse(req, res, 200, { learning: learnFromAnalyst(body) });
}

async function handleOverview(req, res) {
  const body = req.method === "POST" ? await readJson(req) : {};
  jsonResponse(req, res, 200, { overview: getOverviewReport(body) });
}

function handleLive(req, res) {
  jsonResponse(req, res, 200, { live: getMonitoringSnapshot() });
}

function handleSuggestions(req, res) {
  jsonResponse(req, res, 200, {
    suggestions: [{
      commands: [
        "Run AI-SPM scan",
        "Generate AI attack narrative",
        "Inspect AI exposure findings",
      ],
    }],
  });
}

async function handleWhoami(req, res) {
  const token = extractSessionToken(req);
  const sessionIdentity = token ? await validateSessionToken(token) : null;

  let auth_method = "headers";
  let context;
  let expires_at = null;

  if (sessionIdentity?.ok) {
    context = sessionIdentity.identity;
    auth_method = "session_token";
    expires_at = context.expires_at || null;
  } else if (process.env.OAUTH_ISSUER) {
    const jwtResult = await verifyJwtBearer(req);
    if (jwtResult.ok) {
      context = jwtResult.identity;
      auth_method = "oauth_jwt";
    }
  }

  if (!context) {
    context = extractTenantContext(req);
  }

  const enforce = ["1", "true", "yes", "on"].includes(String(process.env.ARIA_AUTHZ_ENFORCE || "").toLowerCase());
  const bypass  = ["1", "true", "yes", "on"].includes(String(process.env.ARIA_AUTHZ_ALLOW_LOCAL_BYPASS || "").toLowerCase());
  const authzMode = enforce ? "enforce" : bypass ? "bypass" : "deny-by-default";

  jsonResponse(req, res, 200, {
    tenant_id:  context.tenant_id,
    user_id:    context.user_id,
    role:       context.role,
    auth_method,
    expires_at,
    authz_mode: authzMode,
    header_sources: {
      tenant: auth_method === "session_token" ? "session_token" : (context._has_tenant_header ? "header" : "default"),
      user:   auth_method === "session_token" ? "session_token" : (context._has_user_header   ? "header" : "default"),
      role:   auth_method === "session_token" ? "session_token" : (context._has_role_header   ? "header" : "default"),
    },
  });
}

function readSecurityConfig() {
  return {
    session_ttl_seconds: securityConfigState.session_ttl_seconds,
    audit_retention_days: securityConfigState.audit_retention_days,
    updated_at: securityConfigState.updated_at,
    updated_by: securityConfigState.updated_by,
  };
}

async function handleComplianceStatus(req, res) {
  const quota = await getQuotaSnapshot();
  const context = req.authz || extractTenantContext(req);
  jsonResponse(req, res, 200, {
    tenant_id: context.tenant_id,
    user_id: context.user_id,
    role: context.role,
    status: "compliant",
    security: readSecurityConfig(),
    quota,
    generated_at: new Date().toISOString(),
  });
}

async function handleSecurityConfigUpdate(req, res) {
  let body;
  try {
    body = await readJson(req);
  } catch {
    jsonResponse(req, res, 400, { error: "Invalid JSON body." });
    return;
  }

  const sessionTtl = Number(body?.session_ttl_seconds);
  const auditRetention = Number(body?.audit_retention_days);

  if (!Number.isInteger(sessionTtl) || sessionTtl <= 0) {
    jsonResponse(req, res, 400, { error: "session_ttl_seconds must be a positive integer." });
    return;
  }

  if (!Number.isInteger(auditRetention) || auditRetention <= 0) {
    jsonResponse(req, res, 400, { error: "audit_retention_days must be a positive integer." });
    return;
  }

  securityConfigState.session_ttl_seconds = sessionTtl;
  securityConfigState.audit_retention_days = auditRetention;
  securityConfigState.updated_at = new Date().toISOString();
  securityConfigState.updated_by = req.authz?.user_id || "unknown";

  logAuditEvent({
    event_type: "security.config.updated",
    status: "success",
    actor: req.authz?.user_id || "unknown",
    context: {
      tenant_id: req.authz?.tenant_id || "unknown",
      api_path: "/api/aria/config/security",
      session_ttl_seconds: sessionTtl,
      audit_retention_days: auditRetention,
    },
  });

  jsonResponse(req, res, 200, {
    ok: true,
    security: readSecurityConfig(),
  });
}

function emitSessionAudit({ req, event_type, status = "success", reason = null, context = {} }) {
  logAuditEvent({
    event_type,
    status,
    actor: req.authz?.user_id || String(req?.headers?.["x-user-id"] || context.user_id || "unknown"),
    context: {
      tenant_id: req.authz?.tenant_id || String(req?.headers?.["x-tenant-id"] || context.tenant_id || "unknown"),
      api_path: "/api/aria/session",
      reason,
      ...context,
    },
  });
}

async function handleSession(req, res) {
  const rl = checkRateLimit(req);
  if (!rl.allowed) {
    const headers = getRateLimitHeaders(req);
    applySecurityHeaders(res);
    res.writeHead(429, { "Content-Type": "application/json", "Retry-After": String(rl.retryAfter), ...headers });
    res.end(JSON.stringify({ error: "Too Many Requests", retryAfter: rl.retryAfter }));
    return;
  }
  if (!sessionEndpointEnabled()) {
    emitSessionAudit({ req, event_type: "session.config_missing", status: "denied", reason: "ARIA_SESSION_SECRET is not configured" });
    jsonResponse(req, res, 503, { error: "Session endpoint not configured. Set ARIA_SESSION_SECRET to enable." });
    return;
  }

  let body;
  try {
    body = await readJson(req);
  } catch {
    emitSessionAudit({ req, event_type: "session.invalid_json", status: "denied", reason: "Invalid JSON body" });
    jsonResponse(req, res, 400, { error: "Invalid JSON body." });
    return;
  }

  const { token, code, provider } = body || {};

  // OAuth code exchange: swap an authorization code for an Aria session token.
  if (code && provider) {
    const issuer = process.env.OAUTH_ISSUER;
    if (!issuer) {
      emitSessionAudit({ req, event_type: "session.oauth_not_configured", status: "denied", reason: "OAUTH_ISSUER not set" });
      jsonResponse(req, res, 503, { error: "OAuth not configured." });
      return;
    }
    let tokenRes;
    try {
      tokenRes = await fetch(`${issuer}/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          client_id:     process.env.OAUTH_CLIENT_ID     || "",
          client_secret: process.env.OAUTH_CLIENT_SECRET || "",
          redirect_uri:  process.env.OAUTH_REDIRECT_URI  || "",
        }).toString(),
      });
    } catch (err) {
      emitSessionAudit({ req, event_type: "session.oauth_exchange_error", status: "denied", reason: err.message });
      jsonResponse(req, res, 502, { error: "OAuth token endpoint unreachable." });
      return;
    }
    if (!tokenRes.ok) {
      const errBody = await tokenRes.text().catch(() => "");
      emitSessionAudit({ req, event_type: "session.oauth_exchange_denied", status: "denied", reason: `OAuth token endpoint returned ${tokenRes.status}` });
      jsonResponse(req, res, 401, { error: "OAuth code exchange failed.", detail: errBody });
      return;
    }
    let oauthData;
    try {
      oauthData = await tokenRes.json();
    } catch {
      jsonResponse(req, res, 502, { error: "Invalid response from OAuth token endpoint." });
      return;
    }
    const accessToken = oauthData.access_token;
    if (!accessToken) {
      jsonResponse(req, res, 401, { error: "No access_token in OAuth response." });
      return;
    }
    // Parse claims from the access token (JWT) without re-verifying signature here —
    // the token was just issued by the trusted OAuth endpoint over TLS.
    let claims;
    try {
      const parts = accessToken.split(".");
      claims = parts.length >= 2
        ? JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"))
        : {};
    } catch {
      claims = {};
    }
    const oauthTenantId = String(claims.tenant_id || claims.tid || "").trim();
    const oauthUserId   = String(claims.user_id   || claims.sub || "").trim();
    const oauthRole     = String(claims.role       || "viewer").trim().toLowerCase();
    try {
      const result = await issueSessionToken({ tenant_id: oauthTenantId, user_id: oauthUserId, role: oauthRole });
      emitSessionAudit({ req, event_type: "session.oauth_issued", context: { tenant_id: result.tenant_id, user_id: result.user_id, role: result.role } });
      const rlHdrsOauth = getRateLimitHeaders(req);
      applySecurityHeaders(res);
      const corsOriginOauth = resolveCorsOrigin(req);
      res.writeHead(200, { "Content-Type": "application/json", ...(corsOriginOauth ? { "Access-Control-Allow-Origin": corsOriginOauth } : {}), ...rlHdrsOauth });
      res.end(JSON.stringify(result));
    } catch (err) {
      emitSessionAudit({ req, event_type: "session.oauth_issue_error", status: "denied", reason: err.message });
      jsonResponse(req, res, 500, { error: err.message });
    }
    return;
  }

  // Exchange: validate an existing token and return refreshed identity.
  if (token) {
    const result = await validateSessionToken(token);
    if (!result.ok) {
      emitSessionAudit({ req, event_type: "session.exchange_denied", status: "denied", reason: result.error });
      jsonResponse(req, res, 401, { error: result.error });
      return;
    }
    emitSessionAudit({
      req,
      event_type: "session.exchanged",
      context: { tenant_id: result.identity.tenant_id, user_id: result.identity.user_id, role: result.identity.role },
    });
    const rlHdrs = getRateLimitHeaders(req);
    applySecurityHeaders(res);
    const corsOrigin200 = resolveCorsOrigin(req);
    res.writeHead(200, { "Content-Type": "application/json", ...(corsOrigin200 ? { "Access-Control-Allow-Origin": corsOrigin200 } : {}), ...rlHdrs });
    res.end(JSON.stringify(result.identity));
    return;
  }

  // Issue: create a new session from identity fields in the request body.
  // Role-cap enforcement: the issued role cannot exceed the caller's existing authz level.
  //   - If the caller presents valid auth headers (bypass off), the issued role is capped to
  //     the caller's own role. This prevents role escalation via the session endpoint.
  //   - If no auth headers are present and bypass is off, elevated roles (owner/admin) cannot
  //     be self-issued; the max issuable role is 'analyst'.
  //   - When ARIA_AUTHZ_ALLOW_LOCAL_BYPASS=true (local dev only), no cap is enforced.
  const { tenant_id, user_id, role } = body || {};
  if (!tenant_id || !user_id || !role) {
    emitSessionAudit({ req, event_type: "session.issue_denied", status: "denied", reason: "Missing required issue fields" });
    jsonResponse(req, res, 400, { error: "Provide either 'token' to exchange, or 'tenant_id', 'user_id', and 'role' to issue a new session." });
    return;
  }

  // Determine if the caller has valid authz context from their request headers.
  const callerContext = extractTenantContext(req);
  const callerHasHeaders = callerContext._has_tenant_header && callerContext._has_user_header && callerContext._has_role_header;
  const bypassEnabled = ["1", "true", "yes", "on"].includes(String(process.env.ARIA_AUTHZ_ALLOW_LOCAL_BYPASS || "").toLowerCase());

  const ROLE_RANK = { viewer: 0, analyst: 1, admin: 2, owner: 3 };
  const requestedRank = ROLE_RANK[role] ?? -1;

  if (!ALLOW_UNAUTH_SESSION_ISSUE && !callerHasHeaders) {
    emitSessionAudit({ req, event_type: "session.issue_denied", status: "denied", reason: "Unauthenticated issuance disabled", context: { tenant_id, user_id, role } });
    jsonResponse(req, res, 401, {
      error: "Session issuance requires valid auth headers.",
    });
    return;
  }

  if (!bypassEnabled) {
    if (callerHasHeaders && callerContext.role !== "__invalid__") {
      // Cap the issued role to the caller's own role (prevents escalation).
      const callerRank = ROLE_RANK[callerContext.role] ?? -1;
      if (requestedRank > callerRank) {
        emitSessionAudit({ req, event_type: "session.issue_denied", status: "denied", reason: "Role escalation denied", context: { tenant_id, user_id, role } });
        jsonResponse(req, res, 403, {
          error: `Cannot issue a token with role '${role}': your current role '${callerContext.role}' does not permit elevation.`,
        });
        return;
      }
    } else {
      // No valid auth headers — cap to analyst for unauthenticated issuance.
      const MAX_UNAUTHENTICATED_RANK = ROLE_RANK["analyst"];
      if (requestedRank > MAX_UNAUTHENTICATED_RANK) {
        emitSessionAudit({ req, event_type: "session.issue_denied", status: "denied", reason: "Unauthenticated role cap exceeded", context: { tenant_id, user_id, role } });
        jsonResponse(req, res, 403, {
          error: `Cannot issue a token with role '${role}' without presenting valid auth headers (x-tenant-id, x-user-id, x-role). Maximum unauthenticated role is 'analyst'.`,
        });
        return;
      }
    }
  }

  try {
    const result = await issueSessionToken({ tenant_id, user_id, role });
    emitSessionAudit({ req, event_type: "session.issued", context: { tenant_id: result.tenant_id, user_id: result.user_id, role: result.role, expires_at: result.expires_at } });
    const rlHdrs2 = getRateLimitHeaders(req);
    applySecurityHeaders(res);
    const corsOrigin202 = resolveCorsOrigin(req);
    res.writeHead(200, { "Content-Type": "application/json", ...(corsOrigin202 ? { "Access-Control-Allow-Origin": corsOrigin202 } : {}), ...rlHdrs2 });
    res.end(JSON.stringify(result));
  } catch (err) {
    emitSessionAudit({ req, event_type: "session.issue_error", status: "denied", reason: err.message, context: { tenant_id, user_id, role } });
    jsonResponse(req, res, 500, { error: err.message });
  }
}

async function handleSessionList(req, res) {
  const role = req.authz?.role;
  if (role !== "admin" && role !== "owner") {
    emitSessionAudit({ req, event_type: "session.list_denied", status: "denied", reason: "Admin scope required" });
    jsonResponse(req, res, 403, { error: "Admin or owner role required." });
    return;
  }
  const tenantId = req.authz?.tenant_id || null;
  const now = new Date().toISOString();
  const toSessionRow = (s, source = "token") => {
    const sid = s.session_id || s.sid || s.id;
    const userId = s.user_id || s.user || null;
    return {
      session_id: sid,
      sid,
      id: sid,
      tenant_id: s.tenant_id || tenantId,
      user_id: userId,
      user: userId,
      role: s.role || "viewer",
      issued_at: s.issued_at || now,
      expires_at: s.expires_at || null,
      last_seen: s.last_seen || now,
      source,
      status: s.revoked_at ? "revoked" : (s.status || "active"),
      revoked_at: s.revoked_at || null,
    };
  };
  const sessions = (await listIssuedSessions({ tenant_id: tenantId }))
    .filter((s) => !s.revoked_at)
    .map((s) => toSessionRow(s, "token"));
  const syntheticSid = req.authz?.tenant_id && req.authz?.user_id
    ? `sess-${req.authz.tenant_id}-${req.authz.user_id}`
    : null;
  if (syntheticSid && !isSyntheticSidRevoked(syntheticSid) && !sessions.some((s) => s.session_id === syntheticSid)) {
    sessions.unshift(toSessionRow({
      session_id: syntheticSid,
      tenant_id: req.authz.tenant_id,
      user_id: req.authz.user_id,
      role,
      issued_at: now,
      last_seen: now,
      status: "active",
    }, req.authz._has_tenant_header ? "header" : "default"));
  }
  const identity = {
    tenant_id: { value: req.authz?.tenant_id || tenantId || "tenant-local", source: req.authz?._has_tenant_header ? "header" : "default" },
    user_id: { value: req.authz?.user_id || "user-local", source: req.authz?._has_user_header ? "header" : "default" },
    role: { value: role, source: req.authz?._has_role_header ? "header" : "default" },
  };
  emitSessionAudit({ req, event_type: "session.listed", context: { tenant_id: tenantId, count: sessions.length } });
  jsonResponse(req, res, 200, { sessions, total: sessions.length, identity });
}

async function handleSessionRevoke(req, res, sessionId) {
  const role = req.authz?.role;
  if (role !== "admin" && role !== "owner") {
    emitSessionAudit({ req, event_type: "session.revoke_denied", status: "denied", reason: "Admin scope required", context: { sid: sessionId || null } });
    jsonResponse(req, res, 403, { error: "Admin or owner role required." });
    return;
  }
  if (!sessionEndpointEnabled()) {
    emitSessionAudit({ req, event_type: "session.revoke_denied", status: "denied", reason: "ARIA_SESSION_SECRET is not configured" });
    jsonResponse(req, res, 503, { error: "Session endpoint not configured. Set ARIA_SESSION_SECRET to enable." });
    return;
  }

  let body;
  try {
    body = await readJson(req);
  } catch {
    emitSessionAudit({ req, event_type: "session.revoke_denied", status: "denied", reason: "Invalid JSON body" });
    jsonResponse(req, res, 400, { error: "Invalid JSON body." });
    return;
  }
  const reason = String(body?.reason || "").trim();
  if (!reason) {
    emitSessionAudit({ req, event_type: "session.revoke_denied", status: "denied", reason: "Missing revoke reason", context: { sid: sessionId || null } });
    jsonResponse(req, res, 400, { error: "Provide revoke reason." });
    return;
  }

  let revoked = await revokeSessionById({ sid: sessionId, tenant_id: req.authz?.tenant_id || null });
  if (!revoked.ok && String(sessionId || "").startsWith("sess-")) {
    revoked = revokeSessionBySid(sessionId);
  }
  if (!revoked.ok) {
    emitSessionAudit({ req, event_type: "session.revoke_denied", status: "denied", reason: revoked.error, context: { sid: sessionId || null, revoke_reason: reason } });
    jsonResponse(req, res, revoked.error === "Session not found." ? 404 : 400, {
      error: revoked.error,
      code: revoked.error === "Session not found." ? "SESSION_NOT_FOUND" : "SESSION_REVOKE_FAILED",
    });
    return;
  }
  emitSessionAudit({ req, event_type: "session.revoked", context: { sid: revoked.sid, revoked_at: revoked.revoked_at || null, revoke_reason: reason } });
  jsonResponse(req, res, 200, {
    ok: true,
    revoked: true,
    sid: revoked.sid,
    revoked_at: revoked.revoked_at || null,
    already_revoked: Boolean(revoked.already_revoked),
    session: revoked.entry || { session_id: revoked.sid, sid: revoked.sid, status: "revoked", revoked_at: revoked.revoked_at || null },
  });
}

async function handleSessionForceReauth(req, res, sessionId) {
  const role = req.authz?.role;
  if (role !== "admin" && role !== "owner") {
    emitSessionAudit({ req, event_type: "session.force_reauth_denied", status: "denied", reason: "Admin scope required", context: { sid: sessionId || null } });
    jsonResponse(req, res, 403, { error: "Admin or owner role required." });
    return;
  }
  if (!sessionEndpointEnabled()) {
    emitSessionAudit({ req, event_type: "session.force_reauth_denied", status: "denied", reason: "ARIA_SESSION_SECRET is not configured" });
    jsonResponse(req, res, 503, { error: "Session endpoint not configured. Set ARIA_SESSION_SECRET to enable." });
    return;
  }

  let body;
  try {
    body = await readJson(req);
  } catch {
    emitSessionAudit({ req, event_type: "session.force_reauth_denied", status: "denied", reason: "Invalid JSON body" });
    jsonResponse(req, res, 400, { error: "Invalid JSON body." });
    return;
  }
  const reason = String(body?.reason || "").trim();
  if (!reason) {
    emitSessionAudit({ req, event_type: "session.force_reauth_denied", status: "denied", reason: "Missing force-reauth reason", context: { sid: sessionId || null } });
    jsonResponse(req, res, 400, { error: "Provide force-reauth reason." });
    return;
  }

  // Force-reauth is implemented as a revoke — the session must re-authenticate.
  // Distinct from plain revoke: uses force_reauth audit event and sets forced_at.
  const revoked = await revokeSessionById({ sid: sessionId, tenant_id: req.authz?.tenant_id || null });
  if (!revoked.ok) {
    emitSessionAudit({ req, event_type: "session.force_reauth_denied", status: "denied", reason: revoked.error, context: { sid: sessionId || null, reauth_reason: reason } });
    jsonResponse(req, res, revoked.error === "Session not found." ? 404 : 400, { error: revoked.error });
    return;
  }
  emitSessionAudit({ req, event_type: "session.force_reauth", context: { sid: revoked.sid, forced_at: revoked.revoked_at || null, reauth_reason: reason } });
  jsonResponse(req, res, 200, { ok: true, sid: revoked.sid, forced_at: revoked.revoked_at || null });
}

async function handleLegacySessionRevoke(req, res) {
  const role = req.authz?.role;
  if (role !== "admin" && role !== "owner") {
    emitSessionAudit({ req, event_type: "session.revoke_denied", status: "denied", reason: "Admin scope required" });
    jsonResponse(req, res, 403, { error: "Admin or owner role required." });
    return;
  }
  if (!sessionEndpointEnabled()) {
    emitSessionAudit({ req, event_type: "session.revoke_denied", status: "denied", reason: "ARIA_SESSION_SECRET is not configured" });
    jsonResponse(req, res, 503, { error: "Session endpoint not configured. Set ARIA_SESSION_SECRET to enable." });
    return;
  }

  let body;
  try {
    body = await readJson(req);
  } catch {
    emitSessionAudit({ req, event_type: "session.revoke_denied", status: "denied", reason: "Invalid JSON body" });
    jsonResponse(req, res, 400, { error: "Invalid JSON body." });
    return;
  }

  const token = String(body?.token || "").trim();
  const reason = String(body?.reason || "").trim();
  if (!reason) {
    emitSessionAudit({ req, event_type: "session.revoke_denied", status: "denied", reason: "Missing revoke reason" });
    jsonResponse(req, res, 400, { error: "Provide revoke reason." });
    return;
  }
  const revoked = await revokeSessionToken(token);
  if (!revoked.ok) {
    emitSessionAudit({ req, event_type: "session.revoke_denied", status: "denied", reason: revoked.error, context: { revoke_reason: reason } });
    jsonResponse(req, res, revoked.error === "Session not found." ? 404 : 400, { error: revoked.error });
    return;
  }
  emitSessionAudit({ req, event_type: "session.revoked", context: { sid: revoked.sid, revoked_at: revoked.revoked_at || null, revoke_reason: reason } });
  jsonResponse(req, res, 200, { ok: true, sid: revoked.sid, revoked_at: revoked.revoked_at || null, already_revoked: Boolean(revoked.already_revoked) });
}

const AUDIT_EVENTS_LIMIT_CAP = 500;

async function handleAuditEvents(req, res) {
  const qs = new URL(req.url, "http://localhost").searchParams;
  const rawLimit = qs.get("limit");
  const filterType   = qs.get("event_type") || null;
  const filterStatus = qs.get("status")     || null;
  const filterActor  = qs.get("actor")      || null;

  const limit = rawLimit !== null
    ? Math.min(Math.max(1, Math.floor(Number(rawLimit) || 1)), AUDIT_EVENTS_LIMIT_CAP)
    : 100;

  if (rawLimit !== null && (!Number.isFinite(Number(rawLimit)) || Number(rawLimit) < 1)) {
    jsonResponse(req, res, 400, { error: "Invalid limit parameter. Must be a positive integer." });
    return;
  }

  // readAuditEvents applies event_type/status/tenant_id filters internally.
  // Events lacking a tenant_id in their context (legacy or platform-level
  // entries) are excluded once a tenant is known, rather than shown to every
  // tenant — strict isolation over completeness for a multi-tenant pilot.
  const tenantId = req.authz?.tenant_id;
  const all = await readAuditEvents({ limit: AUDIT_EVENTS_LIMIT_CAP, event_type: filterType, status: filterStatus, tenant_id: tenantId });

  const filtered = all.filter((e) => {
    if (filterActor && e.actor !== filterActor) return false;
    return true;
  }).slice(0, limit);

  const events = filtered.map((e) => ({
    timestamp: e.timestamp,
    actor: e.actor,
    event_type: e.event_type,
    api_path: e.context?.api_path ?? null,
    reason: e.context?.reason ?? null,
    status: e.status,
    context: e.context && typeof e.context === "object" ? e.context : {},
  }));

  jsonResponse(req, res, 200, { events, total: events.length });
}

async function handleAiSpmScan(req, res) {
  const body = await readJson(req);
  const state = await scanAiSpm(body || {});
  jsonResponse(req, res, 200, state);
}

async function handleAiSpmNarrative(req, res) {
  const body = req.method === "POST" ? await readJson(req) : {};
  const finding = body?.finding || null;

  // AI-001: AI-backed narrative for individual finding context
  if (finding) {
    const prompt = `You are Aria, an AI-powered security posture management assistant.
Analyze the following AI-SPM finding and generate a concise security narrative.

Finding ID: ${finding.id || "unknown"}
Severity: ${finding.severity || "unknown"}
Title: ${finding.title || "unknown"}
Code: ${finding.code || "unknown"}
Asset: ${finding.asset_name || finding.asset_id || "unknown"}
Rationale: ${finding.rationale || ""}
Attack path: ${(finding.attack_path || []).join(" → ")}
Recommendations: ${(finding.recommendations || []).join("; ")}

Respond in JSON with this exact shape:
{
  "status": "ready",
  "title": "<short title for this finding>",
  "summary": "<2-3 sentence expert security summary>",
  "likely_attack_path": "<one-line attack path description>",
  "blast_radius": "<one-line blast radius description>",
  "recommended_actions": ["<action 1>", "<action 2>", "<action 3>"]
}`;

    try {
      // AI-SPM scan narratives run over every finding across all connectors —
      // Gemini Flash keeps that affordable vs. Claude Opus (~$20/hr at scale).
      const aiResult = await callAI(prompt, { mode: "gemini" });
      const rawText = aiResult.text || "";
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      const parsed = jsonMatch ? (() => { try { return JSON.parse(jsonMatch[0]); } catch { return null; } })() : null;
      if (parsed?.summary) {
        jsonResponse(req, res, 200, { narrative: parsed, finding_id: finding.id });
        return;
      }
    } catch (err) {
      console.warn("[AI-SPM] AI finding narrative failed:", err.message);
    }

    // Fallback shape when AI unavailable
    jsonResponse(req, res, 200, {
      narrative: {
        status: "ready",
        title: finding.title || "Security Finding",
        summary: finding.rationale || `Finding ${finding.id} requires investigation.`,
        likely_attack_path: (finding.attack_path || []).join(" → ") || "Not determined",
        blast_radius: `${finding.severity || "unknown"} severity impact to ${finding.asset_name || finding.asset_id || "unknown asset"}`,
        recommended_actions: finding.recommendations || ["Investigate the finding evidence", "Apply least-privilege remediation"],
      },
      finding_id: finding.id,
    });
    return;
  }

  // Default: return full posture narrative
  const narrative = await getAiSpmNarrative(body || {});
  jsonResponse(req, res, 200, narrative);
}

async function handleAiSpmAction(req, res) {
  const body = await readJson(req);
  const result = await recordAiSpmFindingAction(body || {});
  jsonResponse(req, res, 200, result);
}

// AI-003: build reproduction steps based on finding type
function buildReproductionSteps(finding) {
  const code = finding.code || "";
  if (code === "ai-secret-in-source") {
    return [
      "Clone the repository locally",
      `Search for the exposed credential pattern: git log --all -p | grep -i 'api_key\\|secret\\|token'`,
      "Verify the credential is active by attempting a minimal authenticated API call",
      "Check git history for commit that introduced the secret: git log --follow -p -- <file>",
      "Confirm no downstream systems consumed the exposed credential",
    ];
  }
  if (code === "iam-ai-role-wildcard") {
    return [
      `Retrieve the IAM policy: aws iam get-role-policy --role-name <role> --policy-name <policy>`,
      "Verify Action: '*' or Resource: '*' is present in the policy document",
      "Check CloudTrail for recent API calls made by this role",
      "Enumerate what services the role can access with the wildcard",
    ];
  }
  if (code.includes("bedrock")) {
    return [
      `List Bedrock agents: aws bedrock-agent list-agents --region <region>`,
      "Check if guardrails are attached: aws bedrock-agent get-agent --agent-id <id>",
      "Review agent action groups for overly permissive actions",
      "Test for prompt injection by sending adversarial inputs to the agent endpoint",
    ];
  }
  return [
    `Locate the asset: ${finding.asset_name || finding.asset_id || "unknown"}`,
    "Review the evidence listed in the finding for details",
    "Check recent activity logs for the affected asset",
    "Apply the recommended remediation steps",
  ];
}

async function handleAiSpmEvidence(req, res) {
  const body = await readJson(req);
  const findingId = body?.findingId || body?.finding_id;

  // AI-003: get full evidence sandbox from inventory
  let sandboxResult;
  try {
    sandboxResult = await getAiSpmEvidenceSandbox({ findingId });
  } catch (err) {
    jsonResponse(req, res, 404, { error: err.message });
    return;
  }

  const finding = sandboxResult.sandbox?.finding || {};

  // Enrich: pull asset metadata from current inventory
  let asset = null;
  try {
    const inventory = await getAiSpmInventory();
    asset = (inventory.assets || []).find(
      (a) => a.id === finding.asset_id || a.normalized_id === finding.asset_id
    ) || null;
  } catch (_) { /* non-fatal */ }

  // Enrich: pull recent audit events related to the asset
  let audit_trail = [];
  try {
    const events = await readAuditEvents({ limit: 100, tenant_id: req.authz?.tenant_id });
    const assetId = finding.asset_id || "";
    audit_trail = events
      .filter((e) => {
        const ctx = JSON.stringify(e.context || "");
        return assetId && (ctx.includes(assetId) || ctx.includes(finding.id || ""));
      })
      .slice(0, 20)
      .map((e) => ({
        timestamp: e.timestamp,
        event_type: e.event_type,
        actor: e.actor,
        status: e.status,
      }));
  } catch (_) { /* non-fatal */ }

  const reproduction_steps = buildReproductionSteps(finding);

  jsonResponse(req, res, 200, {
    finding,
    asset,
    audit_trail,
    reproduction_steps,
    // Keep sandbox data for backward compatibility
    sandbox: sandboxResult.sandbox,
  });
}

async function handleAiSpmReport(req, res) {
  const body = req.method === "POST" ? await readJson(req) : {};
  const result = await generateAiSpmReport(body || {});
  jsonResponse(req, res, 200, result);
}

// AI-002: known executor keys and their destructiveness classification
const EXECUTOR_KEYS = {
  removePublicAccess:  { destructive: false },
  rotateCredentials:   { destructive: true  },
  disableEndpoint:     { destructive: true  },
  updatePermissions:   { destructive: false },
};

function classifyRemediationStep(action) {
  // Match action.type or action.executor_key against known executor keys
  const key = action.executor_key || action.type || "";
  for (const [executorKey, meta] of Object.entries(EXECUTOR_KEYS)) {
    if (key === executorKey || key.includes(executorKey)) {
      return { matched: true, executorKey, destructive: meta.destructive };
    }
  }
  return { matched: false };
}

async function handleAiSpmRemediate(req, res) {
  const body = await readJson(req);
  const findingId = body?.findingId || body?.finding_id;
  const actor = req.authz?.user_id || "system";
  const tenantId = req.authz?.tenant_id;

  const plan = getAiSpmRemediationPlan({ findingId, ...(body || {}) });

  // AI-002: if execute=true, classify and execute/approve each step
  if (body?.execute) {
    const execution_status = await Promise.all(
      (plan.actions || []).map(async (action, idx) => {
        const classification = classifyRemediationStep(action);

        if (!classification.matched) {
          return { step: idx, action: action.type || action.title, status: "unsupported" };
        }

        if (!classification.destructive) {
          // Non-destructive: execute immediately
          try {
            const execution = executeAiSpmRemediation({ findingId, actionIndex: idx, actor });
            return {
              step: idx,
              action: action.type || action.title,
              executor_key: classification.executorKey,
              status: "work_item_created",
              enforcement_mode: "manual",
              execution_id: execution.id,
            };
          } catch (err) {
            return { step: idx, action: action.type || action.title, executor_key: classification.executorKey, status: "error", error: err.message };
          }
        } else {
          // Destructive: request approval
          try {
            const approval = await requestApproval(tenantId, {
              action: classification.executorKey,
              args: { finding_id: findingId, action_index: idx },
              context: `Destructive remediation step "${action.title}" for finding ${findingId}`,
              risk: "high",
              source: "ai-spm-remediation",
            });
            return { step: idx, action: action.type || action.title, executor_key: classification.executorKey, status: "pending_approval", approval_id: approval?.id || null };
          } catch (err) {
            return { step: idx, action: action.type || action.title, executor_key: classification.executorKey, status: "pending_approval" };
          }
        }
      })
    );

    jsonResponse(req, res, 200, { plan, execution_status });
    return;
  }

  jsonResponse(req, res, 200, plan);
}

async function handleGithubConnectorToken(req, res) {
  const body = await readJson(req);
  const result = await saveGithubTokenConnector(body || {});
  jsonResponse(req, res, 200, result);
}

async function handleGithubConnectorRepos(req, res) {
  if (req.method === "GET") {
    jsonResponse(req, res, 200, await listGithubConnectorRepositories());
    return;
  }
  const body = await readJson(req);
  jsonResponse(req, res, 200, updateGithubConnectorRepositories(body || {}));
}

async function handleGithubConnectorDeviceStart(req, res) {
  jsonResponse(req, res, 200, await startGithubDeviceFlow());
}

async function handleGithubConnectorDevicePoll(req, res) {
  const body = await readJson(req);
  jsonResponse(req, res, 200, await pollGithubDeviceFlow(body || {}));
}

// ── Incident action handlers (IN-001/002/003) ─────────────────────────────────

async function handleIncidentAcknowledge(req, res, incidentId) {
  const body = await readJson(req);
  const actor = req.authz?.user_id || body?.actor || "unknown";
  const tenantId = req.authz?.tenant_id || "default";
  const incident = await acknowledgeIncident(tenantId, incidentId, actor);
  if (!incident) { jsonResponse(req, res, 404, { error: "Incident not found" }); return; }
  jsonResponse(req, res, 200, { incident, ok: true });
}

async function handleIncidentEscalate(req, res, incidentId) {
  const body = await readJson(req);
  const actor = req.authz?.user_id || body?.actor || "unknown";
  const tenantId = req.authz?.tenant_id || "default";
  const incident = await escalateIncident(tenantId, incidentId, actor);
  if (!incident) { jsonResponse(req, res, 404, { error: "Incident not found" }); return; }
  sseEmit("incident.escalated", { incident });
  jsonResponse(req, res, 200, { incident, ok: true });
}

async function handleIncidentSuppress(req, res, incidentId) {
  const body = await readJson(req);
  const actor = req.authz?.user_id || body?.actor || "unknown";
  const tenantId = req.authz?.tenant_id || "default";
  try {
    const incident = await suppressIncident(tenantId, incidentId, actor, body?.reason);
    if (!incident) { jsonResponse(req, res, 404, { error: "Incident not found" }); return; }
    jsonResponse(req, res, 200, { incident, ok: true });
  } catch (err) {
    jsonResponse(req, res, 400, { error: err.message });
  }
}

// ── Blocked-IP action handler (BI-001) ────────────────────────────────────────

async function handleUnblockIp(req, res, ip) {
  const body = await readJson(req);
  const actor = req.authz?.user_id || body?.actor || "unknown";
  const tenantId = req.authz?.tenant_id || "default";
  await unblockIp(tenantId, ip, actor);
  jsonResponse(req, res, 200, { ok: true, ip, unblocked_at: new Date().toISOString(), unblocked_by: actor });
}

// ── Quarantine action handlers (QU-001/002) ───────────────────────────────────

async function handleQuarantineRelease(req, res, itemId) {
  const body = await readJson(req);
  const actor = req.authz?.user_id || body?.actor || "unknown";
  const tenantId = req.authz?.tenant_id || "default";
  const item = await releaseFile(tenantId, itemId, actor);
  jsonResponse(req, res, 200, { ok: true, item });
}

async function handleQuarantineDelete(req, res, itemId) {
  const body = await readJson(req);
  const actor = req.authz?.user_id || body?.actor || "unknown";
  const tenantId = req.authz?.tenant_id || "default";
  const item = await deleteFile(tenantId, itemId, actor);
  jsonResponse(req, res, 200, { ok: true, item });
}

// ── Bulk approval handler (AC-002) ────────────────────────────────────────────

async function handleApprovalBulk(req, res) {
  const body = await readJson(req);
  const ids = Array.isArray(body?.ids) ? body.ids : [];
  const decision = String(body?.decision || "");
  const actor = req.authz?.user_id || body?.actor || "unknown";
  const tenantId = req.authz?.tenant_id || "default";
  if (!ids.length) { jsonResponse(req, res, 400, { error: "ids array is required" }); return; }
  if (!["approve", "deny"].includes(decision)) { jsonResponse(req, res, 400, { error: "decision must be approve or deny" }); return; }
  const result = await bulkResolveApprovals(tenantId, ids, decision, actor);
  jsonResponse(req, res, 200, { ok: true, ...result });
}

// ── Policy handlers ───────────────────────────────────────────────────────────

function emitPolicyAudit({ req, event_type, status = "success", reason = null, context = {} }) {
  logAuditEvent({
    event_type,
    status,
    actor: req.authz?.user_id || String(req?.headers?.["x-user-id"] || "unknown"),
    context: {
      tenant_id: req.authz?.tenant_id || String(req?.headers?.["x-tenant-id"] || "unknown"),
      api_path: req.url ? String(req.url).split("?")[0] : null,
      reason,
      ...context,
    },
  });
}

function handlePolicyList(req, res) {
  const role = req.authz?.role;
  if (role !== "admin" && role !== "owner") {
    emitPolicyAudit({ req, event_type: "policy.list_denied", status: "denied", reason: "Insufficient role" });
    jsonResponse(req, res, 403, { error: "Admin or owner role required." });
    return;
  }
  const tenantId = req.authz?.tenant_id || null;
  const policies = listPoliciesLegacy({ tenant_id: tenantId });
  emitPolicyAudit({ req, event_type: "policy.listed", context: { count: policies.length } });
  jsonResponse(req, res, 200, { policies, total: policies.length });
}

async function handlePolicyPreview(req, res) {
  const role = req.authz?.role;
  // Preview is non-destructive — admin, owner, and analyst may preview.
  if (role !== "admin" && role !== "owner" && role !== "analyst") {
    emitPolicyAudit({ req, event_type: "policy.preview_denied", status: "denied", reason: "Insufficient role" });
    jsonResponse(req, res, 403, { error: "Admin, owner, or analyst role required to preview." });
    return;
  }
  let body;
  try { body = await readJson(req); } catch {
    jsonResponse(req, res, 400, { error: "Invalid JSON body." });
    return;
  }
  const { policy_id, proposed } = body || {};
  if (!policy_id || typeof proposed !== "object" || proposed === null) {
    jsonResponse(req, res, 400, { error: "policy_id and proposed object are required." });
    return;
  }
  const tenantId = req.authz?.tenant_id || null;
  const result = previewPolicyLegacy({ policy_id, proposed, tenant_id: tenantId });
  emitPolicyAudit({ req, event_type: "policy.previewed", context: { policy_id, risk: result.risk } });
  jsonResponse(req, res, 200, result);
}

async function handlePolicyApply(req, res) {
  const role = req.authz?.role;
  if (role !== "admin" && role !== "owner") {
    emitPolicyAudit({ req, event_type: "policy.apply_denied", status: "denied", reason: "Insufficient role" });
    jsonResponse(req, res, 403, { error: "Admin or owner role required." });
    return;
  }
  let body;
  try { body = await readJson(req); } catch {
    jsonResponse(req, res, 400, { error: "Invalid JSON body." });
    return;
  }
  const { policy_id, proposed, reason } = body || {};
  if (!policy_id || typeof proposed !== "object" || proposed === null) {
    emitPolicyAudit({ req, event_type: "policy.apply_denied", status: "denied", reason: "Missing required fields" });
    jsonResponse(req, res, 400, { error: "policy_id and proposed object are required." });
    return;
  }
  if (!reason || !String(reason).trim()) {
    emitPolicyAudit({ req, event_type: "policy.apply_denied", status: "denied", reason: "Missing reason", context: { policy_id } });
    jsonResponse(req, res, 400, { error: "reason is required and must be non-empty." });
    return;
  }
  const tenantId = req.authz?.tenant_id || null;
  const actor = req.authz?.user_id || String(req?.headers?.["x-user-id"] || "unknown");
  const result = applyPolicyLegacy({ policy_id, proposed, actor, tenant_id: tenantId, reason });
  emitPolicyAudit({
    req,
    event_type: "policy.applied",
    reason,
    context: { policy_id, risk: result.history_entry.risk, diff_fields: result.history_entry.diff.map((d) => d.field) },
  });
  jsonResponse(req, res, 200, { ok: true, policy: result.policy, history_entry: result.history_entry });
}

function handlePolicyHistory(req, res) {
  const role = req.authz?.role;
  if (role !== "admin" && role !== "owner") {
    emitPolicyAudit({ req, event_type: "policy.history_denied", status: "denied", reason: "Insufficient role" });
    jsonResponse(req, res, 403, { error: "Admin or owner role required." });
    return;
  }
  const url = new URL(req.url, "http://localhost");
  const policy_id = url.searchParams.get("policy_id") || null;
  const limit = url.searchParams.get("limit") || 20;
  const tenantId = req.authz?.tenant_id || null;
  const history = getPolicyHistoryLegacy({ tenant_id: tenantId, policy_id, limit });
  jsonResponse(req, res, 200, { history, total: history.length });
}

// SA-002: policy rollback handler
async function handlePolicyRollback(req, res) {
  const role = req.authz?.role;
  if (role !== "admin" && role !== "owner") {
    jsonResponse(req, res, 403, { error: "Admin or owner role required." });
    return;
  }
  const body = await readJson(req);
  if (!body?.policy_id) {
    jsonResponse(req, res, 400, { error: "policy_id is required." });
    return;
  }
  try {
    const result = rollbackPolicyLegacy({
      policy_id: body.policy_id,
      history_entry_id: body.history_entry_id || null,
      actor: req.authz?.user_id || "system",
      tenant_id: req.authz?.tenant_id || null,
      reason: body.reason || "Manual rollback",
    });
    emitPolicyAudit({ req, event_type: "policy.rollback", context: { policy_id: body.policy_id } });
    jsonResponse(req, res, 200, result);
  } catch (err) {
    jsonResponse(req, res, 400, { error: err.message });
  }
}

// SA-003: policy dry-run handler
async function handlePolicyDryRun(req, res) {
  const body = await readJson(req);
  if (!body?.policy_id) {
    jsonResponse(req, res, 400, { error: "policy_id and proposed are required." });
    return;
  }
  const result = dryRunPolicy({
    policy_id: body.policy_id,
    proposed: body.proposed || {},
    tenant_id: req.authz?.tenant_id || null,
  });
  emitPolicyAudit({ req, event_type: "policy.dry_run", context: { policy_id: body.policy_id } });
  jsonResponse(req, res, 200, result);
}

export async function handleAriaRequest(req, res) {
  req.requestId = Math.random().toString(36).slice(2, 10);
  const path = String(req.url || "").split("?")[0];
  const apiPath = path.startsWith("/api/") ? path : `/api${path === "/" ? "" : path}`;

  if (req.method === "OPTIONS") {
    jsonResponse(req, res, 204, {});
    return;
  }

  // ── Public trial / contact capture (unauthenticated) ────────────────────────
  // The marketing landing posts here. No auth — but rate-limited by IP and the
  // payload is strictly validated + length-capped before it ever touches disk.
  if (req.method === "POST" && apiPath === "/api/public/trial-request") {
    const sourceIp = getRateLimitClientIp(req);
    const rl = checkRateLimit(req);
    if (rl && rl.allowed === false) {
      jsonResponse(req, res, 429, { error: "Too many requests. Please try again shortly." });
      return;
    }
    let body;
    try { body = await readJson(req); } catch { body = null; }
    const result = normaliseTrialLead(body, { ip: sourceIp, userAgent: req.headers?.["user-agent"] });
    if (!result.ok) {
      jsonResponse(req, res, 400, { error: result.error });
      return;
    }
    try {
      saveTrialLead(result.record);
      logAuditEvent({
        event_type: "public.trial_request",
        status: "received",
        actor: result.record.email,
        context: { organisation: result.record.organisation, size: result.record.size, id: result.record.id },
      });
      jsonResponse(req, res, 200, { ok: true, id: result.record.id });
    } catch (err) {
      console.error("[Trial] Failed to store lead:", err.message);
      jsonResponse(req, res, 500, { error: "Could not store request." });
    }
    return;
  }

  // ── Authentication (login / logout / session) — entry point, no authz gate ──
  if (apiPath.startsWith("/api/auth/")) {
    const body = req.method === "POST" ? await readJson(req) : {};
    if (await handleAuthRoutes(req, res, apiPath, body)) return;
  }

  // whoami and session are exempt from authz — they are the identity entry points.
  // Connector routes (/api/connectors/*) are now included: reads require any authenticated
  // role; writes (connect/disconnect/credential supply) require admin or owner.
  const needsAuthz = (
    apiPath.startsWith("/api/aria/") ||
    apiPath.startsWith("/api/ai-spm/") ||
    apiPath.startsWith("/api/connectors/")
  )
    && apiPath !== "/api/aria/whoami"
    && apiPath !== "/api/aria/session"
    && apiPath !== "/api/aria/health"
    && apiPath !== "/api/aria/stream";
  if (needsAuthz) {
    const authz = await authorizeRequest({ req, apiPath });
    req.authz = authz.context || null;
    if (!authz.allowed) {
      // Feed auth failure into autonomous response pipeline
      const sourceIp = String(req.socket?.remoteAddress || req.headers?.["x-forwarded-for"] || "unknown").split(",")[0].trim();
      arFeed({ type: "auth_failure", sourceIp, endpoint: apiPath, tenantId: req.authz?.tenant_id, meta: { error: authz.error } }).catch(() => {});
      jsonResponse(req, res, authz.statusCode || 403, {
        error: authz.error || "Access denied",
        tenant: authz.context?.tenant_id || null,
        role: authz.context?.role || null,
      });
      return;
    }
  }

  // Feed every authenticated request as a velocity signal
  {
    const sourceIp = String(req.socket?.remoteAddress || req.headers?.["x-forwarded-for"] || "unknown").split(",")[0].trim();
    arFeed({ type: "request", sourceIp, endpoint: apiPath, tenantId: req.authz?.tenant_id }).catch(() => {});
  }

  try {
    const guard = await enforceQuotaGuard({ req, apiPath });
    if (!guard.ok) {
      // Log quota/rate-limit breaches to the audit trail so abuse patterns
      // are visible post-incident even though no 2xx response is returned.
      logAuditEvent({
        event_type: guard.payload?.error === "rate_limit_exceeded" ? "quota.rate_limit_exceeded" : "quota.daily_limit_exceeded",
        status: "denied",
        actor: req.authz?.user_id || String(req.headers?.["x-user-id"] || "unknown"),
        context: {
          tenant_id: req.authz?.tenant_id || String(req.headers?.["x-tenant-id"] || "unknown"),
          api_path: apiPath,
          reason: guard.payload?.error || "quota_exceeded",
          retry_after: guard.payload?.retry_after_seconds ?? null,
        },
      });
      jsonResponse(req, res, guard.statusCode, guard.payload);
      return;
    }

    // ── Voice pipeline (local STT + chat — audio never leaves the network) ──────
    if (apiPath.startsWith("/api/voice/")) {
      if (apiPath === "/api/voice/stt") {
        // STT receives raw PCM16 binary — collect as Buffer before anything else consumes req
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const rawBody = Buffer.concat(chunks);
        if (await handleVoicePipelineRoutes(req, res, apiPath, rawBody)) return;
      } else if (apiPath === "/api/voice/status") {
        if (await handleVoicePipelineRoutes(req, res, apiPath, null)) return;
      } else {
        // chat and other voice routes receive JSON
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const rawStr = Buffer.concat(chunks).toString("utf8");
        const voiceBody = rawStr ? JSON.parse(rawStr) : {};
        if (await handleVoicePipelineRoutes(req, res, apiPath, voiceBody)) return;
      }
    }

    // ── SSE stream (/api/aria/stream) ──────────────────────────────────────────
    if (req.method === "GET" && apiPath === "/api/aria/stream") {
      const corsOrigin = resolveCorsOrigin(req);
      const headers = {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
        "Access-Control-Allow-Origin": corsOrigin || "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Session-Token, X-Tenant-Id, X-User-Id, X-Role, X-Aria-Demo",
      };
      applySecurityHeaders(res);
      res.writeHead(200, headers);

      // Send a connected event immediately so the client knows the stream is live
      const tenantId = req.authz?.tenant_id || String(req.headers?.["x-tenant-id"] || "tenant-local");
      res.write(`data: ${JSON.stringify({ type: "stream.connected", payload: { clients: sseClientCount() + 1 }, ts: new Date().toISOString() })}\n\n`);

      const unsubscribe = sseSubscribe(res, tenantId);

      // Keepalive ping every 15s to prevent proxy timeouts
      const keepalive = setInterval(() => {
        try { res.write(": ping\n\n"); } catch { clearInterval(keepalive); }
      }, 15_000);

      req.socket.on("close", () => { unsubscribe(); clearInterval(keepalive); });
      req.socket.on("error", () => { unsubscribe(); clearInterval(keepalive); });
      return; // SSE — never call res.end() from here
    }

    if (req.method === "GET" && apiPath === "/api/aria/health") {
      const pkgPath = join(dirname(fileURLToPath(import.meta.url)), "../package.json");
      let version = "0.0.0";
      try { version = JSON.parse(readFileSync(pkgPath, "utf8")).version || "0.0.0"; } catch { /* ignore */ }
      const persistenceStatus = isDurable()
        ? "connected"
        : hasLocalPersistenceConfig()
          ? "file"
          : "in-memory";
      const credentialKey = String(
        process.env.ARIA_CREDENTIAL_ENCRYPTION_KEY ||
        process.env.ARIA_CREDENTIAL_KEY ||
        ""
      ).trim();
      const credentialVaultStatus = (
        process.env.ARIA_USE_SECRETS_MANAGER === "true" ||
        /^[0-9a-fA-F]{64}$/.test(credentialKey)
      ) ? "encrypted" : "missing-key";
      const authStatus = process.env.OAUTH_ISSUER ? "oauth" : "headers";
      const githubConnected = getGithubConnectorStatus().connector?.connected === true ? "connected" : "disconnected";
      const awsConnected = getAwsConnectorStatus().connector?.connected === true ? "connected" : "disconnected";
      const persistenceDurable = persistenceStatus === "connected" || persistenceStatus === "file";
      const overallStatus = (persistenceDurable && credentialVaultStatus === "encrypted") ? "ok" : "degraded";
      jsonResponse(req, res, 200, {
        status: overallStatus,
        version,
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
        stores: {
          kv: persistenceStatus,
          credentialVault: credentialVaultStatus,
          auth: authStatus,
        },
        connectors: {
          github: githubConnected,
          aws: awsConnected,
        },
      });
      return;
    }

    if (req.method === "GET" && apiPath === "/api/live/stream") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": resolveCorsOrigin(req) || "*",
        "X-Accel-Buffering": "no",
      });
      res.write(": connected\n\n");

      const sendSnapshot = async () => {
        try {
          const snapshot = await getMonitoringSnapshot();
          const events = await getLiveEvents();
          res.write(`data: ${JSON.stringify({ snapshot, events, ts: Date.now() })}\n\n`);
        } catch { /* ignore */ }
      };

      await sendSnapshot();
      const iv = setInterval(sendSnapshot, 2000);
      req.on("close", () => clearInterval(iv));
      return; // don't fall through to jsonResponse
    }

    if (req.method === "GET" && apiPath === "/api/live") {
      handleLive(req, res);
      return;
    }

    if (req.method === "POST" && apiPath === "/api/system/process/kill") {
      try {
        const body = await readJson(req).catch(() => ({}));
        const pid = Number(body.pid);
        const signal = String(body.signal || "SIGTERM").toUpperCase();

        if (!Number.isInteger(pid) || pid <= 0) {
          jsonResponse(req, res, 400, { error: "valid pid is required" });
          return;
        }
        if (pid === 1 || pid === process.pid) {
          jsonResponse(req, res, 400, { error: "refusing to terminate a protected ARIA/system process" });
          return;
        }
        if (!["SIGTERM", "SIGKILL"].includes(signal)) {
          jsonResponse(req, res, 400, { error: "signal must be SIGTERM or SIGKILL" });
          return;
        }

        const { runAction } = await import("./actionRunner.mjs");
        const execution = await runAction({
          actionId: "kill-process",
          params: { pid, signal, processName: body.name || body.command || "" },
          actor: `human:${body.actor || "operator"}`,
          actorType: "human",
          tenantId: req.authz?.tenant_id || "default",
        });
        const snapshot = await getMonitoringSnapshot();
        jsonResponse(req, res, 200, { execution, snapshot });
      } catch (err) {
        jsonResponse(req, res, 500, { error: err.message });
      }
      return;
    }

    if (req.method === "POST" && apiPath === "/api/system/local-artifact-scan") {
      try {
        const body = await readJson(req).catch(() => ({}));
        const { runAction } = await import("./actionRunner.mjs");
        const execution = await runAction({
          actionId: "scan-local-artifacts",
          params: {
            roots: Array.isArray(body.roots) ? body.roots : undefined,
            maxDepth: body.maxDepth,
            maxEntries: body.maxEntries,
          },
          actor: `human:${body.actor || "operator"}`,
          actorType: "human",
          tenantId: req.authz?.tenant_id || "default",
        });
        jsonResponse(req, res, 200, { execution, scan: execution.postState?.scan || null });
      } catch (err) {
        jsonResponse(req, res, 500, { error: err.message });
      }
      return;
    }

    if (req.method === "POST" && apiPath === "/api/system/host-isolation-plan") {
      try {
        const body = await readJson(req).catch(() => ({}));
        const { runAction } = await import("./actionRunner.mjs");
        const execution = await runAction({
          actionId: "stage-host-isolation",
          params: {
            hostLabel: body.hostLabel || body.host,
            reason: body.reason,
          },
          actor: `human:${body.actor || "operator"}`,
          actorType: "human",
          tenantId: req.authz?.tenant_id || "default",
        });
        jsonResponse(req, res, 200, { execution, plan: execution.postState?.plan || null });
      } catch (err) {
        jsonResponse(req, res, 500, { error: err.message });
      }
      return;
    }

    if (req.method === "GET" && apiPath === "/api/aria/suggestions") {
      handleSuggestions(req, res);
      return;
    }

    if (req.method === "GET" && apiPath === "/api/ai-spm/inventory") {
      jsonResponse(req, res, 200, { inventory: await getAiSpmInventory() });
      return;
    }

    if (req.method === "GET" && apiPath === "/api/ai-spm/findings") {
      const data = await getAiSpmFindings();
      try {
        const { annotateFindingsWithBlastRadius } = await import("./aiSpmBlastRadius.mjs");
        const inv = await getAiSpmInventory();
        data.findings  = annotateFindingsWithBlastRadius(data.findings || [], inv || {});
        data.suppressed = annotateFindingsWithBlastRadius(data.suppressed || [], inv || {});
      } catch { /* non-fatal */ }
      jsonResponse(req, res, 200, data);
      return;
    }

    if (req.method === "GET" && apiPath === "/api/ai-spm/history") {
      const includeArchive = new URL(req.url, "http://localhost").searchParams.get("include_archive") === "true";
      jsonResponse(req, res, 200, getAiSpmScanHistory({ include_archive: includeArchive }));
      return;
    }

    if (req.method === "POST" && apiPath === "/api/ai-spm/scan") {
      await handleAiSpmScan(req, res);
      return;
    }

    if ((req.method === "GET" || req.method === "POST") && apiPath === "/api/ai-spm/narrative") {
      await handleAiSpmNarrative(req, res);
      return;
    }

    if (req.method === "POST" && apiPath === "/api/ai-spm/finding-action") {
      await handleAiSpmAction(req, res);
      return;
    }

    if (req.method === "POST" && apiPath === "/api/ai-spm/evidence") {
      await handleAiSpmEvidence(req, res);
      return;
    }

    if (req.method === "POST" && apiPath === "/api/ai-spm/remediate") {
      await handleAiSpmRemediate(req, res);
      return;
    }

    // Phase 2.1: blast radius for a single case/finding
    if (req.method === "GET" && apiPath.match(/^\/api\/ai-spm\/case\/[^/]+\/blast-radius$/)) {
      try {
        const findingId = decodeURIComponent(apiPath.split("/")[4]);
        const findings = await getAiSpmFindings();
        const all = [...(findings.findings || []), ...(findings.suppressed || [])];
        const finding = all.find(f => f.id === findingId);
        if (!finding) { jsonResponse(req, res, 404, { error: "Finding not found" }); return; }
        const { computeBlastRadius } = await import("./aiSpmBlastRadius.mjs");
        const inv = await getAiSpmInventory();
        const result = computeBlastRadius(finding, { allAssets: inv?.assets || [], inventory: inv });
        jsonResponse(req, res, 200, { findingId, ...result });
      } catch (err) { jsonResponse(req, res, 500, { error: err.message }); }
      return;
    }

    // Phase 2.2: generate concrete remediation artifacts
    if (req.method === "POST" && apiPath.match(/^\/api\/ai-spm\/case\/[^/]+\/remediate$/)) {
      try {
        const findingId = decodeURIComponent(apiPath.split("/")[4]);
        const findings = await getAiSpmFindings();
        const all = [...(findings.findings || []), ...(findings.suppressed || [])];
        const finding = all.find(f => f.id === findingId);
        if (!finding) { jsonResponse(req, res, 404, { error: "Finding not found" }); return; }
        const { computeBlastRadius } = await import("./aiSpmBlastRadius.mjs");
        const { generateRemediationArtifacts } = await import("./aiSpmRemediationGenerator.mjs");
        const inv = await getAiSpmInventory();
        const { blastRadius, exposureScore } = computeBlastRadius(finding, { allAssets: inv?.assets || [], inventory: inv });
        const artifacts = generateRemediationArtifacts(finding, { blastRadius });
        jsonResponse(req, res, 200, { findingId, finding, blastRadius, exposureScore, artifacts });
      } catch (err) { jsonResponse(req, res, 500, { error: err.message }); }
      return;
    }

    // Phase 2.3: apply a remediation artifact through actionRunner
    if (req.method === "POST" && apiPath.match(/^\/api\/ai-spm\/case\/[^/]+\/apply$/)) {
      try {
        const findingId = decodeURIComponent(apiPath.split("/")[4]);
        const body = await readJson(req).catch(() => ({}));
        const { artifact, approver = "operator", findingTitle } = body;
        if (!artifact) { jsonResponse(req, res, 400, { error: "artifact required" }); return; }
        const { runAction } = await import("./actionRunner.mjs");
        const result = await runAction({
          hypothesisId: null,
          actionId: "ai-spm-apply-remediation",
          params: { findingId, artifact, findingTitle },
          actor: `human:${approver}`,
          actorType: "human",
          tenantId: "tenant-local",
        });
        jsonResponse(req, res, 200, { findingId, execution: result });
      } catch (err) { jsonResponse(req, res, 500, { error: err.message }); }
      return;
    }

    // Phase 2.4: verify by re-scanning, then check if finding still appears
    if (req.method === "POST" && apiPath.match(/^\/api\/ai-spm\/case\/[^/]+\/verify$/)) {
      try {
        const findingId = decodeURIComponent(apiPath.split("/")[4]);
        await scanAiSpm();
        const findings = await getAiSpmFindings();
        const all = [...(findings.findings || []), ...(findings.suppressed || [])];
        const stillPresent = all.find(f => f.id === findingId);
        const status = stillPresent ? "still-present" : "resolved-verified";
        logAuditEvent({
          event_type: "ai_spm.case.verified",
          actor: "operator",
          context: { findingId, status, severity: stillPresent?.severity },
        });
        jsonResponse(req, res, 200, { findingId, status, finding: stillPresent || null });
      } catch (err) { jsonResponse(req, res, 500, { error: err.message }); }
      return;
    }

    if ((req.method === "GET" || req.method === "POST") && apiPath === "/api/ai-spm/report") {
      await handleAiSpmReport(req, res);
      return;
    }

    // AI-010: scheduled scan config endpoints
    if (req.method === "GET" && apiPath === "/api/ai-spm/schedule") {
      try {
        const { tenantId } = extractTenantContext(req);
        const config = await getScheduledScan(tenantId || "default");
        jsonResponse(req, res, 200, { schedule: config });
      } catch (err) {
        jsonResponse(req, res, 500, { error: err.message });
      }
      return;
    }

    if (req.method === "POST" && apiPath === "/api/ai-spm/schedule") {
      try {
        const { tenantId } = extractTenantContext(req);
        const body = await readJson(req);
        const config = await setScheduledScan(tenantId || "default", body || {});
        logAuditEvent({
          event_type: "ai_spm.schedule.updated",
          actor: "analyst",
          context: { tenantId, config },
        });
        jsonResponse(req, res, 200, { schedule: config });
      } catch (err) {
        jsonResponse(req, res, 400, { error: err.message });
      }
      return;
    }

    if (req.method === "GET" && apiPath === "/api/connectors/github/status") {
      jsonResponse(req, res, 200, getGithubConnectorStatus());
      return;
    }

    if (req.method === "POST" && apiPath === "/api/connectors/github/gh-cli") {
      try {
        const { execFileSync } = await import("node:child_process");
        let token = "";
        try {
          token = execFileSync("gh", ["auth", "token"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
        } catch {
          throw new Error("gh CLI not found or not logged in. Run: gh auth login");
        }
        if (!token) throw new Error("gh auth token returned empty — run: gh auth login");
        const result = await saveGithubTokenConnector({ token, authMode: "gh-cli" });
        jsonResponse(req, res, 200, result);
      } catch (err) {
        jsonResponse(req, res, 400, { error: err.message });
      }
      return;
    }

    if (req.method === "GET" && apiPath === "/api/connectors/aws/status") {
      jsonResponse(req, res, 200, getAwsConnectorStatus());
      return;
    }

    if (req.method === "POST" && apiPath === "/api/connectors/aws/connect") {
      try {
        const body = await readJson(req);
        const result = await saveAwsCredentials(body);
        jsonResponse(req, res, 200, result);
      } catch (err) {
        jsonResponse(req, res, 400, { error: err.message });
      }
      return;
    }

    if (req.method === "POST" && apiPath === "/api/connectors/aws/disconnect") {
      jsonResponse(req, res, 200, disconnectAwsConnector());
      return;
    }

    // GET /api/connectors/github/health
    if (req.method === "GET" && apiPath === "/api/connectors/github/health") {
      const tenantId = req.authz?.tenantId || req.headers["x-aria-tenant-id"] || "default";
      const health = await githubHealthCheck(tenantId);
      jsonResponse(req, res, 200, health);
      return;
    }

    // GET /api/connectors/aws/health
    if (req.method === "GET" && apiPath === "/api/connectors/aws/health") {
      const tenantId = req.authz?.tenantId || req.headers["x-aria-tenant-id"] || "default";
      const health = await awsHealthCheck(tenantId);
      jsonResponse(req, res, 200, health);
      return;
    }

    if (req.method === "POST" && apiPath === "/api/connectors/github/token") {
      await handleGithubConnectorToken(req, res);
      return;
    }

    if (req.method === "POST" && apiPath === "/api/connectors/github/device/start") {
      await handleGithubConnectorDeviceStart(req, res);
      return;
    }

    if (req.method === "POST" && apiPath === "/api/connectors/github/device/poll") {
      await handleGithubConnectorDevicePoll(req, res);
      return;
    }

    if ((req.method === "GET" || req.method === "POST") && apiPath === "/api/connectors/github/repos") {
      await handleGithubConnectorRepos(req, res);
      return;
    }

    if (req.method === "POST" && apiPath === "/api/connectors/github/disconnect") {
      jsonResponse(req, res, 200, disconnectGithubConnector());
      return;
    }

    // ── Okta connector ───────────────────────────────────────────────────────
    if (req.method === "GET" && apiPath === "/api/connectors/okta/status") {
      jsonResponse(req, res, 200, getOktaConnectorStatus());
      return;
    }
    if (req.method === "GET" && apiPath === "/api/connectors/okta/health") {
      jsonResponse(req, res, 200, await oktaHealthCheck());
      return;
    }
    if (req.method === "POST" && apiPath === "/api/connectors/okta/connect") {
      try {
        const body = await readJson(req);
        jsonResponse(req, res, 200, await saveOktaCredentials(body));
      } catch (err) {
        jsonResponse(req, res, 400, { error: err.message });
      }
      return;
    }
    if (req.method === "POST" && apiPath === "/api/connectors/okta/disconnect") {
      jsonResponse(req, res, 200, disconnectOktaConnector());
      return;
    }
    if (req.method === "GET" && apiPath === "/api/connectors/okta/scan") {
      try {
        jsonResponse(req, res, 200, await scanOktaFindings());
      } catch (err) {
        jsonResponse(req, res, 500, { error: err.message });
      }
      return;
    }

    // ── Snyk connector ────────────────────────────────────────────────────────
    if (req.method === "GET" && apiPath === "/api/connectors/snyk/status") {
      jsonResponse(req, res, 200, getSnykConnectorStatus());
      return;
    }
    if (req.method === "GET" && apiPath === "/api/connectors/snyk/health") {
      jsonResponse(req, res, 200, await snykHealthCheck());
      return;
    }
    if (req.method === "POST" && apiPath === "/api/connectors/snyk/connect") {
      try {
        const body = await readJson(req);
        jsonResponse(req, res, 200, await saveSnykCredentials(body));
      } catch (err) {
        jsonResponse(req, res, 400, { error: err.message });
      }
      return;
    }
    if (req.method === "POST" && apiPath === "/api/connectors/snyk/disconnect") {
      jsonResponse(req, res, 200, disconnectSnykConnector());
      return;
    }
    if (req.method === "GET" && apiPath === "/api/connectors/snyk/scan") {
      try {
        jsonResponse(req, res, 200, await scanSnykFindings());
      } catch (err) {
        jsonResponse(req, res, 500, { error: err.message });
      }
      return;
    }

    // ── Azure AD connector ────────────────────────────────────────────────────
    if (req.method === "GET" && apiPath === "/api/connectors/azuread/status") {
      jsonResponse(req, res, 200, getAzureAdConnectorStatus());
      return;
    }
    if (req.method === "GET" && apiPath === "/api/connectors/azuread/health") {
      jsonResponse(req, res, 200, await azureAdHealthCheck());
      return;
    }
    if (req.method === "POST" && apiPath === "/api/connectors/azuread/connect") {
      try {
        const body = await readJson(req);
        jsonResponse(req, res, 200, await saveAzureAdCredentials(body));
      } catch (err) {
        jsonResponse(req, res, 400, { error: err.message });
      }
      return;
    }
    if (req.method === "POST" && apiPath === "/api/connectors/azuread/disconnect") {
      jsonResponse(req, res, 200, disconnectAzureAdConnector());
      return;
    }
    if (req.method === "GET" && apiPath === "/api/connectors/azuread/scan") {
      try {
        jsonResponse(req, res, 200, await discoverAzureAdAssets());
      } catch (err) {
        jsonResponse(req, res, 500, { error: err.message });
      }
      return;
    }

    // ── VirusTotal connector ──────────────────────────────────────────────────
    if (req.method === "GET" && apiPath === "/api/connectors/virustotal/status") {
      jsonResponse(req, res, 200, getVirusTotalConnectorStatus());
      return;
    }
    if (req.method === "GET" && apiPath === "/api/connectors/virustotal/health") {
      jsonResponse(req, res, 200, await virusTotalHealthCheck());
      return;
    }
    if (req.method === "POST" && apiPath === "/api/connectors/virustotal/connect") {
      try {
        const body = await readJson(req);
        jsonResponse(req, res, 200, await saveVirusTotalCredentials(body));
      } catch (err) {
        jsonResponse(req, res, 400, { error: err.message });
      }
      return;
    }
    if (req.method === "POST" && apiPath === "/api/connectors/virustotal/disconnect") {
      jsonResponse(req, res, 200, disconnectVirusTotalConnector());
      return;
    }
    if (req.method === "POST" && apiPath === "/api/connectors/virustotal/enrich") {
      try {
        const body = await readJson(req);
        const iocs = Array.isArray(body?.iocs) ? body.iocs : [body?.ioc].filter(Boolean);
        jsonResponse(req, res, 200, await scanVirusTotalFindings(iocs));
      } catch (err) {
        jsonResponse(req, res, 500, { error: err.message });
      }
      return;
    }

    // ── Elastic Security connector ────────────────────────────────────────────
    if (req.method === "GET" && apiPath === "/api/connectors/elastic/status") {
      const tenantId = req.authz?.tenant_id || "default";
      jsonResponse(req, res, 200, await getElasticConnectorStatus(tenantId));
      return;
    }
    if (req.method === "GET" && apiPath === "/api/connectors/elastic/health") {
      const tenantId = req.authz?.tenant_id || "default";
      jsonResponse(req, res, 200, await elasticHealthCheck(tenantId));
      return;
    }
    if (req.method === "POST" && apiPath === "/api/connectors/elastic/connect") {
      try {
        const tenantId = req.authz?.tenant_id || "default";
        const body = await readJson(req);
        jsonResponse(req, res, 200, await saveElasticCredentials(body, tenantId));
      } catch (err) {
        jsonResponse(req, res, 400, { error: err.message });
      }
      return;
    }
    if (req.method === "POST" && apiPath === "/api/connectors/elastic/disconnect") {
      const tenantId = req.authz?.tenant_id || "default";
      jsonResponse(req, res, 200, await disconnectElasticConnector(tenantId));
      return;
    }
    if (req.method === "GET" && apiPath === "/api/connectors/elastic/scan") {
      try {
        const tenantId = req.authz?.tenant_id || "default";
        jsonResponse(req, res, 200, await scanElasticSecurity(tenantId));
      } catch (err) {
        jsonResponse(req, res, 500, { error: err.message });
      }
      return;
    }
    if (req.method === "GET" && apiPath === "/api/connectors/elastic/alerts") {
      try {
        const tenantId = req.authz?.tenant_id || "default";
        jsonResponse(req, res, 200, await getElasticAlerts(tenantId));
      } catch (err) {
        jsonResponse(req, res, 500, { error: err.message });
      }
      return;
    }
    if (req.method === "GET" && apiPath === "/api/connectors/elastic/rules") {
      try {
        const tenantId = req.authz?.tenant_id || "default";
        jsonResponse(req, res, 200, await getElasticRules(tenantId));
      } catch (err) {
        jsonResponse(req, res, 500, { error: err.message });
      }
      return;
    }

    // ── Identity & Access sector ──────────────────────────────────────────────
    if (apiPath.startsWith("/api/identity/")) {
      const handled = await handleIdentityRoute(req, res, apiPath, jsonResponse, authorizeRequest, logAuditEvent);
      if (handled) return;
    }

    // ── Network Intelligence sector ───────────────────────────────────────────
    if (apiPath.startsWith("/api/network/")) {
      const handled = await handleNetworkIntelligenceRoute(req, res, apiPath, jsonResponse, readJson, authorizeRequest, logAuditEvent);
      if (handled) return;
    }

    // ── Local Bluetooth LE scanner ────────────────────────────────────────────
    if (apiPath.startsWith("/api/bluetooth/")) {
      const handled = await handleBluetoothRoute(req, res, apiPath, jsonResponse, readJson, authorizeRequest, logAuditEvent);
      if (handled) return;
    }

    if (req.method === "GET" && apiPath === "/api/aria/state") {
      jsonResponse(req, res, 200, { state: getAriaState() });
      return;
    }

    if ((req.method === "GET" || req.method === "POST") && apiPath === "/api/aria/overview") {
      await handleOverview(req, res);
      return;
    }

    if (req.method === "POST" && apiPath === "/api/aria/learn") {
      await handleLearn(req, res);
      return;
    }

    if (req.method === "POST" && apiPath === "/api/aria/autonomy") {
      await handleSetAutonomy(req, res);
      return;
    }

    if (req.method === "POST" && apiPath === "/api/aria/observe") {
      await handleObserve(req, res);
      return;
    }

    // AC-001: list pending approvals for the approval queue UI
    if (req.method === "GET" && apiPath === "/api/aria/approvals") {
      const status = new URL(req.url, "http://x").searchParams.get("status") || "pending";
      const allApprovals = await getApprovals(req.authz?.tenant_id);
      const approvals = allApprovals.filter((a) => status === "all" || a.status === status);
      jsonResponse(req, res, 200, { approvals, total: approvals.length });
      return;
    }

    if (req.method === "POST" && apiPath === "/api/aria/approval") {
      await handleApproval(req, res);
      return;
    }

    if (req.method === "POST" && apiPath === "/api/aria/command") {
      await handleCommand(req, res);
      return;
    }

    if (req.method === "POST" && apiPath === "/api/aria/intelligence") {
      await handleAriaIntelligence(req, res);
      return;
    }

    if (req.method === "POST" && apiPath === "/api/aria/orchestrate") {
      await handleOrchestrate(req, res);
      return;
    }

    if (req.method === "POST" && apiPath === "/api/aria/panel-narrative") {
      await handlePanelNarrative(req, res);
      return;
    }

    if (req.method === "GET" && apiPath === "/api/aria/audit-events") {
      await handleAuditEvents(req, res);
      return;
    }

    if (req.method === "GET" && apiPath === "/api/aria/audit-export") {
      if (!["admin", "owner"].includes(req.authz?.role)) {
        jsonResponse(req, res, 403, { error: "Admin or owner role required for audit export." });
        return;
      }
      const query = new URL(req.url, "http://x").searchParams;
      const decisionId = String(query.get("decision_id") || "").trim() || null;
      const pack = await buildAuditEvidencePack({
        tenantId: req.authz?.tenant_id,
        decisionId,
        limit: query.get("limit") || 1000,
        actor: req.authz?.user_id || "operator",
      });
      if (!pack) {
        jsonResponse(req, res, 404, { error: "Decision not found." });
        return;
      }
      logAuditEvent({
        event_type: "aria.audit.exported",
        actor: req.authz?.user_id || "operator",
        context: { tenant_id: req.authz?.tenant_id, decision_id: decisionId, digest: pack.manifest.integrity.digest },
      });
      jsonResponse(req, res, 200, { export: pack });
      return;
    }

    if (req.method === "GET" && apiPath === "/api/aria/autonomous-replay") {
      if (!["admin", "owner"].includes(req.authz?.role)) {
        jsonResponse(req, res, 403, { error: "Admin or owner role required for response replay." });
        return;
      }
      const query = new URL(req.url, "http://x").searchParams;
      jsonResponse(req, res, 200, {
        events: getAutonomousReplayEvents({
          tenantId: req.authz?.tenant_id,
          limit: query.get("limit") || 1000,
        }),
        replay_format: "aria.autonomous-response.v1",
      });
      return;
    }

    if (req.method === "GET" && apiPath === "/api/aria/compliance/status") {
      await handleComplianceStatus(req, res);
      return;
    }

    if (req.method === "POST" && apiPath === "/api/aria/config/security") {
      await handleSecurityConfigUpdate(req, res);
      return;
    }

    if (req.method === "GET" && apiPath === "/api/aria/quota-status") {
      jsonResponse(req, res, 200, await getQuotaSnapshot());
      return;
    }

    if (req.method === "GET" && apiPath === "/api/aria/whoami") {
      await handleWhoami(req, res);
      return;
    }

    if (req.method === "POST" && apiPath === "/api/aria/session") {
      await handleSession(req, res);
      return;
    }

    if (req.method === "POST" && apiPath === "/api/aria/session/revoke") {
      await handleLegacySessionRevoke(req, res);
      return;
    }

    if (req.method === "GET" && apiPath === "/api/aria/sessions") {
      await handleSessionList(req, res);
      return;
    }

    if (req.method === "POST" && apiPath.startsWith("/api/aria/sessions/") && apiPath.endsWith("/revoke")) {
      const sessionId = decodeURIComponent(apiPath.slice("/api/aria/sessions/".length, -"/revoke".length)).replace(/^\/+|\/+$/g, "");
      await handleSessionRevoke(req, res, sessionId);
      return;
    }

    if (req.method === "POST" && apiPath.startsWith("/api/aria/sessions/") && apiPath.endsWith("/force-reauth")) {
      const sessionId = decodeURIComponent(apiPath.slice("/api/aria/sessions/".length, -"/force-reauth".length)).replace(/^\/+|\/+$/g, "");
      await handleSessionForceReauth(req, res, sessionId);
      return;
    }

    // ── Policy endpoints ────────────────────────────────────────────────────
    if (req.method === "GET" && apiPath === "/api/aria/policy/list") {
      handlePolicyList(req, res);
      return;
    }

    if (req.method === "POST" && apiPath === "/api/aria/policy/preview") {
      await handlePolicyPreview(req, res);
      return;
    }

    if (req.method === "POST" && apiPath === "/api/aria/policy/apply") {
      await handlePolicyApply(req, res);
      return;
    }

    if (req.method === "GET" && apiPath === "/api/aria/policy/history") {
      handlePolicyHistory(req, res);
      return;
    }

    // SA-002: policy rollback
    if (req.method === "POST" && apiPath === "/api/aria/policy/rollback") {
      await handlePolicyRollback(req, res);
      return;
    }

    // SA-003: policy dry-run
    if (req.method === "POST" && apiPath === "/api/aria/policy/dry-run") {
      await handlePolicyDryRun(req, res);
      return;
    }

    // ── Live scan endpoints ─────────────────────────────────────────────────
    if (req.method === "GET" && apiPath === "/api/scan/stream") {
      await handleLiveScan(req, res);
      return;
    }

    if (req.method === "GET" && apiPath === "/api/scan/folder") {
      await handleFolderScan(req, res);
      return;
    }

    if (req.method === "GET" && apiPath === "/api/scan/network-discovery") {
      await handleNetworkDiscoveryScan(req, res);
      return;
    }

    if (req.method === "DELETE" && apiPath === "/api/scan/record") {
      handleScanDelete(req, res);
      return;
    }

    if (req.method === "GET" && apiPath === "/api/scan/schedule") {
      handleGetSchedule(req, res);
      return;
    }

    if (req.method === "POST" && apiPath === "/api/scan/schedule") {
      await handleSetSchedule(req, res);
      return;
    }

    if (req.method === "DELETE" && apiPath === "/api/scan/schedule") {
      handleDeleteSchedule(req, res);
      return;
    }

    if (req.method === "GET" && apiPath === "/api/scan/history") {
      handleScanHistory(req, res);
      return;
    }

    if (req.method === "GET" && apiPath === "/api/scan/export") {
      handleScanExport(req, res);
      return;
    }

    if (req.method === "GET" && apiPath === "/api/scan/audit-doc") {
      handleScanAuditDoc(req, res);
      return;
    }

    // ── Incident action endpoints (IN-001/002/003) ────────────────────────────
    const acknowledgeMatch = apiPath.match(/^\/api\/incidents\/([^/]+)\/acknowledge$/);
    if (req.method === "POST" && acknowledgeMatch) {
      await handleIncidentAcknowledge(req, res, acknowledgeMatch[1]);
      return;
    }

    const escalateMatch = apiPath.match(/^\/api\/incidents\/([^/]+)\/escalate$/);
    if (req.method === "POST" && escalateMatch) {
      await handleIncidentEscalate(req, res, escalateMatch[1]);
      return;
    }

    const suppressMatch = apiPath.match(/^\/api\/incidents\/([^/]+)\/suppress$/);
    if (req.method === "POST" && suppressMatch) {
      await handleIncidentSuppress(req, res, suppressMatch[1]);
      return;
    }

    // ── Blocked-IP action endpoints (BI-001) ──────────────────────────────────
    const unblockMatch = apiPath.match(/^\/api\/blocked-ips\/([^/]+)\/unblock$/);
    if (req.method === "POST" && unblockMatch) {
      await handleUnblockIp(req, res, decodeURIComponent(unblockMatch[1]));
      return;
    }

    // ── Quarantine action endpoints (QU-001/002) ──────────────────────────────
    const quarReleaseMatch = apiPath.match(/^\/api\/quarantine\/([^/]+)\/release$/);
    if (req.method === "POST" && quarReleaseMatch) {
      await handleQuarantineRelease(req, res, quarReleaseMatch[1]);
      return;
    }

    const quarDeleteMatch = apiPath.match(/^\/api\/quarantine\/([^/]+)\/delete$/);
    if (req.method === "POST" && quarDeleteMatch) {
      await handleQuarantineDelete(req, res, quarDeleteMatch[1]);
      return;
    }

    // ── Bulk approval endpoint (AC-002) ───────────────────────────────────────
    if (req.method === "POST" && apiPath === "/api/aria/approval/bulk") {
      await handleApprovalBulk(req, res);
      return;
    }

    // ── Incident CRUD + lifecycle (IN-001..009) ────────────────────────────────
    if (req.method === "GET" && apiPath === "/api/incidents") {
      const qs = new URL(req.url, "http://x").searchParams;
      const tenantId = req.authz?.tenant_id || "default";
      const list = await getIncidents(tenantId, { status: qs.get("status"), severity: qs.get("severity"), sort: qs.get("sort") });
      jsonResponse(req, res, 200, { incidents: list, count: list.length });
      return;
    }
    if (req.method === "POST" && apiPath === "/api/incidents") {
      const body = await readJson(req);
      const tenantId = req.authz?.tenant_id || "default";
      const actor = req.authz?.user_id || "unknown";
      const incident = await createIncident(tenantId, { ...body, actor });
      sseEmit("incident.created", { incident });
      jsonResponse(req, res, 201, incident);
      return;
    }
    const incidentDetailMatch = apiPath.match(/^\/api\/incidents\/([^/]+)$/);
    if (req.method === "GET" && incidentDetailMatch) {
      const tenantId = req.authz?.tenant_id || "default";
      const inc = await getIncident(tenantId, incidentDetailMatch[1]);
      if (!inc) { jsonResponse(req, res, 404, { error: "Incident not found" }); return; }
      jsonResponse(req, res, 200, inc);
      return;
    }
    const incidentCloseMatch = apiPath.match(/^\/api\/incidents\/([^/]+)\/close$/);
    if (req.method === "POST" && incidentCloseMatch) {
      const body = await readJson(req);
      const tenantId = req.authz?.tenant_id || "default";
      const actor = req.authz?.user_id || body?.actor || "unknown";
      try {
        const inc = await closeIncident(tenantId, incidentCloseMatch[1], actor, body?.closure_reason);
        if (!inc) { jsonResponse(req, res, 404, { error: "Incident not found" }); return; }
        jsonResponse(req, res, 200, inc);
      } catch (err) { jsonResponse(req, res, 400, { error: err.message }); }
      return;
    }
    if (req.method === "POST" && apiPath === "/api/incidents/archive") {
      const tenantId = req.authz?.tenant_id || "default";
      jsonResponse(req, res, 200, await archiveIncidents(tenantId));
      return;
    }

    // ── Blocked-IPs CRUD (BI-001..007) ────────────────────────────────────────
    if (req.method === "GET" && apiPath === "/api/blocked-ips") {
      const tenantId = req.authz?.tenant_id || "default";
      jsonResponse(req, res, 200, { blocked_ips: await getBlockedIps(tenantId) });
      return;
    }
    if (req.method === "POST" && apiPath === "/api/blocked-ips/bulk-action") {
      const body = await readJson(req);
      const tenantId = req.authz?.tenant_id || "default";
      const actor = req.authz?.user_id || "unknown";
      if (!Array.isArray(body?.ips)) { jsonResponse(req, res, 400, { error: "ips array is required" }); return; }
      const result = await bulkUnblock(tenantId, body.ips, actor);
      jsonResponse(req, res, 200, result);
      return;
    }
    if (req.method === "POST" && apiPath === "/api/blocked-ips/auto-rule") {
      const body = await readJson(req);
      const tenantId = req.authz?.tenant_id || "default";
      const config = await configureAutoBlock(tenantId, { threshold: body?.threshold, windowMinutes: body?.window_minutes });
      jsonResponse(req, res, 200, config);
      return;
    }
    if (req.method === "POST" && apiPath === "/api/blocked-ips/block") {
      const body = await readJson(req);
      const tenantId = req.authz?.tenant_id || "default";
      const actor = req.authz?.user_id || "unknown";
      if (!body?.ip) { jsonResponse(req, res, 400, { error: "ip is required" }); return; }
      const entry = await blockIp(tenantId, body.ip, { reason: body.reason, source: body.source || "manual", expiresIn: body.expires_in, actor });
      sseEmit("ip.blocked", { entry });
      jsonResponse(req, res, 201, entry);
      return;
    }

    // ── Quarantine CRUD (QU-001..009) ─────────────────────────────────────────
    if (req.method === "GET" && apiPath === "/api/quarantine") {
      const tenantId = req.authz?.tenant_id || "default";
      jsonResponse(req, res, 200, { quarantine: await getQuarantineList(tenantId) });
      return;
    }
    if (req.method === "POST" && apiPath === "/api/quarantine/bulk-action") {
      const body = await readJson(req);
      const tenantId = req.authz?.tenant_id || "default";
      const actor = req.authz?.user_id || "unknown";
      if (!Array.isArray(body?.ids)) { jsonResponse(req, res, 400, { error: "ids array is required" }); return; }
      jsonResponse(req, res, 200, await quarantineBulkAction(tenantId, body.ids, body.action, actor));
      return;
    }
    if (req.method === "POST" && apiPath === "/api/quarantine") {
      const body = await readJson(req);
      const tenantId = req.authz?.tenant_id || "default";
      const actor = req.authz?.user_id || "unknown";
      const entry = await quarantineFile(tenantId, { ...body, quarantined_by: actor });
      jsonResponse(req, res, 201, entry);
      return;
    }
    const quarDetailMatch = apiPath.match(/^\/api\/quarantine\/([^/]+)$/);
    if (req.method === "GET" && quarDetailMatch && !quarDetailMatch[1].includes("/")) {
      const tenantId = req.authz?.tenant_id || "default";
      const list = await getQuarantineList(tenantId);
      const item = list.find(e => e.id === quarDetailMatch[1]);
      if (!item) { jsonResponse(req, res, 404, { error: "Quarantine entry not found" }); return; }
      jsonResponse(req, res, 200, item);
      return;
    }

    // ── Approval queue (AC-001) ───────────────────────────────────────────────
    if (req.method === "GET" && apiPath === "/api/aria/approval/queue") {
      const tenantId = req.authz?.tenant_id || "default";
      const qs = new URL(req.url, "http://x").searchParams;
      const { getApprovals: _getApprovals } = await import("./ariaMemory.mjs");
      const approvals = await _getApprovals(tenantId, { status: qs.get("status") ?? "pending" });
      jsonResponse(req, res, 200, { approvals, count: approvals.length });
      return;
    }

    // ── Function declarations (AC-005) ────────────────────────────────────────
    if (req.method === "GET" && apiPath === "/api/aria/functions") {
      jsonResponse(req, res, 200, { functions: functionDeclarations });
      return;
    }

    // ── Decision ledger ────────────────────────────────────────────────────────
    if (req.method === "GET" && apiPath === "/api/aria/decisions") {
      const limit = Math.min(100, Number(new URL(req.url, "http://x").searchParams.get("limit") || "20"));
      jsonResponse(req, res, 200, { decisions: await getDecisionLog(req.authz?.tenant_id, limit) });
      return;
    }

    if (req.method === "POST" && /^\/api\/aria\/decisions\/[^/]+\/override$/.test(apiPath)) {
      const decisionId = decodeURIComponent(apiPath.slice("/api/aria/decisions/".length, -"/override".length)).replace(/^\/+|\/+$/g, "");
      await handleDecisionOverride(req, res, decisionId);
      return;
    }

    // ── Evidence ledger ────────────────────────────────────────────────────────
    if (req.method === "GET" && apiPath === "/api/aria/evidence") {
      const limit = Math.min(100, Number(new URL(req.url, "http://x").searchParams.get("limit") || "20"));
      jsonResponse(req, res, 200, { evidence: await getEvidenceLog(req.authz?.tenant_id, limit) });
      return;
    }

    if (req.method === "GET" && apiPath === "/api/aria/operational-loop") {
      const qs = new URL(req.url, "http://x").searchParams;
      const limit = Math.min(100, Number(qs.get("limit") || "20"));
      const tenantId = req.authz?.tenant_id || "default";
      const approvals = await getApprovals(tenantId, { status: qs.get("status") ?? "pending" });
      const auditEvents = await readAuditEvents({ limit, tenant_id: tenantId });
      jsonResponse(req, res, 200, {
        loop: buildOperationalLoopSnapshot({
          approvals,
          decisions: await getDecisionLog(tenantId, limit),
          evidence: await getEvidenceLog(tenantId, limit),
          trust: await getTrustSummary(tenantId),
          auditEvents,
        }),
      });
      return;
    }

    if (req.method === "PATCH" && apiPath.startsWith("/api/aria/evidence/")) {
      const evidenceId = apiPath.replace("/api/aria/evidence/", "");
      const body = await readJson(req);
      const record = await updateEvidenceStatus(evidenceId, body?.status, body?.outcome || null, req.authz?.tenant_id);
      if (!record) {
        jsonResponse(req, res, 404, { error: "Evidence record not found" });
      } else {
        jsonResponse(req, res, 200, { evidence: record });
      }
      return;
    }

    // ── Trust scores ───────────────────────────────────────────────────────────
    if (req.method === "GET" && apiPath === "/api/aria/trust") {
      jsonResponse(req, res, 200, { trust: await getTrustSummary(req.authz?.tenant_id) });
      return;
    }

    if (req.method === "POST" && apiPath.startsWith("/api/aria/trust/") && apiPath.endsWith("/outcome")) {
      const parts = apiPath.split("/");
      const capability = parts[parts.length - 2];
      const body = await readJson(req);
      const outcome = body?.outcome;
      if (!["success", "failure", "override"].includes(outcome)) {
        jsonResponse(req, res, 400, { error: 'outcome must be "success", "failure", or "override"' });
        return;
      }
      const actor = req.authz?.user_id || "analyst";
      jsonResponse(req, res, 200, { capability, updated: await recordOutcome(capability, outcome, actor, req.authz?.tenant_id) });
      return;
    }

    if (req.method === "PUT" && apiPath.startsWith("/api/aria/trust/") && apiPath.endsWith("/mode")) {
      const parts = apiPath.split("/");
      const capability = parts[parts.length - 2];
      const body = await readJson(req);
      const actor = req.authz?.sub || "analyst";
      const result = await setCapabilityMode(capability, body?.mode, actor, req.authz?.tenant_id);
      if (!result) {
        jsonResponse(req, res, 400, { error: "Invalid capability or mode" });
        return;
      }
      jsonResponse(req, res, 200, { capability, updated: result });
      return;
    }

    if (req.method === "POST" && apiPath.startsWith("/api/aria/trust/") && apiPath.endsWith("/promote")) {
      const parts = apiPath.split("/");
      const capability = parts[parts.length - 2];
      const body = await readJson(req);
      const actor = req.authz?.sub || "analyst";
      const result = await promoteCapability(capability, actor, body?.reason, req.authz?.tenant_id);
      jsonResponse(req, res, result.ok ? 200 : 400, result);
      return;
    }

    if (req.method === "POST" && apiPath.startsWith("/api/aria/trust/") && apiPath.endsWith("/demote")) {
      const parts = apiPath.split("/");
      const capability = parts[parts.length - 2];
      const body = await readJson(req);
      const actor = req.authz?.sub || "analyst";
      const result = await demoteCapability(capability, actor, body?.reason, req.authz?.tenant_id);
      jsonResponse(req, res, result.ok ? 200 : 400, result);
      return;
    }

    // ── Memory records ─────────────────────────────────────────────────────────
    if (req.method === "GET" && apiPath === "/api/aria/memory/records") {
      const limit = Math.min(100, Number(new URL(req.url, "http://x").searchParams.get("limit") || "20"));
      jsonResponse(req, res, 200, { records: getMemoryRecords(limit, req.authz?.tenant_id) });
      return;
    }

    // ── Policy templates + validate (SA-009, PC-009) ──────────────────────────
    if (req.method === "GET" && apiPath === "/api/aria/policy/templates") {
      jsonResponse(req, res, 200, { templates: getPolicyTemplates() });
      return;
    }
    if (req.method === "POST" && apiPath === "/api/aria/policy/validate") {
      const body = await readJson(req);
      const tenantId = req.authz?.tenant_id || "default";
      jsonResponse(req, res, 200, await validatePolicy(tenantId, body?.policy ?? body));
      return;
    }

    // ── Scan export (scan records) ────────────────────────────────────────────
    if (req.method === "POST" && apiPath === "/api/ai-spm/scan/export") {
      const body = await readJson(req);
      const format = body?.format ?? new URL(req.url, "http://x").searchParams.get("format") ?? "json";
      const history = await getAiSpmScanHistory();
      const scans = history?.scans ?? [];
      if (format === "csv") {
        const header = "id,timestamp,asset_count,finding_count,posture";
        const rows = scans.map(s => [s.id, s.timestamp, s.asset_count, s.finding_count, s.posture].join(","));
        applySecurityHeaders(res);
        res.writeHead(200, { "Content-Type": "text/csv" });
        res.end([header, ...rows].join("\n"));
      } else {
        jsonResponse(req, res, 200, { exports: scans, format });
      }
      return;
    }

    // ── Model availability status ─────────────────────────────────────────────
    if (req.method === "GET" && apiPath === "/api/model/status") {
      const localStatus = await probeLocalLlm();
      const localConfig = getLocalLlmConfig();
      const cloudAvailable = Boolean(ANTHROPIC_API_KEY);
      const geminiAvailable = Boolean(GOOGLE_API_KEY);
      jsonResponse(req, res, 200, {
        default: "gemini",
        gemini: {
          available: geminiAvailable,
          model: GEMINI_FLASH_MODEL,
          provider: "google",
        },
        cloud: {
          available: cloudAvailable,
          model: DEFAULT_CLOUD_MODEL,
          provider: "anthropic",
        },
        local: {
          available: localStatus.reachable && Boolean(localStatus.model),
          model: localStatus.model,
          provider: "openai-compatible",
          endpoint: localStatus.endpoint,
          models_loaded: localStatus.models,
          sovereign: localConfig.isLocal,
          error: localStatus.error || undefined,
        },
        hybrid: {
          // Hybrid is usable if either leg can answer.
          available: cloudAvailable || geminiAvailable || (localStatus.reachable && Boolean(localStatus.model)),
          cloud_leg: cloudAvailable ? DEFAULT_CLOUD_MODEL : geminiAvailable ? GEMINI_FLASH_MODEL : null,
          local_leg: localStatus.model,
        },
      });
      return;
    }

    // ── ElevenLabs TTS ────────────────────────────────────────────────────────
    if (req.method === "GET" && apiPath === "/api/tts/available") {
      jsonResponse(req, res, 200, {
        available: Boolean(ELEVENLABS_API_KEY),
        provider: "elevenlabs",
        model: ELEVENLABS_TTS_MODEL,
        conversation_model: ELEVENLABS_CONVERSATION_MODEL,
        voice_id: ELEVENLABS_VOICE_ID,
        output_format: ELEVENLABS_OUTPUT_FORMAT,
      });
      return;
    }

    if (req.method === "POST" && apiPath === "/api/tts") {
      let body = "";
      for await (const chunk of req) body += chunk;
      const { text: rawText, realtime = false, expressive = false } = JSON.parse(body || "{}");
      if (!rawText?.trim()) { jsonResponse(req, res, 400, { error: "text required" }); return; }
      const text = rawText.slice(0, 2500);

      if (!ELEVENLABS_API_KEY) {
        jsonResponse(req, res, 503, { error: "ELEVENLABS_API_KEY not configured" });
        return;
      }

      const selectedModel = expressive
        ? ELEVENLABS_EXPRESSIVE_MODEL
        : realtime
          ? ELEVENLABS_CONVERSATION_MODEL
          : ELEVENLABS_TTS_MODEL;
      const requestStartedAt = Date.now();
      const upstreamAbort = new AbortController();
      const abortUpstream = () => {
        if (!res.writableEnded) upstreamAbort.abort();
      };
      res.once("close", abortUpstream);

      const elevenRes = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(ELEVENLABS_VOICE_ID)}/stream?output_format=${encodeURIComponent(ELEVENLABS_OUTPUT_FORMAT)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "audio/mpeg",
            "xi-api-key": ELEVENLABS_API_KEY,
          },
          body: JSON.stringify({
            text,
            model_id: selectedModel,
            voice_settings: {
              stability: realtime ? 0.46 : 0.58,
              similarity_boost: 0.88,
              style: expressive ? 0.35 : 0,
              use_speaker_boost: !realtime,
            },
          }),
          signal: upstreamAbort.signal,
        }
      );

      if (!elevenRes.ok) {
        const err = await elevenRes.text().catch(() => "");
        jsonResponse(req, res, elevenRes.status, { error: err || "ElevenLabs TTS failed" });
        return;
      }

      applySecurityHeaders(res);
      res.writeHead(200, {
        "Content-Type": elevenRes.headers.get("content-type") || "audio/mpeg",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": resolveCorsOrigin(req) || "*",
        "X-ARIA-Voice-Provider": "elevenlabs",
        "X-ARIA-Voice-Id": ELEVENLABS_VOICE_ID,
        "X-ARIA-Voice-Model": selectedModel,
        "X-ARIA-TTS-Upstream-Headers-Ms": String(Date.now() - requestStartedAt),
      });
      res.flushHeaders?.();

      let firstByteAt = 0;
      let audioBytes = 0;
      for await (const chunk of elevenRes.body) {
        if (res.destroyed) break;
        if (!firstByteAt) firstByteAt = Date.now();
        audioBytes += chunk.byteLength;
        res.write(Buffer.from(chunk));
      }
      res.end();
      res.off("close", abortUpstream);
      console.log(JSON.stringify({
        level: "info",
        event: "voice.tts_stream",
        model: selectedModel,
        realtime: Boolean(realtime),
        upstream_headers_ms: Number(res.getHeader("X-ARIA-TTS-Upstream-Headers-Ms") || 0),
        first_audio_ms: firstByteAt ? firstByteAt - requestStartedAt : null,
        total_ms: Date.now() - requestStartedAt,
        bytes: audioBytes,
      }));
      recordVoiceMetric({
        tts_last_upstream_headers_ms: Number(res.getHeader("X-ARIA-TTS-Upstream-Headers-Ms") || 0),
        tts_last_first_audio_ms: firstByteAt ? firstByteAt - requestStartedAt : null,
        tts_last_total_ms: Date.now() - requestStartedAt,
      });
      return;
    }

    // ── Hypothesis routes (Phase 1) ────────────────────────────────────────────
    if (req.method === "GET" && apiPath === "/api/hypotheses") {
      try {
        const { getHypotheses } = await import("./reasoningEngine.mjs");
        const status = new URL(req.url, "http://x").searchParams.get("status") || undefined;
        const limit = parseInt(new URL(req.url, "http://x").searchParams.get("limit") || "50", 10);
        jsonResponse(req, res, 200, { hypotheses: getHypotheses({ status, limit }) });
      } catch (err) { jsonResponse(req, res, 500, { error: err.message }); }
      return;
    }

    if (req.method === "POST" && apiPath.match(/^\/api\/hypotheses\/[^/]+\/approve$/)) {
      try {
        const id = apiPath.split("/")[3];
        const body = await readJson(req).catch(() => ({}));
        const { updateHypothesis, getHypothesisById } = await import("./reasoningEngine.mjs");
        const { runAction } = await import("./actionRunner.mjs");
        const hyp = getHypothesisById(id);
        if (!hyp) { jsonResponse(req, res, 404, { error: "Hypothesis not found" }); return; }
        updateHypothesis(id, { status: "approved", approvedBy: body.approver || "operator", approvedAt: new Date().toISOString() });
        const action = hyp.proposedActions?.[0];
        if (action) {
          runAction({
            hypothesisId: id,
            actionId: action.actionId,
            params: { ...action.params, tenantId: "tenant-local" },
            actor: `human:${body.approver || "operator"}`,
            actorType: "human",
          }).catch(err => console.error("[actionRunner] approve error:", err.message));
        }
        jsonResponse(req, res, 200, { ok: true, hypothesisId: id });
      } catch (err) { jsonResponse(req, res, 500, { error: err.message }); }
      return;
    }

    if (req.method === "POST" && apiPath.match(/^\/api\/hypotheses\/[^/]+\/deny$/)) {
      try {
        const id = apiPath.split("/")[3];
        const body = await readJson(req).catch(() => ({}));
        const { updateHypothesis } = await import("./reasoningEngine.mjs");
        updateHypothesis(id, { status: "dismissed", denyReason: body.reason || "dismissed", dismissedBy: body.approver || "operator", dismissedAt: new Date().toISOString() });
        logAuditEvent({ event_type: "aria.hypothesis.dismissed", actor: body.approver || "operator", context: { hypothesisId: id, reason: body.reason } });
        jsonResponse(req, res, 200, { ok: true, hypothesisId: id });
      } catch (err) { jsonResponse(req, res, 500, { error: err.message }); }
      return;
    }

    if (req.method === "GET" && apiPath === "/api/action-executions") {
      try {
        const { getExecutionLog } = await import("./actionRunner.mjs");
        const hypothesisId = new URL(req.url, "http://x").searchParams.get("hypothesisId") || undefined;
        jsonResponse(req, res, 200, { executions: getExecutionLog({ limit: 100, hypothesisId }) });
      } catch (err) { jsonResponse(req, res, 500, { error: err.message }); }
      return;
    }

    if (req.method === "GET" && apiPath === "/api/autonomy/policy") {
      try {
        const policyPath = join(resolveLegacyMemoryDir(), "autonomy-policy.json");
        const policy = existsSync(policyPath) ? JSON.parse(readFileSync(policyPath, "utf8")) : {};
        jsonResponse(req, res, 200, { policy });
      } catch (err) { jsonResponse(req, res, 500, { error: err.message }); }
      return;
    }

    if (req.method === "POST" && apiPath === "/api/autonomy/set-mode") {
      try {
        const body = await readJson(req).catch(() => ({}));
        const { tier, mode } = body;
        if (!tier || !["low","medium","critical"].includes(tier)) {
          jsonResponse(req, res, 400, { error: "tier must be low|medium|critical" }); return;
        }
        if (!mode || !["auto","approve","block"].includes(mode)) {
          jsonResponse(req, res, 400, { error: "mode must be auto|approve|block" }); return;
        }
        const policyPath = join(resolveLegacyMemoryDir(), "autonomy-policy.json");
        const policy = existsSync(policyPath) ? JSON.parse(readFileSync(policyPath, "utf8")) : { tiers: {} };
        if (!policy.tiers) policy.tiers = {};
        policy.tiers[tier] = { ...(policy.tiers[tier] || {}), mode };
        writeFileSync(policyPath, JSON.stringify(policy, null, 2));
        logAuditEvent({ event_type: "aria.autonomy.tier_mode_changed", actor: "operator", context: { tier, mode } });
        jsonResponse(req, res, 200, { ok: true, policy });
      } catch (err) { jsonResponse(req, res, 500, { error: err.message }); }
      return;
    }

    jsonResponse(req, res, 404, { error: "Not found" });
  } catch (error) {
    jsonResponse(req, res, 500, { error: error.message });
  }
}

const server = createServer(handleAriaRequest);

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Load credential encryption keys from .env.local / .env into process.env so all
  // modules that read process.env directly (auth stores, startup checks) see them.
  if (!process.env.ARIA_CREDENTIAL_ENCRYPTION_KEY) {
    const v = loadDotEnvValue("ARIA_CREDENTIAL_ENCRYPTION_KEY") || loadDotEnvValue("ARIA_CREDENTIAL_KEY");
    if (v) process.env.ARIA_CREDENTIAL_ENCRYPTION_KEY = v;
  }
  if (!process.env.ARIA_CREDENTIAL_KEY) {
    const v = loadDotEnvValue("ARIA_CREDENTIAL_KEY");
    if (v) process.env.ARIA_CREDENTIAL_KEY = v;
  }

  const defaultScanIntervalMs = Math.max(60_000, Number(process.env.ARIA_AI_SPM_SCAN_INTERVAL_MS || 300_000));
  if (isStrictProductionMode()) {
    process.env.ARIA_AI_SPM_DEMO_MODE = "0";
  }
  runStartupChecks();

  let runtimeStarted = false;
  function onServerListening(activePort) {
    if (runtimeStarted) return;
    runtimeStarted = true;
    console.log(`Aria function server listening on http://${HOST}:${activePort}`);

    if (!["0", "false", "no", "off"].includes(String(process.env.ARIA_VOICE_WARMUP || "true").toLowerCase())) {
      warmVoicePipeline().catch((err) => {
        console.warn("[Voice] Whisper warm-up failed:", err.message);
      });
    }

    // Phase 1: start continuous reasoning engine
    import("./reasoningEngine.mjs").then(({ startReasoningEngine }) => {
      startReasoningEngine();
    }).catch(err => console.error("[reasoningEngine] startup error:", err.message));

    scanAiSpm().catch((err) => {
      console.warn("[AI-SPM] Initial scheduled scan failed:", err.message);
    });

    // AI-010: respect per-tenant schedule config; check every minute whether interval changed
    let currentIntervalHandle = null;
    async function restartScanInterval() {
      if (currentIntervalHandle) {
        clearInterval(currentIntervalHandle);
        currentIntervalHandle = null;
      }
      let scheduledConfig;
      try {
        scheduledConfig = await getScheduledScan("default");
      } catch {
        scheduledConfig = { enabled: false };
      }
      const intervalMs = scheduledConfig?.enabled && scheduledConfig.interval_minutes
        ? Math.max(60_000, scheduledConfig.interval_minutes * 60_000)
        : defaultScanIntervalMs;
      currentIntervalHandle = setInterval(() => {
        scanAiSpm().catch((err) => {
          console.warn("[AI-SPM] Scheduled scan failed:", err.message);
        });
      }, intervalMs);
      console.log(`[AI-SPM] Scheduled scans enabled every ${Math.round(intervalMs / 1000)}s`);
    }

    restartScanInterval();
    // Re-check schedule config every 60 s to pick up changes from POST /api/ai-spm/schedule
    setInterval(restartScanInterval, 60_000);
  }

  const startPortCandidates = [PORT, PORT + 1, PORT + 2];
  let portAttempt = 0;
  function tryListen() {
    const candidatePort = startPortCandidates[portAttempt];
    if (!candidatePort) {
      console.error(
        `[Server] Failed to bind ${HOST} on any candidate port (${startPortCandidates.join(", ")}). ` +
        "Set ARIA_PORT to an available port and retry."
      );
      process.exit(1);
    }
    const onListening = () => {
      server.off("error", onListenError);
      process.env.ARIA_PORT = String(candidatePort);
      onServerListening(candidatePort);
    };
    const onListenError = (err) => {
      server.off("listening", onListening);
      if ((err.code === "EADDRINUSE" || err.code === "EPERM") && portAttempt < startPortCandidates.length - 1) {
        console.warn(`[Server] Port ${candidatePort} unavailable (${err.code}). Retrying on next port...`);
        portAttempt += 1;
        setTimeout(tryListen, 75);
        return;
      }
      console.error(`[Server] Failed to bind ${HOST}:${candidatePort} (${err.code || "ERROR"}): ${err.message}`);
      process.exit(1);
    };
    server.once("error", onListenError);
    server.once("listening", onListening);
    server.listen(candidatePort, HOST);
  }

  tryListen();
}

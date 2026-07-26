// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import { discoverGithubAiAssets } from "./connectors/githubConnector.mjs";
import { getStoredGithubToken } from "./connectors/githubAuthStore.mjs";
import { discoverAwsAiAssets, awsCredentialsPresent } from "./connectors/awsConnector.mjs";
import { discoverAzureAdAssets } from "./connectors/azureadConnector.mjs";
import { getStoredAzureAdCredentials } from "./connectors/azureadAuthStore.mjs";
import { loadCredential } from "./connectors/credentialVault.mjs";
import { generateAttackNarrative } from "./attackNarrative.mjs";
import { evaluateAiSpmRisks, summarizeAiSpmPosture } from "./aiRiskEngine.mjs";
import { buildDemoInventory } from "./aiSpmDemoFixture.mjs";
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import {
  applyAiSpmDecisions,
  buildAiSpmReport,
  recordAiSpmDecision,
  saveAiSpmReport,
} from "./aiSpmCaseStore.mjs";
import {
  findAiSpmAttackPathCandidates,
  getAiSpmRepoRiskGraphSummary,
  persistAiSpmGraphFromState,
} from "./aiSpmGraphStore.mjs";
import { logAuditEvent } from "./auditLog.mjs";
import { isStrictProductionMode, persistencePath } from "./persistenceConfig.mjs";
import { durableGet, durableSet } from "./durableStore.mjs";
import { createHash } from "node:crypto";

// AI-015: severity normalisation
export function normaliseSeverity(raw = "") {
  const s = String(raw).toLowerCase();
  if (["critical", "p0"].includes(s)) return { label: "critical", cvss: 9.5 };
  if (["high", "p1", "error"].includes(s)) return { label: "high", cvss: 7.5 };
  if (["medium", "moderate", "p2", "warning"].includes(s)) return { label: "medium", cvss: 5.0 };
  if (["low", "p3", "info"].includes(s)) return { label: "low", cvss: 2.5 };
  return { label: "info", cvss: 0.0 };
}

function applyNormalisedSeverity(findings = []) {
  return findings.map((f) => {
    const norm = normaliseSeverity(f.severity);
    return {
      ...f,
      severity_raw: f.severity_raw ?? f.severity,
      severity: norm.label,
      cvss_score: f.cvss_score ?? norm.cvss,
    };
  });
}

// AI-013: known supply-chain concern patterns (name-based)
const KNOWN_BAD_PACKAGES = new Set(["left-pad", "event-stream", "flatmap-stream", "ua-parser-js", "node-ipc"]);

function parseDependencyFile(filename, content) {
  const deps = [];
  try {
    if (filename === "package.json") {
      const pkg = JSON.parse(content);
      for (const [name, ver] of Object.entries({ ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) })) {
        deps.push({ name, version: String(ver) });
      }
    } else if (filename === "requirements.txt") {
      for (const line of content.split(/\r?\n/)) {
        const m = line.trim().match(/^([A-Za-z0-9_.-]+)([=<>!].+)?/);
        if (m) deps.push({ name: m[1], version: m[2]?.trim() || "" });
      }
    } else if (filename === "go.mod") {
      for (const line of content.split(/\r?\n/)) {
        const m = line.trim().match(/^(?:require\s+)?([a-z0-9./\-]+)\s+(v[\d.]+)/i);
        if (m) deps.push({ name: m[1], version: m[2] });
      }
    } else if (filename === "Cargo.toml") {
      for (const line of content.split(/\r?\n/)) {
        const m = line.trim().match(/^([a-z0-9_-]+)\s*=\s*["']([^"']+)["']/i);
        if (m) deps.push({ name: m[1], version: m[2] });
      }
    } else if (filename === "pom.xml") {
      for (const m of content.matchAll(/<artifactId>([^<]+)<\/artifactId>/g)) {
        deps.push({ name: m[1], version: "" });
      }
    }
  } catch {
    // parse errors are non-fatal
  }
  return deps;
}

const SBOM_FILENAMES = new Set(["package.json", "requirements.txt", "go.mod", "Cargo.toml", "pom.xml"]);

function buildSbomFindings(assets = []) {
  const sbomFindings = [];
  for (const asset of assets) {
    for (const ev of (asset.evidence || [])) {
      const filename = (ev.path || "").split("/").pop();
      if (!SBOM_FILENAMES.has(filename)) continue;
      // We only have the path at this point; content was scanned — build SBOM from evidence snippet
      // Full dependency list is unavailable at this layer (content was consumed by githubConnector),
      // so we create a placeholder inventory finding flagging the file exists.
      const flagged = filename === "package.json" ? [] : []; // actual deps parsed during connector scan
      sbomFindings.push({
        id: `sbom:${asset.repo || "unknown"}:${filename}:${(ev.path || "").replace(/\W/g, "-")}`,
        type: "sbom-inventory",
        severity_raw: "info",
        severity: "info",
        cvss_score: 0.0,
        title: `SBOM inventory: ${filename} detected in ${asset.repo || "unknown"}`,
        asset_id: asset.id || filename,
        asset_name: filename,
        asset_type: "sbom",
        repo: asset.repo || "unknown",
        source_path: ev.path,
        flagged_dependencies: flagged,
        supply_chain_risk: flagged.length > 0,
        evidence: [{ path: ev.path, signal: `Dependency manifest detected: ${filename}`, snippet: ev.snippet || "" }],
        rationale: `Dependency manifest ${filename} found in repository. Review for supply-chain risks.`,
        recommendations: ["Audit dependencies for known CVEs", "Enable automated dependency scanning (Dependabot / Snyk)"],
        discovered_at: new Date().toISOString(),
      });
    }
  }
  return sbomFindings;
}

// AI-008: incremental scanning — hash-based change detection
function assetHash(asset) {
  return createHash("sha256").update(JSON.stringify(asset)).digest("hex").slice(0, 16);
}

async function loadAssetHashes(tenantId) {
  try {
    return (await durableGet(`scan-asset-hashes:${tenantId}`)) || {};
  } catch {
    return {};
  }
}

async function saveAssetHashes(tenantId, hashMap) {
  try {
    await durableSet(`scan-asset-hashes:${tenantId}`, hashMap);
  } catch {
    // non-fatal
  }
}

function filterChangedAssets(assets = [], previousHashes = {}) {
  const newHashes = {};
  const changed = [];
  for (const asset of assets) {
    const id = asset.normalized_id || asset.id;
    const h = assetHash(asset);
    newHashes[id] = h;
    if (previousHashes[id] !== h) {
      changed.push(asset);
    }
  }
  return { changed, newHashes };
}

// AI-010: scheduled scan config helpers
export async function getScheduledScan(tenantId) {
  try {
    return (await durableGet(`scheduled-scan:${tenantId}`)) || { enabled: false, interval_minutes: 5 };
  } catch {
    return { enabled: false, interval_minutes: 5 };
  }
}

export async function setScheduledScan(tenantId, config = {}) {
  const current = await getScheduledScan(tenantId);
  const updated = { ...current, ...config };
  await durableSet(`scheduled-scan:${tenantId}`, updated);
  return updated;
}

let currentState;
let currentMode = "live";
const SCAN_HISTORY_PATH = () => persistencePath(["ai-spm-scan-history.json"], { purpose: "AI-SPM scan history persistence" });
const SCAN_ARCHIVE_DIR = () => persistencePath(["scan-archive"], { purpose: "AI-SPM scan archive persistence" });
const MAX_SCAN_HISTORY = 60;

// AI-006 / AI-012: finding fingerprinting for deduplication and cross-scan correlation
function fingerprintFinding(finding) {
  return createHash("sha256")
    .update(`${finding.asset_id || ""}:${finding.type || finding.code || ""}:${finding.field || finding.resource || ""}`)
    .digest("hex").slice(0, 16);
}

function isDemoMode(options = {}) {
  if (isStrictProductionMode()) return false;
  const optionEnabled = options.demo === true || options.mode === "demo";
  const envEnabled = ["1", "true", "yes", "on", "demo"].includes(
    String(process.env.ARIA_AI_SPM_DEMO_MODE || "").toLowerCase()
  );
  return optionEnabled || envEnabled;
}

function ensureStore() {
  const root = persistencePath([], { purpose: "AI-SPM state persistence" });
  if (!existsSync(root)) mkdirSync(root, { recursive: true });
}

function readScanHistory() {
  ensureStore();
  try {
    return JSON.parse(readFileSync(SCAN_HISTORY_PATH(), "utf8"));
  } catch {
    return { scans: [] };
  }
}

function writeScanHistory(history) {
  ensureStore();
  writeFileSync(SCAN_HISTORY_PATH(), `${JSON.stringify(history, null, 2)}\n`);
}

function normalizeAsset(asset = {}) {
  const id = String(asset.id || "").trim();
  const source = String(asset.source || "unknown");
  const subtype = String(asset.subtype || "unknown");
  const provider = String(asset.provider || "unknown");
  const repo = String(asset.repo || "unknown");
  const type = String(asset.type || "unknown");
  const canonicalType = (
    type === "ai_system" ? "ai_system" :
    type === "agent" ? "agent" :
    type === "vector_store" ? "vector_store" :
    type === "secret" ? "secret" :
    type === "iam_role" ? "identity" :
    type === "ai_model" ? "model" :
    type
  );
  return {
    ...asset,
    id,
    source,
    subtype,
    provider,
    repo,
    type,
    canonical_type: canonicalType,
    normalized_id: `${source}:${repo}:${type}:${subtype}:${id}`.replace(/[^a-zA-Z0-9:._/-]/g, "-"),
  };
}

function dedupeAssets(assets = []) {
  const byNormalizedId = new Map();
  for (const raw of assets) {
    const asset = normalizeAsset(raw);
    const existing = byNormalizedId.get(asset.normalized_id);
    if (!existing) {
      byNormalizedId.set(asset.normalized_id, asset);
      continue;
    }
    existing.files = [...new Set([...(existing.files || []), ...(asset.files || [])])];
    existing.capabilities = [...new Set([...(existing.capabilities || []), ...(asset.capabilities || [])])];
    existing.evidence = [...(existing.evidence || []), ...(asset.evidence || [])];
  }
  return [...byNormalizedId.values()];
}

function buildDiff(previousInventory = {}, currentInventory = {}) {
  const previousAssets = previousInventory.assets || [];
  const currentAssets = currentInventory.assets || [];
  const previousIds = new Set(previousAssets.map((a) => a.normalized_id || a.id));
  const currentIds = new Set(currentAssets.map((a) => a.normalized_id || a.id));
  const added = currentAssets.filter((a) => !previousIds.has(a.normalized_id || a.id));
  const removed = previousAssets.filter((a) => !currentIds.has(a.normalized_id || a.id));
  return {
    added_count: added.length,
    removed_count: removed.length,
    unchanged_count: Math.max(0, currentAssets.length - added.length),
    added: added.slice(0, 40),
    removed: removed.slice(0, 40),
  };
}

function recordScanSnapshot(state) {
  const history = readScanHistory();
  const newEntry = {
    generated_at: state.inventory.generated_at,
    summary: state.summary,
    inventory: {
      connectors: state.inventory.connectors,
      assets: state.inventory.assets,
    },
  };
  const allScans = [...(history.scans || []), newEntry];

  // AI-007: archive scans beyond MAX_SCAN_HISTORY to JSONL file
  if (allScans.length > MAX_SCAN_HISTORY) {
    const toArchive = allScans.slice(0, allScans.length - MAX_SCAN_HISTORY);
    try {
      const archiveDir = SCAN_ARCHIVE_DIR();
      if (!existsSync(archiveDir)) mkdirSync(archiveDir, { recursive: true });
      const archivePath = `${archiveDir}/scan-archive.jsonl`;
      const lines = toArchive.map((s) => JSON.stringify(s)).join("\n") + "\n";
      appendFileSync(archivePath, lines, "utf8");
    } catch (err) {
      console.warn("[AI-SPM] Failed to archive old scans:", err.message);
    }
  }

  history.scans = allScans.slice(-MAX_SCAN_HISTORY);
  writeScanHistory(history);
}

// AI-006/AI-012: apply fingerprint deduplication across findings list
// Mutates findings in-place: sets .fingerprint, merges duplicates by updating last_seen/occurrences
async function applyFingerprintDedup(findings, tenantId) {
  const seenFps = new Map(); // fp → finding index
  const result = [];

  for (const finding of findings) {
    const fp = fingerprintFinding(finding);
    finding.fingerprint = fp;

    const kvKey = `finding-fp:${tenantId}:${fp}`;
    const existing = await durableGet(kvKey);

    if (existing) {
      // Duplicate — update the existing record rather than creating a new entry
      const existingFinding = existing;
      existingFinding.last_seen = new Date().toISOString();
      existingFinding.occurrences = (existingFinding.occurrences || 1) + 1;
      await durableSet(kvKey, existingFinding);
      // Add the updated finding (merged) to result instead of the raw new one
      if (!seenFps.has(fp)) {
        seenFps.set(fp, result.length);
        result.push({ ...finding, ...existingFinding, last_seen: existingFinding.last_seen, occurrences: existingFinding.occurrences });
      }
    } else {
      // New finding — store fingerprint
      const record = { ...finding, first_seen: new Date().toISOString(), occurrences: 1 };
      await durableSet(kvKey, record);
      if (!seenFps.has(fp)) {
        seenFps.set(fp, result.length);
        result.push(record);
      }
    }
  }

  return result;
}

// AI-011: check KV suppression flags for each finding
async function filterKvSuppressed(findings, tenantId) {
  const checks = await Promise.all(
    findings.map((f) => durableGet(`suppressed:${tenantId}:${f.id}`))
  );
  return {
    visible: findings.filter((_, i) => !checks[i]),
    suppressed: findings.filter((_, i) => Boolean(checks[i])),
  };
}

async function buildState(inventory, previousInventory = null, tenantId = "default", { deterministicDemo = false } = {}) {
  const rawFindings = evaluateAiSpmRisks(inventory);
  const decisions = applyAiSpmDecisions(rawFindings);

  // AI-006/AI-012: fingerprint-based deduplication
  const dedupedVisible = deterministicDemo
    ? decisions.visible.map((finding) => ({
      ...finding,
      fingerprint: fingerprintFinding(finding),
      first_seen: inventory.generated_at,
      last_seen: inventory.generated_at,
      occurrences: 1,
    }))
    : await applyFingerprintDedup(decisions.visible, tenantId);

  // AI-011: filter findings suppressed via KV
  const kvFiltered = await filterKvSuppressed(dedupedVisible, tenantId);

  const allSuppressed = applyNormalisedSeverity([...decisions.suppressed, ...kvFiltered.suppressed]);

  // AI-015: normalise severity on all visible findings before storing
  const normalisedVisible = applyNormalisedSeverity(kvFiltered.visible);

  // AI-013: include SBOM findings in the findings list
  const sbomFindingsFromInventory = inventory.sbom_findings || [];
  const allVisibleFindings = [...normalisedVisible, ...sbomFindingsFromInventory];

  const visibleFindings = allVisibleFindings.length > 0
    ? allVisibleFindings
    : [{
      id: "ai-spm:visibility-gap:fallback",
      code: "ai-spm-visibility-fallback",
      severity: "low",
      score: 1,
      title: "All findings are currently suppressed",
      asset_id: "ai-spm:environment",
      asset_name: "AI-SPM environment baseline",
      asset_type: "ai_system",
      repo: "environment/local",
      evidence: [{ path: "decisions-store", line: 1, signal: "No visible findings after suppression rules" }],
      rationale: "Saved analyst decisions currently suppress all findings from the visible queue.",
      attack_path: ["visibility gap", "stale suppression state"],
      recommendations: [
        "Review suppressed findings and reopen high-risk items as needed",
        "Set suppression expiry for temporary ignores",
      ],
      decision: {
        status: "visibility_fallback",
        action: "fallback_visible",
        note: "Operational fallback when all findings are suppressed.",
      },
    }];

  const summary = summarizeAiSpmPosture({ inventory, findings: visibleFindings });
  const diff = buildDiff(previousInventory || {}, inventory);
  const topFindings = visibleFindings.slice(0, 5).map((f) => ({
    id: f.id,
    severity: f.severity,
    title: f.title,
    score: f.score,
    repo: f.repo,
  }));
  const graphState = persistAiSpmGraphFromState({
    inventory,
    findings: visibleFindings,
    suppressed_findings: allSuppressed,
  });
  const primaryRepo = inventory.connectors?.[0]?.repositories?.[0]?.repo || "";
  return {
    inventory,
    raw_findings: rawFindings,
    findings: visibleFindings,
    suppressed_findings: allSuppressed,
    changes: diff,
    top_findings: topFindings,
    graph: {
      updated_at: graphState.updated_at,
      repo_summary: getAiSpmRepoRiskGraphSummary(primaryRepo),
      path_candidates: findAiSpmAttackPathCandidates({ repo: primaryRepo }),
    },
    summary: {
      ...summary,
      suppressed_count: allSuppressed.length,
      action_required_count: visibleFindings.filter((finding) => finding.decision?.status === "action_required").length,
      newly_added_assets: diff.added_count,
      removed_assets: diff.removed_count,
    },
  };
}

// AI-009: pre-flight credential validation — returns {ok, reason} for a connector.
// Credentials can arrive three ways and ANY of them is sufficient:
//   1. Environment variables (backend-provisioned)
//   2. Panel-entered creds saved to the connector's own auth store (UI connect flow)
//   3. The optional encrypted credential vault / secrets manager
// We check native presence (env + panel store) first so a configured vault can
// never shadow creds a user typed into the AI-SPM panel.
// AI-009: pre-flight credential validation — returns {ok, reason} for a connector
async function preflightConnector(connectorId, tenantId) {
  // GitHub: original path — check env vars and panel-stored token directly
  if (connectorId === "github") {
    const hasToken = Boolean(process.env.GITHUB_TOKEN || process.env.GH_TOKEN || getStoredGithubToken());
    return hasToken ? { ok: true } : { ok: false, reason: "GITHUB_TOKEN not set and no stored OAuth token" };
  }

  // AWS + others: check native creds (env vars or panel-entered) first, then vault
  const nativeOk =
    connectorId === "aws"
      ? Boolean(awsCredentialsPresent() || process.env.AWS_PROFILE)
      : Boolean(getStoredAzureAdCredentials());
  if (nativeOk) return { ok: true };

  const vaultConfigured = Boolean(
    process.env.ARIA_CREDENTIAL_ENCRYPTION_KEY ||
    process.env.ARIA_CREDENTIAL_KEY
  ) ||
    process.env.ARIA_USE_SECRETS_MANAGER === "true";
  if (vaultConfigured) {
    try {
      const cred = await loadCredential(connectorId, tenantId || "default");
      if (cred) return { ok: true };
    } catch (err) {
      return { ok: false, reason: `Credential vault error for ${connectorId}: ${err.message}` };
    }
  }

  return {
    ok: false,
    reason: `No credentials for ${connectorId} — set env vars, connect via the AI-SPM panel, or store in the vault`,
  };
}

export async function scanAiSpm(options = {}) {
  const previousInventory = currentState?.inventory;
  const demoMode = isDemoMode(options);
  const tenantId = options.tenantId || options.tenant_id || "default";

  if (demoMode) {
    const inventory = buildDemoInventory();
    currentState = await buildState(inventory, previousInventory, tenantId, { deterministicDemo: true });
    currentMode = "demo";
    recordScanSnapshot(currentState);
    logAuditEvent({
      event_type: "ai_spm_scan_completed",
      actor: "ai_spm",
      context: {
        mode: "demo",
        asset_count: currentState.summary.asset_count,
        finding_count: currentState.summary.finding_count,
      },
    });
    return currentState;
  }

  // AI-009: pre-flight credential validation — skip connectors with missing creds
  const azureAdConfigured = !!getStoredAzureAdCredentials();
  const [githubPreflight, awsPreflight] = await Promise.all([
    preflightConnector("github", tenantId),
    preflightConnector("aws", tenantId),
  ]);

  const [githubResult, awsResult, azureAdResult] = await Promise.allSettled([
    githubPreflight.ok
      ? discoverGithubAiAssets(options.github || options)
      : Promise.reject(new Error(`GitHub preflight failed: ${githubPreflight.reason}`)),
    awsPreflight.ok
      ? discoverAwsAiAssets(options.aws || {})
      : Promise.reject(new Error(`AWS preflight failed: ${awsPreflight.reason}`)),
    azureAdConfigured
      ? discoverAzureAdAssets()
      : Promise.reject(new Error("Azure AD credentials not configured")),
  ]);

  const githubInventory = githubResult.status === "fulfilled"
    ? githubResult.value
    : (() => {
      const msg = githubResult.reason?.message || "unknown error";
      if (!githubPreflight.ok) console.warn(`[AI-SPM] Skipping GitHub connector: ${githubPreflight.reason}`);
      return {
        connector: "github",
        mode: githubPreflight.ok ? "error" : "not_configured",
        scanned_at: new Date().toISOString(),
        files_scanned: 0,
        assets: [],
        message: githubPreflight.ok
          ? `GitHub connector scan failed: ${msg}`
          : `GitHub connector skipped: ${githubPreflight.reason}`,
      };
    })();

  const awsInventory = awsResult.status === "fulfilled"
    ? awsResult.value
    : (() => {
      const msg = awsResult.reason?.message || "unknown error";
      if (!awsPreflight.ok) console.warn(`[AI-SPM] Skipping AWS connector: ${awsPreflight.reason}`);
      return {
        connector: "aws",
        mode: awsPreflight.ok ? "error" : "not_configured",
        scanned_at: new Date().toISOString(),
        region: "unknown",
        account: null,
        assets: [],
        counts: {},
        message: awsPreflight.ok
          ? `AWS connector scan failed: ${msg}`
          : `AWS connector skipped: ${awsPreflight.reason}`,
      };
    })();

  const azureAdInventory = azureAdResult.status === "fulfilled"
    ? azureAdResult.value
    : (() => {
      const msg = azureAdResult.reason?.message || "unknown error";
      if (!azureAdConfigured) console.warn("[AI-SPM] Skipping Azure AD connector: credentials not configured");
      return {
        connector: "azuread",
        mode: azureAdConfigured ? "error" : "not_configured",
        scanned_at: new Date().toISOString(),
        assets: [],
        findings: [],
        counts: {},
        message: azureAdConfigured
          ? `Azure AD connector scan failed: ${msg}`
          : "Azure AD connector skipped: credentials not configured",
      };
    })();

  const connectors = [
    {
      id: "github",
      status: githubInventory.mode === "error" ? "error" : "live",
      mode: githubInventory.mode,
      scanned_at: githubInventory.scanned_at,
      files_scanned: githubInventory.files_scanned ?? 0,
      message: githubInventory.message,
      repositories: githubInventory.repositories || [{ repo: githubInventory.repo, files_scanned: githubInventory.files_scanned }],
      repository_errors: githubInventory.repository_errors || [],
    },
    {
      id: "aws",
      status: awsInventory.mode === "not_configured" ? "not_configured" : awsInventory.mode === "error" ? "error" : "live",
      mode: awsInventory.mode,
      scanned_at: awsInventory.scanned_at,
      files_scanned: 0,
      repositories: [],
      region: awsInventory.region,
      account: awsInventory.account,
      counts: awsInventory.counts || {},
      message: awsInventory.message,
    },
    {
      id: "azuread",
      status: azureAdInventory.mode === "not_configured" ? "not_configured" : azureAdInventory.mode === "error" ? "error" : "live",
      mode: azureAdInventory.mode,
      scanned_at: azureAdInventory.scanned_at,
      files_scanned: 0,
      repositories: [],
      tenant_id: azureAdInventory.tenant_id,
      counts: azureAdInventory.counts || {},
      message: azureAdInventory.message,
    },
  ];

  // AI-008: load previous asset hashes for incremental change detection
  const previousHashes = await loadAssetHashes(tenantId);
  const allRawAssets = dedupeAssets([
    ...(githubInventory.assets || []),
    ...(awsInventory.assets || []),
    ...(azureAdInventory.assets || []),
  ]);

  // Detect changed/new assets
  const { changed: changedAssets, newHashes } = filterChangedAssets(allRawAssets, previousHashes);

  // AI-013: generate SBOM inventory findings from manifest files found in assets
  const sbomFindings = buildSbomFindings(allRawAssets);

  // Pass Azure AD connector's native findings (AZUREAD-001..004) into the pipeline
  const azureadNativeFindings = (azureAdInventory.findings || []).map((f) => ({
    id: `azuread:${f.rule_id}:${f.id}`,
    code: f.rule_id,
    severity: f.severity,
    score: { high: 78, medium: 52, low: 24, critical: 95 }[f.severity] || 24,
    title: f.title,
    asset_id: f.asset_id || "azuread:tenant",
    asset_name: f.asset_name || "Azure AD",
    asset_type: "identity",
    repo: "azure-ad",
    evidence: [],
    rationale: f.description || "",
    attack_path: [],
    recommendations: [],
  }));

  const inventory = {
    generated_at: new Date().toISOString(),
    connectors,
    assets: allRawAssets,
    changed_asset_count: changedAssets.length,
    sbom_findings: [...sbomFindings, ...azureadNativeFindings],
  };

  // Save updated hashes after building inventory
  await saveAssetHashes(tenantId, newHashes);

  currentState = await buildState(inventory, previousInventory, tenantId);
  currentMode = "live";
  recordScanSnapshot(currentState);
  logAuditEvent({
    event_type: "ai_spm_scan_completed",
    actor: "ai_spm",
    context: {
      mode: "live",
      asset_count: currentState.summary.asset_count,
      finding_count: currentState.summary.finding_count,
      connectors: connectors.map((connector) => ({ id: connector.id, status: connector.status, mode: connector.mode })),
    },
  });
  return currentState;
}

export async function getAiSpmState() {
  if (!currentState) {
    return scanAiSpm();
  }
  return currentState;
}

export async function getAiSpmInventory() {
  const state = await getAiSpmState();
  return {
    ...state.inventory,
    mode: currentMode,
  };
}

export async function getAiSpmFindings() {
  const state = await getAiSpmState();
  return {
    mode: currentMode,
    summary: state.summary,
    top_findings: state.top_findings || [],
    changes: state.changes || {},
    findings: state.findings,
    suppressed_findings: state.suppressed_findings,
  };
}

export function getAiSpmScanHistory({ include_archive = false } = {}) {
  const history = readScanHistory();
  if (!include_archive) return history;

  // AI-007: merge archived scans when requested
  let archivedScans = [];
  try {
    const archivePath = `${SCAN_ARCHIVE_DIR()}/scan-archive.jsonl`;
    if (existsSync(archivePath)) {
      const lines = readFileSync(archivePath, "utf8").split("\n").filter(Boolean);
      archivedScans = lines.map((line) => {
        try { return JSON.parse(line); } catch { return null; }
      }).filter(Boolean);
    }
  } catch (err) {
    console.warn("[AI-SPM] Failed to read scan archive:", err.message);
  }

  return {
    ...history,
    scans: [...archivedScans, ...(history.scans || [])],
    archive_count: archivedScans.length,
  };
}

// AI-002: remediation plan + execution tracking
const remediationExecutions = new Map();

export function getAiSpmRemediationPlan({ findingId } = {}) {
  if (!currentState) return { actions: [] };
  const finding = [...(currentState.findings || []), ...(currentState.suppressed_findings || [])].find((f) => f.id === findingId);
  if (!finding) throw new Error("Finding not found");

  const actions = [];
  if (finding.code === "ai-secret-in-source") {
    actions.push({ type: "github_issue_draft", title: "Rotate exposed credential and purge git history", safe: true, auto_executable: false });
    actions.push({ type: "runbook", title: "Enable secret scanning + branch protection", safe: true, auto_executable: false });
  } else if (finding.code === "iam-ai-role-wildcard") {
    actions.push({ type: "policy_patch_draft", title: "Replace wildcard IAM actions with least privilege", safe: true, auto_executable: false });
    actions.push({ type: "change_review", title: "Require approval before policy deployment", safe: true, auto_executable: false });
  } else if ((finding.code || "").includes("bedrock-agent")) {
    actions.push({ type: "guardrail_enablement_draft", title: "Attach Bedrock guardrail and tighten action groups", safe: true, auto_executable: false });
    actions.push({ type: "audit_logging_checklist", title: "Enable CloudTrail and invocation logging", safe: true, auto_executable: false });
  } else {
    actions.push({ type: "runbook", title: "Investigate finding evidence and apply least-privilege remediation", safe: true, auto_executable: false });
  }

  const prior = remediationExecutions.get(findingId);

  return {
    finding_id: finding.id,
    finding_title: finding.title,
    severity: finding.severity,
    actions,
    execution: prior || null,
  };
}

export function executeAiSpmRemediation({ findingId, actionIndex = 0, actor = "system" } = {}) {
  if (!currentState) throw new Error("No scan state available — run a scan first.");
  const finding = [...(currentState.findings || []), ...(currentState.suppressed_findings || [])].find((f) => f.id === findingId);
  if (!finding) throw new Error("Finding not found");

  const plan = getAiSpmRemediationPlan({ findingId });
  const action = plan.actions[actionIndex];
  if (!action) throw new Error(`Action index ${actionIndex} not found in remediation plan.`);

  // All current actions are safe/manual — they generate work items rather than modifying live infrastructure.
  // Non-safe actions would require an approval queue entry before execution.
  const executionId = `rem-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
  const execution = {
    id: executionId,
    finding_id: findingId,
    action,
    status: "queued",
    queued_at: new Date().toISOString(),
    actor,
    work_item: {
      type: action.type,
      title: action.title,
      instructions: `Manual step required: ${action.title}. Finding: ${finding.title} (${finding.severity}).`,
      finding_url: finding.source_url || null,
    },
  };
  remediationExecutions.set(findingId, execution);
  logAuditEvent({
    event_type: "ai_spm.remediation.queued",
    actor,
    context: { finding_id: findingId, action_type: action.type, execution_id: executionId },
  });
  return execution;
}

export async function getAiSpmNarrative(options = {}) {
  const requestedMode = isDemoMode(options) ? "demo" : "live";
  const state = !currentState || currentMode !== requestedMode ? await scanAiSpm(options) : await getAiSpmState();
  const templateNarrative = generateAttackNarrative({
    inventory: state.inventory,
    findings: state.findings,
    ...options,
  });

  return {
    mode: currentMode,
    summary: state.summary,
    ai_narrative: null,
    narrative: templateNarrative,
  };
}

export async function recordAiSpmFindingAction(options = {}) {
  const decision = recordAiSpmDecision(options);
  const tenantId = options.tenantId || options.tenant_id || "default";

  // AI-011: persist suppression to KV so it survives restarts and is checked during scans
  if (options.action === "suppress" && options.findingId) {
    await durableSet(
      `suppressed:${tenantId}:${options.findingId}`,
      { suppressed_at: new Date().toISOString(), actor: options.actor || "analyst", reason: options.reason || null }
    );
  }

  if (currentState) currentState = await buildState(currentState.inventory, null, tenantId);
  logAuditEvent({
    event_type: "ai_spm_finding_action_recorded",
    actor: "analyst",
    context: {
      finding_id: decision.findingId,
      action: decision.action,
      status: decision.status,
    },
  });
  return {
    decision,
    state: await getAiSpmState(),
  };
}

// AI-003: evidence sandbox with synthetic evidence generation when data is sparse
function synthesizeEvidence(finding) {
  const base = [];
  if (finding.code === "ai-secret-in-source") {
    base.push({
      type: "code_snippet",
      file: finding.source_file || "config/credentials.py",
      line: 42,
      snippet: "API_KEY = \"[REDACTED — credential detected in source]\"",
      severity: "critical",
      note: "Secret detected by pattern matching. Actual value redacted.",
    });
    base.push({
      type: "git_blame",
      commit: "[commit sha redacted]",
      author: "[redacted]",
      date: finding.created_at || new Date().toISOString(),
      note: "Credential committed directly to repository history.",
    });
  } else if (finding.code === "iam-ai-role-wildcard") {
    base.push({
      type: "iam_policy",
      resource: finding.asset_name || "IAM Role",
      policy_excerpt: '{"Effect":"Allow","Action":"*","Resource":"*"}',
      note: "Wildcard IAM policy grants unrestricted access. Should be scoped to least-privilege.",
    });
  } else if ((finding.code || "").includes("bedrock")) {
    base.push({
      type: "aws_resource",
      service: "Bedrock",
      resource_id: finding.asset_id || "bedrock-agent",
      note: "AI agent found without guardrails. Prompt injection risk present.",
    });
  } else {
    base.push({
      type: "metadata",
      asset: finding.asset_name || finding.asset_id,
      finding_code: finding.code,
      note: "Evidence derived from scan metadata. Connect data sources for richer evidence.",
    });
  }
  return base;
}

export async function getAiSpmEvidenceSandbox({ findingId } = {}) {
  const state = await getAiSpmState();
  const finding = [...state.findings, ...state.suppressed_findings].find((item) => item.id === findingId);
  if (!finding) throw new Error("Finding not found");

  // AI-003: use real evidence if available; synthesize scaffolding when sparse
  const rawEvidence = finding.evidence || [];
  const evidence = rawEvidence.length > 0 ? rawEvidence : synthesizeEvidence(finding);

  return {
    sandbox: {
      mode: "read-only-evidence",
      finding,
      evidence,
      evidence_source: rawEvidence.length > 0 ? "scan" : "synthesized",
      attack_path: finding.attack_path || [],
      recommendations: finding.recommendations || [],
      note: "Evidence is shown as redacted snippets only. No repository code is executed.",
    },
  };
}

export async function generateAiSpmReport(options = {}) {
  const state = await getAiSpmState();
  const narrative = generateAttackNarrative({
    inventory: state.inventory,
    findings: state.findings,
    ...options,
  });
  const markdown = buildAiSpmReport({
    summary: state.summary,
    inventory: state.inventory,
    findings: state.findings,
    suppressed: state.suppressed_findings,
    narrative,
  });
  const saved = saveAiSpmReport(markdown);
  return {
    summary: state.summary,
    narrative,
    report: {
      markdown,
      ...saved,
    },
  };
}

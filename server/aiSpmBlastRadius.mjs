// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

/**
 * aiSpmBlastRadius.mjs — Phase 2: quantify the real-world reach of an AI-SPM finding.
 *
 * For every finding/asset we compute four dimensions of reach:
 *   • credentialReach — env vars, key files, secret refs the asset can read
 *   • dataReach       — buckets, DBs, vector stores the asset's code touches
 *   • toolReach       — for agents: tools/functions invokable + their tier
 *   • egressReach     — external endpoints the code calls
 *
 * Output: { blastRadius: {...}, exposureScore: 0–100 }
 *
 * The composite exposure score is consumed by OrbitalTelemetry to size nodes.
 */

const TOOL_TIER = {
  shell: "critical", exec: "critical", filesystem: "high", fs: "high", file: "high",
  database: "high", db: "high", network: "high", http: "high", api: "medium",
  search: "low", retrieval: "low", knowledge: "low", math: "low", calculator: "low",
};

// ── Heuristic extractors over evidence text ──────────────────────────────────

const ENV_REGEX     = /process\.env\.([A-Z][A-Z0-9_]+)/g;
const SECRET_REGEX  = /\b(api[_-]?key|secret|token|bearer|password|credential)[_-]?([A-Za-z0-9_-]*)/gi;
const BUCKET_REGEX  = /(?:s3|gs|blob):\/\/([a-z0-9.\-_/]+)/gi;
const DB_REGEX      = /(?:dynamodb|mongodb|postgres|mysql|redis|elasticsearch|pinecone|qdrant|weaviate|opensearch)([:.][\w-]+)?/gi;
const URL_REGEX     = /https?:\/\/([a-z0-9.\-]+)(?:\/[^\s"'<>)]*)?/gi;
const TOOL_REGEX    = /\b(?:tools?|functions?|capabilities)\s*[:=]?\s*\[?([A-Za-z0-9_,\s"'-]+)\]?/g;

function extractFromText(text = "") {
  const t = String(text);
  const credentials = new Set();
  const dataAssets  = new Set();
  const egress      = new Set();

  let m;
  while ((m = ENV_REGEX.exec(t))) credentials.add(m[1]);
  ENV_REGEX.lastIndex = 0;
  while ((m = SECRET_REGEX.exec(t))) {
    const key = `${m[1]}${m[2] ? "_" + m[2] : ""}`.toLowerCase();
    credentials.add(key);
  }
  SECRET_REGEX.lastIndex = 0;
  while ((m = BUCKET_REGEX.exec(t))) dataAssets.add(m[0]);
  BUCKET_REGEX.lastIndex = 0;
  while ((m = DB_REGEX.exec(t))) dataAssets.add(m[0]);
  DB_REGEX.lastIndex = 0;
  while ((m = URL_REGEX.exec(t))) egress.add(m[1]);
  URL_REGEX.lastIndex = 0;

  return {
    credentials: [...credentials],
    dataAssets:  [...dataAssets],
    egress:      [...egress],
  };
}

function evidenceToText(evidence = []) {
  if (Array.isArray(evidence)) {
    return evidence.map(e =>
      typeof e === "string" ? e :
      [e.observation, e.detail, e.snippet, e.text, e.value, e.raw && JSON.stringify(e.raw)].filter(Boolean).join(" ")
    ).join("\n");
  }
  if (typeof evidence === "object" && evidence) return JSON.stringify(evidence);
  return String(evidence || "");
}

// ── Tool reach for agents ─────────────────────────────────────────────────────

function inferToolReach(asset = {}) {
  const caps = asset.capabilities || asset.tools || [];
  if (!Array.isArray(caps) || caps.length === 0) return [];
  return caps.map(name => {
    const lname = String(name).toLowerCase();
    let tier = "low";
    for (const [key, t] of Object.entries(TOOL_TIER)) {
      if (lname.includes(key)) { tier = t; break; }
    }
    return { name: String(name), tier };
  });
}

// ── Composite exposure score 0–100 ───────────────────────────────────────────

const SEVERITY_WEIGHT = { critical: 1.0, high: 0.7, medium: 0.45, low: 0.2, info: 0.1 };
const TOOL_WEIGHT     = { critical: 30, high: 18, medium: 8, low: 3 };

export function computeExposureScore({
  severity = "medium",
  credentialReach = [],
  dataReach = [],
  toolReach = [],
  egressReach = [],
} = {}) {
  let score = 0;
  score += (SEVERITY_WEIGHT[severity] || 0.5) * 35;        // 0..35
  score += Math.min(20, credentialReach.length * 5);       // 0..20
  score += Math.min(15, dataReach.length * 5);             // 0..15
  score += toolReach.reduce((s, t) => s + (TOOL_WEIGHT[t.tier] || 0), 0); // unbounded but typically <30
  score += Math.min(10, egressReach.length * 2);           // 0..10
  return Math.round(Math.max(0, Math.min(100, score)));
}

// ── Main: compute blast radius for a finding ─────────────────────────────────

export function computeBlastRadius(finding = {}, { allAssets = [], inventory = null } = {}) {
  const evidence = finding.evidence || finding.asset_evidence || [];
  const text     = evidenceToText(evidence);
  const fromText = extractFromText(text);

  // Locate the underlying asset if available
  const asset = allAssets.find(a => a.id === finding.asset_id) || finding.asset || null;

  const credentialReach = [...fromText.credentials];
  const dataReach       = [...fromText.dataAssets];
  const egressReach     = [...fromText.egress];
  const toolReach       = asset ? inferToolReach(asset) : [];

  // Pull from asset metadata too (capabilities / connected stores)
  if (asset) {
    if (Array.isArray(asset.connectedStores)) for (const s of asset.connectedStores) dataReach.push(s);
    if (Array.isArray(asset.envVars))         for (const e of asset.envVars)         credentialReach.push(e);
  }

  // Same-repo correlation: if finding lives in repo X and other assets in repo X
  // reference data stores/credentials, those count too (limited reach inheritance).
  if (finding.repo && Array.isArray(allAssets)) {
    const repoAssets = allAssets.filter(a => a.repo === finding.repo && a.id !== finding.asset_id);
    for (const a of repoAssets.slice(0, 20)) {
      const aText = evidenceToText(a.evidence || []);
      const aExt = extractFromText(aText);
      // Cap inheritance to keep scores realistic
      for (const c of aExt.credentials.slice(0, 5)) credentialReach.push(c);
      for (const d of aExt.dataAssets.slice(0, 5))  dataReach.push(d);
    }
  }

  // Dedupe
  const dedupe = arr => [...new Set(arr)];
  const blastRadius = {
    credentialReach: dedupe(credentialReach).slice(0, 30),
    dataReach:       dedupe(dataReach).slice(0, 30),
    toolReach:       toolReach.slice(0, 30),
    egressReach:     dedupe(egressReach).slice(0, 30),
    processes:       [],
    hosts:           [],
    identities:      asset?.identities || [],
    repo:            finding.repo || asset?.repo || null,
  };

  const exposureScore = computeExposureScore({
    severity:        finding.severity,
    credentialReach: blastRadius.credentialReach,
    dataReach:       blastRadius.dataReach,
    toolReach:       blastRadius.toolReach,
    egressReach:     blastRadius.egressReach,
  });

  return { blastRadius, exposureScore };
}

/**
 * Enrich a list of findings in place with .blastRadius and .exposureScore.
 */
export function annotateFindingsWithBlastRadius(findings = [], inventory = {}) {
  const allAssets = inventory.assets || [];
  return findings.map(f => {
    const { blastRadius, exposureScore } = computeBlastRadius(f, { allAssets, inventory });
    return { ...f, blastRadius, exposureScore };
  });
}

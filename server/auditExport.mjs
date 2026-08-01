// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import { createHash, createHmac } from "node:crypto";
import { getApprovals } from "./ariaMemory.mjs";
import { getDecisionLog, getEvidenceLog } from "./ariaOrchestrator.mjs";
import { getTrustSummary } from "./ariaTrust.mjs";
import { readAuditEvents } from "./auditLog.mjs";
import { getExecutionLog } from "./actionRunner.mjs";

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function digest(value) {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

function referencesDecision(value, decisionId) {
  if (!decisionId) return true;
  if (!value || typeof value !== "object") return false;
  if (value.decision_id === decisionId || value.decisionId === decisionId) return true;
  return Object.values(value).some((entry) => {
    if (Array.isArray(entry)) return entry.some((item) => referencesDecision(item, decisionId));
    return entry && typeof entry === "object" ? referencesDecision(entry, decisionId) : false;
  });
}

export async function buildAuditEvidencePack({ tenantId, decisionId = null, limit = 1000, actor = "operator" } = {}) {
  const tenant = String(tenantId || "tenant-local");
  const safeLimit = Math.min(5000, Math.max(1, Number(limit) || 1000));
  const [decisions, evidence, approvals, trust, auditEvents] = await Promise.all([
    getDecisionLog(tenant, safeLimit),
    getEvidenceLog(tenant, safeLimit),
    getApprovals(tenant),
    getTrustSummary(tenant),
    readAuditEvents({ tenant_id: tenant, limit: safeLimit }),
  ]);
  const executions = getExecutionLog({ limit: safeLimit }).filter((item) => item.tenantId === tenant);
  const selectedDecision = decisionId
    ? decisions.find((item) => item.decision_id === decisionId)
    : null;
  if (decisionId && !selectedDecision) return null;

  const payload = {
    schema_version: "aria.audit-evidence-pack.v1",
    tenant_id: tenant,
    scope: decisionId ? { type: "decision", decision_id: decisionId } : { type: "tenant" },
    generated_at: new Date().toISOString(),
    generated_by: actor,
    records: {
      decisions: decisionId ? [selectedDecision] : decisions,
      evidence: evidence.filter((item) => referencesDecision(item, decisionId)),
      approvals: approvals.filter((item) => referencesDecision(item, decisionId)),
      executions: executions.filter((item) => referencesDecision(item, decisionId)),
      audit_events: auditEvents.filter((item) => referencesDecision(item, decisionId)),
      trust,
    },
  };
  const recordCounts = Object.fromEntries(Object.entries(payload.records).map(([key, value]) => [key, Array.isArray(value) ? value.length : 1]));
  const sha256 = digest(payload);
  const signingKey = String(process.env.ARIA_AUDIT_EXPORT_SIGNING_KEY || "");
  const signature = signingKey.length >= 32
    ? createHmac("sha256", signingKey).update(sha256).digest("hex")
    : null;

  return {
    ...payload,
    manifest: {
      record_counts: recordCounts,
      integrity: {
        canonicalization: "sorted-json-keys",
        digest_algorithm: "sha256",
        digest: sha256,
        signature_algorithm: signature ? "hmac-sha256" : null,
        signature,
        signed: Boolean(signature),
      },
    },
  };
}

export function verifyAuditEvidencePack(pack, signingKey = "") {
  if (!pack?.manifest?.integrity?.digest) return { ok: false, error: "Missing integrity manifest." };
  const { manifest, ...payload } = pack;
  const actualDigest = digest(payload);
  const digestOk = actualDigest === manifest.integrity.digest;
  let signatureOk = null;
  if (manifest.integrity.signed) {
    if (String(signingKey).length < 32) return { ok: false, digest_ok: digestOk, signature_ok: false, error: "Signing key required." };
    const expected = createHmac("sha256", signingKey).update(actualDigest).digest("hex");
    signatureOk = expected === manifest.integrity.signature;
  }
  return { ok: digestOk && signatureOk !== false, digest_ok: digestOk, signature_ok: signatureOk };
}

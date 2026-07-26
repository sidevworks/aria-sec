// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

function choosePrimaryFinding({ findings = [], findingId, assetId } = {}) {
  if (findingId) return findings.find((finding) => finding.id === findingId) || findings[0];
  if (assetId) return findings.find((finding) => finding.asset_id === assetId) || findings[0];
  return findings[0];
}

function assetById(inventory, id) {
  return (inventory.assets || []).find((asset) => asset.id === id);
}

function confidenceFor(finding, asset) {
  const evidenceCount = (asset?.evidence || finding?.evidence || []).length;
  if (finding?.severity === "critical" && evidenceCount > 0) return "high";
  if (finding?.severity === "high") return "medium-high";
  return "medium";
}

export function generateAttackNarrative({ inventory = {}, findings = [], findingId, assetId } = {}) {
  const primary = choosePrimaryFinding({ findings, findingId, assetId });
  if (!primary) {
    return {
      status: "empty",
      summary: "Aria has not found enough AI-SPM evidence to build an attack narrative yet.",
      confidence: "low",
      attack_path: [],
      recommended_actions: ["Connect GitHub or AWS data sources", "Run an AI-SPM scan"],
      evidence: [],
    };
  }

  const asset = assetById(inventory, primary.asset_id) || {};
  const related = findings
    .filter((finding) => finding.repo === primary.repo && finding.id !== primary.id)
    .slice(0, 4);
  const path = [...new Set([...(primary.attack_path || []), ...related.flatMap((finding) => finding.attack_path || [])])].slice(0, 6);
  const actions = [...new Set([...(primary.recommendations || []), ...related.flatMap((finding) => finding.recommendations || [])])].slice(0, 8);
  const relatedTitles = related.map((finding) => finding.title.toLowerCase());

  return {
    status: "ready",
    title: `${primary.severity.toUpperCase()} AI exposure narrative for ${asset.name || primary.asset_name}`,
    summary: `Aria found ${primary.title.toLowerCase()} in ${primary.repo || "the scanned environment"}. ${primary.rationale}`,
    likely_attack_path: path.join(" -> "),
    confidence: confidenceFor(primary, asset),
    blast_radius: relatedTitles.length
      ? `Related signals in the same repository include ${relatedTitles.join(", ")}.`
      : "Blast radius is limited to the evidence currently discovered for this asset.",
    recommended_actions: actions,
    evidence: (asset.evidence || primary.evidence || []).slice(0, 6),
    finding: primary,
    related_findings: related,
  };
}

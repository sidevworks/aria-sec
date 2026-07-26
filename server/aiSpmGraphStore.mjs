// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { persistencePath } from "./persistenceConfig.mjs";

const GRAPH_VERSION = 1;
const GRAPH_FILE = () => persistencePath(["ai-spm-graph.json"], { purpose: "AI-SPM graph persistence" });
const DEFAULT_TTL_HOURS = 24 * 14;

function now() {
  return new Date().toISOString();
}

function safeId(value, fallback) {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function createEmptyGraph() {
  return {
    version: GRAPH_VERSION,
    updated_at: now(),
    nodes: {},
    edges: {},
  };
}

function parsePositiveInt(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
}

function graphRetentionPolicy() {
  return {
    ttlHours: parsePositiveInt(process.env.ARIA_AI_SPM_GRAPH_TTL_HOURS) || DEFAULT_TTL_HOURS,
    maxNodes: parsePositiveInt(process.env.ARIA_AI_SPM_GRAPH_MAX_NODES),
    maxEdges: parsePositiveInt(process.env.ARIA_AI_SPM_GRAPH_MAX_EDGES),
  };
}

function asTimestamp(value) {
  const ts = Date.parse(value || "");
  return Number.isFinite(ts) ? ts : 0;
}

function edgeKey(from, to, type) {
  return `${from}::${type}::${to}`;
}

function ensureGraphShape(raw) {
  if (!raw || typeof raw !== "object") return createEmptyGraph();
  return {
    version: Number(raw.version) || GRAPH_VERSION,
    updated_at: raw.updated_at || now(),
    nodes: raw.nodes && typeof raw.nodes === "object" ? raw.nodes : {},
    edges: raw.edges && typeof raw.edges === "object" ? raw.edges : {},
  };
}

function pruneByTtl(graph, ttlHours) {
  if (!ttlHours) return false;
  const cutoff = Date.now() - ttlHours * 60 * 60 * 1000;
  let changed = false;

  for (const [nodeId, node] of Object.entries(graph.nodes)) {
    if (asTimestamp(node.updated_at) < cutoff) {
      delete graph.nodes[nodeId];
      changed = true;
    }
  }

  for (const [edgeId, edge] of Object.entries(graph.edges)) {
    if (asTimestamp(edge.updated_at) < cutoff) {
      delete graph.edges[edgeId];
      changed = true;
    }
  }
  return changed;
}

function pruneDanglingEdges(graph) {
  let changed = false;
  for (const [edgeId, edge] of Object.entries(graph.edges)) {
    if (!graph.nodes[edge.from] || !graph.nodes[edge.to]) {
      delete graph.edges[edgeId];
      changed = true;
    }
  }
  return changed;
}

function pruneByCap(items, maxCount) {
  if (!maxCount || Object.keys(items).length <= maxCount) return false;
  const keep = new Set(
    Object.entries(items)
      .sort((a, b) => asTimestamp(b[1]?.updated_at) - asTimestamp(a[1]?.updated_at))
      .slice(0, maxCount)
      .map(([id]) => id)
  );
  let changed = false;
  for (const id of Object.keys(items)) {
    if (!keep.has(id)) {
      delete items[id];
      changed = true;
    }
  }
  return changed;
}

function pruneGraph(graph, policy = graphRetentionPolicy()) {
  let changed = false;
  changed = pruneByTtl(graph, policy.ttlHours) || changed;
  changed = pruneByCap(graph.nodes, policy.maxNodes) || changed;
  changed = pruneDanglingEdges(graph) || changed;
  changed = pruneByCap(graph.edges, policy.maxEdges) || changed;
  changed = pruneDanglingEdges(graph) || changed;
  return { graph, changed };
}

export function getAiSpmGraphStorePath() {
  return GRAPH_FILE();
}

export function loadAiSpmGraph() {
  if (!existsSync(GRAPH_FILE())) return createEmptyGraph();
  let graph;
  try {
    const data = JSON.parse(readFileSync(GRAPH_FILE(), "utf8"));
    graph = ensureGraphShape(data);
  } catch {
    return createEmptyGraph();
  }
  const pruned = pruneGraph(graph);
  if (pruned.changed) {
    saveAiSpmGraph(pruned.graph);
  }
  return pruned.graph;
}

export function saveAiSpmGraph(graph) {
  const normalized = ensureGraphShape(graph);
  pruneGraph(normalized);
  normalized.updated_at = now();
  mkdirSync(dirname(GRAPH_FILE()), { recursive: true });
  writeFileSync(GRAPH_FILE(), `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return normalized;
}

function nodeKindForAsset(asset = {}) {
  return asset.type || "asset";
}

function addNode(graph, node) {
  if (!node?.id) return;
  const existing = graph.nodes[node.id] || {};
  graph.nodes[node.id] = {
    ...existing,
    ...node,
    evidence_count: Math.max(Number(existing.evidence_count) || 0, Number(node.evidence_count) || 0),
    updated_at: now(),
  };
}

function addEdge(graph, edge) {
  if (!edge?.from || !edge?.to || !edge?.type) return;
  const key = edgeKey(edge.from, edge.to, edge.type);
  const existing = graph.edges[key] || {};
  graph.edges[key] = {
    ...existing,
    from: edge.from,
    to: edge.to,
    type: edge.type,
    repo: edge.repo || existing.repo || "unknown",
    weight: Math.max(Number(existing.weight) || 1, Number(edge.weight) || 1),
    evidence_count: (Number(existing.evidence_count) || 0) + (Number(edge.evidence_count) || 0),
    updated_at: now(),
  };
}

function findingNodeId(finding = {}) {
  return safeId(finding.id, `finding:unknown:${Math.random().toString(16).slice(2)}`);
}

function findingEvidenceSourceIds(finding = {}) {
  const related = new Set();
  for (const evidence of finding.evidence || []) {
    const source = String(evidence?.source_asset || "").trim();
    if (source) related.add(source);
  }
  return [...related];
}

function findingAttackPathAssetIds(finding = {}) {
  const related = new Set();
  for (const step of finding.attack_path || []) {
    const assetId = String(step?.asset_id || "").trim();
    if (assetId) related.add(assetId);
  }
  return [...related];
}

function addRepoNode(graph, repo) {
  const repoId = `repo:${safeId(repo, "unknown")}`;
  addNode(graph, {
    id: repoId,
    kind: "repository",
    name: safeId(repo, "unknown"),
    repo: safeId(repo, "unknown"),
  });
  return repoId;
}

export function persistAiSpmGraphFromState({ inventory = {}, findings = [], suppressed_findings = [] } = {}) {
  const graph = loadAiSpmGraph();
  const assets = Array.isArray(inventory.assets) ? inventory.assets : [];

  for (const asset of assets) {
    const assetId = safeId(asset.id, "asset:unknown");
    const repo = safeId(asset.repo, "unknown");
    addNode(graph, {
      id: assetId,
      kind: nodeKindForAsset(asset),
      name: asset.name || assetId,
      repo,
      exposure: asset.exposure || "unknown",
      sensitivity: asset.sensitivity || "unknown",
      provider: asset.provider || "unknown",
      capabilities: Array.isArray(asset.capabilities) ? asset.capabilities : [],
      evidence_count: Array.isArray(asset.evidence) ? asset.evidence.length : 0,
    });

    const repoId = addRepoNode(graph, repo);
    addEdge(graph, {
      from: repoId,
      to: assetId,
      type: "contains",
      repo,
      evidence_count: 1,
    });

    if (asset.exposure && asset.exposure !== "unknown") {
      const exposureNodeId = `exposure:${asset.exposure}`;
      addNode(graph, {
        id: exposureNodeId,
        kind: "exposure",
        name: asset.exposure,
        repo,
      });
      addEdge(graph, {
        from: assetId,
        to: exposureNodeId,
        type: "has_exposure",
        repo,
        evidence_count: 1,
      });
    }
  }

  for (const finding of [...findings, ...suppressed_findings]) {
    const findingId = findingNodeId(finding);
    const severity = finding.severity || "unknown";
    const repo = safeId(finding.repo, "unknown");
    addNode(graph, {
      id: findingId,
      kind: "finding",
      name: finding.title || finding.code || findingId,
      repo,
      severity,
      status: finding.decision?.status || "open",
      code: finding.code || "unknown",
      evidence_count: Array.isArray(finding.evidence) ? finding.evidence.length : 0,
    });

    const severityNodeId = `severity:${severity}`;
    addNode(graph, {
      id: severityNodeId,
      kind: "severity",
      name: severity,
      repo,
    });
    addEdge(graph, {
      from: findingId,
      to: severityNodeId,
      type: "has_severity",
      repo,
      evidence_count: 1,
    });

    for (const sourceAssetId of findingEvidenceSourceIds(finding)) {
      addEdge(graph, {
        from: sourceAssetId,
        to: findingId,
        type: "indicates_risk",
        repo,
        evidence_count: 1,
      });
    }

    for (const attackAssetId of findingAttackPathAssetIds(finding)) {
      addEdge(graph, {
        from: findingId,
        to: attackAssetId,
        type: "leads_to",
        repo,
        evidence_count: 1,
      });
      addEdge(graph, {
        from: attackAssetId,
        to: findingId,
        type: "indicates_risk",
        repo,
        evidence_count: 1,
      });
    }
  }

  return saveAiSpmGraph(graph);
}

export function getAiSpmNodeNeighbors(nodeId, { repo } = {}) {
  const graph = loadAiSpmGraph();
  const normalizedNode = String(nodeId || "").trim();
  if (!normalizedNode) return { node: null, neighbors: [] };

  const node = graph.nodes[normalizedNode] || null;
  const neighbors = [];

  for (const edge of Object.values(graph.edges)) {
    if (repo && edge.repo !== repo) continue;
    if (edge.from === normalizedNode && graph.nodes[edge.to]) {
      neighbors.push({ direction: "outbound", edge, node: graph.nodes[edge.to] });
    }
    if (edge.to === normalizedNode && graph.nodes[edge.from]) {
      neighbors.push({ direction: "inbound", edge, node: graph.nodes[edge.from] });
    }
  }

  return { node, neighbors };
}

function isExposedAsset(node) {
  return node?.kind !== "finding" && String(node?.exposure || "unknown") !== "unknown";
}

function isSensitiveTarget(node) {
  const kind = String(node?.kind || "");
  const sensitivity = String(node?.sensitivity || "");
  return kind === "secret" || sensitivity === "sensitive" || sensitivity === "secret";
}

function adjacency(graph, repo) {
  const map = new Map();
  for (const edge of Object.values(graph.edges)) {
    if (repo && edge.repo !== repo) continue;
    if (!map.has(edge.from)) map.set(edge.from, []);
    map.get(edge.from).push(edge);
  }
  return map;
}

export function findAiSpmAttackPathCandidates({ repo, maxDepth = 4 } = {}) {
  const graph = loadAiSpmGraph();
  const nodes = Object.values(graph.nodes).filter((node) => (!repo || node.repo === repo));
  const starts = nodes.filter(isExposedAsset).map((node) => node.id);
  const targets = new Set(nodes.filter(isSensitiveTarget).map((node) => node.id));
  const nextByNode = adjacency(graph, repo);
  const paths = [];

  for (const start of starts) {
    const queue = [{ nodeId: start, edges: [], visited: new Set([start]) }];
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) continue;

      if (targets.has(current.nodeId) && current.edges.length > 0) {
        paths.push({
          repo: repo || graph.nodes[start]?.repo || "unknown",
          from: start,
          to: current.nodeId,
          depth: current.edges.length,
          edges: current.edges,
        });
        continue;
      }

      if (current.edges.length >= maxDepth) continue;
      for (const edge of nextByNode.get(current.nodeId) || []) {
        if (current.visited.has(edge.to)) continue;
        queue.push({
          nodeId: edge.to,
          edges: [...current.edges, edge],
          visited: new Set([...current.visited, edge.to]),
        });
      }
    }
  }

  return paths.sort((a, b) => a.depth - b.depth).slice(0, 25);
}

export function getAiSpmRepoRiskGraphSummary(repo) {
  const graph = loadAiSpmGraph();
  const repoName = String(repo || "").trim();
  const nodes = Object.values(graph.nodes).filter((node) => (!repoName || node.repo === repoName));
  const nodeSet = new Set(nodes.map((node) => node.id));
  const edges = Object.values(graph.edges).filter((edge) => (!repoName || edge.repo === repoName) && nodeSet.has(edge.from) && nodeSet.has(edge.to));

  const byKind = {};
  for (const node of nodes) {
    byKind[node.kind] = (byKind[node.kind] || 0) + 1;
  }

  const byEdgeType = {};
  for (const edge of edges) {
    byEdgeType[edge.type] = (byEdgeType[edge.type] || 0) + 1;
  }

  const path_candidates = findAiSpmAttackPathCandidates({ repo: repoName || undefined }).length;
  return {
    repo: repoName || "all",
    node_count: nodes.length,
    edge_count: edges.length,
    nodes_by_kind: byKind,
    edges_by_type: byEdgeType,
    path_candidates,
    updated_at: graph.updated_at,
  };
}

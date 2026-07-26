// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join, relative } from "node:path";
import { getStoredGithubRepositories, getStoredGithubToken } from "./githubAuthStore.mjs";

const MAX_FILE_BYTES = 250_000;
const MAX_LOCAL_FILES = 900;
const MAX_REMOTE_FILES = 180;
const GITHUB_FETCH_CONCURRENCY = 8;

const IGNORE_DIRS = new Set([
  ".git",
  "aria-memory",
  "dist",
  "node_modules",
  "out",
  "release",
]);

const SCANNABLE_EXTENSIONS = new Set([
  ".cjs",
  ".env",
  ".js",
  ".json",
  ".jsx",
  ".mjs",
  ".md",
  ".py",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml",
]);

const PROVIDER_PATTERNS = [
  { provider: "OpenAI", pattern: /\b(openai|gpt-4|gpt-5|chat\.completions|responses\.create)\b/i },
  { provider: "Anthropic", pattern: /\b(anthropic|claude|messages\.create)\b/i },
  { provider: "Google Gemini", pattern: /\b(gemini|generativelanguage|google\.genai)\b/i },
  { provider: "AWS Bedrock", pattern: /\b(bedrock|InvokeModel|bedrock-runtime)\b/i },
  { provider: "Ollama", pattern: /\b(ollama|localhost:11434)\b/i },
  { provider: "LangChain", pattern: /\b(langchain|LangGraph|langgraph)\b/i },
  { provider: "LlamaIndex", pattern: /\b(llamaindex|llama-index)\b/i },
];

const VECTOR_PATTERNS = [
  { provider: "Pinecone", pattern: /\b(pinecone)\b/i },
  { provider: "Weaviate", pattern: /\b(weaviate)\b/i },
  { provider: "Chroma", pattern: /\b(chromadb|chroma)\b/i },
  { provider: "Qdrant", pattern: /\b(qdrant)\b/i },
  { provider: "pgvector", pattern: /\b(pgvector|vector\s*\()/i },
  { provider: "FAISS", pattern: /\b(faiss)\b/i },
];

const SECRET_PATTERNS = [
  { provider: "OpenAI", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { provider: "Anthropic", pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g },
  { provider: "Google API", pattern: /\bAIza[0-9A-Za-z_-]{25,}\b/g },
  { provider: "AWS Access Key", pattern: /\bAKIA[0-9A-Z]{16}\b/g },
];

const TOOL_PATTERNS = [
  { tool: "shell", pattern: /\b(exec|spawn|system|subprocess|child_process)\b/i },
  { tool: "filesystem", pattern: /\b(readFile|writeFile|readdir|fs\.|open\()\b/i },
  { tool: "network", pattern: /\b(fetch|axios|requests\.|http\.|https\.)\b/i },
  { tool: "browser", pattern: /\b(playwright|puppeteer|browser)\b/i },
];

const WORKFLOW_AI_KEY_PATTERNS = [
  { provider: "OpenAI", pattern: /\b(OPENAI_API_KEY|OPENAI_KEY)\b/i },
  { provider: "Anthropic", pattern: /\b(ANTHROPIC_API_KEY|CLAUDE_API_KEY)\b/i },
  { provider: "Google Gemini", pattern: /\b(GEMINI_API_KEY_V2|GEMINI_API_KEY|GOOGLE_API_KEY)\b/i },
  { provider: "Azure OpenAI", pattern: /\b(AZURE_OPENAI_API_KEY)\b/i },
  { provider: "Mistral", pattern: /\b(MISTRAL_API_KEY)\b/i },
];

const WORKFLOW_AGENT_PATTERNS = [
  { label: "GitHub Copilot coding agent", pattern: /\bcopilot\b/i },
  { label: "OpenAI action or script", pattern: /\bopenai\b/i },
  { label: "Anthropic action or script", pattern: /\banthropic\b/i },
  { label: "Codex or coding agent workflow", pattern: /\bcodex\b/i },
  { label: "External shell bootstrap", pattern: /\b(curl\s+[^|\n]+\|\s*(bash|sh)|wget\s+[^|\n]+\|\s*(bash|sh))\b/i },
];

function now() {
  return new Date().toISOString();
}

function readCommand(command, args) {
  try {
    return execFileSync(command, args, {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function githubTokenFromCli() {
  if (process.env.ARIA_AI_SPM_DISABLE_GH_AUTO === "1") return "";
  return readCommand("gh", ["auth", "token"]);
}

function githubRepoFromRemote() {
  if (process.env.ARIA_AI_SPM_DISABLE_GH_AUTO === "1") return "";
  const remote = readCommand("git", ["config", "--get", "remote.origin.url"]);
  const match = remote.match(/github\.com[:/](?<owner>[^/\s]+)\/(?<repo>[^/\s.]+)(?:\.git)?$/i);
  if (!match?.groups) return "";
  return `${match.groups.owner}/${match.groups.repo}`;
}

function dotEnvValue(key) {
  const envPath = join(process.cwd(), ".env");
  if (!existsSync(envPath)) return "";

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  const match = lines.find((line) => line.trim().startsWith(`${key}=`));
  if (!match) return "";

  return match.slice(match.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}

function repoListFromEnv() {
  return (process.env.GITHUB_REPOSITORIES || dotEnvValue("GITHUB_REPOSITORIES") || "")
    .split(",")
    .map((repo) => repo.trim())
    .filter(Boolean);
}

function maskSecret(value) {
  if (!value || value.length <= 12) return "redacted";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function redactSecrets(text) {
  return SECRET_PATTERNS.reduce(
    (value, { pattern }) => value.replace(pattern, (match) => maskSecret(match)),
    text || ""
  );
}

function fingerprint(value) {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function lineNumberFor(content, index) {
  return content.slice(0, index).split(/\r?\n/).length;
}

function evidenceFor(content, index) {
  const start = Math.max(0, index - 70);
  const end = Math.min(content.length, index + 110);
  return redactSecrets(content.slice(start, end)).replace(/\s+/g, " ").trim();
}

function isScannable(path) {
  const base = basename(path);
  return base.startsWith(".env") || SCANNABLE_EXTENSIONS.has(extname(path));
}

function isIgnoredPath(path) {
  return path.split("/").some((part) => IGNORE_DIRS.has(part));
}

function pathPriority(path) {
  if (/^(src|server|app|pages|api|lib|packages)\//.test(path)) return 0;
  if (/(prompt|agent|chain|llm|ai|rag|model|tool)/i.test(path)) return 1;
  if (/^(package\.json|requirements\.txt|pyproject\.toml|\.env\.example)$/.test(path)) return 2;
  if (/^(docs|test|public)\//.test(path)) return 4;
  return 3;
}

function isLocalEnvSecret(path) {
  const base = basename(path);
  return base === ".env" || (base.startsWith(".env.") && base !== ".env.example");
}

function collectLocalFiles(root) {
  const files = [];

  function walk(dir) {
    if (files.length >= MAX_LOCAL_FILES) return;

    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (files.length >= MAX_LOCAL_FILES) return;
      if (entry.isDirectory()) {
        if (!IGNORE_DIRS.has(entry.name)) {
          walk(join(dir, entry.name));
        }
        continue;
      }

      if (!entry.isFile()) continue;
      const path = join(dir, entry.name);
      if (isIgnoredPath(relative(root, path))) continue;
      if (isLocalEnvSecret(path)) continue;
      if (!isScannable(path)) continue;
      if (statSync(path).size > MAX_FILE_BYTES) continue;
      files.push(path);
    }
  }

  if (existsSync(root)) walk(root);
  return files;
}

function addAsset(assets, asset) {
  const existing = assets.find((item) => item.id === asset.id);
  if (existing) {
    existing.evidence.push(...asset.evidence);
    existing.capabilities = [...new Set([...(existing.capabilities || []), ...(asset.capabilities || [])])];
    existing.files = [...new Set([...(existing.files || []), ...(asset.files || [])])];
    return;
  }
  assets.push(asset);
}

function inspectFile({ content, path, repo, source }) {
  const assets = [];
  const relPath = path;
  const isPromptFile = /prompt|system-message|instructions/i.test(basename(relPath));
  const tools = TOOL_PATTERNS.filter(({ pattern }) => pattern.test(content)).map(({ tool }) => tool);
  const sensitivity = /\b(customer|payment|patient|regulated|secret|credential|token|ssn|pii|phi|pci)\b/i.test(content)
    ? "sensitive"
    : "unknown";
  const isWorkflowFile = /^\.github\/workflows\/.+\.(ya?ml)$/i.test(relPath);

  if (isWorkflowFile) {
    const workflowAssets = inspectWorkflowFile({ content, path: relPath, repo, source });
    for (const asset of workflowAssets) {
      addAsset(assets, asset);
    }
  }

  for (const { provider, pattern } of PROVIDER_PATTERNS) {
    const match = content.match(pattern);
    if (!match) continue;
    addAsset(assets, {
      id: `ai-system:${repo}:${provider.toLowerCase().replace(/\W+/g, "-")}:${relPath}`,
      type: "ai_system",
      name: `${provider} usage in ${basename(relPath)}`,
      provider,
      repo,
      source,
      files: [relPath],
      capabilities: tools,
      sensitivity,
      exposure: source === "github-api" ? "repository" : "local-code",
      evidence: [{
        path: relPath,
        line: lineNumberFor(content, content.indexOf(match[0])),
        signal: `${provider} AI usage`,
        snippet: evidenceFor(content, content.indexOf(match[0])),
      }],
    });
  }

  for (const { provider, pattern } of VECTOR_PATTERNS) {
    const match = content.match(pattern);
    if (!match) continue;
    addAsset(assets, {
      id: `vector-store:${repo}:${provider.toLowerCase().replace(/\W+/g, "-")}:${relPath}`,
      type: "vector_store",
      name: `${provider} vector store reference`,
      provider,
      repo,
      source,
      files: [relPath],
      capabilities: ["retrieval"],
      sensitivity,
      exposure: "data-plane",
      evidence: [{
        path: relPath,
        line: lineNumberFor(content, content.indexOf(match[0])),
        signal: `${provider} vector store usage`,
        snippet: evidenceFor(content, content.indexOf(match[0])),
      }],
    });
  }

  for (const { provider, pattern } of SECRET_PATTERNS) {
    for (const match of content.matchAll(pattern)) {
      addAsset(assets, {
        id: `secret:${repo}:${provider.toLowerCase().replace(/\W+/g, "-")}:${fingerprint(match[0])}`,
        type: "secret",
        name: `${provider} credential material`,
        provider,
        repo,
        source,
        files: [relPath],
        capabilities: ["model-access"],
        sensitivity: "secret",
        exposure: "source-code",
        evidence: [{
          path: relPath,
          line: lineNumberFor(content, match.index || 0),
          signal: `${provider} secret pattern`,
          snippet: evidenceFor(content, match.index || 0),
          fingerprint: fingerprint(match[0]),
        }],
      });
    }
  }

  if (isPromptFile) {
    addAsset(assets, {
      id: `prompt:${repo}:${relPath}`,
      type: "prompt",
      name: `Prompt artifact in ${basename(relPath)}`,
      provider: "unknown",
      repo,
      source,
      files: [relPath],
      capabilities: [],
      sensitivity,
      exposure: "source-code",
      evidence: [{
        path: relPath,
        line: 1,
        signal: "Prompt-like file name",
        snippet: redactSecrets(content.slice(0, 180)).replace(/\s+/g, " ").trim(),
      }],
    });
  }

  if (tools.length >= 2 && /\b(agent|tool|functionCalling|function_call|tools\s*:)\b/i.test(content)) {
    addAsset(assets, {
      id: `agent:${repo}:${relPath}`,
      type: "agent",
      name: `Agentic tool surface in ${basename(relPath)}`,
      provider: "unknown",
      repo,
      source,
      files: [relPath],
      capabilities: tools,
      sensitivity,
      exposure: "runtime-tools",
      evidence: [{
        path: relPath,
        line: 1,
        signal: "Agent tool-use surface",
        snippet: redactSecrets(content.slice(0, 220)).replace(/\s+/g, " ").trim(),
      }],
    });
  }

  return assets;
}

function inspectWorkflowFile({ content, path, repo, source }) {
  const assets = [];
  const lowered = content.toLowerCase();
  const evidence = (signal, probe) => {
    const idx = typeof probe === "number" ? probe : Math.max(content.search(probe), 0);
    return {
      path,
      line: lineNumberFor(content, idx),
      signal,
      snippet: evidenceFor(content, idx),
    };
  };
  const addWorkflowRisk = ({ code, name, severityHint, signal, probe, capabilities = [] }) => {
    addAsset(assets, {
      id: `ci-workflow:${repo}:${path}:${code}`,
      type: "ci_workflow",
      subtype: code,
      name,
      provider: "github-actions",
      repo,
      source,
      files: [path],
      capabilities,
      sensitivity: severityHint,
      exposure: "cicd",
      evidence: [evidence(signal, probe)],
    });
  };

  for (const { provider, pattern } of WORKFLOW_AI_KEY_PATTERNS) {
    const match = content.match(pattern);
    if (!match) continue;
    addWorkflowRisk({
      code: "ai-provider-key-usage",
      name: "Workflow references AI provider key material",
      severityHint: "sensitive",
      signal: `${provider} key variable referenced in workflow`,
      probe: pattern,
      capabilities: ["secret-handling", "ai-provider-access"],
    });
  }

  const dangerousSecretPatterns = [
    /\becho\s+.*\${{\s*secrets\.[^}]+}}\s*(>>?|[|])/i,
    /\b(printenv|env)\b/i,
    /\b::set-output\b/i,
    /\bupload-artifact\b/i,
  ];
  for (const pattern of dangerousSecretPatterns) {
    if (!pattern.test(content)) continue;
    addWorkflowRisk({
      code: "dangerous-secret-handling",
      name: "Workflow may expose secrets in logs or artifacts",
      severityHint: "sensitive",
      signal: "Potential secret exfiltration behavior in workflow steps",
      probe: pattern,
      capabilities: ["secret-handling", "log-exposure"],
    });
    break;
  }

  if (/\bon:\s*pull_request_target\b/i.test(content) && /\b(actions\/checkout|run:)\b/i.test(content)) {
    addWorkflowRisk({
      code: "untrusted-pr-execution",
      name: "Workflow may execute with elevated context on untrusted PRs",
      severityHint: "sensitive",
      signal: "pull_request_target combined with checkout/run behavior",
      probe: /\bpull_request_target\b/i,
      capabilities: ["pr-execution", "token-exposure"],
    });
  }

  const permissionOverreachPatterns = [
    /\bpermissions\s*:\s*write-all\b/i,
    /\bcontents\s*:\s*write\b/i,
    /\bactions\s*:\s*write\b/i,
    /\bid-token\s*:\s*write\b/i,
  ];
  for (const pattern of permissionOverreachPatterns) {
    if (!pattern.test(content)) continue;
    addWorkflowRisk({
      code: "token-permission-overreach",
      name: "Workflow token permissions may exceed least privilege",
      severityHint: "sensitive",
      signal: "Broad GitHub token permission detected in workflow",
      probe: pattern,
      capabilities: ["token-permissions", "repo-write"],
    });
    break;
  }

  // GH-006: hardcoded secret detection near sensitive key names
  const hardcodedSecretNearKey = /(?:key|token|secret|password)\s*[:=]\s*["']?([A-Za-z0-9+/]{40,}=*)["']?/gi;
  for (const match of content.matchAll(hardcodedSecretNearKey)) {
    addWorkflowRisk({
      code: "hardcoded-secret-in-workflow",
      name: "Potential hardcoded secret detected in workflow",
      severityHint: "sensitive",
      signal: "High-entropy value near key/token/secret/password field in workflow",
      probe: match.index || 0,
      capabilities: ["secret-exposure"],
    });
    break;
  }

  // GH-007: pull_request_target without repo identity guard
  if (/pull_request_target/i.test(content) && !/if\s*:\s*github\.event\.pull_request\.head\.repo\.full_name\s*==\s*github\.repository/i.test(content)) {
    addWorkflowRisk({
      code: "pull-request-target-unguarded",
      name: "pull_request_target trigger lacks repo identity guard",
      severityHint: "sensitive",
      signal: "pull_request_target used without checking github.event.pull_request.head.repo.full_name == github.repository",
      probe: /pull_request_target/i,
      capabilities: ["pr-execution", "token-exposure"],
    });
  }


  for (const { label, pattern } of WORKFLOW_AGENT_PATTERNS) {
    const match = content.match(pattern);
    if (!match) continue;
    addWorkflowRisk({
      code: "agentic-tool-surface",
      name: "Workflow exposes external AI/tooling execution surface",
      severityHint: "unknown",
      signal: label,
      probe: pattern,
      capabilities: ["agentic-execution", "external-tools"],
    });
  }

  if (lowered.includes("pull_request_target") && lowered.includes("id-token: write")) {
    addWorkflowRisk({
      code: "oidc-pr-target-combo",
      name: "Workflow combines pull_request_target with OIDC write",
      severityHint: "sensitive",
      signal: "High-risk trust boundary: untrusted PR event with OIDC token minting",
      probe: lowered.indexOf("pull_request_target"),
      capabilities: ["federated-identity", "pr-execution"],
    });
  }

  return assets;
}

export function scanLocalRepository({ root = process.cwd(), repoName = basename(root) } = {}) {
  const files = collectLocalFiles(root);
  const assets = [];

  for (const file of files) {
    const content = readFileSync(file, "utf8");
    const relativePath = relative(root, file);
    for (const asset of inspectFile({ content, path: relativePath, repo: repoName, source: "local-repository" })) {
      addAsset(assets, asset);
    }
  }

  return {
    connector: "github",
    mode: "local-repository",
    repo: repoName,
    scanned_at: now(),
    files_scanned: files.length,
    assets,
  };
}

async function githubJson(url, token) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub API failed ${response.status} for ${url}`);
  }
  return response.json();
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await mapper(items[current], current);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function scanGithubRepositories({ token = process.env.GITHUB_TOKEN || "", repos = [] } = {}) {
  const assets = [];
  const scanned = [];
  const errors = [];

  for (const repo of repos) {
    try {
      const repoMeta = await githubJson(`https://api.github.com/repos/${repo}`, token);
      const branch = repoMeta.default_branch || "main";
      const tree = await githubJson(`https://api.github.com/repos/${repo}/git/trees/${branch}?recursive=1`, token);
      const files = (tree.tree || [])
        .filter((item) => item.type === "blob" && !isIgnoredPath(item.path) && isScannable(item.path) && Number(item.size || 0) <= MAX_FILE_BYTES)
        .sort((a, b) => pathPriority(a.path) - pathPriority(b.path) || a.path.localeCompare(b.path))
        .slice(0, MAX_REMOTE_FILES);

      scanned.push({ repo, files_scanned: files.length, status: "scanned" });

      const inspected = await mapWithConcurrency(files, GITHUB_FETCH_CONCURRENCY, async (file) => {
        const blob = await githubJson(`https://api.github.com/repos/${repo}/git/blobs/${file.sha}`, token);
        const content = Buffer.from(blob.content || "", "base64").toString("utf8");
        return inspectFile({ content, path: file.path, repo, source: "github-api" });
      });

      for (const fileAssets of inspected) {
        for (const asset of fileAssets || []) {
          addAsset(assets, asset);
        }
      }
    } catch (error) {
      const message = error?.message || "unknown GitHub scan error";
      errors.push({ repo, error: message });
      scanned.push({ repo, files_scanned: 0, status: "error", error: message });
    }
  }

  const scannedCount = scanned.filter((repo) => repo.status !== "error").length;
  const mode = errors.length && scannedCount === 0
    ? "error"
    : errors.length
    ? "github-api-partial"
    : "github-api";

  return {
    connector: "github",
    mode,
    scanned_at: now(),
    repositories: scanned,
    repository_errors: errors,
    message: errors.length
      ? `Scanned ${scannedCount}/${repos.length} repositories; ${errors.length} failed.`
      : `Scanned ${scannedCount} repositories.`,
    assets,
  };
}

export async function discoverGithubAiAssets(options = {}) {
  const token = options.token || getStoredGithubToken() || process.env.GITHUB_TOKEN || dotEnvValue("GITHUB_TOKEN") || githubTokenFromCli();
  const storedRepos = getStoredGithubRepositories();
  const repos = options.repos || (storedRepos.length ? storedRepos : repoListFromEnv());
  const targetRepos = repos.length > 0 ? repos : [githubRepoFromRemote()].filter(Boolean);

  if (token && targetRepos.length > 0) {
    return scanGithubRepositories({ token, repos: targetRepos });
  }

  return scanLocalRepository(options);
}

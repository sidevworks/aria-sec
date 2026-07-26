// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

/**
 * githubPullRequest.mjs — Phase 2.3: open a remediation PR on a connected repo.
 *
 * Never pushes to main. Creates a branch off default, commits the artifact body
 * as a single file, opens a PR with the finding context in the description.
 */

import { getStoredGithubToken } from "./githubAuthStore.mjs";

const GH_API = "https://api.github.com";

async function gh(path, { method = "GET", body, token } = {}) {
  const t = token || getStoredGithubToken();
  if (!t) throw new Error("GitHub not connected — no access token available");
  const res = await fetch(`${GH_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${t}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "ARIA-Guardian",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GitHub ${method} ${path} failed: ${res.status} ${text.slice(0, 200)}`);
  }
  return res.json();
}

function nowSlug() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}-${String(d.getHours()).padStart(2,"0")}${String(d.getMinutes()).padStart(2,"0")}`;
}

/**
 * Open a remediation PR.
 *
 * opts: {
 *   repo:        "owner/name"     (required)
 *   filename:    "src/foo.js"     (path in repo where to write artifact)
 *   content:     "file body…"     (the artifact body)
 *   title:       "PR title"
 *   description: "PR body markdown"
 *   findingId:   "AI-SPM finding id"
 * }
 *
 * Returns: { number, html_url, branch }
 */
export async function openRemediationPR({
  repo,
  filename,
  content,
  title = "ARIA: AI-SPM remediation",
  description = "Automated remediation from ARIA",
  findingId = null,
} = {}) {
  if (!repo || !repo.includes("/")) throw new Error("repo must be in 'owner/name' form");
  if (!filename) throw new Error("filename required");
  if (!content)  throw new Error("content required");

  const [owner, name] = repo.split("/");

  // 1. Get default branch SHA
  const repoInfo = await gh(`/repos/${owner}/${name}`);
  const defaultBranch = repoInfo.default_branch || "main";
  const ref = await gh(`/repos/${owner}/${name}/git/ref/heads/${defaultBranch}`);
  const baseSha = ref.object.sha;

  // 2. Create a new branch
  const branch = `aria/remediation-${findingId ? findingId.slice(0, 16).replace(/[^a-zA-Z0-9-]/g, "-") : nowSlug()}`;
  await gh(`/repos/${owner}/${name}/git/refs`, {
    method: "POST",
    body: { ref: `refs/heads/${branch}`, sha: baseSha },
  });

  // 3. Get or skip existing file SHA (PUT contents needs SHA if file exists)
  let existingSha = null;
  try {
    const existing = await gh(`/repos/${owner}/${name}/contents/${encodeURIComponent(filename)}?ref=${branch}`);
    existingSha = existing.sha;
  } catch { /* file doesn't exist */ }

  // 4. Put the file content on the new branch
  await gh(`/repos/${owner}/${name}/contents/${encodeURIComponent(filename)}`, {
    method: "PUT",
    body: {
      message: `ARIA: ${title}`,
      content: Buffer.from(content, "utf8").toString("base64"),
      branch,
      ...(existingSha ? { sha: existingSha } : {}),
    },
  });

  // 5. Open the PR
  const pr = await gh(`/repos/${owner}/${name}/pulls`, {
    method: "POST",
    body: {
      title,
      body: description,
      head: branch,
      base: defaultBranch,
      maintainer_can_modify: true,
    },
  });

  return {
    number: pr.number,
    html_url: pr.html_url,
    branch,
    repo,
  };
}

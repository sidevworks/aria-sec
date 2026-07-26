// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const serverSource = await readFile(new URL("../../server/index.mjs", import.meta.url), "utf8").catch(() => "");
const dataSource = await readFile(new URL("../../server/ariaData.mjs", import.meta.url), "utf8").catch(() => "");
const appSource = await readFile(new URL("../../src/App.jsx", import.meta.url), "utf8");
const viteSource = await readFile(new URL("../../vite.config.js", import.meta.url), "utf8").catch(() => "");

test("server declares real function tools for Aria actions", () => {
  assert.match(serverSource, /functionDeclarations/);
  assert.match(serverSource, /get_monitoring_snapshot/);
  assert.match(serverSource, /run_scan/);
  assert.match(serverSource, /isolate_threat/);
  assert.match(serverSource, /generate_incident_report/);
  assert.match(serverSource, /open_destination/);
});

test("server executes local function routing and summarises action results", () => {
  assert.match(serverSource, /runAriaCommand/);
  assert.match(serverSource, /executeAriaFunction/);
  assert.match(serverSource, /inferAriaFunction/);
  assert.match(serverSource, /summarizeLocalFunction/);
  assert.match(serverSource, /local-artifact-scan/);
  assert.match(serverSource, /host-isolation-plan/);
});

test("server owns Gemini platform credentials and ElevenLabs voice credentials", () => {
  assert.match(serverSource, /process\.env\.GEMINI_API_KEY_V2/);
  assert.match(serverSource, /callGeminiText/);
  assert.match(serverSource, /callOrchestratorGemini/);
  assert.match(serverSource, /process\.env\.ELEVENLABS_API_KEY/);
  assert.match(serverSource, /eleven_flash_v2_5/);
  assert.match(serverSource, /ARIAVOICE/);
  assert.match(appSource, /ARIA_API_BASE/);
  assert.doesNotMatch(appSource, /http:\/\/localhost:5000/);
  assert.doesNotMatch(appSource, /GEMINI_TEXT_URL/);
  assert.doesNotMatch(appSource, /askGeminiJson/);
  assert.doesNotMatch(appSource, /\/api\/gemini\/live/);
});

test("Aria local data exposes enterprise monitoring primitives", () => {
  assert.match(dataSource, /getMonitoringSnapshot/);
  assert.match(dataSource, /runScan/);
  assert.match(dataSource, /isolateThreat/);
  assert.match(dataSource, /generateIncidentReport/);
  assert.match(dataSource, /getLiveEvents/);
  assert.match(dataSource, /scanLocalHostArtifacts/);
  assert.match(dataSource, /stageHostIsolation/);
});

test("local dev serves ARIA API through vite proxy", () => {
  assert.match(serverSource, /export async function handleAriaRequest/);
  assert.match(serverSource, /apiPath/);
  assert.match(viteSource, /proxy/);
  assert.match(viteSource, /ariaApiTarget/);
  assert.match(viteSource, /http:\/\/127\.0\.0\.1:\$\{ariaApiPort\}/);
});

// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { collectLiveTelemetry } from "../../server/liveTelemetry.mjs";

const appSource = await readFile(new URL("../../src/App.jsx", import.meta.url), "utf8");
const dataSource = await readFile(new URL("../../server/ariaData.mjs", import.meta.url), "utf8");

test("live telemetry collector returns source-backed production panel data", async () => {
  const snapshot = await collectLiveTelemetry();

  assert.equal(snapshot.simulated, false);
  assert.match(snapshot.generated_at, /^\d{4}-\d{2}-\d{2}T/);
  assert.ok(snapshot.summary.sources.length >= 4);
  assert.ok(snapshot.panels.overview.metrics.length >= 4);
  assert.ok(snapshot.panels["system-health"].processes.length > 0);
  assert.ok(Array.isArray(snapshot.panels["system-health"].top_cpu));
  assert.ok(Array.isArray(snapshot.panels["system-health"].top_memory));
  assert.ok(Array.isArray(snapshot.panels["system-health"].top_disks));
  assert.ok(snapshot.panels.network.connections.length >= 0);
  assert.ok(snapshot.panels["live-logs"].events.length >= 0);
  assert.ok(Array.isArray(snapshot.panels["blocked-ips"].items));
  assert.ok(snapshot.panels["blocked-ips"].connector);
  assert.ok(snapshot.panels.actions.available.length >= 4);

  for (const source of snapshot.summary.sources) {
    assert.ok(source.id);
    assert.ok(source.label);
    assert.match(source.status, /live|limited|unconfigured|error/);
    assert.ok(source.last_seen);
  }
});

test("production ARIA sources do not contain seeded incident fixture data", () => {
  const forbidden = [
    "Ransomware execution blocked on DESKTOP-7X9",
    "invoice_2024.pdf.exe",
    "svchost_update.exe",
    "45.89.134.22",
    "94.102.49.190",
    "Critical incident language is visible on the analyst screen",
  ];

  for (const phrase of forbidden) {
    assert.doesNotMatch(appSource, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(dataSource, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("frontend panels are driven by livePanelData from the local API", () => {
  assert.match(appSource, /livePanelData/);
  assert.match(appSource, /setLivePanelData/);
  assert.match(appSource, /panels\?\.overview/);
  assert.doesNotMatch(appSource, /const BLOCKED_IPS =/);
  assert.doesNotMatch(appSource, /const QUARANTINE_FILES =/);
  assert.doesNotMatch(appSource, /const INCIDENTS =/);
  assert.doesNotMatch(appSource, /const NETWORK_CONNS =/);
  assert.doesNotMatch(appSource, /const THREAT_VECTORS =/);
  assert.doesNotMatch(appSource, /const LOG_LINES =/);
});

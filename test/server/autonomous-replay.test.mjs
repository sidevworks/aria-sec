// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import assert from "node:assert/strict";
import test from "node:test";
import { feed, getAutonomousReplayEvents } from "../../server/autonomousResponse.mjs";

test("autonomous response signals are persisted for deterministic replay without meta values", async () => {
  const tenantId = "tenant-replay-test";
  await feed({
    type: "network_event",
    sourceIp: "192.0.2.55",
    endpoint: "/restricted/admin",
    tenantId,
    meta: { credential: "must-not-persist", protocol: "https" },
  });

  const events = getAutonomousReplayEvents({ tenantId, limit: 20 });
  const event = events.find((item) => item.sourceIp === "192.0.2.55");
  assert.ok(event);
  assert.equal(event.type, "network_event");
  assert.deepEqual(event.meta_keys.sort(), ["credential", "protocol"]);
  assert.doesNotMatch(JSON.stringify(event), /must-not-persist/);
});

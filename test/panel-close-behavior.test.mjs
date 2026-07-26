// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import assert from "node:assert/strict";
import test from "node:test";

import { getPanelCloseState } from "../src/panelCloseBehavior.js";

test("panel close keeps the operator in the current sector cluster without travel", () => {
  const state = getPanelCloseState({ activeSector: "identity" });

  assert.equal(state.dashVisible, false);
  assert.equal(state.activeDashPanel, null);
  assert.equal(state.ariaState, "panel_select");
  assert.equal(state.shouldTravel, false);
});

test("panel close from top-level returns to idle without travel", () => {
  const state = getPanelCloseState({ activeSector: null });

  assert.equal(state.dashVisible, false);
  assert.equal(state.activeDashPanel, null);
  assert.equal(state.ariaState, "idle");
  assert.equal(state.shouldTravel, false);
});

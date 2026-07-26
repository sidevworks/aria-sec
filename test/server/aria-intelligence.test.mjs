// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAriaIntelligencePrompt,
  runAriaIntelligence,
} from "../../server/ariaIntelligence.mjs";

const context = {
  route: {
    activePanel: { id: "identity-galaxy", label: "Identity Galaxy Map" },
    activeSector: { id: "identity", label: "Identity & Access" },
    modelMode: "gemini",
  },
  metrics: { threatLevel: "CRITICAL", riskScore: 87, reviewItems: ["Impossible travel"] },
  identity: {
    selected: { name: "Infinix-GT-30-Pro", ip: "192.168.8.73", risk: 29 },
    sessionCount: 6,
  },
  sourceHealth: { counts: { live: 6, stale: 1, unavailable: 0, unknown: 0 } },
  network: { activeScan: { status: "complete", discoveredHosts: 5 } },
  flags: { demoData: false, staleData: false, unavailableData: false },
};

test("runAriaIntelligence converts navigation utterances into concise navigation intents", async () => {
  const result = await runAriaIntelligence({
    utterance: "take me to the threat sector",
    context,
    callAI: async () => { throw new Error("AI should not be called for deterministic navigation"); },
  });

  assert.equal(result.status, "navigation");
  assert.equal(result.navigation.panel_id, "threat-overview");
  assert.match(result.response, /opening threat overview/i);
  assert.equal(result.should_speak, true);
  assert.equal(result.response.split(/\s+/).length < 12, true);
});

test("runAriaIntelligence answers current-panel questions from realtime context", async () => {
  let prompt = "";
  const result = await runAriaIntelligence({
    utterance: "what can you tell me about this?",
    context,
    model_mode: "gemini",
    callAI: async (nextPrompt, options) => {
      prompt = nextPrompt;
      assert.equal(options.mode, "gemini");
      return { text: "You are on Identity Galaxy. Risk is critical at 87, with Infinix-GT-30-Pro selected.", source: "gemini", model: "gemini-2.5-flash" };
    },
  });

  assert.equal(result.status, "answered");
  assert.equal(result.ai_source, "gemini");
  assert.match(result.response, /Identity Galaxy/i);
  assert.match(prompt, /Identity Galaxy Map/);
  assert.match(prompt, /Infinix-GT-30-Pro/);
  assert.doesNotMatch(result.response, /give me.*context/i);
});

test("buildAriaIntelligencePrompt keeps ARIA concise and context-bound", () => {
  const prompt = buildAriaIntelligencePrompt({ utterance: "what do you see?", context });

  assert.match(prompt, /current platform context/i);
  assert.match(prompt, /do not ask the operator for context/i);
  assert.match(prompt, /CRITICAL/);
  assert.match(prompt, /Identity Galaxy Map/);
});

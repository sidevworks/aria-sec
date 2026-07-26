// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");

test("Live ARIA speaks through the local ElevenLabs TTS route", () => {
  assert.match(source, /\/api\/tts/);
  assert.match(source, /MediaSource/);
  assert.match(source, /audio\/mpeg/);
  assert.doesNotMatch(source, /\/api\/gemini\/live/);
  assert.doesNotMatch(source, /new WebSocket/);
});

test("ARIA speech never falls back to browser speech synthesis", () => {
  assert.doesNotMatch(source, /speechSynthesis/);
  assert.doesNotMatch(source, /SpeechSynthesisUtterance/);
});

test("UI navigation confirmations are spoken through realtime Live ARIA", () => {
  assert.match(source, /speakARIARealtime/);
  assert.doesNotMatch(source, /speakARIA\(/);
});

test("open interface clears stale Aria action panel before showing nodes", () => {
  assert.match(
    source,
    /matchesIntentPhrase\(normalized, "open panel"\)[\s\S]*?closeActionPanel\(\);[\s\S]*?setDashVisible\(false\);[\s\S]*?setActiveDashPanel\(null\);[\s\S]*?setAriaState\("panel_select"\);/
  );
});

test("Aria monitoring and actions route through the local function API", () => {
  assert.match(source, /ARIA_API_BASE/);
  assert.match(source, /\/api\/live/);
  assert.match(source, /\/api\/aria\/command/);
  assert.match(source, /\/api\/aria\/suggestions/);
  assert.doesNotMatch(source, /GEMINI_TEXT_URL/);
  assert.doesNotMatch(source, /askGeminiJson/);
  assert.doesNotMatch(source, /\/api\/gemini\/live/);
});

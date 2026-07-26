// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const server = await readFile(new URL("../server/index.mjs", import.meta.url), "utf8");
const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");

test("Gemini Flash is the default and Opus remains an explicit cloud mode", () => {
  assert.match(server, /async function callAI\(prompt, \{ mode = "gemini"/);
  assert.match(server, /DEFAULT_CLOUD_MODEL\s*=\s*"claude-opus-4-8"/);
  assert.match(app, /useState\("gemini"\)/);
});

test("voice conversation uses local Whisper STT, Flash streaming, and opt-in v3", () => {
  assert.match(app, /\/api\/voice\/stt/);
  assert.doesNotMatch(app, /window\.SpeechRecognition|window\.webkitSpeechRecognition/);
  assert.match(server, /ELEVENLABS_CONVERSATION_MODEL[^;]+eleven_flash_v2_5/);
  assert.match(server, /ELEVENLABS_EXPRESSIVE_MODEL[^;]+eleven_v3/);
  assert.match(server, /expressive[\s\S]+ELEVENLABS_EXPRESSIVE_MODEL[\s\S]+realtime[\s\S]+ELEVENLABS_CONVERSATION_MODEL/);
  assert.doesNotMatch(server, /await elevenRes\.arrayBuffer\(\)/);
  assert.match(server, /for await \(const chunk of elevenRes\.body\)/);
});

// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import assert from "node:assert/strict";
import test from "node:test";

import { combineAudioChunks, float32ToPcm16, resampleMono } from "../src/voice/localStt.js";

test("local STT audio helpers combine and resample microphone frames", () => {
  const combined = combineAudioChunks([
    new Float32Array([0, 0.25]),
    new Float32Array([0.5, 1]),
  ]);
  assert.deepEqual([...combined], [0, 0.25, 0.5, 1]);
  assert.equal(resampleMono(combined, 32000, 16000).length, 2);
});

test("local STT audio helper emits little-endian signed PCM16", () => {
  const pcm = float32ToPcm16(new Float32Array([-1, 0, 1]));
  const view = new DataView(pcm);
  assert.equal(view.getInt16(0, true), -32768);
  assert.equal(view.getInt16(2, true), 0);
  assert.equal(view.getInt16(4, true), 32767);
});

#!/usr/bin/env node
// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import { mkdirSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { pipeline, env } from "@xenova/transformers";

const model = process.env.WHISPER_MODEL || "Xenova/whisper-small";
const persistenceRoot = process.env.ARIA_PERSISTENCE_DIR || "./aria-memory";
const resolvedRoot = isAbsolute(persistenceRoot)
  ? persistenceRoot
  : join(process.cwd(), persistenceRoot);
const cacheDir = join(resolvedRoot, "models");

mkdirSync(cacheDir, { recursive: true });
env.cacheDir = cacheDir;
env.allowLocalModels = true;
env.allowRemoteModels = true;

process.stdout.write(`Caching ${model} in ${cacheDir}\n`);
await pipeline("automatic-speech-recognition", model, {
  quantized: true,
});
process.stdout.write("Whisper model cache ready\n");

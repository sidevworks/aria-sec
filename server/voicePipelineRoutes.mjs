// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

// voicePipelineRoutes.mjs — local voice pipeline (STT only)
// Audio never leaves the operator's network.
// STT: Whisper via @xenova/transformers (runs in-process, no external API)

import { authorizeRequest } from "./authz.mjs";

const WHISPER_MODEL = process.env.WHISPER_MODEL || "Xenova/whisper-small";
const MODELS_CACHE_DIR = process.env.ARIA_PERSISTENCE_DIR
  ? `${process.env.ARIA_PERSISTENCE_DIR}/models`
  : "./aria-memory/models";

// ─── Whisper (lazy-loaded on first STT request) ───────────────────────────────
let _whisperPipeline = null;
let _whisperLoading = false;
let _whisperLoadError = null;

async function getWhisperPipeline() {
  if (_whisperPipeline) return _whisperPipeline;
  if (_whisperLoadError) throw _whisperLoadError;
  if (_whisperLoading) {
    // Wait for in-flight load
    await new Promise((resolve) => {
      const check = setInterval(() => {
        if (!_whisperLoading) { clearInterval(check); resolve(); }
      }, 100);
    });
    if (_whisperLoadError) throw _whisperLoadError;
    return _whisperPipeline;
  }

  _whisperLoading = true;
  try {
    const { pipeline, env } = await import("@xenova/transformers");
    env.cacheDir = MODELS_CACHE_DIR;
    env.allowLocalModels = true;
    console.log(`[Voice] Loading Whisper model: ${WHISPER_MODEL} (first load downloads ~150MB)`);
    _whisperPipeline = await pipeline("automatic-speech-recognition", WHISPER_MODEL, {
      quantized: true,
    });
    console.log("[Voice] Whisper ready");
  } catch (err) {
    _whisperLoadError = err;
    console.error("[Voice] Whisper load failed:", err.message);
    throw err;
  } finally {
    _whisperLoading = false;
  }
  return _whisperPipeline;
}

export async function warmVoicePipeline() {
  await getWhisperPipeline();
  return {
    stt: "ready",
    stt_model: WHISPER_MODEL,
  };
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function handleVoicePipelineRoutes(req, res, apiPath, rawBody) {
  // POST /api/voice/stt — PCM16 audio → transcript text
  if (req.method === "POST" && apiPath === "/api/voice/stt") {
    const authResult = authorizeRequest(req, { requiredRole: "viewer" });
    if (!authResult.authorized) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return true;
    }

    const t0 = Date.now();

    try {
      // rawBody is a Buffer of PCM16 samples (signed 16-bit little-endian, 16kHz)
      const pcm16 = rawBody instanceof Buffer ? rawBody : Buffer.from(rawBody);
      if (pcm16.length < 512) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ text: "", duration_ms: 0 }));
        return true;
      }

      // Convert PCM16 → Float32 normalised to [-1, 1]
      const samples = pcm16.length / 2;
      const float32 = new Float32Array(samples);
      for (let i = 0; i < samples; i++) {
        float32[i] = pcm16.readInt16LE(i * 2) / 32768.0;
      }

      const pipe = await getWhisperPipeline();
      const result = await pipe(float32, {
        language: "english",
        task: "transcribe",
        chunk_length_s: 30,
        stride_length_s: 5,
      });

      const text = (result.text || "").trim();
      const duration_ms = Date.now() - t0;
      console.log(`[Voice STT] "${text.slice(0, 60)}" (${duration_ms}ms)`);

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ text, duration_ms }));
    } catch (err) {
      console.error("[Voice STT] error:", err.message);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message, text: "" }));
    }
    return true;
  }

  // POST /api/voice/chat — disabled while no local chat model is configured.
  if (req.method === "POST" && apiPath === "/api/voice/chat") {
    const authResult = authorizeRequest(req, { requiredRole: "viewer" });
    if (!authResult.authorized) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return true;
    }

    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Voice chat is disabled while no local chat model is configured.", response: "" }));
    return true;
  }

  // GET /api/voice/status — check pipeline readiness
  if (req.method === "GET" && apiPath === "/api/voice/status") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      stt: _whisperPipeline ? "ready" : _whisperLoading ? "loading" : "not_loaded",
      stt_model: WHISPER_MODEL,
      chat_model: null,
      chat_enabled: false,
      data_residency: "local",
    }));
    return true;
  }

  return false;
}

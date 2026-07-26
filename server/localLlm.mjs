// localLlm.mjs — sovereign (on-premise) LLM provider.
//
// Speaks the OpenAI-compatible /chat/completions dialect, which is what Ollama,
// vLLM, LM Studio, llama.cpp's server and text-generation-webui all expose. That
// means one client covers every realistic local deployment without a vendor SDK.
//
// Sovereignty guarantee: this module will only talk to a loopback or private-range
// host. A public address is refused unless the operator explicitly opts in with
// ARIA_LOCAL_LLM_ALLOW_REMOTE=true. That keeps the "nothing leaves the network"
// claim enforceable in code rather than asserted in documentation.

const DEFAULT_BASE_URL = "http://127.0.0.1:11434/v1"; // Ollama's OpenAI-compatible surface
const DEFAULT_TIMEOUT_MS = 45_000; // local models on CPU are legitimately slow
const PROBE_TIMEOUT_MS = 2_500;
const PROBE_CACHE_MS = 15_000;

let probeCache = { at: 0, value: null };

function env(name) {
  return String(process.env[name] || "").trim();
}

function truthy(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());
}

/**
 * Normalises a base URL to an OpenAI-compatible root.
 * Accepts "http://host:11434", "http://host:11434/", "http://host:11434/v1".
 */
function normaliseBaseUrl(raw) {
  const trimmed = String(raw || "").trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return /\/v\d+$/.test(trimmed) ? trimmed : `${trimmed}/v1`;
}

// Loopback, RFC1918, CGNAT, link-local and .local/.internal names count as
// "inside the network". Anything else is treated as egress.
function isLocalHostname(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) return false;
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host === "::1" || host === "0:0:0:0:0:0:0:1") return true;
  if (host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".home.arpa")) return true;
  if (/^fd[0-9a-f]{2}:/i.test(host) || /^fe80:/i.test(host)) return true; // ULA / link-local

  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!v4) return false;
  const [a, b] = v4.slice(1).map(Number);
  if ([a, b].some((n) => Number.isNaN(n) || n > 255)) return false;
  if (a === 127 || a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true; // link-local
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

export function getLocalLlmConfig() {
  const baseUrl = normaliseBaseUrl(
    env("ARIA_LOCAL_LLM_URL") || env("OLLAMA_HOST") || DEFAULT_BASE_URL,
  );
  const timeoutRaw = Number(env("ARIA_LOCAL_LLM_TIMEOUT_MS"));
  const config = {
    baseUrl,
    // Optional. When unset, the first model the local server reports is used, so
    // "point Aria at Ollama and it works with whatever you have pulled" holds.
    model: env("ARIA_LOCAL_LLM_MODEL") || "",
    // vLLM and LM Studio may require a bearer token even when running locally.
    apiKey: env("ARIA_LOCAL_LLM_API_KEY"),
    allowRemote: truthy(env("ARIA_LOCAL_LLM_ALLOW_REMOTE")),
    timeoutMs: Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : DEFAULT_TIMEOUT_MS,
  };

  let hostname = "";
  try {
    hostname = new URL(config.baseUrl).hostname;
  } catch {
    return { ...config, valid: false, isLocal: false, reason: `ARIA_LOCAL_LLM_URL is not a valid URL: ${config.baseUrl}` };
  }

  const isLocal = isLocalHostname(hostname);
  if (!isLocal && !config.allowRemote) {
    return {
      ...config,
      valid: false,
      isLocal,
      reason:
        `Refusing to use "${hostname}" as the sovereign engine: it is outside the local network. ` +
        `Point ARIA_LOCAL_LLM_URL at a loopback or private-range host, or set ` +
        `ARIA_LOCAL_LLM_ALLOW_REMOTE=true if you accept the egress.`,
    };
  }

  return { ...config, valid: true, isLocal, reason: "" };
}

async function localFetch(path, { method = "GET", body, timeoutMs, signal } = {}) {
  const config = getLocalLlmConfig();
  if (!config.valid) throw new Error(config.reason);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs ?? config.timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });

  try {
    const headers = { "Content-Type": "application/json" };
    if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
    const res = await fetch(`${config.baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

/**
 * Cheap reachability + inventory probe. Never throws; returns a status object so
 * callers can degrade gracefully and the UI can show why local mode is dark.
 */
export async function probeLocalLlm({ force = false } = {}) {
  const now = Date.now();
  if (!force && probeCache.value && now - probeCache.at < PROBE_CACHE_MS) {
    return probeCache.value;
  }

  const config = getLocalLlmConfig();
  const base = { provider: "local", endpoint: config.baseUrl, is_local: config.isLocal };

  if (!config.valid) {
    const value = { ...base, reachable: false, models: [], model: null, error: config.reason };
    probeCache = { at: now, value };
    return value;
  }

  let value;
  try {
    const res = await localFetch("/models", { timeoutMs: PROBE_TIMEOUT_MS });
    if (!res.ok) {
      value = { ...base, reachable: false, models: [], model: null, error: `Local engine responded ${res.status}` };
    } else {
      const data = await res.json().catch(() => ({}));
      const models = (Array.isArray(data?.data) ? data.data : [])
        .map((entry) => String(entry?.id || "").trim())
        .filter(Boolean);
      const model = config.model || models[0] || null;
      const configuredMissing = config.model && models.length > 0 && !models.includes(config.model);
      value = {
        ...base,
        reachable: true,
        models,
        model,
        error: configuredMissing
          ? `Configured model "${config.model}" is not loaded on the local engine. Available: ${models.join(", ")}`
          : models.length === 0
            ? "Local engine is reachable but has no models loaded. Pull one, e.g. `ollama pull qwen3:8b`."
            : "",
      };
    }
  } catch (err) {
    const reason = err?.name === "AbortError" ? "timed out" : err?.message || "unreachable";
    value = {
      ...base,
      reachable: false,
      models: [],
      model: null,
      error: `Local engine not reachable at ${config.baseUrl} (${reason}). Start one, e.g. \`ollama serve\`.`,
    };
  }

  probeCache = { at: now, value };
  return value;
}

export function isLocalLlmAvailable() {
  return Boolean(probeCache.value?.reachable);
}

/**
 * Runs a completion against the local engine.
 * Throws on failure — callers decide whether to degrade or surface the error.
 */
export async function callLocalLlm(prompt, { model, signal, maxTokens = 1024, temperature = 0.2 } = {}) {
  const status = await probeLocalLlm();
  if (!status.reachable) throw new Error(status.error || "Local engine unavailable");

  const selected = model || status.model;
  if (!selected) throw new Error(status.error || "No local model available");

  const res = await localFetch("/chat/completions", {
    method: "POST",
    signal,
    body: {
      model: selected,
      max_tokens: maxTokens,
      temperature,
      messages: [{ role: "user", content: String(prompt ?? "") }],
    },
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    // A failed call usually means the model was swapped or unloaded; drop the
    // cache so the next probe re-reads reality instead of serving a stale hit.
    probeCache = { at: 0, value: null };
    throw new Error(`Local engine request failed: ${res.status} ${detail.slice(0, 160)}`);
  }

  const data = await res.json().catch(() => ({}));
  const text = String(data?.choices?.[0]?.message?.content || "").trim();
  if (!text) throw new Error("Local engine returned an empty completion");
  return { text, model: selected };
}

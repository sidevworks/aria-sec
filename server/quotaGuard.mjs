// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

/**
 * Quota Guard — rate-limit and daily-quota enforcement.
 *
 * Counters are backed by durableStore.mjs:
 *   - Production (ARIA_KV_REST_URL + ARIA_KV_REST_TOKEN set): shared Redis counters
 *     via the Upstash Redis REST API. Counters survive restarts and are consistent
 *     across all server instances.
 *   - Dev/local (no KV configured): in-memory Map fallback. Resets on process restart;
 *     semantically identical to the previous implementation.
 *
 * enforceQuotaGuard is now async. Callers must await it.
 */
import { durableIncr, durableScan, resetDurableStore } from "./durableStore.mjs";

function guardConfig() {
  const defaultRateWindowMs = Number(process.env.ARIA_RATE_LIMIT_WINDOW_MS || 60_000);
  const defaultRateLimit = Number(process.env.ARIA_RATE_LIMIT_PER_WINDOW || 600);   // 10 req/s — enterprise tier
  const defaultQuotaWindowMs = Number(process.env.ARIA_QUOTA_WINDOW_MS || 3_600_000);
  const defaultQuotaLimit = Number(process.env.ARIA_QUOTA_PER_WINDOW || 100_000);   // effectively uncapped for single operator
  return {
    defaultRateWindowMs,
    defaultQuotaWindowMs,
    buckets: {
      aria: {
        rateLimit: Number(process.env.ARIA_ROUTE_RATE_LIMIT_PER_WINDOW || defaultRateLimit),
        quotaLimit: Number(process.env.ARIA_ROUTE_QUOTA_PER_WINDOW || defaultQuotaLimit),
      },
      aiSpmHeavy: {
        rateLimit: Number(process.env.ARIA_AI_SPM_HEAVY_RATE_LIMIT_PER_WINDOW || Math.max(20, defaultRateLimit)),
        quotaLimit: Number(process.env.ARIA_AI_SPM_HEAVY_QUOTA_PER_WINDOW || Math.max(150, defaultQuotaLimit)),
      },
    },
  };
}

function nowMs() {
  return Date.now();
}

function getClientKey(req) {
  const proxySecret = String(process.env.ARIA_TRUSTED_PROXY_SECRET || "");
  const suppliedSecret = String(req.headers?.["x-aria-proxy-secret"] || "");
  const trustForwarded = proxySecret.length >= 16 && suppliedSecret === proxySecret;
  const forwarded = trustForwarded
    ? String(req.headers?.["x-forwarded-for"] || "").split(",")[0].trim()
    : "";
  const socketIp = req.socket?.remoteAddress || "";
  return forwarded || socketIp || "unknown-client";
}

// These are lightweight polling/health endpoints — excluding them from quota
// prevents the hourly counter from being exhausted by background poll loops.
const QUOTA_EXEMPT_PATHS = new Set([
  "/api/aria/state",
  "/api/aria/health",
  "/api/aria/observe",
  "/api/aria/stream",
]);

function getBucket(apiPath) {
  if (QUOTA_EXEMPT_PATHS.has(apiPath)) return null;
  if (apiPath.startsWith("/api/aria/")) return "aria";
  if ([
    "/api/ai-spm/scan",
    "/api/ai-spm/narrative",
    "/api/ai-spm/report",
    "/api/ai-spm/remediate",
    "/api/ai-spm/evidence",
    "/api/ai-spm/finding-action",
  ].includes(apiPath)) {
    return "aiSpmHeavy";
  }
  return null;
}

function startWindow(ts, windowMs) {
  return ts - (ts % windowMs);
}

function counterKey({ type, bucket, clientKey, windowStart }) {
  return `aria:quota:${type}:${bucket}:${clientKey}:${windowStart}`;
}

/**
 * Increment a window counter and return whether the limit was exceeded.
 * Returns { ok, count, windowEnd, limit, retryAfterMs } (async).
 */
async function evaluateCounter({ type, bucket, clientKey, limit, windowMs, now }) {
  const windowStart = startWindow(now, windowMs);
  const windowEnd = windowStart + windowMs;
  const ttlSeconds = Math.ceil((windowEnd - now) / 1000) + 1; // +1s buffer
  const key = counterKey({ type, bucket, clientKey, windowStart });

  const count = await durableIncr(key, ttlSeconds);

  if (count <= limit) {
    return { ok: true };
  }

  return {
    ok: false,
    windowStart,
    windowEnd,
    limit,
    used: count,
    retryAfterMs: Math.max(0, windowEnd - now),
  };
}

/** Reset all counters (used in tests; clears the durable store's in-memory fallback). */
export function resetQuotaGuardState() {
  resetDurableStore();
}

/**
 * Return a snapshot of current quota usage across all buckets.
 * Async — reads from the durable store (KV scan or in-memory scan).
 */
export async function getQuotaSnapshot() {
  const config = guardConfig();
  const now = nowMs();
  const bucketNames = Object.keys(config.buckets);

  const entries = await durableScan("aria:quota:");

  const buckets = bucketNames.map((bucket) => {
    const override = config.buckets[bucket];
    const rateWindowStart = startWindow(now, config.defaultRateWindowMs);
    const quotaWindowStart = startWindow(now, config.defaultQuotaWindowMs);

    let rateUsed = 0;
    let quotaUsed = 0;
    for (const { key, value } of entries) {
      const v = Number(value) || 0;
      if (key.includes(`:rate:${bucket}:`) && key.endsWith(`:${rateWindowStart}`)) rateUsed += v;
      if (key.includes(`:quota:${bucket}:`) && key.endsWith(`:${quotaWindowStart}`)) quotaUsed += v;
    }

    const rateStatus = rateUsed >= override.rateLimit ? "limited" : rateUsed >= override.rateLimit * 0.8 ? "warn" : "ok";
    const quotaStatus = quotaUsed >= override.quotaLimit ? "limited" : quotaUsed >= override.quotaLimit * 0.8 ? "warn" : "ok";
    const status = rateStatus === "limited" || quotaStatus === "limited" ? "limited"
      : rateStatus === "warn" || quotaStatus === "warn" ? "warn" : "ok";

    return {
      name: bucket,
      status,
      rate: { used: rateUsed, limit: override.rateLimit, window_ms: config.defaultRateWindowMs },
      quota: { used: quotaUsed, limit: override.quotaLimit, window_ms: config.defaultQuotaWindowMs },
    };
  });

  return { buckets, snapshot_at: new Date().toISOString() };
}

/**
 * Enforce rate and quota limits for the given request.
 * Returns { ok: true } or { ok: false, statusCode, payload }.
 * ASYNC — must be awaited by the caller.
 */
export async function enforceQuotaGuard({ req, apiPath }) {
  const bucket = getBucket(apiPath);
  if (!bucket) return { ok: true };

  const config = guardConfig();
  const now = nowMs();
  const clientKey = getClientKey(req);
  const override = config.buckets[bucket] || {};

  const rate = await evaluateCounter({
    type: "rate",
    bucket,
    clientKey,
    limit: override.rateLimit,
    windowMs: config.defaultRateWindowMs,
    now,
  });

  if (!rate.ok) {
    return {
      ok: false,
      statusCode: 429,
      payload: {
        error: "rate_limit_exceeded",
        message: "Too many requests for this route window.",
        guard: {
          type: "rate_limit",
          bucket,
          limit: rate.limit,
          used: rate.used,
          window_ms: config.defaultRateWindowMs,
          retry_after_ms: rate.retryAfterMs,
          reset_at: new Date(rate.windowEnd).toISOString(),
        },
      },
    };
  }

  const quota = await evaluateCounter({
    type: "quota",
    bucket,
    clientKey,
    limit: override.quotaLimit,
    windowMs: config.defaultQuotaWindowMs,
    now,
  });

  if (!quota.ok) {
    return {
      ok: false,
      statusCode: 429,
      payload: {
        error: "quota_exceeded",
        message: "Request quota exceeded for this route family.",
        guard: {
          type: "quota",
          bucket,
          limit: quota.limit,
          used: quota.used,
          window_ms: config.defaultQuotaWindowMs,
          retry_after_ms: quota.retryAfterMs,
          reset_at: new Date(quota.windowEnd).toISOString(),
        },
      },
    };
  }

  return { ok: true };
}

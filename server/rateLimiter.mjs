// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 10;
const store = new Map();

export function getRateLimitClientIp(req) {
  const proxySecret = String(process.env.ARIA_TRUSTED_PROXY_SECRET || "");
  const suppliedSecret = String(req.headers?.["x-aria-proxy-secret"] || "");
  const trustForwarded = proxySecret.length >= 16 && suppliedSecret === proxySecret;
  if (trustForwarded) {
    const forwarded = String(req.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
    if (forwarded) return forwarded;
  }
  return req.socket?.remoteAddress || "unknown";
}

export function checkRateLimit(req) {
  const ip = getRateLimitClientIp(req);
  if (ip === "unknown") return { allowed: true };
  const now = Date.now();
  const timestamps = (store.get(ip) || []).filter(t => now - t < WINDOW_MS);
  timestamps.push(now);
  store.set(ip, timestamps);
  if (timestamps.length > MAX_REQUESTS) {
    const oldest = timestamps[0];
    const retryAfter = Math.ceil((oldest + WINDOW_MS - now) / 1000);
    return { allowed: false, retryAfter };
  }
  return { allowed: true };
}

export function getRateLimitHeaders(req) {
  const ip = getRateLimitClientIp(req);
  const now = Date.now();
  const timestamps = (store.get(ip) || []).filter(t => now - t < WINDOW_MS);
  const remaining = Math.max(0, MAX_REQUESTS - timestamps.length);
  const reset = timestamps.length > 0
    ? Math.ceil((timestamps[0] + WINDOW_MS) / 1000)
    : Math.ceil((now + WINDOW_MS) / 1000);
  return {
    "X-RateLimit-Limit": String(MAX_REQUESTS),
    "X-RateLimit-Remaining": String(remaining),
    "X-RateLimit-Reset": String(reset),
  };
}

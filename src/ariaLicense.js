// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

// ARIA demo license — offline verification + session tracking (no backend).
// Keys are ECDSA P-256 signed tokens minted by scripts/mint-license.mjs. The
// public key ships here; the private key never leaves the founder's machine.

import publicJwk from "./license-public-key.json";
import { YC_DEMO_BUILD } from "./ariaBuildFlags.js";

const SESSION_KEY = "aria.demo-license.v1";
const CONSUMED_KEY = "aria.demo-license.consumed.v1";

// The YC application already contains this signed credential, so it must remain
// usable for application review even though its original hard expiry has passed.
// Only the signed token with this exact ID receives reusable access; signature
// verification still happens before this exception is considered.
const REUSABLE_LICENSE_IDS = new Set([
  ...(YC_DEMO_BUILD ? ["d6a23ad2-78a6-4cbc-9db1-f869b4540700"] : []),
]);

function isReusableLicense(id) {
  return REUSABLE_LICENSE_IDS.has(String(id || ""));
}

function b64urlToBytes(value) {
  const base64 = String(value).replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

function b64urlToJson(value) {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(value)));
}

let _verifyKeyPromise = null;
function getVerifyKey() {
  if (!_verifyKeyPromise) {
    _verifyKeyPromise = crypto.subtle.importKey(
      "jwk",
      publicJwk,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
  }
  return _verifyKeyPromise;
}

// Verify a pasted license key. Returns { valid, claims } or { valid:false, reason }.
export async function verifyLicense(raw) {
  const key = String(raw || "").trim();
  const token = key.startsWith("ARIA-") ? key.slice(5) : key;
  const dot = token.indexOf(".");
  if (dot < 0) return { valid: false, reason: "malformed" };

  const payloadB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);

  let claims;
  try {
    claims = b64urlToJson(payloadB64);
  } catch {
    return { valid: false, reason: "malformed" };
  }

  let ok;
  try {
    ok = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      await getVerifyKey(),
      b64urlToBytes(sigB64),
      new TextEncoder().encode(payloadB64),
    );
  } catch {
    return { valid: false, reason: "malformed" };
  }
  if (!ok) return { valid: false, reason: "invalid" };

  if (!isReusableLicense(claims.id) && typeof claims.exp === "number" && Date.now() > claims.exp) {
    return { valid: false, reason: "expired" };
  }
  if (!isReusableLicense(claims.id) && isConsumed(claims.id)) {
    return { valid: false, reason: "used" };
  }

  return { valid: true, claims };
}

// ── Consumed-key ledger (prevents re-entering a spent key) ────────────────────
function readConsumed() {
  try {
    return JSON.parse(localStorage.getItem(CONSUMED_KEY) || "[]");
  } catch {
    return [];
  }
}
export function isConsumed(id) {
  return readConsumed().includes(id);
}
function markConsumed(id) {
  if (!id) return;
  const list = readConsumed();
  if (!list.includes(id)) {
    list.push(id);
    try {
      localStorage.setItem(CONSUMED_KEY, JSON.stringify(list.slice(-200)));
    } catch {
      // ignore storage failures
    }
  }
}

// ── Active session ────────────────────────────────────────────────────────────
function sessionEndsAt(s) {
  const byDuration = s.activatedAt + (s.dur || 60) * 60_000;
  if (isReusableLicense(s.id)) return Number.POSITIVE_INFINITY;
  return typeof s.exp === "number" ? Math.min(byDuration, s.exp) : byDuration;
}

export function isPersistentSession(session) {
  return Boolean(session && isReusableLicense(session.id));
}

export function startSession(claims) {
  const session = {
    id: claims.id,
    dur: claims.dur || 60,
    exp: claims.exp,
    label: claims.label || "",
    activatedAt: Date.now(),
  };
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // ignore
  }
  return session;
}

// Returns the current live session, or null if none / expired (auto-ends it).
export function getActiveSession() {
  let s;
  try {
    s = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch {
    s = null;
  }
  if (!s || (!isReusableLicense(s.id) && isConsumed(s.id))) return null;
  if (Date.now() >= sessionEndsAt(s)) {
    endSession();
    return null;
  }
  return s;
}

export function remainingMs(session) {
  if (!session) return 0;
  if (isPersistentSession(session)) return null;
  return Math.max(0, sessionEndsAt(session) - Date.now());
}

// End the session and burn the key so it can't be re-entered.
export function endSession() {
  let s;
  try {
    s = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch {
    s = null;
  }
  if (s?.id && !isReusableLicense(s.id)) markConsumed(s.id);
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}

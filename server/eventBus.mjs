// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

/**
 * eventBus.mjs — in-process SSE broadcast hub.
 *
 * Any server module can call emit() to push a typed event to all connected
 * clients. The SSE endpoint in index.mjs manages subscribe/unsubscribe.
 *
 * Event shape:
 *   { type: string, payload: object, ts: ISO-string }
 */

const clients = new Set(); // Set<{ res, tenantId }>

/** Register an SSE response object. Returns an unsubscribe function. */
export function subscribe(res, tenantId = "tenant-local") {
  const client = { res, tenantId };
  clients.add(client);
  return () => clients.delete(client);
}

/** Broadcast a typed event to all connected SSE clients. */
export function emit(type, payload = {}) {
  if (clients.size === 0) return;
  const data = JSON.stringify({ type, payload, ts: new Date().toISOString() });
  const msg = `data: ${data}\n\n`;
  for (const { res } of clients) {
    try { res.write(msg); } catch { /* client already gone */ }
  }
}

/** Number of currently connected SSE clients. */
export function clientCount() {
  return clients.size;
}

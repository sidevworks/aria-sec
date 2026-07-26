// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

/**
 * useAriaStream — React hook for the /api/aria/stream SSE endpoint.
 *
 * Connects once on mount, auto-reconnects on disconnect with exponential
 * backoff (1s → 2s → 4s … max 30s). Calls onEvent(event) for every
 * server-pushed message.
 *
 * Returns: { connected: boolean, lastEvent: object | null }
 */
import { useEffect, useRef, useState, useCallback } from "react";

const BASE_URL = (typeof import.meta !== "undefined" && import.meta.env?.VITE_ARIA_API_BASE || "").replace(/\/$/, "");
const STREAM_URL = `${BASE_URL}/api/aria/stream`;

const AUTH_HEADERS_QUERY = () => {
  const tenantId = import.meta.env?.VITE_ARIA_TENANT_ID || "tenant-local";
  const userId   = import.meta.env?.VITE_ARIA_USER_ID   || "admin";
  const role     = import.meta.env?.VITE_ARIA_ROLE       || "owner";
  // EventSource doesn't support custom headers, so we pass them as query params.
  // The server reads x-* headers OR query equivalents.
  return `?x-tenant-id=${tenantId}&x-user-id=${userId}&x-role=${role}`;
};

export function useAriaStream(onEvent) {
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState(null);
  const onEventRef  = useRef(onEvent);
  const retryRef    = useRef(0);
  const esRef       = useRef(null);
  const unmountedRef = useRef(false);
  const connectRef  = useRef(null);

  // Keep callback ref current without re-connecting
  useEffect(() => { onEventRef.current = onEvent; }, [onEvent]);

  const connect = useCallback(() => {
    if (unmountedRef.current) return;
    if (esRef.current) { esRef.current.close(); esRef.current = null; }

    const url = `${STREAM_URL}${AUTH_HEADERS_QUERY()}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => {
      if (unmountedRef.current) return;
      retryRef.current = 0;
      setConnected(true);
    };

    es.onmessage = (e) => {
      if (unmountedRef.current) return;
      try {
        const event = JSON.parse(e.data);
        setLastEvent(event);
        onEventRef.current?.(event);
      } catch { /* ignore malformed frames */ }
    };

    es.onerror = () => {
      if (unmountedRef.current) return;
      setConnected(false);
      es.close();
      esRef.current = null;

      // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s max
      const delay = Math.min(1000 * 2 ** retryRef.current, 30_000);
      retryRef.current += 1;
      setTimeout(() => connectRef.current(), delay);
    };
  }, []);
  useEffect(() => { connectRef.current = connect; }, [connect]);

  useEffect(() => {
    unmountedRef.current = false;
    connect();
    return () => {
      unmountedRef.current = true;
      esRef.current?.close();
      esRef.current = null;
      setConnected(false);
    };
  }, [connect]);

  return { connected, lastEvent };
}

// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

// ════════════════════════════════════════════════════════════════════════════
// useNetworkSource — network-derived galaxies for the Security Galaxy Map.
// Fetches authorization status on mount and galaxy data when authorized.
// Returns: { networkGalaxies, networkDataMode, networkLoading, networkError,
//            authStatus, refreshNetwork }
// ════════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback } from "react";
import { ariaFetch } from "../ariaFetch.js";

const POLL_INTERVAL_MS = 30_000;

export function useNetworkSource(demoMode = false) {
  const [state, setState] = useState({
    networkGalaxies: [],
    networkDataMode: "sample", // "live" | "sample"
    networkLoading: true,
    networkError: null,
    authStatus: "none", // "none" | "active" | "expired"
  });

  const refreshNetwork = useCallback(async () => {
    // Demo mode: pull labelled sample devices straight from the server,
    // bypassing the live-authorization requirement.
    if (demoMode) {
      const demoRes = await ariaFetch("GET", "/api/network/galaxies?demo=true");
      const { galaxies = [], dataMode = "sample" } = demoRes.data ?? {};
      setState({
        networkGalaxies: galaxies.map((galaxy) => ({
          ...galaxy,
          dataMode,
          sourceType: galaxy.sourceType || "network",
        })),
        networkDataMode: dataMode,
        networkLoading: false,
        networkError: demoRes.error || null,
        authStatus: "none",
      });
      return;
    }

    const statusRes = await ariaFetch("GET", "/api/network/status");
    const authStatus =
      statusRes.data?.authStatus === "active"
        ? "active"
        : statusRes.data?.authStatus === "expired"
          ? "expired"
          : "none";

    // Live data only: requires an active authorization and a completed scan.
    if (authStatus !== "active" || !statusRes.data?.lastScan) {
      setState({
        networkGalaxies: [],
        networkDataMode: "live",
        networkLoading: false,
        networkError: null,
        authStatus,
      });
      return;
    }

    const galaxiesRes = await ariaFetch("GET", "/api/network/galaxies");
    if (galaxiesRes.error) {
      setState({
        networkGalaxies: [],
        networkDataMode: "live",
        networkLoading: false,
        networkError: galaxiesRes.error,
        authStatus,
      });
      return;
    }

    const { galaxies = [], dataMode = "sample" } = galaxiesRes.data ?? {};
    setState({
      networkGalaxies: galaxies.map((galaxy) => ({
        ...galaxy,
        dataMode,
        sourceType: galaxy.sourceType || "network",
      })),
      networkDataMode: dataMode,
      networkLoading: false,
      networkError: null,
      authStatus,
    });
  }, [demoMode]);

  useEffect(() => {
    refreshNetwork();
    const timer = setInterval(refreshNetwork, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [refreshNetwork]);

  return { ...state, refreshNetwork };
}

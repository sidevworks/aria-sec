// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

// ════════════════════════════════════════════════════════════════════════════
// useIdentityGalaxies — polls /api/identity/galaxies every 30 s
// Returns: { galaxies, dataMode, connectedSources, scannedAt, loading, error }
// ════════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback } from "react";
import { ariaFetch } from "../ariaFetch.js";

const POLL_INTERVAL_MS = 30_000;

const INITIAL_STATE = {
  galaxies:         [],
  dataMode:         "sample",
  connectedSources: [],
  scannedAt:        null,
  loading:          true,
  error:            null,
};

export function useIdentityGalaxies(demoMode = false) {
  const [state, setState] = useState(INITIAL_STATE);

  const fetchGalaxies = useCallback(async () => {
    const result = await ariaFetch(
      "GET",
      demoMode ? "/api/identity/galaxies?demo=true" : "/api/identity/galaxies",
    );

    if (result.error) {
      setState(prev => ({
        ...prev,
        loading: false,
        error:   result.error,
      }));
      return;
    }

    const {
      galaxies         = [],
      dataMode         = "sample",
      connectedSources = [],
      scannedAt        = null,
    } = result.data ?? {};

    setState({
      galaxies: galaxies.map((galaxy) => ({ ...galaxy, sourceType: galaxy.sourceType || "azuread" })),
      dataMode,
      connectedSources,
      scannedAt,
      loading: false,
      error:   null,
    });
  }, [demoMode]);

  useEffect(() => {
    fetchGalaxies();
    const timer = setInterval(fetchGalaxies, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [fetchGalaxies]);

  return state;
}

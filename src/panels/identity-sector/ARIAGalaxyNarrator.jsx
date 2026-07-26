// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

// ════════════════════════════════════════════════════════════════════════════
// ARIAGalaxyNarrator — Purely behavioural narrator component
// Ties live galaxy risk scores to ARIA's existing voice layer (onSpeak prop).
// Renders null — no DOM output.
// ════════════════════════════════════════════════════════════════════════════

import { useEffect, useRef } from "react";

// ─── Re-exports for founders to wire intent handlers ─────────────────────────
export { IDENTITY_INTENTS } from "./identityContract.js";
import { IDENTITY_INTENTS } from "./identityContract.js";

// Intent handler stubs — founder wires these to command handler later.
// Do NOT wire to voice infra or command parsing here.
// eslint-disable-next-line react-refresh/only-export-components -- intent constants intentionally co-located with the narrator per the component spec
export const identityIntentHandlers = {
  [IDENTITY_INTENTS.OPEN_GALAXY]:       (_payload) => { /* stub */ },
  [IDENTITY_INTENTS.EXPAND_DEPARTMENT]: (_payload) => { /* stub */ },
  [IDENTITY_INTENTS.ISOLATE_IDENTITY]:  (_payload) => { /* stub */ },
  [IDENTITY_INTENTS.RUN_SCAN]:          (_payload) => { /* stub */ },
  [IDENTITY_INTENTS.GENERATE_REPORT]:   (_payload) => { /* stub */ },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Safely call onSpeak without throwing if it is a no-op or not callable. */
function safeSpeak(onSpeak, text) {
  try {
    if (typeof onSpeak === "function") {
      onSpeak(text);
    }
  } catch (err) {
    console.warn("[ARIAGalaxyNarrator] onSpeak threw:", err);
  }
}

/** Return the galaxy with the highest riskScore from the list. */
function worstGalaxy(galaxies) {
  if (!galaxies || galaxies.length === 0) return null;
  return galaxies.reduce((best, g) =>
    (g.riskScore ?? 0) > (best.riskScore ?? 0) ? g : best
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * ARIAGalaxyNarrator
 *
 * @param {{ onSpeak: (text: string) => void, galaxies: import("./identityContract").DepartmentGalaxy[], dataMode: "live"|"sample" }} props
 */
export default function ARIAGalaxyNarrator({ onSpeak, galaxies = [], dataMode = "live" }) {
  // Track per-galaxy last-spoken timestamps for 60-second debounce.
  const lastSpokenRef = useRef({});

  // Track previous worst riskScore for proactive threshold crossing detection.
  const prevWorstScoreRef = useRef(null);

  // Whether the initial "sector online" greeting has been spoken.
  const greetedRef = useRef(false);

  /** Optionally prefix text with sample-data context. */
  const withPrefix = (text) =>
    dataMode === "sample" ? `[Sample data active] ${text}` : text;

  /** Speak with debounce: returns true if speech was emitted. */
  const speakDebounced = (galaxyId, text) => {
    const now = Date.now();
    const last = lastSpokenRef.current[galaxyId] ?? 0;
    if (now - last < 60_000) return false;
    lastSpokenRef.current[galaxyId] = now;
    safeSpeak(onSpeak, withPrefix(text));
    return true;
  };

  // ── Threshold event listener ────────────────────────────────────────────────
  useEffect(() => {
    function handleThreshold(event) {
      const galaxy = event?.detail?.galaxy;
      if (!galaxy) return;

      console.info("[ARIAGalaxyNarrator] threshold:", galaxy.id, galaxy.riskScore);

      const { name, riskBand, signals = {} } = galaxy;

      if (riskBand === "critical") {
        speakDebounced(
          galaxy.id,
          `Operator, I'm detecting critical risk in the ${name} department. ` +
          `${signals.anomalyCount ?? 0} anomalies active. Shall I open it for investigation?`
        );
      } else if (riskBand === "warning") {
        speakDebounced(
          galaxy.id,
          `Operator, warning-level activity detected in ${name}. ` +
          `${signals.failedAuths24h ?? 0} failed authentications in the last 24 hours.`
        );
      }
    }

    window.addEventListener("aria:identity:threshold", handleThreshold);
    return () => window.removeEventListener("aria:identity:threshold", handleThreshold);
    // onSpeak and dataMode are stable references captured via closure;
    // the handler is recreated only when those change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSpeak, dataMode]);

  // ── Initial sector-online greeting ─────────────────────────────────────────
  useEffect(() => {
    if (greetedRef.current) return;
    if (!galaxies || galaxies.length === 0) return;

    const worst = worstGalaxy(galaxies);
    if (!worst) return;

    greetedRef.current = true;

    if (worst.riskBand === "critical") {
      safeSpeak(
        onSpeak,
        withPrefix(
          `Operator, Identity sector online. ${worst.name} is showing critical risk — ` +
          `${worst.riskScore} out of 100. I recommend immediate investigation.`
        )
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [galaxies, onSpeak, dataMode]);

  // ── Proactive galaxy monitoring — threshold crossing (below 75 → above 75) ──
  useEffect(() => {
    if (!galaxies || galaxies.length === 0) return;

    const worst = worstGalaxy(galaxies);
    if (!worst) return;

    const prev = prevWorstScoreRef.current;

    if (prev !== null && prev <= 75 && worst.riskScore > 75) {
      // Crossed the critical threshold — fire narration (with debounce).
      console.info("[ARIAGalaxyNarrator] threshold:", worst.id, worst.riskScore);
      speakDebounced(
        worst.id,
        `Operator, I'm detecting critical risk in the ${worst.name} department. ` +
        `${worst.signals?.anomalyCount ?? 0} anomalies active. Shall I open it for investigation?`
      );
    }

    prevWorstScoreRef.current = worst.riskScore;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [galaxies, onSpeak, dataMode]);

  // Purely behavioural — no DOM output.
  return null;
}

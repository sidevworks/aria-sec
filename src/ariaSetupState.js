// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

// First-run setup state — persisted operator onboarding choice.
// Kept in its own module (no component exports) so the setup screen and App can
// share it without breaking React Fast Refresh.

export const SETUP_COMPLETE_KEY = "aria.setup-complete.v1";
export const SETUP_MODE_KEY = "aria.setup-mode.v1";

// True until the operator completes (or skips) first-run setup on this machine.
export function isFirstRun() {
  try {
    return localStorage.getItem(SETUP_COMPLETE_KEY) !== "1";
  } catch {
    return false; // No storage → don't trap the user on the setup screen.
  }
}

// The persisted demo/live choice as a boolean, or null if not yet chosen.
export function readSetupDemoChoice() {
  try {
    const mode = localStorage.getItem(SETUP_MODE_KEY);
    if (mode === "demo") return true;
    if (mode === "live") return false;
  } catch {
    // localStorage unavailable — fall back to build default.
  }
  return null;
}

export function persistSetupChoice(mode) {
  try {
    localStorage.setItem(SETUP_MODE_KEY, mode);
    localStorage.setItem(SETUP_COMPLETE_KEY, "1");
  } catch {
    // Non-fatal: choice still applies for this session via setDemoMode.
  }
}

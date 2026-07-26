// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

// Build-time flags shared across the app (single source of truth).

// Demo distributable opt-in. Set VITE_ARIA_DEMO_BUILD=true when building the
// shareable investor demo (e.g. `VITE_ARIA_DEMO_BUILD=true npm run dist`).
// A demo build:
//   • re-enables demo data in the otherwise-strict production build,
//   • skips auth (login) and first-run setup — opens straight to the platform
//     in demo mode.
// Real production builds leave this unset and keep auth + strict behaviour.
export const DEMO_BUILD = ["1", "true", "yes", "on"].includes(
  String(import.meta.env.VITE_ARIA_DEMO_BUILD || "").toLowerCase(),
);

// YC review build: keeps the submitted access credential reusable and presents
// a simple password-style gate. This flag is enabled only on the YC Vercel app.
export const YC_DEMO_BUILD = ["1", "true", "yes", "on"].includes(
  String(import.meta.env.VITE_ARIA_YC_DEMO || "").toLowerCase(),
);

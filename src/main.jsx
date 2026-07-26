// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

/* eslint-disable react-refresh/only-export-components -- entry module defines bootstrap-only lazy roots. */
import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './panels/cosmos-tokens.css'

const CinematicLanding = lazy(() => import('./landing/CinematicLanding.jsx'))
const PlatformRoot = lazy(() => import('./PlatformRoot.jsx'))

function Root() {
  const params = new URLSearchParams(window.location.search)
  // Public marketing build (VITE_PUBLIC_SURFACE=landing) only ever shows the
  // cinematic landing — the operator platform is never reachable there.
  const landingOnly = import.meta.env.VITE_PUBLIC_SURFACE === 'landing'
  const isLanding =
    landingOnly ||
    window.location.pathname === '/landing' ||
    window.location.pathname === '/landing/' ||
    params.get('surface') === 'landing'

  return isLanding
    ? (
      <Suspense fallback={<div className="appBootSplash">Loading ARIA landing</div>}>
        <CinematicLanding />
      </Suspense>
    )
    : (
      <Suspense fallback={<div className="appBootSplash">Loading ARIA platform</div>}>
        <PlatformRoot />
      </Suspense>
    )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)

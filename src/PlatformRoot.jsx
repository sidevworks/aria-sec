// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import { useEffect, useState } from 'react'
import AriaLaunchOverlay from './AriaLaunchOverlay.jsx'
import AriaLoginScreen from './AriaLoginScreen.jsx'
import AriaFirstRunSetup from './AriaFirstRunSetup.jsx'
import AriaDemoLicenseScreen from './AriaDemoLicenseScreen.jsx'
import App from './App.jsx'  // eager — must be painted & animating before overlay fades
import { setSessionToken, setDemoMode } from './panels/ariaFetch.js'
import { isFirstRun } from './ariaSetupState.js'
import { DEMO_BUILD } from './ariaBuildFlags.js'
import { getActiveSession, endSession, isPersistentSession, remainingMs } from './ariaLicense.js'

// Legacy key from the removed Touch ID feature — cleared on logout so any
// leftover local session data doesn't linger.
const LEGACY_TOUCH_ID_SESSION_KEY = 'aria.touch-id-session.v1'

// Demo builds run on sample data with no auth — the license key is the only gate.
if (DEMO_BUILD) setDemoMode(true)

// ── Demo build: license-gated, no login ───────────────────────────────────────
function DemoRoot() {
  const [overlayDone, setOverlayDone] = useState(false)
  const [session, setSession] = useState(() => getActiveSession())

  // When a session is live, schedule the auto-logout at its expiry. This is what
  // drops the operator back to the license screen after the trial window.
  useEffect(() => {
    if (!session) return undefined
    if (isPersistentSession(session)) return undefined
    const t = setTimeout(() => {
      endSession()
      setSession(null)
    }, remainingMs(session))
    return () => clearTimeout(t)
  }, [session])

  return (
    <>
      {overlayDone && session && (
        <App onLogout={() => { endSession(); setSession(null) }} />
      )}

      {overlayDone && !session && (
        <AriaDemoLicenseScreen onActivated={(s) => setSession(s)} />
      )}

      {!overlayDone && (
        <AriaLaunchOverlay onDismiss={() => setOverlayDone(true)} />
      )}
    </>
  )
}

// ── Real build: login / first-run-setup boundary ───────────────────────────────
function FullRoot() {
  const [overlayDone, setOverlayDone] = useState(false)
  const [loggedIn,    setLoggedIn]    = useState(false)
  // Show the first-run setup once after the first successful login on this
  // machine. Re-evaluated at login time so a fresh install lands on setup.
  const [setupNeeded, setSetupNeeded] = useState(false)

  const handleLogin = (sessionData) => {
    setSessionToken(sessionData?.token || null)
    setSetupNeeded(isFirstRun())
    setLoggedIn(true)
  }

  const handleLogout = () => {
    setSessionToken(null)
    localStorage.removeItem(LEGACY_TOUCH_ID_SESSION_KEY)
    setLoggedIn(false)
  }

  // App must not mount until setup is resolved — it reads the persisted demo
  // choice at mount to seed its initial AI-SPM state.
  const showApp = loggedIn && !setupNeeded

  return (
    <>
      {/* Keep the operations shell fully behind the auth boundary. Mounting it
          before login starts telemetry polling and app-level overlays that can
          leak over the secure access screen. */}
      {showApp && (
        <App onLogout={handleLogout} />
      )}

      {/* First-run setup — gates App on the very first login per machine. */}
      {loggedIn && setupNeeded && (
        <AriaFirstRunSetup onComplete={() => setSetupNeeded(false)} />
      )}

      {/* Login screen — shown after boot overlay fades, removed after auth. */}
      {overlayDone && !loggedIn && (
        <AriaLoginScreen onLogin={handleLogin} />
      )}

      {/* Boot overlay sits on top (z-index: 9999) and fades to reveal the login screen.
          Removed from DOM only after it fully fades (pointer-events gone first). */}
      {!overlayDone && (
        <AriaLaunchOverlay onDismiss={() => setOverlayDone(true)} />
      )}
    </>
  )
}

export default function PlatformRoot() {
  return DEMO_BUILD ? <DemoRoot /> : <FullRoot />
}

// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

// ════════════════════════════════════════════════════════════════════════════
// IDENTITY & ACCESS SECTOR — Unified Sector Pane
// Centerpiece: Security Galaxy Map → Department Constellation → Identity Detail
// Sidebar: Risk Leaderboard + Policy Gate + UEBA analytics
// ════════════════════════════════════════════════════════════════════════════
import { Suspense, lazy, useState, useCallback, useEffect } from "react";
import SecurityGalaxyMap from "./SecurityGalaxyMap.jsx";
import GalaxyExpanded from "./GalaxyExpanded.jsx";
import IdentityDetailPanel from "./IdentityDetailPanel.jsx";
import IdentityRiskLeaderboard from "./IdentityRiskLeaderboard.jsx";
import PolicyGateVisualiser from "./PolicyGateVisualiser.jsx";
import ARIAGalaxyNarrator from "./ARIAGalaxyNarrator.jsx";
import { useIdentityGalaxies } from "./useIdentityGalaxies.js";
import { useNetworkSource } from "./useNetworkSource.js";
import ScanAuthorization from "./ScanAuthorization.jsx";
import { ariaFetch } from "../ariaFetch.js";

// UEBA components — lazy so they degrade gracefully if still building
const BehaviourRing        = lazy(() => import("./BehaviourRing.jsx").catch(() => ({ default: () => null })));
const PrivilegeDriftTimeline = lazy(() => import("./PrivilegeDriftTimeline.jsx").catch(() => ({ default: () => null })));
const ImpossibleTravelGlobe  = lazy(() => import("./ImpossibleTravelGlobe.jsx").catch(() => ({ default: () => null })));

const SOURCE_TABS = [
  { id: "all", label: "All" },
  { id: "azuread", label: "Azure AD" },
  { id: "network", label: "Network" },
];

// View state machine
// "map"        → galaxy map (default)
// "department" → galaxy expanded (constellation)
// "user"       → identity detail panel (right pane replaces sidebar)

export default function IdentitySectorPane({ onSpeak, onClose, onRegisterIntents, demoMode = false }) {
  const { galaxies, dataMode, loading, error } = useIdentityGalaxies(demoMode);
  const { networkGalaxies, authStatus, refreshNetwork } = useNetworkSource(demoMode);
  const [view, setView]                         = useState("map");
  const [selectedGalaxy, setSelectedGalaxy]     = useState(null);
  const [selectedUser, setSelectedUser]         = useState(null);
  const [sidebarTab, setSidebarTab]             = useState("leaderboard"); // "leaderboard" | "policy"
  const [showNetworkPanel, setShowNetworkPanel] = useState(false);
  const [sourceMode, setSourceMode]             = useState("all");
  const [pendingDemoUser, setPendingDemoUser]   = useState(null);

  const openGalaxy = useCallback((galaxy) => {
    setSelectedGalaxy(galaxy);
    setSelectedUser(null);
    setView("department");
  }, []);

  const openUser = useCallback((user) => {
    setPendingDemoUser(null);
    setSelectedUser(user);
    setView("user");
  }, []);

  const goBack = useCallback(() => {
    if (view === "user") { setView(selectedGalaxy ? "department" : "map"); return; }
    if (view === "department") { setView("map"); setSelectedGalaxy(null); }
  }, [view, selectedGalaxy]);

  const setSourceTab = useCallback((mode) => {
    setSourceMode(mode);
    setSelectedGalaxy(null);
    setSelectedUser(null);
    setView("map");
  }, []);

  const pickTopGalaxy = useCallback(() => {
    const visible = (galaxies || []).filter((galaxy) => {
      if (sourceMode === "azuread") return galaxy.sourceType !== "network";
      if (sourceMode === "network") return galaxy.sourceType === "network";
      return true;
    });
    return [...visible].sort((a, b) => (b.riskScore || 0) - (a.riskScore || 0))[0] || null;
  }, [galaxies, sourceMode]);

  const findGalaxyByName = useCallback((name) => {
    const needle = String(name || "").trim().toLowerCase();
    if (!needle) return null;
    return (galaxies || []).find((galaxy) => String(galaxy.name || "").trim().toLowerCase() === needle)
      || (galaxies || []).find((galaxy) => String(galaxy.name || "").toLowerCase().includes(needle))
      || null;
  }, [galaxies]);

  const loadGalaxyUsers = useCallback(async (galaxy) => {
    if (!galaxy) return [];
    const embeddedUsers = Array.isArray(galaxy.users) ? galaxy.users : [];
    const source = galaxy.sourceType || galaxy.source;
    if (embeddedUsers.length || source === "network") return embeddedUsers;

    const result = await ariaFetch("GET", `/api/identity/galaxies/${encodeURIComponent(galaxy.id)}/users`);
    return result?.data?.users || [];
  }, []);

  useEffect(() => {
    const completeDemoAction = (requestId, status = "ok") => {
      if (!requestId) return;
      window.dispatchEvent(new CustomEvent("aria:identity-demo-complete", { detail: { requestId, status } }));
    };

    const onDemoAction = async (event) => {
      const detail = event?.detail || {};
      if (detail.action === "expand-top-department") {
        const galaxy = pickTopGalaxy();
        if (galaxy) openGalaxy(galaxy);
        completeDemoAction(detail.requestId, galaxy ? "ok" : "missing-galaxy");
        return;
      }

      if (detail.action === "expand-department") {
        const galaxy = findGalaxyByName(detail.name) || pickTopGalaxy();
        if (galaxy) openGalaxy(galaxy);
        completeDemoAction(detail.requestId, galaxy ? "ok" : "missing-galaxy");
        return;
      }

      if (detail.action === "select-top-identity") {
        const galaxy = selectedGalaxy || pickTopGalaxy();
        if (!galaxy) return;
        if (!selectedGalaxy || selectedGalaxy.id !== galaxy.id) openGalaxy(galaxy);
        const users = await loadGalaxyUsers(galaxy);
        const user = [...users].sort((a, b) => (b.riskScore || 0) - (a.riskScore || 0))[0];
        if (user) {
          setTimeout(() => {
            openUser(user);
            completeDemoAction(detail.requestId);
          }, 350);
        } else {
          completeDemoAction(detail.requestId, "missing-user");
        }
      }

      if (detail.action === "select-identity") {
        const galaxy = findGalaxyByName(detail.department) || selectedGalaxy || pickTopGalaxy();
        if (!galaxy) {
          completeDemoAction(detail.requestId, "missing-galaxy");
          return;
        }
        setPendingDemoUser({ name: detail.name, requestId: detail.requestId });
        if (!selectedGalaxy || selectedGalaxy.id !== galaxy.id || view !== "department") openGalaxy(galaxy);
      }
    };

    window.addEventListener("aria:identity-demo", onDemoAction);
    return () => window.removeEventListener("aria:identity-demo", onDemoAction);
  }, [findGalaxyByName, loadGalaxyUsers, openGalaxy, openUser, pickTopGalaxy, selectedGalaxy, view]);

  // Register intent handlers with App.jsx so voice commands can drive the galaxy
  useEffect(() => {
    if (!onRegisterIntents) return;

    function fuzzyMatchGalaxy(fragment) {
      if (!galaxies?.length) return null;
      const needle = fragment.toLowerCase();
      return (
        galaxies.find(g => g.name?.toLowerCase() === needle) ||
        galaxies.find(g => g.name?.toLowerCase().includes(needle)) ||
        null
      );
    }

    function fuzzyMatchUser(fragment) {
      if (!galaxies?.length) return null;
      const needle = fragment.toLowerCase();
      for (const galaxy of galaxies) {
        const match = (galaxy.users || galaxy.members || []).find(
          u => u.name?.toLowerCase().includes(needle) || u.id?.toLowerCase().includes(needle)
        );
        if (match) return { user: match, galaxy };
      }
      return null;
    }

    onRegisterIntents({
      expandDepartment(deptNameFragment) {
        const galaxy = fuzzyMatchGalaxy(deptNameFragment);
        if (galaxy) {
          openGalaxy(galaxy);
        }
      },
      isolateIdentity(nameFragment) {
        const result = fuzzyMatchUser(nameFragment);
        if (result) {
          if (view !== "department" || selectedGalaxy?.id !== result.galaxy.id) {
            openGalaxy(result.galaxy);
            // open user after galaxy animates in
            setTimeout(() => openUser(result.user), 300);
          } else {
            openUser(result.user);
          }
        }
      },
      runScan() {
        // Navigate to map view where scan authorization is visible
        setView("map");
        setSelectedGalaxy(null);
        setSelectedUser(null);
      },
      generateReport() {
        // Navigate to map view where risk leaderboard is visible in the right panel
        setView("map");
        setSelectedGalaxy(null);
        setSelectedUser(null);
      },
    });

    return () => onRegisterIntents(null);
  }, [onRegisterIntents, galaxies, openGalaxy, openUser, view, selectedGalaxy, setView, setSelectedGalaxy, setSelectedUser]);

  return (
    <div style={styles.root}>
      {/* ARIA narrator — invisible, behavioural */}
      <ARIAGalaxyNarrator
        onSpeak={onSpeak}
        galaxies={galaxies}
        dataMode={dataMode}
      />

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          {view !== "map" && (
            <button onClick={goBack} style={styles.backBtn}>× Close</button>
          )}
          <span style={styles.headerTitle}>IDENTITY & ACCESS</span>
          {view === "department" && selectedGalaxy && (
            <span style={styles.breadcrumb}>/ {selectedGalaxy.name}</span>
          )}
          {view === "user" && selectedUser && (
            <span style={styles.breadcrumb}>
              {selectedGalaxy ? `/ ${selectedGalaxy.name}` : ""} / {selectedUser.name}
            </span>
          )}
        </div>
        <div style={styles.headerRight}>
          {dataMode === "sample" && (
            <span style={styles.sampleBadge}>SAMPLE DATA</span>
          )}
          <div style={styles.sourceTabs} role="group" aria-label="Live source filter">
            {SOURCE_TABS.map((tab) => {
              const active = sourceMode === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSourceTab(tab.id)}
                  style={{
                    ...styles.sourceTab,
                    ...(active ? styles.sourceTabActive : {}),
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
          <button
            style={styles.networkBtn}
            onClick={() => setShowNetworkPanel(v => !v)}
          >
            Network{authStatus === "active" ? " ●" : ""}
          </button>
          {onClose && (
            <button style={styles.closeBtn} onClick={onClose}>✕</button>
          )}
        </div>
      </div>

      {/* ── Main layout ───────────────────────────────────────────────────── */}
      <div style={styles.body}>
        {/* ── Left: main view ─────────────────────────────────────────────── */}
        <div style={styles.mainPanel}>
          {view === "map" && (
            <SecurityGalaxyMap
              onSelectGalaxy={openGalaxy}
              selectedGalaxyId={selectedGalaxy?.id || null}
              additionalGalaxies={networkGalaxies || []}
              sourceMode={sourceMode}
            />
          )}
          {view === "department" && selectedGalaxy && (
            <GalaxyExpanded
              galaxy={selectedGalaxy}
              onSelectUser={openUser}
              onClose={goBack}
              demoSelectUserName={pendingDemoUser?.name}
              demoRequestId={pendingDemoUser?.requestId}
              onDemoSelectComplete={(requestId, status) => {
                setPendingDemoUser((pending) => pending?.requestId === requestId ? null : pending);
                window.dispatchEvent(new CustomEvent("aria:identity-demo-complete", { detail: { requestId, status } }));
              }}
            />
          )}
          {view === "user" && selectedUser && (
            <IdentityDetailPanel
              user={selectedUser}
              onClose={goBack}
            />
          )}
        </div>

        {/* ── Right: sidebar ──────────────────────────────────────────────── */}
        <div style={styles.sidebar}>
          {view === "user" && selectedUser ? (
            /* User detail sidebar — UEBA analytics */
            <div style={styles.sidebarContent}>
              <div style={styles.sidebarSection}>
                <div style={styles.sectionLabel}>BEHAVIOUR ANALYSIS</div>
                <Suspense fallback={<SidebarPlaceholder label="Behaviour Ring" />}>
                  <BehaviourRing
                    userId={selectedUser.id}
                    userName={selectedUser.name}
                    compact={false}
                  />
                </Suspense>
              </div>
              <div style={styles.sidebarSection}>
                <div style={styles.sectionLabel}>PRIVILEGE TIMELINE</div>
                <Suspense fallback={<SidebarPlaceholder label="Privilege Timeline" />}>
                  <PrivilegeDriftTimeline
                    userId={selectedUser.id}
                    userName={selectedUser.name}
                  />
                </Suspense>
              </div>
              <div style={styles.sidebarSection}>
                <div style={styles.sectionLabel}>TRAVEL ANOMALIES</div>
                <Suspense fallback={<SidebarPlaceholder label="Travel Globe" />}>
                  <ImpossibleTravelGlobe
                    events={[]}
                    width={280}
                    height={180}
                  />
                </Suspense>
              </div>
            </div>
          ) : (
            /* Default sidebar — leaderboard + policy gate */
            <div style={styles.sidebarContent}>
              {/* Sidebar tab bar */}
              <div style={styles.tabBar}>
                <button
                  style={{ ...styles.tab, ...(sidebarTab === "leaderboard" ? styles.tabActive : {}) }}
                  onClick={() => setSidebarTab("leaderboard")}
                >
                  Risk Leaders
                </button>
                <button
                  style={{ ...styles.tab, ...(sidebarTab === "policy" ? styles.tabActive : {}) }}
                  onClick={() => setSidebarTab("policy")}
                >
                  Policy Gate
                </button>
              </div>

              {sidebarTab === "leaderboard" && (
                <IdentityRiskLeaderboard onSelectUser={openUser} />
              )}
              {sidebarTab === "policy" && (
                <PolicyGateVisualiser />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Network discovery authorization modal */}
      {showNetworkPanel && (
        <div style={styles.modalScrim} onClick={() => setShowNetworkPanel(false)}>
          <div style={styles.modalBody} onClick={(e) => e.stopPropagation()}>
            <ScanAuthorization
              onAuthorized={() => { refreshNetwork(); }}
              onRevoke={() => { refreshNetwork(); }}
              onClose={() => setShowNetworkPanel(false)}
            />
          </div>
        </div>
      )}

      {/* Loading / error overlays */}
      {loading && !galaxies.length && <LoadingOverlay />}
      {error && <ErrorOverlay message={error} />}
    </div>
  );
}

function SidebarPlaceholder({ label }) {
  return (
    <div style={{ padding: 12, color: "var(--cx-text-dim)", fontSize: 11, fontFamily: "ui-monospace, monospace", letterSpacing: "0.1em" }}>
      {label}…
    </div>
  );
}

function LoadingOverlay() {
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(3,3,7,0.7)", zIndex: 10 }}>
      <span className="cx-readout" style={{ color: "var(--cx-cyan)" }}>LOADING IDENTITY DATA…</span>
    </div>
  );
}

function ErrorOverlay({ message }) {
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(3,3,7,0.7)", zIndex: 10 }}>
      <span className="cx-readout" data-state="breach">{message}</span>
    </div>
  );
}

const styles = {
  root: {
    position: "relative",
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    background: "var(--cx-void)",
    color: "var(--cx-text)",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 16px",
    borderBottom: "1px solid var(--cx-panel-line)",
    flexShrink: 0,
    gap: 12,
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  headerTitle: {
    fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.18em",
    color: "var(--cx-cyan)",
    textTransform: "uppercase",
  },
  breadcrumb: {
    fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
    fontSize: 11,
    color: "var(--cx-text-dim)",
    letterSpacing: "0.1em",
  },
  headerRight: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  sampleBadge: {
    fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: "0.14em",
    color: "var(--cx-amber)",
    background: "rgba(255,200,87,0.1)",
    border: "1px solid rgba(255,200,87,0.3)",
    borderRadius: 4,
    padding: "2px 7px",
    textTransform: "uppercase",
  },
  sourceTabs: {
    display: "inline-flex",
    alignItems: "center",
    gap: 2,
    padding: 2,
    background: "rgba(99,245,255,0.06)",
    border: "1px solid rgba(99,245,255,0.24)",
    borderRadius: 5,
    boxShadow: "inset 0 0 14px rgba(99,245,255,0.08)",
  },
  sourceTab: {
    fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: "0.12em",
    color: "var(--cx-text-dim)",
    background: "transparent",
    border: "1px solid transparent",
    borderRadius: 4,
    padding: "3px 7px",
    textTransform: "uppercase",
    cursor: "pointer",
    transition: "color 160ms, background 160ms, border-color 160ms, box-shadow 160ms",
  },
  sourceTabActive: {
    color: "var(--cx-cyan)",
    background: "rgba(99,245,255,0.14)",
    border: "1px solid rgba(99,245,255,0.48)",
    boxShadow: "0 0 12px rgba(99,245,255,0.16)",
  },
  backBtn: {
    background: "none",
    border: "1px solid var(--cx-panel-line)",
    color: "var(--cx-text-dim)",
    fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
    fontSize: 10,
    letterSpacing: "0.08em",
    padding: "3px 9px",
    borderRadius: 4,
    cursor: "pointer",
    flexShrink: 0,
  },
  networkBtn: {
    background: "none",
    border: "1px solid var(--cx-cyan)",
    color: "var(--cx-cyan)",
    fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    padding: "3px 10px",
    borderRadius: 4,
    cursor: "pointer",
    flexShrink: 0,
  },
  closeBtn: {
    background: "none",
    border: "1px solid var(--cx-panel-line)",
    color: "var(--cx-text-dim)",
    fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
    fontSize: 12,
    padding: "3px 9px",
    borderRadius: 4,
    cursor: "pointer",
    flexShrink: 0,
  },
  modalScrim: {
    position: "absolute",
    left: 0,
    right: 320,
    top: 0,
    bottom: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "transparent",
    zIndex: 20,
    pointerEvents: "none",
    padding: 20,
  },
  modalBody: {
    width: 380,
    maxWidth: "100%",
    maxHeight: "min(78vh, 560px)",
    overflowY: "auto",
    pointerEvents: "auto",
    boxShadow: "0 20px 60px rgba(0,0,0,0.46)",
  },
  body: {
    flex: 1,
    display: "flex",
    overflow: "hidden",
    minHeight: 0,
    maxHeight: "calc(100vh - 170px)",
  },
  mainPanel: {
    flex: "1 1 65%",
    display: "flex",
    minWidth: 0,
    minHeight: 0,
    position: "relative",
    overflow: "hidden",
    borderRight: "1px solid var(--cx-panel-line)",
  },
  sidebar: {
    flex: "0 0 320px",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    minWidth: 0,
    minHeight: 0,
  },
  sidebarContent: {
    flex: 1,
    overflowY: "auto",
    overflowX: "hidden",
    display: "flex",
    flexDirection: "column",
  },
  sidebarSection: {
    borderBottom: "1px solid var(--cx-panel-line)",
    padding: "10px 0",
  },
  sectionLabel: {
    fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: "0.18em",
    color: "var(--cx-text-dim)",
    textTransform: "uppercase",
    padding: "0 14px 8px",
  },
  tabBar: {
    display: "flex",
    borderBottom: "1px solid var(--cx-panel-line)",
    flexShrink: 0,
  },
  tab: {
    flex: 1,
    background: "none",
    border: "none",
    borderBottom: "2px solid transparent",
    color: "var(--cx-text-dim)",
    fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
    fontSize: 10,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    padding: "9px 4px",
    cursor: "pointer",
    transition: "color 180ms, border-color 180ms",
  },
  tabActive: {
    color: "var(--cx-cyan)",
    borderBottom: "2px solid var(--cx-cyan)",
  },
};

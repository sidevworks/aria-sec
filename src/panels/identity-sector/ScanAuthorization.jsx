// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

// ════════════════════════════════════════════════════════════════════════════
// ScanAuthorization — in-app authorization gate for network discovery.
//
// DEFENSIVE OBSERVABILITY ONLY. The operator must explicitly confirm authority
// over the target segments before any active scan can be authorized. Default
// posture is DENY: the Authorize button stays disabled until the confirmation
// checkbox is ticked. No implicit authorization, ever.
//
// Uses cosmos-tokens.css variables only — no inline hex colours.
// ════════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback } from "react";
import { ariaFetch } from "../ariaFetch.js";

const ACTIVE_SCAN_POLL_MS = 2_000;
const ACTIVE_SCAN_MAX_POLLS = 180;

const TECHNIQUES = [
  { id: "passive", label: "Passive (ARP / mDNS / rDNS)" },
  { id: "ping_sweep", label: "Ping sweep (active)" },
  { id: "port_scan", label: "Port observation (TCP connect)" },
];

export default function ScanAuthorization({ onAuthorized, onRevoke, onClose }) {
  const [auth, setAuth] = useState(null);
  const [scopeText, setScopeText] = useState("");
  const [detectedNets, setDetectedNets] = useState([]);
  const [techniques, setTechniques] = useState(["passive"]);
  const [confirmAuthority, setConfirmAuthority] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [scanInfo, setScanInfo] = useState(null);
  const [activeScan, setActiveScan] = useState(null);
  const [lastScanKind, setLastScanKind] = useState("active");

  const loadStatus = useCallback(async () => {
    const res = await ariaFetch("GET", "/api/network/status");
    if (!res.error) {
      const active = res.data?.authStatus === "active";
      setAuth(active ? res.data.authorization : null);
      setScanInfo(res.data?.lastScan || null);
      setActiveScan(res.data?.activeScan || null);
    }
    return res;
  }, []);

  useEffect(() => {
    loadStatus();
    // Auto-detect local network interfaces and pre-populate scope
    ariaFetch("GET", "/api/network/interfaces").then((res) => {
      if (!res.error && res.data?.interfaces?.length) {
        setDetectedNets(res.data.interfaces);
        // Pre-fill with first detected private subnet
        setScopeText(res.data.interfaces[0].cidr);
      } else {
        setScopeText("192.168.1.0/24");
      }
    });
  }, [loadStatus]);

  useEffect(() => {
    if (activeScan?.status !== "running") return undefined;
    const timer = setInterval(() => {
      loadStatus();
    }, ACTIVE_SCAN_POLL_MS);
    return () => clearInterval(timer);
  }, [activeScan?.status, loadStatus]);

  const toggleTechnique = (id) => {
    setTechniques((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  };

  const handleAuthorize = async () => {
    setError(null);
    setBusy(true);
    const scope = scopeText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const res = await ariaFetch("POST", "/api/network/authorize", {
      scope,
      techniques,
      confirmAuthority,
    });
    setBusy(false);
    if (res.error) {
      setError(res.message || res.error);
      return;
    }
    setAuth(res.data.authorization);
    setConfirmAuthority(false);
    onAuthorized?.(res.data.authorization);
  };

  const handleRevoke = async () => {
    setBusy(true);
    await ariaFetch("POST", "/api/network/authorize/revoke");
    setBusy(false);
    setAuth(null);
    setScanInfo(null);
    onRevoke?.();
  };

  const runScan = async (kind) => {
    setError(null);
    setBusy(true);
    setLastScanKind(kind);
    const res =
      kind === "passive"
        ? await ariaFetch("GET", "/api/network/scan/passive")
        : await ariaFetch("POST", "/api/network/scan/active", {});
    if (res.error) {
      setBusy(false);
      setError(res.error === "TIMEOUT"
        ? "Scan request timed out before the server returned status. Retry or check network status."
        : res.message || res.error);
      return;
    }
    if (kind === "active" && res.data?.status === "running") {
      setActiveScan(res.data.scan || { status: "running", message: res.data.message });
      await pollActiveScan();
      return;
    }
    setBusy(false);
    setScanInfo(res.data?.summary || null);
    const status = await loadStatus();
    onAuthorized?.(status.data?.authorization || auth);
  };

  const pollActiveScan = async () => {
    for (let attempt = 0; attempt < ACTIVE_SCAN_MAX_POLLS; attempt += 1) {
      await sleep(ACTIVE_SCAN_POLL_MS);
      const status = await loadStatus();
      if (status.error) {
        setBusy(false);
        setError(status.error === "TIMEOUT"
          ? "Timed out while checking active scan progress. The scan may still be running."
          : status.message || status.error);
        return;
      }
      const scan = status.data?.activeScan || null;
      setActiveScan(scan);
      if (scan?.status === "complete") {
        setBusy(false);
        setScanInfo(scan.summary || status.data?.lastScan || null);
        onAuthorized?.(status.data?.authorization || auth);
        return;
      }
      if (scan?.status === "error") {
        setBusy(false);
        setError(scan.message || scan.error || "Active scan failed.");
        return;
      }
    }
    setBusy(false);
    setError("Active scan is taking longer than expected. Status polling paused; retry to resume progress checks.");
  };

  // ── Authorized state ──────────────────────────────────────────────────────
  if (auth) {
    const scanRunning = busy || activeScan?.status === "running";
    const progress = activeScan?.progress;
    const progressText = progress?.total
      ? `${progress.completed}/${progress.total} hosts · ${progress.alive} live`
      : null;
    return (
      <div style={styles.root}>
        <PanelHeader title="NETWORK DISCOVERY · AUTHORIZED" onClose={onClose} />
        <div style={styles.row}>
          <span style={styles.label}>Scope</span>
          <span style={styles.value}>{(auth.scope || []).join(", ")}</span>
        </div>
        <div style={styles.row}>
          <span style={styles.label}>Techniques</span>
          <span style={styles.value}>{(auth.techniques || []).join(", ")}</span>
        </div>
        <div style={styles.row}>
          <span style={styles.label}>Expires</span>
          <span style={styles.value}>{formatTime(auth.expiresAt)}</span>
        </div>
        {scanInfo && (
          <div style={styles.row}>
            <span style={styles.label}>Last scan</span>
            <span style={styles.value}>
              {scanInfo.mode} · {scanInfo.deviceCount} devices · {scanInfo.galaxyCount} subnets
            </span>
          </div>
        )}
        {scanInfo?.scannedAt && (
          <div style={styles.row}>
            <span style={styles.label}>Last scan time</span>
            <span style={styles.value}>{formatTime(scanInfo.scannedAt)}</span>
          </div>
        )}
        {activeScan?.status === "running" && (
          <div style={styles.scanStatus}>
            <span style={styles.scanStatusTitle}>Active scan running</span>
            <span>{activeScan.message || activeScan.stage || "Scanning authorized scope..."}</span>
            {progressText && <span>{progressText}</span>}
            {progress?.total > 0 && (
              <div style={styles.progressBarOuter}>
                <div
                  style={{
                    ...styles.progressBarInner,
                    width: `${Math.min(100, Math.round((progress.completed / progress.total) * 100))}%`,
                  }}
                />
              </div>
            )}
            {activeScan.stage === "exposure_scan" && activeScan.deviceCount > 0 && (
              <div style={styles.progressBarOuter}>
                <div
                  style={{
                    ...styles.progressBarInner,
                    width: `${Math.min(100, Math.round(((activeScan.deviceProgress || 0) / activeScan.deviceCount) * 100))}%`,
                  }}
                />
              </div>
            )}
          </div>
        )}
        {activeScan?.status === "complete" && (
          <div style={styles.scanStatus}>
            <span style={styles.scanStatusTitle}>Active scan complete</span>
            <span>{activeScan.summary?.deviceCount ?? 0} devices · {activeScan.summary?.galaxyCount ?? 0} subnets</span>
          </div>
        )}
        {activeScan?.status === "error" && (
          <div style={styles.error}>{activeScan.message || activeScan.error || "Active scan failed."}</div>
        )}
        {busy && <div style={styles.scanning}>{lastScanKind === "active" ? "ACTIVE SCAN IN PROGRESS..." : "SCANNING..."}</div>}
        {error && <div style={styles.error}>{error}</div>}
        <div style={styles.btnRow}>
          <button style={styles.btn} disabled={scanRunning} onClick={() => runScan("passive")}>
            Run Passive Scan
          </button>
          <button style={styles.btn} disabled={scanRunning} onClick={() => runScan("active")}>
            Run Active Scan
          </button>
        </div>
        {error && (
          <button style={styles.retryBtn} disabled={scanRunning} onClick={() => runScan(lastScanKind || "active")}>
            Retry {lastScanKind === "passive" ? "Passive" : "Active"} Scan
          </button>
        )}
        <button style={styles.revokeBtn} disabled={scanRunning} onClick={handleRevoke}>
          Revoke Authorization
        </button>
      </div>
    );
  }

  // ── Not authorized (default) ────────────────────────────────────────────────
  const canAuthorize = confirmAuthority && techniques.length > 0 && scopeText.trim().length > 0 && !busy;

  return (
    <div style={styles.root}>
      <PanelHeader title="AUTHORIZE NETWORK DISCOVERY" onClose={onClose} />
      <div style={styles.note}>
        Defensive observability only. ARIA discovers and observes — it never authenticates to or
        modifies any device.
      </div>

      <label style={styles.fieldLabel}>Your network subnet</label>
      {detectedNets.length > 0 && (
        <div style={styles.detectedRow}>
          {detectedNets.map((n) => (
            <button
              key={n.cidr}
              style={{ ...styles.netChip, ...(scopeText === n.cidr ? styles.netChipActive : {}) }}
              onClick={() => setScopeText(n.cidr)}
            >
              {n.cidr}
              <span style={styles.netChipSub}>{n.iface} · {n.address}</span>
            </button>
          ))}
        </div>
      )}
      <input
        style={styles.input}
        value={scopeText}
        onChange={(e) => setScopeText(e.target.value)}
        placeholder="192.168.8.0/24  (or just type your IP)"
      />
      <div style={styles.inputHint}>
        You can enter a full IP like 192.168.8.98 — ARIA will scan its /24 subnet automatically.
      </div>

      <div style={styles.fieldLabel}>Techniques</div>
      {TECHNIQUES.map((t) => (
        <label key={t.id} style={styles.checkRow}>
          <input
            type="checkbox"
            checked={techniques.includes(t.id)}
            onChange={() => toggleTechnique(t.id)}
          />
          <span style={styles.checkLabel}>{t.label}</span>
        </label>
      ))}

      <label style={styles.confirmRow}>
        <input
          type="checkbox"
          checked={confirmAuthority}
          onChange={(e) => setConfirmAuthority(e.target.checked)}
        />
        <span style={styles.confirmLabel}>
          I confirm I have authority over these network segments.
        </span>
      </label>

      {error && <div style={styles.error}>{error}</div>}

      <button
        style={{ ...styles.authBtn, ...(canAuthorize ? {} : styles.authBtnDisabled) }}
        disabled={!canAuthorize}
        onClick={handleAuthorize}
      >
        {busy ? "AUTHORIZING…" : "Authorize Scan"}
      </button>
    </div>
  );
}

function PanelHeader({ title, onClose }) {
  return (
    <div style={styles.panelHeader}>
      <div style={styles.heading}>{title}</div>
      {onClose && (
        <button
          type="button"
          aria-label="Close network discovery panel"
          style={styles.panelCloseBtn}
          onClick={onClose}
        >
          X
        </button>
      )}
    </div>
  );
}

function formatTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const mono = "ui-monospace, 'SF Mono', Menlo, monospace";

const styles = {
  root: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    padding: 16,
    background: "var(--cx-panel-bg)",
    border: "1px solid var(--cx-panel-line)",
    borderRadius: 8,
    color: "var(--cx-text)",
    fontFamily: mono,
    minWidth: 320,
    maxWidth: 420,
  },
  panelHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  heading: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.16em",
    color: "var(--cx-cyan)",
    textTransform: "uppercase",
  },
  panelCloseBtn: {
    flex: "0 0 auto",
    background: "var(--cx-void)",
    border: "1px solid var(--cx-panel-line)",
    borderRadius: 4,
    color: "var(--cx-text-dim)",
    cursor: "pointer",
    fontFamily: mono,
    fontSize: 10,
    lineHeight: 1,
    padding: "5px 8px",
  },
  note: {
    fontSize: 10,
    lineHeight: 1.5,
    color: "var(--cx-text-dim)",
  },
  fieldLabel: {
    fontSize: 10,
    letterSpacing: "0.1em",
    color: "var(--cx-text-dim)",
    textTransform: "uppercase",
    marginTop: 4,
  },
  detectedRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
  },
  netChip: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    background: "var(--cx-void)",
    border: "1px solid var(--cx-panel-line)",
    borderRadius: 4,
    color: "var(--cx-text)",
    fontFamily: mono,
    fontSize: 11,
    padding: "5px 9px",
    cursor: "pointer",
    gap: 2,
  },
  netChipActive: {
    border: "1px solid var(--cx-cyan)",
    color: "var(--cx-cyan)",
  },
  netChipSub: {
    fontSize: 9,
    color: "var(--cx-text-dim)",
    letterSpacing: "0.06em",
  },
  inputHint: {
    fontSize: 10,
    color: "var(--cx-text-dim)",
    lineHeight: 1.4,
    marginTop: -4,
  },
  input: {
    background: "var(--cx-void)",
    border: "1px solid var(--cx-panel-line)",
    borderRadius: 4,
    color: "var(--cx-text)",
    fontFamily: mono,
    fontSize: 12,
    padding: "8px 10px",
  },
  checkRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    cursor: "pointer",
  },
  checkLabel: {
    fontSize: 11,
    color: "var(--cx-text)",
  },
  confirmRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    cursor: "pointer",
    marginTop: 6,
    padding: "8px",
    border: "1px solid var(--cx-panel-line)",
    borderRadius: 4,
  },
  confirmLabel: {
    fontSize: 11,
    color: "var(--cx-text)",
    lineHeight: 1.4,
  },
  authBtn: {
    background: "var(--cx-cyan)",
    border: "none",
    borderRadius: 4,
    color: "var(--cx-void)",
    fontFamily: mono,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    padding: "10px",
    cursor: "pointer",
    marginTop: 6,
  },
  authBtnDisabled: {
    opacity: 0.4,
    cursor: "not-allowed",
  },
  btnRow: {
    display: "flex",
    gap: 8,
  },
  btn: {
    flex: 1,
    background: "var(--cx-void)",
    border: "1px solid var(--cx-cyan)",
    borderRadius: 4,
    color: "var(--cx-cyan)",
    fontFamily: mono,
    fontSize: 10,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    padding: "8px",
    cursor: "pointer",
  },
  revokeBtn: {
    background: "var(--cx-void)",
    border: "1px solid var(--cx-breach)",
    borderRadius: 4,
    color: "var(--cx-breach)",
    fontFamily: mono,
    fontSize: 10,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    padding: "8px",
    cursor: "pointer",
    marginTop: 4,
  },
  retryBtn: {
    background: "var(--cx-void)",
    border: "1px solid var(--cx-panel-line)",
    borderRadius: 4,
    color: "var(--cx-cyan)",
    fontFamily: mono,
    fontSize: 10,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    padding: "8px",
    cursor: "pointer",
  },
  scanning: {
    fontSize: 11,
    letterSpacing: "0.1em",
    color: "var(--cx-cyan)",
  },
  scanStatus: {
    display: "flex",
    flexDirection: "column",
    gap: 3,
    padding: "8px 10px",
    borderRadius: 4,
    border: "1px solid var(--cx-panel-line)",
    background: "var(--cx-void)",
    color: "var(--cx-text-dim)",
    fontSize: 10,
  },
  scanStatusTitle: {
    color: "var(--cx-cyan)",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
  },
  progressBarOuter: {
    height: 4,
    borderRadius: 2,
    background: "var(--cx-panel-line)",
    overflow: "hidden",
    marginTop: 4,
  },
  progressBarInner: {
    height: "100%",
    borderRadius: 2,
    background: "var(--cx-cyan)",
    transition: "width 0.4s ease-out",
    minWidth: 0,
  },
  error: {
    fontSize: 11,
    color: "var(--cx-breach)",
    lineHeight: 1.4,
  },
  row: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    fontSize: 11,
  },
  label: {
    color: "var(--cx-text-dim)",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  value: {
    color: "var(--cx-text)",
    textAlign: "right",
  },
};

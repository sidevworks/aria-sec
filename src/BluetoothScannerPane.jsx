// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import { useCallback, useEffect, useMemo, useState } from "react";
import { ariaFetch } from "./panels/ariaFetch.js";

const CYAN = "#63f5ff";
const BLUE = "#1687ff";
const AMBER = "#ffc857";
const RED = "#ff3d81";
const MONO = "ui-monospace,'SF Mono',Menlo,monospace";

const shell = {
  border: "1px solid rgba(99,245,255,0.14)",
  borderRadius: 12,
  background: "linear-gradient(145deg,rgba(4,12,24,0.88),rgba(2,5,13,0.76))",
  boxShadow: "inset 0 1px rgba(255,255,255,0.025)",
};

function availabilityColor(value) {
  if (value === "available") return CYAN;
  if (value === "permission_denied" || value === "error") return RED;
  return AMBER;
}

function signalLabel(rssi) {
  if (!Number.isFinite(rssi)) return "unknown";
  if (rssi >= -55) return "near";
  if (rssi >= -72) return "present";
  return "edge";
}

function deviceRisk(device) {
  const confidence = Number(device.identity?.confidence || 0);
  if (confidence >= 0.85) return { label: "high confidence", color: CYAN };
  if (confidence >= 0.65) return { label: "medium confidence", color: BLUE };
  if (confidence > 0.3) return { label: "vendor only", color: AMBER };
  return { label: "unattributed", color: AMBER };
}

function SignalTrace({ history = [] }) {
  if (history.length < 2) return null;
  const width = 240;
  const height = 38;
  const values = history.slice(-30);
  const points = values.map((value, index) => {
    const x = values.length === 1 ? 0 : (index / (values.length - 1)) * width;
    const y = height - ((Math.max(-105, Math.min(-35, value)) + 105) / 70) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ width: "100%", height: 38, display: "block" }}>
      <polyline points={points} fill="none" stroke={CYAN} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Metric({ label, value, color = CYAN }) {
  return (
    <div style={{ ...shell, padding: "12px 14px", minWidth: 0 }}>
      <div style={{ color: "rgba(173,217,255,0.52)", fontSize: 9, letterSpacing: "0.14em", fontFamily: MONO }}>{label}</div>
      <div style={{ marginTop: 7, color, fontSize: 18, fontWeight: 760, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {String(value ?? "-").toUpperCase()}
      </div>
    </div>
  );
}

export default function BluetoothScannerPane() {
  const [status, setStatus] = useState(null);
  const [devices, setDevices] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [durationMs, setDurationMs] = useState(10000);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [clockMs, setClockMs] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    const [statusRes, deviceRes] = await Promise.all([
      ariaFetch("GET", "/api/bluetooth/status"),
      ariaFetch("GET", "/api/bluetooth/devices"),
    ]);
    if (statusRes.data) setStatus(statusRes.data);
    if (deviceRes.data?.devices) setDevices(deviceRes.data.devices);
    if (statusRes.error && statusRes.status !== 404) setError(statusRes.message || statusRes.error);
  }, []);

  const startScan = useCallback(async () => {
    if (busy || status?.scanning) return;
    setBusy("start");
    setError("");
    setMessage("");
    const response = await ariaFetch("POST", "/api/bluetooth/scan/start", {
      durationMs,
      allowDuplicates: true,
    });
    if (response.error) {
      setError(response.message || response.error);
    } else {
      setStatus(response.data);
      setClockMs(Date.now());
      setMessage(`Local BLE sweep started for ${Math.round(durationMs / 1000)} seconds.`);
    }
    setBusy("");
  }, [busy, durationMs, status?.scanning]);

  const stopScan = useCallback(async () => {
    if (busy) return;
    setBusy("stop");
    const response = await ariaFetch("POST", "/api/bluetooth/scan/stop", {});
    if (response.error) setError(response.message || response.error);
    else {
      setStatus(response.data);
      setMessage("BLE sweep stopped and evidence retained locally.");
      await refresh();
    }
    setBusy("");
  }, [busy, refresh]);

  useEffect(() => {
    const firstPoll = window.setTimeout(() => { void refresh(); }, 0);
    const timer = window.setInterval(() => {
      setClockMs(Date.now());
      void refresh();
    }, status?.scanning ? 1200 : 8000);
    return () => {
      window.clearTimeout(firstPoll);
      window.clearInterval(timer);
    };
  }, [refresh, status?.scanning]);

  useEffect(() => {
    const listener = () => { void startScan(); };
    window.addEventListener("aria:bluetooth-scan", listener);
    return () => window.removeEventListener("aria:bluetooth-scan", listener);
  }, [startScan]);

  const sortedDevices = useMemo(() => (
    [...devices].sort((a, b) => (Number(b.rssi) || -999) - (Number(a.rssi) || -999))
  ), [devices]);
  const selected = sortedDevices.find((device) => device.id === selectedId) || sortedDevices[0] || null;
  const unidentified = devices.filter((device) => Number(device.identity?.confidence || 0) < 0.65).length;
  const selectedRisk = selected ? deviceRisk(selected) : null;
  const scanning = Boolean(status?.scanning || status?.scan?.status === "scanning");
  const available = status?.availability === "available";
  const availability = status?.availability || "checking";
  const progress = scanning && status?.scan?.startedAt
    ? Math.min(100, Math.max(0, Math.round(((clockMs - Date.parse(status.scan.startedAt)) / durationMs) * 100)))
    : status?.scan?.status === "complete" ? 100 : 0;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 8 }}>
        <Metric label="BLE ADAPTER" value={availability} color={availabilityColor(availability)} />
        <Metric label="RADIO STATE" value={status?.adapterState || "unknown"} color={available ? CYAN : AMBER} />
        <Metric label="DEVICES OBSERVED" value={devices.length} />
        <Metric label="UNATTRIBUTED" value={unidentified} color={unidentified ? AMBER : CYAN} />
      </div>

      <div style={{ ...shell, padding: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12 }}>
          <div>
            <div style={{ color: CYAN, fontFamily: MONO, fontSize: 10, letterSpacing: "0.15em" }}>LOCAL RF DISCOVERY</div>
            <div style={{ marginTop: 6, maxWidth: 720, color: "rgba(215,235,255,0.66)", fontSize: 12, lineHeight: 1.5 }}>
              Passive Bluetooth Low Energy advertisements are observed on this machine. Aria does not pair, connect, or transmit payloads during a sweep.
            </div>
          </div>
          <div style={{ display: "flex", gap: 7, flexShrink: 0 }}>
            <select
              value={durationMs}
              onChange={(event) => setDurationMs(Number(event.target.value))}
              disabled={scanning}
              style={{ height: 34, borderRadius: 6, border: "1px solid rgba(99,245,255,0.22)", background: "rgba(0,3,10,0.8)", color: "#d7ebff", padding: "0 8px", fontFamily: MONO }}
            >
              <option value={5000}>5 seconds</option>
              <option value={10000}>10 seconds</option>
              <option value={20000}>20 seconds</option>
              <option value={30000}>30 seconds</option>
            </select>
            {scanning ? (
              <button className="controlButton" onClick={stopScan} disabled={busy === "stop"}>{busy === "stop" ? "Stopping..." : "Stop Sweep"}</button>
            ) : (
              <button className="controlButton primary" onClick={startScan} disabled={!available || busy === "start"}>{busy === "start" ? "Starting..." : "Start BLE Sweep"}</button>
            )}
          </div>
        </div>
        <div style={{ marginTop: 12, height: 5, overflow: "hidden", borderRadius: 99, background: "rgba(234,247,255,0.08)" }}>
          <div style={{ width: `${progress}%`, height: "100%", background: scanning ? `linear-gradient(90deg,${BLUE},${CYAN})` : CYAN, transition: "width .35s ease" }} />
        </div>
        <div style={{ marginTop: 7, display: "flex", justifyContent: "space-between", color: "rgba(173,217,255,0.52)", fontFamily: MONO, fontSize: 10 }}>
          <span>{status?.message || status?.scan?.status || "Waiting for adapter status"}</span>
          <span>{status?.scan?.id || ""}</span>
        </div>
        {(message || error) && (
          <div style={{ marginTop: 10, color: error ? RED : CYAN, fontSize: 12 }}>{error || message}</div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.35fr .65fr", gap: 10 }}>
        <div style={{ ...shell, overflow: "auto", maxHeight: "58vh" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 82px 92px 108px", padding: "8px 12px", borderBottom: "1px solid rgba(99,245,255,0.11)", color: "rgba(173,217,255,0.54)", fontFamily: MONO, fontSize: 9, letterSpacing: "0.12em" }}>
            <span>LIKELY DEVICE</span><span>VENDOR</span><span>SIGNAL</span><span>PROXIMITY</span><span>CONFIDENCE</span>
          </div>
          {sortedDevices.map((device) => {
            const risk = deviceRisk(device);
            const active = selected?.id === device.id;
            return (
              <button
                key={device.id}
                onClick={() => setSelectedId(device.id)}
                style={{
                  width: "100%",
                  display: "grid",
                  gridTemplateColumns: "1.4fr 1fr 82px 92px 108px",
                  padding: "9px 12px",
                  border: 0,
                  borderBottom: "1px solid rgba(99,245,255,0.07)",
                  background: active ? "rgba(22,135,255,0.13)" : "transparent",
                  color: "#d7ebff",
                  textAlign: "left",
                  cursor: "pointer",
                  fontFamily: MONO,
                  fontSize: 11,
                }}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: Number(device.identity?.confidence || 0) >= 0.65 ? "#eaf7ff" : AMBER }}>{device.identity?.label || device.localName || device.name || "Unknown BLE peripheral"}</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "rgba(215,235,255,0.68)" }}>{device.identity?.vendor || device.manufacturerData?.companyName || "unknown"}</span>
                <span style={{ color: Number(device.rssi) >= -65 ? CYAN : AMBER }}>{Number.isFinite(device.rssi) ? `${device.rssi} dBm` : "-"}</span>
                <span>{device.proximity?.band || signalLabel(device.rssi)}</span>
                <span style={{ color: risk.color }}>{risk.label}</span>
              </button>
            );
          })}
          {!sortedDevices.length && (
            <div style={{ padding: 24, color: "rgba(215,235,255,0.56)", fontSize: 12 }}>
              No advertisements captured yet. Start a sweep with Bluetooth enabled and permission granted.
            </div>
          )}
        </div>

        <div style={{ ...shell, padding: 14, minWidth: 0, maxHeight: "58vh", overflowY: "auto" }}>
          <div style={{ color: CYAN, fontFamily: MONO, fontSize: 10, letterSpacing: "0.14em" }}>RF EVIDENCE</div>
          {selected ? (
            <div style={{ marginTop: 11, display: "grid", gap: 9 }}>
              <div style={{ fontSize: 17, color: "#eaf7ff", overflow: "hidden", textOverflow: "ellipsis" }}>{selected.identity?.label || selected.localName || selected.name || "Unknown BLE peripheral"}</div>
              {[
                ["Vendor", selected.identity?.vendor || selected.manufacturerData?.companyName || "unknown"],
                ["Category", selected.identity?.category || "unknown"],
                ["Confidence", selected.identity?.confidence != null ? `${Math.round(selected.identity.confidence * 100)}% · ${selected.identity.confidenceLabel}` : "insufficient evidence"],
                ["Identifier", selected.address || selected.id],
                ["Advertised ID", selected.identity?.advertisedIdSuffix ? `…${selected.identity.advertisedIdSuffix}` : "not exposed"],
                ["Signal", Number.isFinite(selected.rssi) ? `${selected.rssi} dBm · avg ${selected.signal?.averageRssi ?? selected.rssi} · ${selected.signal?.trend || "unknown"}` : "unknown"],
                ["Signal range", Number.isFinite(selected.signal?.minRssi) ? `${selected.signal.minRssi} to ${selected.signal.maxRssi} dBm across ${selected.signal.samples} observations` : "not enough observations"],
                ["Relative position", `${selected.proximity?.label || "unknown"} relative to this Mac`],
                ["Distance", selected.proximity?.estimatedDistanceMeters != null ? `roughly ${selected.proximity.estimatedRangeMeters?.[0]}-${selected.proximity.estimatedRangeMeters?.[1]} m` : "not estimable without calibrated TX power"],
                ["TX power", Number.isFinite(selected.txPower) ? `${selected.txPower} dBm` : "not advertised"],
                ["Manufacturer", selected.manufacturerData?.companyId != null ? `${selected.manufacturerData.companyName || "Unknown company"} · ID ${selected.manufacturerData.companyId}` : "not advertised"],
                ["Services", selected.serviceDetails?.length ? selected.serviceDetails.map((service) => `${service.shortUuid || "128-bit"} ${service.name}`).join(", ") : "none advertised"],
                ["First seen", selected.firstSeen || "unknown"],
                ["Last seen", selected.lastSeen || "unknown"],
              ].map(([label, value]) => (
                <div key={label}>
                  <div style={{ color: "rgba(173,217,255,0.42)", fontFamily: MONO, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase" }}>{label}</div>
                  <div style={{ marginTop: 3, color: "rgba(234,247,255,0.76)", fontSize: 11, lineHeight: 1.4, wordBreak: "break-word" }}>{value}</div>
                </div>
              ))}
              <SignalTrace history={selected.signal?.history} />
              {selected.identity?.reasons?.length > 0 && (
                <div>
                  <div style={{ color: "rgba(173,217,255,0.42)", fontFamily: MONO, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase" }}>Why Aria thinks this</div>
                  <div style={{ marginTop: 5, display: "grid", gap: 4 }}>
                    {selected.identity.reasons.map((reason) => (
                      <div key={reason} style={{ color: "rgba(234,247,255,0.72)", fontSize: 10, lineHeight: 1.4 }}>• {reason}</div>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ marginTop: 3, border: `1px solid ${selectedRisk?.color}44`, borderRadius: 6, padding: "8px 9px", color: selectedRisk?.color, fontSize: 10, fontFamily: MONO, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                {selectedRisk?.label}
              </div>
              <div style={{ color: "rgba(173,217,255,0.46)", fontSize: 9, lineHeight: 1.45 }}>
                A single scanner cannot determine direction or exact coordinates. Room-level positioning needs multiple Aria sensors observing the same device.
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 10, color: "rgba(215,235,255,0.56)", fontSize: 12 }}>Select a device to inspect its advertisement evidence.</div>
          )}
        </div>
      </div>

      <div style={{ color: "rgba(173,217,255,0.48)", fontSize: 10, lineHeight: 1.45 }}>
        BLE privacy addresses may rotate and should not be treated as stable identity alone. Advertisement names, manufacturer data, services, and signal history are evidence for an operator to assess, not proof of identity.
      </div>
    </div>
  );
}

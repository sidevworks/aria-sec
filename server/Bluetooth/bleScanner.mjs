// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import { createHash, randomUUID } from "node:crypto";
import { platform as osPlatform } from "node:os";
import { enrichBleDevice } from "./bleIntelligence.mjs";

const MIN_SCAN_MS = 1_000;
const MAX_SCAN_MS = 60_000;
const DEFAULT_SCAN_MS = 10_000;

function isoNow() {
  return new Date().toISOString();
}

function cleanString(value, max = 256) {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, max) : null;
}

function normalizeUuid(value) {
  const raw = String(value ?? "").toLowerCase().replace(/[^a-f0-9]/g, "");
  if (!raw) return null;
  if (raw.length === 4) return `0000${raw}-0000-1000-8000-00805f9b34fb`;
  if (raw.length === 8) return `${raw}-0000-1000-8000-00805f9b34fb`;
  if (raw.length === 32) {
    return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
  }
  return raw;
}

function bufferHex(value) {
  if (!value) return null;
  try {
    const hex = Buffer.from(value).toString("hex");
    return hex || null;
  } catch {
    return null;
  }
}

function stableDeviceId(peripheral) {
  const identity = cleanString(peripheral?.address) || cleanString(peripheral?.id) || randomUUID();
  return `ble:${createHash("sha256").update(identity.toLowerCase()).digest("hex").slice(0, 24)}`;
}

function updateSignal(previous, rssi) {
  const oldHistory = Array.isArray(previous?.signal?.history) ? previous.signal.history : [];
  const history = Number.isFinite(rssi) ? [...oldHistory, rssi].slice(-30) : oldHistory;
  if (!history.length) {
    return { samples: 0, minRssi: null, maxRssi: null, averageRssi: null, trend: "unknown", history: [] };
  }
  const currentRssi = Number.isFinite(rssi) ? rssi : history.at(-1);
  const averageRssi = history.reduce((sum, value) => sum + value, 0) / history.length;
  const delta = history.length >= 4 ? history.at(-1) - history[0] : 0;
  return {
    samples: (previous?.signal?.samples || 0) + (Number.isFinite(rssi) ? 1 : 0),
    minRssi: Math.min(previous?.signal?.minRssi ?? currentRssi, currentRssi),
    maxRssi: Math.max(previous?.signal?.maxRssi ?? currentRssi, currentRssi),
    averageRssi: Number(averageRssi.toFixed(1)),
    trend: delta >= 6 ? "approaching" : delta <= -6 ? "moving away" : "stable",
    history,
  };
}

export function normalizeBlePeripheral(peripheral, previous = null, observedAt = isoNow()) {
  const advertisement = peripheral?.advertisement || {};
  const manufacturerBuffer = advertisement.manufacturerData
    ? Buffer.from(advertisement.manufacturerData)
    : null;
  const companyId = manufacturerBuffer?.length >= 2
    ? manufacturerBuffer.readUInt16LE(0)
    : null;

  const serviceData = Array.isArray(advertisement.serviceData)
    ? advertisement.serviceData.map((entry) => ({
        uuid: normalizeUuid(entry?.uuid),
        hex: bufferHex(entry?.data),
      })).filter((entry) => entry.uuid)
    : [];
  const currentServiceUuids = [...new Set(
    (advertisement.serviceUuids || []).map(normalizeUuid).filter(Boolean)
  )];

  const device = {
    id: previous?.id || stableDeviceId(peripheral),
    address: cleanString(peripheral?.address)?.toLowerCase() || previous?.address || null,
    addressType: cleanString(peripheral?.addressType, 32) || previous?.addressType || null,
    name: cleanString(advertisement.localName) || cleanString(peripheral?.name) || previous?.name || null,
    localName: cleanString(advertisement.localName) || previous?.localName || null,
    rssi: Number.isFinite(peripheral?.rssi) ? peripheral.rssi : null,
    txPower: Number.isFinite(advertisement.txPowerLevel) ? advertisement.txPowerLevel : previous?.txPower ?? null,
    connectable: typeof peripheral?.connectable === "boolean" ? peripheral.connectable : null,
    serviceUuids: currentServiceUuids.length ? currentServiceUuids : previous?.serviceUuids || [],
    manufacturerData: manufacturerBuffer
      ? { companyId, hex: manufacturerBuffer.toString("hex") }
      : previous?.manufacturerData
        ? { companyId: previous.manufacturerData.companyId, hex: previous.manufacturerData.hex }
        : null,
    serviceData: serviceData.length ? serviceData : previous?.serviceData || [],
    firstSeen: previous?.firstSeen || observedAt,
    lastSeen: observedAt,
    seenCount: (previous?.seenCount || 0) + 1,
    signal: updateSignal(previous, peripheral?.rssi),
    source: "ble",
  };
  return enrichBleDevice(device);
}

export function classifyBleError(error, adapterState = null) {
  const message = String(error?.message || error || "").toLowerCase();
  if (/permission|not authorized|unauthori[sz]ed|access denied/.test(message) || adapterState === "unauthorized") {
    return "permission_denied";
  }
  if (/powered.?off|not powered|bluetooth.*off/.test(message) || adapterState === "poweredOff") {
    return "powered_off";
  }
  if (/unsupported|not supported|no compatible|not have a compatible|module not found|cannot find package/.test(message)) {
    return "unsupported";
  }
  return "error";
}

async function loadNativeAdapter() {
  try {
    const loaded = await import("@stoprocent/noble");
    return loaded.default || loaded;
  } catch (error) {
    const wrapped = new Error(
      "Native BLE support is not installed for this build. Install the optional @stoprocent/noble dependency."
    );
    wrapped.cause = error;
    wrapped.code = "BLE_NATIVE_UNAVAILABLE";
    throw wrapped;
  }
}

export class BleScanner {
  constructor({ adapterLoader = loadNativeAdapter, platform = osPlatform(), now = Date.now } = {}) {
    this.adapterLoader = adapterLoader;
    this.platform = platform;
    this.now = now;
    this.adapter = null;
    this.adapterState = "unknown";
    this.availability = "unavailable";
    this.lastError = null;
    this.devices = new Map();
    this.scan = null;
    this.stopTimer = null;
    this.onDeviceDiscovered = null;
    this.onScanFinished = null;
    this.boundDiscover = (peripheral) => this.#recordPeripheral(peripheral);
    this.boundStateChange = (state) => {
      this.adapterState = String(state || "unknown");
      this.availability = this.#availabilityFromState(this.adapterState);
      if (this.scanning && this.availability !== "available") {
        void this.stop("adapter_state_changed");
      }
    };
  }

  get scanning() {
    return this.scan?.status === "scanning";
  }

  #availabilityFromState(state) {
    if (state === "poweredOn") return "available";
    if (state === "poweredOff") return "powered_off";
    if (state === "unauthorized") return "permission_denied";
    if (state === "unsupported") return "unsupported";
    return "unavailable";
  }

  async initialize() {
    if (this.adapter) return this.status();
    try {
      this.adapter = await this.adapterLoader();
      this.adapterState = String(this.adapter.state || "unknown");
      this.availability = this.#availabilityFromState(this.adapterState);
      this.adapter.on?.("stateChange", this.boundStateChange);
      this.adapter.on?.("discover", this.boundDiscover);
      this.lastError = null;
    } catch (error) {
      this.adapter = null;
      this.availability = classifyBleError(error);
      this.lastError = error.message;
    }
    return this.status();
  }

  status() {
    return {
      availability: this.availability,
      platform: this.platform,
      adapterState: this.adapterState,
      scanning: this.scanning,
      scan: this.scan ? { ...this.scan } : {
        id: null,
        status: "idle",
        startedAt: null,
        completedAt: null,
        durationMs: null,
      },
      deviceCount: this.devices.size,
      error: this.lastError,
      message: this.#statusMessage(),
    };
  }

  #statusMessage() {
    if (this.availability === "available") return this.scanning ? "Bluetooth LE scan in progress." : "Bluetooth LE adapter ready.";
    if (this.availability === "permission_denied") return "Bluetooth permission was denied. Allow Bluetooth access for Aria in system settings.";
    if (this.availability === "powered_off") return "Bluetooth is powered off.";
    if (this.availability === "unsupported") return "This Aria build does not have a compatible native Bluetooth LE adapter.";
    if (this.lastError) return this.lastError;
    return "Bluetooth LE adapter is not ready.";
  }

  listDevices() {
    const devices = [...this.devices.values()]
      .sort((a, b) => (b.lastSeen || "").localeCompare(a.lastSeen || ""));
    return {
      devices,
      count: devices.length,
      scannedAt: this.scan?.completedAt || this.scan?.startedAt || null,
    };
  }

  async start({ durationMs = DEFAULT_SCAN_MS, allowDuplicates = true } = {}) {
    await this.initialize();
    if (this.scanning) return this.status();
    if (this.adapter && this.availability === "unavailable" && typeof this.adapter.waitForPoweredOnAsync === "function") {
      try {
        await this.adapter.waitForPoweredOnAsync(5_000);
        this.adapterState = String(this.adapter.state || "poweredOn");
        this.availability = this.#availabilityFromState(this.adapterState);
        this.lastError = null;
      } catch (error) {
        this.adapterState = String(this.adapter.state || this.adapterState);
        this.availability = classifyBleError(error, this.adapterState);
        this.lastError = error.message;
      }
    }
    if (this.availability !== "available") {
      const error = new Error(this.#statusMessage());
      error.code = this.availability.toUpperCase();
      throw error;
    }

    const requestedDuration = Number(durationMs);
    const boundedDuration = Number.isFinite(requestedDuration)
      ? Math.min(MAX_SCAN_MS, Math.max(MIN_SCAN_MS, Math.round(requestedDuration)))
      : DEFAULT_SCAN_MS;

    this.devices.clear();
    const startedMs = this.now();
    this.scan = {
      id: randomUUID(),
      status: "scanning",
      startedAt: new Date(startedMs).toISOString(),
      completedAt: null,
      durationMs: boundedDuration,
      stopReason: null,
    };

    try {
      if (typeof this.adapter.startScanningAsync === "function") {
        await this.adapter.startScanningAsync([], Boolean(allowDuplicates));
      } else {
        await new Promise((resolve, reject) => {
          this.adapter.startScanning([], Boolean(allowDuplicates), (error) => error ? reject(error) : resolve());
        });
      }
    } catch (error) {
      this.scan.status = "error";
      this.scan.completedAt = isoNow();
      this.availability = classifyBleError(error, this.adapterState);
      this.lastError = error.message;
      throw error;
    }

    this.stopTimer = setTimeout(() => {
      void this.stop("duration_elapsed");
    }, boundedDuration);
    this.stopTimer.unref?.();
    return this.status();
  }

  async stop(reason = "operator") {
    if (!this.scanning) return this.status();
    if (this.stopTimer) clearTimeout(this.stopTimer);
    this.stopTimer = null;
    try {
      if (typeof this.adapter?.stopScanningAsync === "function") {
        await this.adapter.stopScanningAsync();
      } else if (typeof this.adapter?.stopScanning === "function") {
        await new Promise((resolve) => this.adapter.stopScanning(() => resolve()));
      }
      this.scan.status = reason === "duration_elapsed" ? "complete" : "stopped";
    } catch (error) {
      this.scan.status = "error";
      this.lastError = error.message;
    }
    this.scan.completedAt = isoNow();
    this.scan.stopReason = reason;
    this.onScanFinished?.(this.status());
    return this.status();
  }

  #recordPeripheral(peripheral) {
    if (!this.scanning) return;
    const candidate = normalizeBlePeripheral(peripheral);
    const previous = this.devices.get(candidate.id) || null;
    const device = normalizeBlePeripheral(peripheral, previous);
    this.devices.set(device.id, device);
    if (!previous) this.onDeviceDiscovered?.(device, this.scan);
  }
}

export const bleScanner = new BleScanner();

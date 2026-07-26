// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

// ════════════════════════════════════════════════════════════════════════════
// NETWORK INTELLIGENCE · Device identity claim assessment
//
// Conservative, explainable heuristics for answering:
// "Is this device what it claims to be?"
//
// This module never treats a vendor alone as proof of compromise. It emits a
// finding only when an explicit hostname/device-type claim conflicts with a
// narrowly classified hardware vendor, or when a sufficiently learned device
// baseline observes the device on a genuinely new segment.
// ════════════════════════════════════════════════════════════════════════════

const ROLE_LABELS = {
  mobile: "mobile device",
  network: "network appliance",
  printer: "printer",
  server: "server",
  workstation: "workstation",
};

const HOSTNAME_ROLE_PATTERNS = [
  ["printer", /(^|[-_.])(print(?:er)?|prn|mfp)([-_.\d]|$)/],
  ["network", /(^|[-_.])(ap|gateway|gw|router|rtr|switch|sw|firewall|fw)([-_.\d]|$)/],
  ["mobile", /(^|[-_.])(iphone|ipad|android|mobile|phone)([-_.\d]|$)/],
  ["server", /(^|[-_.])(srv|server|dc|ad|sql|db|web|app)([-_.\d]|$)/],
  ["workstation", /(^|[-_.])(desktop|laptop|macbook|workstation|ws)([-_.\d]|$)/],
];

// Only vendors with a strong product-category association belong here.
// Broad manufacturers such as HP, Canon, Samsung and Huawei intentionally do
// not: they make multiple categories and would create noisy false positives.
const VENDOR_ROLE_PATTERNS = [
  ["printer", /\b(brother|epson|lexmark|xerox|kyocera|ricoh|zebra technologies|seiko instruments)\b/],
  ["network", /\b(cisco|juniper|aruba|ubiquiti|netgear|tp[- ]?link|d[- ]?link|fortinet|palo alto networks|mikrotik|ruckus)\b/],
  ["workstation", /\b(apple|dell|lenovo|acer|framework computer|microsoft corporation)\b/],
  ["server", /\b(vmware|qemu|virtualbox|supermicro|super micro|nutanix)\b/],
];

const INCOMPATIBLE_VENDOR_ROLES = {
  mobile: new Set(["network", "printer", "server"]),
  network: new Set(["printer", "workstation"]),
  printer: new Set(["network", "server", "workstation"]),
  server: new Set(["network", "printer"]),
  workstation: new Set(["network", "printer"]),
};

function normaliseText(value) {
  return String(value || "").trim().toLowerCase();
}

export function inferClaimedDeviceRole({ hostname, deviceType, deviceTypeSource } = {}) {
  const host = normaliseText(hostname);
  if (host) {
    for (const [role, pattern] of HOSTNAME_ROLE_PATTERNS) {
      if (pattern.test(host)) return { role, source: "hostname", value: hostname };
    }
  }

  // Port/vendor-derived roles are useful for display, but are not independent
  // evidence of an identity claim. Callers mark those as inferred.
  const explicitType = normaliseText(deviceType);
  if (
    deviceTypeSource !== "inferred" &&
    Object.hasOwn(ROLE_LABELS, explicitType) &&
    explicitType !== "unknown"
  ) {
    return { role: explicitType, source: "device_type", value: deviceType };
  }
  return null;
}

export function classifyVendorDeviceRole(vendor) {
  const value = normaliseText(vendor);
  if (!value || value === "unknown") return null;
  for (const [role, pattern] of VENDOR_ROLE_PATTERNS) {
    if (pattern.test(value)) return role;
  }
  return null;
}

function confidenceLabel(confidence) {
  if (confidence >= 0.85) return "high";
  if (confidence >= 0.65) return "medium";
  return "low";
}

export function assessDeviceIdentityClaims(observation = {}, baseline = {}) {
  const findings = [];
  const claim = inferClaimedDeviceRole(observation);
  const vendorRole = classifyVendorDeviceRole(observation.vendor);

  if (
    claim &&
    vendorRole &&
    INCOMPATIBLE_VENDOR_ROLES[claim.role]?.has(vendorRole)
  ) {
    const confidence = claim.source === "device_type" ? 0.9 : 0.84;
    const claimedLabel = ROLE_LABELS[claim.role];
    const observedLabel = ROLE_LABELS[vendorRole];
    findings.push({
      type: "identity_claim_mismatch",
      severity: confidence >= 0.85 ? "high" : "medium",
      confidence,
      confidenceLabel: confidenceLabel(confidence),
      detail: `${claim.source === "hostname" ? "Hostname" : "Device type"} claims ${claimedLabel}, but MAC vendor ${observation.vendor} is associated with ${observedLabel} hardware`,
      evidence: [
        { signal: claim.source, value: claim.value, supports: `claims ${claimedLabel}` },
        { signal: "mac_oui_vendor", value: observation.vendor, supports: `associated with ${observedLabel} hardware` },
      ],
      timestamp: new Date().toISOString(),
    });
  }

  const subnet = String(observation.subnet || "").trim();
  const counts = baseline.subnetObservationCounts && typeof baseline.subnetObservationCounts === "object"
    ? baseline.subnetObservationCounts
    : {};
  const priorSeenCount = Number(baseline.seenCount || 0);
  const knownSegments = Object.keys(counts).filter((segment) => Number(counts[segment]) > 0);
  const dominantCount = Math.max(0, ...knownSegments.map((segment) => Number(counts[segment]) || 0));

  // Three prior sightings is the minimum for a meaningful "never seen here"
  // statement. Confidence rises only when one segment strongly dominates.
  if (subnet && priorSeenCount >= 3 && knownSegments.length > 0 && !knownSegments.includes(subnet)) {
    const dominance = dominantCount / Math.max(1, priorSeenCount);
    const confidence = priorSeenCount >= 10 && dominance >= 0.8 ? 0.9 : 0.72;
    findings.push({
      type: "segment_history_anomaly",
      severity: confidence >= 0.85 ? "high" : "medium",
      confidence,
      confidenceLabel: confidenceLabel(confidence),
      detail: `Device appeared on previously unseen segment ${subnet}`,
      evidence: [
        { signal: "current_segment", value: subnet, supports: "new location" },
        {
          signal: "segment_history",
          value: { observations: priorSeenCount, counts },
          supports: `not observed on this segment across ${priorSeenCount} prior sightings`,
        },
      ],
      timestamp: new Date().toISOString(),
    });
  }

  return findings;
}

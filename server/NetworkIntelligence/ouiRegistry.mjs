// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import { readFileSync } from "node:fs";

const registryUrl = new URL("../data/ieee-ma-l.json", import.meta.url);
const OUI_REGISTRY = Object.freeze(JSON.parse(readFileSync(registryUrl, "utf8")));

function normalizeOuiPrefix(mac) {
  if (!mac) return null;
  const input = String(mac).trim();
  const octets = input.split(/[:-]/);

  let hex;
  if (octets.length === 6 && octets.every((octet) => /^[0-9a-f]{1,2}$/i.test(octet))) {
    hex = octets.map((octet) => octet.padStart(2, "0")).join("");
  } else {
    hex = input.replace(/\./g, "");
    if (!/^[0-9a-f]{12}$/i.test(hex)) return null;
  }

  const firstOctet = Number.parseInt(hex.slice(0, 2), 16);
  if ((firstOctet & 2) === 2) return null;
  return hex.slice(0, 6).toUpperCase();
}

export function ouiLookup(mac) {
  const prefix = normalizeOuiPrefix(mac);
  return prefix ? OUI_REGISTRY[prefix] || null : null;
}

export function ouiRegistrySize() {
  return Object.keys(OUI_REGISTRY).length;
}

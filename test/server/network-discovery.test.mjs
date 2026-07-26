// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import assert from "node:assert/strict";
import test from "node:test";
import {
  enumerateCidr24Hosts,
  isDiscoverableHost,
  isMulticastMac,
} from "../../server/NetworkIntelligence/networkDiscovery.mjs";
import {
  ouiLookup,
  ouiRegistrySize,
} from "../../server/NetworkIntelligence/ouiRegistry.mjs";

test("network discovery rejects subnet broadcast artifacts", () => {
  assert.equal(isDiscoverableHost("192.168.8.255", "ff:ff:ff:ff:ff:ff"), false);
  assert.equal(isDiscoverableHost("192.168.8.0"), false);
  assert.equal(isDiscoverableHost("192.168.8.42", "ff:ff:ff:ff:ff:ff"), false);
  assert.equal(isDiscoverableHost("192.168.8.42", "01:00:5e:00:00:fb"), false);
  assert.equal(isDiscoverableHost("192.168.8.42", "33:33:00:00:00:fb"), false);
  assert.equal(isDiscoverableHost("192.168.8.42", "ac:de:48:00:11:22"), true);
});

test("network discovery rejects any IEEE multicast/group MAC", () => {
  assert.equal(isMulticastMac("01:00:5e:7f:ff:fa"), true);
  assert.equal(isMulticastMac("33-33-ff-12-34-56"), true);
  assert.equal(isMulticastMac("ac:de:48:00:11:22"), false);
});

test("offline IEEE MA-L registry contains the full public assignment set", () => {
  assert.ok(ouiRegistrySize() > 30_000);
});

test("OUI lookup identifies physical device vendors from the IEEE registry", () => {
  assert.equal(ouiLookup("28:6c:07:12:34:56"), "XIAOMI Electronics,CO.,LTD");
  assert.equal(ouiLookup("08-37-3d-12-34-56"), "Samsung Electronics Co.,Ltd");
  assert.equal(ouiLookup("0025.9e12.3456"), "HUAWEI TECHNOLOGIES CO.,LTD");
  assert.equal(ouiLookup("00:0c:29:12:34:56"), "VMware, Inc.");
  assert.equal(ouiLookup("02:00:00:12:34:56"), null, "randomized/local MACs have no registered vendor");
  assert.equal(ouiLookup("not-a-mac"), null);
});

test("active /24 host enumeration omits network and broadcast addresses", () => {
  const hosts = enumerateCidr24Hosts("192.168.8.0/24");
  assert.equal(hosts.includes("192.168.8.0"), false);
  assert.equal(hosts.includes("192.168.8.255"), false);
  assert.equal(hosts[0], "192.168.8.1");
  assert.equal(hosts.at(-1), "192.168.8.254");
});

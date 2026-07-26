// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

// ════════════════════════════════════════════════════════════════════════════
// IDENTITY SECTOR · Server Routes
// /api/identity/* — live Azure AD adapter + labelled dev-sample fallback.
// All responses satisfy identityContract.js shapes.
// ════════════════════════════════════════════════════════════════════════════
import { getStoredAzureAdCredentials, fetchAzureAccessToken } from "./connectors/azureadAuthStore.mjs";
import { isStrictProductionMode } from "./persistenceConfig.mjs";
import { randomUUID } from "node:crypto";
import { getEntityBaseline, seedEntityBaseline } from "./identityBaselineStore.mjs";
import { getNetworkGalaxyData, getNetworkRawDevices } from "./networkIntelligenceRoutes.mjs";

function now() { return new Date().toISOString(); }

const SUPPORTED_ENTITY_ACTIONS = new Set([
  "inspect_deep",
  "block_proposal",
  "isolate_proposal",
  "watchlist",
  "mark_trusted",
  "create_case_note",
]);

const PROPOSAL_ONLY_ACTIONS = new Set([
  "block_proposal",
  "isolate_proposal",
  "watchlist",
  "mark_trusted",
  "create_case_note",
]);

// ─── Graph API helper ─────────────────────────────────────────────────────────
async function graphGet(token, path) {
  const { request } = await import("node:https");
  return new Promise((resolve, reject) => {
    const req = request(
      { hostname: "graph.microsoft.com", path, method: "GET",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } },
      (res) => {
        let buf = "";
        res.on("data", (c) => { buf += c; });
        res.on("end", () => {
          try { resolve(JSON.parse(buf)); }
          catch { reject(new Error(`Non-JSON from Graph (${path})`)); }
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

// ─── Risk computation (mirrors identityContract.js for server use) ─────────────
function computeUserRisk({ isAdmin, isPrivileged, anomalyCount, failedAuths, privilegeDrift, accountEnabled, mfaRegistered }) {
  let s = 0;
  if (!accountEnabled)  s += 15;
  if (!mfaRegistered)   s += 20;
  if (isAdmin)          s += 10;
  if (isPrivileged)     s += 8;
  if (privilegeDrift)   s += 18;
  s += Math.min((anomalyCount || 0) * 12, 36);
  s += Math.min((failedAuths  || 0) * 4,  20);
  return Math.round(Math.min(100, Math.max(0, s)));
}

function computeDepartmentRisk({ userCount, adminCount, anomalyCount, policyViolations24h, failedAuths24h, privilegeDriftCount, disabledWithAccessCount }) {
  if (!userCount) return 0;
  const adminRatio   = adminCount / userCount;
  const anomalyRatio = Math.min(anomalyCount / Math.max(userCount, 1), 1);
  const s =
    anomalyRatio          * 35 +
    (policyViolations24h > 0 ? Math.min(policyViolations24h / 5, 1) * 20 : 0) +
    (failedAuths24h      > 0 ? Math.min(failedAuths24h      / 10, 1) * 15 : 0) +
    (privilegeDriftCount > 0 ? Math.min(privilegeDriftCount  / 3, 1) * 15 : 0) +
    (disabledWithAccessCount > 0 ? 10 : 0) +
    (adminRatio > 0.2 ? 5 : 0);
  return Math.round(Math.min(100, Math.max(0, s)));
}

function generateUserRiskReasons({ isAdmin, isPrivileged, anomalyCount, failedAuths, privilegeDrift, accountEnabled, mfaRegistered }) {
  const reasons = [];
  if (!accountEnabled) reasons.push("Account disabled but still present in directory");
  if (!mfaRegistered) reasons.push("Multi-factor authentication not registered");
  if (isAdmin) reasons.push("Global administrator role assigned");
  if (isPrivileged) reasons.push("Privileged role holder");
  if (privilegeDrift) reasons.push("Privilege escalation detected — role grants exceed baseline");
  if (anomalyCount > 0) reasons.push(`${anomalyCount} behavioural anomalies detected`);
  if (failedAuths > 3) reasons.push(`${failedAuths} failed authentication attempts`);
  return reasons;
}

function riskBand(score) {
  if (score >= 76) return "critical";
  if (score >= 51) return "warning";
  if (score >= 26) return "elevated";
  return "nominal";
}

// ─── Azure AD live fetch ──────────────────────────────────────────────────────
async function fetchLiveIdentityData() {
  const creds = getStoredAzureAdCredentials();
  if (!creds) return null;

  let token;
  try { token = await fetchAzureAccessToken(creds.clientId, creds.clientSecret, creds.tenantId); }
  catch (err) { return { error: `Token fetch failed: ${err.message}` }; }

  const [usersR, groupsR, rolesR, signInsR, caR] = await Promise.allSettled([
    graphGet(token, "/v1.0/users?$top=999&$select=id,displayName,userPrincipalName,accountEnabled,department,jobTitle,createdDateTime"),
    graphGet(token, "/v1.0/groups?$top=100&$select=id,displayName,groupTypes"),
    graphGet(token, "/v1.0/directoryRoles?$select=id,displayName,roleTemplateId"),
    graphGet(token, "/v1.0/auditLogs/signIns?$top=200&$select=id,createdDateTime,userDisplayName,userPrincipalName,ipAddress,location,status,conditionalAccessStatus,riskLevelDuringSignIn"),
    graphGet(token, "/v1.0/identity/conditionalAccess/policies?$top=50"),
  ]);

  const users       = usersR.status    === "fulfilled" ? (usersR.value.value    || []) : [];
  const groups      = groupsR.status   === "fulfilled" ? (groupsR.value.value   || []) : [];
  const roles       = rolesR.status    === "fulfilled" ? (rolesR.value.value    || []) : [];
  const signIns     = signInsR.status  === "fulfilled" ? (signInsR.value.value  || []) : [];
  const caPolicies  = caR.status       === "fulfilled" ? (caR.value.value       || []) : [];

  // Fetch role members for the top admin roles
  const ADMIN_ROLE_TEMPLATES = new Set([
    "62e90394-69f5-4237-9190-012177145e10", // Global Administrator
    "9b895d92-2cd3-44c7-9d02-a6ac2d5ea5c3", // Application Administrator
    "e8611ab8-c189-46e8-94e1-60213ab1f814", // Exchange Administrator
    "194ae4cb-b126-40b2-bd5b-6091b380977d", // Security Administrator
    "7be44c8a-adaf-4e2a-84d6-ab2649e08a13", // Privileged Authentication Administrator
  ]);
  const adminRoleIds = roles.filter(r => ADMIN_ROLE_TEMPLATES.has(r.roleTemplateId)).map(r => r.id);
  const adminUserIds = new Set();
  await Promise.allSettled(
    adminRoleIds.map(rId =>
      graphGet(token, `/v1.0/directoryRoles/${rId}/members?$select=id`)
        .then(r => (r.value || []).forEach(m => adminUserIds.add(m.id)))
        .catch(() => {})
    )
  );

  // Build sign-in index: upn → { lastSeen, failedAuths, locations }
  const signInIndex = new Map();
  for (const s of signIns) {
    const upn = (s.userPrincipalName || "").toLowerCase();
    if (!upn) continue;
    const entry = signInIndex.get(upn) || { lastSeen: null, failedAuths: 0, locations: new Set() };
    if (!entry.lastSeen || s.createdDateTime > entry.lastSeen) entry.lastSeen = s.createdDateTime;
    if (s.status?.errorCode !== 0) entry.failedAuths++;
    if (s.location?.city) entry.locations.add(s.location.city);
    signInIndex.set(upn, entry);
  }

  // Group users by department (fall back to "Unassigned" if blank)
  const deptMap = new Map(); // deptName → IdentityNode[]
  for (const u of users) {
    const dept = (u.department || "Unassigned").trim();
    const upn  = (u.userPrincipalName || "").toLowerCase();
    const si   = signInIndex.get(upn) || {};
    const isAdmin = adminUserIds.has(u.id);
    const anomalies = [];
    if (!u.accountEnabled) anomalies.push("Account disabled");
    if (si.failedAuths > 3) anomalies.push(`${si.failedAuths} failed auth(s)`);
    if (si.locations && si.locations.size > 3) anomalies.push("Unusual geo spread");

    const node = {
      id:             `azuread:user:${u.id}`,
      name:           u.displayName || u.userPrincipalName,
      upn:            u.userPrincipalName,
      departmentId:   `dept:${dept.toLowerCase().replace(/\s+/g, "-")}`,
      department:     dept,
      isAdmin,
      isPrivileged:   isAdmin,
      accountEnabled: u.accountEnabled !== false,
      lastSeen:       si.lastSeen || null,
      anomalies,
      source:         "azuread",
      riskScore:      0,
      riskBand:       "nominal",
    };
    const riskParams = {
      isAdmin, isPrivileged: isAdmin,
      anomalyCount:   anomalies.length,
      failedAuths:    si.failedAuths || 0,
      privilegeDrift: false,
      accountEnabled: node.accountEnabled,
      mfaRegistered:  true,
    };
    node.riskScore = computeUserRisk(riskParams);
    node.riskBand = riskBand(node.riskScore);
    node.riskReasons = generateUserRiskReasons(riskParams);

    if (!deptMap.has(dept)) deptMap.set(dept, []);
    deptMap.get(dept).push(node);
  }

  // Build DepartmentGalaxy list
  const galaxies = [];
  for (const [deptName, deptUsers] of deptMap) {
    const adminCount   = deptUsers.filter(u => u.isAdmin).length;
    const anomalyCount = deptUsers.filter(u => u.anomalies.length > 0).length;
    const failedAuths24h = deptUsers.reduce((sum, u) => {
      const si = signInIndex.get((u.upn || "").toLowerCase());
      return sum + (si?.failedAuths || 0);
    }, 0);
    const disabledWithAccessCount = deptUsers.filter(u => !u.accountEnabled).length;
    const signals = {
      userCount:               deptUsers.length,
      adminCount,
      anomalyCount,
      policyViolations24h:     caPolicies.length === 0 ? 1 : 0,
      failedAuths24h,
      privilegeDriftCount:     0,
      disabledWithAccessCount,
    };
    const rs = computeDepartmentRisk(signals);
    galaxies.push({
      id:        `dept:${deptName.toLowerCase().replace(/\s+/g, "-")}`,
      name:      deptName,
      riskScore: rs,
      riskBand:  riskBand(rs),
      signals,
      source:    "azuread",
      scannedAt: now(),
      users:     [],
    });
  }

  // Sort worst-first
  galaxies.sort((a, b) => b.riskScore - a.riskScore);

  return {
    dataMode:         "live",
    connectedSources: ["azuread"],
    galaxies,
    scannedAt:        now(),
    tenantId:         creds.tenantId,
    _usersByDept:     Object.fromEntries(deptMap),
    _signInIndex:     signInIndex,
  };
}

// ─── Dev-sample fallback ──────────────────────────────────────────────────────
// Clearly labelled. Superseded immediately on live source connection.
function buildDevSample() {
  const scannedAt = now();
  const depts = [
    { name: "Engineering",   userCount: 18, adminCount: 2, anomalyCount: 1, policyViolations24h: 0, failedAuths24h: 2, privilegeDriftCount: 0, disabledWithAccessCount: 0 },
    { name: "Finance",       userCount: 8,  adminCount: 1, anomalyCount: 2, policyViolations24h: 1, failedAuths24h: 5, privilegeDriftCount: 1, disabledWithAccessCount: 1 },
    { name: "HR",            userCount: 6,  adminCount: 0, anomalyCount: 0, policyViolations24h: 0, failedAuths24h: 0, privilegeDriftCount: 0, disabledWithAccessCount: 0 },
    { name: "IT Operations", userCount: 12, adminCount: 4, anomalyCount: 3, policyViolations24h: 2, failedAuths24h: 8, privilegeDriftCount: 2, disabledWithAccessCount: 0 },
    { name: "Sales",         userCount: 22, adminCount: 1, anomalyCount: 0, policyViolations24h: 0, failedAuths24h: 1, privilegeDriftCount: 0, disabledWithAccessCount: 2 },
  ];
  const galaxies = depts.map(d => {
    const rs = computeDepartmentRisk(d);
    return { id: `dept:${d.name.toLowerCase().replace(/\s+/g, "-")}`, name: d.name, riskScore: rs, riskBand: riskBand(rs), signals: { ...d }, source: "sample", scannedAt, users: [] };
  });
  galaxies.sort((a, b) => b.riskScore - a.riskScore);
  return { dataMode: "sample", connectedSources: [], galaxies, scannedAt };
}

// Sample users for a given dept (for dev-sample expand)
function buildSampleUsers(deptName) {
  const names = ["Alex Chen", "Jamie Okafor", "Priya Mehta", "Sam Torres", "Jordan Blake", "Riley Walsh"];
  return names.slice(0, 4).map((name, i) => {
    const anomalies = (deptName === "Finance" && i === 1) ? ["Unusual geo spread"] : [];
    const riskParams = { isAdmin: i === 0, isPrivileged: i === 0, anomalyCount: anomalies.length, failedAuths: i === 1 ? 4 : 0, privilegeDrift: deptName === "IT Operations" && i === 2, accountEnabled: !(deptName === "Finance" && i === 3), mfaRegistered: true };
    const rs = computeUserRisk(riskParams);
    return {
      id:             `sample:user:${deptName}-${i}`,
      name,
      upn:            `${name.toLowerCase().replace(/\s/, ".")}@sample.local`,
      departmentId:   `dept:${deptName.toLowerCase().replace(/\s+/g, "-")}`,
      department:     deptName,
      isAdmin:        i === 0,
      isPrivileged:   i === 0,
      accountEnabled: !(deptName === "Finance" && i === 3),
      lastSeen:       i === 0 ? now() : null,
      anomalies,
      source:         "sample",
      riskScore:      rs,
      riskBand:       riskBand(rs),
      riskReasons:    generateUserRiskReasons(riskParams),
    };
  });
}

// ─── In-memory galaxy cache (TTL 60s) ────────────────────────────────────────
let _galaxyCache = null;
let _galaxyCacheAt = 0;
const CACHE_TTL_MS = 60_000;

// Demo mode is requested per-request via ?demo=true. When set we always serve
// the labelled dev-sample org (Jamie Okafor et al.) and bypass the live source,
// without touching the live cache.
function wantsDemo(req) {
  if (String(req?.headers?.["x-aria-demo"] || "") === "1") return true;
  try {
    return new URL(req.url, "http://localhost").searchParams.get("demo") === "true";
  } catch {
    return false;
  }
}

async function getGalaxyData(forceDemo = false) {
  if (forceDemo) return buildDevSample();
  if (_galaxyCache && Date.now() - _galaxyCacheAt < CACHE_TTL_MS) return _galaxyCache;
  const live = await fetchLiveIdentityData();
  if (live && !live.error) {
    _galaxyCache = live;
    _galaxyCacheAt = Date.now();
    return live;
  }
  const sample = buildDevSample();
  _galaxyCache = sample;
  _galaxyCacheAt = Date.now();
  return sample;
}

export function invalidateGalaxyCache() {
  _galaxyCache = null;
  _galaxyCacheAt = 0;
}

async function readJsonBody(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

function requestActor(req) {
  return String(req?.headers?.["x-user-id"] || "identity-api").trim() || "identity-api";
}

function requestContext(req, extra = {}) {
  return {
    tenant_id: String(req?.headers?.["x-tenant-id"] || "tenant-local").trim() || "tenant-local",
    role: String(req?.headers?.["x-role"] || "unknown").trim() || "unknown",
    ...extra,
  };
}

function emitIdentityAudit(logAuditEvent, req, event_type, { status = "success", context = {} } = {}) {
  if (typeof logAuditEvent !== "function") return null;
  return logAuditEvent({
    event_type,
    status,
    actor: requestActor(req),
    context: requestContext(req, context),
  });
}

function identityActionId() {
  return `idact-${randomUUID()}`;
}

function identityEnforcementCapability() {
  const connector = String(process.env.ARIA_IDENTITY_ENFORCEMENT_CONNECTOR || "").trim();
  if (!connector || connector.toLowerCase() === "none") return null;
  return {
    connector,
    status: "available",
    mode: "approval_required",
    note: "Connector metadata is available; this route will not claim enforcement without an executable backend action.",
  };
}

function enterpriseActionResponse({ status, action_id, enforcement_mode, requires_approval, rollback_available, evidence }) {
  return { status, action_id, enforcement_mode, requires_approval, rollback_available, evidence };
}

function allIdentityUsers(data) {
  if (data?.dataMode === "sample") return data.galaxies.flatMap(g => buildSampleUsers(g.name));
  return Object.values(data?._usersByDept || {}).flat();
}

async function findIdentityEntity(data, entityId) {
  const users = allIdentityUsers(data);
  const entity = users.find(u => u.id === entityId || u.upn === entityId);
  if (entity) return { type: "user", entity };
  const galaxy = (data?.galaxies || []).find(g => g.id === entityId || g.name === entityId);
  if (galaxy) return { type: "department", entity: galaxy };

  const netData = await getNetworkGalaxyData();
  if (netData?.galaxies) {
    const allNetNodes = netData.galaxies.flatMap(g => g.users || []);
    const netEntity = allNetNodes.find(n => n.id === entityId || n.upn === entityId);
    if (netEntity) return { type: "network_device", entity: netEntity };
  }

  return {
    type: "unknown",
    entity: {
      id: entityId,
      name: entityId,
      source: data?.dataMode || "unknown",
      riskScore: 0,
      riskBand: "unknown",
    },
  };
}

function recommendedIdentityActions(entity) {
  const riskScore = Number(entity?.riskScore || 0);
  const actions = ["inspect_deep", "create_case_note"];
  if (riskScore >= 51) actions.push("watchlist");
  if (riskScore >= 76) actions.push("block_proposal", "isolate_proposal");
  if (riskScore <= 10) actions.push("mark_trusted");
  return actions;
}

const PORT_SERVICE_NAMES = { 22: "SSH", 23: "Telnet", 80: "HTTP", 443: "HTTPS", 445: "SMB", 3389: "RDP", 5900: "VNC", 8080: "HTTP-Alt", 8443: "HTTPS-Alt", 9100: "Print" };
const ADMIN_PORT_SET = new Set([22, 23, 3389, 5900]);

function buildNetworkDeviceRiskReasons(entity, rawDevice) {
  const reasons = [];
  const vendor = rawDevice?.vendor || entity.vendor;
  const hostname = rawDevice?.hostname || entity.hostname || entity.name;
  const openPorts = rawDevice?.openPorts || entity.openPorts || [];
  const riskScore = entity.riskScore ?? 0;

  if (!vendor || vendor === "Unknown") {
    reasons.push({ severity: "high", text: "MAC vendor unrecognised — possible rogue device" });
  }
  const hasResolvedHostname = hostname && !hostname.startsWith("Unknown-");
  if (!hasResolvedHostname) {
    reasons.push({ severity: "medium", text: "Hostname unresolvable — device not registered in DNS" });
  }
  for (const port of openPorts) {
    if (ADMIN_PORT_SET.has(port)) {
      const svc = PORT_SERVICE_NAMES[port] || port;
      reasons.push({ severity: "high", text: `Administrative port ${port} (${svc}) open` });
    }
  }
  if (riskScore >= 60) {
    reasons.push({ severity: "high", text: `Elevated risk score: ${riskScore}/100` });
  } else if (riskScore >= 35) {
    reasons.push({ severity: "medium", text: `Moderate risk score: ${riskScore}/100` });
  }
  const anomalies = entity.anomalies || [];
  for (const a of anomalies) {
    if (!reasons.some(r => r.text.includes(a))) {
      reasons.push({ severity: "medium", text: a });
    }
  }
  const identityFindings = rawDevice?.identityFindings || entity.identityFindings || [];
  for (const finding of identityFindings) {
    if (!finding?.detail || reasons.some((reason) => reason.text === finding.detail)) continue;
    reasons.push({
      severity: finding.severity || "medium",
      text: finding.detail,
      type: finding.type,
      confidence: finding.confidence ?? null,
      confidenceLabel: finding.confidenceLabel || null,
      evidence: Array.isArray(finding.evidence) ? finding.evidence : [],
    });
  }
  return reasons;
}

function buildNetworkRecommendedActions(riskScore) {
  const actions = ["inspect_deep", "create_case_note"];
  if (riskScore >= 51) actions.push("watchlist", "isolate_proposal");
  if (riskScore >= 76) actions.push("block_proposal");
  if (riskScore <= 10) actions.push("mark_trusted");
  return actions;
}

async function buildInspectionEvidence(entityId, data) {
  const resolved = await findIdentityEntity(data, entityId);
  const entity = resolved.entity;

  if (resolved.type === "network_device") {
    const rawDevices = await getNetworkRawDevices();
    const ip = entity.upn || entityId.replace(/^device:/, "");
    const rawDevice = rawDevices.find(d => d.ip === ip) || null;

    const enrichedEntity = {
      ...entity,
      ip: rawDevice?.ip || entity.upn,
      mac: rawDevice?.mac || entity.mac || null,
      vendor: rawDevice?.vendor || entity.vendor || null,
      hostname: rawDevice?.hostname || entity.hostname || (entity.name?.startsWith("Unknown-") ? null : entity.name),
      openPorts: rawDevice?.openPorts || entity.openPorts || [],
      subnet: entity.departmentId?.replace("subnet:", "").replace(/-/g, ".") || null,
      scanMethod: rawDevice?.discoveryMethod || ["unknown"],
      firstSeen: rawDevice?.firstSeen || entity.firstSeen || null,
      lastSeen: rawDevice?.lastSeen || entity.lastSeen || null,
      banners: rawDevice?.banners || {},
      exposures: rawDevice?.exposures || [],
      deviceType: rawDevice?.deviceType || entity.deviceType || null,
      baselineEntityId: rawDevice?.baselineEntityId || entity.baselineEntityId || null,
      identityFindings: rawDevice?.identityFindings || entity.identityFindings || [],
    };

    return {
      entity_type: "network_device",
      entity: enrichedEntity,
      dataMode: "live",
      connectedSources: ["network"],
      inspected_at: now(),
      recommended_actions: buildNetworkRecommendedActions(entity.riskScore ?? 0),
      riskReasons: buildNetworkDeviceRiskReasons(enrichedEntity, rawDevice),
      behaviour: null,
      privilege_timeline: [],
    };
  }
  const behaviour = resolved.type === "user" ? await buildBehaviourBaseline(entity.id, data) : null;
  const privilege = resolved.type === "user" ? buildPrivilegeTimeline(entity.id) : null;
  return {
    entity_type: resolved.type,
    entity,
    dataMode: data.dataMode,
    connectedSources: data.connectedSources || [],
    inspected_at: now(),
    recommended_actions: recommendedIdentityActions(entity),
    behaviour,
    privilege_timeline: privilege?.events || [],
  };
}

async function buildTimelineEvidence(entityId, data) {
  const resolved = await findIdentityEntity(data, entityId);
  const entity = resolved.entity;

  const isNetworkDevice = resolved.type === "network_device"
    || (resolved.type === "unknown" && entityId.startsWith("device:"));

  if (isNetworkDevice) {
    return {
      entity,
      dataMode: data.dataMode,
      timeline: [
        { id: `${entityId}:discovered`, timestamp: entity.firstSeen || entity.scannedAt || data.scannedAt || now(), type: "device.discovered", label: "Device discovered on network", severity: "nominal" },
      ],
    };
  }

  const privilegeEvents = resolved.type === "user" ? buildPrivilegeTimeline(entity.id).events : [];
  const baselineResult = resolved.type === "user" ? await buildBehaviourBaseline(entity.id, data) : null;
  const behaviourEvents = baselineResult
    ? baselineResult.recentDeviations.map((event, index) => ({
        id: `${entity.id}:behaviour:${index}`,
        timestamp: event.timestamp,
        type: event.type,
        label: `Behaviour deviation: ${event.type}`,
        severity: event.severity,
      }))
    : [];
  const timeline = resolved.type === "user"
    ? [
        ...privilegeEvents.map((event, index) => ({
          id: `${entity.id}:privilege:${index}`,
          timestamp: event.timestamp,
          type: "privilege_change",
          label: `${event.action} ${event.role}`,
          severity: event.level === "elevated" ? "high" : "low",
          details: event,
        })),
        ...behaviourEvents,
      ]
    : [
        { id: `${entityId}:scanned`, timestamp: entity.scannedAt || data.scannedAt || now(), type: "identity.scanned", label: "Identity posture scanned", severity: entity.riskBand || "nominal" },
      ];
  return {
    entity,
    dataMode: data.dataMode,
    timeline: timeline
      .filter(Boolean)
      .sort((a, b) => String(b.timestamp || "").localeCompare(String(a.timestamp || ""))),
  };
}

function buildApprovalProposal({ action_id, action, entityId, body, capability }) {
  return {
    id: `proposal-${action_id}`,
    action,
    entity_id: entityId,
    approval_status: "pending",
    requested_at: now(),
    requested_by: String(body?.requested_by || "api"),
    reason: String(body?.reason || "").trim() || "No reason supplied.",
    connector: capability?.connector || null,
    evidence: body?.evidence || {},
  };
}

// ─── Route handler ────────────────────────────────────────────────────────────
export async function handleIdentityRoute(req, res, apiPath, jsonResponse, authorizeRequest, logAuditEvent) {
  // RBAC / tenant guard at entry. Write actions remain admin/owner gated by
  // authz and are proposal-only unless an executable connector is present.
  if (typeof authorizeRequest === "function") {
    const authz = await authorizeRequest({ req, apiPath });
    if (!authz.allowed) {
      jsonResponse(req, res, authz.statusCode || 403, { error: authz.error || "Forbidden" });
      return true;
    }
  }

  // GET /api/identity/entities/:id/inspect
  const entityInspectMatch = apiPath.match(/^\/api\/identity\/entities\/(.+)\/inspect$/);
  if (req.method === "GET" && entityInspectMatch) {
    const entityId = decodeURIComponent(entityInspectMatch[1]);
    const action_id = identityActionId();
    emitIdentityAudit(logAuditEvent, req, "identity.action_requested", {
      context: { action_id, action: "inspect_deep", entity_id: entityId },
    });
    try {
      const data = await getGalaxyData(wantsDemo(req));
      if (isStrictProductionMode() && data.dataMode !== "live") {
        emitIdentityAudit(logAuditEvent, req, "identity.action_denied", {
          status: "denied",
          context: { action_id, action: "inspect_deep", entity_id: entityId, reason: "Strict production mode requires live identity source data." },
        });
        jsonResponse(req, res, 503, enterpriseActionResponse({
          status: "denied",
          action_id,
          enforcement_mode: "proposal_only",
          requires_approval: false,
          rollback_available: false,
          evidence: { reason: "IDENTITY_SOURCE_UNAVAILABLE" },
        }));
        return true;
      }
      const evidence = await buildInspectionEvidence(entityId, data);
      emitIdentityAudit(logAuditEvent, req, "identity.action_completed", {
        context: { action_id, action: "inspect_deep", entity_id: entityId, dataMode: data.dataMode },
      });
      jsonResponse(req, res, 200, enterpriseActionResponse({
        status: "completed",
        action_id,
        enforcement_mode: "executed",
        requires_approval: false,
        rollback_available: false,
        evidence,
      }));
    } catch (err) {
      emitIdentityAudit(logAuditEvent, req, "identity.action_denied", {
        status: "denied",
        context: { action_id, action: "inspect_deep", entity_id: entityId, reason: err.message },
      });
      jsonResponse(req, res, 500, enterpriseActionResponse({
        status: "denied",
        action_id,
        enforcement_mode: "proposal_only",
        requires_approval: false,
        rollback_available: false,
        evidence: { reason: err.message },
      }));
    }
    return true;
  }

  // POST /api/identity/entities/:id/action
  const entityActionMatch = apiPath.match(/^\/api\/identity\/entities\/(.+)\/action$/);
  if (req.method === "POST" && entityActionMatch) {
    const entityId = decodeURIComponent(entityActionMatch[1]);
    const action_id = identityActionId();
    let body;
    try {
      body = await readJsonBody(req);
    } catch (err) {
      emitIdentityAudit(logAuditEvent, req, "identity.action_denied", {
        status: "denied",
        context: { action_id, entity_id: entityId, reason: `Invalid JSON body: ${err.message}` },
      });
      jsonResponse(req, res, 400, enterpriseActionResponse({
        status: "denied",
        action_id,
        enforcement_mode: "proposal_only",
        requires_approval: false,
        rollback_available: false,
        evidence: { reason: "Invalid JSON body." },
      }));
      return true;
    }

    const action = String(body?.action || "").trim();
    emitIdentityAudit(logAuditEvent, req, "identity.action_requested", {
      context: { action_id, action: action || null, entity_id: entityId },
    });

    if (!SUPPORTED_ENTITY_ACTIONS.has(action)) {
      const reason = `Unsupported identity action: ${action || "missing"}`;
      emitIdentityAudit(logAuditEvent, req, "identity.action_denied", {
        status: "denied",
        context: { action_id, action: action || null, entity_id: entityId, reason },
      });
      jsonResponse(req, res, 400, enterpriseActionResponse({
        status: "denied",
        action_id,
        enforcement_mode: "proposal_only",
        requires_approval: false,
        rollback_available: false,
        evidence: { reason, supported_actions: [...SUPPORTED_ENTITY_ACTIONS] },
      }));
      return true;
    }

    try {
      const data = await getGalaxyData(wantsDemo(req));
      if (isStrictProductionMode() && data.dataMode !== "live") {
        emitIdentityAudit(logAuditEvent, req, "identity.action_denied", {
          status: "denied",
          context: { action_id, action, entity_id: entityId, reason: "Strict production mode requires live identity source data." },
        });
        jsonResponse(req, res, 503, enterpriseActionResponse({
          status: "denied",
          action_id,
          enforcement_mode: "proposal_only",
          requires_approval: false,
          rollback_available: false,
          evidence: { reason: "IDENTITY_SOURCE_UNAVAILABLE" },
        }));
        return true;
      }

      if (action === "inspect_deep") {
        const evidence = await buildInspectionEvidence(entityId, data);
        emitIdentityAudit(logAuditEvent, req, "identity.action_completed", {
          context: { action_id, action, entity_id: entityId, dataMode: data.dataMode },
        });
        jsonResponse(req, res, 200, enterpriseActionResponse({
          status: "completed",
          action_id,
          enforcement_mode: "executed",
          requires_approval: false,
          rollback_available: false,
          evidence,
        }));
        return true;
      }

      if (PROPOSAL_ONLY_ACTIONS.has(action)) {
        const capability = identityEnforcementCapability();
        const proposal = buildApprovalProposal({ action_id, action, entityId, body, capability });
        emitIdentityAudit(logAuditEvent, req, "identity.proposal_created", {
          context: { action_id, action, entity_id: entityId, proposal_id: proposal.id, connector: capability?.connector || null },
        });
        emitIdentityAudit(logAuditEvent, req, "identity.action_completed", {
          context: { action_id, action, entity_id: entityId, outcome: "proposal_created" },
        });
        jsonResponse(req, res, 202, enterpriseActionResponse({
          status: "proposal_created",
          action_id,
          enforcement_mode: capability ? "connector_available" : "proposal_only",
          requires_approval: true,
          rollback_available: false,
          evidence: {
            proposal,
            connector_capability: capability,
            message: capability
              ? "Connector metadata is available; approval is required before backend enforcement."
              : "No enforcement connector is configured; approval proposal created only.",
          },
        }));
        return true;
      }
    } catch (err) {
      emitIdentityAudit(logAuditEvent, req, "identity.action_denied", {
        status: "denied",
        context: { action_id, action, entity_id: entityId, reason: err.message },
      });
      jsonResponse(req, res, 500, enterpriseActionResponse({
        status: "denied",
        action_id,
        enforcement_mode: "proposal_only",
        requires_approval: false,
        rollback_available: false,
        evidence: { reason: err.message },
      }));
    }
    return true;
  }

  // GET /api/identity/entities/:id/timeline
  const entityTimelineMatch = apiPath.match(/^\/api\/identity\/entities\/(.+)\/timeline$/);
  if (req.method === "GET" && entityTimelineMatch) {
    const entityId = decodeURIComponent(entityTimelineMatch[1]);
    const action_id = identityActionId();
    try {
      const data = await getGalaxyData(wantsDemo(req));
      if (isStrictProductionMode() && data.dataMode !== "live") {
        jsonResponse(req, res, 503, enterpriseActionResponse({
          status: "denied",
          action_id,
          enforcement_mode: "proposal_only",
          requires_approval: false,
          rollback_available: false,
          evidence: { reason: "IDENTITY_SOURCE_UNAVAILABLE" },
        }));
        return true;
      }
      jsonResponse(req, res, 200, enterpriseActionResponse({
        status: "completed",
        action_id,
        enforcement_mode: "executed",
        requires_approval: false,
        rollback_available: false,
        evidence: await buildTimelineEvidence(entityId, data),
      }));
    } catch (err) {
      jsonResponse(req, res, 500, enterpriseActionResponse({
        status: "denied",
        action_id,
        enforcement_mode: "proposal_only",
        requires_approval: false,
        rollback_available: false,
        evidence: { reason: err.message },
      }));
    }
    return true;
  }

  // GET /api/identity/galaxies
  if (req.method === "GET" && apiPath === "/api/identity/galaxies") {
    try {
      const data = await getGalaxyData(wantsDemo(req));
      if (isStrictProductionMode() && data.dataMode !== "live") {
        jsonResponse(req, res, 503, {
          error: "IDENTITY_SOURCE_UNAVAILABLE",
          message: "Strict production mode requires live identity source data.",
        });
        return true;
      }
      jsonResponse(req, res, 200, {
        dataMode:         data.dataMode,
        connectedSources: data.connectedSources,
        galaxies:         data.galaxies,
        scannedAt:        data.scannedAt,
      });
    } catch (err) {
      jsonResponse(req, res, 500, { error: err.message });
    }
    return true;
  }

  // GET /api/identity/galaxies/:deptId/users
  const usersMatch = apiPath.match(/^\/api\/identity\/galaxies\/([^/]+)\/users$/);
  if (req.method === "GET" && usersMatch) {
    const deptId = decodeURIComponent(usersMatch[1]);
    try {
      const data = await getGalaxyData(wantsDemo(req));
      if (isStrictProductionMode() && data.dataMode !== "live") {
        jsonResponse(req, res, 503, {
          error: "IDENTITY_SOURCE_UNAVAILABLE",
          message: "Strict production mode requires live identity source data.",
        });
        return true;
      }
      if (data.dataMode === "sample") {
        const galaxy = data.galaxies.find(g => g.id === deptId);
        const deptName = galaxy?.name || deptId.replace("dept:", "");
        jsonResponse(req, res, 200, { dataMode: "sample", users: buildSampleUsers(deptName) });
        return true;
      }
      const deptName = Object.keys(data._usersByDept || {}).find(k =>
        `dept:${k.toLowerCase().replace(/\s+/g, "-")}` === deptId
      );
      const users = deptName ? (data._usersByDept[deptName] || []) : [];
      jsonResponse(req, res, 200, { dataMode: data.dataMode, users });
    } catch (err) {
      jsonResponse(req, res, 500, { error: err.message });
    }
    return true;
  }

  // GET /api/identity/leaderboard
  if (req.method === "GET" && apiPath === "/api/identity/leaderboard") {
    try {
      const data = await getGalaxyData(wantsDemo(req));
      if (isStrictProductionMode() && data.dataMode !== "live") {
        jsonResponse(req, res, 503, {
          error: "IDENTITY_SOURCE_UNAVAILABLE",
          message: "Strict production mode requires live identity source data.",
        });
        return true;
      }
      let allUsers = [];
      if (data.dataMode === "sample") {
        allUsers = data.galaxies.flatMap(g => buildSampleUsers(g.name));
      } else {
        allUsers = Object.values(data._usersByDept || {}).flat();
      }
      const top5 = [...allUsers].sort((a, b) => b.riskScore - a.riskScore).slice(0, 5);
      jsonResponse(req, res, 200, { dataMode: data.dataMode, leaderboard: top5 });
    } catch (err) {
      jsonResponse(req, res, 500, { error: err.message });
    }
    return true;
  }

  // GET /api/identity/access-events
  if (req.method === "GET" && apiPath === "/api/identity/access-events") {
    try {
      const data = await getGalaxyData(wantsDemo(req));
      if (isStrictProductionMode() && data.dataMode !== "live") {
        jsonResponse(req, res, 503, {
          error: "IDENTITY_SOURCE_UNAVAILABLE",
          message: "Strict production mode requires live identity source data.",
        });
        return true;
      }
      let events = [];
      if (data.dataMode === "sample") {
        events = buildSampleAccessEvents();
      } else {
        events = buildLiveAccessEvents(data._signInIndex);
      }
      jsonResponse(req, res, 200, { dataMode: data.dataMode, events });
    } catch (err) {
      jsonResponse(req, res, 500, { error: err.message });
    }
    return true;
  }

  // GET /api/identity/behaviour/:userId
  const behaviourMatch = apiPath.match(/^\/api\/identity\/behaviour\/(.+)$/);
  if (req.method === "GET" && behaviourMatch) {
    const userId = decodeURIComponent(behaviourMatch[1]);
    try {
      const data = await getGalaxyData(wantsDemo(req));
      if (isStrictProductionMode() && data.dataMode !== "live") {
        jsonResponse(req, res, 503, {
          error: "IDENTITY_SOURCE_UNAVAILABLE",
          message: "Strict production mode requires live identity source data.",
        });
        return true;
      }
      jsonResponse(req, res, 200, await buildBehaviourBaseline(userId, data));
    } catch (err) {
      jsonResponse(req, res, 500, { error: err.message });
    }
    return true;
  }

  // GET /api/identity/privilege-timeline/:userId
  const privMatch = apiPath.match(/^\/api\/identity\/privilege-timeline\/(.+)$/);
  if (req.method === "GET" && privMatch) {
    const userId = decodeURIComponent(privMatch[1]);
    try {
      const data = await getGalaxyData(wantsDemo(req));
      if (isStrictProductionMode() && data.dataMode !== "live") {
        jsonResponse(req, res, 503, {
          error: "IDENTITY_SOURCE_UNAVAILABLE",
          message: "Strict production mode requires live identity source data.",
        });
        return true;
      }
      jsonResponse(req, res, 200, buildPrivilegeTimeline(userId));
    } catch (err) {
      jsonResponse(req, res, 500, { error: err.message });
    }
    return true;
  }

  // POST /api/identity/refresh (invalidates cache, triggers rescan)
  if (req.method === "POST" && apiPath === "/api/identity/refresh") {
    invalidateGalaxyCache();
    try {
      const data = await getGalaxyData(wantsDemo(req));
      jsonResponse(req, res, 200, { dataMode: data.dataMode, galaxyCount: data.galaxies.length, scannedAt: data.scannedAt });
    } catch (err) {
      jsonResponse(req, res, 500, { error: err.message });
    }
    return true;
  }

  return false; // not handled
}

// ─── Access event builders ─────────────────────────────────────────────────────
function buildSampleAccessEvents() {
  const ts = (offsetMs) => new Date(Date.now() - offsetMs).toISOString();
  return [
    { id: "ae1", userId: "sample:user:Finance-1", userName: "Jamie Okafor", resourceId: "res:payroll", resourceName: "Payroll System", action: "READ", result: "allow", timestamp: ts(120_000), location: "New York", ipAddress: "203.0.113.42", riskScore: 22 },
    { id: "ae2", userId: "sample:user:IT Operations-0", userName: "Alex Chen", resourceId: "res:infra-admin", resourceName: "Infrastructure Admin Console", action: "WRITE", result: "step_up", timestamp: ts(300_000), location: "London", ipAddress: "198.51.100.7", riskScore: 65 },
    { id: "ae3", userId: "sample:user:Finance-3", userName: "Sam Torres", resourceId: "res:payroll", resourceName: "Payroll System", action: "EXPORT", result: "block", timestamp: ts(600_000), location: "Singapore", ipAddress: "192.0.2.88", riskScore: 88 },
    { id: "ae4", userId: "sample:user:Engineering-0", userName: "Alex Chen", resourceId: "res:codebase", resourceName: "Source Control", action: "CLONE", result: "allow", timestamp: ts(900_000), location: "New York", ipAddress: "203.0.113.1", riskScore: 8 },
    { id: "ae5", userId: "sample:user:HR-1", userName: "Jamie Okafor", resourceId: "res:hr-system", resourceName: "HR Management", action: "READ", result: "allow", timestamp: ts(1_200_000), location: "New York", ipAddress: "203.0.113.5", riskScore: 5 },
  ];
}

function buildLiveAccessEvents(signInIndex) {
  if (!signInIndex) return [];
  const events = [];
  let idx = 0;
  for (const [upn, si] of signInIndex) {
    if (idx >= 20) break;
    if (si.lastSeen) {
      events.push({
        id:           `live:ae:${idx}`,
        userId:       `azuread:upn:${upn}`,
        userName:     upn.split("@")[0],
        resourceId:   "azuread:app:signin",
        resourceName: "Azure AD Sign-In",
        action:       "AUTH",
        result:       si.failedAuths > 0 ? "block" : "allow",
        timestamp:    si.lastSeen,
        location:     [...(si.locations || [])][0] || null,
        ipAddress:    null,
        riskScore:    Math.min(si.failedAuths * 15, 90),
      });
      idx++;
    }
  }
  return events.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 20);
}

// ─── Behaviour baseline builder ───────────────────────────────────────────────
async function buildBehaviourBaseline(userId, data) {
  const isLive = data.dataMode === "live";

  if (userId.startsWith("device:")) {
    return {
      dataMode:         isLive ? "live" : "sample",
      userId,
      status:           "not_applicable",
      learningProgress: 0,
      seenCount:        0,
      firstSeen:        null,
      lastSeen:         null,
      typicalPorts:     [],
      subnetHistory:    [],
      riskScoreTrend:   [],
      anomalyScore:     0,
      recentDeviations: [],
      message:          "Behaviour baselines are not applicable for network devices",
    };
  }

  const users = isLive
    ? Object.values(data?._usersByDept || {}).flat()
    : (data.galaxies || []).flatMap(g => buildSampleUsers(g.name));
  const entity = users.find(u => u.id === userId || u.upn === userId);
  if (entity) {
    await seedEntityBaseline(userId, {
      riskScore: entity.riskScore,
      subnet:    entity.subnet || null,
      hostname:  entity.hostname || null,
      vendor:    entity.vendor || null,
      openPorts: entity.openPorts || [],
    });
  }

  const baseline = await getEntityBaseline(userId);

  // For sample mode, always label the data mode so UI can show SAMPLE badge.
  return {
    dataMode:         isLive ? "live" : "sample",
    userId,
    status:           baseline.status,
    learningProgress: baseline.learningProgress,
    seenCount:        baseline.seenCount,
    firstSeen:        baseline.firstSeen,
    lastSeen:         baseline.lastSeen,
    typicalPorts:     baseline.typicalPorts,
    subnetHistory:    baseline.subnetHistory,
    riskScoreTrend:   baseline.riskScoreTrend,
    anomalyScore:     baseline.recentAnomalies.filter(a => a.severity === "high").length * 25
                    + baseline.recentAnomalies.filter(a => a.severity === "medium").length * 10,
    recentDeviations: baseline.recentAnomalies.map(a => ({
      type:      a.type,
      severity:  a.severity,
      detail:    a.detail,
      timestamp: a.timestamp,
    })),
  };
}

// ─── Privilege timeline builder ───────────────────────────────────────────────
function buildPrivilegeTimeline(userId) {
  const hasEscalation = userId.includes("IT Operations") || userId.includes("Finance");
  return {
    userId,
    events: [
      { timestamp: new Date(Date.now() - 30 * 86_400_000).toISOString(), level: "standard",  action: "grant",  role: "User",          grantedBy: "system", active: true  },
      ...(hasEscalation ? [
        { timestamp: new Date(Date.now() - 14 * 86_400_000).toISOString(), level: "elevated", action: "grant",  role: "Admin (temp)", grantedBy: "ops-lead", active: true  },
      ] : []),
    ],
  };
}

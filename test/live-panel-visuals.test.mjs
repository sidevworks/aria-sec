// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");

test("ARIA destination panels use panel-specific living visual instruments", () => {
  [
    "MonitoringRadarVisual",
    "ThreatPrismVisual",
    "VectorStarfieldVisual",
    "TimelineTunnelVisual",
    "IncidentTriageVisual",
    "LogStreamVisual",
    "SystemScanVisual",
    "NetworkInstrument3D",
    "BlockadePerimeterVisual",
    "QuarantineVaultVisual",
    "AriaCoreVisual",
  ].forEach((componentName) => assert.match(source, new RegExp(`function ${componentName}`)));

  assert.match(source, /function PanelVisualStage/);
  assert.doesNotMatch(source, /<LivingDashboardRoom/);
  assert.match(source, /ariaRadarSweep/);
  assert.match(source, /ariaWebRotate3d/);
  assert.match(source, /ariaParticleDiffuse/);
});

test("ARIA living panels are connected to live telemetry data and controls", () => {
  assert.match(source, /<PanelVisualStage/);
  assert.match(source, /<PanelControlDeck/);
  assert.match(source, /sources={sourceFabric}/);
  assert.match(source, /connections={liveConnections}/);
  assert.match(source, /vectors={liveVectors}/);
  assert.match(source, /processes={liveProcesses}/);
  assert.match(source, /onClick=\{\(\) => void refreshLiveSnapshot\(\)\}/);
  assert.match(source, /onClick=\{\(\) => void executeAriaCommand\("Run a quick scan"\)\}/);
});

test("Network panel uses an inspectable 3D instrument instead of cosmetic tilt", () => {
  assert.match(source, /function NetworkInstrument3D/);
  assert.match(source, /new THREE\.Scene\(\)/);
  assert.match(source, /new THREE\.Raycaster\(\)/);
  assert.match(source, /selectedConnection/);
  assert.match(source, /setSelectedConnection/);
  assert.match(source, /networkInstrumentCanvas/);
  assert.match(source, /NetworkInspectorPanel/);
  assert.doesNotMatch(source, /onPointerMove=\{updateTilt\}/);
  assert.doesNotMatch(source, /--rx/);
  assert.doesNotMatch(source, /--ry/);
});

test("Panels explain live semantics and expose useful drilldowns", () => {
  assert.match(source, /LiveLogMeaningPanel/);
  assert.match(source, /SystemResourceLeaders/);
  assert.match(source, /IncidentActionDeck/);
  assert.match(source, /ThreatReviewList/);
  assert.match(source, /BlockedIpPanel/);
  assert.match(source, /topCpuProcesses/);
  assert.match(source, /topMemoryProcesses/);
  assert.match(source, /blockedIpItems/);
  assert.match(source, /zIndex: 32/);
});

test("ARIA landing field supports scroll-driven travel between panels", () => {
  assert.match(source, /navigatePanelByWheel/);
  assert.match(source, /window\.addEventListener\("wheel"/);
  assert.match(source, /startTravel\(nextPanel\.id\)/);
  assert.match(source, /data-dashboard-scroll/);
  assert.match(source, /wheelTravelRef/);
});

test("top navigation travels into sectors and clears sector state for direct panels", () => {
  assert.match(source, /const openSector = useCallback/);
  assert.match(source, /startTravel\("sector:" \+ sectorId\)/);
  assert.match(source, /onSectorClick=\{openSector\}/);
  assert.match(source, /activeSectorRef\.current = null;\n\s+startTravel\(panelId\)/);
});

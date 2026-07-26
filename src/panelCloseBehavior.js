// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

export function getPanelCloseState({ activeSector } = {}) {
  return {
    dashVisible: false,
    activeDashPanel: null,
    ariaState: activeSector ? "panel_select" : "idle",
    shouldTravel: false,
  };
}

# ARIA Security Scan — Audit Report

**Scan ID:** `scan-1780240501872-umxvo`
**Started:** 2026-05-31T15:15:01.872Z
**Completed:** 2026-05-31T15:15:13.734Z
**Target:** local-host
**Depth:** deep
**Status:** complete
**Duration:** 11862ms

## Summary

| Severity | Count |
|----------|-------|
| 🔴 Critical | 3 |
| 🟠 High     | 0 |
| 🟡 Medium   | 0 |
| 🟢 Low      | 0 |
| **Total**   | **3** |

## Findings

### 1. 🔴 Memory pressure is above the review threshold.
- **Severity:** critical
- **Source:** live-policy
### 2. 🔴 Disk capacity is above the review threshold.
- **Severity:** critical
- **Source:** live-policy
### 3. 🔴 2 critical incidents active — immediate response required
- **Severity:** critical
- **Source:** incident-engine
## Scan Phases

- `init` — Initialising deep scan engine *(2026-05-31T15:15:02.072Z)*
- `network` — Deep network topology mapping *(2026-05-31T15:15:02.874Z)*
- `hosts` — Full host enumeration *(2026-05-31T15:15:03.875Z)*
- `ports` — Full port sweep (1–65535) *(2026-05-31T15:15:05.076Z)*
- `services` — Service + version fingerprinting *(2026-05-31T15:15:06.277Z)*
- `vulns` — CVE cross-reference check *(2026-05-31T15:15:07.678Z)*
- `auth` — Deep auth + credential audit *(2026-05-31T15:15:08.680Z)*
- `policy` — Policy + compliance delta analysis *(2026-05-31T15:15:09.580Z)*
- `ai-spm` — AI asset exposure + model risk *(2026-05-31T15:15:10.781Z)*
- `lateral` — Lateral movement path analysis *(2026-05-31T15:15:11.782Z)*
- `exfil` — Data exfiltration surface scan *(2026-05-31T15:15:12.782Z)*
- `findings` — Correlating + scoring findings *(2026-05-31T15:15:13.383Z)*
- `done` — Deep scan complete *(2026-05-31T15:15:13.584Z)*

---
*Generated automatically by ARIA Command Center on 2026-05-31T15:15:13.734Z*
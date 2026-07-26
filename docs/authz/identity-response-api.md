# Identity Galaxy Response API

Enterprise hardening contract for the Identity Galaxy / ITDR / UEBA response routes.

## AuthZ Contract

All `/api/identity/*` routes require explicit auth context headers unless a local development bypass is intentionally enabled.

| Header | Required | Notes |
| --- | --- | --- |
| `x-tenant-id` | Yes | Tenant boundary for audit and cross-tenant checks. |
| `x-user-id` | Yes | Actor recorded in audit events. |
| `x-role` | Yes | One of `owner`, `admin`, `analyst`, `viewer`. |

Role behaviour:

| Route class | owner | admin | analyst | viewer |
| --- | --- | --- | --- | --- |
| Read/inspect/timeline | Allowed | Allowed | Allowed | Allowed |
| Write/action proposal | Allowed | Allowed | Denied | Denied |

Expected auth failures:

| Status | Trigger |
| --- | --- |
| `401` | Missing tenant/user/role context. |
| `403` | Authenticated role is not permitted for the requested action. |

## Endpoint Contracts

### `GET /api/identity/entities/:id/inspect`

Returns normalized inspection evidence for a user or department entity.

Response `200`:

```json
{
  "status": "completed",
  "action_id": "idact-...",
  "enforcement_mode": "executed",
  "requires_approval": false,
  "rollback_available": false,
  "evidence": {
    "entity_type": "user",
    "entity": { "id": "sample:user:Finance-1" },
    "dataMode": "sample",
    "connectedSources": [],
    "inspected_at": "2026-06-02T00:00:00.000Z",
    "recommended_actions": ["inspect_deep", "create_case_note"],
    "behaviour": {},
    "privilege_timeline": []
  }
}
```

Audit events:

| Event | Trigger |
| --- | --- |
| `identity.action_requested` | Inspection request accepted for processing. |
| `identity.action_completed` | Inspection evidence returned. |
| `identity.action_denied` | Strict production source check or handler error denies response. |

### `GET /api/identity/entities/:id/timeline`

Returns normalized timeline evidence for a user or department entity.

Response `200`:

```json
{
  "status": "completed",
  "action_id": "idact-...",
  "enforcement_mode": "executed",
  "requires_approval": false,
  "rollback_available": false,
  "evidence": {
    "entity": { "id": "sample:user:Finance-1" },
    "dataMode": "sample",
    "timeline": [
      {
        "id": "sample:user:Finance-1:privilege:0",
        "timestamp": "2026-06-02T00:00:00.000Z",
        "type": "privilege_change",
        "label": "grant User",
        "severity": "low"
      }
    ]
  }
}
```

### `POST /api/identity/entities/:id/action`

Creates an approval-gated response proposal or executes the safe inspection action. This route is a write/action route and is restricted to `admin` and `owner`.

Request body:

```json
{
  "action": "block_proposal",
  "reason": "Impossible travel followed by payroll export",
  "evidence": { "alert_id": "alert-1" }
}
```

Supported actions:

| Action | Semantics | Mode |
| --- | --- | --- |
| `inspect_deep` | Return deeper evidence for the entity. | Executed read-only. |
| `block_proposal` | Propose access block or disablement. | Proposal-only. |
| `isolate_proposal` | Propose session/device isolation. | Proposal-only. |
| `watchlist` | Propose watchlist placement. | Proposal-only. |
| `mark_trusted` | Propose trusted disposition. | Proposal-only. |
| `create_case_note` | Propose or queue case note creation. | Proposal-only. |

Proposal response `202`:

```json
{
  "status": "proposal_created",
  "action_id": "idact-...",
  "enforcement_mode": "proposal_only",
  "requires_approval": true,
  "rollback_available": false,
  "evidence": {
    "proposal": {
      "id": "proposal-idact-...",
      "action": "block_proposal",
      "entity_id": "sample:user:Finance-1",
      "approval_status": "pending",
      "reason": "Impossible travel followed by payroll export",
      "connector": null
    },
    "connector_capability": null,
    "message": "No enforcement connector is configured; approval proposal created only."
  }
}
```

Error response `400` for unsupported action:

```json
{
  "status": "denied",
  "action_id": "idact-...",
  "enforcement_mode": "proposal_only",
  "requires_approval": false,
  "rollback_available": false,
  "evidence": {
    "reason": "Unsupported identity action: disable_user",
    "supported_actions": ["inspect_deep", "block_proposal"]
  }
}
```

Audit events:

| Event | Trigger |
| --- | --- |
| `identity.action_requested` | Action payload accepted for validation. |
| `identity.proposal_created` | Proposal-only response was created. |
| `identity.action_completed` | Route completed with inspection or proposal response. |
| `identity.action_denied` | Unsupported action, strict production source failure, invalid JSON, or handler error. |
| `authz.role_denied` | Viewer/analyst attempted write/action route. |
| `authz.missing_context` | Required auth headers absent. |

## Enforcement vs Proposal-Only

`proposal_only` means ARIA records the recommended action and approval intent but does not claim that access, sessions, devices, or connectors were changed.

`connector_available` means connector metadata is configured, but the route still requires approval and does not claim enforcement unless a dedicated executable backend action exists.

`executed` is currently reserved for read-only inspection/timeline evidence generation. It must not be used for destructive identity enforcement unless the backend has an auditable connector action and rollback semantics.

## Sample Data and Production Readiness

Production paths must not silently use sample identity data. In strict production mode (`NODE_ENV=production` or `ARIA_STRICT_PROD=1`), identity routes that would fall back to sample data must return `503` with `IDENTITY_SOURCE_UNAVAILABLE`.

Operator checklist:

| Check | Required state |
| --- | --- |
| Auth headers | Gateway or caller supplies `x-tenant-id`, `x-user-id`, `x-role`. |
| Local bypass | `ARIA_AUTHZ_ALLOW_LOCAL_BYPASS` is unset. |
| Strict production | `ARIA_STRICT_PROD=1` or `NODE_ENV=production`. |
| Live identity source | Azure AD connector configured and token fetch succeeds. |
| Audit store | Durable audit backend configured or writable persisted file path available. |
| Enforcement connector | Only set `ARIA_IDENTITY_ENFORCEMENT_CONNECTOR` when a real connector capability exists. |
| Sample/demo data | Allowed only in local/non-production demos with clear UI/API labelling. |

## Operator Runbook

1. Verify auth context with `GET /api/aria/whoami` using the same headers the identity route will use.
2. Inspect the entity with `GET /api/identity/entities/:id/inspect` and confirm `evidence.dataMode` is `live` before production action review.
3. Request a write action with `POST /api/identity/entities/:id/action` only as `admin` or `owner`.
4. Confirm the response says `proposal_created`, `requires_approval: true`, and `rollback_available: false` unless a separately approved enforcement connector path exists.
5. Review `GET /api/aria/audit-events?event_type=identity.proposal_created` and match `action_id`, `entity_id`, actor, tenant, and reason.
6. Do not manually enforce a proposal unless the approval queue, change ticket, and rollback plan are recorded outside the proposal response.

## Verification

Focused contract tests live in `test/server/identity-routes.test.mjs` and cover:

- Auth required.
- Viewer denied on write/action.
- Admin and owner allowed to create proposals.
- Missing connector produces proposal-only response.
- Audit events emitted for request/proposal/completion/denial paths.
- Strict production blocks sample data fallback.

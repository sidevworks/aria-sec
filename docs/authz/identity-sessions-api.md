# Identity & Sessions API

> **Implementation status:** Endpoints are present in `server/index.mjs` (lines 774-825).
> RBAC enforcement via `authorizeRequest` is **not yet wired** to either endpoint —
> see the Discrepancies section at the bottom of this document.

---

## GET /api/aria/sessions

Returns the session inventory scoped to the current tenant context.
On each call the server synthesizes a live session record from the request's auth
headers and upserts it into the durable store before returning the list.

### Authentication

Reads identity from request headers. When `ARIA_AUTHZ_ENFORCE` is not set (or `0`),
all callers are accepted regardless of role. When `ARIA_AUTHZ_ENFORCE=1` the
`authorizeRequest` middleware **should** gate read access — see Discrepancies below.

### Request Headers

| Header | Required | Description |
|--------|----------|-------------|
| `x-tenant-id` | No | Tenant scope. Defaults to `ARIA_DEFAULT_TENANT_ID` env var or `"tenant-local"` |
| `x-user-id` | No | User identity. Defaults to `ARIA_DEFAULT_USER_ID` env var or `"user-local"` |
| `x-role` | No | Role for RBAC. One of: `owner`, `admin`, `analyst`, `viewer` |

### Response 200

```json
{
  "sessions": [
    {
      "session_id": "sess-tenant-local-user-local",
      "tenant_id": "tenant-local",
      "user_id": "user-local",
      "role": "owner",
      "issued_at": "2026-05-30T00:00:00.000Z",
      "expires_at": null,
      "last_seen": "2026-05-30T00:00:00.000Z",
      "source": "header | default",
      "status": "active | expired | revoked"
    }
  ],
  "total": 1,
  "identity": {
    "tenant_id": { "value": "tenant-local", "source": "default" },
    "user_id":   { "value": "user-local",   "source": "default" },
    "role":      { "value": "owner",         "source": "default" },
    "authz_mode": { "value": "bypass",       "source": "server-config" }
  }
}
```

**Session object field notes:**
- `source` — `"header"` when `x-tenant-id` was supplied, `"default"` otherwise.
- `expires_at` — always `null` in current implementation (no expiry logic yet).
- `revoked_at` — present (ISO string) on sessions with `status: "revoked"`. Not present on active sessions.

### Response 401 / 403

Planned behavior when `ARIA_AUTHZ_ENFORCE=1` and the caller lacks read permission.
**Not yet enforced** — see Discrepancies.

### Audit Events

| Event | Trigger |
|-------|---------|
| `session.list` | Emitted on every successful response with `{ tenant_id, count }` |
| `session.list.denied` | Planned for auth failure — not yet emitted |

---

## POST /api/aria/sessions/:id/revoke

Revokes an active session by ID. The session record is updated in the durable store
with `status: "revoked"` and a `revoked_at` timestamp.

### Path Parameter

| Parameter | Description |
|-----------|-------------|
| `:id` | `session_id` of the session to revoke. URL-decoded before lookup. |

### Request Body

```json
{
  "reason": "string (required)"
}
```

Blank or missing `reason` returns HTTP 400.

### Response 200

```json
{
  "session": {
    "session_id": "sess-tenant-local-user-local",
    "tenant_id": "tenant-local",
    "user_id": "user-local",
    "role": "owner",
    "issued_at": "2026-05-30T00:00:00.000Z",
    "expires_at": null,
    "last_seen": "2026-05-30T00:00:00.000Z",
    "source": "default",
    "status": "revoked",
    "revoked_at": "2026-05-30T00:01:00.000Z"
  },
  "revoked": true
}
```

### Response 400 — Missing reason

```json
{ "error": "reason is required", "code": "REVOKE_REASON_REQUIRED" }
```

### Response 404 — Session not found

```json
{ "error": "Session not found", "code": "SESSION_NOT_FOUND" }
```

### Response 401 / 403

Planned behavior when the caller lacks write permission (e.g. `viewer` or `analyst` role).
**Not yet enforced** — see Discrepancies.

### Audit Events

| Event | Trigger |
|-------|---------|
| `session.revoked` | Successful revoke with `{ tenant_id, target_session, target_user, reason }` |
| `session.revoke.notfound` | Session ID not in store |
| `session.revoke.denied` | Planned for auth failure — not yet emitted |

---

## Persistence

Sessions are stored in `ARIA_PERSISTENCE_DIR/sessions.json` (JSON array).
The store is scoped per tenant via `listSessions({ tenant_id })`. On each GET the
current request's synthesized session is upserted — so the store grows with every
unique `(tenant_id, user_id)` pair that calls the endpoint.

---

## Discrepancies / Known Gaps

The following diverge from the planned spec:

1. **RBAC not enforced on either endpoint.** `authorizeRequest` is imported but not
   called in the session route handlers (lines 774-825 of `server/index.mjs`). The
   intended role gating (viewer read / admin write) is not active in any
   `ARIA_AUTHZ_ENFORCE` mode.

2. **`session.list.denied` and `session.revoke.denied` are not emitted.** Since RBAC
   is not wired, these audit events never fire.

3. **`revoked_at` field.** The revoke response includes a `revoked_at` ISO timestamp
   field not mentioned in the original spec. Document it as part of the session schema.

4. **No expiry logic.** `expires_at` is always `null`; `status: "expired"` cannot
   currently be produced by the server.

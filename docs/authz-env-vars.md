# ARIA AuthZ Environment Variables

Reference for operators configuring authentication and authorization behavior.

---

## `ARIA_AUTHZ_ALLOW_LOCAL_BYPASS`

Allows requests missing auth headers (`x-tenant-id`, `x-user-id`, `x-role`) to proceed without a 401.

| Setting | Value |
|---------|-------|
| Default | *(unset / `false`)* |
| Safe prod value | **unset** (never enable in production) |
| Local dev value | `true` |

**Security caveat:** Enabling this removes the trust boundary for all tenant-scoped endpoints. Any caller without headers will be assigned the `ARIA_DEFAULT_ROLE` identity, which defaults to `owner`. This is intentionally permissive for developer workflows only — do not ship with this set in production or staging environments.

**Verification:**
```sh
# Confirm bypass is off (expect no output):
printenv ARIA_AUTHZ_ALLOW_LOCAL_BYPASS

# Test that missing-header requests are rejected (expect 401):
curl -s -o /dev/null -w "%{http_code}" http://localhost:5000/api/aria/audit-events
```

---

## `ARIA_AUTHZ_ENFORCE`

Explicit enforce-mode signal. When set, missing auth headers are denied even if `ARIA_AUTHZ_ALLOW_LOCAL_BYPASS` is also set. Provides an unambiguous override for operators who want strict enforcement without editing bypass configuration.

| Setting | Value |
|---------|-------|
| Default | *(unset / `false`)* |
| Safe prod value | `true` (recommended) |
| Local dev value | *(unset)* |

**Security caveat:** The default deny-by-default behavior already rejects missing headers. `ARIA_AUTHZ_ENFORCE=true` makes the policy explicit and unoverrideable by other flags. Recommended for any environment serving real tenants.

**Verification:**
```sh
ARIA_AUTHZ_ENFORCE=true node server/index.mjs &
# Expect 401:
curl -s -o /dev/null -w "%{http_code}" http://localhost:5000/api/aria/suggestions
```

---

## `ARIA_DEFAULT_ROLE`

Fallback role assigned to requests that have no `x-role` header and `ARIA_AUTHZ_ALLOW_LOCAL_BYPASS` is enabled. Has no effect in enforce mode or when proper headers are present.

| Setting | Value |
|---------|-------|
| Default | `owner` |
| Safe prod value | N/A — if bypass is off, this value is never used |
| Local dev value | `admin` (recommended over `owner` to limit blast radius) |

Supported roles (in descending privilege): `owner`, `admin`, `analyst`, `viewer`.

**Security caveat:** Leaving this at `owner` means unauthenticated local requests have full write access. In local dev, prefer setting this to `analyst` or `viewer` to catch authz bugs early.

**Verification:**
```sh
ARIA_AUTHZ_ALLOW_LOCAL_BYPASS=true ARIA_DEFAULT_ROLE=viewer node server/index.mjs &
# Expect 403 (viewer cannot write):
curl -s -X POST http://localhost:5000/api/aria/autonomy -d '{}' -w "%{http_code}"
# Expect 200 (viewer can read):
curl -s -o /dev/null -w "%{http_code}" http://localhost:5000/api/aria/audit-events
```

---

## Recommended prod `.env` (or platform env config)

```
ARIA_AUTHZ_ENFORCE=true
# ARIA_AUTHZ_ALLOW_LOCAL_BYPASS must be absent or unset
# ARIA_DEFAULT_ROLE is irrelevant when bypass is off
```

## Recommended local dev `.env`

```
ARIA_AUTHZ_ALLOW_LOCAL_BYPASS=true
ARIA_DEFAULT_ROLE=admin
```

---

## Role permission matrix

| Role     | Read aria | Write aria | Read ai-spm | Write ai-spm | Write autonomy |
|----------|-----------|------------|-------------|--------------|----------------|
| owner    | ✓         | ✓          | ✓           | ✓            | ✓              |
| admin    | ✓         | ✓          | ✓           | ✓            | ✓              |
| analyst  | ✓         | ✓ (except autonomy) | ✓  | ✓          | ✗              |
| viewer   | ✓         | ✗          | ✓           | ✗            | ✗              |

Implementation: [`server/authz.mjs`](../server/authz.mjs)

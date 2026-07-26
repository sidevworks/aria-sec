# Aria Deployment Runbook

Two supported deployment targets: **Electron desktop** and **Node.js server** (self-hosted / AWS EB).

---

## Pre-flight checklist

Run before any deployment:

```bash
# 1. Generate a credential encryption key (first time only)
node scripts/generate-encryption-key.mjs --write

# 2. Confirm required env vars are set
node -e "
const required = ['GEMINI_API_KEY_V2', 'ARIA_CREDENTIAL_ENCRYPTION_KEY'];
const missing = required.filter(k => !process.env[k]);
if (missing.length) { console.error('MISSING:', missing.join(', ')); process.exit(1); }
console.log('All required vars present');
"

# 3. Run tests
ARIA_PERSISTENCE_DIR=./aria-memory node --test test/server/new-connectors.test.mjs test/server/connector-authz.test.mjs

# 4. Build
npm run build
```

---

## 1. Electron desktop (macOS / Windows)

### Development
```bash
cp .env.example .env.local          # fill in your values
node scripts/generate-encryption-key.mjs --write
npm run start:desktop               # electron-vite dev mode
```

### Production build
```bash
npm run electron:build              # compiles main + preload + renderer → out/
npm run dist                        # electron-builder → release/Aria.dmg (mac)
```

**Required env vars in `.env.local`:**
| Variable | Required | Notes |
|---|---|---|
| `ARIA_CREDENTIAL_ENCRYPTION_KEY` | ✓ | 64-char hex. Generate: `node scripts/generate-encryption-key.mjs` |
| `GEMINI_API_KEY_V2` | ✓ | Gemini 2.5 Flash API key |
| Voice provider credentials | Voice only | Configure only in private runtime environments; never commit provider keys |

The packaged Electron app reads `.env.local` at startup via `persistenceConfig.mjs`. Connector credentials are stored in `~/Library/Application Support/Aria/aria-memory/connectors/` (macOS) encrypted with `ARIA_CREDENTIAL_ENCRYPTION_KEY`.

---

## 2. Node.js server (self-hosted / Docker)

### Docker
```bash
docker build -t aria-sec .
docker run -p 5000:5000 \
  -e GEMINI_API_KEY_V2=... \
  -e ARIA_CREDENTIAL_ENCRYPTION_KEY=... \
  -e ARIA_PERSISTENCE_DIR=/data \
  -v $(pwd)/aria-memory:/data \
  aria-sec
```

**Dockerfile** (create if deploying to container):
```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY server/ ./server/
COPY public/ ./public/
EXPOSE 5000
ENV NODE_ENV=production
CMD ["node", "server/index.mjs"]
```

### AWS Elastic Beanstalk
The `.ebextensions/` directory already configures Node 22, port 5000, and CORS headers.

```bash
# Package
zip -r app.zip server/ public/ package.json package-lock.json .ebextensions/ -x "*/node_modules/*"

# Deploy via EB CLI
eb init aria-sec --platform node.js --region us-east-1
eb create aria-prod
eb setenv \
  NODE_ENV=production \
  ARIA_CREDENTIAL_ENCRYPTION_KEY=$(openssl rand -hex 32) \
  GEMINI_API_KEY_V2=<your-key> \
  ARIA_PERSISTENCE_DIR=/var/app/current/aria-memory
eb deploy
```

**Required environment variables (EB → Configuration → Environment properties):**
| Variable | Notes |
|---|---|
| `NODE_ENV` | `production` |
| `ARIA_CREDENTIAL_ENCRYPTION_KEY` | Never commit; set via EB env vars or Secrets Manager |
| `GEMINI_API_KEY_V2` | |
| `ARIA_PERSISTENCE_DIR` | `/var/app/current/aria-memory` |
| `ARIA_DEFAULT_TENANT_ID` | Your org tenant ID |
| `ARIA_KV_REST_URL` | Upstash Redis for durable state (recommended) |
| `ARIA_KV_REST_TOKEN` | Upstash Redis token |

**AWS Secrets Manager** (recommended for production):
```bash
# Store the encryption key in Secrets Manager instead of env vars
aws secretsmanager create-secret \
  --name aria/prod/credential-encryption-key \
  --secret-string '{"ARIA_CREDENTIAL_ENCRYPTION_KEY":"<64-char-hex>"}'

# Then set in EB
eb setenv ARIA_USE_SECRETS_MANAGER=true AWS_REGION=us-east-1
```

---

## 3. Health check

All deployments expose `GET /api/aria/health`. Expected response:

```json
{
  "status": "ok",
  "kv": "connected",
  "credentialVault": "encrypted",
  "uptime": 1234
}
```

`status: "degraded"` means KV or credential vault is misconfigured — check startup logs.

---

## Connector credential rotation

To rotate the encryption key without losing connectors:

1. Export all connector states: visit each connector panel → note the credentials
2. Disconnect all connectors (clears stored files)
3. Generate new key: `node scripts/generate-encryption-key.mjs --write`
4. Restart the server
5. Re-connect each connector via the UI

> There is no automated key rotation. Credentials are re-encrypted on write, so disconnecting and reconnecting with the new key is the migration path.

---

## Security invariants (never bypass in production)

- `ARIA_AUTHZ_ALLOW_LOCAL_BYPASS` must **not** be set in production
- `ARIA_CREDENTIAL_ENCRYPTION_KEY` must be set — server logs an error on startup if missing in `NODE_ENV=production`
- CORS origins (`ARIA_CORS_ALLOW_ORIGINS`) must **not** contain wildcards in production
- All connector credentials must use the credential vault (`credentialVault.mjs` or auth stores) — never log or return raw secrets

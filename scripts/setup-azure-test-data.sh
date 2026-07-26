#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  ARIA · Azure AD Test Data Setup
#  Provisions all 4 connector finding scenarios + the connector app itself.
#
#  Prerequisites:
#    brew install azure-cli      # or: https://aka.ms/installazureclimacos
#    az login
#
#  Usage:
#    chmod +x scripts/setup-azure-test-data.sh
#    ./scripts/setup-azure-test-data.sh
#
#  Outputs a .env snippet at the end — paste into .env.local to connect.
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail

CYAN='\033[0;36m'; AMBER='\033[0;33m'; RED='\033[0;31m'; GREEN='\033[0;32m'; NC='\033[0m'
log()  { echo -e "${CYAN}[ARIA]${NC} $*"; }
warn() { echo -e "${AMBER}[WARN]${NC} $*"; }
ok()   { echo -e "${GREEN}[ OK ]${NC} $*"; }

# ── 0. Sanity check ──────────────────────────────────────────────────────────
if ! command -v az &>/dev/null; then
  echo -e "${RED}[ERR]${NC} Azure CLI not found. Install: brew install azure-cli"
  exit 1
fi

if ! az account show &>/dev/null; then
  log "Not logged in — launching az login..."
  az login
fi

TENANT_ID=$(az account show --query tenantId -o tsv)
DOMAIN=$(az ad signed-in-user show --query userPrincipalName -o tsv | cut -d@ -f2 2>/dev/null || echo "yourdomain.onmicrosoft.com")
log "Tenant: ${TENANT_ID}"
log "Domain: ${DOMAIN}"
echo

# ── 1. Connector App Registration ────────────────────────────────────────────
# The app Aria uses to call Graph API (client credentials — no user sign-in needed)
log "1/6  Creating connector app registration..."

APP_NAME="aria-security-connector"
EXISTING_APP=$(az ad app list --display-name "$APP_NAME" --query "[0].appId" -o tsv 2>/dev/null || echo "")

if [[ -n "$EXISTING_APP" && "$EXISTING_APP" != "None" ]]; then
  warn "App '$APP_NAME' already exists (${EXISTING_APP}) — reusing."
  CONNECTOR_APP_ID="$EXISTING_APP"
else
  CONNECTOR_APP_ID=$(az ad app create \
    --display-name "$APP_NAME" \
    --sign-in-audience AzureADMyOrg \
    --query appId -o tsv)
  ok "Created connector app: ${CONNECTOR_APP_ID}"
fi

# Required Graph API permissions (application permissions — no user interaction)
# User.Read.All, Application.Read.All, Policy.Read.All
GRAPH_API_ID="00000003-0000-0000-c000-000000000000"
USER_READ_ALL="df021288-bdef-4463-88db-98f22de89214"
APP_READ_ALL="9a5d68dd-52b0-4cc2-bd40-abcf44ac3a30"
POLICY_READ_ALL="246dd0d5-5bd0-4def-940b-0421030a5b68"

log "   Adding Graph API permissions..."
az ad app permission add \
  --id "$CONNECTOR_APP_ID" \
  --api "$GRAPH_API_ID" \
  --api-permissions \
    "${USER_READ_ALL}=Role" \
    "${APP_READ_ALL}=Role" \
    "${POLICY_READ_ALL}=Role" \
  2>/dev/null || warn "Permissions already added or require admin consent — see step below."

# Create a service principal for the connector app (needed for client_credentials)
CONNECTOR_SP=$(az ad sp list --filter "appId eq '${CONNECTOR_APP_ID}'" --query "[0].id" -o tsv 2>/dev/null || echo "")
if [[ -z "$CONNECTOR_SP" || "$CONNECTOR_SP" == "None" ]]; then
  az ad sp create --id "$CONNECTOR_APP_ID" &>/dev/null
  ok "Created service principal for connector app."
fi

# Grant admin consent (requires Global Admin or Privileged Role Admin)
log "   Granting admin consent..."
az ad app permission admin-consent --id "$CONNECTOR_APP_ID" 2>/dev/null \
  || warn "Admin consent failed — grant it manually in the Azure Portal:
          Portal → Entra ID → App registrations → $APP_NAME → API permissions → Grant admin consent"

# Create a client secret
log "   Creating client secret..."
CLIENT_SECRET=$(az ad app credential reset \
  --id "$CONNECTOR_APP_ID" \
  --display-name "aria-dev" \
  --years 1 \
  --query password -o tsv)
ok "Client secret created."

# ── 2. Test Users ─────────────────────────────────────────────────────────────
# Creates 3 users: 2 active, 1 disabled → triggers AZUREAD-001
log "2/6  Creating test users..."

create_user() {
  local upn="$1" name="$2" enabled="$3"
  local existing
  existing=$(az ad user list --filter "userPrincipalName eq '${upn}'" --query "[0].id" -o tsv 2>/dev/null || echo "")
  if [[ -n "$existing" && "$existing" != "None" ]]; then
    warn "User ${upn} already exists — skipping."
    return
  fi
  az ad user create \
    --display-name "$name" \
    --user-principal-name "$upn" \
    --password "AriaTest@2026!" \
    --force-change-password-next-sign-in false \
    --account-enabled "$enabled" \
    &>/dev/null
  ok "Created user: ${name} (${upn}) — enabled: ${enabled}"
}

create_user "aria.analyst@${DOMAIN}"         "Aria Analyst"          true
create_user "aria.admin@${DOMAIN}"           "Aria Admin"            true
create_user "aria.deprovisioned@${DOMAIN}"   "Aria Deprovisioned"    false   # → AZUREAD-001

# ── 3. Overly Permissive App ──────────────────────────────────────────────────
# signInAudience=AzureADandPersonalMicrosoftAccount → triggers AZUREAD-002
log "3/6  Creating overly permissive app registration..."

RISKY_APP_NAME="Aria Identity and Threats"
RISKY_APP_EXISTS=$(az ad app list --display-name "$RISKY_APP_NAME" --query "[0].appId" -o tsv 2>/dev/null || echo "")

if [[ -n "$RISKY_APP_EXISTS" && "$RISKY_APP_EXISTS" != "None" ]]; then
  warn "Risky app already exists — skipping."
else
  az ad app create \
    --display-name "$RISKY_APP_NAME" \
    --sign-in-audience AzureADandPersonalMicrosoftAccount \
    &>/dev/null
  ok "Created risky app: ${RISKY_APP_NAME} (AzureADandPersonalMicrosoftAccount)"
fi

# ── 4. Additional Service Principals ─────────────────────────────────────────
# Triggers AZUREAD-004 (connector also picks up its own SP + any others found)
log "4/6  Creating test service principals..."

for sp_name in "aria-test-automation-sp" "aria-test-legacy-sp"; do
  SP_APP_ID=$(az ad app list --display-name "$sp_name" --query "[0].appId" -o tsv 2>/dev/null || echo "")
  if [[ -n "$SP_APP_ID" && "$SP_APP_ID" != "None" ]]; then
    warn "App ${sp_name} already exists — skipping."
    continue
  fi
  APP_ID=$(az ad app create --display-name "$sp_name" --sign-in-audience AzureADMyOrg --query appId -o tsv)
  az ad sp create --id "$APP_ID" &>/dev/null
  ok "Created service principal: ${sp_name}"
done

# ── 5. Leave Conditional Access empty ────────────────────────────────────────
# Triggers AZUREAD-003: no CA policies → high-severity finding
log "5/6  Conditional Access — leaving unconfigured (triggers AZUREAD-003)."
warn "If you want to test the CA-present scenario later, use:"
warn "  Portal → Entra ID → Security → Conditional Access → New policy"

# ── 6. Summary ────────────────────────────────────────────────────────────────
log "6/6  Done. Connector findings that will fire on next scan:"
echo
echo -e "  ${RED}HIGH${NC}    AZUREAD-003  No Conditional Access policies"
echo -e "  ${AMBER}MEDIUM${NC}  AZUREAD-001  Disabled user (aria.deprovisioned@${DOMAIN})"
echo -e "  ${AMBER}MEDIUM${NC}  AZUREAD-002  Overly permissive app (${RISKY_APP_NAME})"
echo -e "  ${CYAN}LOW${NC}     AZUREAD-004  Service principals (aria-test-automation-sp, aria-test-legacy-sp + connector)"
echo

# ── .env output ───────────────────────────────────────────────────────────────
echo "═══════════════════════════════════════════════════════════════"
echo "  Paste into .env.local to connect the Aria Azure AD module:"
echo "═══════════════════════════════════════════════════════════════"
echo
echo "AZURE_TENANT_ID=${TENANT_ID}"
echo "AZURE_CLIENT_ID=${CONNECTOR_APP_ID}"
echo "AZURE_CLIENT_SECRET=${CLIENT_SECRET}"
echo
echo "═══════════════════════════════════════════════════════════════"
warn "The client secret above is shown once — save it now."
echo

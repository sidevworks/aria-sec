#!/usr/bin/env bash
# Build the signed + notarized ARIA investor demo .dmg.
#
#   ./scripts/build-demo-dmg.sh
#
# Requires:
#   • Developer ID Application cert in the login keychain (team X88YK679B4)
#   • .secrets/notarize.env  (APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID)
#     Optional: APPLE_NOTARY_PROFILE to use a stored notarytool keychain profile
#     instead of passing the app-specific password on the command line.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Notarization credentials (gitignored).
source "$ROOT/.secrets/notarize.env"

if [[ "${APPLE_ID:-}" == "REPLACE_WITH_APPLE_ID_EMAIL" || -z "${APPLE_ID:-}" ]]; then
  echo "ERROR: set APPLE_ID in .secrets/notarize.env to the Apple ID email." >&2
  exit 1
fi

# Bake the demo flag into the renderer (license gate, demo data, no Touch ID).
export VITE_ARIA_DEMO_BUILD=true
export ARIA_DEMO_BUILD=true

echo "▶ Building signed + notarized demo .dmg (team X88YK679B4)…"
npm run dist

DMG_PATH="$(ls -1 release/*.dmg 2>/dev/null | head -n 1 || true)"
if [[ -z "$DMG_PATH" ]]; then
  echo "ERROR: no .dmg was produced in ./release" >&2
  exit 1
fi

echo "▶ Signing DMG container…"
codesign --force --sign "Developer ID Application: Sary Majdi Ismail (${APPLE_TEAM_ID})" "$DMG_PATH"

echo "▶ Notarizing DMG container…"
if [[ -n "${APPLE_NOTARY_PROFILE:-}" ]]; then
  xcrun notarytool submit "$DMG_PATH" --keychain-profile "$APPLE_NOTARY_PROFILE" --wait
else
  xcrun notarytool submit "$DMG_PATH" \
    --apple-id "$APPLE_ID" \
    --password "$APPLE_APP_SPECIFIC_PASSWORD" \
    --team-id "$APPLE_TEAM_ID" \
    --wait
fi

echo "▶ Stapling DMG notarization ticket…"
xcrun stapler staple "$DMG_PATH"
xcrun stapler validate "$DMG_PATH"

echo "✓ Done. Installer is in ./release/"
ls -1 "$DMG_PATH"

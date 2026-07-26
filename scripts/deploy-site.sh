#!/usr/bin/env bash
# arialaunch — build the LANDING-ONLY site and deploy it to AWS (S3 + CloudFront).
# Safe to run from any directory. Refuses to deploy if the build isn't landing-only
# (which would expose the operator platform at the public root).
set -euo pipefail

# Deployment targets come from the environment so no account-specific identifiers
# live in the repo. Set these once in your shell profile, or pass them inline:
#
#   ARIA_SITE_BUCKET=s3://my-bucket ARIA_SITE_DIST_ID=E123 ./scripts/deploy-site.sh
#
REPO="${ARIA_REPO:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
BUCKET="${ARIA_SITE_BUCKET:?set ARIA_SITE_BUCKET, e.g. s3://your-site-bucket}"
DIST_ID="${ARIA_SITE_DIST_ID:?set ARIA_SITE_DIST_ID to your CloudFront distribution id}"
PROFILE="${AWS_PROFILE:-default}"

cd "$REPO"

echo "▶  Building landing-only bundle…"
VITE_PUBLIC_SURFACE=landing npm run build

# ── Safety gate: never publish the operator platform ─────────────────────────
ENTRY="$(grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' dist/index.html | head -1)"
if [ -z "$ENTRY" ]; then
  echo "✖  ABORT: could not find the entry bundle in dist/index.html."
  exit 1
fi
if grep -qE "surface" "dist/$ENTRY"; then
  echo "✖  ABORT: built bundle is NOT landing-only — the operator platform would be exposed. Nothing deployed."
  exit 1
fi
echo "✓  Confirmed landing-only build ($ENTRY)"

echo "▶  Syncing assets to S3 (immutable cache)…"
aws s3 sync dist/ "$BUCKET/" --delete --profile "$PROFILE" --size-only \
  --cache-control "public,max-age=31536000,immutable" \
  --exclude "index.html" --exclude "audio/*" --exclude "**/.DS_Store" --exclude ".DS_Store" \
  --exclude "downloads/*"

if [ -d dist/audio ]; then
  echo "▶  Syncing audio (short cache so re-records propagate)…"
  aws s3 sync dist/audio/ "$BUCKET/audio/" --profile "$PROFILE" --size-only \
    --cache-control "public, max-age=3600"
fi

echo "▶  Uploading index.html (no-cache)…"
aws s3 cp dist/index.html "$BUCKET/index.html" --profile "$PROFILE" \
  --cache-control "no-cache,no-store,must-revalidate" --content-type "text/html"

echo "▶  Invalidating CloudFront…"
INV="$(aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths "/*" \
  --profile "$PROFILE" --query 'Invalidation.Id' --output text)"
aws cloudfront wait invalidation-completed --distribution-id "$DIST_ID" --id "$INV" --profile "$PROFILE"

echo ""
echo "✅  Live → https://www.aria-sec.com   (invalidation $INV)"

#!/usr/bin/env bash
# ============================================================================
# Obsy — upload (or delete) demo entry photos for App Store screenshots (INN-3)
# ============================================================================
# Entry photos live in the PRIVATE `entries` storage bucket and are served to
# the app via short-lived signed URLs. seed.sql references three objects at
# paths "<DEMO_USER_ID>/<file>". This script pushes the bitmaps in ./photos/
# up to those exact paths using the Supabase Storage REST API and the service
# role key (service role is required: the bucket is private + RLS-scoped).
#
# The filenames here MUST match the photo_path values in seed.sql:
#   demo_morning.jpg   demo_harbour.jpg   demo_dinner.jpg
#
# USAGE:
#   export SUPABASE_URL="https://vsxxlhztgtcgcvzvojdf.supabase.co"
#   export SUPABASE_SERVICE_ROLE_KEY="<service role key — DO NOT COMMIT>"
#   export DEMO_USER_ID="<demo user uuid>"
#   ./upload_demo_photos.sh            # upload all photos in ./photos/
#   ./upload_demo_photos.sh --delete   # remove the demo photos again (for reset)
#
# Swap in nicer, royalty-free (CC0 / Unsplash-license) images by replacing the
# files in ./photos/ with the same names before running.
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PHOTO_DIR="$SCRIPT_DIR/photos"
BUCKET="entries"
DELETE=false
[[ "${1:-}" == "--delete" ]] && DELETE=true

: "${SUPABASE_URL:?Set SUPABASE_URL (e.g. https://<ref>.supabase.co)}"
: "${SUPABASE_SERVICE_ROLE_KEY:?Set SUPABASE_SERVICE_ROLE_KEY (service role; do not commit)}"
: "${DEMO_USER_ID:?Set DEMO_USER_ID (the demo account user uuid)}"

content_type_for() {
  case "${1##*.}" in
    png) echo "image/png" ;;
    jpg|jpeg) echo "image/jpeg" ;;
    webp) echo "image/webp" ;;
    heic|heif) echo "image/heic" ;;
    *) echo "application/octet-stream" ;;
  esac
}

shopt -s nullglob
files=("$PHOTO_DIR"/*.jpg "$PHOTO_DIR"/*.jpeg "$PHOTO_DIR"/*.png "$PHOTO_DIR"/*.webp)
if [[ ${#files[@]} -eq 0 ]]; then
  echo "No images found in $PHOTO_DIR — add demo photos first." >&2
  exit 1
fi

for f in "${files[@]}"; do
  name="$(basename "$f")"
  object_path="${DEMO_USER_ID}/${name}"
  url="${SUPABASE_URL}/storage/v1/object/${BUCKET}/${object_path}"

  if $DELETE; then
    echo "deleting  ${BUCKET}/${object_path}"
    curl -sS -X DELETE "$url" \
      -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
      -o /dev/null -w "  -> HTTP %{http_code}\n"
  else
    ct="$(content_type_for "$name")"
    echo "uploading ${BUCKET}/${object_path}  (${ct})"
    # x-upsert:true so re-runs overwrite instead of failing on conflict.
    curl -sS -X POST "$url" \
      -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
      -H "Content-Type: ${ct}" \
      -H "x-upsert: true" \
      --data-binary "@${f}" \
      -o /dev/null -w "  -> HTTP %{http_code}\n"
  fi
done

echo "Done."

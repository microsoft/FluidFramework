#!/usr/bin/env bash
# Validate pinned image references in a rendered release bundle.
#
# A release is deployed from its digest-pinned copies under release-artifacts/<id>/deployment/.
# This fails if any deployment file contains an image reference that is not immutable:
#   - a :latest tag,
#   - an untagged / floating reference, or
#   - any registry reference lacking an @sha256: digest.
#
# The only allowed non-digest references are the built-image templates
# (<ACR>.azurecr.io/<svc>:<IMAGE_TAG>), which are rendered to a digest once the images are pushed.
#
# Usage:
#   ./release/validate-pinned-images.sh [release-id]

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RELEASE_ROOT="${RELEASE_ROOT:-$ROOT/release-artifacts}"

# Collect the deployment directories to validate.
deployment_dirs=()
if [ "$#" -ge 1 ] && [ -n "${1:-}" ]; then
  deployment_dirs+=("$RELEASE_ROOT/$1/deployment")
else
  for d in "$RELEASE_ROOT"/*/deployment; do
    [ -d "$d" ] && deployment_dirs+=("$d")
  done
fi

if [ "${#deployment_dirs[@]}" -eq 0 ]; then
  echo "ERROR: no release deployment files found under $RELEASE_ROOT. Run pin-images.sh first." >&2
  exit 2
fi

violations=0
files_checked=0

report() {
  violations=$((violations + 1))
  printf 'FLOATING IMAGE  %s:%s\n    %s\n    %s\n' "$1" "$2" "$3" "$4" >&2
}

for dir in "${deployment_dirs[@]}"; do
  [ -d "$dir" ] || { echo "ERROR: rendered bundle not found: $dir" >&2; exit 2; }
  while IFS= read -r path; do
    files_checked=$((files_checked + 1))
    rel="${path#"$ROOT/"}"
    while IFS= read -r line; do
      lineno="${line%%:*}"
      ref="${line#*:}"
      ref="${ref#*image:}"
      ref="${ref#"${ref%%[![:space:]]*}"}"
      ref="${ref%"${ref##*[![:space:]]}"}"
      ref="${ref%\"}"; ref="${ref#\"}"
      ref="${ref%\'}"; ref="${ref#\'}"
      [ -n "$ref" ] || continue

      case "$ref" in
        *"<IMAGE_TAG>"*) continue ;;          # deploy-time built-image template
      esac
      case "$ref" in
        *@sha256:*) continue ;;               # immutable
        *:latest|*:latest@*)
          report "$rel" "$lineno" "$ref" "uses the :latest tag" ;;
        *:*)
          report "$rel" "$lineno" "$ref" "tagged but has no @sha256: digest" ;;
        *)
          report "$rel" "$lineno" "$ref" "untagged (implicitly :latest) and has no @sha256: digest" ;;
      esac
    done < <(grep -nE '^[[:space:]]*(-[[:space:]]+)?image:[[:space:]]*[^[:space:]]' "$path")
  done < <(find "$dir" -type f \( -name '*.yml' -o -name '*.yaml' \))
done

if [ "$violations" -ne 0 ]; then
  echo >&2
  echo "Pinned-image validation failed: $violations floating image reference(s). Pin each to name:tag@sha256:<digest>." >&2
  echo "Regenerate the release with release/pin-images.sh." >&2
  exit 1
fi

echo "Pinned-image validation passed: $files_checked deployment file(s)."

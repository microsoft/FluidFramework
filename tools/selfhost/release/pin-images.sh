#!/usr/bin/env bash
# Pin the container images for a self-host release to a rendered, digest-pinned copy.
#
# Creates immutable deployment files and records their image digests in images.json.
# Public dependency tags are mapped to pinned versions and resolved to @sha256 digests.
# Built routerlicious, historian, and gitrest images are pinned after they are pushed to ACR.
# Without ACR_LOGIN_SERVER and IMAGE_TAG, built images remain pending-build templates.
# The rendered release files are consumed by deployment and pinned-image validation.
#
# Usage:
#   ./release/pin-images.sh [release-id]
#   RELEASE_ID=<release-id> ./release/pin-images.sh
#
# The release id defaults to today's UTC date (YYYY-MM-DD) and names the release-artifacts/<id>/ folder.
# The digest-pinned deployment files land in release-artifacts/<id>/deployment/.
#
# Optional overrides (environment variables):
#   ACR_LOGIN_SERVER  ACR login server (e.g. myfluidacr.azurecr.io).
#   IMAGE_TAG         Tag the built images were pushed under (see phase1_images in azure/deploy.sh).
#   TARGET_PLATFORM   Expected build platform. When build.json exists, this must match its
#                     targetPlatform (default: linux/amd64).
#   DEPENDENCY_MAP_FILE  Dependency image map (default: dependency-images.json).
#   RELEASE_ROOT      Base directory for release artifacts (default: <selfhost>/release-artifacts).

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

# --- Configuration (override via environment if needed) ----------------------
RELEASE_ROOT="${RELEASE_ROOT:-$ROOT/release-artifacts}"
RELEASE_ID="${1:-${RELEASE_ID:-$(date -u +%Y-%m-%d)}}"
TARGET_PLATFORM="${TARGET_PLATFORM:-linux/amd64}"
case "$TARGET_PLATFORM" in
  linux/amd64|linux/arm64) ;;
  *) fail "unsupported TARGET_PLATFORM '$TARGET_PLATFORM'. Select linux/amd64 or linux/arm64." ;;
esac

# Dependency images to pin are defined in dependency-images.json
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPENDENCY_MAP_FILE="${DEPENDENCY_MAP_FILE:-$SCRIPT_DIR/dependency-images.json}"

# Built images from the pinned FluidFramework source and pushed to the release ACR.
BUILT_IMAGES=(routerlicious historian gitrest)

# Deployment files
DEPLOYMENT_FILES=(
  "azure/backends.yaml"
  "azure/routerlicious-values.yaml"
)

# --- Preflight ---------------------------------------------------------------
command -v docker >/dev/null 2>&1 || fail "docker (with buildx) is required to resolve image digests."
docker buildx version >/dev/null 2>&1 || fail "docker buildx is required to resolve image digests."
command -v shasum >/dev/null 2>&1 || fail "shasum is required to compute manifest digests."
command -v jq >/dev/null 2>&1 || fail "jq is required to read $DEPENDENCY_MAP_FILE."

[ -f "$DEPENDENCY_MAP_FILE" ] || fail "dependency map not found: $DEPENDENCY_MAP_FILE"
jq -e '.dependencyImages | arrays' "$DEPENDENCY_MAP_FILE" >/dev/null 2>&1 || fail "$DEPENDENCY_MAP_FILE must contain a 'dependencyImages' array."

DEPENDENCY_MAP=()
while IFS= read -r entry; do
  DEPENDENCY_MAP+=("$entry")
done < <(jq -r '.dependencyImages[] | "\(.source)|\(.pinned)"' "$DEPENDENCY_MAP_FILE")

for f in "${DEPLOYMENT_FILES[@]}"; do
  [ -f "$ROOT/$f" ] || fail "expected deployment file not found: $f"
done

resolve_digest() {
  local ref="$1" raw
  raw="$(docker buildx imagetools inspect "$ref" --raw 2>/dev/null)" || return 1
  [ -n "$raw" ] || return 1
  printf 'sha256:%s' "$(printf '%s' "$raw" | shasum -a 256 | awk '{print $1}')"
}

# --- Resolve dependency digests -------------------------------------------------------
REWRITE_FROM=()
REWRITE_TO=()
dependency_entries=""
echo "Resolving dependency image digests ..."
for entry in "${DEPENDENCY_MAP[@]}"; do
  src="${entry%%|*}"
  concrete="${entry#*|}"
  name="${concrete%:*}"
  tag="${concrete##*:}"
  digest="$(resolve_digest "$concrete")" || fail "could not resolve digest for $concrete (check network access to the registry)."
  reference="$concrete@$digest"

  REWRITE_FROM+=("$src")
  REWRITE_TO+=("$reference")

  echo "  $src -> $reference"
  dependency_entries="${dependency_entries}    {
      \"name\": \"$(json_escape "$name")\",
      \"tag\": \"$(json_escape "$tag")\",
      \"digest\": \"$digest\",
      \"reference\": \"$(json_escape "$reference")\",
      \"status\": \"pinned\"
    },
"
done

# --- Resolve built-image digests when an ACR and tag are provided --------------
built_entries=""
has_pending_built=false
BUILD_FILE="$RELEASE_ROOT/$RELEASE_ID/build.json"
if [ -f "$BUILD_FILE" ]; then
  build_platform="$(jq -r '.targetPlatform // empty' "$BUILD_FILE")"
  [ -n "$build_platform" ] || fail "$BUILD_FILE has no targetPlatform. Regenerate the release with the build-images.sh."
  [ "$build_platform" = "$TARGET_PLATFORM" ] || fail "TARGET_PLATFORM '$TARGET_PLATFORM' does not match build.json targetPlatform '$build_platform'. Pin images for the platform selected before the build."
fi
echo "Recording built images ..."
for svc in "${BUILT_IMAGES[@]}"; do
  src="<ACR>.azurecr.io/$svc:<IMAGE_TAG>"
  if [ -n "${ACR_LOGIN_SERVER:-}" ] && [ -n "${IMAGE_TAG:-}" ] && \
     digest="$(resolve_digest "$ACR_LOGIN_SERVER/$svc:$IMAGE_TAG")"; then
    # Content-addressed digest is registry-independent, so keep the <ACR> placeholder in manifests.
    reference="<ACR>.azurecr.io/$svc@$digest"
    REWRITE_FROM+=("$src")
    REWRITE_TO+=("$reference")
    echo "  $svc -> $reference"
    built_entries="${built_entries}    {
      \"name\": \"$(json_escape "$svc")\",
      \"repository\": \"$(json_escape "$ACR_LOGIN_SERVER/$svc")\",
      \"tag\": \"$(json_escape "$IMAGE_TAG")\",
      \"targetPlatform\": \"$(json_escape "$TARGET_PLATFORM")\",
      \"digest\": \"$digest\",
      \"reference\": \"$(json_escape "$reference")\",
      \"status\": \"pinned\"
    },
"
  else
    echo "  $svc -> pending-build (deployment files keep the <IMAGE_TAG> template)"
    has_pending_built=true
    built_entries="${built_entries}    {
      \"name\": \"$(json_escape "$svc")\",
      \"repository\": null,
      \"tag\": null,
      \"targetPlatform\": \"$(json_escape "$TARGET_PLATFORM")\",
      \"digest\": null,
      \"reference\": null,
      \"status\": \"pending-build\"
    },
"
  fi
done

# Trim the trailing comma+newline from each JSON array body.
dependency_entries="${dependency_entries%,
}
"
built_entries="${built_entries%,
}
"

# Look up the digest-pinned replacement for an exact source image value.
lookup_pinned() {
  local value="$1" i
  for i in "${!REWRITE_FROM[@]}"; do
    if [ "${REWRITE_FROM[$i]}" = "$value" ]; then
      printf '%s' "${REWRITE_TO[$i]}"
      return 0
    fi
  done
  return 1
}

# Render one deployment file: copy it verbatim except that each `image:` value known to the rewrite
# table is replaced with its digest-pinned form, preserving indentation and quoting.
render_file() {
  local in="$1" out="$2" line prefix rest quote value pinned
  : > "$out"
  while IFS= read -r line || [ -n "$line" ]; do
    if [[ "$line" =~ ^([[:space:]]*-?[[:space:]]*image:[[:space:]]*)(.*)$ ]]; then
      prefix="${BASH_REMATCH[1]}"
      rest="${BASH_REMATCH[2]}"
      rest="${rest%"${rest##*[![:space:]]}"}"   # rtrim
      quote=""
      case "$rest" in
        \"*\") quote='"'; rest="${rest#\"}"; rest="${rest%\"}" ;;
        \'*\') quote="'"; rest="${rest#\'}"; rest="${rest%\'}" ;;
      esac
      value="$rest"
      if pinned="$(lookup_pinned "$value")"; then
        printf '%s%s%s%s\n' "$prefix" "$quote" "$pinned" "$quote" >> "$out"
        continue
      fi
    fi
    printf '%s\n' "$line" >> "$out"
  done < "$in"
}

# --- Create the release folder ----------------------------------------------
RELEASE_DIR="$RELEASE_ROOT/$RELEASE_ID"
DEPLOYMENT_DIR="$RELEASE_DIR/deployment"
MANIFEST_FILE="$RELEASE_DIR/images.json"

# A release is immutable once its images are pinned; never overwrite an existing pin.
[ -e "$MANIFEST_FILE" ] && fail "release '$RELEASE_ID' already has pinned images at $MANIFEST_FILE. Releases are immutable. Please choose a new release id."
[ -e "$DEPLOYMENT_DIR" ] && fail "release '$RELEASE_ID' already has deployment files at $DEPLOYMENT_DIR. Releases are immutable. Please choose a new release id."

echo "Rendering pinned deployment files ..."
for f in "${DEPLOYMENT_FILES[@]}"; do
  dest="$DEPLOYMENT_DIR/$f"
  mkdir -p "$(dirname "$dest")"
  render_file "$ROOT/$f" "$dest"
  echo "  deployment/$f"
done

PINNED_AT_UTC="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
cat > "$MANIFEST_FILE" <<EOF
{
  "releaseId": "$(json_escape "$RELEASE_ID")",
  "pinnedAtUtc": "$PINNED_AT_UTC",
  "targetPlatform": "$(json_escape "$TARGET_PLATFORM")",
  "renderedFrom": "working-tree deployment files (unpinned); copies under deployment/ are digest-pinned",
  "builtImages": [
$built_entries  ],
  "dependencyImages": [
$dependency_entries  ]
}
EOF

# --- Report ------------------------------------------------------------------
deployment_display="$DEPLOYMENT_DIR"
case "$DEPLOYMENT_DIR" in
  "$PWD"/*) deployment_display="${DEPLOYMENT_DIR#"$PWD"/}" ;;
esac
manifest_display="$MANIFEST_FILE"
case "$MANIFEST_FILE" in
  "$PWD"/*) manifest_display="${MANIFEST_FILE#"$PWD"/}" ;;
esac

echo
echo "Pinned self-host images:"
echo "  release id : $RELEASE_ID"
echo "  deployment : $deployment_display/  (digest-pinned; deploy from these)"
echo "  manifest   : $manifest_display"
if [ "$has_pending_built" = true ]; then
  echo
  echo "Built images marked 'pending-build' keep the <IMAGE_TAG> template; re-run with the ACR_LOGIN_SERVER and IMAGE_TAG environment variables set."
fi

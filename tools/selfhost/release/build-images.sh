#!/usr/bin/env bash
# Build and push the self-host built images (routerlicious, historian, gitrest) for a release.
#
# Builds routerlicious, historian, and gitrest from the pinned FluidFramework revision.
# Builds from a dedicated FluidFramework clone (FLUID_DIR) checked out at the pinned revision.
# Select TARGET_PLATFORM before release generation; the pinned source must support it.
# Builds each upstream Dockerfile unchanged with `docker buildx build --platform`.
# Records the selected platform, image tag, and exact build commands in build.json.
# pin-images.sh records the resulting immutable image digests in the release bundle.
#
# Usage:
#   ACR_LOGIN_SERVER=myfluidacr.azurecr.io ./release/build-images.sh [release-id]
#   ./release/build-images.sh --no-push [release-id]     # local build validation, no push
#   RELEASE_ID=<release-id> ACR_LOGIN_SERVER=... ./release/build-images.sh
#
# The release id defaults to today's UTC date (YYYY-MM-DD) and names the release-artifacts/<id>/ folder.
#
# Required (environment variable):
#   FLUID_DIR         Path to a dedicated FluidFramework clone; the pinned revision is checked out
#                     in it to build from.
#
# Optional overrides (environment variables):
#   ACR_LOGIN_SERVER  ACR login server (e.g. myfluidacr.azurecr.io). Required to push; used as the
#                     image tag prefix. Authenticate first (e.g. `az acr login -n <acr>`).
#   IMAGE_TAG         Tag to build under (default: <short-sha>-<utc-timestamp>). Never reuse a tag
#                     for different content.
#   TARGET_PLATFORM   One platform to build and deploy (linux/amd64 or linux/arm64; default:
#                     linux/amd64). This must be selected before generating the release.
#   RELEASE_ROOT      Base directory for release artifacts (default: <selfhost>/release-artifacts).

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

# --- Parse arguments ---------------------------------------------------------
PUSH=true
RELEASE_ID_ARG=""
for arg in "$@"; do
  case "$arg" in
    --no-push) PUSH=false ;;
    -*) fail "unknown option: $arg (supported: --no-push)." ;;
    *) [ -z "$RELEASE_ID_ARG" ] && RELEASE_ID_ARG="$arg" || fail "unexpected extra argument: $arg" ;;
  esac
done

# --- Configuration ---------------------------------------------------------
RELEASE_ROOT="${RELEASE_ROOT:-$ROOT/release-artifacts}"
RELEASE_ID="${RELEASE_ID_ARG:-${RELEASE_ID:-$(date -u +%Y-%m-%d)}}"
TARGET_PLATFORM="${TARGET_PLATFORM:-linux/amd64}"
case "$TARGET_PLATFORM" in
  linux/amd64|linux/arm64) ;;
  *) fail "unsupported TARGET_PLATFORM '$TARGET_PLATFORM'. Select linux/amd64 or linux/arm64 before generating the release." ;;
esac

# Built images produced from the pinned FluidFramework source.
BUILT_IMAGES=(routerlicious historian gitrest)

RELEASE_DIR="$RELEASE_ROOT/$RELEASE_ID"
SOURCE_FILE="$RELEASE_DIR/source.json"
BUILD_FILE="$RELEASE_DIR/build.json"

# --- Preflight ---------------------------------------------------------------
command -v git >/dev/null 2>&1 || fail "git is required to check out the FluidFramework source."
command -v docker >/dev/null 2>&1 || fail "docker (with buildx) is required to build the images."
docker buildx version >/dev/null 2>&1 || fail "docker buildx is required."
command -v jq >/dev/null 2>&1 || fail "jq is required to read $SOURCE_FILE."

[ -f "$SOURCE_FILE" ] || fail "missing $SOURCE_FILE. Run pin-source.sh first."

# A release is immutable once built; never overwrite an existing build record.
[ -e "$BUILD_FILE" ] && fail "release '$RELEASE_ID' already has $BUILD_FILE. Releases are immutable. Please choose a new release id."

if [ "$PUSH" = true ] && [ -z "${ACR_LOGIN_SERVER:-}" ]; then
  fail "ACR_LOGIN_SERVER is required to push. Set it (and authenticate, e.g. 'az acr login -n <acr>'), or pass --no-push for a local build."
fi

# Registry/namespace used as the image tag prefix. With --no-push and no ACR, use a local name.
REGISTRY="${ACR_LOGIN_SERVER:-local}"

# Read the pinned source facts.
SOURCE_REPO="$(jq -r '.sourceRepo' "$SOURCE_FILE")"
SOURCE_SHA="$(jq -r '.resolvedCommitSha' "$SOURCE_FILE")"
[ -n "$SOURCE_REPO" ] && [ "$SOURCE_REPO" != "null" ] || fail "could not read sourceRepo from $SOURCE_FILE."
[[ "$SOURCE_SHA" =~ ^[0-9a-f]{40}$ ]] || fail "source.json does not contain a 40-char commit SHA (got '$SOURCE_SHA')."

# --- Check out the pinned SHA in the dedicated FluidFramework clone ----------
ensure_fluid_checkout "$SOURCE_SHA" "$SOURCE_REPO"
WORKDIR="$FLUID_DIR"

for svc in "${BUILT_IMAGES[@]}"; do
  [ -f "$WORKDIR/server/$svc/Dockerfile" ] || fail "checkout at $SOURCE_SHA has no server/$svc/Dockerfile."
done

# --- Build and push each image ------------------------------------------------
if ! docker buildx inspect fluid-release >/dev/null 2>&1; then
  docker buildx create --name fluid-release --driver docker-container >/dev/null
fi

IMAGE_TAG="${IMAGE_TAG:-$(git -C "$WORKDIR" rev-parse --short=12 HEAD)-$(date -u +%Y%m%d%H%M%S)}"
output_flag="--output=type=cacheonly"
[ "$PUSH" = true ] && output_flag="--push"

echo "Building images @ tag $IMAGE_TAG for target platform $TARGET_PLATFORM ..."
build_entries=""
for svc in "${BUILT_IMAGES[@]}"; do
  echo "  $svc:"
  ref="$REGISTRY/$svc:$IMAGE_TAG"

  build_args=(
    docker buildx build
    --builder fluid-release
    --build-context root=.
    --target runner
    --platform "$TARGET_PLATFORM"
    -f "server/$svc/Dockerfile"
    -t "$ref"
    "$output_flag"
    "server/$svc"
  )
  build_cmd="$(printf '%q ' "${build_args[@]}")"
  build_cmd="${build_cmd% }"

  echo "      $build_cmd"
  ( cd "$WORKDIR" && "${build_args[@]}" )

  build_entries+="$(printf '    {\n      \"name\": \"%s\",\n      \"reference\": \"%s\",\n      \"dockerfile\": \"server/%s/Dockerfile\",\n      \"buildCommand\": \"%s\"\n    },\n' \
    "$(json_escape "$svc")" \
    "$(json_escape "$ref")" \
    "$svc" \
    "$(json_escape "$build_cmd")")"
done
build_entries="${build_entries%,}"

# --- Record the build information -------------------------------------------------
mkdir -p "$RELEASE_DIR"
cat > "$BUILD_FILE" <<EOF
{
  "releaseId": "$(json_escape "$RELEASE_ID")",
  "recordedAtUtc": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "sourceRepo": "$(json_escape "$SOURCE_REPO")",
  "sourceCommitSha": "$SOURCE_SHA",
  "registry": "$(json_escape "$REGISTRY")",
  "imageTag": "$(json_escape "$IMAGE_TAG")",
  "targetPlatform": "$(json_escape "$TARGET_PLATFORM")",
  "pushed": $PUSH,
  "buildContext": "root=. (named BuildKit context = repo root; az acr build cannot supply it)",
  "builtImages": [
$build_entries  ]
}
EOF

# --- Report ------------------------------------------------------------------
build_display="$BUILD_FILE"
case "$BUILD_FILE" in
  "$PWD"/*) build_display="${BUILD_FILE#"$PWD"/}" ;;
esac

echo
echo "Built self-host images:"
echo "  release id : $RELEASE_ID"
echo "  source SHA : $SOURCE_SHA"
echo "  image tag  : $IMAGE_TAG"
echo "  platform   : $TARGET_PLATFORM"
echo "  pushed     : $PUSH${ACR_LOGIN_SERVER:+ -> $ACR_LOGIN_SERVER}"
echo "  recipe     : $build_display"
if [ "$PUSH" = true ]; then
  echo
  echo "Pin the pushed digests into the release with:"
  echo "  ACR_LOGIN_SERVER=$ACR_LOGIN_SERVER IMAGE_TAG=$IMAGE_TAG ./release/pin-images.sh $RELEASE_ID"
else
  echo
  echo "Local validation build only (not pushed); built images stay 'pending-build' in pin-images.sh."
fi

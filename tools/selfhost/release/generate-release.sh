#!/usr/bin/env bash
# Generate a self-host release end-to-end by running the release steps in order.
#
# A release is an immutable bundle under release-artifacts/<release-id>/. This script runs the
# individual release scripts in sequence to create a new release.
#
# Usage:
#   ./release/generate-release.sh <tag-or-40-character-sha> [release-id]
#   FLUID_REF=<tag-or-40-character-sha> RELEASE_ID=<release-id> ./release/generate-release.sh
#
# The release id defaults to today's UTC date (YYYY-MM-DD) and names the release-artifacts/<id>/ folder.
#
# Environment variables passed through to the underlying steps:
#   FLUID_DIR   (dedicated FluidFramework clone; required by build-images.sh)
#   FLUID_REF, RELEASE_ID, FLUID_REPO_URL   (pin-source.sh)
#   ACR_LOGIN_SERVER, IMAGE_TAG, TARGET_PLATFORM   (build-images.sh; set ACR_LOGIN_SERVER to build & push)
#   ACR_LOGIN_SERVER, IMAGE_TAG, DEPENDENCY_MAP_FILE   (pin-images.sh)
#   RELEASE_ROOT   (base directory for release artifacts)

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$SCRIPT_DIR/lib.sh"

# Resolve inputs shared across steps so every step names the same release.
FLUID_REF="${1:-${FLUID_REF:-}}"
[ -n "$FLUID_REF" ] || fail "no revision given. Pass a FluidFramework tag or 40-character commit SHA (or set FLUID_REF)."
RELEASE_ID="${2:-${RELEASE_ID:-$(date -u +%Y-%m-%d)}}"
RELEASE_ROOT="${RELEASE_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)/release-artifacts}"
TARGET_PLATFORM="${TARGET_PLATFORM:-linux/amd64}"
case "$TARGET_PLATFORM" in
  linux/amd64|linux/arm64) ;;
  *) fail "unsupported TARGET_PLATFORM '$TARGET_PLATFORM'. Select linux/amd64 or linux/arm64 before generating the release." ;;
esac
export FLUID_REF RELEASE_ID RELEASE_ROOT TARGET_PLATFORM
if [ -n "${FLUID_DIR:-}" ]; then
  export FLUID_DIR
fi

echo "=== Generating release '$RELEASE_ID' from '$FLUID_REF' for '$TARGET_PLATFORM' ==="

# --- 1: Pin source --------------------------------------------------------
echo
echo ">>> 1. Pin source"
"$SCRIPT_DIR/pin-source.sh" "$FLUID_REF" "$RELEASE_ID"

# --- Offer to provision a build registry when none is configured -------------
# When no registry is configured and the script is running interactively, offer to provision an ACR (setup-build-registry.sh)
# using the parameter file's .buildAcr.name; declining or any non-interactive run uses the pending-build default.
if [ -z "${ACR_LOGIN_SERVER:-}" ] && [ -t 0 ]; then
  printf '\nNo ACR is configured (ACR_LOGIN_SERVER is unset); built images would stay pending-build.\n' >&2
  read -r -p "Create/reuse an ACR now so the images can be built and pinned? [y/N] " reply
  if [[ "$reply" =~ ^[Yy]$ ]]; then
    command -v jq >/dev/null 2>&1 || fail "jq is required to read the ACR name from the deploy parameters file."
    parameters_file="${PARAMETERS_FILE:-$(cd "$SCRIPT_DIR/.." && pwd)/azure/deploy.parameters.json}"
    acr_name=""
    [ -f "$parameters_file" ] && acr_name="$(jq -r '.buildAcr.name // empty' "$parameters_file")"
    if [ -n "$acr_name" ]; then
      # setup-build-registry.sh prints only the login server on stdout; capture it.
      ACR_LOGIN_SERVER="$(PARAMETERS_FILE="$parameters_file" "$SCRIPT_DIR/setup-build-registry.sh" "$acr_name")"
      export ACR_LOGIN_SERVER
    else
      printf 'No ".buildAcr.name" is set in %s.\n' "$parameters_file" >&2
      printf 'Edit that file (copy azure/deploy.parameters.example.json if it does not exist) to set the ACR name,\n' >&2
      printf 'then build & pin later with build-images.sh / pin-images.sh.\n' >&2
      printf 'Continuing now without a registry -- built images stay pending-build.\n' >&2
    fi
  fi
fi

# --- Build & push built images ----------------------------------------------
# Build routerlicious/historian/gitrest from the pinned source and push them to the release ACR,
# then pass the ACR and tag to pin-images.sh so it can render the built images by digest.
if [ -n "${ACR_LOGIN_SERVER:-}" ]; then
  [ -n "${FLUID_DIR:-}" ] || fail "FLUID_DIR is not set. Provide a dedicated FluidFramework clone (git clone $FLUID_REPO_URL <dir>) and set FLUID_DIR=<dir> to build images."
  echo
  echo ">>> Build & push built images"
  "$SCRIPT_DIR/build-images.sh" "$RELEASE_ID"
  IMAGE_TAG="$(jq -r '.imageTag' "$RELEASE_ROOT/$RELEASE_ID/build.json")"
  export ACR_LOGIN_SERVER IMAGE_TAG
else
  echo
  echo ">>> Build & push built images (skipped: ACR_LOGIN_SERVER unset; built images stay pending-build)"
fi

# --- 2: Pin images --------------------------------------------------------
echo
echo ">>> 2. Pin images"
"$SCRIPT_DIR/pin-images.sh" "$RELEASE_ID"

# --- Pinned-image validation gate --------------------------------------------
echo
echo ">>> 3. Validate pinned rendered images"
"$SCRIPT_DIR/validate-pinned-images.sh" "$RELEASE_ID"

echo
echo "=== Release '$RELEASE_ID' generated ==="

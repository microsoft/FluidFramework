#!/usr/bin/env bash
# Shared functions for the self-host release engineering scripts (release/*).
#

# FluidFramework source remote used across release steps.
: "${FLUID_REPO_URL:=https://github.com/microsoft/FluidFramework}"

# Print an error to stderr and exit non-zero so a release pipeline fails fast.
fail() { echo "ERROR: $*" >&2; exit 1; }

# Ensure a git checkout has no tracked edits or untracked files.
validate_checkout() {
  local dir="$1" status
  status="$(git -C "$dir" status --porcelain --untracked-files=all)"
  [ -z "$status" ] || fail "FLUID_DIR '$dir' has tracked edits or untracked files. This directory is used as the Docker build context and cannot have any uncommitted changes. Please stash or commit the changes and try again."
}

# Escape a value for safe embedding in a JSON string (backslash and double-quote only).
json_escape() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  printf '%s' "$value"
}

# Ensure the dedicated FluidFramework clone in FLUID_DIR is checked out at commit $1 (40-character SHA),
# fetching it from the required source remote $2 if absent. FLUID_DIR must be a checkout root outside this
# repo so there are no conflicts with this repository.
ensure_fluid_checkout() {
  local sha="$1" repo="${2:-}"
  [ -n "$repo" ] || fail "source remote is required to fetch FluidFramework commit $sha."
  [ -n "${FLUID_DIR:-}" ] || fail "FLUID_DIR is not set. Provide a dedicated FluidFramework clone: git clone $FLUID_REPO_URL <dir> && export FLUID_DIR=<dir>."
  [ -e "$FLUID_DIR/.git" ] || fail "FLUID_DIR '$FLUID_DIR' is not the root of a FluidFramework git checkout. Clone it there: git clone $FLUID_REPO_URL '$FLUID_DIR'."
  validate_checkout "$FLUID_DIR"
  if [ "$(git -C "$FLUID_DIR" rev-parse HEAD 2>/dev/null || true)" != "$sha" ]; then
    if ! git -C "$FLUID_DIR" cat-file -e "$sha^{commit}" >/dev/null 2>&1; then
      echo "Fetching FluidFramework @ $sha into $FLUID_DIR ..." >&2
      git -C "$FLUID_DIR" fetch --depth 1 "$repo" "$sha"
    fi
    git -C "$FLUID_DIR" checkout --detach "$sha"
  fi
  validate_checkout "$FLUID_DIR"
}

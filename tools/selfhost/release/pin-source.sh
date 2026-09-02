#!/usr/bin/env bash
# Pin the FluidFramework source revision for a self-host release.
#
# Given a reviewed FluidFramework tag or full commit SHA, this script:
#   1. Resolves the reference to an exact, immutable 40-character commit SHA.
#   2. Does not allow mutable branch names or empty references.
#   3. Records the resolved SHA as source.json inside this release's folder (release-artifacts/<id>/).
#
# Usage:
#   ./release/pin-source.sh <tag-or-40-char-sha> [release-id]
#   FLUID_REF=<tag-or-40-char-sha> RELEASE_ID=<release-id> ./release/pin-source.sh
#
# The release id defaults to today's UTC date (YYYY-MM-DD) and names the release-artifacts/<id>/ folder.
#
# Optional overrides (environment variables):
#   FLUID_REPO_URL   FluidFramework git remote (default: the microsoft/FluidFramework GitHub repo).
#   RELEASE_ROOT     Base directory for release artifacts (default: <selfhost>/release-artifacts).

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

# --- Configuration -------------------------------------------------------------
RELEASE_ROOT="${RELEASE_ROOT:-$ROOT/release-artifacts}"

# --- Preflight ---------------------------------------------------------------
command -v git >/dev/null 2>&1 || fail "git is required to resolve the FluidFramework revision."

REQUESTED_REF="${1:-${FLUID_REF:-}}"
[ -n "$REQUESTED_REF" ] || fail "no revision given. Pass a FluidFramework tag or 40-char commit SHA (or set FLUID_REF)."

# The release id names the release-artifacts/<id>/ folder; default to today's UTC date.
RELEASE_ID="${2:-${RELEASE_ID:-$(date -u +%Y-%m-%d)}}"

# --- Resolve the requested ref to an immutable commit SHA --------------------
resolve_tag_to_commit() {
  local tag="$1" lines annotated_tag_commit lightweight_tag_commit
  lines="$(git ls-remote "$FLUID_REPO_URL" "refs/tags/${tag}" "refs/tags/${tag}^{}" 2>/dev/null || true)"
  [ -n "$lines" ] || return 1
  annotated_tag_commit="$(printf '%s\n' "$lines" | awk '/\^\{\}$/ {print $1; exit}')"
  lightweight_tag_commit="$(printf '%s\n' "$lines" | awk '!/\^\{\}$/ {print $1; exit}')"
  [ -n "$annotated_tag_commit" ] && { printf '%s\n' "$annotated_tag_commit"; return 0; }
  [ -n "$lightweight_tag_commit" ] && { printf '%s\n' "$lightweight_tag_commit"; return 0; }
  return 1
}

ref_is_branch() {
  local branch="$1"
  [ -n "$(git ls-remote --heads "$FLUID_REPO_URL" "refs/heads/${branch}" 2>/dev/null || true)" ]
}

echo "Resolving '$REQUESTED_REF' against $FLUID_REPO_URL ..."
if [[ "$REQUESTED_REF" =~ ^[0-9a-fA-F]{40}$ ]]; then
  REF_TYPE="commit"
  RESOLVED_SHA="$(printf '%s' "$REQUESTED_REF" | tr 'A-F' 'a-f')"
elif RESOLVED_SHA="$(resolve_tag_to_commit "$REQUESTED_REF")"; then
  REF_TYPE="tag"
elif ref_is_branch "$REQUESTED_REF"; then
  fail "'$REQUESTED_REF' is a branch. Pin a reviewed tag or a full 40-char commit SHA instead."
else
  fail "'$REQUESTED_REF' is not a known tag or a full 40-char commit SHA on $FLUID_REPO_URL. If this is a commit, please use its full 40-character SHA."
fi

[[ "$RESOLVED_SHA" =~ ^[0-9a-f]{40}$ ]] || fail "resolved value '$RESOLVED_SHA' is not a 40-char commit SHA."

# --- Write the source manifest into this release's folder --------------------
RELEASE_DIR="$RELEASE_ROOT/$RELEASE_ID"
MANIFEST_FILE="$RELEASE_DIR/source.json"

# A release is immutable once its source is pinned; never overwrite an existing pin.
[ -e "$MANIFEST_FILE" ] && fail "release '$RELEASE_ID' already has a pinned source at $MANIFEST_FILE. Releases are immutable. Please choose a new release id."

PINNED_AT_UTC="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

mkdir -p "$RELEASE_DIR"
cat > "$MANIFEST_FILE" <<EOF
{
  "component": "FluidFramework",
  "sourceRepo": "$(json_escape "$FLUID_REPO_URL")",
  "requestedRef": "$(json_escape "$REQUESTED_REF")",
  "refType": "$REF_TYPE",
  "resolvedCommitSha": "$RESOLVED_SHA",
  "pinnedAtUtc": "$PINNED_AT_UTC"
}
EOF

# --- Report ------------------------------------------------------------------
manifest_display="$MANIFEST_FILE"
case "$MANIFEST_FILE" in
  "$PWD"/*) manifest_display="${MANIFEST_FILE#"$PWD"/}" ;;
esac

echo "Pinned FluidFramework source:"
echo "  release id    : $RELEASE_ID"
echo "  requested ref : $REQUESTED_REF ($REF_TYPE)"
echo "  commit SHA    : $RESOLVED_SHA"
echo "  manifest      : $manifest_display"
echo
echo "Build from this pinned revision with:"
echo "  FLUID_REF=$RESOLVED_SHA ./scripts/run-local.sh"

#!/usr/bin/env bash
# Delete the local release files/directory for a given release.
#
# Removes release-artifacts/<id>/ and its files. This only edits the local filesystem; it does
# not delete anything already uploaded to a registry.
#
# Usage:
#   ./release/deleteReleaseLocal.sh <release-id>
#   RELEASE_ID=<release-id> ./release/deleteReleaseLocal.sh
#
# Optional overrides (environment variables):
#   RELEASE_ROOT   Base directory for release artifacts (default: <selfhost>/release-artifacts).

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

RELEASE_ROOT="${RELEASE_ROOT:-$ROOT/release-artifacts}"

RELEASE_ID="${1:-${RELEASE_ID:-}}"
[ -n "$RELEASE_ID" ] || fail "no release id given. Pass a release id (or set RELEASE_ID)."
case "$RELEASE_ID" in
	"."|".."|*"/"*|*"\\"*) fail "invalid release id '$RELEASE_ID'." ;;
esac

RELEASE_DIR="$RELEASE_ROOT/$RELEASE_ID"
[ -d "$RELEASE_DIR" ] || fail "release '$RELEASE_ID' not found at $RELEASE_DIR."

RELEASE_ROOT_REAL="$(cd "$RELEASE_ROOT" && pwd -P)"
RELEASE_DIR_REAL="$(cd "$RELEASE_DIR" && pwd -P)"
case "$RELEASE_DIR_REAL" in
	"$RELEASE_ROOT_REAL"/*) : ;;
	*) fail "refusing to delete '$RELEASE_DIR_REAL' (outside of $RELEASE_ROOT_REAL)." ;;
esac

rm -rf -- "$RELEASE_DIR"
echo "Deleted release '$RELEASE_ID' ($RELEASE_DIR)."

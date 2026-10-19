#!/usr/bin/env bash
# Run the full release engineering flow end-to-end: provision the build/staging registry
# (.buildAcr.name), generate the digest-pinned release bundle, then deploy it to Azure.
#
# Usage:
#   ./release/create-and-deploy-release.sh <tag-or-40-character-sha> [release-id] [options]
#
# Options:
#   -p, --parameters <file> Deploy parameters file (default: azure/deploy.parameters.json)
#   --skip-build      Don't provision/build/generate; deploy an existing <release-id> only
#   --skip-deploy     Provision + generate the bundle only; don't deploy
#   --skip-preflight  Skip Azure preflight checks (not local input validation)
#   -h, --help        Show this help
#
# Environment:
#   FLUID_DIR         Dedicated clone; defaults to fluidRepoDir in the parameters file.
#   ACR_LOGIN_SERVER  If already set, its value is reused and the build registry is not provisioned.
#   RELEASE_ID        Overridden by the positional [release-id]; defaults to today's UTC date.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SELFHOST_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEPLOY_SCRIPT="$SELFHOST_ROOT/azure/deploy.sh"
. "$SCRIPT_DIR/lib.sh"

usage() {
  cat <<'EOF'
Usage:
  ./release/create-and-deploy-release.sh <tag-or-40-character-sha> [release-id] [options]

Options:
  -p, --parameters <file> Deploy parameters file (default: azure/deploy.parameters.json)
  --skip-build      Don't provision/build/generate; deploy an existing <release-id> only
  --skip-deploy     Provision + generate the bundle only; don't deploy
  --skip-preflight  Skip Azure preflight checks (not local input validation)
  -h, --help        Show this help

Environment:
  FLUID_DIR         Dedicated clone; defaults to fluidRepoDir in the parameters file.
  ACR_LOGIN_SERVER  If already set, its value is reused and the build registry is not provisioned.
  RELEASE_ID        Overridden by the positional [release-id]; defaults to today's UTC date.
EOF
}

# --- Parse arguments ---------------------------------------------------------
FLUID_REF="${FLUID_REF:-}"
RELEASE_ID="${RELEASE_ID:-}"
PARAMETERS_FILE=""
SKIP_BUILD=false
SKIP_DEPLOY=false
SKIP_PREFLIGHT=false
positional=()
while [ $# -gt 0 ]; do
  case "$1" in
    -p|--parameters)
      [ $# -ge 2 ] && [[ "$2" != -* ]] || fail "$1 requires a parameters file."
      PARAMETERS_FILE="$2"; shift 2 ;;
    --skip-build) SKIP_BUILD=true; shift ;;
    --skip-deploy) SKIP_DEPLOY=true; shift ;;
    --skip-preflight) SKIP_PREFLIGHT=true; shift ;;
    -h|--help)    usage; exit 0 ;;
    -*)           fail "unknown option '$1' (see --help)." ;;
    *)            positional+=("$1"); shift ;;
  esac
done
[ "${#positional[@]}" -le 2 ] || fail "expected a revision and optional release id (see --help)."
[ "${#positional[@]}" -ge 1 ] && FLUID_REF="${positional[0]}"
[ "${#positional[@]}" -ge 2 ] && RELEASE_ID="${positional[1]}"

if [ "$SKIP_BUILD" = true ] && [ "${#positional[@]}" -ge 1 ]; then
  RELEASE_ID="${positional[$(( ${#positional[@]} - 1 ))]}"
  FLUID_REF=""
fi

RELEASE_ID="${RELEASE_ID:-$(date -u +%Y-%m-%d)}"
PARAMETERS_FILE="${PARAMETERS_FILE:-$SELFHOST_ROOT/azure/deploy.parameters.json}"

if [ "$SKIP_BUILD" = true ] && [ "$SKIP_DEPLOY" = true ]; then
  fail "--skip-build and --skip-deploy together leave nothing to do."
fi
if [ "$SKIP_BUILD" != true ] && [ -z "$FLUID_REF" ]; then
  fail "no revision given. Pass a FluidFramework tag or 40-char commit SHA (or use --skip-build to deploy only)."
fi
[ -f "$PARAMETERS_FILE" ] || fail "parameters file not found: $PARAMETERS_FILE (copy azure/deploy.parameters.example.json)."
command -v jq >/dev/null 2>&1 || fail "jq is required."
jq -e 'type == "object"' "$PARAMETERS_FILE" >/dev/null || fail "parameters file must contain a JSON object."
case "$RELEASE_ID" in
  ""|"."|".."|*"/"*|*"\\"*) fail "invalid release id '$RELEASE_ID'." ;;
esac
if [ "$SKIP_BUILD" != true ]; then
  FLUID_DIR="${FLUID_DIR:-$(jq -r '.fluidRepoDir // empty' "$PARAMETERS_FILE")}"
  validate_fluid_directory
fi

echo "=== create-and-deploy-release: release '$RELEASE_ID' (build=$([ "$SKIP_BUILD" = true ] && echo skip || echo yes), deploy=$([ "$SKIP_DEPLOY" = true ] && echo skip || echo yes)) ==="

if [ "$SKIP_PREFLIGHT" = true ]; then
  echo "WARNING: --skip-preflight bypasses Azure capacity, zone, name, and Helm checks." >&2
elif [ "$SKIP_BUILD" != true ] && [ "$SKIP_DEPLOY" != true ]; then
  echo ">>> Check deployment parameters before building images"
  bash "$SELFHOST_ROOT/azure/preflight-check.sh" "$PARAMETERS_FILE" \
    || fail "preflight failed before building; fix the parameters and rerun."
fi

# --- 1. Provision the build registry + 2. Generate the bundle ----------------
if [ "$SKIP_BUILD" != true ]; then
  # Reuse a caller-provided registry; otherwise provision/reuse buildAcr from the params file so
  # generate-release.sh can build & push (rather than leaving images pending-build).
  if [ -z "${ACR_LOGIN_SERVER:-}" ]; then
    command -v jq >/dev/null 2>&1 || fail "jq is required to read .buildAcr.name from $PARAMETERS_FILE."
    build_acr="$(jq -r '.buildAcr.name // empty' "$PARAMETERS_FILE")"
    [ -n "$build_acr" ] || fail "no .buildAcr.name in $PARAMETERS_FILE -- set it, or pass ACR_LOGIN_SERVER."
    echo
    echo ">>> Provision build registry '$build_acr'"
    ACR_LOGIN_SERVER="$(PARAMETERS_FILE="$PARAMETERS_FILE" "$SCRIPT_DIR/setup-build-registry.sh" "$build_acr")"
  else
    echo ">>> Reusing ACR_LOGIN_SERVER=$ACR_LOGIN_SERVER"
  fi
  export ACR_LOGIN_SERVER

  echo
  echo ">>> Generate release bundle"
  "$SCRIPT_DIR/generate-release.sh" "$FLUID_REF" "$RELEASE_ID"
fi

# --- 3. Deploy ---------------------------------------------------------------
if [ "$SKIP_DEPLOY" != true ]; then
  [ -f "$DEPLOY_SCRIPT" ] || fail "deploy script not found: $DEPLOY_SCRIPT"
  echo
  echo ">>> Deploy release to Azure"
  deploy_args=("$RELEASE_ID" "$PARAMETERS_FILE")
  [ "$SKIP_PREFLIGHT" != true ] || deploy_args+=(--skip-preflight)
  "$DEPLOY_SCRIPT" "${deploy_args[@]}"
fi

echo
echo "=== create-and-deploy-release: done (release '$RELEASE_ID') ==="

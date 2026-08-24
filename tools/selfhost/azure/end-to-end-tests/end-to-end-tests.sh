#!/usr/bin/env bash
# Run FluidFramework's end-to-end test suite test:realsvc:r11s) from a local FluidFramework checkout 
# against an AKS cluster.
#
# Prerequisites:
#   - az, jq, kubectl on PATH (kubectl/AKS access is needed transitively via tenant-admin.sh).
#   - FLUID_DIR environment variable set to a FluidFramework checkout with dependencies already
#     installed and built (this script does not build FluidFramework).
#
# Usage:
#   FLUID_DIR=/path/to/FluidFramework azure/end-to-end-tests/end-to-end-tests.sh [--compatibility-version <git-ref>]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib.sh
source "$SCRIPT_DIR/lib.sh"

compatibility_version=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --compatibility-version)
      [ "$#" -ge 2 ] || { echo "ERROR: --compatibility-version requires a value." >&2; exit 1; }
      compatibility_version="$2"
      shift 2
      ;;
    *)
      echo "ERROR: unsupported option: $1" >&2
      exit 1
      ;;
  esac
done

require_tools az jq

# Locate the already built FluidFramework end-to-end test package.
: "${FLUID_DIR:?ERROR: FLUID_DIR must be set to a local FluidFramework checkout}"
repo_root="$(git -C "$FLUID_DIR" rev-parse --show-toplevel 2>/dev/null || true)"
[ -n "$repo_root" ] || {
  echo "ERROR: $FLUID_DIR is not a Fluid Framework checkout." >&2
  exit 1
}

E2E_TEST_DIR="$FLUID_DIR/packages/test/test-end-to-end-tests"
if [ -n "$compatibility_version" ]; then
  worktree_root="${repo_root}/../fluid-e2e-${compatibility_version//\//-}"
  if [ ! -d "$worktree_root" ]; then
    git -C "$repo_root" worktree add --detach "$worktree_root" "$compatibility_version"
  fi
  E2E_TEST_DIR="$worktree_root/packages/test/test-end-to-end-tests"
fi
[ -f "$E2E_TEST_DIR/package.json" ] || {
  echo "ERROR: $E2E_TEST_DIR/package.json not found -- FLUID_DIR does not look like a" >&2
  echo "       FluidFramework checkout with the test-end-to-end-tests package present." >&2
  exit 1
}

# Obtain the target endpoint and tenant credentials before running the test suite.
load_parameters
configure_test_environment
export_custom_driver_config

# Run the FluidFramework real-service tests
cd "$E2E_TEST_DIR"

export fluid__test__driver=r11s
endpoint_name=custom
if [ -n "$compatibility_version" ]; then
  cd "${repo_root}/../fluid-e2e-${compatibility_version//\//-}"
  corepack enable
  pnpm install --no-frozen-lockfile
  pnpm run build:compile
  export fluid__test__driver__r11s="$fluid__test__driver__custom"
  endpoint_name=r11s
  cd "$E2E_TEST_DIR"
fi

export fluid__test__r11sEndpointName="$endpoint_name"

npm run test:realsvc:run -- \
  --driver=r11s \
  --r11sEndpointName="$endpoint_name" \
  --timeout=20s
#!/usr/bin/env bash
# Run bench-coverage.sh across every vitest pilot package, sequentially.
#
# Usage: scripts/bench-coverage-all.sh [runs=3] [warmup=1]
#
# Runs smallest → largest; a failure in a big package (tree) won't abort the
# smaller packages' results. Each package gets its own hyperfine invocation
# (separate `.benchmarks/bench-<slug>.{md,json}` files).

set -euo pipefail

PACKAGES=(
	@fluidframework/core-utils
	@fluid-internal/client-utils
	@fluidframework/runtime-utils
	@fluidframework/id-compressor
	@fluidframework/container-loader
	@fluidframework/container-runtime
	@fluidframework/map
	@fluidframework/matrix
	@fluidframework/merge-tree
	@fluidframework/tree
)

HERE="$(cd "$(dirname "$0")" && pwd)"
RUNS="${1:-3}"
WARMUP="${2:-1}"

for pkg in "${PACKAGES[@]}"; do
	echo "::::: $pkg"
	"$HERE/bench-coverage.sh" "$pkg" "$RUNS" "$WARMUP" || echo "  ($pkg failed — continuing)"
done

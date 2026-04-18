#!/usr/bin/env bash
# Compare c8 vs vitest+v8 coverage perf for a single pilot package.
#
# Usage:   scripts/bench-coverage.sh <pnpm-filter> [runs=3] [warmup=1]
# Env:     BENCH_OUTDIR (default .benchmarks), BENCH_MODE (compare|c8|vitest)
# Output:  BENCH_OUTDIR/bench-<slug>.md and .json
# Needs:   hyperfine (brew install hyperfine), pnpm, a package that already
#          defines both `test:coverage` (c8) and `test:coverage:vitest` scripts.

set -euo pipefail

PKG="${1:?package filter required — e.g. @fluidframework/map or packages/dds/map}"
RUNS="${2:-3}"
WARMUP="${3:-1}"
OUTDIR="${BENCH_OUTDIR:-$(git rev-parse --show-toplevel)/.benchmarks}"
MODE="${BENCH_MODE:-compare}"

command -v hyperfine >/dev/null || {
	echo "hyperfine is required. Install with: brew install hyperfine" >&2
	exit 1
}
mkdir -p "$OUTDIR"

# Slug for the output filename — strip @ and /.
SLUG="$(echo "$PKG" | sed 's|[@/]|_|g; s|^_||')"

# Per-package dir — resolved via pnpm so the script doesn't need a hard-coded
# filter → directory map.
PKG_DIR="$(pnpm --filter "$PKG" exec -- pwd | tail -1)"

ARGS=(
	--warmup "$WARMUP"
	--runs "$RUNS"
	--setup "pnpm --filter '$PKG' run build"
	--prepare "rm -rf '$PKG_DIR/nyc/report' '$PKG_DIR/nyc/report-vitest' '$PKG_DIR/nyc/.nyc_output'"
	--export-markdown "$OUTDIR/bench-$SLUG.md"
	--export-json "$OUTDIR/bench-$SLUG.json"
)

case "$MODE" in
	compare)
		ARGS+=(
			-n "c8+mocha" "pnpm --filter '$PKG' run test:coverage"
			-n "vitest+v8" "pnpm --filter '$PKG' run test:coverage:vitest"
		)
		;;
	c8)
		ARGS+=(-n "c8+mocha" "pnpm --filter '$PKG' run test:coverage")
		;;
	vitest)
		ARGS+=(-n "vitest+v8" "pnpm --filter '$PKG' run test:coverage:vitest")
		;;
	*)
		echo "BENCH_MODE must be compare|c8|vitest (got: $MODE)" >&2
		exit 2
		;;
esac

exec hyperfine "${ARGS[@]}"

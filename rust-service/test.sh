#!/usr/bin/env bash

# Run native tests and the Rust-service TypeScript/WASM package tests.
# Pass --extended to include integration, benchmark, and browser tests.
# This script may be invoked from any directory.

set -euo pipefail

service_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
cd "$service_root"

if (( $# > 1 )); then
	echo "Usage: $0 [--extended]" >&2
	exit 2
fi

mode=scoped
case "${1:-}" in
	"")
		;;
	--extended)
		mode=extended
		;;
	--help|-h)
		echo "Usage: $0 [--extended]"
		exit 0
		;;
	*)
		echo "Unknown argument: $1" >&2
		echo "Usage: $0 [--extended]" >&2
		exit 2
		;;
esac

rust_tests_log=$(mktemp "${TMPDIR:-/tmp}/sea-rust-tests.XXXXXX.log")
package_build_log=$(mktemp "${TMPDIR:-/tmp}/sea-package-build.XXXXXX.log")

cleanup() {
	rm -f "$rust_tests_log" "$package_build_log"
}

terminate() {
	trap - INT TERM
	kill "$rust_tests_pid" "$package_build_pid" 2>/dev/null || true
	wait "$rust_tests_pid" "$package_build_pid" 2>/dev/null || true
	exit 130
}

trap cleanup EXIT

cargo test --workspace --all-targets --all-features >"$rust_tests_log" 2>&1 &
rust_tests_pid=$!

if [[ "$mode" == "extended" ]]; then
	pnpm --dir tests/sea-integration-tests run build >"$package_build_log" 2>&1 &
else
	pnpm exec fluid-build \
		@fluidframework/sea-typescript \
		@fluidframework/sea-driver \
		@fluidframework/sea-tree \
		--task build \
		--task build:test:esm >"$package_build_log" 2>&1 &
fi
package_build_pid=$!
trap terminate INT TERM

rust_tests_status=0
package_build_status=0
wait "$rust_tests_pid" || rust_tests_status=$?
wait "$package_build_pid" || package_build_status=$?
trap - INT TERM

echo "== Native workspace tests =="
cat "$rust_tests_log"
echo "== Rust-service package build =="
cat "$package_build_log"

if (( rust_tests_status != 0 || package_build_status != 0 )); then
	echo "Native tests exited with status $rust_tests_status." >&2
	echo "Rust-service package build exited with status $package_build_status." >&2
	exit 1
fi

if [[ "$mode" == "extended" ]]; then
	# The build above satisfies test:all's prerequisites without traversing the build graph twice.
	pnpm --dir tests/sea-integration-tests run test:all
else
	pnpm --dir tests/sea-integration-tests run test:packages
fi
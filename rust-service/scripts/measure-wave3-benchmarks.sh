#!/usr/bin/env bash

# Emit the fixed Wave 3 measurement matrix from a release build in a disposable copy.

set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/benchmark-common.sh"

source_root=$(benchmark_source_root)
temporary_root=$(mktemp -d)
target_root=$(mktemp -d)
trap 'rm -rf "$temporary_root" "$target_root"' EXIT
copy_root="$temporary_root/rust-service"

printf 'assigned worktree: %s\n' "$(git -C "$source_root/.." rev-parse --show-toplevel)"
printf 'assigned branch: %s\n' "$(git -C "$source_root/.." branch --show-current)"
printf 'assigned HEAD: %s\n' "$(git -C "$source_root/.." rev-parse HEAD)"

prepare_benchmark_copy "$source_root" "$copy_root"
cd "$copy_root"
export CARGO_TARGET_DIR="$target_root"
export BENCHMARK_SOURCE_COMMIT
BENCHMARK_SOURCE_COMMIT=$(git -C "$source_root/.." rev-parse HEAD)
export BENCHMARK_PROFILE=release
export BENCHMARK_FEATURES=default
export BENCHMARK_STORAGE_DEVICE
BENCHMARK_STORAGE_DEVICE=$(df --output=source "$source_root" | tail -1 | xargs)
export BENCHMARK_FILESYSTEM
BENCHMARK_FILESYSTEM=$(stat -f -c %T "$source_root")

cargo build --release -p snapshotted-stream-benchmarks
benchmark="$target_root/release/snapshotted-stream-benchmarks"

# Print a reproducible cell header, then emit its five measured JSON repetitions.
run_cell() {
	printf '# cell:'
	printf ' %q' "$@"
	printf '\n'
	"$benchmark" measure "$@" --warmups 1 --repetitions 5
}

for fixture in small-compressible small-incompressible; do
	for backend in file compression stateful-compression encryption stateful-compression-encryption; do
		run_cell --backend "$backend" --fixture "$fixture" --records 2000 --writers 1 --snapshot-frequency 500
	done
done

for fixture in large-compressible large-incompressible; do
	for backend in file compression stateful-compression encryption stateful-compression-encryption; do
		run_cell --backend "$backend" --fixture "$fixture" --records 32 --writers 1 --snapshot-frequency 8
	done
done

for backend in memory network-memory; do
	run_cell --backend "$backend" --fixture small-incompressible --records 5000 --writers 4 --snapshot-frequency 0
done

for backend in native-service native-webtransport; do
	run_cell --backend "$backend" --fixture small-compressible --records 200 --writers 1 --snapshot-frequency 50
done

run_cell --backend native-service --fixture empty --records 32 --writers 1 --snapshot-frequency 8
run_cell --backend file --fixture empty --records 32 --writers 1 --snapshot-frequency 8

verify_assigned_roots_unchanged "$source_root"
#!/usr/bin/env bash

# Build once in a disposable copy and emit one requested measurement workload to stdout.

set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/benchmark-common.sh"

source_root=$(benchmark_source_root)
temporary_root=$(mktemp -d)
target_root=$(mktemp -d)
trap 'rm -rf "$temporary_root" "$target_root"' EXIT
copy_root="$temporary_root/rust-service"

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

cargo build --release -p sea-benchmarks
"$target_root/release/sea-benchmarks" measure "$@"

verify_assigned_roots_unchanged "$source_root"
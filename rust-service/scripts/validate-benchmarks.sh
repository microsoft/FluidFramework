#!/usr/bin/env bash

# Validate the benchmark crate and run its bounded correctness smoke in a disposable copy.

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
cargo fmt --all -- --check
cargo test -p sea-benchmarks --all-targets
cargo clippy -p sea-benchmarks --all-targets -- -D warnings
cargo run -p sea-benchmarks -- smoke

verify_assigned_roots_unchanged "$source_root"
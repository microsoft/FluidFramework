#!/usr/bin/env bash

# Shared disposable-workspace helpers for benchmark validation and measurement.

set -euo pipefail

# Print the absolute rust-service source root containing this script.
benchmark_source_root() {
	cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd
}

# Copy current sources without build outputs; benchmark membership is already in the manifest.
prepare_benchmark_copy() {
	local source_root="$1"
	local copy_root="$2"
	mkdir -p "$copy_root"
	tar --exclude=target --exclude=node_modules --exclude=pkg --exclude=dist \
		--exclude=lib --exclude=.git --exclude=benchmark-results \
		-C "$source_root" -cf - . | tar -C "$copy_root" -xf -
}

# Prove benchmark commands did not alter the assigned workspace manifest or lockfile.
verify_assigned_roots_unchanged() {
	local source_root="$1"
	git -C "$source_root/.." diff --exit-code HEAD -- rust-service/Cargo.toml rust-service/Cargo.lock
}

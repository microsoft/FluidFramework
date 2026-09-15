#!/usr/bin/env bash

# Shared disposable-workspace helpers for benchmark validation and measurement.

set -euo pipefail

# Print the absolute rust-service source root containing this script.
benchmark_source_root() {
	cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd
}

# Copy rust-service and register the excluded benchmark crate in the copy only.
prepare_benchmark_copy() {
	local source_root="$1"
	local copy_root="$2"
	mkdir -p "$copy_root"
	cp -a "$source_root/." "$copy_root/"
	node -e '
const fs = require("fs");
const path = process.argv[1];
const manifest = fs.readFileSync(path, "utf8");
const marker = "members = [\n";
if (!manifest.includes(marker)) {
  throw new Error("unexpected workspace member list");
}
if (!manifest.includes("\"crates/benchmarks\"")) {
	fs.writeFileSync(path, manifest.replace(marker, `${marker}    "crates/benchmarks",\n`));
}
' "$copy_root/Cargo.toml"
}

# Prove benchmark commands did not alter the assigned workspace manifest or lockfile.
verify_assigned_roots_unchanged() {
	local source_root="$1"
	git -C "$source_root/.." diff --exit-code HEAD -- rust-service/Cargo.toml rust-service/Cargo.lock
}
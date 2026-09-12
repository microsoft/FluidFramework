#!/usr/bin/env bash

set -euo pipefail

benchmark_source_root() {
	cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd
}

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

verify_assigned_roots_unchanged() {
	local source_root="$1"
	git -C "$source_root/.." diff --exit-code HEAD -- rust-service/Cargo.toml rust-service/Cargo.lock
}
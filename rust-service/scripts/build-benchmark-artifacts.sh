#!/usr/bin/env bash

# Build native benchmark tools in Cargo's configured target and stage only final executables locally.

set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/benchmark-common.sh"

: "${CARGO_TARGET_DIR:?Set an explicit source-specific CARGO_TARGET_DIR before building benchmark artifacts}"

source_root=$(benchmark_source_root)
local_release="$source_root/target/release"

cd "$source_root"
rm -f "$local_release/benchmark-build.json"
source_hash=$(node scripts/benchmark-artifacts.mjs snapshot)
cargo build --release --locked \
	-p sea-webtransport-server --features sea-webtransport-server/websocket-stream \
	-p sea-benchmarks --bins

cargo_target=$(
	cargo metadata --no-deps --format-version 1 |
		node -e '
			let input = "";
			process.stdin.setEncoding("utf8");
			process.stdin.on("data", (chunk) => (input += chunk));
			process.stdin.on("end", () => process.stdout.write(JSON.parse(input).target_directory));
		'
)
cargo_release="$cargo_target/release"

mkdir -p "$local_release"
for executable in \
	sea-benchmarks \
	sea-webtransport-server \
	presentation-native \
	presentation-test-spans \
	storage-pipeline
do
	source="$cargo_release/$executable"
	destination="$local_release/$executable"
	if [[ ! -x "$source" ]]; then
		printf 'missing release executable: %s\n' "$source" >&2
		exit 1
	fi
	if [[ "$source" != "$destination" ]]; then
		install -m 755 "$source" "$destination"
	fi
done

node scripts/benchmark-artifacts.mjs record "$source_hash"
printf 'staged benchmark executables in %s\n' "$local_release"

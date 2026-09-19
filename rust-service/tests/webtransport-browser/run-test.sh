#!/usr/bin/env bash

# Run the real Chromium WebTransport test against a temporary native Sea server.
# The harness owns its Cargo target, certificate, service data, and server lifecycle.
# Set SEA_BROWSER_SKIP_BUILD=1 only when the caller has already built the WASM packages.

set -euo pipefail

script_directory=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
service_root=$(cd -- "$script_directory/../.." && pwd)
temporary_root=$(mktemp -d)
server_pid=

# Preserve the original result, stop a server left by an early failure, and retain its
# output long enough to make that failure diagnosable.
cleanup() {
	status=$?
	trap - EXIT
	if [[ -n "$server_pid" ]] && kill -0 "$server_pid" 2>/dev/null; then
		kill "$server_pid" 2>/dev/null || true
		wait "$server_pid" 2>/dev/null || true
	fi
	if [[ $status -ne 0 ]] && [[ -f "$temporary_root/server.log" ]]; then
		printf '\nServer output:\n' >&2
		cat "$temporary_root/server.log" >&2
	fi
	rm -rf "$temporary_root"
	exit "$status"
}
trap cleanup EXIT

for command in cargo chromium node openssl pnpm; do
	command -v "$command" >/dev/null || {
		printf 'required command not found: %s\n' "$command" >&2
		exit 1
	}
done

cd "$service_root"
export CARGO_TARGET_DIR="$temporary_root/target"

# Package-level test orchestration builds WASM through the Fluid build graph before
# calling this script. Direct invocation remains self-contained.
if [[ "${SEA_BROWSER_SKIP_BUILD:-}" != "1" ]]; then
	pnpm --dir packages/sea-typescript run build
fi
sh tests/webtransport-browser/generate-cert.sh "$temporary_root/certs"
cargo build -p sea-webtransport-server

shutdown_marker="$temporary_root/shutdown.request"
"$CARGO_TARGET_DIR/debug/sea-webtransport-server" \
	127.0.0.1:0 \
	"$temporary_root/certs/cert.pem" \
	"$temporary_root/certs/key.pem" \
	"$temporary_root/service-data" \
	"$shutdown_marker" >"$temporary_root/server.log" 2>&1 &
server_pid=$!

# Port zero lets the OS choose an available UDP port. Discover that port from the
# server's startup contract while also failing immediately if the process exits.
transport_url=
for ((attempt = 0; attempt < 600; attempt++)); do
	transport_url=$(sed -n 's/^WEBTRANSPORT_URL=//p' "$temporary_root/server.log" | tail -n 1)
	if [[ -n "$transport_url" ]]; then
		break
	fi
	if ! kill -0 "$server_pid" 2>/dev/null; then
		wait "$server_pid"
	fi
	sleep 0.1
done

if [[ -z "$transport_url" ]]; then
	printf 'timed out waiting for the WebTransport server to start\n' >&2
	exit 1
fi

node tests/minimal-fluid-driver/browser/run-headless.mjs \
	packages/sea-typescript \
	"$transport_url" \
	"$(cat "$temporary_root/certs/cert.sha256")" \
	__seaPackageResult browser.html "snapshotPolicy=${SEA_SNAPSHOT_POLICY:-client}"

# Passing the marker enables the runner's shutdown assertions. The runner creates it
# after the browser flow, and the server acknowledges that it stopped accepting work.
node tests/webtransport-browser/run-headless.mjs \
	tests/webtransport-browser \
	"$transport_url" \
	"$(cat "$temporary_root/certs/cert.sha256")" \
	"$shutdown_marker"

# A successful browser result is not enough: require the server's bounded drain to
# finish successfully, then expose its lifecycle and transport evidence.
wait "$server_pid"
server_pid=
cat "$temporary_root/server.log"
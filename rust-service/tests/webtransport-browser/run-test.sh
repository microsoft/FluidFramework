#!/usr/bin/env bash

# Run the real Chromium transport matrix against temporary native Sea servers.
# The harness owns its Cargo target, certificate, service data, and server lifecycle.
# Set SEA_BROWSER_SKIP_BUILD=1 only when the caller has already built the WASM packages.

set -euo pipefail

script_directory=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
service_root=$(cd -- "$script_directory/../.." && pwd)
server_pid=
server_log=

transport_mode=${SEA_BROWSER_TRANSPORT:-}
if [[ -z "$transport_mode" ]]; then
	if [[ "${SEA_ORDINARY_WEBSOCKET:-}" == "1" ]]; then
		transport_mode=websocket
	elif [[ "${SEA_WEBSOCKET_STREAM:-}" == "1" || "${SEA_NODE_WEBSOCKET:-}" == "1" ]]; then
		transport_mode=websocketstream
	else
		transport_mode=all
	fi
fi
case "$transport_mode" in
	all) transport_modes=(webtransport websocketstream websocket) ;;
	webtransport|websocketstream|websocket) transport_modes=("$transport_mode") ;;
	*) printf 'unknown SEA_BROWSER_TRANSPORT: %s\n' "$transport_mode" >&2; exit 1 ;;
esac
unset SEA_WEBSOCKET_STREAM SEA_ORDINARY_WEBSOCKET SEA_NODE_WEBSOCKET SEA_WEBSOCKET_ORIGINLESS_LOOPBACK
temporary_root=$(mktemp -d)

# Preserve the original result, stop a server left by an early failure, and retain its
# output long enough to make that failure diagnosable.
cleanup() {
	status=$?
	trap - EXIT
	if [[ -n "$server_pid" ]] && kill -0 "$server_pid" 2>/dev/null; then
		kill "$server_pid" 2>/dev/null || true
		wait "$server_pid" 2>/dev/null || true
	fi
	if [[ $status -ne 0 ]] && [[ -f "$server_log" ]]; then
		printf '\nServer output:\n' >&2
		cat "$server_log" >&2
	fi
	rm -rf "$temporary_root"
	exit "$status"
}
trap cleanup EXIT

for command in cargo chromium node openssl pnpm wasm-bindgen; do
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
	pnpm --dir tests/sea-integration-tests exec fluid-build . --task build:driver-trace --task build:shared-tree
fi
sh tests/webtransport-browser/generate-cert.sh "$temporary_root/certs"
server_features=()
if [[ "$transport_mode" != webtransport ]]; then
	server_features=(--features websocket-stream)
	export SEA_WEBSOCKET_BIND=127.0.0.1:0
	export SEA_BROWSER_HTTP_PORT
	SEA_BROWSER_HTTP_PORT=$(node --input-type=module -e 'import {createServer} from "node:net"; const server = createServer(); server.listen(0, "127.0.0.1", () => { console.log(server.address().port); server.close(); });')
	export SEA_WEBSOCKET_ORIGINS="http://localhost:$SEA_BROWSER_HTTP_PORT"
fi
cargo build -p sea-webtransport-server "${server_features[@]}"

RUSTFLAGS="${RUSTFLAGS:-} --cfg=web_sys_unstable_apis" cargo build --locked \
	-p sea-webtransport --example browser_lifecycle --features websocket-stream --target wasm32-unknown-unknown
wasm-bindgen "$CARGO_TARGET_DIR/wasm32-unknown-unknown/debug/examples/browser_lifecycle.wasm" \
	--target web --out-name browser_lifecycle --out-dir "$temporary_root/lifecycle-wasm"
SEA_BROWSER_LIFECYCLE_WASM="$temporary_root/lifecycle-wasm" cargo test --locked \
	-p sea-webtransport-server browser_disconnect_and_drop_release_capacity -- --ignored --nocapture

start_server() {
	local mode_root="$temporary_root/$1"
	mkdir -p "$mode_root"
	shutdown_marker="$mode_root/shutdown.request"
	server_log="$mode_root/server.log"
	"$CARGO_TARGET_DIR/debug/sea-webtransport-server" \
		127.0.0.1:0 \
		"$temporary_root/certs/cert.pem" \
		"$temporary_root/certs/key.pem" \
		"$mode_root/service-data" \
		"$shutdown_marker" >"$server_log" 2>&1 &
	server_pid=$!

	# Port zero lets the OS choose an available port. Discover that port from the
	# server's startup contract while also failing immediately if the process exits.
	transport_url=
	for ((attempt = 0; attempt < 600; attempt++)); do
		transport_url=$(sed -n "s/^${transport_variable}=//p" "$server_log" | tail -n 1)
		if [[ -n "$transport_url" ]]; then
			break
		fi
		if ! kill -0 "$server_pid" 2>/dev/null; then
			wait "$server_pid"
		fi
		sleep 0.1
	done

	if [[ -z "$transport_url" ]]; then
		printf 'timed out waiting for the %s server to start\n' "$1" >&2
		exit 1
	fi

	export SEA_BROWSER_WEBTRANSPORT_URL
	SEA_BROWSER_WEBTRANSPORT_URL=$(sed -n 's/^WEBTRANSPORT_URL=//p' "$server_log" | tail -n 1)
}

run_shared_scenarios() {
	node tests/sea-integration-tests/browser/run-headless.mjs \
		tests/sea-integration-tests \
		"$SEA_BROWSER_WEBTRANSPORT_URL" \
		"$(cat "$temporary_root/certs/cert.sha256")"

	for preset in split combined; do
		for compression in false true; do
			node tests/sea-integration-tests/browser/run-headless.mjs \
				packages/sea-typescript \
				"$SEA_BROWSER_WEBTRANSPORT_URL" \
				"$(cat "$temporary_root/certs/cert.sha256")" \
				__seaPackageResult browser.html "snapshotPolicy=${SEA_SNAPSHOT_POLICY:-client}&preset=$preset&compression=$compression"
			node tests/sea-integration-tests/browser/run-headless.mjs \
				tests/sea-integration-tests \
				"$SEA_BROWSER_WEBTRANSPORT_URL" \
				"$(cat "$temporary_root/certs/cert.sha256")" \
				__sharedTreeResult shared-tree.html "serviceClient=true&preset=$preset&compression=$compression"
		done
	done
}

shared_scenarios_ran=false
node_socket_ran=false
for mode in "${transport_modes[@]}"; do
	printf 'TRANSPORT_MODE=%s\n' "$mode"
	transport_variable=WEBTRANSPORT_URL
	socket_enabled=0
	ordinary_socket=0
	if [[ "$mode" != webtransport ]]; then
		transport_variable=WEBSOCKET_URL
		socket_enabled=1
	fi
	if [[ "$mode" == websocket ]]; then
		ordinary_socket=1
	fi
	SEA_WEBSOCKET_ORIGINLESS_LOOPBACK="$socket_enabled" start_server "$mode"
	if [[ "$shared_scenarios_ran" == false ]]; then
		run_shared_scenarios
		shared_scenarios_ran=true
	fi
	if [[ "$socket_enabled" == 1 && "$node_socket_ran" == false ]]; then
		SEA_NODE_TRANSPORT_URL="$transport_url" MOCHA_SPEC=lib/test/websocket.spec.js \
			pnpm --dir packages/sea-typescript run test:mocha:esm
		node_socket_ran=true
	fi
	SEA_WEBSOCKET_STREAM="$socket_enabled" SEA_ORDINARY_WEBSOCKET="$ordinary_socket" \
		node tests/webtransport-browser/run-headless.mjs \
			tests/webtransport-browser \
			"$transport_url" \
			"$(cat "$temporary_root/certs/cert.sha256")" \
			"$shutdown_marker"
	wait "$server_pid"
	server_pid=
	cat "$server_log"
done

# Iteration 0006: native-connection-concurrency Report

Status: complete
Branch: `rust-service-iteration-0006-native-connection-concurrency`
Worktree: `/workspaces/FluidFramework-rust-service-iteration-0006-native-connection-concurrency`
Base commit: `a85dc67452af126c5cbc16c271a03f1f9c1bd33f`
Final commit: implementation `694a0d6f30ed126958db2e9f1c7c0256c8bb1382`; this report commit follows it
Agent or owner: GitHub Copilot implementation agent
Model and tool version: GitHub Copilot; model and tool version unknown
Instruction source: [native connection concurrency instructions](instructions/native-connection-concurrency.md) at `a85dc67452af126c5cbc16c271a03f1f9c1bd33f`
Session or transcript reference: none
Started and finished: `2026-09-12T21:57:53+00:00` to `2026-09-12T22:05:02+00:00`

## Outcome

Implemented bounded concurrent native WebTransport connection handling without changing kernel, sequencer, service, protocol, WASM, or driver semantics. `WebTransportServer::serve` now owns a `FuturesUnordered` set capped by `TransportConfig::max_connections` and co-polls accepted sessions on the same task. Connection futures are not detached; dropping or aborting the server future cancels the set. `NativeService` retains its existing mutex around document open/replay/validation/append, so the non-`Send` fence guard remains local and held over the authoritative operation.

Confidence is high for the scoped single-host prototype. Native and Chromium evidence both held two independent sessions open and made progress. The final browser trace also preserved explicit reconnect, projected reads, content operations, and authoritative committed resolution without resubmission.

## Hypothesis Results

Supported. The old implementation failed the second browser handshake because it awaited the entire first connection before polling `accept` again. The new focused native test connected client 2 while client 1 remained live, completed requests through both, and measured two active connections. Fresh Chromium 152 then completed the same two-session condition with one writer/session per client, shared projected history, explicit reconnect, and committed ambiguity resolution. No fence, kernel, or FSP4 change was required.

## Deliverables and Commits

- `694a0d6f30ed126958db2e9f1c7c0256c8bb1382` (`feat(rust-service): serve concurrent WebTransport sessions`): bounded connection future set, active/peak connection measurements, native two-session regression coverage, and a two-session Chromium trace.
- This report commit records the accepted Wave 2 handoff.
- Public measurement additions: `active_connections` and `peak_active_connections`. Existing `wire_bytes` and `peak_active_streams` remain.
- No dependency version changed. `futures-util` moved from dev-only to runtime dependencies and was already present in the shared lockfile.

## Validation Evidence

All commands ran from `/workspaces/FluidFramework-rust-service-iteration-0006-native-connection-concurrency` on branch `rust-service-iteration-0006-native-connection-concurrency`, base `a85dc67452af126c5cbc16c271a03f1f9c1bd33f`, with checkout-specific targets.

- `cargo fmt --all -- --check`: passed.
- `cargo clippy --locked -p fluid-webtransport-native --all-targets --all-features -- -D warnings`: passed.
- `cargo test --locked -p fluid-webtransport-native --all-targets -- --nocapture`: 1 passed, 0 failed. `NATIVE_EVIDENCE wire_bytes=1304 active_connections=2 peak_active_connections=2 peak_active_streams=2 reconnect_milliseconds=7`.
- `RUSTFLAGS='--cfg=web_sys_unstable_apis' cargo clippy --locked -p fluid-webtransport-browser --target wasm32-unknown-unknown -- -D warnings`: passed.
- Fresh release browser WASM build and `wasm-bindgen 0.2.128 --target web` generation passed.
- `node --check tests/webtransport-browser/browser-test.mjs` and Biome 2.4.5 check passed.
- Fresh Chromium 152 against a fresh service root passed without insecure flags: `{"status":"passed","transportSessionCount":2,"wireBytes":"2665","firstSessionWireBytes":"2296","secondSessionWireBytes":"369","peakResponseBytes":488,"reconnectMilliseconds":5,"resumedRecords":2,"ambiguityResolution":"committed","blobBytes":33,"summaryEntries":1,"contentWireBytes":"552"}`.
- Shared `Cargo.lock`, root pnpm lock/workspace files, WASM source, and driver source remained unchanged. `git diff --check` passed.

## Notable Events

Record an event when a hypothesis is falsified, three similar attempts fail, substantial effort is lost, human intervention is needed, a workaround appears, or a reusable technique is discovered.

| Type | Attempt or event | Evidence | Impact | Resolution or state | Reusable lesson |
| --- | --- | --- | --- | --- | --- |
| Focused compile | The first two-client test moved the certificate digest into client 1. | Rust reported use-after-move before running the test. | One focused run stopped. | Cloned the digest for client 1; no API change. | Construct all independent clients before consuming shared test credentials. |
| Stale serial invariant | The original test required `peak_active_streams == 1`. | Both clients progressed, but cross-connection stream teardown overlapped and measured 2. | The behavior passed while the old assertion failed. | Replaced it with the bounded `1..=2` property and added explicit connection metrics. | Concurrency tests should assert designed bounds, not measurements inherited from serialization. |
| Evidence quality | A delegated gate reported success but omitted exact test counts and measurements. | Direct focused output was required for the report. | One compact rerun was needed. | Retained direct `NATIVE_EVIDENCE` and Chromium JSON. | Machine-readable evidence must be captured directly when summaries omit requested values. |

## Contract and Integration Friction

The handoff changes transport scheduling only. `NativeService` remains the shared authoritative instance and serializes document mutation through its mutex; `FencedStream` and its non-`Send` guard are unchanged. FSP4 version and all message kinds are unchanged. Browser and native clients require no API adaptation beyond optional use of the new server measurements.

`direct-shared-tree-integration` may now consume commit `694a0d6f30e` and this report. Its required browser evidence must use two distinct `BrowserClient` instances and must not regress to two logical clients over one session.

## Human Interventions

The user accepted iteration `0005` with two-session support inconclusive and selected native connection concurrency as the prerequisite for direct SharedTree integration. No implementation correction was required after kickoff.

## Measurements

- Environment: Debian GNU/Linux 13; Rust/Cargo 1.98.1; Node 24.21.0; Chromium 152.0.7977.82; `wasm-bindgen 0.2.128`; Biome 2.4.5.
- Native trace: 1,304 client FSP4 bytes, 2 active/peak connections, peak 2 active streams, 7 ms reconnect.
- Browser trace: 2,665 FSP4 bytes across two sessions, 488-byte peak response, 5 ms reconnect, two resumed records, and committed resolution. Browser APIs do not expose QUIC/TLS/IP totals.
- Connection futures are capped by `max_connections` (default 16). Streams remain handled sequentially within each connection; cross-connection streams progress concurrently.
- Wall-clock workstream interval: approximately 7 minutes. Model token use is unknown.

## Proposed Decisions

No new shared decision is proposed. The implementation preserves [Decision 0006](../../../decisions/0006-scoped-deployment-boundaries.md), [Decision 0007](../../../decisions/0007-projected-reads-and-ambiguity-recovery.md), and [Decision 0008](../../../decisions/0008-portable-wasm-client-boundary.md).

## Candidate Skills and Process Changes

Candidate evidence rule: when a delegated validation summary omits requested counts or measurements, rerun the narrow warm check directly and retain its machine-readable line. This repeats iteration `0005` evidence and may justify a coordination helper if it recurs in Wave 2.

## Remaining Work and Risks

- Wave 2 must rerun the minimal driver and real SharedTree application with two independent browser sessions.
- The server has no graceful public shutdown signal; tests and the binary currently end by dropping/aborting the owning `serve` future or terminating the process. Owned connection futures are cancelled with it, but graceful drain policy remains future work.
- `max_connections` bounds live connection futures. `max_streams_per_connection` is pre-existing configuration; the server continues to process one stream at a time per connection rather than introducing intra-session concurrency in this workstream.
- Generated WASM, certificates, profiles, and service data remain ignored and uncommitted. No intentional tracked artifact remains.

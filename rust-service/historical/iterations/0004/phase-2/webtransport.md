# Iteration 0004: webtransport Report

Status: complete
Branch: `rust-service-iteration-0004-webtransport`
Worktree: `/workspaces/FluidFramework-rust-service-iteration-0004-webtransport`
Base commit: `30c4a06d7b456e135e046905553dd23d14326a56` (actual iteration kickoff)
Final commit: `63eeedb5e4affa6e925479d3de50aafe235c6fdf` (implementation; this report is committed separately)
Agent or owner: GitHub Copilot WebTransport implementation agent
Model and tool version: GitHub Copilot; model and tool version unknown
Instruction source: `rust-service/iterations/0004/phase-2/instructions/webtransport.md` at `30c4a06d7b456e135e046905553dd23d14326a56`
Session or transcript reference: none
Started and finished: start unknown; finished 2026-09-12T18:18:33+00:00

## Outcome

Implemented a native-only HTTP/3 WebTransport server, hash-pinned native Rust client, and browser-WASM client using browser `WebTransport`. Both clients send the same unchanged FSP4 bytes on one reliable bidirectional stream per request. Native and Headless Chromium tests covered create/open, two submissions, finite reads, snapshot publish/latest, malformed resume tokens, observable disconnect, explicit reconnect, and resume from an opaque token. Confidence is high for the tested Linux/Chromium development configuration.

## Hypothesis Results

Supported. The native and browser adapters compile as separate target stacks, both validate and exchange `fluid-service-protocol` frames directly, and both resumed after an explicit reconnect without protocol changes. Native and Chromium traces used the server-owned 24-byte opaque position token. No shared protocol or service source changed.

## Deliverables and Commits

Prerequisite provenance, coordinator-cherry-picked before implementation:

- `b5095e2ed30263e7819db38f6e0a7902695de762` - `feat(rust-service): assemble native Fluid service`
- `40bda7fde918b5292e51961ca196bcb5047d6a63` - `fix(rust-service): repair assembled service validation`

Implementation commit:

- `63eeedb5e4affa6e925479d3de50aafe235c6fdf` - native server/client, browser-WASM client, deterministic certificate setup, and headless Chromium harness

## Validation Evidence

All Cargo commands ran in the exact disposable copy `/tmp/fluid-wt-validation`, with only protocol, service, and the two new crates added to that copy's member list and isolated target directories.

- `cargo fmt --manifest-path /tmp/fluid-wt-validation/Cargo.toml --all -- --check`: passed.
- `cargo clippy --manifest-path /tmp/fluid-wt-validation/Cargo.toml -p fluid-webtransport-native --all-targets -- -D warnings`: passed.
- `cargo test --manifest-path /tmp/fluid-wt-validation/Cargo.toml -p fluid-webtransport-native -- --nocapture`: passed, 1 test; `native_client_preserves_fsp4_and_requires_explicit_reconnect` printed `NATIVE_EVIDENCE wire_bytes=1304 peak_active_streams=1 reconnect_milliseconds=8`.
- `RUSTFLAGS='--cfg=web_sys_unstable_apis' cargo clippy --manifest-path /tmp/fluid-wt-validation/Cargo.toml -p fluid-webtransport-browser --target wasm32-unknown-unknown -- -D warnings`: passed.
- `RUSTFLAGS='--cfg=web_sys_unstable_apis' cargo build --manifest-path /tmp/fluid-wt-validation/Cargo.toml -p fluid-webtransport-browser --target wasm32-unknown-unknown --release`: passed.
- `wasm-bindgen .../fluid_webtransport_browser.wasm --target web --out-name fluid_webtransport_browser`: passed with `wasm-bindgen 0.2.128`.
- `node --check browser-test.mjs` and `node --check run-headless.mjs`: passed.
- `node run-headless.mjs ... https://127.0.0.1:47778/fluid <certificate-hash>`: exit 0 without insecure certificate flags. Evidence: `{"status":"passed","browser":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/152.0.0.0 Safari/537.36","wireBytes":"1577","peakResponseBytes":363,"reconnectMilliseconds":5,"resumedRecords":1}`.
- `node .github/skills/rust-service-coordination/scripts/iteration-records.mjs validate 0004 phase-2`: exit 1 as expected before integration because the manifest remains `active` and other workstream/integration reports contain required markers; this report contains zero required markers.
- Source `rust-service/Cargo.toml` SHA-256 remained `04e82e831b887b852ca055787d14e1dd9dab0e8b62910c3142471d6a96393fab`; source `rust-service/Cargo.lock` remained `2725188980a89c8e7d6cceaf949d5ab1dcf95963d920c71f8068865290efff5a`.
- Generated browser evidence is retained locally under ignored `rust-service/tests/webtransport-browser/artifacts/`; no certificate private key is tracked.

## Notable Events

Record an event when a hypothesis is falsified, three similar attempts fail, substantial effort is lost, human intervention is needed, a workaround appears, or a reusable technique is discovered.

| Type | Attempt or event | Evidence | Impact | Resolution or state | Reusable lesson |
| --- | --- | --- | --- | --- | --- |
| Dependency correction | Initially paired `web-sys 0.3.105` with `wasm-bindgen 0.2.105`. | Cargo required `wasm-bindgen 0.2.128`. | First combined dependency resolution failed before compilation. | Pinned `wasm-bindgen 0.2.128`; strict WASM Clippy and release build passed. | Resolve the exact `js-sys`/`web-sys`/`wasm-bindgen` family together. |
| Contract friction | Per-stream `tokio::spawn` required the read-only `NativeService::handle` future to be `Send`. | Rust reported a held `RwLockReadGuard` in the service/sequencer path. | Concurrent stream tasks could not compile without changing prerequisite code. | Server processes one connection and stream at a time; the bound is explicit and measured. | Check `Send` at an integrated service boundary before choosing a task-per-request server shape. |
| Harness correction | The first passing Chromium behavior run exited 1 during profile deletion. | Evidence was `status=passed`, followed by Node `ENOTEMPTY`. | Passing behavior could not be accepted as a clean validation run. | Awaited Chromium exit and retried from fresh service data; final run exited 0. | Browser harness cleanup must await the browser process before deleting its profile. |

## Contract and Integration Friction

The coordinator-provided service future is not `Send` for every request path, so this adapter cannot use Tokio task-per-stream concurrency without changing read-only prerequisite code. The server therefore bounds active work to one connection and one stream. The transport required no divergent protocol semantics and no shared API changes.

## Human Interventions

The coordinator cherry-picked service assembly `b5095e2ed30263e7819db38f6e0a7902695de762` and repair `40bda7fde918b5292e51961ca196bcb5047d6a63`, and supplied the authoritative kickoff `30c4a06d7b456e135e046905553dd23d14326a56` and expected tip before implementation.

## Measurements

- Environment: Debian GNU/Linux 13, Rust/Cargo 1.98.1, Chromium 152.0.7977.82, Node 24.21.0, OpenSSL 3.5.7, `wasm-bindgen-cli 0.2.128`.
- Native trace: 1,304 encoded FSP4 application bytes, peak one active server stream, explicit reconnect 8 ms.
- Browser trace: 1,577 encoded FSP4 application bytes, peak accumulated response 363 bytes, explicit reconnect 5 ms, one record resumed.
- Release WASM before HTTP compression: 131,430 bytes.
- Native direct dependencies resolved in the disposable copy: `wtransport 0.7.2`, `bytes 1.12.1`, `thiserror 2.0.20`, `tokio 1.53.1`, plus local protocol/service crates.
- Browser direct dependencies: `js-sys 0.3.105`, `web-sys 0.3.105`, `wasm-bindgen 0.2.128`, and `wasm-bindgen-futures 0.4.78`.
- Wire counters deliberately measure complete encoded FSP4 bytes only. Browser APIs do not expose HTTP/3, QUIC, UDP, or TLS byte totals, so those costs are excluded rather than conflated. The Unix process transport adds a four-byte prefix around a different protocol and is not byte-comparable without packet capture.

## Proposed Decisions

No shared decision is proposed. FSP4 semantics and service APIs were unchanged.

## Candidate Skills and Process Changes

For workstreams excluded from the committed root workspace, create and inspect one exact disposable copy, patch its member list once, and run all later validation directly against that stable copy. Do not trust summarized command status without the actual Cargo result line.

## Remaining Work and Risks

- The server is intentionally serial because the prerequisite service future is not fully `Send`; throughput and concurrent-session behavior remain unmeasured.
- Only Chromium 152 on Linux was exercised. Firefox and Safari were not tested.
- Certificate provisioning is development-only: a caller generates a 13-day P-256 certificate and keeps its private key outside Git. Production certificate automation, trust distribution, authentication, datagrams, and fallback transports remain excluded.
- QUIC/TLS packet overhead and reconnect distributions were not measured because the browser API exposes neither packet byte counters nor transport internals; packet capture is recommended for a future transport benchmark.

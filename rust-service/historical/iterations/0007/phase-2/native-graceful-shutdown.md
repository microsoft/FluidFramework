# Iteration 0007: native-graceful-shutdown Report

Status: complete
Branch: `rust-service-iteration-0007-native-graceful-shutdown`
Worktree: `/workspaces/FluidFramework-rust-service-iteration-0007-native-graceful-shutdown`
Base commit: `115d142fb2ba985b3c4952791498dfecfe8ac902`
Final commit: implementation `2b6a0d8388cf2b6c63ad73351558b861c89926b4`; the report-only completion commit is the immediate successor and is intentionally identified by position to avoid self-reference
Agent or owner: GitHub Copilot implementation agent
Model and tool version: GitHub Copilot; model unknown; tool version unknown
Instruction source: `rust-service/iterations/0007/phase-2/instructions/native-graceful-shutdown.md` at `115d142fb2ba985b3c4952791498dfecfe8ac902`
Session or transcript reference: `fa38fc21-1536-49e1-a614-b6e07a553ae8`
Started and finished: started `2026-09-13T01:08:31Z`; finished `2026-09-13T01:26:52Z`

## Outcome

Implemented an explicit native WebTransport shutdown control with acknowledged stop-accepting, immediate cancellation, and bounded drain modes. The server retains every accepted connection future, continues to enforce `max_connections`, propagates terminal stream errors, reports owned and cancelled connection counts, and reaches zero active connections on every tested completion path. The native binary exposes an optional marker-file trigger used by the real Chromium harness; the marker acknowledgement is written only after the server has stopped polling for new sessions. No kernel, sequencer, protocol, browser-WASM API, live projected streaming, or Fluid reconnect workstream path changed. Confidence is high for the tested native and Chromium behavior and moderate for transport-level peer close classification because browser and `wtransport` APIs do not expose a portable graceful-versus-abrupt QUIC close classification.

## Hypothesis Results

- Supported: because `WebTransportServer::serve` already owns every accepted connection future in a `FuturesUnordered`, selecting a shutdown signal in that same loop stops application acceptance without detaching work. A bounded drain continues polling only those futures; expiration calls `Endpoint::close`, whose `wtransport 0.7.2` contract cancels endpoint connections immediately. Native evidence observed `Drained` with two owned and zero cancelled sessions, deadline `Cancelled` with two owned and two cancelled sessions, immediate `Cancelled` with one owned and one cancelled session, peak active connections of two, and zero active connections at completion.
- Cheapest falsifying check: hold two native sessions active, signal bounded shutdown, attempt a third session, let the two owned sessions disconnect, and require a bounded `Drained` result, rejection of the unaccepted third session, peak connections of two, and zero active connections at completion. A second short-deadline case must return `Cancelled` with both idle owned sessions counted and zero active connections.
- Supported: the cheapest native check passed, and real Chromium independently observed an existing session succeeding during drain while a third post-acknowledgement attempt was ultimately rejected; after the deadline the existing sessions were rejected and server evidence counted both as cancelled.
- Supported: terminal connection errors are no longer discarded. A deliberately truncated 11-byte frame produced `transport failed: stream finished too early (11 bytes read)`, stopped the server, and left zero active connections.
- Falsified implementation assumption: enabling Tokio's `signal` feature in the owned crate would be lockfile-neutral. `cargo test --locked` rejected the required lockfile update, so the change was removed and the already-available time/sync features were used for the marker-controlled binary check.

## Deliverables and Commits

- `2b6a0d8388cf2b6c63ad73351558b861c89926b4` - `feat(rust-service): add bounded native shutdown`: shutdown API and outcomes, owned-future drain/cancel behavior, terminal-error propagation, native tests, marker-controlled binary integration, and Chromium probes.
- Immediate successor - report-only completion commit using the documented non-self-referential convention.

## Validation Evidence

- All delegated validation printed worktree `/workspaces/FluidFramework-rust-service-iteration-0007-native-graceful-shutdown`, branch `rust-service-iteration-0007-native-graceful-shutdown`, and the then-current HEAD (`115d142fb2ba985b3c4952791498dfecfe8ac902` before the implementation commit).
- `cargo fmt --all -- --check` - passed, exit 0.
- `cargo clippy --locked -p fluid-webtransport-native --all-targets --all-features -- -D warnings` - passed, exit 0.
- `cargo build --locked -p fluid-webtransport-native --all-targets` - passed, exit 0.
- `cargo test --locked -p fluid-webtransport-native --all-targets -- --nocapture` - passed, exit 0; 5 passed, 0 failed. Evidence: `SHUTDOWN_DRAIN_EVIDENCE disposition=Drained owned_connections=2 cancelled_connections=0 elapsed_milliseconds=1147 active_connections=0 peak_active_connections=2`; `SHUTDOWN_TIMEOUT_EVIDENCE disposition=Cancelled owned_connections=2 cancelled_connections=2 elapsed_milliseconds=143 active_connections=0`; `SHUTDOWN_IMMEDIATE_EVIDENCE disposition=Cancelled owned_connections=1 cancelled_connections=1 elapsed_milliseconds=89 active_connections=0`; `SHUTDOWN_TERMINAL_ERROR_EVIDENCE error=transport failed: stream finished too early (11 bytes read) active_connections=0`.
- `node --check rust-service/tests/webtransport-browser/browser-test.mjs` and `node --check rust-service/tests/webtransport-browser/run-headless.mjs` - passed, exit 0 each.
- Fresh ignored browser artifacts: `RUSTFLAGS='--cfg=web_sys_unstable_apis' cargo build --locked -p fluid-webtransport-browser --target wasm32-unknown-unknown --release`; `wasm-bindgen target/wasm32-unknown-unknown/release/fluid_webtransport_browser.wasm --target web --out-name fluid_webtransport_browser --out-dir tests/webtransport-browser/pkg`; `sh tests/webtransport-browser/generate-cert.sh tests/webtransport-browser/.certs`; all passed, exit 0.
- Final real-browser command: `node tests/webtransport-browser/run-headless.mjs tests/webtransport-browser https://127.0.0.1:34327/fluid "$(cat tests/webtransport-browser/.certs/cert.sha256)" /tmp/fluid-native-shutdown-final.marker` - passed, exit 0, Chromium `152.0.0.0`, no certificate-bypass flags. Baseline: `transportSessionCount=2`, `wireBytes=2665`, `reconnectMilliseconds=5`, `resumedRecords=2`. Shutdown: acknowledgement `accepting stopped`; existing session during drain `succeeded`; existing session after deadline `rejected`; third post-shutdown session `rejected`. Server: `SHUTDOWN_EVIDENCE disposition=Cancelled owned_connections=2 cancelled_connections=2 elapsed_milliseconds=5081`.
- `git diff --check` - passed. `git diff -- Cargo.lock pnpm-lock.yaml` produced no output before implementation and after final validation; both protected lockfiles remained unchanged.

## Notable Events

Record an event when a hypothesis is falsified, three similar attempts fail, substantial effort is lost, human intervention is needed, a workaround appears, or a reusable technique is discovered.

| Type | Attempt or event | Evidence | Impact | Resolution or state | Reusable lesson |
| --- | --- | --- | --- | --- | --- |
| Falsified hypothesis | Added Tokio `signal` feature for Ctrl-C shutdown. | `cargo test --locked` failed before compilation because `Cargo.lock` required an update. | Native binary trigger could not use that feature within ownership constraints. | Reverted the feature and used an optional marker file plus acknowledgement with existing dependencies. | When a workstream owns a crate manifest but not the workspace lockfile, test feature changes with `--locked` before relying on them. |
| Failed approach | The marker branch requested shutdown and then awaited acknowledgement without polling the server future. | Marker detection printed, but no acknowledgement appeared and the process remained alive; a no-client smoke test reproduced it. | Initial Chromium shutdown run passed its baseline but failed with `ENOENT` waiting for the acknowledgement. | Poll acknowledgement and the pinned server future concurrently, prioritizing acknowledgement; the smoke test and final Chromium run passed. | In a single-task driver, a control acknowledgement generated by a pinned future requires that future to remain polled while awaiting the acknowledgement. |

## Contract and Integration Friction

No shared API or cross-workstream changes. `wtransport` can complete a QUIC handshake before the application polls `Endpoint::accept`; therefore “stop accepting” means no post-acknowledgement session is admitted into an owned application connection future. Such a peer may connect at the QUIC layer but its request is never handled and is rejected when the endpoint closes. The browser API does not expose enough close metadata to label peer-observed closure as graceful QUIC close versus abrupt cancellation; this report claims graceful drain only when owned connection futures finish before the deadline, and cancellation when `Endpoint::close` terminates remaining futures.

## Human Interventions

None.

## Measurements

- Environment: Debian GNU/Linux 13 dev container; Rust toolchain pinned by the repository; Chromium `152.0.0.0`; `wtransport 0.7.2`.
- Native natural drain: 2 owned, 0 cancelled, 1,147 ms; peak active connections 2; final active connections 0. Most elapsed time was the deliberately rejected third client's one-second operation timeout before the two owned clients disconnected.
- Native deadline cancellation: configured 50 ms, observed 143 ms including QUIC endpoint idle completion; 2 owned, 2 cancelled, final active connections 0.
- Native immediate cancellation: observed 89 ms including endpoint idle completion; 1 owned, 1 cancelled, final active connections 0.
- Chromium bounded cancellation: configured 5,000 ms, observed 5,081 ms; 2 owned, 2 cancelled. Existing traffic succeeded during drain and failed after cancellation; the third post-acknowledgement session was rejected.
- Browser baseline: 2 transport sessions, 2,665 encoded FSP4 bytes, 488-byte peak response, 5 ms explicit reconnect, 2 resumed records. QUIC/TLS/UDP bytes and low-level close classification are unobservable and therefore unknown.
- Dependency and lockfile delta: none. Effort elapsed from recorded timestamps: approximately 18 minutes; token usage unknown.

## Proposed Decisions

No shared decision is proposed; the contract is internal to the native WebTransport adapter and uses existing transport semantics.

## Candidate Skills and Process Changes

- Candidate coordination guidance: when a single task owns both a long-running future and its control handle, an acknowledgement generated inside that future must be awaited while continuing to poll the future. A no-client trigger smoke test is the cheapest check before involving Chromium.
- Candidate validation guidance: test crate feature changes immediately with the required `--locked` command when the workstream cannot modify the workspace lockfile.

## Remaining Work and Risks

- No assigned implementation remains. Generated WASM bindings, certificates, temporary marker/acknowledgement files, service data, and Chromium profiles are ignored or under `/tmp`; no intentional untracked artifact remains.
- Residual risk: a third peer can potentially complete the lower-level QUIC handshake while the endpoint remains open for draining, although it cannot become an accepted application session. Enforcing handshake-level refusal while preserving existing sessions would require transport support beyond the current `wtransport` endpoint API.
- Residual risk: Chromium reports request success/rejection but not QUIC close-frame details, so graceful drain and cancellation are classified from server-owned future completion and explicit endpoint-close timing, not from browser close metadata.
- Recommended integration: cherry-pick the implementation commit and its immediate report-only successor, then rerun the same locked native suite and Chromium command from the integration worktree.

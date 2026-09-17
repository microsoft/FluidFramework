# Iteration 0015: transport Report

Status: complete
Branch: `rust-service-iteration-0015-transport`
Worktree: `/workspaces/FluidFramework-rust-service-iteration-0015-transport`
Base commit: `27bf6bde813606100a00bf180085e2a5ba3a0f08`
Final commit: implementation commit `6584f008d91`; this report will be committed as its immediate successor and cannot embed its own SHA
Agent or owner: GitHub Copilot
Model and tool version: unknown
Instruction source: [`instructions/transport.md`](instructions/transport.md) at `27bf6bde813606100a00bf180085e2a5ba3a0f08`
Session or transcript reference: none
Started and finished: 2026-09-17; exact times unknown

## Outcome

Challenged all eight inherited transport dispositions against the exact owning decisions. Two `already adequate` conclusions had topical but non-discriminating evidence: malformed-stream isolation used fresh connections after each fault, and protocol tests exercised encoder or helper validation without directly proving the decoder-owned calls. Repaired both evidence gaps without changing production behavior or contracts. The server test now opens a valid logical stream on the same connection after a malformed stream is stopped, and protocol unit tests now feed raw unknown-kind and zero-correlation frames through `NetworkFrameDecoder` and a wrong-role request through `decode_request_frame`.

The other inherited rows have direct owning-decision evidence or retain their explicit browser/handshake fixture deferrals. A newly identified question about logical state after an injected disconnect hook throws is deferred because the current contract promises forwarding and error propagation but does not settle recovery semantics, and the two-cluster budget is exhausted. Confidence is high: focused tests, both package suites, strict lint/docs, WASM compilation, and generated Node behavior pass.

## Hypothesis Results

- **Owning-decision evidence: supported.** Fresh-client and neighboring-helper evidence masked two owning-decision gaps. The same-connection server probe and direct decoder tests now discriminate those decisions; the remaining inherited mappings are listed below.
- **Convergence: supported with one new revisit trigger.** Six inherited boundaries required no churn beyond exact evidence mapping, and both existing platform/fixture deferrals remain valid. Injected hook-failure state needs a consumer-semantic decision before a test should promise behavior.
- **Proportionate repair: supported.** Both accepted clusters changed tests only. No production behavior, public API, wire format, dependency, manifest, lockfile, generated artifact, or TLS policy changed.

## Deliverables and Commits

- Same-connection malformed-stream isolation regression evidence in `sea-webtransport-server`.
- Direct network-decoder and typed wrong-role regression evidence in `sea-webtransport`.
- Exact disposition rows for every inherited transport boundary and one new deferred candidate.
- Implementation commit `6584f008d91` (`test(rust-service): isolate transport decisions`); this report will be committed as its immediate successor.

## Validation Evidence

- Guarded checkout: absolute worktree, branch `rust-service-iteration-0015-transport`, and kickoff ancestor `27bf6bde813606100a00bf180085e2a5ba3a0f08` verified before accepted runs.
- `cargo test -p sea-webtransport-server server_survives_malformed_and_abandoned_response_streams -- --nocapture`: passed, including the new same-connection logical-stream probe.
- `cargo test -p sea-webtransport --lib`: passed; both `network_decoder_rejects_unknown_kinds_and_invalid_correlations` and `typed_payloads_reject_wrong_direction_and_malformed_bytes` passed.
- `cargo fmt -p sea-webtransport -p sea-webtransport-server -- --check`: passed for both owned crates. A final workspace-wide `cargo fmt --all -- --check` reported only unchanged out-of-scope formatting in `sea-core/src/monitored_stream.rs` and `sea-memory/src/lib.rs`; neither path differs from this branch's `HEAD`.
- `cargo clippy -p sea-webtransport -p sea-webtransport-server --all-targets --all-features -- -D warnings`: passed.
- `RUSTDOCFLAGS='-D warnings' cargo doc -p sea-webtransport -p sea-webtransport-server --all-features --no-deps`: passed.
- `cargo test -p sea-webtransport -p sea-webtransport-server --all-targets --all-features`: passed.
- `env RUSTFLAGS='--cfg=web_sys_unstable_apis' cargo check -p sea-webtransport --target wasm32-unknown-unknown --all-features`: passed.
- `node crates/sea-webtransport/scripts/build-wasm.mjs`: passed. `node --test tests/wasm-client/node-test.mjs`: passed, including `generated injected clients allow an omitted disconnect hook`.
- Generated `crates/sea-webtransport/pkg/` and `crates/sea-webtransport/test-support/pkg/` directories did not exist before validation, were generated for the exact consumer, and were explicitly removed afterward; neither remains.
- `pnpm policy-check --path rust-service` from the worktree root: passed, 499 files processed.
- `pnpm build:fast` from the worktree root: passed after a worktree-local frozen install; both lockfiles remained unchanged.
- `node scripts/check-documentation.mjs`: passed, 24 roots, 31 READMEs, and 48 local links. `git diff --check`, lockfile, ownership, generated-output, endpoint-process, and temporary-target guards passed before final report commit and are repeated afterward.
- Retained machine-readable output: none.

## Behavioral Contracts and Test Layers

No production crate behavior or contract changed. `sea-webtransport-server` owns whether a logical-stream task error is consumed locally while its parent connection remains available; the extended focused raw-transport test fails if `serve_connection_streams` propagates that task error. `sea-webtransport` owns byte-envelope decoding and role validation; the direct protocol tests fail if `NetworkFrameDecoder::next_frame` stops invoking kind/correlation validation or if `decode_request_frame` stops invoking role validation.

Generated Node coverage remains the narrowest practical evidence for JavaScript adapter optionality. Native server tests own connection, stream, shutdown, and publisher-state decisions. Browser tests remain distinct real-platform evidence and do not substitute for focused Rust decisions. No conformance test is appropriate for server task isolation or private protocol parsing because neither is a shared implementation law.

### Proposed Quality Inventory Rows

| Boundary | Owner and consumers | Risk evidence | Relied-upon contract | Existing test layers | Finding and discriminating check | Disposition | Changed contract/tests | Validation | Revisit trigger |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `sea-webtransport/injected-optional-disconnect` | `call_optional_method` and `InjectedTransport::disconnect`; generated injected clients | Optional JavaScript member lookup previously used mandatory invocation. | Omitted `disconnect` succeeds; a present hook is invoked and its failure propagates. | generated | `generated injected clients allow an omitted disconnect hook` constructs both absent and throwing hooks; it fails if optional lookup or error propagation regresses. | already adequate | none | Generated Node suite passed. | Optional hooks generalize or generated runtime ownership moves. |
| `sea-webtransport/shared-correlation-lifecycle` | `ClientState::{begin,disconnect,reconnect}` and `PendingCorrelation::drop`; all platform clients | Cancellation, disconnect, and reconnect can leak or admit stale correlations. | Dropped guards abandon IDs; disconnect clears authority/correlations and blocks admission until explicit reconnect; close cannot reconnect. | focused, generated, integration | `correlations_are_scoped_completed_and_abandoned` directly drops a guard; `disconnect_abandons_requests_and_requires_explicit_recovery` directly calls the owning transitions and checks admission before and after reconnect. | already adequate | none | Full client package suite passed. | Correlation concurrency or reconnect semantics change. |
| `sea-webtransport/protocol-validation` | `NetworkFrameDecoder`, typed request/response decoders; clients and server | Encoder/helper tests could pass if decoder-owned validation calls regressed. | Reject excessive, incomplete, unknown-kind, invalid-correlation, wrong-role, wrong-direction, and malformed typed frames before use. | focused, integration, platform | Raw bytes now hit unknown-kind and zero-correlation branches in `next_frame`; a constructed request frame hits `decode_request_frame` role validation; existing tests directly cover limits, truncation, direction, and malformed payloads. | repaired | Added `network_decoder_rejects_unknown_kinds_and_invalid_correlations`; extended `typed_payloads_reject_wrong_direction_and_malformed_bytes`. Contract unchanged. | Focused and full client suites passed. | Protocol version, framing, message kinds, roles, or limits change. |
| `sea-webtransport/browser-disconnect-resource-release` | `BrowserTransport::disconnect`; browser clients and server resources | The method remains a no-op and no Rust/generated test can observe browser connection release. | Browser disconnect should release the underlying WebTransport connection if that is the promised lifecycle. | platform | Requires a browser fixture that distinguishes closing the connection from closing logical streams and observes resource release. | deferred | none | Source review confirms the no-op and fixture gap. | A focused real-browser resource-release fixture exists. |
| `sea-webtransport/injected-disconnect-failure-state` | Shared `Client::disconnect` and injected adapter; callers replacing a failed transport | The transport hook result is saved, logical state is disconnected, then the hook error is returned; current generated test checks only propagation. | Whether hook failure still requires `replaceTransport` before request admission is not stated by the injected contract. | focused state and generated hook error, but no combined decision test | A generated test could throw from `disconnect`, then attempt a request or replacement; expected behavior requires a consumer-semantic decision first. | deferred | none | Source and generated-contract review only. | Consumers require defined recovery after a failing disconnect hook, or the contract states that logical disconnection occurs regardless of hook outcome. |
| `sea-webtransport-server/snapshot-stream-cleanup` | `serve_snapshot_stream`; snapshot coordinators and publishers | Post-registration decode/write exits previously bypassed revocation. | Every acknowledged snapshot-stream end promptly revokes that stream's publisher while the connection may remain alive. | focused, integration, platform | `malformed_snapshot_stream_releases_publisher` keeps the malformed connection alive and observes another participant receive a fence; it fails if the cleanup funnel stops revoking. | already adequate | none | Full server package suite passed. | Participation becomes connection-scoped or multiple stream identities are introduced. |
| `sea-webtransport-server/immediate-shutdown-cleanup` | `serve_until_shutdown` cancellation branch and `cleanup_services`; hosted sessions | Immediate shutdown must bypass reconnect grace and clean cancelled connections. | Shutdown stops acceptance, cancels owned connections at the deadline, and cleans each service. | focused | `immediate_shutdown_releases_session_without_reconnect_grace` configures 30-second grace, requests immediate shutdown, and checks cancelled/owned counts plus exactly one cleanup. | already adequate | none | Full server package suite passed. | Connection ownership, drain accounting, or cleanup concurrency changes. |
| `sea-webtransport-server/malformed-stream-isolation` | `serve_connection_streams` stream-completion branch; all logical streams sharing one connection | The inherited fresh-client check could pass if only the offending connection was terminated. | A malformed logical stream fails locally while its parent connection remains usable. | focused, integration, platform | `send_malformed_stream` now waits for the offending stream stop and opens a valid event stream on the same raw connection; it fails if the stream error escapes the connection loop. | repaired | Extended `server_survives_malformed_and_abandoned_response_streams`; contract unchanged. | Focused and full server suites passed. | Stream-task errors begin propagating, connection ownership changes, or multiplexing changes. |
| `sea-webtransport-server/connection-establishment-timeout` | `serve_until_shutdown` accept future; unauthenticated peers and operators | `incoming.await` remains unbounded while pending handshakes consume `max_connections`. | The documented operation timeout should bound establishment, or the public promise should narrow. | none focused | Requires a deterministic stalled HTTP/3 handshake that occupies a slot beyond the configured deadline. | deferred | none | Source review confirms the mismatch and absent fixture. | A deterministic stalled-handshake fixture exists or pending handshakes exhaust the configured cap. |

## Notable Events

Record an event when a hypothesis is falsified, three similar attempts fail, substantial effort is lost, human intervention is needed, a workaround appears, or a reusable technique is discovered.

| Type | Attempt or event | Evidence | Impact | Resolution or state | Reusable lesson |
| --- | --- | --- | --- | --- | --- |
| Evidence challenge | Fresh connections followed malformed-stream probes in the inherited server test. | `serve_connection_streams` discards completed stream-task results, but the test did not reuse the connection whose stream failed. | A connection-fatal regression could pass. | Added a valid logical stream on the same connection after the malformed stream is stopped. | Match multiplexing claims with same-connection evidence; endpoint survival is a different responsibility. |
| Evidence challenge | Protocol tests exercised encoder/helper validation around decoder-owned calls. | `NetworkFrameDecoder::next_frame` and `decode_request_frame` invoke validation independently. | Local decoder regressions could remain masked. | Added direct raw-frame and typed wrong-role assertions. | Name the exact call whose removal must fail the test, not only the validation helper. |
| Validation interruption | Two delegated isolated focused runs and one redirected direct run ended with exit 130 during compilation. | The direct run printed sibling branch `rust-service-iteration-0015-storage`; branch guards prevented accepting it. | Delayed protocol validation; one temporary target cleanup did not execute in the interrupted shell. | A later guarded package run passed; final cleanup removes the temporary directory. | Preserve branch output and use an already warm, guarded package target when concurrent workstreams contend for runners. |
| Out-of-scope validation | Final workspace rustfmt reported existing differences outside transport ownership. | Only `sea-core/src/monitored_stream.rs` and `sea-memory/src/lib.rs` were named, and neither differs from this branch's `HEAD`; owned-package rustfmt passes. | The workstream cannot claim the current workspace-wide format gate. | Recorded for integration rather than editing another owner's paths. | Separate owned-package evidence from integration-wide blockers and verify the named files are unchanged before disposition. |
| Repository build interruption | The first absolute-directory `pnpm build:fast` was externally interrupted after 29 tasks, and a guarded background retry completed without retaining its final terminal status. | No task failure was reported; a final cached rerun completed with exit 0. | Added time but no source changes. | Accepted only the final explicit exit-0 rerun. | Do not infer success from a retired background worker; rerun the warm graph for a definitive result. |

## Contract and Integration Friction

Injected disconnect-hook failure semantics are not stated: shared `Client::disconnect` transitions logical state even when the hook returns an error, but generated evidence only promises error propagation. No change was made without a consumer requirement. Concurrent command routing redirected one guarded command to the storage worktree; its printed branch prevented false validation attribution. No cross-workstream source dependency or undocumented implementation workaround remains.

## Human Interventions

The user supplied the authoritative worktree, verified clean kickoff, two-cluster budget, exact owning-decision standard, required Rust/WASM/generated checks, and prohibition on external evaluator files. No semantic or implementation intervention was required.

## Measurements

Performance and production-size measurements are not applicable because only tests and this report changed. Dependency, manifest, lockfile, API, wire-format, generated-artifact, and TLS-policy changes: zero. Two test clusters were implemented, the configured maximum. Environment: Linux dev container, repository-pinned Rust toolchain, `wasm32-unknown-unknown`; exact elapsed time and token use unknown.

## Proposed Decisions

No shared decision is proposed. Injected hook-failure recovery remains a deferred consumer-contract question rather than an inferred promise.

## Candidate Skills and Process Changes

No skill change is proposed. The strengthened owning-decision rule correctly exposed both evidence gaps. Existing branch-guard guidance also prevented accepting a redirected sibling-worktree command.

## Remaining Work and Risks

- Browser connection resource release remains deferred until a real-browser fixture can distinguish connection close from logical-stream close.
- Connection-establishment timeout remains deferred until a deterministic stalled-handshake fixture exists.
- Injected disconnect-hook failure state remains deferred until consumers require defined recovery semantics.
- Integration must reconcile these proposed rows into `quality-inventory.md`; this workstream does not own the shared inventory file.
- Integration should rerun workspace-wide rustfmt after the `sea-core` and `sea-memory` owners are reconciled. No generated or machine-readable artifact is retained.

# Iteration 0017: transport Report

Status: complete; evidence deferrals retained.
Branch: `rust-service-iteration-0017-transport`.
Worktree: `/workspaces/FluidFramework-rust-service-iteration-0017-transport`.
Base commit: `cc2abb85cefb3a29e9b7d75e62986dff83e75680`.
Final workstream commit: `83e39e44d0e`; coordinator reconciled this report during integration.
Agent or owner: GitHub Copilot transport delegate; coordinator-owned execution.
Model and tool version: unknown.
Instruction source: [instructions](instructions/transport.md) and [charter](../charter.md).
Session reference: not retained; [execution evidence](../execution-evidence.json) records attributable runs.
Audit effort timing: unknown.

## Outcome

Reviewed two lifecycle boundaries: admission cleanup and browser physical connection release.
No product repair or semantic change was made.
Scoped native checks passed 46 tests, Clippy, and formatting.
Admission timeout/capacity/listener evidence is supported; direct callback and browser physical-release assertions remain deferred.

## Hypothesis Results

Current real-QUIC tests falsify the historical missing-stalled-handshake-fixture claim.
They do not prove that the service cleanup callback runs with reconnect grace disabled.
Browser logical close/reopen does not distinguish explicit disconnect from final-owner drop or server cleanup.
No current resource leak was demonstrated.

## Deliverables and Commits

Only this report changed in the workstream, committed as `83e39e44d0e`.
No runtime, API, manifest, lockfile, generated binding, or browser fixture changed.
No changeset is required.
Coordinator integration removed concatenated stale report drafts.

## Validation Evidence

Coordinator compound task `rs17-parallel-checks` launched `process: rs17-transport-check` from workspace `/workspaces/FluidFramework`.
Run `1789847965170-9cd8b8c5-2634-420c-b0d1-cc25f6438b4d`, PID `450351`, recorded the branch/base above and cwd `/workspaces/FluidFramework-rust-service-iteration-0017-transport/rust-service`.
Start status contained only this modified report; environment label was `transport`.
Start/end were `1789847965170` / `1789848048196` Unix milliseconds, elapsed 83.026 seconds, exit 0.

| Command | Result |
| --- | --- |
| `cargo test -p sea-webtransport -p sea-webtransport-server --all-features` | Exit 0; 21 client and 25 server tests passed |
| `cargo clippy -p sea-webtransport -p sea-webtransport-server --all-targets --all-features -- -D warnings` | Exit 0 |
| `cargo fmt --all -- --check` | Exit 0 |

The log names all four `server::tests` admission and frame-timeout cases as passing.
Empty binary/doc-test suites are not counted as evidence.
[Execution evidence](../execution-evidence.json) retains exact command and local raw-log paths.
The [integration report](integration.md) records separate canonical and browser checks, neither of which proves the missing assertions.
The delegate lacked task discovery and did not invoke tasks or foreground commands.

## Behavioral Contracts and Test Layers

### Admission Contract and Owning Decisions

The [server contract](../../../../crates/sea-webtransport-server/README.md) promises one complete establishment deadline, connection-local failure, slot/service release without reconnect grace, and bounded pending-admission shutdown.
The [implementation](../../../../crates/sea-webtransport-server/src/server.rs) wraps admission in `timeout_at`, calls `connection_closed(false)`, records cleanup, and returns normally.
`failed_admissions_release_capacity_and_preserve_listener` discriminates timeout, slot reuse, listener survival, and accounting with capacity one and real stalled/aborted/rejected connections.
`shutdown_cancels_pending_admission_without_reconnect_grace` checks cancellation and counts.
Neither observes the callback: omitting it while incrementing the counter, or changing its argument, need not fail them.
Disposition: adequate for bounded timeout/capacity/listener/count decisions; deferred for callback invocation and no-grace policy.
Follow up with a recording service asserting callback count and argument for failed admission and pending-admission shutdown.

### Browser Contract and Owning Decisions

The [lifecycle contract](../../../../crates/sea-webtransport/README.md#lifecycle-and-ownership) promises explicit disconnect closes the underlying WebTransport session.
The [browser owner](../../../../crates/sea-webtransport/src/transport/browser.rs) calls `close()` independently in disconnect and Drop.
The [harness](../../../../tests/webtransport-browser/browser-test.mjs) observes logical close, rejected requests, and fresh opens, not old physical connection release.
Factory-open counts and server shutdown cannot distinguish either client cleanup decision.
Disposition: deferred platform evidence, not a demonstrated leak.
Test explicit disconnect while retaining its owner, then final-owner drop without disconnect, separately observing bounded server cleanup or recovered capacity.
Test-only lifetime controls cross WASM ownership and require exact-path approval; do not restore removed public injection APIs for this fixture.

## Notable Events

The delegate probe lacked `tool_search`; coordinator task checks followed parallel file-work batches.
The audit identified a narrower callback-evidence gap instead of reproducing retired unbounded admission.
Disk validation caught concatenated report drafts despite editor diagnostics and phase validation; coordinator reconstructed the active report and checked title cardinality.

## Contract and Integration Friction

Browser lifetime controls cross transport, WASM, and harness ownership.
No shared API or generic disconnect-error policy is selected here.
Retained reads, snapshot leases, and WebSocket cleanup were lower-ranked and unreviewed.

## Human Interventions

The user approved scope and budget.
The coordinator imposed file-only delegation after the capability probe; no further user intervention or scope expansion occurred.

## Measurements

Two boundaries, zero product repairs; check elapsed 83.026 seconds.
Agent effort, throughput improvement, autonomous scheduling, cancellation isolation, and upstream repair are not established.

## Proposed Decisions

Retain both precise gaps with the transport owner and approval/change triggers.
No new shared product decision is required.

## Candidate Skills and Process Changes

Distinguish callback arguments from counters and physical release from logical reopen.
These examples support existing owning-decision guidance; execution changes are assessed in the [skill review](../skill-review.md).

## Remaining Work and Risks

Revisit the recording-service test when its fixture batch is approved or admission cleanup changes.
Revisit browser release when test-only controls and server observation are approved or lifetime behavior changes.
No next iteration or additional repair cluster is authorized.
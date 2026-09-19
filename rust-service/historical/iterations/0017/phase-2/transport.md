# Iteration 0017: transport Report

Status: bounded audit and scoped native validation complete; evidence deferrals and canonical integration gates remain open.
Branch: `rust-service-iteration-0017-transport` (recorded by coordinator checkout guard).
Worktree: `/workspaces/FluidFramework-rust-service-iteration-0017-transport` (recorded checkout; command cwd is its `rust-service/` directory).
Base commit: assigned kickoff and recorded check-run HEAD `cc2abb85cefb3a29e9b7d75e62986dff83e75680`.
Source commit: `41e9420cbba665bb4d9ad32f812eb1816a3fdea9` as recorded in the charter; ancestry not verified by these artifacts.
Final commit: none by the delegate; coordinator owns staging and commits.
Agent or owner: GitHub Copilot, transport delegate; check execution by coordinator.
Model and tool version: unknown; file tools, `apply_patch`, and editor diagnostics available.
Instruction source: [transport instructions](instructions/transport.md) and [charter](../charter.md), assigned at the kickoff above; file revisions not independently verified.
Session or transcript reference: none; attributable check artifacts are recorded below.
Started and finished: audit effort timestamps unknown; coordinator check ran from `1789847965170` to `1789848048196` Unix milliseconds on 2026-09-19.

The initial delegate task probe lacked `tool_search`; the coordinator subsequently launched compound task `rs17-parallel-checks`.
Probe and scheduling attribution are supplied by the user; run metadata and outcomes below are read from the artifacts.
No delegate task execution, autonomous scheduling, or upstream tool fix is claimed.
This documentation finalization only reads reports and their own evidence, edits reports, and requests editor diagnostics.

## Outcome

Reviewed exactly two ranked lifecycle boundaries: server admission cleanup and browser physical connection release.
No product repair was made; zero of the permitted one repair cluster was used.
Only this report was edited by the transport delegate and by this finalization in this worktree.
Coordinator task `process: rs17-transport-check` passed 21 transport and 25 server tests, Clippy, and workspace formatting.
The admission tests provide passing capacity/listener evidence, but do not directly assert the no-reconnect-grace callback argument.
The browser implementation closes its WebTransport object in explicit disconnect and final-owner drop, but the inspected browser harness does not distinguish those decisions.
Neither unresolved aspect is declared repaired or fully validated; canonical integration gates remain coordinator-owned and pending.

## Hypothesis Results

Initial hypothesis: current owner-local tests may already discriminate admission timeout/capacity cleanup, while logical browser close/reopen may not prove physical release.
The selected check traced the timeout branch and existing admission assertions, then compared browser disconnect/drop with the harness's actual observations.

Admission: source inspection and the now-passing tests support bounded timeout and capacity recovery, rather than the old historical claim that no stalled-handshake fixture exists.
The current test creates a real QUIC connection without HTTP/3 settings and exercises a capacity-one listener.
However, the stronger hypothesis that every cleanup decision has direct evidence is not supported: default reconnect grace is zero, no membership is opened, and neither admission test records the boolean passed to `connection_closed`.
Changing that argument from `false` to `true` need not fail those assertions.
Passing the current tests does not close this narrower policy-evidence gap.

Browser: the current factory API and harness independently confirm the reported evidence gap.
The test's `transportSessionCount` increments on successful factory opens, not on observed server connection release.
Closed-session rejection and opening another session do not prove that the previous physical connection closed.
Server-initiated shutdown can clean up a connection even when client-side close is broken.
No current leak was demonstrated, and the native check does not execute the wasm32 browser implementation.

## Deliverables and Commits

- This completed report: exactly two inventory assessments, observed native validation, and explicit remaining evidence limits.
- No code, tests, browser fixtures, generated bindings, manifests, lockfiles, shared APIs, shared inventory, or other reports changed by the transport delegate.
- No artifacts or commits created by the delegate; the coordinator produced the cited check artifacts.
- The recorded run-start status lists only this report as modified; post-run status and ignored artifacts are not enumerated in the evidence.
- No changeset is needed for this report-only change; user-facing behavior and APIs are unchanged.

## Validation Evidence

Read both nonempty `result.json` and `output.log` in `/workspaces/FluidFramework-rust-service-iteration-0017-transport/rust-service/target/iteration-0017-evidence/transport-check-1789847965170-9cd8b8c5-2634-420c-b0d1-cc25f6438b4d/`.
Run ID: `1789847965170-9cd8b8c5-2634-420c-b0d1-cc25f6438b4d`; runner PID: `450351`; environment label: `transport`.
Runner start/end: `1789847965170` / `1789848048196` Unix milliseconds; elapsed: 83,026 ms; final exit: `0`.
The result and log agree on run identity, checkout, command starts, and final exit.
Per-command PIDs, finishes, and exits below come from the result; named test outcomes come from the log.

| Observed command | PID | Start / finish (Unix ms) | Exit / outcome |
| --- | --- | --- | --- |
| `cargo test -p sea-webtransport -p sea-webtransport-server --all-features` | 450449 | 1789847965236 / 1789848025974 | 0; 21 + 25 passed, 0 failed |
| `cargo clippy -p sea-webtransport -p sea-webtransport-server --all-targets --all-features -- -D warnings` | 457927 | 1789848025974 / 1789848047878 | 0 |
| `cargo fmt --all -- --check` | 458928 | 1789848047878 / 1789848048196 | 0 |

All command cwd values are `/workspaces/FluidFramework-rust-service-iteration-0017-transport/rust-service`.
The checkout guard records branch `rust-service-iteration-0017-transport` and HEAD `cc2abb85cefb3a29e9b7d75e62986dff83e75680`.
Start status lists only modified `rust-service/historical/iterations/0017/phase-2/transport.md`; no manifest or lockfile modification is listed.
The logs use local `target/debug/deps` executables.
The artifacts do not contain post-run status or an explicit toolchain-version/environment dump, so those checks are not established here.

The full server suite, rather than separate exact filters, names all four requested checks as `ok`:

- `server::tests::failed_admissions_release_capacity_and_preserve_listener`
- `server::tests::shutdown_cancels_pending_admission_without_reconnect_grace`
- `server::tests::idle_stream_outlives_operation_deadline`
- `server::tests::partial_frame_expires_after_operation_deadline`

The two paused-time tests distinguish established idle reads from partial-frame deadlines; they do not substitute for real QUIC admission.
The server binary ran zero tests, and each crate ran zero doc-tests; these empty suites are not counted toward the 46 unit tests or warnings-denied rustdoc.
No separate exact-filter run, mutation experiment, or browser physical-release check is claimed.
The coordinator launched this check through `rs17-parallel-checks` after the initial delegate probe lacked `tool_search`; no delegate task execution occurred.

Warnings-denied rustdoc, documentation/link checks, scoped policy, Phase 2 record validation, and the charter's workspace canonical integration gates remain integration-owned and pending.
The report-only batch adds no Rust/build inputs and does not independently trigger a root build; the iteration's existing integration obligations remain unchanged.
The earlier report diagnostic check returned "No errors found"; finalization diagnostics are separate from Rust execution and Markdown link verification.
Earlier direct reads established the source-level analysis below; an empty sibling-worktree search and an out-of-range read were not treated as proof of missing tests.

## Behavioral Contracts and Test Layers

### Ranked Boundaries and Proposed Inventory Rows

These are the only two reviewed boundaries and are for coordinator reconciliation, not edits to the shared inventory.
The unresolved portions remain deferred; no blanket `already adequate` claim is made.

| Rank / boundary | Owner and consumers | Disposition | Changed contract/tests | Validation and revisit trigger |
| --- | --- | --- | --- | --- |
| 1 / `sea-webtransport-server/connection-establishment-timeout` | `WebTransportServer::serve_until_shutdown`, `cleanup_services`, `SeaConnectionService::connection_closed`; clients competing for listener capacity and connection-scoped dispatchers | Existing timeout/capacity/listener evidence passed; direct no-grace callback-policy evidence remains deferred | None | Named admission and deadline tests passed within the 25-test server suite; revisit on admission/cleanup policy changes or when a recording-service fixture is authorized |
| 2 / `sea-webtransport/browser-disconnect-resource-release` | `BrowserTransport::disconnect` and `Drop`; `SessionClient<BrowserTransport>`, generated neutral session owners, server admission capacity | Deferred: independent physical-release proof for both paths is absent; native success does not resolve it | None | No fresh real-browser physical-release run; revisit when test-only lifetime controls and server observation are approved, or transport ownership changes |

### Admission Contract and Owning Decisions

The admission path holds one capacity slot across asynchronous QUIC, path, and acceptance stages; current tests exercise a real stall, abort, and rejection.
The [server README](../../../../crates/sea-webtransport-server/README.md) states: "Each admitted QUIC connection has one `operation_timeout` deadline for the complete WebTransport handshake, including path acceptance or rejection."
It also states: "Failed, rejected, and timed-out admissions release their capacity slot and connection-scoped service without stopping the listener or applying reconnect grace."
Pending admissions are subject to immediate or bounded-drain shutdown.

In the [owning implementation and tests](../../../../crates/sea-webtransport-server/src/server.rs), one `timeout_at` wraps incoming/path/accept.
Unsuccessful establishment calls `connection_closed(false)`, records cleanup, returns `Ok(())`, and completion removes the service/slot.
`failed_admissions_release_capacity_and_preserve_listener` would fail if the stalled deadline, slot release, cleanup accounting, or listener continuation regressed: capacity is one, closure is bounded, three failed admissions precede a successful connection, and cleanup totals are 3 then 4.
`shutdown_cancels_pending_admission_without_reconnect_grace` checks owned/cancelled/cleanup counts for Immediate and zero-duration Drain.
Neither observes the cleanup boolean; a test-local service recording each `connection_closed` argument is the smallest direct discriminator for that remaining policy decision.
Focused real-QUIC tests own admission evidence, and paused-time byte-stream tests own the distinct post-admission deadline policy; no shared conformance substitute is needed.

### Browser Contract and Owning Decisions

The [transport lifecycle README](../../../../crates/sea-webtransport/README.md#lifecycle-and-ownership) states: "Explicit browser disconnect closes the underlying WebTransport session."
[ClientTransport](../../../../crates/sea-webtransport/src/transport/mod.rs) promises "Disconnects the underlying connection."
The [browser implementation](../../../../crates/sea-webtransport/src/transport/browser.rs) also closes on final-owner drop; keep this browser ownership behavior distinct from a generic trait-wide Drop promise.
No unchanged production contract needs new documentation merely to finalize this report.

The owning decisions are two separate `self.transport.close()` calls.
The [browser flow](../../../../tests/webtransport-browser/browser-test.mjs) counts factory opens, closes logical memberships, rejects closed-session calls, and opens fresh sessions.
[Runner shutdown](../../../../tests/webtransport-browser/run-headless.mjs) is server-initiated and can mask missing client release.
Generated/browser composition exists for neutral session close/reopen and shutdown, but does not isolate either physical-release decision; native conformance cannot instantiate the wasm32 browser implementation.

The required discriminator is a real-browser test that invokes explicit disconnect while retaining the Rust transport owner and observes bounded server cleanup or recovered capacity before drop.
A separate case must drop the final owner without explicit disconnect and observe the same resource release.
Removing only either close call must fail its corresponding case; page teardown, session-wrapper free, server shutdown, or inactivity expiry must not satisfy it.
Existing close/reopen assertions could still pass and are not adequate evidence for this specific boundary.

### Coverage and Repair Decision

No production crate changed, so no new product contract or regression is claimed.
The admission tests directly localize capacity, timeout, listener continuation, and cleanup-count decisions; duplicating them would add no useful evidence.
The no-grace policy still lacks a direct assertion: using `BuiltInSeaHost` with no admitted author and zero default grace makes elapsed shutdown time insufficient to distinguish the argument.
A recording service is practical, but the current service trait requires several dispatch methods; introducing that fixture is deferred to an executable edit/test batch rather than treating an unrun fixture as a repair.
The coordinator can authorize that one local test cluster without changing shared semantics or requiring documentation churn.

The browser gap cannot be repaired by another neutral-session reopen assertion.
The inspected [generated session](../../../../crates/sea-wasm/src/bindings.rs) erases its concrete stack behind a shared session adapter, and `SeaSession::close` invokes membership close.
It does not give this harness independent controls for retaining a concrete transport after explicit disconnect and then dropping its final Rust owner.
Do not restore the retired generic JavaScript transport-injection API or widen production APIs for this audit.
The smallest approval request is a test-only concrete browser-transport owner with connect, explicit disconnect, and deterministic final-owner release, plus bounded per-case server cleanup/capacity observation.
Exact fixture placement and any feature/manifest changes require coordinator ownership approval before editing.
No such approval is presumed or blocking this bounded report-only return.

### Lower-Ranked Candidates

- Browser retained-read cancellation: the current README states the promise and `BrowserStreamState::pending_receive` retains the JavaScript promise. No new cancellation incident was supplied; it ranks below the demonstrated physical-release evidence gap. Not audited for adequacy. Transport owner should revisit if pump/read ownership changes or bytes are lost after waiter cancellation.
- Generic fallible disconnect state: the current known issue requires a consumer-driven recovery contract choice. This audit identified no such requirement and leaves error propagation, logical admission, and correlation cleanup semantics unchanged. Coordinator owns the choice when a fallible transport consumer needs it.
- Snapshot registration cleanup and WebSocket owner/child lifecycle: current guides describe distinct registration leases and socket-group cleanup, but no new change or incident supplied a stronger incremental trigger than admission and browser release. Not audited. Their transport owners should revisit on lease/group ownership changes or cleanup failures.
- Signals delivery is assigned to another workstream; storage recovery, authentication, retention, production qualification, CI feeds, and Fluid integration remain outside this audit.

## Notable Events

| Type | Attempt or event | Evidence | Impact | Resolution or state | Reusable lesson |
| --- | --- | --- | --- | --- | --- |
| Execution restriction | Initial delegate task probe lacked `tool_search` | User-supplied scheduling provenance and coordinator artifacts above | No delegate task execution | Coordinator launched `rs17-parallel-checks`; native check passed | Attribute execution to the coordinator; do not claim autonomous scheduling or a tool fix. |
| Evidence limit | Rechecked the no-grace assertion in the current admission test | Default zero reconnect grace, no admitted membership, cleanup counts only | Test name is stronger than its decision-discriminating assertion | Preserve implementation and defer a test-local service observer despite the passing native suite | Ask whether changing only the policy argument would fail the test. |
| Platform boundary | Browser close/reopen and shutdown checks do not isolate physical release | Factory-open counter, neutral membership close, server-initiated drain | Broad passing tests cannot close this evidence gap | Request minimal test-only ownership controls before fixture work | Keep explicit disconnect alive long enough that drop cannot mask it. |
| File-tool limitation | Sibling-worktree search and an out-of-range read returned empty | Subsequent direct reads found existing server tests | No absence claim or command workaround was made | Evidence taken from direct current-file reads | Empty search outside the loaded root is not a coverage inventory. |

## Contract and Integration Friction

Transport owns physical WebTransport close; generated session ownership belongs to `sea-wasm` and `sea-typescript`.
Exposing independent transport lifetime controls crosses that boundary and needs coordinator approval even if the consuming fixture sits in the owned browser directory.
The server's existing `MeasurementHandle` provides a native observation primitive, but a browser-accessible fixture bridge or capacity-one host must be approved and attributable to the same test run.
No global metrics endpoint or production API is proposed.
Generic disconnect error-state semantics are deliberately not selected or changed.
Existing contract documentation is sufficient for this no-production-change audit; the open gaps require discriminating evidence, not new promises.

## Human Interventions

The user constrained delegate work to file tools after the initial task probe lacked `tool_search`, reserved isolated execution for the coordinator, prohibited terminal/Git/agent workarounds, and withheld WASM/browser-fixture authorization.
The coordinator launched the compound checks and supplied their evidence for report finalization.
No further ownership approval or semantic expansion occurred.

## Measurements

Audit scope: exactly two ranked boundaries, zero product repairs, one report edited.
Coordinator native check: 46 unit tests passed (21 transport + 25 server), Clippy and formatting passed; runner duration 83,026 ms.
Run ID, runner/command PIDs, timestamps, and exits are recorded in Validation Evidence.
Performance, binary size, dependency size, and throughput: not applicable to this report-only change and not measured.
Exact Rust, Node, pnpm, wasm-bindgen, and browser versions and elapsed audit effort remain unknown.
The recorded environment label is `transport`; no throughput improvement or upstream terminal fix is claimed.

## Proposed Decisions

No shared semantic or API decision is proposed and no decision record was created.
Accept the bounded report-only result with passing scoped native checks, an explicit direct no-grace callback-evidence qualifier, and the browser physical-release deferral.
Do not declare all admission-cleanup aspects adequate merely because the native suite passed.
Before closing the browser item, approve only the test-only lifetime controls and server observation described above, with exact paths and owners; otherwise keep it deferred.
Do not require new documentation for unchanged production contracts or choose generic disconnect failure semantics without a consumer requirement.

## Candidate Skills and Process Changes

No new skill or process file is proposed.
Existing quality guidance already requires owning-decision discrimination and fresh platform evidence.
The concrete lessons are to distinguish factory-open counts from connection cleanup, and cleanup-count assertions from cleanup-policy arguments.

## Remaining Work and Risks

1. Coordinator: complete warnings-denied rustdoc, documentation/link, policy, report/Phase 2 checks, and the charter's workspace canonical integration gates. Scoped native success does not complete these gates.
2. Coordinator: reconcile exactly these two inventory rows, retaining the no-grace callback qualifier and browser deferral; verify final changed-path/manifest/lockfile status before integration.
3. Transport owner: in a subsequent executable batch, consider the focused service-observer test for no-grace cleanup on failed admission and pending-admission shutdown. Existing passing tests do not justify that narrower policy claim.
4. Coordinator and WASM/browser owners: decide whether to approve the minimal explicit-disconnect/final-drop fixture. Until then, retain the browser resource-release deferral; native tests and broad browser composition are not substitutes.
5. Coordinator: account for ignored artifacts and any later worktree changes before integration. The delegate performed no staging, commits, cleanup, or artifact generation.

The source-level distinctions and scoped native outcomes are evidenced; direct no-grace callback discrimination and browser physical release remain unverified.
Stop at the two-boundary budget; no next iteration, additional repair slice, or production change is initiated.# Iteration 0017: transport Report

Status: bounded audit complete; coordinator validation pending
Branch: `rust-service-iteration-0017-transport` (assigned, not command-verified)
Worktree: `/workspaces/FluidFramework-rust-service-iteration-0017-transport` (assigned; files read at this absolute path)
Base commit: assigned kickoff `cc2abb85cefb3a29e9b7d75e62986dff83e75680`; actual initial HEAD unknown
Source commit: `41e9420cbba665bb4d9ad32f812eb1816a3fdea9` as recorded in the charter; ancestry not verified
Final commit: none; commits and Git hooks were prohibited
Agent or owner: GitHub Copilot, transport delegate
Model and tool version: unknown; file tools, `apply_patch`, and editor diagnostics available
Instruction source: [transport instructions](instructions/transport.md) and [charter](../charter.md), assigned at the kickoff above; file revisions not independently verified
Session or transcript reference: none
Started and finished: 2026-09-19 session date; exact timestamps and elapsed time unknown

The latest user instruction authorizes this file-only batch despite the previously reported unavailable `tool_search`/`run_task` probe.
That probe result is supplied provenance, not a command observed in this batch.
No task, terminal, shell, child agent, Git operation, or executable check was invoked by this delegate.
Observed evidence below is current source inspection, not historical test success.

## Outcome

Reviewed exactly two ranked lifecycle boundaries: server admission cleanup and browser physical connection release.
No product repair was made; zero of the permitted one repair cluster was used.
Only this report was edited.
The admission implementation has direct capacity/listener regression tests, but the cleanup-policy argument is not directly asserted.
The browser implementation closes its WebTransport object in both explicit disconnect and final-owner drop, but the inspected browser harness cannot distinguish those decisions.
Neither boundary is declared fully validated or repaired.
Execution and checkout guards remain pending through coordinator task `process: rs17-transport-check` in workspace `/workspaces/FluidFramework`.

## Hypothesis Results

Initial hypothesis, stated before editing: current owner-local tests may already discriminate admission timeout/capacity cleanup, while logical browser close/reopen may not prove physical release.
The selected check was to trace the timeout branch and existing admission assertions, then compare browser disconnect/drop with the harness's actual observations.

Admission: source inspection supports bounded timeout and capacity recovery, rather than the old historical claim that no stalled-handshake fixture exists.
The current test creates a real QUIC connection without HTTP/3 settings and exercises a capacity-one listener.
However, the stronger hypothesis that every cleanup decision has direct evidence is not supported: default reconnect grace is zero, no membership is opened, and neither admission test records the boolean passed to `connection_closed`.
Changing that argument from `false` to `true` need not fail those assertions.
Execution of the existing tests remains pending, not inferred from the reconciliation record.

Browser: the current factory API and harness independently confirm the reported evidence gap.
The test's `transportSessionCount` increments on successful factory opens, not on observed server connection release.
Closed-session rejection and opening another session do not prove that the previous physical connection closed.
Server-initiated shutdown can clean up a connection even when client-side close is broken.
No current leak was demonstrated.

## Deliverables and Commits

- This completed report, including two proposed inventory rows, executable check requests, and explicit evidence limits.
- No code, tests, browser fixtures, generated bindings, manifests, lockfiles, shared APIs, shared inventory, or other reports changed by this delegate.
- No new artifacts or commits created by this delegate; repository-wide pre-existing changes and ignored artifacts were not enumerated because command execution was prohibited.
- No changeset is needed for this report-only change; user-facing behavior and APIs are unchanged.

## Validation Evidence

Observed checks: direct reads of the owners, precise contracts, test bodies, generated session close, and browser runner described below.
The absolute sibling-worktree text search returned no matches; this was not treated as proof of absence, and direct file reads supplied the evidence.
An initial read beyond the end of the server file returned empty; the existing test module was subsequently read directly.
No compile, lint, Rust test, browser test, policy check, or documentation command has run in this batch.
The immediate post-edit `get_errors` check on this report returned "No errors found".
This is editor-only evidence, not Rust execution, Markdown link verification, or platform validation.

Required first coordinator check: run the assigned `process: rs17-transport-check` task with these focused commands, sequentially, from `/workspaces/FluidFramework-rust-service-iteration-0017-transport/rust-service`:

```bash
cargo test -p sea-webtransport-server --all-features server::tests::failed_admissions_release_capacity_and_preserve_listener -- --exact
cargo test -p sea-webtransport-server --all-features server::tests::shutdown_cancels_pending_admission_without_reconnect_grace -- --exact
cargo test -p sea-webtransport-server --all-features server::tests::idle_stream_outlives_operation_deadline -- --exact
cargo test -p sea-webtransport-server --all-features server::tests::partial_frame_expires_after_operation_deadline -- --exact
```

Each exact filter must run one test, not zero.
If the existing runner uses `server::tests` instead, require the log to name all four tests and preserve their individual outcomes.
The two paused-time tests distinguish established idle reads from partial-frame deadlines; they do not substitute for real QUIC admission.
No new runner or task configuration is authorized to this delegate.

Expected fresh evidence directory: `/workspaces/FluidFramework-rust-service-iteration-0017-transport/rust-service/target/iteration-0017-evidence/<label>-<unique-run-id>/`.
Actual run directory, run ID, PID, commands executed, environment, tool versions, timestamps, guard outcomes, completion, exit status, and test outcomes: unknown; no run was launched or accepted here.
Expected files per invocation: two nonempty files, `result.json` and `output.log`.
Existence, nonzero size, JSON parse, unique identity, expected/actual branch and HEAD, absolute cwd, before/after status, worktree-local Cargo target, output-path agreement, and log/result consistency are all pending coordinator verification.
Require guards for the assigned branch and kickoff, with any coordinator-approved later HEAD recorded explicitly.
Verify manifests and lockfiles remain unchanged; this delegate's no-edit statement is not a Git diff check.
No prior probe, foreign generated artifact, terminal history, or historical passing run is accepted as fresh validation.

The coordinator also owns documentation/link checks, scoped policy, Phase 2 record validation, and the charter's canonical integration gates.
This report-only batch adds no Rust/build inputs and does not independently trigger a root build.
The iteration's existing integration obligations remain unchanged.

## Behavioral Contracts and Test Layers

### Ranked Boundaries and Proposed Inventory Rows

These rows are for coordinator reconciliation, not edits to the shared inventory.
Both dispositions remain deferred for their stated unresolved portions; no blanket `already adequate` claim is made.

| Boundary | Owner and consumers | Risk evidence | Relied-upon contract | Existing test layers | Finding and discriminating check | Disposition | Changed contract/tests | Validation | Revisit trigger |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1. `sea-webtransport-server/connection-establishment-timeout` | `WebTransportServer::serve_until_shutdown`, `cleanup_services`, and `SeaConnectionService::connection_closed`; native/browser clients competing for listener capacity and connection-scoped dispatchers | The admission path holds one capacity slot across asynchronous QUIC, path, and acceptance stages; the current recent-fix tests exercise a real stall, abort, and rejection. | [Server README](../../../../crates/sea-webtransport-server/README.md): "Each admitted QUIC connection has one `operation_timeout` deadline for the complete WebTransport handshake, including path acceptance or rejection." "Failed, rejected, and timed-out admissions release their capacity slot and connection-scoped service without stopping the listener or applying reconnect grace." Pending admissions are subject to immediate or bounded-drain shutdown. | Focused owning-crate tests using real QUIC; paused-time byte-stream tests for the distinct post-admission deadline policy. No shared conformance substitute is needed. | [Owning code and tests](../../../../crates/sea-webtransport-server/src/server.rs): one `timeout_at` wraps incoming/path/accept; unsuccessful establishment calls `connection_closed(false)`, records cleanup, returns `Ok(())`, and completion removes the service/slot. `failed_admissions_release_capacity_and_preserve_listener` would fail if the stalled deadline, slot release, cleanup accounting, or listener continuation regressed: capacity is one, closure is bounded, three failed admissions precede a successful connection, and cleanup totals are 3 then 4. `shutdown_cancels_pending_admission_without_reconnect_grace` checks owned/cancelled/cleanup counts for Immediate and zero-duration Drain. Neither test observes the cleanup boolean; a test-local service recording each `connection_closed` argument is the smallest direct discriminator for that remaining policy decision. | Deferred: existing capacity/listener evidence is well localized but execution is pending; no-grace argument evidence remains incomplete. | None; current contract retained. | Four exact checks requested above; none executed here. Source confirms a single deadline, but individual delayed path-rejection/acceptance subphases are not independently exercised. | Coordinator runs the existing filters now. Transport owner adds a narrowly scoped service observer in a subsequent validated batch if accepting full no-grace coverage; changing only either cleanup `false` argument must fail that test. Revisit delayed subphase fixtures if handshake staging changes. |
| 2. `sea-webtransport/browser-disconnect-resource-release` | `BrowserTransport::disconnect` and `Drop`; `SessionClient<BrowserTransport>`, generated neutral session owners, and server admission capacity | [Current browser implementation](../../../../crates/sea-webtransport/src/transport/browser.rs) closes in both paths, but [browser flow](../../../../tests/webtransport-browser/browser-test.mjs) only counts factory opens, closes logical memberships, rejects closed-session calls, and opens fresh sessions. [Runner shutdown](../../../../tests/webtransport-browser/run-headless.mjs) is server-initiated and can mask missing client release. | [Transport lifecycle README](../../../../crates/sea-webtransport/README.md#lifecycle-and-ownership): "Explicit browser disconnect closes the underlying WebTransport session." [ClientTransport](../../../../crates/sea-webtransport/src/transport/mod.rs) promises "Disconnects the underlying connection." Final-owner drop currently also closes, but the trait has no independent generic Drop promise; keep this browser ownership requirement distinct rather than generalizing it to every transport. | Generated/browser composition exists for neutral session close/reopen and shutdown; no inspected test isolates either physical release decision. Native conformance cannot instantiate the wasm32 browser implementation. | Owning decisions are the two separate `self.transport.close()` calls. Required discriminator: a real-browser test invokes explicit disconnect while retaining the Rust transport owner, observes bounded server cleanup or recovered capacity before drop, then a separate case drops the final owner without explicit disconnect and observes the same resource release. Removing only either close call must fail its corresponding case; page teardown, session-wrapper free, server shutdown, or inactivity expiry must not satisfy it. Existing close/reopen assertions could still pass and are not adequate evidence. | Deferred: platform proof and approved test entry point unavailable; no demonstrated product defect. | None; no WASM or browser fixture edits authorized. | Source inspection only; browser prerequisite/version/fresh generated-output checks and platform run not performed. | Coordinator approves the minimal test-only WASM/browser ownership control and bounded server observation, then transport/WASM owners implement and validate together. Retain the [known issue](../../../../KNOWN_ISSUES.md#browser-disconnect-resource-release-lacks-focused-evidence) until both paths are independently proved. |

### Coverage and Repair Decision

No production crate changed, so no new product contract or regression is claimed.
The current admission tests directly localize capacity, timeout, listener continuation, and cleanup-count decisions; duplicating them would add no useful evidence.
The no-grace policy still lacks a direct assertion: using `BuiltInSeaHost` with no admitted author and zero default grace makes elapsed shutdown time insufficient to distinguish the argument.
A recording service is practical, but the current service trait requires several dispatch methods; introducing that fixture is deferred to an executable edit/test batch rather than treating an unrun fixture as a repair.
The coordinator can authorize that one local test cluster without changing shared semantics.

The browser gap cannot be repaired by simply adding another neutral-session reopen assertion.
The inspected [generated session](../../../../crates/sea-wasm/src/bindings.rs) erases its concrete stack behind a shared session adapter, and `SeaSession::close` invokes membership close.
It does not give this harness independent controls for retaining a concrete transport after explicit disconnect and then dropping its final Rust owner.
Do not restore the retired generic JavaScript transport-injection API or widen production APIs for this audit.
The smallest approval request is a test-only concrete browser-transport owner with connect, explicit disconnect, and deterministic final-owner release, plus a bounded per-case server cleanup/capacity observation.
Exact fixture placement and any feature/manifest changes require coordinator ownership approval before editing.
No such approval is presumed or blocking this bounded report-only return.

### Lower-Ranked Candidates

- Browser retained-read cancellation: the current README states the promise and `BrowserStreamState::pending_receive` retains the JavaScript promise. No new cancellation incident was supplied; it ranks below the demonstrated physical-release evidence gap. Not audited for adequacy. Transport owner should revisit if pump/read ownership changes or bytes are lost after waiter cancellation.
- Generic fallible disconnect state: the current known issue explicitly requires a consumer-driven recovery contract choice. This batch identified no such requirement and leaves error propagation, logical admission, and correlation cleanup semantics unchanged. Coordinator owns the choice when a fallible transport consumer needs it.
- Snapshot registration cleanup and WebSocket owner/child lifecycle: current guides describe distinct registration leases and socket-group cleanup, but no new change or incident supplied a stronger incremental trigger than admission and browser release. Not audited. Their transport owners should revisit on lease/group ownership changes or cleanup failures.
- Signals delivery is assigned to another workstream; storage recovery, authentication, retention, production qualification, CI feeds, and Fluid integration remain outside this audit.

## Notable Events

Record an event when a hypothesis is falsified, three similar attempts fail, substantial effort is lost, human intervention is needed, a workaround appears, or a reusable technique is discovered.

| Type | Attempt or event | Evidence | Impact | Resolution or state | Reusable lesson |
| --- | --- | --- | --- | --- | --- |
| Execution restriction | User reported unavailable delegate task access and authorized file-only audit. | Latest assignment; no task launched here. | No fresh executable results or checkout guards available. | Return checks to coordinator; no terminal workaround attempted. | Separate supplied kickoff/probe provenance from observed execution metadata. |
| Evidence limit | Rechecked the no-grace assertion in the current admission test. | Default zero reconnect grace, no admitted membership, cleanup counts only. | Test name is stronger than its decision-discriminating assertion. | Preserve the implementation; record a test-local service observer as follow-up. | Ask whether changing only the policy argument would fail the test. |
| Platform boundary | Current browser close/reopen and shutdown checks do not isolate physical release. | Factory-open counter, neutral membership close, server-initiated drain. | Broad passing tests cannot close this evidence gap. | Request minimal test-only ownership controls before fixture work. | Keep explicit disconnect alive long enough that drop cannot mask it. |
| File-tool limitation | Sibling-worktree search and an out-of-range read returned empty. | Subsequent direct reads found the existing server tests. | No absence claim or command workaround was made. | Evidence taken from direct current-file reads. | Empty search output outside the loaded root is not a coverage inventory. |

## Contract and Integration Friction

Transport owns physical WebTransport close; generated session ownership belongs to `sea-wasm` and `sea-typescript`.
Exposing independent transport lifetime controls crosses that boundary and needs coordinator approval even if the consuming fixture sits in the owned browser directory.
The server's existing `MeasurementHandle` provides a native observation primitive, but a browser-accessible fixture bridge or capacity-one host must be approved and attributable to the same test run.
No global metrics endpoint or production API is proposed.
Generic disconnect error-state semantics are deliberately not selected or changed.

## Human Interventions

The user constrained this batch to file tools after the reported task-access failure, reserved isolated execution for the coordinator, prohibited terminal/Git/agent workarounds, and withheld WASM/browser-fixture authorization.
Those constraints supersede the older instruction to stop immediately after a failed delegate task probe.
No further approval was obtained, and no ownership or semantic expansion occurred.

## Measurements

Audit scope: two ranked boundaries, zero product repairs, one report edited.
Performance, binary size, dependency size, and throughput: not applicable to this report-only change and not measured.
Actual Rust, Node, pnpm, wasm-bindgen, and browser versions: unknown; historical versions are not reused as current environment proof.
Command duration, overlap, and elapsed audit time: unknown.
No throughput improvement or upstream terminal fix is claimed.

## Proposed Decisions

No shared semantic or API decision is proposed and no decision record was created.
Accept the bounded report-only result with pending validation and explicit evidence deferrals.
Before closing the browser item, approve only the test-only lifetime controls and server observation described above, with exact paths and owners; otherwise keep it deferred.
Do not choose generic disconnect failure semantics without a consumer requirement.

## Candidate Skills and Process Changes

No new skill or process file is proposed.
Existing quality guidance already requires owning-decision discrimination and fresh platform evidence.
The concrete lessons are to distinguish factory-open counts from connection cleanup, and cleanup-count assertions from cleanup-policy arguments.

## Remaining Work and Risks

1. Coordinator: verify assigned checkout identity and status, run `process: rs17-transport-check`, and reconcile fresh per-run artifacts with the four required test outcomes.
2. Coordinator: run documentation/link and report/Phase 2 checks, preserve the charter's integration gates, and reconcile these two rows into the shared inventory without claiming completed platform proof.
3. Transport owner: in a subsequent executable batch, consider the focused service-observer test for no-grace cleanup on failed admission and pending-admission shutdown. Existing tests alone do not justify that narrower policy claim.
4. Coordinator and WASM/browser owners: decide whether to approve the minimal explicit-disconnect/final-drop fixture. Until then, retain the browser resource-release deferral; native tests and broad browser composition are not substitutes.
5. Coordinator: account for any pre-existing working-tree changes and generated artifacts before integration. This delegate leaves only its report edit and performed no staging, commits, cleanup, or artifact generation.

Confidence is high in the documented source-level distinctions, but executable behavior and platform resource release remain unverified in this batch.
Stop here at the two-boundary budget; no next iteration or additional repair slice is initiated.

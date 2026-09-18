# Iteration 0004: native-client-lifecycle Report

Status: complete
Branch: `rust-service-iteration-0004-native-client-lifecycle`
Worktree: `/workspaces/FluidFramework-rust-service-iteration-0004-native-client-lifecycle`
Base commit: `30c4a06d7b456e135e046905553dd23d14326a56` (actual iteration kickoff); coordinator-provided prerequisites `b5095e2ed30263e7819db38f6e0a7902695de762` and `2dae3d2aa0b18a5e144b0acbe134fd76c4d69529`
Final commit: implementation `23e09990a626e53be25d1310e5545ba4ee4f763e`; this report is committed separately after validation
Agent or owner: GitHub Copilot native-client-lifecycle implementation agent
Model and tool version: GitHub Copilot; tool version unknown
Instruction source: `rust-service/iterations/0004/phase-2/instructions/native-client-lifecycle.md` at `30c4a06d7b456e135e046905553dd23d14326a56`
Session or transcript reference: none
Started and finished: 2026-09-12T17:52:20Z; finish time unknown

## Outcome

Implemented an explicit transport-neutral native client lifecycle over FSP4 requests and responses. The client exposes disconnected, connecting, connected, submitting, recovering, ambiguous, and closed states; retains one stable pending submission; requires explicit ambiguity replay; and leaves fresh-session regeneration or abandonment to the caller. Twelve deterministic unit tests and a two-test process target pass. Confidence is high for the modeled single-pending-operation lifecycle and its disconnect boundaries.

The transition contract is:

- `Disconnected -> Connecting -> Connected` only through a caller-supplied fresh session and `Acknowledged(SessionOpened)`.
- `Connected -> Submitting -> Connected` only through `Response::Submitted`, whose `Accepted` and `Duplicate` dispositions are both authoritative Fluid acknowledgements.
- Transport loss or cancellation while submitting/recovering enters `Ambiguous`; neither action emits or retries a request.
- `Ambiguous -> Recovering -> Connected` occurs only when the caller explicitly replays the unchanged pending request and receives `Submitted`.
- A rejected submission returns to `Disconnected` with pending work retained. After a fresh-session reconnect, the caller may regenerate it with a fresh submission identity and local sequence number 1, or abandon it.
- Shutdown enters `Closed` and returns unresolved pending work. It is a local lifecycle shutdown, not an FSP4 service `Shutdown` command.

## Hypothesis Results

Supported: lifecycle policy remains transport-neutral and has no hidden retry. `NativeClient` only constructs `Request` values and consumes `Response` values; transport execution is caller-owned.

Supported with a protocol limitation: deterministic disconnect-before-commit and disconnect-after-commit traces are indistinguishable at disconnect and both enter `Ambiguous`. Explicit replay resolves the former as `Accepted` and the latter as `Duplicate` after service recovery.

Falsified for a still-running service with unresolved storage ambiguity: FSP4 has no request that invokes the sequencer's internal `resolve_ambiguous`. Such a service returns `RecoveryRequired`; process/service recovery is currently required before replay can resolve the stable submission identity.

## Deliverables and Commits

- `23e09990a626e53be25d1310e5545ba4ee4f763e` (`feat(rust-service): add native client lifecycle`): lifecycle API, protocol/dev dependencies, 12 unit tests, and process-isolated disconnect/replay tests.
- Report completion commit: this report-only commit.

API example:

```rust
let request = client.submit(submission_id, 1, reference, payload)?;
// The caller sends `request` once. No client method performs I/O or retry.
client.disconnected();
let replay = client.recover_ambiguous()?; // explicit caller decision
let event = client.handle_response(send(replay)?)?;
```

Forbidden transitions return `LifecycleError::InvalidTransition`; reused session identities return `SessionNotFresh`; regeneration with the old submission identity returns `SubmissionIdentityNotFresh`; and non-submission acknowledgements cannot commit pending work.

## Validation Evidence

Validation used an exact `rsync` copy of `rust-service/` and a separate `CARGO_TARGET_DIR`; the assigned root `rust-service/Cargo.toml` and `rust-service/Cargo.lock` remained unchanged.

- `cargo test --manifest-path "$copy/Cargo.toml" -p snapshotted-stream-client`: passed, 12 unit tests plus 2 process tests, 0 failed; doc tests 0.
- `cargo test --manifest-path "$copy/Cargo.toml" -p snapshotted-stream-client --test process_lifecycle -- --nocapture`: passed, 2 passed, 0 failed in 0.02s. `disconnect_boundaries_resolve_only_after_explicit_replay` observed pre-commit replay as `Accepted` and post-commit replay after process restart as `Duplicate`.
- `cargo clippy --manifest-path "$copy/Cargo.toml" -p snapshotted-stream-client --all-targets -- -D warnings`: passed with 0 diagnostics.
- `cargo fmt --manifest-path rust-service/Cargo.toml -p snapshotted-stream-client -- --check`: passed.
- `git diff --check`: passed.
- `git diff --name-only -- rust-service/Cargo.toml rust-service/Cargo.lock`: no output.

## Notable Events

Record an event when a hypothesis is falsified, three similar attempts fail, substantial effort is lost, human intervention is needed, a workaround appears, or a reusable technique is discovered.

| Type | Attempt or event | Evidence | Impact | Resolution or state | Reusable lesson |
| --- | --- | --- | --- | --- | --- |
| Dependency | The generated iteration instruction named source `a577eda...`, while the actual kickoff and worktree base were `30c4a06...`; coordinator prerequisites then advanced the tip to `2dae3d2...`. | Branch/log/status checks before edits. | Prevented incorrect base reporting and accidental prerequisite ownership. | Report records actual kickoff and both prerequisite commits. | Treat generated source metadata and actual worktree kickoff as separate provenance fields. |
| Protocol limitation | Tested explicit replay against the sequencer/service contract. | A live sequencer in recovery-required state cannot resolve through FSP4; only service recovery exposes `Accepted`/`Duplicate` replay resolution. | Ambiguity resolution currently depends on service recovery. | Preserved explicit `SubmissionUncertain(RecoveryRequired)` and documented the limitation rather than adding hidden retry. | Add a protocol recovery operation only through a shared decision, not in a client workstream. |
| Validation setup | Two validation wrappers failed before meaningful checks: one assumed a `python` executable, and one ran from the wrong checkout; a copied-target formatting command also traversed registry sources. | Exit 127, observed `## main`, and generated-source rustfmt noise. | Delayed validation but did not alter assigned files. | Used literal absolute checkout commands, Node/sed only in disposable copies, and target directories outside source copies. | Every delegated multi-worktree command should print absolute checkout identity and keep build output outside copied source trees. |

## Contract and Integration Friction

The client depends on the coordinator-provided FSP4 protocol and native service. `Response::Submitted`, not `AppendReceipt` or generic `Acknowledged`, is the only submission success signal. FSP4 lacks a client-visible operation for a live service to resolve its internal ambiguous append; replay resolution therefore requires service recovery today. The API intentionally supports one pending submission, does not persist lifecycle state across client-process loss, and does not own transport reconnection. The pre-existing `CounterClient` remains for source compatibility with the counter example.

## Human Interventions

The user supplied the actual kickoff `30c4a06d7b456e135e046905553dd23d14326a56`, expected prerequisite tip `2dae3d2aa0b18a5e144b0acbe134fd76c4d69529`, ownership limits, and the requirement to use an exact disposable copy. No mid-implementation semantic intervention was required.

## Measurements

- Implementation commit: 3 files, 852 insertions, 1 deletion.
- Test count: 14 behavior tests total (12 unit, 2 process target), 0 failures; 0 doc tests.
- Process trace: 2 tests completed in 0.02s in the observed run.
- Runtime dependency added: `fluid-service-protocol`; test-only dependencies: `fluid-native-service`, `tokio`.
- Performance/throughput and binary-size measurements: not applicable to this lifecycle-policy workstream.
- Environment: Debian GNU/Linux 13 dev container; exact elapsed effort and token use unknown.

## Proposed Decisions

No shared decision is proposed. A future FSP4 ambiguity-resolution request would change the shared protocol and must be handled in a separate decision record.

## Candidate Skills and Process Changes

Candidate coordination guidance: validation in a multi-worktree Rust iteration should begin every delegated command with a literal absolute `cd` or use absolute `git -C`, print branch/path, avoid assuming `python`, and place `CARGO_TARGET_DIR` outside an exact copied source tree before running formatting.

## Remaining Work and Risks

- Complete for the assigned client lifecycle scope; no intentional uncommitted implementation artifacts remain.
- Integration must include the prerequisite protocol/service commits before `23e09990a626e53be25d1310e5545ba4ee4f763e`.
- The integration workstream should rerun workspace tests after registering/integrating the prerequisite crates according to its root manifest policy.
- Remaining limitation: ambiguity replay against a still-running `RecoveryRequired` service cannot resolve until service recovery because FSP4 exposes no resolution request.
- Remaining limitation: lifecycle/session/pending state is in memory and supports one pending submission; durable client restart and multi-operation pipelining are outside this workstream.

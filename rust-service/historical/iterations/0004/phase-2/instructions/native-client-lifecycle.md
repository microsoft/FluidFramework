# Iteration 0004: native-client-lifecycle Instructions

Status: planned
Branch: `rust-service-iteration-0004-native-client-lifecycle`
Iteration source commit: `a577eda313ebe68f6e8ba3e33e99ea0822a50d9a`
Owner: GitHub Copilot native-client-lifecycle coding agent
Report: `rust-service/iterations/0004/phase-2/native-client-lifecycle.md`

## Assignment

Replace the counter-only façade with an explicit service-client state machine for connect, recover, pending submissions, ambiguity, disconnect, fresh-session reconnect, and caller-controlled regeneration or abandonment. Hypothesis: lifecycle policy can remain transport-neutral and avoid hidden retry. Disprove with deterministic disconnect-before-ack and disconnect-after-commit traces where the API cannot distinguish safe regeneration from replay resolution. Offline-first state, automatic merging, and a TypeScript driver are excluded.

## Ownership

- Wave 2 transport integration waits for the service protocol; state-machine design may begin against Decision 0004.
- Writable: `rust-service/crates/client/` and `rust-service/iterations/0004/phase-2/native-client-lifecycle.md`.
- Depend on transport-neutral client/protocol traits. Unix and WebTransport adapters are fixtures, not lifecycle owners.
- Do not change kernel/sequencer semantics, add automatic reconnect/resubmission, or commit root manifest/lockfile changes.

## Expected Evidence

- Document states/transitions for disconnected, connecting, recovering, connected, ambiguous, and closed behavior, including cancellation and shutdown.
- Test clean recovery, invalid/stale submission, disconnect before/after commit, replay resolution, fresh-session reconnect, regenerated stable identity, duplicate acknowledgement, and caller abandonment.
- Report API examples, forbidden transitions, retry policy, process-backed traces, failures, dependencies, and commits.

## Validation

Print checkout identity and prerequisite commit. Run focused client tests, strict Clippy, `cargo fmt --all -- --check`, and a bounded process-backed lifecycle trace with an isolated target directory. If dependencies require resolution, use a disposable exact copy. Verify no assigned-worktree root manifest/lockfile diff. Integration runs workspace checks.

## Escalation and Stopping Conditions

Stop if correctness requires hidden retries, comparing opaque positions, transport-specific states in the public lifecycle, or treating `AppendReceipt` as Fluid acceptance. Preserve the smallest ambiguity trace and escalate shared API proposals.

## Reporting Requirements

Use the generated workstream report. Record failed approaches, substantial effort sinks, human interventions, undocumented workarounds, cross-workstream dependencies, and candidate reusable skills while work occurs.

# Iteration 0004: service-assembly Instructions

Status: planned
Branch: `rust-service-iteration-0004-service-assembly`
Iteration source commit: `a577eda313ebe68f6e8ba3e33e99ea0822a50d9a`
Owner: GitHub Copilot service-assembly coding agent
Report: `rust-service/iterations/0004/phase-2/service-assembly.md`

## Assignment

Build the first runnable single-host native service from the durable stream, file-lock fence, and authoritative sequencer. Define a bounded, versioned, transport-neutral byte protocol for document/session operations, protocol acknowledgement, finite reads, snapshots, opaque position tokens, and stable errors. Hypothesis: these parts compose without a kernel API change. Disprove it with a two-process create/open, submit, snapshot, stop/kill, restart, recover, and stale-session trace. Multi-host routing, authentication, blobs, retention, and full Fluid drivers are excluded.

## Ownership

- Writable: new `rust-service/crates/protocol/`, new `rust-service/crates/service/`, a new runnable package under `rust-service/examples/`, and `rust-service/iterations/0004/phase-2/service-assembly.md`.
- Read-only: core, conformance, sequencer, durable-log, network wrapper, decisions, charter, and other workstreams.
- This Wave 1 workstream produces the protocol prerequisite for WebTransport and client integration.
- Do not commit root `rust-service/Cargo.toml` or `Cargo.lock`; validate root registration in a disposable exact copy and report the required integration patch.

## Expected Evidence

- Runnable native service with deterministic configuration, bounded requests, graceful shutdown, restart, and at least two isolated documents.
- Protocol fixture bytes and tests for valid/invalid submissions, snapshot/replay, stale fence/session, malformed/oversized frames, clean stop, and abrupt process death.
- Record framing bytes, startup/recovery observations, dependency requests, rejected designs, exact tests, and coherent commits in the report.

## Validation

Print absolute checkout, branch, kickoff commit, and clean status. In a disposable exact copy with temporary workspace registration, run focused protocol/service/example tests, strict Clippy, `cargo fmt --all -- --check`, and the two-process smoke trace with a workstream-specific `CARGO_TARGET_DIR`. Verify `git diff --exit-code a577eda313ebe68f6e8ba3e33e99ea0822a50d9a -- rust-service/Cargo.toml rust-service/Cargo.lock` in the assigned worktree. Integration owns workspace-wide commands.

## Escalation and Stopping Conditions

Stop and preserve a minimized trace before changing kernel semantics, introducing hidden retries, conflating storage receipts with protocol acceptance, or claiming multi-host safety. Escalate protocol changes after any dependent workstream has started. A protocol-only result with a documented assembly blocker remains useful.

## Reporting Requirements

Use the generated workstream report. Record failed approaches, substantial effort sinks, human interventions, undocumented workarounds, cross-workstream dependencies, and candidate reusable skills while work occurs.

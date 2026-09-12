# Iteration 0003: process-crash-recovery Instructions

Status: planned
Branch: `rust-service-iteration-0003-process-crash-recovery`
Iteration source commit: `baa5900841161074a733f60ee424c20ed8d8c70f`
Owner: GitHub Copilot process-crash-recovery agent
Report: `rust-service/iterations/0003/phase-2/process-crash-recovery.md`

## Assignment

Strengthen durable append and snapshot evidence with real child-process termination and reopen tests. Hypothesis: `SDLOG002` and the atomic snapshot protocol recover to a valid acknowledged prefix or old/new snapshot lineage member after abrupt process termination at externally observable boundaries. Disprove it with one kill/reopen trace that loses acknowledged data, accepts a corrupt complete artifact, or recovers an impossible lineage. Preserve existing framing and semantics; do not claim hardware power-loss evidence.

## Ownership

- Writable: `rust-service/crates/spikes/durable-log/` and `rust-service/iterations/0003/phase-2/process-crash-recovery.md`.
- Read-only: core, conformance, Fluid sequencing, network, decisions, charter, and all other workstream paths.
- Build on integrated durable snapshots and expanded conformance. Crate-local test helpers/binaries and manifest changes are allowed.
- Do not commit `rust-service/Cargo.lock`; report required integration regeneration. Do not add undocumented recovery or repair heuristics.

## Expected Evidence

- A deterministic parent/child harness using explicit readiness/control messages and bounded timeouts, never sleep-only synchronization.
- Append and snapshot termination traces before/after write, file sync, rename, directory sync, and acknowledgment where externally controllable.
- Reopen assertions for acknowledged receipts, valid prefix, old/new snapshot lineage, and replay position, retaining corruption and injected-fault suites.
- Direct expanded shared-conformance evidence plus exact filesystem/environment limitations and procedure measurements.
- A completed report with commits, outcomes, failed approaches, dependencies, measurements, and candidate process improvements.

## Validation

- Print absolute checkout, branch, kickoff commit, and clean status before editing.
- `cargo test -p snapshotted-stream-durable-log-spike --all-features -- --nocapture`
- `cargo clippy -p snapshotted-stream-durable-log-spike --all-targets --all-features -- -D warnings`
- `cargo fmt --all -- --check`
- `git diff --exit-code baa5900841161074a733f60ee424c20ed8d8c70f -- rust-service/Cargo.lock`
- Use a workstream-specific `CARGO_TARGET_DIR`; retain exact test names/counts and reject output naming another checkout. Workspace validation belongs to integration.

## Escalation and Stopping Conditions

Stop on flaky timing dependence, acknowledged-data loss, invalid lineage recovery, or a required shared semantic change. Preserve the smallest reproducible on-disk artifact and command. Distinguish process termination, kernel cache behavior, filesystem guarantees, and power loss rather than broadening claims or repairing bytes heuristically.

## Reporting Requirements

Use the generated workstream report. Record failed approaches, substantial effort sinks, human interventions, undocumented workarounds, cross-workstream dependencies, and candidate reusable skills while work occurs.

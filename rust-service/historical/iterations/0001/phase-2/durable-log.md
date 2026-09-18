# Iteration 0001: durable-log Report

Status: complete
Branch: `rust-service-iteration-0001-durable-log`
Worktree: `/workspaces/FluidFramework-rust-service-iteration-0001-durable-log`
Base commit: `bd21af608ff051906d9449cea33704d685b0251b`
Final commit: `b8a77b73946f` (implementation; followed by a report-only completion commit)
Agent or owner: GitHub Copilot durable-log spike agent
Model and tool version: GitHub Copilot; model version unknown; Rust 1.98.1; Cargo 1.98.1
Instruction source: [`instructions/durable-log.md`](instructions/durable-log.md) at `bd21af608ff051906d9449cea33704d685b0251b`
Session or transcript reference: none
Started and finished: started 2026-09-12 after host reboot recovery (exact time unknown); finished 2026-09-12 (exact time unknown)

## Outcome

Implemented a focused single-process durable append log with a synced generation header, stable generation/ordinal positions, independent `[length, CRC32, payload]` records, `sync_data` before successful append receipts, clean reopen, incomplete-tail truncation, and complete-record checksum rejection. Five focused tests pass. Confidence is high for the demonstrated append/read and recovery behavior, but this is a spike rather than a complete implementation: it has no snapshot store, process fencing, directory-entry durability, fault injection inside write/sync, or proof that a corrupted length cannot resemble an incomplete tail.

## Hypothesis Results

Supported within the spike scope. A checksummed, length-framed log using stable generation/ordinal positions and `sync_data` before acknowledgment satisfies the existing append, receipt, position, read, and classified-error contracts without a shared API change. `durable_receipt_and_reopen_preserve_records_and_positions`, `incomplete_tail_is_truncated_to_last_valid_record`, `complete_record_with_invalid_checksum_is_rejected`, and `concurrent_appends_are_contiguous_and_precedence_is_preserved` are the discriminating evidence. Snapshot publication and full conformance remain untested because this focused crate intentionally does not implement `SnapshotStore`.

## Deliverables and Commits

- `b8a77b73946f` - checksummed sync-before-ack append log, stable persisted generation/ordinal positions, finite readers, incomplete-tail truncation, checksum rejection, concurrency/precedence tests, and deterministic persisted-size evidence.
- Report-only completion commit follows the implementation commit and contains no implementation changes.

## Validation Evidence

- `cargo fmt --all -- --check` in the assigned worktree: exit 0 after applying rustfmt.
- `cargo clippy -p snapshotted-stream-durable-log-spike --all-targets --all-features -- -D warnings` in a checkout-marked exact disposable copy: exit 0 with no diagnostics.
- `cargo test -p snapshotted-stream-durable-log-spike --all-features -- --nocapture` in the same disposable-copy pattern: exit 0; 5 unit tests passed, 0 failed, 0 ignored; 0 doc tests. Tests were `complete_record_with_invalid_checksum_is_rejected`, `durable_receipt_and_reopen_preserve_records_and_positions`, `incomplete_tail_is_truncated_to_last_valid_record`, `concurrent_appends_are_contiguous_and_precedence_is_preserved`, and `persisted_size_matches_checksumming_for_10000_records`.
- `git diff --check`: exit 0 before the implementation commit.
- `git diff --exit-code -- rust-service/Cargo.lock`: exit 0 before the implementation commit after removing verifier-generated dependency entries.
- Workspace tests and shared lockfile regeneration are reserved for integration.

## Notable Events

Record an event when a hypothesis is falsified, three similar attempts fail, substantial effort is lost, human intervention is needed, a workaround appears, or a reusable technique is discovered.

| Type | Attempt or event | Evidence | Impact | Resolution or state | Reusable lesson |
| --- | --- | --- | --- | --- | --- |
| Recovery | The host rebooted before durable-log implementation began. | Worktree recovery found a clean branch at kickoff `bd21af608ff` with no commits or running Cargo process. | No implementation or evidence was lost; elapsed time is unknown. | Resumed from the committed instruction and recorded actual provenance before editing. | Clean worktrees and committed instructions make interrupted workstreams recoverable without reconstructing unsupported state. |
| Coordination | The pre-registered slash branch cannot exist because branch `rust-service` occupies that ref namespace; the instruction also records the foundation rather than kickoff commit as its base. | Git worktree inspection found actual branch `rust-service-iteration-0001-durable-log` at clean kickoff `bd21af608ff`. | Recorded provenance differs from the generated instruction fields but isolation is preserved. | Use the actual branch and kickoff base in this report without rewriting the committed instruction. | Reports must record observed Git provenance when repository ref constraints require a naming substitution. |
| Validation tooling | A delegated disposable-copy validation reported successful tests but mutated the assigned shared `Cargo.lock`. | The assigned lockfile gained only `cfg-if`, `crc32fast`, and this crate's resolved dependency list; source and report edits were otherwise intact. | The workstream's read-only lockfile invariant was temporarily violated. | Removed only the generated lockfile entries, verified the crate in a checkout-marked disposable copy, and left lockfile regeneration to integration. | Multi-worktree validation must include an absolute checkout marker and verify the assigned lockfile after every delegated Cargo command. |

## Contract and Integration Friction

The existing append receipt can express this spike: any write or sync error after append begins is classified `Ambiguous`, and only a completed `sync_data` returns `Durability::Durable`. Opaque positions also suffice for reopen and strict-after reads. Full shared conformance is not applicable because its generic runner requires both `AppendStream` and `SnapshotStore`; the spike intentionally postpones snapshots until recovery evidence exists. Integration must regenerate `Cargo.lock` for `crc32fast` and `cfg-if`, then rerun package and workspace checks. No shared trait change is proposed by this workstream.

## Human Interventions

The coordinator supplied the actual hyphenated branch and kickoff commit after the generated slash branch proved impossible. The user requested Phase 2 parallelization; compression and Fluid sequencing then ran concurrently in separate worktrees while this durable spike remained locally owned. No human semantic correction was required.

## Measurements

- Persisted bytes: 10,000 records of 64 deterministic bytes produce 760,024 bytes: a 24-byte generation header plus 10,000 records containing 8-byte length, 4-byte CRC32, and 64-byte payload. Clean reopen of all 10,000 records is asserted in the same test.
- Source size: 443 lines in `src/lib.rs`; 20 lines in `Cargo.toml`. The implementation commit changed 447 insertions and 4 deletions across the two files.
- Direct dependencies: 6 runtime (`async-trait`, `bytes`, `crc32fast`, `futures-util`, local core, `thiserror`) and 1 development (`tokio`). The new external dependency is `crc32fast`; disposable resolution also requires `cfg-if`.
- Format and acknowledgment policy: 8-byte magic, 16-byte generation, then independent 12-byte record headers and payloads. Header creation and successful appends call `sync_data`; parent-directory sync is not performed.
- Environment: source commit `b8a77b73946f`; Rust 1.98.1; Cargo 1.98.1; dev profile; all features; Debian GNU/Linux 13 container; Linux 6.8.0-1064-azure x86_64; AMD EPYC 7763, 32 logical CPUs; approximately 128,808 MiB memory; `/dev/loop5` workspace filesystem, underlying device unknown.
- Throughput, latency distribution, recovery time distribution, and peak memory were not measured. The per-record `sync_data` policy intentionally prioritizes semantic evidence over throughput. Warmup, repetitions, token usage, and elapsed effort are unknown.

## Proposed Decisions

No shared decision is proposed. The existing receipt, position, and error contracts were sufficient for the scoped append/read spike.

## Candidate Skills and Process Changes

Require checkout identity markers and an assigned-lockfile diff check after every delegated Cargo command in multi-worktree iterations. When a workstream can change a crate manifest but not the workspace lockfile, pre-register exact disposable-copy validation and leave lockfile regeneration to integration.

## Remaining Work and Risks

- Integration must regenerate `Cargo.lock`, rerun strict package checks, and run workspace tests.
- A complete implementation needs snapshot publication only after stream recovery and snapshot durability can be coordinated safely.
- The spike uses blocking file I/O inside async trait methods and has no process lock or fencing. Concurrent independent opens of one directory are unsupported.
- `sync_data` establishes the implementation's record-data policy but does not sync the containing directory entry after initial file creation; stronger crash guarantees need platform-specific fault testing.
- A corrupted length that extends beyond EOF is treated as an incomplete tail and truncated. Distinguishing that case from a torn write may require a recoverable footer, duplicated length, or other framing evidence.
- Fault injection between individual write and sync operations, source-line complexity comparison, repeated crash testing, and latency/throughput measurements remain future work if selected by Phase 3.

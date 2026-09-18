# Iteration 0002: durable-snapshots Report

Status: complete
Branch: `rust-service-iteration-0002-durable-snapshots`
Worktree: `/workspaces/FluidFramework-rust-service-iteration-0002-durable-snapshots`
Base commit: `d04c7aa44eb8720fee2242d98729e6916c0dcb02`
Final commit: `75220cf3aae0980f27f56039ce6ae1cdd6972b1d` (final implementation commit; report-only commit follows this record)
Agent or owner: GitHub Copilot durable recovery agent
Model and tool version: GitHub Copilot; model and tool version unknown
Instruction source: [`instructions/durable-snapshots.md`](instructions/durable-snapshots.md) at kickoff commit `d04c7aa44eb8720fee2242d98729e6916c0dcb02`
Session or transcript reference: none
Started and finished: started `2026-09-12T15:09:19Z`; finished `2026-09-12T15:23:44Z`

## Outcome

Implemented versioned, duplicated record framing and a coordinated `SnapshotStore` in the durable-log spike. Record recovery now truncates every tested incomplete final-frame prefix while rejecting one-byte corruption at every location in a complete frame. Snapshot publication serializes with appends, validates stream generation and ordinal, enforces expected-parent lineage and non-regression, writes a fully checksummed pending record, calls `sync_all` on it, atomically renames it, syncs the containing directory, and only then acknowledges it.

Confidence is high for the deterministic single-process model covered here. The evidence does not establish behavior under actual power loss, dishonest storage, unsupported directory fsync, concurrent processes, retention, or adversarial CRC32 collisions.

## Hypothesis Results

Initial hypothesis: duplicating each record's length and checksum in a fixed trailer will let recovery classify a short final frame as an incomplete tail while rejecting every fully present frame whose header, payload, or trailer is corrupt. An atomically renamed and directory-synced snapshot record containing the stream generation, covered ordinal, payload length, and checksum can be acknowledged only after it is recoverable and can reject lineage regression.

Planned cheap checks: deterministic truncation at every record-frame boundary; one-byte corruption in each duplicated framing field and payload; snapshot faults before/during write, file sync, rename, directory sync, acknowledgment, and reopen; recovery plus replay after the acknowledged snapshot; snapshot ordinal non-regression; persisted-byte amplification and reopen timing measurements. A test that accepts a fully present corrupt frame or cannot recover an acknowledged snapshot falsifies the hypothesis.

Result: supported within the tested fault model. `every_incomplete_frame_prefix_is_discarded` covered every proper prefix of a complete final frame; `corruption_in_each_complete_frame_region_is_rejected` and `corruption_in_each_snapshot_record_region_is_rejected` flipped every byte individually and observed `ErrorKind::Corrupt`. `every_snapshot_publication_crash_recovers_a_valid_lineage_member` covered create, write, file-sync, rename, directory-sync, and pre-acknowledgment boundaries. `acknowledged_snapshot_recovers_and_replay_starts_after_it` reopened an acknowledged snapshot and replayed only later stream records. No tested crash point made an acknowledged snapshot unusable.

## Deliverables and Commits

- `1364f1258f080154d5527cf83afc69cba6b51c5e` - `feat(rust-service): add durable snapshot recovery spike`; duplicated record framing, deterministic crash injection, snapshot publication/recovery, lineage checks, and focused evidence.
- `75220cf3aae0980f27f56039ce6ae1cdd6972b1d` - `fix(rust-service): version durable log framing`; changed the persisted log discriminator to `SDLOG002` and applied final formatting so version-1 bytes cannot be treated as version-2 tails.
- This report is the only remaining deliverable and is committed separately after validation.

## Validation Evidence

All retained commands identified `/workspaces/FluidFramework-rust-service-iteration-0002-durable-snapshots` and branch `rust-service-iteration-0002-durable-snapshots`.

- `env --chdir=.../rust-service cargo fmt --all -- --check` - exit 0.
- `CARGO_TARGET_DIR=/tmp/fluid-durable-snapshots-only env --chdir=.../rust-service cargo test -p snapshotted-stream-durable-log-spike --all-features` - exit 0; 15 unit tests passed, 0 failed; doc tests passed.
- `CARGO_TARGET_DIR=/tmp/fluid-durable-snapshots-only env --chdir=.../rust-service cargo clippy -p snapshotted-stream-durable-log-spike --all-targets --all-features -- -D warnings` - exit 0 with no diagnostics.
- Direct isolated test-binary run with `--nocapture` - exit 0; 15 passed, 0 failed; retained `snapshot_payload_bytes=1024 snapshot_persisted_bytes=1145` and `recovery_records=10000 recovery_elapsed_ns=11146498`.
- `git diff --exit-code d04c7aa44eb8720fee2242d98729e6916c0dcb02 -- rust-service/Cargo.lock` - exit 0 after final implementation validation.
- No manifest changed, so disposable-copy manifest/lock regeneration was not applicable. No shared workspace or integration validation was run from this isolated workstream.

## Notable Events

Record an event when a hypothesis is falsified, three similar attempts fail, substantial effort is lost, human intervention is needed, a workaround appears, or a reusable technique is discovered.

| Type | Attempt or event | Evidence | Impact | Resolution or state | Reusable lesson |
| --- | --- | --- | --- | --- | --- |
| Process hazard | A delegated checkout-identity command requested the durable-snapshots path but retained the shell's reference-model worktree. | Delegated output reported `/workspaces/FluidFramework-rust-service-iteration-0002-reference-model-faults` and branch `rust-service-iteration-0002-reference-model-faults`. | Unqualified delegated validation could have attributed results to the wrong workstream. | Re-ran with explicit `git -C /workspaces/FluidFramework-rust-service-iteration-0002-durable-snapshots`; confirmed the assigned branch, kickoff, clean status, and unchanged lockfile. | In multi-worktree sessions, use path-qualified commands and print both the absolute path and branch in retained output. |
| Repeated validation interference | Two delegated/current-terminal checks emitted formatting or Clippy output from the reference-model, network, or authoritative-sequencer worktrees; two fresh isolated-target builds were externally interrupted during dependency compilation. | Foreign paths appeared in retained output; isolated commands exited before tests with no compiler diagnostic. | Those runs could not support this workstream's claims and consumed substantial validation time. | Used `env --chdir=/workspaces/FluidFramework-rust-service-iteration-0002-durable-snapshots/rust-service` with the assigned worktree's existing target; package suite completed with 15 passed, 0 failed. | In concurrent worktree sessions, combine `env --chdir`, explicit identity output, package selection, and an already-warm checkout-local target; discard any result naming a foreign checkout. |
| Compatibility correction | Pre-report review found that duplicated framing had replaced the version-1 record layout without changing the log magic. | `MAGIC` remained `SDLOG001` while `FRAME_HEADER_LEN` changed from 12 to 28 and a 28-byte trailer was added. | A pre-iteration log could be mistaken for a torn new-format tail instead of being rejected as incompatible. | Bump the format discriminator to `SDLOG002` and rerun package tests, formatting, and Clippy before report completion. | Change a persisted format's version discriminator in the same implementation commit series as its framing layout. |

## Contract and Integration Friction

The shared `SnapshotStore` contract was sufficient; no shared edit or undocumented recovery heuristic was required. Its success type does not carry a durability level, so this implementation documents and tests its own success boundary: pending-file `sync_all`, rename, and containing-directory `sync_all` must all complete before `publish` returns `Ok`. Errors after rename are classified `Ambiguous` because the new snapshot may be visible.

The reference-model/conformance additions were not present in the kickoff checkout and were not copied from another active worktree. Integration must run their snapshot and fault cases after that workstream is merged.

## Human Interventions

The user supplied the worktree, branch, kickoff commit, writable-path restriction, and autonomous execution instruction. No mid-workstream semantic decision or correction was requested from a person.

## Measurements

- Record framing adds 56 bytes per payload. The 10,000-record test with 64-byte payloads persisted 1,200,024 bytes including the 24-byte log header: 120 bytes per record and 1.875x payload amplification.
- Snapshot framing adds 121 bytes. A 1,024-byte payload persisted 1,145 bytes: approximately 1.118x payload amplification.
- One debug-build reopen of 10,000 records took 11,146,498 ns. This is a procedure check and single observation, not a benchmark; cache state and storage backing were uncontrolled.
- Source: kickoff `d04c7aa44eb8720fee2242d98729e6916c0dcb02`; final implementation `75220cf3aae0980f27f56039ce6ae1cdd6972b1d`.
- Toolchain: `rustc 1.98.1 (48a229cea 2026-09-01)`, `cargo 1.98.1 (797e8a9bc 2026-08-05)`.
- Environment: Linux `6.8.0-1064-azure`, x86_64 GNU/Linux.
- Direct dependencies resolved by `cargo tree --depth 1`: `async-trait 0.1.92`, `bytes 1.12.1`, `crc32fast 1.5.1`, `futures-util 0.3.34`, local `snapshotted-stream-core 0.1.0`, `thiserror 2.0.20`; dev dependency `tokio 1.53.1`.
- Elapsed wall-clock effort from recorded timestamps: 14 minutes 25 seconds. Model/token usage: unknown.

## Proposed Decisions

No shared decision is proposed. All changes are local to the assigned spike and preserve the shared traits.

## Candidate Skills and Process Changes

Candidate coordination improvement: validation in concurrent worktrees should use an explicit absolute checkout, print path and branch, and use a workstream-specific `CARGO_TARGET_DIR`. If terminal multiplexing still emits foreign paths, discard the result and invoke the built package test binary directly. This is supported by the two validation-interference events above.

Candidate durability test pattern: enumerate ordered, one-shot failure points around write, sync, rename, directory sync, acknowledgment, and reopen; after each injected failure, reopen without injection and assert the recovered artifact is a valid old or new lineage member.

## Remaining Work and Risks

- Integration must run applicable reference-model/shared conformance after merging that workstream, followed by `cargo test --workspace --all-targets --all-features`.
- Actual process termination, kernel page-cache loss, power interruption, and filesystem-specific rename/directory-fsync behavior remain unverified; the injector returns at the same program boundaries but is not a hardware crash harness.
- Only one process is supported. The mutex coordinates append and snapshot publication inside one `DurableLog`; no file locking or fencing is claimed.
- Only `snapshot.current` is retained. Snapshot history, pending-file cleanup policy, retention, compaction, and optimization are intentionally out of scope; a later publish truncates any stale `snapshot.pending` file.
- CRC32 detects the tested accidental corruption but is not collision-resistant and does not provide authenticity.
- Recovery scans and loads the full log before validating the snapshot, so startup remains linear in retained log size.

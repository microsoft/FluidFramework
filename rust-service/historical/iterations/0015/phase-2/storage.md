# Iteration 0015: storage Report

Status: complete
Branch: `rust-service-iteration-0015-storage`
Worktree: `/workspaces/FluidFramework-rust-service-iteration-0015-storage`
Base commit: `27bf6bde813606100a00bf180085e2a5ba3a0f08`
Final commit: the report-bearing workstream commit; its hash is reported to the coordinator because a commit cannot contain its own hash
Agent or owner: GitHub Copilot
Model and tool version: GitHub Copilot; tool version unknown
Instruction source: [storage instructions](instructions/storage.md) at `27bf6bde813606100a00bf180085e2a5ba3a0f08`
Session or transcript reference: none
Started and finished: 2026-09-17; exact times unknown

## Outcome

Challenged all 14 inherited storage dispositions against the current owning
implementation decisions and nearest tests. One material gap was confirmed:
`sea-file` promised that validation rejection appends no journal record, but its
focused test isolated only missing-tree rejection. The existing test now also
isolates stale-parent, invalid-position, regression, and operation-identity
conflicts, checks the exact error variant, checks archive length after each
rejection, and verifies clean reopen.

No other production or test change was proportionate. The durable crash-point
finding remains deferred, but its evidence changed: `OpenAfterSnapshotRead` is
reachable at a location that does not match its documented retired
snapshot-file boundary, while the eight `SnapshotAfter*` variants remain
unreachable. Confidence is high in the source audit and repair based on the
focused test and all required four-crate gates.

## Hypothesis Results

- **Owning-decision evidence: supported.** The inherited `sea-file` test could
	pass if any non-tree snapshot validation branch wrote before rejecting. The
	extended focused test discriminates each branch. The inherited durable count
	was also stale relative to the current call-site map.
- **Convergence: mostly supported.** Thirteen rows required no code change after
	direct mapping to an exact local or directly instantiated conformance test,
	or remained blocked at the same fault/API boundary. No repeated broad audit
	or unrelated cleanup was needed.
- **Proportionate repair: supported.** One test-only cluster strengthens the
	existing owning-crate test without changing contracts, formats, durability,
	APIs, dependencies, manifests, or the lockfile.

## Deliverables and Commits

- `rust-service/crates/sea-file/src/lib.rs`: extended
	`rejected_operations_leave_the_archive_unchanged_and_reopenable` coverage.
- This report: provenance, all inherited-row challenges, proposed inventory
	rows, changed durable evidence, validation, and remaining risks.
- One report-bearing workstream commit; its hash is reported to the coordinator
	after creation.

## Validation Evidence

- Initial checkout guard passed for the assigned absolute worktree, branch
	`rust-service-iteration-0015-storage`, clean status, and HEAD
	`27bf6bde813606100a00bf180085e2a5ba3a0f08`.
- `cargo test -p sea-file --lib
	current_tests::rejected_operations_leave_the_archive_unchanged_and_reopenable
	-- --exact --nocapture` passed: 1 passed, 0 failed.
- `cargo fmt --all -- --check` passed.
- Strict Clippy, warning-denied rustdoc, and all-target/all-feature tests passed
	for `sea-content-addressed`, `sea-memory`, `sea-file`, and
	`sea-file-durable`, with no test failures.
- `node rust-service/scripts/check-documentation.mjs` passed: 24 roots, 31
	READMEs, and 48 local links.
- `git diff --check`, manifest and lockfile guards, and writable-path guards
	passed. Only `rust-service/crates/sea-file/src/lib.rs` and this report changed.
- No storage test roots remained. The two dedicated Cargo target directories
	were removed.
- VS Code diagnostics report no error in the changed `sea-file` source.
- No machine-readable output is required or retained.

## Behavioral Contracts and Test Layers

The changed production crate is `sea-file`, but only its test module changed.
Its README owns the promise that validation rejection appends no journal record.
The focused `rejected_operations_leave_the_archive_unchanged_and_reopenable`
test now checks every snapshot validation decision in `publish_snapshot` before
`write_archive_record`: operation identity, expected parent, committed position,
non-regression, and blob-tree closure. Shared storage conformance remains
distinct evidence for implementation-independent live-state laws; it does not
inspect file bytes or reopen the journal. No integration, generated, or platform
test owns this local persistence decision.

Proposed quality-inventory rows for all inherited storage boundaries:

| Boundary | Exact owning decision and consumers | Nearest discriminating evidence | Disposition | Change or rationale | Revisit trigger |
| --- | --- | --- | --- | --- | --- |
| `sea-content-addressed/publication-integrity` | `publish` delegates both pre-existing and hard-link collision paths to `verify_existing`, which accepts only equal bytes | `publication_verifies_existing_content` directly fails if `verify_existing` permits replacement bytes | already adequate | No change; the test reaches the shared owning decision, not a broader component | Publication primitive, collision handling, or durability order changes |
| `sea-content-addressed/bounded-verified-reads` | `read_bounded` rejects metadata length above the configured limit before allocation; `get_blob` then checks requested identity | `rejects_blob_bounds_and_corruption` separately reaches oversized stored bytes and same-size wrong bytes | already adequate | No change; each branch is local and distinct | Read strategy, limits, or error taxonomy changes |
| `sea-content-addressed/directory-identity` | `get_directory` decodes canonical bytes and compares the decoded ID with the requested ID | `rejects_directory_identity_mismatch` stores a different valid canonical directory at the requested path | already adequate | No change; malformed decoding cannot satisfy this assertion | Encoding or identity derivation changes |
| `sea-memory/read-range` | `read` converts `(after, through]` positions to the exact Rust slice `start..end` | `read_includes_through_and_excludes_later_events` fails for either endpoint regression | already adequate | No change | Position representation or range semantics changes |
| `sea-memory/snapshot-rejection-atomicity` | `publish_snapshot` performs all validation before incrementing IDs, appending history, or binding operation identity | `rejected_snapshot_does_not_bind_operation_identity` fails if missing-tree rejection mutates any of those three stores | already adequate | No change; other conflict laws are directly instantiated against `MemoryStream` by conformance | Validation order or operation-index representation changes |
| `sea-memory/load-capture` | `load` selects snapshot, head, and cloned finite tail while holding one state mutex guard | Directly instantiated `assert_captured_load` fails if returned snapshot/head/tail are observably inconsistent or the tail remains live | already adequate | No change; a deterministic internal lock-interleaving test would require a test seam and add no current behavioral distinction | Load locking, stream materialization, or a concurrency incident changes the risk |
| `sea-memory/append-tree-atomicity` | `append` validates the complete tree before assigning a position or pushing an event | Directly instantiated `reject_missing_event_tree` checks rejection and unchanged head; `append_accepts_nested_blob_tree` reaches recursive success | already adequate | No change | Tree validation or append mutation ordering changes |
| `sea-memory/reader-cancellation` | `read` returns an independently owned finite vector stream with no shared cursor or retained state guard | Directly instantiated `storage_readers_are_independent_and_cancellable` drops one reader, completes the other, and checks storage head | already adequate | No change; another component cannot satisfy the test because conformance receives `MemoryStream` directly | Reads become live, share cursors, or borrow mutable state |
| `sea-file/validation-rejection-journal-atomicity` | `put_directory`, `append`, and `publish_snapshot` must finish validation before writing a journal frame | Extended `rejected_operations_leave_the_archive_unchanged_and_reopenable` checks exact errors, unchanged length after every rejection class, reopen state, and the next position | repaired | Added complete focused snapshot rejection evidence; existing README already states the contract | Validation or journal-write ordering changes |
| `sea-file/clean-reopen-and-strict-corruption` | `open` parses the whole archive strictly; clean close must reconstruct all categories and invalid/incomplete framing must fail | `clean_reopen_preserves_archive_state` and `open_rejects_incomplete_or_invalid_archive_framing` directly exercise the two decisions | already adequate | No change; conformance proves separate live-state laws | Encoding, parser, or recovery policy changes |
| `sea-file/partial-io-failure-recovery` | `write_archive_record` plus buffered `flush` can fail after partial output; no repair policy is promised | No deterministic focused test exists without an injectable writer | deferred | Preserved; adding a writer abstraction or recovery policy exceeds the run | Writer seam, real I/O incident, or intentional recovery redesign |
| `sea-file-durable/append-crash-recovery` | framed record writes expose incomplete-header and post-sync ambiguity decisions; reopen truncates incomplete tails and retains complete synced records | `crash_recovery_distinguishes_incomplete_and_synced_appends` injects exactly after header and after sync, then reopens | already adequate | No change; process interruption is not power-loss evidence | Persistence sequence or power-loss harness changes |
| `sea-file-durable/snapshot-ambiguity-resolution` | a synced snapshot frame is parsed back into snapshot history and operation resolution after an ambiguous acknowledgement | `reopen_resolves_snapshot_after_post_sync_ambiguity` injects after sync, reopens, resolves the operation, and checks latest | already adequate | No change; conformance covers normal publication, not this recovery decision | Snapshot journaling or operation identity changes |
| `sea-file-durable/stale-snapshot-crash-points` | Public crash controls should occur at their documented boundaries | Call-site audit finds eight `SnapshotAfter*` variants unreachable and `OpenAfterSnapshotRead` reachable before archive parsing, not after a separate current-snapshot read | deferred | Corrected inherited evidence; repair requires API or persistence-architecture authority | Consumer use, crash-point API work, or authorized persistence redesign |

Focused tests prove backend-owned verification, indexing, mutation order,
reopen, and recovery decisions. Conformance is accepted only where each crate
directly supplies the implementation under test and the assertion observes that
backend's decision. Broader integration, generated, and platform tests add no
distinct responsibility for this repair.

## Notable Events

Record an event when a hypothesis is falsified, three similar attempts fail, substantial effort is lost, human intervention is needed, a workaround appears, or a reusable technique is discovered.

| Type | Attempt or event | Evidence | Impact | Resolution or state | Reusable lesson |
| --- | --- | --- | --- | --- | --- |
| Validation infrastructure | Four post-fix focused Cargo attempts did not produce attributable storage results. | Three exited 130 during compilation, including one routed to the workloads worktree; a direct terminal returned a core-session test. | Validation was delayed; no mismatched output was accepted. | A later literal-path run named the storage branch, exact `sea-file` test, and passing result. | Require output to name worktree, branch, package, and exact test; a requested command string alone is not provenance. |
| Inherited evidence corrected | Iteration `0014` classified nine durable snapshot/open crash points as having no call site. | Current `open_with_crash_injector` calls `OpenAfterSnapshotRead`; eight `SnapshotAfter*` variants still have no call site. | The count and nature of the deferred defect changed, but repair remains out of scope. | Record eight unreachable points plus one misplaced/reachable point for integration. | Recheck inherited source claims against the current kickoff rather than copying prior counts. |

## Contract and Integration Friction

Deterministic partial-I/O evidence needs an injectable writer or fault seam.
Correcting durable snapshot crash points needs a public API or persistence
architecture decision. Neither is authorized here. There are no implementation
dependencies on another workstream.

## Human Interventions

The user supplied the authoritative worktree, branch, clean kickoff, writable
scope, four-crate validation requirement, and prohibition on external evaluator
access. No evaluator material was accessed and no mid-workstream semantic
decision was requested.

## Measurements

Performance and persisted-size measurements are not applicable to this test-only
repair. Dependencies, manifests, formats, APIs, and durability policy changed:
0. Repair clusters: 1 of the allowed 2. Inherited rows reviewed: 14 of 14.
Environment: repository-pinned Rust toolchain in Debian GNU/Linux 13; exact
elapsed time, token use, and tool version unknown.

## Proposed Decisions

No shared decision is proposed. The two deferred fault boundaries retain their
existing architecture/API revisit triggers.

## Candidate Skills and Process Changes

When inheriting an inventory, verify enumerated source facts such as variant
reachability against the actual kickoff commit. For multi-worktree validation,
accept evidence only when output itself identifies the requested worktree,
branch, package, and exact test. Existing coordination guidance covers the
second procedure; no skill edit is proposed from this workstream.

## Remaining Work and Risks

- Integration should reconcile the 14 proposed rows into the shared inventory,
	including the corrected durable crash-point evidence.
- Partial file I/O and durable snapshot crash controls remain intentionally
	deferred with the triggers above.
- No temporary root, retained machine-readable artifact, process, dependency,
	generated output, manifest change, or lockfile change remains. The worktree is
	clean after the report-bearing commit.

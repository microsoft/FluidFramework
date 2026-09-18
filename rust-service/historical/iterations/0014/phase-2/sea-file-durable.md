# Iteration 0014: sea-file-durable Report

Status: in progress
Branch: `rust-service-iteration-0014-sea-file-durable`
Worktree: `/workspaces/FluidFramework-rust-service-iteration-0014-sea-file-durable`
Base commit: `122e48a57007da96d4941f1630e7a709224e5296`
Final commit: `30ce6aba690` (implementation); the report completion commit follows it and is identifiable as the branch tip because a commit cannot include its own hash
Agent or owner: GitHub Copilot
Model and tool version: GitHub Copilot; model and tool version unknown
Instruction source: [sea-file-durable instructions](instructions/sea-file-durable.md) at kickoff commit `122e48a57007da96d4941f1630e7a709224e5296`
Session or transcript reference: none
Started and finished: started `2026-09-17T17:57:27Z`; finished `2026-09-17` (exact time unknown)

## Outcome

Audited crash injection, append recovery, snapshot ambiguity resolution, and
corruption framing against iteration `0013` evidence. Added two focused tests
for active crash boundaries and narrowed the README's tested guarantees. Found
one material stale public fault-injection surface that cannot be repaired within
the workstream's API and architecture constraints. Confidence is high for the
tested process-interruption behavior and moderate for the remaining crash-point
surface because power-loss and filesystem-failure evidence is unavailable.

## Hypothesis Results

- **Active record crash boundaries:** pre-sync interruption should recover without
	 the attempted event only when the frame is observably incomplete, while
	 post-sync interruption should return an ambiguous result that resolves to a
	 recovered event. The original `RecordBeforeSync` check was rejected because a
	 complete unsynced frame can survive process termination while the operating
	 system remains running. Deterministic injection at `RecordAfterHeaderWrite`
	 and `RecordAfterSync` confirmed the narrower contract.
- **Snapshot operation recovery:** a post-sync ambiguous snapshot publication
	should be discoverable by operation identity after reopen, allowing a caller
	to resolve the ambiguity without republishing. Existing conformance coverage
	 exercises normal publication semantics, not this crate-owned crash boundary.
	 Injection at `RecordAfterSync`, followed by reopen and
	 `resolve_snapshot_publication`, confirmed the finding.
- **Snapshot-specific crash points:** `OpenAfterSnapshotRead` and every
	`SnapshotAfter*` variant describe a separate snapshot-file lifecycle, but the
	current implementation stores snapshots in the archive journal and never
	reaches these points. Removing or redefining public variants would change the
	public API or durability semantics, so this confirmed contract defect is
	deferred under the charter.

## Deliverables and Commits

- `rust-service/crates/sea-file-durable/src/lib.rs`: focused append and snapshot
	 ambiguity recovery tests.
- `rust-service/crates/sea-file-durable/README.md`: explicit tested recovery
	 guarantees without stronger durability claims.
- `30ce6aba690` (`test(sea-file-durable): cover ambiguous crash recovery`): crate
	 source and README changes.
- Report completion commit: this commit, immediately following `30ce6aba690`.

## Validation Evidence

- `cargo test --manifest-path <worktree>/rust-service/Cargo.toml -p sea-file-durable crash_ -- --nocapture`: passed
	 `current_tests::crash_recovery_distinguishes_incomplete_and_synced_appends`;
	 1 passed, 5 filtered.
- `cargo test --manifest-path <worktree>/rust-service/Cargo.toml -p sea-file-durable reopen_resolves_snapshot_after_post_sync_ambiguity -- --nocapture`: passed; 1 passed, 5 filtered.
- `cargo fmt --manifest-path <worktree>/rust-service/Cargo.toml --all -- --check`: passed after applying its one-line wrapping correction.
- `cargo test --manifest-path <worktree>/rust-service/Cargo.toml -p sea-file-durable --all-targets --all-features`: passed; 6 passed, 0 failed.
- `cargo clippy --manifest-path <worktree>/rust-service/Cargo.toml -p sea-file-durable --all-targets --all-features -- -D warnings`: passed with no warnings.
- `RUSTDOCFLAGS='-D warnings' cargo doc --manifest-path <worktree>/rust-service/Cargo.toml -p sea-file-durable --all-features --no-deps`: passed with no warnings.
- VS Code diagnostics for the source, README, and report: no errors.
- `git diff --check`: passed. `git diff --exit-code -- rust-service/Cargo.lock`: passed. Changed paths were limited to the writable crate and report.
- `find /tmp -maxdepth 1 -mindepth 1 -type d -name 'sea-durable-current-*' -print`: returned no retained temporary directories.
- Machine-readable retained output: not applicable.

All accepted command results used branch
`rust-service-iteration-0014-sea-file-durable`, absolute worktree manifests,
and kickoff guard `122e48a57007da96d4941f1630e7a709224e5296`.

## Behavioral Contracts and Test Layers

- `DurableLog` owns journal framing, sync-before-success, incomplete-tail
	 recovery, and operation-based snapshot ambiguity resolution. The README now
	 states the two newly demonstrated recovery guarantees without claiming power
	 loss or filesystem durability.
- Focused test `crash_recovery_distinguishes_incomplete_and_synced_appends`
	 proves that an incomplete frame is discarded and a synced event is recovered
	 after ambiguous acknowledgement. Focused test
	 `reopen_resolves_snapshot_after_post_sync_ambiguity` proves that a synced
	 snapshot is recovered and resolvable by operation identity.
- `sea_conformance::run_sea_storage_conformance` remains distinct shared-law
	 evidence for normal storage, snapshot publication, retry, and resolution
	 semantics. No integration, generated-binding, or browser layer owns these
	 crate-local crash boundaries.

## Notable Events

Record an event when a hypothesis is falsified, three similar attempts fail, substantial effort is lost, human intervention is needed, a workaround appears, or a reusable technique is discovered.

| Type | Attempt or event | Evidence | Impact | Resolution or state | Reusable lesson |
| --- | --- | --- | --- | --- | --- |
| Hypothesis rejected | Planned to assert that `RecordBeforeSync` always loses the attempted event. | A complete frame has already been written at that point, and process termination while the OS remains running does not model loss of unsynced cache contents. | The proposed assertion would have strengthened the durability claim beyond available evidence. | Used `RecordAfterHeaderWrite` for deterministic incomplete-tail recovery and retained `RecordAfterSync` for committed ambiguity. | Crash tests must distinguish simulated process interruption from unavailable power-loss evidence. |
| Contract defect deferred | Audited every public `CrashPoint` against implementation call sites. | `OpenAfterSnapshotRead` and all eight `SnapshotAfter*` variants have no call site; their docs describe a retired pending-snapshot-file design. | Callers cannot inject the advertised boundaries, but removing or redefining variants is a public API or durability-semantics change outside ownership. | Deferred for coordinator review with an API/architecture-change revisit trigger. | Include public fault-injection controls in implementation-to-contract audits; stale controls can outlive the architecture they describe. |
| Validation infrastructure | Repeated focused-test commands were interrupted or routed to sibling worktrees before tests ran. | Three delegated/direct attempts exited 130 during compilation; another terminal invocation returned `sea-stateful-compression` output. Absolute-manifest commands then passed both focused tests. | Validation took repeated attempts; no invalid output was accepted. | Removed cwd dependence by using absolute `git -C` guards and Cargo `--manifest-path`. | Multi-worktree validation should use absolute manifests and reject output whose provenance does not match the assignment. |

## Contract and Integration Friction

The public `CrashPoint` enum retains nine snapshot-file/open variants with no
implementation call site. Repair requires a public API compatibility decision
or a persistence architecture change. There were no cross-workstream code
dependencies. Shared command execution repeatedly changed or ignored working
directories; absolute manifests and `git -C` guards were required.

## Human Interventions

The coordinator supplied the expected branch, kickoff commit, clean-state
verification, ownership, and lack of external evaluator access. No semantic
decision or implementation correction required human intervention.

## Measurements

Performance and persisted-size measurements: not applicable. Dependencies and
manifest changes: 0. Focused tests added: 2; package tests before/after: 4/6.
Reviewed active record crash points: 5. Reviewed stale snapshot/open crash
points: 9. Environment: pinned repository Rust toolchain on Debian GNU/Linux 13;
elapsed time, token use, and exact model/tool version unknown.

## Proposed Decisions

No decision record is proposed within this workstream. Phase 3 should decide
whether to deprecate/remove the stale `CrashPoint` variants or restore matching
injection behavior in a separately scoped API/architecture change.

## Candidate Skills and Process Changes

The existing coordination guidance to reject mismatched worktree evidence was
validated repeatedly. A reusable command procedure should avoid shell cwd state
entirely: guard with `git -C <absolute-worktree>`, invoke Cargo with an absolute
`--manifest-path`, and verify the package/test identity in output. No skill file
was changed because it is outside workstream ownership.

## Remaining Work and Risks

- Resolve the nine stale public crash points when a public API compatibility or
	 persistence architecture change is authorized. Revisit when `CrashPoint` is
	 next changed, when a consumer uses one of those variants, or before claiming
	 complete deterministic snapshot crash coverage.
- `RecordAfterPayloadWrite`, `RecordAfterTrailerWrite`, and `RecordBeforeSync`
	 remain matrix candidates. Their process-interruption outcomes overlap the
	 incomplete and complete frame classes now covered; revisit when real
	 power-loss or filesystem fault injection becomes available.
- Corrupt semantic archive records remain covered by parser validation and
	 broader conformance rather than an exhaustive malformed-record corpus.
	 Revisit after an observed corruption incident or persistence-format change.

## Proposed Quality Inventory Rows

| Boundary | Owner and consumers | Risk evidence | Relied-upon contract | Existing test layers | Finding and discriminating check | Disposition | Changed contract/tests | Validation | Revisit trigger |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `sea-file-durable/append-crash-recovery` | `DurableLog` journal; `SeaStorage` callers resolving ambiguous append results | Sync and partial-write boundary; iteration `0013` covered manual tail corruption but not injector outcomes | Incomplete frames are discarded; success follows sync; post-sync failure is ambiguous and may recover committed | focused, conformance | Inject after header and after sync, then reopen and inspect head | repaired | README guarantee; `crash_recovery_distinguishes_incomplete_and_synced_appends` | focused and full package tests pass | power-loss harness or append persistence change |
| `sea-file-durable/snapshot-ambiguity-resolution` | `DurableLog` snapshot journal; callers retrying by stable operation identity | Snapshot publication mutates durable journal before acknowledgement | A synced ambiguous publication is recoverable and resolvable by operation identity | focused, conformance | Inject after sync, reopen, and resolve operation identity | repaired | README guarantee; `reopen_resolves_snapshot_after_post_sync_ambiguity` | focused and full package tests pass | snapshot journal or operation-id semantics change |
| `sea-file-durable/stale-snapshot-crash-points` | `CrashPoint`/`CrashInjector`; fault-injection test authors | Nine public variants have no call site and document a retired separate snapshot file | Every advertised deterministic crash point should be reachable at its documented boundary | none for affected variants | Map each enum variant to implementation call sites | deferred | none; API/architecture changes prohibited | source audit; strict crate gates pass | consumer use, `CrashPoint` API change, or authorization for persistence architecture work |

## Convergence Assessment

Iteration `0013` adequately covered ordinary reopen, incomplete tails, and
checksum corruption, so this workstream did not repeat those assertions. Two
new focused tests close distinct ambiguous-acknowledgement risks with modest
maintenance cost. The next active record points collapse into already covered
incomplete/complete framing classes under the available process-only harness;
the remaining material finding requires out-of-scope shared decisions. Another
same-scope run is not justified until a listed revisit trigger occurs.

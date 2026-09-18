# Iteration 0011: kernel-storage-quality Report

Status: complete
Branch: `rust-service-iteration-0011-kernel-storage-quality`
Worktree: `/workspaces/FluidFramework-rust-service-iteration-0011-kernel-storage-quality`
Base commit: `c3d0aeb25bcd347af9742391cac1d809ab45f4a7` (iteration kickoff)
Final commit: the accepted implementation and this completed report are committed together; the exact SHA cannot be embedded in the commit that determines it and is returned to the coordinator
Agent or owner: GitHub Copilot implementation workstream agent
Model and tool version: GitHub Copilot; model and tool version unknown
Instruction source: [kernel-storage-quality instructions](instructions/kernel-storage-quality.md) at `c3d0aeb25bcd347af9742391cac1d809ab45f4a7`
Session or transcript reference: none
Started and finished: started and finished 2026-09-13; exact times unknown

## Outcome

Audited all five owned crates and found one reproducible content-addressed storage
defect: an empty summary could bypass the encoded manifest-size limit. Added the
failing regression first, fixed the fixed-header boundary, expanded shared
conformance for end-of-stream and foreign snapshot positions, added direct
memory-durability and raw-digest boundary tests, and clarified core and memory
rustdoc. Confidence is high for deterministic host behavior covered below;
power-loss durability remains environment-qualified.

## Hypothesis Results

Initial hypotheses and discriminating checks:

- Malformed or stale positions may not have direct boundary coverage. Inventory the core/conformance tests, then add the cheapest focused test only where the guarantee is absent.
- Cancellation/end behavior and snapshot preconditions may be implemented but underdocumented or only indirectly covered. Trace the owning implementation and run its narrowest existing test before editing.
- File truncation/corruption and durability modes may expose deterministic defects or documentation gaps. Exercise the smallest temporary-file reproduction and stop before any persistence-format or cross-implementation semantic change.
- Content-addressed storage may lack direct digest/precondition boundary tests. Compare implementation errors with local rustdoc and tests before deciding whether code changes are warranted.

Guarantee-to-test inventory and results:

| Guarantee | Existing or added evidence | Result and residual gap |
| --- | --- | --- |
| Append order, empty-record boundaries, and concurrent contiguity | Shared `append_order_and_boundaries` and `concurrent_appends_are_contiguous` | Covered for memory and file-simple. |
| Finite reads, captured head, cancellation, and empty end behavior | Shared `read_is_finite`, `readers_are_independent_and_cancellable`, and added `read_after_head_is_empty`; memory `reader_ends_at_head_captured_when_read_begins` | Covered for both implementations. Cancellation is drop-based because the finite reader contract has no cancel method. |
| Malformed, stale, foreign, and uncommitted positions | Shared generation-scoping and position-codec checks; memory codec and foreign-position tests; implementation validation in `read`, `position_at`, and `publish` | Malformed and foreign tokens/positions are covered. Memory decoding validates token framing, nonzero ordinal, and generation but defers same-generation head validation until use; the synchronous codec trait cannot await its asynchronous state lock. No retention implementation exists, so `StalePosition` cannot be exercised. |
| Snapshot parent, monotonicity, position validity, and recovery | Shared lineage/monotonicity and recovery checks plus added `snapshot_positions_are_generation_scoped` | Covered for memory and file-simple. |
| Memory and buffered durability modes | Added `append_reports_memory_durability`; file-simple clean-reopen test asserts `Durability::Buffered`; crate docs state process-loss and no-sync guarantees | Covered deterministically. |
| File reopen, truncation, and corruption | File-simple clean reopen, invalid/incomplete header, incomplete stream payload, incomplete snapshot record, and parser validity checks | Covered for deterministic malformed/truncated files. No repair is promised or implemented. |
| Content identity, size bounds, corruption, atomic publication, restart, and fault boundaries | Content-addressed digest, streaming, duplicate/concurrent upload, corruption, manifest, fault-injection, and process-recovery tests; added exact raw-digest and empty-manifest-limit boundaries | Covered; empty-manifest limit defect fixed. |

The initial gap hypothesis was supported. Most guarantees already had concrete
coverage, while exact end behavior, foreign snapshot positions, memory receipt
durability, raw digest length, and fixed manifest overhead needed direct checks.

Confirmed defect: `encode_manifest` checked `max_manifest_bytes` only while
encoding entries. An empty manifest therefore bypassed a limit smaller than the
12-byte fixed header, could be acknowledged by `publish_summary`, and could not
subsequently be loaded under the same configuration. The regression test
`empty_manifest_respects_encoded_size_limit` failed before the fix with exit 101.
The fixed-header limit check makes that focused regression pass. Shared
conformance lacked explicit checks for an empty read after the captured head and
for rejecting a foreign-generation snapshot position; both checks were added for
every conforming implementation.

## Deliverables and Commits

- Fixed encoded manifest-size enforcement for the fixed 12-byte header.
- Added one pre-fix regression and four useful boundary assertions/checks across
	content-addressed, conformance, and memory tests.
- Clarified shared append/read/snapshot guarantees and memory lifetime/durability
	in rustdoc.
- Commit: this report and the accepted implementation are one coherent commit;
	exact SHA returned to the coordinator after commit creation.

## Validation Evidence

- Provenance command (`pwd`; `git branch --show-current`; `git rev-parse HEAD`; `git status --short --branch`; `rustc --version`; `cargo --version`) exited 0: checkout `/workspaces/FluidFramework-rust-service-iteration-0011-kernel-storage-quality`, branch `rust-service-iteration-0011-kernel-storage-quality`, HEAD `c3d0aeb25bcd347af9742391cac1d809ab45f4a7`, initially clean, `rustc 1.98.1 (48a229cea 2026-09-01)`, `cargo 1.98.1 (797e8a9bc 2026-08-05)`.
- Pre-fix regression: `cargo test -p snapshotted-stream-content-addressed empty_manifest_respects_encoded_size_limit -- --exact --nocapture` exited 101; the assertion expected `StoreError::ManifestTooLarge { limit: 11 }`, but publication succeeded.
- Post-fix regression: the same focused command exited 0; 1 passed, 0 failed.
- Shared conformance: focused `passes_shared_conformance` runs for memory and file-simple exited 0; 1 passed in each crate.
- Implementation boundaries: `tests::append_reports_memory_durability` exited 0 with 1 passed; `digest_parsing_is_canonical_and_rejects_malformed_values` exited 0 with 1 passed.
- Rustdoc: `cargo doc -p snapshotted-stream-core -p snapshotted-stream-memory --no-deps` exited 0.
- Formatting: the first explicit `cargo fmt --all -- --check` exited 1; `cargo fmt --all` exited 0 and the explicit recheck exited 0.
- Strict lint: `cargo clippy --locked --all-features --all-targets` for all five owned packages with `-- -D warnings` exited 0 with no diagnostics.
- Required tests: `cargo test --locked --all-features --all-targets` for all five owned packages exited 0: 28 passed, 0 failed, 1 ignored. The ignored test is the content-addressed child-process helper that the passing process-recovery parent invokes explicitly.
- Ownership/diff check: `git diff --check` exited 0; status listed only the five owned source/test files and this report; the changed-manifest/lockfile query returned no paths.

## Notable Events

Record an event when a hypothesis is falsified, three similar attempts fail, substantial effort is lost, human intervention is needed, a workaround appears, or a reusable technique is discovered.

| Type | Attempt or event | Evidence | Impact | Resolution or state | Reusable lesson |
| --- | --- | --- | --- | --- | --- |
| Reproducible defect | Audit manifest-size boundary with zero entries and an 11-byte limit. | The fixed manifest header is 12 bytes, while `encode_manifest` checked the configured limit only inside the entry loop; focused regression exited 101. | Publication could acknowledge an object that `load_summary` rejects under the same configuration. | Added a fixed-header limit check; the same focused regression then passed. | Check fixed framing overhead before loops when enforcing encoded-size limits. |
| Failed validation approach | Delegated focused test command returned unrelated iteration-validator output and no Cargo assertion output. | Reported exit 0 cannot establish whether `empty_manifest_respects_encoded_size_limit` ran. | No validation claim accepted from that run. | Rerun the exact focused test directly with full output. | Reject delegated results that omit the requested test identity and relevant output. |
| Failed validation approach | Shared terminal execution displayed and ran another workstream's command; a later isolated marker inherited ambient `main` Git context. | The output named the transformation-wrappers worktree or contradicted this worktree's `.git` metadata. | Those results were discarded. | All accepted final checks use absolute manifest paths and explicit worktree Git metadata. | In concurrent worktrees, validate checkout identity with explicit `--git-dir`/`--work-tree` and `--manifest-path`. |
| Failed validation approach | An exact memory-test filter omitted the `tests::` module prefix. | Cargo exited 0 after running zero matching tests. | The invocation was not counted. | Reran `tests::append_reports_memory_durability -- --exact`; 1 passed. | Exact Rust unit-test filters must include the module-qualified test name. |

## Contract and Integration Friction

`PositionCodec::decode_position` is synchronous while memory stream state uses an
asynchronous mutex. The memory codec therefore rejects malformed, zero, and
foreign-generation tokens immediately but defers same-generation committed-head
validation to `read` or snapshot publication. Changing that split would require
a shared contract or synchronization decision and was not attempted. No
cross-workstream dependency was introduced.

## Human Interventions

None.

## Measurements

- Environment: Linux dev container; `rustc 1.98.1 (48a229cea 2026-09-01)`;
	`cargo 1.98.1 (797e8a9bc 2026-08-05)`.
- Test result: 28 passed, 0 failed, 1 intentionally ignored helper across all
	features and host targets for the five packages.
- Performance and dependency measurements: not applicable; no dependency or
	performance change.
- Exact elapsed effort and token use: unknown.

## Proposed Decisions

No shared decision is proposed.

## Candidate Skills and Process Changes

Candidate coordination guidance: when multiple workstream agents share the VS
Code environment, final validation commands should use absolute Cargo manifest
paths and explicit Git worktree metadata, and must discard output whose checkout
marker does not match. This is supported by the two contaminated validation
attempts above.

## Remaining Work and Risks

- Power-loss guarantees for `sync_all` plus directory synchronization were not
	tested against actual abrupt host failure. Deterministic fault injection and a
	child-process restart test passed, but filesystem/hardware qualification remains.
- No retention implementation exists, so true stale-position behavior remains
	unexercised; foreign and invalid positions are covered.
- Memory position decoding defers same-generation head validation until the
	decoded position is used, as described under contract friction.
- No public traits, persistence formats, dependencies, root manifests, lockfiles,
	decisions, or files outside the writable paths were changed.

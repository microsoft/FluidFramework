# Iteration 0014: sea-content-addressed Report

Status: complete
Branch: `rust-service-iteration-0014-sea-content-addressed`
Worktree: `/workspaces/FluidFramework-rust-service-iteration-0014-sea-content-addressed`
Base commit: `122e48a57007da96d4941f1630e7a709224e5296`
Final commit: this report-bearing workstream commit; its hash is reported to the coordinator because a commit cannot contain its own hash
Agent or owner: GitHub Copilot
Model and tool version: unknown
Instruction source: [`instructions/sea-content-addressed.md`](instructions/sea-content-addressed.md) at `122e48a57007da96d4941f1630e7a709224e5296`
Session or transcript reference: none
Started and finished: 2026-09-17; exact times unknown

## Outcome

Audited immutable publication, read bounds, digest verification, malformed content, missing-object errors, graph traversal, and authorization boundaries against the implementation, README, focused tests, repository consumers, and iteration `0013` evidence.
Added one focused integrity-evidence cluster without changing production behavior: reads now have direct tests for an oversized stored blob and valid canonical directory bytes stored under the wrong identity.
Publication, malformed encoding, and missing-object evidence were already proportionate.
Graph traversal and authorization are explicitly unsupported rather than missing guarantees.
Confidence is high for the reviewed crate-owned branches based on direct tests and all package checks.

## Hypothesis Results

Supported: iteration `0013` added broad corruption checks, but its directory test replaced canonical bytes with malformed input and therefore could not reach `get_directory`'s distinct identity-mismatch branch.
`rejects_directory_identity_mismatch` now stores a different valid canonical directory under the requested identity and confirms rejection.

Supported: `read_bounded` enforces the README's configured read limit, but existing tests covered write limits and same-size digest corruption rather than oversized stored content.
The extended `rejects_blob_bounds_and_corruption` test confirms the exact read-limit error before separately checking digest mismatch.

Falsified for further material gaps within budget: `publication_verifies_existing_content`, round-trip tests, malformed-directory evidence, and missing-object evidence already cover their owning branches proportionately.
Repository search found no production instantiation of `ContentStore` outside this crate, reducing immediate consumer impact.
The README accurately excludes recursive closure verification and access control, so adding traversal or authorization promises and tests would invent unsupported semantics.

## Deliverables and Commits

- `rust-service/crates/sea-content-addressed/src/lib.rs`: focused tests for stored read bounds and directory identity mismatch.
- This report: reviewed boundaries, dispositions, proposed inventory rows, validation, and remaining risks.
- One report-bearing workstream commit; its hash is reported to the coordinator after creation.

No production behavior, public API, dependency, manifest, lockfile, digest format, persistence format, or generated artifact changed.

## Validation Evidence

- `cargo test -p sea-content-addressed rejects_directory_identity_mismatch` passed immediately after the test edit: 1 passed, 5 filtered out.
- `cargo test -p sea-content-addressed rejects_blob_bounds_and_corruption` passed after one interrupted delegated attempt was rejected: 1 passed, 5 filtered out.
- `cargo fmt --all -- --check` passed.
- `cargo clippy -p sea-content-addressed --all-targets --all-features -- -D warnings` passed.
- `RUSTDOCFLAGS='-D warnings' cargo doc -p sea-content-addressed --all-features --no-deps` passed.
- `cargo test -p sea-content-addressed --all-targets --all-features` passed: 6 passed, 0 failed.
- `git diff --check` passed.
- `rust-service/Cargo.lock` is unchanged from `122e48a57007da96d4941f1630e7a709224e5296`.
- Changed-path validation found only `rust-service/crates/sea-content-addressed/src/lib.rs` and this report.
- No machine-readable artifact was required or retained.

## Behavioral Contracts and Test Layers

No production crate behavior changed.
The owning README and `ContentStore::get_blob`/`get_directory` contracts promise bounded reads and identity verification.
Focused tests now distinguish oversized stored content, same-size blob digest corruption, malformed directory encoding, and valid directory encoding under the wrong digest.
`publication_verifies_existing_content` separately proves immutable deduplication and conflict rejection.
`blobs_and_directories_reopen_and_verify` proves local persistence composition across reopen, while `reports_missing_objects` proves missing-object classification.

Shared conformance tests exercise implementation-independent blob and directory round trips for `SeaStorage` implementations, but `ContentStore` does not implement that async interface; they do not replace these focused synchronous store checks.
WebTransport and generated/browser layers do not instantiate `ContentStore`, so no broader assertion would prove a distinct responsibility for this change.

Proposed quality inventory rows:

| Boundary | Owner and consumers | Risk evidence | Relied-upon contract | Existing test layers | Finding and check | Disposition | Changed contract/tests | Validation | Revisit trigger |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `content-addressed-publication-integrity` | `publish`; `put_blob` and `put_directory` | Persistence race and immutable deduplication repaired in `0013` | Existing objects are reused only when bytes match; publication does not replace them | focused | Compare README, implementation, and `publication_verifies_existing_content` | already adequate | none | package suite passes | Publication primitive or durability sequence changes |
| `content-addressed-bounded-verified-reads` | `read_bounded` and `get_blob`; synchronous store callers | Corrupt files are untrusted and limits prevent unbounded allocation | Reads reject configured-bound violations and bytes under the wrong blob identity | focused | Existing test lacked oversized on-disk content; write four bytes into a three-byte store | repaired | extended `rejects_blob_bounds_and_corruption` | focused and package tests pass | Read strategy, limit semantics, or error taxonomy changes |
| `content-addressed-directory-identity` | `get_directory`; synchronous store callers | Valid canonical bytes can still reside under the wrong digest | Decoded directory identity must equal the requested identity | focused | Existing malformed input could not reach identity comparison; substitute another valid encoding | repaired | added `rejects_directory_identity_mismatch` | focused and package tests pass | Directory encoding or identity derivation changes |
| `content-addressed-closure-and-authorization` | `ContentStore` capability boundary; prospective callers | Assignment prioritized graph traversal and authorization assumptions | README promises neither recursive closure verification nor access control | none appropriate | Compare API and README; repository search found no hidden traversal or authorization implementation | excluded | none | A consumer requires closure validation, retention, tenancy, or access control |

## Notable Events

Record an event when a hypothesis is falsified, three similar attempts fail, substantial effort is lost, human intervention is needed, a workaround appears, or a reusable technique is discovered.

| Type | Attempt or event | Evidence | Impact | Resolution or state | Reusable lesson |
| --- | --- | --- | --- | --- | --- |
| Coordination tooling | A delegated read-only rerank returned the `sea-memory` sibling despite an absolute assigned path. | Guard output named `/workspaces/FluidFramework-rust-service-iteration-0014-sea-memory` and its branch. | Consumer/history conclusions from that attempt were rejected. | Repeated the probe in a hard-guarded path-qualified terminal and accepted only matching output. | Preserve absolute path and branch output with every multi-worktree command; reject summaries on mismatch. |
| Validation tooling | The first delegated `rejects_blob_bounds_and_corruption` run was interrupted during compilation. | Exit 130 with no completed test result. | No behavioral conclusion could be drawn. | Reran the identical focused test in the guarded terminal; it passed. | An interrupted build is not test evidence and should be retried without changing code. |

## Contract and Integration Friction

`ContentStore` is a synchronous local object store and is not wired into the async `SeaStorage` implementations exercised by conformance and transport tests.
No cross-workstream edit or shared API change is proposed.

## Human Interventions

None.

## Measurements

Performance and size: not applicable; no production path changed.
Dependencies: unchanged.
Tests: increased from 5 to 6; the existing blob corruption test gained one distinct read-bound assertion.
Environment: repository-pinned Rust toolchain in the assigned Debian dev container.
Elapsed time, token use, and exact tool version: unknown.

## Proposed Decisions

No shared decision is proposed.

## Candidate Skills and Process Changes

None.
The existing coordination guidance already requires rejecting sibling-worktree output and interrupted validation.

## Remaining Work and Risks

- Phase 2 integration must run the charter's workspace-wide canonical, policy, and applicable repository-build gates; those are intentionally not duplicated by this package workstream.
- Interrupted publication can leave temporary files, and process-local temporary counters can collide across processes.
	Revisit when multi-process writers or startup cleanup become required; both require persistence-policy decisions outside this assignment.
- Publication errors after the hard link becomes visible remain ambiguous to callers.
	Revisit if callers require retry classification or acknowledgement semantics.
- Recursive child verification, garbage collection, retention, and authorization remain explicitly unsupported.
	Revisit only when a concrete consumer requires one of those capabilities.
- No failing or ignored test, temporary dependency, generated artifact, or intentional dirty file remains after the final commit.

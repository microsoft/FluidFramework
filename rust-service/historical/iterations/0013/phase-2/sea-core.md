# Iteration 0013: sea-core Report

Status: complete
Branch: `rust-service-iteration-0013-sea-core`
Worktree: `/workspaces/FluidFramework-rust-service-iteration-0013-sea-core`
Base commit: `cf77b2b3655dc5ae2e015ee4b789e301a9e2f200`
Final commit: implementation `faa7dcefa91da690e3ee337989cf7a0c15dd07fc`; report completion is the commit containing this report
Agent or owner: GitHub Copilot
Model and tool version: GitHub Copilot; model and tool version unknown
Instruction source: [`instructions/sea-core.md`](instructions/sea-core.md) at `cf77b2b3655dc5ae2e015ee4b789e301a9e2f200`
Session or transcript reference: none
Started and finished: `2026-09-17T02:20:22+00:00` to `2026-09-17T02:30:32+00:00`

## Outcome

Audited every sea-core function and method. The workstream fixed one malformed-input
panic risk on 32-bit targets, added focused coverage for validated identity values
and content/tree validation, made the README the crate-level rustdoc source, and
moved contributor commands to `DEV.md`. Public APIs, dependencies, shared
semantics, and formats are unchanged. Confidence is high for native behavior and
moderate-high for the 32-bit fix because the overflow path is covered by a native
boundary assertion but was not executed on a 32-bit target.

## Hypothesis Results

Initial hypothesis: auditing every function and method will reveal at least one
nontrivial local behavior whose documentation or focused test coverage can be
improved without changing a public contract. The cheapest disconfirming check is
an inventory of all functions and methods against their documentation and tests;
if every nontrivial behavior is already clear and meaningfully exercised, the
workstream will retain a validated no-change result.

Result: supported.

| Audited functions or methods | Result |
| --- | --- |
| `EventPosition::{new,get,to_bytes,from_bytes}` | Documentation is clear; ordering and canonical round trips are tested. `get` is trivial and needs no dedicated test. |
| `BlobTreeError::{fmt,source}` | Formatting branches directly mirror variants; no behavior change or dedicated test was warranted. |
| `BlobId::{for_bytes,from_bytes,as_bytes}` and `BlobDirectoryId::{from_bytes,as_bytes}` | Domain separation was already tested. Added exact-length rejection coverage for both identity types; accessors are exercised transitively. |
| `BlobDirectory::{new,entries,encode,decode,id}` | Round-trip, ordering, hashing, name validation, and trailing data had useful coverage. Added every documented invalid-name case and fixed checked framing-length arithmetic in `decode`. `entries` is a trivial accessor. |
| `content_id_bytes`, `domain_hash`, and `validate_entry_name` | Covered through the public identity and directory tests, including all name-rejection predicates. |
| `SnapshotId::{from_bytes,as_bytes}` | Opaque wrapping/access is trivial and needs no dedicated test. |
| `OperationId::{new,as_bytes}`, `AuthorId::{new,as_bytes}`, and `SessionId::{new,as_bytes}` | Added focused success, byte-preservation, and distinct empty-error coverage for all three types. |
| All methods on `SeaStorage`, `SeaArchive`, `SeaEventSubscription`, `SeaAuthorSession`, `SeaSnapshotCoordinator`, and `SeaSnapshotPublisher` | These are documented contracts with no implementation in this crate; implementation behavior belongs to backend and conformance crates. No local test double would add meaningful coverage. |
| `SessionBounds`, `SeaService`, and `SeaSession` blanket marker implementations | Trivial compile-time composition; no runtime test warranted. |

## Deliverables and Commits

1. `faa7dcefa91da690e3ee337989cf7a0c15dd07fc` (`fix(sea-core): harden directory decoding`): checked decode arithmetic, focused validation tests, README-backed crate docs, and `DEV.md`.
2. This report completion commit: audit inventory, validation, provenance, events, and residual risk.

## Validation Evidence

- `cargo fmt --manifest-path /workspaces/FluidFramework-rust-service-iteration-0013-sea-core/rust-service/Cargo.toml --all -- --check` passed with exit 0 after applying its one reported layout change.
- `CARGO_BUILD_JOBS=1 CARGO_TARGET_DIR=/tmp/sea-core-iteration-0013-target cargo clippy --manifest-path /workspaces/FluidFramework-rust-service-iteration-0013-sea-core/rust-service/Cargo.toml -p sea-core --all-targets --all-features -- -D warnings` passed with exit 0 and no warnings.
- `CARGO_BUILD_JOBS=1 CARGO_TARGET_DIR=/tmp/sea-core-iteration-0013-target RUSTDOCFLAGS='-D warnings' cargo doc --manifest-path /workspaces/FluidFramework-rust-service-iteration-0013-sea-core/rust-service/Cargo.toml -p sea-core --all-features --no-deps` passed with exit 0 and generated `/tmp/sea-core-iteration-0013-target/doc/sea_core/index.html`.
- `CARGO_BUILD_JOBS=1 CARGO_TARGET_DIR=/tmp/sea-core-iteration-0013-target cargo test --manifest-path /workspaces/FluidFramework-rust-service-iteration-0013-sea-core/rust-service/Cargo.toml -p sea-core --all-targets --all-features` passed: 7 passed, 0 failed, 0 ignored. Relevant new tests were `archive::identity_tests::caller_identities_preserve_nonempty_bytes_and_reject_empty_values` and `sea_value_tests::content_identities_require_exactly_32_bytes`; the expanded `sea_value_tests::directories_reject_paths_and_malformed_encodings` also passed.
- VS Code diagnostics reported no errors in either source file or either Markdown file after edits.
- `git diff --check` passed with exit 0.
- Changed-path inspection found only `rust-service/crates/sea-core/**` and this report. `git diff --name-only cf77b2b3655dc5ae2e015ee4b789e301a9e2f200 -- '*lock*'` was empty.
- The contributor commands formerly in the README are represented by the stricter format, Clippy, rustdoc, and all-target/all-feature test commands above.
- No retained machine-readable artifact was required.

## Notable Events

Record an event when a hypothesis is falsified, three similar attempts fail, substantial effort is lost, human intervention is needed, a workaround appears, or a reusable technique is discovered.

| Type | Attempt or event | Evidence | Impact | Resolution or state | Reusable lesson |
| --- | --- | --- | --- | --- | --- |
| Product bug | `BlobDirectory::decode` added framing bytes directly to an untrusted `u32` name length after converting it to `usize`. On 32-bit targets, `u32::MAX + 33` can overflow and panic instead of returning the documented malformed-input error. | Static audit of `name_length + 1 + CONTENT_ID_BYTES`; retained boundary assertion passes `u32::MAX` with no body and expects `BlobTreeError::TruncatedDirectory`. | Malformed bytes could panic a 32-bit decoder. Native 64-bit behavior was already an error. | Replaced the addition with `checked_add`; all required native checks pass. | Length-prefixed decoders should checked-add framing overhead even when the encoded length itself converts successfully. |
| Workaround | Validation runners collided with concurrent worktrees. Some delegated or persistent-shell commands reported another worktree or received `^C` during dependency compilation. | Rejected attempts reported sea-compression, sea-stateful-compression, sea-content-addressed, sea-memory, or unrelated process output; no such output was accepted as sea-core evidence. Absolute-path guards repeatedly confirmed the assigned checkout itself remained on the correct branch. | Delayed focused validation; no wrong-worktree files were edited by this workstream. | Absolute `git -C` and Cargo `--manifest-path` arguments prevented path dependence. `setsid --fork --wait`, `CARGO_BUILD_JOBS=1`, and a workstream-specific target directory isolated the final compiler processes; all required checks then passed. | Concurrent worktree validation should use absolute paths and isolated process sessions when terminal process groups are shared. |

## Contract and Integration Friction

No contract or integration friction. The workstream changed no public API,
dependency, shared semantic, or persisted format.

## Human Interventions

None.

## Measurements

- Implementation diff: 83 additions and 15 deletions across four crate files.
- Tests: 7 passed in the Linux development container with the pinned Rust toolchain.
- Elapsed wall-clock interval: 10 minutes 10 seconds from recorded start to report completion metadata.
- Performance, binary size, and dependency measurements: not applicable; no performance path or dependency changed.

## Proposed Decisions

No shared decision is proposed.

## Candidate Skills and Process Changes

Candidate coordination guidance: when concurrent worktree commands visibly cross
terminal process groups, use absolute `git -C`/`--manifest-path` guards and run
compiler commands under `setsid --fork --wait` with a workstream-specific
`CARGO_TARGET_DIR`. This converted repeated interrupted builds into reproducible
successful validation without touching repository state.

## Remaining Work and Risks

No required work remains and no intentional uncommitted artifact remains after
the report commit. The overflow regression was not executed on a 32-bit target;
its native test verifies the intended malformed-input result, while the
`checked_add` removes the target-dependent panic mechanism directly. Additional
one-test-per-variant coverage for straightforward `BlobDirectory::decode` errors
would be low value and was intentionally omitted from this scattershot pass.

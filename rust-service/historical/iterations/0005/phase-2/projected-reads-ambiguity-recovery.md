# Iteration 0005: projected-reads-ambiguity-recovery Report

Status: complete
Branch: `rust-service-iteration-0005-projected-reads-ambiguity-recovery`
Worktree: `/workspaces/FluidFramework-rust-service-iteration-0005-projected-reads-ambiguity-recovery`
Base commit: `c9106df9d9b615859fc855b28859621ac02a433f`
Final commit: implementation `9b15ed0fb0dcada2efdf59e8cfe2028ae4b55ab9`; report in this commit
Agent or owner: GitHub Copilot, assigned iteration `0005` implementation agent
Model and tool version: GitHub Copilot; model and tool version unknown
Instruction source: [projected-reads-ambiguity-recovery instructions](instructions/projected-reads-ambiguity-recovery.md) at `c9106df9d9b615859fc855b28859621ac02a433f`
Session or transcript reference: none
Started and finished: `2026-09-12T19:44:23+00:00` to `2026-09-12T20:07:25+00:00`

## Outcome

Implemented [Decision 0007](../../../decisions/0007-projected-reads-and-ambiguity-recovery.md) with high confidence. `fluid-sequencer` now owns accepted-operation projection and bounded canonical scanning; FSP4 exposes additive projected-read and explicit resolution messages; the native service maps them without exposing FSQ2; and the native client performs explicit resolution with no automatic submit replay. Existing raw reads and FSP4 version `1` behavior remain compatible.

## Hypothesis Results

Supported. The existing authoritative sequencer replay path projects accepted operations without kernel payload knowledge and resolves stable identities without append. `projected_pages_advance_across_administrative_records` and `projected_pages_are_byte_bounded_without_skipping` prove opaque exact resume through filtered spans. `explicit_resolution_is_idempotent_authorized_and_append_free` and `disconnect_boundaries_resolve_without_hidden_retry` prove committed/not-committed outcomes, repeated/lost-response resolution, restart, ownership rejection, and no duplicate canonical append.

## Deliverables and Commits

- `9b15ed0fb0dcada2efdf59e8cfe2028ae4b55ab9` (`feat(rust-service): add projected reads and recovery`): projected operation/page API; additive FSP4 codecs; native service handlers; explicit client lifecycle; unit and process tests.
- This report commit: completed evidence and dependent-workstream handoff.

## Validation Evidence

All commands ran from `/workspaces/FluidFramework-rust-service-iteration-0005-projected-reads-ambiguity-recovery/rust-service` on branch `rust-service-iteration-0005-projected-reads-ambiguity-recovery`, implementation HEAD `9b15ed0fb0dcada2efdf59e8cfe2028ae4b55ab9`, with `CARGO_TARGET_DIR=/tmp/fluid-rust-iteration-0005-projected-reads-target`.

- `cargo fmt --all -- --check`: passed.
- `cargo test -p fluid-sequencer -p fluid-service-protocol -p fluid-native-service -p snapshotted-stream-client --all-targets`: passed; service 7/7, sequencer 11 passed plus one intentionally ignored worker entry invoked by its parent process test, protocol 6/6, client unit 13/13, client process 2/2. No failures.
- `cargo clippy -p fluid-sequencer -p fluid-service-protocol -p fluid-native-service -p snapshotted-stream-client --all-targets --all-features -- -D warnings`: passed.
- `cargo test -p fluid-sequencer projected_pages_are_byte_bounded_without_skipping -- --nocapture`: passed 1/1.
- `cargo test -p fluid-service-protocol projected_and_resolution_frame_sizes_are_measured -- --nocapture`: passed 1/1 and printed `projected_request=43 projected_response=114 resolution_request=67 resolution_response=42`.
- `disconnect_boundaries_resolve_without_hidden_retry`: passed a Unix-socket process trace covering disconnect before commit, authoritative `NotCommitted`, caller-triggered retry, disconnect after commit, service restart, and authoritative `Committed` without submit replay.
- `git diff --check`: passed. `git diff -- rust-service/Cargo.toml rust-service/Cargo.lock` was empty before the implementation commit.

## Notable Events

Record an event when a hypothesis is falsified, three similar attempts fail, substantial effort is lost, human intervention is needed, a workaround appears, or a reusable technique is discovered.

| Type | Attempt or event | Evidence | Impact | Resolution or state | Reusable lesson |
| --- | --- | --- | --- | --- | --- |
| Validation environment | A delegated focused service test ran in the browser-WASM sibling despite an explicit assigned path. | It printed `/workspaces/FluidFramework-rust-service-iteration-0005-browser-wasm-client-package` and failed in that sibling's wrapper crate. | The result was discarded and did not inform implementation status. | Re-ran directly with absolute `cd`; both service tests passed in the assigned checkout. | Always inspect printed identity before accepting multi-worktree command evidence. |
| Falsified test setup | The first administrative-page test expected `has_more=true` before a later operation existed. | Full package test failed only `projected_pages_advance_across_administrative_records`. | Exposed an invalid fixture expectation, not a projection defect. | Appended the operation before reading the bounded first page; full tests passed. | Pagination fixtures must establish the complete canonical span before asserting continuation. |
| Compatibility adaptation | The existing client process trace expected ambiguity recovery to replay `Submit`. | It failed with actual `ResolveSubmission`. | Confirmed the legacy trace encoded the behavior Decision 0007 replaces. | Added explicit `retry_not_committed`; the process trace now resolves first and retries only after authoritative `NotCommitted`. | Separate resolution from caller-owned retry in lifecycle APIs and tests. |
| Lint-driven refactor | Additive protocol arms exceeded strict line-count lint and the committed outcome created a large enum variant. | Initial strict Clippy failed with `too_many_lines` and `large_enum_variant`. | No behavioral defect; blocked required validation. | Extracted request/projected/resolution codec helpers and boxed the committed result; strict Clippy passed. | Additive protocol dispatch should delegate codecs before central matches become lint failures. |

## Contract and Integration Friction

Dependent workstreams can consume these additive FSP4 contracts while retaining `VERSION = 1`: request kinds `8` (`ReadProjected`) and `9` (`ResolveSubmission`), response kinds `68` (`ProjectedRead`) and `69` (`Resolved`). Existing kinds and the stable create fixture are unchanged.

`ProjectedRead` returns accepted operations with canonical opaque `position`, sequence/minimum-reference metadata, writer/session/submission identity, local sequence, reference, payload, an opaque page `cursor`, and `has_more`. Empty administrative-only pages may carry an advanced cursor. Service pages scan at most 1024 canonical records and use a 768 KiB projected-operation budget.

`ResolveSubmission` requires document, writer, session, and submission identity. Results are `Committed`, `NotCommitted`, or `StillUncertain`; wrong writer/session is rejected. Resolution never appends. Client `recover_ambiguous` creates only this request; `retry_not_committed` is the explicit caller action that can resend pending work after an authoritative negative result.

Raw `Read` remains for compatibility/diagnostics but is not the Fluid driver contract. No kernel trait, storage implementation, root manifest, or lockfile changed.

## Human Interventions

None during implementation. The accepted Decision 0007 and assigned instruction supplied the shared semantics.

## Measurements

- Environment: Debian GNU/Linux 13 container; `rustc 1.98.1 (48a229cea 2026-09-01)`; `cargo 1.98.1 (797e8a9bc 2026-08-05)`; isolated target directory `/tmp/fluid-rust-iteration-0005-projected-reads-target`.
- FSP4 fixture sizes including the 20-byte header: projected request 43 bytes; one-operation projected response 114 bytes; resolution request 67 bytes; committed resolution response 42 bytes.
- Bounds: 1024 canonical records and 768 KiB projected-operation budget per service page; protocol retains the 1 MiB frame, 1024-record, 512 KiB payload, and identity/position limits.
- Dependencies: no dependency, manifest, or lockfile changes.
- Performance: not benchmarked; optimization was explicitly out of scope. Focused tests completed in under one second of reported test/build time after warm compilation.

## Proposed Decisions

No new shared decision. The implementation follows [Decision 0007](../../../decisions/0007-projected-reads-and-ambiguity-recovery.md).

## Candidate Skills and Process Changes

Candidate coordination improvement: when delegated validation returns a checkout identity different from the requested absolute path, automatically mark the result invalid and rerun directly before interpreting compiler or test output. This is supported by the discarded browser-WASM sibling result above.

## Remaining Work and Risks

- Browser-WASM and TypeScript consumers must add codecs/bindings for the new variants; the API details above are the handoff.
- Blob/summary protocol integration may now build on request kinds above `9` and response kinds above `69`; it must preserve existing kind values.
- `StillUncertain` is codec- and lifecycle-tested, while the durable native service's current storage does not expose a deterministic injection hook for that transient replay result. Committed/not-committed and restart behavior have process evidence.
- Projection currently replays the finite canonical log for each request. Correctness and bounds are tested; indexing/performance optimization remains future work.
- No required work remains in this workstream, no stopping condition occurred, and no intentional uncommitted artifact remains after the report commit.

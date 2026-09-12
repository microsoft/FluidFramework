# Iteration 0001: fluid-sequencer Report

Status: complete
Branch: `rust-service-iteration-0001-fluid-sequencer`
Worktree: `/workspaces/FluidFramework-rust-service-iteration-0001-fluid-sequencer`
Base commit: `bd21af608ff051906d9449cea33704d685b0251b`
Final commit: report completion commit containing this file; its self-referential hash is reported by the coordinator and in the final response
Agent or owner: GitHub Copilot Fluid sequencing feasibility agent
Model and tool version: GitHub Copilot; model and tool version unknown
Instruction source: [`instructions/fluid-sequencer.md`](instructions/fluid-sequencer.md) at `bd21af608ff051906d9449cea33704d685b0251b`, corrected by the user request to the actual kickoff and branch below
Session or transcript reference: none
Started and finished: 2026-09-12T14:17:48+00:00; 2026-09-12T14:24:19+00:00

## Outcome

Implemented the smallest deterministic replay model for framed Fluid-like submissions. The spike carries writer identity, writer-local sequence number, opaque reference stream-position token, and payload; replay assigns final sequence metadata, tracks active-writer minimum references, and rejects malformed frames, duplicate or gapped local order, unknown/future/self references, stale references, unknown writers, and duplicate stream positions. Five focused tests cover framing, two-writer ordering, duplicate/gap/stale behavior, minimum advancement, and post-commit rejection.

Confidence is high for the scoped feasibility result: opaque append order is sufficient to derive deterministic final metadata after commit. It is not sufficient for authoritative pre-commit protocol acceptance, an append receipt that means Fluid acceptance, or a canonical stored record that already contains final metadata.

## Hypothesis Results

Initial hypothesis: immutable self-framed submissions can validate writer-local continuity and reference positions above opaque appends, but independent writers cannot deterministically assign one canonical final sequence number from an observed head without a designated sequencer or a primitive that atomically binds assigned metadata to the append position. The cheapest discriminating check was a deterministic two-writer test in which both writers derive metadata from the same observed head.

The broad hypothesis was partially falsified. `committed_order_deterministically_assigns_final_sequence_metadata` proves that independent readers replaying the same committed records derive identical gap-free final sequence numbers without conditional append. Final metadata therefore need not be stored in or known before the original append when a derived projection is acceptable.

The narrower service-contract concern was supported. `protocol_rejection_is_only_known_after_opaque_append_commits` minimizes a writer-local gap whose kernel append has already succeeded before replay rejects it. Opaque `AppendReceipt` therefore cannot mean protocol acceptance, rejected frames remain in the raw stream, and final metadata cannot be returned atomically with that receipt. A valid-only authoritative Fluid log needs one service-side sequencer protected by exclusive/fenced ownership, or a generic conditional append such as `append_if_head(expected_head, value)` so multiple sequencer instances cannot validate against the same predecessor and both commit conflicting finalized state.

## Deliverables and Commits

- `e75220a89c57f64595a0fdaa29febae80437eb1f` - `feat(rust-service): spike fluid sequencing projection`
- Binary `FSQ1` submission framing with strict decode validation.
- Deterministic `Sequencer` replay state for final sequence assignment, writer-local ordering, reference validation, active-writer minimum tracking, and leave behavior.
- Five minimized unit tests, including the authoritative-acceptance counterexample.
- This report completion commit, listed by hash in the final response because a commit cannot contain its own hash.

## Validation Evidence

- `cargo fmt --all -- --check` - passed after formatting.
- `cargo test -p fluid-sequencer --all-features` - passed: 5 unit tests, 0 failures; 0 doc tests.
- `cargo clippy -p fluid-sequencer --all-targets --all-features -- -D warnings` - passed with no diagnostics after replacing one internal `expect` with a guarded mutation.
- `git diff --check` - passed.
- `Cargo.lock` remained byte-for-byte unmodified; no disposable-copy validation was needed.
- Workspace tests are intentionally deferred to integration as assigned.

## Notable Events

Record an event when a hypothesis is falsified, three similar attempts fail, substantial effort is lost, human intervention is needed, a workaround appears, or a reusable technique is discovered.

| Type | Attempt or event | Evidence | Impact | Resolution or state | Reusable lesson |
| --- | --- | --- | --- | --- | --- |
| Human intervention / coordination | The generated instruction names base `59f5069b43a6f2ede193f5affa8cda3a267628ff` and slash branch `rust-service/iteration-0001/fluid-sequencer`; the user supplied actual kickoff `bd21af608ff051906d9449cea33704d685b0251b` and branch `rust-service-iteration-0001-fluid-sequencer` because branch `rust-service` occupies the slash ref namespace. | At start, `HEAD`, merge-base with the supplied kickoff, and the instruction-file commit were all `bd21af608ff051906d9449cea33704d685b0251b`; `git branch --show-current` returned the hyphenated branch; worktree was clean. | Provenance in the generated instruction is stale and cannot be followed literally. | Use the observed worktree, hyphenated branch, and user-confirmed kickoff; do not modify the read-only instruction. | Validate branch refs and actual kickoff when starting a workstream; record deviations in the owned report before implementation. |
| Hypothesis partially falsified | Replayed two writers that both referenced the initial position and appended in a fixed committed order. | `committed_order_deterministically_assigns_final_sequence_metadata` produced identical sequence numbers 1 and 2 in independent replay states. | Conditional append is not required merely to derive final order after commit. | Keep final sequence metadata in a deterministic projection for this spike. | Separate derived read metadata from authoritative write acceptance when evaluating kernel sufficiency. |
| Shared-contract limitation | Submitted a writer-local gap and then replayed the already committed opaque record. | `protocol_rejection_is_only_known_after_opaque_append_commits` rejects the gap while permitting a later frame to reference that committed raw position. | Kernel append success cannot serve as Fluid protocol acceptance; invalid records consume raw positions and same-record final metadata is unavailable. | Minimized and documented for Phase 3; no shared API was changed. | Full authoritative sequencing needs a service boundary and concurrency control, not payload interpretation in the opaque kernel. |
| Position integration gap | Framing needs stable opaque reference tokens, while core only advertises `Capability::PositionSerialization`. | `AppendStream::Position` has no encode/decode operation; the spike therefore accepts `PositionToken` values supplied by its integration boundary. | A generic adapter cannot obtain wire-safe reference tokens through current public traits. | Keep tokens opaque locally and report the missing codec contract. | A capability flag must have an accompanying operation before an independent adapter can consume it. |

## Contract and Integration Friction

- `Capability::PositionSerialization` has no corresponding serialization/deserialization API. Phase 3 must either add a focused position codec capability or explicitly require concrete transports to provide opaque `PositionToken` values to this adapter.
- The current kernel supports deterministic post-commit projection but not authoritative acceptance. If rejected raw records are acceptable and clients receive sequencing acknowledgements asynchronously from one replay service, no kernel change is required.
- If append success must mean protocol acceptance, rejected records must not enter the canonical stream, or finalized metadata must be stored atomically, Phase 3 needs a service-side sequencer. Multiple service instances additionally need `append_if_head(expected_head, value)` or equivalent fencing/exclusive ownership; plain `head` followed by `append` races.
- Active writer membership is in-memory and supplied through `join`/`leave`; durable framed membership, reconnect identity, eviction, checkpoint recovery, and sequencer acknowledgement transport are intentionally not specified by this spike.
- The model ranks opaque positions by observed replay order with linear lookup. This is sufficient for deterministic tests, not a performance design.

## Human Interventions

The user corrected kickoff provenance to `bd21af608ff051906d9449cea33704d685b0251b` and supplied the hyphenated branch because the generated slash branch was impossible under the existing `rust-service` ref. No semantic or implementation intervention was required.

## Measurements

- Source: 618 lines in `src/lib.rs`: 386 lines before `#[cfg(test)]` and 232 test-region lines. Implementation commit: 617 insertions, 4 deletions in one file.
- Direct dependencies: `bytes` and local `snapshotted-stream-core`; no dependency or manifest changes. The normal transitive tree contains 7 unique external crates: `async-trait`, `bytes`, `futures-core`, `proc-macro2`, `quote`, `syn`, and `unicode-ident`, plus the local core crate.
- Performance, bundle size, persisted size, and runtime memory: not applicable to this semantic feasibility spike.
- Effort/token measurements: unknown.
- Environment: commit `e75220a89c57f64595a0fdaa29febae80437eb1f`; Rust/Cargo 1.98.1; Debian GNU/Linux 13; Linux 6.8.0-1064-azure x86_64; 32 CPUs reported, AMD EPYC 7763; 131899392 kB host memory reported; ext4 workspace filesystem.

## Proposed Decisions

No decision record was created because decisions are read-only in this workstream. Phase 3 should decide separately:

1. Whether Fluid sequencing is defined as a derived projection over an append stream that may contain rejected frames, or as authoritative service acceptance with a valid-only canonical log.
2. Whether to add a focused opaque-position codec operation corresponding to `Capability::PositionSerialization`.
3. If authoritative acceptance is required, whether deployment guarantees one fenced sequencer or the kernel gains an optional compare-and-append capability. Payload-aware storage and mutation of committed records are not recommended.

## Candidate Skills and Process Changes

Add a kickoff preflight to the coordination procedure: verify that every requested branch can be created under Git ref namespace rules, record `git rev-parse HEAD` for each worktree, and update generated provenance before dispatch. Trigger this when a repository already has a branch whose name is a prefix of planned slash branches.

## Remaining Work and Risks

- Integrate and run `cargo test --workspace --all-targets --all-features` on the iteration branch.
- Decide the authoritative-versus-derived sequencing contract before implementing networking, acknowledgements, retries, or durable sequencing checkpoints.
- Define the position token codec boundary; generation scoping and malformed/cross-generation tokens must remain the underlying implementation's responsibility.
- If Phase 3 selects authoritative sequencing, test the smallest optional `append_if_head` contract against two sequencer instances. A single-process mutex is not sufficient evidence for a distributed service.
- Add durable framed join/leave and replay checkpoints only after that contract decision. Reconnect/resubmission and duplicate payload identity remain intentionally deferred.
- Confidence: high for deterministic projection and the minimized acceptance limitation; medium for the proposed compare-and-append shape until exercised by a service implementation.

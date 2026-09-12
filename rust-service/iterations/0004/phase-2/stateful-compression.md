# Iteration 0004: stateful-compression Report

Status: in progress
Branch: `rust-service-iteration-0004-stateful-compression`
Worktree: `/workspaces/FluidFramework-rust-service-iteration-0004-stateful-compression`
Base commit: `30c4a06d7b456e135e046905553dd23d14326a56`
Final commit: <!-- TODO(required): record the final commit or explain why none exists -->
Agent or owner: GitHub Copilot stateful-compression coding agent
Model and tool version: GitHub Copilot; model version unknown; rustc 1.98.1; cargo 1.98.1
Instruction source: [`instructions/stateful-compression.md`](./instructions/stateful-compression.md) at actual kickoff commit `30c4a06d7b456e135e046905553dd23d14326a56`; its generated `Iteration source commit` field is `a577eda313ebe68f6e8ba3e33e99ea0822a50d9a`
Session or transcript reference: none
Started and finished: 2026-09-12; in progress

## Outcome

In progress. The adaptive previous-record design was rejected before implementation because the public contract provides no bounded predecessor traversal from `head`; rebuilding encoder state after reopen would require `read(None)` over all retained history and would fail when retention removes that history. The implementation experiment therefore uses a caller-supplied immutable bounded dictionary and independent frames so every stored record remains directly decodable.

## Hypothesis Results

Initial hypothesis: an immutable caller-supplied dictionary, bounded by configuration and copied into each encoder/decoder operation, can improve repeated multi-record compression relative to independent zlib frames while preserving arbitrary-position reads, receipts, positions, record boundaries, snapshots, retention assumptions, and corruption classification. Each stored payload remains an independent frame; no prior record or retained prefix is required.

Cheapest disproof: run the shared conformance function directly over the wrapper, append a deterministic trace and resume after every returned position, reopen the wrapper over the same store, and repeat reads around snapshot and configured dictionary boundaries. Any changed receipt/position, missing or duplicate record, unavailable-history dependency, unbounded configured dictionary, or non-`Corrupt` malformed-frame result falsifies transparency. Identical seeded workloads compare persisted bytes and decoded values against per-record zlib.

## Deliverables and Commits

<!-- TODO(required): list deliverables and ordered commits -->

## Validation Evidence

<!-- TODO(required): list exact commands, outcomes, relevant test names, and retained machine-readable output -->

## Notable Events

Record an event when a hypothesis is falsified, three similar attempts fail, substantial effort is lost, human intervention is needed, a workaround appears, or a reusable technique is discovered.

| Type | Attempt or event | Evidence | Impact | Resolution or state | Reusable lesson |
| --- | --- | --- | --- | --- | --- |
| Falsified design | Adaptive dictionary derived from preceding records | `AppendStream::head` returns only an opaque position and `read` supports forward reads; reopening cannot recover a bounded predecessor window without reading from the retained beginning. Retention may make earlier dictionary inputs unavailable. | A prior-record adaptive context would require unbounded replay or undocumented retention and cannot satisfy the stopping conditions. | Rejected before implementation; test the immutable bounded dictionary design instead. | For transparent random-access wrappers, derive decode state solely from immutable configuration and the selected physical record unless the storage contract explicitly exposes restart metadata and bounded predecessor access. |

## Contract and Integration Friction

<!-- TODO(required): record shared API limitations, cross-workstream dependencies, and undocumented exceptions; write none when there were none -->

## Human Interventions

<!-- TODO(required): record decisions or corrections supplied by a person and why they were needed; write none when there were none -->

## Measurements

<!-- TODO(required): report applicable performance, size, dependency, and effort measurements with environment metadata; mark non-applicable fields -->

## Proposed Decisions

<!-- TODO(required): link decision records or state that no shared decision is proposed -->

## Candidate Skills and Process Changes

<!-- TODO(required): describe reusable triggers and procedures, supported by the event above; write none when there were none -->

## Remaining Work and Risks

<!-- TODO(required): enumerate unfinished work, intentional artifacts, confidence, and recommended next instructions -->

# Decision 0020: File Storage Execution Policies

Status: accepted
Date: 2026-09-22
Iteration: lightweight follow-up
Owners: Craig Macomber and GitHub Copilot
Supersedes: none
Superseded by: none

## Context

The corrected byte-offset journals and independent checkpoints remove history-sized publication work.
Filesystem mutations and historical reads still need executor isolation, and buffered comparison workloads need explicit bounded write-behind rather than durable scheduling without fsync.
The user approved these semantics and one crate with distinct execution policies in the [implementation plan](../../FILE_STORAGE_REFACTOR_PLAN.md).

## Decision Drivers

Preserve journal bytes, literal event positions, dependency closure, durable barriers, and uncertainty semantics.
Keep executor polling responsive, retain accepted work through cancellation, bound queued storage state, and make orderly persistence explicit.
The server must accept arbitrary `SeaStorage` implementations without backend-specific dispatch.

## Options and Evidence

Per-operation blocking tasks isolate synchronous I/O but do not provide buffered coalescing or an explicit drain contract.
A permanently running worker per document scales poorly for idle namespaces.
Platform-specific asynchronous file runtimes add portability and integration cost without replacing the need for these storage contracts.
The selected bounded Tokio blocking implementation shares format mechanisms and has independently owned buffered and durable admission policies.

## Decision

Consolidate file storage into `sea-file` with common, buffered, and durable modules and concrete factories.
Buffered success acknowledges process-local publication before OS writes; bounded ordered draining preserves healthy dependencies and final offsets.
Capacity waiting is bounded, cancellable before acceptance, and terminal on background failure.
Durable accepted work retains ordering and ownership after caller cancellation and acknowledges only after required synchronization.
`SeaStorage::flush` establishes orderly persistence and `shutdown` additionally fences file-backend admission.
Host lifecycle uses a generic storage adapter; concrete selection occurs only at built-in construction.

## Consequences

Buffered crash or disk failure can lose acknowledged history, defeat client resubmission, or prevent recovery.
It remains a testing/demo/comparison backend, not production persistence.
Flush includes storage work but does not release separately retained components or streams, and deadlines cannot cancel running syscalls.
The retired durable crate is replaced by `sea_file::DurableStorage`; existing byte-offset journal data remains compatible.
Read outputs and caller-owned memory are outside queue memory budgets.

## Validation and Follow-Up

File tests exercise backpressure, cancellation, shutdown, publication, failure poisoning, recovery, and stable lock ownership.
Host tests exercise injected storage and shared generic lifecycle dispatch.
Matched pipeline measurements include final buffered draining rather than comparing only early acknowledgments against durable synchronization.
Filesystem/device power-cut qualification and the separately recorded unexplained native/browser timeouts remain open.
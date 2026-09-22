# File Storage Execution Refactor Plan

Status: Proposed; implementation has not started.
Written on 2026-09-22 against `sea-directory-dedup` at `9f22810a2f0`, including directory deduplication commit `b272851e8e3`.
Reconcile this plan with intervening journal, checkpoint, and protocol changes before implementation; do not overwrite concurrent work or treat this checkout as the integration target.
Reconciled on 2026-09-22 with corrected checkpoint implementation `f59c3ca14a4` on `rust-service`, superseding the index-based integration at `521a8362e42`.
Use that corrected baseline or its successors: independent `CheckpointStore`, hash-addressed content, byte-offset events, fixed-size journal cursors, and protocol 11 allocated session IDs.

## Objective

Separate buffered and durable execution policies without creating two independently maintained journal formats or recovery validators.
Keep buffered storage simple and low-overhead, while allowing durable storage to coordinate synchronization, admission, batching, cancellation, and shutdown.
Buffered storage is a testing/demo backend and a comparison point between memory and durable storage, not a backend designed to recover reliably from disk errors or crashes.
Adopt bounded in-process write-behind buffering for it, with explicit flushing on orderly shutdown.
Both modes must keep potentially slow filesystem operations and blocking lock waits off async executor threads.

This refactor changes buffered acknowledgment from completed operating-system writes to admission and publication in a bounded process-local buffer.
It preserves durable storage guarantees, document identities, content hashes, journal encoding, and the wire protocol.
It does not promise constant synchronization latency or production-qualified durability on untested filesystems.

## Starting Point

- [File storage](crates/sea-file/src/storage.rs) uses `FileStorage<const DURABLE: bool>` and shared component types, state, and journal ownership.
- [Durable storage](crates/sea-file-durable/README.md) builds on that implementation, with synchronization and recovery behavior selected by mode.
- Event batches already run on blocking workers, retain the opening after cancellation, and release the published-state lock during disk input/output (I/O).
- Namespace initialization, creation/recovery, blob/directory writes, and snapshot writes remain synchronous storage barriers.
- The [built-in host](crates/sea-webtransport-server/README.md) isolates initialization and creation/recovery on blocking workers, but direct storage callers do not receive that isolation automatically.
- Stored-directory deduplication already avoids the writer lock and repeated child validation; preserve this fast path.
- [Checkpoint recovery](CHECKPOINT_PLAN.md) restores opaque internal sequencer state and session-ID reservations through an independent `CheckpointStore`, not `SnapshotArchive`.
- Content uses typed-hash files, events use literal journal byte offsets, and snapshots use a separate fixed-width journal with backward lookup.
- Each journal has a fixed-size settled-tail cursor; no historical address table is persisted or rebuilt.
- Historical payload reads, content membership checks, cursor publication, and checkpoint publication can perform synchronous I/O.

The [timeout investigation](KNOWN_ISSUES.md#intermittent-native-connection-timeout) established executor starvation and unnecessary cross-filesystem synchronization as real problems.
It did not attribute every historical timeout or the durable backend's steady-state benchmark variance to those problems.

## Architecture

### Crate And Module Layout

Keep both backends in `sea-file`, organized into three implementation modules:

```text
sea-file/src/
   lib.rs
   common/       # Journal, recovery validation, ownership, published state
   buffered/     # Buffered factory, components, execution policy
   durable/      # Durable factory, components, coordinator, synchronization
```

Use module files or directories according to implementation size; the layout describes ownership rather than requiring an immediate file split.
Both backend modules depend on `common`, which depends on neither backend.
Neither backend delegates its execution policy to the other.
Keep shared machinery private, with `pub(crate)` or narrower visibility where needed, and expose operations that preserve invariants rather than unrestricted mutable state.
Keep filesystem mechanics out of `sea-core` and the durable coordinator inside `durable`.

Native file storage does not need separate crates to minimize WebAssembly dependencies.
Do not add a shared-mechanism or scheduler crate for this refactor.
Reconsider crate separation only for a demonstrated need such as independent consumers, distinct platform dependencies, or material build isolation.

Expose `FileStorage` and `DurableStorage` from `sea-file`, with backend component types available where callers require them.
Preserve existing import paths through re-exports during migration where feasible.
Temporarily retain `sea-file-durable` as a thin re-export facade, then remove it after migrating supported callers, tests, documentation, and workspace dependencies.
Move its durable-specific tests and power-loss documentation into `sea-file` before removing the crate.

### Shared Mechanisms

Keep one implementation of journal framing, checksums, record encoding/decoding, dependency-closure validation, and recovered-state validation.
Include typed-hash content lookup, byte-offset framing and traversal, fixed-width snapshot traversal, settled-tail cursor validation, and atomic-file replacement in the shared mechanisms.
Keep opaque checkpoint payload handling separate from journal recovery; storage must not interpret sequencer state or reconstruct a historical address table.
Share document identity and handle provenance rules, file-lock ownership primitives, error classification, and published-state/read notification mechanics where their contracts match.
Share recovery parsing, but keep decisions about incomplete-tail repair and required synchronization explicit in the selected backend policy.

Extract narrow operations for validation/preparation, journal work, and publication.
These operations must preserve one mutation order, but publication timing is backend-specific: buffered publishes on admission, while durable publishes after synchronization.
Buffered workers persist the admitted order; durable writers must not validate against stale state and then publish out of order while the state mutex is released for I/O.
Prefer concrete internal types and existing modules over a general storage-provider or I/O abstraction framework.

Keep the public `FileStorage` and `DurableStorage` entry points and `SeaStorage` contracts where possible.
Inventory explicit const-generic uses, associated component types, re-exports, and error types before changing their implementation.
A compatibility facade may be needed during migration; do not assume replacing a type alias with a distinct type is source-compatible.
Migrate explicit `FileStorage<true>` callers to `DurableStorage` and explicit `FileStorage<false>` callers to the buffered type as the const-generic facade is retired.
Extract shared operations incrementally into `common`; do not move the whole combined engine there unchanged.

### Buffered Execution

Use an ordered, bounded write-behind queue per document, with short-lived drain workers and no synchronization barrier or batching timer.
When capacity is available, validate, enqueue, and publish the mutation in a short in-memory operation, then return success to the sequencer without awaiting file I/O or worker execution.
Admission and publication must be atomic with respect to other mutations and worker failure state.
Backpressure may suspend admission; no per-append worker round trip belongs on the successful admission path.
Starting or notifying a worker still has a cost, so schedule on idle-to-active transitions and amortize dispatch over a drain batch.
Coordinate worker exit with enqueueing so a racing submission cannot be stranded without a worker.

Reads, heads, and availability handles reflect admitted in-memory state, including content not yet written to the operating system.
Order blobs, directories, events, and snapshots through the same document authority so workers persist dependencies before references.
Keep deduplication of resident content in memory and preserve normal input validation; weak crash guarantees are not permission to reorder records or accept missing dependencies during healthy operation.
For nonresident content, isolate hash-addressed file lookup I/O rather than assuming all deduplication is memory-only.
Preserve a no-worker-round-trip admission path when dependencies are already resident; measure historical lookup misses separately.

Assign final event byte offsets and predecessor offsets during ordered admission, using exact encoded frame sizes and checked arithmetic.
Track the logical reserved journal end separately from the written end; batching must not change offsets already returned to the sequencer.
Reject invalid inputs before reserving visible positions, and fail the opening rather than reuse or renumber acknowledged offsets after a worker error.
Retain bounded pending records so reads can span the disk prefix and admitted suffix without gaps or duplicates while workers drain them.
Include those records and encoding buffers in memory accounting; evict pending records only once file-backed reads can serve them.

Workers take the pending backlog up to a byte/work limit and encode/write it as one logical batch, continuing as needed with fairness between documents.
Short writes can require multiple system calls; a batch is not an atomic disk write.
Bound queued and in-flight requests and bytes, retain their budget until written or failed, and bound worker concurrency.
Define oversized-input behavior and avoid unbounded waiting tasks retaining payloads outside the queue budget.
Track the written prefix separately from the admitted/published prefix for flushing and diagnostics.
Do not route buffered operations through the durable synchronization coordinator merely to share scheduling code.

### Buffered Failures And Shutdown

Buffered success means the backend owns an in-memory mutation, not that the operating system has accepted it or that it will survive a process exit.
A crash, forced shutdown, or later disk error can lose acknowledged events and their dependencies, leave an incomplete/corrupt journal, or prevent reopening.
Clients may already have discarded resubmission state or relied on snapshots and blob handles whose data was never persisted.
Neither client resubmission nor snapshot recovery is guaranteed to repair such failures.
Document these limitations prominently in the backend guide and acknowledgment contract, not only in benchmark notes.

On a background write failure, stop admission for that opening, record a terminal error, and wake pending admissions and flush/shutdown waiters.
Fail subsequent authoritative operations rather than continue to acknowledge an unwritable backend.
Previously returned successes cannot be retracted; this failure signaling is diagnostic, not a recovery or durability guarantee.
Do not silently drop failed work, retry uncertain appends, or continue writing dependent records after a failed prefix.

Provide an awaitable flush that captures an admitted prefix and completes only once all its records have been written to the operating system, or returns an error.
Orderly shutdown stops new admission across retained documents, drains all accepted work, reports failures, and releases ownership only after workers settle.
Wire this into the host's actual shutdown path and direct-caller lifecycle; `Drop` or stopping the listener alone is not an async flush contract.
Buffered flush does not require `fsync` and does not promise power-loss safety.
A shutdown deadline that expires must report incomplete shutdown, not successful flushing; forced termination can discard the remaining buffer.

### Durable Execution

Use one ordered mutation queue per open document, serviced by a bounded number of blocking workers across a defined storage scope.
Prefer short-lived drain workers over one permanently blocked thread per idle document.
Do not hold a global worker permit while waiting for another operation on the same document, or for work that needs that permit to complete.
Keep cold initialization/recovery from indefinitely starving active-document writes, and bound each drain turn to avoid hot-document monopolization.

Queue content, directory, event, and snapshot mutations through the same document ordering authority.
Internal checkpoint and session-reservation publication also participate in this ordering.
Retain the state-only deduplication path, including its failure checks, without queueing a redundant write.
Publish newly written state and issue success only after the required synchronization succeeds.
Readers may observe the prior published prefix during disk I/O; newly queued or unsynchronized content must not produce availability handles.

Bound admission by both request count and retained payload bytes, including in-flight work.
Specify limits, resource scope, oversized-request handling, and whether admission waits or rejects before implementation.
Avoid an unbounded population of tasks retaining payloads while waiting for a nominally bounded queue.
Account for caller-owned and transport-buffered memory separately rather than claiming the queue bounds total process memory.

Start with existing explicit event batches and no deliberate batching delay.
Once ordering and failure behavior are proven, consider coalescing consecutive compatible requests into one synchronization.
Do not reorder across content dependencies or snapshots, and do not acknowledge any member before the covering synchronization succeeds.

### Checkpoint, Cursor, And Read Integration

Preserve the independent `CheckpointStore` capability and its component/view plumbing; do not move checkpoint methods back onto `SnapshotArchive`.
The checkpoint remains an opaque payload whose logical replay boundary belongs to the sequencer.
Preserve the minimal `SEAC3` state: explicit applied boundary, committed minimum-reference floor, allocation high-water mark, and outstanding announcements.
The lag-policy window remains runtime-only and resets after recovery settles outstanding departures; do not reintroduce serialized recent-position history.

Keep three boundaries distinct: admitted/published mutations, the written or durable journal prefix recorded by each storage cursor, and the sequencer's applied checkpoint boundary.
A cursor must never advertise journal bytes or content dependencies that have not reached the backend's required persistence boundary.
For buffered write-behind, serialize checkpoint publication after preceding accepted mutations drain, without holding a state lock while waiting.
This control operation may await file I/O even though ordinary buffered event admission does not.
Later admission must not change the captured checkpoint payload or become accidentally included in its applied boundary.
Reservation publication must retain no-reuse across successful orderly shutdown/reopen; buffered crash loss remains explicitly outside its guarantees.
Durable reservations must still be synchronized before exposing allocated IDs, including reservation-only updates that do not advance the applied event position.

Checkpoint replacement writes only its payload and checksum; it must not read or rewrite content, journals, cursors, or historical mappings.
Waiting for earlier workers to settle is an ordering requirement, not permission to reconstruct storage during checkpoint publication.
Preserve atomic replacement, durable file/directory synchronization, incomplete replacement handling, and uncertainty poisoning for checkpoints and cursors.
Each successful event batch or snapshot append currently publishes its journal cursor after settling the journal; preserve this ordering and recovery contract when coalescing requests.
Any proposal to reduce cursor publication frequency must separately justify its effect on recovery work and failure guarantees.

Keep historical reads lazy: hash lookup for content, direct byte-offset lookup for events, and storage-owned backward traversal for snapshot selection and non-record bounds.
Do not restore full-history scans or materialize a historical address table to simplify queue ownership.
Isolate file reads and metadata checks from the executor without holding the shared state mutex across slow I/O; retain file/opening ownership while reads are pending.
Preserve sparse-position semantics: count committed entries for checkpoint cadence and floor debounce rather than subtracting byte offsets.

## Required Contracts

1. Preserve durable acknowledgment guarantees and the existing [power-loss model](crates/sea-file-durable/README.md#power-loss-model).
   Keep durable namespace creation, rename, reopening, and recovery-repair barriers; retain the filesystem-boundary synchronization fix.
   Explicitly revise buffered acknowledgment to bounded in-process admission; audit shared durability labels and consumer contracts so they do not imply completed file I/O for this mode.
2. Preserve ordered event history with stable sparse byte-offset positions, advancing snapshot positions, transitive directory closure, and handle provenance.
   Preserve exact checkpoint boundaries, session-reservation ordering, and lazy historical recovery; apply backend-specific failure guarantees to their persistence.
   Establish admission order at a defined point, not from spawned-task order or assumptions about executor fairness.
3. An unpolled mutation has no effect.
   Define queue acceptance as the ownership handoff: cancellation before acceptance has no storage effect; cancellation afterward does not release ownership or imply settlement.
4. Retain document locks and mutation inputs until accepted work settles.
   Durable mutation results establish settlement; buffered success establishes in-memory publication, with file-write completion established separately by flush.
   Caller timeout or cancellation establishes neither file-write completion nor rollback.
   Do not automatically retry an append or ambiguous creation.
5. Validation rejection before writing must not poison healthy state.
   Uncertain writes and failed workers must block subsequent authoritative observations and wake affected readers and waiters, including when the caller has disappeared.
   Durable recovery retains its existing guarantees; buffered recovery after such failure may be impossible and cannot restore previously acknowledged but unwritten data.
6. After a durable group synchronization failure, classify every affected result according to whether its records could have reached storage.
   Do not report a possibly written request as a definite rejection or expose an unsynchronized in-memory suffix.
   Buffered background failures are reported through terminal state and flush/shutdown errors, not through already-completed mutation results.
7. Shutdown stops new admission and accounts for accepted work.
   A deadline may stop waiting but cannot cancel a blocking syscall, release its lock early, or turn its outcome into success.
   Avoid ownership cycles that retain idle documents or workers indefinitely.
8. No journal I/O or contended synchronous writer-lock acquisition runs on the async executor.
   Keep state critical sections limited to memory work and wake readers after releasing the state lock.

## Implementation Sequence

### 1. Establish Baselines And Compatibility

Inventory current callers, public Rust types, lock ordering, cancellation boundaries, recovery modes, and existing regression coverage.
Audit `SeaStorage`, `Durability::Buffered`, sequencer acknowledgment, and conformance assumptions for the newly selected write-behind semantics.
Update consequential contracts and mode-specific tests explicitly rather than silently retaining an operating-system-write guarantee or weakening durable tests.
Reconcile checkpoint/cursor work on the selected integration base before changing shared journal ownership.
Record buffered and durable latency, throughput, synchronization counts, and memory under identical workloads, including unsuccessful runs.
Separate initialization/recovery from steady-state operations.

Exit: a supported type-compatibility strategy, an explicit contract/test map, and reproducible measurements tied to a commit and storage environment.

### 2. Extract Shared Mechanisms

Move journal/state mechanisms into `sea-file::common` behind narrow internal operations without changing execution policy or on-disk bytes.
Separate recovery validation from repair/synchronization decisions and preserve the current lock order.
Keep this step independently reviewable and avoid incidental cleanup.

Exit: existing tests pass, persisted fixtures reopen with unchanged identities, and both modes still exhibit their original synchronization and error behavior.

### 3. Separate Backend Ownership

Give the `buffered` and `durable` modules distinct execution owners while sharing the extracted mechanisms in `common`.
Keep durable behavior equivalent initially; retain import-path re-exports and the temporary `sea-file-durable` facade where needed.
Migrate const-generic callers and backend-specific component uses explicitly rather than assuming type-alias compatibility.
Move buffered blocking operations behind a simple execution boundary and test direct storage callers, not only the host wrapper.
Keep synchronous factory construction explicit unless an async alternative is approved; callers must know which entry points require blocking isolation.

Exit: buffered and durable scheduling can change independently, with no duplicated recovery validator and no accidental synchronization in buffered mode.

### 4. Implement Buffered Write-Behind

Introduce bounded admission with atomic in-memory publication and independently tracked file-write progress.
Drain accumulated records in bounded batches without per-request worker completion on the sequencer hot path.
Implement terminal background-error signaling, prefix flush, and orderly host/direct-caller shutdown.
Reserve stable event offsets on admission, settle cursors behind their journal writes, and order independent checkpoints after preceding mutations drain.
Test reads across the pending/disk boundary and checkpoint replacement while later admissions are pending.
Update buffered contracts, risk documentation, and tests in the same stage as the acknowledgment change.

Exit: acknowledgments and reads succeed while a worker is paused, admission blocks at the configured limits, failures surface explicitly, and successful orderly shutdown writes every accepted record for reopening.

### 5. Introduce Bounded Durable Scheduling

Implement ordered mutation admission and bounded worker dispatch for every mutation kind.
Separate journal work from published-state locking, retain ownership across cancellation, and define shutdown settlement.
Keep the host initialization isolation until direct-storage behavior and compatibility are verified; remove redundant worker nesting only where tests prove it unnecessary.

Exit: deterministic slow-I/O tests show executor and reader progress, bounded admission, correct publication, and lock retention through cancellation and failure.

### 6. Optimize Measured Costs

Evaluate durable cross-request group commit only after the coordinator passes its correctness tests.
Measure its throughput benefit, tail-latency cost, fairness, and memory use against explicit event batching alone.
Choose limits from retained measurements rather than adding an arbitrary batching delay.

Keep portable blocking workers as the initial file-operation implementation.
Evaluate Linux `io_uring` or a cross-platform completion library such as Compio only if worker/submission overhead is a demonstrated bottleneck.
Check platform coverage, runtime integration, cancellation ownership, directory synchronization, and maintenance cost before adding a dependency.
Do not expect a library change to remove required synchronization latency.

Exit: retain only optimizations with a measured benefit and unchanged guarantees; publish regressions and tradeoffs alongside improvements.

### 7. Integrate And Document

Consolidate both backend guides under `sea-file`, preserving distinct buffered and durable guarantees and the durable power-loss model.
Update internal ownership contracts, cancellation/shutdown documentation, and the known-issue disposition supported by the evidence.
Remove the temporary `sea-file-durable` facade after migrating supported consumers and tests; update workspace manifests, lockfiles, build references, and active documentation links.
Record accepted crate-boundary or shared-contract changes through the repository decision process.
Add changesets for implementation behavior or API changes, not for this proposal alone.
Keep stages independently revertible; do not introduce a journal-format migration as part of this refactor.

## Validation

Reuse owning-module tests and existing conformance helpers before adding test files.
Place shared-mechanism tests with `common`, policy tests with their backend module, and run existing conformance tests against both implementations.
Use deterministic barriers to pause writes/synchronization and observe deadlines, reader progress, publication, and lock ownership; avoid tests whose correctness depends on actual disk speed.
Use bounded waits for failure diagnostics, and establish actual lock release rather than inferring destructor completion from reference counts.

Required regression cases include:

- Mixed content/directory/event/snapshot ordering, concurrent duplicates, and rejection of missing dependencies.
- Durable: no publication or successful acknowledgment before synchronization; old-prefix reads remain available while a worker is paused.
- Buffered: acknowledgment and read visibility before worker completion, ordered dependency persistence, bounded backlog batching, and no lost wakeups at worker idle transitions.
- Buffered: paused workers trigger backpressure, prefix flush waits for writes, orderly shutdown drains accepted work, and reopen after successful shutdown includes every accepted mutation.
- Buffered: background errors terminate admission and surface through observations/flush/shutdown without claiming to retract acknowledgments; shutdown timeout never reports flush success.
- Cancellation before acceptance, during queueing, during I/O, and after publication; abandoned responses must not cause automatic retries.
- Queue count/byte limits, oversized inputs, worker saturation, hot/cold-document fairness, and shutdown with pending work.
- Failures before writing, partial writes, synchronization failure, worker panic, and wakeup/poison behavior for every affected result.
- Incomplete-tail recovery, complete corruption rejection, lost acknowledgments, namespace durability, stable sidecar locks, and cross-process exclusion.
- Existing directory deduplication and initialization regressions; real host round trips for all storage modes.
- Buffered offset reservation with variable-sized frames, partial batches, and overflow; batching never changes acknowledged offsets or predecessor links.
- Reads across pending and written prefixes, arbitrary non-record event bounds, and backward snapshot lookup independent of sequencer checkpoints.
- Cursor publication after journal settlement, bounded suffix recovery, and directory deduplication against recent and reopened hash-addressed content.
- Independent checkpoint publication after buffered draining, exact applied boundaries under concurrent admission, reservation-only updates, and durable no-reuse after recovery.
- Checkpoint publication size/history independence and no reads or rewrites of content, journals, or cursors by the replacement operation.
- Minimal checkpoint recovery with no tail, preserved floor, empty live lag window, storage-backed historical reference lookup, and event-count rather than byte-distance cadence/debounce.

Run focused tests after each implementation step, then the canonical commands in [Development](DEVELOPMENT.md#canonical-workspace-commands):

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
RUSTDOCFLAGS='-D warnings' cargo doc --workspace --all-features --no-deps
cargo build --workspace --all-targets
cargo test --workspace --all-targets --all-features
node scripts/check-documentation.mjs
```

From the repository root, run `pnpm policy-check --path rust-service` and `pnpm build:fast` for implementation changes that affect declared build inputs.
Retain generated-binding or browser tests only where the change crosses a distinct boundary requiring that evidence.
Report unrelated gate failures without changing unrelated artifacts.

## Measurement And Acceptance

Use small and large payloads, one and many documents, steady and burst traffic, and explicit event batches.
Compare memory, buffered write-behind, and durable modes, clearly labeling their different acknowledgment and failure guarantees.
For buffered storage, report admission latency separately from write-completion lag, sustained drain throughput, peak backlog, and final flush/shutdown duration.
Include final draining in end-to-end persisted-work measurements; a short run that only fills the process buffer is not evidence of file throughput.
Because scheduling and batch sizes differ, memory/buffered/durable comparisons show whole-backend overhead, not a pure measurement of `fsync` cost.
Use matched batch shapes and completed writes in a controlled I/O comparison when isolating synchronization overhead.
Record queue delay, lock wait, encoding/write time, synchronization time, publication time, batch size, synchronization count, worker utilization, and retained bytes.
Separate event-journal synchronization, cursor-file/directory synchronization, opaque checkpoint replacement, and reservation replenishment costs.
Measure hash-file metadata operations, historical read misses, and backward traversal at increasing history sizes; do not retain the removed history-sized index rewrite as an expected cost.
Benchmark across cursor/checkpoint boundaries and reservation replenishments, including repeated checkpoints to verify publication work remains independent of retained history for a fixed payload.
Report throughput and median, p95, and p99 operation latency with repetitions, commit, toolchain, filesystem/mount, and machine details.

Run controlled delayed-I/O tests alongside real virtualized-storage measurements.
Delays longer than request deadlines should produce timely timeout observations without executor starvation or early durable acknowledgment; storage settlement may still take longer.
Define acceptable buffered admission overhead, sustained drain throughput, and durable latency/throughput targets from the baseline before selecting optimizations.
Reject a claimed throughput improvement that depends on unbounded queue growth, weakened durability, omitted failures, or unfairly starving other documents.

The refactor is complete when both backends live in `sea-file` with independent execution policies, shared format/recovery validation, bounded admission, and tested mode-specific acknowledgment and settlement semantics.
Buffered write-behind must include documented failure risks, backpressure, background-error reporting, and tested orderly flushing.
The separate `sea-file-durable` crate is retired after its supported callers, tests, and documentation are migrated.
Benchmark variability and production durability qualification remain open unless separate evidence resolves them.

## Decisions Before Implementation

- Select the corrected integration base and preserve the independent checkpoint and fixed-size cursor design.
- Choose exact-size offset reservation and pending-read mechanics for buffered admission without changing the byte-offset journal format.
- Confirm the migration and temporary re-export strategy for const-generic callers, associated component types, and consumers of `sea-file-durable`.
- Choose the scope and defaults of worker and queue budgets, including admission cancellation and oversized requests.
- Choose the concrete flush/shutdown API and host ownership wiring that implement buffered orderly draining, and record the approved buffered acknowledgment change in shared contracts and the decision record.
- Start with sequential, reviewable work under the [coordination workflow](../.github/skills/rust-service-coordination/SKILL.md); ask before introducing a numbered iteration or parallel workstreams.
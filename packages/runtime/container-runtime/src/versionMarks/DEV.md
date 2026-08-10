# Version marks runtime resolver

Version marks keep mark storage out of the Fluid runtime. The app owns mark records, labels, timestamps, retention, promotion, **and the stored locator shape**. Fluid owns only a runtime resolver that can turn a pending batchId into a durable global sequence number, either when the batch is observed live or by scanning retained historical ops.

## Implementation map

| File | Responsibility |
| --- | --- |
| `packages/common/container-definitions/src/runtime.ts` | Defines the internal loader-to-runtime extension `IContainerContextInternal` and its optional `fetchOps` capability. |
| `packages/loader/container-loader/src/container.ts` | Implements `fetchOps` by connecting to the current document delta-storage service and forwarding the requested range. |
| `packages/loader/container-loader/src/containerContext.ts` | Carries `fetchOps` through `ContainerContext`. The config key is required so support is explicit, but its value may be `undefined` because the capability itself is optional. |
| `packages/runtime/container-runtime/src/pendingStateManager.ts` | Supplies the reconnect-stable id from the batch-start message of the most recently flushed pending batch for capture. |
| `packages/runtime/container-runtime/src/versionMarks/inboundBatch.ts` | Converts live or historically unpacked `InboundMessageResult` values into completed batch identities and carries identity across piecemeal batches. |
| `packages/runtime/container-runtime/src/versionMarks/versionMarkResolver.ts` | Implements capture, live promotion, the session fast-path cache, historical resolution, miss classification, listener isolation, and cache eviction. |
| `packages/runtime/container-runtime/src/containerRuntime.ts` | Constructs the resolver, wires runtime hooks, creates the historical unpack pipeline, exposes the host-facing resolver, and invokes live batch tracking after pending-state validation. |
| `packages/runtime/container-runtime/src/versionMarks/index.ts` and `src/index.ts` | Export the internal implementation types and the host-consumable resolver interface/result types. |

## Locator format

Fluid does not define or export a locator type — the resolver works in primitives (`batchId`, `sequenceNumberLowerBound`, `sequenceNumber`), and the app packs/unpacks its own stored records. A typical app-owned shape is:

```ts
// App-owned type (not provided by Fluid)
type MarkLocator =
  | { kind: "resolved"; sequenceNumber: number }
  | { kind: "pending"; batchId: string; sequenceNumberLowerBound: number };
```

There is no runtime `expired` locator kind. Expiration or user-visible failure states are app-side policy.

A `pending` locator carries two things: `batchId` identifies which op the mark points at (the reconnect-stable batch identity), and `sequenceNumberLowerBound` is the last globally-sequenced point at capture — an exclusive lower bound for an out-of-session history read (the batch's ops are sequenced after it). Since `batchStartCsn` is a per-connection counter, not a global seq, it gives no location hint on its own; `sequenceNumberLowerBound` is the scan anchor for resolving `batchId -> seq` by reading ops starting at `sequenceNumberLowerBound + 1` (see Resolution paths).

## Batch identity

`BatchManager.generateBatchId(originalClientId, batchStartCsn)` produces `${originalClientId}_[${batchStartCsn}]`. `getEffectiveBatchId(...)` returns explicit batch metadata on resubmit, or derives the same id from the original wire client/csn for first submission. `PendingStateManager` preserves that batch info across reconnect and stamps the batchId during resubmit.

For capture, `PendingStateManager.getMostRecentPendingBatchId()` locates the start of the most recently flushed pending batch using its recorded batch length, then derives the effective id from that start message. This matters for resubmitted multi-op batches because the explicit reconnect-stable `batchId` is stamped only on the first message; reading the last message would incorrectly derive a new id from the current client and CSN. Stashed `initialMessages` are ignored until they are applied into the current session's pending queue.

## Resolver API

`VersionMarkResolver` implements `IVersionMarkResolver`:

- `sealAndCaptureVersionMark()` synchronously seals the current outbound batch (flushes the runtime) and captures a mark at the resulting point, returning a `VersionMarkCapture`: either `{ kind: "pending", batchId, sequenceNumberLowerBound }` (an unacked local edit, resolve it later) or `{ kind: "resolved", sequenceNumber }` (no in-flight local work). A batch's `batchId` is only assigned when it is flushed into `PendingStateManager` — see [Batch identity](#batch-identity). Combining sealing and capture prevents a caller from reading an older batch or `undefined` immediately after an edit and prevents the batch id and lower bound from being read at different points. The app packs its own stored record from the result — the runtime does not define the stored locator shape. Call it at savepoint boundaries, not per keystroke, because sealing submits the pending batch.
- `resolve(batchId, sequenceNumberLowerBound)` resolves live-then-history: (1) the ephemeral in-session `batchId -> sequenceNumber` map (batch seen live this session); (2) on a miss, an **out-of-session scan** — reads ops starting at `sequenceNumberLowerBound + 1` via an injected `IHistoricalOpReader`, routes each op through the **same unpack pipeline the live inbound path uses** (chunk reassembly, ungroup, decompress) and derives batch identity with the shared `inboundVersionMarkUpdate` helper, returning the matched batch's **last** op sequence number, or (when not found) `pending` / `unresolvable` distinguished by a read-derived availability check (see Resolution behavior). The reader is generic (backed by any driver's `IDocumentDeltaStorageService.fetchMessages`); when it is not wired, an unknown batchId is reported `pending`.
- `onBatchSequenced(listener)` broadcasts `(batchId, sequenceNumber)` as each batch is processed inbound, so any connected client can promote a matching pending mark in its own store (resolution is not tied to the capturing client). Returns an unsubscribe. Listeners run synchronously on the inbound op path, so each invocation is isolated: a throwing listener is caught, logged (`VersionMarkListenerException`), and skipped — it cannot abort op processing or starve later listeners (mirroring the container's `EventEmitterWithErrorHandling`). A missed live promotion is recoverable — the app can still resolve that mark later via `resolve()`'s history scan — so a listener fault logs and continues rather than faulting the container.

Host exposure: `ContainerRuntime` exposes an `@internal` `versionMarkResolver` getter backed by the concrete `versionMarkResolverInternal`. An app gets it from the runtime instance passed to `provideEntryPoint`, or exposes it from its own entryPoint. A future public API may move this onto container-runtime definitions rather than the concrete runtime class.

### Capture implementation

`VersionMarkResolver.sealAndCaptureVersionMark()` executes synchronously in this order:

1. Call the `flushPendingBatch` hook (`ContainerRuntime.flush`) so the current outbox batch is moved into `PendingStateManager` and assigned stable batch information.
2. Read `getCurrentSequenceNumber()` (`deltaManager.lastSequenceNumber`) as the capture's globally sequenced exclusive lower bound.
3. Read `getCurrentPendingBatchId()` (`PendingStateManager.getMostRecentPendingBatchId()`).
4. If no pending batch exists, return `{ kind: "resolved", sequenceNumber }`. This path does not enable inbound tracking because there is no pending batch to promote.
5. If a pending batch exists, set the sticky `tracking` flag and return `{ kind: "pending", batchId, sequenceNumberLowerBound }`.

Keeping sealing and capture in one synchronous operation prevents callers from observing or persisting intermediate state between flushing, reading the sequence number, and reading the batch id.

## Consumer surface & public-API graduation

An app (e.g. the Loop/office-bohemia host) consumes a small `@legacy @alpha` surface:

- Get the resolver: `ContainerRuntime.versionMarkResolver` -> `IVersionMarkResolver`.
- `IVersionMarkResolver` methods: `sealAndCaptureVersionMark()` -> `VersionMarkCapture` (seals the batch and returns the locator data atomically), `onBatchSequenced(listener)` (live promotion), `resolve(batchId, sequenceNumberLowerBound)` -> `ResolveResult` (load-time sweep / restore).
- Types `IVersionMarkResolver`, `ResolveResult`, and `VersionMarkCapture` are exported from `@fluidframework/container-runtime/legacy/alpha`.
- Restore side: `loadContainerToSequenceNumber` and `ILoadContainerToSequenceNumberProps` are exported from `@fluidframework/container-loader/legacy/alpha`, fed the `resolved` sequence number.
- ODSP point-in-time support: `getOdspPointInTimeDocumentServiceFactory` and
  `IPointInTimeDocumentServiceFactory` are exported from
  `@fluidframework/odsp-driver/legacy/alpha`.

### Capturing a mark (app side)

Capture is a single `resolver.sealAndCaptureVersionMark()` call returning a `VersionMarkCapture` — either `{ kind: "pending", batchId, sequenceNumberLowerBound }` (an unacked local edit, resolve it later) or `{ kind: "resolved", sequenceNumber }` (no in-flight local work). Notes for consumers:

- **It seals the current outbound batch synchronously** (flushes the runtime) so the just-submitted edit has a stable `batchId` before it is read. Call it at savepoint boundaries (e.g. an explicit "snapshot this version"), not per keystroke — it submits the pending batch as a side effect.
- **The runtime composes the pending-vs-resolved result atomically.** The app no longer reads a batchId and a sequence number lower bound separately or decides pending-vs-resolved itself; that removes the earlier race where a batchId still in the outbox came back stale/`undefined` and got paired with a mismatched lower bound, persisting a wrong coordinate.
- **The app still owns storage.** `VersionMarkCapture` is a transient result, not a persisted locator type — the app maps it into its own stored record.
- **Works while disconnected.** A disconnected flush stamps a stable placeholder `batchId` (carried across resubmit), so capture returns a usable `pending` mark offline; no connection is required to capture.

Not consumed by the app (internal plumbing): `IContainerContextInternal.fetchOps`, the concrete `VersionMarkResolver`, `IHistoricalOpReader`, `VersionMarkResolverRuntimeHooks` (including `getHistoricalOpReader` and `createHistoricalOpUnpacker`), `inboundVersionMarkUpdate`, and `processInboundBatch`.

Before promotion beyond `@legacy @alpha`, move the access point off the concrete `@internal` `ContainerRuntime` class onto a public runtime interface (container-runtime-definitions) or the entryPoint / `FluidObject` provider pattern, and resolve the API-shape questions in [Future work](#future-work). The interface is primitive-typed (no `MarkLocator` or driver types leak). The `fetchOps` plumbing remains loader→runtime internal wiring on `IContainerContextInternal`; the resolver, loader helper, and ODSP factory are the host-facing touchpoints.

## Loader-to-runtime wiring

`IContainerContextInternal` extends the public/legacy `IContainerContext` only inside the loader/runtime implementation boundary. Its optional function is:

```ts
fetchOps(
  from: number,
  to?: number,
  abortSignal?: AbortSignal,
): Promise<IStream<ISequencedDocumentMessage[]>>
```

The range follows delta-storage semantics, `[from, to)`: `from` is inclusive, `to` is exclusive, and an undefined `to` means there is no fixed upper bound. `ContainerContext` stores the function unchanged. Its config requires a `fetchOps` key even though the value may be `undefined`; this makes each constructor call explicitly state whether the host provides historical reads.

The `Container.fetchOps` helper connects to delta storage on every call through `service.connectToDeltaStorage()`. This avoids retaining a handle across reconnects, epoch changes, or service replacement. If the current service cannot provide delta storage, it throws `"Cannot fetch ops: delta storage is unavailable"`. Otherwise it forwards `from`, `to`, and `abortSignal` directly to `IDocumentDeltaStorageService.fetchMessages`.

During `ContainerRuntime` construction, the context is narrowed to `IContainerContextInternal`. The runtime stores the concrete `VersionMarkResolver` in `versionMarkResolverInternal` and exposes it through the host-facing `versionMarkResolver` getter typed as `IVersionMarkResolver`.

The runtime hooks are wired as follows:

- `getCurrentSequenceNumber` -> `deltaManager.lastSequenceNumber`.
- `getCurrentMinimumSequenceNumber` -> `deltaManager.minimumSequenceNumber`.
- `getCurrentPendingBatchId` -> `pendingStateManager.getMostRecentPendingBatchId()`.
- `flushPendingBatch` -> `ContainerRuntime.flush()`.
- `logger` -> a child logger in the `VersionMarkResolver` namespace.
- `getHistoricalOpReader` -> a lightweight `{ fetchMessages: fetchOps }` adapter when `fetchOps` exists.
- `createHistoricalOpUnpacker` -> a factory for a fresh `RemoteMessageProcessor` when `fetchOps` exists.

Each historical scan gets its own `RemoteMessageProcessor` because `OpSplitter` keeps chunk-reassembly state. The processor is built with the runtime's chunk-size and max-batch-size options, an `OpDecompressor`, and an `OpGroupingManager` configured with the runtime's grouped-batching setting. The returned unpack function filters system/server messages, clones the op, deserializes string contents with `ensureContentsDeserialized`, and runs the clone through `RemoteMessageProcessor.process`.

If `fetchOps` is absent, both historical hooks are absent. Live resolution still works, while an unknown id conservatively resolves to `pending`.

## Resolution behavior

### Live inbound tracking

`ContainerRuntime` owns `versionMarkInboundBatchId`, which carries a batch id between piecemeal inbound messages. After `PendingStateManager.processInboundMessages` successfully validates an inbound result, the runtime checks `versionMarkResolverInternal.isTracking`. If tracking is disabled, it skips all version-mark work on the hot path. If tracking is enabled, it calls `inboundVersionMarkUpdate(inboundResult, versionMarkInboundBatchId)`, records any completed batch through `processInboundBatch`, and stores the returned `carriedBatchId` for the next message.

The version-mark update runs **after** pending-state validation because that validation throws for a batch that must be rejected (fork detection or pending-content mismatch). `processInboundBatch` synchronously fires `onBatchSequenced`, which an app may use to promote a mark in an external store; sequencing the update after validation ensures a rejected batch never causes that irreversible side effect.

`inboundVersionMarkUpdate` handles every `InboundMessageResult` shape:

- `fullBatch`: derive the effective id from `batchStart`; resolve at the last message's sequence number. An empty grouped batch has no messages, so it uses the batch-start key message's sequence number.
- `batchStartingMessage`: derive and carry the batch id without recording a sequence number yet.
- `nextBatchMessage` with `batchEnd: true`: if an id is being carried, resolve it at this final message's sequence number and clear the carry.
- Mid-batch messages, or an end message without a carried id: preserve the current carry and emit no completed batch.

`VersionMarkResolver.processInboundBatch` suppresses an exact duplicate `(batchId, sequenceNumber)` update. Otherwise it inserts the mapping, evicts entries below the current MSN, and synchronously invokes every subscribed listener. Each listener has its own `try/catch`; a fault emits `VersionMarkListenerException` and iteration continues.

The runtime does not store or mutate app marks. The listener only lets the app replace its own pending locator with the supplied sequence number.

### Resolve control flow

`resolve(batchId, sequenceNumberLowerBound)` performs:

1. Look up `batchId` in the session map. A hit immediately returns `resolved` and never consults storage.
2. Call `getHistoricalOpReader` on a miss. If no reader is available, return `pending`.
3. Set `from = sequenceNumberLowerBound + 1`, create a fresh unpacker, and create an `AbortController`.
4. Request `fetchMessages(from, undefined, abortSignal)`.
5. Read every stream chunk until the target is found or the stream returns `done`.
6. Return the matched completed batch's last sequence number, or classify the miss.
7. Abort the controller in `finally`, both on success and on exhaustion/error, so the underlying fetch can stop any remaining work.

For each raw op, the scan records the first returned sequence number before filtering because that value is also the trim-availability signal. It then:

1. Drops a `batch: false` marker when no batch is currently in progress. The scan anchor may land on the clipped tail of an ordinary batch whose start was before `from`; feeding that orphan end marker to `RemoteMessageProcessor` would violate its batch-state invariant.
2. Passes the op to the unpacker. `undefined` means a filtered system op or an incomplete chunk waiting for more fragments.
3. Mirrors the unpacker's batch-in-progress state from `batchStartingMessage` and final `nextBatchMessage` results.
4. Calls `inboundVersionMarkUpdate`, carrying the batch id across piecemeal results exactly as the live path does.
5. Returns immediately when the completed batch id matches the requested id.

The target batch was pending at capture, so it must sequence after `sequenceNumberLowerBound` and cannot be the clipped ordinary batch.

Routing scanned ops through the live unpack pipeline is required for **chunked batches**. Chunking strips the `batchId` from the final chunk's wire metadata and restores it only after `OpSplitter` reassembly. A raw metadata scan would therefore miss a resubmitted chunked batch. The shared pipeline also keeps grouped and compressed batch handling consistent with live processing.

**Scan-anchor limitation (chunk streams).** Ordinary multi-op batches are not split by the capture anchor: `InboundBatchAggregator` keeps them atomic when delivering them to the runtime. Chunk streams are different. The DeltaManager advances `lastSequenceNumber` for each intermediate chunk before `OpSplitter` has reconstructed the original message, so `sequenceNumberLowerBound + 1` can start in the middle of a chunk stream.

The current orphan batch-end guard only drops a leading `batch: false` marker from a clipped ordinary batch. It does not make `RemoteMessageProcessor` tolerate missing leading chunks, so a history scan that starts mid-chunk stream is not handled correctly. A follow-up should either anchor capture on the last fully reconstructed runtime batch or make the history scan tolerate and skip an incomplete leading chunk stream. Add coverage that captures an anchor after an intermediate chunk and verifies that historical resolution does not throw or misidentify the target batch.

### `pending` vs `unresolvable` on a miss (read-derived availability)

Here, **trimmed** means that older sequenced ops are no longer retained or returned by the service's delta storage. It does not refer to eviction from the resolver's fast-path cache or to an op falling below the minimum sequence number (MSN).

When the scan does not find the batch, the result distinguishes **`pending`** ("not sequenced yet — retry later") from **`unresolvable`** ("its ops were trimmed — gone forever"). Both look identical from the batch id alone (the batch is simply absent), so the distinction uses a **read-derived availability signal**: the current tip (`getCurrentSequenceNumber`) plus where the scan's first op landed relative to `from = sequenceNumberLowerBound + 1`:

- `from > tip` — nothing is sequenced at/after the reference point yet, so the batch cannot have landed → **`pending`**.
- Empty read while ops should exist (`from <= tip`) — the requested range came back empty, which for a strict driver (ODSP's `validateMessages` empties a from-misaligned trimmed range) means the range was trimmed → **`unresolvable`**.
- First available op is past `from` — a trim gap at the anchor; the mark's batch (sequenced just after the reference point) was trimmed → **`unresolvable`**. A found batch resolves before this check, so a gap **on a miss** genuinely means the batch's ops are gone, not merely preceded by other clients' ops (which are still present at `from`).
- Ops present from `from` but the batch is not among them — it has not been sequenced yet → **`pending`**.

This is an **interim, read-derived** signal: it infers availability from how the driver responds to a trimmed range, which is driver-behavior-dependent (strict-empty vs return-from-earliest) and degrades to the conservative outcome when ambiguous. A dedicated driver op-availability / retention API (e.g. an explicit earliest-retained-sequence-number query on `IDocumentDeltaStorageService`, coordinated across drivers) would replace it with a precise, contractual signal — a separate follow-up.

### Error handling and invariants

- A historical reader must never return an op below `from`. `classifyMiss` asserts this because trim classification is invalid if the range contract is violated.
- Delta-storage connection/fetch failures and unpacking failures propagate to the caller. They are operational failures, not legitimate `pending` or `unresolvable` results.
- The `AbortController` is aborted in `finally`, including when a reader, stream, or unpacker throws.
- Listener failures are isolated, logged, and skipped because a missed live promotion remains recoverable through history.
- Inbound pending-state validation runs before notification. A rejected or forked batch cannot cause an app-side promotion.
- `sequenceNumberByBatchId` is only a session cache. Correctness must not depend on an entry remaining present; a miss can fall back to retained history.

## Loading a mark

Loading (restoring) a mark is two explicit steps, and the resolver is the bridge between them:

```
locator --resolve()--> sequenceNumber --loadContainerToSequenceNumber()--> IContainer
```

1. `resolve(batchId, sequenceNumberLowerBound)` turns the locator into a concrete `sequenceNumber` (a `resolved` mark already carries its `sequenceNumber`, so it skips this step entirely).
2. `loadContainerToSequenceNumber({ request, loadToSequenceNumber, ... })` (the loader's point-in-time primitive) materializes a read-only container at that sequence number.

The load primitive stays **mark-agnostic** — it takes a raw `sequenceNumber` and never learns what a "mark" is. This is the deliberate design choice (decision A): the resolver owns the locator→sequence translation, the loader owns materialization, and the two do not merge.
Its current container-loader placement is prototype-era ownership; the planned extraction of the
host-facing load orchestration into a dedicated feature package is documented in the
[point-in-time loading guide](../../../../loader/container-loader/src/pointInTime/DEV.md#package-ownership-and-planned-extraction).

### Why the load takes a sequence number, not a locator

This mirrors `IUrlResolver.resolve(request): Promise<IResolvedUrl | undefined>` — resolution is a **separate step that returns a value** (including "can't resolve" as a value, not a throw), and load consumes the resolved form. It also matches how `IFluidHandle` surfaces a pending payload state rather than hiding it: when resolution has a legitimate non-error "not yet" outcome, the codebase exposes it as a first-class value.

A locator-taking load (a single `loadContainerToMark(locator)` call) was considered and rejected:

- Return-type impedance: such a call returns `Promise<IContainer>`, but two of the three resolve outcomes (`pending`, `unresolvable`) yield no container. It would have to either throw for both (collapsing "retry later" and "gone forever" into one error path) or return a union the caller must branch on anyway.
- Lifecycle mismatch: the resolver is a **live-session** object bound to an already-open container's runtime and its op reader, while the load creates a **new read-only historical** container. A one-call wrapper would need a live resolver injected into a load that produces a different container instance, conflating two container lifecycles.
- Redundancy: `resolve()` must exist as a standalone call regardless — the app uses it for live promotion (`onBatchSequenced`), for the load-time sweep, and to render pending / unresolvable state in the UI. A wrapper would just duplicate it.

If one-call ergonomics are ever wanted, the right shape is a thin wrapper that **returns the three-state result** (`IContainer` on `resolved`, else `pending` / `unresolvable`) layered on top of these two primitives — not a change to the primitives.

## Removed runtime persistence

The previous runtime-owned marks map and `.versionMarks` summary blob were removed. There is no runtime durable mark store and no summarized durable `batchId -> sequenceNumber` index. Once a batch resolves, the app must persist the sequence number in its own store.

## Fast-path cache bounding (MSN eviction)

`VersionMarkResolver.sequenceNumberByBatchId` (`Map<batchId, sequenceNumber>`) is a **live-session fast-path cache**, not a source of truth: `processInboundBatch` inserts one entry per inbound batch, and `resolve()` reads it only as the fast path before falling back to the historical-op scan (`resolveFromHistory`). The protocol invariant is that a `batchId` maps to one `sequenceNumber`; the implementation suppresses an identical repeated update and otherwise uses `Map.set`. A miss degrades to the history scan when a reader is available, so eviction affects speed rather than correctness while the ops remain retained.

### What MSN means here

The minimum sequence number (MSN) is the protocol's collaboration-window floor. When an op is below the current MSN, every active client has advanced far enough to have processed it. The resolver reads the value from `deltaManager.minimumSequenceNumber` through `getCurrentMinimumSequenceNumber`.

MSN is **not** part of a stored mark and is not used to create, resolve, expire, or validate marks. Marks come only from an app calling `sealAndCaptureVersionMark()` and storing the returned locator. MSN also is **not** the service's op-retention boundary: an op can be below MSN and still be available from delta storage, or can later be trimmed according to service policy. `unresolvable` is about delta-storage retention, not MSN.

The resolver uses MSN only to answer a cache-lifetime question: how long should a live container retain every observed `batchId -> sequenceNumber` mapping? Without eviction, a long-running container would add one entry for every tracked inbound batch and the map would grow without bound. MSN provides a protocol-derived, workload-sensitive boundary instead of a fixed entry count or timeout.

### Why eviction below MSN is useful

For the normal live-promotion path, a batch below MSN has already passed every active client. If tracking was enabled, `processInboundBatch` has already fired `onBatchSequenced`, giving the app an opportunity to replace its stored pending locator with the durable sequence number. Keeping that batch in the resolver's session cache after it leaves the collaboration window is therefore only an optimization for repeated lookups.

Eviction does not delete an app-owned mark or its resolved sequence number. A later `resolve()` cache miss scans retained historical ops when `fetchOps` is available. If no historical reader is wired, an evicted id returns `pending`; in that configuration the consumer must rely on the live `onBatchSequenced` promotion having been persisted. Likewise, listener failure is recoverable only when historical reads remain available.

MSN speaks only about active clients in the current collaboration window. A disconnected client, a client loading much later, or a host that subscribes after a batch was processed cannot rely on the live cache or notification; those cases are why the stored locator includes a history anchor and why historical resolution exists.

### Eviction algorithm and invariants

`processInboundBatch` inserts the completed batch, then calls `evictBelowMinimumSequenceNumber()`. Entries are observed and inserted in sequence order. The eviction loop walks the `Map` from its oldest insertion:

1. Delete each entry whose `sequenceNumber < minimumSequenceNumber`.
2. Stop at the first entry whose `sequenceNumber >= minimumSequenceNumber`; all later entries are also expected to be in the collaboration window.

This makes cleanup proportional to the number of entries actually evicted (amortized O(evicted)). The just-recorded inbound batch is at or above the current MSN, so it is retained. The implementation also relies on the invariant that a stable `batchId` never remaps to a different sequence number; changing an existing key without moving its insertion position would otherwise break the ordered early-exit assumption.

### Tracking gate (`isTracking`)

Per-inbound-batch work (deriving the batch identity and populating the map/notifying listeners) is **gated on a sticky `isTracking` flag**, so a container that never uses version marks does no version-mark work on the hot path. This mirrors #22497, which gated `DuplicateBatchDetector` on offline load being enabled even though its cost was small — there is no reason to pay a predictable per-batch cost for a feature that can't do anything. Tracking flips on (and stays on) the first time the feature is actually used this session: a **pending** `sealAndCaptureVersionMark()` (a resolved capture needs no tracking) or an `onBatchSequenced` subscription. The runtime reads `versionMarkResolverInternal.isTracking` and skips the whole update block while it is false. A batch in flight at the moment tracking flips on may be missed, which is harmless: an app's own captured mark is for a not-yet-sequenced edit (tracked once it lands), and cross-session resolution uses the history scan regardless.

## Current test map

- `src/test/versionMarks/inboundBatch.spec.ts` covers full, empty, derived-id, explicit-id, and piecemeal batch updates.
- `src/test/versionMarks/versionMarkResolver.spec.ts` covers capture ordering/results, the tracking gate, live-map precedence, no-reader behavior, fresh and resubmitted batches, multi-op batches across stream reads, chunk reassembly, clipped leading ordinary batches, miss classifications, range arguments, reader-contract assertion, abort behavior, listener isolation/unsubscribe/deduplication, and MSN eviction.
- `src/test/pendingStateManager.spec.ts` covers ignoring unapplied stashed messages and reading an explicit reconnect-stable id from the start of the most recently flushed multi-op batch.
- `src/test/containerRuntime.spec.ts` covers the complete context `fetchOps` -> historical unpack -> resolver path (including system/server-op filtering and abort-after-match), plus the ordering guarantee that failed inbound validation does not notify listeners.

## Future work

### Missing end-to-end coverage

The existing real-service ODSP suites under `packages/test/test-end-to-end-tests/src/test/pointInTime/` begin with a known sequence number and exercise loading. They do not create that sequence number through the version-mark API. Extend `pointInTimeTestUtils.ts` with a host entry point that exposes `IVersionMarkResolver`, then add:

1. **Pending mark to historical load:** Make a local edit, call `sealAndCaptureVersionMark()`, persist the pending locator outside the runtime, sequence the batch, resolve the locator, and load the resulting sequence number. Verify the loaded state includes the marked edit and excludes later edits.
2. **Already-resolved capture:** Capture with no local pending batch and load the returned sequence number directly, proving the no-resolution path produces the expected historical state.
3. **Live promotion from another client:** Capture on one client and use `onBatchSequenced` on another connected client to promote the stored locator, proving batch identity is observable across clients.
4. **Reconnect and resubmission:** Capture before disconnect, reconnect and resubmit the multi-op batch with its original explicit `batchId`, then verify both live and historical resolution still find the mark.
5. **Capturing-client loss:** Close the capturing client before its acknowledgement, open a fresh client, resolve from retained historical ops, and load the marked state. This is the primary cross-session recovery scenario.
6. **Transformed batches:** Capture edits that produce grouped, compressed, and chunked batches and verify the real inbound/history pipelines recover the same effective batch identity.
7. **Pending and retention outcomes:** Resolve before the batch sequences and observe `pending`; when the test environment can deterministically trim the target ops, verify the same stored locator becomes `unresolvable`.
8. **Offline and staging lifecycles:** Cover stash/rehydration plus staging commit and discard once those capture contracts are finalized.
9. **Repeated capture and multiple pending batches:** Capture twice while the same batch remains unacknowledged, then capture after a second local batch is flushed. Verify each mark identifies the latest batch whose state it includes and that changing remote sequence numbers between captures does not produce an invalid lower bound.
10. **Tracking activation boundaries:** Subscribe while an inbound batch is already being processed and immediately after a batch completed. Verify the documented behavior at each boundary and prove that a missed notification remains recoverable through `resolve()`.
11. **Sequenced-before-persisted restore:** Resolve a mark from the live map as soon as its batch sequences, then immediately start a point-in-time load before ODSP has flushed that op to durable delta storage. Define whether the host waits, explicitly requests an op flush, or retries later, and verify a resolved locator never implies that the target is already materializable by a storage-only loader.

### Resolver correctness and robustness gaps

1. **Chunk-stream scan anchors:** The history scan can begin after one or more chunks of a message have already been trimmed from the requested range. `RemoteMessageProcessor` cannot currently reconstruct that incomplete leading chunk stream. Either capture a lower bound that is known to follow the last fully reconstructed runtime batch, or teach historical resolution to discard an incomplete leading chunk stream before processing the next complete batch. Cover anchors on every intermediate chunk, including a target batch immediately after the clipped stream.
2. **Live/history resolution races:** A batch can be recorded by `processInboundBatch` while a history scan for the same `batchId` is in progress. Recheck the live map before returning a miss so `resolve()` does not return stale `pending` or `unresolvable` after the batch has resolved in-session. Also decide whether concurrent calls for the same locator should share one scan rather than issuing duplicate delta-storage reads.
3. **Finite and cancelable history reads:** The current scan requests `[lowerBound + 1, undefined)`, has no caller-supplied cancellation signal, and can inherit long driver retry behavior. Consider snapshotting an upper bound from the observed tip, accepting an `AbortSignal`, and canceling outstanding scans when the runtime is disposed. Cover cancellation before fetch, during `fetchMessages`, during `stream.read()`, and after a match races cancellation.
4. **Stored-locator validation:** `batchId` and `sequenceNumberLowerBound` may come from app-owned persisted data. Define whether `resolve()` trusts that data or rejects an empty batch ID, negative/fractional/non-safe sequence numbers, and a lower bound whose `+ 1` overflows safe integer precision. Invalid persisted coordinates must not silently scan the wrong range or be classified as a legitimate mark state.
5. **Conflicting batch identity:** `processInboundBatch` suppresses an identical repeated `(batchId, sequenceNumber)` pair but currently overwrites the map if the same `batchId` appears at a different sequence number. The protocol says that remapping is impossible, and map insertion order is used by MSN eviction. Assert or fail explicitly on a conflicting remap and add a regression test so corruption cannot invalidate the eviction ordering assumption.
6. **Historical stream contract:** Add direct coverage for duplicated, decreasing, gapped, and malformed batch/chunk sequences, plus a target found after a trim gap. Define which violations are rejected by the driver, which are rejected by the resolver, and which conservatively return `pending`; never infer `unresolvable` from a stream that violated the requested range contract.

### API and design follow-ups

- Review the `IContainerContextInternal extends IContainerContext` cross-layer integration with Navin to establish the preferred pattern for features that span loader and runtime layers. In particular, determine whether explicit layer-compat support would make this interface evolution safer or more maintainable.
- Consider merging `getCurrentPendingBatchId` into `flushPendingBatch` so sealing the batch returns its resulting `batchId`. This would keep the ordered flush-then-read operation inside one runtime hook instead of requiring the resolver to call two hooks in sequence.
- Reevaluate whether distinguishing `pending` from `unresolvable` is valuable enough to justify the driver-dependent heuristics in `classifyMiss`. The current implementation makes educated guesses from empty reads and sequence gaps, so its confidence depends on how each driver's delta storage reports trimmed ranges. Consider returning the conservative `pending` result for ambiguous misses, collapsing the states, or deferring a definitive `unresolvable` result until delta storage exposes an explicit retention boundary.
- Before promoting this API to `@beta`, try extending the existing `batchEnd` event to expose the effective stable batch ID and reuse that event for mark promotion. Avoid finalizing `onBatchSequenced` as a parallel batch-sequenced notification API unless the existing event cannot support this use case.
- Define the teardown contract for listeners and in-flight `resolve()` calls. Subscriptions should not retain app objects after runtime disposal, and a resolver obtained from a closed runtime should fail predictably rather than starting new storage work.

### Flush side effect and corner cases

The flush side effect in `sealAndCaptureVersionMark()` is acceptable, but it creates corner cases that should be handled explicitly and covered in tests and consumer documentation.

Consider adding a `notCaptured` result to `VersionMarkCapture` for expected caller-state conditions where capture cannot safely begin:

```ts
type VersionMarkCapture =
	| { kind: "pending"; batchId: string; sequenceNumberLowerBound: number }
	| { kind: "resolved"; sequenceNumber: number }
	| {
			kind: "notCaptured";
			reason: "unsafeToFlush" | "stagingNotSupported";
	  };
```

This is preferable to throwing when the runtime can detect the condition before changing batch state. In particular, capture should preflight reentrant/inbound processing, manual batch accumulation inside `orderSequentially`, and staging mode before calling `flush()`. Today `ContainerRuntime.flush()` treats failures as critical: for example, flushing inside `orderSequentially` asserts, closes the container, and rethrows. A mark request made at an inconvenient but recoverable time should instead return `notCaptured`, perform no flush, create no locator, and leave the container usable.

`notCaptured` should not become a catch-all for failures after flushing starts. Unexpected submission failures, an oversized or invalid batch, a closed/disposed runtime, and other operational or data-processing errors should continue to throw and follow their existing container lifecycle. Returning a normal result after partial mutation would hide an indeterminate capture. Keep the reason union small and actionable; callers can retry `unsafeToFlush` after leaving the current callback, while `stagingNotSupported` means they must wait for commit/discard or use a future staging-aware capture contract.

Adding this variant is an API change. Before promotion, decide whether `sealAndCaptureVersionMark()` should always return the three-way union or whether unsafe contexts should remain programmer errors. If `notCaptured` is adopted, document that it guarantees no mark was produced and no capture-triggered flush occurred.

Staging mode also needs an explicit contract for both commit and discard. Capturing staged edits should not send them immediately. Committing should preserve the captured batch identity through submission/resubmission so the mark resolves normally. After discard, the captured batch will never sequence, so the resulting mark behavior must be defined and documented.

Suggested test coverage:

1. **Real batch cut:** Submit an op through `ContainerRuntime`, call capture before the TurnBased flush, and verify that capture flushes the op into `PendingStateManager` and returns that exact batch's ID rather than a mocked ID.
2. **Unsafe contexts:** Call capture during inbound processing and inside `orderSequentially`; verify `notCaptured` with `reason: "unsafeToFlush"`, no flush, and no container closure. Also verify a later retry succeeds.
3. **Staging commit and discard:** Capture staged edits and verify nothing is sent immediately. Verify that commit preserves the captured ID through resubmit and resolution, and define and test the result after discard.
4. **Offline rehydration:** Capture while disconnected, stash and rehydrate, resubmit from the new client, and resolve using the original ID. This also covers end-to-end preservation and stamping of the batch identity through pending-state rehydration, beyond the existing unit tests for explicit original `batchId` metadata.

## Historical-op retention limitation

Cross-client or headless resolution of an old pending mark falls back to the historical-op scan. This covers the case where the capturing client dies before its own ack and no other live client promoted the mark: a fresh client can resolve the stored `batchId` from retained ops even though that op will not reappear on the live inbound stream.

Resolution is still bounded by op retention. Once the target range has been trimmed, there is no runtime-owned durable `batchId -> sequenceNumber` index to recover it, so the resolver returns `unresolvable`. As described above, the current trim detection is read-derived and driver-dependent; a future explicit op-availability API would make that classification contractual.

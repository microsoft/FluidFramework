# Version marks runtime resolver

Version marks keep mark storage out of the Fluid runtime. The app owns mark records, labels, timestamps, retention, promotion, **and the stored locator shape**. Fluid owns only a runtime resolver that can turn a pending batchId into a durable global sequence number, either when the batch is observed live or by scanning retained historical ops.

## Implementation map

| File | Responsibility |
| --- | --- |
| `packages/common/container-definitions/src/runtime.ts` | Defines the internal loader-to-runtime extension `IContainerContextInternal` and its optional `fetchOps` capability. |
| `packages/loader/container-loader/src/container.ts` | Implements `fetchOps` by connecting to the current document delta-storage service and forwarding the requested range. |
| `packages/loader/container-loader/src/containerContext.ts` | Carries `fetchOps` through `ContainerContext`. The config key is required so support is explicit, but its value may be `undefined` because the capability itself is optional. |
| `packages/runtime/container-runtime/src/pendingStateManager.ts` | Supplies the reconnect-stable id of the most recently flushed pending batch for capture. |
| `packages/runtime/container-runtime/src/versionMarks/inboundBatch.ts` | Converts live or historically unpacked `InboundMessageResult` values into completed batch identities and carries identity across piecemeal batches. |
| `packages/runtime/container-runtime/src/versionMarks/versionMarkResolver.ts` | Implements capture, live promotion, the session fast-path cache, historical resolution, miss classification, listener isolation, and cache eviction. |
| `packages/runtime/container-runtime/src/containerRuntime.ts` | Constructs the resolver, wires runtime hooks, creates the historical unpack pipeline, exposes the host-facing resolver, and invokes live batch tracking after pending-state validation. |
| `packages/runtime/container-runtime/src/versionMarks/index.ts` and `src/index.ts` | Export the internal implementation types and the host-consumable resolver interface/result types. |

## Locator format

Fluid does not define or export a locator type — the resolver works in primitives (`batchId`, `referenceSequenceNumber`, `sequenceNumber`), and the app packs/unpacks its own stored records. A typical app-owned shape is:

```ts
// App-owned type (not provided by Fluid)
type MarkLocator =
  | { kind: "resolved"; sequenceNumber: number }
  | { kind: "pending"; batchId: string; referenceSequenceNumber: number };
```

There is no runtime `expired` locator kind. Expiration or user-visible failure states are app-side policy.

A `pending` locator carries two things: `batchId` identifies which op the mark points at (the reconnect-stable batch identity), and `referenceSequenceNumber` is the last globally-sequenced point at capture — a lower bound for an out-of-session history read (the batch's ops are sequenced after it). Since `batchStartCsn` is a per-connection counter, not a global seq, it gives no location hint on its own; `referenceSequenceNumber` is the scan anchor for resolving `batchId -> seq` by reading ops from that point forward (see Resolution paths).

## Batch identity

`BatchManager.generateBatchId(originalClientId, batchStartCsn)` produces `${originalClientId}_[${batchStartCsn}]`. `getEffectiveBatchId(...)` returns explicit batch metadata on resubmit, or derives the same id from the original wire client/csn for first submission. `PendingStateManager` preserves that batch info across reconnect and stamps the batchId during resubmit.

For capture, `PendingStateManager.getMostRecentPendingBatchId()` reads the **first** pending message of the most recently flushed batch. This matters for multi-op resubmissions: the explicit reconnect-stable `batchId` is stamped only on the batch's first op, while the last op carries the batch-end marker. Reading the batch start preserves the original identity instead of deriving a new id from the resubmitting client. Stashed `initialMessages` are ignored until they are applied into the current session's pending queue.

## Resolver API

`VersionMarkResolver` implements `IVersionMarkResolver`:

- `captureVersionMark()` captures a mark at the current point and returns a `VersionMarkCapture`: either `{ kind: "pending", batchId, referenceSequenceNumber }` (an unacked local edit, resolve it later) or `{ kind: "resolved", sequenceNumber }` (no in-flight local work). It **seals the current outbound batch first** (flushes the runtime), because a batch's `batchId` is only assigned when it is flushed into `PendingStateManager` — see [Batch identity](#batch-identity). This is why it is a single async call rather than two synchronous getters: reading a pending `batchId` synchronously right after an edit would return an older batch or `undefined` (the edit is still in the outbox, pre-flush, with no id yet), and reading the id and reference point separately could yield a mismatched pair. The app packs its own stored record from the result — the runtime does not define the stored locator shape. Sealing the batch is a side effect (it submits the current batch), so capture at savepoint boundaries, not per keystroke.
- `resolve(batchId, referenceSequenceNumber)` resolves live-then-history: (1) the ephemeral in-session `batchId -> sequenceNumber` map (batch seen live this session); (2) on a miss, an **out-of-session scan** — reads ops from `referenceSequenceNumber + 1` forward via an injected `IHistoricalOpReader`, routes each op through the **same unpack pipeline the live inbound path uses** (chunk reassembly, ungroup, decompress) and derives batch identity with the shared `inboundVersionMarkUpdate` helper, returning the matched batch's **last** op sequence number, or (when not found) `pending` / `unresolvable` distinguished by a read-derived availability check (see Resolution behavior). The reader is generic (backed by any driver's `IDocumentDeltaStorageService.fetchMessages`); when it is not wired, an unknown batchId is reported `pending`.
- `onBatchSequenced(listener)` broadcasts `(batchId, sequenceNumber)` as each batch is processed inbound, so any connected client can promote a matching pending mark in its own store (resolution is not tied to the capturing client). Returns an unsubscribe. Listeners run synchronously on the inbound op path, so each invocation is isolated: a throwing listener is caught, logged (`VersionMarkListenerException`), and skipped — it cannot abort op processing or starve later listeners (mirroring the container's `EventEmitterWithErrorHandling`). A missed live promotion is recoverable — the app can still resolve that mark later via `resolve()`'s history scan — so a listener fault logs and continues rather than faulting the container.

Host exposure: `ContainerRuntime` exposes an `@internal` `versionMarkResolver` property. An app gets it from the runtime instance passed to `provideEntryPoint`, or exposes it from its own entryPoint. A future public API may move this onto container-runtime definitions rather than the concrete runtime class.

### Capture implementation

`VersionMarkResolver.captureVersionMark()` executes in this order:

1. Call the `flushPendingBatch` hook (`ContainerRuntime.flush`) so the current outbox batch is moved into `PendingStateManager` and assigned stable batch information.
2. Read `getCurrentSequenceNumber()` (`deltaManager.lastSequenceNumber`) as the capture's globally sequenced lower bound.
3. Read `getCurrentPendingBatchId()` (`PendingStateManager.getMostRecentPendingBatchId()`).
4. If no pending batch exists, return `{ kind: "resolved", sequenceNumber }`. This path does not enable inbound tracking because there is no pending batch to promote.
5. If a pending batch exists, set the sticky `tracking` flag and return `{ kind: "pending", batchId, referenceSequenceNumber }`.

The method has an asynchronous API and must be awaited by consumers. The current hooks execute synchronously, but keeping capture as one awaited operation prevents callers from observing or persisting the intermediate state between flushing, reading the sequence number, and reading the batch id.

`PendingStateManager.getMostRecentPendingBatchId()` deliberately indexes back by `lastPendingMessage.batchInfo.length` to reach the batch's first pending message. `addBatchMetadata` stamps an explicit resubmission `batchId` only on that first message; using `peekBack()` directly would instead inspect the batch-end message and incorrectly derive a new id from the resubmitting client. An assertion guards the queue invariant that the recorded batch length must point to an existing batch-start message.

## Consumer surface & public-API graduation

An app (e.g. the Loop/office-bohemia host) consumes a small surface, all `@internal` today (fine for first-party):

- Get the resolver: `ContainerRuntime.versionMarkResolver` -> `IVersionMarkResolver`.
- `IVersionMarkResolver` methods: `captureVersionMark()` -> `VersionMarkCapture` (capture — seals the batch, returns the locator data atomically), `onBatchSequenced(listener)` (live promotion), `resolve(batchId, referenceSequenceNumber)` -> `ResolveResult` (load-time sweep / restore).
- Types `IVersionMarkResolver`, `ResolveResult`, and `VersionMarkCapture` are exported from `@fluidframework/container-runtime`.
- Restore side (separate, already merged): `loadContainerToSequenceNumber` in `@fluidframework/container-loader` (`@internal`), fed the `resolved` sequence number.

### Capturing a mark (app side)

Capture is a single `await resolver.captureVersionMark()` returning a `VersionMarkCapture` — either `{ kind: "pending", batchId, referenceSequenceNumber }` (an unacked local edit, resolve it later) or `{ kind: "resolved", sequenceNumber }` (no in-flight local work). Notes for consumers:

- **It is async, and it seals the current outbound batch** (flushes the runtime) so the just-submitted edit has a stable `batchId` before it is read. Call it at savepoint boundaries (e.g. an explicit "snapshot this version"), not per keystroke — it submits the pending batch as a side effect.
- **The runtime composes the pending-vs-resolved result atomically.** The app no longer reads a batchId and a reference sequence number separately or decides pending-vs-resolved itself; that removes the earlier race where a batchId still in the outbox came back stale/`undefined` and got paired with a mismatched sequence number, persisting a wrong coordinate.
- **The app still owns storage.** `VersionMarkCapture` is a transient result, not a persisted locator type — the app maps it into its own stored record.
- **Works while disconnected.** A disconnected flush stamps a stable placeholder `batchId` (carried across resubmit), so capture returns a usable `pending` mark offline; no connection is required to capture.

Not consumed by the app (internal plumbing): `IContainerContextInternal.fetchOps`, the concrete `VersionMarkResolver`, `IHistoricalOpReader`, `VersionMarkResolverRuntimeHooks` (including `getHistoricalOpReader` and `createHistoricalOpUnpacker`), `inboundVersionMarkUpdate`, and `processInboundBatch`.

To graduate to a public API: (1) promote the tags on `IVersionMarkResolver`, `ResolveResult`, `VersionMarkCapture`, and `loadContainerToSequenceNumber` (`@internal` -> `@alpha`); (2) move the access point off the concrete `@internal` `ContainerRuntime` class onto a public runtime interface (container-runtime-definitions) or the entryPoint / `FluidObject` provider pattern. The interface is already public-ready in shape — all methods are primitive-typed (no `MarkLocator` or driver types leak) — so only the tag bump and access-point move remain. The `fetchOps` plumbing is loader→runtime internal wiring on `IContainerContextInternal` and is `@internal`; the resolver surface is the external touchpoint.

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

`Container.fetchOps()` connects to delta storage on every call through `service.connectToDeltaStorage()`. This avoids retaining a handle across reconnects, epoch changes, or service replacement. If the current service cannot provide delta storage, it throws `"Cannot fetch ops: delta storage is unavailable"`. Otherwise it forwards `from`, `to`, and `abortSignal` directly to `IDocumentDeltaStorageService.fetchMessages`.

During `ContainerRuntime` construction, the context is narrowed to `IContainerContextInternal` and the same `VersionMarkResolver` instance is stored twice:

- `versionMarkResolverInternal` exposes implementation-only methods and `isTracking` to the runtime.
- `versionMarkResolver` exposes only `IVersionMarkResolver` to the host.

The runtime hooks are wired as follows:

- `getCurrentSequenceNumber` -> `deltaManager.lastSequenceNumber`.
- `getCurrentMinimumSequenceNumber` -> `deltaManager.minimumSequenceNumber`.
- `getCurrentPendingBatchId` -> `pendingStateManager.getMostRecentPendingBatchId()`.
- `flushPendingBatch` -> `ContainerRuntime.flush()`.
- `logger` -> a child logger in the `VersionMarkResolver` namespace.
- `getHistoricalOpReader` -> a lightweight `{ fetchMessages: fetchOps }` adapter when `fetchOps` exists.
- `createHistoricalOpUnpacker` -> a factory for a fresh `RemoteMessageProcessor` when `fetchOps` exists.

Each historical scan gets its own `RemoteMessageProcessor` because `OpSplitter` keeps chunk-reassembly state. The processor is built with the runtime's chunk-size and max-batch-size options, an `OpDecompressor`, and an `OpGroupingManager` configured with the runtime's grouped-batching setting. The returned unpack function:

1. Rejects non-`Operation` messages and messages without a string `clientId`; these are system/server messages and cannot carry a runtime batch identity.
2. Clones the op so history resolution does not mutate the driver's object.
3. Deserializes string contents with `ensureContentsDeserialized`.
4. Runs the clone through `RemoteMessageProcessor.process`, using the same legacy-log callback shape as the live path.

If `fetchOps` is absent, both historical hooks are absent. Live resolution still works, while an unknown id conservatively resolves to `pending`.

## Resolution behavior

### Live inbound tracking

`ContainerRuntime` owns `versionMarkInboundBatchId`, which carries a batch id between piecemeal inbound messages. After `PendingStateManager.processInboundMessages` successfully validates an inbound result, the runtime checks `versionMarkResolverInternal.isTracking`. If tracking is disabled, it skips all version-mark work on the hot path. If tracking is enabled, it calls `inboundVersionMarkUpdate(inboundResult, versionMarkInboundBatchId)`, records any completed batch through `processInboundBatch`, and stores the returned `carriedBatchId` for the next message.

The version-mark update runs **after** `PendingStateManager.processInboundMessages` has validated the inbound batch. That validation throws for a batch that must be rejected (fork detection — a remote batch matching a pending local batchId — or a pending-content mismatch), and `processInboundBatch` synchronously fires `onBatchSequenced`, which an app uses to promote a mark in its own (possibly external, irreversible) store. Sequencing the update after validation ensures a rejected batch never promotes a mark.

`inboundVersionMarkUpdate` handles every `InboundMessageResult` shape:

- `fullBatch`: derive the effective id from `batchStart`; resolve at the last message's sequence number. An empty grouped batch has no messages, so it uses the batch-start key message's sequence number.
- `batchStartingMessage`: derive and carry the batch id without recording a sequence number yet.
- `nextBatchMessage` with `batchEnd: true`: if an id is being carried, resolve it at this final message's sequence number and clear the carry.
- Mid-batch messages, or an end message without a carried id: preserve the current carry and emit no completed batch.

`VersionMarkResolver.processInboundBatch` first suppresses an exact duplicate `(batchId, sequenceNumber)` update. Otherwise it inserts the mapping, evicts entries below the current MSN, and synchronously invokes every subscribed listener. Listener iteration uses a `Set`, so unsubscribe removes future notifications. Each listener has its own `try/catch`; a fault emits `VersionMarkListenerException` and iteration continues.

The runtime does not store or mutate app marks. The listener is only a notification that lets the app replace its own pending locator with the supplied sequence number.

### Resolve control flow

`resolve(batchId, referenceSequenceNumber)` performs:

1. Look up `batchId` in the session map. A hit immediately returns `resolved` and never consults storage.
2. Call `getHistoricalOpReader` on a miss. If no reader is available, return `pending`.
3. Set `from = referenceSequenceNumber + 1`, create a fresh unpacker, and create an `AbortController`.
4. Request `fetchMessages(from, undefined, abortSignal)`.
5. Read every stream chunk until the target is found or the stream returns `done`.
6. Return the matched completed batch's last sequence number, or classify the miss.
7. Abort the controller in `finally`, both on success and on exhaustion/error, so the underlying fetch can stop any remaining work.

For each raw op, the scan records the first returned sequence number before filtering because that value is also the trim-availability signal. It then:

1. Drops a `batch: false` marker when no batch is currently in progress. The scan anchor may land inside a batch whose start was before `from`; feeding that orphan end marker to `RemoteMessageProcessor` would violate its batch-state invariant.
2. Passes the op to the unpacker. `undefined` means a filtered system op or an incomplete chunk waiting for more fragments.
3. Mirrors the unpacker's batch-in-progress state from `batchStartingMessage` and final `nextBatchMessage` results.
4. Calls `inboundVersionMarkUpdate`, carrying the batch id across piecemeal results exactly as the live path does.
5. Returns immediately when the completed batch id matches the requested id.

The clipped-leading-batch guard cannot discard the target batch: the target was pending at capture, so it must have sequenced after `referenceSequenceNumber` and therefore starts inside the requested window.

Routing scanned ops through the live unpack pipeline is required for **chunked batches**. Chunking strips the `batchId` from the final chunk's wire metadata and restores it only after `OpSplitter` reassembly. A raw metadata scan would therefore miss a resubmitted chunked batch. The shared pipeline also keeps grouped and compressed batch handling consistent with live processing.

### `pending` vs `unresolvable` on a miss (read-derived availability)

When the scan does not find the batch, the result distinguishes **`pending`** ("not sequenced yet — retry later") from **`unresolvable`** ("its ops were trimmed — gone forever"). Both look identical from the batch id alone (the batch is simply absent), so the distinction uses a **read-derived availability signal**: the current tip (`getCurrentSequenceNumber`) plus where the scan's first op landed relative to `from = referenceSequenceNumber + 1`:

- `from > tip` — nothing is sequenced at/after the reference point yet, so the batch cannot have landed → **`pending`**.
- Empty read while ops should exist (`from <= tip`) — the requested range came back empty, which for a strict driver (ODSP's `validateMessages` empties a from-misaligned trimmed range) means the range was trimmed → **`unresolvable`**.
- First available op is past `from` — a trim gap at the anchor; the mark's batch (sequenced just after the reference point) was trimmed → **`unresolvable`**. A found batch resolves before this check, so a gap **on a miss** genuinely means the batch's ops are gone, not merely preceded by other clients' ops (which are still present at `from`).
- Ops present from `from` but the batch is not among them — it has not been sequenced yet → **`pending`**.

This is an **interim, read-derived** signal: it infers availability from how the driver responds to a trimmed range, which is driver-behavior-dependent (strict-empty vs return-from-earliest) and degrades to the conservative outcome when ambiguous. A dedicated driver op-availability / retention API (e.g. an explicit earliest-retained-sequence-number query on `IDocumentDeltaStorageService`, coordinated across drivers) would replace it with a precise, contractual signal — a separate follow-up.

### Error handling and invariants

- A historical reader must never return an op below `from`. `classifyMiss` asserts this because trim classification is invalid if the range contract is violated.
- Delta-storage connection/fetch failures and unpacking failures propagate to the caller. They are operational failures, not legitimate `pending` or `unresolvable` results, so the resolver does not convert them into success-shaped fallback values.
- The `AbortController` is aborted in `finally`, including when a reader, stream, or unpacker throws.
- Listener failures are the deliberate exception: app callback code is isolated, logged, and skipped because a missed live promotion remains recoverable through history.
- Inbound pending-state validation runs before notification. A rejected/forked batch cannot cause an irreversible app-side promotion.
- `sequenceNumberByBatchId` is only a session cache. Correctness must not depend on an entry remaining present; when a historical reader is available, a miss can fall back to retained history.

## Loading a mark

Loading (restoring) a mark is two explicit steps, and the resolver is the bridge between them:

```
locator --resolve()--> sequenceNumber --loadContainerToSequenceNumber()--> IContainer
```

1. `resolve(batchId, referenceSequenceNumber)` turns the locator into a concrete `sequenceNumber` (a `resolved` mark already carries its `sequenceNumber`, so it skips this step entirely).
2. `loadContainerToSequenceNumber({ request, loadToSequenceNumber, ... })` (the loader's point-in-time primitive) materializes a read-only container at that sequence number.

The load primitive stays **mark-agnostic** — it takes a raw `sequenceNumber` and never learns what a "mark" is. This is the deliberate design choice (decision A): the resolver owns the locator→sequence translation, the loader owns materialization, and the two do not merge.

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

`VersionMarkResolver.sequenceNumberByBatchId` (`Map<batchId, sequenceNumber>`) is a **live-session fast-path cache**, not a source of truth: `processInboundBatch` inserts one entry per inbound batch, and `resolve()` reads it only as the fast path before falling back to the authoritative historical-op scan (`resolveFromHistory`). The protocol invariant is that a `batchId` maps to one `sequenceNumber` forever; the implementation suppresses an identical repeated update and otherwise uses `Map.set`. A miss degrades to the history scan when a reader is available, so eviction affects speed rather than correctness while the ops remain retained.

`processInboundBatch` bounds the map by evicting entries whose `sequenceNumber` is below the current MSN (the `getCurrentMinimumSequenceNumber` hook), mirroring `DuplicateBatchDetector`. Entries insert in sequence order, so eviction iterates from the front and stops at the first retained entry (amortized O(evicted)). This caps the map to the collaboration window — no magic constant. Below the MSN every client has processed the batch and any pending mark has already been promoted via `onBatchSequenced`, so a dropped entry's later resolutions go through the history scan anyway.

### Tracking gate (`isTracking`)

Per-inbound-batch work (deriving the batch identity and populating the map/notifying listeners) is **gated on a sticky `isTracking` flag**, so a container that never uses version marks does no version-mark work on the hot path. This mirrors #22497, which gated `DuplicateBatchDetector` on offline load being enabled even though its cost was small — there is no reason to pay a predictable per-batch cost for a feature that can't do anything. Tracking flips on (and stays on) the first time the feature is actually used this session: a **pending** `captureVersionMark()` (a resolved capture needs no tracking) or an `onBatchSequenced` subscription. The runtime reads `versionMarkResolver.isTracking` and skips the whole update block while it is false. A batch in flight at the moment tracking flips on may be missed, which is harmless: an app's own captured mark is for a not-yet-sequenced edit (tracked once it lands), and cross-session resolution uses the history scan regardless.

## Test map

- `src/test/versionMarks/inboundBatch.spec.ts` covers full, empty, derived-id, explicit-id, and piecemeal batch updates.
- `src/test/versionMarks/versionMarkResolver.spec.ts` covers capture ordering/results, the tracking gate, live-map precedence, no-reader behavior, fresh and resubmitted batches, multi-op batches across stream reads, chunk reassembly, clipped leading batches, all miss classifications, range arguments, reader-contract assertion, abort behavior, listener isolation/unsubscribe/deduplication, and MSN eviction.
- `src/test/pendingStateManager.spec.ts` covers ignoring unapplied stashed messages, deriving a fresh batch id, choosing the newest batch, and preserving an explicit id from the first op of a multi-op resubmission.
- `src/test/containerRuntime.spec.ts` covers the complete context `fetchOps` -> real unpack pipeline -> resolver path, filtering system/server ops, aborting after a match, and the ordering guarantee that failed inbound validation does not notify listeners.

## Historical-op retention limitation

Cross-client or headless resolution of an old pending mark falls back to the historical-op scan. This covers the case where the capturing client dies before its own ack and no other live client promoted the mark: a fresh client can resolve the stored `batchId` from retained ops even though that op will not reappear on the live inbound stream.

Resolution is still bounded by op retention. Once the target range has been trimmed, there is no runtime-owned durable `batchId -> sequenceNumber` index to recover it, so the resolver returns `unresolvable`. As described above, the current trim detection is read-derived and driver-dependent; a future explicit op-availability API would make that classification contractual.

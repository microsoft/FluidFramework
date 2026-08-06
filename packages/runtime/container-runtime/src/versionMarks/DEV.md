# Version marks runtime resolver

Version marks keep mark storage out of the Fluid runtime. The app owns mark records, labels, timestamps, retention, promotion, **and the stored locator shape**. Fluid owns only a runtime resolver that can turn a pending batchId into a durable global sequence number when this client observes that batch sequence.

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

## Resolver API

`VersionMarkResolver` implements `IVersionMarkResolver`:

- `captureVersionMark()` captures a mark at the current point and returns a `VersionMarkCapture`: either `{ kind: "pending", batchId, referenceSequenceNumber }` (an unacked local edit, resolve it later) or `{ kind: "resolved", sequenceNumber }` (no in-flight local work). It **seals the current outbound batch first** (flushes the runtime), because a batch's `batchId` is only assigned when it is flushed into `PendingStateManager` — see [Batch identity](#batch-identity). This is why it is a single async call rather than two synchronous getters: reading a pending `batchId` synchronously right after an edit would return an older batch or `undefined` (the edit is still in the outbox, pre-flush, with no id yet), and reading the id and reference point separately could yield a mismatched pair. The app packs its own stored record from the result — the runtime does not define the stored locator shape. Sealing the batch is a side effect (it submits the current batch), so capture at savepoint boundaries, not per keystroke.
- `resolve(batchId, referenceSequenceNumber)` resolves live-then-history: (1) the ephemeral in-session `batchId -> sequenceNumber` map (batch seen live this session); (2) on a miss, an **out-of-session scan** — reads ops from `referenceSequenceNumber` forward via an injected `IHistoricalOpReader`, routes each op through the **same unpack pipeline the live inbound path uses** (chunk reassembly, ungroup, decompress) and derives batch identity with the shared `inboundVersionMarkUpdate` helper, returning the matched batch's **last** op sequence number, or (when not found) `pending` / `unresolvable` distinguished by a read-derived availability check (see Resolution behavior). The reader is generic (backed by any driver's `IDocumentDeltaStorageService.fetchMessages`); when it is not wired, an unknown batchId is reported `pending`.
- `onBatchSequenced(listener)` broadcasts `(batchId, sequenceNumber)` as each batch is processed inbound, so any connected client can promote a matching pending mark in its own store (resolution is not tied to the capturing client). Returns an unsubscribe. Listeners run synchronously on the inbound op path, so each invocation is isolated: a throwing listener is caught, logged (`VersionMarkListenerException`), and skipped — it cannot abort op processing or starve later listeners (mirroring the container's `EventEmitterWithErrorHandling`). A missed live promotion is recoverable — the app can still resolve that mark later via `resolve()`'s history scan — so a listener fault logs and continues rather than faulting the container.

Host exposure: `ContainerRuntime` exposes an `@internal` `versionMarkResolver` property. An app gets it from the runtime instance passed to `provideEntryPoint`, or exposes it from its own entryPoint. A future public API may move this onto container-runtime definitions rather than the concrete runtime class.

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

## Resolution behavior

Container inbound processing calls `versionMarkResolver.processInboundBatch(effectiveBatchId, sequenceNumber)` when a batch is complete, using the final op sequence number for non-empty batches. This updates the ephemeral resolver map and notifies `onBatchSequenced` listeners. The runtime does not store or mutate marks; the app performs promotion by updating its own store from pending batchId to resolved sequence number.

The version-mark update runs **after** `PendingStateManager.processInboundMessages` has validated the inbound batch. That validation throws for a batch that must be rejected (fork detection — a remote batch matching a pending local batchId — or a pending-content mismatch), and `processInboundBatch` synchronously fires `onBatchSequenced`, which an app uses to promote a mark in its own (possibly external, irreversible) store. Sequencing the update after validation ensures a rejected batch never promotes a mark.

`resolve(batchId, referenceSequenceNumber)` first checks the ephemeral in-session map. On a miss it scans historical ops via the injected `IHistoricalOpReader` (`getHistoricalOpReader` hook) from `referenceSequenceNumber + 1` forward, matching batch identity and returning the batch's final op sequence number when found.

The scan routes each fetched op through the **same unpack pipeline the live inbound path uses** — a per-scan `RemoteMessageProcessor` created via the `createHistoricalOpUnpacker` hook (a fresh instance per scan since it holds chunk-reassembly state) — and derives identity with the shared `inboundVersionMarkUpdate` helper. This matters for **chunked batches**: chunking strips the `batchId` from the final chunk's wire metadata and restores it only after `OpSplitter` reassembly, so a raw-metadata scan would silently miss a resubmitted chunked batch. Grouped and compressed batches preserve identity in wire metadata, but routing everything through one pipeline keeps the history scan and the live path in lock-step. When the unpacker hook is absent (no `fetchOps`), the scan cannot identify batches and reports `pending` / `unresolvable`.

**Mid-batch scan anchor.** The scan starts at `from = referenceSequenceNumber + 1`, which is **not guaranteed to be a batch boundary** (`referenceSequenceNumber` is an arbitrary app-captured coordinate; the `RemoteMessageProcessor` otherwise assumes it always sees a batch from its first op). If `from` lands inside a batch whose start precedes the window, the scan would hand the processor an orphan batch-end marker and trip its `0x9d5` assert — turning a `resolve()` into a throw, which its contract forbids. The scan guards against this: it mirrors the processor's batch-in-progress state and **drops a leading `batch: false` marker seen while not inside a batch** (the clipped tail of a pre-window batch), only feeding the processor once aligned. This is safe because the target batch was pending at capture, so all its ops are within the window — it is never the clipped batch, and dropping the clip cannot cause a missed match.

The reader is wired through the container→runtime seam, mirroring `submitFn` (the write direction): the loader injects an optional `fetchOps(from, to?, abortSignal?) => Promise<IStream<ISequencedDocumentMessage[]>>` via **`IContainerContextInternal`** — an `@internal` interface extending `IContainerContext`, so `fetchOps` stays off the public/legacy `IContainerContext` contract. The `Container` implements it via its own delta storage (`service.connectToDeltaStorage().fetchMessages`, `container.ts`); and `ContainerRuntime` narrows the context to `IContainerContextInternal` to read it and passes it into the resolver as both `getHistoricalOpReader` and (wrapped in a `RemoteMessageProcessor`) `createHistoricalOpUnpacker`. It stays generic — `fetchOps` is backed by the driver-agnostic `IDocumentDeltaStorageService`, so the runtime never imports a driver. When a host provides no `fetchOps`, the hooks are absent and unknown batchIds return `pending`. The scan threads an `AbortSignal` and aborts the in-flight fetch once the batch is found (or the range is exhausted).

### `pending` vs `unresolvable` on a miss (read-derived availability)

When the scan does not find the batch, the result distinguishes **`pending`** ("not sequenced yet — retry later") from **`unresolvable`** ("its ops were trimmed — gone forever"). Both look identical from the batch id alone (the batch is simply absent), so the distinction uses a **read-derived availability signal**: the current tip (`getCurrentSequenceNumber`) plus where the scan's first op landed relative to `from = referenceSequenceNumber + 1`:

- `from > tip` — nothing is sequenced at/after the reference point yet, so the batch cannot have landed → **`pending`**.
- Empty read while ops should exist (`from <= tip`) — the requested range came back empty, which for a strict driver (ODSP's `validateMessages` empties a from-misaligned trimmed range) means the range was trimmed → **`unresolvable`**.
- First available op is past `from` — a trim gap at the anchor; the mark's batch (sequenced just after the reference point) was trimmed → **`unresolvable`**. A found batch resolves before this check, so a gap **on a miss** genuinely means the batch's ops are gone, not merely preceded by other clients' ops (which are still present at `from`).
- Ops present from `from` but the batch is not among them — it has not been sequenced yet → **`pending`**.

This is an **interim, read-derived** signal: it infers availability from how the driver responds to a trimmed range, which is driver-behavior-dependent (strict-empty vs return-from-earliest) and degrades to the conservative outcome when ambiguous. A dedicated driver op-availability / retention API (e.g. an explicit earliest-retained-sequence-number query on `IDocumentDeltaStorageService`, coordinated across drivers) would replace it with a precise, contractual signal — a separate follow-up.

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

`VersionMarkResolver.sequenceNumberByBatchId` (`Map<batchId, sequenceNumber>`) is a **live-session fast-path cache**, not a source of truth: `processInboundBatch` inserts one entry per inbound batch, and `resolve()` reads it only as the fast path before falling back to the authoritative historical-op scan (`resolveFromHistory`). Values are immutable (a `batchId` maps to one `sequenceNumber` forever, so no invalidation), and a miss degrades to the history scan (so eviction only affects speed, never correctness).

`processInboundBatch` bounds the map by evicting entries whose `sequenceNumber` is below the current MSN (the `getCurrentMinimumSequenceNumber` hook), mirroring `DuplicateBatchDetector`. Entries insert in sequence order, so eviction iterates from the front and stops at the first retained entry (amortized O(evicted)). This caps the map to the collaboration window — no magic constant. Below the MSN every client has processed the batch and any pending mark has already been promoted via `onBatchSequenced`, so a dropped entry's later resolutions go through the history scan anyway.

### Tracking gate (`isTracking`)

Per-inbound-batch work (deriving the batch identity and populating the map/notifying listeners) is **gated on a sticky `isTracking` flag**, so a container that never uses version marks does no version-mark work on the hot path. This mirrors #22497, which gated `DuplicateBatchDetector` on offline load being enabled even though its cost was small — there is no reason to pay a predictable per-batch cost for a feature that can't do anything. Tracking flips on (and stays on) the first time the feature is actually used this session: a **pending** `captureVersionMark()` (a resolved capture needs no tracking) or an `onBatchSequenced` subscription. The runtime reads `versionMarkResolver.isTracking` and skips the whole update block while it is false. A batch in flight at the moment tracking flips on may be missed, which is harmless: an app's own captured mark is for a not-yet-sequenced edit (tracked once it lands), and cross-session resolution uses the history scan regardless.


## Known floor / historical-op limitation

Cross-client or headless resolution of an old pending mark now falls to reading historical ops. If the only client makes an edit, the server sequences it, that client dies before its own ack, and no other live client processed the op, then no runtime session populated the ephemeral resolver map and no app-side promotion happened. A fresh client loading later does not re-see that historical op in the live inbound stream.

Recovering that case requires reading back the historical op stream, subject to retention, which overlaps the ODSP point-in-time loader work and is a separate TODO.

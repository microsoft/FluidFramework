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

- `getCurrentSequenceNumber()` returns the runtime's current processed sequence number. Apps can store `{ kind: "resolved", sequenceNumber }` when there is no in-flight local batch.
- `getCurrentPendingBatchId()` returns the most recent unacknowledged local batchId via `PendingStateManager.getMostRecentPendingBatchId()`. Apps store `{ kind: "pending", batchId, referenceSequenceNumber }` for edits not sequenced yet, using `getCurrentSequenceNumber()` for the reference point.
- `resolve(batchId, referenceSequenceNumber)` resolves live-then-history: (1) the ephemeral in-session `batchId -> sequenceNumber` map (batch seen live this session); (2) on a miss, an **out-of-session scan** — reads ops from `referenceSequenceNumber` forward via an injected `IHistoricalOpReader` and matches each batch's identity (`asBatchMetadata(op).batchId ?? generateBatchId(op.clientId, op.clientSequenceNumber)`), returning the matched batch's **last** op sequence number, or (when not found) `pending` / `unresolvable` distinguished by a read-derived availability check (see Resolution behavior). The reader is generic (backed by any driver's `IDocumentDeltaStorageService.fetchMessages`); when it is not wired, an unknown batchId is reported `pending`.
- `onBatchSequenced(listener)` broadcasts `(batchId, sequenceNumber)` as each batch is processed inbound, so any connected client can promote a matching pending mark in its own store (resolution is not tied to the capturing client). Returns an unsubscribe.

Host exposure: `ContainerRuntime` exposes an `@internal` `versionMarkResolver` property. An app gets it from the runtime instance passed to `provideEntryPoint`, or exposes it from its own entryPoint. A future public API may move this onto container-runtime definitions rather than the concrete runtime class.

## Consumer surface & public-API graduation

An app (e.g. the Loop/office-bohemia host) consumes a small surface, all `@internal` today (fine for first-party):

- Get the resolver: `ContainerRuntime.versionMarkResolver` -> `IVersionMarkResolver`.
- `IVersionMarkResolver` methods: `getCurrentPendingBatchId()` / `getCurrentSequenceNumber()` (capture), `onBatchSequenced(listener)` (live promotion), `resolve(batchId, referenceSequenceNumber)` -> `ResolveResult` (load-time sweep / restore).
- Types `IVersionMarkResolver` and `ResolveResult` are exported from `@fluidframework/container-runtime`.
- Restore side (separate, already merged): `loadContainerToSequenceNumber` in `@fluidframework/container-loader` (`@internal`), fed the `resolved` sequence number.

Not consumed by the app (internal plumbing): `IContainerContext.fetchOps`, the concrete `VersionMarkResolver`, `IHistoricalOpReader`, `VersionMarkResolverRuntimeHooks`, `inboundVersionMarkUpdate`, and `processInboundBatch`.

To graduate to a public API: (1) promote the tags on `IVersionMarkResolver`, `ResolveResult`, and `loadContainerToSequenceNumber` (`@internal` -> `@alpha`); (2) move the access point off the concrete `@internal` `ContainerRuntime` class onto a public runtime interface (container-runtime-definitions) or the entryPoint / `FluidObject` provider pattern. The interface is already public-ready in shape — all methods are primitive-typed (no `MarkLocator` or driver types leak) — so only the tag bump and access-point move remain.

## Resolution behavior

Container inbound processing calls `versionMarkResolver.processInboundBatch(effectiveBatchId, sequenceNumber)` when a batch is complete, using the final op sequence number for non-empty batches. This updates the ephemeral resolver map and notifies `onBatchSequenced` listeners. The runtime does not store or mutate marks; the app performs promotion by updating its own store from pending batchId to resolved sequence number.

`resolve(batchId, referenceSequenceNumber)` first checks the ephemeral in-session map. On a miss it scans historical ops via the injected `IHistoricalOpReader` (`getHistoricalOpReader` hook) from `referenceSequenceNumber + 1` forward, matching batch identity and returning the batch's final op sequence number when found.

The reader is wired through the container→runtime seam, mirroring `submitFn` (the write direction): `IContainerContext` gains an optional `fetchOps(from, to?, abortSignal?) => Promise<IStream<ISequencedDocumentMessage[]>>`; the `Container` implements it via its own delta storage (`service.connectToDeltaStorage().fetchMessages`, `container.ts`); and `ContainerRuntime` passes it into the resolver as `getHistoricalOpReader`. It stays generic — `fetchOps` is backed by the driver-agnostic `IDocumentDeltaStorageService`, so the runtime never imports a driver. When a host provides no `fetchOps`, the hook is absent and unknown batchIds return `pending`. The scan threads an `AbortSignal` and aborts the in-flight fetch once the batch is found (or the range is exhausted).

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

`processInboundBatch` bounds the map by evicting entries whose `sequenceNumber` is below the current MSN (the `getCurrentMinimumSequenceNumber` hook), mirroring `DuplicateBatchDetector`. Entries insert in sequence order, so eviction iterates from the front and stops at the first retained entry (amortized O(evicted)). This caps the map to the collaboration window on every container — no magic constant, and no need to gate on whether the feature is in use: below the MSN every client has processed the batch and any pending mark has already been promoted via `onBatchSequenced`, so older resolutions go through the history scan anyway.


## Known floor / historical-op limitation

Cross-client or headless resolution of an old pending mark now falls to reading historical ops. If the only client makes an edit, the server sequences it, that client dies before its own ack, and no other live client processed the op, then no runtime session populated the ephemeral resolver map and no app-side promotion happened. A fresh client loading later does not re-see that historical op in the live inbound stream.

Recovering that case requires reading back the historical op stream, subject to retention, which overlaps the ODSP point-in-time loader work and is a separate TODO.

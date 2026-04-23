# `@fluidframework/map` — Architecture

Internal reference for contributors. Assumes familiarity with the DDS model
(ops, summaries, `SharedObject`, `IFluidSerializer`, handles, reconnection,
rollback). For a user-facing overview see [`README.md`](./README.md); for API
contracts see [`src/interfaces.ts`](./src/interfaces.ts).

File references use `file:line` anchors against the current source tree.

---

## 1. Scope

The package ships two DDSes:

- **`SharedMap`** — flat string-keyed map, last-writer-wins, the spiritual
  analogue of a native `Map`.
- **`SharedDirectory`** — hierarchical sibling of `SharedMap`: each directory
  node behaves like a `SharedMap`, and nodes are arranged in a named tree of
  subdirectories.

They share machinery (pending-state model, value model, handle serialization,
snapshot blob layout) but are implemented as independent classes — there is no
shared base class beyond `SharedObject`. Both are `@legacy @beta` surface; see
`AB#35245` / `AB#8004` for the in-flight deprecation plan.

## 2. Package layout

```
src/
├── index.ts                  Public + legacy exports
├── interfaces.ts             Public contracts (ISharedMap/ISharedDirectory/events)
├── internalInterfaces.ts     Wire-format op shapes; ISerializableValue (legacy)
├── localValues.ts            ILocalValue, serializeValue, handle migration
├── utils.ts                  findLast/findLastIndex polyfills
├── map.ts                    SharedMap class (facade over MapKernel)
├── mapKernel.ts              All SharedMap state, op processing, iteration
├── mapFactory.ts             MapFactory + SharedMap entrypoint
├── directory.ts              SharedDirectory + SubDirectory (monolithic)
├── directoryFactory.ts       DirectoryFactory + SharedDirectory entrypoint
├── packageVersion.ts         Generated pkg version string
└── test/                     Mocha tests
```

The `directory.ts` file is deliberately large and monolithic — `SubDirectory`
holds private references into `SharedDirectory` (e.g. `this.directory` at
`directory.ts:1154`), and they co-evolve. Splitting them would expose internal
APIs across module boundaries. The map equivalent is split (`SharedMap` in
`map.ts` is a thin facade; logic lives in `MapKernel` at `mapKernel.ts`) because
there is no tree — a single kernel suffices.

## 3. Entrypoints and the factory pattern

Both DDSes follow the `createSharedObjectKind` pattern:

```typescript
// mapFactory.ts:87, directoryFactory.ts:87
export const SharedMap = createSharedObjectKind<ISharedMap>(MapFactory);
export const SharedDirectory = createSharedObjectKind<ISharedDirectory>(DirectoryFactory);
```

The class that actually extends `SharedObject` is imported as an internal
alias (`SharedMapInternal`, `SharedDirectoryInternal`) in the factory files and
never exported directly. Consumers call `SharedMap.create(runtime, id)` (or
equivalent), never `new SharedMap(...)`. The module also exports a type alias
(`export type SharedMap = ISharedMap` at `mapFactory.ts:95`) so
`SharedMap` reads as both a value (factory) and a type (interface).

Legacy factory classes (`MapFactory`, `DirectoryFactory`) are still exported
from `index.ts:33-34` for consumers that register DDS types explicitly. They
are marked for removal (AB#35245).

Factory attributes:

| Factory           | Type string                                         | Snapshot format version |
| ----------------- | --------------------------------------------------- | ----------------------- |
| `MapFactory`      | `https://graph.microsoft.com/types/map`             | `0.2`                   |
| `DirectoryFactory`| `https://graph.microsoft.com/types/directory`       | `0.1`                   |

Both type strings carry a commented-out migration target (`"map"` /
`"directory"`) gated on `LegacyTypeAwareRegistry`
(`mapFactory.ts:29-32`, `directoryFactory.ts:29-32`). When that machinery
ships, the short names will become canonical and the URL forms will be
accepted for back-compat only.

`create()` vs `load()` (`mapFactory.ts:60-80`, `directoryFactory.ts:60-80`) is
the standard `IChannelFactory` split: `create` calls `initializeLocal()` to
stand up a detached instance; `load` calls `load(services)` to hydrate from
storage.

## 4. Value model

### 4.1 `ILocalValue`

In-memory values are held behind `ILocalValue` (`localValues.ts:21`):

```typescript
export interface ILocalValue {
    readonly value: unknown;
}
```

That is the entire interface — a nominal wrapper. `MapKernel` stores
`Map<string, ILocalValue>` in `sequencedData` (`mapKernel.ts:131`).
`SubDirectory` stores `Map<string, unknown>` directly in `sequencedStorageData`
(`directory.ts:1697`), having dropped the wrapper — a minor inconsistency
between the two DDSes that has no runtime consequence since the wrapper adds
no data.

### 4.2 Serialization

Values are serialized to the wire via `serializeValue()`
(`localValues.ts:31-42`), which delegates to `serializeHandles()` from
`shared-object-base`. Handles embedded anywhere in a value graph are
replaced by `ISerializedHandle` (`{ type: "__fluid_handle__", url }`) and
bound against the owning DDS's handle. On load, `serializer.decode()`
reverses the transformation.

**Note:** `SharedDirectory` does not call `serializeValue()` when building its
set op (`directory.ts:1266` emits `{ type: ValueType[ValueType.Plain], value }`
with the raw value). Handle serialization happens at the `SharedObject`
submission layer, not in the DDS itself. `SharedMap` does the same at
`mapKernel.ts` around the set path. This is intentional: the wire format
carries the pre-encoded shape, and the runtime encodes handles in transit.

### 4.3 `ValueType.Shared` migration

Old containers stored direct references to other SharedObjects as
`ValueType.Shared` entries, with the channel ID in place of the value.
`migrateIfSharedSerializable()` (`localValues.ts:52-70`) upgrades these to
handles on load: parses the channel ID into an `ISerializedHandle`, roundtrips
it through `parseHandles()` (necessary to resolve the legacy absolute path),
and re-encodes via `serializer.encode()`. This is called during snapshot load
and (defensively) during op processing.

Modern code writes only `ValueType.Plain`. `ISerializableValue` itself is
deprecated (`internalInterfaces.ts:72-75`) and re-exported only for legacy
consumers.

## 5. Op model

### 5.1 `SharedMap` ops (`internalInterfaces.ts:9-49`)

| Type     | Payload                                  |
| -------- | ---------------------------------------- |
| `set`    | `{ type: "set", key, value }`            |
| `delete` | `{ type: "delete", key }`                |
| `clear`  | `{ type: "clear" }`                      |

Union: `IMapOperation` (`mapKernel.ts:56`). No sequence numbers, no refSeq, no
versioning. Order is established by the message-sequencing service; matching of
acks to pending local ops is by `localOpMetadata` reference identity.

### 5.2 `SharedDirectory` ops (`directory.ts:95-213`)

Every op carries an absolute `path` field (e.g. `"/a/b/c"`) that routes it to
the correct `SubDirectory`.

Storage ops (`IDirectoryStorageOperation`):

| Type     | Payload                                         |
| -------- | ----------------------------------------------- |
| `set`    | `{ type: "set", path, key, value }`             |
| `delete` | `{ type: "delete", path, key }`                 |
| `clear`  | `{ type: "clear", path }`                       |

Subdirectory ops (`IDirectorySubDirectoryOperation`):

| Type                | Payload                                                        |
| ------------------- | -------------------------------------------------------------- |
| `createSubDirectory`| `{ type: "createSubDirectory", path, subdirName }`             |
| `deleteSubDirectory`| `{ type: "deleteSubDirectory", path, subdirName }`             |

Paths are normalized via `path-browserify` (posix) routines; `posix.join` is
used when building absolute paths at `SubDirectory` construction
(`directory.ts:1312` and similar).

## 6. The pending-state model — core concept

Both DDSes implement an identical pattern for tracking local, unacknowledged
edits so that reads are optimistic (they reflect local writes immediately),
remote ops can be folded in without clobbering unacked local state, and
reconnection / rollback can replay exact edits.

### 6.1 Dual storage

Per-DDS (or per-`SubDirectory`):

- **`sequencedData` / `sequencedStorageData`** — a `Map` of keys to values
  reflecting only ops acknowledged by the service.
- **`pendingData` / `pendingStorageData`** — an ordered array of pending-op
  descriptors that express what the local client has done *after* the sequenced
  state.

Both together feed `getOptimisticValue(key)` (`mapKernel.ts:349-365`,
`directory.ts:1791-1808`), which is what `get()`, `has()`, and iteration return.

### 6.2 Pending entry kinds

The array holds one of four things (shapes identical up to the directory's
extra `path`/`subdir` fields; see `mapKernel.ts:74-108` and
`directory.ts:215-270`):

- **`PendingKeyLifetime`** — aggregates a run of `set`s to the same key under
  one entry with a `keySets: PendingKeySet[]` array. Created when the most
  recent pending entry for the key is absent, a delete, or a clear
  (`mapKernel.ts:409-424`, `directory.ts:1236-1253`). Subsequent sets to the
  same key *within the same lifetime* just push to `keySets` instead of adding
  a new pending entry. This is how iteration order is preserved: the lifetime
  keeps its position in `pendingData` even as the value mutates.
- **`PendingKeyDelete`** — terminates any lifetime for that key and pends a
  delete.
- **`PendingClear`** — terminates all lifetimes below it.
- (Directory-only) **`PendingSubDirectoryCreate` / `PendingSubDirectoryDelete`**
  in a separate `pendingSubDirectoryData` array (`directory.ts:1712`).

Each individual `PendingKeySet` / `PendingKeyDelete` / `PendingClear` is also
the `localOpMetadata` value that flows with `submitLocalMessage`. When the
server acks the op, the handler finds and removes it from `pendingData` by
reference identity (`mapKernel.ts:721, 778, 822`). For sets, the `PendingKeySet`
is `shift()`ed off the front of its lifetime's `keySets` array; the lifetime
disappears when `keySets` becomes empty.

### 6.3 Optimistic value resolution

`getOptimisticValue(key)` (`directory.ts:1791-1808`, analogous in
`mapKernel.ts`):

1. Find the *last* pending entry that affects this key (the key's own entry,
   or any `clear`).
2. If it's a lifetime, return the latest `keySets` value.
3. If it's a delete or a clear, return `undefined`.
4. Otherwise, fall through to `sequencedData.get(key)`.

This guarantees a local client sees its own writes before they are sequenced.

### 6.4 Event suppression under pending state

When a *remote* op arrives that would change a key for which local pending
state exists, the sequenced state is updated but the public event is *not*
emitted — because the optimistic value didn't change. Examples:

- Remote `set` on a key with a local pending lifetime: value writes into
  `sequencedData` silently; local reads still see the pending value
  (`mapKernel.ts:837`).
- Remote `delete` on a key with any pending entry: silent removal from
  `sequencedData` (`mapKernel.ts:788`, `directory.ts` analogue).
- Remote `clear` while a local pending `clear` exists: silent; the local clear
  already told consumers the map is empty (`mapKernel.ts:742`).

When the local pending op is eventually acked and popped, the sequenced state
already matches reality, so no further event is needed. This is one of the
subtler invariants in the codebase — changes to ordering must preserve it.

### 6.5 Rollback

`SharedObject.rollback()` fires when a batch is rolled back pre-send. Both
DDSes implement a symmetric inverse for each pending-entry kind
(`mapKernel.ts:637-700`, directory equivalents). Rollbacks emit
`valueChanged` with the appropriate `previousValue` so consumers can refresh.
For a rolled-back clear, individual `valueChanged` events are emitted for each
key that becomes visible again from `sequencedData`
(`mapKernel.ts:650-657`).

### 6.6 Resubmit on reconnect

`reSubmitCore()` iterates every remaining entry in `pendingData` and resends
via the original handler (`map.ts:277-279`, `directory.ts:687-695`). The same
metadata reference is carried through, so matching on ack continues to work.
The pending array is not cleared at any point in this flow — entries live
exactly until the matching ack arrives.

## 7. `SharedMap` internals

### 7.1 Facade / kernel split

`SharedMap` (`map.ts:42`) extends `SharedObject<ISharedMapEvents>` and owns a
single `MapKernel` (`map.ts:51`). The kernel receives callbacks for
`submitLocalMessage`, `isAttached`, the `IFluidSerializer`, the DDS's
`IFluidHandle`, and the event emitter (which is `this`, `map.ts:66-72`).

The facade:

- Forwards `get/set/delete/clear/keys/values/entries/forEach/has` to the kernel.
- Handles summarize/load.
- Forwards `processMessagesCore`, `reSubmitCore`, `applyStashedOp`, and
  `rollback` to kernel methods.

All state lives on the kernel. There is no kernel in the directory package — a
deliberate asymmetry given the tree structure.

### 7.2 Snapshot format (`0.2`)

`IMapSerializationFormat` (`map.ts:32-35`):

```typescript
{ blobs?: string[], content: IMapDataObjectSerializable }
```

Written as a "header" blob (`map.ts:37`) plus N data blobs listed in `blobs`.
The packing algorithm (`map.ts:196-236`):

- Values ≥ **8 KB** get their own blob.
- Remaining values pack into blobs up to **16 KB**.
- The header carries the blob manifest plus any leftover small values.

The algorithm is not stable across snapshots — reshuffling of small values is
expected and does not violate the format. The authors accept this
non-incrementality in exchange for simplicity; the load path (`map.ts:251-267`)
reads the header, promises the blobs in parallel, and passes each through
`kernel.populateFromSerializable()` (`mapKernel.ts:557-564`) which runs
`serializer.decode()` + `migrateIfSharedSerializable()` before inserting into
`sequencedData`.

### 7.3 Events

`ISharedMapEvents` (`interfaces.ts`):

- `valueChanged` — `{ key, previousValue }`, `local`, `target`
- `clear` — `local`, `target`

Local ops emit immediately after the pending entry is pushed, before returning
from the public method (`mapKernel.ts:437-442` for sets,
`mapKernel.ts:478-488` for deletes, `mapKernel.ts:533-537` for clears). Remote
ops emit only if no pending state suppresses them (see §6.4).

## 8. `SharedDirectory` internals

### 8.1 Tree topology

`SharedDirectory` (`directory.ts:407`) owns a single `root: SubDirectory`
constructed at `directory.ts:426-434` with `seqData = { seq: 0, clientSeq: 0 }`
(detached). All public map-like methods on `SharedDirectory` forward to
`this.root` (e.g. `directory.ts:472-506`).

Each `SubDirectory` (`directory.ts:1117`) holds:

- `absolutePath` (immutable, computed once, `directory.ts:1157`).
- `seqData: SequenceData` (`directory.ts:1152`) — the subdir's own creation
  ordering data (see §8.3).
- `clientIds: Set<string>` (`directory.ts:1153`) — clients that have *asserted*
  creation of this subdir. Persisted as `ccIds` in the snapshot
  (`directory.ts:288`).
- `_sequencedSubdirectories: Map<string, SubDirectory>` (`directory.ts:1132`).
- `sequencedStorageData: Map<string, unknown>` (`directory.ts:1697`).
- `pendingStorageData: PendingStorageEntry[]` (`directory.ts:1706`).
- `pendingSubDirectoryData: PendingSubDirectoryEntry[]` (`directory.ts:1712`).
- `_deleted: boolean` (`directory.ts:1121`).

There are **no parent pointers**. All tree traversal happens from the root via
`getWorkingDirectory(absolutePath)` (`directory.ts:618-633`), which walks the
path component-by-component through `getSubDirectory(name)`. Optimistic
deletion of any ancestor causes traversal to return `undefined`.

### 8.2 Dispose lifecycle

Two phases — this is one of the trickier invariants:

1. **Local soft delete** (local `deleteSubDirectory`, `directory.ts:1395-1432`):
   Adds a `PendingSubDirectoryDelete` to `pendingSubDirectoryData`. Emits
   `subDirectoryDeleted` and (via `emitDisposeForSubdirTree`) a `disposed`
   event. **Does not** set `_deleted = true` yet — the instance survives so
   rollback can restore it and so pending writes that were in flight against it
   can still be acked against a live object.
2. **Hard delete** (on remote ack of the delete,
   `processDeleteSubDirectoryMessage`): `disposeSubDirectoryTree()`
   (`directory.ts:2630-2645`) walks the subtree bottom-up, emits `disposed`,
   clears sequenced data, and sets `_deleted = true`. Removes the entry from
   the parent's `_sequencedSubdirectories`.

`undispose()` (`directory.ts:1172-1175`) is the symmetric inverse: used when
rolling back a delete or when a remote `createSubDirectory` arrives for a
currently-disposed subdir name that still has a live in-memory instance. Walks
the subtree, flips `_deleted = false`, emits `undisposed`.

`throwIfDisposed()` (`directory.ts:1181-1185`) guards mutating public methods,
not all reads — `get()` intentionally does not throw (`directory.ts:1200-1202`),
consistent with the public `dispose`/`disposed` contract.

### 8.3 `SequenceData` and subdirectory ordering

`SequenceData` (`directory.ts:389`):

```typescript
interface SequenceData {
    seq: number;       // -1 = pending-local, 0 = detached, >0 = server seq
    clientSeq?: number;
}
```

Subdirectories are ordered by `seqDataComparator` (`directory.ts:364-380`) when
iterated. The policy (docblock at `directory.ts:344-363`):

1. Acknowledged (`seq >= 0`) sorts before pending-local (`seq = -1`).
2. Within acknowledged, by `seq`, then by `clientSeq`.
3. Within pending-local, by `seq`, then by `clientSeq`.

`clientSeq` is needed when multiple creates share a server `seq` — which
happens under grouped batching (the batch gets one seq, individual ops are
ordered within it by client submission order) or for multiple local pending
creates.

On load, `clientSeq` is not persisted. The load path assigns a synthetic
`clientSeq` to each restored subdir (`directory.ts:741-748` region) to preserve
the relative order encoded in the snapshot's iteration order. This is a minor
source of potential cross-client divergence after reload; there is a TODO in
that neighborhood flagging the need for named constants and better structure.

### 8.4 Per-subdir pending state

Pending storage ops are tracked **per-subdirectory**, using the same lifetime
machinery as SharedMap (§6). The `SubDirectory.set()` implementation
(`directory.ts:1207-1282`) is a good worked example: it reads the optimistic
value, finds or creates a lifetime, pushes the `PendingKeySet`, submits the
op, and emits `valueChanged` (on the `SharedDirectory` root for absolute-path
consumers) and `containedValueChanged` (on the `SubDirectory` for local
consumers).

Pending subdirectory ops live in a separate array
(`pendingSubDirectoryData`, `directory.ts:1712`). Create/delete pairs do not
aggregate into a lifetime — subdir creation is fundamentally different from
key mutation, and idempotence is handled in the op processors
(`directory.ts:2080-2168`) rather than by the pending array.

### 8.5 Create/delete race handling

Concurrent create and delete of the same subdir are handled without a
tombstone structure:

- **Remote `createSubDirectory` while local create is pending**: if the subdir
  exists (either sequenced or from a pending local create), the op is a
  no-op on that subdir; if it exists but is currently disposed, `undispose()`
  it and re-emit `undisposed` (`directory.ts:2120-2122, 2141-2142`). Adds the
  remote client's id to `clientIds`.
- **Remote `deleteSubDirectory`**: fully disposes the subtree
  (`directory.ts:2217`). If there were pending local writes into that subtree,
  they will still flow to the in-memory (now-disposed) instance and their acks
  will be rejected by `isMessageForCurrentInstanceOfSubDirectory`
  (`directory.ts:2605-2619`), which checks `clientIds` membership.
- **Concurrent local create vs remote delete**: the remote delete wins on the
  sequenced side; the local create remains pending and, when it sequences,
  will recreate a fresh subdir (with a new identity — the old one stays
  disposed).

`isMessageForCurrentInstanceOfSubDirectory` (`directory.ts:2605-2619`) is the
guard that prevents stale ops from flowing into a reborn subdir: it checks
that the op's originating client is still in the current subdir's `clientIds`.
This is why `clientIds` is a set, not a single id — multiple clients can
co-create a subdir in the same seq batch.

### 8.6 Op routing

Remote op processing finds the target subdir via
`getSequencedWorkingDirectory(path)` (`directory.ts:639-654`), which is
identical in shape to `getWorkingDirectory` but walks *only* the sequenced
subdir maps (never pending). Ops arrive only at subdirs the server has already
accepted as existing. If the subdir has been deleted and re-created with a
different identity, `isMessageForCurrentInstanceOfSubDirectory` drops the op.

### 8.7 Snapshot format (`0.1`)

`IDirectoryNewStorageFormat` (`directory.ts:336-342`) is analogous to the map
format:

```typescript
{ blobs: string[], content: IDirectoryDataObject }
```

`IDirectoryDataObject` (`directory.ts:303`) is recursive:

```typescript
{
    storage?: IMapDataObjectSerializable,   // key -> ISerializableValue
    subdirectories?: { [name: string]: IDirectoryDataObject },
    ci?: ICreateInfo                         // { csn, ccIds[] }
}
```

`ICreateInfo` persists the `seq` (as `csn`) and `clientIds` (as `ccIds`)
(`directory.ts:279-289`) — enough to reconstruct `SequenceData` and the
identity-validation set on load.

The serializer (`directory.ts:1016-1081`) walks the tree depth-first building
the nested object. Values ≥ **8 KB** are externalized to their own blob,
with the blob containing the full path hierarchy needed to route the value
back in on load (`directory.ts:1044-1061`). Multiple large values produce
multiple independent blobs — no dedup, no merging.

Load (`directory.ts:700-715` and `populate`) is the inverse: parse header,
fetch blobs in parallel, call `populate(IDirectoryDataObject)` recursively.
Each subdir is instantiated with its restored `SequenceData` and `clientIds`.

### 8.8 Eventing

Two event interfaces:

- **`ISharedDirectoryEvents`** (`interfaces.ts:130-215`) — fires on
  `SharedDirectory` itself. `valueChanged` carries an absolute `path`. Also
  exposes tree-level events `subDirectoryCreated`/`subDirectoryDeleted` with
  relative paths, and both `clear` (deprecated) and `cleared` (with path).
- **`IDirectoryEvents`** (`interfaces.ts:223-296`) — fires on individual
  `SubDirectory` nodes. `containedValueChanged` carries only `{ key,
  previousValue }` (no path). Also `subDirectoryCreated`/`Deleted` (relative),
  `disposed`, `undisposed`.

`SharedDirectory`'s constructor (`directory.ts:456-464`) forwards three events
from its `root` (`containedValueChanged`, `subDirectoryCreated`,
`subDirectoryDeleted`) onto itself so root-level consumers can subscribe
uniformly. This is the one place the root is treated differently from other
subdirs.

Remote-op event emission checks `isNotDisposedAndReachable()`
(`directory.ts:1875-1879`) before emitting — a subdir that has become
unreachable (e.g. because a parent was deleted since the op was queued)
suppresses its events to avoid ghost notifications.

## 9. Iteration order

This is the subject of active work and the reason the current branch exists.

### 9.1 `SharedMap` keys

`MapKernel.internalIterator()` produces keys in **first-insertion order**:

1. Walk `sequencedData.keys()` (which preserves insertion order under
   standard `Map` semantics), skipping any key that a pending delete or clear
   will hide.
2. Walk `pendingData`, emitting each lifetime's key whose position postdates
   the last delete/clear affecting it, and which is not already present in
   `sequencedData` (or is re-inserted after a pending clear).

The invariant: a key's first-ever insertion position (local or sequenced) is
its iteration position, even if the value is later updated via further sets.
Lifetime aggregation (§6.2) is what makes this work — repeated sets to the
same key don't produce new pending entries and therefore don't alter iteration
position. See `mapKernel.ts:176-247` for the implementation.

### 9.2 `SharedDirectory` keys

`SubDirectory.internalIterator` (`directory.ts:1717-1785`) mirrors the
map behavior: sequenced keys first, then fresh pending-lifetime keys, with
deletes/clears suppressing appropriately.

### 9.3 `SharedDirectory` subdirectories

`subdirectories()` (`directory.ts:1437-1473`) collects live children from
`_sequencedSubdirectories` and non-deleted-pending `pendingSubDirectoryData`,
then sorts by `seqDataComparator` (§8.3). Ordering is by `seq` (then
`clientSeq`), not insertion — reflecting the fact that subdir identity is
server-seq-based, not insertion-based.

**Caveat from `interfaces.ts:375` area**: the public `ISharedMap` contract does
not guarantee key iteration order; the implementation happens to be
insertion-order-preserving. Any change to these semantics is a de facto (if
not de jure) API change and should be treated accordingly.

## 10. Garbage collection & attribution

No explicit `getGCData()` override is present in either DDS. Handles embedded
in values are serialized/bound via the `SharedObject` + `IFluidSerializer`
path, which participates in the container-level GC graph; the DDSes do not
declare their own GC routes.

No attribution machinery is present in this package. Attribution for map/
directory values, if required, would need to be added.

## 11. Known subtleties & gotchas

- **Iteration order is implementation-defined, not specified.** Consumers
  sometimes rely on first-insertion order for keys; this is currently true but
  not contractual. See §9.
- **Event suppression by pending state is silent.** Remote ops that are
  eclipsed by local pending state update `sequencedData` without emitting any
  event. Correct but easy to trip over when debugging.
- **A locally-deleted SubDirectory is not disposed until the delete is acked.**
  The in-memory instance remains live (with `_deleted = false`) through the
  local delete → remote ack window so pending writes and rollbacks work. Code
  reading `disposed` during that window sees `false`.
- **`clientIds` is a set, not a singleton.** Concurrent create-subdir ops from
  multiple clients co-assert creation; message-validity checks
  (`isMessageForCurrentInstanceOfSubDirectory`) gate on membership, not on a
  single "owner".
- **Snapshot packing for SharedMap is non-incremental for small values.**
  Small-value shuffling between blobs across summaries is expected. Consumers
  must not depend on stable blob identities.
- **`clientSeq` is not persisted.** On load, a synthetic `clientSeq` is
  assigned per subdir based on iteration order. Divergent clients reloading
  from the same snapshot agree; divergence can arise if batches are ungrouped
  differently on different clients during the live session pre-snapshot.
- **Op matching is by reference identity on `localOpMetadata`.** Anything that
  breaks referential identity between submit and ack paths (e.g. accidental
  cloning) will break the DDSes in ways that are hard to diagnose — pending
  ops silently fail to clear and the optimistic view diverges from sequenced
  state. Resubmission deliberately reuses the same metadata object.
- **Directory set op does not call `serializeValue`.** The op payload is built
  as a bare `{ type: ValueType[ValueType.Plain], value }` and the
  `SharedObject` submission layer handles handle serialization. `SharedMap`
  follows the same pattern on its set path.
- **`SubDirectory` stores raw `unknown`; `MapKernel` stores `ILocalValue`.**
  Functionally equivalent; a minor inconsistency that would take nontrivial
  churn to unify.
- **Directory summary format version is stuck at `0.1`.** Any non-backward-
  compatible change to `IDirectoryDataObject` requires a version bump and a
  load-path fork.
- **Legacy wire values (`ValueType.Shared`) still land in the load path.**
  Remove at your own risk — there is no telemetry proving every production
  snapshot has been migrated.

## 12. File-by-file pointers

Read in this order when onboarding:

1. `interfaces.ts` — public surface; get the mental model of the two DDSes.
2. `internalInterfaces.ts` — op shapes.
3. `localValues.ts` — value model and handle migration.
4. `mapKernel.ts` — the clearest worked example of the pending-state model.
5. `map.ts` — facade + snapshot format.
6. `directory.ts` — large; read §8 of this doc first, then skim top-down.
7. `mapFactory.ts`, `directoryFactory.ts` — construction and type strings.

## 13. Cross-references

- Deprecation tickets: `AB#35245` (factory classes), `AB#8004`
  (`ISerializableValue`, `ICreateInfo`, `IDirectoryDataObject`,
  `IDirectoryNewStorageFormat`).
- Type-string migration: `LegacyTypeAwareRegistry` in
  `packages/runtime/datastore/src/dataStoreRuntime.ts`.
- Base class and serialization: `@fluidframework/shared-object-base`
  (`SharedObject`, `IFluidSerializer`, `createSharedObjectKind`).

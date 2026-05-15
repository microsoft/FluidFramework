---
"@fluidframework/cell": minor
"@fluidframework/counter": minor
"@fluid-experimental/ink": minor
"@fluidframework/legacy-dds": minor
"@fluidframework/map": minor
"@fluidframework/matrix": minor
"@fluidframework/ordered-collection": minor
"@fluid-experimental/pact-map": minor
"@fluidframework/register-collection": minor
"@fluidframework/task-manager": minor
---

Implement squash-on-resubmit for non-tree DDSes

All non-tree DDSes now have explicit `reSubmitSquashed` overrides so staging-mode commits (`commitChanges({squash: true})`) can drop intermediate values before they reach the wire. Values written and removed within a single staging session — e.g. a sensitive string set and then deleted before commit — are no longer transmitted as part of the squashed batch.

The model is uniform across DDSes: the runtime walks staged pending changes oldest-to-newest and asks the DDS, for each change, whether a later staged change subsumes it. Subsumed changes are dropped (with the same kind of pending-state cleanup that rollback performs); non-subsumed changes are resubmitted unchanged. Pre-staging ops still in flight are never touched.

Per-DDS treatment:

- `SharedCell`, `SharedMap`, `SharedDirectory`, `SharedMatrix`: subsumption-aware squash drops superseded ops (per-cell / per-key LWW; for `clear` and `delete`, a later clear or a later op on the same key subsumes). For `SharedDirectory` subdirectory lifecycle ops, a staged `createSubDirectory(name) + deleteSubDirectory(name)` pair is also dropped so user-supplied subdirectory names don't leak when the pair nets to no-op.
- `SharedCounter`, `SharedTaskManager`: identity squash — increments and volunteer/abandon ops carry intent that is not subsumable by a later staged op of the same shape.
- `SharedSequence` and intervals: unchanged — squash was already wired end-to-end via merge-tree's `regeneratePendingOp(squash)`.
- `Ink`, `ConsensusRegisterCollection`, `ConsensusOrderedCollection`, `PactMap`, legacy `SharedArray`, legacy `SharedSignal`: identity squash with documented rationale. These DDSes have append-only, order-preserving, or consensus-bound semantics where collapsing pending ops would change observable behavior.

Together this removes the dependency on the `Fluid.SharedObject.AllowStagingModeWithoutSquashing` config flag fallback for the listed DDSes.

Known limitations (documented in code; not addressed in this changeset):

- `ConsensusOrderedCollection.add` carries a serialized user value; an `add(secret) → acquire → complete` chain inside a staging session still transmits the `add` op on commit.
- `ConsensusRegisterCollection` writes participate in `readVersions()` history; collapsing pending writes would alter observable semantics, so intermediate writes during staging remain visible.
- `Ink` and legacy `SharedSignal` ops carry user-supplied pen / metadata; staging-mode notifications are intentionally transmitted on commit.
- legacy `SharedArray.insertEntry` carries the entry value; an insert-then-delete within a staging session still leaks the value.
- `SharedSequence`/`SharedString` segment and interval **properties** are not squashed by merge-tree even when the containing op is — `annotateRange(..., {foo: "secret"}) → annotateRange(..., {foo: "public"})` still ships the secret value. Squash already handles inserted-then-removed segment **text** and interval-endpoint changes correctly; the property channel is a known gap, tracked for a future change.

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

- `SharedCell`, `SharedMap`, `SharedDirectory`, `SharedMatrix`: subsumption-aware squash drops superseded ops (per-cell / per-key LWW; for `clear` and `delete`, a later clear or a later op on the same key subsumes).
- `SharedCounter`, `SharedTaskManager`: identity squash — increments and volunteer/abandon ops carry intent that is not subsumable by a later staged op of the same shape.
- `SharedSequence` and intervals: unchanged — squash was already wired end-to-end via merge-tree's `regeneratePendingOp(squash)`.
- `Ink`, `ConsensusRegisterCollection`, `ConsensusOrderedCollection`, `PactMap`, legacy `SharedArray`, legacy `SharedSignal`: identity squash with documented rationale. These DDSes have append-only, order-preserving, or consensus-bound semantics where collapsing pending ops would change observable behavior.

Together this removes the dependency on the `Fluid.SharedObject.AllowStagingModeWithoutSquashing` config flag fallback for the listed DDSes.

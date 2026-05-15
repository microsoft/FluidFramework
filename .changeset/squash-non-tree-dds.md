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

Per-DDS treatment:

- `SharedCell`, `SharedCounter`, `SharedMap`, `SharedDirectory`, `SharedMatrix`: content-aware squash collapses superseded ops (per-cell/per-key LWW). The staging-mode boundary may fall inside a shared pending lifetime; pre-staging keySets that are still in flight are preserved, and only the staging suffix is replaced with the squashed final state.
- `SharedTaskManager`: explicit override delegating to the existing `reSubmitCore`, which already collapses volunteer/abandon pairs by the same logic used for disconnect.
- `SharedSequence` and intervals: unchanged — squash was already wired end-to-end via merge-tree's `regeneratePendingOp(squash)`.
- `Ink`, `ConsensusRegisterCollection`, `ConsensusOrderedCollection`, `PactMap`, legacy `SharedArray`, legacy `SharedSignal`: identity squash with documented rationale. These DDSes have append-only, order-preserving, or consensus-bound semantics where collapsing pending ops would change observable behavior.

Together this removes the dependency on the `Fluid.SharedObject.AllowStagingModeWithoutSquashing` config flag fallback for the listed DDSes.

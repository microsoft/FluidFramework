# Summarization v2 (`summarize2`)

The builder-based summarization flow being introduced alongside the existing summarizer-node flow, and how to
roll it out safely.

Companion to [README.md](./README.md) (how summarization works today) and
[summaryFormats.md](./summaryFormats.md) (what a summary tree looks like).

## Why

Summary state today lives in a tree of `SummarizerNode`s mirroring the data store / DDS tree. Each node keeps
its own copy of "what did I last summarize, and when", advanced through a multi-stage protocol:
`startSummary` → `summarize` → `validateSummary` → `completeSummary` → `refreshLatestSummary` / `clearSummary`.

The stages are the problem:

- One fact - the reference sequence number of the last successful summary - is duplicated into every node, so
  nodes can disagree with each other and with the runtime. `startSummary` returns `mismatchNumbers` and
  `LatestSummaryRefSeqNumMismatch` telemetry exists purely to detect this.
- A summary that fails or is nacked must be rolled back across the whole tree.
- Nodes are realized (loaded) just to take part in the protocol, even when nothing changed.

## Design

One piece of state, owned by the container runtime:

```ts
ContainerRuntime.latestSummarySequenceNumber; // ref seq num of the latest successful summary, or -1
```

Each node tracks only when its own content last changed (`lastChangedSequenceNumber`). Summarizing is then one
pass with one comparison per node and no per-node state machine:

```ts
if (!fullTree && latestSummarySequenceNumber >= lastChangedSequenceNumber) {
	summaryBuilder.nodeDidNotChange(); // reuse the previous summary via a handle
	return;
}
```

Because the decision input is owned by the runtime and only advances on ack, a failed or nacked summary needs no
rollback - the next attempt reads the same value and makes the same decisions.

### Writing the summary

Nodes no longer return a tree for the parent to merge; they write into an `ISummaryBuilder`
(`@fluidframework/runtime-definitions`):

| Method                                                | Purpose                                     |
| ----------------------------------------------------- | ------------------------------------------- |
| `createBuilderForChild`                               | Builder for a child; establishes the tree   |
| `addBlob` / `addTree` / `addHandle` / `addAttachment` | Write this node's own content               |
| `nodeDidNotChange`                                    | Reuse the previous summary for this subtree |
| `markUnreferenced`                                    | Mark this node unreferenced (GC)            |
| `setGroupId`                                          | Set the loading group id                    |

`SummaryBuilder` (`@fluidframework/runtime-utils`) implements it. Two properties matter:

- A child attaches to its parent lazily, on its first content or on `nodeDidNotChange`. That is what lets a node
  emit a handle without its parent knowing anything about it up front.
- Handle paths are derived by the builder from tree structure (`/.channels/dataStoreId/...`), so nodes never
  learn their own path. This removes the `summaryPath` leakage in `IExperimentalIncrementalSummaryContext`.

### Call chain

```
ContainerRuntime.summarize2
  └─ ChannelCollection.summarize2                  (.channels)
       └─ FluidDataStoreContext.summarize2         per data store
            └─ FluidDataStoreRuntime.summarize2    (.channels)
                 └─ Local/RemoteChannelContext.summarize2
                      └─ SharedObject.summarize2 → summarizeCore2   per DDS
```

`ISummarizable` declares `summarize2` once; `IChannel` and `IFluidDataStoreChannel` pick it up via
`Partial<ISummarizable>`, so it stays optional for external implementers.

## One flow per node, decided at the version boundary

Within a single version of the code, a summary is produced by `summarize2` alone - the two flows are not
interleaved for nodes that support the new one. Mixing would build part of the tree with different semantics (no
incremental reuse, different realization and telemetry behavior), which makes comparing the flows harder and
hides which path produced what.

The exception is a version boundary, which is unavoidable: a container can contain a data store runtime from a
release that predates this API. That case is detected up front rather than by probing for a method. The
DataStore layer advertises the `summarize2` layer-compat feature
(`@fluidframework/runtime-definitions/internal`), and `FluidDataStoreContext.summarize2` uses `summarize` for
any data store whose runtime does not advertise it. Channels and shared objects fall back the same way when
they predate `summarize2` / `summarizeCore2`.

A legacy data store is written in full: its subtree cannot be incremental, and neither can its channels. Their
summarizer nodes are only usable when the summary was started through the summarizer node tree, which this flow
does not do - calling `summarize` with `trackState: true` from here asserts `0x5df`.

`SharedObject.summarize2` and `FluidDataStoreRuntime.summarize2` are optional properties rather than methods, so
adding them changes no class shape and needs no type-test exceptions. Since a property cannot be overridden via
`super`, each delegates to an overridable `summarizeCore2` - the extension point for subclasses such as
`mixinSummaryHandler`.

## Not ported yet

- **SharedTree forest incremental summarization.** `SharedTreeCore.summarizeCore2` writes correct content, but
  the forest summarizer's chunk reuse still depends on `IExperimentalIncrementalSummaryContext.summaryPath` to
  build handles, so the forest is written in full on every summary. Expect larger summaries for tree-heavy
  containers until this is fixed. The fix is the same shape as the schema summarizer below: give the forest
  summarizer a per-chunk builder hierarchy and have each unchanged chunk call `nodeDidNotChange()` instead of
  constructing a handle from a path, using the chunk's last-changed sequence number against
  `latestSummarySequenceNumber` as the reuse test.

  SharedTree's other summarizable, the **schema summarizer, is ported**. `Summarizable` gained an optional
  `canReuseSummary(latestSummarySequenceNumber)`; the schema summarizer implements it by comparing against the
  sequence number at which the stored schema last changed. `summarizeCore2` calls it and, when it returns true,
  reuses the whole summarizable subtree via `createBuilderForChild(key).nodeDidNotChange()`. Reusing the entire
  subtree (rather than just the schema blob) also preserves the version metadata blob, so a summary keeps the
  format it was last written with until the schema actually changes.
- **Container-level state** (metadata, ID compressor, chunks, aliases, blobs, GC) is regenerated every summary,
  exactly as in the old flow.

## Known end-to-end failures

State of `test-end-to-end-tests` against the local driver with the gate forced on: **583 passing, 9 failing**
(the old flow passes all of them). Each is understood; none is unexplained. Nothing here blocks development,
but each needs a decision before the gate is enabled anywhere.

### Version boundary - 4 tests

`can do incremental dds summary` ×2 (legacy data store runtime) and the sub-DDS pair below share a cause with
[Not ported yet](#not-ported-yet): a legacy data store, or a DDS relying on
`IExperimentalIncrementalSummaryContext`, is written in full.

| Test                                                     | File                                                                                                                                     |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `can do incremental dds summary` (compat variants only)  | [summarizeIncrementally.spec.ts](../../../../test/test-end-to-end-tests/src/test/summarization/summarizeIncrementally.spec.ts)             |
| `can create summary handles for trees in DDSes that do not change` | [summarizeIncrementallySubDds.spec.ts](../../../../test/test-end-to-end-tests/src/test/summarization/summarizeIncrementallySubDds.spec.ts) |
| `can create summary handles for blobs in DDSes that do not change` | [summarizeIncrementallySubDds.spec.ts](../../../../test/test-end-to-end-tests/src/test/summarization/summarizeIncrementallySubDds.spec.ts) |

**Resolution:** deferred. The gate will not be enabled until the compatibility requirements are satisfied, so
these are expected until then.

### Asserting summarizer node telemetry - 2 tests

Both assert `fluid:telemetry:SummarizerNode:refreshLatestSummary_start` / `_end`, which this flow never emits
because it has no summarizer nodes to refresh.

| Test                                                            | File                                                                                                                                       |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `The summarizing client will immediately refresh its own summaries` | [summarizeRefreshLatestSummary.spec.ts](../../../../test/test-end-to-end-tests/src/test/summarization/summarizeRefreshLatestSummary.spec.ts) |
| `Closes the summarizing client instead of refreshing with two clients` | [summarizeRestart.spec.ts](../../../../test/test-end-to-end-tests/src/test/summarization/summarizeRestart.spec.ts)                     |

**Resolution:** these tests, or the summarizer node telemetry validation in them, can likely just be removed.

### `NodeDidNotSummarize` - 2 tests

Both expect a summary to fail with `NodeDidNotSummarize` when a data store is created while summarization is in
progress. That check comes from `summarizerNode.validateSummary()`, which this flow skips.

| Test                                                                       | File                                                                                                                                 |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `Summary should fail before generate stage when data store is created during summarize` | [summarizeWithLocalChanges.spec.ts](../../../../test/test-end-to-end-tests/src/test/summarization/summarizeWithLocalChanges.spec.ts) |
| `Heuristic based summaries should pass on retry when NodeDidNotSummarize is hit` | [summarizeWithLocalChanges.spec.ts](../../../../test/test-end-to-end-tests/src/test/summarization/summarizeWithLocalChanges.spec.ts) |

**Resolution:** the validation is likely no longer needed. A node created during summarization simply is not
part of that summary, which is expected. The check existed because the old flow would otherwise leave the
summarizer nodes for those data stores in an inconsistent state - a state this flow does not have.

### Reference state

A data store's reference state is part of its summary (the `unreferenced` flag) even when its content did not
change, so a change in used routes has to count as a change. `FluidDataStoreContext.updateUsedRoutes` records
that as a change at the current sequence number, which the normal comparison then handles.

The first observation in a session has no local baseline. It uses the summarizer node's
`hasUsedStateChanged()` instead, whose reference used routes come from the base snapshot - that is what catches
a reference state which changed before this client loaded, and it is why a freshly elected summarizer does not
wrongly reuse a stale `unreferenced` flag.

### Summary handle resolution - 1 test

| Test                                                                                      | File                                                                                                                                                             |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `realizes an attached data store between summarize and refresh via the app's data store loader (prod-like)` | [summarizeWithOutOfOrderDataStoreRealization.spec.ts](../../../../test/test-end-to-end-tests/src/test/summarization/summarizeWithOutOfOrderDataStoreRealization.spec.ts) |

**Resolution:** the test can go away, or its assertion can be reverted. It expects the summary upload to fail
with an unresolvable summary handle; under this flow the summary should simply succeed.

## Rollout

Gate, off by default:

```
Fluid.ContainerRuntime.EnableSummarizeV2
```

When enabled, `submitSummary` calls `summarize2` and skips the summarizer-node bookkeeping (`startSummary`,
`validateSummary`, `completeSummary`, `clearSummary`), none of which applies. Exactly one flow runs per attempt,
which keeps side effects such as consuming the summary number correct.

| Stage | What                                                                                             | Exit criteria                                                             |
| ----- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| 1     | Off. Both flows exist; unit tests cover `SummaryBuilder`.                                         | Done.                                                                     |
| 2     | Offline comparison: run both flows at the same ref seq num and diff the trees, ignoring handles.  | Trees match for containers with GC, loading groups, blobs and SharedTree. |
| 3     | Enable in test/dev containers.                                                                   | No new summary failures; a later client loads from a v2 summary.          |
| 4     | A/B in production: enable v2 for a small share of clients, keep the rest on v1, and compare the two cohorts on a dashboard. Widen the share by risk: no GC → GC → loading groups → SharedTree. | Signals below hold for the v2 cohort, relative to v1, over a full ack cycle. |
| 5     | Default on, then delete the old flow and rename `summarize2`.                                    | -                                                                         |

Do not skip stage 2. Compile success and `SummaryBuilder` unit tests do not prove the two flows produce the same
summary for a real container. The failure mode that matters most - a node wrongly deciding it is unchanged and
emitting a handle - produces a summary that uploads fine and only fails later, when a client loads it.

### A/B comparison

The two flows are never both run for the same summary (see [One flow per summary](#one-flow-per-summary)), so
they cannot be compared within a client. They are compared *across* clients instead: the gate assigns each
client to a cohort, both cohorts summarize the same kinds of documents, and the dashboard puts their aggregates
side by side.

For that to work, every metric must be tagged with the cohort and be computed identically for both flows:

- `summarizeFlow` (`"v1"` or `"v2"`) is a persistent property on the summarizer logger, so it is on **every**
  summarizer event - including failures that never reach summary generation, which is where a v2-specific
  problem shows up first. It is also on `IGeneratedSummaryStats`.
- The reuse and size stats below are derived from the generated summary tree, not from either flow's internals,
  so a difference between cohorts is a real difference in output rather than a difference in measurement.

Slice every panel by `summarizeFlow`, and compare rates and distributions rather than totals - the cohorts will
not be the same size. Compare like documents: a v2 cohort that happens to hold more SharedTree containers will
look worse on summary size for reasons unrelated to correctness.

### Dashboard signals

Every row is sliced by `summarizeFlow`. "Watch for" describes the v2 cohort relative to v1.

| Panel                          | Signal                                                     | Watch for                                                                                          |
| ------------------------------ | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Success rate                   | `Summarize` vs `SummarizeFailed`                           | Must not regress. This is the first stop-the-rollout signal.                                        |
| Failure reasons                | `SummarizeFailed` error                                    | Any increase. A cohort on this flow should not fail more often than one on the old flow.  |
| Duration                       | `Summarize` `generateDuration`, `uploadDuration`           | Should be flat or better.                                                                           |
| Reuse - data stores            | `summarizedDataStoreCount` / `dataStoreCount`              | Should be equal or lower. Higher means reuse regressed.                                             |
| Reuse - channels               | `reusedChannelCount` / `channelCount`                      | Should be equal or higher. A drop means DDS-level reuse regressed.                                  |
| Work avoided                   | `realizedDataStoreCount` / `dataStoreCount`                | Should be equal or lower - the main efficiency claim for v2.                                        |
| Reuse violations               | `IncrementalSummaryViolation`                              | Any increase means nodes are re-summarizing when they should not.                                   |
| Summary size                   | `totalBlobSize`, `unreferencedBlobSize`, `treeNodeCount`, `handleNodeCount` | Size should not grow. Expect a known regression for SharedTree containers until forest reuse is ported. |
| Correctness (lagging)          | Container load failures, data corruption on load, `MissingSummaryAckFoundByOps` | The real correctness signal. A bad handle uploads fine and only fails when a client loads that summary, so watch this for the whole bake period, not just at rollout time. |
| Ack health                     | `SummaryAckWaitTimeout`, `SummarizeTimeout`                | Any increase.                                                                                       |

Two cautions:

- `LatestSummaryRefSeqNumMismatch` stops firing under v2 by design - there are no per-node reference numbers
  left to disagree. Do not read its absence as an improvement.
- Reuse being *higher* in v2 is not automatically good. Combined with load failures it is the signature of the
  worst bug in this design: a node claiming it did not change when it did.

### Telemetry added for this

- `summarizeFlow` on every summarizer event and on `IGeneratedSummaryStats`.
- `realizedDataStoreCount`, `channelCount` and `reusedChannelCount` on `IGeneratedSummaryStats`, all derived
  from the generated summary tree or from context state common to both flows.
- A `summarize2` layer-compat feature on the DataStore layer, so a data store runtime that predates the API is
  detected at the version boundary rather than by probing for the method.

Still worth adding when stage 2 is built: an event carrying the first differing path when the offline
comparison finds a mismatch, so a failure is actionable rather than "trees differ".

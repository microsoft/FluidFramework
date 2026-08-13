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

## One flow per summary

`summarize` and `summarize2` are never both used within a single summary. Mixing them would build part of the
tree with different semantics (no incremental reuse, different realization and telemetry behavior), which makes
comparing the flows meaningless and hides which path produced what.

Every participant must therefore implement the new API. If one does not, summarization asserts rather than
silently falling back - for `IChannel.summarize2`, `IFluidDataStoreChannel.summarize2`,
`SharedObject.summarizeCore2` and `SharedKernel.summarizeCore2`. Everything in this repo implements it, so these
asserts only fire for external implementations; that is the signal not to enable the gate for that container.

`SharedObject.summarize2` and `FluidDataStoreRuntime.summarize2` are optional properties rather than methods, so
adding them changes no class shape and needs no type-test exceptions. Since a property cannot be overridden via
`super`, each delegates to an overridable `summarizeCore2` - the extension point for subclasses such as
`mixinSummaryHandler`.

## Not ported yet

- **SharedTree forest incremental summarization.** `SharedTreeCore.summarizeCore2` writes correct content, but
  the forest's chunk reuse still depends on `IExperimentalIncrementalSummaryContext.summaryPath`, so trees are
  written in full. Expect larger summaries for tree-heavy containers until this is ported to child builders plus
  `nodeDidNotChange`.
- **Container-level state** (metadata, ID compressor, chunks, aliases, blobs, GC) is regenerated every summary,
  exactly as in the old flow.

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
| Failure reasons                | `SummarizeFailed` error / `UsageError` props               | A node that cannot participate reports `channelId`/`channelType` or `dataStoreId`. Any occurrence means the cohort includes an unmigrated implementation. |
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
- A `UsageError` carrying node type and id when a node cannot participate in the new flow, in place of a bare
  assert.

Still worth adding when stage 2 is built: an event carrying the first differing path when the offline
comparison finds a mismatch, so a failure is actionable rather than "trees differ".

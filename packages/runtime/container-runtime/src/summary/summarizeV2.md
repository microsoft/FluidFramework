# Summarization v2 (`summarize2`)

This document describes the builder-based summarization flow that is being introduced alongside the existing
summarizer-node flow, and the plan for rolling it out.

It is a companion to [README.md](./README.md) (how summarization works today) and
[summaryFormats.md](./summaryFormats.md) (what the summary tree looks like).

## Why

Summarization state today is spread across a tree of `SummarizerNode`s that mirrors the container's data store /
DDS tree. Every node keeps its own copy of "what did I last summarize, and at what sequence number", and that
state is advanced through a multi-stage protocol: `startSummary` → `summarize` → `validateSummary` →
`completeSummary` → `refreshLatestSummary` / `clearSummary`.

The stages are the problem:

- The same fact (the reference sequence number of the last successful summary) is duplicated into every node,
  so nodes can disagree with each other and with the runtime. `startSummary` returns `mismatchNumbers` purely to
  detect this, and `LatestSummaryRefSeqNumMismatch` telemetry exists to report it.
- A summary that fails, is nacked, or is superseded has to be rolled back through the whole tree.
- Nodes have to be realized (loaded) just to participate in the protocol, even when nothing about them changed.

## The design

There is exactly one piece of summary state, and it lives on `ContainerRuntime`:

```ts
ContainerRuntime.latestSummarySequenceNumber; // reference seq num of the latest successful summary, or -1
```

Every node tracks only the sequence number at which its own content last changed:

```ts
lastChangedSequenceNumber; // data store context, channel context
```

Summarizing is then a single pass with one comparison per node, and no per-node state machine:

```ts
if (!fullTree && latestSummarySequenceNumber >= lastChangedSequenceNumber) {
	summaryBuilder.nodeDidNotChange(); // reuse the previous summary via a handle
	return;
}
```

Because the decision input is owned by the runtime and only advances when a summary is acked, a failed or nacked
summary needs no rollback: the next attempt simply reads the same `latestSummarySequenceNumber` and makes the
same decisions.

### Writing the summary

Nodes no longer return a summary tree that the parent merges. They are handed an
`ISummaryBuilder` (`@fluidframework/runtime-definitions`) and write into it:

| Method                    | Purpose                                                            |
| ------------------------- | ------------------------------------------------------------------ |
| `createBuilderForChild`   | Create the builder for a child node; establishes the tree hierarchy |
| `addBlob` / `addTree` / `addHandle` / `addAttachment` | Write this node's own content            |
| `nodeDidNotChange`        | Reuse the previous summary for this whole subtree                   |
| `markUnreferenced`        | Mark this node unreferenced (GC)                                    |
| `setGroupId`              | Set the loading group id                                            |

The concrete implementation is `SummaryBuilder` in `@fluidframework/runtime-utils`. Two properties matter:

- A child attaches itself to its parent lazily, the first time it writes content or declares itself unchanged.
  That is what lets a node emit a handle without its parent knowing anything about it up front.
- The handle path is computed by the builder from the tree structure (`/.channels/dataStoreId/...`). Nodes do
  not know, and do not need to be told, their own path. This removes the `summaryPath` leakage that
  `IExperimentalIncrementalSummaryContext` has today.

### The call chain

```
ContainerRuntime.summarize2
  └─ ChannelCollection.summarize2                     (.channels)
       └─ FluidDataStoreContext.summarize2            per data store
            └─ FluidDataStoreRuntime.summarize2       (.channels)
                 └─ LocalChannelContext / RemoteChannelContext.summarize2
                      └─ SharedObject.summarize2
                           └─ SharedObject.summarizeCore2   per DDS
```

`ISummarizable` declares `summarize2` once; `IChannel` and `IFluidDataStoreChannel` pick it up via
`Partial<ISummarizable>` so that the method is optional for external implementers.

## Compatibility

A summary is produced entirely by one flow or the other - `summarize` and `summarize2` are never both used
within a single summary. Mixing them would mean part of the tree was built with different semantics (no
incremental reuse, different realization and telemetry behavior), which would make comparing the two flows
meaningless and hide which path produced what.

So every participant in a summary must implement the new API. If one does not, summarization fails with an
assert rather than silently falling back:

| Missing implementation            | Result                                                       |
| --------------------------------- | ------------------------------------------------------------ |
| `IChannel.summarize2`             | Assert: channel cannot be summarized by the summarize2 flow   |
| `IFluidDataStoreChannel.summarize2` | Assert: data store cannot be summarized by the summarize2 flow |
| `SharedObject.summarizeCore2`     | Assert: shared object cannot be summarized by the summarize2 flow |
| `SharedKernel.summarizeCore2`     | Assert: kernel cannot be summarized by the summarize2 flow    |

Every DDS and runtime type in this repo implements the new API, so these asserts only fire for external
implementations. That is the signal not to enable the feature gate for such a container.

`SharedObject.summarize2` and `FluidDataStoreRuntime.summarize2` are declared as optional properties rather than
methods, so adding them does not change the shape of those classes for existing consumers and no type-test
compatibility exceptions are required. Because a property cannot be overridden through `super`, each delegates
to an overridable `summarizeCore2`; that is the extension point for subclasses such as `mixinSummaryHandler`.

## What is not ported yet

- **SharedTree forest incremental summarization.** `SharedTreeCore.summarizeCore2` writes correct content, but
  the forest's incremental chunk reuse (`ForestIncrementalSummaryBuilder`) still depends on
  `IExperimentalIncrementalSummaryContext.summaryPath`. Under `summarize2` the tree is written in full. Porting
  it means expressing chunk reuse as child builders + `nodeDidNotChange`.
- **Container-level state.** Metadata, ID compressor, chunks, aliases, blobs and GC are regenerated on every
  summary, exactly as they are in the old flow.

## Rollout

The new flow is behind a feature gate and is off by default:

```
Fluid.ContainerRuntime.EnableSummarizeV2
```

When it is enabled, `submitSummary` calls `ContainerRuntime.summarize2` and skips the summarizer-node
bookkeeping (`startSummary`, `validateSummary`, `completeSummary`, `clearSummary`), because none of it applies.
Exactly one of the two flows runs per summary attempt, which is what keeps side effects such as consuming the
next summary number correct. `getMetadata` takes the summary number as a parameter so that a future comparison
mode can run both flows over the same summary without the second one looking like a different summary.

Suggested stages:

1. **Off (current).** Both flows exist; only the old one runs. Unit tests cover `SummaryBuilder` directly.
2. **Comparison in test.** Run both flows for the same reference sequence number and assert the trees match,
   modulo handles. This is the highest-value validation and needs no production traffic.
3. **On in test/dev containers.** Enable the gate and watch summary success rate, summary size,
   `handleNodeCount` vs `treeNodeCount`, and summarization duration.
4. **Staged production enablement**, ordered by risk: containers without GC → with GC → with loading groups →
   with SharedTree.
5. **Remove the old flow** and rename `summarize2`, once the new flow has been the default long enough that
   rolling back is not a consideration.

Do not skip stage 2. Compile-time success and unit tests over `SummaryBuilder` do not prove that the two flows
produce the same summary for a real container.

---
"@fluidframework/container-runtime": minor
"__section": legacy
---

Applications can include their own content in summaries

The `loadContainerRuntime` API accepts `summaryGenerationOptions` to control full-tree output
and include application content alongside runtime and distributed data structure (DDS) state.
The runtime treats the content as opaque.
The application chooses the name of its summary subtree.

Applications can set `fullTreePolicy` to `"untilFirstAck"` when their DDS state has not yet been stored in a summary.
Full structural output continues until a tracked full proposal is acknowledged and adopted;
subsequent summaries can reuse unchanged subtrees from that accepted summary.
The other policies are `"default"` for normal summary behavior and `"always"` for full output on every summary.
These options control summary generation, not summary scheduling.

```typescript
import type { ISummaryGenerationOptions } from "@fluidframework/container-runtime/legacy";

const summaryGenerationOptions: ISummaryGenerationOptions = {
	fullTreePolicy: "untilFirstAck",
	additionalRootTree: {
		key: "applicationProjection",
		summarize: captureProjection,
	},
};

// Pass summaryGenerationOptions with the other loadContainerRuntime parameters.
```

In this example, `captureProjection` is an application-provided synchronous callback.
It receives `ISummaryGenerationContext`, including the reference sequence number and accepted summary,
and returns `IApplicationProjectionSummary`.
That result contains a summary tree and an optional synchronous `onAccepted` callback
that promotes the state captured for that proposal.
Projection capture must not mutate shared state or perform asynchronous work;
handles must refer to the supplied parent and cannot be used for full output.

Garbage-collection summary tracking now associates captured state and recovery completion with the acknowledged proposal.
A delayed acknowledgment cannot adopt a later attempt's GC state or clear a newer recovery request.
Failures during coordinated runtime, GC, or application acceptance close the runtime
rather than continuing with inconsistent reuse baselines.

See [summary generation and acceptance][summary-generation] for the contract and implementation details.

[summary-generation]: https://github.com/microsoft/FluidFramework/blob/main/packages/runtime/container-runtime/Summary-Generation.md

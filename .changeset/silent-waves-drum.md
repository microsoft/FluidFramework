---
"@fluidframework/container-runtime": minor
"__section": legacy
---

Application content can accompany native summaries with checkpoint-safe incremental reuse

The legacy-beta `loadContainerRuntime` API accepts `summaryGenerationOptions` to control full-tree output
and add an application-owned projection beside native state.
The runtime treats projection content as opaque:
it does not require a manifest, prescribe an application format, or choose the projection root name.

Applications can use `fullTreeUntilFirstAck` when their loaded native paths cannot yet be reused from storage.
Full structural output continues until a tracked full proposal is acknowledged and adopted;
subsequent summaries can reuse native, garbage-collection, and application state.
`forceFullTree` remains an independent unconditional override.
These options control summary generation, not summary scheduling.

```typescript
import type { ISummaryGenerationOptions } from "@fluidframework/container-runtime/legacy";

const summaryGenerationOptions: ISummaryGenerationOptions = {
	fullTreeUntilFirstAck: true,
	additionalRootTree: {
		key: "applicationProjection",
		summarize: captureProjection,
	},
};

// Pass summaryGenerationOptions with the other loadContainerRuntime parameters.
```

In this example, `captureProjection` is an application-provided synchronous callback.
It receives `ISummaryGenerationContext`, including the current checkpoint and exact accepted parent,
and returns `IApplicationProjectionSummary`.
That result contains a summary tree and an optional synchronous `onAccepted` callback
that promotes the state captured for that proposal.
Projection capture must not mutate shared state or perform asynchronous work;
handles must refer to the supplied parent and cannot be used for full output.

Garbage-collection summary tracking now associates captured state and recovery completion with the acknowledged proposal.
A delayed acknowledgment cannot adopt a later attempt's GC state or clear a newer recovery request.
Failures during coordinated native, GC, or application acceptance close the runtime
rather than continuing with inconsistent reuse baselines.

See [summary generation and acceptance][summary-generation] for the contract and implementation details.

[summary-generation]: https://github.com/microsoft/FluidFramework/blob/main/packages/runtime/container-runtime/Summary-Generation.md

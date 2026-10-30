---
"@fluidframework/container-runtime": minor
"__section": feature
---
Applications can now contribute an incrementally-reusable projection to the container summary

`LoadContainerRuntimeParams` (used by `ContainerRuntime.loadRuntime`/`loadRuntime2`) accepts an optional
`applicationSummaryProjection` callback. When provided, the runtime invokes it during ordinary container
summarization and inserts the returned tree alongside the runtime's own summary roots (`.channels`,
`.metadata`, and so on).

This lets an application contribute its own projection of its data (for example, a denormalized or
application-format representation of content stored in a DDS) without reconstructing Fluid's own
summarization machinery. Unchanged parts of the projection can be emitted as `ISummaryHandle` entries
pointing at the previous summary, so they are not re-serialized or re-uploaded on every summary.

```typescript
const projection: IApplicationSummaryProjection = {
  key: "appProjection",
  summarize: (context) => {
    // Build (or reuse via handles) the application's own summary subtree here.
    // ...
    return { summary, onAccepted: (acceptedContext) => {/* promote local state */} };
  },
};

const { runtime } = await ContainerRuntime.loadRuntime2({
  context,
  registry,
  existing,
  provideEntryPoint,
  applicationSummaryProjection: projection,
});
```

See `packages/runtime/container-runtime/src/test/summaryProjectionExample` for a complete, runnable
example demonstrating incremental reuse across two independently-projected blobs.

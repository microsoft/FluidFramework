---
"@fluidframework/tree": minor
"__section": tree
---
Independent tree views now accept an optional telemetry logger

The alpha `independentView`, `independentInitializedView`, and `createIndependentTreeAlpha` APIs now accept an optional `logger` on their options.
Previously these standalone (non-`SharedTree`) views had no way to surface telemetry,
so internal events — including those emitted when the tree enters a broken state — were silently dropped.
Passing a logger forwards those events to the caller's telemetry pipeline,
making it possible to diagnose failures in scenarios that use independent tree views (for example, snapshot import/export, schema migration, and other out-of-container workflows).

Events emitted by an independent tree view are tagged with the `independentView` namespace.
If no logger is provided, behavior is unchanged and telemetry events continue to be dropped.

The `logger` option is typed as the new alpha interface `IndependentViewLogger`, which is structurally compatible with `ITelemetryBaseLogger` from `@fluidframework/core-interfaces`.
Any standard Fluid telemetry logger can be passed directly.

```typescript
// ...
const view = independentView(
    new TreeViewConfiguration({ schema: MySchema }),
    {
        logger: myTelemetryLogger,
    },
);
// ...
```

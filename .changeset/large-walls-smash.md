---
"@fluidframework/container-definitions": minor
"@fluidframework/container-loader": minor
"__section": legacy
---
Promote offline / pending-local-state APIs to `@legacy @beta` and add `getPendingLocalState` to `IContainer`

`IContainer` now exposes `getPendingLocalState(): Promise<string>` directly. The serialized blob can be passed back as `pendingLocalState` to `loadExistingContainer` (or `ILoader.resolve`) to rehydrate an attached container at the same position without data loss.

The `ContainerAlpha` interface and `asLegacyAlpha` helper have been removed from `@fluidframework/container-loader`. Replace `asLegacyAlpha(container).getPendingLocalState()` with `container.getPendingLocalState()`.

The following exports from `@fluidframework/container-loader` are now reachable from the `legacy` entrypoint instead of only the `legacy/alpha` entrypoint:

- `PendingLocalStateStore`
- `ILoadFrozenContainerFromPendingStateProps`
- `loadFrozenContainerFromPendingState`
- `ICaptureFullContainerStateProps`
- `captureFullContainerState`
- `createFrozenDocumentServiceFactory`

Runtime behavior is unchanged.

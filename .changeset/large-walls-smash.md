---
"@fluidframework/container-definitions": minor
"__section": legacy
---
Add optional `getPendingLocalState` to `IContainer`

`IContainer` now exposes `getPendingLocalState?(): Promise<string>`. The serialized blob can be passed back as `pendingLocalState` to `loadExistingContainer` (or `ILoader.resolve`) to rehydrate an attached container at the same position without data loss.

The member is optional during this minor release so external implementers of `IContainer` (test mocks, wrapper containers, partner runtimes) remain forward-compatible. A future breaking release will make it required.

The `ContainerAlpha` interface and `asLegacyAlpha` helper in `@fluidframework/container-loader` continue to expose this functionality at `@legacy @alpha` for callers that prefer the typed-required shape.

Lifecycle: misuse of this API can result in duplicate op submission and potential document corruption. The blob returned MUST be discarded if and when the container emits a `"connected"` event — any subsequent rehydrate from that blob would submit the same ops a second time. The container must also be neither closed nor disposed when calling; otherwise the call throws `UsageError`.

Runtime behavior is unchanged.

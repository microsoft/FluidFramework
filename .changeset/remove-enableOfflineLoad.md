---
"@fluidframework/container-definitions": minor
"@fluidframework/container-loader": minor
"__section": breaking
---

Remove deprecated ILoaderOptions.enableOfflineLoad

The `enableOfflineLoad` property has been removed from `ILoaderOptions` in `@fluidframework/container-definitions`. This property was previously marked `@deprecated Do not use.`

The legacy `Fluid.Container.enableOfflineLoad` config-provider feature gate has also been removed from `@fluidframework/container-loader`. Offline load is now unconditionally enabled for interactive clients; it can still be controlled via `Fluid.Container.enableOfflineFull`.

**Migration:** Remove any usage of `enableOfflineLoad` from `ILoaderOptions` objects. No replacement is needed — offline load is on by default.

See [#ISSUE](https://github.com/microsoft/FluidFramework/issues/ISSUE) for context.

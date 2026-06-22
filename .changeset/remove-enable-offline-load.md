---
"@fluidframework/container-definitions": minor
"@fluidframework/container-loader": minor
"__section": legacy
---

Remove deprecated `ILoaderOptions.enableOfflineLoad`

The deprecated `enableOfflineLoad` property on `ILoaderOptions` has been removed, along with the legacy `Fluid.Container.enableOfflineLoad` feature gate read from the config provider. Offline load remains enabled by default for interactive clients.

To opt out, set `Fluid.Container.enableOfflineFull` to `false` via the config provider. To prevent silent misconfiguration, container load now throws a `UsageError` if a `pendingLocalState` is provided while `Fluid.Container.enableOfflineFull` is explicitly set to `false`.

#### Migration

- Remove any use of `enableOfflineLoad` from `ILoaderOptions` you pass to the `Loader`.
- If you previously set `Fluid.Container.enableOfflineLoad` via the config provider, set `Fluid.Container.enableOfflineFull` instead.

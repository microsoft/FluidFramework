---
"@fluidframework/container-runtime": minor
"@fluidframework/fluid-static": minor
---
---
"section": deprecation
---

IContainerRuntimeOptions.enableGroupedBatching is now deprecated

The `IContainerRuntimeOptions.enableGroupedBatching` property is deprecated and will be removed in version 2.20.0. This will mean that the grouped batching feature can no longer be disabled. In versions 2.20.0 and beyond, grouped batching is required for the proper functioning of the Fluid Framework.

The sole case where grouped batching will be disabled is for compatibility with older v1 clients, and this will be implemented without any need for the configurable `IContainerRuntimeOptions.enableGroupedBatching` option.

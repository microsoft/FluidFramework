---
"@fluidframework/container-definitions": major
"@fluidframework/container-loader": major
---

Loader container caching off by default

Loader container caching will now be off by default and the ability to control it is deprecated. Loader caching is deprecated and will be removed in a future release, as well as all caching functionality of containers. Please try not to rely on caching and inform us if you cannot do so.

If you run into trouble with this behavior, please report it ASAP to the FluidFramework team and use the following options (available in this release only) to unblock you:
-    set `ILoaderProps.options.cache` to `true` when constructing a `Loader` object (see the `ILoaderOptions` interface)
-    set `[LoaderHeader.cache]` header to `true` when requesting a container

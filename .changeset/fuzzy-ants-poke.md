---
"@fluidframework/container-definitions": major
"@fluidframework/container-loader": major
---

Loader container caching off by default

Loader container caching will now be off by default. If you wish to have it enabled, please set `ILoaderProps.options.cache` to `true` when constructing a `Loader` object (see the `ILoaderOptions` interface). The `[LoaderHeader.cache]` header can also be used to override the default caching option when requesting a container.

**Note:** These caching options/headers are deprecated and will be removed in a future release, as well as all caching functionality of containers. Please try not to rely on caching and inform us if you cannot do so.

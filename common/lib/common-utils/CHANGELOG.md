# @fluidframework/common-utils Changelog

## [1.2.0](https://github.com/microsoft/FluidFramework/releases/tag/common-utils_v1.2.0)

### Deprecated classes and functions

The following classes, functions, and types are deprecated in this release. In some cases, the implementations have been
moved to other packages.

#### Moved to @fluidframework/core-utils

-   class Lazy<T>
-   class LazyPromise<T>
-   class PromiseCache<TKey, TResult>
-   type PromiseCacheExpiry
-   interface PromiseCacheOptions

#### Deprecated with no replacement

-   function doIfNotDisposed
-   class RateLimiter

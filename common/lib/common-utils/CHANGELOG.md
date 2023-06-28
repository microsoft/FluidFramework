# @fluidframework/common-utils Changelog

## [1.2.0](https://github.com/microsoft/FluidFramework/releases/tag/common-utils_v1.2.0)

### Deprecated classes and functions

The following classes, functions, and types are deprecated in this release. The implementations have been moved to other
packages.

#### Moved to @fluidframework/core-utils

- class Lazy<T>
- class LazyPromise<T>
- class PromiseCache<TKey, TResult>
- type PromiseCacheExpiry
- interface PromiseCacheOptions
- class RateLimiter

#### Moved to @fluidframework/container-loader

- function doIfNotDisposed

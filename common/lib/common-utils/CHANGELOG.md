# @fluidframework/common-utils Changelog

## [3.2.0](https://github.com/microsoft/FluidFramework/releases/tag/common-utils_v3.2.0)

## [3.1.0](https://github.com/microsoft/FluidFramework/releases/tag/common-utils_v3.1.0)

### Updated @fluidframework/common-definitions

The @fluidframework/common-definitions dependency has been upgraded to v1.1.0.
[See the full changelog.](https://github.com/microsoft/FluidFramework/blob/main/common/lib/common-definitions/CHANGELOG.md#110)

## [3.0.0](https://github.com/microsoft/FluidFramework/releases/tag/common-utils_v3.0.0)

### Updated @fluidframework/common-definitions

The @fluidframework/common-definitions dependency has been upgraded to v1.0.0.

## [2.0.0](https://github.com/microsoft/FluidFramework/releases/tag/common-utils_v2.0.0)

### Deprecated classes and functions

The following classes, functions, and types are deprecated in this release. In some cases, the implementations have been
moved to other packages.

#### Moved to @fluidframework/core-utils

-   class Lazy<T>
-   class LazyPromise<T>
-   class PromiseCache<TKey, TResult>
-   interface PromiseCacheOptions
-   type PromiseCacheExpiry
-   class Deferred
-   class Heap
-   class PromiseTimer
-   class Timer
-   const delay
-   const NumberComparer
-   function assert
-   function safelyParseJSON
-   function setLongTimeout
-   function unreachableCase
-   interface IComparer
-   interface IHeapNode
-   interface IPromiseTimer
-   interface IPromiseTimerResult
-   interface ITimer

#### Moved to @fluid-internal/client-utils

-   class Buffer
-   class EventForwarder
-   class Trace
-   class TypedEventEmitter
-   class TypedEventTransform
-   function bufferToString
-   function fromBase64ToUtf8
-   function fromUtf8ToBase64
-   function gitHashFile
-   function hashFile
-   function stringToBuffer
-   function toUtf8
-   function Uint8ArrayToArrayBuffer
-   function Uint8ArrayToString
-   interface ITraceEvent
-   type EventEmitterEventType
-   type IsoBuffer
-   type IsomorphicPerformance

#### Deprecated with no replacement

-   function doIfNotDisposed
-   class RateLimiter
-   class RangeTracker
-   interface IRange
-   interface IRangeTrackerSnapshot

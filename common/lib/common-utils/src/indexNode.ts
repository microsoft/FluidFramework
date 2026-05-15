/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This library contains common utility functions and classes used by the Fluid Framework.
 *
 * @packageDocumentation
 */

export { assert } from "./assert.js";
export { fromBase64ToUtf8, fromUtf8ToBase64, toUtf8 } from "./base64Encoding.js";
export {
Buffer,
bufferToString,
IsoBuffer,
stringToBuffer,
Uint8ArrayToString,
} from "./bufferNode.js";
export { Uint8ArrayToArrayBuffer } from "./bufferShared.js";
export { delay } from "./delay.js";
export { doIfNotDisposed, type IDisposable } from "./disposal.js";
export { gitHashFile, hashFile } from "./hashFileNode.js";
export { Heap, type IComparer, type IHeapNode, NumberComparer } from "./heap.js";
export { Lazy } from "./lazy.js";
export { type IsomorphicPerformance, performance } from "./performanceIsomorphic.js";
export { PromiseCache, type PromiseCacheExpiry, type PromiseCacheOptions } from "./promiseCache.js";
export { Deferred, LazyPromise } from "./promises.js";
export { type IRange, type IRangeTrackerSnapshot, RangeTracker } from "./rangeTracker.js";
export { RateLimiter } from "./rateLimiter.js";
export { safelyParseJSON } from "./safeParser.js";
export {
type IPromiseTimer,
type IPromiseTimerResult,
type ITimer,
PromiseTimer,
setLongTimeout,
Timer,
} from "./timer.js";
export { type ITraceEvent, Trace } from "./trace.js";
export {
type EventEmitterEventType,
type IEvent,
type IEventProvider,
type IEventThisPlaceHolder,
type IEventTransformer,
type ReplaceIEventThisPlaceHolder,
type TransformedEvent,
TypedEventEmitter,
type TypedEventTransform,
} from "./typedEventEmitter.js";
export { unreachableCase } from "./unreachable.js";

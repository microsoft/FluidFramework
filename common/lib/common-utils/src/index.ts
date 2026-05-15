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
export { Uint8ArrayToArrayBuffer } from "./bufferShared.js";
export { delay } from "./delay.js";
export { doIfNotDisposed, type IDisposable } from "./disposal.js";
export { Heap, type IComparer, type IHeapNode, NumberComparer } from "./heap.js";
/**
 * NOTE: This export is remapped to export from "./indexBrowser" in browser environments via package.json.
 * Because the two files don't have fully isomorphic exports, using named exports for the full API surface
 * is problematic if that named export includes values not in their intersection.
 *
 * In a future breaking change of common-utils, we could use a named export for their intersection if we
 * desired.
 */
// eslint-disable-next-line no-restricted-syntax
export * from "./indexNode.js";
export { Lazy } from "./lazy.js";
export type { IsomorphicPerformance } from "./performanceIsomorphic.js";
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

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This library contains common utility functions and classes used by the Fluid Framework.
 *
 * @packageDocumentation
 */

export { assert } from "./assert";
export { fromBase64ToUtf8, fromUtf8ToBase64, toUtf8 } from "./base64Encoding";
export { Uint8ArrayToArrayBuffer } from "./bufferShared";
export { delay } from "./delay";
export { doIfNotDisposed } from "./disposal";
export { EventForwarder } from "./eventForwarder";
export { Heap, IComparer, IHeapNode, NumberComparer } from "./heap";
/**
 * NOTE: This export is remapped to export from "./indexBrowser" in browser environments via package.json.
 * Because the two files don't have fully isomorphic exports, using named exports for the full API surface
 * is problematic if that named export includes values not in their intersection.
 *
 * In a future breaking change of common-utils, we could use a named export for their intersection if we
 * desired.
 */
// eslint-disable-next-line no-restricted-syntax
export * from "./indexNode";
export { Lazy } from "./lazy";
export { BaseTelemetryNullLogger, TelemetryNullLogger } from "./logger";
export { IsomorphicPerformance } from "./performanceIsomorphic";
export { PromiseCache, PromiseCacheExpiry, PromiseCacheOptions } from "./promiseCache";
export { Deferred, LazyPromise } from "./promises";
export { IRange, IRangeTrackerSnapshot, RangeTracker } from "./rangeTracker";
export { RateLimiter } from "./rateLimiter";
export { safelyParseJSON } from "./safeParser";
export {
	IPromiseTimer,
	IPromiseTimerResult,
	ITimer,
	PromiseTimer,
	setLongTimeout,
	Timer,
} from "./timer";
export { ITraceEvent, Trace } from "./trace";
export { EventEmitterEventType, TypedEventEmitter, TypedEventTransform } from "./typedEventEmitter";
export { unreachableCase } from "./unreachable";

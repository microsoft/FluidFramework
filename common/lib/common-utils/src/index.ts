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
export { delay } from "./delay";
export { doIfNotDisposed } from "./disposal";
export { Heap, IComparer, IHeapNode, NumberComparer } from "./heap";
export { Lazy } from "./lazy";
export { BaseTelemetryNullLogger, TelemetryNullLogger } from "./logger";
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
export { unreachableCase } from "./unreachable";

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
export {
    Uint8ArrayToString,
    stringToBuffer,
    Buffer,
    IsoBuffer,
    bufferToString,
    hashFile,
    gitHashFile,
    performance,
} from "./indexNode";
export { fromBase64ToUtf8, fromUtf8ToBase64, toUtf8 } from "./base64Encoding";
export { doIfNotDisposed } from "./disposal";
export { EventForwarder } from "./eventForwarder";
export { IComparer, NumberComparer, IHeapNode, Heap } from "./heap";
export { BaseTelemetryNullLogger, TelemetryNullLogger } from "./logger";
export { PromiseCacheExpiry, PromiseCacheOptions, PromiseCache } from "./promiseCache";
export { Deferred, LazyPromise } from "./promises";
export { IRange, IRangeTrackerSnapshot, RangeTracker } from "./rangeTracker";
export { RateLimiter } from "./rateLimiter";
export { safelyParseJSON } from "./safeParser";
export { setLongTimeout, ITimer, Timer, IPromiseTimerResult, IPromiseTimer, PromiseTimer } from "./timer";
export { Trace, ITraceEvent } from "./trace";
export { EventEmitterEventType, TypedEventTransform, TypedEventEmitter } from "./typedEventEmitter";
export { unreachableCase } from "./unreachable";
export { Lazy } from "./lazy";
export { IsomorphicPerformance } from "./performanceIsomorphic";
export { delay } from "./delay";
export { Uint8ArrayToArrayBuffer } from "./bufferShared";

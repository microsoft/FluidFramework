/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export { fromBase64ToUtf8, fromUtf8ToBase64, toUtf8 } from "./base64Encoding";
export { Uint8ArrayToArrayBuffer } from "./bufferShared";
export { EventForwarder } from "./eventForwarder";
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
export { IsomorphicPerformance } from "./performanceIsomorphic";
// export { IRange, IRangeTrackerSnapshot, RangeTracker } from "./rangeTracker";
export { ITraceEvent, Trace } from "./trace";
export { EventEmitterEventType, TypedEventEmitter, TypedEventTransform } from "./typedEventEmitter";

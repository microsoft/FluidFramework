/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// THIS FILE IS NOT ACTUALLY USED (see indexBrowser.ts and indexNode.ts for that).
// It's only here so type-test-generator doesn't fail, until we update it to support packages that don't have an
// index.ts file.

export {
	bufferToString,
	Buffer,
	IsoBuffer,
	stringToBuffer,
	Uint8ArrayToString,
} from "./bufferNode";
export { gitHashFile, hashFile } from "./hashFileNode";
export { performance } from "./performanceIsomorphic";

export { fromBase64ToUtf8, fromUtf8ToBase64, toUtf8 } from "./base64Encoding";
export { Uint8ArrayToArrayBuffer } from "./bufferShared";
export { EventForwarder } from "./eventForwarder";
export { IsomorphicPerformance } from "./performanceIsomorphic";
export { ITraceEvent, Trace } from "./trace";
export { EventEmitterEventType, TypedEventEmitter, TypedEventTransform } from "./typedEventEmitter";

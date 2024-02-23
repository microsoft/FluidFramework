/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	bufferToString,
	isArrayBuffer,
	IsoBuffer,
	stringToBuffer,
	Uint8ArrayToString,
} from "./bufferBrowser";
export { gitHashFile, hashFile } from "./hashFileBrowser";
export { performance } from "./performanceIsomorphic";

export { fromBase64ToUtf8, fromUtf8ToBase64, toUtf8 } from "./base64Encoding";
export { Uint8ArrayToArrayBuffer } from "./bufferShared";
export { IsomorphicPerformance } from "./performanceIsomorphic";
export { ITraceEvent, Trace } from "./trace";
export { EventEmitterEventType, TypedEventEmitter, TypedEventTransform } from "./typedEventEmitter";

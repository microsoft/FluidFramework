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
} from "./bufferBrowser.js";
export { gitHashFile, hashFile } from "./hashFileBrowser.js";
export { performance } from "./performanceIsomorphic.js";

export { fromBase64ToUtf8, fromUtf8ToBase64, toUtf8 } from "./base64Encoding.js";
export { Uint8ArrayToArrayBuffer } from "./bufferShared.js";
export { IsomorphicPerformance } from "./performanceIsomorphic.js";
export { ITraceEvent, Trace } from "./trace.js";
export {
	EventEmitterEventType,
	TypedEventEmitter,
	TypedEventTransform,
} from "./typedEventEmitter.js";

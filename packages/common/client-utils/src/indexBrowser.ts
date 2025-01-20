/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Entrypoint for browser-specific code in the package.
// (See 'Isomorphic Code' section in the package README.md.)

export {
	bufferToString,
	isArrayBuffer,
	IsoBuffer,
	stringToBuffer,
	Uint8ArrayToString,
} from "./bufferBrowser.js";
export { gitHashFile, hashFile } from "./hashFileBrowser.js";
export { performance } from "./performanceIsomorphic.js";

export { fromBase64ToUtf8, fromUtf8ToBase64, toUtf8 } from "./base64EncodingBrowser.js";
export { Uint8ArrayToArrayBuffer } from "./bufferShared.js";
export { EventEmitter } from "./eventEmitter.cjs";
export { type IsomorphicPerformance } from "./performanceIsomorphic.js";
export { type ITraceEvent, Trace } from "./trace.js";
export {
	type EventEmitterEventType,
	TypedEventEmitter,
	type TypedEventTransform,
} from "./typedEventEmitter.js";

export { createEmitter } from "./events/index.js";

export {
	LayerCompatibilityManager,
	type LayerCompatCheckResult,
	type ICompatibilityDetails,
	type IProvideCompatibilityDetails,
} from "./layerCompat.js";

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Entrypoint for browser-specific code in the package.
// (See 'Isomorphic Code' section in the package README.md.)

export { fromBase64ToUtf8, fromUtf8ToBase64, toUtf8 } from "./base64EncodingBrowser.js";
export {
	bufferToString,
	IsoBuffer,
	isArrayBuffer,
	stringToBuffer,
	Uint8ArrayToString,
} from "./bufferBrowser.js";
export { Uint8ArrayToArrayBuffer } from "./bufferShared.js";
export { EventEmitter } from "./eventEmitter.cjs";
export { createEmitter } from "./events/index.js";
export { gitHashFile, hashFile } from "./hashFileBrowser.js";
export {
	checkLayerCompatibility,
	type FluidLayer,
	type ILayerCompatDetails,
	type ILayerCompatSupportRequirements,
	type IProvideLayerCompatDetails,
	type LayerCompatCheckResult,
	LayerCompatibilityPolicyWindowMonths,
} from "./layerCompat.js";
export { generation } from "./layerGenerationState.js";
export { performanceNow } from "./performanceIsomorphic.js";
export { type ITraceEvent, Trace } from "./trace.js";
export {
	type EventEmitterEventType,
	TypedEventEmitter,
	type TypedEventTransform,
} from "./typedEventEmitter.js";

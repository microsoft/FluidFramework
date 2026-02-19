/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Entrypoint for Node.js-specific code in the package.
// (See 'Isomorphic Code' section in the package README.md.)

export { fromBase64ToUtf8, fromUtf8ToBase64, toUtf8 } from "./base64EncodingNode.js";
export {
	type Buffer,
	IsoBuffer,
	Uint8ArrayToString,
	bufferToString,
	stringToBuffer,
} from "./bufferNode.js";
export { Uint8ArrayToArrayBuffer } from "./bufferShared.js";
export { EventEmitter } from "./eventEmitter.cjs";
export { createEmitter } from "./events/index.js";
export { gitHashFile, hashFile } from "./hashFileNode.js";
export {
	type FluidLayer,
	type ILayerCompatDetails,
	type ILayerCompatSupportRequirements,
	type IProvideLayerCompatDetails,
	type LayerCompatCheckResult,
	LayerCompatibilityPolicyWindowMonths,
	checkLayerCompatibility,
} from "./layerCompat.js";
export { generation } from "./layerGenerationState.js";
export { performanceNow } from "./performanceIsomorphic.js";
export { type ITraceEvent, Trace } from "./trace.js";
export {
	type EventEmitterEventType,
	TypedEventEmitter,
	type TypedEventTransform,
} from "./typedEventEmitter.js";

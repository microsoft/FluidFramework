/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Entrypoint for Node.js-specific code in the package.
// (See 'Isomorphic Code' section in the package README.md.)

export { type Buffer } from "./bufferNode.js";
export {
	bufferToString,
	IsoBuffer,
	stringToBuffer,
	Uint8ArrayToString,
} from "./bufferNode.js";
export { gitHashFile, hashFile } from "./hashFileNode.js";
export { performance } from "./performanceIsomorphic.js";

export { fromBase64ToUtf8, fromUtf8ToBase64, toUtf8 } from "./base64EncodingNode.js";
export { Uint8ArrayToArrayBuffer } from "./bufferShared.js";
export { EventEmitter } from "./eventEmitter.cjs";
export type { IsomorphicPerformance } from "./performanceIsomorphic.js";
export { type ITraceEvent, Trace } from "./trace.js";
export {
	type EventEmitterEventType,
	TypedEventEmitter,
	type TypedEventTransform,
} from "./typedEventEmitter.js";
export { type Patch } from "./typeUtils.js";

export { createEmitter } from "./events/index.js";

export {
	checkLayerCompatibility,
	type LayerCompatCheckResult,
	type ILayerCompatDetails,
	type IProvideLayerCompatDetails,
	type ILayerCompatSupportRequirements,
} from "./layerCompat.js";

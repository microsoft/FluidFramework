/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export { createEndpointIndex, EndpointIndex, type IEndpointIndex } from "./endpointIndex.js";
export {
	createEndpointInRangeIndex,
	EndpointInRangeIndex,
	type IEndpointInRangeIndex,
} from "./endpointInRangeIndex.js";
export { createIdIntervalIndex, type IIdIntervalIndex } from "./idIntervalIndex.js";
export type { SequenceIntervalIndex } from "./intervalIndex.js";
export {
	createOverlappingIntervalsIndex,
	type ISequenceOverlappingIntervalsIndex,
	OverlappingIntervalsIndex,
} from "./overlappingIntervalsIndex.js";
export type { SequenceIntervalIndexes } from "./sequenceIntervalIndexes.js";
export {
	createStartpointInRangeIndex,
	type IStartpointInRangeIndex,
	StartpointInRangeIndex,
} from "./startpointInRangeIndex.js";

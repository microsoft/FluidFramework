/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export type { SequenceIntervalIndex } from "./intervalIndex.js";
export { type IIdIntervalIndex, createIdIntervalIndex } from "./idIntervalIndex.js";
export { type IEndpointIndex, createEndpointIndex, EndpointIndex } from "./endpointIndex.js";
export type { SequenceIntervalIndexes } from "./sequenceIntervalIndexes.js";
export {
	createOverlappingIntervalsIndex,
	OverlappingIntervalsIndex,
	type ISequenceOverlappingIntervalsIndex,
} from "./overlappingIntervalsIndex.js";

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISegment } from "@fluidframework/merge-tree/internal";

import { SequenceInterval } from "../intervals/index.js";

import { type ISequenceOverlappingIntervalsIndex } from "./overlappingIntervalsIndex.js";

/**
 * This namespace contains specialiazations of indexes which support spatial queries
 * specifically for `SequenceInterval`s.
 * @internal
 */
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace SequenceIntervalIndexes {
	/**
	 * Collection of intervals.
	 *
	 * Provides additional APIs to support efficiently querying a collection of intervals based on segments and offset.
	 * @internal
	 */
	export interface Overlapping extends ISequenceOverlappingIntervalsIndex {
		/**
		 * Finds overlapping intervals within the specified range.
		 *
		 * @returns an array of all intervals that overlap with the specified SegOff range (includes both ends)
		 */
		findOverlappingIntervalsBySegoff(
			startSegoff: { segment: ISegment | undefined; offset: number | undefined },
			endSegoff: { segment: ISegment | undefined; offset: number | undefined },
		): Iterable<SequenceInterval>;
	}
}

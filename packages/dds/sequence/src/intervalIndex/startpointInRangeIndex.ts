/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { SequenceInterval } from "../intervals/index.js";
import { createTransientIntervalFromSequence } from "../intervals/index.js";
import type { ISharedSegmentSequence } from "../sequence.js";
import type { ISharedString } from "../sharedString.js";

import type { SequenceIntervalIndex } from "./intervalIndex.js";
import { SequenceIntervalEndpointSet } from "./intervalIndexUtils.js";

/**
 * Collection of intervals.
 *
 * Provide additional APIs to support efficiently querying a collection of intervals whose startpoints fall within a specified range.
 * @internal
 */
export interface IStartpointInRangeIndex extends SequenceIntervalIndex {
	/**
	 * @returns an array of all intervals contained in this collection whose startpoints locate in the range [start, end] (includes both ends)
	 */
	findIntervalsWithStartpointInRange(start: number, end: number): SequenceInterval[];
}

class StartInRangeSet extends SequenceIntervalEndpointSet {
	protected compareEndpoints(a: SequenceInterval, b: SequenceInterval): number {
		return a.compareStart(b);
	}
}

export class StartpointInRangeIndex implements IStartpointInRangeIndex {
	private readonly intervals = new StartInRangeSet();

	constructor(private readonly sequence: ISharedSegmentSequence<any>) {}

	public add(interval: SequenceInterval): void {
		this.intervals.addOrUpdate(interval);
	}

	public remove(interval: SequenceInterval): void {
		this.intervals.remove(interval);
	}

	public findIntervalsWithStartpointInRange(start: number, end: number): SequenceInterval[] {
		if (start <= 0 || start > end || this.intervals.size === 0) {
			return [];
		}

		return this.intervals.range(
			createTransientIntervalFromSequence(start, start, this.sequence),
			createTransientIntervalFromSequence(end, end, this.sequence),
		);
	}
}
/**
 * Creates a startpoint-in-range index for the provided SharedString.
 *
 * @internal
 */
export function createStartpointInRangeIndex(
	sharedString: ISharedString,
): IStartpointInRangeIndex {
	return new StartpointInRangeIndex(sharedString);
}

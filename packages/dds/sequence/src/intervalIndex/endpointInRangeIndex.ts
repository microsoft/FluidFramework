/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { SequenceInterval } from "../intervals/index.js";
import { createTransientIntervalFromSequence } from "../intervals/index.js";
import type { ISharedSegmentSequence } from "../sequence.js";
import type { ISharedString } from "../sharedString.js";

import type { SequenceIntervalIndex } from "./intervalIndex.js";
import { SequenceIntervalEndSet } from "./sequenceIntervalEndpointSet.js";

/**
 * Collection of intervals.
 *
 * Provide additional APIs to support efficiently querying a collection of intervals whose endpoints fall within a specified range.
 * @internal
 */
export interface IEndpointInRangeIndex extends SequenceIntervalIndex {
	/**
	 * @returns an array of all intervals contained in this collection whose endpoints locate in the range [start, end] (includes both ends)
	 */
	findIntervalsWithEndpointInRange(start: number, end: number): SequenceInterval[];
}

export class EndpointInRangeIndex implements IEndpointInRangeIndex {
	private readonly intervals = new SequenceIntervalEndSet();

	constructor(private readonly sequence: ISharedSegmentSequence<any>) {}

	public add(interval: SequenceInterval): void {
		this.intervals.addOrUpdate(interval);
	}

	public remove(interval: SequenceInterval): void {
		this.intervals.remove(interval);
	}

	public findIntervalsWithEndpointInRange(start: number, end: number): SequenceInterval[] {
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
 * Creates an endpoint-in-range index for the provided SharedString.
 *
 * @internal
 */
export function createEndpointInRangeIndex(
	sharedString: ISharedString,
): IEndpointInRangeIndex {
	return new EndpointInRangeIndex(sharedString);
}

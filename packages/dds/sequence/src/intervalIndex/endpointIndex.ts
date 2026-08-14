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
 * @internal
 */
export interface IEndpointIndex extends SequenceIntervalIndex {
	/**
	 * @returns the previous interval based on the given position number.
	 * If no such interval exists in this index, returns `undefined`
	 */
	previousInterval(pos: number): SequenceInterval | undefined;

	/**
	 * @returns the next interval based on the given position number.
	 * If no such interval exists in this index, returns `undefined`
	 */
	nextInterval(pos: number): SequenceInterval | undefined;
}

class SequenceIntervalEndSet extends SequenceIntervalEndpointSet {
	protected compareEndpoints(a: SequenceInterval, b: SequenceInterval): number {
		return a.compareEnd(b);
	}
}

export class EndpointIndex implements IEndpointIndex {
	private readonly endIntervals = new SequenceIntervalEndSet();

	constructor(private readonly sequence: ISharedSegmentSequence<any>) {}

	public previousInterval(pos: number): SequenceInterval | undefined {
		const transientInterval = createTransientIntervalFromSequence(pos, pos, this.sequence);
		return this.endIntervals.lastAtOrBefore(transientInterval);
	}

	public nextInterval(pos: number): SequenceInterval | undefined {
		const transientInterval = createTransientIntervalFromSequence(pos, pos, this.sequence);
		return this.endIntervals.firstAtOrAfter(transientInterval);
	}

	public add(interval: SequenceInterval): void {
		this.endIntervals.addOrUpdate(interval);
	}

	public remove(interval: SequenceInterval): void {
		this.endIntervals.remove(interval);
	}
}

/**
 * Creates an endpoint index for the provided SharedString.
 *
 * @internal
 */
export function createEndpointIndex(sharedString: ISharedString): IEndpointIndex {
	return new EndpointIndex(sharedString);
}

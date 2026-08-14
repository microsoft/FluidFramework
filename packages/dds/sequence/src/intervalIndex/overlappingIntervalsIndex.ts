/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { SequencePlace } from "@fluidframework/merge-tree/internal";
import { endpointPosAndSide } from "@fluidframework/merge-tree/internal";

import type { SequenceInterval, BaseSequenceInterval } from "../intervals/index.js";
import { createTransientIntervalFromSequence } from "../intervals/index.js";
import type { ISharedSegmentSequence } from "../sequence.js";
import type { ISharedString } from "../sharedString.js";

import type { SequenceIntervalIndex } from "./intervalIndex.js";
import { SequenceIntervalOverlapSet } from "./sequenceIntervalOverlapSet.js";

/**
 * @legacy @beta
 */
export interface ISequenceOverlappingIntervalsIndex extends SequenceIntervalIndex {
	/**
	 * @returns an array of all intervals contained in this collection that overlap the range
	 * `[start end]`.
	 */
	findOverlappingIntervals(start: SequencePlace, end: SequencePlace): SequenceInterval[];

	/**
	 * Gathers the interval results based on specified parameters.
	 */
	gatherIterationResults(
		results: SequenceInterval[],
		iteratesForward: boolean,
		start?: SequencePlace,
		end?: SequencePlace,
	): void;
}

export class OverlappingIntervalsIndex implements ISequenceOverlappingIntervalsIndex {
	protected readonly intervalSet = new SequenceIntervalOverlapSet();

	constructor(protected readonly sequence: ISharedSegmentSequence<any>) {}

	public gatherIterationResults(
		results: SequenceInterval[],
		iteratesForward: boolean,
		start?: SequencePlace,
		end?: SequencePlace,
	): void {
		if (this.intervalSet.isEmpty()) {
			return;
		}

		let matches: readonly BaseSequenceInterval[];
		if (start === undefined && end === undefined) {
			// No start/end provided. Gather everything.
			matches = this.intervalSet.intervals;
		} else {
			const transientInterval: BaseSequenceInterval = createTransientIntervalFromSequence(
				start ?? "start",
				end ?? "end",
				this.sequence,
			);

			if (start === undefined) {
				// Only an end position was provided. The intervals are not ordered by end position,
				// so every one of them has to be examined.
				matches = this.intervalSet.intervals.filter(
					(interval) => transientInterval.compareEnd(interval) === 0,
				);
			} else {
				matches =
					end === undefined
						? this.intervalSet.withSameStart(transientInterval)
						: this.intervalSet.withSameEndpoints(transientInterval);
			}
		}

		if (iteratesForward) {
			results.push(...matches);
		} else {
			for (let i = matches.length - 1; i >= 0; i--) {
				results.push(matches[i]);
			}
		}
	}

	public findOverlappingIntervals(
		start: SequencePlace,
		end: SequencePlace,
	): SequenceInterval[] {
		const { startPos, endPos } = endpointPosAndSide(start, end);

		if (
			startPos === undefined ||
			endPos === undefined ||
			(typeof startPos === "number" && typeof endPos === "number" && endPos < startPos) ||
			(startPos === "end" && endPos !== "end") ||
			(startPos !== "start" && endPos === "start") ||
			this.intervalSet.isEmpty()
		) {
			return [];
		}
		const transientInterval = createTransientIntervalFromSequence(start, end, this.sequence);

		return this.intervalSet.findOverlapping(transientInterval);
	}

	public remove(interval: BaseSequenceInterval) {
		this.intervalSet.remove(interval);
	}

	public add(interval: BaseSequenceInterval) {
		this.intervalSet.add(interval);
	}
}

/**
 * Creates an overlapping intervals index for the provided SharedString.
 *
 * @legacy @beta
 */
export function createOverlappingIntervalsIndex(
	sharedString: ISharedString,
): ISequenceOverlappingIntervalsIndex {
	return new OverlappingIntervalsIndex(sharedString);
}

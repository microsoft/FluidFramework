/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { SequencePlace } from "@fluidframework/merge-tree/internal";
import { endpointPosAndSide } from "@fluidframework/merge-tree/internal";

import type { SequenceInterval } from "../intervals/index.js";
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
	private readonly intervalSet = new SequenceIntervalOverlapSet();

	constructor(private readonly sequence: ISharedSegmentSequence<any>) {}

	public gatherIterationResults(
		results: SequenceInterval[],
		iteratesForward: boolean,
		start?: SequencePlace,
		end?: SequencePlace,
	): void {
		if (this.intervalSet.isEmpty()) {
			return;
		}

		let matches: readonly SequenceInterval[];
		if (start === undefined && end === undefined) {
			// Neither endpoint constrains the results, so gather everything.
			matches = this.intervalSet.intervals;
		} else {
			// The transient interval carries both endpoints, standing in for whichever the caller
			// left open; which of them was specified selects the query.
			const query = createTransientIntervalFromSequence(
				start ?? "start",
				end ?? "end",
				this.sequence,
			);
			if (start === undefined) {
				matches = this.intervalSet.withSameEnd(query);
			} else if (end === undefined) {
				matches = this.intervalSet.withSameStart(query);
			} else {
				matches = this.intervalSet.withSameEndpoints(query);
			}
		}

		// Appended one at a time rather than spread: spreading passes one argument per interval,
		// which overflows the call stack on a large collection.
		if (iteratesForward) {
			for (const interval of matches) {
				results.push(interval);
			}
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

	public remove(interval: SequenceInterval): void {
		this.intervalSet.remove(interval);
	}

	public add(interval: SequenceInterval): void {
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

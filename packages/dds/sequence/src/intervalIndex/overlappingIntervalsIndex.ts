/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import/no-deprecated */

import {
	Client,
	SequencePlace,
	endpointPosAndSide,
} from "@fluidframework/merge-tree/internal";

import { IntervalNode, IntervalTree } from "../intervalTree.js";
import {
	ISerializableInterval,
	SequenceInterval,
	createTransientInterval,
} from "../intervals/index.js";
import { ISharedString } from "../sharedString.js";

import { IntervalIndex, type SequenceIntervalIndex } from "./intervalIndex.js";

/**
 * The generic version of this interface is deprecated and will be removed in a future release.
 * Use {@link ISequenceOverlappingIntervalsIndex} instead.
 * @legacy
 * @alpha
* @deprecated The generic version of this interface is no longer used and will be removed. Use {@link ISequenceOverlappingIntervalsIndex} instead.
 */
export interface IOverlappingIntervalsIndex<TInterval extends ISerializableInterval>
	extends IntervalIndex<TInterval> {
	/**
	 * @returns an array of all intervals contained in this collection that overlap the range
	 * `[start end]`.
	 */
	findOverlappingIntervals(start: SequencePlace, end: SequencePlace): TInterval[];

	/**
	 * Gathers the interval results based on specified parameters.
	 */
	gatherIterationResults(
		results: TInterval[],
		iteratesForward: boolean,
		start?: SequencePlace,
		end?: SequencePlace,
	): void;
}

/**
 * @legacy
 * @alpha
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
	protected readonly intervalTree = new IntervalTree<SequenceInterval>();
	protected readonly client: Client;

	constructor(client: Client) {
		this.client = client;
	}

	public map(fn: (interval: SequenceInterval) => void) {
		this.intervalTree.map(fn);
	}

	public mapUntil(fn: (interval: SequenceInterval) => boolean) {
		this.intervalTree.mapUntil(fn);
	}

	public gatherIterationResults(
		results: SequenceInterval[],
		iteratesForward: boolean,
		start?: SequencePlace,
		end?: SequencePlace,
	): void {
		if (this.intervalTree.intervals.isEmpty()) {
			return;
		}

		if (start === undefined && end === undefined) {
			// No start/end provided. Gather the whole tree in the specified order.
			if (iteratesForward) {
				this.intervalTree.map((interval: SequenceInterval) => {
					results.push(interval);
				});
			} else {
				this.intervalTree.mapBackward((interval: SequenceInterval) => {
					results.push(interval);
				});
			}
		} else {
			const transientInterval: SequenceInterval = createTransientInterval(
				start ?? "start",
				end ?? "end",
				this.client,
			);

			if (start === undefined) {
				// Only end position provided. Since the tree is not sorted by end position,
				// walk the whole tree in the specified order, gathering intervals that match the end.
				if (iteratesForward) {
					this.intervalTree.map((interval: SequenceInterval) => {
						if (transientInterval.compareEnd(interval) === 0) {
							results.push(interval);
						}
					});
				} else {
					this.intervalTree.mapBackward((interval: SequenceInterval) => {
						if (transientInterval.compareEnd(interval) === 0) {
							results.push(interval);
						}
					});
				}
			} else {
				// Start and (possibly) end provided. Walk the subtrees that may contain
				// this start position.
				const compareFn =
					end === undefined
						? (node: IntervalNode<SequenceInterval>) => {
								return transientInterval.compareStart(node.key);
							}
						: (node: IntervalNode<SequenceInterval>) => {
								return transientInterval.compare(node.key);
							};
				const continueLeftFn = (cmpResult: number) => cmpResult <= 0;
				const continueRightFn = (cmpResult: number) => cmpResult >= 0;
				const actionFn = (node: IntervalNode<SequenceInterval>) => {
					results.push(node.key);
				};

				if (iteratesForward) {
					this.intervalTree.intervals.walkExactMatchesForward(
						compareFn,
						actionFn,
						continueLeftFn,
						continueRightFn,
					);
				} else {
					this.intervalTree.intervals.walkExactMatchesBackward(
						compareFn,
						actionFn,
						continueLeftFn,
						continueRightFn,
					);
				}
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
			this.intervalTree.intervals.isEmpty()
		) {
			return [];
		}
		const transientInterval = createTransientInterval(start, end, this.client);

		const overlappingIntervalNodes = this.intervalTree.match(transientInterval);
		return overlappingIntervalNodes.map((node) => node.key);
	}

	public remove(interval: SequenceInterval) {
		this.intervalTree.removeExisting(interval);
	}

	public add(interval: SequenceInterval) {
		this.intervalTree.put(interval);
	}
}

/**
 * @legacy
 * @alpha
 */
export function createOverlappingIntervalsIndex(
	sharedString: ISharedString,
): ISequenceOverlappingIntervalsIndex {
	const client = (sharedString as unknown as { client: Client }).client;
	return new OverlappingIntervalsIndex(client);
}

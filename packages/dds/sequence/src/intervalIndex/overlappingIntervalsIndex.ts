/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Client } from "@fluidframework/merge-tree";
import { IntervalType, IIntervalHelpers, ISerializableInterval } from "../intervals";
import { IntervalNode, IntervalTree } from "../intervalTree";
import { Side, endpointPosAndSide } from "../intervalCollection";
import { IntervalIndex } from "./intervalIndex";

export interface IOverlappingIntervalsIndex<TInterval extends ISerializableInterval>
	extends IntervalIndex<TInterval> {
	/**
	 * @returns an array of all intervals contained in this collection that overlap the range
	 * `[start end]`.
	 */
	findOverlappingIntervals(
		start: number | { pos: number; side: Side },
		end: number | { pos: number; side: Side },
	): TInterval[];

	/**
	 * Gathers the interval results based on specified parameters.
	 */
	gatherIterationResults(
		results: TInterval[],
		iteratesForward: boolean,
		start?: number | { pos: number; side: Side },
		end?: number | { pos: number; side: Side },
	): void;
}

export class OverlappingIntervalsIndex<TInterval extends ISerializableInterval>
	implements IOverlappingIntervalsIndex<TInterval>
{
	protected readonly intervalTree = new IntervalTree<TInterval>();
	protected readonly client: Client;
	protected readonly helpers: IIntervalHelpers<TInterval>;

	constructor(client: Client, helpers: IIntervalHelpers<TInterval>) {
		this.client = client;
		this.helpers = helpers;
	}

	public map(fn: (interval: TInterval) => void) {
		this.intervalTree.map(fn);
	}

	public mapUntil(fn: (interval: TInterval) => boolean) {
		this.intervalTree.mapUntil(fn);
	}

	public gatherIterationResults(
		results: TInterval[],
		iteratesForward: boolean,
		start?: number | { pos: number; side: Side },
		end?: number | { pos: number; side: Side },
	): void {
		if (this.intervalTree.intervals.isEmpty()) {
			return;
		}

		if (start === undefined && end === undefined) {
			// No start/end provided. Gather the whole tree in the specified order.
			if (iteratesForward) {
				this.intervalTree.map((interval: TInterval) => {
					results.push(interval);
				});
			} else {
				this.intervalTree.mapBackward((interval: TInterval) => {
					results.push(interval);
				});
			}
		} else {
			const { startSide, endSide, startPos, endPos } = endpointPosAndSide(start, end);
			const transientInterval: TInterval = this.helpers.create(
				"transient",
				startPos,
				endPos,
				this.client,
				IntervalType.Transient,
				undefined,
				undefined,
				undefined,
				undefined,
				startSide,
				endSide,
			);

			if (start === undefined) {
				// Only end position provided. Since the tree is not sorted by end position,
				// walk the whole tree in the specified order, gathering intervals that match the end.
				if (iteratesForward) {
					this.intervalTree.map((interval: TInterval) => {
						if (transientInterval.compareEnd(interval) === 0) {
							results.push(interval);
						}
					});
				} else {
					this.intervalTree.mapBackward((interval: TInterval) => {
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
						? (node: IntervalNode<TInterval>) => {
								return transientInterval.compareStart(node.key);
						  }
						: (node: IntervalNode<TInterval>) => {
								return transientInterval.compare(node.key);
						  };
				const continueLeftFn = (cmpResult: number) => cmpResult <= 0;
				const continueRightFn = (cmpResult: number) => cmpResult >= 0;
				const actionFn = (node: IntervalNode<TInterval>) => {
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
		start: number | { pos: number; side: Side },
		end: number | { pos: number; side: Side },
	): TInterval[] {
		const { startSide, endSide, startPos, endPos } = endpointPosAndSide(start, end);

		if (
			startPos === undefined ||
			endPos === undefined ||
			endPos < startPos ||
			this.intervalTree.intervals.isEmpty()
		) {
			return [];
		}
		const transientInterval = this.helpers.create(
			"transient",
			startPos,
			endPos,
			this.client,
			IntervalType.Transient,
			undefined,
			undefined,
			undefined,
			undefined,
			startSide,
			endSide,
		);

		const overlappingIntervalNodes = this.intervalTree.match(transientInterval);
		return overlappingIntervalNodes.map((node) => node.key);
	}

	public remove(interval: TInterval) {
		this.intervalTree.removeExisting(interval);
	}

	public add(interval: TInterval) {
		this.intervalTree.put(interval);
	}
}

export function createOverlappingIntervalsIndex<TInterval extends ISerializableInterval>(
	client: Client,
	helpers: IIntervalHelpers<TInterval>,
): IOverlappingIntervalsIndex<TInterval> {
	return new OverlappingIntervalsIndex<TInterval>(client, helpers);
}

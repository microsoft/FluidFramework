/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { PropertyAction, RedBlackTree } from "@fluidframework/merge-tree";
import { assert } from "@fluidframework/core-utils";
import { IIntervalHelpers, ISerializableInterval, IntervalType } from "../intervals";
import { LocalReferenceTracker } from "../sequence";
import { IntervalIndex } from "./intervalIndex";
import { HasComparisonOverride, compareOverrideables, forceCompare } from "./intervalIndexUtils";

/**
 * Collection of intervals.
 *
 * Provide additional APIs to support efficiently querying a collection of intervals whose startpoints fall within a specified range.
 */
export interface IStartpointInRangeIndex<TInterval extends ISerializableInterval>
	extends IntervalIndex<TInterval> {
	/**
	 * @returns an array of all intervals contained in this collection whose startpoints locate in the range [start, end] (includes both ends)
	 */
	findIntervalsWithStartpointInRange(start: number, end: number);
}

class StartpointInRangeIndex<TInterval extends ISerializableInterval>
	implements IStartpointInRangeIndex<TInterval>
{
	private readonly intervalTree;

	constructor(
		private readonly helpers: IIntervalHelpers<TInterval>,
		private readonly localReferenceTracker: LocalReferenceTracker,
	) {
		this.intervalTree = new RedBlackTree<TInterval, TInterval>((a: TInterval, b: TInterval) => {
			assert(
				typeof helpers.compareStarts === "function",
				0x6d1 /* compareStarts does not exist in the helpers */,
			);

			const compareStartsResult = helpers.compareStarts(a, b);
			if (compareStartsResult !== 0) {
				return compareStartsResult;
			}

			const overrideablesComparison = compareOverrideables(
				a as Partial<HasComparisonOverride>,
				b as Partial<HasComparisonOverride>,
			);
			if (overrideablesComparison !== 0) {
				return overrideablesComparison;
			}
			const aId = a.getIntervalId();
			const bId = b.getIntervalId();
			if (aId !== undefined && bId !== undefined) {
				return aId.localeCompare(bId);
			}
			return 0;
		});
	}

	public add(interval: TInterval): void {
		this.intervalTree.put(interval, interval);
	}

	public remove(interval: TInterval): void {
		this.intervalTree.remove(interval);
	}

	public findIntervalsWithStartpointInRange(start: number, end: number) {
		if (start <= 0 || start > end || this.intervalTree.isEmpty()) {
			return [];
		}
		const results: TInterval[] = [];
		const action: PropertyAction<TInterval, TInterval> = (node) => {
			results.push(node.data);
			return true;
		};

		const transientStartInterval = this.helpers.create(
			"transient",
			start,
			start,
			this.localReferenceTracker,
			IntervalType.Transient,
		);

		const transientEndInterval = this.helpers.create(
			"transient",
			end,
			end,
			this.localReferenceTracker,
			IntervalType.Transient,
		);

		// Add comparison overrides to the transient intervals
		(transientStartInterval as Partial<HasComparisonOverride>)[forceCompare] = -1;
		(transientEndInterval as Partial<HasComparisonOverride>)[forceCompare] = 1;

		this.intervalTree.mapRange(action, results, transientStartInterval, transientEndInterval);
		return results;
	}
}

export function createStartpointInRangeIndex<TInterval extends ISerializableInterval>(
	helpers: IIntervalHelpers<TInterval>,
	localReferenceTracker: LocalReferenceTracker,
): IStartpointInRangeIndex<TInterval> {
	return new StartpointInRangeIndex<TInterval>(helpers, localReferenceTracker);
}

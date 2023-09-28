/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable import/no-deprecated */

import { Client, PropertyAction, RedBlackTree } from "@fluidframework/merge-tree";
import {
	IIntervalHelpers,
	ISerializableInterval,
	IntervalType,
	SequenceInterval,
	sequenceIntervalHelpers,
} from "../intervals";
import { SharedString } from "../sharedString";
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
	findIntervalsWithStartpointInRange(start: number, end: number): TInterval[];
}

export class StartpointInRangeIndex<TInterval extends ISerializableInterval>
	implements IStartpointInRangeIndex<TInterval>
{
	private readonly intervalTree;

	constructor(
		private readonly client: Client,
		private readonly helpers: IIntervalHelpers<TInterval>,
	) {
		this.intervalTree = new RedBlackTree<TInterval, TInterval>((a: TInterval, b: TInterval) => {
			const compareStartsResult = a.compareStart(b);
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

	public findIntervalsWithStartpointInRange(start: number, end: number): TInterval[] {
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
			this.client,
			IntervalType.Transient,
		);

		const transientEndInterval = this.helpers.create(
			"transient",
			end,
			end,
			this.client,
			IntervalType.Transient,
		);

		// Add comparison overrides to the transient intervals
		(transientStartInterval as Partial<HasComparisonOverride>)[forceCompare] = -1;
		(transientEndInterval as Partial<HasComparisonOverride>)[forceCompare] = 1;

		this.intervalTree.mapRange(action, results, transientStartInterval, transientEndInterval);
		return results;
	}
}

export function createStartpointInRangeIndex(
	sharedString: SharedString,
): IStartpointInRangeIndex<SequenceInterval> {
	const client = (sharedString as unknown as { client: Client }).client;
	return new StartpointInRangeIndex<SequenceInterval>(client, sequenceIntervalHelpers);
}

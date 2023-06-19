/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	Client,
	ISegment,
	ReferenceType,
	compareReferencePositions,
} from "@fluidframework/merge-tree";
import {
	IIntervalHelpers,
	IntervalType,
	SequenceInterval,
	createPositionReferenceFromSegoff,
} from "../intervalCollection";
import { IntervalTree } from "../intervalTree";
import { SequenceIntervalIndexes } from "./SequenceIntervalIndexes";

class OverlappingSequenceIntervalsIndex implements SequenceIntervalIndexes.Overlapping {
	private readonly intervalTree = new IntervalTree<SequenceInterval>();

	constructor(
		private readonly helpers: IIntervalHelpers<SequenceInterval>,
		private readonly client: Client,
	) {}

	public remove(interval: SequenceInterval) {
		this.intervalTree.removeExisting(interval);
	}

	public add(interval: SequenceInterval) {
		this.intervalTree.put(interval);
	}

	public findOverlappingIntervals(
		startSegoff: { segment: ISegment | undefined; offset: number | undefined },
		endSegoff: { segment: ISegment | undefined; offset: number | undefined },
	) {
		if (this.intervalTree.intervals.isEmpty()) {
			return [];
		}

		const startRefPos = createPositionReferenceFromSegoff(
			this.client,
			startSegoff,
			ReferenceType.Transient,
		);

		const endRefPos = createPositionReferenceFromSegoff(
			this.client,
			endSegoff,
			ReferenceType.Transient,
		);

		if (compareReferencePositions(startRefPos, endRefPos) > 0) {
			return [];
		}

		// initialize a default transient interval
		const transientInterval = this.helpers.create(
			"transient",
			0,
			0,
			this.client,
			IntervalType.Transient,
		);
		// reset the start/end for the transient interval
		transientInterval.start = startRefPos;
		transientInterval.end = endRefPos;

		const overlappingIntervalNodes = this.intervalTree.match(transientInterval);
		return overlappingIntervalNodes.map((node) => node.key);
	}
}

export function createOverlapping(
	helpers: IIntervalHelpers<SequenceInterval>,
	client: Client,
): SequenceIntervalIndexes.Overlapping {
	return new OverlappingSequenceIntervalsIndex(helpers, client);
}

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
	sequenceIntervalHelpers,
	IntervalType,
	SequenceInterval,
	createPositionReferenceFromSegoff,
	IIntervalHelpers,
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
			startRefPos,
			endRefPos,
			this.client,
			IntervalType.Transient,
		);

		const overlappingIntervalNodes = this.intervalTree.match(transientInterval);
		return overlappingIntervalNodes.map((node) => node.key);
	}
}

export function createOverlapping(client: Client): SequenceIntervalIndexes.Overlapping {
	return new OverlappingSequenceIntervalsIndex(sequenceIntervalHelpers, client);
}

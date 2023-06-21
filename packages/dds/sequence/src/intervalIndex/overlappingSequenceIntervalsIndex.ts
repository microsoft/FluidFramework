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
} from "../intervalCollection";
import { SequenceIntervalIndexes } from "./sequenceIntervalIndexes";
import { OverlappingIntervalsIndex } from "./overlappingIntervalsIndex";

class OverlappingSequenceIntervalsIndex
	extends OverlappingIntervalsIndex<SequenceInterval>
	implements SequenceIntervalIndexes.Overlapping
{
	constructor(client: Client) {
		super(client, sequenceIntervalHelpers);
	}

	public findOverlappingIntervalsBySegoff(
		startSegoff: { segment: ISegment | undefined; offset: number | undefined },
		endSegoff: { segment: ISegment | undefined; offset: number | undefined },
	): Iterable<SequenceInterval> {
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

export function createOverlappingSequenceIntervalsIndex(
	client: Client,
): SequenceIntervalIndexes.Overlapping {
	return new OverlappingSequenceIntervalsIndex(client);
}

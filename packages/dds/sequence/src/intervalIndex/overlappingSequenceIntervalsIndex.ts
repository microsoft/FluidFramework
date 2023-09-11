/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ISegment,
	ReferenceType,
	compareReferencePositions,
	reservedRangeLabelsKey,
} from "@fluidframework/merge-tree";
import {
	sequenceIntervalHelpers,
	IntervalType,
	SequenceInterval,
	createPositionReferenceFromSegoff,
} from "../intervals";
import { LocalReferenceTracker } from "../sequence";
import { SequenceIntervalIndexes } from "./sequenceIntervalIndexes";
import { OverlappingIntervalsIndex } from "./overlappingIntervalsIndex";

class OverlappingSequenceIntervalsIndex
	extends OverlappingIntervalsIndex<SequenceInterval>
	implements SequenceIntervalIndexes.Overlapping
{
	constructor(localReferenceTracker: LocalReferenceTracker) {
		super(localReferenceTracker, sequenceIntervalHelpers);
	}

	public findOverlappingIntervalsBySegoff(
		startSegoff: { segment: ISegment | undefined; offset: number | undefined },
		endSegoff: { segment: ISegment | undefined; offset: number | undefined },
	): Iterable<SequenceInterval> {
		if (this.intervalTree.intervals.isEmpty()) {
			return [];
		}

		const startLref = createPositionReferenceFromSegoff(
			this.localReferenceTracker,
			startSegoff,
			ReferenceType.Transient,
		);

		const endLref = createPositionReferenceFromSegoff(
			this.localReferenceTracker,
			endSegoff,
			ReferenceType.Transient,
		);

		if (compareReferencePositions(startLref, endLref) > 0) {
			return [];
		}

		const transientInterval = new SequenceInterval(
			this.localReferenceTracker,
			startLref,
			endLref,
			IntervalType.Transient,
			{ [reservedRangeLabelsKey]: ["transient"] },
		);

		const overlappingIntervalNodes = this.intervalTree.match(transientInterval);
		return overlappingIntervalNodes.map((node) => node.key);
	}
}

export function createOverlappingSequenceIntervalsIndex(
	localReferenceTracker: LocalReferenceTracker,
): SequenceIntervalIndexes.Overlapping {
	return new OverlappingSequenceIntervalsIndex(localReferenceTracker);
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	Client,
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
import { SharedString } from "../sharedString";
import { SequenceIntervalIndexes } from "./sequenceIntervalIndexes";
import { OverlappingIntervalsIndex } from "./overlappingIntervalsIndex";

class OverlappingSequenceIntervalsIndex<T extends ISegment>
	extends OverlappingIntervalsIndex<SequenceInterval>
	implements SequenceIntervalIndexes.Overlapping
{
	constructor(sharedString: SharedString) {
		super(sharedString as unknown as Client, sequenceIntervalHelpers);
	}

	public findOverlappingIntervalsBySegoff(
		startSegoff: { segment: ISegment | undefined; offset: number | undefined },
		endSegoff: { segment: ISegment | undefined; offset: number | undefined },
	): Iterable<SequenceInterval> {
		if (this.intervalTree.intervals.isEmpty()) {
			return [];
		}

		const startLref = createPositionReferenceFromSegoff(
			this.client,
			startSegoff,
			ReferenceType.Transient,
		);

		const endLref = createPositionReferenceFromSegoff(
			this.client,
			endSegoff,
			ReferenceType.Transient,
		);

		if (compareReferencePositions(startLref, endLref) > 0) {
			return [];
		}

		const transientInterval = new SequenceInterval(
			this.client,
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
	sharedString: SharedString,
): SequenceIntervalIndexes.Overlapping {
	return new OverlappingSequenceIntervalsIndex(sharedString);
}

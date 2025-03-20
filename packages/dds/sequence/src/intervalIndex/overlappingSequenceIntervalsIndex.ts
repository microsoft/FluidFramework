/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import/no-deprecated */

import {
	Client,
	ISegment,
	ReferenceType,
	compareReferencePositions,
	reservedRangeLabelsKey,
} from "@fluidframework/merge-tree/internal";

import {
	IntervalType,
	SequenceInterval,
	SequenceIntervalClass,
	createPositionReferenceFromSegoff,
	sequenceIntervalHelpers,
} from "../intervals/index.js";
import { ISharedString } from "../sharedString.js";

import { OverlappingIntervalsIndex } from "./overlappingIntervalsIndex.js";
import { SequenceIntervalIndexes } from "./sequenceIntervalIndexes.js";

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

		const transientInterval = new SequenceIntervalClass(
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

/**
 * @internal
 */
export function createOverlappingSequenceIntervalsIndex(
	sharedString: ISharedString,
): SequenceIntervalIndexes.Overlapping {
	const client = (sharedString as unknown as { client: Client }).client;
	return new OverlappingSequenceIntervalsIndex(client);
}

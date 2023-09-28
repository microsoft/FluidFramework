/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable no-bitwise */

import { assert, unreachableCase } from "@fluidframework/core-utils";
import {
	appendToMergeTreeDeltaRevertibles,
	discardMergeTreeDeltaRevertible,
	isMergeTreeDeltaRevertible,
	LocalReferencePosition,
	MergeTreeDeltaOperationType,
	MergeTreeDeltaRevertible,
	MergeTreeDeltaType,
	PropertySet,
	ReferenceType,
	refTypeIncludesFlag,
	revertMergeTreeDeltaRevertibles,
	SortedSet,
	getSlideToSegoff,
} from "@fluidframework/merge-tree";
import { IntervalOpType, SequenceInterval } from "./intervals";
import { SharedString, SharedStringSegment } from "./sharedString";
import { ISequenceDeltaRange, SequenceDeltaEvent } from "./sequenceDeltaEvent";

/**
 * Data for undoing edits on SharedStrings and Intervals.
 *
 * @alpha
 */
export type SharedStringRevertible = MergeTreeDeltaRevertible | IntervalRevertible;

const idMap = new Map<string, string>();

type IntervalOpType = typeof IntervalOpType[keyof typeof IntervalOpType];

/**
 * Data for undoing edits affecting Intervals.
 *
 * @alpha
 */
export type IntervalRevertible =
	| {
			event: typeof IntervalOpType.CHANGE;
			interval: SequenceInterval;
			start: LocalReferencePosition;
			end: LocalReferencePosition;
	  }
	| {
			event: typeof IntervalOpType.ADD;
			interval: SequenceInterval;
	  }
	| {
			event: typeof IntervalOpType.DELETE;
			interval: SequenceInterval;
			start: LocalReferencePosition;
			end: LocalReferencePosition;
	  }
	| {
			event: typeof IntervalOpType.PROPERTY_CHANGED;
			interval: SequenceInterval;
			propertyDeltas: PropertySet;
	  }
	| {
			event: typeof IntervalOpType.POSITION_REMOVE;
			intervals: {
				intervalId: string;
				label: string;
				startOffset?: number; // interval start index within a removed range
				endOffset?: number; // interval end index within a removed range
			}[];
			// local refs used by IntervalOpType.CHANGE and DELETE revertibles
			revertibleRefs: {
				revertible: IntervalRevertible;
				offset: number;
				isStart: boolean;
			}[];
			mergeTreeRevertible: MergeTreeDeltaRevertible;
	  };

type TypedRevertible<T extends IntervalRevertible["event"]> = IntervalRevertible & { event: T };

function getUpdatedIdFromInterval(interval: SequenceInterval): string {
	const maybeId = interval.getIntervalId();
	return getUpdatedId(maybeId);
}

function getUpdatedId(intervalId: string): string {
	return idMap.get(intervalId) ?? intervalId;
}

/**
 * Create revertibles for adding an interval
 * @alpha
 */
export function appendAddIntervalToRevertibles(
	interval: SequenceInterval,
	revertibles: SharedStringRevertible[],
) {
	revertibles.push({
		event: IntervalOpType.ADD,
		interval,
	});

	return revertibles;
}

/**
 * Create revertibles for deleting an interval
 * @alpha
 */
export function appendDeleteIntervalToRevertibles(
	string: SharedString,
	interval: SequenceInterval,
	revertibles: SharedStringRevertible[],
) {
	const startSeg = interval.start.getSegment() as SharedStringSegment;
	const startType =
		startSeg.removedSeq !== undefined
			? ReferenceType.SlideOnRemove | ReferenceType.RangeBegin
			: ReferenceType.StayOnRemove | ReferenceType.RangeBegin;
	const endSeg = interval.end.getSegment() as SharedStringSegment;
	const endType =
		endSeg.removedSeq !== undefined
			? ReferenceType.SlideOnRemove | ReferenceType.RangeEnd
			: ReferenceType.StayOnRemove | ReferenceType.RangeEnd;
	const startRef = string.createLocalReferencePosition(
		startSeg,
		interval.start.getOffset(),
		startType,
		undefined,
		interval.start.slidingPreference,
	);
	const endRef = string.createLocalReferencePosition(
		endSeg,
		interval.end.getOffset(),
		endType,
		undefined,
		interval.end.slidingPreference,
	);
	const revertible = {
		event: IntervalOpType.DELETE,
		interval,
		start: startRef,
		end: endRef,
	};
	revertible.start.addProperties({ revertible });
	revertible.end.addProperties({ revertible });
	revertibles.push(revertible);

	return revertibles;
}

/**
 * Create revertibles for moving endpoints of an interval
 * @alpha
 */
export function appendChangeIntervalToRevertibles(
	string: SharedString,
	newInterval: SequenceInterval,
	previousInterval: SequenceInterval,
	revertibles: SharedStringRevertible[],
) {
	const startSeg = previousInterval.start.getSegment() as SharedStringSegment;
	// This logic is needed because the ReferenceType StayOnRemove cannot be used
	// on removed segments. This works for revertibles because the old position of the
	// interval within the removed segment is handled by the remove range revertible.
	const startType =
		startSeg.removedSeq !== undefined
			? ReferenceType.SlideOnRemove | ReferenceType.RangeBegin
			: ReferenceType.StayOnRemove | ReferenceType.RangeBegin;
	const endSeg = previousInterval.end.getSegment() as SharedStringSegment;
	const endType =
		endSeg.removedSeq !== undefined
			? ReferenceType.SlideOnRemove | ReferenceType.RangeEnd
			: ReferenceType.StayOnRemove | ReferenceType.RangeEnd;
	const prevStartRef = string.createLocalReferencePosition(
		startSeg,
		previousInterval.start.getOffset(),
		startType,
		undefined,
		previousInterval.start.slidingPreference,
	);
	const prevEndRef = string.createLocalReferencePosition(
		endSeg,
		previousInterval.end.getOffset(),
		endType,
		undefined,
		previousInterval.end.slidingPreference,
	);
	const revertible = {
		event: IntervalOpType.CHANGE,
		interval: newInterval,
		start: prevStartRef,
		end: prevEndRef,
	};
	revertible.start.addProperties({ revertible });
	revertible.end.addProperties({ revertible });
	revertibles.push(revertible);

	return revertibles;
}

/**
 * Create revertibles for changing properties of an interval
 * @alpha
 */
export function appendIntervalPropertyChangedToRevertibles(
	interval: SequenceInterval,
	deltas: PropertySet,
	revertibles: SharedStringRevertible[],
) {
	revertibles.push({
		event: IntervalOpType.PROPERTY_CHANGED,
		interval,
		propertyDeltas: deltas,
	});

	return revertibles;
}

function addIfIntervalEndpoint(
	ref: LocalReferencePosition,
	segmentLengths: number,
	startIntervals: { offset: number; interval: SequenceInterval }[],
	endIntervals: { offset: number; interval: SequenceInterval }[],
) {
	if (refTypeIncludesFlag(ref.refType, ReferenceType.RangeBegin)) {
		const interval = ref.properties?.interval;
		if (interval && interval instanceof SequenceInterval) {
			startIntervals.push({ offset: segmentLengths + interval.start.getOffset(), interval });
			return true;
		}
	} else if (refTypeIncludesFlag(ref.refType, ReferenceType.RangeEnd)) {
		const interval = ref.properties?.interval;
		if (interval && interval instanceof SequenceInterval) {
			endIntervals.push({ offset: segmentLengths + interval.end.getOffset(), interval });
			return true;
		}
	}
	return false;
}

function addIfRevertibleRef(
	ref: LocalReferencePosition,
	segmentLengths: number,
	revertibleRefs: {
		revertible: IntervalRevertible;
		offset: number;
		isStart: boolean;
	}[],
) {
	const revertible = ref.properties?.revertible;
	if (revertible) {
		revertibleRefs.push({
			revertible,
			offset: segmentLengths + ref.getOffset(),
			isStart: refTypeIncludesFlag(ref.refType, ReferenceType.RangeBegin),
		});
	}
}

/**
 * Create revertibles for SharedStringDeltas, handling indirectly modified intervals
 * (e.g. reverting remove of a range that contains an interval will move the interval back)
 *
 * @alpha
 */
export function appendSharedStringDeltaToRevertibles(
	string: SharedString,
	delta: SequenceDeltaEvent,
	revertibles: SharedStringRevertible[],
) {
	if (delta.ranges.length === 0) {
		return;
	}
	if (delta.deltaOperation === MergeTreeDeltaType.REMOVE) {
		const startIntervals: { offset: number; interval: SequenceInterval }[] = [];
		const endIntervals: { offset: number; interval: SequenceInterval }[] = [];
		const revertibleRefs: {
			revertible: IntervalRevertible;
			offset: number;
			isStart: boolean;
		}[] = [];
		let segmentLengths = 0;

		// find interval endpoints in each segment
		for (const deltaRange of delta.ranges) {
			const refs = deltaRange.segment.localRefs;
			if (refs !== undefined && deltaRange.position !== -1) {
				for (const ref of refs) {
					addIfIntervalEndpoint(ref, segmentLengths, startIntervals, endIntervals);
					addIfRevertibleRef(ref, segmentLengths, revertibleRefs);
				}
			}
			segmentLengths += deltaRange.segment.cachedLength;
		}

		if (startIntervals.length > 0 || endIntervals.length > 0 || revertibleRefs.length > 0) {
			const removeRevertibles: MergeTreeDeltaRevertible[] = [];
			appendToMergeTreeDeltaRevertibles(delta.deltaArgs, removeRevertibles);
			assert(
				removeRevertibles.length === 1,
				0x6c4 /* Remove revertible should be a single delta */,
			);

			const revertible: TypedRevertible<typeof IntervalOpType.POSITION_REMOVE> = {
				event: IntervalOpType.POSITION_REMOVE,
				intervals: [],
				revertibleRefs,
				mergeTreeRevertible: removeRevertibles[0],
			};

			// add an interval for each startInterval, accounting for any corresponding endIntervals
			startIntervals.forEach(({ interval, offset }) => {
				// find any corresponding end for this interval
				const endIntervalIndex = endIntervals.findIndex((end) => {
					return end.interval === interval;
				});
				let endOffset: number | undefined;
				if (endIntervalIndex !== -1) {
					endOffset = endIntervals[endIntervalIndex].offset;
					endIntervals.splice(endIntervalIndex, 1);
				}

				revertible.intervals.push({
					intervalId: interval.getIntervalId(),
					label: interval.properties.referenceRangeLabels[0],
					startOffset: offset,
					endOffset,
				});
			});

			// add any remaining endIntervals that aren't matched with a startInterval
			endIntervals.forEach(({ interval, offset }) => {
				revertible.intervals.push({
					intervalId: interval.getIntervalId(),
					label: interval.properties.referenceRangeLabels[0],
					endOffset: offset,
				});
			});

			revertibles.push(revertible);
			return;
		}
	}

	// Handle any merge tree delta that is not REMOVE or is REMOVE with no interval endpoints
	const mergeTreeRevertibles: MergeTreeDeltaRevertible[] = [];
	// Allow merging MergeTreeDeltaRevertible with previous
	if (revertibles.length > 0 && isMergeTreeDeltaRevertible(revertibles[revertibles.length - 1])) {
		mergeTreeRevertibles.push(revertibles.pop() as MergeTreeDeltaRevertible);
	}
	appendToMergeTreeDeltaRevertibles(delta.deltaArgs, mergeTreeRevertibles);
	revertibles.push(...mergeTreeRevertibles);
}

/**
 * Clean up resources held by revertibles that are no longer needed.
 * @alpha
 */
export function discardSharedStringRevertibles(
	sharedString: SharedString,
	revertibles: SharedStringRevertible[],
) {
	revertibles.forEach((r) => {
		if (isMergeTreeDeltaRevertible(r)) {
			discardMergeTreeDeltaRevertible([r]);
		} else if (r.event === IntervalOpType.CHANGE || r.event === IntervalOpType.DELETE) {
			sharedString.removeLocalReferencePosition(r.start);
			sharedString.removeLocalReferencePosition(r.end);
		}
	});
}

function getSlidePosition(string: SharedString, lref: LocalReferencePosition, pos: number): number {
	const slide = getSlideToSegoff(
		{ segment: lref.getSegment(), offset: undefined },
		lref.slidingPreference,
	);
	return slide?.segment !== undefined &&
		slide.offset !== undefined &&
		string.getPosition(slide.segment) !== -1 &&
		(pos < 0 || pos >= string.getLength())
		? string.getPosition(slide.segment) + slide.offset
		: pos;
}

function isValidRange(start: number, end: number, string: SharedString) {
	return (
		start >= 0 &&
		start < string.getLength() &&
		end >= 0 &&
		end < string.getLength() &&
		start <= end
	);
}

function revertLocalAdd(
	string: SharedString,
	revertible: TypedRevertible<typeof IntervalOpType.ADD>,
) {
	const id = getUpdatedIdFromInterval(revertible.interval);
	const label = revertible.interval.properties.referenceRangeLabels[0];
	string.getIntervalCollection(label).removeIntervalById(id);
}

function revertLocalDelete(
	string: SharedString,
	revertible: TypedRevertible<typeof IntervalOpType.DELETE>,
) {
	const label = revertible.interval.properties.referenceRangeLabels[0];
	const collection = string.getIntervalCollection(label);
	const start = string.localReferencePositionToPosition(revertible.start);
	const startSlidePos = getSlidePosition(string, revertible.start, start);
	const end = string.localReferencePositionToPosition(revertible.end);
	const endSlidePos = getSlidePosition(string, revertible.end, end);
	const type = revertible.interval.intervalType;
	// reusing the id causes eventual consistency bugs, so it is removed here and recreated in add
	const { intervalId, ...props } = revertible.interval.properties;
	if (isValidRange(startSlidePos, endSlidePos, string)) {
		const int = collection.add(startSlidePos, endSlidePos, type, props);

		idMap.forEach((newId, oldId) => {
			if (intervalId === newId) {
				idMap.set(oldId, getUpdatedIdFromInterval(int));
			}
		});
		idMap.set(intervalId, int.getIntervalId());
	}

	string.removeLocalReferencePosition(revertible.start);
	string.removeLocalReferencePosition(revertible.end);
}

function revertLocalChange(
	string: SharedString,
	revertible: TypedRevertible<typeof IntervalOpType.CHANGE>,
) {
	const label = revertible.interval.properties.referenceRangeLabels[0];
	const collection = string.getIntervalCollection(label);
	const id = getUpdatedIdFromInterval(revertible.interval);
	const start = string.localReferencePositionToPosition(revertible.start);
	const startSlidePos = getSlidePosition(string, revertible.start, start);
	const end = string.localReferencePositionToPosition(revertible.end);
	const endSlidePos = getSlidePosition(string, revertible.end, end);
	if (isValidRange(startSlidePos, endSlidePos, string)) {
		collection.change(id, startSlidePos, endSlidePos);
	}

	string.removeLocalReferencePosition(revertible.start);
	string.removeLocalReferencePosition(revertible.end);
}

function revertLocalPropertyChanged(
	string: SharedString,
	revertible: TypedRevertible<typeof IntervalOpType.PROPERTY_CHANGED>,
) {
	const label = revertible.interval.properties.referenceRangeLabels[0];
	const id = getUpdatedIdFromInterval(revertible.interval);
	const newProps = revertible.propertyDeltas;
	string.getIntervalCollection(label).changeProperties(id, newProps);
}

function newPosition(offset: number | undefined, restoredRanges: SortedRangeSet) {
	if (offset === undefined) {
		return undefined;
	}

	let offsetFromSegment = offset;
	for (const rangeInfo of restoredRanges.items) {
		if (offsetFromSegment < rangeInfo.length) {
			// find the segment inside the range
			for (const range of rangeInfo.ranges) {
				if (range.segment.cachedLength > offsetFromSegment) {
					return { segment: range.segment, offset: offsetFromSegment };
				}
				offsetFromSegment -= range.segment.cachedLength;
			}
		}
		offsetFromSegment -= rangeInfo.length;
	}

	return undefined;
}

function newEndpointPosition(
	offset: number | undefined,
	restoredRanges: SortedRangeSet,
	sharedString: SharedString,
) {
	const pos = newPosition(offset, restoredRanges);
	return pos === undefined ? undefined : sharedString.getPosition(pos.segment) + pos.offset;
}

interface RangeInfo {
	ranges: readonly Readonly<ISequenceDeltaRange<MergeTreeDeltaOperationType>>[];
	length: number;
}

class SortedRangeSet extends SortedSet<RangeInfo, string> {
	protected getKey(item: RangeInfo): string {
		return item.ranges[0].segment.ordinal;
	}
}

function revertLocalSequenceRemove(
	sharedString: SharedString,
	revertible: TypedRevertible<typeof IntervalOpType.POSITION_REMOVE>,
) {
	const restoredRanges = new SortedRangeSet();
	const saveSegments = (event: SequenceDeltaEvent) => {
		if (event.ranges.length > 0) {
			let length = 0;
			event.ranges.forEach((range) => {
				length += range.segment.cachedLength;
			});
			restoredRanges.addOrUpdate({ ranges: event.ranges, length });
		}
	};
	sharedString.on("sequenceDelta", saveSegments);
	revertMergeTreeDeltaRevertibles(sharedString, [revertible.mergeTreeRevertible]);
	sharedString.off("sequenceDelta", saveSegments);

	revertible.intervals.forEach((intervalInfo) => {
		const intervalCollection = sharedString.getIntervalCollection(intervalInfo.label);
		const intervalId = getUpdatedId(intervalInfo.intervalId);
		const interval = intervalCollection.getIntervalById(intervalId);
		if (interval !== undefined) {
			const start =
				newEndpointPosition(intervalInfo.startOffset, restoredRanges, sharedString) ??
				sharedString.localReferencePositionToPosition(interval.start);
			const end =
				newEndpointPosition(intervalInfo.endOffset, restoredRanges, sharedString) ??
				sharedString.localReferencePositionToPosition(interval.end);
			if (start <= end) {
				intervalCollection.change(intervalId, start, end);
			}
		}
	});

	// fix up the local references used by delete and change revertibles
	revertible.revertibleRefs.forEach((revertibleRef) => {
		assert(
			revertibleRef.revertible.event === IntervalOpType.CHANGE ||
				revertibleRef.revertible.event === IntervalOpType.DELETE,
			0x6c5 /* revertible is not delete or change */,
		);
		const pos = newPosition(revertibleRef.offset, restoredRanges);
		if (pos !== undefined) {
			if (revertibleRef.isStart) {
				sharedString.removeLocalReferencePosition(revertibleRef.revertible.start);
				const newRef = sharedString.createLocalReferencePosition(
					pos.segment as SharedStringSegment,
					pos.offset,
					ReferenceType.StayOnRemove | ReferenceType.RangeBegin,
					{ revertible: revertibleRef.revertible },
				);
				revertibleRef.revertible.start = newRef;
			} else {
				sharedString.removeLocalReferencePosition(revertibleRef.revertible.end);
				const newRef = sharedString.createLocalReferencePosition(
					pos.segment as SharedStringSegment,
					pos.offset,
					ReferenceType.StayOnRemove | ReferenceType.RangeEnd,
					{ revertible: revertibleRef.revertible },
				);
				revertibleRef.revertible.end = newRef;
			}
		}
	});
}

/**
 * Invoke revertibles to reverse prior edits
 *
 * @alpha
 */
export function revertSharedStringRevertibles(
	sharedString: SharedString,
	revertibles: SharedStringRevertible[],
) {
	while (revertibles.length > 0) {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const r = revertibles.pop()!;
		if ("event" in r) {
			const event = r.event;
			switch (event) {
				case IntervalOpType.ADD:
					revertLocalAdd(sharedString, r);
					break;
				case IntervalOpType.DELETE:
					revertLocalDelete(sharedString, r);
					break;
				case IntervalOpType.CHANGE:
					revertLocalChange(sharedString, r);
					break;
				case IntervalOpType.PROPERTY_CHANGED:
					revertLocalPropertyChanged(sharedString, r);
					break;
				case IntervalOpType.POSITION_REMOVE:
					revertLocalSequenceRemove(sharedString, r);
					break;
				default:
					unreachableCase(event);
			}
		} else {
			revertMergeTreeDeltaRevertibles(sharedString, [r]);
		}
	}
}

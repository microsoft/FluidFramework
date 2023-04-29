/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/common-utils";
import {
	appendToMergeTreeDeltaRevertibles as appendToMergeTreeRevertibles,
	IMergeTreeDeltaCallbackArgs,
	LocalReferencePosition,
	PropertySet,
	MergeTreeDeltaRevertible,
	ReferenceType,
	MergeTreeDeltaType,
	refTypeIncludesFlag,
	revertMergeTreeDeltaRemoveRevertible,
	revertMergeTreeDeltaRevertibles,
	ISegment,
} from "@fluidframework/merge-tree";
import { IntervalCollection, SequenceInterval } from "./intervalCollection";
import { SharedString, SharedStringSegment } from "./sharedString";

export type SharedStringRevertible = MergeTreeDeltaRevertible | IntervalRevertible;

export const IntervalEventType = {
	CHANGE: 0,
	ADD: 1,
	DELETE: 2,
	PROPERTYCHANGED: 3,
	SEQUENCEREMOVE: 4,
} as const;

type IntervalEventType = typeof IntervalEventType[keyof typeof IntervalEventType];

export type IntervalRevertible =
	| {
			event: typeof IntervalEventType.CHANGE;
			interval: SequenceInterval;
			start: LocalReferencePosition;
			end: LocalReferencePosition;
	  }
	| {
			event: typeof IntervalEventType.ADD;
			interval: SequenceInterval;
	  }
	| {
			event: typeof IntervalEventType.DELETE;
			interval: SequenceInterval;
			start: LocalReferencePosition;
			end: LocalReferencePosition;
	  }
	| {
			event: typeof IntervalEventType.PROPERTYCHANGED;
			interval: SequenceInterval;
			propertyDeltas: PropertySet;
	  }
	| {
			event: typeof IntervalEventType.SEQUENCEREMOVE;
			intervals: {
				intervalId: string;
				label: string;
				startSegmentIndex?: number;
				start?: LocalReferencePosition; // ref that forever stays in the old position in removed segment
				startSlide?: LocalReferencePosition; // ref that slides like the unedited start will
				endSegmentIndex?: number;
				end?: LocalReferencePosition;
				endSlide?: LocalReferencePosition;
			}[];
			mergeTreeRevertible: MergeTreeDeltaRevertible;
	  };

type TypedRevertible<T extends IntervalRevertible["event"]> = IntervalRevertible & { event: T };

export function appendLocalAddToRevertibles(
	interval: SequenceInterval,
	revertibles: SharedStringRevertible[],
	collection: IntervalCollection<SequenceInterval>,
) {
	revertibles.push({
		event: IntervalEventType.ADD,
		interval,
	});

	return revertibles;
}

export function appendLocalDeleteToRevertibles(
	string: SharedString,
	interval: SequenceInterval,
	revertibles: SharedStringRevertible[],
) {
	const startSeg = interval.start.getSegment() as SharedStringSegment;
	const endSeg = interval.end.getSegment() as SharedStringSegment;
	const startRef = string.createLocalReferencePosition(
		startSeg,
		interval.start.getOffset(),
		ReferenceType.StayOnRemove,
		startSeg.properties,
	);
	const endRef = string.createLocalReferencePosition(
		endSeg,
		interval.end.getOffset(),
		ReferenceType.StayOnRemove,
		endSeg.properties,
	);
	revertibles.push({
		event: IntervalEventType.DELETE,
		interval,
		start: startRef,
		end: endRef,
	});

	return revertibles;
}

export function appendLocalChangeToRevertibles(
	string: SharedString,
	newInterval: SequenceInterval,
	previousInterval: SequenceInterval,
	revertibles: SharedStringRevertible[],
) {
	// This should not be called if the interval slid because of a string remove

	const startSeg = previousInterval.start.getSegment() as SharedStringSegment;
	const endSeg = previousInterval.end.getSegment() as SharedStringSegment;
	const prevStartRef = string.createLocalReferencePosition(
		startSeg,
		previousInterval.start.getOffset(),
		ReferenceType.StayOnRemove,
		startSeg.properties,
	);
	const prevEndRef = string.createLocalReferencePosition(
		endSeg,
		previousInterval.end.getOffset(),
		ReferenceType.StayOnRemove,
		endSeg.properties,
	);
	revertibles.push({
		event: IntervalEventType.CHANGE,
		interval: newInterval,
		start: prevStartRef,
		end: prevEndRef,
	});

	return revertibles;
}

export function appendLocalPropertyChangedToRevertibles(
	interval: SequenceInterval,
	deltas: PropertySet,
	revertibles: SharedStringRevertible[],
) {
	revertibles.push({
		event: IntervalEventType.PROPERTYCHANGED,
		interval,
		propertyDeltas: deltas,
	});

	return revertibles;
}

function addIfIntervalEndpoint(
	ref: LocalReferencePosition,
	segmentIndex: number,
	startIntervals: { segmentIndex: number; interval: SequenceInterval }[],
	endIntervals: { segmentIndex: number; interval: SequenceInterval }[],
) {
	if (refTypeIncludesFlag(ref.refType, ReferenceType.RangeBegin)) {
		const interval = ref.properties?.interval;
		if (interval && interval instanceof SequenceInterval) {
			startIntervals.push({ segmentIndex, interval });
			return true;
		}
	} else if (refTypeIncludesFlag(ref.refType, ReferenceType.RangeEnd)) {
		const interval = ref.properties?.interval;
		if (interval && interval instanceof SequenceInterval) {
			endIntervals.push({ segmentIndex, interval });
			return true;
		}
	}
	return false;
}

function addLocalRefPlaceholders(string: SharedString, ref: LocalReferencePosition) {
	return {
		stay: string.createLocalReferencePosition(
			ref.getSegment() as SharedStringSegment,
			ref.getOffset(),
			ReferenceType.StayOnRemove,
			undefined,
		),
		slide: string.createLocalReferencePosition(
			ref.getSegment() as SharedStringSegment,
			ref.getOffset(),
			ReferenceType.SlideOnRemove,
			undefined,
		),
	};
}

export function appendToMergeTreeDeltaRevertibles(
	string: SharedString,
	deltaArgs: IMergeTreeDeltaCallbackArgs,
	revertibles: SharedStringRevertible[],
) {
	if (deltaArgs.deltaSegments.length === 0) {
		return;
	}
	if (deltaArgs.operation === MergeTreeDeltaType.REMOVE) {
		const startIntervals: { segmentIndex: number; interval: SequenceInterval }[] = [];
		const endIntervals: { segmentIndex: number; interval: SequenceInterval }[] = [];
		let position: number | undefined;

		// find interval endpoints in each segment
		for (let i = 0; i < deltaArgs.deltaSegments.length; i++) {
			const refs = deltaArgs.deltaSegments[i].segment.localRefs;
			if (refs !== undefined) {
				for (const ref of refs) {
					addIfIntervalEndpoint(ref, i, startIntervals, endIntervals);
				}

				// get current position of deletion to search intervals later
				const segPosition = string.getPosition(deltaArgs.deltaSegments[i].segment);
				if (position === undefined) {
					position = segPosition;
				} else {
					assert(
						position === segPosition,
						"Discontinuous local removals are not supported",
					);
				}
			}
		}

		if (
			position !== undefined &&
			position !== -1 &&
			(startIntervals.length > 0 || endIntervals.length > 0)
		) {
			// make revertible
			if (startIntervals.length > 0 || endIntervals.length > 0) {
				const removeRevertibles: MergeTreeDeltaRevertible[] = [];
				appendToMergeTreeRevertibles(string, deltaArgs, removeRevertibles);
				assert(
					removeRevertibles.length === 1,
					"Remove revertible should be a single delta",
				);

				const revertible: TypedRevertible<typeof IntervalEventType.SEQUENCEREMOVE> = {
					event: IntervalEventType.SEQUENCEREMOVE,
					intervals: [],
					mergeTreeRevertible: removeRevertibles[0],
				};
				// add an interval for each startInterval, accounting for any corresponding endIntervals
				startIntervals.forEach(({ interval, segmentIndex }) => {
					const startPosition = addLocalRefPlaceholders(string, interval.start);

					// find any corresponding end for this interval
					const endIntervalIndex = endIntervals.findIndex((end) => {
						return end.interval === interval;
					});
					let endPosition:
						| { stay: LocalReferencePosition; slide: LocalReferencePosition }
						| undefined;
					let endSegmentIndex: number | undefined;
					if (endIntervalIndex !== -1) {
						endPosition = addLocalRefPlaceholders(string, interval.end);
						endSegmentIndex = endIntervals[endIntervalIndex].segmentIndex;
						endIntervals.splice(endIntervalIndex, 1);
					}
					revertible.intervals.push({
						intervalId: interval.getIntervalId(),
						label: interval.properties.referenceRangeLabels[0],
						start: startPosition.stay,
						startSlide: startPosition.slide,
						startSegmentIndex: segmentIndex,
						end: endPosition?.stay,
						endSlide: endPosition?.slide,
						endSegmentIndex,
					});
				});
				// add any remaining endIntervals that aren't matched with a startInterval
				endIntervals.forEach(({ interval, segmentIndex }) => {
					const endPosition = addLocalRefPlaceholders(string, interval.end);
					revertible.intervals.push({
						intervalId: interval.getIntervalId(),
						label: interval.properties.referenceRangeLabels[0],
						end: endPosition.stay,
						endSlide: endPosition.slide,
						endSegmentIndex: segmentIndex,
					});
				});
				revertibles.push(revertible);
				return;
			}
		}
	}

	// Handle any merge tree delta that is not REMOVE or is REMOVE with no interval endpoints
	const mergeTreeRevertibles: MergeTreeDeltaRevertible[] = [];
	// Allow merging MergeTreeDeltaRevertible with previous
	if (revertibles.length > 0 && "operation" in revertibles[revertibles.length - 1]) {
		mergeTreeRevertibles.push(revertibles.pop() as MergeTreeDeltaRevertible);
	}
	appendToMergeTreeRevertibles(string, deltaArgs, mergeTreeRevertibles);
	revertibles.push(...mergeTreeRevertibles);
}

function revertLocalAdd(
	string: SharedString,
	revertible: TypedRevertible<typeof IntervalEventType.ADD>,
) {
	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	const id = revertible.interval.getIntervalId()!;
	const label = revertible.interval.properties.referenceRangeLabels[0];
	string.getIntervalCollection(label).removeIntervalById(id);
}

function revertLocalDelete(
	string: SharedString,
	revertible: TypedRevertible<typeof IntervalEventType.DELETE>,
) {
	const label = revertible.interval.properties.referenceRangeLabels[0];
	const start = string.localReferencePositionToPosition(revertible.start);
	const end = string.localReferencePositionToPosition(revertible.end);
	const type = revertible.interval.intervalType;
	const props = revertible.interval.properties;
	string.getIntervalCollection(label).add(start, end, type, props);

	string.removeLocalReferencePosition(revertible.start);
	string.removeLocalReferencePosition(revertible.end);
}

function revertLocalChange(
	string: SharedString,
	revertible: TypedRevertible<typeof IntervalEventType.CHANGE>,
) {
	const label = revertible.interval.properties.referenceRangeLabels[0];
	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	const id = revertible.interval.getIntervalId()!;
	const start = string.localReferencePositionToPosition(revertible.start);
	const end = string.localReferencePositionToPosition(revertible.end);
	string.getIntervalCollection(label).change(id, start, end);

	string.removeLocalReferencePosition(revertible.start);
	string.removeLocalReferencePosition(revertible.end);
}

function revertLocalPropertyChanged(
	string: SharedString,
	revertible: TypedRevertible<typeof IntervalEventType.PROPERTYCHANGED>,
) {
	const label = revertible.interval.properties.referenceRangeLabels[0];
	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	const id = revertible.interval.getIntervalId()!;
	const newProps = revertible.propertyDeltas;
	string.getIntervalCollection(label).changeProperties(id, newProps);
}

function newEndpointPosition(
	intervalEndpoint: LocalReferencePosition,
	revertibleStay: LocalReferencePosition | undefined,
	revertibleSlide: LocalReferencePosition | undefined,
	revertibleSegmentIndex: number | undefined,
	restoredSegments: ISegment[],
	string: SharedString,
) {
	if (
		revertibleStay === undefined ||
		revertibleSlide === undefined ||
		revertibleSegmentIndex === undefined ||
		revertibleSegmentIndex >= restoredSegments.length
	) {
		return undefined;
	}

	// if the interval endpoint is not the same place as the revertible stay or slide,
	// it shouldn't revert because it has since moved to a position outside this range
	if (
		!(
			intervalEndpoint.getSegment() === revertibleStay.getSegment() &&
			intervalEndpoint.getOffset() === revertibleStay.getOffset()
		) &&
		!(
			intervalEndpoint.getSegment() === revertibleSlide.getSegment() &&
			intervalEndpoint.getOffset() === revertibleSlide.getOffset()
		)
	) {
		return undefined;
	}

	return (
		string.getPosition(restoredSegments[revertibleSegmentIndex]) + revertibleStay.getOffset()
	);
}

function revertLocalSequenceRemove(
	string: SharedString,
	revertible: TypedRevertible<typeof IntervalEventType.SEQUENCEREMOVE>,
) {
	// revert the merge tree removes first and get the restored segments
	const restoredSegments = revertMergeTreeDeltaRemoveRevertible(
		string,
		revertible.mergeTreeRevertible,
	);

	revertible.intervals.forEach((intervalInfo) => {
		const intervalCollection = string.getIntervalCollection(intervalInfo.label);
		const interval = intervalCollection.getIntervalById(intervalInfo.intervalId);
		if (interval !== undefined && restoredSegments !== undefined) {
			const newStart = newEndpointPosition(
				interval.start,
				intervalInfo.start,
				intervalInfo.startSlide,
				intervalInfo.startSegmentIndex,
				restoredSegments,
				string,
			);
			const newEnd = newEndpointPosition(
				interval.end,
				intervalInfo.end,
				intervalInfo.endSlide,
				intervalInfo.endSegmentIndex,
				restoredSegments,
				string,
			);
			if (newStart !== undefined || newEnd !== undefined) {
				intervalCollection.change(intervalInfo.intervalId, newStart, newEnd);
			}
		}
		if (intervalInfo.start) {
			string.removeLocalReferencePosition(intervalInfo.start);
		}
		if (intervalInfo.startSlide) {
			string.removeLocalReferencePosition(intervalInfo.startSlide);
		}
		if (intervalInfo.end) {
			string.removeLocalReferencePosition(intervalInfo.end);
		}
		if (intervalInfo.endSlide) {
			string.removeLocalReferencePosition(intervalInfo.endSlide);
		}
	});
}

export function revertSharedStringRevertibles(
	string: SharedString,
	revertibles: SharedStringRevertible[],
) {
	while (revertibles.length > 0) {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const r = revertibles.pop()!;
		if ("event" in r) {
			const event = r.event;
			switch (event) {
				case IntervalEventType.ADD:
					revertLocalAdd(string, r);
					break;
				case IntervalEventType.DELETE:
					revertLocalDelete(string, r);
					break;
				case IntervalEventType.CHANGE:
					revertLocalChange(string, r);
					break;
				case IntervalEventType.PROPERTYCHANGED:
					revertLocalPropertyChanged(string, r);
					break;
				case IntervalEventType.SEQUENCEREMOVE:
					revertLocalSequenceRemove(string, r);
					break;
				default:
					unreachableCase(event);
			}
		} else {
			revertMergeTreeDeltaRevertibles(string, [r]);
		}
	}
}

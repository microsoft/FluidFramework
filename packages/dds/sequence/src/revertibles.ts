/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase } from "@fluidframework/common-utils";
import { LocalReferencePosition, PropertySet } from "@fluidframework/merge-tree";
import { IntervalCollection, SequenceInterval } from "./intervalCollection";
import { SharedString } from "./sharedString";

const IntervalEventType = {
	CHANGE: 0,
	ADD: 1,
	DELETE: 2,
	PROPERTYCHANGED: 3,
} as const;

type IntervalEventType = typeof IntervalEventType[keyof typeof IntervalEventType];

type IntervalRevertible =
	| {
			event: typeof IntervalEventType.CHANGE;
			interval: SequenceInterval;
			start: LocalReferencePosition;
			end: LocalReferencePosition;
			collection: IntervalCollection<SequenceInterval>,
	  }
	| {
			event: typeof IntervalEventType.ADD;
			interval: SequenceInterval;
			collection: IntervalCollection<SequenceInterval>,
	  }
	| {
			event: typeof IntervalEventType.DELETE;
			interval: SequenceInterval;
			start: LocalReferencePosition;
			end: LocalReferencePosition;
			collection: IntervalCollection<SequenceInterval>,
	  }

	| {
			event: typeof IntervalEventType.PROPERTYCHANGED;
			interval: SequenceInterval;
			propertyDeltas: PropertySet;
	  };

type TypedRevertible<T extends IntervalRevertible["event"]> =
	IntervalRevertible & {event: T;};

function appendLocalAddToRevertibles(
	interval: SequenceInterval,
	revertibles: IntervalRevertible[],
	collection: IntervalCollection<SequenceInterval>,
) {
	revertibles.push({
		event: IntervalEventType.ADD,
		interval,
		collection,
	});

	return revertibles;
}

function appendLocalDeleteToRevertibles(
	string: SharedString,
	interval: SequenceInterval,
	revertibles: IntervalRevertible[],
	collection: IntervalCollection<SequenceInterval>,
) {
	// TODO: create localReferences to track positions of deleted interval
	revertibles.push({
		event: IntervalEventType.DELETE,
		interval,
		start: startPosition,
		end: endPosition,
		collection,
	});

	return revertibles;
}

function appendLocalChangeToRevertibles(
	string: SharedString,
	newInterval: SequenceInterval,
	previousInterval: SequenceInterval,
	revertibles: IntervalRevertible[],
	collection: IntervalCollection<SequenceInterval>,
) {
	// TODO: create localReferences to track positions of previous interval
	revertibles.push({
		event: IntervalEventType.CHANGE,
		interval: newInterval,
		start: startPosition,
		end: endPosition,
		collection
	});

	return revertibles;
}

function appendLocalPropertyChangedToRevertibles(
	interval: SequenceInterval,
	deltas: PropertySet,
	revertibles: IntervalRevertible[],
) {
	revertibles.push({
		event: IntervalEventType.PROPERTYCHANGED,
		interval,
		propertyDeltas: deltas,
	});

	return revertibles;
}

function revertLocalAdd(
	string: SharedString,
	revertible: TypedRevertible<typeof IntervalEventType.ADD>,
) {
	// TODO: remove added interval
}

function revertLocalDelete(
	string: SharedString,
	revertible: TypedRevertible<typeof IntervalEventType.DELETE>,
) {
	// TODO: add deleted interval
}

function revertLocalChange(
	string: SharedString,
	revertible: TypedRevertible<typeof IntervalEventType.CHANGE>,
) {
	// TODO: remove new interval and restore previous interval
}

function revertLocalPropertyChanged(
	string: SharedString,
	revertible: TypedRevertible<typeof IntervalEventType.PROPERTYCHANGED>,
) {
	// TODO: revert properties
}

function revertIntervalRevertibles(
	string: SharedString,
	revertibles: IntervalRevertible[],
) {
	while (revertibles.length > 0) {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const r = revertibles.pop()!;
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
			default:
				unreachableCase(event);
		}
	}
}

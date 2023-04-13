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
			collection: IntervalCollection<SequenceInterval>;
	  }
	| {
			event: typeof IntervalEventType.ADD;
			interval: SequenceInterval;
			collection: IntervalCollection<SequenceInterval>;
	  }
	| {
			event: typeof IntervalEventType.DELETE;
			interval: SequenceInterval;
			start: LocalReferencePosition;
			end: LocalReferencePosition;
			collection: IntervalCollection<SequenceInterval>;
	  }
	| {
			event: typeof IntervalEventType.PROPERTYCHANGED;
			interval: SequenceInterval;
			propertyDeltas: PropertySet;
	  };

type TypedRevertible<T extends IntervalRevertible["event"]> = IntervalRevertible & { event: T };

export function appendLocalAddToRevertibles(
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

export function appendLocalDeleteToRevertibles(
	string: SharedString,
	interval: SequenceInterval,
	revertibles: IntervalRevertible[],
	collection: IntervalCollection<SequenceInterval>,
) {
	// TODO: create localReferences to track positions of deleted interval
	// just use positions on the interval?
	revertibles.push({
		event: IntervalEventType.DELETE,
		interval,
		start: interval.start,
		end: interval.end,
		collection,
	});

	return revertibles;
}

export function appendLocalChangeToRevertibles(
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
		start: previousInterval.start,
		end: previousInterval.end,
		collection,
	});

	return revertibles;
}

export function appendLocalPropertyChangedToRevertibles(
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
	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	const id = revertible.interval.getIntervalId()!;
	// might be better to assert if id is undefined
	const label = revertible.interval.properties.label;
	// should I use revertible.collection here or access from sharedstring?
	string.getIntervalCollection(label).removeIntervalById(id);
}

function revertLocalDelete(
	string: SharedString,
	revertible: TypedRevertible<typeof IntervalEventType.DELETE>,
) {
	const label = revertible.interval.properties.label;
	const start = string.localReferencePositionToPosition(revertible.start);
	const end = string.localReferencePositionToPosition(revertible.end);
	const type = revertible.interval.intervalType;
	const props = revertible.interval.properties;
	string.getIntervalCollection(label).add(start, end, type, props);
}

function revertLocalChange(
	string: SharedString,
	revertible: TypedRevertible<typeof IntervalEventType.CHANGE>,
) {
	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	const id = revertible.interval.getIntervalId()!;
	// might be better to assert if id is undefined
	const start = string.localReferencePositionToPosition(revertible.start);
	const end = string.localReferencePositionToPosition(revertible.end);

	revertible.collection.change(id, start, end);
}

function revertLocalPropertyChanged(
	string: SharedString,
	revertible: TypedRevertible<typeof IntervalEventType.PROPERTYCHANGED>,
) {
	const label = revertible.interval.properties.label;
	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	const id = revertible.interval.getIntervalId()!;
	// same as above -- assert?
	const newProps = revertible.propertyDeltas;
	string.getIntervalCollection(label).changeProperties(id, newProps);
}

export function revertIntervalRevertibles(string: SharedString, revertibles: IntervalRevertible[]) {
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

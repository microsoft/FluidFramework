/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase } from "@fluidframework/common-utils";
import { LocalReferencePosition, PropertySet } from "@fluidframework/merge-tree";
import { SequenceInterval } from "./intervalCollection";
import { SharedString } from "./sharedString";

const IntervalEventType = {
	CHANGE: 0,
	ADD: 1,
	DELETE: 2,
	PROPERTYCHANGED: 3,
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
	  };

type TypedRevertible<T extends IntervalRevertible["event"]> = IntervalRevertible & { event: T };

export function appendLocalAddToRevertibles(
	interval: SequenceInterval,
	revertibles: IntervalRevertible[],
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
	revertibles: IntervalRevertible[],
) {
	const startRef = interval.start;
	const endRef = interval.end;
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
	revertibles: IntervalRevertible[],
) {
	const prevStartRef = previousInterval.start;
	const prevEndRef = previousInterval.end;
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
	revertibles: IntervalRevertible[],
) {
	revertibles.push({
		event: IntervalEventType.PROPERTYCHANGED,
		interval,
		propertyDeltas: deltas,
	});

	return revertibles;
}
// Uses of referenceRangeLabels will be removed once AB#4081 is completed.
function revertLocalAdd(
	string: SharedString,
	revertible: TypedRevertible<typeof IntervalEventType.ADD>,
) {
	const id = revertible.interval.getIntervalId();
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
}

function revertLocalChange(
	string: SharedString,
	revertible: TypedRevertible<typeof IntervalEventType.CHANGE>,
) {
	const label = revertible.interval.properties.referenceRangeLabels[0];
	const id = revertible.interval.getIntervalId();
	const start = string.localReferencePositionToPosition(revertible.start);
	const end = string.localReferencePositionToPosition(revertible.end);

	string.getIntervalCollection(label).change(id, start, end);
}

function revertLocalPropertyChanged(
	string: SharedString,
	revertible: TypedRevertible<typeof IntervalEventType.PROPERTYCHANGED>,
) {
	const label = revertible.interval.properties.referenceRangeLabels[0];
	const id = revertible.interval.getIntervalId();
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

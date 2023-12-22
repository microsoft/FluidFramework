/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { MockContainerRuntimeForReconnection } from "@fluidframework/test-runtime-utils";
import { SharedString } from "../sharedString";
import { IIntervalCollection } from "../intervalCollection";
import { SequenceInterval } from "../intervals";
import { createOverlappingIntervalsIndex } from "../intervalIndex";

export interface Client {
	sharedString: SharedString;
	containerRuntime: MockContainerRuntimeForReconnection;
}

/**
 * Validates that all shared strings in the provided array are consistent in the underlying text
 * and location of all intervals in any interval collections they have.
 * */
export function assertConsistent(clients: Client[]): void {
	const connectedClients = clients.filter((client) => client.containerRuntime.connected);
	if (connectedClients.length < 2) {
		// No two strings are expected to be consistent.
		return;
	}
	const first = connectedClients[0].sharedString;
	for (const { sharedString: other } of connectedClients.slice(1)) {
		assertEquivalentSharedStrings(first, other);
	}
}

export function assertEquivalentSharedStrings(a: SharedString, b: SharedString) {
	assert.equal(a.getText(), b.getText(), `Non-equal text between strings ${a.id} and ${b.id}.`);
	assert.equal(a.getLength(), b.getLength());
	const firstLabels = Array.from(a.getIntervalCollectionLabels()).sort();
	const otherLabels = Array.from(b.getIntervalCollectionLabels()).sort();
	assert.deepEqual(
		firstLabels,
		otherLabels,
		`Different interval collections found between ${a.id} and ${b.id}.`,
	);
	for (let i = 0; i < firstLabels.length; i++) {
		const collection1 = a.getIntervalCollection(firstLabels[i]);
		const collection2 = b.getIntervalCollection(otherLabels[i]);
		const intervals1 = Array.from(collection1);
		const intervals2 = Array.from(collection2);
		assert.equal(
			intervals1.length,
			intervals2.length,
			`Different number of intervals found in ${a.id} and ${b.id}` +
				` at collection ${firstLabels[i]}`,
		);
		for (const interval of intervals1) {
			assert(interval);
			const intervalId = interval.getIntervalId();
			assert(intervalId);
			const otherInterval = collection2.getIntervalById(intervalId);
			assert(otherInterval);
			assert.equal(
				interval.startSide,
				otherInterval.startSide,
				"interval start side not equal",
			);
			assert.equal(interval.endSide, otherInterval.endSide, "interval end side not equal");
			assert.equal(
				interval.stickiness,
				otherInterval.stickiness,
				"interval stickiness not equal",
			);
			assert.equal(
				interval.start.slidingPreference,
				otherInterval.start.slidingPreference,
				"start sliding preference not equal",
			);
			assert.equal(
				interval.end.slidingPreference,
				otherInterval.end.slidingPreference,
				"end sliding preference not equal",
			);
			const firstStart = a.localReferencePositionToPosition(interval.start);
			const otherStart = b.localReferencePositionToPosition(otherInterval.start);
			assert.equal(
				firstStart,
				otherStart,
				`Startpoints of interval ${intervalId} different:\n` +
					`\tfull text:${a.getText()}\n` +
					`\tclient ${a.id} char:${a.getText(firstStart, firstStart + 1)}\n` +
					`\tclient ${b.id} char:${b.getText(otherStart, otherStart + 1)}`,
			);
			const firstEnd = a.localReferencePositionToPosition(interval.end);
			const otherEnd = b.localReferencePositionToPosition(otherInterval.end);
			assert.equal(
				firstEnd,
				otherEnd,
				`Endpoints of interval ${intervalId} different:\n` +
					`\tfull text:${a.getText()}\n` +
					`\tclient ${a.id} char:${a.getText(firstEnd, firstEnd + 1)}\n` +
					`\tclient ${b.id} char:${b.getText(otherEnd, otherEnd + 1)}`,
			);
			assert.equal(interval.intervalType, otherInterval.intervalType);
			assert.deepEqual(interval.properties, otherInterval.properties);
		}
	}
}

export const assertSequenceIntervals = (
	sharedString: SharedString,
	intervalCollection: IIntervalCollection<SequenceInterval>,
	expected: readonly { start: number; end: number }[],
	validateOverlapping: boolean = true,
) => {
	const actual = Array.from(intervalCollection);
	if (validateOverlapping && sharedString.getLength() > 0) {
		const overlappingIntervalsIndex = createOverlappingIntervalsIndex(sharedString);
		intervalCollection.attachIndex(overlappingIntervalsIndex);
		const overlapping = overlappingIntervalsIndex.findOverlappingIntervals(
			0,
			sharedString.getLength() - 1,
		);
		assert.deepEqual(actual, overlapping, "Interval search returned inconsistent results");
		intervalCollection.detachIndex(overlappingIntervalsIndex);
	}
	assert.strictEqual(
		actual.length,
		expected.length,
		`findOverlappingIntervals() must return the expected number of intervals`,
	);

	const actualPos = actual.map((interval) => {
		assert(interval);
		const start = sharedString.localReferencePositionToPosition(interval.start);
		const end = sharedString.localReferencePositionToPosition(interval.end);
		return { start, end };
	});
	assert.deepEqual(actualPos, expected, "intervals are not as expected");
};

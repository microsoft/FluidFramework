/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
	MockContainerRuntimeFactory,
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils";
import {
	appendToMergeTreeDeltaRevertibles,
	MergeTreeDeltaRevertible,
	revertMergeTreeDeltaRevertibles,
} from "@fluidframework/merge-tree";
import { SharedString } from "../sharedString";
import { IntervalCollection, IntervalType, SequenceInterval } from "../intervalCollection";
import { SharedStringFactory } from "../sequenceFactory";

const assertIntervals = (
	sharedString: SharedString,
	intervalCollection: IntervalCollection<SequenceInterval>,
	expected: readonly { start: number; end: number }[],
	validateOverlapping: boolean = true,
) => {
	const actual = Array.from(intervalCollection);
	if (validateOverlapping && sharedString.getLength() > 0) {
		const overlapping = intervalCollection.findOverlappingIntervals(
			0,
			sharedString.getLength() - 1,
		);
		assert.deepEqual(actual, overlapping, "Interval search returned inconsistent results");
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

function assertIntervalEquals(
	string: SharedString,
	interval: SequenceInterval | undefined,
	endpoints: { start: number; end: number },
): void {
	assert(interval);
	assert.equal(
		string.localReferencePositionToPosition(interval.start),
		endpoints.start,
		"mismatched start",
	);
	assert.equal(
		string.localReferencePositionToPosition(interval.end),
		endpoints.end,
		"mismatched end",
	);
}

describe("Undo/redo for interval collection operations", () => {
	let sharedString: SharedString;
	let dataStoreRuntime1: MockFluidDataStoreRuntime;
	// not sure if i need the factory if im only using one sharedstring
	let containerRuntimeFactory: MockContainerRuntimeFactory;
	let collection: IntervalCollection<SequenceInterval>;
	let revertibles: MergeTreeDeltaRevertible[];

	beforeEach(() => {
		dataStoreRuntime1 = new MockFluidDataStoreRuntime({ clientId: "1" });
		sharedString = new SharedString(
			dataStoreRuntime1,
			"shared-string-1",
			SharedStringFactory.Attributes,
		);

		// unclear if this is needed
		containerRuntimeFactory = new MockContainerRuntimeFactory();

		// Connect the first SharedString.
		dataStoreRuntime1.local = false;
		const containerRuntime1 = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime1);
		const services1 = {
			deltaConnection: containerRuntime1.createDeltaConnection(),
			objectStorage: new MockStorage(),
		};
		sharedString.initializeLocal();
		sharedString.connect(services1);
		collection = sharedString.getIntervalCollection("test");
		revertibles = [];
	});

	it("has an interval contained within the deleted range", () => {
		sharedString.insertText(0, "hello world, this is me");

		sharedString.on("sequenceDelta", (op) => {
			appendToMergeTreeDeltaRevertibles(sharedString, op.deltaArgs, revertibles);
		});

		collection.add(6, 11, IntervalType.SlideOnRemove);

		sharedString.removeRange(5, 11);

		revertMergeTreeDeltaRevertibles(sharedString, revertibles.splice(0));

		assert.equal(sharedString.getText(), "hello world, this is me");
		assertIntervals(sharedString, collection, [{ start: 6, end: 11 }]);
	});
	it("has an interval with the same range as the deleted text", () => {
		sharedString.insertText(0, "hello world, this is me");

		sharedString.on("sequenceDelta", (op) => {
			appendToMergeTreeDeltaRevertibles(sharedString, op.deltaArgs, revertibles);
		});

		collection.add(0, 12, IntervalType.SlideOnRemove);

		sharedString.removeRange(0, 13);

		revertMergeTreeDeltaRevertibles(sharedString, revertibles.splice(0));

		assert.equal(sharedString.getText(), "hello world, this is me");
		assertIntervals(sharedString, collection, [{ start: 0, end: 13 }]);
	});
	it("has an interval starting point within the deleted range", () => {
		sharedString.insertText(0, "hello world, this is me");

		sharedString.on("sequenceDelta", (op) => {
			appendToMergeTreeDeltaRevertibles(sharedString, op.deltaArgs, revertibles);
		});

		collection.add(8, 16, IntervalType.SlideOnRemove);

		sharedString.removeRange(5, 11);

		revertMergeTreeDeltaRevertibles(sharedString, revertibles.splice(0));

		assert.equal(sharedString.getText(), "hello world, this is me");
		assertIntervals(sharedString, collection, [{ start: 8, end: 16 }]);
	});
	it("has an interval ending point within the deleted range", () => {
		sharedString.insertText(0, "hello world, this is me");

		sharedString.on("sequenceDelta", (op) => {
			appendToMergeTreeDeltaRevertibles(sharedString, op.deltaArgs, revertibles);
		});

		collection.add(2, 8, IntervalType.SlideOnRemove);

		sharedString.removeRange(5, 11);

		revertMergeTreeDeltaRevertibles(sharedString, revertibles.splice(0));

		assert.equal(sharedString.getText(), "hello world, this is me");
		assertIntervals(sharedString, collection, [{ start: 2, end: 8 }]);
	});
});

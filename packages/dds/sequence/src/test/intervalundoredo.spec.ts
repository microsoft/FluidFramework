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
/* import {
	appendToMergeTreeDeltaRevertibles,
	MergeTreeDeltaRevertible,
	// ReferenceType,
	revertMergeTreeDeltaRevertibles,
} from "@fluidframework/merge-tree"; */
import { SharedString } from "../sharedString";
import { IntervalCollection, IntervalType, SequenceInterval } from "../intervalCollection";
import { SharedStringFactory } from "../sequenceFactory";
import {
	appendToMergeTreeDeltaRevertibles,
	revertSharedStringRevertibles,
	SharedStringRevertible,
} from "../revertibles";

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

// The code being tested currently does the wrong behavior. Currently,
// the tests validate the bug and should be updated when the implementation
// is fixed.
describe.only("Undo/redo for interval collection operations", () => {
	let sharedString: SharedString;
	let dataStoreRuntime1: MockFluidDataStoreRuntime;
	let containerRuntimeFactory: MockContainerRuntimeFactory;
	let collection: IntervalCollection<SequenceInterval>;
	let revertibles: SharedStringRevertible[];

	beforeEach(() => {
		dataStoreRuntime1 = new MockFluidDataStoreRuntime({ clientId: "1" });
		sharedString = new SharedString(
			dataStoreRuntime1,
			"shared-string-1",
			SharedStringFactory.Attributes,
		);

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

	describe("with remote ops", () => {
		let sharedString2: SharedString;

		beforeEach(() => {
			const dataStoreRuntime2 = new MockFluidDataStoreRuntime({ clientId: "2" });
			const containerRuntime2 =
				containerRuntimeFactory.createContainerRuntime(dataStoreRuntime2);
			const services2 = {
				deltaConnection: containerRuntime2.createDeltaConnection(),
				objectStorage: new MockStorage(),
			};

			sharedString2 = new SharedString(
				dataStoreRuntime2,
				"shared-string-2",
				SharedStringFactory.Attributes,
			);
			sharedString2.initializeLocal();
			sharedString2.connect(services2);
		});

		it("handles remote remove of same range", () => {
			sharedString.insertText(0, "hello world");

			sharedString.on("sequenceDelta", (op) => {
				if (op.opArgs.sequencedMessage === undefined) {
					appendToMergeTreeDeltaRevertibles(sharedString, op.deltaArgs, revertibles);
				}
			});

			collection.add(2, 4, IntervalType.SlideOnRemove);
			containerRuntimeFactory.processAllMessages();

			sharedString2.removeRange(0, 6);
			sharedString.removeRange(0, 6);
			assert.equal(sharedString.getText(), "world");
			assert.equal(sharedString2.getText(), "world");
			containerRuntimeFactory.processAllMessages();

			assert.equal(revertibles.length, 1, "revertibles.length is not 1");
			revertSharedStringRevertibles(sharedString, revertibles.splice(0));

			assert.equal(sharedString.getText(), "hello world");
			assertIntervals(sharedString, collection, [{ start: 2, end: 4 }]);
		});
		it("handles remote interval move", () => {
			sharedString.insertText(0, "hello world");

			sharedString.on("sequenceDelta", (op) => {
				if (op.opArgs.sequencedMessage === undefined) {
					appendToMergeTreeDeltaRevertibles(sharedString, op.deltaArgs, revertibles);
				}
			});

			const interval = collection.add(2, 4, IntervalType.SlideOnRemove);
			containerRuntimeFactory.processAllMessages();

			sharedString.removeRange(0, 6);
			sharedString2.getIntervalCollection("test").change(interval.getIntervalId(), 3, 8);
			containerRuntimeFactory.processAllMessages();

			assert.equal(revertibles.length, 1, "revertibles.length is not 1");
			revertSharedStringRevertibles(sharedString, revertibles.splice(0));

			assert.equal(sharedString.getText(), "hello world");
			// start moved within deleted range is restored, end moved outside is not
			assertIntervals(sharedString, collection, [{ start: 2, end: 8 }]);
		});
		it("handles remote interval delete", () => {
			sharedString.insertText(0, "hello world");

			sharedString.on("sequenceDelta", (op) => {
				if (op.opArgs.sequencedMessage === undefined) {
					appendToMergeTreeDeltaRevertibles(sharedString, op.deltaArgs, revertibles);
				}
			});

			const interval = collection.add(2, 4, IntervalType.SlideOnRemove);
			containerRuntimeFactory.processAllMessages();

			sharedString.removeRange(0, 6);
			sharedString2
				.getIntervalCollection("test")
				.removeIntervalById(interval.getIntervalId());
			containerRuntimeFactory.processAllMessages();

			assert.equal(revertibles.length, 1, "revertibles.length is not 1");
			revertSharedStringRevertibles(sharedString, revertibles.splice(0));

			assert.equal(sharedString.getText(), "hello world");
			assert.equal(collection.getIntervalById(interval.getIntervalId()), undefined);
		});
		it("handles remote remove of following range causing further slide", () => {
			sharedString.insertText(0, "hello world");

			sharedString.on("sequenceDelta", (op) => {
				if (op.opArgs.sequencedMessage === undefined) {
					appendToMergeTreeDeltaRevertibles(sharedString, op.deltaArgs, revertibles);
				}
			});

			collection.add(2, 4, IntervalType.SlideOnRemove);
			containerRuntimeFactory.processAllMessages();

			sharedString.removeRange(0, 6);
			sharedString2.removeRange(5, 8);
			assert.equal(sharedString.getText(), "world");
			assert.equal(sharedString2.getText(), "hellorld");
			containerRuntimeFactory.processAllMessages();
			assert.equal(sharedString.getText(), "rld");
			assert.equal(sharedString2.getText(), "rld");

			assert.equal(revertibles.length, 1, "revertibles.length is not 1");
			revertSharedStringRevertibles(sharedString, revertibles.splice(0));

			assert.equal(sharedString.getText(), "hello rld");
			assertIntervals(sharedString, collection, [{ start: 2, end: 4 }]);
		});
		it("ignores remote interval move of never contained endpoint", () => {
			sharedString.insertText(0, "hello world");

			sharedString.on("sequenceDelta", (op) => {
				if (op.opArgs.sequencedMessage === undefined) {
					appendToMergeTreeDeltaRevertibles(sharedString, op.deltaArgs, revertibles);
				}
			});

			const interval = collection.add(2, 8, IntervalType.SlideOnRemove);
			containerRuntimeFactory.processAllMessages();

			sharedString2
				.getIntervalCollection("test")
				.change(interval.getIntervalId(), undefined, 9);
			sharedString.removeRange(0, 6);
			containerRuntimeFactory.processAllMessages();

			assert.equal(revertibles.length, 1, "revertibles.length is not 1");
			revertSharedStringRevertibles(sharedString, revertibles.splice(0));

			assert.equal(sharedString.getText(), "hello world");
			assertIntervals(sharedString, collection, [{ start: 2, end: 9 }]);
		});
	});

	it("has an interval contained within the deleted range", () => {
		sharedString.insertText(0, "hello world");

		sharedString.on("sequenceDelta", (op) => {
			appendToMergeTreeDeltaRevertibles(sharedString, op.deltaArgs, revertibles);
		});

		const interval = collection.add(2, 4, IntervalType.SlideOnRemove);

		sharedString.removeRange(0, 6);

		const actualStart = sharedString.localReferencePositionToPosition(interval.start);
		const actualEnd = sharedString.localReferencePositionToPosition(interval.end);
		assert.equal(actualStart, 0, `actualStart is ${actualStart}`);
		assert.equal(actualEnd, 0, `actualEnd is ${actualEnd}`);

		assert.equal(revertibles.length, 1, "revertibles.length is not 1");
		revertSharedStringRevertibles(sharedString, revertibles.splice(0));

		assert.equal(sharedString.getText(), "hello world");
		assertIntervals(sharedString, collection, [{ /* start: 6, end: 6 */ start: 2, end: 4 }]);
		assert.equal(
			interval.start.getOffset(),
			2,
			`after remove start.getOffset() is ${interval.start.getOffset()}`,
		);
		assert.equal(
			interval.end.getOffset(),
			4,
			`after remove start.getOffset() is ${interval.end.getOffset()}`,
		);
	});
	it("has an interval with endpoints at the deleted range", () => {
		sharedString.insertText(0, "hello world");

		sharedString.on("sequenceDelta", (op) => {
			appendToMergeTreeDeltaRevertibles(sharedString, op.deltaArgs, revertibles);
		});

		collection.add(0, 6, IntervalType.SlideOnRemove);

		sharedString.removeRange(0, 6);

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));

		assert.equal(sharedString.getText(), "hello world");
		assertIntervals(sharedString, collection, [{ /* start: 6, end: 6 */ start: 0, end: 6 }]);
	});
	it("has an interval with one endpoint within the deleted range", () => {
		sharedString.insertText(0, "hello world");

		sharedString.on("sequenceDelta", (op) => {
			appendToMergeTreeDeltaRevertibles(sharedString, op.deltaArgs, revertibles);
		});

		collection.add(5, 9, IntervalType.SlideOnRemove);

		sharedString.removeRange(2, 7);

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));

		assert.equal(sharedString.getText(), "hello world");
		assertIntervals(sharedString, collection, [{ start: 5, /* start: 7, */ end: 9 }]);
	});
	it("restores an interval after two removes", () => {
		sharedString.insertText(0, "hello world");

		sharedString.on("sequenceDelta", (op) => {
			appendToMergeTreeDeltaRevertibles(sharedString, op.deltaArgs, revertibles);
		});

		collection.add(3, 6, IntervalType.SlideOnRemove);

		// only one revertible object generated for both removes
		sharedString.removeRange(1, 4);
		sharedString.removeRange(3, 6);

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));

		assert.equal(sharedString.getText(), "hello world");
		assertIntervals(sharedString, collection, [{ /* start: 4, end: 9 */ start: 3, end: 6 }]);
	});
	it("reverts an ack'ed remove", () => {
		sharedString.insertText(0, "hello world");

		sharedString.on("sequenceDelta", (op) => {
			if (op.opArgs.sequencedMessage === undefined) {
				appendToMergeTreeDeltaRevertibles(sharedString, op.deltaArgs, revertibles);
			}
		});

		collection.add(5, 9, IntervalType.SlideOnRemove);

		sharedString.removeRange(2, 7);
		containerRuntimeFactory.processAllMessages();

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));

		assert.equal(sharedString.getText(), "hello world");
		assertIntervals(sharedString, collection, [{ start: 5, /* start: 7, */ end: 9 }]);
	});
	it("has multiple interval endpoints within the deleted range", () => {
		sharedString.insertText(0, "hello world");

		sharedString.on("sequenceDelta", (op) => {
			appendToMergeTreeDeltaRevertibles(sharedString, op.deltaArgs, revertibles);
		});

		collection.add(5, 9, IntervalType.SlideOnRemove);
		collection.add(0, 3, IntervalType.SlideOnRemove);
		collection.add(3, 4, IntervalType.SlideOnRemove);

		sharedString.removeRange(2, 7);

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));

		assert.equal(sharedString.getText(), "hello world");
		assertIntervals(sharedString, collection, [
			{ start: 0, end: 3 },
			{ start: 3, end: 4 },
			{ start: 5, end: 9 },
		]);
	});
	it("has an interval across two segments in the deleted range", () => {
		sharedString.insertText(0, "world");
		sharedString.insertText(0, "hello ");

		sharedString.on("sequenceDelta", (op) => {
			appendToMergeTreeDeltaRevertibles(sharedString, op.deltaArgs, revertibles);
		});

		collection.add(3, 7, IntervalType.SlideOnRemove);

		sharedString.removeRange(2, 8);

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));

		assert.equal(sharedString.getText(), "hello world");
		assertIntervals(sharedString, collection, [{ start: 3, end: 7 }]);
	});
	it("has multiple intervals across two segments in the deleted range", () => {
		sharedString.insertText(0, "world");
		sharedString.insertText(0, "hello ");

		sharedString.on("sequenceDelta", (op) => {
			appendToMergeTreeDeltaRevertibles(sharedString, op.deltaArgs, revertibles);
		});

		collection.add(3, 7, IntervalType.SlideOnRemove);
		collection.add(0, 6, IntervalType.SlideOnRemove);

		sharedString.removeRange(2, 8);

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));

		assert.equal(sharedString.getText(), "hello world");
		assertIntervals(sharedString, collection, [
			{ start: 0, end: 6 },
			{ start: 3, end: 7 },
		]);
	});
});

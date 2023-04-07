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
import { assertIntervals } from "./intervalUtils";

describe("Undo/redo for interval collection operations", () => {
	let sharedString: SharedString;
	let dataStoreRuntime1: MockFluidDataStoreRuntime;
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
		sharedString.insertText(0, "hello world");

		sharedString.on("sequenceDelta", (op) => {
			appendToMergeTreeDeltaRevertibles(sharedString, op.deltaArgs, revertibles);
		});

		collection.add(2, 4, IntervalType.SlideOnRemove);

		sharedString.removeRange(0, 6);

		revertMergeTreeDeltaRevertibles(sharedString, revertibles.splice(0));

		assert.equal(sharedString.getText(), "hello world");
		assertIntervals(sharedString, collection, [{ start: 6, end: 6 /* start: 2, end: 4 */ }]);
	});
	it("has an interval with the same range as the deleted text", () => {
		sharedString.insertText(0, "hello world");

		sharedString.on("sequenceDelta", (op) => {
			appendToMergeTreeDeltaRevertibles(sharedString, op.deltaArgs, revertibles);
		});

		collection.add(0, 5, IntervalType.SlideOnRemove);

		sharedString.removeRange(0, 6);

		revertMergeTreeDeltaRevertibles(sharedString, revertibles.splice(0));

		assert.equal(sharedString.getText(), "hello world");
		assertIntervals(sharedString, collection, [{ start: 6, end: 6 /* start: 0, end: 5 */ }]);
	});
	it("has an interval starting point within the deleted range", () => {
		sharedString.insertText(0, "hello world");

		sharedString.on("sequenceDelta", (op) => {
			appendToMergeTreeDeltaRevertibles(sharedString, op.deltaArgs, revertibles);
		});

		collection.add(5, 9, IntervalType.SlideOnRemove);

		sharedString.removeRange(2, 7);

		revertMergeTreeDeltaRevertibles(sharedString, revertibles.splice(0));

		assert.equal(sharedString.getText(), "hello world");
		assertIntervals(sharedString, collection, [{ /* start: 5 */ start: 7, end: 9 }]);
	});
	it("has an interval ending point within the deleted range", () => {
		sharedString.insertText(0, "hello world");

		sharedString.on("sequenceDelta", (op) => {
			appendToMergeTreeDeltaRevertibles(sharedString, op.deltaArgs, revertibles);
		});

		collection.add(0, 4, IntervalType.SlideOnRemove);

		sharedString.removeRange(2, 7);

		revertMergeTreeDeltaRevertibles(sharedString, revertibles.splice(0));

		assert.equal(sharedString.getText(), "hello world");
		assertIntervals(sharedString, collection, [{ start: 0, end: 7 /* end: 4 */ }]);
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

		revertMergeTreeDeltaRevertibles(sharedString, revertibles.splice(0));

		assert.equal(sharedString.getText(), "hello world");
		assertIntervals(sharedString, collection, [{ start: 4, end: 9 /* start: 3, end: 6 */ }]);
	});
});

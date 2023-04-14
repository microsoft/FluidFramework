/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";
import {
	appendLocalAddToRevertibles,
	appendLocalChangeToRevertibles,
	appendLocalDeleteToRevertibles,
	appendLocalPropertyChangedToRevertibles,
	IntervalRevertible,
	revertIntervalRevertibles,
} from "../revertibles";
import { SharedString } from "../sharedString";
import { IntervalCollection, IntervalType, SequenceInterval } from "../intervalCollection";
import { SharedStringFactory } from "../sequenceFactory";
import { assertIntervals } from "./intervalUtils";

describe.only("Sequence.Revertibles", () => {
	let sharedString: SharedString;
	let dataStoreRuntime1: MockFluidDataStoreRuntime;
	let collection: IntervalCollection<SequenceInterval>;
	let revertibles: IntervalRevertible[];
	const stringFactory = new SharedStringFactory();

	beforeEach(() => {
		dataStoreRuntime1 = new MockFluidDataStoreRuntime({ clientId: "1" });
		dataStoreRuntime1.local = true;
		sharedString = stringFactory.create(dataStoreRuntime1, "shared-string-1");
		collection = sharedString.getIntervalCollection("test");
		revertibles = [];
	});

	it("revert direct interval insert", () => {
		/* how the test should work:
		- make a sharedstring to put intervals on (driver)
		- add an interval to the collection, and append the add to the revertible array 
		- call revert insert
		- validate that intervals are the same as they were before 
		*/
		collection.on("addInterval", (interval, local, op) => {
			appendLocalAddToRevertibles(interval, revertibles);
		});

		sharedString.insertText(0, "hello world");
		collection.add(0, 5, IntervalType.Simple);

		revertIntervalRevertibles(sharedString, revertibles.splice(0));
		assertIntervals(sharedString, collection, []);
	});
	it("revert direct interval remove", () => {
		collection.on("deleteInterval", (interval, local, op) => {
			appendLocalDeleteToRevertibles(sharedString, interval, revertibles);
		});

		sharedString.insertText(0, "hello world");
		const id = collection.add(0, 5, IntervalType.Simple).getIntervalId();
		collection.removeIntervalById(id);

		revertIntervalRevertibles(sharedString, revertibles.splice(0));
		assertIntervals(sharedString, collection, [{ start: 0, end: 5 }]);
	});
	it("revert direct interval change", () => {
		collection.on("changeInterval", (interval, previousInterval, local, op) => {
			appendLocalChangeToRevertibles(sharedString, interval, previousInterval, revertibles);
			console.log(`${revertibles.length}`);
		});

		sharedString.insertText(0, "hello world");
		const id = collection.add(0, 5, IntervalType.Simple).getIntervalId();
		collection.change(id, 1, 6);

		revertIntervalRevertibles(sharedString, revertibles.splice(0));
		assertIntervals(sharedString, collection, [{ start: 0, end: 5 }]);
	});
	it("revert direct interval property change", () => {
		collection.on("propertyChanged", (interval, propertyDeltas, local, op) => {
			appendLocalPropertyChangedToRevertibles(interval, propertyDeltas, revertibles);
		});

		sharedString.insertText(0, "hello world");
		const id = collection.add(0, 5, IntervalType.Simple, { foo: "one" }).getIntervalId();
		collection.changeProperties(id, { foo: "two" });

		revertIntervalRevertibles(sharedString, revertibles.splice(0));
		assertIntervals(sharedString, collection, [{ start: 0, end: 5 }]);
		const int = collection.getIntervalById(id);
		assert.strictEqual(int?.properties.foo, "one");
	});
	// TODO: add tests for remote edits to sharedstring over the interval range
});

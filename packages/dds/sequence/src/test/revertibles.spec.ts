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

describe("Sequence.Revertibles with Local Edits", () => {
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
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const id = collection.add(0, 5, IntervalType.Simple).getIntervalId()!;
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
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const id = collection.add(0, 5, IntervalType.Simple).getIntervalId()!;
		collection.change(id, 1, 6);

		revertIntervalRevertibles(sharedString, revertibles.splice(0));
		assertIntervals(sharedString, collection, [{ start: 0, end: 5 }]);
	});
	it("revert direct interval property change", () => {
		collection.on("propertyChanged", (interval, propertyDeltas, local, op) => {
			appendLocalPropertyChangedToRevertibles(interval, propertyDeltas, revertibles);
		});

		sharedString.insertText(0, "hello world");
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const id = collection.add(0, 5, IntervalType.Simple, { foo: "one" }).getIntervalId()!;
		collection.changeProperties(id, { foo: "two" });

		revertIntervalRevertibles(sharedString, revertibles.splice(0));
		assertIntervals(sharedString, collection, [{ start: 0, end: 5 }]);
		const int = collection.getIntervalById(id);
		assert.equal(int?.properties.foo, "one");
	});
});
describe("Sequence.Revertibles with Remote Edits", () => {
	let sharedString: SharedString;
	let dataStoreRuntime1: MockFluidDataStoreRuntime;
	let collection: IntervalCollection<SequenceInterval>;
	let revertibles: IntervalRevertible[];

	let sharedString2: SharedString;
	let containerRuntimeFactory: MockContainerRuntimeFactory;

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

		// Create and connect a second SharedString.
		const dataStoreRuntime2 = new MockFluidDataStoreRuntime({ clientId: "2" });
		const containerRuntime2 = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime2);
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

		revertibles = [];
		collection = sharedString.getIntervalCollection("test");
	});
	it("remote delete interacting with reverting an interval remove", () => {
		collection.on("deleteInterval", (interval, local, op) => {
			appendLocalDeleteToRevertibles(sharedString, interval, revertibles);
		});
		sharedString.insertText(0, "hello world");
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const id = collection.add(0, 5, IntervalType.Simple).getIntervalId()!;
		collection.removeIntervalById(id);
		containerRuntimeFactory.processAllMessages();

		sharedString2.removeRange(1, 3);
		containerRuntimeFactory.processAllMessages();

		revertIntervalRevertibles(sharedString, revertibles.splice(0));
		containerRuntimeFactory.processAllMessages();

		assert.equal(sharedString.getText(), sharedString2.getText());
		// These endpoints will be updated when interval sliding is fixed.
		assertIntervals(sharedString, collection, [{ start: 0, end: 3 /* end: 5 */ }]);
		assertIntervals(sharedString2, collection, [{ start: 0, end: 3 /* end: 5 */ }]);
	});
	it("remote add interacting with reverting an interval delete", () => {
		collection.on("deleteInterval", (interval, local, op) => {
			appendLocalDeleteToRevertibles(sharedString, interval, revertibles);
		});
		sharedString.insertText(0, "hello world");
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const id = collection.add(0, 7, IntervalType.Simple).getIntervalId()!;
		containerRuntimeFactory.processAllMessages();

		sharedString2.insertText(5, " hi");
		collection.removeIntervalById(id);
		containerRuntimeFactory.processAllMessages();

		revertIntervalRevertibles(sharedString, revertibles.splice(0));
		containerRuntimeFactory.processAllMessages();

		assert.equal(sharedString.getText(), sharedString2.getText());
		assertIntervals(sharedString, collection, [{ start: 0, end: 10 }]);
	});
});

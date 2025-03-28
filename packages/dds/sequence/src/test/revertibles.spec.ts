/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { AttachState } from "@fluidframework/container-definitions";
import { Side } from "@fluidframework/merge-tree/internal";
import {
	MockContainerRuntimeFactory,
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils/internal";

import { IIntervalCollection } from "../intervalCollection.js";
import { IntervalStickiness, SequenceInterval } from "../intervals/index.js";
import {
	SharedStringRevertible,
	appendAddIntervalToRevertibles,
	appendChangeIntervalToRevertibles,
	appendDeleteIntervalToRevertibles,
	appendIntervalPropertyChangedToRevertibles,
	appendSharedStringDeltaToRevertibles,
	revertSharedStringRevertibles,
} from "../revertibles.js";
import { SharedStringFactory, type SharedString } from "../sequenceFactory.js";
import { SharedStringClass } from "../sharedString.js";

import { assertSequenceIntervals } from "./intervalTestUtils.js";

describe("Sequence.Revertibles with Local Edits", () => {
	let sharedString: SharedString;
	let dataStoreRuntime1: MockFluidDataStoreRuntime;
	let collection: IIntervalCollection<SequenceInterval>;
	let revertibles: SharedStringRevertible[];
	let containerRuntimeFactory: MockContainerRuntimeFactory;
	const stringFactory = new SharedStringFactory();

	beforeEach(() => {
		containerRuntimeFactory = new MockContainerRuntimeFactory();

		dataStoreRuntime1 = new MockFluidDataStoreRuntime({ clientId: "1" });
		dataStoreRuntime1.setAttachState(AttachState.Attached);
		sharedString = stringFactory.create(dataStoreRuntime1, "shared-string-1");

		containerRuntimeFactory.createContainerRuntime(dataStoreRuntime1);
		const services1 = {
			deltaConnection: dataStoreRuntime1.createDeltaConnection(),
			objectStorage: new MockStorage(),
		};
		sharedString.initializeLocal();
		sharedString.connect(services1);

		collection = sharedString.getIntervalCollection("test");
		revertibles = [];
	});

	it("revert direct interval insert", () => {
		collection.on("addInterval", (interval, local, op) => {
			appendAddIntervalToRevertibles(interval, revertibles);
		});

		sharedString.insertText(0, "hello world");
		collection.add({ start: 0, end: 5 });

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));
		assertSequenceIntervals(sharedString, collection, []);
	});
	it("revert direct interval remove", () => {
		collection.on("deleteInterval", (interval, local, op) => {
			appendDeleteIntervalToRevertibles(sharedString, interval, revertibles);
		});

		sharedString.insertText(0, "hello world");
		const id = collection.add({ start: 0, end: 5 }).getIntervalId();
		collection.removeIntervalById(id);

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));
		assertSequenceIntervals(sharedString, collection, [{ start: 0, end: 5 }]);
	});
	it("revert direct interval change", () => {
		collection.on("changeInterval", (interval, previousInterval, local, op) => {
			appendChangeIntervalToRevertibles(sharedString, interval, previousInterval, revertibles);
		});

		sharedString.insertText(0, "hello world");
		const id = collection.add({ start: 0, end: 5 }).getIntervalId();
		collection.change(id, { start: 1, end: 6 });

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));
		assertSequenceIntervals(sharedString, collection, [{ start: 0, end: 5 }]);
	});
	it("revert direct interval property change", () => {
		collection.on("propertyChanged", (interval, propertyDeltas, local, op) => {
			appendIntervalPropertyChangedToRevertibles(interval, propertyDeltas, revertibles);
		});

		sharedString.insertText(0, "hello world");
		const id = collection.add({ start: 0, end: 5, props: { foo: "one" } }).getIntervalId();
		collection.change(id, { props: { foo: "two" } });

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));
		assertSequenceIntervals(sharedString, collection, [{ start: 0, end: 5 }]);
		const int = collection.getIntervalById(id);
		assert.equal(int?.properties.foo, "one");
	});
	it("reverts multiple interval adds", () => {
		collection.on("addInterval", (interval, local, op) => {
			appendAddIntervalToRevertibles(interval, revertibles);
		});

		sharedString.insertText(0, "hello world");
		collection.add({ start: 0, end: 5 });
		collection.add({ start: 5, end: 7 });

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));
		assertSequenceIntervals(sharedString, collection, []);
	});
	it("reverts multiple interval removes", () => {
		collection.on("deleteInterval", (interval, local, op) => {
			appendDeleteIntervalToRevertibles(sharedString, interval, revertibles);
		});

		sharedString.insertText(0, "hello world");
		const id = collection.add({ start: 0, end: 5 }).getIntervalId();
		const id2 = collection.add({ start: 5, end: 7 }).getIntervalId();
		collection.removeIntervalById(id);
		collection.removeIntervalById(id2);

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));
		assertSequenceIntervals(sharedString, collection, [
			{ start: 0, end: 5 },
			{ start: 5, end: 7 },
		]);
	});
	it("performs multiple reverts on the same interval", () => {
		collection.on("addInterval", (interval, local, op) => {
			appendAddIntervalToRevertibles(interval, revertibles);
		});

		collection.on("deleteInterval", (interval, local, op) => {
			appendDeleteIntervalToRevertibles(sharedString, interval, revertibles);
		});

		collection.on("changeInterval", (interval, previousInterval, local, op) => {
			appendChangeIntervalToRevertibles(sharedString, interval, previousInterval, revertibles);
		});

		sharedString.insertText(0, "hello world");
		const id = collection.add({ start: 0, end: 5 }).getIntervalId();
		collection.change(id, { start: 3, end: 8 });
		collection.removeIntervalById(id);

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));
		assertSequenceIntervals(sharedString, collection, []);
	});
	it("performs two local changes, then reverts the first", () => {
		collection.on("addInterval", (interval, local, op) => {
			appendAddIntervalToRevertibles(interval, revertibles);
		});

		sharedString.insertText(0, "hello world");
		const id = collection.add({ start: 0, end: 5 }).getIntervalId();
		collection.change(id, { start: 3, end: 8 });

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));
		assertSequenceIntervals(sharedString, collection, []);
	});
	it("checks that revert functions properly when an id is recreated on revert of a delete", () => {
		sharedString.insertText(0, "hello world");
		const id = collection.add({ start: 0, end: 5 }).getIntervalId();

		collection.on("deleteInterval", (interval, local, op) => {
			appendDeleteIntervalToRevertibles(sharedString, interval, revertibles);
		});
		collection.on("changeInterval", (interval, previousInterval, local, op) => {
			appendChangeIntervalToRevertibles(sharedString, interval, previousInterval, revertibles);
		});

		collection.change(id, { start: 3, end: 8 });
		collection.removeIntervalById(id);

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));
		assertSequenceIntervals(sharedString, collection, [{ start: 0, end: 5 }]);
	});
	it("checks that revertibles still finds correct interval across multiple remove and reverts", () => {
		sharedString.insertText(0, "hello world");
		const id = collection.add({ start: 0, end: 5 }).getIntervalId();

		collection.on("deleteInterval", (interval, local, op) => {
			appendDeleteIntervalToRevertibles(sharedString, interval, revertibles);
		});
		collection.on("changeInterval", (interval, previousInterval, local, op) => {
			appendChangeIntervalToRevertibles(sharedString, interval, previousInterval, revertibles);
		});

		collection.change(id, { start: 3, end: 8 });
		collection.removeIntervalById(id);

		revertSharedStringRevertibles(sharedString, revertibles.splice(1, 1));
		assertSequenceIntervals(sharedString, collection, [{ start: 3, end: 8 }]);

		const intervals = Array.from(collection);
		const removed = collection.removeIntervalById(intervals[0].getIntervalId());
		assert(removed, "interval was not removed from the collection");

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));
		assertSequenceIntervals(sharedString, collection, [{ start: 0, end: 5 }]);
	});
	it("local only text remove, no ack, move interval out of range", () => {
		collection.on("changeInterval", (interval, previousInterval, local, op) => {
			appendChangeIntervalToRevertibles(sharedString, interval, previousInterval, revertibles);
		});
		sharedString.insertText(0, "hello world");
		const id = collection.add({ start: 2, end: 4 }).getIntervalId();
		containerRuntimeFactory.processAllMessages();

		sharedString.removeRange(0, 5);
		collection.change(id, { start: 1, end: 2 });

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));
		assertSequenceIntervals(sharedString, collection, [{ start: 0, end: 0 }]);
	});
	it("change interval out of removed range - local refs are out of range so revert should not happen", () => {
		sharedString.insertText(0, "hello world");
		collection.on("changeInterval", (interval, previousInterval, local, op) => {
			appendChangeIntervalToRevertibles(sharedString, interval, previousInterval, revertibles);
		});
		const id = collection.add({ start: 5, end: 8 }).getIntervalId();
		containerRuntimeFactory.processAllMessages();

		collection.change(id, { start: 1, end: 3 });
		sharedString.removeRange(5, sharedString.getLength());
		containerRuntimeFactory.processAllMessages();

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));
		assertSequenceIntervals(sharedString, collection, [{ start: 4, end: 4 }]);
	});
	it("change interval into removed range - revert should move interval out of detached case into remaining string", () => {
		sharedString.insertText(0, "hello world");
		collection.on("changeInterval", (interval, previousInterval, local, op) => {
			appendChangeIntervalToRevertibles(sharedString, interval, previousInterval, revertibles);
		});
		const id = collection.add({ start: 1, end: 3 }).getIntervalId();
		containerRuntimeFactory.processAllMessages();

		collection.change(id, { start: 4, end: 8 });
		sharedString.removeRange(4, sharedString.getLength());
		containerRuntimeFactory.processAllMessages();

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));
		assertSequenceIntervals(sharedString, collection, [{ start: 1, end: 3 }]);
	});
	it("performs two acked interval removes and reverts to ensure interval returns to correct position", () => {
		const undoRevertibles: SharedStringRevertible[] = [];
		const redoRevertibles: SharedStringRevertible[] = [];
		let currentRevertStack = undoRevertibles;

		sharedString.insertText(0, "123456789");
		collection.add({ start: 2, end: 2 });

		sharedString.on("sequenceDelta", (op) => {
			if (op.isLocal) {
				appendSharedStringDeltaToRevertibles(sharedString, op, currentRevertStack);
			}
		});
		collection.on("changeInterval", (interval, previousInterval, local, op, slide) => {
			if (
				slide === false &&
				(interval.end !== previousInterval.end || interval.start !== previousInterval.start)
			) {
				appendChangeIntervalToRevertibles(
					sharedString,
					interval,
					previousInterval,
					currentRevertStack,
				);
			}
		});
		// remove "34"
		sharedString.removeRange(2, 4);
		containerRuntimeFactory.processAllMessages();
		assert.equal(sharedString.getText(), "1256789");
		assertSequenceIntervals(sharedString, collection, [{ start: 2, end: 2 }]);

		// undo to reinsert "34"
		currentRevertStack = redoRevertibles;
		revertSharedStringRevertibles(sharedString, undoRevertibles.splice(0));
		currentRevertStack = undoRevertibles;
		containerRuntimeFactory.processAllMessages();
		assert.equal(undoRevertibles.length, 0);
		assert.equal(redoRevertibles.length, 2);

		assert.equal(sharedString.getText(), "123456789");
		assertSequenceIntervals(sharedString, collection, [{ start: 2, end: 2 }]);

		// remove "5"
		sharedString.removeRange(4, 5);
		containerRuntimeFactory.processAllMessages();
		assert.equal(sharedString.getText(), "12346789");
		assert.equal(undoRevertibles.length, 1);
		assertSequenceIntervals(sharedString, collection, [{ start: 2, end: 2 }]);

		// undo to reinsert "5"
		currentRevertStack = redoRevertibles;
		revertSharedStringRevertibles(sharedString, undoRevertibles.splice(0));
		currentRevertStack = undoRevertibles;
		containerRuntimeFactory.processAllMessages();
		assert.equal(sharedString.getText(), "123456789");
		assertSequenceIntervals(sharedString, collection, [{ start: 2, end: 2 }]);
	});
});
describe("Sequence.Revertibles with Remote Edits", () => {
	let sharedString: SharedString;
	let dataStoreRuntime1: MockFluidDataStoreRuntime;
	let collection: IIntervalCollection<SequenceInterval>;
	let collection2: IIntervalCollection<SequenceInterval>;
	let revertibles: SharedStringRevertible[];

	let sharedString2: SharedString;
	let containerRuntimeFactory: MockContainerRuntimeFactory;

	beforeEach(() => {
		dataStoreRuntime1 = new MockFluidDataStoreRuntime({ clientId: "1" });
		sharedString = new SharedStringClass(
			dataStoreRuntime1,
			"shared-string-1",
			SharedStringFactory.Attributes,
		);

		containerRuntimeFactory = new MockContainerRuntimeFactory();

		// Connect the first SharedString.
		dataStoreRuntime1.setAttachState(AttachState.Attached);
		containerRuntimeFactory.createContainerRuntime(dataStoreRuntime1);
		const services1 = {
			deltaConnection: dataStoreRuntime1.createDeltaConnection(),
			objectStorage: new MockStorage(),
		};
		sharedString.initializeLocal();
		sharedString.connect(services1);

		// Create and connect a second SharedString.
		const dataStoreRuntime2 = new MockFluidDataStoreRuntime({ clientId: "2" });
		containerRuntimeFactory.createContainerRuntime(dataStoreRuntime2);
		const services2 = {
			deltaConnection: dataStoreRuntime2.createDeltaConnection(),
			objectStorage: new MockStorage(),
		};

		sharedString2 = new SharedStringClass(
			dataStoreRuntime2,
			"shared-string-2",
			SharedStringFactory.Attributes,
		);
		sharedString2.initializeLocal();
		sharedString2.connect(services2);

		revertibles = [];
		collection = sharedString.getIntervalCollection("test");
		collection2 = sharedString2.getIntervalCollection("test");
	});
	it("interval change, range remove, ack, revert change interval", () => {
		collection.on("changeInterval", (interval, previousInterval, local, op) => {
			appendChangeIntervalToRevertibles(sharedString, interval, previousInterval, revertibles);
		});
		sharedString.insertText(0, "hello world");
		const id = collection.add({ start: 0, end: 5 }).getIntervalId();
		containerRuntimeFactory.processAllMessages();

		collection.change(id, { start: 6, end: 8 });
		sharedString2.removeRange(0, 5);
		containerRuntimeFactory.processAllMessages();

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));
		assertSequenceIntervals(sharedString, collection, [{ start: 0, end: 0 }]);
		containerRuntimeFactory.processAllMessages();
		assertSequenceIntervals(sharedString2, collection2, [{ start: 0, end: 0 }]);
	});
	it("remote string remove interacting with reverting an interval remove", () => {
		collection.on("deleteInterval", (interval, local, op) => {
			appendDeleteIntervalToRevertibles(sharedString, interval, revertibles);
		});
		sharedString.insertText(0, "hello world");
		const id = collection.add({ start: 0, end: 5 }).getIntervalId();
		collection.removeIntervalById(id);
		containerRuntimeFactory.processAllMessages();

		sharedString2.removeRange(1, 3);
		containerRuntimeFactory.processAllMessages();

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));
		containerRuntimeFactory.processAllMessages();

		assert.equal(sharedString.getText(), sharedString2.getText());
		assertSequenceIntervals(sharedString, collection, [{ start: 0, end: 3 }]);
		assertSequenceIntervals(sharedString2, collection2, [{ start: 0, end: 3 }]);
	});
	it("remote string remove that shares an endpoint with a removed interval that gets reverted", () => {
		collection.on("deleteInterval", (interval, local, op) => {
			appendDeleteIntervalToRevertibles(sharedString, interval, revertibles);
		});
		sharedString.insertText(0, "hello world");
		const id = collection.add({ start: 0, end: 5 }).getIntervalId();
		collection.removeIntervalById(id);
		containerRuntimeFactory.processAllMessages();

		sharedString2.removeRange(0, 3);
		containerRuntimeFactory.processAllMessages();

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));
		containerRuntimeFactory.processAllMessages();

		assert.equal(sharedString.getText(), sharedString2.getText());
		assertSequenceIntervals(sharedString, collection, [{ start: 0, end: 2 }]);
		assertSequenceIntervals(sharedString2, collection2, [{ start: 0, end: 2 }]);
	});
	it("remote string add interacting with reverting an interval remove", () => {
		collection.on("deleteInterval", (interval, local, op) => {
			appendDeleteIntervalToRevertibles(sharedString, interval, revertibles);
		});
		sharedString.insertText(0, "hello world");
		const id = collection.add({ start: 0, end: 7 }).getIntervalId();
		containerRuntimeFactory.processAllMessages();

		collection.removeIntervalById(id);
		sharedString2.insertText(5, " hi");
		containerRuntimeFactory.processAllMessages();

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));
		containerRuntimeFactory.processAllMessages();

		assert.equal(sharedString.getText(), sharedString2.getText());
		assertSequenceIntervals(sharedString, collection, [{ start: 0, end: 10 }]);
		assertSequenceIntervals(sharedString2, collection2, [{ start: 0, end: 10 }]);
	});
	it("remote interval change interacting with reverting an interval remove", () => {
		sharedString.insertText(0, "hello world");
		const id = collection.add({ start: 0, end: 5 }).getIntervalId();
		containerRuntimeFactory.processAllMessages();

		collection2.change(id, { start: 3, end: 8 });

		collection.on("deleteInterval", (interval, local, op) => {
			appendDeleteIntervalToRevertibles(sharedString, interval, revertibles);
		});
		collection.removeIntervalById(id);

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));
		containerRuntimeFactory.processAllMessages();

		assertSequenceIntervals(sharedString, collection, [{ start: 0, end: 5 }]);
		assertSequenceIntervals(sharedString2, collection2, [{ start: 0, end: 5 }]);
	});
	it("remote interval change interacting with reverting an interval remove with ack before revert", () => {
		sharedString.insertText(0, "hello world");
		const id = collection.add({ start: 0, end: 5 }).getIntervalId();
		containerRuntimeFactory.processAllMessages();

		collection2.change(id, { start: 3, end: 8 });

		collection.on("deleteInterval", (interval, local, op) => {
			appendDeleteIntervalToRevertibles(sharedString, interval, revertibles);
		});
		collection.removeIntervalById(id);
		containerRuntimeFactory.processAllMessages();

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));
		containerRuntimeFactory.processAllMessages();

		assertSequenceIntervals(sharedString, collection, [{ start: 0, end: 5 }]);
		assertSequenceIntervals(sharedString2, collection2, [{ start: 0, end: 5 }]);
	});
	it("acked remote interval change interacting with reverting an interval change", () => {
		sharedString.insertText(0, "hello world");
		const id = collection.add({ start: 0, end: 5 }).getIntervalId();
		containerRuntimeFactory.processAllMessages();

		collection2.change(id, { start: 3, end: 8 });

		collection.on("changeInterval", (interval, previousInterval, local, op) => {
			appendChangeIntervalToRevertibles(sharedString, interval, previousInterval, revertibles);
		});
		collection.change(id, { start: 4, end: 9 });
		containerRuntimeFactory.processOneMessage();

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));
		containerRuntimeFactory.processAllMessages();

		assertSequenceIntervals(sharedString, collection, [{ start: 0, end: 5 }]);
		assertSequenceIntervals(sharedString2, collection2, [{ start: 0, end: 5 }]);
	});
	it("remote interval remove interacting with reverting an interval change", () => {
		sharedString.insertText(0, "hello world");
		const id = collection.add({ start: 0, end: 5 }).getIntervalId();
		containerRuntimeFactory.processAllMessages();

		collection.on("changeInterval", (interval, previousInterval, local, op) => {
			appendChangeIntervalToRevertibles(sharedString, interval, previousInterval, revertibles);
		});
		collection.change(id, { start: 3, end: 8 });
		containerRuntimeFactory.processAllMessages();

		collection2.removeIntervalById(id);

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));
		containerRuntimeFactory.processAllMessages();

		assertSequenceIntervals(sharedString, collection, []);
		assertSequenceIntervals(sharedString2, collection2, []);
	});
	it("remote interval remove interacting with reverting an interval property change", () => {
		sharedString.insertText(0, "hello world");
		const id = collection.add({ start: 0, end: 5, props: { foo: "one" } }).getIntervalId();
		containerRuntimeFactory.processAllMessages();

		collection.on("propertyChanged", (interval, propertyDeltas, local, op) => {
			appendIntervalPropertyChangedToRevertibles(interval, propertyDeltas, revertibles);
		});
		collection.change(id, { props: { foo: "two" } });

		collection2.removeIntervalById(id);
		containerRuntimeFactory.processAllMessages();

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));
		containerRuntimeFactory.processAllMessages();

		assertSequenceIntervals(sharedString, collection, []);
		assertSequenceIntervals(sharedString2, collection2, []);
	});
	it("remote interval remove interacting with reverting an interval remove", () => {
		sharedString.insertText(0, "hello world");
		const id = collection.add({ start: 0, end: 5 }).getIntervalId();
		containerRuntimeFactory.processAllMessages();

		collection.on("deleteInterval", (interval, local, op) => {
			appendDeleteIntervalToRevertibles(sharedString, interval, revertibles);
		});
		collection.removeIntervalById(id);

		collection2.removeIntervalById(id);
		containerRuntimeFactory.processAllMessages();

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));
		containerRuntimeFactory.processAllMessages();

		assertSequenceIntervals(sharedString, collection, [{ start: 0, end: 5 }]);
		assertSequenceIntervals(sharedString2, collection2, [{ start: 0, end: 5 }]);
	});
	it("remote interval property change interacting with reverting an interval remove", () => {
		sharedString.insertText(0, "hello world");
		const id = collection.add({ start: 0, end: 5, props: { foo: "one" } }).getIntervalId();
		containerRuntimeFactory.processAllMessages();

		collection.on("deleteInterval", (interval, local, op) => {
			appendDeleteIntervalToRevertibles(sharedString, interval, revertibles);
		});
		collection.removeIntervalById(id);

		collection2.change(id, { props: { foo: "two" } });
		containerRuntimeFactory.processAllMessages();

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));
		containerRuntimeFactory.processAllMessages();

		assertSequenceIntervals(sharedString, collection, [{ start: 0, end: 5 }]);
		assertSequenceIntervals(sharedString2, collection2, [{ start: 0, end: 5 }]);
		const intervals = Array.from(collection);
		assert.equal(intervals[0].properties.foo, "one");
	});
	it("remote interval property change interacting with reverting an interval add", () => {
		sharedString.insertText(0, "hello world");
		const id = collection.add({ start: 0, end: 5, props: { foo: "one" } }).getIntervalId();
		containerRuntimeFactory.processAllMessages();

		collection.on("addInterval", (interval, local, op) => {
			appendAddIntervalToRevertibles(interval, revertibles);
		});
		collection.add({ start: 2, end: 7 });

		collection2.change(id, { props: { foo: "two" } });
		containerRuntimeFactory.processAllMessages();

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));
		containerRuntimeFactory.processAllMessages();

		assertSequenceIntervals(sharedString, collection, [{ start: 0, end: 5 }]);
		assertSequenceIntervals(sharedString2, collection2, [{ start: 0, end: 5 }]);
		const int = collection.getIntervalById(id);
		assert.equal(int?.properties.foo, "two");
	});
	it("remote interval property change interacting with reverting an interval change", () => {
		sharedString.insertText(0, "hello world");
		const id = collection.add({ start: 0, end: 5, props: { foo: "one" } }).getIntervalId();
		containerRuntimeFactory.processAllMessages();

		collection.on("changeInterval", (interval, previousInterval, local, op) => {
			appendChangeIntervalToRevertibles(sharedString, interval, previousInterval, revertibles);
		});
		collection.change(id, { start: 3, end: 8 });

		collection2.change(id, { props: { foo: "two" } });
		containerRuntimeFactory.processAllMessages();

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));
		containerRuntimeFactory.processAllMessages();

		assertSequenceIntervals(sharedString, collection, [{ start: 0, end: 5 }]);
		assertSequenceIntervals(sharedString2, collection2, [{ start: 0, end: 5 }]);
		const int = collection.getIntervalById(id);
		assert.equal(int?.properties.foo, "two");
	});
	it("remote interval property change interacting with reverting an interval property change", () => {
		sharedString.insertText(0, "hello world");
		const id = collection.add({ start: 0, end: 5, props: { foo: "one" } }).getIntervalId();
		containerRuntimeFactory.processAllMessages();

		collection.on("propertyChanged", (interval, propertyDeltas, local, op) => {
			if (local) {
				appendIntervalPropertyChangedToRevertibles(interval, propertyDeltas, revertibles);
			}
		});
		collection.change(id, { props: { foo: "two", bar: "one" } });

		collection2.change(id, { props: { foo: "three", bar: "one" } });
		containerRuntimeFactory.processAllMessages();

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));
		containerRuntimeFactory.processAllMessages();

		assertSequenceIntervals(sharedString, collection, [{ start: 0, end: 5 }]);
		assertSequenceIntervals(sharedString2, collection2, [{ start: 0, end: 5 }]);
		const int = collection.getIntervalById(id);
		assert.equal(int?.properties.foo, "one");
		assert.equal(int?.properties.bar, undefined);
	});
});

describe("Undo/redo for string remove containing intervals", () => {
	let sharedString: SharedString;
	let dataStoreRuntime1: MockFluidDataStoreRuntime;
	let containerRuntimeFactory: MockContainerRuntimeFactory;
	let collection: IIntervalCollection<SequenceInterval>;
	let revertibles: SharedStringRevertible[];

	beforeEach(() => {
		dataStoreRuntime1 = new MockFluidDataStoreRuntime({ clientId: "1" });
		sharedString = new SharedStringClass(
			dataStoreRuntime1,
			"shared-string-1",
			SharedStringFactory.Attributes,
		);

		containerRuntimeFactory = new MockContainerRuntimeFactory();

		// Connect the first SharedString.
		dataStoreRuntime1.setAttachState(AttachState.Attached);
		containerRuntimeFactory.createContainerRuntime(dataStoreRuntime1);
		const services1 = {
			deltaConnection: dataStoreRuntime1.createDeltaConnection(),
			objectStorage: new MockStorage(),
		};
		sharedString.initializeLocal();
		sharedString.connect(services1);
		collection = sharedString.getIntervalCollection("test");
		revertibles = [];
	});

	describe("with remote ops", () => {
		let sharedString2: SharedString;
		let collection2: IIntervalCollection<SequenceInterval>;

		beforeEach(() => {
			const dataStoreRuntime2 = new MockFluidDataStoreRuntime({ clientId: "2" });
			containerRuntimeFactory.createContainerRuntime(dataStoreRuntime2);
			const services2 = {
				deltaConnection: dataStoreRuntime2.createDeltaConnection(),
				objectStorage: new MockStorage(),
			};

			sharedString2 = new SharedStringClass(
				dataStoreRuntime2,
				"shared-string-2",
				SharedStringFactory.Attributes,
			);
			sharedString2.initializeLocal();
			sharedString2.connect(services2);
			collection2 = sharedString2.getIntervalCollection("test");
		});

		it("handles remote remove of same range", () => {
			sharedString.insertText(0, "hello world");

			sharedString.on("sequenceDelta", (op) => {
				if (op.isLocal) {
					appendSharedStringDeltaToRevertibles(sharedString, op, revertibles);
				}
			});

			collection.add({ start: 2, end: 4 });
			containerRuntimeFactory.processAllMessages();

			sharedString2.removeRange(0, 6);
			sharedString.removeRange(0, 6);
			assert.equal(sharedString.getText(), "world");
			assert.equal(sharedString2.getText(), "world");
			containerRuntimeFactory.processAllMessages();

			assert.equal(revertibles.length, 1, "revertibles.length is not 1");
			revertSharedStringRevertibles(sharedString, revertibles.splice(0));

			assert.equal(sharedString.getText(), "hello world");
			assertSequenceIntervals(sharedString, collection, [{ start: 2, end: 4 }]);
			containerRuntimeFactory.processAllMessages();
			assertSequenceIntervals(sharedString2, collection2, [{ start: 2, end: 4 }]);
		});
		it("ignores remote interval move", () => {
			sharedString.insertText(0, "hello world");

			sharedString.on("sequenceDelta", (op) => {
				if (op.isLocal) {
					appendSharedStringDeltaToRevertibles(sharedString, op, revertibles);
				}
			});

			const interval = collection.add({ start: 2, end: 4 });
			containerRuntimeFactory.processAllMessages();

			sharedString.removeRange(0, 6);
			sharedString2
				.getIntervalCollection("test")
				.change(interval.getIntervalId(), { start: 3, end: 8 });
			containerRuntimeFactory.processAllMessages();

			assert.equal(revertibles.length, 1, "revertibles.length is not 1");
			revertSharedStringRevertibles(sharedString, revertibles.splice(0));

			assert.equal(sharedString.getText(), "hello world");
			// start moved within deleted range is restored, end moved outside is not
			assertSequenceIntervals(sharedString, collection, [{ start: 2, end: 4 }]);
			containerRuntimeFactory.processAllMessages();
			assertSequenceIntervals(sharedString2, collection2, [{ start: 2, end: 4 }]);
		});
		it("handles remote interval delete", () => {
			sharedString.insertText(0, "hello world");

			sharedString.on("sequenceDelta", (op) => {
				if (op.isLocal) {
					appendSharedStringDeltaToRevertibles(sharedString, op, revertibles);
				}
			});

			const interval = collection.add({ start: 2, end: 4 });
			containerRuntimeFactory.processAllMessages();

			sharedString.removeRange(0, 6);
			sharedString2.getIntervalCollection("test").removeIntervalById(interval.getIntervalId());
			containerRuntimeFactory.processAllMessages();

			assert.equal(revertibles.length, 1, "revertibles.length is not 1");
			revertSharedStringRevertibles(sharedString, revertibles.splice(0));

			assert.equal(sharedString.getText(), "hello world");
			assertSequenceIntervals(sharedString, collection, []);
			containerRuntimeFactory.processAllMessages();
			assertSequenceIntervals(sharedString2, collection2, []);
		});
		it("handles remote interval move with one contained endpoint", () => {
			sharedString.insertText(0, "hello world");

			sharedString.on("sequenceDelta", (op) => {
				if (op.isLocal) {
					appendSharedStringDeltaToRevertibles(sharedString, op, revertibles);
				}
			});

			const interval = collection.add({ start: 6, end: 8 });
			containerRuntimeFactory.processAllMessages();

			sharedString2
				.getIntervalCollection("test")
				.change(interval.getIntervalId(), { start: 1, end: 9 });
			sharedString.removeRange(5, 7);
			containerRuntimeFactory.processAllMessages();

			assert.equal(revertibles.length, 1, "revertibles.length is not 1");
			revertSharedStringRevertibles(sharedString, revertibles.splice(0));

			assert.equal(sharedString.getText(), "hello world");
			assertSequenceIntervals(sharedString, collection, [{ start: 6, end: 9 }]);
			containerRuntimeFactory.processAllMessages();
			assertSequenceIntervals(sharedString2, collection2, [{ start: 6, end: 9 }]);
		});
		it("does not restore start that would be after end", () => {
			sharedString.insertText(0, "hello world");

			sharedString.on("sequenceDelta", (op) => {
				if (op.isLocal) {
					appendSharedStringDeltaToRevertibles(sharedString, op, revertibles);
				}
			});

			const interval = collection.add({ start: 6, end: 8 });
			containerRuntimeFactory.processAllMessages();

			sharedString2
				.getIntervalCollection("test")
				.change(interval.getIntervalId(), { start: 1, end: 3 });
			sharedString.removeRange(5, 7);
			containerRuntimeFactory.processAllMessages();

			assert.equal(revertibles.length, 1, "revertibles.length is not 1");
			revertSharedStringRevertibles(sharedString, revertibles.splice(0));

			assert.equal(sharedString.getText(), "hello world");
			assertSequenceIntervals(sharedString, collection, [{ start: 1, end: 3 }]);
			containerRuntimeFactory.processAllMessages();
			assertSequenceIntervals(sharedString2, collection2, [{ start: 1, end: 3 }]);
		});
		it("does not restore end that would be before start", () => {
			sharedString.insertText(0, "hello world");

			sharedString.on("sequenceDelta", (op) => {
				if (op.isLocal) {
					appendSharedStringDeltaToRevertibles(sharedString, op, revertibles);
				}
			});

			const interval = collection.add({ start: 4, end: 6 });
			containerRuntimeFactory.processAllMessages();

			sharedString2
				.getIntervalCollection("test")
				.change(interval.getIntervalId(), { start: 8, end: 9 });
			sharedString.removeRange(5, 7);
			containerRuntimeFactory.processAllMessages();

			assert.equal(revertibles.length, 1, "revertibles.length is not 1");
			revertSharedStringRevertibles(sharedString, revertibles.splice(0));

			assert.equal(sharedString.getText(), "hello world");
			assertSequenceIntervals(sharedString, collection, [{ start: 8, end: 9 }]);
			containerRuntimeFactory.processAllMessages();
			assertSequenceIntervals(sharedString2, collection2, [{ start: 8, end: 9 }]);
		});
	});

	it("has an interval contained within the deleted range", () => {
		sharedString.insertText(0, "hello world");

		sharedString.on("sequenceDelta", (op) => {
			appendSharedStringDeltaToRevertibles(sharedString, op, revertibles);
		});

		const interval = collection.add({ start: 2, end: 4 });
		const id = interval.getIntervalId();

		sharedString.removeRange(0, 6);

		const actualStart = sharedString.localReferencePositionToPosition(interval.start);
		const actualEnd = sharedString.localReferencePositionToPosition(interval.end);
		assert.equal(actualStart, 0, `actualStart is ${actualStart}`);
		assert.equal(actualEnd, 0, `actualEnd is ${actualEnd}`);

		assert.equal(revertibles.length, 1, "revertibles.length is not 1");
		revertSharedStringRevertibles(sharedString, revertibles.splice(0));

		const updatedInterval = collection.getIntervalById(id);
		assert(updatedInterval !== undefined, "updatedInterval is undefined");
		assert.equal(sharedString.getText(), "hello world");
		assertSequenceIntervals(sharedString, collection, [{ start: 2, end: 4 }]);
		assert.equal(
			updatedInterval.start.getOffset(),
			2,
			`after remove start.getOffset() is ${interval.start.getOffset()}`,
		);
		assert.equal(
			updatedInterval.end.getOffset(),
			4,
			`after remove start.getOffset() is ${interval.end.getOffset()}`,
		);
	});
	it("has an interval with endpoints at the deleted range", () => {
		sharedString.insertText(0, "hello world");

		sharedString.on("sequenceDelta", (op) => {
			appendSharedStringDeltaToRevertibles(sharedString, op, revertibles);
		});

		collection.add({ start: 0, end: 6 });

		sharedString.removeRange(0, 6);

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));

		assert.equal(sharedString.getText(), "hello world");
		assertSequenceIntervals(sharedString, collection, [{ start: 0, end: 6 }]);
	});
	it("has an interval with one endpoint within the deleted range", () => {
		sharedString.insertText(0, "hello world");

		sharedString.on("sequenceDelta", (op) => {
			appendSharedStringDeltaToRevertibles(sharedString, op, revertibles);
		});

		collection.add({ start: 5, end: 9 });

		sharedString.removeRange(2, 7);

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));

		assert.equal(sharedString.getText(), "hello world");
		assertSequenceIntervals(sharedString, collection, [{ start: 5, end: 9 }]);
	});
	it("restores an interval after two removes", () => {
		sharedString.insertText(0, "hello world");

		sharedString.on("sequenceDelta", (op) => {
			appendSharedStringDeltaToRevertibles(sharedString, op, revertibles);
		});

		collection.add({ start: 3, end: 6 });

		// only one revertible object generated for both removes
		sharedString.removeRange(1, 4);
		sharedString.removeRange(3, 6);

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));

		assert.equal(sharedString.getText(), "hello world");
		assertSequenceIntervals(sharedString, collection, [{ start: 3, end: 6 }]);
	});
	it("reverts an ack'ed remove", () => {
		sharedString.insertText(0, "hello world");

		sharedString.on("sequenceDelta", (op) => {
			if (op.opArgs.sequencedMessage === undefined) {
				appendSharedStringDeltaToRevertibles(sharedString, op, revertibles);
			}
		});

		collection.add({ start: 5, end: 9 });

		sharedString.removeRange(2, 7);
		containerRuntimeFactory.processAllMessages();

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));

		assert.equal(sharedString.getText(), "hello world");
		assertSequenceIntervals(sharedString, collection, [{ start: 5, end: 9 }]);
	});
	it("has multiple interval endpoints within the deleted range", () => {
		sharedString.insertText(0, "hello world");

		sharedString.on("sequenceDelta", (op) => {
			appendSharedStringDeltaToRevertibles(sharedString, op, revertibles);
		});

		collection.add({ start: 5, end: 9 });
		collection.add({ start: 0, end: 3 });
		collection.add({ start: 3, end: 4 });

		sharedString.removeRange(2, 7);

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));

		assert.equal(sharedString.getText(), "hello world");
		assertSequenceIntervals(sharedString, collection, [
			{ start: 0, end: 3 },
			{ start: 3, end: 4 },
			{ start: 5, end: 9 },
		]);
	});
	it("has an interval across two segments in the deleted range", () => {
		sharedString.insertText(0, "world");
		sharedString.insertText(0, "hello ");

		sharedString.on("sequenceDelta", (op) => {
			appendSharedStringDeltaToRevertibles(sharedString, op, revertibles);
		});

		collection.add({ start: 3, end: 7 });

		sharedString.removeRange(2, 8);

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));

		assert.equal(sharedString.getText(), "hello world");
		assertSequenceIntervals(sharedString, collection, [{ start: 3, end: 7 }]);
	});
	it("has multiple intervals across two segments in the deleted range", () => {
		sharedString.insertText(0, "world");
		sharedString.insertText(0, "hello ");

		sharedString.on("sequenceDelta", (op) => {
			appendSharedStringDeltaToRevertibles(sharedString, op, revertibles);
		});

		collection.add({ start: 3, end: 7 });
		collection.add({ start: 0, end: 6 });

		sharedString.removeRange(2, 8);

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));

		assert.equal(sharedString.getText(), "hello world");
		assertSequenceIntervals(sharedString, collection, [
			{ start: 0, end: 6 },
			{ start: 3, end: 7 },
		]);
	});

	describe("mixed with direct interval edit revertibles", () => {
		it("reverts interval delete + remove range", () => {
			sharedString.insertText(0, "hello world");
			const id = collection.add({ start: 1, end: 5 }).getIntervalId();

			sharedString.on("sequenceDelta", (op) => {
				appendSharedStringDeltaToRevertibles(sharedString, op, revertibles);
			});
			collection.on("deleteInterval", (interval, local, op) => {
				appendDeleteIntervalToRevertibles(sharedString, interval, revertibles);
			});

			collection.removeIntervalById(id);
			sharedString.removeRange(0, 8);
			revertSharedStringRevertibles(sharedString, revertibles.splice(0));

			assert.equal(sharedString.getText(), "hello world");
			assertSequenceIntervals(sharedString, collection, [{ start: 1, end: 5 }]);
		});
		it("reverts remove range + interval delete", () => {
			sharedString.insertText(0, "hello world");
			const id = collection.add({ start: 1, end: 5 }).getIntervalId();

			sharedString.on("sequenceDelta", (op) => {
				appendSharedStringDeltaToRevertibles(sharedString, op, revertibles);
			});
			collection.on("deleteInterval", (interval, local, op) => {
				appendDeleteIntervalToRevertibles(sharedString, interval, revertibles);
			});

			sharedString.removeRange(0, 8);
			collection.removeIntervalById(id);
			revertSharedStringRevertibles(sharedString, revertibles.splice(0));

			assert.equal(sharedString.getText(), "hello world");
			assertSequenceIntervals(sharedString, collection, [{ start: 1, end: 5 }]);
		});
		it("reverts interval change + remove range", () => {
			sharedString.insertText(0, "hello world");
			const id = collection.add({ start: 1, end: 5 }).getIntervalId();

			sharedString.on("sequenceDelta", (op) => {
				appendSharedStringDeltaToRevertibles(sharedString, op, revertibles);
			});
			collection.on("changeInterval", (interval, previousInterval, local, op) => {
				appendChangeIntervalToRevertibles(
					sharedString,
					interval,
					previousInterval,
					revertibles,
				);
			});

			collection.change(id, { start: 2, end: 4 });
			sharedString.removeRange(0, 8);
			revertSharedStringRevertibles(sharedString, revertibles.splice(0));

			assert.equal(sharedString.getText(), "hello world");
			assertSequenceIntervals(sharedString, collection, [{ start: 1, end: 5 }]);
		});
		it("reverts interval change + remove range with interval start", () => {
			sharedString.insertText(0, "hello world");
			const id = collection.add({ start: 1, end: 5 }).getIntervalId();

			sharedString.on("sequenceDelta", (op) => {
				appendSharedStringDeltaToRevertibles(sharedString, op, revertibles);
			});
			collection.on("changeInterval", (interval, previousInterval, local, op) => {
				appendChangeIntervalToRevertibles(
					sharedString,
					interval,
					previousInterval,
					revertibles,
				);
			});

			collection.change(id, { start: 2, end: 9 });
			sharedString.removeRange(0, 8);
			revertSharedStringRevertibles(sharedString, revertibles.splice(0));

			assert.equal(sharedString.getText(), "hello world");
			assertSequenceIntervals(sharedString, collection, [{ start: 1, end: 5 }]);
		});
		it("reverts interval change + remove range containing only revertible refs", () => {
			sharedString.insertText(0, "hello world");
			const id = collection.add({ start: 1, end: 5 }).getIntervalId();

			sharedString.on("sequenceDelta", (op) => {
				appendSharedStringDeltaToRevertibles(sharedString, op, revertibles);
			});
			collection.on("changeInterval", (interval, previousInterval, local, op) => {
				appendChangeIntervalToRevertibles(
					sharedString,
					interval,
					previousInterval,
					revertibles,
				);
			});

			collection.change(id, { start: 9, end: 10 });
			sharedString.removeRange(0, 8);
			revertSharedStringRevertibles(sharedString, revertibles.splice(0));

			assert.equal(sharedString.getText(), "hello world");
			assertSequenceIntervals(sharedString, collection, [{ start: 1, end: 5 }]);
		});
		it("reverts remove range + interval change", () => {
			sharedString.insertText(0, "hello world");
			const id = collection.add({ start: 1, end: 5 }).getIntervalId();

			sharedString.on("sequenceDelta", (op) => {
				appendSharedStringDeltaToRevertibles(sharedString, op, revertibles);
			});
			collection.on("changeInterval", (interval, previousInterval, local, op) => {
				appendChangeIntervalToRevertibles(
					sharedString,
					interval,
					previousInterval,
					revertibles,
				);
			});

			sharedString.removeRange(0, 8);
			collection.change(id, { start: 1, end: 2 });
			revertSharedStringRevertibles(sharedString, revertibles.splice(0));

			assert.equal(sharedString.getText(), "hello world");
			assertSequenceIntervals(sharedString, collection, [{ start: 1, end: 5 }]);
		});
	});
});

describe("Sequence.Revertibles with stickiness", () => {
	let sharedString: SharedString;
	let dataStoreRuntime1: MockFluidDataStoreRuntime;
	let collection: IIntervalCollection<SequenceInterval>;
	let revertibles: SharedStringRevertible[];
	let containerRuntimeFactory: MockContainerRuntimeFactory;
	const stringFactory = new SharedStringFactory();

	beforeEach(() => {
		containerRuntimeFactory = new MockContainerRuntimeFactory();

		dataStoreRuntime1 = new MockFluidDataStoreRuntime({ clientId: "1" });
		dataStoreRuntime1.setAttachState(AttachState.Attached);
		dataStoreRuntime1.options = {
			intervalStickinessEnabled: true,
			mergeTreeReferencesCanSlideToEndpoint: true,
		};
		sharedString = stringFactory.create(dataStoreRuntime1, "shared-string-1");

		const containerRuntime1 =
			containerRuntimeFactory.createContainerRuntime(dataStoreRuntime1);
		const services1 = {
			deltaConnection: containerRuntime1.createDeltaConnection(),
			objectStorage: new MockStorage(),
		};
		sharedString.initializeLocal();
		sharedString.connect(services1);

		collection = sharedString.getIntervalCollection("test");
		revertibles = [];
	});

	it("fails to revert interval remove of stickiness reversed endpoints", () => {
		collection.on("deleteInterval", (interval) => {
			appendDeleteIntervalToRevertibles(sharedString, interval, revertibles);
		});

		sharedString.insertText(0, "hello world");
		const id = collection
			.add({
				start: { pos: 5, side: Side.After },
				end: { pos: 5, side: Side.Before },
			})
			.getIntervalId();
		collection.removeIntervalById(id);

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));
		assertSequenceIntervals(sharedString, collection, []);
	});

	it("fails to revert interval change to stickiness reversed endpoints", () => {
		collection.on("changeInterval", (interval, previousInterval) => {
			appendChangeIntervalToRevertibles(sharedString, interval, previousInterval, revertibles);
		});

		sharedString.insertText(0, "hello world");
		const id = collection
			.add({
				start: { pos: 5, side: Side.After },
				end: { pos: 5, side: Side.Before },
			})
			.getIntervalId();
		collection.change(id, { start: 1, end: 6 });

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));
		assertSequenceIntervals(sharedString, collection, [{ start: 1, end: 6 }]);
	});

	it("reverts remove range that reverses endpoints", () => {
		sharedString.insertText(0, "hello world");

		sharedString.on("sequenceDelta", (op) => {
			appendSharedStringDeltaToRevertibles(sharedString, op, revertibles);
		});

		collection.add({
			start: { pos: 4, side: Side.Before },
			end: { pos: 5, side: Side.After },
		});
		sharedString.removeText(3, 6);
		containerRuntimeFactory.processAllMessages();

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));
		const intervals = Array.from(collection);
		assert.equal(intervals.length, 1, `wrong number of intervals ${intervals.length}`);
		const int = intervals[0];
		assert.equal(
			int.stickiness,
			IntervalStickiness.NONE,
			`unexpected stickiness ${int.stickiness}`,
		);
		const start = sharedString.localReferencePositionToPosition(int.start);
		const end = sharedString.localReferencePositionToPosition(int.end);
		assert.equal(start, 4, `start is ${start}`);
		assert.equal(end, 5, `end is ${end}`);
	});

	it("reverts stickiness on interval remove", () => {
		collection.on("deleteInterval", (interval) => {
			appendDeleteIntervalToRevertibles(sharedString, interval, revertibles);
		});

		sharedString.insertText(0, "hello world");
		const id = collection
			.add({
				start: { pos: 4, side: Side.After },
				end: { pos: 5, side: Side.After },
			})
			.getIntervalId();
		collection.removeIntervalById(id);

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));
		const intervals = Array.from(collection);
		assert.equal(intervals.length, 1, `wrong number of intervals ${intervals.length}`);
		const int = intervals[0];
		assert.equal(
			int.stickiness,
			IntervalStickiness.START,
			`unexpected stickiness ${int.stickiness}`,
		);
		assert.equal(int.startSide, Side.After, "start side is Before");
		assert.equal(int.endSide, Side.After, "end side is Before");
	});

	it("reverts stickiness on interval change", () => {
		collection.on("changeInterval", (interval, previousInterval) => {
			appendChangeIntervalToRevertibles(sharedString, interval, previousInterval, revertibles);
		});

		sharedString.insertText(0, "hello world");
		const id = collection
			.add({
				start: { pos: 4, side: Side.After },
				end: { pos: 5, side: Side.After },
			})
			.getIntervalId();
		collection.change(id, {
			start: { pos: 1, side: Side.Before },
			end: { pos: 6, side: Side.Before },
		});

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));
		const int = collection.getIntervalById(id);
		assert.notEqual(int, undefined, "no interval");
		assert.equal(
			int?.stickiness,
			IntervalStickiness.START,
			`unexpected stickiness ${int?.stickiness}`,
		);
		assert.equal(int.startSide, Side.After, "start side is Before");
		assert.equal(int.endSide, Side.After, "end side is Before");
	});

	it("preserves stickiness on remove range", () => {
		sharedString.insertText(0, "hello world");

		sharedString.on("sequenceDelta", (op) => {
			appendSharedStringDeltaToRevertibles(sharedString, op, revertibles);
		});

		const id = collection
			.add({
				start: { pos: 2, side: Side.After },
				end: { pos: 4, side: Side.After },
			})
			.getIntervalId();
		sharedString.removeRange(0, 6);
		revertSharedStringRevertibles(sharedString, revertibles.splice(0));

		const interval = collection.getIntervalById(id);
		assert.notEqual(interval, undefined, "no interval");
		assert.equal(
			interval?.stickiness,
			IntervalStickiness.START,
			`unexpected stickiness ${interval?.stickiness}`,
		);
		assert.equal(interval.startSide, Side.After, "start side is Before");
		assert.equal(interval.endSide, Side.After, "end side is Before");
	});
});

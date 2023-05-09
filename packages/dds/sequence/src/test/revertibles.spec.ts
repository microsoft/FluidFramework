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
	let containerRuntimeFactory: MockContainerRuntimeFactory;
	const stringFactory = new SharedStringFactory();

	beforeEach(() => {
		containerRuntimeFactory = new MockContainerRuntimeFactory();

		dataStoreRuntime1 = new MockFluidDataStoreRuntime({ clientId: "1" });
		dataStoreRuntime1.local = false;
		sharedString = stringFactory.create(dataStoreRuntime1, "shared-string-1");

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

	it("revert direct interval insert", () => {
		collection.on("addInterval", (interval, local, op) => {
			appendLocalAddToRevertibles(interval, revertibles);
		});

		sharedString.insertText(0, "hello world");
		collection.add(0, 5, IntervalType.SlideOnRemove);

		revertIntervalRevertibles(sharedString, revertibles.splice(0));
		assertIntervals(sharedString, collection, []);
	});
	it("revert direct interval remove", () => {
		collection.on("deleteInterval", (interval, local, op) => {
			appendLocalDeleteToRevertibles(sharedString, interval, revertibles);
		});

		sharedString.insertText(0, "hello world");
		const id = collection.add(0, 5, IntervalType.SlideOnRemove).getIntervalId();
		collection.removeIntervalById(id);

		revertIntervalRevertibles(sharedString, revertibles.splice(0));
		assertIntervals(sharedString, collection, [{ start: 0, end: 5 }]);
	});
	it("revert direct interval change", () => {
		collection.on("changeInterval", (interval, previousInterval, local, op) => {
			appendLocalChangeToRevertibles(sharedString, interval, previousInterval, revertibles);
		});

		sharedString.insertText(0, "hello world");
		const id = collection.add(0, 5, IntervalType.SlideOnRemove).getIntervalId();
		collection.change(id, 1, 6);

		revertIntervalRevertibles(sharedString, revertibles.splice(0));
		assertIntervals(sharedString, collection, [{ start: 0, end: 5 }]);
	});
	it("revert direct interval property change", () => {
		collection.on("propertyChanged", (interval, propertyDeltas, local, op) => {
			appendLocalPropertyChangedToRevertibles(interval, propertyDeltas, revertibles);
		});

		sharedString.insertText(0, "hello world");
		const id = collection.add(0, 5, IntervalType.SlideOnRemove, { foo: "one" }).getIntervalId();
		collection.changeProperties(id, { foo: "two" });

		revertIntervalRevertibles(sharedString, revertibles.splice(0));
		assertIntervals(sharedString, collection, [{ start: 0, end: 5 }]);
		const int = collection.getIntervalById(id);
		assert.equal(int?.properties.foo, "one");
	});
	it("reverts multiple interval adds", () => {
		collection.on("addInterval", (interval, local, op) => {
			appendLocalAddToRevertibles(interval, revertibles);
		});

		sharedString.insertText(0, "hello world");
		collection.add(0, 5, IntervalType.SlideOnRemove);
		collection.add(5, 7, IntervalType.SlideOnRemove);

		revertIntervalRevertibles(sharedString, revertibles.splice(0));
		assertIntervals(sharedString, collection, []);
	});
	it("reverts multiple interval removes", () => {
		collection.on("deleteInterval", (interval, local, op) => {
			appendLocalDeleteToRevertibles(sharedString, interval, revertibles);
		});

		sharedString.insertText(0, "hello world");
		const id = collection.add(0, 5, IntervalType.SlideOnRemove).getIntervalId();
		const id2 = collection.add(5, 7, IntervalType.SlideOnRemove).getIntervalId();
		collection.removeIntervalById(id);
		collection.removeIntervalById(id2);

		revertIntervalRevertibles(sharedString, revertibles.splice(0));
		assertIntervals(sharedString, collection, [
			{ start: 0, end: 5 },
			{ start: 5, end: 7 },
		]);
	});
	it("performs multiple reverts on the same interval", () => {
		collection.on("addInterval", (interval, local, op) => {
			appendLocalAddToRevertibles(interval, revertibles);
		});

		collection.on("deleteInterval", (interval, local, op) => {
			appendLocalDeleteToRevertibles(sharedString, interval, revertibles);
		});

		collection.on("changeInterval", (interval, previousInterval, local, op) => {
			appendLocalChangeToRevertibles(sharedString, interval, previousInterval, revertibles);
		});

		sharedString.insertText(0, "hello world");
		const id = collection.add(0, 5, IntervalType.SlideOnRemove).getIntervalId();
		collection.change(id, 3, 8);
		collection.removeIntervalById(id);

		revertIntervalRevertibles(sharedString, revertibles.splice(0));
		assertIntervals(sharedString, collection, []);
	});
	it("performs two local changes, then reverts the first", () => {
		collection.on("addInterval", (interval, local, op) => {
			appendLocalAddToRevertibles(interval, revertibles);
		});

		sharedString.insertText(0, "hello world");
		const id = collection.add(0, 5, IntervalType.SlideOnRemove).getIntervalId();
		collection.change(id, 3, 8);

		revertIntervalRevertibles(sharedString, revertibles.splice(0));
		assertIntervals(sharedString, collection, []);
	});
	it("checks that revert functions properly when an id is recreated on revert of a delete", () => {
		sharedString.insertText(0, "hello world");
		const id = collection.add(0, 5, IntervalType.SlideOnRemove).getIntervalId();

		collection.on("deleteInterval", (interval, local, op) => {
			appendLocalDeleteToRevertibles(sharedString, interval, revertibles);
		});
		collection.on("changeInterval", (interval, previousInterval, local, op) => {
			appendLocalChangeToRevertibles(sharedString, interval, previousInterval, revertibles);
		});

		collection.change(id, 3, 8);
		collection.removeIntervalById(id);

		revertIntervalRevertibles(sharedString, revertibles.splice(0));
		assertIntervals(sharedString, collection, [{ start: 0, end: 5 }]);
	});
	it("checks that revertibles still finds correct interval across multiple remove and reverts", () => {
		sharedString.insertText(0, "hello world");
		const id = collection.add(0, 5, IntervalType.SlideOnRemove).getIntervalId();

		collection.on("deleteInterval", (interval, local, op) => {
			appendLocalDeleteToRevertibles(sharedString, interval, revertibles);
		});
		collection.on("changeInterval", (interval, previousInterval, local, op) => {
			appendLocalChangeToRevertibles(sharedString, interval, previousInterval, revertibles);
		});

		collection.change(id, 3, 8);
		collection.removeIntervalById(id);

		revertIntervalRevertibles(sharedString, revertibles.splice(1, 1));
		assertIntervals(sharedString, collection, [{ start: 3, end: 8 }]);

		const intervals = Array.from(collection);
		const removed = collection.removeIntervalById(intervals[0].getIntervalId());
		assert(removed, "interval was not removed from the collection");

		revertIntervalRevertibles(sharedString, revertibles.splice(0));
		assertIntervals(sharedString, collection, [{ start: 0, end: 5 }]);
	});
});
describe("Sequence.Revertibles with Remote Edits", () => {
	let sharedString: SharedString;
	let dataStoreRuntime1: MockFluidDataStoreRuntime;
	let collection: IntervalCollection<SequenceInterval>;
	let collection2: IntervalCollection<SequenceInterval>;
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
		collection2 = sharedString2.getIntervalCollection("test");
	});

	it("remote string remove interacting with reverting an interval remove", () => {
		collection.on("deleteInterval", (interval, local, op) => {
			appendLocalDeleteToRevertibles(sharedString, interval, revertibles);
		});
		sharedString.insertText(0, "hello world");
		const id = collection.add(0, 5, IntervalType.SlideOnRemove).getIntervalId();
		collection.removeIntervalById(id);
		containerRuntimeFactory.processAllMessages();

		sharedString2.removeRange(1, 3);
		containerRuntimeFactory.processAllMessages();

		revertIntervalRevertibles(sharedString, revertibles.splice(0));
		containerRuntimeFactory.processAllMessages();

		assert.equal(sharedString.getText(), sharedString2.getText());
		assertIntervals(sharedString, collection, [{ start: 0, end: 3 }]);
		assertIntervals(sharedString2, collection2, [{ start: 0, end: 3 }]);
	});
	it("remote string remove that shares an endpoint with a removed interval that gets reverted", () => {
		collection.on("deleteInterval", (interval, local, op) => {
			appendLocalDeleteToRevertibles(sharedString, interval, revertibles);
		});
		sharedString.insertText(0, "hello world");
		const id = collection.add(0, 5, IntervalType.SlideOnRemove).getIntervalId();
		collection.removeIntervalById(id);
		containerRuntimeFactory.processAllMessages();

		sharedString2.removeRange(0, 3);
		containerRuntimeFactory.processAllMessages();

		revertIntervalRevertibles(sharedString, revertibles.splice(0));
		containerRuntimeFactory.processAllMessages();

		assert.equal(sharedString.getText(), sharedString2.getText());
		assertIntervals(sharedString, collection, [{ start: 0, end: 2 }]);
		assertIntervals(sharedString2, collection2, [{ start: 0, end: 2 }]);
	});
	it("remote string add interacting with reverting an interval remove", () => {
		collection.on("deleteInterval", (interval, local, op) => {
			appendLocalDeleteToRevertibles(sharedString, interval, revertibles);
		});
		sharedString.insertText(0, "hello world");
		const id = collection.add(0, 7, IntervalType.SlideOnRemove).getIntervalId();
		containerRuntimeFactory.processAllMessages();

		collection.removeIntervalById(id);
		sharedString2.insertText(5, " hi");
		containerRuntimeFactory.processAllMessages();

		revertIntervalRevertibles(sharedString, revertibles.splice(0));
		containerRuntimeFactory.processAllMessages();

		assert.equal(sharedString.getText(), sharedString2.getText());
		assertIntervals(sharedString, collection, [{ start: 0, end: 10 }]);
		assertIntervals(sharedString2, collection2, [{ start: 0, end: 10 }]);
	});
	it("remote interval change interacting with reverting an interval remove", () => {
		sharedString.insertText(0, "hello world");
		const id = collection.add(0, 5, IntervalType.SlideOnRemove).getIntervalId();
		containerRuntimeFactory.processAllMessages();

		collection2.change(id, 3, 8);

		collection.on("deleteInterval", (interval, local, op) => {
			appendLocalDeleteToRevertibles(sharedString, interval, revertibles);
		});
		collection.removeIntervalById(id);

		revertIntervalRevertibles(sharedString, revertibles.splice(0));
		containerRuntimeFactory.processAllMessages();

		assertIntervals(sharedString, collection, [{ start: 0, end: 5 }]);
		assertIntervals(sharedString2, collection2, [{ start: 0, end: 5 }]);
	});
	it("remote interval change interacting with reverting an interval remove with ack before revert", () => {
		sharedString.insertText(0, "hello world");
		const id = collection.add(0, 5, IntervalType.SlideOnRemove).getIntervalId();
		containerRuntimeFactory.processAllMessages();

		collection2.change(id, 3, 8);

		collection.on("deleteInterval", (interval, local, op) => {
			appendLocalDeleteToRevertibles(sharedString, interval, revertibles);
		});
		collection.removeIntervalById(id);
		containerRuntimeFactory.processAllMessages();

		revertIntervalRevertibles(sharedString, revertibles.splice(0));
		containerRuntimeFactory.processAllMessages();

		assertIntervals(sharedString, collection, [{ start: 0, end: 5 }]);
		assertIntervals(sharedString2, collection2, [{ start: 0, end: 5 }]);
	});
	it("acked remote interval change interacting with reverting an interval change", () => {
		sharedString.insertText(0, "hello world");
		const id = collection.add(0, 5, IntervalType.SlideOnRemove).getIntervalId();
		containerRuntimeFactory.processAllMessages();

		collection2.change(id, 3, 8);

		collection.on("changeInterval", (interval, previousInterval, local, op) => {
			appendLocalChangeToRevertibles(sharedString, interval, previousInterval, revertibles);
		});
		collection.change(id, 4, 9);
		containerRuntimeFactory.processOneMessage();

		revertIntervalRevertibles(sharedString, revertibles.splice(0));
		containerRuntimeFactory.processAllMessages();

		assertIntervals(sharedString, collection, [{ start: 0, end: 5 }]);
		assertIntervals(sharedString2, collection2, [{ start: 0, end: 5 }]);
	});
	it("remote interval remove interacting with reverting an interval change", () => {
		sharedString.insertText(0, "hello world");
		const id = collection.add(0, 5, IntervalType.SlideOnRemove).getIntervalId();
		containerRuntimeFactory.processAllMessages();

		collection.on("changeInterval", (interval, previousInterval, local, op) => {
			appendLocalChangeToRevertibles(sharedString, interval, previousInterval, revertibles);
		});
		collection.change(id, 3, 8);
		containerRuntimeFactory.processAllMessages();

		collection2.removeIntervalById(id);

		revertIntervalRevertibles(sharedString, revertibles.splice(0));
		containerRuntimeFactory.processAllMessages();

		assertIntervals(sharedString, collection, []);
		assertIntervals(sharedString2, collection2, []);
	});
	it("remote interval remove interacting with reverting an interval property change", () => {
		sharedString.insertText(0, "hello world");
		const id = collection.add(0, 5, IntervalType.SlideOnRemove, { foo: "one" }).getIntervalId();
		containerRuntimeFactory.processAllMessages();

		collection.on("propertyChanged", (interval, propertyDeltas, local, op) => {
			appendLocalPropertyChangedToRevertibles(interval, propertyDeltas, revertibles);
		});
		collection.changeProperties(id, { foo: "two" });

		collection2.removeIntervalById(id);
		containerRuntimeFactory.processAllMessages();

		revertIntervalRevertibles(sharedString, revertibles.splice(0));
		containerRuntimeFactory.processAllMessages();

		assertIntervals(sharedString, collection, []);
		assertIntervals(sharedString2, collection2, []);
	});
	it("remote interval remove interacting with reverting an interval remove", () => {
		sharedString.insertText(0, "hello world");
		const id = collection.add(0, 5, IntervalType.SlideOnRemove).getIntervalId();
		containerRuntimeFactory.processAllMessages();

		collection.on("deleteInterval", (interval, local, op) => {
			appendLocalDeleteToRevertibles(sharedString, interval, revertibles);
		});
		collection.removeIntervalById(id);

		collection2.removeIntervalById(id);
		containerRuntimeFactory.processAllMessages();

		revertIntervalRevertibles(sharedString, revertibles.splice(0));
		containerRuntimeFactory.processAllMessages();

		assertIntervals(sharedString, collection, [{ start: 0, end: 5 }]);
		assertIntervals(sharedString2, collection2, [{ start: 0, end: 5 }]);
	});
	it("remote interval property change interacting with reverting an interval remove", () => {
		sharedString.insertText(0, "hello world");
		const id = collection.add(0, 5, IntervalType.SlideOnRemove, { foo: "one" }).getIntervalId();
		containerRuntimeFactory.processAllMessages();

		collection.on("deleteInterval", (interval, local, op) => {
			appendLocalDeleteToRevertibles(sharedString, interval, revertibles);
		});
		collection.removeIntervalById(id);

		collection2.changeProperties(id, { foo: "two" });
		containerRuntimeFactory.processAllMessages();

		revertIntervalRevertibles(sharedString, revertibles.splice(0));
		containerRuntimeFactory.processAllMessages();

		assertIntervals(sharedString, collection, [{ start: 0, end: 5 }]);
		assertIntervals(sharedString2, collection2, [{ start: 0, end: 5 }]);
		const intervals = Array.from(collection);
		assert.equal(intervals[0].properties.foo, "one");
	});
	it("remote interval property change interacting with reverting an interval add", () => {
		sharedString.insertText(0, "hello world");
		const id = collection.add(0, 5, IntervalType.SlideOnRemove, { foo: "one" }).getIntervalId();
		containerRuntimeFactory.processAllMessages();

		collection.on("addInterval", (interval, local, op) => {
			appendLocalAddToRevertibles(interval, revertibles);
		});
		collection.add(2, 7, IntervalType.SlideOnRemove);

		collection2.changeProperties(id, { foo: "two" });
		containerRuntimeFactory.processAllMessages();

		revertIntervalRevertibles(sharedString, revertibles.splice(0));
		containerRuntimeFactory.processAllMessages();

		assertIntervals(sharedString, collection, [{ start: 0, end: 5 }]);
		assertIntervals(sharedString2, collection2, [{ start: 0, end: 5 }]);
		const int = collection.getIntervalById(id);
		assert.equal(int?.properties.foo, "two");
	});
	it("remote interval property change interacting with reverting an interval change", () => {
		sharedString.insertText(0, "hello world");
		const id = collection.add(0, 5, IntervalType.SlideOnRemove, { foo: "one" }).getIntervalId();
		containerRuntimeFactory.processAllMessages();

		collection.on("changeInterval", (interval, previousInterval, local, op) => {
			appendLocalChangeToRevertibles(sharedString, interval, previousInterval, revertibles);
		});
		collection.change(id, 3, 8);

		collection2.changeProperties(id, { foo: "two" });
		containerRuntimeFactory.processAllMessages();

		revertIntervalRevertibles(sharedString, revertibles.splice(0));
		containerRuntimeFactory.processAllMessages();

		assertIntervals(sharedString, collection, [{ start: 0, end: 5 }]);
		assertIntervals(sharedString2, collection2, [{ start: 0, end: 5 }]);
		const int = collection.getIntervalById(id);
		assert.equal(int?.properties.foo, "two");
	});
	it("remote interval property change interacting with reverting an interval property change", () => {
		sharedString.insertText(0, "hello world");
		const id = collection.add(0, 5, IntervalType.SlideOnRemove, { foo: "one" }).getIntervalId();
		containerRuntimeFactory.processAllMessages();

		collection.on("propertyChanged", (interval, propertyDeltas, local, op) => {
			if (local) {
				appendLocalPropertyChangedToRevertibles(interval, propertyDeltas, revertibles);
			}
		});
		collection.changeProperties(id, { foo: "two", bar: "one" });

		collection2.changeProperties(id, { foo: "three", bar: "one" });
		containerRuntimeFactory.processAllMessages();

		revertIntervalRevertibles(sharedString, revertibles.splice(0));
		containerRuntimeFactory.processAllMessages();

		assertIntervals(sharedString, collection, [{ start: 0, end: 5 }]);
		assertIntervals(sharedString2, collection2, [{ start: 0, end: 5 }]);
		const int = collection.getIntervalById(id);
		assert.equal(int?.properties.foo, "one");
		assert.equal(int?.properties.bar, undefined);
	});
});

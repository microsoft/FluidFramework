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
	appendAddIntervalToRevertibles,
	appendChangeIntervalToRevertibles,
	appendDeleteIntervalToRevertibles,
	appendIntervalPropertyChangedToRevertibles,
	appendSharedStringDeltaToRevertibles,
	revertSharedStringRevertibles,
	SharedStringRevertible,
} from "../revertibles";
import { SharedString } from "../sharedString";
import { IIntervalCollection, IntervalType, SequenceInterval } from "../intervalCollection";
import { SharedStringFactory } from "../sequenceFactory";
import { assertIntervals } from "./intervalUtils";

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
			appendAddIntervalToRevertibles(interval, revertibles);
		});

		sharedString.insertText(0, "hello world");
		collection.add(0, 5, IntervalType.SlideOnRemove);

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));
		assertIntervals(sharedString, collection, []);
	});
	it("revert direct interval remove", () => {
		collection.on("deleteInterval", (interval, local, op) => {
			appendDeleteIntervalToRevertibles(sharedString, interval, revertibles);
		});

		sharedString.insertText(0, "hello world");
		const id = collection.add(0, 5, IntervalType.SlideOnRemove).getIntervalId();
		collection.removeIntervalById(id);

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));
		assertIntervals(sharedString, collection, [{ start: 0, end: 5 }]);
	});
	it("revert direct interval change", () => {
		collection.on("changeInterval", (interval, previousInterval, local, op) => {
			appendChangeIntervalToRevertibles(
				sharedString,
				interval,
				previousInterval,
				revertibles,
			);
		});

		sharedString.insertText(0, "hello world");
		const id = collection.add(0, 5, IntervalType.SlideOnRemove).getIntervalId();
		collection.change(id, 1, 6);

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));
		assertIntervals(sharedString, collection, [{ start: 0, end: 5 }]);
	});
	it("revert direct interval property change", () => {
		collection.on("propertyChanged", (interval, propertyDeltas, local, op) => {
			appendIntervalPropertyChangedToRevertibles(interval, propertyDeltas, revertibles);
		});

		sharedString.insertText(0, "hello world");
		const id = collection.add(0, 5, IntervalType.SlideOnRemove, { foo: "one" }).getIntervalId();
		collection.changeProperties(id, { foo: "two" });

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));
		assertIntervals(sharedString, collection, [{ start: 0, end: 5 }]);
		const int = collection.getIntervalById(id);
		assert.equal(int?.properties.foo, "one");
	});
	it("reverts multiple interval adds", () => {
		collection.on("addInterval", (interval, local, op) => {
			appendAddIntervalToRevertibles(interval, revertibles);
		});

		sharedString.insertText(0, "hello world");
		collection.add(0, 5, IntervalType.SlideOnRemove);
		collection.add(5, 7, IntervalType.SlideOnRemove);

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));
		assertIntervals(sharedString, collection, []);
	});
	it("reverts multiple interval removes", () => {
		collection.on("deleteInterval", (interval, local, op) => {
			appendDeleteIntervalToRevertibles(sharedString, interval, revertibles);
		});

		sharedString.insertText(0, "hello world");
		const id = collection.add(0, 5, IntervalType.SlideOnRemove).getIntervalId();
		const id2 = collection.add(5, 7, IntervalType.SlideOnRemove).getIntervalId();
		collection.removeIntervalById(id);
		collection.removeIntervalById(id2);

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));
		assertIntervals(sharedString, collection, [
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
			appendChangeIntervalToRevertibles(
				sharedString,
				interval,
				previousInterval,
				revertibles,
			);
		});

		sharedString.insertText(0, "hello world");
		const id = collection.add(0, 5, IntervalType.SlideOnRemove).getIntervalId();
		collection.change(id, 3, 8);
		collection.removeIntervalById(id);

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));
		assertIntervals(sharedString, collection, []);
	});
	it("performs two local changes, then reverts the first", () => {
		collection.on("addInterval", (interval, local, op) => {
			appendAddIntervalToRevertibles(interval, revertibles);
		});

		sharedString.insertText(0, "hello world");
		const id = collection.add(0, 5, IntervalType.SlideOnRemove).getIntervalId();
		collection.change(id, 3, 8);

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));
		assertIntervals(sharedString, collection, []);
	});
	it("checks that revert functions properly when an id is recreated on revert of a delete", () => {
		sharedString.insertText(0, "hello world");
		const id = collection.add(0, 5, IntervalType.SlideOnRemove).getIntervalId();

		collection.on("deleteInterval", (interval, local, op) => {
			appendDeleteIntervalToRevertibles(sharedString, interval, revertibles);
		});
		collection.on("changeInterval", (interval, previousInterval, local, op) => {
			appendChangeIntervalToRevertibles(
				sharedString,
				interval,
				previousInterval,
				revertibles,
			);
		});

		collection.change(id, 3, 8);
		collection.removeIntervalById(id);

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));
		assertIntervals(sharedString, collection, [{ start: 0, end: 5 }]);
	});
	it("checks that revertibles still finds correct interval across multiple remove and reverts", () => {
		sharedString.insertText(0, "hello world");
		const id = collection.add(0, 5, IntervalType.SlideOnRemove).getIntervalId();

		collection.on("deleteInterval", (interval, local, op) => {
			appendDeleteIntervalToRevertibles(sharedString, interval, revertibles);
		});
		collection.on("changeInterval", (interval, previousInterval, local, op) => {
			appendChangeIntervalToRevertibles(
				sharedString,
				interval,
				previousInterval,
				revertibles,
			);
		});

		collection.change(id, 3, 8);
		collection.removeIntervalById(id);

		revertSharedStringRevertibles(sharedString, revertibles.splice(1, 1));
		assertIntervals(sharedString, collection, [{ start: 3, end: 8 }]);

		const intervals = Array.from(collection);
		const removed = collection.removeIntervalById(intervals[0].getIntervalId());
		assert(removed, "interval was not removed from the collection");

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));
		assertIntervals(sharedString, collection, [{ start: 0, end: 5 }]);
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
			appendDeleteIntervalToRevertibles(sharedString, interval, revertibles);
		});
		sharedString.insertText(0, "hello world");
		const id = collection.add(0, 5, IntervalType.SlideOnRemove).getIntervalId();
		collection.removeIntervalById(id);
		containerRuntimeFactory.processAllMessages();

		sharedString2.removeRange(1, 3);
		containerRuntimeFactory.processAllMessages();

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));
		containerRuntimeFactory.processAllMessages();

		assert.equal(sharedString.getText(), sharedString2.getText());
		assertIntervals(sharedString, collection, [{ start: 0, end: 3 }]);
		assertIntervals(sharedString2, collection2, [{ start: 0, end: 3 }]);
	});
	it("remote string remove that shares an endpoint with a removed interval that gets reverted", () => {
		collection.on("deleteInterval", (interval, local, op) => {
			appendDeleteIntervalToRevertibles(sharedString, interval, revertibles);
		});
		sharedString.insertText(0, "hello world");
		const id = collection.add(0, 5, IntervalType.SlideOnRemove).getIntervalId();
		collection.removeIntervalById(id);
		containerRuntimeFactory.processAllMessages();

		sharedString2.removeRange(0, 3);
		containerRuntimeFactory.processAllMessages();

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));
		containerRuntimeFactory.processAllMessages();

		assert.equal(sharedString.getText(), sharedString2.getText());
		assertIntervals(sharedString, collection, [{ start: 0, end: 2 }]);
		assertIntervals(sharedString2, collection2, [{ start: 0, end: 2 }]);
	});
	it("remote string add interacting with reverting an interval remove", () => {
		collection.on("deleteInterval", (interval, local, op) => {
			appendDeleteIntervalToRevertibles(sharedString, interval, revertibles);
		});
		sharedString.insertText(0, "hello world");
		const id = collection.add(0, 7, IntervalType.SlideOnRemove).getIntervalId();
		containerRuntimeFactory.processAllMessages();

		collection.removeIntervalById(id);
		sharedString2.insertText(5, " hi");
		containerRuntimeFactory.processAllMessages();

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));
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
			appendDeleteIntervalToRevertibles(sharedString, interval, revertibles);
		});
		collection.removeIntervalById(id);

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));
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
			appendDeleteIntervalToRevertibles(sharedString, interval, revertibles);
		});
		collection.removeIntervalById(id);
		containerRuntimeFactory.processAllMessages();

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));
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
			appendChangeIntervalToRevertibles(
				sharedString,
				interval,
				previousInterval,
				revertibles,
			);
		});
		collection.change(id, 4, 9);
		containerRuntimeFactory.processOneMessage();

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));
		containerRuntimeFactory.processAllMessages();

		assertIntervals(sharedString, collection, [{ start: 0, end: 5 }]);
		assertIntervals(sharedString2, collection2, [{ start: 0, end: 5 }]);
	});
	it("remote interval remove interacting with reverting an interval change", () => {
		sharedString.insertText(0, "hello world");
		const id = collection.add(0, 5, IntervalType.SlideOnRemove).getIntervalId();
		containerRuntimeFactory.processAllMessages();

		collection.on("changeInterval", (interval, previousInterval, local, op) => {
			appendChangeIntervalToRevertibles(
				sharedString,
				interval,
				previousInterval,
				revertibles,
			);
		});
		collection.change(id, 3, 8);
		containerRuntimeFactory.processAllMessages();

		collection2.removeIntervalById(id);

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));
		containerRuntimeFactory.processAllMessages();

		assertIntervals(sharedString, collection, []);
		assertIntervals(sharedString2, collection2, []);
	});
	it("remote interval remove interacting with reverting an interval property change", () => {
		sharedString.insertText(0, "hello world");
		const id = collection.add(0, 5, IntervalType.SlideOnRemove, { foo: "one" }).getIntervalId();
		containerRuntimeFactory.processAllMessages();

		collection.on("propertyChanged", (interval, propertyDeltas, local, op) => {
			appendIntervalPropertyChangedToRevertibles(interval, propertyDeltas, revertibles);
		});
		collection.changeProperties(id, { foo: "two" });

		collection2.removeIntervalById(id);
		containerRuntimeFactory.processAllMessages();

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));
		containerRuntimeFactory.processAllMessages();

		assertIntervals(sharedString, collection, []);
		assertIntervals(sharedString2, collection2, []);
	});
	it("remote interval remove interacting with reverting an interval remove", () => {
		sharedString.insertText(0, "hello world");
		const id = collection.add(0, 5, IntervalType.SlideOnRemove).getIntervalId();
		containerRuntimeFactory.processAllMessages();

		collection.on("deleteInterval", (interval, local, op) => {
			appendDeleteIntervalToRevertibles(sharedString, interval, revertibles);
		});
		collection.removeIntervalById(id);

		collection2.removeIntervalById(id);
		containerRuntimeFactory.processAllMessages();

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));
		containerRuntimeFactory.processAllMessages();

		assertIntervals(sharedString, collection, [{ start: 0, end: 5 }]);
		assertIntervals(sharedString2, collection2, [{ start: 0, end: 5 }]);
	});
	it("remote interval property change interacting with reverting an interval remove", () => {
		sharedString.insertText(0, "hello world");
		const id = collection.add(0, 5, IntervalType.SlideOnRemove, { foo: "one" }).getIntervalId();
		containerRuntimeFactory.processAllMessages();

		collection.on("deleteInterval", (interval, local, op) => {
			appendDeleteIntervalToRevertibles(sharedString, interval, revertibles);
		});
		collection.removeIntervalById(id);

		collection2.changeProperties(id, { foo: "two" });
		containerRuntimeFactory.processAllMessages();

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));
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
			appendAddIntervalToRevertibles(interval, revertibles);
		});
		collection.add(2, 7, IntervalType.SlideOnRemove);

		collection2.changeProperties(id, { foo: "two" });
		containerRuntimeFactory.processAllMessages();

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));
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
			appendChangeIntervalToRevertibles(
				sharedString,
				interval,
				previousInterval,
				revertibles,
			);
		});
		collection.change(id, 3, 8);

		collection2.changeProperties(id, { foo: "two" });
		containerRuntimeFactory.processAllMessages();

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));
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
				appendIntervalPropertyChangedToRevertibles(interval, propertyDeltas, revertibles);
			}
		});
		collection.changeProperties(id, { foo: "two", bar: "one" });

		collection2.changeProperties(id, { foo: "three", bar: "one" });
		containerRuntimeFactory.processAllMessages();

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));
		containerRuntimeFactory.processAllMessages();

		assertIntervals(sharedString, collection, [{ start: 0, end: 5 }]);
		assertIntervals(sharedString2, collection2, [{ start: 0, end: 5 }]);
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
		let collection2: IIntervalCollection<SequenceInterval>;

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
			collection2 = sharedString2.getIntervalCollection("test");
		});

		it("handles remote remove of same range", () => {
			sharedString.insertText(0, "hello world");

			sharedString.on("sequenceDelta", (op) => {
				if (op.isLocal) {
					appendSharedStringDeltaToRevertibles(sharedString, op, revertibles);
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
			containerRuntimeFactory.processAllMessages();
			assertIntervals(sharedString2, collection2, [{ start: 2, end: 4 }]);
		});
		it("ignores remote interval move", () => {
			sharedString.insertText(0, "hello world");

			sharedString.on("sequenceDelta", (op) => {
				if (op.isLocal) {
					appendSharedStringDeltaToRevertibles(sharedString, op, revertibles);
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
			assertIntervals(sharedString, collection, [{ start: 2, end: 4 }]);
			containerRuntimeFactory.processAllMessages();
			assertIntervals(sharedString2, collection2, [{ start: 2, end: 4 }]);
		});
		it("handles remote interval delete", () => {
			sharedString.insertText(0, "hello world");

			sharedString.on("sequenceDelta", (op) => {
				if (op.isLocal) {
					appendSharedStringDeltaToRevertibles(sharedString, op, revertibles);
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
			assertIntervals(sharedString, collection, []);
			containerRuntimeFactory.processAllMessages();
			assertIntervals(sharedString2, collection2, []);
		});
		it("handles remote interval move with one contained endpoint", () => {
			sharedString.insertText(0, "hello world");

			sharedString.on("sequenceDelta", (op) => {
				if (op.isLocal) {
					appendSharedStringDeltaToRevertibles(sharedString, op, revertibles);
				}
			});

			const interval = collection.add(6, 8, IntervalType.SlideOnRemove);
			containerRuntimeFactory.processAllMessages();

			sharedString2.getIntervalCollection("test").change(interval.getIntervalId(), 1, 3);
			sharedString.removeRange(5, 7);
			containerRuntimeFactory.processAllMessages();

			assert.equal(revertibles.length, 1, "revertibles.length is not 1");
			revertSharedStringRevertibles(sharedString, revertibles.splice(0));

			assert.equal(sharedString.getText(), "hello world");
			// Intervals don't currently enforce that start >= end,
			// so this happens since only start was within the restored range
			assertIntervals(sharedString, collection, [{ start: 6, end: 3 }]);
			containerRuntimeFactory.processAllMessages();
			assertIntervals(sharedString2, collection2, [{ start: 6, end: 3 }]);
		});
	});

	it("has an interval contained within the deleted range", () => {
		sharedString.insertText(0, "hello world");

		sharedString.on("sequenceDelta", (op) => {
			appendSharedStringDeltaToRevertibles(sharedString, op, revertibles);
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
		assertIntervals(sharedString, collection, [{ start: 2, end: 4 }]);
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
			appendSharedStringDeltaToRevertibles(sharedString, op, revertibles);
		});

		collection.add(0, 6, IntervalType.SlideOnRemove);

		sharedString.removeRange(0, 6);

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));

		assert.equal(sharedString.getText(), "hello world");
		assertIntervals(sharedString, collection, [{ start: 0, end: 6 }]);
	});
	it("has an interval with one endpoint within the deleted range", () => {
		sharedString.insertText(0, "hello world");

		sharedString.on("sequenceDelta", (op) => {
			appendSharedStringDeltaToRevertibles(sharedString, op, revertibles);
		});

		collection.add(5, 9, IntervalType.SlideOnRemove);

		sharedString.removeRange(2, 7);

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));

		assert.equal(sharedString.getText(), "hello world");
		assertIntervals(sharedString, collection, [{ start: 5, end: 9 }]);
	});
	it("restores an interval after two removes", () => {
		sharedString.insertText(0, "hello world");

		sharedString.on("sequenceDelta", (op) => {
			appendSharedStringDeltaToRevertibles(sharedString, op, revertibles);
		});

		collection.add(3, 6, IntervalType.SlideOnRemove);

		// only one revertible object generated for both removes
		sharedString.removeRange(1, 4);
		sharedString.removeRange(3, 6);

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));

		assert.equal(sharedString.getText(), "hello world");
		assertIntervals(sharedString, collection, [{ start: 3, end: 6 }]);
	});
	it("reverts an ack'ed remove", () => {
		sharedString.insertText(0, "hello world");

		sharedString.on("sequenceDelta", (op) => {
			if (op.opArgs.sequencedMessage === undefined) {
				appendSharedStringDeltaToRevertibles(sharedString, op, revertibles);
			}
		});

		collection.add(5, 9, IntervalType.SlideOnRemove);

		sharedString.removeRange(2, 7);
		containerRuntimeFactory.processAllMessages();

		revertSharedStringRevertibles(sharedString, revertibles.splice(0));

		assert.equal(sharedString.getText(), "hello world");
		assertIntervals(sharedString, collection, [{ start: 5, end: 9 }]);
	});
	it("has multiple interval endpoints within the deleted range", () => {
		sharedString.insertText(0, "hello world");

		sharedString.on("sequenceDelta", (op) => {
			appendSharedStringDeltaToRevertibles(sharedString, op, revertibles);
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
			appendSharedStringDeltaToRevertibles(sharedString, op, revertibles);
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
			appendSharedStringDeltaToRevertibles(sharedString, op, revertibles);
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

	describe("mixed with direct interval edit revertibles", () => {
		it("reverts interval delete + remove range", () => {
			sharedString.insertText(0, "hello world");
			const id = collection.add(1, 5, IntervalType.SlideOnRemove).getIntervalId();

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
			assertIntervals(sharedString, collection, [{ start: 1, end: 5 }]);
		});
		it("reverts remove range + interval delete", () => {
			sharedString.insertText(0, "hello world");
			const id = collection.add(1, 5, IntervalType.SlideOnRemove).getIntervalId();

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
			assertIntervals(sharedString, collection, [{ start: 1, end: 5 }]);
		});
		it("reverts interval change + remove range", () => {
			sharedString.insertText(0, "hello world");
			const id = collection.add(1, 5, IntervalType.SlideOnRemove).getIntervalId();

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

			collection.change(id, 2, 4);
			sharedString.removeRange(0, 8);
			revertSharedStringRevertibles(sharedString, revertibles.splice(0));

			assert.equal(sharedString.getText(), "hello world");
			assertIntervals(sharedString, collection, [{ start: 1, end: 5 }]);
		});
		it("reverts interval change + remove range with interval start", () => {
			sharedString.insertText(0, "hello world");
			const id = collection.add(1, 5, IntervalType.SlideOnRemove).getIntervalId();

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

			collection.change(id, 2, 9);
			sharedString.removeRange(0, 8);
			revertSharedStringRevertibles(sharedString, revertibles.splice(0));

			assert.equal(sharedString.getText(), "hello world");
			assertIntervals(sharedString, collection, [{ start: 1, end: 5 }]);
		});
		it("reverts interval change + remove range containing only revertible refs", () => {
			sharedString.insertText(0, "hello world");
			const id = collection.add(1, 5, IntervalType.SlideOnRemove).getIntervalId();

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

			collection.change(id, 9, 10);
			sharedString.removeRange(0, 8);
			revertSharedStringRevertibles(sharedString, revertibles.splice(0));

			assert.equal(sharedString.getText(), "hello world");
			assertIntervals(sharedString, collection, [{ start: 1, end: 5 }]);
		});
		it("reverts remove range + interval change", () => {
			sharedString.insertText(0, "hello world");
			const id = collection.add(1, 5, IntervalType.SlideOnRemove).getIntervalId();

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
			collection.change(id, 1, 2);
			revertSharedStringRevertibles(sharedString, revertibles.splice(0));

			assert.equal(sharedString.getText(), "hello world");
			assertIntervals(sharedString, collection, [{ start: 1, end: 5 }]);
		});
	});
});

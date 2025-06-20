/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { AttachState } from "@fluidframework/container-definitions";
import {
	MockContainerRuntimeFactory,
	MockFluidDataStoreRuntime,
	MockStorage,
	type MockContainerRuntime,
} from "@fluidframework/test-runtime-utils/internal";

import { IntervalCollection } from "../intervalCollection.js";
import { SharedStringFactory } from "../sequenceFactory.js";
import { SharedStringClass } from "../sharedString.js";

interface RollbackTestSetup {
	sharedString: SharedStringClass;
	dataStoreRuntime: MockFluidDataStoreRuntime;
	containerRuntimeFactory: MockContainerRuntimeFactory;
	containerRuntime: MockContainerRuntime;
	collection: IntervalCollection;
}

function setupRollbackTest(): RollbackTestSetup {
	const containerRuntimeFactory = new MockContainerRuntimeFactory({ flushMode: 1 }); // TurnBased
	const dataStoreRuntime = new MockFluidDataStoreRuntime({ clientId: "1" });
	const containerRuntime = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);
	const sharedString = new SharedStringClass(
		dataStoreRuntime,
		"shared-string-1",
		SharedStringFactory.Attributes,
	);
	dataStoreRuntime.setAttachState(AttachState.Attached);
	sharedString.initializeLocal();
	sharedString.connect({
		deltaConnection: dataStoreRuntime.createDeltaConnection(),
		objectStorage: new MockStorage(),
	});
	const collection = sharedString.getIntervalCollection("test");
	assert(collection instanceof IntervalCollection);
	return {
		sharedString,
		dataStoreRuntime,
		containerRuntimeFactory,
		containerRuntime,
		collection,
	};
}

// Helper to create another client (interval collection) attached to the same containerRuntimeFactory
function createAdditionalClient(
	containerRuntimeFactory: MockContainerRuntimeFactory,
	id: string = "client-2",
): {
	sharedString: SharedStringClass;
	dataStoreRuntime: MockFluidDataStoreRuntime;
	containerRuntime: MockContainerRuntime;
	collection: IntervalCollection;
} {
	const dataStoreRuntime = new MockFluidDataStoreRuntime({ clientId: id });
	const containerRuntime = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);
	const sharedString = new SharedStringClass(
		dataStoreRuntime,
		`shared-string-${id}`,
		SharedStringFactory.Attributes,
	);
	dataStoreRuntime.setAttachState(AttachState.Attached);
	sharedString.initializeLocal();
	sharedString.connect({
		deltaConnection: dataStoreRuntime.createDeltaConnection(),
		objectStorage: new MockStorage(),
	});
	const collection = sharedString.getIntervalCollection("test");
	assert(collection instanceof IntervalCollection, "IntervalCollection instance expected");
	return { sharedString, dataStoreRuntime, containerRuntime, collection };
}

describe("SharedString IntervalCollection rollback", () => {
	it("should rollback addInterval operation", () => {
		const { sharedString, containerRuntimeFactory, containerRuntime, collection } =
			setupRollbackTest();
		sharedString.insertText(0, "abcde");
		containerRuntimeFactory.processAllMessages();
		const interval = collection.add({ start: 1, end: 3 });
		assert.equal(
			collection.getIntervalById(interval.getIntervalId()) !== undefined,
			true,
			"interval added",
		);
		containerRuntime.rollback?.();
		assert.equal(
			collection.getIntervalById(interval.getIntervalId()),
			undefined,
			"interval removed after rollback",
		);
		assert(interval.disposed, "should be disposed after rollback");
	});

	it("should rollback changeInterval operation", () => {
		const { sharedString, containerRuntimeFactory, containerRuntime, collection } =
			setupRollbackTest();
		sharedString.insertText(0, "abcde");
		containerRuntimeFactory.processAllMessages();
		const interval = collection.add({ start: 1, end: 3 });
		const intervalId = interval.getIntervalId();
		containerRuntime.flush();
		containerRuntimeFactory.processAllMessages();
		const changedInterval = collection.change(intervalId, { start: 2, end: 4 });
		let found = collection.getIntervalById(intervalId);
		assert(found);
		assert.equal(
			sharedString.localReferencePositionToPosition(found.start),
			2,
			"interval start changed",
		);
		containerRuntime.rollback?.();
		found = collection.getIntervalById(intervalId);
		assert(found);

		assert.equal(
			sharedString.localReferencePositionToPosition(found.start),
			1,
			"interval start reverted after rollback",
		);
		assert(!interval.disposed, "should not be disposed after rollback");
		assert(changedInterval?.disposed, "should be disposed after rollback");
	});

	it("should rollback removeInterval operation", () => {
		const { sharedString, containerRuntimeFactory, containerRuntime, collection } =
			setupRollbackTest();
		sharedString.insertText(0, "abcde");
		containerRuntimeFactory.processAllMessages();
		const interval = collection.add({ start: 1, end: 3 });
		const intervalId = interval.getIntervalId();
		containerRuntime.flush();
		containerRuntimeFactory.processAllMessages();
		collection.removeIntervalById(intervalId);
		assert.equal(collection.getIntervalById(intervalId), undefined, "interval removed");
		containerRuntime.rollback?.();
		assert.notEqual(
			collection.getIntervalById(intervalId),
			undefined,
			"interval restored after rollback",
		);
		assert(!interval.disposed, "should not be disposed after rollback");
	});

	it("should rollback multiple interval operations in sequence", () => {
		const { sharedString, containerRuntimeFactory, containerRuntime, collection } =
			setupRollbackTest();
		sharedString.insertText(0, "abcde");
		const i1 = collection.add({ start: 0, end: 2 });
		const i2 = collection.add({ start: 2, end: 4 });
		containerRuntime.flush();
		containerRuntimeFactory.processAllMessages();

		collection.change(i1.getIntervalId(), { start: 1, end: 3 });
		collection.removeIntervalById(i2.getIntervalId());
		assert.equal(
			collection.getIntervalById(i1.getIntervalId()) !== undefined,
			true,
			"i1 present",
		);
		assert.equal(collection.getIntervalById(i2.getIntervalId()), undefined, "i2 removed");
		containerRuntime.rollback?.();
		assert.equal(
			collection.getIntervalById(i1.getIntervalId()) !== undefined,
			true,
			"i1 present after rollback",
		);
		assert.equal(
			collection.getIntervalById(i2.getIntervalId()) !== undefined,
			true,
			"i2 restored after rollback",
		);
	});

	it("should not rollback already flushed (acked) interval operations", () => {
		const { sharedString, containerRuntimeFactory, containerRuntime, collection } =
			setupRollbackTest();
		sharedString.insertText(0, "abcde");
		containerRuntimeFactory.processAllMessages();
		const interval = collection.add({ start: 1, end: 3 });
		const intervalId = interval.getIntervalId();
		containerRuntime.flush();
		containerRuntimeFactory.processAllMessages();
		collection.change(intervalId, { start: 2, end: 4 });
		containerRuntime.flush();
		containerRuntimeFactory.processAllMessages();
		containerRuntime.rollback?.();
		const found = collection.getIntervalById(intervalId);
		assert(found);
		assert.equal(
			sharedString.localReferencePositionToPosition(found.start),
			2,
			"interval start not reverted after flush",
		);
		assert(!interval.disposed, "should not be disposed after rollback");
	});

	it("should be a no-op if rollback is called with no pending interval changes", () => {
		const { sharedString, containerRuntimeFactory, containerRuntime, collection } =
			setupRollbackTest();
		sharedString.insertText(0, "abcde");
		containerRuntimeFactory.processAllMessages();
		const interval = collection.add({ start: 1, end: 3 });
		const intervalId = interval.getIntervalId();
		containerRuntime.flush();
		containerRuntimeFactory.processAllMessages();
		containerRuntime.rollback?.();
		const found = collection.getIntervalById(intervalId);
		assert(found);
		assert.equal(
			sharedString.localReferencePositionToPosition(found.start),
			1,
			"interval unchanged after no-op rollback",
		);
		assert(!interval.disposed, "should not be disposed after rollback");
	});

	it("should rollback local changes in presence of remote changes from another client", () => {
		const { sharedString, containerRuntimeFactory, containerRuntime, collection } =
			setupRollbackTest();
		// Create a second client
		const {
			sharedString: sharedString2,
			containerRuntime: containerRuntime2,
			collection: collection2,
		} = createAdditionalClient(containerRuntimeFactory);

		sharedString.insertText(0, "abcde");
		// Client 1 adds an interval
		const interval1 = collection.add({ start: 0, end: 3 });
		const intervalId = interval1.getIntervalId();
		containerRuntime.flush();
		containerRuntimeFactory.processAllMessages();

		// Client 1 makes a local change (not flushed)
		{
			const change1 = collection.change(intervalId, {
				start: 1,
				end: 3,
				props: { change: "client1" },
			});
			assert(change1, "Interval should exist after local change");
			assert.equal(
				sharedString.localReferencePositionToPosition(change1.start),
				1,
				"interval start changed locally",
			);
		}
		// Client 2 makes a local change and flushes
		{
			const change2 = collection2.change(intervalId, {
				start: 2,
				end: 3,
				props: { change: "client2" },
			});
			assert(change2, "Interval should exist after local change");
			assert.equal(
				sharedString2.localReferencePositionToPosition(change2.start),
				2,
				"interval start changed locally",
			);
			containerRuntime2.flush();
			containerRuntimeFactory.processAllMessages();
		}

		// Rollback local change in client 1
		containerRuntime.rollback?.();
		containerRuntime.flush();
		containerRuntimeFactory.processAllMessages();
		// Should reflect remote change from client 2

		const found = collection.getIntervalById(intervalId);
		assert(found, "Interval should exist after rollback");
		assert.equal(found.properties?.change, "client2");
		assert.equal(
			sharedString.localReferencePositionToPosition(found.start),
			2,
			"interval start reflects remote change after rollback",
		);
	});

	it("should rollback remove in presence of remote changes from another client", () => {
		const { sharedString, containerRuntimeFactory, containerRuntime, collection } =
			setupRollbackTest();
		// Create a second client
		const {
			sharedString: sharedString2,
			containerRuntime: containerRuntime2,
			collection: collection2,
		} = createAdditionalClient(containerRuntimeFactory);

		sharedString.insertText(0, "abcde");
		// Client 1 adds an interval
		const interval1 = collection.add({ start: 0, end: 3 });
		const intervalId = interval1.getIntervalId();
		containerRuntime.flush();
		containerRuntimeFactory.processAllMessages();

		// Client 1 makes a local change (not flushed)
		{
			collection.removeIntervalById(intervalId);
		}
		// Client 2 makes a local change and flushes
		{
			const change2 = collection2.change(intervalId, {
				start: 2,
				end: 3,
				props: { change: "client2" },
			});
			assert(change2, "Interval should exist after local change");
			assert.equal(
				sharedString2.localReferencePositionToPosition(change2.start),
				2,
				"interval start changed locally",
			);
			containerRuntime2.flush();
			containerRuntimeFactory.processAllMessages();
		}

		// Rollback local change in client 1
		containerRuntime.rollback?.();
		containerRuntime.flush();
		containerRuntimeFactory.processAllMessages();
		// Should reflect remote change from client 2

		const found = collection.getIntervalById(intervalId);
		assert(found, "Interval should exist after rollback");
		assert.equal(found.properties?.change, "client2");
		assert.equal(
			sharedString.localReferencePositionToPosition(found.start),
			2,
			"interval start reflects remote change after rollback",
		);
	});
});

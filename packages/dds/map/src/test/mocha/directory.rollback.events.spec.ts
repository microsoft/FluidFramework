/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { AttachState } from "@fluidframework/container-definitions";
import {
	MockContainerRuntimeFactory,
	MockFluidDataStoreRuntime,
	MockStorage,
	type MockContainerRuntime,
} from "@fluidframework/test-runtime-utils/internal";

import { DirectoryFactory } from "../../directoryFactory.js";
import type { ISharedDirectory, IValueChanged } from "../../interfaces.js";

interface RollbackTestSetup {
	sharedDirectory: ISharedDirectory;
	dataStoreRuntime: MockFluidDataStoreRuntime;
	containerRuntimeFactory: MockContainerRuntimeFactory;
	containerRuntime: MockContainerRuntime;
}

const directoryFactory = new DirectoryFactory();

function setupRollbackTest(): RollbackTestSetup {
	const containerRuntimeFactory = new MockContainerRuntimeFactory({ flushMode: 1 }); // TurnBased
	const dataStoreRuntime = new MockFluidDataStoreRuntime({ clientId: "1" });
	const containerRuntime = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);
	const sharedDirectory = directoryFactory.create(dataStoreRuntime, "shared-directory-1");
	dataStoreRuntime.setAttachState(AttachState.Attached);
	sharedDirectory.connect({
		deltaConnection: dataStoreRuntime.createDeltaConnection(),
		objectStorage: new MockStorage(),
	});
	return {
		sharedDirectory,
		dataStoreRuntime,
		containerRuntimeFactory,
		containerRuntime,
	};
}

// Helper to create another client attached to the same containerRuntimeFactory
function createAdditionalClient(
	containerRuntimeFactory: MockContainerRuntimeFactory,
	id: string = "client-2",
): {
	sharedDirectory: ISharedDirectory;
	containerRuntime: MockContainerRuntime;
} {
	const dataStoreRuntime = new MockFluidDataStoreRuntime({ clientId: id });
	const containerRuntime = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);
	const sharedDirectory = directoryFactory.create(dataStoreRuntime, `shared-directory-${id}`);
	dataStoreRuntime.setAttachState(AttachState.Attached);
	sharedDirectory.connect({
		deltaConnection: dataStoreRuntime.createDeltaConnection(),
		objectStorage: new MockStorage(),
	});
	return { sharedDirectory, containerRuntime };
}

describe("SharedDirectory rollback and valueChanged event", () => {
	let sharedDirectory: ISharedDirectory;
	let containerRuntime: MockContainerRuntime;
	let containerRuntimeFactory: MockContainerRuntimeFactory;

	beforeEach(() => {
		({ sharedDirectory, containerRuntime, containerRuntimeFactory } = setupRollbackTest());
	});

	it("should trigger valueChanged event on rollback of set", () => {
		const events: IValueChanged[] = [];
		sharedDirectory.on("valueChanged", (e) => events.push(e));

		sharedDirectory.set("key1", "value1");
		assert.strictEqual(sharedDirectory.get("key1"), "value1");
		assert.strictEqual(events.length, 1);

		containerRuntime.rollback?.();

		assert.strictEqual(sharedDirectory.get("key1"), undefined);
		assert.strictEqual(events.length, 2);
		assert.strictEqual(events[1].key, "key1");
		assert.strictEqual(events[1].previousValue, "value1");
	});

	it("should trigger valueChanged event on rollback of delete", () => {
		sharedDirectory.set("key1", "value1");
		containerRuntime.flush();
		containerRuntimeFactory.processAllMessages();

		const events: IValueChanged[] = [];
		sharedDirectory.on("valueChanged", (e) => events.push(e));

		sharedDirectory.delete("key1");
		assert.strictEqual(sharedDirectory.get("key1"), undefined);
		assert.strictEqual(events.length, 1);

		containerRuntime.rollback?.();

		assert.strictEqual(sharedDirectory.get("key1"), "value1");
		assert.strictEqual(events.length, 2);
		assert.strictEqual(events[1].key, "key1");
		assert.strictEqual(events[1].previousValue, undefined);
	});

	it("should trigger valueChanged events on rollback of clear", () => {
		sharedDirectory.set("key1", "value1");
		sharedDirectory.set("key2", "value2");
		containerRuntime.flush();
		containerRuntimeFactory.processAllMessages();

		const events: IValueChanged[] = [];
		let clears = 0;
		sharedDirectory.on("valueChanged", (e) => events.push(e));
		sharedDirectory.on("clear", () => clears++);

		sharedDirectory.clear();
		assert.strictEqual(sharedDirectory.get("key1"), undefined);
		assert.strictEqual(sharedDirectory.get("key2"), undefined);
		assert.strictEqual(clears, 1);
		assert.strictEqual(events.length, 0);

		containerRuntime.rollback?.();

		assert.strictEqual(sharedDirectory.get("key1"), "value1");
		assert.strictEqual(sharedDirectory.get("key2"), "value2");
		assert.strictEqual(events.length, 2);
		assert.strictEqual(events[0].key, "key1");
		assert.strictEqual(events[1].key, "key2");
	});
});

describe("SharedDirectory rollback and valueChanged event with multiple clients", () => {
	let client1: ISharedDirectory;
	let client2: ISharedDirectory;
	let containerRuntime1: MockContainerRuntime;
	let containerRuntime2: MockContainerRuntime;
	let containerRuntimeFactory: MockContainerRuntimeFactory;

	beforeEach(() => {
		({
			sharedDirectory: client1,
			containerRuntimeFactory,
			containerRuntime: containerRuntime1,
		} = setupRollbackTest());

		({ sharedDirectory: client2, containerRuntime: containerRuntime2 } =
			createAdditionalClient(containerRuntimeFactory, "2"));
	});

	it("should trigger valueChanged event on rollback of set for one client", () => {
		const eventsClient1: IValueChanged[] = [];
		const eventsClient2: IValueChanged[] = [];

		client1.on("valueChanged", (e) => eventsClient1.push(e));
		client2.on("valueChanged", (e) => eventsClient2.push(e));

		client1.set("key1", "value1");
		assert.strictEqual(client1.get("key1"), "value1");

		// Rollback only affects client1's local changes
		containerRuntime1.rollback?.();

		assert.strictEqual(client1.get("key1"), undefined);
		assert.strictEqual(eventsClient1.length, 2);
		assert.strictEqual(eventsClient1[0].key, "key1");
		assert.strictEqual(eventsClient1[0].previousValue, "value1");

		// client2 never had the change locally, so no events
		assert.strictEqual(eventsClient2.length, 0);
	});

	it("should trigger valueChanged event on rollback of delete for one client", () => {
		client1.set("key1", "value1");
		containerRuntime1.flush();
		containerRuntimeFactory.processAllMessages();

		const eventsClient1: IValueChanged[] = [];
		const eventsClient2: IValueChanged[] = [];
		client1.on("valueChanged", (e) => eventsClient1.push(e));
		client2.on("valueChanged", (e) => eventsClient2.push(e));

		client1.delete("key1");
		assert.strictEqual(client1.get("key1"), undefined);

		containerRuntime1.rollback?.();

		assert.strictEqual(client1.get("key1"), "value1");
		assert.strictEqual(eventsClient1.length, 2);
		assert.strictEqual(eventsClient1[0].key, "key1");
		assert.strictEqual(eventsClient1[0].previousValue, undefined);

		assert.strictEqual(eventsClient2.length, 0);
	});

	it("should trigger valueChanged events on rollback of clear for one client", () => {
		client1.set("key1", "value1");
		client1.set("key2", "value2");
		containerRuntime1.flush();
		containerRuntimeFactory.processAllMessages();

		const eventsClient1: IValueChanged[] = [];
		const eventsClient2: IValueChanged[] = [];
		let clearsClient1 = 0;
		let clearsClient2 = 0;

		client1.on("valueChanged", (e) => eventsClient1.push(e));
		client2.on("valueChanged", (e) => eventsClient2.push(e));

		client1.on("clear", () => clearsClient1++);
		client2.on("clear", () => clearsClient2++);

		client1.clear();
		assert.strictEqual(client1.get("key1"), undefined);
		assert.strictEqual(client1.get("key2"), undefined);
		assert.strictEqual(clearsClient1, 1);
		assert.strictEqual(eventsClient1.length, 0);

		containerRuntime1.rollback?.();

		assert.strictEqual(client1.get("key1"), "value1");
		assert.strictEqual(client1.get("key2"), "value2");
		assert.strictEqual(eventsClient1.length, 2);
		assert.strictEqual(eventsClient1[0].key, "key1");
		assert.strictEqual(eventsClient1[1].key, "key2");

		// client2 should remain unaffected
		assert.strictEqual(eventsClient2.length, 0);
		assert.strictEqual(clearsClient2, 0);
	});
});

describe("SharedDirectory rollback event correctness with multiple clients", () => {
	let client1: ISharedDirectory;
	let client2: ISharedDirectory;
	let containerRuntime1: MockContainerRuntime;
	let containerRuntime2: MockContainerRuntime;
	let containerRuntimeFactory: MockContainerRuntimeFactory;

	beforeEach(() => {
		({
			sharedDirectory: client1,
			containerRuntimeFactory,
			containerRuntime: containerRuntime1,
		} = setupRollbackTest());

		({ sharedDirectory: client2, containerRuntime: containerRuntime2 } =
			createAdditionalClient(containerRuntimeFactory, "2"));
	});

	it("should fire valueChanged events for every state change, not just match final state", () => {
		const eventsClient1: IValueChanged[] = [];
		const eventsClient2: IValueChanged[] = [];

		client1.on("valueChanged", (e) => eventsClient1.push(e));
		client2.on("valueChanged", (e) => eventsClient2.push(e));

		// Step 1: Client1 sets key1
		client1.set("key1", "value1");
		assert.strictEqual(client1.get("key1"), "value1");
		assert.strictEqual(client2.get("key1"), "value1");

		// Step 2: Client2 sets key1 to a different value
		client2.set("key1", "value2");
		assert.strictEqual(client1.get("key1"), "value2");
		assert.strictEqual(client2.get("key1"), "value2");

		// Step 3: Client1 deletes key1
		client1.delete("key1");
		assert.strictEqual(client1.get("key1"), undefined);
		assert.strictEqual(client2.get("key1"), undefined);

		// Rollback Client1
		containerRuntime1.rollback?.();

		// Final state should match expected rollback state
		assert.strictEqual(client1.get("key1"), "value2");
		assert.strictEqual(client2.get("key1"), "value2");

		// Check that events for **each intermediate state change** fired correctly
		assert.deepStrictEqual(
			eventsClient1.map(({ key, previousValue }: IValueChanged) => ({
				key,
				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
				previousValue,
			})),
			[
				{ key: "key1", previousValue: undefined }, // set to "value1"
				{ key: "key1", previousValue: "value1" }, // overwritten by client2
				{ key: "key1", previousValue: "value2" }, // deleted
				{ key: "key1", previousValue: undefined }, // rollback restores to "value2"
			],
		);

		// Client2 did not rollback, so should see events for the set from client1 and its own set
		assert.deepStrictEqual(
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
			eventsClient2.map(({ key, previousValue }): IValueChanged => ({ key, previousValue })),
			[
				{ key: "key1", previousValue: undefined }, // initial set by client1
				{ key: "key1", previousValue: "value1" }, // set to value2 by itself
				{ key: "key1", previousValue: "value2" }, // deletion from client1
			],
		);
	});
});

describe("SharedDirectory rollback events", () => {
	let sharedDirectory: ISharedDirectory;
	let containerRuntime: MockContainerRuntime;
	let containerRuntimeFactory: MockContainerRuntimeFactory;

	beforeEach(() => {
		({ sharedDirectory, containerRuntime, containerRuntimeFactory } = setupRollbackTest());
	});

	it("should trigger subDirectoryDeleted event on rollback of subDirectoryCreated", () => {
		const events: { path: string; local: boolean; target: ISharedDirectory }[] = [];

		sharedDirectory.on("subDirectoryDeleted", (path, local, target) => {
			events.push({ path, local, target });
		});

		// Create a subdirectory
		sharedDirectory.createSubDirectory("subDir1");
		assert(
			sharedDirectory.getWorkingDirectory("subDir1") !== undefined,
			"subdirectory should exist after creation",
		);

		// Rollback
		containerRuntime.rollback?.();

		// The subdirectory should be removed
		assert.strictEqual(
			sharedDirectory.getWorkingDirectory("subDir1"),
			undefined,
			"subdirectory should be removed after rollback",
		);

		// The subDirectoryDeleted event should be triggered
		assert.strictEqual(
			events.length,
			1,
			"one subDirectoryDeleted event should have been emitted",
		);
		assert.strictEqual(events[0].path, "subDir1");
		assert.strictEqual(events[0].local, true);
		assert.strictEqual(events[0].target, sharedDirectory);
	});

	it("should trigger subDirectoryCreated event on rollback of subDirectoryDeleted", () => {
		const events: { path: string; local: boolean; target: ISharedDirectory }[] = [];

		sharedDirectory.createSubDirectory("subDir2");

		sharedDirectory.on("subDirectoryCreated", (path, local, target) => {
			events.push({ path, local, target });
		});

		// Delete the subdirectory
		sharedDirectory.deleteSubDirectory("subDir2");
		assert.strictEqual(
			sharedDirectory.getWorkingDirectory("subDir2"),
			undefined,
			"subdirectory should be deleted",
		);

		// Rollback
		containerRuntime.rollback?.();

		// The subdirectory should be restored
		assert(
			sharedDirectory.get("subDir2") !== undefined,
			"subdirectory should exist after rollback",
		);

		// The subDirectoryCreated event should be triggered
		assert.strictEqual(
			events.length,
			1,
			"one subDirectoryCreated event should have been emitted",
		);
		assert.strictEqual(events[0].path, "subDir2");
		assert.strictEqual(events[0].local, true);
		assert.strictEqual(events[0].target, sharedDirectory);
	});
});

describe("SharedDirectory rollback with multiple clients", () => {
	let client1: ISharedDirectory;
	let client2: ISharedDirectory;
	let containerRuntime1: MockContainerRuntime;
	let containerRuntime2: MockContainerRuntime;
	let containerRuntimeFactory: MockContainerRuntimeFactory;

	beforeEach(() => {
		({
			sharedDirectory: client1,
			containerRuntimeFactory,
			containerRuntime: containerRuntime1,
		} = setupRollbackTest());

		({ sharedDirectory: client2, containerRuntime: containerRuntime2 } =
			createAdditionalClient(containerRuntimeFactory, "2"));
	});

	it("should only rollback local subDirectoryCreated changes for one client", () => {
		const eventsClient1: { path: string; local: boolean; target: ISharedDirectory }[] = [];
		const eventsClient2: { path: string; local: boolean; target: ISharedDirectory }[] = [];

		client1.on("subDirectoryDeleted", (path, local, target) =>
			eventsClient1.push({ path, local, target }),
		);
		client2.on("subDirectoryDeleted", (path, local, target) =>
			eventsClient2.push({ path, local, target }),
		);

		// Client1 creates a subdirectory
		client1.createSubDirectory("sharedDir");

		// Client2 creates a subdirectory
		client2.createSubDirectory("sharedDir2");

		// Check that directories exist
		assert(client1.get("sharedDir") !== undefined);
		assert(client2.get("sharedDir2") !== undefined);

		// Rollback only affects client1's local changes
		containerRuntime1.rollback?.();

		// Client1's local subdirectory should be gone
		assert.strictEqual(client1.get("sharedDir"), undefined);

		// Client2's subdirectory remains
		assert(client1.get("sharedDir2") !== undefined);

		// Events triggered
		assert.strictEqual(eventsClient1.length, 1);
		assert.strictEqual(eventsClient1[0].path, "sharedDir");
		assert(eventsClient1[0].local);

		// Client2 did not get any subDirectoryDeleted events for client1's rollback
		assert.strictEqual(eventsClient2.length, 0);
	});

	it("should rollback local subDirectoryDeleted changes for one client", () => {
		const eventsClient1: { path: string; local: boolean; target: ISharedDirectory }[] = [];
		const eventsClient2: { path: string; local: boolean; target: ISharedDirectory }[] = [];

		// Create initial directories
		client1.createSubDirectory("dir1");
		client2.createSubDirectory("dir2");

		client1.on("subDirectoryCreated", (path, local, target) =>
			eventsClient1.push({ path, local, target }),
		);
		client2.on("subDirectoryCreated", (path, local, target) =>
			eventsClient2.push({ path, local, target }),
		);

		// Client1 deletes its own directory
		client1.deleteSubDirectory("dir1");

		// Client2 deletes its own directory
		client2.deleteSubDirectory("dir2");

		// Rollback client1
		containerRuntime1.rollback?.();

		// Client1's directory should be restored
		assert(client1.get("dir1") !== undefined);

		// Client2's directory remains deleted
		assert.strictEqual(client1.get("dir2"), undefined);

		// Event triggered for client1
		assert.strictEqual(eventsClient1.length, 1);
		assert.strictEqual(eventsClient1[0].path, "dir1");
		assert(eventsClient1[0].local);

		// Client2 did not get any subDirectoryCreated events from client1 rollback
		assert.strictEqual(eventsClient2.length, 0);
	});
});

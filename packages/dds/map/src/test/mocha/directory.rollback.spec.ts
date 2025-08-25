/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { setupRollbackTest, createAdditionalClient } from "@fluid-private/test-dds-utils";
import type {
	MockContainerRuntimeFactory,
	MockContainerRuntime,
} from "@fluidframework/test-runtime-utils/internal";

import { DirectoryFactory } from "../../directoryFactory.js";
import type { ISharedDirectory, IValueChanged } from "../../interfaces.js";

const directoryFactory = new DirectoryFactory();

describe("SharedDirectory rollback", () => {
	describe("Storage operations (root subdirectory)", () => {
		let sharedDirectory: ISharedDirectory;
		let containerRuntime: MockContainerRuntime;
		let containerRuntimeFactory: MockContainerRuntimeFactory;
		let sharedDirectory2: ISharedDirectory;
		let containerRuntime2: MockContainerRuntime;

		beforeEach(() => {
			({
				dds: sharedDirectory,
				containerRuntimeFactory,
				containerRuntime,
			} = setupRollbackTest<ISharedDirectory>(
				"client-1",
				(rt, id): ISharedDirectory => directoryFactory.create(rt, id),
			));
		});

		it("should rollback set operation", () => {
			const valueChanges: IValueChanged[] = [];
			sharedDirectory.on("valueChanged", (event: IValueChanged) => valueChanges.push(event));

			sharedDirectory.set("key1", "value1");
			assert.strictEqual(
				sharedDirectory.get("key1"),
				"value1",
				"Failed getting pending value",
			);
			assert.strictEqual(valueChanges.length, 1, "Should have one value change event");

			containerRuntime.rollback?.();

			assert.strictEqual(
				sharedDirectory.get("key1"),
				undefined,
				"Value should be rolled back",
			);
			assert.strictEqual(valueChanges.length, 2, "Should have two value change events");
			assert.strictEqual(valueChanges[1].key, "key1");
			assert.strictEqual(valueChanges[1].previousValue, "value1");
		});

		it("should rollback delete operation", () => {
			sharedDirectory.set("key1", "value1");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			const valueChanges: IValueChanged[] = [];
			sharedDirectory.on("valueChanged", (event: IValueChanged) => valueChanges.push(event));

			sharedDirectory.delete("key1");
			assert.strictEqual(sharedDirectory.get("key1"), undefined);
			assert.strictEqual(valueChanges.length, 1);

			containerRuntime.rollback?.();

			assert.strictEqual(sharedDirectory.get("key1"), "value1");
			assert.strictEqual(valueChanges.length, 2);
			assert.strictEqual(valueChanges[1].key, "key1");
			assert.strictEqual(valueChanges[1].previousValue, undefined);
		});

		it("should rollback clear operation", () => {
			sharedDirectory.set("key1", "value1");
			sharedDirectory.set("key2", "value2");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			const valueChanges: IValueChanged[] = [];
			let clears = 0;
			sharedDirectory.on("valueChanged", (e) => valueChanges.push(e));
			sharedDirectory.on("clear", () => clears++);

			sharedDirectory.clear();

			assert.strictEqual(sharedDirectory.get("key1"), undefined);
			assert.strictEqual(sharedDirectory.get("key2"), undefined);
			assert.strictEqual(valueChanges.length, 0);
			assert.strictEqual(clears, 1);

			containerRuntime.rollback?.();

			assert.strictEqual(sharedDirectory.get("key1"), "value1");
			assert.strictEqual(sharedDirectory.get("key2"), "value2");
			assert.strictEqual(valueChanges.length, 2);
			assert.strictEqual(valueChanges[0].key, "key1");
			assert.strictEqual(valueChanges[1].key, "key2");
		});

		it("should rollback multiple operations in sequence", () => {
			sharedDirectory.set("key1", "value1");
			sharedDirectory.set("key2", "value2");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			let valueChanges: IValueChanged[] = [];
			let clears = 0;
			sharedDirectory.on("valueChanged", (e) => valueChanges.push(e));
			sharedDirectory.on("clear", () => clears++);

			sharedDirectory.set("key3", "value3");
			sharedDirectory.delete("key1");
			sharedDirectory.set("key2", "newValue2");
			sharedDirectory.clear();
			sharedDirectory.set("key4", "value4");

			assert.deepStrictEqual([...sharedDirectory.entries()], [["key4", "value4"]]);
			assert.strictEqual(clears, 1);

			// Reset events and rollback
			valueChanges = [];
			clears = 0;
			containerRuntime.rollback?.();

			assert.deepStrictEqual(
				[...sharedDirectory.entries()],
				[
					["key1", "value1"],
					["key2", "value2"],
				],
			);
			assert.strictEqual(clears, 0);
		});

		it("should rollback local changes in presence of remote changes from another client", () => {
			({ dds: sharedDirectory2, containerRuntime: containerRuntime2 } = createAdditionalClient(
				containerRuntimeFactory,
				"client-2",
				(rt, id): ISharedDirectory => directoryFactory.create(rt, `cell-${id}`),
			));

			sharedDirectory.set("key1", "value1");
			sharedDirectory.set("key2", "value2");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			sharedDirectory.set("key3", "value3");
			sharedDirectory.delete("key1");
			sharedDirectory2.set("key4", "value4");
			sharedDirectory2.delete("key2");
			sharedDirectory2.set("key3", "otherValue3");
			sharedDirectory2.set("key1", "otherValue1");

			containerRuntime2.flush();
			containerRuntimeFactory.processAllMessages();

			assert.deepStrictEqual(
				[...sharedDirectory.entries()],
				[
					["key4", "value4"],
					["key3", "value3"],
				],
			);

			containerRuntime.rollback?.();

			assert.deepStrictEqual(
				[...sharedDirectory.entries()],
				[
					["key1", "otherValue1"],
					["key4", "value4"],
					["key3", "otherValue3"],
				],
			);
		});
	});

	describe("Storage operations (nested subdirectories)", () => {
		let sharedDirectory: ISharedDirectory;
		let containerRuntime: MockContainerRuntime;
		let containerRuntimeFactory: MockContainerRuntimeFactory;
		let sharedDirectory2: ISharedDirectory;
		let containerRuntime2: MockContainerRuntime;

		beforeEach(() => {
			({
				dds: sharedDirectory,
				containerRuntimeFactory,
				containerRuntime,
			} = setupRollbackTest<ISharedDirectory>(
				"client-1",
				(rt, id): ISharedDirectory => directoryFactory.create(rt, id),
			));
		});
		it("should rollback all basic operations (set, delete, clear) in subdirectories and nested subdirectories", () => {
			const subDir = sharedDirectory.createSubDirectory("subdir");
			const level1 = sharedDirectory.createSubDirectory("level1");
			const level3 = level1.createSubDirectory("level2").createSubDirectory("level3");
			const absoluteDir = sharedDirectory.getWorkingDirectory("/level1/level2");
			assert(absoluteDir !== undefined, "Absolute path directory should exist");

			subDir.set("existingKey", "existingValue");
			level3.set("deepKey", "deepValue");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			const subDirChanges: IValueChanged[] = [];
			const level3Changes: IValueChanged[] = [];
			let clearEvents = 0;

			subDir.on("containedValueChanged", (event: IValueChanged) => subDirChanges.push(event));
			level3.on("containedValueChanged", (event: IValueChanged) => level3Changes.push(event));
			sharedDirectory.on("clear", () => clearEvents++);

			subDir.set("newKey", "newValue");
			subDir.delete("existingKey");
			level3.set("anotherKey", "anotherValue");
			absoluteDir.set("pathKey", "pathValue");
			subDir.clear(); // clear subdir

			const actualState = [
				["subDir.newKey", subDir.get("newKey")],
				["subDir.existingKey", subDir.get("existingKey")],
				["level3.deepKey", level3.get("deepKey")],
				["level3.anotherKey", level3.get("anotherKey")],
				["absoluteDir.pathKey", absoluteDir.get("pathKey")],
			];
			const expectedState = [
				["subDir.newKey", undefined], // Subdir should be cleared
				["subDir.existingKey", undefined], // Subdir should be cleared
				["level3.deepKey", "deepValue"], // Deep key should remain
				["level3.anotherKey", "anotherValue"], // Another key should exist
				["absoluteDir.pathKey", "pathValue"], // Path key should exist
			];
			assert.deepStrictEqual(
				actualState,
				expectedState,
				"Pre-rollback state should match expected values",
			);
			assert.strictEqual(clearEvents, 1, "Should have one clear event");

			containerRuntime.rollback?.();

			const actualState2 = [
				["subDir.newKey", subDir.get("newKey")],
				["subDir.existingKey", subDir.get("existingKey")],
				["level3.deepKey", level3.get("deepKey")],
				["level3.anotherKey", level3.get("anotherKey")],
				["absoluteDir.pathKey", absoluteDir.get("pathKey")],
			];
			const expectedState2 = [
				["subDir.newKey", undefined],
				["subDir.existingKey", "existingValue"],
				["level3.deepKey", "deepValue"],
				["level3.anotherKey", undefined],
				["absoluteDir.pathKey", undefined],
			];
			assert.deepStrictEqual(
				actualState2,
				expectedState2,
				"Post-rollback state should match expected values",
			);

			assert.strictEqual(subDirChanges.length, 5);
			assert.strictEqual(level3Changes.length, 2);
		});

		it("should rollback subdirectory operations with concurrent remote changes", () => {
			({ dds: sharedDirectory2, containerRuntime: containerRuntime2 } = createAdditionalClient(
				containerRuntimeFactory,
				"client-2",
				(rt, id): ISharedDirectory => directoryFactory.create(rt, `cell-${id}`),
			));

			const subDir1 = sharedDirectory.createSubDirectory("shared");
			const nestedDir1 = subDir1.createSubDirectory("nested");

			subDir1.set("sharedKey", "initialValue");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			const subDir2 = sharedDirectory2.getSubDirectory("shared");
			const nestedDir2 = subDir2?.getSubDirectory("nested");
			assert(
				subDir2 !== undefined && nestedDir2 !== undefined,
				"Subdirectories should exist on second client",
			);

			subDir1.set("localKey", "localValue");
			nestedDir1.set("nestedLocal", "nestedLocalValue");
			subDir2.set("remoteKey", "remoteValue");
			nestedDir2.set("nestedRemote", "nestedRemoteValue");
			subDir2.set("sharedKey", "remoteValue");
			containerRuntime2.flush();
			containerRuntimeFactory.processAllMessages();

			// Verify pre-rollback state (local optimistic values)
			assert.strictEqual(subDir1.get("localKey"), "localValue", "Local key should exist");
			assert.strictEqual(subDir1.get("remoteKey"), "remoteValue", "Remote key should exist");
			assert.strictEqual(
				subDir1.get("sharedKey"),
				"remoteValue",
				"Pre-rollback state should match expected values",
			);

			containerRuntime.rollback?.();

			const actualState = [
				["localKey", subDir1.get("localKey")],
				["remoteKey", subDir1.get("remoteKey")],
				["sharedKey", subDir1.get("sharedKey")],
				["nestedLocal", nestedDir1.get("nestedLocal")],
				["nestedRemote", nestedDir1.get("nestedRemote")],
			];
			const expectedState = [
				["localKey", undefined],
				["remoteKey", "remoteValue"],
				["sharedKey", "remoteValue"],
				["nestedLocal", undefined],
				["nestedRemote", "nestedRemoteValue"],
			];
			assert.deepStrictEqual(
				actualState,
				expectedState,
				"Post-rollback state should match expected values",
			);
		});

		it("should rollback complex mixed operations across multiple subdirectory levels", () => {
			const dirA = sharedDirectory.createSubDirectory("dirA");
			const dirB = sharedDirectory.createSubDirectory("dirB");
			const nestedDir = dirA.createSubDirectory("nested");

			sharedDirectory.set("rootKey", "rootValue");
			dirA.set("dirAKey", "dirAValue");
			dirB.set("dirBKey", "dirBValue");
			nestedDir.set("nestedKey", "nestedValue");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			const allValueChanges: IValueChanged[] = [];
			let clearEvents = 0;
			sharedDirectory.on("valueChanged", (event: IValueChanged) =>
				allValueChanges.push(event),
			);
			sharedDirectory.on("clear", () => clearEvents++);

			sharedDirectory.delete("rootKey");
			dirA.set("dirAKey", "modifiedValue");
			dirB.clear();
			nestedDir.set("newKey", "newValue");
			sharedDirectory.set("newRoot", "newValue");
			dirA.delete("dirAKey");

			const actualState = [
				["rootKey", sharedDirectory.get("rootKey")],
				["newRoot", sharedDirectory.get("newRoot")],
				["dirAKey", dirA.get("dirAKey")],
				["dirBKey", dirB.get("dirBKey")],
				["nestedKey", nestedDir.get("nestedKey")],
				["newKey", nestedDir.get("newKey")],
			];
			const expectedState = [
				["rootKey", undefined],
				["newRoot", "newValue"],
				["dirAKey", undefined],
				["dirBKey", undefined],
				["nestedKey", "nestedValue"],
				["newKey", "newValue"],
			];
			assert.deepStrictEqual(
				actualState,
				expectedState,
				"Pre-rollback state should match expected values",
			);
			assert.strictEqual(clearEvents, 1);
			assert.strictEqual(allValueChanges.length, 5);

			containerRuntime.rollback?.();

			const actualState2 = [
				["rootKey", sharedDirectory.get("rootKey")],
				["newRoot", sharedDirectory.get("newRoot")],
				["dirAKey", dirA.get("dirAKey")],
				["dirBKey", dirB.get("dirBKey")],
				["nestedKey", nestedDir.get("nestedKey")],
				["newKey", nestedDir.get("newKey")],
			];
			const expectedState2 = [
				["rootKey", "rootValue"],
				["newRoot", undefined],
				["dirAKey", "dirAValue"],
				["dirBKey", "dirBValue"],
				["nestedKey", "nestedValue"],
				["newKey", undefined],
			];
			assert.deepStrictEqual(
				actualState2,
				expectedState2,
				"Post-rollback state should match expected values",
			);
			assert.strictEqual(clearEvents, 1);
			assert.strictEqual(allValueChanges.length, 11);
		});
	});
});

describe("SharedDirectory rollback events", () => {
	let sharedDirectory: ISharedDirectory;
	let containerRuntime: MockContainerRuntime;
	let containerRuntimeFactory: MockContainerRuntimeFactory;

	beforeEach(() => {
		({
			dds: sharedDirectory,
			containerRuntime,
			containerRuntimeFactory,
		} = setupRollbackTest<ISharedDirectory>(
			"shared-map",
			(rt, id): ISharedDirectory => directoryFactory.create(rt, id),
		));
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
			dds: client1,
			containerRuntime: containerRuntime1,
			containerRuntimeFactory,
		} = setupRollbackTest<ISharedDirectory>(
			"client-1",
			(rt, id): ISharedDirectory => directoryFactory.create(rt, id),
		));

		({ dds: client2, containerRuntime: containerRuntime2 } = createAdditionalClient(
			containerRuntimeFactory,
			"client-2",
			(rt, id): ISharedDirectory => directoryFactory.create(rt, `directory-${id}`),
		));
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

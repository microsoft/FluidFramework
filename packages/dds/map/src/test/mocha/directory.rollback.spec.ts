/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { setupRollbackTest, createAdditionalClient } from "@fluid-private/test-dds-utils";

import { DirectoryFactory } from "../../directoryFactory.js";
import type { ISharedDirectory, IValueChanged } from "../../interfaces.js";

const directoryFactory = new DirectoryFactory();

describe("SharedDirectory rollback", () => {
	describe("Storage operations (root subdirectory)", () => {
		it("should rollback set operation", () => {
			const { dds: sharedDirectory, containerRuntime } = setupRollbackTest<ISharedDirectory>(
				"shared-map",
				(rt, id): ISharedDirectory => directoryFactory.create(rt, id),
			);
			const valueChanges: IValueChanged[] = [];
			sharedDirectory.on("valueChanged", (event: IValueChanged) => {
				valueChanges.push(event);
			});
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
			assert.strictEqual(valueChanges[1].key, "key1", "Second event should be for key1");
			assert.strictEqual(
				valueChanges[1].previousValue,
				"value1",
				"Second event previousValue should be pre-rollback value",
			);
		});

		it("should rollback delete operation", () => {
			const {
				dds: sharedDirectory,
				containerRuntime,
				containerRuntimeFactory,
			} = setupRollbackTest<ISharedDirectory>(
				"shared-map",
				(rt, id): ISharedDirectory => directoryFactory.create(rt, id),
			);
			sharedDirectory.set("key1", "value1");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();
			const valueChanges: IValueChanged[] = [];
			sharedDirectory.on("valueChanged", (event: IValueChanged) => {
				valueChanges.push(event);
			});
			sharedDirectory.delete("key1");
			assert.strictEqual(
				sharedDirectory.get("key1"),
				undefined,
				"Pending value should reflect the delete",
			);
			assert.strictEqual(valueChanges.length, 1, "Should have one value change event");
			containerRuntime.rollback?.();
			assert.strictEqual(
				sharedDirectory.get("key1"),
				"value1",
				"Value should be restored by rollback",
			);
			assert.strictEqual(valueChanges.length, 2, "Should have two value change events");
			assert.strictEqual(valueChanges[1].key, "key1", "Second event should be for key1");
			assert.strictEqual(
				valueChanges[1].previousValue,
				undefined,
				"Second event previousValue should be pre-rollback value",
			);
		});

		it("should rollback clear operation", () => {
			const {
				dds: sharedDirectory,
				containerRuntime,
				containerRuntimeFactory,
			} = setupRollbackTest<ISharedDirectory>(
				"shared-map",
				(rt, id): ISharedDirectory => directoryFactory.create(rt, id),
			);
			sharedDirectory.set("key1", "value1");
			sharedDirectory.set("key2", "value2");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();
			const valueChanges: IValueChanged[] = [];
			let clears: number = 0;
			sharedDirectory.on("valueChanged", (event: IValueChanged) => {
				valueChanges.push(event);
			});
			sharedDirectory.on("clear", () => {
				clears++;
			});

			sharedDirectory.clear();

			assert.strictEqual(
				sharedDirectory.get("key1"),
				undefined,
				"Pending value for key1 should reflect the clear",
			);
			assert.strictEqual(
				sharedDirectory.get("key2"),
				undefined,
				"Pending value for key2 should reflect the clear",
			);
			assert.strictEqual(valueChanges.length, 0, "Should have no value change events");
			assert.strictEqual(clears, 1, "Should have one clear event");
			containerRuntime.rollback?.();
			assert.strictEqual(
				sharedDirectory.get("key1"),
				"value1",
				"Value should be restored by rollback",
			);
			assert.strictEqual(
				sharedDirectory.get("key2"),
				"value2",
				"Value should be restored by rollback",
			);
			assert.strictEqual(valueChanges.length, 2, "Should have two value change events");
			assert.strictEqual(valueChanges[0].key, "key1", "First event should be for key1");
			assert.strictEqual(
				valueChanges[0].previousValue,
				undefined,
				"First event previousValue should be pre-rollback value",
			);
			assert.strictEqual(valueChanges[1].key, "key2", "Second event should be for key2");
			assert.strictEqual(
				valueChanges[1].previousValue,
				undefined,
				"Second event previousValue should be pre-rollback value",
			);
		});

		it("should rollback multiple operations in sequence", () => {
			const {
				dds: sharedDirectory,
				containerRuntime,
				containerRuntimeFactory,
			} = setupRollbackTest<ISharedDirectory>(
				"shared-map",
				(rt, id): ISharedDirectory => directoryFactory.create(rt, id),
			);
			sharedDirectory.set("key1", "value1");
			sharedDirectory.set("key2", "value2");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();
			let valueChanges: IValueChanged[] = [];
			let clears: number = 0;
			sharedDirectory.on("valueChanged", (event: IValueChanged) => {
				valueChanges.push(event);
			});
			sharedDirectory.on("clear", () => {
				clears++;
			});

			sharedDirectory.set("key3", "value3");
			sharedDirectory.delete("key1");
			sharedDirectory.set("key2", "newValue2");
			sharedDirectory.clear();
			sharedDirectory.set("key4", "value4");

			assert.deepStrictEqual(
				[...sharedDirectory.entries()],
				[["key4", "value4"]],
				"Directory should have expected entries pre-rollback",
			);
			assert.deepStrictEqual(
				valueChanges,
				[
					// Set key3
					{ key: "key3", path: "/", previousValue: undefined },
					// Delete key1
					{ key: "key1", path: "/", previousValue: "value1" },
					// Set key2 to a new value
					{ key: "key2", path: "/", previousValue: "value2" },
					// Clear happens here, no valueChange event for clear
					// Set key4
					{ key: "key4", path: "/", previousValue: undefined },
				],
				"Value changes should match expected pre-rollback",
			);
			assert.strictEqual(clears, 1, "Should have one clear event");

			// Reset event monitoring and roll back.
			valueChanges = [];
			clears = 0;
			containerRuntime.rollback?.();

			assert.deepStrictEqual(
				[...sharedDirectory.entries()],
				[
					["key1", "value1"],
					["key2", "value2"],
				],
				"Directory should have expected entries post-rollback",
			);
			assert.deepStrictEqual(
				valueChanges,
				[
					// Roll back the final key4 set
					{ key: "key4", path: "/", previousValue: "value4" },
					// Roll back the clear
					{ key: "key2", path: "/", previousValue: undefined },
					{ key: "key3", path: "/", previousValue: undefined },
					// Roll back the key2 set
					{ key: "key2", path: "/", previousValue: "newValue2" },
					// Roll back the key1 delete
					{ key: "key1", path: "/", previousValue: undefined },
					// Roll back the key3 set
					{ key: "key3", path: "/", previousValue: "value3" },
				],
				"Value changes should match expected post-rollback",
			);
			assert.strictEqual(clears, 0, "Should have no clear events");
		});

		it("should rollback local changes in presence of remote changes from another client", () => {
			const {
				dds: sharedDirectory,
				containerRuntime,
				containerRuntimeFactory,
			} = setupRollbackTest<ISharedDirectory>(
				"shared-map",
				(rt, id): ISharedDirectory => directoryFactory.create(rt, id),
			);
			// Create a second client

			const { dds: sharedDirectory2, containerRuntime: containerRuntime2 } =
				createAdditionalClient(
					containerRuntimeFactory,
					"client-2",
					(rt, id): ISharedDirectory => directoryFactory.create(rt, `directory-${id}`),
				);

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
					// Note key4 comes before key3 even though we have an optimistic value for it,
					// because sharedDirectory2 set them in that order. Iteration order matches the sequenced perspective.
					["key4", "value4"],
					["key3", "value3"],
				],
				"Directory should have expected entries pre-rollback",
			);

			containerRuntime.rollback?.();

			assert.deepStrictEqual(
				[...sharedDirectory.entries()],
				[
					["key1", "otherValue1"],
					["key4", "value4"],
					["key3", "otherValue3"],
				],
				"Directory should have expected entries post-rollback",
			);
		});
	});

	describe("Storage operations (nested subdirectories)", () => {
		it("should rollback all basic operations (set, delete, clear) in subdirectories and nested subdirectories", () => {
			const {
				dds: sharedDirectory,
				containerRuntime,
				containerRuntimeFactory,
			} = setupRollbackTest<ISharedDirectory>(
				"shared-map",
				(rt, id): ISharedDirectory => directoryFactory.create(rt, id),
			);

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
			const {
				dds: sharedDirectory,
				containerRuntime,
				containerRuntimeFactory,
			} = setupRollbackTest<ISharedDirectory>(
				"shared-map",
				(rt, id): ISharedDirectory => directoryFactory.create(rt, id),
			);

			const { dds: sharedDirectory2, containerRuntime: containerRuntime2 } =
				createAdditionalClient(
					containerRuntimeFactory,
					"client-2",
					(rt, id): ISharedDirectory => directoryFactory.create(rt, `directory-${id}`),
				);

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
			const {
				dds: sharedDirectory,
				containerRuntime,
				containerRuntimeFactory,
			} = setupRollbackTest<ISharedDirectory>(
				"shared-map",
				(rt, id): ISharedDirectory => directoryFactory.create(rt, id),
			);

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

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { type IGCTestProvider, runGCTests } from "@fluid-private/test-dds-utils";
import { AttachState } from "@fluidframework/container-definitions";
import type { IFluidHandleInternal } from "@fluidframework/core-interfaces/internal";
import { type ISummaryBlob, SummaryType } from "@fluidframework/driver-definitions";
import { toFluidHandleInternal } from "@fluidframework/runtime-utils/internal";
import type { UsageError } from "@fluidframework/telemetry-utils/internal";
import {
	MockContainerRuntimeFactory,
	MockFluidDataStoreRuntime,
	MockSharedObjectServices,
	MockStorage,
} from "@fluidframework/test-runtime-utils/internal";

import type { IDirectoryNewStorageFormat } from "../../directory.js";
import {
	type IDirectory,
	type IDirectoryValueChanged,
	type ISharedDirectory,
	SharedDirectory,
	SharedMap,
} from "../../index.js";

import { assertEquivalentDirectories } from "./directoryEquivalenceUtils.js";

/**
 * Creates and connects a new {@link ISharedDirectory}.
 */
export function createConnectedDirectory(
	id: string,
	runtimeFactory: MockContainerRuntimeFactory,
): ISharedDirectory {
	const dataStoreRuntime = new MockFluidDataStoreRuntime({
		registry: [SharedDirectory.getFactory()],
	});
	const containerRuntime = runtimeFactory.createContainerRuntime(dataStoreRuntime);
	const services = {
		deltaConnection: dataStoreRuntime.createDeltaConnection(),
		objectStorage: new MockStorage(),
	};
	const directory = SharedDirectory.create(dataStoreRuntime, id);
	directory.connect(services);
	return directory;
}

function createLocalMap(id: string): SharedMap {
	const factory = SharedMap.getFactory();
	return factory.create(new MockFluidDataStoreRuntime(), id) as SharedMap;
}

async function populate(content: unknown): Promise<ISharedDirectory> {
	const dataStoreRuntime = new MockFluidDataStoreRuntime({
		attachState: AttachState.Detached,
	});
	const factory = SharedDirectory.getFactory();

	const directory = await factory.load(
		dataStoreRuntime,
		"A",
		new MockSharedObjectServices({
			header: JSON.stringify(content),
		}),
		factory.attributes,
	);

	return directory;
}

async function loadFromAnotherDirectory(
	containerRuntimeFactory: MockContainerRuntimeFactory,
	source: ISharedDirectory,
	id?: string,
): Promise<ISharedDirectory> {
	// Load a new SharedDirectory in connected state from the summary of the source
	const dataStoreRuntime = new MockFluidDataStoreRuntime();
	const containerRuntime = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);
	const services = MockSharedObjectServices.createFromSummary(
		source.getAttachSummary().summary,
	);
	services.deltaConnection = dataStoreRuntime.createDeltaConnection();

	const factory = SharedDirectory.getFactory();

	const directory = await factory.load(
		dataStoreRuntime,
		id ?? "directory",
		services,
		factory.attributes,
	);

	return directory;
}

function serialize(directory1: ISharedDirectory): string {
	const summaryTree = directory1.getAttachSummary().summary;
	const summaryObjectKeys = Object.keys(summaryTree.tree);
	assert.strictEqual(summaryObjectKeys.length, 1, "summary tree should only have one blob");
	assert.strictEqual(summaryObjectKeys[0], "header", "summary should have a header blob");
	assert.strictEqual(
		summaryTree.tree.header.type,
		SummaryType.Blob,
		"header is not of SummaryType.Blob",
	);

	const content = summaryTree.tree.header.content as string;
	return JSON.stringify((JSON.parse(content) as IDirectoryNewStorageFormat).content);
}

describe("Directory", () => {
	describe("Local state", () => {
		let directory: ISharedDirectory;
		let dataStoreRuntime: MockFluidDataStoreRuntime;

		beforeEach("createDirectory", async () => {
			dataStoreRuntime = new MockFluidDataStoreRuntime({
				attachState: AttachState.Detached,
				registry: [SharedDirectory.getFactory()],
			});
			directory = SharedDirectory.create(dataStoreRuntime, "directory");
		});

		describe("API", () => {
			it("Can create a new directory", () => {
				assert.ok(directory, "could not create a new directory");
			});

			it("Knows its absolute path", () => {
				assert.equal(directory.absolutePath, "/", "the absolute path is not correct");
			});

			it("Can set and get keys one level deep", () => {
				directory.set("testKey", "testValue");
				directory.set("testKey2", "testValue2");
				assert.equal(directory.get("testKey"), "testValue", "could not retrieve set key 1");
				assert.equal(directory.get("testKey2"), "testValue2", "could not retrieve set key 2");
			});

			it("should fire correct directory events", async () => {
				let valueChangedExpected: boolean = true;
				let containedValueChangedExpected: boolean = true;
				let clearExpected: boolean = false;
				let previousValue: unknown;
				let directoryCreationExpected: boolean = true;
				let directoryDeletedExpected: boolean = true;

				directory.on("op", (arg1, arg2, arg3) => {
					assert.fail("shouldn't receive an op event");
				});
				directory.on("valueChanged", (changed, local, target) => {
					assert.equal(valueChangedExpected, true, "valueChange event not expected");
					valueChangedExpected = false;

					assert.equal(changed.key, "dwayne");
					assert.equal(changed.previousValue, previousValue);
					assert.equal(changed.path, directory.absolutePath);

					assert.equal(
						local,
						true,
						"local should be true for local action for valueChanged event",
					);
					assert.equal(
						target,
						directory,
						"target should be the directory for valueChanged event",
					);
				});
				directory.on("subDirectoryCreated", (path, local, target) => {
					assert.equal(
						directoryCreationExpected,
						true,
						"subDirectoryCreated event not expected",
					);
					directoryCreationExpected = false;

					assert.equal(path, "rock");

					assert.equal(
						local,
						true,
						"local should be true for local action for subDirectoryCreated event",
					);
					assert.equal(
						target,
						directory,
						"target should be the directory for subDirectoryCreated event",
					);
				});
				directory.on("subDirectoryDeleted", (path, local, target) => {
					assert.equal(
						directoryDeletedExpected,
						true,
						"subDirectoryDeleted event not expected",
					);
					directoryDeletedExpected = false;
					assert.equal(path, "rock");

					assert.equal(
						local,
						true,
						"local should be true for local action for subDirectoryDeleted event",
					);
					assert.equal(
						target,
						directory,
						"target should be the directory for subDirectoryDeleted event",
					);
				});
				directory.on("containedValueChanged", (changed, local, target) => {
					assert.equal(
						containedValueChangedExpected,
						true,
						"containedValueChanged event not expected for containedValueChanged event",
					);
					containedValueChangedExpected = false;

					// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
					assert.equal(changed.key, "dwayne");
					// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
					assert.equal(changed.previousValue, previousValue);

					assert.equal(
						local,
						true,
						"local should be true for local action for containedValueChanged event",
					);
					assert.equal(
						target,
						directory,
						"target should be the directory for containedValueChanged event",
					);
				});
				directory.on("clear", (local, target) => {
					assert.equal(clearExpected, true, "clear event not expected");
					clearExpected = false;

					assert.equal(local, true, "local should be true for local action for clear event");
					assert.equal(target, directory, "target should be the directory for clear event");
				});
				directory.on("error", (error) => {
					// propagate error in the event handlers
					throw error;
				});

				// Test set
				previousValue = undefined;
				directory.set("dwayne", "johnson");
				assert.equal(valueChangedExpected, false, "missing valueChangedExpected event");
				assert.equal(
					containedValueChangedExpected,
					false,
					"missing containedValueChanged event",
				);

				// Test delete
				previousValue = "johnson";
				valueChangedExpected = true;
				containedValueChangedExpected = true;
				directory.delete("dwayne");
				assert.equal(valueChangedExpected, false, "missing valueChangedExpected event");
				assert.equal(
					containedValueChangedExpected,
					false,
					"missing containedValueChanged event",
				);

				// Test createSubDirectory
				directory.createSubDirectory("rock");
				assert.equal(directoryCreationExpected, false, "missing subDirectoryCreated event");

				// Test deleteSubDirectory
				previousValue = directory.getSubDirectory("rock");
				directory.deleteSubDirectory("rock");
				assert.equal(valueChangedExpected, false, "missing valueChangedExpected event");
				assert.equal(
					containedValueChangedExpected,
					false,
					"missing containedValueChanged event",
				);

				// Test clear
				clearExpected = true;
				directory.clear();
				assert.equal(clearExpected, false, "missing clearExpected event");
			});

			it("should fire create/delete sub directory events", async () => {
				const subDirectory = directory.createSubDirectory("rock");
				const subDirectory1 = subDirectory.createSubDirectory("rockChild");
				// Check Creation events
				let directoryCreationExpected1 = false;
				let directoryCreationExpected2 = false;
				subDirectory.on("subDirectoryCreated", (relativePath, local, target) => {
					directoryCreationExpected1 = true;
					assert.equal(relativePath, "rockChild/rockChildChild", "Path should match");
				});
				subDirectory1.on("subDirectoryCreated", (relativePath, local, target) => {
					directoryCreationExpected2 = true;
					assert.equal(relativePath, "rockChildChild", "Path should match");
				});
				subDirectory1.createSubDirectory("rockChildChild");
				assert(directoryCreationExpected1, "Create event should fire");
				assert(directoryCreationExpected2, "Create event should fire");

				// Check Deletion Events
				let directoryDeletionExpected = false;
				let directoryDeletionExpected1 = false;
				let directoryDeletionExpected2 = false;
				directory.on("subDirectoryDeleted", (relativePath, local, target) => {
					directoryDeletionExpected = true;
					assert.equal(relativePath, "rock/rockChild/rockChildChild", "Path should match");
				});
				subDirectory.on("subDirectoryDeleted", (relativePath, local, target) => {
					directoryDeletionExpected1 = true;
					assert.equal(relativePath, "rockChild/rockChildChild", "Path should match");
				});
				subDirectory1.on("subDirectoryDeleted", (relativePath, local, target) => {
					directoryDeletionExpected2 = true;
					assert.equal(relativePath, "rockChildChild", "Path should match");
				});
				subDirectory1.deleteSubDirectory("rockChildChild");
				assert(directoryDeletionExpected, "Delete event should fire on root");
				assert(directoryDeletionExpected1, "Delete event should fire on child1");
				assert(directoryDeletionExpected2, "Delete event should fire on child2");
				subDirectory1.deleteSubDirectory("rockChildChild");
			});

			it("Should fire dispose event correctly", () => {
				let valueChangedExpected: boolean = true;

				directory.on("valueChanged", (changed, local, target) => {
					assert.equal(valueChangedExpected, true, "valueChange event not expected");
					valueChangedExpected = false;

					assert.equal(changed.key, "dwayne", "key should match");
					assert.equal(changed.previousValue, undefined, "previous value should match");
					assert.equal(changed.path, "/rock", "absolute path should match");

					assert.equal(
						local,
						true,
						"local should be true for local action for valueChanged event",
					);
					assert.equal(
						target,
						directory,
						"target should be the directory for valueChanged event",
					);
				});

				// Test dispose on subDirectory delete
				let subDirectoryDisposed = false;
				const subDirectory = directory.createSubDirectory("rock");
				subDirectory.on("disposed", (value: IDirectory) => {
					subDirectoryDisposed = true;
					assert.equal(value.disposed, true, "sub directory not deleted");
				});
				// Should fire dispose event.
				directory.deleteSubDirectory("rock");
				assert.equal(subDirectoryDisposed, true, "sub directory not disposed!!");

				// Should be able to work on new directory with same name.
				valueChangedExpected = true;
				const newSubDirectory = directory.createSubDirectory("rock");
				newSubDirectory.set("dwayne", "johnson");
				assert.equal(valueChangedExpected, false, "missing valueChangedExpected event");

				// Usage Error on accessing disposed directory.
				try {
					subDirectory.set("throw", "error");
					assert.fail("Should throw usage error");
				} catch (error) {
					assert.strictEqual(
						(error as UsageError)?.errorType,
						"usageError",
						"Should throw usage error",
					);
				}

				// Check recursive dispose event firing
				const subSubDirectory = newSubDirectory.createSubDirectory("rockChild");
				let rockSubDirectoryDisposed = false;
				let subSubDirectoryDisposed = false;
				newSubDirectory.on("disposed", (value: IDirectory) => {
					rockSubDirectoryDisposed = true;
					assert.equal(value.disposed, true, "rock sub directory not deleted");
				});
				subSubDirectory.on("disposed", (value: IDirectory) => {
					subSubDirectoryDisposed = true;
					assert.equal(value.disposed, true, "sub sub directory not deleted");
				});
				directory.deleteSubDirectory("rock");
				assert(rockSubDirectoryDisposed, "Rock sub directory should be disposed");
				assert(subSubDirectoryDisposed, "sub sub directory should be disposed");
			});

			it("Check number of sub directories", () => {
				const subDirectory = directory.createSubDirectory("rock1");
				directory.createSubDirectory("rock2");
				const childSubDirectory = subDirectory.createSubDirectory("rock1Child");
				assert.strictEqual(
					directory.countSubDirectory?.(),
					2,
					"Should have 2 sub directories",
				);
				assert(
					subDirectory.countSubDirectory !== undefined &&
						subDirectory.countSubDirectory() === 1,
					"Should have 1 sub directory",
				);
				assert(
					childSubDirectory.countSubDirectory !== undefined &&
						subDirectory.countSubDirectory() === 1,
					"Should have 0 sub directory",
				);
			});

			it("Rejects a undefined and null key set", () => {
				assert.throws(() => {
					directory.set(undefined as unknown as string, "testValue");
				}, "Should throw for key of undefined");
				assert.throws(() => {
					// eslint-disable-next-line unicorn/no-null
					directory.set(null as unknown as string, "testValue");
				}, "Should throw for key of null");
			});

			it("Rejects subdirectories with undefined and null names", () => {
				assert.throws(() => {
					directory.createSubDirectory(undefined as unknown as string);
				}, "Should throw for undefined subDirectory name");
				assert.throws(() => {
					// eslint-disable-next-line unicorn/no-null
					directory.createSubDirectory(null as unknown as string);
				}, "Should throw for null subDirectory name");
			});
		});

		describe("Serialize", () => {
			it("Should serialize an empty directory as a JSON object", () => {
				const serialized = serialize(directory);
				assert.equal(serialized, '{"ci":{"csn":0,"ccIds":[]}}');
			});

			it("Should serialize a directory without subdirectories as a JSON object", () => {
				directory.set("first", "second");
				directory.set("third", "fourth");
				directory.set("fifth", "sixth");
				const subMap = createLocalMap("subMap");
				directory.set("object", subMap.handle);

				const subMapHandleUrl = toFluidHandleInternal(subMap.handle).absolutePath;

				const serialized = serialize(directory);
				const expected = `{"ci":{"csn":0,"ccIds":[]},"storage":{"first":{"type":"Plain","value":"second"},"third":{"type":"Plain","value":"fourth"},"fifth":{"type":"Plain","value":"sixth"},"object":{"type":"Plain","value":{"type":"__fluid_handle__","url":"${subMapHandleUrl}"}}}}`;
				assert.equal(serialized, expected);
			});

			it("Should serialize a directory with subdirectories as a JSON object", () => {
				directory.set("first", "second");
				directory.set("third", "fourth");
				directory.set("fifth", "sixth");
				const subMap = createLocalMap("subMap");
				directory.set("object", subMap.handle);
				const nestedDirectory = directory.createSubDirectory("nested");
				nestedDirectory.set("deepKey1", "deepValue1");
				nestedDirectory
					.createSubDirectory("nested2")
					.createSubDirectory("nested3")
					.set("deepKey2", "deepValue2");

				const subMapHandleUrl = toFluidHandleInternal(subMap.handle).absolutePath;
				const serialized = serialize(directory);
				const expected = `{"ci":{"csn":0,"ccIds":[]},"storage":{"first":{"type":"Plain","value":"second"},"third":{"type":"Plain","value":"fourth"},"fifth":{"type":"Plain","value":"sixth"},"object":{"type":"Plain","value":{"type":"__fluid_handle__","url":"${subMapHandleUrl}"}}},"subdirectories":{"nested":{"ci":{"csn":0,"ccIds":["${dataStoreRuntime.clientId}"]},"storage":{"deepKey1":{"type":"Plain","value":"deepValue1"}},"subdirectories":{"nested2":{"ci":{"csn":0,"ccIds":["${dataStoreRuntime.clientId}"]},"subdirectories":{"nested3":{"ci":{"csn":0,"ccIds":["${dataStoreRuntime.clientId}"]},"storage":{"deepKey2":{"type":"Plain","value":"deepValue2"}}}}}}}}}`;
				assert.equal(serialized, expected);
			});

			it("Should serialize an undefined value", () => {
				directory.set("first", "second");
				directory.set("third", "fourth");
				directory.set("fifth", undefined);
				assert.ok(directory.has("fifth"));
				const subMap = createLocalMap("subMap");
				directory.set("object", subMap.handle);
				const nestedDirectory = directory.createSubDirectory("nested");
				nestedDirectory.set("deepKey1", "deepValue1");
				nestedDirectory.set("deepKeyUndefined", undefined);
				assert.ok(nestedDirectory.has("deepKeyUndefined"));
				nestedDirectory
					.createSubDirectory("nested2")
					.createSubDirectory("nested3")
					.set("deepKey2", "deepValue2");

				const subMapHandleUrl = toFluidHandleInternal(subMap.handle).absolutePath;
				const serialized = serialize(directory);
				const expected = `{"ci":{"csn":0,"ccIds":[]},"storage":{"first":{"type":"Plain","value":"second"},"third":{"type":"Plain","value":"fourth"},"fifth":{"type":"Plain"},"object":{"type":"Plain","value":{"type":"__fluid_handle__","url":"${subMapHandleUrl}"}}},"subdirectories":{"nested":{"ci":{"csn":0,"ccIds":["${dataStoreRuntime.clientId}"]},"storage":{"deepKey1":{"type":"Plain","value":"deepValue1"},"deepKeyUndefined":{"type":"Plain"}},"subdirectories":{"nested2":{"ci":{"csn":0,"ccIds":["${dataStoreRuntime.clientId}"]},"subdirectories":{"nested3":{"ci":{"csn":0,"ccIds":["${dataStoreRuntime.clientId}"]},"storage":{"deepKey2":{"type":"Plain","value":"deepValue2"}}}}}}}}}`;
				assert.equal(serialized, expected);
			});
		});

		describe("Populate", () => {
			it("Should populate the directory from an empty JSON object (old format)", async () => {
				directory = await populate({});
				assert.equal(directory.size, 0, "Failed to initialize to empty directory storage");
				directory.set("testKey", "testValue");
				assert.equal(directory.get("testKey"), "testValue", "Failed to set testKey");
				directory.createSubDirectory("testSubDir").set("testSubKey", "testSubValue");
				const subDir = directory.getWorkingDirectory("testSubDir");
				assert(subDir);
				assert.equal(subDir.get("testSubKey"), "testSubValue", "Failed to set testSubKey");
			});

			it("Should populate the directory from a basic JSON object (old format)", async () => {
				directory = await populate({
					storage: {
						testKey: {
							type: "Plain",
							value: "testValue4",
						},
						testKey2: {
							type: "Plain",
							value: "testValue5",
						},
					},
					subdirectories: {
						foo: {
							storage: {
								testKey: {
									type: "Plain",
									value: "testValue",
								},
								testKey2: {
									type: "Plain",
									value: "testValue2",
								},
							},
						},
						bar: {
							storage: {
								testKey3: {
									type: "Plain",
									value: "testValue3",
								},
							},
						},
					},
				});
				assert.equal(directory.size, 2, "Failed to initialize directory storage correctly");
				assert.equal(directory.getWorkingDirectory("/foo")?.get("testKey"), "testValue");
				assert.equal(directory.getWorkingDirectory("foo")?.get("testKey2"), "testValue2");
				assert.equal(directory.getWorkingDirectory("/bar")?.get("testKey3"), "testValue3");
				assert.equal(directory.getWorkingDirectory("")?.get("testKey"), "testValue4");
				assert.equal(directory.getWorkingDirectory("/")?.get("testKey2"), "testValue5");
				directory.set("testKey", "newValue");
				assert.equal(directory.get("testKey"), "newValue", "Failed to set testKey");
				directory.createSubDirectory("testSubDir").set("testSubKey", "newSubValue");
				assert.equal(
					directory.getWorkingDirectory("testSubDir")?.get("testSubKey"),
					"newSubValue",
					"Failed to set testSubKey",
				);
			});

			it("Should populate the directory with undefined values (old format)", async () => {
				directory = await populate({
					storage: {
						testKey: {
							type: "Plain",
							value: "testValue4",
						},
						testKey2: {
							type: "Plain",
						},
					},
					subdirectories: {
						foo: {
							storage: {
								testKey: {
									type: "Plain",
									value: "testValue",
								},
								testKey2: {
									type: "Plain",
								},
							},
						},
						bar: {
							storage: {
								testKey3: {
									type: "Plain",
									value: "testValue3",
								},
							},
						},
					},
				});
				assert.equal(directory.size, 2, "Failed to initialize directory storage correctly");
				assert.equal(directory.getWorkingDirectory("/foo")?.get("testKey"), "testValue");
				assert.equal(directory.getWorkingDirectory("foo")?.get("testKey2"), undefined);
				assert.equal(directory.getWorkingDirectory("/bar")?.get("testKey3"), "testValue3");
				assert.equal(directory.getWorkingDirectory("")?.get("testKey"), "testValue4");
				assert.equal(directory.getWorkingDirectory("/")?.get("testKey2"), undefined);
				assert.ok(directory.has("testKey2"));
				assert.ok(directory.getWorkingDirectory("/foo")?.has("testKey2"));
				directory.set("testKey", "newValue");
				assert.equal(directory.get("testKey"), "newValue", "Failed to set testKey");
				directory.createSubDirectory("testSubDir").set("testSubKey", "newSubValue");
				assert.equal(
					directory.getWorkingDirectory("testSubDir")?.get("testSubKey"),
					"newSubValue",
					"Failed to set testSubKey",
				);
			});

			it("Should populate, serialize and de-serialize directory with long property values", async () => {
				// 40K word
				let longWord = "0123456789";
				for (let i = 0; i < 12; i++) {
					longWord = longWord + longWord;
				}
				const logWord2 = `${longWord}_2`;

				directory.set("first", "second");
				directory.set("long1", longWord);
				const nestedDirectory = directory.createSubDirectory("nested");
				nestedDirectory.set("deepKey1", "deepValue1");
				nestedDirectory.set("long2", logWord2);

				const summarizeResult = directory.getAttachSummary();
				const summaryTree = summarizeResult.summary;
				assert.strictEqual(summaryTree.type, SummaryType.Tree, "summary should be a tree");

				assert.strictEqual(
					Object.keys(summaryTree.tree).length,
					3,
					"number of blobs in summary is incorrect",
				);

				const blob0 = summaryTree.tree.blob0 as ISummaryBlob;
				assert(blob0 !== undefined, "blob0 not present in summary");
				assert.strictEqual(blob0.type, SummaryType.Blob, "blob0 is not of SummaryType.Blob");
				assert(blob0.content.length >= 1024, "blob0's length is incorrect");

				const blob1 = summaryTree.tree.blob1 as ISummaryBlob;
				assert(blob1 !== undefined, "blob1 not present in summary");
				assert.strictEqual(blob1.type, SummaryType.Blob, "blob1 is not of SummaryType.Blob");
				assert(blob1.content.length >= 1024, "blob1's length is incorrect");

				const header = summaryTree.tree.header as ISummaryBlob;
				assert(header !== undefined, "header not present in summary");
				assert.strictEqual(header.type, SummaryType.Blob, "header is not of SummaryType.Blob");
				assert(header.content.length >= 200, "header's length is incorrect");

				const storage = MockSharedObjectServices.createFromSummary(summarizeResult.summary);
				const factory = SharedDirectory.getFactory();

				const directory2 = await factory.load(
					dataStoreRuntime,
					"test",
					storage,
					factory.attributes,
				);

				assert.equal(directory2.get("first"), "second");
				assert.equal(directory2.get("long1"), longWord);
				const nestedSubDir = directory2.getWorkingDirectory("/nested");
				assert(nestedSubDir);
				assert.equal(nestedSubDir.get("deepKey1"), "deepValue1");
				assert.equal(nestedSubDir.get("long2"), logWord2);
			});
		});

		describe("Op processing", () => {
			it("Should lead to eventual consistency 1", async () => {
				// Load a new SharedDirectory in connected state from the summarize of the first one.
				const containerRuntimeFactory = new MockContainerRuntimeFactory();

				const directory2 = await loadFromAnotherDirectory(
					containerRuntimeFactory,
					directory,
					"directory2",
				);

				// Now connect the first SharedDirectory
				dataStoreRuntime.setAttachState(AttachState.Attached);
				containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);
				const services1 = {
					deltaConnection: dataStoreRuntime.createDeltaConnection(),
					objectStorage: new MockStorage(undefined),
				};
				directory.connect(services1);

				// Create a sub directory in a sub directory and queue up keys to be set in it
				const someParentDir1 = directory.createSubDirectory("lists");

				const subDir1 = someParentDir1.createSubDirectory("ListLevels-0");
				subDir1.set("random1", 1);
				subDir1.set("random2", 2);

				// Let everything get stamped and round-trip back to us
				containerRuntimeFactory.processAllMessages();

				// Now, let's be tricky. Let's set one of the keys again...
				const dir1 = directory.getSubDirectory("lists");
				const subDirDir11 = dir1?.getSubDirectory("ListLevels-0");
				subDirDir11?.set("random1", 3);

				// ... then delete the sub directory and its parent, create a new sub directory
				// and parent with the exact same paths. We need to set at least one of the same
				// keys as we had unacked in the old sub directory instance. In this case, we only
				// need to set one of the keys.
				directory.getSubDirectory("lists")?.deleteSubDirectory("ListLevels-0");
				directory.deleteSubDirectory("lists");

				const someParentDir2 = directory.createSubDirectory("lists");
				const subDir2 = someParentDir2.createSubDirectory("ListLevels-0");
				subDir2.set("random1", 4);

				// Let everything get stamped and round-trip back to us
				containerRuntimeFactory.processAllMessages();
				const testSubDir1 = directory
					.getSubDirectory("lists")
					?.getSubDirectory("ListLevels-0");
				const testSubDir2 = directory2
					.getSubDirectory("lists")
					?.getSubDirectory("ListLevels-0");
				assert(testSubDir1 !== undefined, "second level subDir should exists in dir1");
				assert(testSubDir2 !== undefined, "second level subDir should exists in dir2");
				assert(testSubDir1.get("random1") === 4, "value should be correct in dir1");
				assert(testSubDir2.get("random1") === 4, "value should be correct in dir2");
				assert(
					testSubDir1.get("random2") === undefined,
					"value should be correct in dir1 for key2",
				);
				assert(
					testSubDir2.get("random2") === undefined,
					"value should be correct in dir2 for key2",
				);
			});

			it("Should populate with csn as 0 and then process the create op", async () => {
				directory.createSubDirectory("nested");

				// Now populate a new directory with contents of above to simulate processing of attach op
				const containerRuntimeFactory = new MockContainerRuntimeFactory();

				const directory2 = await loadFromAnotherDirectory(
					containerRuntimeFactory,
					directory,
					"directory2",
				);
				const directory3 = await loadFromAnotherDirectory(
					containerRuntimeFactory,
					directory,
					"directory3",
				);

				containerRuntimeFactory.processAllMessages();

				// Now send create op
				directory3.getSubDirectory("nested")?.createSubDirectory("nested2");
				containerRuntimeFactory.processAllMessages();

				// Other directory should process the create op.
				assert(
					directory2.getSubDirectory("nested")?.getSubDirectory("nested2") !== undefined,
					"/nested/nested2 should be present",
				);
			});

			/**
			 * These tests test the scenario found in the following bug:
			 * {@link https://github.com/microsoft/FluidFramework/issues/2400}.
			 *
			 * - A SharedDirectory in local state performs a set or directory operation.
			 *
			 * - A second SharedDirectory is then created from the summarize of the first one.
			 *
			 * - The second SharedDirectory performs the same operation as the first one but with a different value.
			 *
			 * - The expected behavior is that the first SharedDirectory updates the key with the new value. But in the
			 * bug, the first SharedDirectory stores the key in its pending state even though it does not send out an
			 * an op. So when it gets a remote op with the same key, it ignores it as it has a pending op with the
			 * same key.
			 */
			it("should correctly process a set operation sent in local state", async () => {
				// Set a key in local state.
				const key = "testKey";
				const value = "testValue";
				directory.set(key, value);

				// Load a new SharedDirectory in connected state from the summarize of the first one.
				const containerRuntimeFactory = new MockContainerRuntimeFactory();
				const directory2 = await loadFromAnotherDirectory(
					containerRuntimeFactory,
					directory,
					"directory2",
				);

				// Now connect the first SharedDirectory
				dataStoreRuntime.setAttachState(AttachState.Attached);
				containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);
				const services1 = {
					deltaConnection: dataStoreRuntime.createDeltaConnection(),
					objectStorage: new MockStorage(undefined),
				};
				directory.connect(services1);

				// Verify that both the directories have the key.
				assert.equal(directory.get(key), value, "The first directory does not have the key");
				assert.equal(directory2.get(key), value, "The second directory does not have the key");

				// Set a new value for the same key in the second SharedDirectory.
				const newValue = "newValue";
				directory2.set(key, newValue);

				// Process the message.
				containerRuntimeFactory.processAllMessages();

				// Verify that both the directories get the new value.
				assert.equal(
					directory.get(key),
					newValue,
					"The first directory did not get the new value",
				);
				assert.equal(
					directory2.get(key),
					newValue,
					"The second directory did not get the new value",
				);
			});

			it("should correctly process subDirectory operations sent in local state", async () => {
				// Set the data store runtime to local.
				dataStoreRuntime.local = true;

				// Create a sub directory in local state.
				const subDirName = "testSubDir";
				directory.createSubDirectory(subDirName);

				// Load a new SharedDirectory in connected state from the summarize of the first one.
				const containerRuntimeFactory = new MockContainerRuntimeFactory();

				const directory2 = await loadFromAnotherDirectory(
					containerRuntimeFactory,
					directory,
					"directory2",
				);

				// Now connect the first SharedDirectory
				dataStoreRuntime.setAttachState(AttachState.Attached);
				containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);
				const services1 = {
					deltaConnection: dataStoreRuntime.createDeltaConnection(),
					objectStorage: new MockStorage(undefined),
				};
				directory.connect(services1);

				// Verify that both the directories have the key.
				assert.ok(
					directory.getSubDirectory(subDirName),
					"The first directory does not have sub directory",
				);
				const subDir2 = directory2.getSubDirectory(subDirName);

				assert.ok(subDir2, "The second directory does not have sub directory");

				subDir2.set("foo", "bar");

				containerRuntimeFactory.processAllMessages();

				await assertEquivalentDirectories(directory, directory2);

				// Delete the subDirectory in the second SharedDirectory.
				directory2.deleteSubDirectory(subDirName);

				// Process the message.
				containerRuntimeFactory.processAllMessages();

				// Verify that both the directory have the sub directory deleted.
				assert.equal(
					directory.getSubDirectory(subDirName),
					undefined,
					"The first directory did not process delete",
				);
				assert.equal(
					directory2.getSubDirectory(subDirName),
					undefined,
					"The second directory did not process delete",
				);
			});
		});
	});

	describe("Connected state", () => {
		let containerRuntimeFactory: MockContainerRuntimeFactory;
		let directory1: ISharedDirectory;
		let directory2: ISharedDirectory;

		beforeEach("createDirectory", async () => {
			containerRuntimeFactory = new MockContainerRuntimeFactory();
			// Create the first directory1.
			directory1 = createConnectedDirectory("directory1", containerRuntimeFactory);
			// Create a second directory1
			directory2 = createConnectedDirectory("directory2", containerRuntimeFactory);
		});

		describe("API", () => {
			it("Can set and get keys one level deep", () => {
				directory1.set("testKey", "testValue");

				containerRuntimeFactory.processAllMessages();

				// Verify the local SharedDirectory
				assert.equal(directory1.get("testKey"), "testValue", "could not retrieve key");

				// Verify the remote SharedDirectory
				assert.equal(
					directory2.get("testKey"),
					"testValue",
					"could not retrieve key from remote directory1",
				);
			});

			it("Can set and get keys two levels deep", () => {
				const fooDirectory = directory1.createSubDirectory("foo");
				const barDirectory = directory1.createSubDirectory("bar");
				fooDirectory.set("testKey", "testValue");
				fooDirectory.set("testKey2", "testValue2");
				barDirectory.set("testKey3", "testValue3");

				containerRuntimeFactory.processAllMessages();

				// Verify the local SharedDirectory
				assert.equal(directory1.getWorkingDirectory("foo")?.get("testKey"), "testValue");
				assert.equal(directory1.getWorkingDirectory("foo/")?.get("testKey2"), "testValue2");
				assert.equal(directory1.getWorkingDirectory("bar")?.get("testKey3"), "testValue3");

				// Verify the remote SharedDirectory
				assert.equal(directory2.getWorkingDirectory("foo")?.get("testKey"), "testValue");
				assert.equal(directory2.getWorkingDirectory("foo/")?.get("testKey2"), "testValue2");
				assert.equal(directory2.getWorkingDirectory("bar")?.get("testKey3"), "testValue3");
			});

			it("Can clear keys stored directly under the root", () => {
				const fooDirectory = directory1.createSubDirectory("foo");
				const barDirectory = directory1.createSubDirectory("bar");
				fooDirectory.set("testKey", "testValue");
				fooDirectory.set("testKey2", "testValue2");
				barDirectory.set("testKey3", "testValue3");
				directory1.set("testKey", "testValue4");
				directory1.set("testKey2", "testValue5");
				directory1.clear();

				containerRuntimeFactory.processAllMessages();

				// Verify the local SharedDirectory
				assert.equal(directory1.getWorkingDirectory("/foo/")?.get("testKey"), "testValue");
				assert.equal(directory1.getWorkingDirectory("./foo")?.get("testKey2"), "testValue2");
				assert.equal(directory1.getWorkingDirectory("bar")?.get("testKey3"), "testValue3");
				assert.equal(directory1.get("testKey"), undefined);
				assert.equal(directory1.get("testKey2"), undefined);

				// Verify the remote SharedDirectory
				assert.equal(directory2.getWorkingDirectory("/foo/")?.get("testKey"), "testValue");
				assert.equal(directory2.getWorkingDirectory("./foo")?.get("testKey2"), "testValue2");
				assert.equal(directory2.getWorkingDirectory("bar")?.get("testKey3"), "testValue3");
				assert.equal(directory2.get("testKey"), undefined);
				assert.equal(directory2.get("testKey2"), undefined);
			});

			it("Can delete keys from the root", () => {
				const fooDirectory = directory1.createSubDirectory("foo");
				const barDirectory = directory1.createSubDirectory("bar");
				fooDirectory.set("testKey", "testValue");
				fooDirectory.set("testKey2", "testValue2");
				barDirectory.set("testKey3", "testValue3");
				directory1.set("testKey", "testValue4");
				directory1.set("testKey2", "testValue5");
				directory1.delete("testKey2");

				containerRuntimeFactory.processAllMessages();

				// Verify the local SharedDirectory
				assert.equal(directory1.getWorkingDirectory("foo")?.get("testKey"), "testValue");
				assert.equal(directory1.getWorkingDirectory("foo")?.get("testKey2"), "testValue2");
				assert.equal(directory1.getWorkingDirectory("bar")?.get("testKey3"), "testValue3");
				assert.equal(directory1.get("testKey"), "testValue4");
				assert.equal(directory1.get("testKey2"), undefined);

				// Verify the remote SharedDirectory
				assert.equal(directory2.getWorkingDirectory("foo")?.get("testKey"), "testValue");
				assert.equal(directory2.getWorkingDirectory("foo")?.get("testKey2"), "testValue2");
				assert.equal(directory2.getWorkingDirectory("bar")?.get("testKey3"), "testValue3");
				assert.equal(directory2.get("testKey"), "testValue4");
				assert.equal(directory2.get("testKey2"), undefined);
			});

			it("Shouldn't clear value if there is pending set", () => {
				const valuesChanged: IDirectoryValueChanged[] = [];
				let clearCount = 0;

				directory1.on("valueChanged", (changed, local, target) => {
					valuesChanged.push(changed);
				});
				directory1.on("clear", (local, target) => {
					clearCount++;
				});

				directory2.set("directory2key", "value2");
				directory2.clear();
				directory1.set("directory1Key", "value1");
				directory2.clear();

				if (containerRuntimeFactory.processSomeMessages === undefined) {
					return;
				}
				containerRuntimeFactory.processSomeMessages(2);

				assert.equal(valuesChanged.length, 3);
				assert.equal(valuesChanged[0].key, "directory1Key");
				assert.equal(valuesChanged[0].previousValue, undefined);
				assert.equal(valuesChanged[1].key, "directory2key");
				assert.equal(valuesChanged[1].previousValue, undefined);
				assert.equal(valuesChanged[2].key, "directory1Key");
				assert.equal(valuesChanged[2].previousValue, undefined);
				assert.equal(clearCount, 1);
				assert.equal(directory1.size, 1);
				assert.equal(directory1.get("directory1Key"), "value1");

				containerRuntimeFactory.processSomeMessages(2);

				assert.equal(valuesChanged.length, 3);
				assert.equal(clearCount, 2);
				assert.equal(directory1.size, 0);
			});

			it("Shouldn't overwrite value if there is pending set", () => {
				const value1 = "value1";
				const pending1 = "pending1";
				const pending2 = "pending2";
				directory1.set("test", value1);
				directory2.set("test", pending1);
				directory2.set("test", pending2);

				if (containerRuntimeFactory.processSomeMessages === undefined) {
					return;
				}
				containerRuntimeFactory.processSomeMessages(1);

				// Verify the SharedDirectory with processed message
				assert.equal(directory1.has("test"), true, "could not find the set key");
				assert.equal(directory1.get("test"), value1, "could not get the set key");

				// Verify the SharedDirectory with 2 pending messages
				assert.equal(
					directory2.has("test"),
					true,
					"could not find the set key in pending directory",
				);
				assert.equal(
					directory2.get("test"),
					pending2,
					"could not get the set key from pending directory",
				);

				containerRuntimeFactory.processSomeMessages(1);

				// Verify the SharedDirectory gets updated from remote
				assert.equal(directory1.has("test"), true, "could not find the set key");
				assert.equal(directory1.get("test"), pending1, "could not get the set key");

				// Verify the SharedDirectory with 1 pending message
				assert.equal(
					directory2.has("test"),
					true,
					"could not find the set key in pending directory",
				);
				assert.equal(
					directory2.get("test"),
					pending2,
					"could not get the set key from pending directory",
				);
			});

			it("Shouldn't set values when pending clear", () => {
				const key = "test";
				directory1.set(key, "directory1value1");
				directory2.set(key, "directory2value2");
				directory2.clear();
				directory2.set(key, "directory2value3");
				directory2.clear();

				if (containerRuntimeFactory.processSomeMessages === undefined) {
					return;
				}
				// directory1.set(key, "directory1value1");
				containerRuntimeFactory.processSomeMessages(1);

				// Verify the SharedDirectory with processed message
				assert.equal(directory1.has("test"), true, "could not find the set key");
				assert.equal(directory1.get("test"), "directory1value1", "could not get the set key");

				// Verify the SharedDirectory with 2 pending clears
				assert.equal(directory2.has("test"), false, "found the set key in pending directory");

				// directory2.set(key, "directory2value2");
				containerRuntimeFactory.processSomeMessages(1);

				// Verify the SharedDirectory gets updated from remote
				assert.equal(directory1.has("test"), true, "could not find the set key");
				assert.equal(directory1.get("test"), "directory2value2", "could not get the set key");

				// Verify the SharedDirectory with 2 pending clears
				assert.equal(directory2.has("test"), false, "found the set key in pending directory");

				// directory2.clear();
				containerRuntimeFactory.processSomeMessages(1);

				// Verify the SharedDirectory gets updated from remote clear
				assert.equal(directory1.has("test"), false, "found the set key");

				// Verify the SharedDirectory with 1 pending clear
				assert.equal(directory2.has("test"), false, "found the set key in pending directory");

				// directory2.set(key, "directory2value3");
				containerRuntimeFactory.processSomeMessages(1);

				// Verify the SharedDirectory gets updated from remote
				assert.equal(directory1.has("test"), true, "could not find the set key");
				assert.equal(directory1.get("test"), "directory2value3", "could not get the set key");

				// Verify the SharedDirectory with 1 pending clear
				assert.equal(directory2.has("test"), false, "found the set key in pending directory");

				// directory2.clear();
				containerRuntimeFactory.processSomeMessages(1);

				// Verify the SharedDirectory gets updated from remote clear
				assert.equal(directory1.has("test"), false, "found the set key");

				// Verify the SharedDirectory with no more pending clear
				assert.equal(directory2.has("test"), false, "found the set key in pending directory");

				directory1.set(key, "directory1value4");
				containerRuntimeFactory.processSomeMessages(1);

				// Verify the SharedDirectory gets updated from local
				assert.equal(directory1.has("test"), true, "could not find the set key");
				assert.equal(directory1.get("test"), "directory1value4", "could not get the set key");

				// Verify the SharedDirectory gets updated from remote
				assert.equal(directory1.has("test"), true, "could not find the set key");
				assert.equal(directory1.get("test"), "directory1value4", "could not get the set key");
			});

			it("Directories should ensure eventual consistency using LWW approach 1: Test 1", async () => {
				const root1SubDir = directory1.createSubDirectory("testSubDir");
				root1SubDir.set("key1", "testValue1");

				directory1.deleteSubDirectory("testSubDir");
				const root1SubDir2 = directory1.createSubDirectory("testSubDir");
				root1SubDir2.set("key2", "testValue2");
				directory2.createSubDirectory("testSubDir");

				// After the above scenario, the consistent state using LWW would be to have testSubDir with 1 key.
				containerRuntimeFactory.processAllMessages();
				const directory1SubDir = directory1.getSubDirectory("testSubDir");
				const directory2SubDir = directory2.getSubDirectory("testSubDir");

				assert(directory1SubDir !== undefined, "SubDirectory on dir 1 should be present");
				assert(directory2SubDir !== undefined, "SubDirectory on dir 2 should be present");

				assert.strictEqual(directory1SubDir.size, 1, "Dir1 1 key should exist");
				assert.strictEqual(directory2SubDir.size, 1, "Dir2 1 key should exist");
				assert.strictEqual(
					directory1SubDir.get("key2"),
					"testValue2",
					"Dir1 key value should match",
				);
				assert.strictEqual(
					directory2SubDir.get("key2"),
					"testValue2",
					"Dir2 key value should match",
				);
			});

			it("Directories should ensure eventual consistency using LWW approach 1: Test 2", async () => {
				const root1SubDir = directory1.createSubDirectory("testSubDir");
				directory2.createSubDirectory("testSubDir");

				root1SubDir.set("key1", "testValue1");
				directory2.deleteSubDirectory("testSubDir");
				directory2.createSubDirectory("testSubDir");

				// After the above scenario, the consistent state using LWW would be to have testSubDir with 0 keys.
				containerRuntimeFactory.processAllMessages();
				const directory1SubDir = directory1.getSubDirectory("testSubDir");
				const directory2SubDir = directory2.getSubDirectory("testSubDir");

				assert(directory1SubDir !== undefined, "SubDirectory on dir 1 should be present");
				assert(directory2SubDir !== undefined, "SubDirectory on dir 2 should be present");

				assert.strictEqual(directory1SubDir.size, 0, "Dir 1 no key should exist");
				assert.strictEqual(directory2SubDir.size, 0, "Dir 2 no key should exist");
			});
		});

		describe("SubDirectory", () => {
			it("Can iterate over the subdirectories in the root", () => {
				directory1.createSubDirectory("foo");
				directory1.createSubDirectory("bar");

				containerRuntimeFactory.processAllMessages();

				const expectedDirectories = new Set(["foo", "bar"]);

				// Verify the local SharedDirectory
				for (const [subDirName] of directory1.subdirectories()) {
					assert.ok(expectedDirectories.has(subDirName));
				}

				// Verify the remote SharedDirectory
				for (const [subDirName] of directory2.subdirectories()) {
					assert.ok(expectedDirectories.has(subDirName));
					expectedDirectories.delete(subDirName);
				}
				assert.ok(expectedDirectories.size === 0);
			});

			it("Can get a subDirectory", () => {
				const fooDirectory = directory1.createSubDirectory("foo");
				const barDirectory = directory1.createSubDirectory("bar");
				fooDirectory.set("testKey", "testValue");
				fooDirectory.set("testKey2", "testValue2");
				barDirectory.set("testKey3", "testValue3");

				containerRuntimeFactory.processAllMessages();

				// Verify the local SharedDirectory
				assert.ok(directory1.getWorkingDirectory("/foo"));
				assert.ok(directory1.getSubDirectory("foo"));

				// Verify the remote SharedDirectory
				assert.ok(directory2.getWorkingDirectory("/foo"));
				assert.ok(directory2.getSubDirectory("foo"));
			});

			it("Knows its absolute path", () => {
				const fooDirectory = directory1.createSubDirectory("foo");
				const barDirectory = fooDirectory.createSubDirectory("bar");

				containerRuntimeFactory.processAllMessages();

				// Verify the local SharedDirectory
				assert.equal(fooDirectory.absolutePath, "/foo");
				assert.equal(barDirectory.absolutePath, "/foo/bar");

				// Verify the remote SharedDirectory
				const fooDirectory2 = directory2.getSubDirectory("foo");
				assert(fooDirectory2);
				const barDirectory2 = fooDirectory2.getSubDirectory("bar");
				assert(barDirectory2);
				assert.equal(fooDirectory2.absolutePath, "/foo");
				assert.equal(barDirectory2.absolutePath, "/foo/bar");
			});

			it("Can get and set keys from a subDirectory using relative paths", () => {
				const fooDirectory = directory1.createSubDirectory("foo");
				const barDirectory = directory1.createSubDirectory("bar");
				fooDirectory.set("testKey", "testValue");
				fooDirectory.set("testKey2", "testValue2");
				barDirectory.set("testKey3", "testValue3");

				containerRuntimeFactory.processAllMessages();

				// Verify the local SharedDirectory
				const testSubDir = directory1.getWorkingDirectory("/foo");
				assert(testSubDir);
				assert.equal(testSubDir.has("testKey"), true);
				assert.equal(testSubDir.has("garbage"), false);
				assert.equal(testSubDir.get("testKey"), "testValue");
				assert.equal(testSubDir.get("testKey2"), "testValue2");
				assert.equal(testSubDir.get("testKey3"), undefined);

				// Verify the remote SharedDirectory
				const barSubDir = directory2.getWorkingDirectory("/foo");
				assert(barSubDir);
				assert.equal(barSubDir.has("testKey"), true);
				assert.equal(barSubDir.has("garbage"), false);
				assert.equal(barSubDir.get("testKey"), "testValue");
				assert.equal(barSubDir.get("testKey2"), "testValue2");
				assert.equal(barSubDir.get("testKey3"), undefined);

				// Set value in sub directory1.
				testSubDir.set("fromSubDir", "testValue4");

				containerRuntimeFactory.processAllMessages();

				// Verify the local sub directory1
				assert.equal(directory1.getWorkingDirectory("foo")?.get("fromSubDir"), "testValue4");

				// Verify the remote sub directory1
				assert.equal(directory2.getWorkingDirectory("foo")?.get("fromSubDir"), "testValue4");
			});

			it("raises the containedValueChanged event when keys are set and deleted from a subDirectory", () => {
				directory1.createSubDirectory("foo");
				directory1.createSubDirectory("bar");
				containerRuntimeFactory.processAllMessages();

				const foo1 = directory1.getWorkingDirectory("/foo");
				assert(foo1);
				const foo2 = directory2.getWorkingDirectory("/foo");
				assert(foo2);
				const bar1 = directory1.getWorkingDirectory("/bar");
				assert(bar1);
				const bar2 = directory2.getWorkingDirectory("/bar");
				assert(bar2);

				let called1 = 0;
				let called2 = 0;
				let called3 = 0;
				let called4 = 0;
				foo1.on("containedValueChanged", () => called1++);
				foo2.on("containedValueChanged", () => called2++);
				bar1.on("containedValueChanged", () => called3++);
				bar2.on("containedValueChanged", () => called4++);

				foo1.set("testKey", "testValue");
				containerRuntimeFactory.processAllMessages();

				assert.strictEqual(
					called1,
					1,
					"containedValueChanged on local foo subDirectory after set()",
				);
				assert.strictEqual(
					called2,
					1,
					"containedValueChanged on remote foo subDirectory after set()",
				);
				assert.strictEqual(
					called3,
					0,
					"containedValueChanged on local bar subDirectory after set()",
				);
				assert.strictEqual(
					called4,
					0,
					"containedValueChanged on remote bar subDirectory after set()",
				);

				foo1.delete("testKey");
				containerRuntimeFactory.processAllMessages();

				assert.strictEqual(
					called1,
					2,
					"containedValueChanged on local subDirectory after delete()",
				);
				assert.strictEqual(
					called2,
					2,
					"containedValueChanged on remote subDirectory after delete()",
				);
				assert.strictEqual(
					called3,
					0,
					"containedValueChanged on local bar subDirectory after delete()",
				);
				assert.strictEqual(
					called4,
					0,
					"containedValueChanged on remote bar subDirectory after delete()",
				);
			});

			it("Can be cleared from the subDirectory", () => {
				const fooDirectory = directory1.createSubDirectory("foo");
				const barDirectory = directory1.createSubDirectory("bar");
				fooDirectory.set("testKey", "testValue");
				fooDirectory.set("testKey2", "testValue2");
				barDirectory.set("testKey3", "testValue3");
				directory1.set("testKey", "testValue4");
				directory1.set("testKey2", "testValue5");
				const testSubDir = directory1.getWorkingDirectory("/foo");
				assert(testSubDir);
				testSubDir.clear();

				containerRuntimeFactory.processAllMessages();

				// Verify the local SharedDirectory
				const fooSubDirectory1 = directory1.getWorkingDirectory("foo");
				assert(fooSubDirectory1);
				assert.equal(fooSubDirectory1.get("testKey"), undefined);
				assert.equal(fooSubDirectory1.get("testKey2"), undefined);
				assert.equal(directory1.getWorkingDirectory("bar")?.get("testKey3"), "testValue3");
				assert.equal(directory1.getWorkingDirectory("..")?.get("testKey"), "testValue4");
				assert.equal(directory1.getWorkingDirectory(".")?.get("testKey2"), "testValue5");

				// Verify the remote SharedDirectory
				const fooSubDirectory2 = directory2.getWorkingDirectory("foo");
				assert(fooSubDirectory2);
				assert.equal(fooSubDirectory2.get("testKey"), undefined);
				assert.equal(fooSubDirectory2.get("testKey2"), undefined);
				assert.equal(directory2.getWorkingDirectory("bar")?.get("testKey3"), "testValue3");
				assert.equal(directory2.getWorkingDirectory("..")?.get("testKey"), "testValue4");
				assert.equal(directory2.getWorkingDirectory(".")?.get("testKey2"), "testValue5");
			});

			it("Can delete keys from the subDirectory", () => {
				const fooDirectory = directory1.createSubDirectory("foo");
				const barDirectory = directory1.createSubDirectory("bar");
				fooDirectory.set("testKey", "testValue");
				fooDirectory.set("testKey2", "testValue2");
				barDirectory.set("testKey3", "testValue3");
				directory1.set("testKey", "testValue4");
				directory1.set("testKey2", "testValue5");
				const testSubDirFoo = directory1.getWorkingDirectory("/foo");
				assert(testSubDirFoo);
				testSubDirFoo.delete("testKey2");
				const testSubDirBar = directory1.getWorkingDirectory("/bar");
				assert(testSubDirBar);
				testSubDirBar.delete("testKey3");

				containerRuntimeFactory.processAllMessages();

				// Verify the local SharedDirectory
				const fooSubDirectory1 = directory1.getWorkingDirectory("foo");
				assert(fooSubDirectory1);
				const barSubDirectory1 = directory1.getWorkingDirectory("bar");
				assert(barSubDirectory1);
				assert.equal(fooSubDirectory1.get("testKey"), "testValue");
				assert.equal(fooSubDirectory1.get("testKey2"), undefined);
				assert.equal(barSubDirectory1.get("testKey3"), undefined);
				assert.equal(directory1.get("testKey"), "testValue4");
				assert.equal(directory1.get("testKey2"), "testValue5");

				// Verify the remote SharedDirectory
				const fooSubDirectory2 = directory2.getWorkingDirectory("foo");
				assert(fooSubDirectory2);
				const barSubDirectory2 = directory2.getWorkingDirectory("bar");
				assert(barSubDirectory2);
				assert.equal(fooSubDirectory2.get("testKey"), "testValue");
				assert.equal(fooSubDirectory2.get("testKey2"), undefined);
				assert.equal(barSubDirectory2.get("testKey3"), undefined);
				assert.equal(directory2.get("testKey"), "testValue4");
				assert.equal(directory2.get("testKey2"), "testValue5");
			});

			it("Knows the size of the subDirectory", () => {
				const fooDirectory = directory1.createSubDirectory("foo");
				const barDirectory = directory1.createSubDirectory("bar");
				fooDirectory.set("testKey", "testValue");
				fooDirectory.set("testKey2", "testValue2");
				barDirectory.set("testKey3", "testValue3");
				directory1.set("testKey", "testValue4");
				directory1.set("testKey2", "testValue5");

				containerRuntimeFactory.processAllMessages();

				// Verify the local SharedDirectory
				const testSubDirFoo = directory1.getWorkingDirectory("/foo");
				assert(testSubDirFoo);
				assert.equal(testSubDirFoo.size, 2);
				// Verify the remote SharedDirectory
				const testSubDirFoo2 = directory2.getWorkingDirectory("/foo");
				assert(testSubDirFoo2);
				assert.equal(testSubDirFoo2.size, 2);

				testSubDirFoo.delete("testKey2");

				containerRuntimeFactory.processAllMessages();

				// Verify the local SharedDirectory
				assert.equal(testSubDirFoo.size, 1);
				// Verify the remote SharedDirectory
				assert.equal(testSubDirFoo2.size, 1);

				directory1.delete("testKey");

				containerRuntimeFactory.processAllMessages();

				// Verify the local SharedDirectory
				assert.equal(testSubDirFoo.size, 1);
				// Verify the remote SharedDirectory
				assert.equal(testSubDirFoo2.size, 1);

				const testSubDirBar = directory1.getWorkingDirectory("/bar");
				assert(testSubDirBar);
				testSubDirBar.delete("testKey3");

				// Verify the local SharedDirectory
				assert.equal(testSubDirFoo.size, 1);
				// Verify the remote SharedDirectory
				assert.equal(testSubDirFoo2.size, 1);

				directory1.clear();

				containerRuntimeFactory.processAllMessages();

				// Verify the local SharedDirectory
				assert.equal(testSubDirFoo.size, 1);
				// Verify the remote SharedDirectory
				assert.equal(testSubDirFoo2.size, 1);

				testSubDirFoo.clear();

				containerRuntimeFactory.processAllMessages();

				// Verify the local SharedDirectory
				assert.equal(testSubDirFoo.size, 0);
				// Verify the remote SharedDirectory
				assert.equal(testSubDirFoo2.size, 0);
			});

			it("Can get a subDirectory from a subDirectory", () => {
				const fooDirectory = directory1.createSubDirectory("foo");
				const barDirectory = directory1.createSubDirectory("bar");
				const bazDirectory = barDirectory.createSubDirectory("baz");
				fooDirectory.set("testKey", "testValue");
				fooDirectory.set("testKey2", "testValue2");
				barDirectory.set("testKey3", "testValue3");
				bazDirectory.set("testKey4", "testValue4");

				containerRuntimeFactory.processAllMessages();

				// Verify the local SharedDirectory
				const barSubDir = directory1.getWorkingDirectory("/bar");
				assert.ok(barSubDir);
				const bazSubDir = barSubDir.getWorkingDirectory("./baz");
				assert.ok(bazSubDir);
				assert.equal(bazSubDir.get("testKey4"), "testValue4");

				// Verify the remote SharedDirectory
				const barSubDir2 = directory2.getWorkingDirectory("/bar");
				assert.ok(barSubDir2);
				const bazSubDir2 = barSubDir2.getWorkingDirectory("./baz");
				assert.ok(bazSubDir2);
				assert.equal(bazSubDir2.get("testKey4"), "testValue4");
			});

			it("Can delete a child subDirectory", () => {
				const fooDirectory = directory1.createSubDirectory("foo");
				const barDirectory = directory1.createSubDirectory("bar");
				const bazDirectory = barDirectory.createSubDirectory("baz");
				fooDirectory.set("testKey", "testValue");
				fooDirectory.set("testKey2", "testValue2");
				barDirectory.set("testKey3", "testValue3");
				bazDirectory.set("testKey4", "testValue4");
				barDirectory.deleteSubDirectory("baz");

				containerRuntimeFactory.processAllMessages();

				// Verify the local SharedDirectory
				assert.equal(barDirectory.getWorkingDirectory("baz"), undefined);

				// Verify the remote SharedDirectory
				const barDirectory2 = directory2.getSubDirectory("bar");
				assert(barDirectory2);
				assert.equal(barDirectory2.getWorkingDirectory("baz"), undefined);
			});

			it("Can delete a child subDirectory with children", () => {
				const fooDirectory = directory1.createSubDirectory("foo");
				const barDirectory = directory1.createSubDirectory("bar");
				const bazDirectory = barDirectory.createSubDirectory("baz");
				fooDirectory.set("testKey", "testValue");
				fooDirectory.set("testKey2", "testValue2");
				barDirectory.set("testKey3", "testValue3");
				bazDirectory.set("testKey4", "testValue4");
				directory1.deleteSubDirectory("bar");

				containerRuntimeFactory.processAllMessages();

				// Verify the local SharedDirectory
				assert.equal(directory1.getWorkingDirectory("bar"), undefined);

				// Verify the remote SharedDirectory
				assert.equal(directory2.getWorkingDirectory("bar"), undefined);
			});

			it("Can get and use a keys iterator", () => {
				const fooDirectory = directory1.createSubDirectory("foo");
				const barDirectory = directory1.createSubDirectory("bar");
				const bazDirectory = barDirectory.createSubDirectory("baz");
				fooDirectory.set("testKey", "testValue");
				fooDirectory.set("testKey2", "testValue2");
				barDirectory.set("testKey3", "testValue3");
				bazDirectory.set("testKey4", "testValue4");

				containerRuntimeFactory.processAllMessages();

				// Verify the local SharedDirectory
				const fooSubDir = directory1.getWorkingDirectory("/foo");
				assert(fooSubDir);
				const fooSubDirIterator = fooSubDir.keys();
				const fooSubDirResult1 = fooSubDirIterator.next();
				assert.equal(fooSubDirResult1.value, "testKey");
				assert.equal(fooSubDirResult1.done, false);
				const fooSubDirResult2 = fooSubDirIterator.next();
				assert.equal(fooSubDirResult2.value, "testKey2");
				assert.equal(fooSubDirResult2.done, false);
				const fooSubDirResult3 = fooSubDirIterator.next();
				assert.equal(fooSubDirResult3.value, undefined);
				assert.equal(fooSubDirResult3.done, true);

				const barSubDir = directory1.getWorkingDirectory("/bar");
				assert(barSubDir);
				const barSubDirIterator = barSubDir.keys();
				const barSubDirResult1 = barSubDirIterator.next();
				assert.equal(barSubDirResult1.value, "testKey3");
				assert.equal(barSubDirResult1.done, false);
				const barSubDirResult2 = barSubDirIterator.next();
				assert.equal(barSubDirResult2.value, undefined);
				assert.equal(barSubDirResult2.done, true);

				// Verify the remote SharedDirectory
				const fooSubDir2 = directory2.getWorkingDirectory("/foo");
				assert(fooSubDir2);
				const fooSubDir2Iterator = fooSubDir2.keys();
				const fooSubDir2Result1 = fooSubDir2Iterator.next();
				assert.equal(fooSubDir2Result1.value, "testKey");
				assert.equal(fooSubDir2Result1.done, false);
				const fooSubDir2Result2 = fooSubDir2Iterator.next();
				assert.equal(fooSubDir2Result2.value, "testKey2");
				assert.equal(fooSubDir2Result2.done, false);
				const fooSubDir2Result3 = fooSubDir2Iterator.next();
				assert.equal(fooSubDir2Result3.value, undefined);
				assert.equal(fooSubDir2Result3.done, true);

				const barSubDir2 = directory2.getWorkingDirectory("/bar");
				assert(barSubDir2);
				const barSubDir2Iterator = barSubDir2.keys();
				const barSubDir2Result1 = barSubDir2Iterator.next();
				assert.equal(barSubDir2Result1.value, "testKey3");
				assert.equal(barSubDir2Result1.done, false);
				const barSubDir2Result2 = barSubDir2Iterator.next();
				assert.equal(barSubDir2Result2.value, undefined);
				assert.equal(barSubDir2Result2.done, true);
			});

			it("Can get and use a values iterator", () => {
				const fooDirectory = directory1.createSubDirectory("foo");
				const barDirectory = directory1.createSubDirectory("bar");
				const bazDirectory = barDirectory.createSubDirectory("baz");
				fooDirectory.set("testKey", "testValue");
				fooDirectory.set("testKey2", "testValue2");
				barDirectory.set("testKey3", "testValue3");
				bazDirectory.set("testKey4", "testValue4");

				containerRuntimeFactory.processAllMessages();

				// Verify the local SharedDirectory
				const fooSubDir = directory1.getWorkingDirectory("/foo");
				assert(fooSubDir);
				const fooSubDirIterator = fooSubDir.values();
				const fooSubDirResult1 = fooSubDirIterator.next();
				assert.equal(fooSubDirResult1.value, "testValue");
				assert.equal(fooSubDirResult1.done, false);
				const fooSubDirResult2 = fooSubDirIterator.next();
				assert.equal(fooSubDirResult2.value, "testValue2");
				assert.equal(fooSubDirResult2.done, false);
				const fooSubDirResult3 = fooSubDirIterator.next();
				assert.equal(fooSubDirResult3.value, undefined);
				assert.equal(fooSubDirResult3.done, true);

				const barSubDir = directory1.getWorkingDirectory("/bar");
				assert(barSubDir);
				const barSubDirIterator = barSubDir.values();
				const barSubDirResult1 = barSubDirIterator.next();
				assert.equal(barSubDirResult1.value, "testValue3");
				assert.equal(barSubDirResult1.done, false);
				const barSubDirResult2 = barSubDirIterator.next();
				assert.equal(barSubDirResult2.value, undefined);
				assert.equal(barSubDirResult2.done, true);

				// Verify the remote SharedDirectory
				const fooSubDir2 = directory2.getWorkingDirectory("/foo");
				assert(fooSubDir2);
				const fooSubDir2Iterator = fooSubDir2.values();
				const fooSubDir2Result1 = fooSubDir2Iterator.next();
				assert.equal(fooSubDir2Result1.value, "testValue");
				assert.equal(fooSubDir2Result1.done, false);
				const fooSubDir2Result2 = fooSubDir2Iterator.next();
				assert.equal(fooSubDir2Result2.value, "testValue2");
				assert.equal(fooSubDir2Result2.done, false);
				const fooSubDir2Result3 = fooSubDir2Iterator.next();
				assert.equal(fooSubDir2Result3.value, undefined);
				assert.equal(fooSubDir2Result3.done, true);

				const barSubDir2 = directory2.getWorkingDirectory("/bar");
				assert(barSubDir2);
				const barSubDir2Iterator = barSubDir2.values();
				const barSubDir2Result1 = barSubDir2Iterator.next();
				assert.equal(barSubDir2Result1.value, "testValue3");
				assert.equal(barSubDir2Result1.done, false);
				const barSubDir2Result2 = barSubDir2Iterator.next();
				assert.equal(barSubDir2Result2.value, undefined);
				assert.equal(barSubDir2Result2.done, true);
			});

			it("Can get and use an entries iterator", () => {
				const fooDirectory = directory1.createSubDirectory("foo");
				const barDirectory = directory1.createSubDirectory("bar");
				const bazDirectory = barDirectory.createSubDirectory("baz");
				fooDirectory.set("testKey", "testValue");
				fooDirectory.set("testKey2", "testValue2");
				barDirectory.set("testKey3", "testValue3");
				bazDirectory.set("testKey4", "testValue4");

				containerRuntimeFactory.processAllMessages();

				// Verify the local SharedDirectory
				const fooSubDir = directory1.getWorkingDirectory("/foo");
				assert(fooSubDir);
				const fooSubDirIterator = fooSubDir.entries();
				const fooSubDirResult1 = fooSubDirIterator.next();
				// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
				assert.equal(fooSubDirResult1.value[0], "testKey");
				// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
				assert.equal(fooSubDirResult1.value[1], "testValue");
				assert.equal(fooSubDirResult1.done, false);
				const fooSubDirResult2 = fooSubDirIterator.next();
				// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
				assert.equal(fooSubDirResult2.value[0], "testKey2");
				// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
				assert.equal(fooSubDirResult2.value[1], "testValue2");
				assert.equal(fooSubDirResult2.done, false);
				const fooSubDirResult3 = fooSubDirIterator.next();
				assert.equal(fooSubDirResult3.value, undefined);
				assert.equal(fooSubDirResult3.done, true);

				const barSubDir = directory1.getWorkingDirectory("/bar");
				assert(barSubDir);

				const expectedEntries = new Set(["testKey3"]);
				for (const entry of barSubDir) {
					assert.ok(expectedEntries.has(entry[0]));
					expectedEntries.delete(entry[0]);
				}
				assert.ok(expectedEntries.size === 0);

				// Verify the remote SharedDirectory
				const fooSubDir2 = directory2.getWorkingDirectory("/foo");
				assert(fooSubDir2);
				const fooSubDir2Iterator = fooSubDir2.entries();
				const fooSubDir2Result1 = fooSubDir2Iterator.next();
				// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
				assert.equal(fooSubDir2Result1.value[0], "testKey");
				// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
				assert.equal(fooSubDir2Result1.value[1], "testValue");
				assert.equal(fooSubDir2Result1.done, false);
				const fooSubDir2Result2 = fooSubDir2Iterator.next();
				// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
				assert.equal(fooSubDir2Result2.value[0], "testKey2");
				// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
				assert.equal(fooSubDir2Result2.value[1], "testValue2");
				assert.equal(fooSubDir2Result2.done, false);
				const fooSubDir2Result3 = fooSubDir2Iterator.next();
				assert.equal(fooSubDir2Result3.value, undefined);
				assert.equal(fooSubDir2Result3.done, true);

				const barSubDir2 = directory2.getWorkingDirectory("/bar");
				assert(barSubDir2);

				const expectedEntries2 = new Set(["testKey3"]);
				for (const entry of barSubDir2) {
					assert.ok(expectedEntries2.has(entry[0]));
					expectedEntries2.delete(entry[0]);
				}
				assert.ok(expectedEntries2.size === 0);
			});

			it("Can iterate over its subdirectories", () => {
				const fooDirectory = directory1.createSubDirectory("foo");
				fooDirectory.createSubDirectory("bar");
				fooDirectory.createSubDirectory("baz");

				containerRuntimeFactory.processAllMessages();

				// Verify the local SharedDirectory
				const expectedDirectories = new Set(["bar", "baz"]);
				for (const [subDirName] of fooDirectory.subdirectories()) {
					assert.ok(expectedDirectories.has(subDirName));
					expectedDirectories.delete(subDirName);
				}
				assert.ok(expectedDirectories.size === 0);

				// Verify the remote SharedDirectory
				const fooDirectory2 = directory2.getSubDirectory("foo");
				assert(fooDirectory2);
				const expectedDirectories2 = new Set(["bar", "baz"]);
				for (const [subDirName] of fooDirectory2.subdirectories()) {
					assert.ok(expectedDirectories2.has(subDirName));
					expectedDirectories2.delete(subDirName);
				}
				assert.ok(expectedDirectories2.size === 0);
			});

			it("Only creates a subDirectory once", () => {
				const fooDirectory = directory1.createSubDirectory("foo");
				fooDirectory.set("testKey", "testValue");
				const fooDirectory2 = directory1.createSubDirectory("foo");
				fooDirectory2.set("testKey2", "testValue2");
				assert.strictEqual(fooDirectory, fooDirectory2, "Created two separate subdirectories");
				assert.strictEqual(fooDirectory.get("testKey2"), "testValue2", "Value 2 not present");
				assert.strictEqual(fooDirectory2.get("testKey"), "testValue", "Value 1 not present");
			});
		});
	});

	describe("Garbage Collection", () => {
		class GCSharedDirectoryProvider implements IGCTestProvider {
			private subMapCount = 0;
			private _expectedRoutes: string[] = [];
			private readonly directory1: SharedDirectory;
			private readonly directory2: SharedDirectory;
			private readonly containerRuntimeFactory: MockContainerRuntimeFactory;

			public constructor() {
				this.containerRuntimeFactory = new MockContainerRuntimeFactory();
				this.directory1 = createConnectedDirectory("directory1", this.containerRuntimeFactory);
				this.directory2 = createConnectedDirectory("directory2", this.containerRuntimeFactory);
			}

			/**
			 * {@inheritDoc @fluid-private/test-dds-utils#IGCTestProvider.sharedObject}
			 */
			public get sharedObject(): SharedDirectory {
				// Return the remote SharedDirectory because we want to verify its summary data.
				return this.directory2;
			}

			/**
			 * {@inheritDoc @fluid-private/test-dds-utils#IGCTestProvider.expectedOutboundRoutes}
			 */
			public get expectedOutboundRoutes(): string[] {
				return this._expectedRoutes;
			}

			/**
			 * {@inheritDoc @fluid-private/test-dds-utils#IGCTestProvider.addOutboundRoutes}
			 */
			public async addOutboundRoutes(): Promise<void> {
				const subMapId1 = `subMap-${++this.subMapCount}`;
				const subMap1 = createLocalMap(subMapId1);
				this.directory1.set(subMapId1, subMap1.handle);
				this._expectedRoutes.push(toFluidHandleInternal(subMap1.handle).absolutePath);

				const fooDirectory =
					this.directory1.getSubDirectory("foo") ?? this.directory1.createSubDirectory("foo");
				const subMapId2 = `subMap-${++this.subMapCount}`;
				const subMap2 = createLocalMap(subMapId2);
				fooDirectory.set(subMapId2, subMap2.handle);
				this._expectedRoutes.push(toFluidHandleInternal(subMap2.handle).absolutePath);

				this.containerRuntimeFactory.processAllMessages();
			}

			/**
			 * {@inheritDoc @fluid-private/test-dds-utils#IGCTestProvider.deleteOutboundRoutes}
			 */
			public async deleteOutboundRoutes(): Promise<void> {
				// Delete the last handle that was added.
				const fooDirectory = this.directory1.getSubDirectory("foo");
				assert(fooDirectory, "Route must be added before deleting");

				const subMapId = `subMap-${this.subMapCount}`;

				const deletedHandle = fooDirectory.get(subMapId) as IFluidHandleInternal;
				assert(deletedHandle, "Route must be added before deleting");

				fooDirectory.delete(subMapId);
				// Remove deleted handle's route from expected routes.
				this._expectedRoutes = this._expectedRoutes.filter(
					(route) => route !== deletedHandle.absolutePath,
				);

				this.containerRuntimeFactory.processAllMessages();
			}

			/**
			 * {@inheritDoc @fluid-private/test-dds-utils#IGCTestProvider.addNestedHandles}
			 */
			public async addNestedHandles(): Promise<void> {
				const fooDirectory =
					this.directory1.getSubDirectory("foo") ?? this.directory1.createSubDirectory("foo");
				const subMapId1 = `subMap-${++this.subMapCount}`;
				const subMapId2 = `subMap-${++this.subMapCount}`;
				const subMap = createLocalMap(subMapId1);
				const subMap2 = createLocalMap(subMapId2);
				const containingObject = {
					subMapHandle: subMap.handle,
					nestedObj: {
						subMap2Handle: subMap2.handle,
					},
				};
				fooDirectory.set(subMapId2, containingObject);
				this.containerRuntimeFactory.processAllMessages();
				this._expectedRoutes.push(
					toFluidHandleInternal(subMap.handle).absolutePath,
					toFluidHandleInternal(subMap2.handle).absolutePath,
				);
			}
		}

		runGCTests(GCSharedDirectoryProvider);
	});
});

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import {
	MockFluidDataStoreRuntime,
	MockContainerRuntimeFactory,
	MockContainerRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils";
import { FlushMode } from "@fluidframework/runtime-definitions";
import { MapFactory, SharedMap } from "../../map.js";
import { DirectoryFactory, SharedDirectory } from "../../directory.js";
import { IDirectory } from "../../interfaces.js";

describe("Rebasing", () => {
	let containerRuntimeFactory: MockContainerRuntimeFactory;
	let containerRuntime1: MockContainerRuntime;
	let containerRuntime2: MockContainerRuntime;

	for (const testConfig of [
		{
			options: {
				flushMode: FlushMode.Immediate,
			},
			name: "FlushMode immediate",
		},
		{
			options: {
				flushMode: FlushMode.TurnBased,
				enableGroupedBatching: true,
			},
			name: "FlushMode TurnBased with grouped batching",
		},
	]) {
		describe(`SharedMap - ${testConfig.name}`, () => {
			let map1: SharedMap;
			let map2: SharedMap;

			beforeEach("createMaps", async () => {
				containerRuntimeFactory = new MockContainerRuntimeFactory(testConfig.options);
				const dataStoreRuntime1 = new MockFluidDataStoreRuntime();
				containerRuntime1 =
					containerRuntimeFactory.createContainerRuntime(dataStoreRuntime1);
				const services1 = {
					deltaConnection: dataStoreRuntime1.createDeltaConnection(),
					objectStorage: new MockStorage(),
				};
				map1 = new SharedMap("shared-map-1", dataStoreRuntime1, MapFactory.Attributes);
				map1.connect(services1);

				const dataStoreRuntime2 = new MockFluidDataStoreRuntime();
				containerRuntime2 =
					containerRuntimeFactory.createContainerRuntime(dataStoreRuntime2);
				const services2 = {
					deltaConnection: dataStoreRuntime2.createDeltaConnection(),
					objectStorage: new MockStorage(),
				};
				map2 = new SharedMap("shared-map-2", dataStoreRuntime2, MapFactory.Attributes);
				map2.connect(services2);
			});

			it("Rebasing ops maintains eventual consistency", () => {
				const keyCount = 10;
				for (let i = 0; i < keyCount; i++) {
					map1.set(`${i}`, map1.size);
				}

				containerRuntime1.rebase();
				containerRuntime1.flush();
				containerRuntimeFactory.processAllMessages();

				for (let i = 0; i < keyCount; i++) {
					assert.strictEqual(map1.get(`${i}`), i);
					assert.strictEqual(map2.get(`${i}`), i);
				}

				const deleteThreshold = 5;
				for (let i = 0; i < deleteThreshold - 1; i++) {
					map2.delete(`${i}`);
				}

				map1.delete(`${deleteThreshold - 1}`);

				containerRuntime2.rebase();
				containerRuntime1.flush();
				containerRuntime2.flush();
				containerRuntimeFactory.processAllMessages();

				for (let i = 0; i < 10; i++) {
					const expected = i < deleteThreshold ? undefined : i;
					assert.strictEqual(map1.get(`${i}`), expected);
					assert.strictEqual(map2.get(`${i}`), expected);
				}
			});
		});

		describe(`SharedDirectory - ${testConfig.name}`, () => {
			let dir1: SharedDirectory;
			let dir2: SharedDirectory;

			beforeEach("createDirectories", async () => {
				containerRuntimeFactory = new MockContainerRuntimeFactory(testConfig.options);
				const dataStoreRuntime1 = new MockFluidDataStoreRuntime();
				containerRuntime1 =
					containerRuntimeFactory.createContainerRuntime(dataStoreRuntime1);
				const services1 = {
					deltaConnection: dataStoreRuntime1.createDeltaConnection(),
					objectStorage: new MockStorage(),
				};
				dir1 = new SharedDirectory(
					"shared-directory-1",
					dataStoreRuntime1,
					DirectoryFactory.Attributes,
				);
				dir1.connect(services1);

				// Create the second SharedMap.
				const dataStoreRuntime2 = new MockFluidDataStoreRuntime();
				containerRuntime2 =
					containerRuntimeFactory.createContainerRuntime(dataStoreRuntime2);
				const services2 = {
					deltaConnection: dataStoreRuntime2.createDeltaConnection(),
					objectStorage: new MockStorage(),
				};
				dir2 = new SharedDirectory(
					"shared-directory-2",
					dataStoreRuntime2,
					DirectoryFactory.Attributes,
				);
				dir2.connect(services2);
			});

			const areDirectoriesEqual = (
				a: IDirectory | undefined,
				b: IDirectory | undefined,
			): void => {
				if (a === undefined || b === undefined) {
					assert.strictEqual(a, b, "Both directories should be undefined");
					return;
				}

				const leftKeys = [...a.keys()];
				const rightKeys = [...b.keys()];
				assert.strictEqual(
					leftKeys.length,
					rightKeys.length,
					"Number of keys should be the same",
				);
				for (const key of leftKeys) {
					assert.strictEqual(a.get(key), b.get(key), "Key values should be the same");
				}

				const leftSubdirectories = [...a.subdirectories()];
				const rightSubdirectories = [...b.subdirectories()];
				assert.strictEqual(
					leftSubdirectories.length,
					rightSubdirectories.length,
					"Number of subdirectories should be the same",
				);

				for (const [name] of leftSubdirectories)
					areDirectoriesEqual(a.getSubDirectory(name), b.getSubDirectory(name));
			};

			it("Rebasing ops maintains eventual consistency", () => {
				dir2.on("valueChanged", (changed) => {
					if (changed.key === "key") {
						dir2.set("valueChanged", "valueChanged");
					}
				});
				dir2.on("subDirectoryCreated", () => {
					dir2.set("subDirectoryCreated1", "subDirectoryCreated");
					dir2.set("subDirectoryCreated2", "subDirectoryCreated");
				});
				const root1SubDir = dir1.createSubDirectory("testSubDir");
				dir2.createSubDirectory("testSubDir");

				containerRuntime1.flush();
				containerRuntime2.rebase();
				containerRuntime2.flush();

				root1SubDir.set("key1", "testValue1");
				dir1.set("key", "value");
				containerRuntime1.flush();
				containerRuntimeFactory.processAllMessages();

				dir2.deleteSubDirectory("testSubDir");
				dir2.createSubDirectory("testSubDir");

				containerRuntime2.rebase();
				containerRuntime2.flush();
				containerRuntimeFactory.processAllMessages();

				const directory1SubDir = dir1.getSubDirectory("testSubDir");
				const directory2SubDir = dir2.getSubDirectory("testSubDir");

				assert(directory1SubDir !== undefined, "SubDirectory on dir 1 should be present");
				assert(directory2SubDir !== undefined, "SubDirectory on dir 2 should be present");

				assert.strictEqual(directory1SubDir.size, 0, "Dir 1 no key should exist");
				assert.strictEqual(directory2SubDir.size, 0, "Dir 2 no key should exist");
				areDirectoriesEqual(dir1, dir2);
			});
		});
	}
});

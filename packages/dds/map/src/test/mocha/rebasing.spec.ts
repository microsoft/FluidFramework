/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	MockFluidDataStoreRuntime,
	MockContainerRuntimeFactory,
	MockContainerRuntime,
	MockStorage,
	MockContainerRuntimeForReconnection,
} from "@fluidframework/test-runtime-utils";
import { FlushMode } from "@fluidframework/runtime-definitions";
import { MapFactory, SharedMap } from "../../map";
import { DirectoryFactory, SharedDirectory } from "../../directory";
import { IDirectory } from "../../interfaces";

describe("Rebasing", () => {
	let containerRuntimeFactory: MockContainerRuntimeFactory;
	let containerRuntime1: MockContainerRuntime;
	let containerRuntime2: MockContainerRuntime;
	let containerRuntime3: MockContainerRuntime;

	[
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
	].forEach((testConfig) => {
		describe(`SharedMap - ${testConfig.name}`, () => {
			let map1: SharedMap;
			let map2: SharedMap;

			beforeEach(async () => {
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

			beforeEach(async () => {
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

			const areDirectoriesEqual = (a: IDirectory | undefined, b: IDirectory | undefined) => {
				if (a === undefined || b === undefined) {
					assert.strictEqual(a, b, "Both directories should be undefined");
					return;
				}

				const leftKeys = Array.from(a.keys());
				const rightKeys = Array.from(b.keys());
				assert.strictEqual(
					leftKeys.length,
					rightKeys.length,
					"Number of keys should be the same",
				);
				leftKeys.forEach((key) => {
					assert.strictEqual(a.get(key), b.get(key), "Key values should be the same");
				});

				const leftSubdirectories = Array.from(a.subdirectories());
				const rightSubdirectories = Array.from(b.subdirectories());
				assert.strictEqual(
					leftSubdirectories.length,
					rightSubdirectories.length,
					"Number of subdirectories should be the same",
				);

				leftSubdirectories.forEach(([name]) =>
					areDirectoriesEqual(a.getSubDirectory(name), b.getSubDirectory(name)),
				);
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

		describe(`SharedDirector Failed Fuzz tests - ${testConfig.name}`, () => {
			let dir1: SharedDirectory;
			let dir2: SharedDirectory;
			let dir3: SharedDirectory;

			beforeEach(async () => {
				containerRuntimeFactory = new MockContainerRuntimeFactory(testConfig.options);
				const dataStoreRuntime1 = new MockFluidDataStoreRuntime();
				containerRuntime1 = containerRuntimeFactory.createContainerRuntime(
					dataStoreRuntime1,
				) as MockContainerRuntimeForReconnection;
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
				containerRuntime2 = containerRuntimeFactory.createContainerRuntime(
					dataStoreRuntime2,
				) as MockContainerRuntimeForReconnection;
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

				// Create the third SharedMap.
				const dataStoreRuntime3 = new MockFluidDataStoreRuntime();
				containerRuntime3 = containerRuntimeFactory.createContainerRuntime(
					dataStoreRuntime3,
				) as MockContainerRuntimeForReconnection;
				const services3 = {
					deltaConnection: dataStoreRuntime3.createDeltaConnection(),
					objectStorage: new MockStorage(),
				};
				dir3 = new SharedDirectory(
					"shared-directory-3",
					dataStoreRuntime3,
					DirectoryFactory.Attributes,
				);
				dir3.connect(services3);
			});

			const areDirectoriesEqual = (a: IDirectory | undefined, b: IDirectory | undefined) => {
				if (a === undefined || b === undefined) {
					assert.strictEqual(a, b, "Both directories should be undefined");
					return;
				}

				const leftKeys = Array.from(a.keys());
				const rightKeys = Array.from(b.keys());
				assert.strictEqual(
					leftKeys.length,
					rightKeys.length,
					"Number of keys should be the same",
				);
				leftKeys.forEach((key) => {
					assert.strictEqual(a.get(key), b.get(key), "Key values should be the same");
				});

				const leftSubdirectories = Array.from(a.subdirectories());
				const rightSubdirectories = Array.from(b.subdirectories());
				assert.strictEqual(
					leftSubdirectories.length,
					rightSubdirectories.length,
					"Number of subdirectories should be the same",
				);

				leftSubdirectories.forEach(([name]) =>
					areDirectoriesEqual(a.getSubDirectory(name), b.getSubDirectory(name)),
				);
			};

			interface Client {
				directory: IDirectory;
				containerRuntime: MockContainerRuntimeForReconnection;
			}

			const synchronize = (clients: Client[]) => {
				const connectedClients = clients.filter(
					(client) => client.containerRuntime.connected,
				);

				for (const client of connectedClients) {
					assert(
						client.containerRuntime.flush !== undefined,
						"Unsupported mock runtime version",
					);
					client.containerRuntime.flush();
				}

				containerRuntimeFactory.processAllMessages();

				if (connectedClients.length >= 2) {
					for (let i = 0; i < connectedClients.length - 1; i++) {
						areDirectoriesEqual(
							connectedClients[i].directory,
							connectedClients[i + 1].directory,
						);
					}
					if (connectedClients.length > 2) {
						areDirectoriesEqual(
							connectedClients[connectedClients.length - 1].directory,
							connectedClients[0].directory,
						);
					}
				}
			};

			it("Failed Seed 8", () => {
				const client1: Client = {
					directory: dir1,
					containerRuntime: containerRuntime1 as MockContainerRuntimeForReconnection,
				};
				const client2: Client = {
					directory: dir2,
					containerRuntime: containerRuntime2 as MockContainerRuntimeForReconnection,
				};
				const client3: Client = {
					directory: dir3,
					containerRuntime: containerRuntime3 as MockContainerRuntimeForReconnection,
				};
				const clients = [client1, client2, client3];

				(containerRuntime1 as MockContainerRuntimeForReconnection).connected = false;
				synchronize(clients);

				dir2.createSubDirectory("d1");
				synchronize(clients);

				containerRuntime1.rebase();
				dir1.createSubDirectory("d1");
				dir2.createSubDirectory("d1");
				(containerRuntime1 as MockContainerRuntimeForReconnection).connected = true;
				synchronize(clients);

				(containerRuntime1 as MockContainerRuntimeForReconnection).connected = false;
				dir2.deleteSubDirectory("d1");
				synchronize(clients);

				dir3.createSubDirectory("d1");
				synchronize(clients);

				(containerRuntime2 as MockContainerRuntimeForReconnection).connected = false;
				(containerRuntime1 as MockContainerRuntimeForReconnection).connected = true;
				dir3.deleteSubDirectory("d1");
				dir3.createSubDirectory("d2");
				(containerRuntime2 as MockContainerRuntimeForReconnection).connected = true;
				synchronize(clients);

				// From line 135, all good above
				dir3.deleteSubDirectory("d2");
				dir3.createSubDirectory("d2");
				synchronize(clients);

				dir3.getWorkingDirectory("d2")?.createSubDirectory("d2");
				synchronize(clients);

				(containerRuntime3 as MockContainerRuntimeForReconnection).connected = false;
				dir1.deleteSubDirectory("d2");
				dir1.createSubDirectory("d1");
				synchronize(clients);

				// From line 185, all good above
				dir3.createSubDirectory("d2");
				(containerRuntime2 as MockContainerRuntimeForReconnection).connected = false;
				dir1.getWorkingDirectory("d1")?.createSubDirectory("d1");
				dir1.getWorkingDirectory("d1")?.deleteSubDirectory("d1");
				synchronize(clients);

				// From line 212, all good above
				dir3.getWorkingDirectory("d2")?.createSubDirectory("d1");
				dir1.deleteSubDirectory("d1");
				(containerRuntime3 as MockContainerRuntimeForReconnection).connected = true;
				(containerRuntime1 as MockContainerRuntimeForReconnection).connected = false;
				(containerRuntime1 as MockContainerRuntimeForReconnection).connected = true;
				(containerRuntime2 as MockContainerRuntimeForReconnection).connected = true;
				(containerRuntime2 as MockContainerRuntimeForReconnection).connected = false;
				dir2.getWorkingDirectory("d1")?.createSubDirectory("d2");
				containerRuntime1.rebase();
				(containerRuntime1 as MockContainerRuntimeForReconnection).connected = false;
				synchronize(clients);

				// From line 266, all good above
				(containerRuntime3 as MockContainerRuntimeForReconnection).connected = false;
				dir3.deleteSubDirectory("d1");
				dir2.getWorkingDirectory("d1")?.deleteSubDirectory("d2");
				synchronize(clients);
				dir1.createSubDirectory("d2");
				synchronize(clients);

				// From line 298, all good above
				dir1.deleteSubDirectory("d2");
				(containerRuntime3 as MockContainerRuntimeForReconnection).connected = true;
				(containerRuntime1 as MockContainerRuntimeForReconnection).connected = true;
				(containerRuntime3 as MockContainerRuntimeForReconnection).connected = false;
				synchronize(clients);
				(containerRuntime2 as MockContainerRuntimeForReconnection).connected = true;
				synchronize(clients);
				dir1.createSubDirectory("d2");
				dir3.createSubDirectory("d1");
				synchronize(clients);

				// From line 349, all good above
				dir2.deleteSubDirectory("d2");
				(containerRuntime2 as MockContainerRuntimeForReconnection).connected = false;
				containerRuntime3.rebase();
				synchronize(clients);
				dir2.createSubDirectory("d2");
				synchronize(clients);
				dir1.createSubDirectory("d2");
				synchronize(clients);
				dir2.deleteSubDirectory("d2");
				(containerRuntime1 as MockContainerRuntimeForReconnection).connected = false;
				dir2.createSubDirectory("d1");
				synchronize(clients);

				// From line 404, all good above
				dir1.createSubDirectory("d2");
				synchronize(clients);
				dir1.createSubDirectory("d2");
				dir1.deleteSubDirectory("d2");
				synchronize(clients);
				(containerRuntime1 as MockContainerRuntimeForReconnection).connected = true;
				(containerRuntime2 as MockContainerRuntimeForReconnection).connected = true;
				(containerRuntime2 as MockContainerRuntimeForReconnection).connected = false;
				synchronize(clients);
				(containerRuntime3 as MockContainerRuntimeForReconnection).connected = true;
				synchronize(clients);
			});
		});
	});
});

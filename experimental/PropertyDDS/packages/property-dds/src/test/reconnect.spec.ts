/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { DeterministicRandomGenerator } from "@fluid-experimental/property-common";
import {
	Float64Property,
	PropertyFactory,
	StringProperty,
} from "@fluid-experimental/property-properties";
import {
	MockContainerRuntimeFactoryForReconnection,
	MockContainerRuntimeForReconnection,
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils/internal";
import { expect } from "chai";
import { v5 as uuidv5 } from "uuid";

import { SharedPropertyTree } from "../propertyTree.js";
import { PropertyTreeFactory } from "../propertyTreeFactory.js";

// a "namespace" uuid to generate uuidv5 in fuzz tests
const namespaceGuid = "4da9a064-f910-44bf-b840-ffdd699a2e05";

describe("PropertyDDS", () => {
	describe("Reconnection", () => {
		let containerRuntimeFactory: MockContainerRuntimeFactoryForReconnection;
		let trees: SharedPropertyTree[] = [];
		let runtimes: MockContainerRuntimeForReconnection[] = [];

		function createTrees(number) {
			containerRuntimeFactory = new MockContainerRuntimeFactoryForReconnection();
			trees = [];
			runtimes = [];

			for (let i = 0; i < number; i++) {
				const dataStoreRuntime = new MockFluidDataStoreRuntime();
				const containerRuntime =
					containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);
				const services = {
					deltaConnection: dataStoreRuntime.createDeltaConnection(),
					objectStorage: new MockStorage(),
				};
				const tree = new SharedPropertyTree(
					`shared-map-${i}`,
					dataStoreRuntime,
					PropertyTreeFactory.Attributes,
					{
						paths: [],
						disablePartialCheckout: true,
					},
				);
				tree.connect(services);

				trees.push(tree);
				runtimes.push(containerRuntime);
			}
		}

		it("causes correct rebase for operations outside of collaboration window", () => {
			// Prepare the tree DDSs
			createTrees(2);
			const tree1 = trees[0];
			const tree2 = trees[1];

			// Create a first base commit
			tree1.root.insert("base", PropertyFactory.create("String", undefined, "test"));
			tree1.commit();

			// Make sure all clients got this update
			containerRuntimeFactory.processAllMessages();

			// Create a change on tree1, but do not yet send the update
			tree1.root.insert("test", PropertyFactory.create("String", undefined, "test"));
			tree1.commit();
			runtimes[0].connected = false;

			// Create a large number of conflicting changes in tree2 (to make sure it is out of collab window)
			tree2.root.insert("test", PropertyFactory.create("String", undefined, "0"));
			tree2.commit();
			containerRuntimeFactory.processAllMessages();

			for (let i = 1; i < 100; i++) {
				tree2.root.get<StringProperty>("test")?.setValue(String(i));
				tree2.commit();

				// Synchronize the messages with the server, to increment
				// the MSN
				containerRuntimeFactory.processAllMessages();

				// Make sure the history is pruned and operations
				// outside of the collaboration window are removed
				// (this will create a situation where tree1 has to
				//  rebase its operations)
				tree2.pruneHistory();
			}

			// Reconnect the first client.
			runtimes[0].connected = true;
			containerRuntimeFactory.processAllMessages();

			// Make sure the rebase happened correctly
			assert(tree1.root.get<StringProperty>("test")?.getValue() === "test");
			assert(tree2.root.get<StringProperty>("test")?.getValue() === "test");
		});

		describe("fuzz test", () => {
			const startTest = 0;
			const count = 100;
			const maxCollaborators = 5;
			const maxIterations = 30;
			const numKeys = 2;
			const maxValue = 10;

			for (let i = startTest; i < count; i++) {
				const seed = uuidv5(String(i), namespaceGuid);
				it(`case #${i} (seed: ${seed})`, async () => {
					const random = new DeterministicRandomGenerator(seed);

					// Create the DDSs
					createTrees(random.irandom(maxCollaborators - 2) + 2);

					const iterations = random.irandom(maxIterations);
					for (let j = 0; j < iterations; j++) {
						// In each iteration we perform an operation for each collaborator
						for (let k = 0; k < trees.length; k++) {
							const tree = trees[k];
							const runtime = runtimes[k];

							const operation = random.irandom(5);
							switch (operation) {
								case 0:
								case 1:
								case 2:
									{
										// insert / modify an entry in the tree
										const key = `item_${random.irandom(numKeys)}`;
										const property = tree.root.get<Float64Property>(key);
										if (property !== undefined) {
											property.setValue(random.irandom(maxValue));
										} else {
											tree.root.insert(
												key,
												PropertyFactory.create("Float64", undefined, random.irandom(maxValue)),
											);
										}
										tree.commit();
									}
									break;
								case 3:
									{
										// remove an existing property
										const ids = tree.root.getIds();
										if (ids.length > 0) {
											const selectedKey = ids[random.irandom(ids.length)];
											tree.root.remove(selectedKey);
											tree.commit();
										}
									}
									break;
								case 4:
									{
										// swap connection status
										runtime.connected = !runtime.connected;
									}
									break;
								default:
									throw new Error(`Should never happen. Operation ${operation}`);
							}
						}

						if (random.irandom(2) > 0) {
							containerRuntimeFactory.processAllMessages();
						}

						if (random.irandom(2) > 0) {
							for (const tree of trees) {
								tree.pruneHistory();
							}
						}
					}

					// Make sure the trees are in sync afterwards
					for (const runtime of runtimes) {
						runtime.connected = true;
					}
					containerRuntimeFactory.processAllMessages();

					for (let j = 1; j < trees.length; j++) {
						expect(trees[j - 1].root.serialize()).to.deep.equal(trees[j].root.serialize());
					}
				}).timeout(10000);
			}
		});
	});
});

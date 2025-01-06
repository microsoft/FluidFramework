/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { IGCTestProvider, runGCTests } from "@fluid-private/test-dds-utils";
import type { IFluidHandleInternal } from "@fluidframework/core-interfaces/internal";
import { IChannelServices } from "@fluidframework/datastore-definitions/internal";
import {
	MockContainerRuntimeFactory,
	MockContainerRuntimeFactoryForReconnection,
	MockContainerRuntimeForReconnection,
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils/internal";

import type { ConsensusOrderedCollection } from "../consensusOrderedCollection.js";
import {
	ConsensusQueueFactory,
	type ConsensusQueue,
} from "../consensusOrderedCollectionFactory.js";
import { ConsensusResult, IConsensusOrderedCollection } from "../interfaces.js";
import { acquireAndComplete, waitAcquireAndComplete } from "../testUtils.js";

function createConnectedCollection(
	id: string,
	runtimeFactory: MockContainerRuntimeFactory,
): ConsensusQueue {
	const dataStoreRuntime = new MockFluidDataStoreRuntime();
	runtimeFactory.createContainerRuntime(dataStoreRuntime);
	const services: IChannelServices = {
		deltaConnection: dataStoreRuntime.createDeltaConnection(),
		objectStorage: new MockStorage(),
	};

	const factory = new ConsensusQueueFactory();
	const testCollection = factory.create(dataStoreRuntime, id);
	testCollection.connect(services);
	return testCollection as ConsensusQueue;
}

function createLocalCollection(id: string): ConsensusQueue {
	const factory = new ConsensusQueueFactory();
	return factory.create(new MockFluidDataStoreRuntime(), id) as ConsensusQueue;
}

function createCollectionForReconnection(
	id: string,
	runtimeFactory: MockContainerRuntimeFactoryForReconnection,
): {
	collection: IConsensusOrderedCollection;
	containerRuntime: MockContainerRuntimeForReconnection;
} {
	const dataStoreRuntime = new MockFluidDataStoreRuntime();
	const containerRuntime = runtimeFactory.createContainerRuntime(dataStoreRuntime);
	const services: IChannelServices = {
		deltaConnection: dataStoreRuntime.createDeltaConnection(),
		objectStorage: new MockStorage(),
	};

	const factory = new ConsensusQueueFactory();
	const collection = factory.create(dataStoreRuntime, id);
	collection.connect(services);
	return { collection, containerRuntime };
}

describe("ConsensusOrderedCollection", () => {
	function generate(
		input: unknown[],
		output: unknown[],
		creator: () => ConsensusOrderedCollection,
		processMessages: () => void,
	): void {
		let testCollection: ConsensusOrderedCollection;

		async function removeItem(): Promise<unknown> {
			const resP = acquireAndComplete(testCollection);
			processMessages();
			setImmediate(() => processMessages());
			return resP;
		}

		async function waitAndRemoveItem(): Promise<unknown> {
			processMessages();
			const resP = waitAcquireAndComplete(testCollection);
			processMessages();
			setImmediate(() => processMessages());
			return resP;
		}

		async function addItem(item): Promise<void> {
			const waitP = testCollection.add(item);
			processMessages();
			return waitP;
		}

		describe("ConsensusQueue", () => {
			beforeEach(async () => {
				testCollection = creator();
			});

			it("Can create a collection", () => {
				assert.ok(testCollection);
			});

			it("Can add and remove data", async () => {
				assert.strictEqual(await removeItem(), undefined);
				await addItem("testValue");
				assert.strictEqual(await removeItem(), "testValue");
				assert.strictEqual(await removeItem(), undefined);
			});

			it("Can add and remove a handle", async () => {
				assert.strictEqual(await removeItem(), undefined);
				const handle = testCollection.handle;
				assert(handle, "Need an actual handle to test this case");
				await addItem(handle);

				const acquiredValue = (await removeItem()) as IFluidHandleInternal;

				assert.strictEqual(acquiredValue.absolutePath, handle.absolutePath);
				const dataStore = (await handle.get()) as ConsensusQueue;
				assert.strictEqual(dataStore.handle.absolutePath, testCollection.handle.absolutePath);

				assert.strictEqual(await removeItem(), undefined);
			});

			it("Can add and release data", async () => {
				await addItem("testValue");
				const promise = testCollection.acquire(async (value) => {
					assert.strictEqual(value, "testValue");
					return ConsensusResult.Release;
				});
				processMessages();
				await promise;
				assert.strictEqual(await waitAndRemoveItem(), "testValue");
				assert.strictEqual(await removeItem(), undefined);
			});

			it("Can wait for data", async () => {
				let added = false;
				let res: unknown;
				const p = testCollection.waitAndAcquire(async (value) => {
					assert(added, "Wait resolved before value is added");
					res = value;
					return ConsensusResult.Complete;
				});

				const p2 = addItem("testValue");
				processMessages();
				added = true;
				await p2;
				// There are two hops here - one "acquire" message, another "release" message.
				processMessages();
				setImmediate(() => processMessages());
				await p;
				assert.strictEqual(res, "testValue");
			});

			it("Data ordering", async () => {
				for (const item of input) {
					await addItem(item);
				}

				for (const item of output) {
					assert.strictEqual(await removeItem(), item);
				}
				assert.strictEqual(
					await removeItem(),
					undefined,
					"Remove from empty collection should undefined",
				);
			});

			it("Event", async () => {
				let addCount = 0;
				let removeCount = 0;
				const addListener = (value): void => {
					assert.strictEqual(value, input[addCount], "Added event value not matched");
					addCount += 1;
				};
				testCollection.on("add", addListener);

				const acquireListener = (value): void => {
					assert.strictEqual(value, output[removeCount], "Remove event value not matched");
					removeCount += 1;
				};
				testCollection.on("acquire", acquireListener);

				for (const item of input) {
					await addItem(item);
				}

				processMessages();

				let count = output.length;
				while (count > 0) {
					await removeItem();
					count -= 1;
				}
				assert.strictEqual(
					await removeItem(),
					undefined,
					"Remove from empty collection should undefined",
				);

				assert.strictEqual(addCount, input.length, "Incorrect number add event");
				assert.strictEqual(removeCount, output.length, "Incorrect number remove event");

				testCollection.off("add", addListener);
				testCollection.off("acquire", acquireListener);
			});

			it("can clone object value", async () => {
				const obj = { x: 1 };
				await addItem(obj);
				const result = (await removeItem()) as { x: number };
				assert.notStrictEqual(result, obj);
				assert.strictEqual(result.x, 1);
			});
		});
	}

	describe("Detached", () => {
		generate(
			[1, 2],
			[1, 2],
			() => createLocalCollection("consensus-ordered-collection"),
			() => {},
		);
	});

	describe("Attached, connected", () => {
		const containerRuntimeFactory: MockContainerRuntimeFactory =
			new MockContainerRuntimeFactory();
		let counter = 0;

		generate(
			[1, 2],
			[1, 2],
			() =>
				createConnectedCollection(
					`consensus-ordered-collection_${++counter}`,
					containerRuntimeFactory,
				),
			() => {
				containerRuntimeFactory.processAllMessages();
			},
		);
	});

	describe("Reconnection flow", () => {
		let containerRuntimeFactory: MockContainerRuntimeFactoryForReconnection;
		let containerRuntime1: MockContainerRuntimeForReconnection;
		let testCollection1: IConsensusOrderedCollection;
		let testCollection2: IConsensusOrderedCollection;

		beforeEach(async () => {
			containerRuntimeFactory = new MockContainerRuntimeFactoryForReconnection();

			// Create first ConsensusOrderedCollection
			const response1 = createCollectionForReconnection(
				"collection1",
				containerRuntimeFactory,
			);
			testCollection1 = response1.collection;
			containerRuntime1 = response1.containerRuntime;

			// Create second ConsensusOrderedCollection
			const response2 = createCollectionForReconnection(
				"collection2",
				containerRuntimeFactory,
			);
			testCollection2 = response2.collection;
		});

		it("can resend unacked ops on reconnection", async () => {
			/**
			 * First, we will add a value to the first collection and verify the op is resent.
			 */
			const testValue = "testValue";

			// Add a listener to the second collection. This is used to verify that the added value reaches the remote
			// client.
			let addedValue: string = "";
			let newlyAdded: boolean = false;
			testCollection2.on("add", (value: string, added: boolean) => {
				addedValue = value;
				newlyAdded = added;
			});

			// Add a value to the first ConsensusOrderedCollection
			const waitP = testCollection1.add(testValue);

			// Disconnect and reconnect the first collection.
			containerRuntime1.connected = false;
			containerRuntime1.connected = true;

			// Process the messages.
			containerRuntimeFactory.processAllMessages();

			await waitP;

			// Verify that the remote collection received the added value.
			assert.equal(addedValue, testValue, "The remote client did not receive the added value");
			assert.equal(newlyAdded, true, "The remote client's value was not newly added");

			/**
			 * Now, we will acquire the added value in the first collection and verify the op is resent.
			 */

			// Add a listener to the second collection. This is used to verify that the acquired op reaches the remote
			// client.
			let acquiredValue: string = "";
			let acquiredClientId: string | undefined = "";
			testCollection2.on("acquire", (value: string, clientId?: string) => {
				acquiredValue = value;
				acquiredClientId = clientId;
			});

			// Acquire the previously added value.
			let res: unknown;
			const resultP = testCollection1.acquire(async (value) => {
				res = value;
				return ConsensusResult.Complete;
			});

			// Disconnect and reconnect the first collection.
			containerRuntime1.connected = false;
			containerRuntime1.connected = true;

			// Process the messages.
			containerRuntimeFactory.processAllMessages();
			setImmediate(() => containerRuntimeFactory.processAllMessages());

			await resultP;

			// Verify that the value acquired is the one that was added earlier.
			assert.equal(res, testValue, "The acquired value does not match the added value");

			// Verify that the remote collection received the acquired op.
			assert.equal(
				acquiredValue,
				testValue,
				"The remote client did not receive the acquired value",
			);
			assert.equal(
				acquiredClientId,
				containerRuntime1.clientId,
				"The remote client did not get the correct id of client that acquired the value",
			);
		});

		it("can store ops in disconnected state and resend them on reconnection", async () => {
			const testValue = "testValue";

			// Add a listener to the second collection. This is used to verify that the added value reaches the
			// remote client.
			let addedValue: string = "";
			let newlyAdded: boolean = false;
			testCollection2.on("add", (value: string, added: boolean) => {
				addedValue = value;
				newlyAdded = added;
			});

			// Disconnect the first collection
			containerRuntime1.connected = false;

			// Add a value to the first ConsensusOrderedCollection.
			const waitP = testCollection1.add(testValue);

			// Reconnect the first collection.
			containerRuntime1.connected = true;

			// Process the messages.
			containerRuntimeFactory.processAllMessages();

			await waitP;

			// Verify that the remote collection received the added value.
			assert.equal(addedValue, testValue, "The remote client did not receive the added value");
			assert.equal(newlyAdded, true, "The remote client's value was not newly added");
		});
	});

	describe("Garbage Collection", () => {
		class GCOrderedCollectionProvider implements IGCTestProvider {
			private _expectedRoutes: string[] = [];
			private subCollectionCount = 0;
			private readonly collection: IConsensusOrderedCollection;
			private readonly containerRuntimeFactory: MockContainerRuntimeFactory;

			constructor() {
				this.containerRuntimeFactory = new MockContainerRuntimeFactory();
				this.collection = createConnectedCollection(
					"ordered-collection",
					this.containerRuntimeFactory,
				);
			}

			private async addItem(item: unknown): Promise<void> {
				const waitP = this.collection.add(item);
				this.containerRuntimeFactory.processAllMessages();
				return waitP;
			}

			private async removeItem(): Promise<unknown> {
				const resP = acquireAndComplete(this.collection);
				this.containerRuntimeFactory.processAllMessages();
				setImmediate(() => this.containerRuntimeFactory.processAllMessages());
				return resP;
			}

			public get sharedObject(): IConsensusOrderedCollection {
				return this.collection;
			}

			public get expectedOutboundRoutes(): string[] {
				return this._expectedRoutes;
			}

			public async addOutboundRoutes(): Promise<void> {
				const subCollection = createLocalCollection(
					`subCollection-${++this.subCollectionCount}`,
				);
				await this.addItem(subCollection.handle);
				this._expectedRoutes.push(subCollection.handle.absolutePath);
			}

			public async deleteOutboundRoutes(): Promise<void> {
				const deletedHandle = (await this.removeItem()) as IFluidHandleInternal;
				assert(deletedHandle, "Route must be added before deleting");
				// Remove deleted handle's route from expected routes.
				this._expectedRoutes = this._expectedRoutes.filter(
					(route) => route !== deletedHandle.absolutePath,
				);
			}

			public async addNestedHandles(): Promise<void> {
				const subCollection1 = createLocalCollection(
					`subCollection-${++this.subCollectionCount}`,
				);
				const subCollection2 = createLocalCollection(
					`subCollection-${++this.subCollectionCount}`,
				);
				const containingObject = {
					collection1Handle: subCollection1.handle,
					nestedObj: {
						collection2Handle: subCollection2.handle,
					},
				};
				await this.addItem(containingObject);
				this._expectedRoutes.push(
					subCollection1.handle.absolutePath,
					subCollection2.handle.absolutePath,
				);
			}
		}

		runGCTests(GCOrderedCollectionProvider);
	});
});

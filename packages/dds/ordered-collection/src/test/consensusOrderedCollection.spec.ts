/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { type IGCTestProvider, runGCTests } from "@fluid-private/test-dds-utils";
import type { IFluidHandleInternal } from "@fluidframework/core-interfaces/internal";
import type { IChannelServices } from "@fluidframework/datastore-definitions/internal";
import {
	MockContainerRuntimeFactory,
	MockContainerRuntimeFactoryForReconnection,
	type MockContainerRuntimeForReconnection,
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils/internal";

import type { ConsensusOrderedCollection } from "../consensusOrderedCollection.js";
import {
	ConsensusQueueFactory,
	type ConsensusQueue,
} from "../consensusOrderedCollectionFactory.js";
import { ConsensusResult, type IConsensusOrderedCollection } from "../interfaces.js";
import {
	acquireAndComplete,
	acquireAndRelease,
	waitAcquireAndComplete,
} from "../testUtils.js";

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
				assert(testCollection !== undefined);
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
				assert(handle !== undefined, "Need an actual handle to test this case");
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
				assert(deletedHandle !== undefined, "Route must be added before deleting");
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

	describe("Rollback", () => {
		let containerRuntimeFactory: MockContainerRuntimeFactoryForReconnection;

		let testCollection1: IConsensusOrderedCollection;
		let containerRuntime1: MockContainerRuntimeForReconnection;

		let testCollection2: IConsensusOrderedCollection;
		let containerRuntime2: MockContainerRuntimeForReconnection;

		const processAcquireMessages = (): void => {
			// acquire() will first send an acquire op. After that is processed it will also send a complete op.
			// To account for this, we need to flush/process the acquire op, then immediately flush/process the complete op to process everything.
			containerRuntime1.flush();
			containerRuntime2.flush();
			containerRuntimeFactory.processAllMessages();
			setImmediate(() => {
				containerRuntime1.flush();
				containerRuntime2.flush();
				containerRuntimeFactory.processAllMessages();
			});
		};

		beforeEach(async () => {
			containerRuntimeFactory = new MockContainerRuntimeFactoryForReconnection({
				flushMode: 1, // turn based
			});

			const response1 = createCollectionForReconnection(
				"collection1",
				containerRuntimeFactory,
			);
			testCollection1 = response1.collection;
			containerRuntime1 = response1.containerRuntime;

			const response2 = createCollectionForReconnection(
				"collection2",
				containerRuntimeFactory,
			);
			testCollection2 = response2.collection;
			containerRuntime2 = response2.containerRuntime;
		});

		it("can rollback add op", async () => {
			let addFired = false;
			testCollection1.on("add", () => {
				addFired = true;
			});

			const addP = testCollection1.add("value");

			containerRuntime1.rollback?.();

			containerRuntime1.flush();
			containerRuntimeFactory.processAllMessages();
			await addP;

			assert.equal(addFired, false, "Add event should not fire");

			const acquiredP = acquireAndComplete(testCollection1);
			processAcquireMessages();
			const acquiredVal = (await acquiredP) as unknown;
			assert.equal(acquiredVal, undefined, "Should not have added value post rollback");
		});

		it("can rollback acquire/complete ops", async () => {
			let acquireFired = false;
			let completeFired = false;
			testCollection1.on("acquire", () => {
				acquireFired = true;
			});
			testCollection1.on("complete", () => {
				completeFired = true;
			});

			const addP = testCollection1.add("value");
			containerRuntime1.flush();
			containerRuntimeFactory.processAllMessages();
			await addP;

			const acquiredP1 = acquireAndComplete(testCollection1);
			containerRuntime1.rollback?.();

			processAcquireMessages();
			const acquiredVal1 = (await acquiredP1) as unknown;
			assert.equal(acquiredVal1, undefined, "Should not have acquired value post rollback");
			assert.equal(acquireFired, false, "Acquire event should not fire");
			assert.equal(completeFired, false, "Complete event should not fire");

			const acquiredP2 = acquireAndComplete(testCollection1);
			processAcquireMessages();
			const acquiredVal2 = (await acquiredP2) as unknown;
			assert.equal(acquiredVal2, "value", "Should be able to acquire value post rollback");
			assert.equal(acquireFired, true, "acquire event should fire post rollback");
			assert.equal(completeFired, true, "complete event should fire post rollback");
		});

		it("can rollback acquire/release ops", async () => {
			let acquireFired = false;
			let releaseFired = false;
			testCollection1.on("acquire", () => {
				acquireFired = true;
			});
			testCollection1.on("localRelease", () => {
				releaseFired = true;
			});

			const addP = testCollection1.add("value");
			containerRuntime1.flush();
			containerRuntimeFactory.processAllMessages();
			await addP;

			const acquiredP1 = acquireAndRelease(testCollection1);
			containerRuntime1.rollback?.();

			processAcquireMessages();
			const acquiredVal1 = (await acquiredP1) as unknown;
			assert.equal(acquiredVal1, undefined, "Should not have acquired value post rollback");
			assert.equal(acquireFired, false, "acquire event should not fire");
			assert.equal(releaseFired, false, "release event should not fire");

			const acquiredP2 = acquireAndRelease(testCollection1);
			processAcquireMessages();
			const acquiredVal2 = (await acquiredP2) as unknown;
			assert.equal(acquiredVal2, "value", "Should be able to acquire value post rollback");
			assert.equal(acquireFired, true, "acquire event should fire post rollback");
			assert.equal(releaseFired, true, "release event should fire post rollback");
		});

		it("can rollback only the complete op", async () => {
			let acquireFired = false;
			let completeFired = false;
			testCollection1.on("acquire", () => {
				acquireFired = true;
			});
			testCollection1.on("complete", () => {
				completeFired = true;
			});

			const addP = testCollection1.add("value");
			containerRuntime1.flush();
			containerRuntimeFactory.processAllMessages();
			await addP;

			const acquiredP1 = acquireAndComplete(testCollection1);
			containerRuntime1.flushSomeMessages(1); // flush only the acquire op
			containerRuntimeFactory.processAllMessages();
			setImmediate(() => {
				containerRuntime1.rollback?.(); // rollback before flushing the complete op
				containerRuntime1.flush();
				containerRuntimeFactory.processAllMessages();
			});

			const acquiredVal1 = (await acquiredP1) as unknown;
			assert.equal(acquiredVal1, "value", "Should have acquired value");
			assert.equal(acquireFired, true, "Acquire event should have fired");
			assert.equal(completeFired, false, "Complete event should not fire");
		});

		it("can rollback only the release op", async () => {
			let acquireFired = false;
			let releaseFired = false;
			testCollection1.on("acquire", () => {
				acquireFired = true;
			});
			testCollection1.on("localRelease", () => {
				releaseFired = true;
			});

			const addP = testCollection1.add("value");
			containerRuntime1.flush();
			containerRuntimeFactory.processAllMessages();
			await addP;

			const acquiredP1 = acquireAndComplete(testCollection1);
			containerRuntime1.flushSomeMessages(1); // flush only the acquire op
			containerRuntimeFactory.processAllMessages();
			setImmediate(() => {
				containerRuntime1.rollback?.(); // rollback before flushing the release op
				containerRuntime1.flush();
				containerRuntimeFactory.processAllMessages();
			});

			const acquiredVal1 = (await acquiredP1) as unknown;
			assert.equal(acquiredVal1, "value", "Should have acquired value");
			assert.equal(acquireFired, true, "Acquire event should have fired");
			assert.equal(releaseFired, false, "Release event should not fire");
		});

		describe("Rollback across remote ops", () => {
			it("can rollback add across remote ops", async () => {
				let addFiredCount1 = 0;
				let addFiredCount2 = 0;
				testCollection1.on("add", () => {
					addFiredCount1++;
				});
				testCollection2.on("add", () => {
					addFiredCount2++;
				});

				const addP1 = testCollection1.add("value1");
				const addP2 = testCollection2.add("value2");

				containerRuntime1.rollback?.();

				containerRuntime1.flush();
				containerRuntime2.flush();
				containerRuntimeFactory.processAllMessages();
				await Promise.all([addP1, addP2]);

				assert.deepEqual(
					[addFiredCount1, addFiredCount2],
					[1, 1],
					"Add event should only fire once for each client",
				);

				const acquiredP1 = acquireAndComplete(testCollection1);
				processAcquireMessages();
				const acquiredVal1 = (await acquiredP1) as unknown;
				assert.equal(acquiredVal1, "value2", "value2 should be the first value acquired");

				const acquiredP2 = acquireAndComplete(testCollection1);
				processAcquireMessages();
				const acquiredVal2 = (await acquiredP2) as unknown;
				assert.equal(
					acquiredVal2,
					undefined,
					"There should have only been one value to acquire",
				);
			});

			it("can rollback acquire/complete across remote ops", async () => {
				let acquireFiredCount1 = 0;
				let completeFiredCount1 = 0;
				let acquireFiredCount2 = 0;
				let completeFiredCount2 = 0;
				testCollection1.on("acquire", () => {
					acquireFiredCount1++;
				});
				testCollection1.on("complete", () => {
					completeFiredCount1++;
				});
				testCollection2.on("acquire", () => {
					acquireFiredCount2++;
				});
				testCollection2.on("complete", () => {
					completeFiredCount2++;
				});

				const addP = testCollection1.add("value");
				containerRuntime1.flush();
				containerRuntimeFactory.processAllMessages();
				await addP;

				const acquiredP1 = acquireAndComplete(testCollection1);
				const acquiredP2 = acquireAndComplete(testCollection2);
				containerRuntime1.rollback?.();

				processAcquireMessages();

				const [acquiredVal1, acquiredVal2] = (await Promise.all([acquiredP1, acquiredP2])) as [
					unknown,
					unknown,
				];
				assert.deepEqual(
					[acquiredVal1, acquiredVal2],
					[undefined, "value"],
					"Client 1 should not have acquired value post rollback, value 2 should have",
				);
				assert.deepEqual(
					[acquireFiredCount1, completeFiredCount1, acquireFiredCount2, completeFiredCount2],
					[1, 1, 1, 1],
					"Both clients should have fired each event once",
				);

				const acquiredP3 = acquireAndComplete(testCollection1);
				processAcquireMessages();
				const acquiredVal3 = (await acquiredP3) as unknown;
				assert.equal(acquiredVal3, undefined, "There should be no more values to acquire");
			});

			it("can rollback acquire/release across remote ops", async () => {
				let acquireFiredCount1 = 0;
				let releaseFiredCount1 = 0;
				let acquireFiredCount2 = 0;
				let releaseFiredCount2 = 0;
				testCollection1.on("acquire", () => {
					acquireFiredCount1++;
				});
				testCollection1.on("localRelease", () => {
					releaseFiredCount1++;
				});
				testCollection2.on("acquire", () => {
					acquireFiredCount2++;
				});
				testCollection2.on("localRelease", () => {
					releaseFiredCount2++;
				});

				const addP = testCollection1.add("value");
				containerRuntime1.flush();
				containerRuntimeFactory.processAllMessages();
				await addP;

				const acquiredP1 = acquireAndRelease(testCollection1);
				const acquiredP2 = acquireAndRelease(testCollection2);
				containerRuntime1.rollback?.();

				processAcquireMessages();

				const [acquiredVal1, acquiredVal2] = (await Promise.all([acquiredP1, acquiredP2])) as [
					unknown,
					unknown,
				];
				assert.deepEqual(
					[acquiredVal1, acquiredVal2],
					[undefined, "value"],
					"Client 1 should not have acquired value post rollback, value 2 should have",
				);
				assert.deepEqual(
					[acquireFiredCount1, releaseFiredCount1, acquireFiredCount2, releaseFiredCount2],
					[1, 0, 1, 1],
					"Only client 2 should have local release event fired",
				);

				const acquiredP3 = acquireAndRelease(testCollection1);
				processAcquireMessages();
				const acquiredVal3 = (await acquiredP3) as unknown;
				assert.equal(acquiredVal3, undefined, "There should be no more values to acquire");
			});
		});
	});
});

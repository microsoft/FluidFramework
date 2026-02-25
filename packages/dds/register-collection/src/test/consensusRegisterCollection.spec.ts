/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { IGCTestProvider, runGCTests } from "@fluid-private/test-dds-utils";
import type { IFluidHandleInternal } from "@fluidframework/core-interfaces/internal";
import { ISummaryBlob } from "@fluidframework/driver-definitions";
import { ITree } from "@fluidframework/driver-definitions/internal";
import { BlobTreeEntry } from "@fluidframework/driver-utils/internal";
import {
	MockContainerRuntimeFactory,
	MockContainerRuntimeFactoryForReconnection,
	MockContainerRuntimeForReconnection,
	MockEmptyDeltaConnection,
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils/internal";

import { ConsensusRegisterCollection } from "../consensusRegisterCollection.js";
import { ConsensusRegisterCollectionFactory } from "../consensusRegisterCollectionFactory.js";
import { IConsensusRegisterCollection } from "../interfaces.js";

/**
 * Test class that exposes protected applyStashedOp method for testing
 */
class TestConsensusRegisterCollection<T> extends ConsensusRegisterCollection<T> {
	public testApplyStashedOp(content: unknown): void {
		this.applyStashedOp(content);
	}
}

function createConnectedCollection(
	id: string,
	runtimeFactory: MockContainerRuntimeFactory,
): ConsensusRegisterCollection<unknown> {
	const dataStoreRuntime = new MockFluidDataStoreRuntime();
	runtimeFactory.createContainerRuntime(dataStoreRuntime);
	const services = {
		deltaConnection: dataStoreRuntime.createDeltaConnection(),
		objectStorage: new MockStorage(),
	};

	const crcFactory = new ConsensusRegisterCollectionFactory();
	const collection = crcFactory.create(
		dataStoreRuntime,
		id,
	) as ConsensusRegisterCollection<unknown>;
	collection.connect(services);
	return collection;
}

function createLocalCollection(id: string): ConsensusRegisterCollection<unknown> {
	const factory = new ConsensusRegisterCollectionFactory();
	return factory.create(
		new MockFluidDataStoreRuntime(),
		id,
	) as ConsensusRegisterCollection<unknown>;
}

function createCollectionForReconnection(
	id: string,
	runtimeFactory: MockContainerRuntimeFactoryForReconnection,
): {
	collection: IConsensusRegisterCollection<unknown>;
	containerRuntime: MockContainerRuntimeForReconnection;
} {
	const dataStoreRuntime = new MockFluidDataStoreRuntime();
	const containerRuntime = runtimeFactory.createContainerRuntime(dataStoreRuntime);
	const services = {
		deltaConnection: dataStoreRuntime.createDeltaConnection(),
		objectStorage: new MockStorage(),
	};

	const crcFactory = new ConsensusRegisterCollectionFactory();
	const collection = crcFactory.create(dataStoreRuntime, id);
	collection.connect(services);
	return { collection, containerRuntime };
}

function createTestCollectionForStashedOps(
	id: string,
	runtimeFactory: MockContainerRuntimeFactory,
): TestConsensusRegisterCollection<unknown> {
	const dataStoreRuntime = new MockFluidDataStoreRuntime();
	runtimeFactory.createContainerRuntime(dataStoreRuntime);
	const services = {
		deltaConnection: dataStoreRuntime.createDeltaConnection(),
		objectStorage: new MockStorage(),
	};

	const collection = new TestConsensusRegisterCollection(
		id,
		dataStoreRuntime,
		ConsensusRegisterCollectionFactory.Attributes,
	);
	collection.connect(services);
	return collection;
}

describe("ConsensusRegisterCollection", () => {
	describe("Single connected client", () => {
		const collectionId = "consensus-register-collection";
		let crc: ConsensusRegisterCollection<any>;
		let containerRuntimeFactory: MockContainerRuntimeFactory;

		beforeEach(() => {
			containerRuntimeFactory = new MockContainerRuntimeFactory();
			crc = createConnectedCollection(collectionId, containerRuntimeFactory);
		});

		async function writeAndProcessMsg(key: string, value: any): Promise<boolean> {
			const waitP = crc.write(key, value);
			containerRuntimeFactory.processAllMessages();
			return waitP;
		}

		describe("API", () => {
			it("Can create a collection", () => {
				assert(crc !== undefined);
			});

			it("Can add and remove data", async () => {
				assert.strictEqual(crc.read("key1"), undefined);
				const writeResult = await writeAndProcessMsg("key1", "val1");
				assert.strictEqual(crc.read("key1"), "val1");
				assert.strictEqual(writeResult, true, "No concurrency expected");
			});

			it("Can add and remove a handle", async () => {
				assert.strictEqual(crc.read("key1"), undefined);
				const handle = crc.handle;
				if (handle === undefined) {
					assert.fail("Need an actual handle to test this case");
				}
				const writeResult = await writeAndProcessMsg("key1", handle);
				const readValue = crc.read("key1");
				assert.strictEqual(readValue.absolutePath, handle.absolutePath);
				assert.strictEqual(writeResult, true, "No concurrency expected");
			});

			it("Change events emit the right key/value", async () => {
				crc.on("atomicChanged", (key: string, value: any, local: boolean) => {
					assert.strictEqual(key, "key1", "atomicChanged event emitted the wrong key");
					assert.strictEqual(value, "val1", "atomicChanged event emitted the wrong value");
				});
				crc.on("versionChanged", (key: string, value: any, local: boolean) => {
					assert.strictEqual(key, "key1", "versionChanged event emitted the wrong key");
					assert.strictEqual(value, "val1", "versionChanged event emitted the wrong value");
				});
				await writeAndProcessMsg("key1", "val1");
			});
		});

		describe("Summary", () => {
			const snapshotFileName = "header";
			const expectedSerialization = JSON.stringify({
				key1: {
					atomic: { sequenceNumber: 1, value: { type: "Plain", value: "val1.1" } },
					versions: [{ sequenceNumber: 1, value: { type: "Plain", value: "val1.1" } }],
				},
			});
			const legacySharedObjectSerialization = JSON.stringify({
				key1: {
					atomic: { sequenceNumber: 1, value: { type: "Shared", value: "sharedObjId" } },
					versions: [{ sequenceNumber: 1, value: { type: "Shared", value: "sharedObjId" } }],
				},
			});
			const buildTree = (serialized: string): ITree => ({
				entries: [new BlobTreeEntry(snapshotFileName, serialized)],
			});

			it("summarize", async () => {
				await writeAndProcessMsg("key1", "val1.1");
				const summaryTree = crc.getAttachSummary().summary;
				assert(
					Object.keys(summaryTree.tree).length === 1,
					"summarize should return a tree with single blob",
				);
				const serialized = (summaryTree.tree.header as ISummaryBlob)?.content as string;
				assert(serialized, "summarize should return a tree with blob with contents");
				assert.strictEqual(serialized, expectedSerialization);
			});

			it("load", async () => {
				const tree: ITree = buildTree(expectedSerialization);
				const services = {
					deltaConnection: new MockEmptyDeltaConnection(),
					objectStorage: new MockStorage(tree),
				};
				const crcFactory = new ConsensusRegisterCollectionFactory();
				const loadedCrc = await crcFactory.load(
					new MockFluidDataStoreRuntime(),
					collectionId,
					services,
					ConsensusRegisterCollectionFactory.Attributes,
				);
				assert.strictEqual(loadedCrc.read("key1"), "val1.1");
			});

			it("load with SharedObject not supported", async () => {
				const tree: ITree = buildTree(legacySharedObjectSerialization);
				const services = {
					deltaConnection: new MockEmptyDeltaConnection(),
					objectStorage: new MockStorage(tree),
				};
				const crcFactory = new ConsensusRegisterCollectionFactory();
				await assert.rejects(
					crcFactory.load(
						new MockFluidDataStoreRuntime(),
						collectionId,
						services,
						ConsensusRegisterCollectionFactory.Attributes,
					),
					"SharedObjects contained in ConsensusRegisterCollection can no longer be deserialized",
				);
			});
		});
	});

	describe("Multiple Clients", () => {
		describe("Local state", () => {
			let containerRuntimeFactory: MockContainerRuntimeFactory;
			let testCollection1: IConsensusRegisterCollection;
			let testCollection2: IConsensusRegisterCollection;

			beforeEach(() => {
				containerRuntimeFactory = new MockContainerRuntimeFactoryForReconnection();
				testCollection1 = createLocalCollection("collection1");
				testCollection2 = createLocalCollection("collection2");
			});

			it("should not send ops when the collection is not connected", async () => {
				// Add a listener to the second collection. This is used to verify that the written value reaches
				// the remote client.
				let receivedValue: string = "";
				testCollection2.on("atomicChanged", (key: string, value: string) => {
					receivedValue = value;
				});

				// Write to the first register collection.
				const testValue = "testValue";
				const writeP = testCollection1.write("key", testValue);

				// Process the messages.
				containerRuntimeFactory.processAllMessages();

				// Verify that the first collection successfully writes and is the winner.
				const winner = await writeP;
				assert.equal(winner, true, "Write was not successful");

				// Verify that the remote client does not get this write because the DDS is not connected.
				assert.equal(
					receivedValue,
					"",
					"The remote client should not have received the write",
				);
			});
		});

		describe("Reconnection", () => {
			const testKey: string = "testKey";
			const testValue: string = "testValue";
			let receivedKey: string = "";
			let receivedValue: string = "";
			let receivedLocalStatus: boolean = true;

			let containerRuntimeFactory: MockContainerRuntimeFactoryForReconnection;
			let containerRuntime1: MockContainerRuntimeForReconnection;
			let testCollection1: IConsensusRegisterCollection;
			let testCollection2: IConsensusRegisterCollection;

			beforeEach(() => {
				containerRuntimeFactory = new MockContainerRuntimeFactoryForReconnection();
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

				// Add a listener to the second collection. This is used to verify that the written value reaches
				// the remote client.
				testCollection2.on("atomicChanged", (key: string, value: string, local: boolean) => {
					receivedKey = key;
					receivedValue = value;
					receivedLocalStatus = local;
				});
			});

			it("can resend unacked ops on reconnection", async () => {
				// Write to the first register collection.
				const writeP = testCollection1.write(testKey, testValue);

				// Disconnect and reconnect the first collection.
				containerRuntime1.connected = false;
				containerRuntime1.connected = true;

				// Process the messages.
				containerRuntimeFactory.processAllMessages();

				// Verify that the first collection successfully writes and is the winner.
				const winner = await writeP;
				assert.equal(winner, true, "Write was not successful");

				// Verify that the remote register collection received the write.
				assert.equal(receivedKey, testKey, "The remote client did not receive the key");
				assert.equal(receivedValue, testValue, "The remote client did not receive the value");
				assert.equal(
					receivedLocalStatus,
					false,
					"The remote client's value should not be local",
				);
			});

			it("can store ops in disconnected state and resend them on reconnection", async () => {
				// Disconnect the first collection.
				containerRuntime1.connected = false;

				// Write to the first register collection.
				const writeP = testCollection1.write(testKey, testValue);

				// Reconnect the first collection.
				containerRuntime1.connected = true;

				// Process the messages.
				containerRuntimeFactory.processAllMessages();

				// Verify that the first collection successfully writes and is the winner.
				const winner = await writeP;
				assert.equal(winner, true, "Write was not successful");

				// Verify that the remote register collection received the write.
				assert.equal(receivedKey, testKey, "The remote client did not receive the key");
				assert.equal(receivedValue, testValue, "The remote client did not receive the value");
				assert.equal(
					receivedLocalStatus,
					false,
					"The remote client's value should not be local",
				);
			});

			afterEach(() => {
				receivedKey = "";
				receivedValue = "";
				receivedLocalStatus = true;
			});
		});
	});

	describe("applyStashedOp", () => {
		let containerRuntimeFactory: MockContainerRuntimeFactory;
		let testCollection1: TestConsensusRegisterCollection<unknown>;
		let testCollection2: IConsensusRegisterCollection<unknown>;

		beforeEach(() => {
			containerRuntimeFactory = new MockContainerRuntimeFactory();
			testCollection1 = createTestCollectionForStashedOps(
				"collection1",
				containerRuntimeFactory,
			);
			testCollection2 = createConnectedCollection("collection2", containerRuntimeFactory);
		});

		it("can apply stashed write op and have it reach remote client", async () => {
			const testKey = "testKey";
			const testValue = "testValue";

			// Create a stashed op in the format expected by applyStashedOp
			// This simulates an op that was saved in pending state and is being replayed
			const stashedOp = {
				key: testKey,
				type: "write" as const,
				value: {
					type: "Plain" as const,
					value: testValue,
				},
				serializedValue: JSON.stringify(testValue),
				refSeq: 0, // refSeq from when the op was originally created
			};

			// Apply the stashed op - this should submit it for processing
			testCollection1.testApplyStashedOp(stashedOp);

			// Process all messages
			containerRuntimeFactory.processAllMessages();

			// Verify the value was written to collection1
			assert.equal(
				testCollection1.read(testKey),
				testValue,
				"Local collection should have the value",
			);

			// Verify the value reached the remote collection
			assert.equal(
				testCollection2.read(testKey),
				testValue,
				"Remote collection should have the value",
			);
		});

		it("can apply stashed write op with handle value", async () => {
			const testKey = "handleKey";
			const handle = testCollection1.handle;

			if (handle === undefined) {
				assert.fail("Need an actual handle to test this case");
			}

			// Create a stashed op with a handle value
			const stashedOp = {
				key: testKey,
				type: "write" as const,
				value: {
					type: "Plain" as const,
					value: handle,
				},
				serializedValue: JSON.stringify({
					type: "__fluid_handle__",
					url: handle.absolutePath,
				}),
				refSeq: 0,
			};

			// Apply the stashed op
			testCollection1.testApplyStashedOp(stashedOp);

			// Process all messages
			containerRuntimeFactory.processAllMessages();

			// Verify the value was written
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const readValue = testCollection1.read(testKey) as any;
			assert.equal(
				readValue.absolutePath,
				handle.absolutePath,
				"Handle should be stored correctly",
			);
		});

		it("preserves refSeq from stashed op for correct FWW semantics", async () => {
			const testKey = "fwwKey";

			// First, write a value normally
			const writeP = testCollection1.write(testKey, "firstValue");
			containerRuntimeFactory.processAllMessages();
			await writeP;

			// Verify first value is written
			assert.equal(
				testCollection1.read(testKey),
				"firstValue",
				"First value should be written",
			);

			// Now apply a stashed op with refSeq=0 (as if it was created before any ops)
			// This should lose to the existing write due to FWW semantics
			const stashedOp = {
				key: testKey,
				type: "write" as const,
				value: {
					type: "Plain" as const,
					value: "stashedValue",
				},
				serializedValue: JSON.stringify("stashedValue"),
				refSeq: 0, // Low refSeq means this was created before seeing the first write
			};

			testCollection1.testApplyStashedOp(stashedOp);
			containerRuntimeFactory.processAllMessages();

			// The atomic value should still be "firstValue" because the stashed op
			// had a lower refSeq (it didn't know about the first write)
			assert.equal(
				testCollection1.read(testKey),
				"firstValue",
				"Atomic value should remain first value due to FWW",
			);
		});
	});

	describe("Garbage Collection", () => {
		class GCRegisteredCollectionProvider implements IGCTestProvider {
			private subCollectionCount = 0;
			private _expectedRoutes: string[] = [];
			private readonly collection1: IConsensusRegisterCollection;
			private readonly collection2: IConsensusRegisterCollection;
			private readonly containerRuntimeFactory: MockContainerRuntimeFactory;

			constructor() {
				this.containerRuntimeFactory = new MockContainerRuntimeFactory();
				this.collection1 = createConnectedCollection(
					"collection1",
					this.containerRuntimeFactory,
				);
				this.collection2 = createConnectedCollection(
					"collection2",
					this.containerRuntimeFactory,
				);
			}

			private async writeAndProcessMsg(key: string, value: unknown): Promise<boolean> {
				const waitP = this.collection1.write(key, value);
				this.containerRuntimeFactory.processAllMessages();
				return waitP;
			}
			public get sharedObject(): IConsensusRegisterCollection {
				// Return the remote collection because we want to verify its summary data.
				return this.collection2;
			}
			public get expectedOutboundRoutes(): string[] {
				return this._expectedRoutes;
			}
			public async addOutboundRoutes(): Promise<void> {
				const subCollectionId = `subCollection-${++this.subCollectionCount}`;
				const subTestCollection = createLocalCollection(subCollectionId);
				await this.writeAndProcessMsg(subCollectionId, subTestCollection.handle);
				this._expectedRoutes.push(subTestCollection.handle.absolutePath);
			}
			public async deleteOutboundRoutes(): Promise<void> {
				const subCollectionId = `subCollection-${this.subCollectionCount}`;
				const deletedHandle = this.collection1.read(subCollectionId) as IFluidHandleInternal;
				assert(deletedHandle !== undefined, "Route must be added before deleting");

				// Delete the last handle that was added.
				await this.writeAndProcessMsg(subCollectionId, "nonHandleValue");
				// Remove deleted handle's route from expected routes.
				this._expectedRoutes = this._expectedRoutes.filter(
					(route) => route !== deletedHandle.absolutePath,
				);
			}
			public async addNestedHandles(): Promise<void> {
				const subCollectionId1 = `subCollection-${++this.subCollectionCount}`;
				const subCollectionId2 = `subCollection-${++this.subCollectionCount}`;
				const subTestCollection1 = createLocalCollection(subCollectionId1);
				const subTestCollection2 = createLocalCollection(subCollectionId2);
				const containingObject = {
					collection1Handle: subTestCollection1.handle,
					nestedObj: {
						collection2Handle: subTestCollection2.handle,
					},
				};
				await this.writeAndProcessMsg(subCollectionId2, containingObject);
				this._expectedRoutes.push(
					subTestCollection1.handle.absolutePath,
					subTestCollection2.handle.absolutePath,
				);
			}
		}

		runGCTests(GCRegisteredCollectionProvider);
	});
});

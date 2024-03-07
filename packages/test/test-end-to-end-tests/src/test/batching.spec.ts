/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
	CompressionAlgorithms,
	ContainerMessageType,
	IContainerRuntimeOptions,
	UnknownContainerRuntimeMessage,
} from "@fluidframework/container-runtime";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import type { ISharedMap } from "@fluidframework/map";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { FlushMode } from "@fluidframework/runtime-definitions";
import {
	ITestFluidObject,
	ChannelFactoryRegistry,
	timeoutPromise,
	ITestObjectProvider,
	ITestContainerConfig,
	DataObjectFactoryType,
	getContainerEntryPointBackCompat,
} from "@fluidframework/test-utils";
import { describeCompat } from "@fluid-private/test-version-utils";
import { IContainer } from "@fluidframework/container-definitions";
import { ConfigTypes, IConfigProviderBase } from "@fluidframework/core-interfaces";
const map1Id = "map1Key";
const map2Id = "map2Key";

const configProvider = (settings: Record<string, ConfigTypes>): IConfigProviderBase => ({
	getRawConfig: (name: string): ConfigTypes => settings[name],
});

// Function to yield a turn in the Javascript event loop.
async function yieldJSTurn(): Promise<void> {
	await new Promise<void>((resolve) => {
		setTimeout(resolve);
	});
}

function setupBatchMessageListener(
	dataStore: ITestFluidObject,
	receivedMessages: ISequencedDocumentMessage[],
) {
	dataStore.context.containerRuntime.on(
		"op",
		(message: ISequencedDocumentMessage, runtimeMessage?: boolean) => {
			if (runtimeMessage !== false) {
				receivedMessages.push(message);
			}
		},
	);
}

function verifyBatchMetadata(batchMessages: ISequencedDocumentMessage[]) {
	const batchCount = batchMessages.length;
	assert(batchCount !== 0, "No messages in the batch");

	const batchBeginMetadata = (batchMessages[0].metadata as { batch?: unknown } | undefined)
		?.batch;
	const batchEndMetadata = (
		batchMessages[batchCount - 1].metadata as { batch?: unknown } | undefined
	)?.batch;
	if (batchCount === 1) {
		assert.equal(
			batchBeginMetadata,
			undefined,
			"Batch with one message should not have batch metadata",
		);
		return;
	}

	assert.equal(batchBeginMetadata, true, "Batch begin metadata not found");
	assert.equal(batchEndMetadata, false, "Batch end metadata not found");
}

const filterDatastoreOps = (messages: ISequencedDocumentMessage[]) => {
	return messages.filter((m) => m.type === ContainerMessageType.FluidDataStoreOp);
};

async function waitForCleanContainers(...dataStores: ITestFluidObject[]) {
	return Promise.all(
		dataStores.map(async (dataStore) => {
			const runtime = dataStore.context.containerRuntime as IContainerRuntime;
			while (runtime.isDirty) {
				await timeoutPromise((resolve) => runtime.once("batchEnd", resolve));
			}
		}),
	);
}

describeCompat("Flushing ops", "NoCompat", (getTestObjectProvider, apis) => {
	const { SharedMap } = apis.dds;
	const registry: ChannelFactoryRegistry = [
		[map1Id, SharedMap.getFactory()],
		[map2Id, SharedMap.getFactory()],
	];
	const testContainerConfig: ITestContainerConfig = {
		fluidDataObjectType: DataObjectFactoryType.Test,
		registry,
		loaderProps: {
			configProvider: configProvider({
				"Fluid.Container.enableOfflineLoad": true,
			}),
		},
	};

	let provider: ITestObjectProvider;
	beforeEach("getTestObjectProvider", () => {
		provider = getTestObjectProvider();
	});

	let container1: IContainer;
	let dataObject1: ITestFluidObject;
	let dataObject2: ITestFluidObject;
	let dataObject1map1: ISharedMap;
	let dataObject1map2: ISharedMap;
	let dataObject2map1: ISharedMap;
	let dataObject2map2: ISharedMap;

	async function setupContainers(runtimeOptions?: IContainerRuntimeOptions) {
		const configCopy = { ...testContainerConfig, runtimeOptions };

		// Create a Container for the first client.
		container1 = await provider.makeTestContainer(configCopy);
		dataObject1 = await getContainerEntryPointBackCompat<ITestFluidObject>(container1);
		dataObject1map1 = await dataObject1.getSharedObject<ISharedMap>(map1Id);
		dataObject1map2 = await dataObject1.getSharedObject<ISharedMap>(map2Id);

		// Load the Container that was created by the first client.
		const container2 = await provider.loadTestContainer(configCopy);
		dataObject2 = await getContainerEntryPointBackCompat<ITestFluidObject>(container2);
		dataObject2map1 = await dataObject2.getSharedObject<ISharedMap>(map1Id);
		dataObject2map2 = await dataObject2.getSharedObject<ISharedMap>(map2Id);

		// To precisely control batch boundary, we need to force the container into write mode upfront
		// So that the first flush doesn't result in reconnect to write mode and cause batches
		// to be "merged"

		dataObject1map1.set("forceWrite", true);
		dataObject2map2.set("forceWrite", true);

		await waitForCleanContainers(dataObject1, dataObject2);
		await provider.ensureSynchronized();
	}

	it("can send and a batch containing a future/unknown op type", async () => {
		await setupContainers({
			flushMode: FlushMode.TurnBased,
			compressionOptions: {
				minimumBatchSizeInBytes: 10,
				compressionAlgorithm: CompressionAlgorithms.lz4,
			},
			enableGroupedBatching: true,
			chunkSizeInBytes: 100,
		});
		const futureOpSubmitter2 = dataObject2.context.containerRuntime as unknown as {
			submit: (containerRuntimeMessage: UnknownContainerRuntimeMessage) => void;
		};
		const dataObject1BatchMessages: ISequencedDocumentMessage[] = [];
		const dataObject2BatchMessages: ISequencedDocumentMessage[] = [];
		setupBatchMessageListener(dataObject1, dataObject1BatchMessages);
		setupBatchMessageListener(dataObject2, dataObject2BatchMessages);

		// Submit two ops, one of which is unrecognized
		dataObject2map1.set("key1", "value1");
		futureOpSubmitter2.submit({
			type: "FUTURE_TYPE" as any,
			contents: "Hello",
			compatDetails: { behavior: "Ignore" }, // This op should be ignored when processed
		});

		// Wait for the ops to get flushed and processed.
		await provider.ensureSynchronized();

		assert.equal(
			dataObject1BatchMessages.filter((m) => m.type !== ContainerMessageType.ChunkedOp)[1]
				.type,
			"FUTURE_TYPE",
			"Unknown op type not preserved (dataObject1)",
		);
		assert.equal(
			dataObject2BatchMessages.filter((m) => m.type !== ContainerMessageType.ChunkedOp)[1]
				.type,
			"FUTURE_TYPE",
			"Unknown op type not preserved (dataObject2)",
		);
	});

	describe("Batch metadata verification when ops are flushed in batches", () => {
		let dataObject1BatchMessages: ISequencedDocumentMessage[] = [];
		let dataObject2BatchMessages: ISequencedDocumentMessage[] = [];

		function testFlushingUsingOrderSequentially(options: IContainerRuntimeOptions) {
			beforeEach("setupBatchMessageListeners", async () => {
				await setupContainers(options);
				setupBatchMessageListener(dataObject1, dataObject1BatchMessages);
				setupBatchMessageListener(dataObject2, dataObject2BatchMessages);
			});

			it("can send and receive multiple batch ops correctly", async () => {
				// Send messages in batch in the first dataStore.
				dataObject1.context.containerRuntime.orderSequentially(() => {
					dataObject1map1.set("key1", "value1");
					dataObject1map2.set("key2", "value2");
					dataObject1map1.set("key3", "value3");
					dataObject1map2.set("key4", "value4");
				});

				// Wait for the ops to get processed by both the containers.
				await provider.ensureSynchronized();

				assert.equal(
					filterDatastoreOps(dataObject1BatchMessages).length,
					4,
					"Incorrect number of messages received on local client",
				);
				assert.equal(
					filterDatastoreOps(dataObject2BatchMessages).length,
					4,
					"Incorrect number of messages received on remote client",
				);

				verifyBatchMetadata(dataObject1BatchMessages);
				verifyBatchMetadata(dataObject2BatchMessages);
			});

			it("can send and receive single batch op correctly", async () => {
				dataObject2.context.containerRuntime.orderSequentially(() => {
					dataObject2map1.set("key1", "value1");
				});

				// Wait for the ops to get processed by both the containers.
				await provider.ensureSynchronized();

				assert.equal(
					dataObject1BatchMessages.length,
					1,
					"Incorrect number of messages received on local client",
				);
				assert.equal(
					dataObject2BatchMessages.length,
					1,
					"Incorrect number of messages received on remote client",
				);

				verifyBatchMetadata(dataObject1BatchMessages);
				verifyBatchMetadata(dataObject2BatchMessages);
			});

			it("can send and receive consecutive batches correctly", async () => {
				/**
				 * This test verifies that among other things, the PendingStateManager's algorithm of handling
				 * consecutive batches is correct.
				 */
				dataObject2.context.containerRuntime.orderSequentially(() => {
					dataObject2map1.set("key1", "value1");
					dataObject2map2.set("key2", "value2");
				});

				// Yield a turn so that in TurnBased mode, the ops are flushed.
				await yieldJSTurn();

				dataObject2.context.containerRuntime.orderSequentially(() => {
					dataObject2map1.set("key3", "value3");
					dataObject2map2.set("key4", "value4");
				});

				// Yield a turn so that in TurnBased mode, the ops are flushed.
				await yieldJSTurn();

				// Wait for the ops to get processed by both the containers.
				await provider.ensureSynchronized();

				assert.equal(
					dataObject1BatchMessages.length,
					4,
					"Incorrect number of messages received on local client",
				);
				assert.equal(
					dataObject2BatchMessages.length,
					4,
					"Incorrect number of messages received on remote client",
				);

				// Verify the local client's batches.
				verifyBatchMetadata(dataObject1BatchMessages.slice(0, 2));
				verifyBatchMetadata(dataObject1BatchMessages.slice(2, 4));

				// Verify the remote client's batches.
				verifyBatchMetadata(dataObject2BatchMessages.slice(0, 2));
				verifyBatchMetadata(dataObject2BatchMessages.slice(2, 4));
			});

			it("can handle calls to orderSequentially with no batch messages", async () => {
				/**
				 * This test verifies that among other things, the PendingStateManager's algorithm of handling batches
				 * with no messages is correct.
				 */
				dataObject1.context.containerRuntime.orderSequentially(() => {});

				// Wait for the ops to get processed by both the containers.
				await provider.ensureSynchronized();

				assert.equal(
					dataObject1BatchMessages.length,
					0,
					"Incorrect number of messages received on local client",
				);
				assert.equal(
					dataObject2BatchMessages.length,
					0,
					"Incorrect number of messages received on remote client",
				);
			});

			it("can handle nested orderSequentially by ignoring inner calls to it", async () => {
				// If orderSequentially is nested, only the outermost is considered as the beginning and end of the
				// batch. The inner ones are ignored.
				dataObject1.context.containerRuntime.orderSequentially(() => {
					dataObject1map1.set("key1", "value1");
					// Level 1 nesting.
					dataObject1.context.containerRuntime.orderSequentially(() => {
						dataObject1map2.set("key2", "value2");
						// Level 2 nesting.
						dataObject1.context.containerRuntime.orderSequentially(() => {
							dataObject1map1.set("key3", "value3");
						});
					});
					dataObject1map2.set("key4", "value4");
				});

				// Wait for the ops to get processed by both the containers.
				await provider.ensureSynchronized();

				assert.equal(
					filterDatastoreOps(dataObject1BatchMessages).length,
					4,
					"Incorrect number of messages received on local client",
				);
				assert.equal(
					filterDatastoreOps(dataObject2BatchMessages).length,
					4,
					"Incorrect number of messages received on remote client",
				);

				verifyBatchMetadata(dataObject1BatchMessages);
				verifyBatchMetadata(dataObject2BatchMessages);
			});
		}

		describe("Flushing of batches via orderSequentially [TurnBased]", () => {
			testFlushingUsingOrderSequentially({ flushMode: FlushMode.TurnBased });
		});

		describe("Flushing of batches via orderSequentially [Immediate]", () => {
			testFlushingUsingOrderSequentially({ flushMode: FlushMode.Immediate });
		});

		describe("TurnBased flushing of batches", () => {
			beforeEach("setupBatchMessageListeners", async () => {
				await setupContainers({ flushMode: FlushMode.TurnBased });
				setupBatchMessageListener(dataObject1, dataObject1BatchMessages);
				setupBatchMessageListener(dataObject2, dataObject2BatchMessages);
			});

			it("can send and receive multiple batch ops that are flushed on JS turn", async () => {
				// Send the ops that are to be batched together.
				dataObject1map1.set("key1", "value1");
				dataObject1map2.set("key2", "value2");
				dataObject1map1.set("key3", "value3");
				dataObject1map2.set("key4", "value4");

				// Yield a turn so that the ops are flushed.
				await yieldJSTurn();

				// Wait for the ops to get processed by both the containers.
				await provider.ensureSynchronized();

				assert.equal(
					filterDatastoreOps(dataObject1BatchMessages).length,
					4,
					"Incorrect number of messages received on local client",
				);
				assert.equal(
					filterDatastoreOps(dataObject2BatchMessages).length,
					4,
					"Incorrect number of messages received on remote client",
				);

				verifyBatchMetadata(dataObject1BatchMessages);
				verifyBatchMetadata(dataObject2BatchMessages);
			});

			it("can send and receive single batch op that is flushed on JS turn", async () => {
				dataObject1map1.set("key1", "value1");

				// Yield a turn so that the op is flushed.
				await yieldJSTurn();

				// Wait for the ops to get processed by both the containers.
				await provider.ensureSynchronized();

				assert.equal(
					dataObject1BatchMessages.length,
					1,
					"Incorrect number of messages received on local client",
				);
				assert.equal(
					dataObject2BatchMessages.length,
					1,
					"Incorrect number of messages received on remote client",
				);

				verifyBatchMetadata(dataObject1BatchMessages);
				verifyBatchMetadata(dataObject2BatchMessages);
			});

			it("can send and receive consecutive batches that are flushed on JS turn", async () => {
				/**
				 * This test verifies that among other things, the PendingStateManager's algorithm of handling
				 * consecutive batches is correct.
				 */

				// Send the ops that are to be batched together.
				dataObject1map1.set("key1", "value1");
				dataObject1map2.set("key2", "value2");

				// wait for ops to be flushed.
				await provider.ensureSynchronized();

				// Send the second set of ops that are to be batched together.
				dataObject1map1.set("key3", "value3");
				dataObject1map2.set("key4", "value4");

				// wait for ops to be flushed.
				await provider.ensureSynchronized();

				// Send a third set of ops that are to be batched together.
				dataObject1map1.set("key5", "value5");
				dataObject1map2.set("key6", "value6");

				// Yield a turn so that the ops are flushed.
				await yieldJSTurn();

				// Wait for the ops to get processed by both the containers.
				await provider.ensureSynchronized();

				assert.equal(
					dataObject1BatchMessages.length,
					6,
					"Incorrect number of messages received on local client",
				);
				assert.equal(
					dataObject2BatchMessages.length,
					6,
					"Incorrect number of messages received on remote client",
				);

				// Verify the local client's batches.
				verifyBatchMetadata(dataObject1BatchMessages.slice(0, 2));
				verifyBatchMetadata(dataObject1BatchMessages.slice(2, 4));
				verifyBatchMetadata(dataObject1BatchMessages.slice(4, 6));

				// Verify the remote client's batches.
				verifyBatchMetadata(dataObject2BatchMessages.slice(0, 2));
				verifyBatchMetadata(dataObject2BatchMessages.slice(2, 4));
				verifyBatchMetadata(dataObject2BatchMessages.slice(4, 6));
			});
		});

		describe("TurnBased flushing of batches with compression", () => {
			beforeEach("setupBatchMessageListeners", async () => {
				await setupContainers({
					flushMode: FlushMode.TurnBased,
					compressionOptions: {
						minimumBatchSizeInBytes: 1,
						compressionAlgorithm: CompressionAlgorithms.lz4,
					},
				});
				setupBatchMessageListener(dataObject1, dataObject1BatchMessages);
				setupBatchMessageListener(dataObject2, dataObject2BatchMessages);
			});

			it("can send and receive multiple batch ops that are flushed on JS turn", async () => {
				// Send the ops that are to be batched together.
				dataObject1map1.set("key1", "value1");
				dataObject1map2.set("key2", "value2");
				dataObject1map1.set("key3", "value3");
				dataObject1map2.set("key4", "value4");

				// Yield a turn so that the ops are flushed.
				await yieldJSTurn();

				// Wait for the ops to get processed by both the containers.
				await provider.ensureSynchronized();

				assert.equal(
					filterDatastoreOps(dataObject1BatchMessages).length,
					4,
					"Incorrect number of messages received on local client",
				);
				assert.equal(
					filterDatastoreOps(dataObject2BatchMessages).length,
					4,
					"Incorrect number of messages received on remote client",
				);

				verifyBatchMetadata(dataObject1BatchMessages);
				verifyBatchMetadata(dataObject2BatchMessages);
			});

			it("can send and receive single batch op that is flushed on JS turn", async () => {
				dataObject1map1.set("key1", "value1");

				// Yield a turn so that the op is flushed.
				await yieldJSTurn();

				// Wait for the ops to get processed by both the containers.
				await provider.ensureSynchronized();

				assert.equal(
					dataObject1BatchMessages.length,
					1,
					"Incorrect number of messages received on local client",
				);
				assert.equal(
					dataObject2BatchMessages.length,
					1,
					"Incorrect number of messages received on remote client",
				);

				verifyBatchMetadata(dataObject1BatchMessages);
				verifyBatchMetadata(dataObject2BatchMessages);
			});

			// Disabled due to issue #9546
			it.skip("can send and receive consecutive batches that are flushed on JS turn", async () => {
				/**
				 * This test verifies that among other things, the PendingStateManager's algorithm of handling
				 * consecutive batches is correct.
				 */

				// Send the ops that are to be batched together.
				dataObject1map1.set("key1", "value1");
				dataObject1map2.set("key2", "value2");

				// Yield a turn so that the ops are flushed.
				await yieldJSTurn();

				// Send the second set of ops that are to be batched together.
				dataObject1map1.set("key3", "value3");
				dataObject1map2.set("key4", "value4");

				// Yield a turn so that the ops are flushed.
				await yieldJSTurn();

				// Send a third set of ops that are to be batched together.
				dataObject1map1.set("key5", "value5");
				dataObject1map2.set("key6", "value6");

				// Yield a turn so that the ops are flushed.
				await yieldJSTurn();

				// Wait for the ops to get processed by both the containers.
				await provider.ensureSynchronized();

				assert.equal(
					dataObject1BatchMessages.length,
					6,
					"Incorrect number of messages received on local client",
				);
				assert.equal(
					dataObject2BatchMessages.length,
					6,
					"Incorrect number of messages received on remote client",
				);

				// Verify the local client's batches.
				verifyBatchMetadata(dataObject1BatchMessages.slice(0, 2));
				verifyBatchMetadata(dataObject1BatchMessages.slice(2, 4));
				verifyBatchMetadata(dataObject1BatchMessages.slice(4, 6));

				// Verify the remote client's batches.
				verifyBatchMetadata(dataObject2BatchMessages.slice(0, 2));
				verifyBatchMetadata(dataObject2BatchMessages.slice(2, 4));
				verifyBatchMetadata(dataObject2BatchMessages.slice(4, 6));
			});
		});

		describe("Immediate flushing of ops", () => {
			beforeEach("setupBatchMessageListeners", async () => {
				await setupContainers({ flushMode: FlushMode.Immediate });
				setupBatchMessageListener(dataObject1, dataObject1BatchMessages);
				setupBatchMessageListener(dataObject2, dataObject2BatchMessages);
			});

			it("can send and receive ops that are flushed individually", async () => {
				dataObject1map1.set("key1", "value1");
				dataObject1map2.set("key2", "value2");

				// Wait for the ops to get processed by both the containers.
				await provider.ensureSynchronized();

				assert.equal(
					filterDatastoreOps(dataObject1BatchMessages).length,
					2,
					"Incorrect number of messages received on local client",
				);
				assert.equal(
					filterDatastoreOps(dataObject2BatchMessages).length,
					2,
					"Incorrect number of messages received on remote client",
				);

				verifyBatchMetadata(dataObject1BatchMessages.slice(0, 1));
				verifyBatchMetadata(dataObject1BatchMessages.slice(1, 2));
			});
		});

		describe("Immediate flushing of ops with compression", () => {
			beforeEach("setupBatchMessageListeners", async () => {
				await setupContainers({
					flushMode: FlushMode.Immediate,
					compressionOptions: {
						minimumBatchSizeInBytes: 1,
						compressionAlgorithm: CompressionAlgorithms.lz4,
					},
				});
				setupBatchMessageListener(dataObject1, dataObject1BatchMessages);
				setupBatchMessageListener(dataObject2, dataObject2BatchMessages);
			});

			it("can send and receive ops that are flushed individually", async () => {
				dataObject1map1.set("key1", "value1");
				dataObject1map2.set("key2", "value2");

				// Wait for the ops to get processed by both the containers.
				await provider.ensureSynchronized();

				assert.equal(
					filterDatastoreOps(dataObject1BatchMessages).length,
					2,
					"Incorrect number of messages received on local client",
				);
				assert.equal(
					filterDatastoreOps(dataObject2BatchMessages).length,
					2,
					"Incorrect number of messages received on remote client",
				);

				verifyBatchMetadata(dataObject1BatchMessages.slice(0, 1));
				verifyBatchMetadata(dataObject1BatchMessages.slice(1, 2));
			});
		});

		afterEach(async () => {
			dataObject1BatchMessages = [];
			dataObject2BatchMessages = [];
		});
	});

	describe("Document Dirty State when batches are flushed", () => {
		// Verifies that the document dirty state for the given document is as expected.
		function verifyDocumentDirtyState(dataStore: ITestFluidObject, expectedState: boolean) {
			const dirty = (dataStore.context.containerRuntime as IContainerRuntime).isDirty;
			assert.equal(dirty, expectedState, "The document dirty state is not as expected");
		}

		function testAutomaticFlushingUsingOrderSequentially(options: IContainerRuntimeOptions) {
			beforeEach("setupContainers", async () => {
				await setupContainers(options);
			});

			it("should clean document dirty state after a batch with single message is sent", async () => {
				// Send a batch with a single message.
				dataObject1.context.containerRuntime.orderSequentially(() => {
					dataObject1map1.set("key1", "value1");
				});

				// Verify that the document is correctly set to dirty.
				verifyDocumentDirtyState(dataObject1, true);

				// Wait for the ops to get processed by both the containers.
				await provider.ensureSynchronized();

				// Verify that the document dirty state is cleaned after the ops are processed.
				verifyDocumentDirtyState(dataObject1, false);
			});

			it("should clean document dirty state after a batch with multiple messages is sent", async () => {
				// Send a batch with multiple messages.
				dataObject1.context.containerRuntime.orderSequentially(() => {
					dataObject1map1.set("key1", "value1");
					dataObject1map2.set("key2", "value2");
					dataObject1map1.set("key3", "value3");
				});

				// Verify that the document is correctly set to dirty.
				verifyDocumentDirtyState(dataObject1, true);

				// Wait for the ops to get processed by both the containers.
				await provider.ensureSynchronized();

				// Verify that the document dirty state is cleaned after the ops are processed.
				verifyDocumentDirtyState(dataObject1, false);
			});

			it("should clean document dirty state after consecutive batches are sent", async () => {
				// Send a couple of batches consecutively.
				dataObject1.context.containerRuntime.orderSequentially(() => {
					dataObject1map1.set("key1", "value1");
				});

				dataObject1.context.containerRuntime.orderSequentially(() => {
					dataObject1map2.set("key2", "value2");
					dataObject1map1.set("key3", "value3");
					dataObject1map2.set("key4", "value4");
				});

				// Verify that the document is correctly set to dirty.
				verifyDocumentDirtyState(dataObject1, true);

				// Wait for the ops to get processed by both the containers.
				await provider.ensureSynchronized();

				// Check that the document dirty state is cleaned after the ops are processed.
				// Verify that the document dirty state is cleaned after the ops are processed.
				verifyDocumentDirtyState(dataObject1, false);
			});

			it("should clean document dirty state after batch and non-batch messages are sent", async () => {
				// Send a non-batch message.
				dataObject1map1.set("key1", "value1");

				// Send a couple of batches consecutively.
				dataObject1.context.containerRuntime.orderSequentially(() => {
					dataObject1map2.set("key2", "value2");
					dataObject1map1.set("key3", "value3");
					dataObject1map2.set("key4", "value4");
				});

				dataObject1.context.containerRuntime.orderSequentially(() => {
					dataObject1map1.set("key5", "value5");
				});

				// Send another non-batch message.
				dataObject1map1.set("key5", "value5");

				// Verify that the document is correctly set to dirty.
				verifyDocumentDirtyState(dataObject1, true);

				// Wait for the ops to get processed by both the containers.
				await provider.ensureSynchronized();

				// Verify that the document dirty state is cleaned after the ops are processed.
				verifyDocumentDirtyState(dataObject1, false);
			});
		}

		describe("Automatic flushing of batches via orderSequentially [TurnBased]", () => {
			testAutomaticFlushingUsingOrderSequentially({ flushMode: FlushMode.TurnBased });
		});

		describe("Automatic flushing of batches via orderSequentially [Immediate]", () => {
			testAutomaticFlushingUsingOrderSequentially({ flushMode: FlushMode.Immediate });
		});

		describe("TurnBased flushing of batches", () => {
			beforeEach("setupContainers", async () => {
				await setupContainers({ flushMode: FlushMode.TurnBased });
			});

			it("should clean document dirty state after a batch with single message is flushed", async () => {
				dataObject1map1.set("key1", "value1");

				// Verify that the document is correctly set to dirty.
				verifyDocumentDirtyState(dataObject1, true);

				// Yield a turn so that the ops are flushed.
				await yieldJSTurn();

				// Verify that the document dirty state is cleaned after the ops are processed.
				await provider.ensureSynchronized();
				verifyDocumentDirtyState(dataObject1, false);
			});

			it("should clean document dirty state after a batch with multiple messages is flushed", async () => {
				dataObject1map1.set("key1", "value1");
				dataObject1map2.set("key2", "value2");
				dataObject1map1.set("key3", "value3");

				// Verify that the document is correctly set to dirty.
				verifyDocumentDirtyState(dataObject1, true);

				// Yield a turn so that the ops are flushed.
				await yieldJSTurn();

				// Verify that the document dirty state is cleaned after the ops are processed.
				await provider.ensureSynchronized();
				verifyDocumentDirtyState(dataObject1, false);
			});

			it("should clean document dirty state after consecutive batches are flushed", async () => {
				dataObject1map1.set("key1", "value1");

				// Verify that the document is correctly set to dirty.
				verifyDocumentDirtyState(dataObject1, true);

				// Yield a turn so that the op is flushed.
				await yieldJSTurn();

				dataObject1map2.set("key2", "value2");
				dataObject1map1.set("key3", "value3");
				dataObject1map2.set("key4", "value4");

				// Verify that the document is correctly set to dirty.
				verifyDocumentDirtyState(dataObject1, true);

				// Yield a turn so that the ops are flushed.
				await yieldJSTurn();

				// Check that the document dirty state is cleaned after the ops are processed.
				// Verify that the document dirty state is cleaned after the ops are processed.
				await provider.ensureSynchronized();
				verifyDocumentDirtyState(dataObject1, false);
			});

			it("should clean document dirty state after batch and non-batch messages are flushed", async () => {
				// Send a single message and yield a turn so that it is flushed.
				dataObject1map1.set("key1", "value1");
				await yieldJSTurn();

				// Flush a couple of batches consecutively and yield a turn so that they are flushed.
				dataObject1map2.set("key2", "value2");
				dataObject1map1.set("key3", "value3");
				dataObject1map2.set("key4", "value4");
				await yieldJSTurn();

				// Send a single message and yield a turn so that it is flushed.
				dataObject1map1.set("key5", "value5");
				await yieldJSTurn();

				// Send a single message.
				dataObject1map1.set("key5", "value5");

				// Verify that the document is correctly set to dirty.
				verifyDocumentDirtyState(dataObject1, true);

				// Yield a turn so that the ops are flushed.
				await yieldJSTurn();

				// Verify that the document dirty state is cleaned after the ops are processed.
				await provider.ensureSynchronized();
				verifyDocumentDirtyState(dataObject1, false);
			});
		});
	});
});

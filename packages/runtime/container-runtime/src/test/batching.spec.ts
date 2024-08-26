/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { AttachState, ICriticalContainerError } from "@fluidframework/container-definitions";
import { IContainerContext } from "@fluidframework/container-definitions/internal";
import { FluidErrorTypes } from "@fluidframework/core-interfaces/internal";
import {
	MessageType,
	ISequencedDocumentMessage,
} from "@fluidframework/driver-definitions/internal";
import { MockLogger, mixinMonitoringContext } from "@fluidframework/telemetry-utils/internal";
import {
	MockAudience,
	MockDeltaManager,
	MockQuorumClients,
	validateAssertionError,
} from "@fluidframework/test-runtime-utils/internal";
import { SinonFakeTimers, createSandbox, useFakeTimers } from "sinon";

import type { ChannelCollection } from "../channelCollection.js";
import { ContainerRuntime } from "../containerRuntime.js";
import { DeltaScheduler } from "../deltaScheduler.js";
import { ContainerMessageType } from "../messageTypes.js";

describe("Runtime batching", () => {
	const mockClientId = "mockClientId";

	const getMockContext = (deltaManager: MockDeltaManager): Partial<IContainerContext> => {
		const mockContext = {
			attachState: AttachState.Attached,
			deltaManager,
			audience: new MockAudience(),
			quorum: new MockQuorumClients(),
			taggedLogger: mixinMonitoringContext(new MockLogger()).logger,
			clientDetails: { capabilities: { interactive: true } },
			closeFn: (_error?: ICriticalContainerError): void => {},
			updateDirtyContainerState: (_dirty: boolean) => {},
			getLoadedFromVersion: () => undefined,
			clientId: mockClientId,
			connected: true,
		};
		return mockContext;
	};

	const mockProvideEntryPoint = async () => ({
		myProp: "myValue",
	});

	let containerRuntime: ContainerRuntime;
	let mockDeltaManager: MockDeltaManager;
	let sandbox: sinon.SinonSandbox;
	let clock: SinonFakeTimers;

	/** Overwrites channelCollection property to make process a no-op */
	function patchContainerRuntime(
		cr: ContainerRuntime,
		process: () => void = () => {},
	): sinon.SinonStub {
		const patched = cr as unknown as Omit<ContainerRuntime, "channelCollection"> & {
			channelCollection: Partial<ChannelCollection>;
		};
		return sandbox.stub(patched.channelCollection, "process").callsFake(process);
	}

	before(() => {
		clock = useFakeTimers();
		sandbox = createSandbox();
	});

	beforeEach(async () => {
		mockDeltaManager = new MockDeltaManager();
		containerRuntime = await ContainerRuntime.loadRuntime({
			context: getMockContext(mockDeltaManager) as IContainerContext,
			registryEntries: [],
			existing: false,
			runtimeOptions: {},
			provideEntryPoint: mockProvideEntryPoint,
		});
	});

	afterEach(() => {
		clock.reset();
	});

	after(() => {
		sandbox.restore();
		clock.restore();
	});

	/**
	 * Returns a batch of messages with the first and last message marked as batch start and end respectively.
	 */
	function getMessages(count: number): ISequencedDocumentMessage[] {
		const messages: ISequencedDocumentMessage[] = [];
		for (let i = 0; i < count; i++) {
			messages.push({
				type: MessageType.Operation,
				clientId: mockClientId,
				sequenceNumber: i,
				minimumSequenceNumber: 0,
				contents: {
					type: ContainerMessageType.FluidDataStoreOp,
					contents: {
						address: "address",
						contents: "dummy content",
					},
				},
				clientSequenceNumber: i,
				timestamp: Date.now(),
			} as unknown as ISequencedDocumentMessage);
		}

		if (count > 1) {
			messages[0].metadata = { batch: true };
			messages[messages.length - 1].metadata = { batch: false };
		}
		return messages;
	}

	/**
	 * Processes the given batch. The batch is processed by pushing each message to the inbound queue and then
	 * processing the messages in the queue.
	 */
	function processBatch(batch: ISequencedDocumentMessage[], cr: ContainerRuntime) {
		// Push the messages in the inbound queue. This is done because ScheduleManager listens to the "push" event
		// emitted by the inbound queue to do batch validations.
		for (const batchMessage of batch) {
			mockDeltaManager.inbound.push(batchMessage);
		}

		// Process the messages in the inbound queue.
		// Process is called on the delta manager because ScheduleManager listens to the "op" event on delta manager
		// as well to do validation.
		// Process is called on the container runtime because it is the one that actually processes the messages and
		// has its own set of validations.
		let message = mockDeltaManager.inbound.pop();
		while (message !== undefined) {
			assert(message !== undefined, "Message should not be undefined");
			mockDeltaManager.process(message);
			cr.process(message, false /* local */);
			message = mockDeltaManager.inbound.pop();
		}
	}

	describe("Batch validation", () => {
		let containerRuntimeStub: sinon.SinonStub;

		beforeEach(async () => {
			containerRuntimeStub = patchContainerRuntime(containerRuntime);
		});

		afterEach(() => {
			containerRuntimeStub.restore();
		});

		it("successfully processes messages that are not part of batch", async () => {
			const messageCount = 5;
			const batch = getMessages(messageCount);

			// Remove the batch metadata essentially making the messages not part of a batch.
			batch[0].metadata = undefined;
			batch[messageCount - 1].metadata = undefined;

			assert.doesNotThrow(
				() => processBatch(batch, containerRuntime),
				"Non batch messages should be processed successfully",
			);
		});

		it("successfully processes a batch containing ops from a single client", async () => {
			const messageCount = 5;
			const batch = getMessages(messageCount);

			assert.doesNotThrow(
				() => processBatch(batch, containerRuntime),
				"Batch from a single client should be processed successfully",
			);
		});

		it("fails processing a batch with batch end but no batch start", async () => {
			const messageCount = 5;
			const batch = getMessages(messageCount);
			// Remove the batch begin metadata.
			batch[0].metadata = undefined;

			assert.throws(
				() => processBatch(batch, containerRuntime),
				(e: Error) => validateAssertionError(e, "Unexpected batch end marker"),
				"Batch end without batch start should fail",
			);
		});

		it("fails processing a batch with multiple batch starts", async () => {
			const messageCount = 5;
			const batch = getMessages(messageCount);
			batch[2].metadata = { batch: true };

			assert.throws(
				() => processBatch(batch, containerRuntime),
				(e: Error) => validateAssertionError(e, "Unexpected batch start marker"),
				"Batch with multiple batch starts should fail",
			);
		});

		it("fails processing a batch containing ops from multiple clients", async () => {
			const messageCount = 5;
			const batch = getMessages(messageCount);
			// Change the clientId of the second message to a different client.
			batch[1].clientId = "otherClientId";

			assert.throws(
				() => processBatch(batch, containerRuntime),
				(e: any) => {
					assert(e.errorType === FluidErrorTypes.dataCorruptionError);
					assert(e.message === "Received messages from multiple clients in a batch");
					return true;
				},
				"Batch with ops from multiple clients should fail",
			);
		});

		it("fails processing a batch containing a non-runtime op along with runtime ops", async () => {
			const messageCount = 5;
			const batch = getMessages(messageCount);
			// Change the type of the second message to a non-runtime op.
			batch[1].type = MessageType.NoOp;

			assert.throws(
				() => processBatch(batch, containerRuntime),
				(e: any) => {
					assert(e.errorType === FluidErrorTypes.dataProcessingError);
					assert(e.message === "Received out-of-order messages in batch");
					return true;
				},
				"Batch with non-runtime op along with runtime ops should fail",
			);
		});

		it("fails processing a batch containing an unknown runtime op along with known ops", async () => {
			const messageCount = 5;
			const batch = getMessages(messageCount);

			// Change the type of the second message to an unknown runtime op.
			const unknownMessage = batch[1];
			const unknownMessageType = "unknown";
			(unknownMessage.contents as any).type = unknownMessageType;

			assert.throws(
				() => processBatch(batch, containerRuntime),
				(e: any) => {
					assert(e.errorType === FluidErrorTypes.dataProcessingError);
					assert(e.message === "Runtime message of unknown type");
					return true;
				},
				"Batch with unknown runtime op along with known ops should fail",
			);
		});
	});

	describe("Delta scheduler for batches", () => {
		// Function to process an inbound op. It adds delay to simulate time taken in processing an op.
		function processOp() {
			// Add delay such that each op takes greater than the DeltaScheduler's processing time to process.
			// The times increases every time a batch is processed so simulate by increasing the delay.
			clock.tick(DeltaScheduler.processingTime + deltaSchedulerTimeBuffer);
			deltaSchedulerTimeBuffer += DeltaScheduler.processingTimeIncrement;
		}

		let containerRuntimeStub: sinon.SinonStub;
		let pauseSpy: sinon.SinonSpy;
		let resumeSpy: sinon.SinonSpy;
		let batchBeginCount = 0;
		let batchEndCount = 0;
		// This starts with the delta scheduler's processing time and increases after each batch is processed.
		let deltaSchedulerTimeBuffer = DeltaScheduler.processingTimeIncrement;

		beforeEach(async () => {
			containerRuntimeStub = patchContainerRuntime(containerRuntime, processOp);
			pauseSpy = sandbox.spy(containerRuntime.deltaManager.inbound, "pause");
			resumeSpy = sandbox.spy(containerRuntime.deltaManager.inbound, "resume");
			containerRuntime.on("batchBegin", () => {
				batchBeginCount++;
			});
			containerRuntime.on("batchEnd", () => {
				batchEndCount++;
			});
		});

		afterEach(() => {
			containerRuntimeStub.restore();
			pauseSpy.restore();
			resumeSpy.restore();
			batchBeginCount = 0;
			batchEndCount = 0;
			deltaSchedulerTimeBuffer = DeltaScheduler.processingTimeIncrement;
		});

		it("batch messages that take longer than DeltaScheduler's processing time to process", async () => {
			const messageCount = 5;
			const batch = getMessages(messageCount);

			assert.doesNotThrow(
				() => processBatch(batch, containerRuntime),
				"Batch should be processed successfully",
			);

			// The inbound queue should not have paused or resumed because the batch messages are
			// processed together without yielding.
			// Batch begin and end should emit once for the entire batch.
			assert(pauseSpy.notCalled, "Inbound queue should not have paused");
			assert(resumeSpy.notCalled, "Inbound queue should not have resumed");
			assert.strictEqual(batchBeginCount, 1, "Batch begin should have been emitted once");
			assert.strictEqual(batchEndCount, 1, "Batch end should have been emitted once");
		});

		it("non-batch messages that take longer than DeltaScheduler's processing time to process", async () => {
			const messageCount = 5;
			const batch = getMessages(messageCount);
			batch[0].metadata = undefined;
			batch[messageCount - 1].metadata = undefined;

			assert.doesNotThrow(
				() => processBatch(batch, containerRuntime),
				"Batch should be processed successfully",
			);

			// The inbound queue should have paused and resumed 4 times. It doesn't pause for the final message
			// because there is nothing else to process in the queue.
			// Batch begin and end should emit for each message which are treated as batches with single message.
			assert.strictEqual(pauseSpy.callCount, 4, "Inbound queue should have paused 4 times");
			assert.strictEqual(resumeSpy.callCount, 4, "Inbound queue should have resumed 4 times");
			assert.strictEqual(batchBeginCount, 5, "Batch begin should have been emitted 5 times");
			assert.strictEqual(batchEndCount, 5, "Batch end should have been emitted 4 times");
		});

		it(
			`non-batch message followed by batch messages that take longer than ` +
				`DeltaScheduler's processing time to process`,
			async () => {
				const message1 = getMessages(1);
				const batch1 = getMessages(5);
				const batch = [...message1, ...batch1];

				assert.doesNotThrow(
					() => processBatch(batch, containerRuntime),
					"Batch should be processed successfully",
				);

				// The inbound queue should have paused and resumed once after processing the non-batch message but
				// not for the individual batch messages. After the batch is processed, there is nothing left to process.
				// Batch begin and end should emit for the non-batch message and then for the batch.
				assert(pauseSpy.calledOnce, "Inbound queue should have paused once");
				assert(resumeSpy.calledOnce, "Inbound queue should have resumed once");
				assert.strictEqual(batchBeginCount, 2, "Batch begin should have been emitted twice");
				assert.strictEqual(batchEndCount, 2, "Batch end should have been emitted twice");
			},
		);

		it(
			`Batch messages followed by non-batch message that take longer than ` +
				`DeltaScheduler's processing time to process`,
			async () => {
				const batch1 = getMessages(5);
				const message1 = getMessages(1);
				const batch = [...batch1, ...message1];

				assert.doesNotThrow(
					() => processBatch(batch, containerRuntime),
					"Batch should be processed successfully",
				);

				// The inbound queue should have paused and resumed once after processing the entire batch but
				// not for the individual batch messages. It should also not happen after processing the non-batch
				// message because there is nothing left to process.
				// Batch begin and end should emit for the non-batch message and then for the batch.
				assert(pauseSpy.calledOnce, "Inbound queue should have paused once");
				assert(resumeSpy.calledOnce, "Inbound queue should have resumed once");
				assert.strictEqual(batchBeginCount, 2, "Batch begin should have been emitted twice");
				assert.strictEqual(batchEndCount, 2, "Batch end should have been emitted twice");
			},
		);
	});

	describe("Batch begin and end", () => {
		let batchBeginCount = 0;
		let batchEndCount = 0;
		let containerRuntimeStub: sinon.SinonStub;
		let schedulerBatchBeginStub: sinon.SinonStub;
		let schedulerBatchEndStub: sinon.SinonStub;

		type ContainerRuntimeWithScheduler = Omit<ContainerRuntime, "deltaScheduler"> & {
			deltaScheduler: DeltaScheduler;
		};

		beforeEach(async () => {
			const containerRuntimeWithDeltaScheduler =
				containerRuntime as unknown as ContainerRuntimeWithScheduler;
			schedulerBatchBeginStub = sandbox.stub(
				containerRuntimeWithDeltaScheduler.deltaScheduler,
				"batchBegin",
			);
			schedulerBatchEndStub = sandbox.stub(
				containerRuntimeWithDeltaScheduler.deltaScheduler,
				"batchEnd",
			);
			containerRuntimeStub = patchContainerRuntime(containerRuntime);
			containerRuntime.on("batchBegin", () => {
				batchBeginCount++;
			});
			containerRuntime.on("batchEnd", () => {
				batchEndCount++;
			});
		});

		afterEach(() => {
			containerRuntimeStub.restore();
			batchBeginCount = 0;
			batchEndCount = 0;
		});

		function setupOpProcessingFailure() {
			containerRuntime.once("op", () => {
				throw new Error("Failed processing op in test");
			});
		}

		function validateBatchBeginAndEnd(schedulerCalled: boolean = true) {
			assert.strictEqual(batchBeginCount, 1, "Batch begin should have been emitted once");
			assert.strictEqual(batchEndCount, 1, "Batch end should have been emitted once");
			if (!schedulerCalled) {
				return;
			}
			assert(
				schedulerBatchBeginStub.calledOnce,
				"Delta scheduler batch begin should have been called once",
			);
			assert(
				schedulerBatchEndStub.calledOnce,
				"Delta scheduler batch end should have been called once",
			);
		}

		it("handles batch begin and end for successfully processing modern runtime messages", async () => {
			const modernRuntimeMessage = {
				type: MessageType.Operation,
				clientId: mockClientId,
				sequenceNumber: 1,
				minimumSequenceNumber: 0,
				contents: {
					type: ContainerMessageType.FluidDataStoreOp,
					contents: {
						address: "address",
						contents: "dummy content",
					},
				},
				clientSequenceNumber: 1,
				timestamp: Date.now(),
			} as unknown as ISequencedDocumentMessage;
			assert.doesNotThrow(
				() => containerRuntime.process(modernRuntimeMessage, false /* local */),
				"Message processing should have succeeded",
			);

			validateBatchBeginAndEnd();
		});

		it("handles batch begin and end for failed processing of modern runtime messages", async () => {
			setupOpProcessingFailure();
			const modernRuntimeMessage = {
				type: MessageType.Operation,
				clientId: mockClientId,
				sequenceNumber: 1,
				minimumSequenceNumber: 0,
				contents: {
					type: ContainerMessageType.FluidDataStoreOp,
					contents: {
						address: "address",
						contents: "dummy content",
					},
				},
				clientSequenceNumber: 1,
				timestamp: Date.now(),
			} as unknown as ISequencedDocumentMessage;
			assert.throws(
				() => containerRuntime.process(modernRuntimeMessage, false /* local */),
				(e: Error) => validateAssertionError(e, "Failed processing op in test"),
				"Message processing should have failed",
			);

			validateBatchBeginAndEnd();
		});

		it("handles batch begin and end for successfully processing legacy runtime messages", async () => {
			const legacyMessage = {
				type: ContainerMessageType.FluidDataStoreOp,
				clientId: mockClientId,
				sequenceNumber: 1,
				minimumSequenceNumber: 0,
				contents: {
					address: "address",
					contents: "dummy content",
				},
				clientSequenceNumber: 1,
				timestamp: Date.now(),
			} as unknown as ISequencedDocumentMessage;

			assert.doesNotThrow(
				() => containerRuntime.process(legacyMessage, false /* local */),
				"Non batch messages should be processed successfully",
			);

			validateBatchBeginAndEnd();
		});

		it("handles batch begin and end for failed processing of legacy runtime messages", async () => {
			setupOpProcessingFailure();
			const legacyMessage = {
				type: ContainerMessageType.FluidDataStoreOp,
				clientId: mockClientId,
				sequenceNumber: 1,
				minimumSequenceNumber: 0,
				contents: {
					address: "address",
					contents: "dummy content",
				},
				clientSequenceNumber: 1,
				timestamp: Date.now(),
			} as unknown as ISequencedDocumentMessage;

			assert.throws(
				() => containerRuntime.process(legacyMessage, false /* local */),
				(e: Error) => validateAssertionError(e, "Failed processing op in test"),
				"Message processing should have failed",
			);

			validateBatchBeginAndEnd();
		});

		it("handles batch begin and end for successfully processing non runtime messages", async () => {
			const nonRuntimeMessage = {
				type: MessageType.Summarize,
				clientId: mockClientId,
				sequenceNumber: 1,
				minimumSequenceNumber: 0,
				contents: {
					handle: "test-handle",
				},
				clientSequenceNumber: 1,
				timestamp: Date.now(),
			} as unknown as ISequencedDocumentMessage;

			assert.doesNotThrow(
				() => containerRuntime.process(nonRuntimeMessage, false /* local */),
				"Non batch messages should be processed successfully",
			);

			validateBatchBeginAndEnd();
		});

		it("handles batch begin and end for failed processing of non runtime messages", async () => {
			setupOpProcessingFailure();
			const nonRuntimeMessage = {
				type: MessageType.Summarize,
				clientId: mockClientId,
				sequenceNumber: 1,
				minimumSequenceNumber: 0,
				contents: {
					handle: "test-handle",
				},
				clientSequenceNumber: 1,
				timestamp: Date.now(),
			} as unknown as ISequencedDocumentMessage;

			assert.throws(
				() => containerRuntime.process(nonRuntimeMessage, false /* local */),
				(e: Error) => validateAssertionError(e, "Failed processing op in test"),
				"Message processing should have failed",
			);

			validateBatchBeginAndEnd();
		});

		it("handles batch begin and end for successfully processing empty batch", async () => {
			const emptyBatch = {
				type: MessageType.Operation,
				clientId: mockClientId,
				sequenceNumber: 1,
				minimumSequenceNumber: 0,
				clientSequenceNumber: 1,
				contents: JSON.stringify({
					type: "groupedBatch",
					contents: [],
				}),
			} as unknown as ISequencedDocumentMessage;

			assert.doesNotThrow(
				() => containerRuntime.process(emptyBatch, false /* local */),
				"Non batch messages should be processed successfully",
			);

			validateBatchBeginAndEnd(false /* schedulerCalled */);
		});
	});
});

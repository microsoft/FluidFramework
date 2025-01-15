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
import {
	MockLogger,
	mixinMonitoringContext,
	type IFluidErrorBase,
} from "@fluidframework/telemetry-utils/internal";
import {
	MockAudience,
	MockDeltaManager,
	MockQuorumClients,
	validateAssertionError,
} from "@fluidframework/test-runtime-utils/internal";
import { SinonFakeTimers, createSandbox, useFakeTimers } from "sinon";

import type { ChannelCollection } from "../channelCollection.js";
import { ContainerRuntime } from "../containerRuntime.js";
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
	function patchContainerRuntime(cr: ContainerRuntime): sinon.SinonStub {
		const fakeProcess: () => void = () => {};
		const patched = cr as unknown as Omit<ContainerRuntime, "channelCollection"> & {
			channelCollection: Partial<ChannelCollection>;
		};
		return sandbox.stub(patched.channelCollection, "processMessages").callsFake(fakeProcess);
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
	function getMessages(
		count: number,
		modernRuntimeMessage: boolean = true,
	): ISequencedDocumentMessage[] {
		const messageContents = {
			address: "address",
			contents: "dummy content",
		};
		const messages: ISequencedDocumentMessage[] = [];
		for (let i = 0; i < count; i++) {
			messages.push({
				type: modernRuntimeMessage
					? MessageType.Operation
					: ContainerMessageType.FluidDataStoreOp,
				clientId: mockClientId,
				sequenceNumber: i,
				minimumSequenceNumber: 0,
				contents: modernRuntimeMessage
					? {
							type: ContainerMessageType.FluidDataStoreOp,
							contents: messageContents,
						}
					: messageContents,
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
		// Push the messages in the inbound queue. This is done because InboundBatchAggregator listens to the "push" event
		// emitted by the inbound queue to do batch validations.
		for (const batchMessage of batch) {
			mockDeltaManager.inbound.push(batchMessage);
		}

		// Process the messages in the inbound queue.
		// Process is called on the delta manager because InboundBatchAggregator listens to the "op" event on delta manager
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
				(e: Error) => validateAssertionError(e, "batch presence was validated above"),
				"Batch end without batch start should fail",
			);
		});

		it("fails processing a batch with multiple batch starts", async () => {
			const messageCount = 5;
			const batch = getMessages(messageCount);
			batch[2].metadata = { batch: true };

			assert.throws(
				() => processBatch(batch, containerRuntime),
				(e: Error) => validateAssertionError(e, "there can't be active batch"),
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
				(e: IFluidErrorBase) => {
					assert(e.errorType === FluidErrorTypes.dataCorruptionError);
					assert(e.message === "OpBatchIncomplete");
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
				(e: IFluidErrorBase) => {
					assert(e.errorType === FluidErrorTypes.dataProcessingError);
					assert(e.message === "Received a system message during batch processing");
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
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(unknownMessage.contents as any).type = unknownMessageType;

			assert.throws(
				() => processBatch(batch, containerRuntime),
				(e: IFluidErrorBase) => {
					assert(e.errorType === FluidErrorTypes.dataProcessingError);
					assert(e.message === "Runtime message of unknown type");
					return true;
				},
				"Batch with unknown runtime op along with known ops should fail",
			);
		});
	});

	/**
	 * These tests validate that container runtime handles batch begin and end correctly. It should emit
	 * batch begin and end events.
	 */
	describe("Batch begin and end", () => {
		let batchBeginCount = 0;
		let batchEndCount = 0;
		let containerRuntimeStub: sinon.SinonStub;

		beforeEach(async () => {
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

		function validateBatchBeginAndEnd() {
			assert.strictEqual(batchBeginCount, 1, "Batch begin should have been emitted once");
			assert.strictEqual(batchEndCount, 1, "Batch end should have been emitted once");
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
				contents: {
					type: "groupedBatch",
					contents: [],
				},
			} as unknown as ISequencedDocumentMessage;

			assert.doesNotThrow(
				() => containerRuntime.process(emptyBatch, false /* local */),
				"Non batch messages should be processed successfully",
			);

			validateBatchBeginAndEnd();
		});
	});
});

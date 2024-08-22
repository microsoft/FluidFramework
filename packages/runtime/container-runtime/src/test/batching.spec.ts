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

	/** Overwrites channelCollection property to make process a no-op */
	function patchContainerRuntime(cr: ContainerRuntime): ContainerRuntime {
		const patched = cr as unknown as Omit<ContainerRuntime, "channelCollection"> & {
			channelCollection: Partial<ChannelCollection>;
		};

		patched.channelCollection = {
			process: (
				message: ISequencedDocumentMessage,
				local: boolean,
				localMessageMetadata: unknown,
			) => {},
		} satisfies Partial<ChannelCollection>;
		return patched as unknown as ContainerRuntime;
	}

	/**
	 * Returns a batch of messages with the first and last message marked as batch start and end respectively.
	 */
	function getBatch(count: number): ISequencedDocumentMessage[] {
		const messages: ISequencedDocumentMessage[] = [];
		for (let i = 0; i < count; i++) {
			messages.push({
				type: MessageType.Operation,
				clientId: mockClientId,
				sequenceNumber: i,
				minimumSequenceNumber: 1,
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
		messages[0].metadata = { batch: true };
		messages[messages.length - 1].metadata = { batch: false };
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

	it("successfully processes messages that are not part of batch", async () => {
		const cr = patchContainerRuntime(containerRuntime);
		const messageCount = 5;
		const batch = getBatch(messageCount);

		// Remove the batch metadata essentially making the messages not part of a batch.s
		batch[0].metadata = undefined;
		batch[messageCount - 1].metadata = undefined;

		assert.doesNotThrow(
			() => processBatch(batch, cr),
			"Non batch messages should be processed successfully",
		);
	});

	it("successfully processes a batch containing ops from a single client", async () => {
		const cr = patchContainerRuntime(containerRuntime);
		const messageCount = 5;
		const batch = getBatch(messageCount);

		assert.doesNotThrow(
			() => processBatch(batch, cr),
			"Batch from a single client should be processed successfully",
		);
	});

	it("fails processing a batch with batch end but no batch start", async () => {
		const cr = patchContainerRuntime(containerRuntime);
		const messageCount = 5;
		const batch = getBatch(messageCount);
		batch[0].metadata = undefined;

		assert.throws(
			() => processBatch(batch, cr),
			(e: Error) => validateAssertionError(e, "batch presence was validated above"),
			"Batch end without batch start should fail",
		);
	});

	it("fails processing a batch containing ops from multiple clients", async () => {
		const cr = patchContainerRuntime(containerRuntime);
		const messageCount = 5;
		const batch = getBatch(messageCount);
		batch[1].clientId = "otherClientId";

		assert.throws(
			() => processBatch(batch, cr),
			(e: any) => {
				assert(e.errorType === FluidErrorTypes.dataCorruptionError);
				assert(e.message === "OpBatchIncomplete");
				return true;
			},
			"Batch with ops from multiple clients should fail",
		);
	});

	it("fails processing a batch containing a non-runtime op along with runtime ops", async () => {
		const cr = patchContainerRuntime(containerRuntime);
		const messageCount = 5;
		const batch = getBatch(messageCount);
		batch[1].type = MessageType.NoOp;

		assert.throws(
			() => processBatch(batch, cr),
			(e: any) => {
				assert(e.errorType === FluidErrorTypes.dataProcessingError);
				assert(e.message === "Received a system message during batch processing");
				return true;
			},
			"Batch with non-runtime op along with runtime ops should fail",
		);
	});

	it("fails processing a batch containing an unknown runtime op along with known ops", async () => {
		const cr = patchContainerRuntime(containerRuntime);
		const messageCount = 5;
		const batch = getBatch(messageCount);
		const unknownMessage = batch[1];
		const unknownMessageType = "unknown";
		(unknownMessage.contents as any).type = unknownMessageType;

		assert.throws(
			() => processBatch(batch, cr),
			(e: any) => {
				assert(e.errorType === FluidErrorTypes.dataProcessingError);
				assert(e.message === "Runtime message of unknown type");
				return true;
			},
			"Batch with unknown runtime op along with known ops should fail",
		);
	});
});

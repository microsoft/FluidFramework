/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	FlushMode,
	type IRuntimeMessageCollection,
	type IRuntimeMessagesContent,
} from "@fluidframework/runtime-definitions/internal";
import {
	MockContainerRuntimeFactoryForReconnection,
	MockContainerRuntimeForReconnection,
	type MockFluidDataStoreRuntime,
} from "@fluidframework/test-runtime-utils/internal";
import type { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";

/**
 * Returns whether the two messages are from the same batch for the purposes of op bunching.
 * Messages in the same batch will have the same clientId and sequence number.
 * @internal
 */
function areMessagesFromSameBatch(
	message1: ISequencedDocumentMessage | undefined,
	message2: ISequencedDocumentMessage,
	flushMode: FlushMode,
) {
	return (
		flushMode === FlushMode.TurnBased &&
		message1?.clientId === message2.clientId &&
		message1?.sequenceNumber === message2.sequenceNumber
	);
}

/**
 * Extension of MockContainerRuntimeFactoryForReconnection that mocks op bunching.
 * @internal
 */
export class MockContainerRuntimeFactoryWithOpBunching extends MockContainerRuntimeFactoryForReconnection {
	protected override readonly runtimes: Set<MockContainerRuntimeWithOpBunching> = new Set();

	public override createContainerRuntime(
		dataStoreRuntime: MockFluidDataStoreRuntime,
	): MockContainerRuntimeWithOpBunching {
		const containerRuntime = new MockContainerRuntimeWithOpBunching(dataStoreRuntime, this, {
			...this.runtimeOptions,
		});
		this.runtimes.add(containerRuntime);
		return containerRuntime;
	}

	/**
	 * Processes the specified number of messages from the pending messages queue. In turn based
	 * mode, it sends them all together in an array to the runtimes for processing.
	 * @param count - The number of messages to process.
	 */
	public override processSomeMessages(count: number) {
		if (count > this.messages.length) {
			throw new Error("Tried to process more messages than exist");
		}

		if (this.runtimeOptions.flushMode === FlushMode.TurnBased) {
			const messages: ISequencedDocumentMessage[] = [];
			for (let i = 0; i < count; i++) {
				messages.push(this.getFirstMessageToProcess());
			}

			for (const runtime of this.runtimes) {
				runtime.processMessages(messages);
			}
		} else {
			super.processSomeMessages(count);
		}
		this.lastProcessedMessage = undefined;
	}

	public override processAllMessages() {
		this.processSomeMessages(this.messages.length);
	}
}

/**
 * Extension of MockContainerRuntimeForReconnection that mocks op bunching.
 * @internal
 */
export class MockContainerRuntimeWithOpBunching extends MockContainerRuntimeForReconnection {
	protected override processPendingMessages(pendingMessages: ISequencedDocumentMessage[]) {
		this.processMessages(pendingMessages);
	}

	private paused: boolean = false;
	private pendingMessagesWhenPaused: ISequencedDocumentMessage[] = [];

	/**
	 * Pause the processing of inbound messages. Messages that are received while paused will be queued. These messages
	 * will be processed and sent to the data store runtime and DDSes when resumeInboundProcessing is called.
	 * @remarks Pausing and resuming does not affect outbound messages like disconnection and reconnection does. Pausing
	 * and resuming inbound message processing can also be achieved via setting the connected state. However, any
	 * outbound messages that were submitted while disconnected will go through the resubmit flow on reconnection which
	 * can result in changes to the outbound messages such as its referenced sequence number.
	 * For example, consider the following scenario:
	 * 1. Client 1 disconnects to stop processing messages.
	 * 2. Client 1 submits a message when its last processed seq# is 1. The message will have ref seq# 1.
	 * 3. Client 2 submits a message which gets seq# 2. Client 1 doesn't process the message from client 2 because it's
	 * not connected.
	 * 4. Client 1 reconnects. It will process the message from client 2 first and its last processed seq# will be 2.
	 * 5. Client 1 resubmits its message which will now have ref seq# 2 instead of 1. This is an unintended consequence
	 * of using connected state which may be fine for some tests but not for others.
	 */
	public pauseInboundProcessing() {
		this.paused = true;
	}

	/**
	 * Resume processing of messages. Messages that were received while paused will now be processed and sent to the
	 * data store runtime and DDSes.
	 * @remarks See pauseInboundProcessing for more details.
	 */
	public resumeInboundProcessing() {
		if (!this.paused) {
			return;
		}
		this.paused = false;
		this.processMessages(this.pendingMessagesWhenPaused);
		this.pendingMessagesWhenPaused = [];
	}

	public override process(message: ISequencedDocumentMessage): void {
		if (this.paused) {
			this.pendingMessagesWhenPaused.push(message);
		} else {
			super.process(message);
		}
	}

	/**
	 * Processes a list of messages.
	 * In turn based mode, it sends bunch of messages in the same batch to the data store runtimes together.
	 * In immediate mode, it sends each message to the data store runtime one at a time.
	 */
	public processMessages(messages: ISequencedDocumentMessage[]): void {
		if (messages.length === 0) {
			return;
		}

		if (!this.connected) {
			this.pendingRemoteMessages.push(...messages);
			return;
		}

		if (this.paused) {
			this.pendingMessagesWhenPaused.push(...messages);
			return;
		}

		if (this.runtimeOptions.flushMode === FlushMode.Immediate) {
			for (const message of messages) {
				super.process(message);
			}
			return;
		}

		this.processedOps?.push(...messages);

		let bunchedMessagesContent: IRuntimeMessagesContent[] = [];
		let previousMessage: ISequencedDocumentMessage | undefined;
		let previousLocal: boolean | undefined;

		const sendBunchedMessages = (): void => {
			if (previousMessage === undefined) {
				return;
			}
			assert(previousLocal !== undefined, "previous local must exist");
			const messageCollection: IRuntimeMessageCollection = {
				envelope: previousMessage,
				local: previousLocal,
				messagesContent: bunchedMessagesContent,
			};
			this.dataStoreRuntime.processMessages(messageCollection);
			bunchedMessagesContent = [];
		};

		for (const message of messages) {
			this.deltaManager.process(message);
			const [local, localOpMetadata] = this.processInternal(message);

			// Id allocation messages are for the runtime, so process it here directly.
			if (this.maybeProcessIdAllocationMessage(message)) {
				sendBunchedMessages();
				previousMessage = undefined;
				previousLocal = undefined;
				bunchedMessagesContent = [];
				continue;
			}

			// If the messages are from different batches, send the previous bunch of messages to the
			// data store for processing.
			if (!areMessagesFromSameBatch(previousMessage, message, this.runtimeOptions.flushMode)) {
				sendBunchedMessages();
			}

			previousLocal = local;
			previousMessage = message;

			bunchedMessagesContent.push({
				contents: message.contents,
				localOpMetadata,
				clientSequenceNumber: message.clientSequenceNumber,
			});
		}

		sendBunchedMessages();
	}
}

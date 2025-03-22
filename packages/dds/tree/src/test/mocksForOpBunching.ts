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
		const containerRuntime = new MockContainerRuntimeWithOpBunching(
			dataStoreRuntime,
			this,
			this.runtimeOptions,
		);
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
	 * Pause processing of messages. Messages will be queued up until resumeProcessing is called.
	 */
	public pauseProcessing() {
		this.paused = true;
	}

	/**
	 * Resume processing of messages. Messages that were queued up while paused will now be processed.
	 */
	public resumeProcessing() {
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

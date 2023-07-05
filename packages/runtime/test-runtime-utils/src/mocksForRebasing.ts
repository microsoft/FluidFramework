/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISequencedDocumentMessage, MessageType } from "@fluidframework/protocol-definitions";
import {
	MockContainerRuntime,
	MockContainerRuntimeFactory,
	MockFluidDataStoreRuntime,
} from "./mocks";

/**
 * Specialized implementation of MockContainerRuntime for testing op rebasing, when the runtime will resend
 * ops to the datastores and all ops within the same batch will have the same sequence number.
 */
export class MockContainerRuntimeForRebasing extends MockContainerRuntime {
	private readonly outbox: InternalMessage[] = [];

	constructor(
		dataStoreRuntime: MockFluidDataStoreRuntime,
		factory: MockContainerRuntimeFactoryForRebasing,
		overrides?: { minimumSequenceNumber?: number },
	) {
		super(dataStoreRuntime, factory, overrides);
	}

	public process(message: ISequencedDocumentMessage) {
		super.process(message);

		// We've processed something, therefore the current batch has ended
		this.clientSequenceNumber++;
	}

	public submit(messageContent: any, localOpMetadata: unknown) {
		this.outbox.push({
			content: messageContent,
			localOpMetadata,
		});

		// Messages in the same batch will have the same clientSequenceNumber
		return this.clientSequenceNumber;
	}

	public flush() {
		while (this.outbox.length > 0) {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			this.submitInternal(this.outbox.shift()!);
		}
	}

	private submitInternal(message: InternalMessage) {
		this.factory.pushMessage({
			clientId: this.clientId,
			clientSequenceNumber: this.clientSequenceNumber,
			contents: message.content,
			referenceSequenceNumber: this.referenceSequenceNumber,
			type: MessageType.Operation,
		});
		this.addPendingMessage(message.content, message.localOpMetadata, this.clientSequenceNumber);
	}

	public rebase() {
		const messagesToRebase = this.outbox.slice();
		this.outbox.length = 0;

		messagesToRebase.forEach((message) =>
			this.dataStoreRuntime.reSubmit(message.content, message.localOpMetadata),
		);
	}
}

interface InternalMessage {
	content: any;
	localOpMetadata: unknown;
}

/**
 * Specialized implementation of MockContainerRuntimeFactory for testing op rebasing.
 */
export class MockContainerRuntimeFactoryForRebasing extends MockContainerRuntimeFactory {
	public createContainerRuntime(
		dataStoreRuntime: MockFluidDataStoreRuntime,
		overrides?: { minimumSequenceNumber?: number },
	): MockContainerRuntimeForRebasing {
		const containerRuntime = new MockContainerRuntimeForRebasing(
			dataStoreRuntime,
			this,
			overrides,
		);
		this.runtimes.push(containerRuntime);
		return containerRuntime;
	}

	private processMessage() {
		if (this.messages.length === 0) {
			throw new Error("Tried to process a message that did not exist");
		}

		// Explicitly JSON clone the value to match the behavior of going thru the wire.
		const message = JSON.parse(
			JSON.stringify(this.messages.shift()),
		) as ISequencedDocumentMessage;

		this.minSeq.set(message.clientId, message.referenceSequenceNumber);
		// Messages from the same batch have the same sequence number
		message.sequenceNumber = this.sequenceNumber;
		message.minimumSequenceNumber = this.getMinSeq();
		for (const runtime of this.runtimes) {
			runtime.process(message);
		}
	}

	public processOneMessage() {
		// Increase the sequence number between batches
		this.sequenceNumber++;
		this.processMessage();
	}

	public processSomeMessages(count: number) {
		// Increase the sequence number between batches
		this.sequenceNumber++;
		for (let i = 0; i < count; i++) {
			this.processMessage();
		}
	}

	public processAllMessages() {
		// Increase the sequence number between batches
		this.sequenceNumber++;
		this.processSomeMessages(this.messages.length);
	}
}

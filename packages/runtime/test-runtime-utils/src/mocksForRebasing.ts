/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { v4 as uuid } from "uuid";
import { ISequencedDocumentMessage, MessageType } from "@fluidframework/protocol-definitions";
import { MockFluidDataStoreRuntime } from "./mocks";
import {
	MockContainerRuntimeFactoryForReconnection,
	MockContainerRuntimeForReconnection,
} from "./mocksForReconnection";

/**
 * Specialized implementation of MockContainerRuntime for testing op rebasing, when the runtime will resend
 * ops to the datastores and all ops within the same batch will have the same sequence number.
 * Also supports reconnection as, it extends `MockContainerRuntimeForReconnection`.
 */
export class MockContainerRuntimeForRebasing extends MockContainerRuntimeForReconnection {
	private readonly currentBatch: ITrackableMessage[] = [];

	constructor(
		dataStoreRuntime: MockFluidDataStoreRuntime,
		factory: MockContainerRuntimeFactoryForRebasing,
		overrides?: { minimumSequenceNumber?: number },
	) {
		super(dataStoreRuntime, factory, overrides);
	}

	public process(message: ISequencedDocumentMessage) {
		// Processing ops will happen in a separate JS turn, so by then, we'd increase
		// the sequence number and flush the current batch.
		this.clientSequenceNumber++;
		this.currentBatch.splice(0);

		super.process(message);
	}

	public submit(messageContent: any, localOpMetadata: unknown) {
		if (!this.connected) {
			this.addPendingMessage(messageContent, localOpMetadata, -1);
			return -1;
		}

		const message = { content: messageContent, localOpMetadata, opId: uuid() };
		this.submitInternal(message);
		this.currentBatch.push(message);

		// Messages in the same batch will have the same clientSequenceNumber
		return this.clientSequenceNumber;
	}

	private submitInternal(message: ITrackableMessage) {
		const metadata = { opId: message.opId };
		this.factory.pushMessage({
			clientId: this.clientId,
			clientSequenceNumber: this.clientSequenceNumber,
			contents: message.content,
			referenceSequenceNumber: this.deltaManager.lastSequenceNumber,
			type: MessageType.Operation,
			metadata,
		});
		this.addPendingMessage(
			message.content,
			{ ...(message.localOpMetadata as object), ...metadata },
			this.clientSequenceNumber,
		);
	}

	public rebase() {
		this.currentBatch.forEach((message) => this.submitInternal(message));
	}
}

interface ITrackableMessage {
	content: any;
	localOpMetadata: unknown;
	opId: string;
}

/**
 * Specialized implementation of MockContainerRuntimeFactory for testing op rebasing.
 */
export class MockContainerRuntimeFactoryForRebasing extends MockContainerRuntimeFactoryForReconnection {
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

		let msg = this.messages.shift();

		// Explicitly JSON clone the value to match the behavior of going thru the wire.
		msg = JSON.parse(JSON.stringify(msg)) as ISequencedDocumentMessage;

		this.minSeq.set(msg.clientId, msg.referenceSequenceNumber);
		// Messages from the same batch have the same sequence number
		msg.sequenceNumber = this.sequenceNumber;
		msg.minimumSequenceNumber = this.getMinSeq();
		for (const runtime of this.runtimes) {
			runtime.process(msg);
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

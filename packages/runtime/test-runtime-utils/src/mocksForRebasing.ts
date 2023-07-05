/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { v4 as uuid } from "uuid";
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
	private submitted: number = 0;
	private processed: number = 0;

	constructor(
		dataStoreRuntime: MockFluidDataStoreRuntime,
		factory: MockContainerRuntimeFactoryForRebasing,
		overrides?: { minimumSequenceNumber?: number },
	) {
		super(dataStoreRuntime, factory, overrides);
	}

	public process(message: ISequencedDocumentMessage) {
		super.process(message);
		if (this.clientId === message.clientId) {
			this.processed++;
		}

		// We've processed something, therefore the current batch has ended
		this.clientSequenceNumber++;
	}

	public submit(messageContent: any, localOpMetadata: unknown) {
		const message = {
			content: messageContent,
			localOpMetadata,
			opId: uuid(),
			timesSubmitted: 0,
		};
		this.submitInternal(message);
		this.submitted++;

		// Messages in the same batch will have the same clientSequenceNumber
		return this.clientSequenceNumber;
	}

	private submitInternal(message: ITrackableMessage) {
		message.timesSubmitted++;

		const metadata = { opId: message.opId, timesSubmitted: message.timesSubmitted };
		this.factory.pushMessage({
			clientId: this.clientId,
			clientSequenceNumber: this.clientSequenceNumber,
			contents: message.content,
			referenceSequenceNumber: this.referenceSequenceNumber,
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
		this.pendingMessages
			.slice(0, this.submitted - this.processed)
			.forEach((message) =>
				this.dataStoreRuntime.reSubmit(message.content, message.localOpMetadata),
			);
	}
}

/**
 * To help debugging eventual consistency tests, all ops produced by this mock
 * can be tracked using an unique id. The tracking information will also be included
 * in the message metadata and local op metadata.
 */
interface ITrackableMessage {
	/**
	 * Message content
	 */
	content: any;
	/**
	 * local op metadata
	 */
	localOpMetadata: unknown;
	/**
	 * Unique identifier
	 */
	opId: string;
	/**
	 * How many times has this op been resubmitted
	 */
	timesSubmitted: number;
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

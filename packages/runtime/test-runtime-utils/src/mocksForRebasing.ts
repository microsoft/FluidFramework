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
 * Specialized implementation of MockContainerRuntime for testing op rebasing, when the
 * runtime will resend ops to the datastores and all ops within the same batch will have
 * the same sequence number. Also supports reconnection.
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
		super.process(message);
		this.clientSequenceNumber++;
		this.currentBatch.splice(0);
	}

	public submit(messageContent: any, localOpMetadata: unknown) {
		if (!this.connected) {
			this.addPendingMessage(messageContent, localOpMetadata, -1);
			return -1;
		}

		const message = { content: messageContent, localOpMetadata, opId: uuid() };
		this.submitInternal(message);
		this.currentBatch.push(message);

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
}

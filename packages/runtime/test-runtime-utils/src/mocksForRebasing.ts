/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { v4 as uuid } from "uuid";
import { ISequencedDocumentMessage, MessageType } from "@fluidframework/protocol-definitions";
import { assert } from "@fluidframework/common-utils";
import {
	IMockContainerRuntimePendingMessage,
	MockContainerRuntime,
	MockContainerRuntimeFactory,
	MockFluidDataStoreRuntime,
} from "./mocks";

/**
 * Specialized implementation of MockContainerRuntime for testing op rebasing, when the
 * runtime will resend ops to the datastores and all ops within the same batch will have
 * the same sequence number. Also supports reconnection.
 */
export class MockContainerRuntimeForRebasing extends MockContainerRuntime {
	private readonly pendingRemoteMessages: ISequencedDocumentMessage[] = [];

	public get connected(): boolean {
		return this._connected;
	}

	public set connected(connected: boolean) {
		if (this._connected === connected) {
			return;
		}

		this._connected = connected;

		if (connected) {
			for (const remoteMessage of this.pendingRemoteMessages) {
				this.process(remoteMessage);
			}
			this.pendingRemoteMessages.length = 0;
			this.clientSequenceNumber = 0;
			// We should get a new clientId on reconnection.
			this.clientId = uuid();
			// Update the clientId in FluidDataStoreRuntime.
			this.dataStoreRuntime.clientId = this.clientId;
			this.factory.quorum.addMember(this.clientId, {});
			// On reconnection, ask the DDSes to resubmit pending messages.
			this.reSubmitMessages();
		} else {
			const factory = this.factory as MockContainerRuntimeFactoryForRebasing;
			// On disconnection, clear any outstanding messages for this client because it will be resent.
			factory.clearOutstandingClientMessages(this.clientId);
			this.factory.quorum.removeMember(this.clientId);
		}

		// Let the DDSes know that the connection state changed.
		this.deltaConnections.forEach((dc) => {
			dc.setConnectionState(this.connected);
		});
	}

	private _connected = true;

	constructor(
		dataStoreRuntime: MockFluidDataStoreRuntime,
		factory: MockContainerRuntimeFactoryForRebasing,
		overrides?: { minimumSequenceNumber?: number },
	) {
		super(dataStoreRuntime, factory, overrides);
	}

	public process(message: ISequencedDocumentMessage) {
		if (this.connected) {
			super.process(message);
		} else {
			this.pendingRemoteMessages.push(message);
		}

		this.clientSequenceNumber++;
	}

	public submit(messageContent: any, localOpMetadata: unknown) {
		if (!this.connected) {
			this.addPendingMessage(messageContent, localOpMetadata, -1);
			return -1;
		}

		this.factory.pushMessage({
			clientId: this.clientId,
			clientSequenceNumber: this.clientSequenceNumber,
			contents: messageContent,
			referenceSequenceNumber: this.deltaManager.lastSequenceNumber,
			type: MessageType.Operation,
		});
		this.addPendingMessage(messageContent, localOpMetadata, this.clientSequenceNumber);
		return this.clientSequenceNumber;
	}

	private reSubmitMessages() {
		let messageCount = this.pendingMessages.length;
		while (messageCount > 0) {
			const pendingMessage: IMockContainerRuntimePendingMessage | undefined =
				this.pendingMessages.shift();
			assert(
				pendingMessage !== undefined,
				"this is impossible due to the above length check",
			);
			this.deltaConnections.forEach((dc) => {
				dc.reSubmit(pendingMessage.content, pendingMessage.localOpMetadata);
			});
			messageCount--;
		}
	}
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

	public clearOutstandingClientMessages(clientId: string) {
		// Delete all the messages for client with the given clientId.
		this.messages = this.messages.filter((message: ISequencedDocumentMessage) => {
			return message.clientId !== clientId;
		});
	}
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { v4 as uuid } from "uuid";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { assert } from "@fluidframework/common-utils";
import {
	IMockContainerRuntimePendingMessage,
	MockContainerRuntime,
	MockContainerRuntimeFactory,
	IMockContainerRuntimeOptions,
	MockFluidDataStoreRuntime,
} from "./mocks";

/**
 * Specialized implementation of MockContainerRuntime for testing ops during reconnection.
 */
export class MockContainerRuntimeForReconnection extends MockContainerRuntime {
	/**
	 * Contains messages from other clients that were sequenced while this runtime was marked as disconnected.
	 */
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
			const runtimeAndQueue = this.factory.messages.get(this.clientId);
			assert(runtimeAndQueue !== undefined, "Reconnecting a runtime that never existed.");
			this.factory.messages.delete(this.clientId);
			this.factory.runtimes.delete(this.clientId);

			// We should get a new clientId on reconnection.
			this.clientId = uuid();
			// Update the clientId in FluidDataStoreRuntime.
			this.dataStoreRuntime.clientId = this.clientId;
			this.factory.quorum.addMember(this.clientId, {});

			this.factory.messages.set(this.clientId, runtimeAndQueue);
			this.factory.runtimes.set(this.clientId, runtimeAndQueue.runtime);
			// On reconnection, ask the DDSes to resubmit pending messages.
			this.reSubmitMessages();
		} else {
			const factory = this.factory as MockContainerRuntimeFactoryForReconnection;
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
		factory: MockContainerRuntimeFactoryForReconnection,
		runtimeOptions: IMockContainerRuntimeOptions = {},
		overrides?: { minimumSequenceNumber?: number },
	) {
		super(dataStoreRuntime, factory, runtimeOptions, overrides);
	}

	override process(message: ISequencedDocumentMessage) {
		if (this.connected) {
			super.process(message);
		} else {
			this.pendingRemoteMessages.push(message);
		}
	}

	override submit(messageContent: any, localOpMetadata: unknown) {
		// Submit messages only if we are connection, otherwise, just add it to the pending queue.
		if (this.connected) {
			return super.submit(messageContent, localOpMetadata);
		}

		this.addPendingMessage(messageContent, localOpMetadata, -1);
		return -1;
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
			this.dataStoreRuntime.reSubmit(pendingMessage.content, pendingMessage.localOpMetadata);
			messageCount--;
		}
	}
}

/**
 * Specialized implementation of MockContainerRuntimeFactory for testing ops during reconnection.
 */
export class MockContainerRuntimeFactoryForReconnection extends MockContainerRuntimeFactory {
	override createContainerRuntime(
		dataStoreRuntime: MockFluidDataStoreRuntime,
		overrides?: { minimumSequenceNumber?: number },
	): MockContainerRuntimeForReconnection {
		const containerRuntime = new MockContainerRuntimeForReconnection(
			dataStoreRuntime,
			this,
			this.runtimeOptions,
			overrides,
		);

		let queue: ISequencedDocumentMessage[] = [];
		if (this.messages.size > 0) {
			queue = [...this.messages.values().next().value.queue];
		}

		this.runtimes.set(containerRuntime.clientId, containerRuntime);
		this.messages.set(containerRuntime.clientId, { runtime: containerRuntime, queue });
		return containerRuntime;
	}

	public clearOutstandingClientMessages(clientId: string) {
		// Delete all the messages for client with the given clientId.
		for (const [client, { runtime, queue }] of this.messages) {
			this.messages.set(client, {
				queue: queue.filter((msg) => msg.clientId !== clientId),
				runtime,
			});
		}
	}
}

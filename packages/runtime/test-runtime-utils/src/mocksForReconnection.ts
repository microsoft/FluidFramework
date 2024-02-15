/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { v4 as uuid } from "uuid";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import {
	MockContainerRuntime,
	MockContainerRuntimeFactory,
	IMockContainerRuntimeOptions,
	MockFluidDataStoreRuntime,
	type IMockContainerRuntimePendingMessage,
} from "./mocks";

/**
 * Specialized implementation of MockContainerRuntime for testing ops during reconnection.
 * @alpha
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
			// We should get a new clientId on reconnection.
			this.clientId = uuid();
			// Update the clientId in FluidDataStoreRuntime.
			this.dataStoreRuntime.clientId = this.clientId;
			this.factory.quorum.addMember(this.clientId, {});
			// On reconnection, ask the DDSes to resubmit pending messages.
			const messagesToResubmit = this.pendingMessages.slice();
			this.pendingMessages.length = 0;
			this.reSubmitMessages(messagesToResubmit);
		} else {
			const factory = this.factory as MockContainerRuntimeFactoryForReconnection;
			// On disconnection, clear any outstanding messages for this client because it will be resent.
			factory.clearOutstandingClientMessages(this.clientId);
			this.factory.quorum.removeMember(this.clientId);
		}

		// Let the DDSes know that the connection state changed.
		this.dataStoreRuntime.setConnectionState(this.connected, this.clientId);
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

	public async initializeWithStashedOps(
		pendingMessages: IMockContainerRuntimePendingMessage[],
		savedOps: ISequencedDocumentMessage[],
	) {
		if (this.pendingMessages.length !== 0 || this.clientSequenceNumber !== 0) {
			throw new Error("applyStashedOps must be called first, and once.");
		}

		let refSeq = Math.min(
			savedOps[0]?.referenceSequenceNumber ?? Number.MAX_SAFE_INTEGER,
			pendingMessages[0]?.referenceSequenceNumber ?? Number.MAX_SAFE_INTEGER,
		);
		if (refSeq === Number.MAX_SAFE_INTEGER) {
			refSeq = 0;
		}
		this.dataStoreRuntime.deltaManager.lastSequenceNumber = refSeq;
		this.dataStoreRuntime.deltaManager.minimumSequenceNumber = refSeq;

		// handle pending messages before first saved op
		while (
			pendingMessages.length > 0 &&
			pendingMessages[0].referenceSequenceNumber <=
				this.dataStoreRuntime.deltaManager.lastSequenceNumber
		) {
			await this.dataStoreRuntime.applyStashedOp(pendingMessages.shift()?.content);
		}
		// apply the saved and pending ops
		for (const savedOp of savedOps) {
			if (savedOp.clientId === this.clientId) {
				await this.dataStoreRuntime.applyStashedOp(savedOp.contents);
			}
			this.process(savedOp);

			while (
				pendingMessages.length > 0 &&
				pendingMessages[0].referenceSequenceNumber === savedOp.sequenceNumber
			) {
				await this.dataStoreRuntime.applyStashedOp(pendingMessages.shift()?.content);
			}
		}
		if (pendingMessages.length !== 0) {
			throw new Error("There should be no pending message after saved ops are processed");
		}
		// issue a reconnect to rebase pending ops
		this.connected = false;
		this.connected = true;
	}
}

/**
 * Specialized implementation of MockContainerRuntimeFactory for testing ops during reconnection.
 * @alpha
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
		this.runtimes.add(containerRuntime);
		return containerRuntime;
	}

	public clearOutstandingClientMessages(clientId: string) {
		// Delete all the messages for client with the given clientId.
		this.messages = this.messages.filter((message: ISequencedDocumentMessage) => {
			return message.clientId !== clientId;
		});
	}
}

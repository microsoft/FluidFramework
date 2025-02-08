/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";
import {
	createChildLogger,
	raiseConnectedEvent,
} from "@fluidframework/telemetry-utils/internal";
import { v4 as uuid } from "uuid";

import {
	type IMockContainerRuntimeIdAllocationMessage,
	IMockContainerRuntimeOptions,
	MockContainerRuntime,
	MockContainerRuntimeFactory,
	MockFluidDataStoreRuntime,
} from "./mocks.js";

/**
 * Specialized implementation of MockContainerRuntime for testing ops during reconnection.
 * @legacy
 * @alpha
 */
export class MockContainerRuntimeForReconnection extends MockContainerRuntime {
	/**
	 * Contains messages from other clients that were sequenced while this runtime was marked as disconnected.
	 */
	protected readonly pendingRemoteMessages: ISequencedDocumentMessage[] = [];

	public get connected(): boolean {
		return this._connected;
	}

	public set connected(connected: boolean) {
		this.setConnectedState(connected);
	}

	protected processPendingMessages(pendingMessages: ISequencedDocumentMessage[]) {
		for (const remoteMessage of pendingMessages) {
			this.process(remoteMessage);
		}
	}

	protected setConnectedState(connected: boolean): void {
		if (this._connected === connected) {
			return;
		}

		raiseConnectedEvent(createChildLogger(), this, connected);
		this._connected = connected;

		if (connected) {
			this.processPendingMessages(this.pendingRemoteMessages);
			this.pendingRemoteMessages.length = 0;
			this.deltaManager.clientSequenceNumber = 0;
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
			// On disconnection, clear any outstanding messages for this client because it will be resent.
			this.factory.clearOutstandingClientMessages(this.clientId);
			this.factory.quorum.removeMember(this.clientId);
			for (const message of this.outbox) {
				this.addPendingMessage(
					message.content,
					message.localOpMetadata,
					++this.deltaManager.clientSequenceNumber,
				);
			}
			this.outbox.length = 0;
		}

		// Let the DDSes know that the connection state changed.
		this.dataStoreRuntime.setConnectionState(this.connected, this.clientId);
	}

	private _connected = true;
	protected readonly processedOps?: ISequencedDocumentMessage[];
	constructor(
		dataStoreRuntime: MockFluidDataStoreRuntime,
		protected override readonly factory: MockContainerRuntimeFactoryForReconnection,
		runtimeOptions: IMockContainerRuntimeOptions = {},
		overrides?: { minimumSequenceNumber?: number; trackRemoteOps?: boolean },
	) {
		super(dataStoreRuntime, factory, runtimeOptions, overrides);
		if (overrides?.trackRemoteOps === true) {
			this.processedOps = [];
		}
	}

	override process(message: ISequencedDocumentMessage) {
		if (this.connected) {
			this.processedOps?.push(message);
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

	override flush() {
		// Flush messages only if we are connection, otherwise, just ignore it.
		if (this.connected) {
			super.flush();
		}
	}

	public async initializeWithStashedOps(
		fromContainerRuntime: MockContainerRuntimeForReconnection,
	) {
		if (this.pendingMessages.length !== 0 || this.deltaManager.clientSequenceNumber !== 0) {
			throw new Error("applyStashedOps must be called first, and once.");
		}

		if (fromContainerRuntime.processedOps === undefined) {
			throw new Error("containerRuntime must have trackRemoteOps true");
		}

		// shutdown the existing client
		fromContainerRuntime.connected = false;
		fromContainerRuntime.flush();
		this.factory.removeContainerRuntime(fromContainerRuntime);
		// clear any unprocessed ops for this client
		this.factory.clearOutstandingClientMessages(fromContainerRuntime.clientId);

		// get the saved ops seen by the client, and its pending ops
		const pendingMessages = fromContainerRuntime.pendingMessages.splice(0);
		const remoteOps = [
			...fromContainerRuntime.processedOps.splice(0),
			...fromContainerRuntime.pendingRemoteMessages.splice(0),
		];

		// ensure no ops are sent to, or produced by the old client
		// this can help find bugs in the the harness
		Object.freeze(fromContainerRuntime.pendingMessages);
		Object.freeze(fromContainerRuntime.pendingRemoteMessages);
		Object.freeze(fromContainerRuntime.processedOps);

		let refSeq = Math.min(
			remoteOps[0]?.referenceSequenceNumber ?? Number.MAX_SAFE_INTEGER,
			pendingMessages[0]?.referenceSequenceNumber ?? Number.MAX_SAFE_INTEGER,
		);
		if (refSeq === Number.MAX_SAFE_INTEGER) {
			refSeq = 0;
		}
		if (
			this.dataStoreRuntime.deltaManagerInternal.lastSequenceNumber !== refSeq ||
			this.dataStoreRuntime.deltaManagerInternal.minimumSequenceNumber !== refSeq
		) {
			throw new Error(
				"computed min and ref seq don't match the loaded values; this indicates a bad load, or missing messages",
			);
		}

		const stashedOps = new Map<number, any>();

		remoteOps.forEach((op) => {
			if (op.clientId === this.clientId) {
				const ops = stashedOps.get(op.referenceSequenceNumber) ?? [];
				ops.push(op.contents);
				stashedOps.set(op.referenceSequenceNumber, ops);
			}
		});
		pendingMessages.forEach((op) => {
			const ops = stashedOps.get(op.referenceSequenceNumber) ?? [];
			ops.push(op.content);
			stashedOps.set(op.referenceSequenceNumber, ops);
		});

		const applyStashedOpsAtSeq = async (seq: number) => {
			const pendingAtSeq = stashedOps.get(seq);
			for (const message of pendingAtSeq ?? []) {
				// As in production, do not locally apply any stashed ID allocation messages.
				// Instead, simply resubmit them.
				if ((message as IMockContainerRuntimeIdAllocationMessage).type === "idAllocation") {
					this.submit(message, undefined);
				} else {
					await this.dataStoreRuntime.applyStashedOp(message);
				}
			}
			stashedOps.delete(seq);
		};
		await applyStashedOpsAtSeq(this.dataStoreRuntime.deltaManagerInternal.lastSequenceNumber);
		// apply the saved and pending ops
		for (const savedOp of remoteOps) {
			this.process(savedOp);
			await applyStashedOpsAtSeq(
				this.dataStoreRuntime.deltaManagerInternal.lastSequenceNumber,
			);
		}
		if (stashedOps.size !== 0) {
			throw new Error("There should be no pending message after saved ops are processed");
		}
		// issue a reconnect to rebase pending ops
		this.connected = false;
		this.connected = true;
	}
}

/**
 * Specialized implementation of MockContainerRuntimeFactory for testing ops during reconnection.
 * @legacy
 * @alpha
 */
export class MockContainerRuntimeFactoryForReconnection extends MockContainerRuntimeFactory {
	override createContainerRuntime(
		dataStoreRuntime: MockFluidDataStoreRuntime,
		overrides?: { minimumSequenceNumber?: number; trackRemoteOps?: boolean },
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

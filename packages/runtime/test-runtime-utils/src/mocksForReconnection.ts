/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { v5 as uuidv5 } from "uuid";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { assert } from "@fluidframework/common-utils";
import {
	IMockContainerRuntimePendingMessage,
	MockContainerRuntime,
	MockContainerRuntimeFactory,
	IMockContainerRuntimeOptions,
	MockFluidDataStoreRuntime,
} from "./mocks";

const CLIENT_IDS = [
	"fbfa352b-b123-456d-8562-ef0cf31f3724",
	"eacaf5cd-d23e-4997-9e3e-fe7956c53104",
	"00c20f17-4293-4ccb-a25d-6f7aa526917b",
	"9dbb9d52-6a47-443b-8c07-d3593cb51012",
	"053819ad-87a4-4311-ad03-99cf8d9491e1",
	"388ee444-c0fc-4e58-a6d4-25bbee9172b3",
	"0665d06b-fe8d-4a5f-95e8-5d81e2d000ac",
	"26213220-b062-4412-9f13-b492da6e69d6",
	"e9013ef7-7413-44b6-ac83-22a23581d0e3",
	"b95d45dd-d590-4790-9df3-2fb71ff5d51b",
	"12228428-a2f1-4051-a3db-7102156ecd05",
	"f1c0fc8a-dd76-4076-b5f3-c4ee265660ec",
	"7cadf3f8-732d-45f4-948a-f42fbd64b3df",
	"ef3a35bf-04cc-4cc6-ab5e-fbb2f030b508",
	"c4ed8dbd-11df-4cbd-a159-801f90f0fcc6",
	"804b5cd7-2299-48e2-b6a2-51de5c704f71",
	"d64c86e4-2099-437a-9a03-18576dcd311e",
	"1b9528c7-68dc-424c-9f9c-5f3d8a7810d5",
	"13028529-27a6-4368-a611-4398cb394bc3",
	"53efdc88-751b-4c2c-aebb-d05252c84b97",
	"c849dacf-4f8c-4057-a5ac-a194b1a47bab",
	"ddaf0a36-3af8-480e-84be-78bc085a9f3f",
	"cfd5db68-16f9-46cb-ba03-4ac7d34f6440",
	"dfbeed13-c947-4f36-92a0-0cfa70bee066",
	"fe8052e8-58b1-4284-b1dd-e827948a9ced",
	"6b83983e-b243-4e0c-8e6e-595f1fd21678",
	"317f1e0e-d492-488d-94f8-7f228b5edf97",
	"d264d881-84cd-4356-8b02-8517a02229f6",
	"9ab02a0e-f3e3-40b8-bd1e-3a36933b5168",
	"8f36447d-02f8-4b2b-89ad-7a0f5cf33897",
	"492bd116-f639-43e7-8526-5d9836f79f43",
	"bdd3da94-7af1-4b56-8026-36faf2551420",
	"359af8ab-43e0-4cac-b3e7-6d7eebfd7be3",
	"eadac45f-b180-4124-9ee0-20970f5e9a38",
	"02f98c58-b117-46eb-b765-c8aedb2fabe7",
	"9eca431f-ffe5-498f-9722-31cfcbd263c9",
	"4641cb31-0da3-4861-9bf2-4b5381488408",
	"6a7ab46d-e6c5-4319-86b3-e6fa22e9ea90",
	"d2f94646-6b30-4c84-9a4e-ebe020b23238",
	"55aaa02c-de72-47e0-9260-256d4e8dd953",
	"e752084d-bf93-47e8-98cf-3c447e7ecc61",
	"03045b61-f9e8-4b96-afbf-2e0604880e5e",
	"208a1548-4666-4893-b302-8df9a611156a",
	"b0b31404-e09a-4b0f-8514-21de9ab4aaf0",
	"3aa8a9e7-7a9a-45cb-ae3f-8787b40f3757",
	"60491269-4376-46d4-afa1-801e0a8fce29",
	"bd001355-420e-45af-9552-f789ffcc3dd9",
	"683fcea0-5fa0-44de-bca6-7a488d293bce",
	"25c0d81d-3163-465d-8dc6-5e011e6a4a80",
	"9d37c5c6-4356-459b-a9b5-060519b38465",
	"f6193792-6115-4062-9ad0-36ecdf061746",
	"827c51ad-0fe5-43d2-a6f6-1e579560d7db",
	"0903cbed-0845-422b-8333-8917da1795b6",
	"73ee10b9-5494-45c5-876a-3e5f688bcdf4",
	"92530d5f-d16b-40e6-af0f-ccdd1a012a3b",
	"a3fc7662-4372-4aec-890c-d0d22a8e9515",
	"071010dc-b640-4ef4-91df-a0f71188d6f5",
	"0d078254-f177-4c6a-a11f-228af5b46495",
	"95b4b346-c1ae-4042-94a3-051abd37f265",
	"daa345b2-85a2-487d-8ad5-7ad2d8e2851d",
];

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
			// We should get a new clientId on reconnection.
			const clientIdIndex = this.clientId.charCodeAt(0) - "A".charCodeAt(0);
			const clientId = this.clientId.length === 1 ? CLIENT_IDS[clientIdIndex] : this.clientId;
			this.clientId = uuidv5("reconnect", clientId);
			// Update the clientId in FluidDataStoreRuntime.
			this.dataStoreRuntime.clientId = this.clientId;
			this.factory.quorum.addMember(this.clientId, {});
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

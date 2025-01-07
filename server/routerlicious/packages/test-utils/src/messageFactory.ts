/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IClientJoin,
	IDocumentMessage,
	IDocumentSystemMessage,
	ISequencedDocumentAugmentedMessage,
	ISequencedDocumentMessage,
	MessageType,
	ScopeType,
} from "@fluidframework/protocol-definitions";
import {
	BoxcarType,
	IBoxcarMessage,
	IQueuedMessage,
	IRawOperationMessage,
	ISequencedOperationMessage,
	RawOperationType,
	SequencedOperationType,
} from "@fluidframework/server-services-core";

// eslint-disable-next-line @typescript-eslint/no-require-imports
import hash = require("string-hash");

/**
 * @internal
 */
export class KafkaMessageFactory {
	private readonly offsets: number[] = [];

	constructor(
		public topic = "test",
		partitions = 1,
		private readonly stringify = true,
		private readonly tenantId: string | undefined = undefined,
		private readonly documentId: string | undefined = undefined,
	) {
		for (let i = 0; i < partitions; i++) {
			this.offsets.push(0);
		}
	}

	public sequenceMessage(value: any | any[], key: string): IQueuedMessage {
		const partition = this.getPartition(key);
		const offset = this.offsets[partition]++;

		const message: IQueuedMessage = {
			offset,
			partition,
			topic: this.topic,
			value: this.stringify
				? JSON.stringify(value)
				: ({
						contents: Array.isArray(value) ? value : [value],
						documentId: this.documentId,
						tenantId: this.tenantId,
						type: BoxcarType,
				  } as IBoxcarMessage),
		};

		return message;
	}

	public getHeadOffset(key: string) {
		return this.offsets[this.getPartition(key)] - 1;
	}

	private getPartition(key: string): number {
		return hash(key) % this.offsets.length;
	}
}

/**
 * @internal
 */
export class MessageFactory {
	private clientSequenceNumber = 0;
	private sequenceNumber = 0;

	constructor(
		private readonly documentId,
		private readonly clientId,
		private readonly tenantId = "test",
	) {}

	public createDocumentMessage(
		type = MessageType.Operation,
		referenceSequenceNumber = 0,
	): IDocumentMessage {
		const operation: IDocumentMessage = {
			clientSequenceNumber: ++this.clientSequenceNumber,
			contents: null,
			metadata: undefined,
			referenceSequenceNumber,
			traces: [],
			type,
			compression: undefined,
		};
		return operation;
	}

	public create(
		type = MessageType.Operation,
		referenceSequenceNumber = 0,
		timestamp = Date.now(),
	): IRawOperationMessage {
		const operation = this.createDocumentMessage(type, referenceSequenceNumber);
		return this.createRawOperation(operation, timestamp, this.clientId);
	}

	public createJoin(timestamp = Date.now(), serverMetadata: any = undefined) {
		const joinMessage: IClientJoin = {
			clientId: this.clientId,
			detail: {
				mode: "write",
				permission: [],
				scopes: [ScopeType.DocRead, ScopeType.DocWrite, ScopeType.SummaryWrite],
				details: {
					capabilities: { interactive: true },
				},
				user: {
					id: "test-user",
				},
			},
		};
		const operation: IDocumentSystemMessage = {
			clientSequenceNumber: -1,
			contents: null,
			data: JSON.stringify(joinMessage),
			referenceSequenceNumber: -1,
			traces: [],
			type: MessageType.ClientJoin,
			serverMetadata,
		};

		return this.createRawOperation(operation, timestamp, null);
	}

	public createLeave(timestamp = Date.now()) {
		const operation: IDocumentSystemMessage = {
			clientSequenceNumber: -1,
			contents: null,
			data: JSON.stringify(this.clientId),
			referenceSequenceNumber: -1,
			traces: [],
			type: MessageType.ClientLeave,
		};

		return this.createRawOperation(operation, timestamp, null);
	}

	public createRawOperation(operation: IDocumentMessage, timestamp, clientId) {
		const objectMessage: IRawOperationMessage = {
			clientId,
			documentId: this.documentId,
			operation,
			tenantId: this.tenantId,
			timestamp,
			type: RawOperationType,
		};

		return objectMessage;
	}

	public createSequencedOperation(referenceSequenceNumber = 0): ISequencedOperationMessage {
		const operation = this.createDocumentMessage(
			MessageType.Operation,
			referenceSequenceNumber,
		);
		const sequencedOperation: ISequencedDocumentMessage = {
			clientId: this.clientId,
			clientSequenceNumber: operation.clientSequenceNumber,
			contents: operation.contents,
			metadata: operation.metadata,
			minimumSequenceNumber: 0,
			origin: undefined,
			referenceSequenceNumber: operation.referenceSequenceNumber,
			sequenceNumber: this.sequenceNumber++,
			timestamp: Date.now(),
			traces: [],
			type: operation.type,
		};

		const message: ISequencedOperationMessage = {
			documentId: this.documentId,
			operation: sequencedOperation,
			tenantId: this.tenantId,
			type: SequencedOperationType,
		};

		return message;
	}

	public createSummarize(
		referenceSequenceNumber: number,
		handle: string,
	): ISequencedOperationMessage {
		const operation = this.createDocumentMessage(
			MessageType.Summarize,
			referenceSequenceNumber,
		);
		const sequencedOperation: ISequencedDocumentAugmentedMessage = {
			clientId: this.clientId,
			clientSequenceNumber: operation.clientSequenceNumber,
			contents: `{"handle": "${handle}" ,"head":null,"message":"","parents":[]}`,
			metadata: operation.metadata,
			minimumSequenceNumber: 0,
			origin: undefined,
			referenceSequenceNumber: operation.referenceSequenceNumber,
			sequenceNumber: this.sequenceNumber++,
			timestamp: Date.now(),
			traces: [],
			type: operation.type,
			additionalContent: "",
		};

		const message: ISequencedOperationMessage = {
			documentId: this.documentId,
			operation: sequencedOperation,
			tenantId: this.tenantId,
			type: SequencedOperationType,
		};

		return message;
	}

	public createNoClient(referenceSequenceNumber = 0): ISequencedOperationMessage {
		const operation = this.createDocumentMessage(MessageType.NoClient, referenceSequenceNumber);
		const sequencedOperation: ISequencedDocumentAugmentedMessage = {
			clientId: this.clientId,
			clientSequenceNumber: operation.clientSequenceNumber,
			contents: operation.contents,
			metadata: operation.metadata,
			minimumSequenceNumber: this.sequenceNumber,
			origin: undefined,
			referenceSequenceNumber: this.sequenceNumber,
			sequenceNumber: this.sequenceNumber++,
			timestamp: Date.now(),
			traces: [],
			type: operation.type,
			additionalContent: "",
		};

		const message: ISequencedOperationMessage = {
			documentId: this.documentId,
			operation: sequencedOperation,
			tenantId: this.tenantId,
			type: SequencedOperationType,
		};

		return message;
	}

	public createSummaryAck(handle: string): ISequencedOperationMessage {
		const operation = this.createDocumentMessage(MessageType.SummaryAck, 0);
		const sequencedOperation: ISequencedDocumentAugmentedMessage = {
			clientId: null,
			clientSequenceNumber: -1,
			contents: { handle, summaryProposal: { summarySequenceNumber: 1 } },
			metadata: operation.metadata,
			minimumSequenceNumber: 0,
			origin: undefined,
			referenceSequenceNumber: -1,
			sequenceNumber: this.sequenceNumber++,
			timestamp: Date.now(),
			traces: [],
			type: operation.type,
			additionalContent: "",
		};

		const message: ISequencedOperationMessage = {
			documentId: this.documentId,
			operation: sequencedOperation,
			tenantId: this.tenantId,
			type: SequencedOperationType,
		};

		return message;
	}
}

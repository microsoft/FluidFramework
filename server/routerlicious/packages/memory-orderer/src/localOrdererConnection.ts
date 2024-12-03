/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { performance } from "@fluidframework/common-utils";
import {
	IClient,
	IClientJoin,
	IDocumentMessage,
	IDocumentSystemMessage,
	MessageType,
} from "@fluidframework/protocol-definitions";
import {
	BoxcarType,
	IBoxcarMessage,
	IDocument,
	IOrdererConnection,
	IProducer,
	IRawOperationMessage,
	IServiceConfiguration,
	RawOperationType,
} from "@fluidframework/server-services-core";
import { Lumberjack, getLumberBaseProperties } from "@fluidframework/server-services-telemetry";
import { ISubscriber } from "./pubsub";

export class LocalOrdererConnection implements IOrdererConnection {
	public readonly maxMessageSize: number;

	constructor(
		public socket: ISubscriber,
		public readonly existing: boolean,
		document: IDocument,
		private readonly producer: IProducer,
		public readonly tenantId: string,
		public readonly documentId: string,
		public readonly clientId: string,
		private readonly client: IClient,
		public readonly serviceConfiguration: IServiceConfiguration,
	) {
		this.maxMessageSize = serviceConfiguration.maxMessageSize;
	}

	public async connect(clientJoinMessageServerMetadata?: any) {
		// Send the connect message
		const clientDetail: IClientJoin = {
			clientId: this.clientId,
			detail: this.client,
		};

		const operation: IDocumentSystemMessage = {
			clientSequenceNumber: -1,
			contents: null,
			data: JSON.stringify(clientDetail),
			referenceSequenceNumber: -1,
			traces: this.serviceConfiguration.enableTraces ? [] : undefined,
			type: MessageType.ClientJoin,
			serverMetadata: clientJoinMessageServerMetadata,
		};

		const message: IRawOperationMessage = {
			clientId: null,
			documentId: this.documentId,
			operation,
			tenantId: this.tenantId,
			timestamp: Date.now(),
			type: RawOperationType,
		};

		// Submit on next tick to sequence behind connect response
		this.submitRawOperation([message]);
	}

	public async order(messages: IDocumentMessage[]) {
		const rawMessages = messages.map((message) => {
			const rawMessage: IRawOperationMessage = {
				clientId: this.clientId,
				documentId: this.documentId,
				operation: message,
				tenantId: this.tenantId,
				timestamp: Date.now(),
				type: RawOperationType,
			};

			return rawMessage;
		});

		this.submitRawOperation(rawMessages);
	}

	public async disconnect() {
		const operation: IDocumentSystemMessage = {
			clientSequenceNumber: -1,
			contents: null,
			data: JSON.stringify(this.clientId),
			referenceSequenceNumber: -1,
			traces: this.serviceConfiguration.enableTraces ? [] : undefined,
			type: MessageType.ClientLeave,
		};
		const message: IRawOperationMessage = {
			clientId: null,
			documentId: this.documentId,
			operation,
			tenantId: this.tenantId,
			timestamp: Date.now(),
			type: RawOperationType,
		};
		this.submitRawOperation([message]);
	}

	public once(event: "error", listener: (...args: any[]) => void) {
		this.producer.once(event, listener);
	}

	public off(event: "error", listener: (...args: any[]) => void) {
		this.producer.off(event, listener);
	}

	private submitRawOperation(messages: IRawOperationMessage[]) {
		if (this.serviceConfiguration.enableTraces) {
			// Add trace
			messages.forEach((message) => {
				const operation = message.operation;
				operation?.traces?.push({
					action: "start",
					service: "nexus",
					timestamp: performance.now(),
				});
			});
		}

		const boxcar: Required<IBoxcarMessage> = {
			contents: messages,
			documentId: this.documentId,
			tenantId: this.tenantId,
			type: BoxcarType,
		};

		// Submits the message.
		this.producer.send([boxcar], this.tenantId, this.documentId).catch((err) => {
			const lumberjackProperties = {
				...getLumberBaseProperties(this.documentId, this.tenantId),
			};
			Lumberjack.error("Error sending boxcar to producer", lumberjackProperties, err);
		});
	}
}

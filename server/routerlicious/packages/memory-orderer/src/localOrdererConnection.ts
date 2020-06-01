/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { performanceNow } from "@fluidframework/common-utils";
import {
    IClient,
    IClientJoin,
    IDocumentMessage,
    IDocumentSystemMessage,
    IServiceConfiguration,
    MessageType,
} from "@fluidframework/protocol-definitions";
import {
    BoxcarType,
    IBoxcarMessage,
    IDocument,
    IOrdererConnection,
    IProducer,
    IRawOperationMessage,
    RawOperationType,
} from "@fluidframework/server-services-core";
import { IPubSub, ISubscriber } from "./";

export class LocalOrdererConnection implements IOrdererConnection {
    public readonly parentBranch: string;

    constructor(
        private readonly pubsub: IPubSub,
        public socket: ISubscriber,
        public readonly existing: boolean,
        document: IDocument,
        private readonly producer: IProducer,
        public readonly tenantId: string,
        public readonly documentId: string,
        public readonly clientId: string,
        private readonly client: IClient,
        public readonly maxMessageSize: number,
        public readonly serviceConfiguration: IServiceConfiguration,
    ) {
        this.parentBranch = document.parent ? document.parent.documentId : null;
    }

    public async connect() {
        // Subscribe to the message channels
        // Todo: We probably don't need this.
        this.pubsub.subscribe(`${this.tenantId}/${this.documentId}`, this.socket);
        this.pubsub.subscribe(`client#${this.clientId}`, this.socket);

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
            traces: [],
            type: MessageType.ClientJoin,
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
            traces: [],
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

        // Todo: We probably don't need this either.
        this.pubsub.unsubscribe(`${this.tenantId}/${this.documentId}`, this.socket);
        this.pubsub.unsubscribe(`client#${this.clientId}`, this.socket);
    }

    public once(event: "error", listener: (...args: any[]) => void) {
        this.producer.once(event, listener);
    }

    private submitRawOperation(messages: IRawOperationMessage[]) {
        // Add trace
        messages.forEach((message) => {
            const operation = message.operation;
            if (operation && operation.traces) {
                operation.traces.push(
                    {
                        action: "start",
                        service: "alfred",
                        timestamp: performanceNow(),
                    });
            }
        });

        const boxcar: IBoxcarMessage = {
            contents: messages,
            documentId: this.documentId,
            tenantId: this.tenantId,
            type: BoxcarType,
        };

        // Submits the message.
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.producer.send([boxcar], this.tenantId, this.documentId);
    }
}

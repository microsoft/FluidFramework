/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IClient,
    IClientJoin,
    IDocumentMessage,
    IDocumentSystemMessage,
    IServiceConfiguration,
    MessageType,
} from "@microsoft/fluid-protocol-definitions";
import {
    BoxcarType,
    IBoxcarMessage,
    IDocument,
    IOrdererConnection,
    IProducer,
    IRawOperationMessage,
    RawOperationType,
} from "@microsoft/fluid-server-services-core";
import { IPubSub, ISubscriber } from "./";

// tslint:disable-next-line:no-var-requires
const now = require("performance-now");

export class LocalOrdererConnection implements IOrdererConnection {
    public readonly parentBranch: string;

    constructor(
        private pubsub: IPubSub,
        public socket: ISubscriber,
        public readonly existing: boolean,
        document: IDocument,
        private producer: IProducer,
        public readonly tenantId: string,
        public readonly documentId: string,
        public readonly clientId: string,
        private client: IClient,
        public readonly maxMessageSize: number,
        public readonly serviceConfiguration: IServiceConfiguration,
    ) {
        this.parentBranch = document.parent ? document.parent.documentId : null;

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

    public order(messages: IDocumentMessage[]): void {
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

    public disconnect() {
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

    public once(event: "producerError", listener: (...args: any[]) => void) {
        this.producer.once(event, listener);
    }

    private submitRawOperation(messages: IRawOperationMessage[]) {
        // Add trace
        messages.forEach((message) => {
            const operation = message.operation as IDocumentMessage;
            if (operation && operation.traces) {
                operation.traces.push(
                    {
                        action: "start",
                        service: "alfred",
                        timestamp: now(),
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
        this.producer.send([boxcar], this.tenantId, this.documentId);
    }
}

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
import * as core from "@microsoft/fluid-server-services-core";

/* eslint-disable no-null/no-null */

export class KafkaOrdererConnection implements core.IOrdererConnection {
    public static async create(
        existing: boolean,
        document: core.IDocument,
        producer: core.IProducer,
        tenantId: string,
        documentId: string,
        client: IClient,
        maxMessageSize: number,
        clientId: string,
        serviceConfiguration: IServiceConfiguration,
    ): Promise<KafkaOrdererConnection> {
        // Create the connection
        return new KafkaOrdererConnection(
            existing,
            document,
            producer,
            tenantId,
            documentId,
            clientId,
            client,
            maxMessageSize,
            serviceConfiguration);
    }

    public get parentBranch(): string {
        return this._parentBranch;
    }

    private readonly _parentBranch: string;

    constructor(
        public readonly existing: boolean,
        document: core.IDocument,
        private readonly producer: core.IProducer,
        public readonly tenantId: string,
        public readonly documentId: string,
        public readonly clientId: string,
        private readonly client: IClient,
        public readonly maxMessageSize: number,
        public readonly serviceConfiguration: IServiceConfiguration,
    ) {
        this._parentBranch = document.parent ? document.parent.documentId : null;

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

        const message: core.IRawOperationMessage = {
            clientId: null,
            documentId: this.documentId,
            operation,
            tenantId: this.tenantId,
            timestamp: Date.now(),
            type: core.RawOperationType,
        };

        this.submitRawOperation([message]);
    }

    public order(messages: IDocumentMessage[]): void {
        const rawMessages = messages.map((message) => {
            const rawMessage: core.IRawOperationMessage = {
                clientId: this.clientId,
                documentId: this.documentId,
                operation: message,
                tenantId: this.tenantId,
                timestamp: Date.now(),
                type: core.RawOperationType,
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
        const message: core.IRawOperationMessage = {
            clientId: null,
            documentId: this.documentId,
            operation,
            tenantId: this.tenantId,
            timestamp: Date.now(),
            type: core.RawOperationType,
        };

        this.submitRawOperation([message]);
    }

    public once(event: "producerError", listener: (...args: any[]) => void) {
        this.producer.once(event, listener);
    }

    private submitRawOperation(messages: core.IRawOperationMessage[]) {
        // Add trace
        messages.forEach((message) => {
            const operation = message.operation;
            if (operation && operation.traces === undefined) {
                operation.traces = [];
            } else if (operation && operation.traces && operation.traces.length > 1) {
                operation.traces.push(
                    {
                        action: "end",
                        service: "alfred",
                        timestamp: Date.now(),
                    });
            }
        });

        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.producer.send(messages, this.tenantId, this.documentId);
    }
}

export class KafkaOrderer implements core.IOrderer {
    public static async create(
        producer: core.IProducer,
        tenantId: string,
        documentId: string,
        maxMessageSize: number,
        serviceConfiguration: IServiceConfiguration,
    ): Promise<KafkaOrderer> {
        return new KafkaOrderer(producer, tenantId, documentId, maxMessageSize, serviceConfiguration);
    }

    private existing: boolean;

    constructor(
        private readonly producer: core.IProducer,
        private readonly tenantId: string,
        private readonly documentId: string,
        private readonly maxMessageSize: number,
        private readonly serviceConfiguration: IServiceConfiguration,
    ) {
    }

    public async connect(
        socket: core.IWebSocket,
        clientId: string,
        client: IClient,
        details: core.IDocumentDetails): Promise<core.IOrdererConnection> {

        this.existing = details.existing;
        const connection = KafkaOrdererConnection.create(
            this.existing,
            details.value,
            this.producer,
            this.tenantId,
            this.documentId,
            client,
            this.maxMessageSize,
            clientId,
            this.serviceConfiguration);

        // Document is now existing regardless of the original value
        this.existing = true;

        return connection;
    }

    // eslint-disable-next-line @typescript-eslint/promise-function-async
    public close() {
        return Promise.resolve();
    }
}

export class KafkaOrdererFactory {
    private readonly ordererMap = new Map<string, Promise<core.IOrderer>>();

    constructor(
        private readonly producer: core.IProducer,
        private readonly maxMessageSize: number,
        private readonly serviceConfiguration: IServiceConfiguration,
    ) {
    }

    public async create(tenantId: string, documentId: string): Promise<core.IOrderer> {
        const fullId = `${tenantId}/${documentId}`;
        if (!this.ordererMap.has(fullId)) {
            const orderer = KafkaOrderer.create(
                this.producer,
                tenantId,
                documentId,
                this.maxMessageSize,
                this.serviceConfiguration);
            this.ordererMap.set(fullId, orderer);
        }

        return this.ordererMap.get(fullId);
    }
}

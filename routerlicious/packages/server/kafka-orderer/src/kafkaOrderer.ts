import {
    IClient,
    IClientJoin,
    IDocumentMessage,
    IDocumentSystemMessage,
    MessageType } from "@prague/container-definitions";
import * as core from "@prague/services-core";
import * as _ from "lodash";

export class KafkaOrdererConnection implements core.IOrdererConnection {
    public static async Create(
        existing: boolean,
        document: core.IDocument,
        producer: core.IProducer,
        tenantId: string,
        documentId: string,
        client: IClient,
        maxMessageSize: number,
        clientId: string): Promise<KafkaOrdererConnection> {
        // Create the connection
        return new KafkaOrdererConnection(
            existing,
            document,
            producer,
            tenantId,
            documentId,
            clientId,
            client,
            maxMessageSize);
    }

    public get parentBranch(): string {
        return this._parentBranch;
    }

    // tslint:disable:variable-name
    private _parentBranch: string;
    // tslint:enable:variable-name

    constructor(
        public readonly existing: boolean,
        document: core.IDocument,
        private producer: core.IProducer,
        public readonly tenantId: string,
        public readonly documentId: string,
        public readonly clientId: string,
        private client: IClient,
        public readonly maxMessageSize: number) {

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

        this.submitRawOperation(message);
    }

    public order(message: IDocumentMessage): void {
        const rawMessage: core.IRawOperationMessage = {
            clientId: this.clientId,
            documentId: this.documentId,
            operation: message,
            tenantId: this.tenantId,
            timestamp: Date.now(),
            type: core.RawOperationType,
        };

        this.submitRawOperation(rawMessage);
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

        this.submitRawOperation(message);
    }

    private submitRawOperation(message: core.IRawOperationMessage) {
        // Add trace
        const operation = message.operation as IDocumentMessage;
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

        this.producer.send(message, this.tenantId, this.documentId);
    }
}

export class KafkaOrderer implements core.IOrderer {
    public static async Create(
        storage: core.IDocumentStorage,
        producer: core.IProducer,
        tenantId: string,
        documentId: string,
        maxMessageSize: number): Promise<KafkaOrderer> {

        const details = await storage.getOrCreateDocument(tenantId, documentId);
        return new KafkaOrderer(details, producer, tenantId, documentId, maxMessageSize);
    }

    private existing: boolean;

    constructor(
        private details: core.IDocumentDetails,
        private producer: core.IProducer,
        private tenantId: string,
        private documentId: string,
        private maxMessageSize: number) {
        this.existing = details.existing;
    }

    public async connect(
        socket: core.IWebSocket,
        clientId: string,
        client: IClient): Promise<core.IOrdererConnection> {

        const connection = KafkaOrdererConnection.Create(
            this.existing,
            this.details.value,
            this.producer,
            this.tenantId,
            this.documentId,
            client,
            this.maxMessageSize,
            clientId);

        // document is now existing regardless of the original value
        this.existing = true;

        return connection;
    }

    public close() {
        return Promise.resolve();
    }
}

export class KafkaOrdererFactory {
    private ordererMap = new Map<string, Promise<core.IOrderer>>();

    constructor(
        private producer: core.IProducer,
        private storage: core.IDocumentStorage,
        private maxMessageSize: number) {
    }

    public async create(tenantId: string, documentId: string): Promise<core.IOrderer> {
        const fullId = `${tenantId}/${documentId}`;
        if (!this.ordererMap.has(fullId)) {
            const orderer = KafkaOrderer.Create(
                this.storage,
                this.producer,
                tenantId,
                documentId,
                this.maxMessageSize);
            this.ordererMap.set(fullId, orderer);
        }

        return this.ordererMap.get(fullId);
    }
}

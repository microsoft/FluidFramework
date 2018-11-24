import * as core from "@prague/routerlicious/dist/core";
import { IProducer } from "@prague/routerlicious/dist/utils";
import { IClient, IClientJoin, IDocumentMessage, IUser, MessageType } from "@prague/runtime-definitions";
import * as moniker from "moniker";

export class KafkaOrdererConnection implements core.IOrdererConnection {
    public static async Create(
        existing: boolean,
        document: core.IDocument,
        producer: IProducer,
        tenantId: string,
        documentId: string,
        user: IUser,
        client: IClient,
        maxMessageSize: number): Promise<KafkaOrdererConnection> {

        const clientId = moniker.choose();

        // Create the connection
        const connection = new KafkaOrdererConnection(
            existing,
            document,
            producer,
            tenantId,
            documentId,
            clientId,
            user,
            client,
            maxMessageSize);

        return connection;
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
        private producer: IProducer,
        public readonly tenantId: string,
        public readonly documentId: string,
        public readonly clientId: string,
        private user: IUser,
        private client: IClient,
        public readonly maxMessageSize: number) {

        this._parentBranch = document.parent ? document.parent.documentId : null;

        const clientDetail: IClientJoin = {
            clientId: this.clientId,
            detail: this.client,
        };

        // Back-compat: Replicate the same info in content and metadata.
        const message: core.IRawOperationMessage = {
            clientId: null,
            documentId: this.documentId,
            operation: {
                clientSequenceNumber: -1,
                contents: clientDetail,
                metadata: {
                    content: clientDetail,
                    split: false,
                },
                referenceSequenceNumber: -1,
                traces: [],
                type: MessageType.ClientJoin,
            },
            tenantId: this.tenantId,
            timestamp: Date.now(),
            type: core.RawOperationType,
            user: this.user,
        };

        this.submitRawOperation(message);
    }

    public async bind(socket: core.IWebSocket) {
        // Bind the socket to the channels the connection will send to
        await Promise.all([
            socket.join(`${this.tenantId}/${this.documentId}`),
            socket.join(`client#${this.clientId}`)]);
    }

    public order(message: IDocumentMessage): void {
        const rawMessage: core.IRawOperationMessage = {
            clientId: this.clientId,
            documentId: this.documentId,
            operation: message,
            tenantId: this.tenantId,
            timestamp: Date.now(),
            type: core.RawOperationType,
            user: this.user,
        };

        this.submitRawOperation(rawMessage);
    }

    // Back-compat: Replicate the same info in content and metadata.
    public disconnect() {
        const message: core.IRawOperationMessage = {
            clientId: null,
            documentId: this.documentId,
            operation: {
                clientSequenceNumber: -1,
                contents: this.clientId,
                metadata: {
                    content: this.clientId,
                    split: false,
                },
                referenceSequenceNumber: -1,
                traces: [],
                type: MessageType.ClientLeave,
            },
            tenantId: this.tenantId,
            timestamp: Date.now(),
            type: core.RawOperationType,
            user: this.user,
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
        const stringMessage = JSON.stringify(message);
        this.producer.send(stringMessage, this.documentId);
    }
}

export class KafkaOrderer {
    public static async Create(
        storage: core.IDocumentStorage,
        producer: IProducer,
        tenantId: string,
        documentId: string,
        maxMessageSize: number): Promise<KafkaOrderer> {

        const details = await storage.getOrCreateDocument(tenantId, documentId);
        return new KafkaOrderer(details, producer, tenantId, documentId, maxMessageSize);
    }

    private existing: boolean;

    constructor(
        private details: core.IDocumentDetails,
        private producer: IProducer,
        private tenantId: string,
        private documentId: string,
        private maxMessageSize: number) {
        this.existing = details.existing;
    }

    public async connect(user: IUser, client: IClient): Promise<KafkaOrdererConnection> {
        const connection = KafkaOrdererConnection.Create(
            this.existing,
            this.details.value,
            this.producer,
            this.tenantId,
            this.documentId,
            user,
            client,
            this.maxMessageSize);

        // document is now existing regardless of the original value
        this.existing = true;

        return connection;
    }

    public close() {
        return Promise.resolve();
    }
}

export class KafkaOrdererFactory {
    private ordererMap = new Map<string, Promise<KafkaOrderer>>();

    constructor(
        private producer: IProducer,
        private storage: core.IDocumentStorage,
        private maxMessageSize: number) {
    }

    public async create(tenantId: string, documentId: string): Promise<KafkaOrderer> {
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
